// v3.11.0 核心玩法抽象（自动化动作层）：AI 自动化动作的「声明单一真源」。
//
// 背景：v3.10.5 把 AI 助手改为一次性消耗品后，「某动作是否消耗助手」仍是动作元数据，
//   却完全散落在 src/modules/ai.js 的 tickAI() 里：3 个分支各写一对「守卫 + 实扣 + 日志」，
//   另外 2 个分支靠「没写」隐式表达不消耗；开关总闸、一键全关、面板开关文案、面板分组横幅
//   又各抄一份开关集合，结果出现「一键全关漏 autoTech」「横幅把不消耗助手的进阶动作也框进去」
//   两处真实不一致。新增一个动作至少需人肉改 5 处。
//
// 本模块把动作收敛为纯数据声明 + 纯求值函数（零 import、零 DOM、零副作用，可直接 Node 单测）：
//   - AI_ACTIONS 是「id ↔ 开关 key ↔ 分组 ↔ 助手单价」的唯一真源；
//   - AI_ACTION_IDS / AI_ASSISTANT_CONSUMER_IDS / ALL_OFF_SWITCH_KEYS 是派生清单，
//     供双向审计测试锁死「声明 → 消费」接线（与 panelKeys / achievementRegistry 同范式）；
//   - tickAI 只按 id 分派执行器，助手的守卫 / 扣费 / 台账 / 日志后缀由注册表统一驱动。
//
// 接线纪律（由 tests/v3110-ai-registry.test.mjs 静态审计锁死）：
//   - 新增动作只需在 AI_ACTIONS 加一行，并把执行器接进 ai.js 的 EXECUTORS 表；
//   - 助手单价为 0 时也必须显式声明（禁止再靠「没写」隐式表达）；
//   - 一键全关 / 开关总闸 / 面板渲染一律消费本模块派生清单，禁止内联开关集合。

export const AI_ACTION_GROUPS = Object.freeze([
  Object.freeze({
    key: 'basic',
    name: '基础自动化',
    hint: '需消耗 AI 助手',
    note: '研究「AI 管理核心」即可开启',
  }),
  Object.freeze({
    key: 'advanced',
    name: '进阶自动化',
    // v3.11.0 反馈：原 hint/note 在窄卡末行掉单字（getClientRects 实测 12px 孤字）。
    // 面板只陈述自身口径；具体解锁入口写在各自的商店/科技卡里，不在此拼一行。
    hint: '同样消耗 AI 助手',
    note: '两项动作需分别解锁',
  }),
]);

export const AI_ACTION_GROUP_KEYS = Object.freeze(AI_ACTION_GROUPS.map(g => g.key));

// desc 直接作为开关 title 文案；节拍写「每决策周期」而非「每 5s」——
// 实际间隔会被拟态矩阵 / 混沌触须缩短，旧文案「每 5s」与读侧不符（UI 准确性修复）。
export const AI_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'upgrade', switchKey: 'autoUpgrade', name: '自动升级', group: 'basic',
    assistantCost: 1, cadence: 'decision',
    desc: '每决策周期购买回本时间最短的产出项（成本 ÷ 边际 CPS，含全局乘数）；EP 低于预留线时暂停；每执行一次消耗 1 名 AI 助手',
  }),
  Object.freeze({
    id: 'hire', switchKey: 'autoHire', name: '自动招募', group: 'basic',
    assistantCost: 1, cadence: 'decision',
    desc: '线程净产出为正且 EP ≥ 2×招募成本时自动招募；净产出为负自动停止；每执行一次消耗 1 名 AI 助手',
  }),
  Object.freeze({
    id: 'claim', switchKey: 'autoClaim', name: '自动领取', group: 'basic',
    assistantCost: 1, cadence: 'decision', maxPerCycle: Infinity,
    desc: '任务完成进入待领取状态立即自动领取；每领取一个任务消耗 1 名 AI 助手',
  }),
  Object.freeze({
    id: 'build', switchKey: 'autoBuild', name: '自动购建', group: 'advanced',
    assistantCost: 1, cadence: 'custom',
    desc: '按购买间隔购买已解锁建筑（EP 成本最低优先，不低于预留线）；每购建一栋消耗 1 名 AI 助手',
  }),
  Object.freeze({
    id: 'tech', switchKey: 'autoTech', name: '自动研究', group: 'advanced',
    assistantCost: 1, cadence: 'decision',
    desc: '每决策周期自动购买最便宜的已解锁科技（RP 消耗，至多 1 个/周期）；每执行一次消耗 1 名 AI 助手',
  }),
]);

export const AI_ACTION_IDS = Object.freeze(AI_ACTIONS.map(a => a.id));
export const AI_ACTION_SWITCH_KEYS = Object.freeze(AI_ACTIONS.map(a => a.switchKey));

// 消耗助手的动作清单：UI 提示、日志、停摆告警、30 天推演断言都从这里派生。
export const AI_ASSISTANT_CONSUMER_IDS = Object.freeze(
  AI_ACTIONS.filter(a => a.assistantCost > 0).map(a => a.id),
);

// 一键全关 / 开关总闸的唯一来源（v3.10.5 漏 autoTech 的真因就是手写集合）。
export const ALL_OFF_SWITCH_KEYS = Object.freeze(AI_ACTIONS.map(a => a.switchKey));

const BY_ID = new Map(AI_ACTIONS.map(a => [a.id, a]));

export function actionById(id) { return BY_ID.get(id) || null; }
export function groupByKey(key) { return AI_ACTION_GROUPS.find(g => g.key === key) || null; }
export function actionsByGroup(key) { return AI_ACTIONS.filter(a => a.group === key); }
export function assistantCostOf(id) {
  const a = actionById(id);
  return a ? a.assistantCost : 0;
}
export function enabledActions(ai) {
  if (!ai) return [];
  return AI_ACTIONS.filter(a => !!ai[a.switchKey]);
}
export function isAnyActionEnabled(ai) {
  return enabledActions(ai).length > 0;
}

// 当前开启的动作在一个决策周期内「理论上最多」会消耗多少名助手。
// 供面板提示与停摆预估使用；maxPerCycle 缺省按 1 次计。
export function maxCycleAssistantDemand(ai) {
  return enabledActions(ai).reduce((n, a) =>
    n + a.assistantCost * (Number.isFinite(a.maxPerCycle) ? a.maxPerCycle : 1), 0);
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
