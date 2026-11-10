// v1.3 模块 A：AI 助手（基础三项 + 进阶两项自动化 + 预留线）
// 解锁：科技树「AI 管理核心」（ai_core，里程碑 cps≥1e4 后可见，50 RP，跨晋升保留）
// v3.11.0：动作元数据（开关 / 分组 / 助手单价 / 文案）下沉到 core/aiActionRegistry.js，
//   本文件只保留执行器与 UI，助手守卫 / 扣费 / 台账 / 日志后缀由 tickAI 统一遍历处理。
// 规范（设计 §5）：
//   - 各开关默认全关，独立可关；关闭后无新动作
//   - 自动升级：每决策周期买「回本最短」产出项（payback = 成本 ÷ 边际 CPS 含全局乘数），EP ≥ 预留线才买
//   - 自动招募：staffNetPerSec() > 0 且 EP ≥ staffCost×2（net<0 自然停）
//   - 自动领取：任务 pending 即领（EP 类奖励走 addEp 上限口径，由 claimProject 内部处理）
//   - 自动购建 / 自动研究：各自需额外解锁，同样按次消耗助手
//   - 每一项自动化动作每执行一次消耗 1 名 AI 助手；不足即停摆并给出明确提示
//   - 预留线：EP 上限的 10% / 30% / 50% 三档（默认 30%）
//   - 所有动作走日志带 [AI] 前缀；面板底部「一键全关」由注册表派生，覆盖全部开关
import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';
import {
  hasTech, computeCps, globalMult, epStorageCap, staffCost, staffNetPerSec,
  fmt, unitCost, costMult, addEp, techCostOf, researchMult, // v2.8.22 ②：自动研究按多资源成本购买；v3.10.5：「拟我协议」rp_ai 提升助手性价比（摊薄购买价）
} from './economy.js';
import { claimProject } from './projects.js';
// v2.5.5：AI 自动购建（全部资源点解锁后可激活，大量 EP 激活，可调速率，严格限速防竞争）
import { V21_BUILDINGS, v21Level, v21Maxed, capOf } from '../data/buildings.js';
import { policyMult } from '../data/policies.js';
import { v21BuildingCost } from './economy.js';
import { relicLevel } from '../data/relics.js'; // v2.7.0：混沌触须——AI 决策间隔
import { rollProfession, aiSuggestedProfession } from './threadBinding.js'; // v3.3.0 ⑤：AI 招募与线程职业联动
import { getTechs } from '../core/provider.js'; // v2.8.4：自动研究（科技树 RP 购买）
import { pushBoughtOrder } from './listkit.js'; // v2.8.4：自动研究（已购顺序登记）
// v3.11.0：自动化动作声明层——「哪些动作消耗助手 / 开关 / 分组 / 一键全关」的单一真源。
import {
  AI_ACTIONS, AI_ACTION_GROUPS, AI_ACTION_IDS, AI_ACTION_SWITCH_KEYS,
  AI_ASSISTANT_CONSUMER_IDS, ALL_OFF_SWITCH_KEYS, actionById, actionsByGroup,
  enabledActions, isAnyActionEnabled, emptyActionCounts, totalActionCount,
  maxCycleAssistantDemand,
} from '../core/aiActionRegistry.js';

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

// v3.10.5：助手 = 一次性消耗品。自动升级/招募/领取每执行一次消耗 1 名助手；
// 无数量上限，靠购买价逐次递增（baseCost × costGrowth^n）天然限购。
// 删除了 v3.6.0 的「编队/槽位/按类型分配」整套模型。
export function assistantCount() { return (S.ai && S.ai.assistants) || 0; }
export function assistantCost() {
  const c = BALANCE.ai.assistants;
  const n = assistantCount();
  // v3.10.5：「拟我协议」(rp_ai) 研究提升助手性价比——购买价 ÷ researchMult('ai')，数量递增仍然限购
  return Math.round(c.baseCost * Math.pow(c.costGrowth, n) / researchMult('ai'));
}
// v3.11.0：统一扣费入口。执行器只报「实际执行了几次动作」，助手扣费 / 台账 / 日志
// 全部由 tickAI 的注册表遍历统一处理，杜绝各分支手写「守卫 + 实扣 + 日志」漂移。
function consumeAssistants(n) {
  const have = assistantCount();
  const take = Math.min(have, Math.max(0, Math.floor(n)));
  if (take <= 0) return 0;
  S.ai.assistants = have - take;
  // 累计消耗台账：与动作台账严格一一对应（每项动作 assistantCost=1），
  // 供 30 天推演核对「动作次数 == 消耗助手数」与「补给+购买-余额 == 消耗」双守恒。
  S.ai.assistantsSpent = (S.ai.assistantsSpent || 0) + take;
  return take;
}

// 本局动作台账（供面板 / 30 天推演核对「自动化是否真在跑」）；旧档无字段时惰性建槽。
export function recordAction(id, n = 1) {
  if (!actionById(id) || n <= 0) return;
  if (!S.ai.actionCounts || typeof S.ai.actionCounts !== 'object') {
    S.ai.actionCounts = emptyActionCounts();
  } else {
    // 兼容旧档 / 新增动作：补齐缺失槽位，避免 undefined + NaN
    for (const k of AI_ACTION_IDS) if (S.ai.actionCounts[k] === undefined) S.ai.actionCounts[k] = 0;
  }
  S.ai.actionCounts[id] += n;
}
export function actionCounts() {
  const base = emptyActionCounts();
  const cur = (S.ai && S.ai.actionCounts) || {};
  for (const k of AI_ACTION_IDS) base[k] = cur[k] || 0;
  return base;
}
export { totalActionCount, maxCycleAssistantDemand, AI_ASSISTANT_CONSUMER_IDS };

// 助手耗尽的停摆告警：v3.10.5 三个分支只是静默不动作（零日志零提示），
// 玩家看到开关 ON 却什么都没发生。这里按 60s 真实时间节流，避免刷屏。
const STALL_WARN_MS = 60 * 1000;
export function stalledActions() {
  if (!aiUnlocked()) return [];
  if (!isAnyActionEnabled(S.ai)) return [];
  if (assistantCount() > 0) return [];
  return enabledActions(S.ai).filter(a => a.assistantCost > 0);
}
function warnIfStalled(stalled) {
  if (!stalled.length) return;
  const now = Date.now();
  if (S.ai._stallWarnAt && now - S.ai._stallWarnAt < STALL_WARN_MS) return;
  S.ai._stallWarnAt = now;
  ailog(`助手耗尽：${stalled.map(a => a.name).join('、')} 已暂停——购买助手或等待补给后自动恢复`, 'warn');
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

// ========== v3.11.0：执行器表（声明 → 求值 → 消费 三层中的「求值」层） ==========
// 执行器只负责「本周期实际执行了几次动作 + 日志正文」，绝不碰助手扣费 / 台账 / 日志后缀；
// 这些横切关注点统一由 tickAI 的注册表遍历处理。新增动作 = 注册表一行 + 这里一个执行器。
// budget = 当前助手余额可负担的最大动作次数（assistantCost=0 时为 Infinity）。
const ACTION_PREREQS = {
  build: () => !!(S.ai && S.ai.autoBuildUnlocked && policyMult('aiCap') > 0),
  tech: () => !!(S.tech && S.tech.auto_tech),
};
export function actionAvailable(id) {
  const p = ACTION_PREREQS[id];
  return p ? p() : true;
}

const EXECUTORS = {
  // a. 自动升级：回本最短项，EP ≥ 预留线才买
  upgrade(ctx, budget) {
    if (budget < 1) return null;
    const pick = bestPaybackItem();
    if (!(pick && S.ep - pick.cost >= ctx.line && S.ep >= pick.cost)) return null;
    S.ep -= pick.cost;
    S.upgrades[pick.u.id] = (S.upgrades[pick.u.id] || 0) + 1;
    S.totalBuys++;
    aiUiRefresh({ kind: 'upgrade', u: pick.u }); // v2.6.6 ③：单卡原地刷新
    return { count: 1, messages: [{ text: `自动升级：购入 ${pick.u.name}（-${fmt(pick.cost)} EP）`, cls: 'good', units: 1 }] };
  },
  // b. 自动招募：净产出为正且 EP ≥ 2×招募成本；net<0 自然停止
  hire(ctx, budget) {
    if (budget < 1) return null;
    const cost = staffCost();
    if (!(staffNetPerSec() > 0 && S.ep >= cost * 2 && S.ep - cost >= ctx.line)) return null;
    aiHireOne();
    hiredFlag = true; // v2.7.2：招募发生 → main 刷新线程区（dirty.shop）
    return { count: 1, messages: [{ text: `自动招募：+1 线程（-${fmt(cost)} EP）`, cls: 'good', units: 1 }] };
  },
  // c. 自动领取：每个 pending 任务一次动作，各自消耗 1 名助手；不超过 budget
  claim(ctx, budget) {
    if (budget < 1) return null;
    const messages = [];
    let count = 0;
    for (const p of S.projects) {
      if (count >= budget) break;
      if (p.status !== 'pending') continue;
      claimProject(p);
      count++;
      messages.push({ text: `自动领取：任务「${p.name}」奖励到账`, cls: 'good', units: 1 });
    }
    return count > 0 ? { count, messages } : null;
  },
  // d. 自动购建：严格限速（间隔硬下限 5s / 每决策周期至多 1 栋 / 受预留线约束）
  build(ctx, budget) {
    const rate = autoBuildRate();
    S.ai.autoBuildTimer = (S.ai.autoBuildTimer || 0) + ctx.dt;
    if (S.ai.autoBuildTimer < rate || budget < 1) return null;
    S.ai.autoBuildTimer = 0;
    const cands = V21_BUILDINGS
      .filter(b => b.via !== 'upgrade' && S.unlockedBuildings && S.unlockedBuildings[b.id] && !v21Maxed(b, S))
      .map(b => ({ b, cost: v21BuildingCost(b) }))
      .sort((a, b2) => a.cost - b2.cost);
    for (const { b, cost } of cands) {
      if (S.ep < cost || S.ep - cost < ctx.line) continue;
      S.ep -= cost;
      S.buildings[b.id] = v21Level(b.id, S) + 1;
      S.totalBuys = (S.totalBuys || 0) + 1;
      const cap = capOf(b, S);
      aiUiRefresh({ kind: 'building', b });
      return { count: 1, messages: [{ text: `自动购建：${b.name} 升至 Lv.${v21Level(b.id, S)}/${isFinite(cap) ? cap : '∞'}（-${fmt(cost)} EP）`, cls: 'good', units: 1 }] };
    }
    return null;
  },
  // e. 自动研究：每决策周期至多买 1 个最便宜可负担科技（RP 消耗）
  tech(ctx, budget) {
    if (budget < 1) return null;
    const cands = (getTechs() || [])
      .filter(t => t.autoTech && !hasTech(t.id) && (!t.req || t.req.every(r => hasTech(r))))
      .map(t => ({ t, cost: techCostOf(t) }))
      .sort((a2, b2) => a2.cost.rp - b2.cost.rp);
    for (const { t, cost } of cands) {
      if ((S.rp || 0) < cost.rp || (S.ep || 0) < (cost.ep || 0)) break;
      S.rp -= cost.rp;
      S.ep -= cost.ep || 0;
      S.tech[t.id] = true;
      pushBoughtOrder(S, t.id);
      return { count: 1, messages: [{ text: `自动研究：购入科技「${t.name}」（-${fmt(cost.rp)} RP${cost.ep ? ' -' + fmt(cost.ep) + ' EP' : ''}）`, cls: 'good', units: 1 }] };
    }
    return null;
  },
};

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
  // v3.11.0：开关总闸由注册表派生（此前手写 5 个 key，新增动作必漏）。
  if (!isAnyActionEnabled(ai)) return false;
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
  const ctx = { dt, line: reserveLine() };
  const stalled = [];

  // v3.11.0：统一遍历注册表。助手守卫 / 扣费 / 台账 / 日志后缀只有这一处实现。
  for (const a of AI_ACTIONS) {
    if (!ai[a.switchKey] || !actionAvailable(a.id)) continue;
    const cost = a.assistantCost;
    const budget = cost > 0 ? Math.floor(assistantCount() / cost) : Infinity;
    if (budget < 1) { stalled.push(a); continue; }
    const result = EXECUTORS[a.id](ctx, budget);
    if (!result || result.count <= 0) continue;
    const spent = consumeAssistants(result.count * cost);
    recordAction(a.id, result.count);
    for (const m of result.messages) {
      const units = m.units || 1;
      const suffix = cost > 0 && spent > 0 ? `（消耗 ${units * cost} 名助手）` : '';
      ailog(m.text + suffix, m.cls);
    }
    acted = true;
  }
  warnIfStalled(stalled);
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

// v3.10.5：助手购买可购态（一次性消耗品，无上限，价格逐次递增）
export function assistantBuyState() {
  const cost = assistantCost();
  const afford = (S.ep || 0) >= cost;
  const disabled = !aiUnlocked() || !afford;
  const label = `购买助手（${fmt(cost)} EP）`;
  const title = !aiUnlocked() ? '需先研究「AI 管理核心」'
    : afford ? `消耗 ${fmt(cost)} EP 购买 1 名 AI 助手（每项自动化动作每执行一次消耗 1 名）`
      : `EP 不足：还需 ${fmt(Math.max(0, cost - (S.ep || 0)))} EP`;
  return { cost, afford, disabled, label, title, sig: `${disabled}|${label}|${title}` };
}

// v3.11.0：把「购买助手 / 切开关 / 一键全关」抽成产品真实入口。
// UI 点击处理器与 30 天浏览器自动玩家共用同一函数，避免推演直接写 S 伪造进度。
export function buyAssistant() {
  const st = assistantBuyState();
  if (!st.disabled) {
    S.ep -= st.cost;
    S.ai.assistants = assistantCount() + 1;
    ailog('购入 AI 助手 +1（一次性消耗品）', 'good');
    save(S);
    return { ok: true, cost: st.cost, count: assistantCount() };
  }
  ailog(`购买助手失败：EP 不足（还需 ${fmt(Math.max(0, st.cost - (S.ep || 0)))} EP）`, 'bad');
  return { ok: false, reason: st.title, cost: st.cost };
}

export function setAiSwitch(key, on) {
  if (!AI_ACTION_SWITCH_KEYS.includes(key)) return false;
  S.ai[key] = !!on;
  save(S);
  return true;
}

export function allOffActions() {
  for (const k of ALL_OFF_SWITCH_KEYS) S.ai[k] = false;
  ailog('一键全关：所有自动化已停止', 'bad');
  save(S);
  return true;
}

// v3.10.5：EP / 单价变动时原地维护可购态（纯属性切换，不重建面板）
export function refreshAssistantAffordability() {
  const btn = document.querySelector('#ai-panel [data-assist-buy]');
  if (!btn) return;
  const st = assistantBuyState();
  if (btn.dataset.affordSig === st.sig) return;
  btn.dataset.affordSig = st.sig;
  btn.disabled = st.disabled;
  btn.classList.toggle('disabled', st.disabled);
  btn.textContent = st.label;
  btn.title = st.title;
}

// v3.10.5：助手区块（消耗品）——只显示数量 + 购买按钮，删除编队/槽位/按类型分配
// v3.11.0：补上「助手耗尽停摆」的面板提示与动作台账，避免开关 ON 却静默无动作。
function renderAssistantSection() {
  const n = assistantCount();
  const st = assistantBuyState();
  const stalled = stalledActions();
  const counts = actionCounts();
  const supply = BALANCE.ai.assistants.supply;
  const stallHtml = stalled.length
    ? `<div class="ai-stall" data-ai-stall style="margin-top:4px;padding:5px 8px;border:1px solid var(--warn,#c8a24a);border-radius:6px;font-size:12px;line-height:1.7;color:var(--warn,#c8a24a)">⚠ 助手已耗尽：${stalled.map(a => a.name).join('、')} 暂停执行。购买助手或等待自动补给后恢复。</div>`
    : '';
  const ledgerHtml = `<div class="ai-ledger" data-ai-ledger style="font-size:11px;color:var(--text-3,#6e7681);margin-top:2px">本局已执行：${AI_ACTIONS.map(a => `${a.name} ${counts[a.id] || 0}`).join(' · ')}（合计 ${totalActionCount(counts)} 次）</div>`;
  let head = `<div class="ai-desc" style="margin-top:6px">🤖 AI 助手：<b style="color:var(--cyan)" data-ai-assistant-count>${n}</b> 名（每项自动化动作每执行一次消耗 1 名）`;
  if (aiUnlocked()) {
    return head + `</div>` + stallHtml
      + `<div style="margin-top:4px">`
      + `<button class="btn ${st.disabled ? 'disabled' : ''}" data-assist-buy data-afford-sig="${st.sig}" ${st.disabled ? 'disabled' : ''} title="${st.title}">${st.label}</button>`
      + `<div style="font-size:11px;color:var(--text-3,#6e7681);margin-top:2px">助手数量无上限，购买价随数量递增（×${BALANCE.ai.assistants.costGrowth}）；每 ${supply.intervalSec / 60} 分钟自动补给 ${supply.perTick} 名（至多积攒 ${supply.cap} 名，购买不受此限）。</div>`
      + ledgerHtml + `</div>`;
  }
  return head + `</div>` + ledgerHtml;
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
        <b style="color:var(--red,#f85149)">混沌心智已接管</b>：AI 自动化全面禁用，混沌直觉每 10 秒随机购入最便宜的未拥有升级（深渊行者科技线）。<b style="color:var(--warn,#c8a24a)">永久生效，不可取消</b>——勾选混沌心智后 AI 无法恢复，请谨慎选择。<br>接管期间已购助手不再消耗，也不会退还。</div>`;
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
  // v3.11.0：开关文案一律取注册表 desc（单一真源），不再在面板内联硬编码。
  const autoTechAction = actionById('tech');
  // v2.8.4：自动研究开关（秩序线科技「自动研究」已购后显示；RP 购买科技树）
  const autoTechHtml = (S.tech && S.tech.auto_tech)
    ? sw(autoTechAction.switchKey, autoTechAction.name, autoTechAction.desc) : '';
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
        ${sw(actionById('build').switchKey, actionById('build').name, `${actionById('build').desc}（当前间隔 ${autoBuildRate()}s）`)}
        <div class="ai-reserve-row" style="margin-top:4px">
          <span>购买间隔</span>${rateBtns}
        </div>
        <div style="font-size:11px;color:var(--text-2);margin-top:4px">下次购建倒计时 ${Math.max(0, autoBuildRate() - (ai.autoBuildTimer || 0)).toFixed(1)}s</div>
      </div>`;
  }
  // v3.11.0：分组横幅与开关列表均从注册表派生。旧版把「需消耗 AI 助手」横幅放在整张卡顶部，
  // 把不消耗助手（当时）的进阶动作也框了进去；现在两组都明确写出各自口径，语义不再越界。
  const groupBanner = (g) => `<div class="ai-group-title" data-ai-group="${g.key}" style="font-size:12px;color:var(--text-2);margin:2px 0 6px;padding:5px 8px;background:var(--row,#161b27);border-radius:6px;line-height:1.7">${g.key === 'basic' ? '🟢' : '🔧'} ${g.name} · ${g.hint}<br><span style="font-size:11px;color:var(--text-3,#6e7681)">${g.note}</span></div>`;
  const basicActionsHtml = actionsByGroup('basic')
    .map(a => sw(a.switchKey, a.name, a.desc)).join('');
  const advancedGroup = AI_ACTION_GROUPS.find(g => g.key === 'advanced');
  const advancedHtml = buildHtml.trim()
    ? groupBanner(advancedGroup) + buildHtml : '';
  container.innerHTML = `
    ${(S.tech && S.tech.prophecy && S.prophecyNext) ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid var(--purple,#9c27b0);border-radius:6px;background:rgba(156,39,176,.12);font-size:12px;line-height:1.6">🔮 <b>神谕广播</b>：下一个事件将是「${S.prophecyNext.name}」<span style="color:var(--text-2)">——${S.prophecyNext.desc || '效果未知'}</span></div>` : ''}
    ${groupBanner(AI_ACTION_GROUPS.find(g => g.key === 'basic'))}
    <div class="ai-desc">预留线：EP 上限的 ${Math.round((ai.reserve ?? BALANCE.ai.defaultReserve) * 100)}%</div>
    ${basicActionsHtml}
    ${advancedHtml}
    ${renderAssistantSection()}
    <div class="ai-reserve-row">
      <span>预留线</span>${reserveOpts}
      <button class="btn" data-ai-alloff="1" title="关闭全部自动化开关（含进阶动作）">一键全关</button>
    </div>`;

  if (!container.dataset.v13Delegated) {
    container.dataset.v13Delegated = '1';
    container.addEventListener('click', (e) => {
      const swEl = e.target.closest('[data-ai-switch]');
      if (swEl) {
        // v2.8.21 ③：不再要求 key 预存在 S.ai（旧档无 autoTech 字段 → 点击无效）
        setAiSwitch(swEl.dataset.aiSwitch, !S.ai[swEl.dataset.aiSwitch]);
        renderAiPanel(container);
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
        // v3.11.0：从注册表派生，修掉手写集合漏 autoTech 导致「日志说全停、自动研究还在跑」。
        allOffActions();
        renderAiPanel(container);
        return;
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
        buyAssistant();
        renderAiPanel(container);
        return;
      }
    });
  }
}
