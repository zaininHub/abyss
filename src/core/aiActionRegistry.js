// v3.11.2 核心玩法抽象（自动化动作层）：AI 自动化动作的「声明单一真源」。
//
// 模型反转（v3.11.2）：v3.10.5 把 AI 助手改成一次性消耗品（每次动作烧 1 名 + 自动补给流回血），
// v3.11.0 把动作元数据下沉到这里。v3.11.2 收到反馈「AI 助手不是每执行一次消耗一个，而是负责自动化、
// 类似班组」——于是把模型反转为「常驻班组」：
//   - AI 助手是自动化工人池（保留购买、价格递增限购），不再是燃料；
//   - 每个决策周期，助手自动分配到所有开启的动作岗位（类似线程绑定到转化器岗位）；
//   - 每个动作每周期执行次数 = 分配到该动作的工人数（越多越强，对应班组「线程越多产出越高」）；
//   - 助手数不足覆盖所有开启动作时，按优先级让部分动作挂起（编制不足）。
// 因此 assistantCost 语义从「每次消耗」改为 crewSize（每动作占编基准，常驻、不消耗）。
//
// 本模块仍是纯数据声明 + 纯求值函数（零 import、零 DOM、零副作用，可直接 Node 单测）。
//   - AI_ACTIONS 是「id ↔ 开关 key ↔ 分组 ↔ 占编基准」的唯一真源；
//   - AI_CREW_REQUIRED_IDS / ALL_OFF_SWITCH_KEYS 是派生清单，供双向审计测试锁死「声明 → 占编」接线。
//
// 接线纪律（tests/v3110-ai-registry.test.mjs 静态审计锁死）：
//   - 新增动作只需在 AI_ACTIONS 加一行，并把执行器接进 ai.js 的 EXECUTORS 表；
//   - 占编基准为 0 时也必须显式声明（禁止靠「没写」隐式表达）；
//   - 一键全关 / 开关总闸 / 面板渲染一律消费本模块派生清单，禁止内联开关集合。

export const AI_ACTION_GROUPS = Object.freeze([
  Object.freeze({
    key: 'basic',
    name: '基础自动化',
    hint: '需 AI 助手编制',
    note: '研究「AI 管理核心」即可开启',
  }),
  Object.freeze({
    key: 'advanced',
    name: '进阶自动化',
    // v3.11.0 反馈：原 hint/note 在窄卡末行掉单字（getClientRects 实测 12px 孤字）。
    // 面板只陈述自身口径；具体解锁入口写在各自的商店/科技卡里，不在此拼一行。
    hint: '同样需 AI 助手编制',
    note: '两项动作需分别解锁',
  }),
]);

export const AI_ACTION_GROUP_KEYS = Object.freeze(AI_ACTION_GROUPS.map(g => g.key));

// desc 直接作为开关 title 文案；节拍写「每决策周期」而非「每 5s」——
// 实际间隔会被拟态矩阵 / 混沌触须缩短，旧文案「每 5s」与读侧不符（UI 准确性修复）。
export const AI_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'upgrade', switchKey: 'autoUpgrade', name: '自动升级', group: 'basic',
    crewSize: 1, cadence: 'decision',
    desc: '每决策周期购买回本时间最短的产出项（成本 ÷ 边际 CPS，含全局乘数）；EP 低于预留线时暂停',
  }),
  Object.freeze({
    id: 'hire', switchKey: 'autoHire', name: '自动招募', group: 'basic',
    crewSize: 1, cadence: 'decision',
    desc: '线程净产出为正且 EP ≥ 2×招募成本时自动招募；净产出为负自动停止',
  }),
  Object.freeze({
    id: 'claim', switchKey: 'autoClaim', name: '自动领取', group: 'basic',
    crewSize: 1, cadence: 'decision', maxPerCycle: Infinity,
    desc: '任务完成进入待领取状态立即自动领取',
  }),
  Object.freeze({
    id: 'build', switchKey: 'autoBuild', name: '自动购建', group: 'advanced',
    crewSize: 1, cadence: 'custom',
    desc: '按购买间隔购买已解锁建筑（EP 成本最低优先，不低于预留线）',
  }),
  Object.freeze({
    id: 'tech', switchKey: 'autoTech', name: '自动研究', group: 'advanced',
    crewSize: 1, cadence: 'decision',
    desc: '每决策周期自动购买最便宜的已解锁科技（RP 消耗，至多 1 个/周期）',
  }),
]);

export const AI_ACTION_IDS = Object.freeze(AI_ACTIONS.map(a => a.id));
export const AI_ACTION_SWITCH_KEYS = Object.freeze(AI_ACTIONS.map(a => a.switchKey));

// 需要 AI 助手编制的动作清单（开放且可用的动作 → 需占编）；所有 5 项都需编制。
// UI 提示、面板、30 天推演断言都从这里派生。
export const AI_CREW_REQUIRED_IDS = Object.freeze(
  AI_ACTIONS.filter(a => a.crewSize > 0).map(a => a.id),
);

// 一键全关 / 开关总闸的唯一来源（v3.10.5 漏 autoTech 的真因就是手写集合）。
export const ALL_OFF_SWITCH_KEYS = Object.freeze(AI_ACTIONS.map(a => a.switchKey));

const BY_ID = new Map(AI_ACTIONS.map(a => [a.id, a]));

export function actionById(id) { return BY_ID.get(id) || null; }
export function groupByKey(key) { return AI_ACTION_GROUPS.find(g => g.key === key) || null; }
export function actionsByGroup(key) { return AI_ACTIONS.filter(a => a.group === key); }
export function crewSizeOf(id) {
  const a = actionById(id);
  return a ? a.crewSize : 0;
}
export function enabledActions(ai) {
  if (!ai) return [];
  return AI_ACTIONS.filter(a => !!ai[a.switchKey]);
}
export function isAnyActionEnabled(ai) {
  return enabledActions(ai).length > 0;
}

// 分组优先级（basic 先于 advanced）：人手不足时按此让低优先级动作挂起。
export function groupRankOf(id) {
  const a = actionById(id);
  return a && a.group === 'advanced' ? 1 : 0;
}

// 开启的动作至少各需 crewSize 名编制；返回「全开所需最少助手数」。
export function maxCycleCrewDemand(ai) {
  return enabledActions(ai).reduce((n, a) =>
    n + a.crewSize * (Number.isFinite(a.maxPerCycle) ? a.maxPerCycle : 1), 0);
}

// 台账默认值：每个动作一个计数槽，避免「新增动作忘了建槽」产生 undefined。
export function emptyActionCounts() {
  const out = {};
  for (const id of AI_ACTION_IDS) out[id] = 0;
  return out;
}

// 本局累计执行次数（读侧容错：旧档无台账时返回 0，不抛错）。
export function totalActionCount(counts) {
  if (!counts) return 0;
  return AI_ACTION_IDS.reduce((n, id) => n + (counts[id] || 0), 0);
}
