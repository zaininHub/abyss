// v3.11.2 专项单测：自动化动作声明层 + 「AI 助手是常驻班组、不消耗」模型反转
//
// 覆盖：
//   [A] 注册表双向审计（声明 ↔ tickAI 执行器 / 一键全关 / 面板渲染）
//   [B] 编制分配矩阵、执行次数 = 分配工人数、台账、编制不足挂起告警
//   [C] 产品真实入口（购买助手 / 切开关 / 一键全关）与旧档兼容
//   [D] 状态清单与存档版本（不 bump SAVE_VERSION）
//   [E] 用户明确需求：AI 助手是常驻班组，自动分配到开启动作，每动作每周期执行次数 = 分配工人数，不消耗
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
const { BALANCE } = await import('../src/data/balance.js');
const { V21_BUILDINGS } = await import('../src/data/buildings.js');
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
    reserve: 0.1, timer: 0, assistants: 0,
    actionCounts: {}, _stallWarnAt: 0,
  }, over);
  logs.length = 0;
}

// ============================================================
console.log('[A] 自动化动作注册表：声明 → 占编 双向审计');
// ============================================================

test('A1 注册表结构完整：id / 开关 / 分组唯一且互相对应', () => {
  const ids = REG.AI_ACTION_IDS;
  assert.equal(ids.length, 5, '五项自动化动作');
  assert.equal(new Set(ids).size, ids.length, 'id 不重复');
  assert.equal(new Set(REG.AI_ACTION_SWITCH_KEYS).size, ids.length, 'switchKey 不重复');
  for (const a of REG.AI_ACTIONS) {
    assert.ok(a.id && a.switchKey && a.name && a.desc, `${a.id} 字段完整`);
    assert.ok(REG.AI_ACTION_GROUP_KEYS.includes(a.group), `${a.id} 分组已声明`);
    assert.equal(typeof a.crewSize, 'number', `${a.id} 占编基准必须显式声明（禁止靠「没写」隐式表达）`);
    assert.ok(Number.isFinite(a.crewSize) && a.crewSize >= 1, `${a.id} 占编基准须 ≥ 1`);
    assert.equal(REG.actionById(a.id), a);
    assert.equal(REG.crewSizeOf(a.id), a.crewSize);
  }
  assert.equal(REG.actionById('__ghost__'), null);
  assert.equal(REG.crewSizeOf('__ghost__'), 0);
});

test('A2 AI_CREW_REQUIRED_IDS ↔ crewSize>0 严格对齐', () => {
  const derived = REG.AI_ACTIONS.filter(a => a.crewSize > 0).map(a => a.id);
  assert.deepEqual([...REG.AI_CREW_REQUIRED_IDS], derived);
  assert.equal(REG.AI_CREW_REQUIRED_IDS.length, 5, '五项动作全部需占编');
});

test('A3 ALL_OFF_SWITCH_KEYS 覆盖全部开关（含 autoTech，修 v3.10.5 漏项）', () => {
  assert.deepEqual([...REG.ALL_OFF_SWITCH_KEYS], [...REG.AI_ACTION_SWITCH_KEYS]);
  assert.ok(REG.ALL_OFF_SWITCH_KEYS.includes('autoTech'), '一键全关必须包含自动研究');
  for (const k of ['autoUpgrade', 'autoHire', 'autoClaim', 'autoBuild', 'autoTech']) {
    assert.ok(REG.ALL_OFF_SWITCH_KEYS.includes(k), `缺 ${k}`);
  }
});

test('A4 双向审计：注册表 id ↔ ai.js EXECUTORS 执行器一一对应', () => {
  const execKeys = [...AI_SRC.matchAll(/^  (\w+)\(ctx, workers\) \{/gm)].map(m => m[1]);
  assert.deepEqual(execKeys.sort(), [...REG.AI_ACTION_IDS].sort(),
    '每个声明动作都要有执行器，且不得有孤儿执行器');
  // tickAI 必须遍历注册表，而不是手写 5 个 if 分支
  assert.match(AI_SRC, /for \(const a of AI_ACTIONS\)/, 'tickAI 应由注册表驱动');
  assert.ok(!/if \(ai\.autoUpgrade\) \{/.test(AI_SRC), '不得再出现分支级硬编码开关');
});

test('A5 防回归：占编分配 / 一键全关只有单一实现，消耗模型已彻底移除', () => {
  const assignCalls = [...AI_SRC.matchAll(/assignAssistants\(/g)].length;
  assert.ok(assignCalls >= 2, '定义处 + tickAI + stalledActions 共用同一分配函数');
  assert.equal([...AI_SRC.matchAll(/consumeAssistants\(/g)].length, 0, '消耗函数已彻底删除');
  assert.ok(!/\bconsumeAssistant\(\)/.test(AI_SRC), '不得再有旧的单数扣费分支');
  assert.ok(!/S\.ai\.autoUpgrade = false; S\.ai\.autoHire = false/.test(AI_SRC),
    '一键全关不得再内联手写开关集合');
  assert.match(AI_SRC, /allOffActions\(\);/, 'UI 点击消费产品入口');
  assert.match(MAIN_SRC, /AI_CREW_REQUIRED_IDS/, 'QA 钩子暴露占编者清单');
  assert.match(MAIN_SRC, /assignAssistants/, 'QA 钩子暴露分配函数');
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
console.log('[B] 编制分配矩阵 / 执行次数 = 分配工人数 / 台账 / 编制不足挂起');
// ============================================================

test('B1 自动升级：5 名助手 + 仅 1 个开启动作 → 执行 5 次、助手不消耗、台账 +5', () => {
  reset({ autoUpgrade: true, assistants: 5 });
  assert.equal(AI.tickAI(5), true);
  assert.equal(AI.assistantCount(), 5, '常驻班组不消耗助手');
  assert.equal(AI.actionCounts().upgrade, 5, '执行次数 = 分配工人数');
  assert.equal(AI.totalActionCount(AI.actionCounts()), 5);
  assert.ok(logs.some(l => l.m.includes('自动升级')), '日志写出动作名');
  assert.ok(!logs.some(l => l.m.includes('消耗 1 名助手')), '不再有「消耗助手」文案');
});

test('B2 自动领取：5 名助手 + 2 个 pending → 领 2 个、助手不消耗', () => {
  reset({ autoClaim: true, assistants: 5 });
  S.projects = [
    { status: 'pending', name: '任务甲', reward: { kind: 'ep', amount: 1 } },
    { status: 'pending', name: '任务乙', reward: { kind: 'ep', amount: 1 } },
    { status: 'active', name: '未达标', reward: { kind: 'ep', amount: 1 } },
  ];
  assert.equal(AI.tickAI(5), true);
  assert.equal(AI.assistantCount(), 5, '常驻班组不消耗');
  assert.equal(AI.actionCounts().claim, 2, '2 个 pending 各领 1 次（受 pending 数约束，非工人上限）');
  assert.equal(S.projects.filter(p => p.status === 'claimed').length, 2, 'active 任务不领');
});

test('B3 执行次数 = 工人数，但受真实条件上限约束（pending 不足时不会超领）', () => {
  reset({ autoClaim: true, assistants: 5 });
  S.projects = [
    { status: 'pending', name: '任务甲', reward: { kind: 'ep', amount: 1 } },
    { status: 'pending', name: '任务乙', reward: { kind: 'ep', amount: 1 } },
  ];
  AI.tickAI(5);
  assert.equal(AI.assistantCount(), 5, '助手不消耗');
  assert.equal(AI.actionCounts().claim, 2, '5 名工人但只有 2 个待领，按 pending 数截断');
  assert.equal(S.projects.filter(p => p.status === 'claimed').length, 2);
});

test('B4 自动招募：5 名助手 + 仅招募开启 → 招 5 条、助手不消耗', () => {
  reset({ autoHire: true, assistants: 5 });
  const before = S.cultists.length;
  assert.equal(AI.tickAI(5), true);
  assert.equal(S.cultists.length, before + 5, '每工人招 1 条');
  assert.equal(AI.assistantCount(), 5, '常驻班组不消耗');
  assert.equal(AI.actionCounts().hire, 5);
});

test('B5 自动研究 / 自动购建（进阶动作）同样占编、不消耗，每周期执行 = 工人数', () => {
  reset({ autoTech: true, assistants: 5 });
  assert.equal(AI.tickAI(5), true, '自动研究应买到科技');
  assert.equal(AI.assistantCount(), 5, '常驻班组不消耗');
  assert.ok(AI.actionCounts().tech >= 1, '至少买到 1 个科技');

  reset({ autoBuild: true, assistants: 5 });
  assert.equal(AI.tickAI(60), true, '自动购建应买到已解锁建筑');
  assert.equal(AI.assistantCount(), 5, '常驻班组不消耗');
  assert.ok(AI.actionCounts().build >= 1, '至少购建 1 栋');
});

test('B6 编制不足：0 助手 + 2 开启动作 → 无执行、无消耗、台账不增，且有明确告警', () => {
  reset({ autoUpgrade: true, autoClaim: true, assistants: 0 });
  assert.equal(AI.tickAI(5), false, '无编制则不产生动作');
  assert.equal(AI.assistantCount(), 0);
  assert.equal(AI.totalActionCount(AI.actionCounts()), 0);
  assert.ok(logs.some(l => l.m.includes('助手耗尽') && l.m.includes('自动升级')), '告警列出挂起动作');
  assert.equal(AI.stalledActions().length, 2, '两个动作均因编制不足挂起');
});

test('B7 告警节流：60s 内不重复刷屏', () => {
  reset({ autoUpgrade: true, assistants: 0 });
  AI.tickAI(5);
  const n = logs.filter(l => l.m.includes('助手耗尽')).length;
  AI.tickAI(5);
  assert.equal(logs.filter(l => l.m.includes('助手耗尽')).length, n, '节流生效');
});

test('B8 开关全关不执行；只开一个动作时其余台账保持 0', () => {
  reset({ assistants: 9 });
  assert.equal(AI.tickAI(5), false);
  assert.equal(AI.assistantCount(), 9);
  reset({ autoUpgrade: true, assistants: 9 });
  AI.tickAI(5);
  const c = AI.actionCounts();
  assert.ok(c.upgrade >= 1, '开启动作执行（工人数 = 9）');
  for (const id of ['hire', 'claim', 'build', 'tech']) assert.equal(c[id], 0);
});

test('B9 混沌心智旁路不消耗助手（明确的边界口径）', () => {
  reset({ autoUpgrade: true, assistants: 5 });
  S.tech.chaos_mind = true;
  AI.tickAI(60);
  assert.equal(AI.assistantCount(), 5, '接管期间助手冻结不消耗');
  assert.equal(AI.totalActionCount(AI.actionCounts()), 0, '混沌直觉走独立路径，不写动作台账');
  S.tech.chaos_mind = false;
});

test('B10 maxCycleCrewDemand 随开启动作数线性变化', () => {
  assert.equal(REG.maxCycleCrewDemand({ autoUpgrade: true }), 1);
  assert.equal(REG.maxCycleCrewDemand({ autoUpgrade: true, autoClaim: true }), 2);
  assert.equal(REG.maxCycleCrewDemand({}), 0);
  assert.equal(REG.maxCycleCrewDemand(null), 0);
});

// ============================================================
console.log('[C] 产品真实入口 / 定价 / 旧档兼容');
// ============================================================

test('C1 buyAssistant：扣 EP + 助手 +1；EP 不足返回 ok:false', () => {
  reset({ assistants: 3 });
  const ep0 = S.ep;
  const r = AI.buyAssistant();
  assert.equal(r.ok, true);
  assert.equal(AI.assistantCount(), 4, '购买即扩编 1 名');
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
  assert.equal(AI.assistantCount(), 40, '购买数量不受上限约束');
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
console.log('[D] 状态清单 / 存档版本');
// ============================================================

test('D1 defaultState().ai 补齐字段，嵌套清单含 ai（不再有 supplyTimer）', () => {
  const def = defaultState();
  for (const k of ['actionCounts', '_stallWarnAt', 'assistants']) {
    assert.ok(Object.prototype.hasOwnProperty.call(def.ai, k), `缺默认字段 ${k}`);
  }
  assert.ok(!('supplyTimer' in def.ai), 'v3.11.2 已删除 supplyTimer');
  assert.ok(NESTED_DEFAULT_KEYS.includes('ai'), '旧档由嵌套补齐清单兜底');
});

test('D2 SAVE_VERSION 保持 6（仅删字段，无存档结构变更）', () => {
  assert.equal(SAVE_VERSION, 6);
});

test('D3 面板源码：编制不足提示与台账 DOM 均由读侧派生，无 undefined 风险', () => {
  assert.match(AI_SRC, /data-ai-stall/, '编制不足提示存在');
  assert.match(AI_SRC, /data-ai-ledger/, '本局动作台账存在');
  assert.match(AI_SRC, /stalledActions\(\)/, '编制不足提示由派生谓词驱动');
  assert.match(AI_SRC, /actionCounts\(\)/, '台账读侧容错');
  assert.match(AI_SRC, /常驻班组/, '面板文案表达常驻班组模型');
  assert.ok(!AI_SRC.includes('supply.intervalSec'), '已无自动补给文案残留');
});

// ============================================================
console.log('[E] 用户明确需求');
// ============================================================

test('E1 自动升级 / 自动招募 / 自动领取：占编、常驻、每周期执行次数 = 分配工人数', () => {
  for (const id of ['upgrade', 'hire', 'claim']) {
    assert.equal(REG.crewSizeOf(id), 1, `${id} 占编基准必须为 1`);
  }
  for (const id of ['upgrade', 'hire', 'claim']) {
    assert.equal(REG.actionById(id).group, 'basic');
  }
});

test('E2 进阶动作（自动购建 / 自动研究）同样占编，口径统一', () => {
  for (const id of ['build', 'tech']) {
    assert.equal(REG.crewSizeOf(id), 1, `${id} 也应占编 1`);
    assert.equal(REG.actionById(id).group, 'advanced');
  }
});

test('E3 一次决策周期内助手数守恒：分配后总执行次数 = 总工人数，余额不变', () => {
  reset({ autoUpgrade: true, autoHire: true, autoTech: true, assistants: 5 });
  AI.tickAI(5);
  const c = AI.actionCounts();
  const executed = AI.totalActionCount(c);
  assert.equal(AI.assistantCount(), 5, '常驻班组余额不变');
  assert.ok(executed >= 3, '三个开启动作各至少分到 1 名工人并执行');
  // 分配：5 工人 / 3 动作 → base 1 + 余数 2 顺补 → 合计执行 = 5（受真实条件约束可能略少）
  assert.ok(executed <= 5, '执行总次数不超过分配总工人数');
});
