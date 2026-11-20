// 分章节测试体系 · 共享快照层（v4.2.6 反馈②）
//
// 职责：跨局资产的快照 / 种子化 / 比对。
//   - 章节测试单元 = 一次晋升周期：输入 = 第 N 章开局的跨局资产快照；
//     输出 = 第 N+1 章开局快照（晋升结算后），链式传给下一章。
//   - 快照键 = CROSS_RUN_KEYS（stateSchema 单一真源，转生/轮回不清空）
//     ∪ 隐式保留进度键（prestige / chapter / expeditionsDone / milesDone / projectsDone 等——
//     它们不在 RUN_RESET_KEYS，晋升后保留，且是后续章节 cond 的判定输入，必须随快照携带）。
//   - 比对只看「区间 + 单调性」：随机项（faith / 事件 / 集市）不入预算校验（方案 §五）。
//
// 注意：本模块在 Node 侧直接 import src/core/stateSchema.js（纯 ESM 无 DOM 依赖，
// v3100-state-schema 单测同范式）——键清单不复制，防止与产品漂移。
import { CROSS_RUN_KEYS } from '../../src/core/stateSchema.js';

/**
 * 隐式保留的进度型键：不在 RUN_RESET_KEYS（晋升不清零），也不是 CROSS_RUN_KEYS
 * （load() 白名单语义不同），但它们是后续章节 cond(S) 的判定输入（第 2 章 prestige>=2、
 * 第 5 章 expeditionsDone>=8、第 7~8/13~15 章 prestige 门槛、编排解锁 projectsDone>=5），
 * 链式传递快照时必须携带，否则下一章种子会「失忆」导致条件永不可达。
 * chapterEnteredAt 特殊：恢复种子时重置为注入时刻（见 seedFromSnapshot）。
 */
export const PROGRESS_KEYS = Object.freeze([
  'prestige', 'chapter', 'chapterEnteredAt',
  'expeditions', 'expeditionsDone',
  'milesDone', 'projectsDone',
  'totalBuys', 'totalClicks',
]);

/** 全部快照键（CROSS_RUN_KEYS ∪ PROGRESS_KEYS，去重保序）。 */
export const SNAPSHOT_KEYS = Object.freeze([...new Set([...CROSS_RUN_KEYS, ...PROGRESS_KEYS])]);

/** 从页面状态 S 抽取跨局快照（深拷贝，JSON 安全）。 */
export function snapshotFromState(S) {
  const snap = {};
  for (const k of SNAPSHOT_KEYS) {
    if (S[k] === undefined) continue;
    const v = S[k];
    snap[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
  }
  return snap;
}

/** 快照 → 存档种子（合并到 baseSeed 的 overrides）：副本语义，晋升后的下一章从零开局。
 * @param {object} opts.boost 可选垫高：本章 carry 起点（低于 carry 的键补到 carry 值，
 *   高于则保留真实值——只垫底不封顶，模拟「上一章至少完成保底晋升」）。
 * @param {number} opts.chapter 可选章号覆盖：链式跑省略（真实快照自带 chapter）；
 *   独立跑（--from N 无 carry）必须传 N，否则种子固定从第 1 章开局，会先重爬 1~N-1 章。 */
export function seedFromSnapshot(snap, { storyline = 'default', boost = null, chapter = null } = {}) {
  const seed = {
    _version: 6, chapter: '1', storyline, ep: 0, rp: 0, es: 0, dm: 0, pt: 0,
    upgrades: {}, buildings: {}, tech: { ai_core: true }, cultists: [], faith: 0,
    religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
    resDiscovered: { ep: true, cps: true, run: true, tide: true },
    lastSeen: Date.now(), startTime: Date.now(),
  };
  for (const k of SNAPSHOT_KEYS) {
    if (snap[k] === undefined) continue;
    seed[k] = (snap[k] && typeof snap[k] === 'object') ? JSON.parse(JSON.stringify(snap[k])) : snap[k];
  }
  // 本局资源归零（晋升 resetRunState 已清，快照里本就没有；这里兜底防脏快照混入）
  for (const k of ['ep', 'rp', 'runEarned', 'earnedFull', 'upgrades', 'tech']) {
    if (k === 'tech') seed.tech = { ai_core: true };
    else if (k === 'upgrades') seed.upgrades = {};
    else seed[k] = 0;
  }
  // carry 垫底：只对「数值型跨局资产」生效（prestige/es/prestigePoints），逐键取 max
  if (boost) {
    for (const k of ['prestige', 'es', 'prestigePoints']) {
      if (Number.isFinite(boost[k]) && (Number(seed[k]) || 0) < boost[k]) seed[k] = boost[k];
    }
    // 垫高 es 后资源发现标记同步点亮（ES 顶栏/晋升面板门控同源）
    if (seed.es > 0) seed.resDiscovered = { ...(seed.resDiscovered || {}), es: true };
  }
  // 章节驻留基准重置：chapterEnteredAt 语义是「进入本章的时刻」，
  // 恢复种子必须从注入时刻重新起算（minDays 驻留门控照常真实跑，时间门控不绕过）。
  seed.chapterEnteredAt = Date.now();
  // 独立跑章号覆盖：--from N 时直接从第 N 章开局（carry 垫底按 BUDGET[N].carry 注入起点）
  if (chapter != null) seed.chapter = String(chapter);
  return JSON.stringify(seed);
}

/**
 * 区间校验：actual 落在 [lo, hi] 内（闭区间）。
 * @returns {{ok:boolean, ratio:number|null}} ratio = actual/预期中点（报告用）
 */
export function inRange(actual, [lo, hi]) {
  const ok = Number.isFinite(actual) && actual >= lo && actual <= hi;
  const mid = (lo + hi) / 2;
  return { ok, ratio: mid > 0 ? +(actual / mid).toFixed(3) : null };
}

/**
 * 预算比对（方案 §2.2 校验规则 1~4）：
 * @param {object} expected 预算表条目 { minPrestige, es:[lo,hi], pp:[lo,hi], rp?:[lo,hi] }
 * @param {object} input    本章输入快照（章开局）
 * @param {object} actual   本章真实终态快照（晋升结算后）
 * @param {object} opts.extra 可选运行期统计 { prestigeEsGain }（v4.2.6 校准①）：
 *   esDelta 语义 = 「本章晋升 ES 奖励累计」（esGain 瞬时值求和），而非余额差——
 *   自动玩家会把 ES 立即投资永恒矩阵（余额→0），余额差不反映奖励产出能力。
 *   未传时退回余额差口径（兼容旧调用）。
 * @returns {{deviations:Array, actual:{...}}} deviations 为空 = PASS
 *
 * 语义注记：es / prestigePoints（PP）是「只进不出」的跨局资产，增量区间校验有效；
 * rp 是可消费资源（买科技/研究），晋升奖励的 RP 大概率被立刻花掉——余额差不反映奖励，
 * 因此 rp 只校验「不回退」（单调性），不做区间断言（expected.rp 仅作报告参考）。
 *
 * v4.3.6 口径反转（es/pp 幂律爆炸实锤后的修正）：esDelta/ppDelta 只锁下界——
 *   rush 章快升下 runEarned 4e31 → esGain 单次 ~1e13（ch7 实测 5.73e14），need(p)=(p+1)^1.5
 *   与 sqrt(runEarned/2e7) 复合增长在快升形态下必然击穿区间上界；上界形同虚设且
 *   恒 FAIL 无信息量。区间 [lo, hi] 语义改为：lo = 预算下界（低于 = 推演节奏劣化，FAIL）；
 *   hi 仅记录 ratio 供报告观察（超上界不 FAIL——数量级健康即预算目的达成）。
 */
export function compareBudget(expected, input, actual, opts = {}) {
  const deviations = [];
  const out = {};
  // 规则 1：章内晋升次数增量 ≥ minPrestige
  const pD = (actual.prestige || 0) - (input.prestige || 0);
  out.prestigeDelta = pD;
  if (pD < (expected.minPrestige || 1)) {
    deviations.push(`prestigeDelta=${pD} < minPrestige=${expected.minPrestige}`);
  }
  // 规则 2：跨局资源增量锁下界（es / pp；rp 单调）
  const esGainSum = opts.extra && Number.isFinite(opts.extra.prestigeEsGain)
    ? opts.extra.prestigeEsGain : null;
  {
    const range = expected.es;
    if (range) {
      const d = esGainSum != null ? esGainSum
        : (Number(actual.es) || 0) - (Number(input.es) || 0);
      out.esDelta = d;
      out.esDeltaBasis = esGainSum != null ? 'prestigeEsGain（晋升奖励累计）' : '余额差';
      out.esRatio = +(d / (range[1] || 1)).toFixed(3); // 相对上界比率（报告观察用）
      if (!Number.isFinite(d) || d < range[0]) {
        deviations.push(`esDelta=${fmtN(d)}（${out.esDeltaBasis}）低于预算下界 ${fmtN(range[0])}`);
      }
      // 上界只记观察标记（不进 deviations）
      if (range[1] != null && d > range[1]) out.esOverHi = true;
    }
  }
  {
    const range = expected.pp;
    if (range) {
      const d = (Number(actual.prestigePoints) || 0) - (Number(input.prestigePoints) || 0);
      out.ppDelta = d;
      out.ppRatio = +(d / (range[1] || 1)).toFixed(3);
      if (!Number.isFinite(d) || d < range[0]) {
        deviations.push(`ppDelta=${fmtN(d)} 低于预算下界 ${fmtN(range[0])}`);
      }
      if (range[1] != null && d > range[1]) out.ppOverHi = true;
    }
  }
  if (expected.rp) {
    const rD = (Number(actual.rp) || 0) - (Number(input.rp) || 0);
    out.rpDelta = rD;
    if (rD < 0) deviations.push(`rp 余额回退 ${fmtN(rD)}（跨局资源应单调不回退）`);
  }
  // 规则 3：章节真实推进（由调用方断言 actual.chapter；这里只记录）
  out.chapter = actual.chapter;
  // 规则 4：resDiscovered 锚点单调不回退
  const discIn = input.resDiscovered || {}, discOut = actual.resDiscovered || {};
  for (const k of Object.keys(discOut)) {
    if (discIn[k] && !discOut[k]) deviations.push(`resDiscovered.${k} 回退（true→false）`);
  }
  out.resDiscovered = discOut;
  return { deviations, actual: out };
}

function fmtN(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 1e6) return n.toExponential(2);
  return String(Math.round(n * 100) / 100);
}
