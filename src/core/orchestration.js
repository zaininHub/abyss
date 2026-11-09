// v3.8.0 新玩法「效能编排」——读侧单一真源。
// v3.9.0 扩充：第 5 条策略「值守编排」+「潮汐预案」（四相位自定义排班表）。
//
// 玩法：玩家为工作台选定一条编排策略，在四条资源管线之间做取舍（有增益必有代价），
//       也可开启「随潮汐排班」让策略随深渊潮汐相位自动轮转，把既有潮汐机制变成可经营的变量。
//       v3.9.0 起，完成更多任务后可逐相位改写排班表：涨潮/平潮/退潮/乱流各指定一条策略，
//       默认排班表与 v3.8.0 固定映射完全一致 —— 不改动即零数值漂移。
//
// 接线纪律（与项目「无死数据」红线一致）：
//   ep → economy.computeCps() 的标准乘区（保证 CPS 显示与真实入账同口径）
//   rp → 灵感工坊蒸馏流 / 升级卡 RP 产出（flowEngine 修饰器 key 'rp'）
//   pt → PT 孵化流（flowEngine 修饰器 key 'pt'）
//   dm → economy.vehicleRateMult() 的标准乘区
//   四个键都必须有真实消费点；新增键若没接线，单测 v380 会直接失败。
import { registerModifier } from './flowEngine.js';
import { resonanceMult } from './resonance.js'; // v3.10.0：相位共鸣与四条管线同乘区、同口径

export const ORCHESTRATION_KEYS = Object.freeze(['ep', 'rp', 'pt', 'dm']);
export const ORCHESTRATION_KEY_LABELS = Object.freeze({
  ep: 'EP 产出', rp: 'RP 蒸馏', pt: 'PT 孵化', dm: 'DM 采集',
});
export const TIDE_PHASE_NAMES = Object.freeze(['涨潮', '平潮', '退潮', '乱流']);

// effects 为「倍率」：1 表示不变。增益与代价成对，任何策略都存在明确的取舍。
export const ORCHESTRATION_MODES = Object.freeze([
  { id: 'balanced', name: '均衡编排', icon: '◈', short: '均衡',
    desc: '四条管线各按默认节奏运转，没有增益，也没有代价。',
    effects: { ep: 1, rp: 1, pt: 1, dm: 1 } },
  { id: 'output', name: '产能优先', icon: '▲', short: '产能',
    desc: '把算力压到基础产出上：EP 更旺，但蒸馏、孵化与探采都慢下来。',
    effects: { ep: 1.25, rp: 0.80, pt: 0.85, dm: 0.90 } },
  { id: 'research', name: '研究优先', icon: '◇', short: '研究',
    desc: '腾出带宽做推演：RP 蒸馏更快，代价是 EP 与孵化略微收窄。',
    effects: { ep: 0.92, rp: 1.40, pt: 0.92, dm: 1 } },
  { id: 'abyss', name: '深渊优先', icon: '◆', short: '深渊',
    desc: '把管线接到裂隙一侧：孵化与探采大幅提速，基础产出相应让位。',
    effects: { ep: 0.88, rp: 0.92, pt: 1.40, dm: 1.25 } },
  // v3.9.0 第 5 条（4→5，+25%）：面向长夜挂机的「守夜」取舍——基础产出略降，
  // 换取三条转化管线同时提速。与产能优先形成互补，专供自定义排班表填夜间相位。
  // v3.10.5 ⑥：转化提速由 18%/18%/20% 上调到 30%/30%/32%，代价 EP 0.94→0.90，让守夜策略更有竞争力。
  { id: 'vigil', name: '值守编排', icon: '☾', short: '值守',
    desc: '把算力留给值守与维护：基础产出略降，蒸馏、孵化与探采同步提速。',
    effects: { ep: 0.90, rp: 1.30, pt: 1.30, dm: 1.32 } },
  // v3.10.0 第 6 条（5→6，+20%）：面向「相位共鸣」的折中档——基础产出与蒸馏小幅提速，
  // 孵化与探采让位；专供只想守一个相位叠层的玩家，与产能优先/值守编排形成三角取舍。
  // v3.10.5 ⑥：EP/RP 由 1.10/1.12 上调到 1.15/1.20，代价 PT/DM 0.88/0.90→0.90/0.92，让它真能撑起「守相位叠层」玩法。
  { id: 'cascade', name: '潮汐级联', icon: '≋', short: '级联',
    desc: '把相位里攒下的算力接回主线：产出与蒸馏小幅提速，孵化、探采相应收窄。',
    effects: { ep: 1.15, rp: 1.20, pt: 0.90, dm: 0.92 } },
]);

const MODE_BY_ID = new Map(ORCHESTRATION_MODES.map(m => [m.id, m]));
export const DEFAULT_MODE = 'balanced';

// 潮汐相位 → 策略（与 balance.tide.phases 的 0 涨潮 / 1 平潮 / 2 退潮 / 3 乱流 对应）
// 同时是「默认排班表」：旧档无 schedule 字段、或未解锁预案时一律回落到此映射。
// v3.10.3：默认排班表改为覆盖全部 6 种策略中的 4 档，确保「值守编排(vigil)」与「潮汐级联(cascade)」
//   在随潮汐排班下也能被真实触发（旧默认只用 output/balanced/research/abyss，导致 vigil/cascade 永远用不到）。
//   玩家仍可在「潮汐预案」中自由改写四相位，把 abyss/balanced 配回去。
export const TIDE_ORCHESTRATION = Object.freeze(['output', 'vigil', 'research', 'cascade']);

// v3.9.0 数值配置：改写排班表的解锁门槛（两项满足其一）。
// 取「任务链已跑通」为可达口径：30 天 mock 推演中第 8 个任务在开局数小时内即达成。
export const SCHEDULE_UNLOCK = Object.freeze({ projectsDone: 8, prestige: 2 });

/** 解锁门槛：完成 3 个任务或首次晋升。旧档用已持久化字段判定，无迁移成本。 */
export function orchestrationUnlocked(S) {
  if (!S) return false;
  return (S.projectsDone || 0) >= 3 || (S.prestige || 0) >= 1;
}

/** v3.9.0：自定义排班表的解锁门槛（必须已开放编排，且积累更多任务/职级）。 */
export function scheduleUnlocked(S) {
  if (!orchestrationUnlocked(S)) return false;
  return (S.projectsDone || 0) >= SCHEDULE_UNLOCK.projectsDone
    || (S.prestige || 0) >= SCHEDULE_UNLOCK.prestige;
}

/** 规范化状态：旧档无 orchestration / 字段被污染时一律回落到安全值。 */
export function orchestrationState(S) {
  const raw = (S && S.orchestration) || {};
  const mode = MODE_BY_ID.has(raw.mode) ? raw.mode : DEFAULT_MODE;
  return { mode, autoTide: !!raw.autoTide };
}

/**
 * v3.9.0：读侧唯一入口 —— 四相位排班表。
 * 未解锁 / 旧档 / 非法存档 / 越界 id 一律回落到 v3.8.0 默认映射，绝不放大数值。
 */
export function orchestrationSchedule(S) {
  const raw = S && S.orchestration && Array.isArray(S.orchestration.schedule)
    ? S.orchestration.schedule : null;
  if (!scheduleUnlocked(S) || !raw) return [...TIDE_ORCHESTRATION];
  return TIDE_ORCHESTRATION.map((fallback, i) => (MODE_BY_ID.has(raw[i]) ? raw[i] : fallback));
}

/** 当前实际生效的策略（自动排班时由潮汐相位 + 排班表决定，手动选择被旁路但不丢失）。 */
export function effectiveModeId(S) {
  const st = orchestrationState(S);
  if (st.autoTide) {
    const phase = Number.isInteger(S && S.tidePhase) ? S.tidePhase : 0;
    return orchestrationSchedule(S)[((phase % 4) + 4) % 4] || DEFAULT_MODE;
  }
  return st.mode;
}
export function effectiveMode(S) { return MODE_BY_ID.get(effectiveModeId(S)) || MODE_BY_ID.get(DEFAULT_MODE); }

/** 数值读侧唯一入口：未解锁、未知键、非法存档一律返回 1（绝不放大数值）。 */
export function orchestrationMult(key, S) {
  if (!orchestrationUnlocked(S)) return 1;
  const m = effectiveMode(S);
  const v = m && m.effects ? m.effects[key] : undefined;
  const base = Number.isFinite(v) && v > 0 ? v : 1;
  // v3.10.0：相位共鸣与编排策略共用同一读侧入口，保证 CPS 显示 / 卡面倍率 / 真实入账同口径。
  // 共鸣默认关闭，resonanceMult 恒为 1 —— 既有存档零数值漂移。
  return base * resonanceMult(key, S);
}

/** 玩家操作入口：只允许合法 id；写入后由调用方置 dirty.orchestration。 */
export function setOrchestrationMode(S, id) {
  if (!S || !MODE_BY_ID.has(id)) return false;
  const raw = (S.orchestration && typeof S.orchestration === 'object') ? S.orchestration : {};
  S.orchestration = { ...raw, ...orchestrationState(S), mode: id };
  return true;
}
export function setOrchestrationAutoTide(S, on) {
  if (!S) return false;
  const raw = (S.orchestration && typeof S.orchestration === 'object') ? S.orchestration : {};
  S.orchestration = { ...raw, ...orchestrationState(S), autoTide: !!on };
  return true;
}
export function toggleOrchestrationAutoTide(S) {
  return setOrchestrationAutoTide(S, !orchestrationState(S).autoTide);
}

/**
 * v3.9.0：改写某一潮汐相位的排班策略。
 * 严格校验解锁 / 相位 / 策略 id；非法输入不写状态（防存档污染与越权放大）。
 */
export function setOrchestrationPhaseMode(S, phase, id) {
  if (!scheduleUnlocked(S) || !Number.isInteger(phase) || phase < 0 || phase > 3) return false;
  if (!MODE_BY_ID.has(id)) return false;
  const raw = (S.orchestration && typeof S.orchestration === 'object') ? S.orchestration : {};
  const next = orchestrationSchedule(S).slice();
  next[phase] = id;
  S.orchestration = { ...raw, ...orchestrationState(S), schedule: next };
  return true;
}

/** 恢复默认排班表（v3.8.0 固定映射），供玩家一键回退。 */
export function resetOrchestrationSchedule(S) {
  if (!scheduleUnlocked(S)) return false;
  const raw = (S.orchestration && typeof S.orchestration === 'object') ? S.orchestration : {};
  S.orchestration = { ...raw, ...orchestrationState(S), schedule: [...TIDE_ORCHESTRATION] };
  return true;
}

/** 排班表是否已偏离默认（面板决定要不要显示「恢复默认」按钮）。 */
export function scheduleCustomized(S) {
  const sched = orchestrationSchedule(S);
  return sched.some((id, i) => id !== TIDE_ORCHESTRATION[i]);
}

/** 面板用：当前生效策略的四条倍率（玩家可读，不暴露实现术语）。 */
export function orchestrationSummary(S) {
  const active = orchestrationUnlocked(S);
  return ORCHESTRATION_KEYS.map(key => ({
    key, label: ORCHESTRATION_KEY_LABELS[key],
    mult: active ? orchestrationMult(key, S) : 1,
  }));
}

// 声明式修饰器：只有 rp / pt 两类流走 flowEngine。
// ep 与 dm 走 economy.js 的标准乘区（见文件头接线纪律），此处不注册，避免出现无人消费的死修饰器。
for (const key of ['rp', 'pt']) {
  registerModifier(key, (mult, ctx) => mult * orchestrationMult(key, ctx && ctx.S));
}

export { MODE_BY_ID };
