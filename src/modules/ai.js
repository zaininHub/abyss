// v1.3 模块 A：AI 助手（基础三项 + 进阶两项自动化 + 预留线）
// 解锁：科技树「AI 管理核心」（ai_core，里程碑 cps≥1e4 后可见，50 RP，跨晋升保留）
// v3.11.0：动作元数据（开关 / 分组 / 助手单价 / 文案）下沉到 core/aiActionRegistry.js，
//   本文件只保留执行器与 UI，助手占编 / 分配 / 台账 / 日志由 tickAI 统一遍历处理。
// 规范（设计 §5）：
//   - 各开关默认全关，独立可关；关闭后无新动作
//   - 自动升级：每决策周期买「回本最短」产出项（payback = 成本 ÷ 边际 CPS 含全局乘数），EP ≥ 预留线才买
//   - 自动招募：staffNetPerSec() > 0 且 EP ≥ staffCost×2（net<0 自然停）
//   - 自动领取：任务 pending 即领（EP 类奖励走 addEp 上限口径，由 claimProject 内部处理）
//   - 自动购建 / 自动研究：各自需额外解锁，开启后需 AI 助手编制
//   - AI 助手是常驻班组，采用「手动占编（绑定）」模型（对齐线程绑定到转化器岗位）：开启某动作默认占编 crewSize（1）名助手，
//     其余留在空闲池；玩家可手动 +/− 调整占编数。每动作每周期执行次数 = 该动作「绑定」的助手数（越多越强）；关闭 / 解绑即释放占编，不消耗。
//   - 预留线：EP 上限的 10% / 30% / 50% 三档（默认 30%）
//   - 所有动作走日志带 [AI] 前缀；面板底部「一键全关」由注册表派生，覆盖全部开关
import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';
import {
  hasTech, computeCps, globalMult, epStorageCap, staffCost, staffNetPerSec,
  fmt, unitCost, costMult, addEp, techCostOf, researchMult, elv, spendRes, // v2.8.22 ②：自动研究按多资源成本购买；v3.10.5：「拟我协议」rp_ai 提升助手性价比（摊薄购买价）；v3.12.12 ⑥：永恒拟我缩短决策间隔
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
  AI_CREW_REQUIRED_IDS, ALL_OFF_SWITCH_KEYS, actionById, actionsByGroup,
  enabledActions, isAnyActionEnabled, emptyActionCounts, totalActionCount,
  maxCycleCrewDemand, crewSizeOf, crewMaxOf, groupRankOf,
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

// v3.11.3：助手 = 常驻班组，但采用「手动占编（绑定）」模型（对齐线程绑定到转化器岗位）：
// 开启某动作时默认占编 crewSize（1）名助手，其余留在空闲池；玩家可手动 +/− 调整占编数。
// 每动作每周期执行次数 = 该动作「绑定」的助手数（越多越强）；关闭或 − 解绑即释放占编回空闲池，不消耗。
// 删除 v3.10.5 的「消耗品 + 自动补给流」，以及 v3.11.2 的「自动均分分配」（改由玩家显式绑定，见用户示例）。
export function assistantCount() { return (S.ai && S.ai.assistants) || 0; }
export function assistantCost() {
  const c = BALANCE.ai.assistants;
  const n = assistantCount();
  // v3.10.5：「拟我协议」(rp_ai) 研究提升助手性价比——购买价 ÷ researchMult('ai')，数量递增仍然限购
  // v3.12.0 反馈⑥：拟我系研究满级可摊薄 20~40 倍，会把「大幅涨价」整段抹平；
  //   折扣封顶 researchDiscountCap（×3），研究仍有价值但不再抵消定价重标定。
  const discount = Math.min(researchMult('ai'), c.researchDiscountCap || 3);
  return Math.round(c.baseCost * Math.pow(c.costGrowth, n) / discount);
}
// v3.11.3：绑定（占编）模型。crew 存于 S.ai.crew[id] = 绑定到该动作的助手数。
// 与线程绑定同理：绑定是常驻、不消耗；解绑即释放。
export function crewOf(id) { return (S.ai.crew && S.ai.crew[id]) || 0; }
export function crewBoundTotal() {
  const c = S.ai.crew || {};
  return AI_ACTION_IDS.reduce((n, id) => n + (c[id] || 0), 0);
}
export function crewIdle() { return Math.max(0, assistantCount() - crewBoundTotal()); }
// 调整某动作占编数：clamp 到 [0, min(当前 + 空闲, 动作占编上限)]。
// v3.12.5 反馈②：基础三项 crewMax = 1——一次决策周期本来就只跑一次，多绑只是白占人手。
export function setCrew(id, n) {
  if (!actionById(id)) return false;
  if (!S.ai.crew) S.ai.crew = {};
  const cur = crewOf(id);
  const max = Math.min(cur + crewIdle(), crewMaxOf(id));
  const next = Math.max(0, Math.min(max, Math.round(n)));
  S.ai.crew[id] = next;
  // v3.12.3 反馈⑦：基础三项不再提供 ON/OFF 开关——「占编 > 0」即开启，「占编 0」即关闭。
  // 开关 key 由占编派生同步（tickAI 的总闸 / 一键全关仍读注册表里的开关，语义不变）。
  const a = actionById(id);
  if (a && a.switchKey) S.ai[a.switchKey] = next > 0;
  save(S);
  return true;
}
// v3.12.3 反馈⑦：基础三项取消 ON/OFF 开关后，「已开启但未绑定」这个中间态不再存在
// ——占编 > 0 就是开启。新助手买入后不再自动补员，由玩家用 ＋ 手动绑定（0 助手 = 全关）。

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
export { totalActionCount, maxCycleCrewDemand, AI_CREW_REQUIRED_IDS, crewSizeOf, crewMaxOf, groupRankOf };

// 已开启但未绑定助手的动作（占编 0 = 未生效，等待绑定 / 购买补员）。
// v3.12.13 ⑥：移除「⚠ 已开启但未绑定助手」日志告警——未绑定态由面板 stall 盒（data-ai-stall）直接呈现，
//   不再向 [AI] 日志刷屏告警。
export function stalledActions() {
  if (!aiUnlocked()) return [];
  // v3.12.3 反馈⑦：0 助手 = 全关（不再有「已开启但没绑定」的中间态可提示）
  if (assistantCount() <= 0) return [];
  if (!isAnyActionEnabled(S.ai)) return [];
  return enabledActions(S.ai).filter(a => actionAvailable(a.id) && crewOf(a.id) <= 0);
}

// v2.5.5：全部资源点解锁判定（resDiscovered 十个锚点全 true）
const ALL_RES_KEYS = ['ep', 'cps', 'run', 'tide', 'rank', 'rp', 'es', 'faith', 'pt', 'dm'];
export function allResDiscovered(S) {
  const rd = (S && S.resDiscovered) || {};
  return ALL_RES_KEYS.every(k => rd[k] === true);
}
export function autoBuildUnlocked() { return !!(S.ai && S.ai.autoBuildUnlocked); }
export function autoBuildActivateCost() { return BALANCE.ai.aiAutoBuild.activateCost; }
// v3.12.13 ⑥：激活消耗的资源——自动购建能力迁研究点，由 EP 改为 RP
export function autoBuildActivateRes() { return 'rp'; }
export function autoBuildRate() {
  const r = (S.ai && S.ai.autoBuildRate) || BALANCE.ai.aiAutoBuild.defaultRate;
  return Math.max(BALANCE.ai.aiAutoBuild.minRate, Math.min(3600, r)); // 硬下限 5s：改档/改存档均不生效
}
export function autoBuildActivable() {
  return aiUnlocked() && !autoBuildUnlocked() && allResDiscovered(S) && (S.rp || 0) >= autoBuildActivateCost();
}
// 激活：校验 + 一次性扣除研究点 RP
export function activateAutoBuild() {
  if (autoBuildUnlocked()) return { ok: false, reason: '已激活' };
  if (!allResDiscovered(S)) return { ok: false, reason: '未解锁全部资源点' };
  const cost = autoBuildActivateCost();
  if ((S.rp || 0) < cost) return { ok: false, reason: `研究点不足（需 ${fmt(cost)}）` };
  S.rp -= cost;
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

// v3.11.2：执行器接收「分配到本动作的工人数 workers」，每周期执行 workers 次
// （越多越强，对标班组「线程越多产出越高」）。执行器只负责「本周期实际执行了几次 + 日志正文」，
// 占编 / 分配 / 台账 / 日志由 tickAI 统一处理。新增动作 = 注册表一行 + 这里一个执行器。
const EXECUTORS = {
  // a. 自动升级：回本最短项，EP ≥ 预留线才买；每工人买 1 次
  upgrade(ctx, workers) {
    let count = 0; const messages = [];
    for (let i = 0; i < workers; i++) {
      const pick = bestPaybackItem();
      if (!(pick && S.ep - pick.cost >= ctx.line && S.ep >= pick.cost)) break;
      S.ep -= pick.cost;
      S.upgrades[pick.u.id] = (S.upgrades[pick.u.id] || 0) + 1;
      S.totalBuys++;
      aiUiRefresh({ kind: 'upgrade', u: pick.u }); // v2.6.6 ③：单卡原地刷新
      count++;
      messages.push({ text: `自动升级：购入 ${pick.u.name}（-${fmt(pick.cost)} EP）`, cls: 'good' });
    }
    return count > 0 ? { count, messages } : null;
  },
  // b. 自动招募：净产出为正且 EP ≥ 2×招募成本；net<0 自然停止；每工人招 1 条
  hire(ctx, workers) {
    let count = 0; const messages = [];
    for (let i = 0; i < workers; i++) {
      const cost = staffCost();
      if (!(staffNetPerSec() > 0 && S.ep >= cost * 2 && S.ep - cost >= ctx.line)) break;
      aiHireOne();
      hiredFlag = true; // v2.7.2：招募发生 → main 刷新线程区（dirty.shop）
      count++;
      messages.push({ text: `自动招募：+1 线程（-${fmt(cost)} EP）`, cls: 'good' });
    }
    return count > 0 ? { count, messages } : null;
  },
  // c. 自动领取：每工人领取 1 个 pending 任务（不超过 pending 数量）
  claim(ctx, workers) {
    const messages = []; let count = 0;
    for (const p of S.projects) {
      if (count >= workers) break;
      if (p.status !== 'pending') continue;
      claimProject(p);
      count++;
      messages.push({ text: `自动领取：任务「${p.name}」奖励到账`, cls: 'good' });
    }
    return count > 0 ? { count, messages } : null;
  },
  // d. 自动购建：严格限速（间隔硬下限 5s）；到达间隔时一次购建最多 workers 栋（成本升序）
  build(ctx, workers) {
    const rate = autoBuildRate();
    S.ai.autoBuildTimer = (S.ai.autoBuildTimer || 0) + ctx.dt;
    if (S.ai.autoBuildTimer < rate) return null;
    S.ai.autoBuildTimer = 0;
    const cands = V21_BUILDINGS
      .filter(b => b.via !== 'upgrade' && S.unlockedBuildings && S.unlockedBuildings[b.id] && !v21Maxed(b, S))
      .map(b => ({ b, cost: v21BuildingCost(b) }))
      .sort((a, b2) => a.cost - b2.cost);
    let built = 0; const messages = [];
    for (const { b, cost } of cands) {
      if (built >= workers) break;
      if (S.ep < cost || S.ep - cost < ctx.line) continue;
      S.ep -= cost;
      S.buildings[b.id] = v21Level(b.id, S) + 1;
      S.totalBuys = (S.totalBuys || 0) + 1;
      const cap = capOf(b, S);
      aiUiRefresh({ kind: 'building', b });
      built++;
      messages.push({ text: `自动购建：${b.name} 升至 Lv.${v21Level(b.id, S)}/${isFinite(cap) ? cap : '∞'}（-${fmt(cost)} EP）`, cls: 'good' });
    }
    return built > 0 ? { count: built, messages } : null;
  },
  // e. 自动研究：每周期购买最多 workers 个最便宜可负担科技（RP 消耗）
  tech(ctx, workers) {
    const cands = (getTechs() || [])
      .filter(t => t.autoTech && !hasTech(t.id) && (!t.req || t.req.every(r => hasTech(r))))
      .map(t => ({ t, cost: techCostOf(t) }))
      .sort((a2, b2) => a2.cost.rp - b2.cost.rp);
    let bought = 0; const messages = [];
    for (const { t, cost } of cands) {
      if (bought >= workers) break;
      if ((S.rp || 0) < cost.rp || (S.ep || 0) < (cost.ep || 0)) break;
      S.rp -= cost.rp;
      spendRes('rp', cost.rp);
      S.ep -= cost.ep || 0;
      S.tech[t.id] = true;
      pushBoughtOrder(S, t.id);
      bought++;
      messages.push({ text: `自动研究：购入科技「${t.name}」（-${fmt(cost.rp)} RP${cost.ep ? ' -' + fmt(cost.ep) + ' EP' : ''}）`, cls: 'good' });
    }
    return bought > 0 ? { count: bought, messages } : null;
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
  // v3.12.12 反馈⑥：永恒拟我——AI 能力提升：决策间隔 -8%/级（与其他间隔缩减同口径，下限 40% 原间隔）
  const aiEt = elv('ai');
  if (aiEt > 0) interval = Math.max(BALANCE.ai.interval * 0.4, interval * (1 - 0.08 * aiEt));
  if (ai.timer < interval) return false;
  ai.timer -= interval;

  let acted = false;
  const ctx = { dt, line: reserveLine() };

  // v3.11.3：每个动作的执行次数 = 其绑定的助手数（手动占编，常驻不消耗）。
  // 绑定为 0 的已开启动作不执行（待绑定 / 待补员）；未绑定态由面板 stall 盒呈现，不再日志告警。
  for (const a of AI_ACTIONS) {
    if (!ai[a.switchKey] || !actionAvailable(a.id)) continue;
    const workers = crewOf(a.id);
    if (workers <= 0) continue;
    const result = EXECUTORS[a.id](ctx, workers);
    if (!result || result.count <= 0) continue;
    recordAction(a.id, result.count);
    for (const m of result.messages) ailog(m.text, m.cls);
    acted = true;
  }
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

// v3.11.3：助手购买可购态（常驻班组，购买即扩编；绑定后才执行，不消耗）
export function assistantBuyState() {
  const cost = assistantCost();
  const afford = (S.ep || 0) >= cost;
  const disabled = !aiUnlocked() || !afford;
  const label = `购买助手（${fmt(cost)} EP）`;
  const title = !aiUnlocked() ? '需先研究「AI 管理核心」'
    : afford ? `消耗 ${fmt(cost)} EP 扩编 1 名 AI 助手（常驻班组，绑定到开启的自动化动作，不消耗）`
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
    ailog('购入 AI 助手 +1（扩编自动化班组，用 ＋ 绑定到动作）', 'good');
    save(S);
    return { ok: true, cost: st.cost, count: assistantCount() };
  }
  ailog(`购买助手失败：EP 不足（还需 ${fmt(Math.max(0, st.cost - (S.ep || 0)))} EP）`, 'bad');
  return { ok: false, reason: st.title, cost: st.cost };
}

export function setAiSwitch(key, on) {
  if (!AI_ACTION_SWITCH_KEYS.includes(key)) return false;
  const a = AI_ACTIONS.find(x => x.switchKey === key);
  S.ai[key] = !!on;
  if (!S.ai.crew) S.ai.crew = {};
  if (on) {
    // v3.11.3：开启时若尚未占编，则自动占编 crewSize（从空闲池；不足则 0 = 开启但未绑定，待补员）
    if (!(S.ai.crew[a.id] > 0)) {
      S.ai.crew[a.id] = Math.min(crewSizeOf(a.id), crewIdle());
    }
  } else {
    S.ai.crew[a.id] = 0; // 关闭释放占编
  }
  save(S);
  return true;
}

export function allOffActions() {
  for (const k of ALL_OFF_SWITCH_KEYS) S.ai[k] = false;
  // v3.12.3 反馈⑦：开关与占编同源——一键全关必须把占编一起清零，否则界面仍显示「已占编」。
  if (S.ai.crew) for (const id of AI_ACTION_IDS) S.ai.crew[id] = 0;
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

  // v3.12.12 反馈⑧：删除 EP 购买按钮（「购买助手」改走研究点「助手扩编协议」rp_ai_unit）；
  // v4.0.1 反馈①：预留线从标题行移出，独立成行（data-ai-reserve-line），避免与标题挤在一行把按钮挤出面板。
  function renderAssistantSection() {
  const n = assistantCount();
  const idle = crewIdle();
  const bound = crewBoundTotal();
  const counts = actionCounts();
  const unstaffed = (assistantCount() > 0 ? enabledActions(S.ai) : []).filter(a => actionAvailable(a.id) && crewOf(a.id) <= 0);
  // v3.12.13 ⑥：移除「⚠ 已开启但未绑定助手…研究点扩编后自动补员」告警文案；保留 data-ai-stall 盒作为
  //   未绑定态的中性提示（与 stalledActions() 读侧同源，供 30 天推演一致性校验）。
  const unstaffedHtml = unstaffed.length
    ? `<div class="ai-stall" data-ai-stall style="margin-top:4px;padding:5px 8px;border:1px solid var(--warn,#c8a24a);border-radius:6px;font-size:12px;line-height:1.7;color:var(--warn,#c8a24a)">${unstaffed.map(a => a.name).join('、')} 已开启但未绑定助手，点击 ＋ 绑定后才会执行</div>`
    : '';
  // v3.12.5 反馈④：台账数值改为悬浮在助手行上，需要时才看，不占版面。
  const ledgerTip = `空闲 ${idle} · 占编 ${bound} · 共 ${n} 名｜本局已执行 ${totalActionCount(counts)} 次 · ${AI_ACTIONS.map(a => `${a.name} ${counts[a.id] || 0}`).join(' / ')}｜助手来自研究点「助手扩编协议」（每级 +1 名）`;
  // v3.12.7 ⑤：助手信息收成一行——只留「空闲/总数」（4/7），落进面板标题 <h3>。
  // v3.12.13 ⑤：移除常驻「研究点扩编」提示，扩编入口说明收敛到悬浮框 data-tip（见 ledgerTip）。
  const head = `<span class="ai-assistant-head" data-ai-head data-tip="${ledgerTip}" aria-label="${ledgerTip}"><b style="color:var(--cyan)" data-ai-assistant-count>${idle}</b><span class="ai-assist-sep">/</span><span style="color:var(--text-3)" data-ai-assistant-total>${n}</span></span>`;
  // v4.0.1 反馈①：预留线独立成行（data-ai-reserve-line，位于标题行下方），不再挤在标题行内。
  const ai = S.ai;
  const reserveOpts = BALANCE.ai.reserveOptions.map(r =>
    `<button class="btn ai-reserve-btn ${ai.reserve === r ? 'on' : ''}" data-ai-reserve="${r}">${Math.round(r * 100)}%</button>`).join('');
  const reserveHtml = `<span class="ai-reserve-label">预留线 EP 上限</span><span class="ai-reserve-opts">${reserveOpts}</span>`;
  return { headHtml: head, reserveHtml, stallHtml: unstaffedHtml };
}

// ========== 面板 ==========
export function renderAiPanel(container) {
  if (!container) return;
  if (!aiUnlocked()) {
    container.innerHTML = '';
    container.style.display = 'none';
    const s0 = container.parentElement && container.parentElement.querySelector('[data-ai-assist-slot]');
    if (s0) s0.innerHTML = '';
    return;
  }
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
  // v3.12.3 反馈⑦⑨：面板只保留「动作名 + 占编步进器」。
  //   ① 基础自动化整段说明（分组横幅）删除；② ±两侧「占编 / 空闲 N」文案删除；
  //   ③ 基础三项不再有 ON/OFF 开关——占编 0 就是关闭（0 助手时自然全关）；
  //   ④ 进阶两项解锁前整卡不渲染（不再出现「未解锁 / 需科技树研究…」的锁定卡与文案），解锁后自动出现。
  // v3.12.5 反馈②：名称与占编步进器同处一行（原为上下两行，卡片被白白拉高一倍）；
  // 有硬上限的动作显示 n/上限，到顶后 ＋ 直接禁用。
  const crewRow = (id, disabled = false) => {
    const n = crewOf(id); const idle = crewIdle();
    const cap = crewMaxOf(id);
    const capTxt = Number.isFinite(cap) ? '/' + cap : '';
    const atCap = n >= cap;
    return `<div class="ai-crew" data-ai-crew="${id}">
      <button class="btn ai-crew-btn" data-ai-crew-dec="${id}" ${n <= 0 || disabled ? 'disabled' : ''} title="解绑 1 名（释放回空闲池）">−</button>
      <b data-ai-crew-count="${id}">${n}${capTxt}</b>
      <button class="btn ai-crew-btn" data-ai-crew-inc="${id}" ${idle <= 0 || atCap || disabled ? 'disabled' : ''} title="${atCap ? `该动作占编上限 ${cap} 名` : '再绑定 1 名助手到本动作'}">＋</button>
    </div>`;
  };
  const actionCard = (a, extra = '') => `
    <div class="ai-action ${crewOf(a.id) > 0 ? 'on' : ''}" data-ai-action="${a.id}" title="${a.desc}">
      <div class="ai-action-row">
        <span class="ai-action-name">${a.name}</span>
        ${crewRow(a.id)}
      </div>
      ${extra}
    </div>`;

  // 进阶：自动研究（科技树「自动研究」）/ 自动购建（全资源点解锁后可激活）
  // v3.12.3 反馈⑨：两项都在「真正解锁后」才渲染，未解锁既不显示卡片、也不显示任何锁定文案。
  const AB = BALANCE.ai.aiAutoBuild;
  const techAction = actionById('tech');
  const buildAction = actionById('build');
  const techHtml = actionAvailable('tech') ? actionCard(techAction) : '';
  let buildHtml = '';
  if (autoBuildUnlocked()) {
    const rateBtns = AB.rateOptions.map(r =>
      `<button class="btn ai-rate-btn ${(ai.autoBuildRate ?? AB.defaultRate) === r ? 'on' : ''}" data-ai-build-rate="${r}">${r}s</button>`).join('');
    buildHtml = actionCard(buildAction,
      `<div class="ai-reserve-row" style="margin-top:6px">${rateBtns}</div>
       <div style="font-size:11px;color:var(--text-3);margin-top:4px">下次购建 ${Math.max(0, autoBuildRate() - (ai.autoBuildTimer || 0)).toFixed(1)}s</div>`);
  } else if (allResDiscovered(S)) {
    // 资源点已齐：只剩一次性激活（消耗研究点 RP；激活后自动解锁并出现上面的常规卡）
    const rpOk = (S.rp || 0) >= autoBuildActivateCost();
    buildHtml = `<div class="ai-build-box ${rpOk ? '' : 'ai-build-locked'}">
      <div class="ai-build-title">${buildAction.name}</div>
      <button class="btn ${rpOk ? '' : 'disabled'}" data-ai-build-activate="1" ${rpOk ? '' : 'disabled'} title="消耗 ${fmt(autoBuildActivateCost())} 研究点 激活自动购建">激活（${fmt(autoBuildActivateCost())} 研究点）</button>
    </div>`;
  }
  const basicHtml = actionsByGroup('basic').map(a => actionCard(a)).join('');
  const advancedHtml = (techHtml || buildHtml) ? `<div class="ai-action-grid">${techHtml}${buildHtml}</div>` : '';
  const section = renderAssistantSection();
  // v3.12.7 ⑤：助手行（4/7 + 购买）落进面板标题行，卡片区只留动作卡与未绑定提示
  const card = container.parentElement && container.parentElement.classList.contains('ai-card')
    ? container.parentElement : document.getElementById('ai-card');
  const slot = card && card.querySelector('[data-ai-assist-slot]');
  if (slot) slot.innerHTML = section.headHtml;
  // v4.0.1 反馈①：预留线独立成行（标题行下方），与助手数同行解耦，避免按钮被挤出面板。
  const rline = card && card.querySelector('[data-ai-reserve-line]');
  if (rline) rline.innerHTML = section.reserveHtml;
  container.innerHTML = `
    ${(S.tech && S.tech.prophecy && S.prophecyNext) ? `<div style="margin-bottom:8px;padding:8px 10px;border:1px solid var(--purple,#9c27b0);border-radius:6px;background:rgba(156,39,176,.12);font-size:12px;line-height:1.6">🔮 <b>神谕广播</b>：下一个事件将是「${S.prophecyNext.name}」<span style="color:var(--text-2)">——${S.prophecyNext.desc || '效果未知'}</span></div>` : ''}
    <div class="ai-action-grid">${basicHtml}</div>
    ${advancedHtml}
    ${section.stallHtml}`;

  // 点击委托挂在 #ai-card 上（助手行含预留线按钮，在标题行 slot 内，不在 #ai-panel 内，否则收不到事件）
  const delegateHost = card || container;
  if (!delegateHost.dataset.v13Delegated) {
    delegateHost.dataset.v13Delegated = '1';
    delegateHost.addEventListener('click', (e) => {
      const swEl = e.target.closest('[data-ai-switch]');
      if (swEl) {
        // v2.8.21 ③：不再要求 key 预存在 S.ai（旧档无 autoTech 字段 → 点击无效）
        setAiSwitch(swEl.dataset.aiSwitch, !S.ai[swEl.dataset.aiSwitch]);
        renderAiPanel(container);
        return;
      }
      const crewInc = e.target.closest('[data-ai-crew-inc]');
      if (crewInc) {
        // v3.11.3：手动再绑定 1 名助手到该动作（clamp 由 setCrew 处理）
        setCrew(crewInc.dataset.aiCrewInc, crewOf(crewInc.dataset.aiCrewInc) + 1);
        renderAiPanel(container);
        return;
      }
      const crewDec = e.target.closest('[data-ai-crew-dec]');
      if (crewDec) {
        setCrew(crewDec.dataset.aiCrewDec, crewOf(crewDec.dataset.aiCrewDec) - 1);
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
      // v3.12.7 ⑩：面板上的「一键全关」按钮已移除（占编 − 到 0 就是关闭）。
      //   allOffActions() 保留为自动化 / 测试 / 未来快捷入口的单一实现，不再挂 UI。
      // v2.5.5：激活自动购建——二次确认（首次点击变确认态，再点执行）
      const actEl = e.target.closest('[data-ai-build-activate]');
      if (actEl) {
        if (!autoBuildActivable()) { ailog('激活条件未满足：需全部资源点解锁且研究点充足', 'bad'); return; }
        if (actEl.dataset.confirm === '1') {
          const r = activateAutoBuild();
          if (r.ok) { ailog(`自动购建已激活（-${fmt(r.cost)} 研究点）；设置购买间隔与开关即可开始`, 'good'); }
          else ailog(`激活失败：${r.reason}`, 'bad');
          renderAiPanel(container);
        } else {
          actEl.dataset.confirm = '1';
          actEl.textContent = `再次点击确认（消耗 ${fmt(autoBuildActivateCost())} 研究点）`;
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
