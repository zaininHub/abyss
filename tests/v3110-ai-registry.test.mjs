// v3.11.0 专项单测：自动化动作声明层 + 「自动升级/领取/招募消耗 AI 助手」+ 续航补给
//
// 覆盖：
//   [A] 注册表双向审计（声明 ↔ tickAI 执行器 / 一键全关 / 面板渲染）
//   [B] 五项动作的助手消耗矩阵、预算上限、台账、静默停摆修复
//   [C] 产品真实入口（购买助手 / 切开关 / 一键全关）与旧档兼容
//   [D] 助手自动补给流（解锁门控 / 周期 / 上限 / 研究加成 / 清单接线）
//   [E] 状态清单与存档版本（不 bump SAVE_VERSION）
//   [F] 用户明确需求：三项基础动作每次消耗 1 名助手，进阶两项同样消耗
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Node 环境无 localStorage，save() 需要 → 注入最小桩
globalThis.localStorage = {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};

const srcRoot = join(process.cwd(), 'src');
const read = (p) => readFileSync(join(srcRoot, p), 'utf8');
const AI_SRC = read('modules/ai.js');
const REG_SRC = read('core/aiActionRegistry.js');
const MAIN_SRC = read('main.js');
const BAL_SRC = read('data/balance.js');

const { S } = await import('../src/state.js');
const { defaultState, SAVE_VERSION } = await import('../src/state.js');
const REG = await import('../src/core/aiActionRegistry.js');
const AI = await import('../src/modules/ai.js');
const ECON = await import('../src/modules/economy.js');
const { BALANCE } = await import('../src/data/balance.js');
const { V21_BUILDINGS } = await import('../src/data/buildings.js');
const FLOW = await import('../src/core/flowEngine.js');
const { RESOURCE_FLOW_IDS } = await import('../src/systems/resourceFlows.js');
const { NESTED_DEFAULT_KEYS } = await import('../src/core/stateSchema.js');

const logs = [];
AI.setAiLogFn((m, cls) => logs.push({ m, cls }));

// 每例前把状态恢复到确定值（S 是单例，避免用例互相污染）
function reset(over = {}) {
  Object.assign(S, {
    tech: { ai_core: true, auto_tech: true },
    ep: 1e12, rp: 1e9, es: 0, dm: 0, pt: 0, faith: 0,
    allTimeEp: 1e12, upgrades: {}, buildings: {}, milesDone: {}, rpTheories: {},
    cultists: [{ id: 1, name: '夹具线程', output: 10, mood: '正常', moodTimer: 60,
      level: 1, xp: 0, leader: false, boundTo: null }],
    projects: [], unlockedBuildings: {}, corruption: 0,
    delve: { up: {} }, relics: {}, policies: {},
  });
  const firstBld = V21_BUILDINGS.find(b => b.via !== 'upgrade');
  if (firstBld) S.unlockedBuildings[firstBld.id] = true;
  Object.assign(S.ai, {
    autoUpgrade: false, autoHire: false, autoClaim: false,
    autoBuild: false, autoTech: false,
    autoBuildUnlocked: true, autoBuildRate: 10, autoBuildTimer: 0,
    reserve: 0.1, timer: 0, assistants: 0, supplyTimer: 0,
    actionCounts: {}, _stallWarnAt: 0,
  }, over);
  logs.length = 0;
}

// ============================================================
console.log('[A] 自动化动作注册表：声明 → 消费 双向审计');
// ============================================================

test('A1 注册表结构完整：id / 开关 / 分组唯一且互相对应', () => {
  const ids = REG.AI_ACTION_IDS;
  assert.equal(ids.length, 5, '五项自动化动作');
  assert.equal(new Set(ids).size, ids.length, 'id 不重复');
  assert.equal(new Set(REG.AI_ACTION_SWITCH_KEYS).size, ids.length, 'switchKey 不重复');
  for (const a of REG.AI_ACTIONS) {
    assert.ok(a.id && a.switchKey && a.name && a.desc, `${a.id} 字段完整`);
    assert.ok(REG.AI_ACTION_GROUP_KEYS.includes(a.group), `${a.id} 分组已声明`);
    assert.equal(typeof a.assistantCost, 'number', `${a.id} 助手单价必须显式声明（禁止靠「没写」隐式表达）`);
    assert.ok(Number.isFinite(a.assistantCost) && a.assistantCost >= 0);
    assert.equal(REG.actionById(a.id), a);
    assert.equal(REG.assistantCostOf(a.id), a.assistantCost);
  }
  assert.equal(REG.actionById('__ghost__'), null);
  assert.equal(REG.assistantCostOf('__ghost__'), 0);
});

test('A2 AI_ASSISTANT_CONSUMER_IDS ↔ assistantCost>0 严格对齐', () => {
  const derived = REG.AI_ACTIONS.filter(a => a.assistantCost > 0).map(a => a.id);
  assert.deepEqual([...REG.AI_ASSISTANT_CONSUMER_IDS], derived);
  assert.equal(REG.AI_ASSISTANT_CONSUMER_IDS.length, 5, '五项动作全部消耗助手');
});

test('A3 ALL_OFF_SWITCH_KEYS 覆盖全部开关（含 autoTech，修 v3.10.5 漏项）', () => {
  assert.deepEqual([...REG.ALL_OFF_SWITCH_KEYS], [...REG.AI_ACTION_SWITCH_KEYS]);
  assert.ok(REG.ALL_OFF_SWITCH_KEYS.includes('autoTech'), '一键全关必须包含自动研究');
  for (const k of ['autoUpgrade', 'autoHire', 'autoClaim', 'autoBuild', 'autoTech']) {
    assert.ok(REG.ALL_OFF_SWITCH_KEYS.includes(k), `缺 ${k}`);
  }
});

test('A4 双向审计：注册表 id ↔ ai.js EXECUTORS 执行器一一对应', () => {
  const execKeys = [...AI_SRC.matchAll(/^  (\w+)\(ctx, budget\) \{/gm)].map(m => m[1]);
  assert.deepEqual(execKeys.sort(), [...REG.AI_ACTION_IDS].sort(),
    '每个声明动作都要有执行器，且不得有孤儿执行器');
  // tickAI 必须遍历注册表，而不是手写 5 个 if 分支
  assert.match(AI_SRC, /for \(const a of AI_ACTIONS\)/, 'tickAI 应由注册表驱动');
  assert.ok(!/if \(ai\.autoUpgrade\) \{/.test(AI_SRC), '不得再出现分支级硬编码开关');
});

test('A5 防回归：助手守卫/扣费/一键全关只有单一实现', () => {
  const calls = [...AI_SRC.matchAll(/consumeAssistants\(/g)].length;
  assert.equal(calls, 2, '只有定义处 + tickAI 统一调用处');
  assert.ok(!/\bconsumeAssistant\(\)/.test(AI_SRC), '不得再有旧的单数扣费分支');
  assert.ok(!/S\.ai\.autoUpgrade = false; S\.ai\.autoHire = false/.test(AI_SRC),
    '一键全关不得再内联手写开关集合');
  assert.match(AI_SRC, /allOffActions\(\);/, 'UI 点击消费产品入口');
  assert.match(MAIN_SRC, /AI_ASSISTANT_CONSUMER_IDS/, 'QA 钩子暴露消耗者清单');
});

test('A6 面板分组与开关文案消费注册表，不再内联硬编码', () => {
  assert.match(AI_SRC, /data-ai-group="\$\{g\.key\}"/, '分组横幅由注册表渲染');
  assert.match(AI_SRC, /actionsByGroup\('basic'\)/, '基础开关列表由注册表派生');
  assert.match(AI_SRC, /sw\(a\.switchKey, a\.name, a\.desc\)/, '开关文案取注册表 desc');
  assert.ok(!AI_SRC.includes('每 5s 购买回本时间最短'),
    '旧「每 5s」文案已被会被 matrix/tentacle 缩短的「每决策周期」取代');
  assert.match(REG_SRC, /每决策周期/, '注册表文案口径准确');
});

// ============================================================
console.log('[B] 助手消耗矩阵 / 预算 / 台账 / 停摆告警');
// ============================================================

test('B1 自动升级：执行一次消耗 1 名助手，台账 +1，日志带消耗后缀', () => {
  reset({ autoUpgrade: true, assistants: 5 });
  assert.equal(AI.tickAI(5), true);
  assert.equal(AI.assistantCount(), 4);
  assert.equal(AI.actionCounts().upgrade, 1);
  assert.equal(AI.totalActionCount(AI.actionCounts()), 1);
  assert.ok(logs.some(l => l.m.includes('消耗 1 名助手')), '日志明确写出消耗');
});

test('B2 自动领取：每个 pending 任务各消耗 1 名（用户明确需求）', () => {
  reset({ autoClaim: true, assistants: 5 });
  // reset() 会清空 projects，夹具必须在 reset 之后注入
  S.projects = [
    { status: 'pending', name: '任务甲', reward: { kind: 'ep', amount: 1 } },
    { status: 'pending', name: '任务乙', reward: { kind: 'ep', amount: 1 } },
    { status: 'active', name: '未达标', reward: { kind: 'ep', amount: 1 } },
  ];
  assert.equal(AI.tickAI(5), true);
  assert.equal(AI.assistantCount(), 3, '两个 pending 各扣 1 名');
  assert.equal(AI.actionCounts().claim, 2);
  assert.equal(S.projects.filter(p => p.status === 'claimed').length, 2, 'active 任务不领');
});

test('B3 预算上限：只有 1 名助手时 2 个 pending 只领 1 个，不透支', () => {
  reset({ autoClaim: true, assistants: 1 });
  S.projects = [
    { status: 'pending', name: '任务甲', reward: { kind: 'ep', amount: 1 } },
    { status: 'pending', name: '任务乙', reward: { kind: 'ep', amount: 1 } },
  ];
  AI.tickAI(5);
  assert.equal(AI.assistantCount(), 0);
  assert.equal(AI.actionCounts().claim, 1);
  assert.equal(S.projects.filter(p => p.status === 'claimed').length, 1);
});

test('B4 自动招募：执行一次消耗 1 名助手、台账 +1', () => {
  reset({ autoHire: true, assistants: 5 });
  const before = S.cultists.length;
  assert.equal(AI.tickAI(5), true);
  assert.equal(S.cultists.length, before + 1);
  assert.equal(AI.assistantCount(), 4);
  assert.equal(AI.actionCounts().hire, 1);
});

test('B5 自动研究 / 自动购建（进阶动作）同样消耗助手', () => {
  reset({ autoTech: true, assistants: 5 });
  assert.equal(AI.tickAI(5), true, '自动研究应买到 offline1');
  assert.equal(AI.assistantCount(), 4);
  assert.equal(AI.actionCounts().tech, 1);

  reset({ autoBuild: true, assistants: 5 });
  assert.equal(AI.tickAI(60), true, '自动购建应买到已解锁建筑');
  assert.equal(AI.assistantCount(), 4);
  assert.equal(AI.actionCounts().build, 1);
});

test('B6 助手耗尽：无动作、无扣费、台账不增，且有明确告警（修静默停摆）', () => {
  reset({ autoUpgrade: true, autoClaim: true, assistants: 0 });
  assert.equal(AI.tickAI(5), false);
  assert.equal(AI.assistantCount(), 0);
  assert.equal(AI.totalActionCount(AI.actionCounts()), 0);
  assert.ok(logs.some(l => l.m.includes('助手耗尽') && l.m.includes('自动升级')), '告警列出停摆动作');
  assert.equal(AI.stalledActions().length, 2);
});

test('B7 告警节流：60s 内不重复刷屏', () => {
  reset({ autoUpgrade: true, assistants: 0 });
  AI.tickAI(5);
  const n = logs.filter(l => l.m.includes('助手耗尽')).length;
  AI.tickAI(5);
  assert.equal(logs.filter(l => l.m.includes('助手耗尽')).length, n, '节流生效');
});

test('B8 开关全关不消耗助手；只开一个动作时其余台账保持 0', () => {
  reset({ assistants: 9 });
  assert.equal(AI.tickAI(5), false);
  assert.equal(AI.assistantCount(), 9);
  reset({ autoUpgrade: true, assistants: 9 });
  AI.tickAI(5);
  const c = AI.actionCounts();
  assert.equal(c.upgrade, 1);
  for (const id of ['hire', 'claim', 'build', 'tech']) assert.equal(c[id], 0);
});

test('B9 混沌心智旁路不消耗助手（明确的边界口径）', () => {
  reset({ autoUpgrade: true, assistants: 5 });
  S.tech.chaos_mind = true;
  AI.tickAI(60);
  assert.equal(AI.assistantCount(), 5, '接管期间助手冻结不消耗');
  assert.equal(AI.totalActionCount(AI.actionCounts()), 0);
  S.tech.chaos_mind = false;
});

test('B10 maxCycleAssistantDemand 随开启动作数线性变化', () => {
  assert.equal(REG.maxCycleAssistantDemand({ autoUpgrade: true }), 1);
  assert.equal(REG.maxCycleAssistantDemand({ autoUpgrade: true, autoClaim: true }), 2);
  assert.equal(REG.maxCycleAssistantDemand({}), 0);
  assert.equal(REG.maxCycleAssistantDemand(null), 0);
});

// ============================================================
console.log('[C] 产品真实入口 / 定价 / 旧档兼容');
// ============================================================

test('C1 buyAssistant：扣 EP + 助手 +1；EP 不足返回 ok:false', () => {
  reset({ assistants: 3 });
  const ep0 = S.ep;
  const r = AI.buyAssistant();
  assert.equal(r.ok, true);
  assert.equal(AI.assistantCount(), 4);
  assert.ok(S.ep < ep0);
  S.ep = 0;
  const r2 = AI.buyAssistant();
  assert.equal(r2.ok, false);
  assert.equal(AI.assistantCount(), 4);
});

test('C2 setAiSwitch 只认注册表开关；非法 key 拒绝', () => {
  reset();
  assert.equal(AI.setAiSwitch('autoUpgrade', true), true);
  assert.equal(S.ai.autoUpgrade, true);
  assert.equal(AI.setAiSwitch('__hack__', true), false);
  assert.equal(S.ai.__hack__, undefined);
});

test('C3 allOffActions 关闭全部 5 个开关（一键全关不再漏 autoTech）', () => {
  reset({ autoUpgrade: true, autoHire: true, autoClaim: true, autoBuild: true, autoTech: true });
  AI.allOffActions();
  for (const k of REG.ALL_OFF_SWITCH_KEYS) assert.equal(S.ai[k], false, `${k} 应关闭`);
  assert.equal(REG.isAnyActionEnabled(S.ai), false);
});

test('C4 助手定价温和递增、无数量上限', () => {
  const cfg = BALANCE.ai.assistants;
  assert.equal(cfg.costGrowth, 1.12, 'v3.10.5 的 ×1.5 复利已放缓');
  reset({ assistants: 0 });
  const c0 = AI.assistantCost();
  S.ai.assistants = 40;
  const c40 = AI.assistantCost();
  assert.ok(c40 > c0 && c40 < c0 * 1e5, '递增但不会指数爆炸到不可购买');
  assert.equal(AI.assistantCount(), 40, '购买数量不受 8 槽上限约束');
});

test('C5 旧档无 actionCounts 时惰性建槽，不产生 undefined/NaN', () => {
  reset();
  delete S.ai.actionCounts;
  AI.recordAction('upgrade', 2);
  const c = AI.actionCounts();
  assert.equal(c.upgrade, 2);
  for (const id of REG.AI_ACTION_IDS) assert.ok(Number.isFinite(c[id]), `${id} 计数有限`);
  assert.equal(AI.totalActionCount(c), 2);
  assert.equal(AI.recordAction('__ghost__', 1), undefined);
});

test('C6 actionCounts / totalActionCount / emptyActionCounts 五槽齐全', () => {
  const empty = REG.emptyActionCounts();
  assert.deepEqual(Object.keys(empty).sort(), [...REG.AI_ACTION_IDS].sort());
  assert.equal(REG.totalActionCount(null), 0);
  assert.equal(REG.totalActionCount(empty), 0);
});

// ============================================================
console.log('[D] 助手自动补给流');
// ============================================================

function runAux(dt) {
  FLOW.runFlows({ S, dt, now: Date.now() }, FLOW.FLOW_PHASES.EP_AUX);
}

test('D1 未解锁 ai_core 不补给', () => {
  reset({ assistants: 0, supplyTimer: 0 });
  S.tech.ai_core = false;
  runAux(60);
  assert.equal(AI.assistantCount(), 0);
  S.tech.ai_core = true;
});

test('D2 每 intervalSec 补 perTick 名，且提前调用不提前发放', () => {
  reset({ assistants: 0, supplyTimer: 0 });
  const cfg = BALANCE.ai.assistants.supply;
  runAux(cfg.intervalSec - 1);
  assert.equal(AI.assistantCount(), 0, '未到周期不发放');
  runAux(1);
  assert.equal(AI.assistantCount(), cfg.perTick);
  runAux(cfg.intervalSec);
  assert.equal(AI.assistantCount(), cfg.perTick * 2);
});

test('D3 自动补给受 cap 限制，但手动购买超过 cap 不被钳回', () => {
  reset({ assistants: 0, supplyTimer: 0 });
  const cfg = BALANCE.ai.assistants.supply;
  S.ai.assistants = cfg.cap - 1;
  runAux(cfg.intervalSec);
  assert.equal(AI.assistantCount(), cfg.cap, '补给只补到 cap');
  S.ai.assistants = cfg.cap + 50;
  runAux(cfg.intervalSec);
  assert.equal(AI.assistantCount(), cfg.cap + 50, '手动购买无上限，补给不钳余额');
});

test('D4 「拟我协议」researchMult(ai) 放大补给量（非死键）', () => {
  reset({ assistants: 0, supplyTimer: 0 });
  S.rpTheories = { rp_ai: 5 }; // rpTheories 在 S 上，不在 S.ai 内
  const cfg = BALANCE.ai.assistants.supply;
  const expect = Math.max(1, Math.floor(cfg.perTick * ECON.researchMult(cfg.researchKey)));
  assert.ok(ECON.researchMult('ai') > 1);
  runAux(cfg.intervalSec);
  assert.equal(AI.assistantCount(), expect);
  assert.ok(expect > cfg.perTick, '研究等级确实提升补给');
});

test('D5 RESOURCE_FLOW_IDS ↔ allFlows 双向对齐，补给流在 EP_AUX', () => {
  assert.ok(RESOURCE_FLOW_IDS.includes('assistant:supply'));
  assert.equal(RESOURCE_FLOW_IDS.length, 9);
  const all = FLOW.allFlows();
  assert.equal(all.length, RESOURCE_FLOW_IDS.length);
  const f = all.find(x => x.id === 'assistant:supply');
  assert.ok(f, '流已注册');
  assert.equal(f.phase, FLOW.FLOW_PHASES.EP_AUX);
  for (const id of RESOURCE_FLOW_IDS) assert.ok(all.some(x => x.id === id), `缺流 ${id}`);
  assert.match(BAL_SRC, /supply: \{/, '补给参数在 balance 单一真源');
});

// ============================================================
console.log('[E] 状态清单 / 存档版本');
// ============================================================

test('E1 defaultState().ai 补齐三个新字段，嵌套清单含 ai', () => {
  const def = defaultState();
  for (const k of ['supplyTimer', 'actionCounts', '_stallWarnAt', 'assistants']) {
    assert.ok(Object.prototype.hasOwnProperty.call(def.ai, k), `缺默认字段 ${k}`);
  }
  assert.ok(NESTED_DEFAULT_KEYS.includes('ai'), '旧档由嵌套补齐清单兜底');
});

test('E2 SAVE_VERSION 保持 6（仅新增字段，无存档结构变更）', () => {
  assert.equal(SAVE_VERSION, 6);
});

test('E3 面板源码：停摆提示与台账 DOM 均由读侧派生，无 undefined 风险', () => {
  assert.match(AI_SRC, /data-ai-stall/, '助手耗尽提示存在');
  assert.match(AI_SRC, /data-ai-ledger/, '本局动作台账存在');
  assert.match(AI_SRC, /stalledActions\(\)/, '停摆提示由派生谓词驱动');
  assert.match(AI_SRC, /actionCounts\(\)/, '台账读侧容错');
  assert.match(AI_SRC, /supply\.intervalSec/, '补给说明读配置而非硬编码');
});

// ============================================================
console.log('[F] 用户明确需求');
// ============================================================

test('F1 自动升级 / 自动招募 / 自动领取：每执行一次消耗 1 名助手', () => {
  for (const id of ['upgrade', 'hire', 'claim']) {
    assert.equal(REG.assistantCostOf(id), 1, `${id} 助手单价必须为 1`);
  }
  // 三项基础动作同属 basic 分组
  for (const id of ['upgrade', 'hire', 'claim']) {
    assert.equal(REG.actionById(id).group, 'basic');
  }
});

test('F2 进阶动作（自动购建 / 自动研究）同样消耗助手，口径统一', () => {
  for (const id of ['build', 'tech']) {
    assert.equal(REG.assistantCostOf(id), 1, `${id} 也应消耗 1 名助手`);
    assert.equal(REG.actionById(id).group, 'advanced');
  }
});

test('F3 五项动作在一次决策周期内各自最多消耗 1 名（claim 按任务数）', () => {
  reset({ autoUpgrade: true, autoHire: true, autoTech: true, assistants: 30 });
  AI.tickAI(5);
  const c = AI.actionCounts();
  assert.ok(c.upgrade <= 1 && c.hire <= 1 && c.tech <= 1);
  assert.equal(AI.assistantCount(), 30 - AI.totalActionCount(c), '扣费与台账严格守恒');
});
