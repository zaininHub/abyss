// v1.3 模块 A：AI 助手 MVP（三开关：自动升级 / 自动招募 / 自动领取 + 预留线）
// 解锁：科技树「AI 管理核心」（ai_core，里程碑 cps≥1e4 后可见，50 RP，跨晋升保留）
// 规范（设计 §5）：
//   - 三开关默认全关，每开关独立可关；关闭后无新动作
//   - 自动升级：每 5s 买「回本最短」产出项（payback = 成本 ÷ 边际 CPS 含全局乘数），EP ≥ 预留线才买
//   - 自动招募：staffNetPerSec() > 0 且 EP ≥ staffCost×2（net<0 自然停）
//   - 自动领取：任务 pending 即领（EP 类奖励走 addEp 上限口径，由 claimProject 内部处理）
//   - 预留线：EP 上限的 10% / 30% / 50% 三档（默认 30%）
//   - 所有动作走日志带 [AI] 前缀；面板顶部一键全关
import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';
import {
  hasTech, computeCps, globalMult, epStorageCap, staffCost, staffNetPerSec,
  fmt, unitCost, costMult, addEp, techCostOf, researchMult, // v2.8.22 ②：自动研究按多资源成本购买（此前未 import → ReferenceError → 自动研究永不买，真根因）；v3.6.0 方向⑨：rp_ai 接入
} from './economy.js';
import { claimProject } from './projects.js';
import { dirty } from '../core/runtime.js'; // v3.6.0 方向⑨：面板买编队后同步刷新主商店卡
// v2.5.5：AI 自动购建（全部资源点解锁后可激活，大量 EP 激活，可调速率，严格限速防竞争）
import { V21_BUILDINGS, v21Level, v21Maxed, capOf } from '../data/buildings.js';
import { policyMult } from '../data/policies.js';
import { v21BuildingCost } from './economy.js';
import { relicLevel } from '../data/relics.js'; // v2.7.0：混沌触须——AI 决策间隔
import { rollProfession, aiSuggestedProfession } from './threadBinding.js'; // v3.3.0 ⑤：AI 招募与线程职业联动
import { getTechs } from '../core/provider.js'; // v2.8.4：自动研究（科技树 RP 购买）
import { pushBoughtOrder } from './listkit.js'; // v2.8.4：自动研究（已购顺序登记）
// v3.6.0 方向⑨：AI 助手按类型自动购买（编队 + 分配）
import { COSMOS, cosmosLv, cosmosCost, buyCosmos } from './cosmos.js';
import { buyRiftUpgrade, riftUpgradeLevel, riftUpgradeCost } from './rift.js';
import { religionUnlocked, templeCost } from '../data/religions.js';
import { buyTemple } from './religions.js';
import { autoAdoptBestPolicy } from '../data/policies.js';
import { aiBuyCheapestColony } from './expedition.js';

let logFn = null;
let uiRefreshFn = null;
export function setAiLogFn(fn) { logFn = fn; }
// v2.6.6 ③：AI/混沌买入后单卡局部刷新（避免整面板重建导致 hover 闪烁/点击竞争）
export function setAiUiRefreshFn(fn) { uiRefreshFn = fn; }
function aiUiRefresh(pick) { if (uiRefreshFn) uiRefreshFn(pick); }
function ailog(msg, cls) { if (logFn) logFn(`[AI] ${msg}`, cls); }

const VEHICLE_IDS = BALANCE.vehicles.ids;
const DM_SKIP = ['dmsight', 'dmfeed', 'dmmind', 'dmprotocol'];
const THREAD_IDS = ['cpu', 'gpu']; // v3.4.8 反馈⑦：消耗优化整组已删除，AI 只再买产出强化

export function aiUnlocked() { return hasTech('ai_core'); }

// v3.6.0 方向⑨：rp_ai（跃迁理论同族研究「拟我协议」）提升助手行动强度——每类型每周期动作数 = (1+分配数) ×(1+8%/级)
function aiAssistStrength(type) {
  const base = 1 + ((S.ai.alloc && S.ai.alloc[type]) || 0);
  return Math.max(1, Math.floor(base * researchMult('ai')));
}

// v2.5.5：全部资源点解锁判定（resDiscovered 十个锚点全 true）
const ALL_RES_KEYS = ['ep', 'cps', 'run', 'tide', 'rank', 'rp', 'es', 'faith', 'pt', 'dm'];
export function allResDiscovered(S) {
  const rd = (S && S.resDiscovered) || {};
  return ALL_RES_KEYS.every(k => rd[k] === true);
}
export function autoBuildUnlocked() { return !!(S.ai && S.ai.autoBuildUnlocked); }
export function autoBuildActivateCost() { return BALANCE.ai.aiAutoBuild.activateCost; }
export function autoBuildRate() {
  const r = (S.ai && S.ai.autoBuildRate) || BALANCE.ai.aiAutoBuild.defaultRate;
  return Math.max(BALANCE.ai.aiAutoBuild.minRate, Math.min(3600, r)); // 硬下限 5s：改档/改存档均不生效
}
export function autoBuildActivable() {
  return aiUnlocked() && !autoBuildUnlocked() && allResDiscovered(S) && S.ep >= autoBuildActivateCost();
}
// 激活：校验 + 一次性扣除大量 EP
export function activateAutoBuild() {
  if (autoBuildUnlocked()) return { ok: false, reason: '已激活' };
  if (!allResDiscovered(S)) return { ok: false, reason: '未解锁全部资源点' };
  const cost = autoBuildActivateCost();
  if (S.ep < cost) return { ok: false, reason: `EP 不足（需 ${fmt(cost)}）` };
  S.ep -= cost;
  S.ai.autoBuildUnlocked = true;
  S.ai.autoBuild = true;
  save(S);
  return { ok: true, cost };
}

export function reserveLine() {
  return epStorageCap() * (S.ai?.reserve ?? BALANCE.ai.defaultReserve);
}

function aiShopUnlocked(u) {
  const owned = S.upgrades[u.id] || 0;
  return owned > 0 || S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3;
}

// v2.8.3：AI 自动升级白名单——仅基础产出模块（无 cat 标签的纯产出卡；资源/线程/存储/DM/净化/载具全部排除）
function isBaseProduction(u) {
  if (u.cat) return false;                 // 任何带类别的（线程/存储/DM/净化）都不是基础产出
  if (VEHICLE_IDS.includes(u.id)) return false;  // 探采平台（资源采集）不自动买
  if (DM_SKIP.includes(u.id)) return false;
  if (THREAD_IDS.includes(u.id)) return false;
  if (u.produces) return false;            // 资源产出型（RP/PT/信仰）不自动买
  return !!(u.cps && u.cps > 0);           // 必须是纯 EP 产出卡
}

// 自动升级候选：仅基础产出项，回本 = 成本 ÷ 边际 CPS（含全局乘数）
function bestPaybackItem() {
  let best = null, bestPayback = Infinity;
  for (const u of UPGRADES) {
    if (!isBaseProduction(u)) continue;
    if (!aiShopUnlocked(u)) continue;
    // v3.7.0 口径修正：unitCost(u,n) 的 n 是「价格档位偏移」，n=0 才是当前这一件的实价
    // （商店实购 bulkCostCalc(u,1) === unitCost(u,0)）。旧代码用 n=1 按 growth^(owned+1) 计价，
    // 导致 AI 自动升级/助手购买每次多扣 30%，与主商店卡面及手动购买不一致。
    const cost = unitCost(u, 0);
    const margCps = u.cps * globalMult();
    if (margCps <= 0) continue;
    const payback = cost / margCps;
    if (payback < bestPayback) { bestPayback = payback; best = u; }
  }
  return best ? { u: best, cost: unitCost(best, 0), payback: bestPayback } : null;
}

function aiHireOne() {
  // 与 main.js hireCultist 同构的最小招募（[AI] 日志口径独立，避免循环依赖）
  S.ep -= staffCost();
  const names = ['外勤干员 A','斥候','深潜者','观测员','渗透单元','信使','无面者','印斯茅斯节点','沙丘行者','门之侍者'];
  const name = names[Math.floor(Math.random() * names.length)];
  const profession = rollProfession(aiSuggestedProfession()); // v3.3.0 ⑤：AI 招募按需求建议职业
  S.cultists.push({
    id: Date.now() + Math.random(),
    name,
    profession,
    level: 1, xp: 0, leader: false, boundTo: null,
    output: BALANCE.thread.baseOutput + Math.random() * BALANCE.thread.baseOutputJitter,
    mood: '正常',
    moodTimer: 30 + Math.random() * 60,
  });
}

// 返回本轮是否有动作（供脏标记）
export function tickAI(dt) {
  if (!aiUnlocked()) return false;
  // v2.6.3 反馈②：混沌心智——AI 全面禁用，混沌直觉接管（每 10s 随机购买最便宜的未拥有升级）
  if (S.tech && S.tech.chaos_mind) {
    // v2.7.1 修复：仅实际买入才返回 true——原无条件 return true 使 main 每 100ms 置 dirty.shop
    // → renderShop 整面板每帧重建 → hover 卡被替换 → 闪烁 + 点击丢失（混沌心智场景实锤）
    return chaosIntuitionTick(dt);
  }
  const ai = S.ai;
  hiredFlag = false; // v2.7.2：每 tick 重置招募标志（main 消费后判定线程区刷新）
  const allocAny = Object.values(ai.alloc || {}).some(v => (v || 0) > 0); // v3.6.0 方向⑨：助手按类型分配后，即使总开关全关也独立执行自动购买
  if (!ai || (!ai.autoUpgrade && !ai.autoHire && !ai.autoClaim && !ai.autoBuild && !ai.autoTech && !allocAny)) return false; // v2.8.22 ②：只开自动研究时也要进入决策（此前前置 return 吞掉 autoTech 分支 → 「自动研究开了没效果」真因）
  ai.timer = (ai.timer || 0) + dt;
  // v2.6.0 深潜：拟态矩阵——决策间隔 -20%/级（下限 40% 原间隔）
  const matLv = (S.delve && S.delve.up && S.delve.up.matrix) || 0;
  let interval = Math.max(BALANCE.ai.interval * 0.4, BALANCE.ai.interval * (1 - 0.2 * matLv));
  // v2.7.0 遗物：混沌触须——AI 决策间隔 -10%/级（下限 50% 原间隔）
  const tentLv = relicLevel('tentacle');
  if (tentLv > 0) interval = Math.max(BALANCE.ai.interval * 0.5, interval * (1 - 0.1 * tentLv));
  if (ai.timer < interval) return false;
  ai.timer -= interval;

  let acted = false;
  const line = reserveLine();

  // a. 自动升级：回本最短项，EP ≥ 预留线才买
  if (ai.autoUpgrade) {
    const pick = bestPaybackItem();
    if (pick && S.ep - pick.cost >= line && S.ep >= pick.cost) {
      S.ep -= pick.cost;
      S.upgrades[pick.u.id] = (S.upgrades[pick.u.id] || 0) + 1;
      S.totalBuys++;
      aiUiRefresh({ kind: 'upgrade', u: pick.u }); // v2.6.6 ③：单卡原地刷新
      ailog(`自动升级：购入 ${pick.u.name}（-${fmt(pick.cost)} EP，回本约 ${pick.payback >= 100 ? fmt(Math.round(pick.payback)) + 's' : pick.payback.toFixed(1) + 's'}）`, 'good');
      acted = true;
    }
  }

  // b. 自动招募：净产出为正且 EP ≥ 2×招募成本；net<0 自然停止
  if (ai.autoHire) {
    const cost = staffCost();
    if (staffNetPerSec() > 0 && S.ep >= cost * 2 && S.ep - cost >= line) {
      aiHireOne();
      hiredFlag = true; // v2.7.2：招募发生 → main 刷新线程区（dirty.shop）
      ailog(`自动招募：+1 线程（-${fmt(cost)} EP）`, 'good');
      acted = true;
    }
  }

  // c. 自动领取：任务进入 pending 即领
  if (ai.autoClaim) {
    for (const p of S.projects) {
      if (p.status === 'pending') {
        claimProject(p);
        ailog(`自动领取：任务「${p.name}」奖励到账`, 'good');
        acted = true;
      }
    }
  }

  // v2.5.5 d. 自动购建：全部资源解锁激活后可用；严格限速——
  // 间隔硬下限 5s（autoBuildRate() 已 clamp）、每决策周期至多 1 栋、只 EP 升级已解锁建筑（不花 RP）、
  // 且受预留线约束（与手动购买共享预算，不把 EP 花到预留线以下）
  if (ai.autoBuild && ai.autoBuildUnlocked && policyMult('aiCap') > 0) { // v2.8.6 B2a：自治协议——自动购建上限 -1（停购）
    const rate = autoBuildRate();
    ai.autoBuildTimer = (ai.autoBuildTimer || 0) + dt;
    if (ai.autoBuildTimer >= rate) {
      ai.autoBuildTimer = 0;
      // 候选：已解锁（unlockedBuildings）未满级，按 EP 成本升序取最低；EP 扣后仍 ≥ 预留线才买
      const cands = V21_BUILDINGS
        .filter(b => b.via !== 'upgrade' && S.unlockedBuildings && S.unlockedBuildings[b.id] && !v21Maxed(b, S))
        .map(b => ({ b, cost: v21BuildingCost(b) }))
        .sort((a, b2) => a.cost - b2.cost);
      for (const { b, cost } of cands) {
        if (S.ep < cost || S.ep - cost < line) continue;
        S.ep -= cost;
        S.buildings[b.id] = v21Level(b.id, S) + 1;
        S.totalBuys = (S.totalBuys || 0) + 1;
        const cap = capOf(b, S);
        aiUiRefresh({ kind: 'building', b }); // v2.6.6 ③：单卡原地刷新
        ailog(`自动购建：${b.name} 升至 Lv.${v21Level(b.id, S)}/${isFinite(cap) ? cap : '∞'}（-${fmt(cost)} EP）`, 'good');
        acted = true;
        break; // 每周期至多 1 栋（perTickMax）
      }
    }
  }

  // v2.8.4：自动研究（科技树 · RP 购买）——秩序线科技「自动研究」解锁开关；
  // 每决策周期至多买 1 个最便宜可负担科技，RP 消耗，克制防抢资源
  if (ai.autoTech && S.tech && S.tech.auto_tech) {
    const cands = (getTechs() || [])
      .filter(t => t.autoTech && !hasTech(t.id) && (!t.req || t.req.every(r => hasTech(r)))) // v2.8.22 ②：自动研究只买标记 autoTech 的基础产出相关科技（不做临时 buff 式购买）
      .map(t => ({ t, cost: techCostOf(t) }))
      .sort((a2, b2) => a2.cost.rp - b2.cost.rp); // v2.8.22 ②：按 RP 成本排序（cost 为多资源对象，此前按对象减法排序恒 NaN）
    for (const { t, cost } of cands) {
      // v2.8.22 ②：cost 为 {rp,ep,dm,es} 对象——此前 <cost/扣减用整个对象 → 永不购买或 RP 变 NaN（「自动研究开了没效果」真根因之一）
      if ((S.rp || 0) < cost.rp || (S.ep || 0) < (cost.ep || 0)) break;
      S.rp -= cost.rp;
      S.ep -= cost.ep || 0;
      S.tech[t.id] = true;
      pushBoughtOrder(S, t.id);
      ailog(`自动研究：购入科技「${t.name}」（-${fmt(cost.rp)} RP${cost.ep ? ' -' + fmt(cost.ep) + ' EP' : ''}）`, 'good');
      acted = true;
      break; // 每周期至多 1 个
    }
  }
  // v3.6.0 方向⑨：助手按类型自动购买（strength = (1+分配数) × rp_ai 倍率）
  const alloc = S.ai.alloc || {};
  if ((alloc['upgrade'] || 0) > 0 && aiAssistUpgrade(aiAssistStrength('upgrade'))) acted = true;
  if ((alloc['building'] || 0) > 0 && aiAssistBuilding(aiAssistStrength('building'))) acted = true;
  if ((alloc['colony'] || 0) > 0 && aiAssistColony(aiAssistStrength('colony'))) acted = true;
  if ((alloc['cosmos'] || 0) > 0 && aiAssistCosmos(aiAssistStrength('cosmos'))) acted = true;
  if ((alloc['tech'] || 0) > 0 && aiAssistTech(aiAssistStrength('tech'))) acted = true;
  if ((alloc['policy'] || 0) > 0 && autoAdoptBestPolicy()) acted = true;
  if ((alloc['rift'] || 0) > 0 && aiAssistRift(aiAssistStrength('rift'))) acted = true;
  if ((alloc['religion'] || 0) > 0 && aiAssistReligion(aiAssistStrength('religion'))) acted = true;
  return acted;
}

// v2.7.2：招募标志——main 在 tickAI 返回 true 后查询，决定是否整刷新线程区（dirty.shop）
let hiredFlag = false;
export function aiHireFlag() { const h = hiredFlag; hiredFlag = false; return h; }

// v2.6.3 反馈②：混沌直觉——每 10s 从「最便宜的一批未拥有升级」中随机选一个购买（EP 够即买）
let chaosTimer = 0;
const CHAOS_INT = 10; // 秒
function chaosIntuitionTick(dt) {
  chaosTimer += dt;
  if (chaosTimer < CHAOS_INT) return;
  chaosTimer = 0;
  // v2.6.6 ③：候选 = 未拥有的商店升级 + 已解锁未满级的 v21 建筑（混沌直觉也会购建，且每次买入都有日志）
  const upgCands = UPGRADES
    .filter(u => !(S.upgrades[u.id] || 0))
    .map(u => ({ kind: 'upgrade', u, cost: unitCost(u, 0) })); // v3.7.0：与商店实购同口径，混沌直觉不再多扣 30%
  const bldCands = V21_BUILDINGS
    .filter(b => b.via !== 'upgrade' && S.unlockedBuildings && S.unlockedBuildings[b.id] && !v21Maxed(b, S))
    .map(b => ({ kind: 'building', b, cost: v21BuildingCost(b) }));
  const cands = [...upgCands, ...bldCands]
    .filter(c => S.ep >= c.cost)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 3); // 最便宜一批随机
  if (!cands.length) return false;
  const pick = cands[Math.floor(Math.random() * cands.length)];
  S.ep -= pick.cost;
  if (pick.kind === 'upgrade') {
    S.upgrades[pick.u.id] = 1;
    aiUiRefresh({ kind: 'upgrade', u: pick.u }); // v2.6.6 ③：单卡原地刷新
    ailog(`混沌直觉：随机购入升级 ${pick.u.name}（-${fmt(pick.cost)} EP）`, 'bad');
  } else {
    S.buildings[pick.b.id] = v21Level(pick.b.id, S) + 1;
    const cap = capOf(pick.b, S);
    aiUiRefresh({ kind: 'building', b: pick.b }); // v2.6.6 ③：单卡原地刷新
    ailog(`混沌直觉：随机购建建筑 ${pick.b.name} 升至 Lv.${v21Level(pick.b.id, S)}/${isFinite(cap) ? cap : '∞'}（-${fmt(pick.cost)} EP）`, 'bad');
  }
  S.totalBuys = (S.totalBuys || 0) + 1;
  save(S);
  return true;
}

// v3.6.0 方向⑨：AI 助手按类型自动购买（每种类型 strength = 1 + 分配助手数）
function aiAssistUpgrade(strength) {
  let acted = false; const line = reserveLine();
  for (let i = 0; i < strength; i++) {
    const pick = bestPaybackItem();
    if (!pick || S.ep - pick.cost < line) break;
    S.ep -= pick.cost;
    S.upgrades[pick.u.id] = (S.upgrades[pick.u.id] || 0) + 1;
    S.totalBuys++;
    aiUiRefresh({ kind: 'upgrade', u: pick.u });
    ailog(`助手·升级：${pick.u.name}（-${fmt(pick.cost)} EP）`, 'good');
    acted = true;
  }
  return acted;
}
function aiAssistBuilding(strength) {
  let acted = false; const line = reserveLine();
  for (let i = 0; i < strength; i++) {
    const cands = V21_BUILDINGS.filter(b => b.via !== 'upgrade' && S.unlockedBuildings && S.unlockedBuildings[b.id] && !v21Maxed(b, S)).map(b => ({ b, cost: v21BuildingCost(b) })).sort((a, c2) => a.cost - c2.cost);
    let bought = false;
    for (const { b, cost } of cands) {
      if (S.ep < cost || S.ep - cost < line) continue;
      S.ep -= cost; S.buildings[b.id] = v21Level(b.id, S) + 1; S.totalBuys = (S.totalBuys || 0) + 1;
      const cap = capOf(b, S); aiUiRefresh({ kind: 'building', b });
      ailog(`助手·建造：${b.name} Lv.${v21Level(b.id, S)}（-${fmt(cost)} EP）`, 'good');
      acted = true; bought = true; break;
    }
    if (!bought) break;
  }
  return acted;
}
function aiAssistTech(strength) {
  let acted = false;
  for (let i = 0; i < strength; i++) {
    const cands = (getTechs() || []).filter(t => t.autoTech && !hasTech(t.id) && (!t.req || t.req.every(r => hasTech(r)))).map(t => ({ t, cost: techCostOf(t) })).sort((a2, b2) => a2.cost.rp - b2.cost.rp);
    let bought = false;
    for (const { t, cost } of cands) {
      if ((S.rp || 0) < cost.rp || (S.ep || 0) < (cost.ep || 0)) break;
      S.rp -= cost.rp; S.ep -= cost.ep || 0; S.tech[t.id] = true; pushBoughtOrder(S, t.id);
      ailog(`助手·研究：${t.name}（-${fmt(cost.rp)} RP）`, 'good');
      acted = true; bought = true; break;
    }
    if (!bought) break;
  }
  return acted;
}
function aiAssistColony(strength) {
  let acted = false;
  for (let i = 0; i < strength; i++) { if (aiBuyCheapestColony()) acted = true; else break; }
  return acted;
}
function aiAssistCosmos(strength) {
  let acted = false;
  for (let i = 0; i < strength; i++) {
    const best = Object.values(COSMOS).filter(p => cosmosLv(p.id) < p.cap).sort((a, b) => cosmosCost(a, cosmosLv(a.id)) - cosmosCost(b, cosmosLv(b.id)))[0];
    if (!best) break;
    const cost = cosmosCost(best, cosmosLv(best.id));
    if ((S.starCps || 0) < cost) break;
    if (!buyCosmos(best.id).ok) break;
    acted = true;
  }
  return acted;
}
function aiAssistRift(strength) {
  let acted = false;
  const ups = BALANCE.rift.upgrades;
  for (let i = 0; i < strength; i++) {
    let best = null, bestCost = Infinity;
    for (const id in ups) {
      const u = ups[id]; const lv = riftUpgradeLevel(id);
      if (lv >= u.cap) continue;
      const cost = riftUpgradeCost(id);
      if ((S.riftEmber || 0) >= cost && cost < bestCost) { best = id; bestCost = cost; }
    }
    if (!best) break;
    if (!buyRiftUpgrade(best).ok) break;
    acted = true;
  }
  return acted;
}
function aiAssistReligion(strength) {
  let acted = false;
  if (!religionUnlocked()) return false;
  const line = reserveLine();
  for (let i = 0; i < strength; i++) {
    const lv = (S.religion && S.religion.temple) || 0;
    const cost = templeCost();
    if (S.ep - cost < line) break;
    if (!buyTemple().ok) break;
    acted = true;
  }
  return acted;
}

// v3.6.0 方向⑨：助手编队购买与分配辅助
function assistantInc(type) {
  const alloc = S.ai.alloc = S.ai.alloc || {};
  const total = Math.min(BALANCE.ai.assistants.maxSlots, S.upgrades['ai_assist'] || 0);
  const used = BALANCE.ai.assistants.allocTypes.reduce((s, t) => s + (alloc[t] || 0), 0);
  if (total - used <= 0) return;
  alloc[type] = (alloc[type] || 0) + 1; save(S);
}
function assistantDec(type) {
  const alloc = S.ai.alloc = S.ai.alloc || {};
  if ((alloc[type] || 0) <= 0) return;
  alloc[type] -= 1; if (alloc[type] <= 0) delete alloc[type]; save(S);
}
function renderAssistantSection() {
  const total = Math.min(BALANCE.ai.assistants.maxSlots, S.upgrades['ai_assist'] || 0);
  const alloc = (S.ai && S.ai.alloc) || {};
  const used = BALANCE.ai.assistants.allocTypes.reduce((s, t) => s + (alloc[t] || 0), 0);
  const free = Math.max(0, total - used);
  const u = UPGRADES.find(x => x.id === 'ai_assist');
  // v3.6.0：与商店 buyUpgrade 同口径（bulkCostCalc(u,1) === unitCost(u,0)），避免两条购买路径价差
  const cost = unitCost(u, 0);
  const atCap = (S.upgrades['ai_assist'] || 0) >= (u.maxLevel || 8);
  let html = `<div class="ai-desc" style="margin-top:10px">🤖 AI 助手编队：<b>${total}</b>/${BALANCE.ai.assistants.maxSlots} 槽（空闲 ${free}）`;
  if (aiUnlocked()) {
    html += ` <button class="btn ${atCap ? 'disabled' : ''}" data-assist-buy ${atCap ? 'disabled' : ''}>${atCap ? '已满编' : '购买编队（' + fmt(cost) + ' EP）'}</button>`;
  }
  html += `</div>`;
  const labels = BALANCE.ai.assistants.typeLabels || {};
  for (const type of BALANCE.ai.assistants.allocTypes) {
    const n = alloc[type] || 0;
    html += `<div class="ai-build-box" style="display:flex;align-items:center;gap:8px;margin-top:4px">
      <span style="flex:1;font-size:12px">${labels[type] || type} · 自动购买</span>
      <button class="btn ai-rate-btn" data-assist-dec="${type}" ${n <= 0 ? 'disabled' : ''}>−</button>
      <b style="min-width:18px;text-align:center">${n}</b>
      <button class="btn ai-rate-btn" data-assist-inc="${type}" ${free <= 0 ? 'disabled' : ''}>+</button>
    </div>`;
  }
  return html;
}

// ========== 面板 ==========
export function renderAiPanel(container) {
  if (!container) return;
  if (!aiUnlocked()) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = '';
  const ai = S.ai;
  // v2.6.3 反馈②：混沌心智生效中 → 面板整体表达 AI 已禁用
  if (S.tech && S.tech.chaos_mind) {
    container.innerHTML = `
      <div style="font-size:13px;line-height:1.9;color:var(--text-2)">
        <b style="color:var(--red,#f85149)">混沌心智已接管</b>：AI 自动化全面禁用，混沌直觉每 10 秒随机购入最便宜的未拥有升级（深渊行者科技线）。<b style="color:var(--warn,#c8a24a)">永久生效，不可取消</b>——勾选混沌心智后 AI 无法恢复，请谨慎选择。</div>`;
    return;
  }
  const line = reserveLine();
  const sw = (key, name, desc) => `
    <div class="ai-switch ${ai[key] ? 'on' : ''}" data-ai-switch="${key}" title="${desc}">
      <span class="ai-switch-dot"></span>
      <span class="ai-switch-name">${name}</span>
      <span class="ai-switch-state">${ai[key] ? 'ON' : 'OFF'}</span>
    </div>`;
  const reserveOpts = BALANCE.ai.reserveOptions.map(r =>
    `<button class="btn ai-reserve-btn ${ai.reserve === r ? 'on' : ''}" data-ai-reserve="${r}">${Math.round(r * 100)}%</button>`).join('');
  // v2.8.4：自动研究开关（秩序线科技「自动研究」已购后显示；RP 购买科技树）
  const autoTechHtml = (S.tech && S.tech.auto_tech) ? sw('autoTech', '自动研究', '每决策周期自动购买最便宜的已解锁科技（RP 消耗，至多 1 个/周期）') : '';
  // v2.5.5：自动购建区块（全部资源点解锁后可激活）
  // v3.2.4 反馈④：未全解锁时整块不展示（原常驻展示「资源点 x/10」进度卡）；文案精简去冗余描述
  const AB = BALANCE.ai.aiAutoBuild;
  let buildHtml = autoTechHtml + (autoTechHtml ? '<div style="margin-top:4px"></div>' : '');
  if (!autoBuildUnlocked()) {
    const resOk = allResDiscovered(S);
    if (!resOk) buildHtml += ''; // 未全解锁：不展示（反馈④）
    else {
      const epOk = S.ep >= autoBuildActivateCost();
      buildHtml += `
      <div class="ai-build-box ${epOk ? '' : 'ai-build-locked'}">
        <div class="ai-build-title">自动购建</div>
        <div style="font-size:12px;line-height:1.9;color:var(--text-2)">
          激活消耗：${fmt(autoBuildActivateCost())} EP（一次性）${epOk ? '' : '（EP 不足）'}
        </div>
        <button class="btn ${epOk ? '' : 'disabled'}" data-ai-build-activate="1" ${epOk ? '' : 'disabled'}
          title="消耗 ${fmt(autoBuildActivateCost())} EP 激活自动购建">激活自动购建</button>
      </div>`;
    }
  } else {
    const rateBtns = AB.rateOptions.map(r =>
      `<button class="btn ai-rate-btn ${(ai.autoBuildRate ?? AB.defaultRate) === r ? 'on' : ''}" data-ai-build-rate="${r}">${r}s</button>`).join('');
    buildHtml += `
      <div class="ai-build-box">
        <div class="ai-build-title">自动购建（已激活）</div>
        ${sw('autoBuild', '自动购建', `每 ${autoBuildRate()}s 购买 1 栋已解锁建筑（EP 成本最低优先，不低于预留线）`)}
        <div class="ai-reserve-row" style="margin-top:4px">
          <span>购买间隔</span>${rateBtns}
        </div>
        <div style="font-size:11px;color:var(--text-2);margin-top:4px">下次购建倒计时 ${Math.max(0, autoBuildRate() - (ai.autoBuildTimer || 0)).toFixed(1)}s</div>
      </div>`;
  }
  container.innerHTML = `
    ${(S.tech && S.tech.prophecy && S.prophecyNext) ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid var(--purple,#9c27b0);border-radius:6px;background:rgba(156,39,176,.12);font-size:12px;line-height:1.6">🔮 <b>神谕广播</b>：下一个事件将是「${S.prophecyNext.name}」<span style="color:var(--text-2)">——${S.prophecyNext.desc || '效果未知'}</span></div>` : ''}
    <div class="ai-desc">预留线：EP 上限的 ${Math.round((ai.reserve ?? BALANCE.ai.defaultReserve) * 100)}%</div>
    ${sw('autoUpgrade', '自动升级', '每 5s 购买回本时间最短的产出项（成本 ÷ 边际 CPS，含全局乘数）；EP 低于预留线时暂停')}
    ${sw('autoHire', '自动招募', '线程净产出为正且 EP ≥ 2×招募成本时自动招募；净产出为负自动停止')}
    ${sw('autoClaim', '自动领取', '任务完成进入待领取状态立即自动领取')}
    ${buildHtml}
    ${renderAssistantSection()}
    <div class="ai-reserve-row">
      <span>预留线</span>${reserveOpts}
      <button class="btn" data-ai-alloff="1" title="关闭全部自动化开关">一键全关</button>
    </div>`;

  if (!container.dataset.v13Delegated) {
    container.dataset.v13Delegated = '1';
    container.addEventListener('click', (e) => {
      const swEl = e.target.closest('[data-ai-switch]');
      if (swEl) {
        const key = swEl.dataset.aiSwitch;
        S.ai[key] = !S.ai[key]; // v2.8.21 ③：不再要求 key 预存在 S.ai（旧档无 autoTech 字段 → 点击无效）；固定开关集合安全
        save(S); renderAiPanel(container);
        return;
      }
      const rEl = e.target.closest('[data-ai-reserve]');
      if (rEl) {
        S.ai.reserve = Number(rEl.dataset.aiReserve);
        save(S);
        renderAiPanel(container);
        return;
      }
      if (e.target.closest('[data-ai-alloff]')) {
        S.ai.autoUpgrade = false; S.ai.autoHire = false; S.ai.autoClaim = false; S.ai.autoBuild = false;
        ailog('一键全关：所有自动化已停止', 'bad');
        save(S);
        renderAiPanel(container);
      }
      // v2.5.5：激活自动购建——二次确认（首次点击变确认态，再点执行）
      const actEl = e.target.closest('[data-ai-build-activate]');
      if (actEl) {
        if (!autoBuildActivable()) { ailog('激活条件未满足：需全部资源点解锁且 EP 充足', 'bad'); return; }
        if (actEl.dataset.confirm === '1') {
          const r = activateAutoBuild();
          if (r.ok) { ailog(`自动购建已激活（-${fmt(r.cost)} EP）；设置购买间隔与开关即可开始`, 'good'); }
          else ailog(`激活失败：${r.reason}`, 'bad');
          renderAiPanel(container);
        } else {
          actEl.dataset.confirm = '1';
          actEl.textContent = `再次点击确认（消耗 ${fmt(autoBuildActivateCost())} EP）`;
          setTimeout(() => { if (actEl.isConnected && actEl.dataset.confirm === '1') { actEl.dataset.confirm = ''; actEl.textContent = '激活自动购建'; } }, 4000);
        }
        return;
      }
      const rateEl = e.target.closest('[data-ai-build-rate]');
      if (rateEl) {
        S.ai.autoBuildRate = Math.max(BALANCE.ai.aiAutoBuild.minRate, Number(rateEl.dataset.aiBuildRate));
        save(S);
        renderAiPanel(container);
      }
      const assistBuy = e.target.closest('[data-assist-buy]');
      if (assistBuy) {
        const u = UPGRADES.find(x => x.id === 'ai_assist');
        const cost = unitCost(u, 0); // 与主商店 bulkCostCalc(u,1) 同口径
        if (S.ep >= cost && (S.upgrades['ai_assist'] || 0) < (u.maxLevel || 8)) {
          S.ep -= cost; S.upgrades['ai_assist'] = (S.upgrades['ai_assist'] || 0) + 1;
          S.totalBuys = (S.totalBuys || 0) + 1; ailog('助手编队 +1', 'good');
          dirty.shop = true; // 主商店卡同步刷新（等级/成本/灰态）
        } else ailog('助手编队购买失败：EP 不足或已满编', 'bad');
        save(S); renderAiPanel(container); return;
      }
      const incEl = e.target.closest('[data-assist-inc]');
      if (incEl) { assistantInc(incEl.dataset.assistInc); renderAiPanel(container); return; }
      const decEl = e.target.closest('[data-assist-dec]');
      if (decEl) { assistantDec(decEl.dataset.assistDec); renderAiPanel(container); return; }
    });
  }
}
