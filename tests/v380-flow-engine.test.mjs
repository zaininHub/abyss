// v3.8.0 核心玩法抽象单测（纯 Node）：资源流引擎 + 效能编排读侧 + 数值同口径
//
// 守住本次重构的五条红线：
//   A. 8 条资源流全部按阶段注册，EP 主产出必须是 EP_PRODUCE 阶段第一条；
//   B. 单流异常被隔离，不击垮整帧、不阻断后续流；
//   C. 守恒台账 / 运行统计口径正确（EP 消耗不得错记成 RP/PT 消耗）；
//   D. 编排四键全部有真实消费点，无死修饰器、无重复计 EP 加成；
//   E. 主循环只做阶段调度，CPS 显示与真实入账严格同口径。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const flow = await import('../src/core/flowEngine.js');
const { RESOURCE_FLOW_IDS } = await import('../src/systems/resourceFlows.js');
const orch = await import('../src/core/orchestration.js');
const { S } = await import('../src/state.js');
const eco = await import('../src/modules/economy.js');

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = p => readFileSync(join(srcRoot, p), 'utf8');
function allSource() {
  let out = '';
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out += readFileSync(p, 'utf8') + '\n';
    }
  };
  walk(srcRoot);
  return out;
}
const SRC = allSource();
const P = flow.FLOW_PHASES;
const safeCtx = () => ({ S: { upgrades: {}, ep: 0, runEarned: 0, allTimeEp: 0, earnedFull: 0 }, dt: 1, now: 0 });

console.log('[A] 资源流声明与阶段调度');

test('A1 8 条流全部注册，阶段分布与声明清单一致', () => {
  const all = flow.allFlows();
  assert.equal(all.length, RESOURCE_FLOW_IDS.length, '流数量与声明清单不符');
  assert.equal(all.length, 8);
  assert.equal(new Set(all.map(f => f.id)).size, all.length, '流 id 不重复');
  for (const id of RESOURCE_FLOW_IDS) assert.ok(all.some(f => f.id === id), `缺流 ${id}`);
  for (const f of all) assert.ok(flow.FLOW_PHASE_ORDER.includes(f.phase), `${f.id} 阶段非法`);
});

test('A2 EP 主产出是 EP_PRODUCE 阶段唯一且第一条（后续流都吃这一帧余额）', () => {
  const produce = flow.flowsOfPhase(P.EP_PRODUCE);
  assert.equal(produce.length, 1);
  assert.equal(produce[0].id, 'ep:main');
  const aux = flow.flowsOfPhase(P.EP_AUX).map(f => f.id);
  assert.deepEqual(aux, ['ep:tentacle', 'ep:lazy', 'rp:atrium'], 'EP_AUX 顺序应为 触手→懒惰→蒸馏');
  const conv = flow.flowsOfPhase(P.CONVERTERS).map(f => f.id);
  assert.deepEqual(conv, ['pt:hatch', 'fuel:burn', 'pt:upkeep'], 'CONVERTERS 顺序应为 孵化→燃料→维持');
});

test('A3 主循环只做阶段调度，不再内联任何结算公式', () => {
  const main = read('main.js');
  assert.ok(!main.includes('S.ep += gain;'), '主循环不应再出现 EP 结算');
  assert.ok(!main.includes('const hatchLv ='), '主循环不应再出现孵化结算');
  assert.ok(!main.includes('petUpkeepTotalPerSec()'), '主循环不应再出现异兽维持结算');
  const calls = [...main.matchAll(/runFlows\(flowCtx, FLOW_PHASES\.(\w+)\)/g)].map(m => m[1]);
  assert.deepEqual(calls, ['EP_PRODUCE', 'EP_AUX', 'PRODUCERS', 'CONVERTERS'], '四个执行点顺序不可变');
});

test('A4 单流异常被隔离，后续流照常执行且异常可观测', () => {
  flow.registerFlow({ id: '__probe_throw', phase: P.EP_AUX, order: 90, run() { throw new Error('boom'); } });
  flow.registerFlow({ id: '__probe_after', phase: P.EP_AUX, order: 91, run(ctx) { ctx.probeRan = true; } });
  try {
    const ctx = safeCtx();
    assert.doesNotThrow(() => flow.runFlows(ctx, P.EP_AUX));
    assert.equal(ctx.probeRan, true, '异常流之后的流仍应执行');
    assert.equal(flow.flowStats()['__probe_throw'].errors, 1);
    assert.ok(flow.flowErrors().some(e => e.id === '__probe_throw' && /boom/.test(e.error)));
    assert.ok(flow.allFlows().some(f => f.id === '__probe_throw'), '异常流本身不应被注销');
  } finally {
    flow.unregisterFlow('__probe_throw');
    flow.unregisterFlow('__probe_after');
    flow.resetFlowStats();
  }
});

test('A5 修饰器异常被隔离，且不放大数值', () => {
  try {
    flow.registerModifier('__probe_bad', () => { throw new Error('bad modifier'); });
    assert.equal(flow.flowMultiplier('__probe_bad', safeCtx()), 1);
    flow.registerModifier('__probe_bad', m => m * 2);
    assert.equal(flow.flowMultiplier('__probe_bad', safeCtx()), 2, '好修饰器仍应生效');
  } finally {
    assert.equal(flow.unregisterModifiers('__probe_bad'), 2);
  }
});

console.log('[B] 守恒台账与运行统计');

test('B1 produced / consumed / gross 分别入账，EP 消耗不串到 RP/PT', () => {
  flow.registerFlow({
    id: '__probe_book', phase: P.PRODUCERS, order: 999,
    run() { return { resource: '__probe', produced: 5, consumed: 2, gross: 7 }; },
  });
  try {
    flow.resetFlowStats();
    flow.runFlows(safeCtx(), P.PRODUCERS);
    const led = flow.flowLedger();
    assert.equal(led.__probe.in, 5);
    assert.equal(led.__probe.out, 2);
    assert.equal(led.__probe.gross, 7);
    assert.equal(flow.flowStats()['__probe_book'].ticks, 1);
  } finally {
    flow.unregisterFlow('__probe_book');
    flow.resetFlowStats();
  }
});

test('B2 蒸馏/孵化扣的是 EP：源码与流声明都不把 consumed 挂在 rp/pt 上', () => {
  const flows = read('systems/resourceFlows.js');
  assert.ok(flows.includes("bookFlow('ep', 'out', used)"), '蒸馏应单独记 EP 消耗');
  assert.ok(flows.includes("bookFlow('ep', 'out', take)"), '孵化应单独记 EP 消耗');
  assert.ok(!/consumed:\s*used\b/.test(flows), 'EP 消耗不得记成 rp 的 consumed');
  assert.ok(!/consumed:\s*take\b/.test(flows), 'EP 消耗不得记成 pt 的 consumed');
});

test('B3 bookFlow 拒绝非法字段与非数值，resetFlowStats 清空台账', () => {
  flow.bookFlow('__probe', 'in', 3);
  flow.bookFlow('__probe', 'bogus', 99);
  flow.bookFlow('__probe', 'in', NaN);
  assert.equal(flow.flowLedger().__probe.in, 3);
  assert.equal(flow.flowLedger().__probe.bogus, undefined);
  flow.resetFlowStats();
  assert.deepEqual(flow.flowLedger(), {});
  assert.deepEqual(flow.flowErrors(), []);
});

console.log('[C] 效能编排读侧单一真源');

test('C1 六条策略、四个倍率键，增益与代价成对', () => {
  assert.equal(orch.ORCHESTRATION_MODES.length, 6);
  assert.deepEqual([...orch.ORCHESTRATION_KEYS], ['ep', 'rp', 'pt', 'dm']);
  const ids = new Set();
  for (const m of orch.ORCHESTRATION_MODES) {
    ids.add(m.id);
    assert.ok(m.name && m.desc && m.icon && m.short, `${m.id} 缺展示字段`);
    for (const k of orch.ORCHESTRATION_KEYS) {
      assert.ok(Number.isFinite(m.effects[k]) && m.effects[k] > 0, `${m.id}.${k} 非法`);
    }
    if (m.id !== 'balanced') {
      assert.ok(Object.values(m.effects).some(v => v > 1), `${m.id} 应有增益`);
      assert.ok(Object.values(m.effects).some(v => v < 1), `${m.id} 应有代价`);
    }
  }
  assert.equal(ids.size, 6);
  assert.equal(orch.DEFAULT_MODE, 'balanced');
  const vigil = orch.ORCHESTRATION_MODES.find(m => m.id === 'vigil');
  assert.ok(vigil, 'v3.9.0 应新增第 5 条策略「值守编排」');
  assert.ok(vigil.effects.ep < 1 && vigil.effects.rp > 1 && vigil.effects.pt > 1 && vigil.effects.dm > 1,
    '值守编排应是「EP 略降换三条转化管线提速」的互补取舍');
});

test('C2 未解锁 / 旧档 / 非法存档一律回落 ×1，绝不放大数值', () => {
  assert.equal(orch.orchestrationUnlocked({}), false);
  assert.equal(orch.orchestrationMult('ep', {}), 1);
  assert.equal(orch.orchestrationMult('ep', { projectsDone: 3, orchestration: { mode: 'output' } }), 1.25);
  assert.deepEqual(orch.orchestrationState({}), { mode: 'balanced', autoTide: false });
  assert.deepEqual(orch.orchestrationState({ orchestration: { mode: 'bogus', autoTide: 'yes' } }),
    { mode: 'balanced', autoTide: true });
  assert.equal(orch.orchestrationMult('unknown_key', { projectsDone: 3 }), 1);
});

test('C3 自动排班按潮汐相位轮转，手动策略被旁路但不丢失', () => {
  const st = { projectsDone: 3, orchestration: { mode: 'abyss', autoTide: false }, tidePhase: 0 };
  assert.equal(orch.effectiveModeId(st), 'abyss', '未开排班时按手动策略');
  const auto = p => ({ projectsDone: 3, tidePhase: p, orchestration: { mode: 'abyss', autoTide: true } });
  assert.deepEqual([0, 1, 2, 3].map(p => orch.effectiveModeId(auto(p))),
    ['output', 'vigil', 'research', 'cascade']);
  assert.equal(orch.effectiveModeId(auto(99)), 'cascade', '越界相位应回落到合法映射（相位 3 = 级联）而非崩溃');
  st.orchestration.autoTide = true;
  assert.equal(orch.effectiveModeId(st), 'output');
  st.tidePhase = 3;
  assert.equal(orch.orchestrationMult('pt', st), 0.90, '相位 3 = 级联（pt 0.90）');
  st.orchestration.autoTide = false;
  assert.equal(orch.orchestrationMult('pt', st), 1.40, '关掉排班回到手动的深渊优先');
});

test('C4 设置入口只接受合法 id，非法写入不污染状态', () => {
  const st = { projectsDone: 3 };
  assert.equal(orch.setOrchestrationMode(st, 'research'), true);
  assert.equal(orch.orchestrationState(st).mode, 'research');
  assert.equal(orch.setOrchestrationMode(st, 'nope'), false);
  assert.equal(orch.orchestrationState(st).mode, 'research');
  assert.equal(orch.toggleOrchestrationAutoTide(st), true);
  assert.equal(orch.orchestrationState(st).autoTide, true);
  assert.equal(orch.setOrchestrationAutoTide(st, false), true);
  assert.equal(orch.orchestrationState(st).autoTide, false);
});

test('C5 无死修饰器：注册 keys 与流 modKey 双向对齐，EP 主流不重复计加成', () => {
  const mods = flow.modifierKeys().slice().sort();
  assert.deepEqual(mods, ['pt', 'rp']);
  const declared = new Set(flow.allFlows().map(f => f.modKey).filter(Boolean));
  for (const k of mods) assert.ok(declared.has(k), `修饰器 ${k} 无任何流消费（死修饰器）`);
  for (const k of declared) assert.ok(mods.includes(k), `流声明了 modKey=${k} 但无修饰器`);
  const epMain = read('systems/resourceFlows.js').split("id: 'ep:main'")[1].split('});')[0];
  assert.ok(!epMain.includes('flowMultiplier'), 'EP 主产出已由 computeCps 计入，不能再乘一次修饰器');
});

test('C6 四个倍率键都有真实消费点（ep/dm 走标准乘区，rp/pt 走流修饰器）', () => {
  const ecoSrc = read('modules/economy.js');
  const cpsBody = ecoSrc.slice(ecoSrc.indexOf('export function computeCps()'), ecoSrc.indexOf('export function multBreakdown()'));
  assert.ok(cpsBody.includes("orchestrationMult('ep', S)"), 'ep 必须落在 computeCps 乘区内');
  const vehBody = ecoSrc.slice(ecoSrc.indexOf('export function vehicleRateMult()'), ecoSrc.indexOf('export function vehicleDmPerMin()'));
  assert.ok(vehBody.includes("orchestrationMult('dm', S)"), 'dm 必须落在 vehicleRateMult 乘区内');
  const orchSrc = read('core/orchestration.js');
  assert.ok(orchSrc.includes('registerModifier(key, (mult, ctx) => mult * orchestrationMult(key, ctx && ctx.S))'),
    'rp/pt 必须由声明式修饰器统一消费');
  assert.ok(orchSrc.includes("for (const key of ['rp', 'pt'])"), '修饰器只注册有流消费的两个键');
  assert.ok(!SRC.includes("registerModifier('ep'") && !SRC.includes("registerModifier('dm'"),
    'ep/dm 不得再注册流修饰器（否则与标准乘区重复计）');
});

console.log('[D] 数值同口径：CPS 显示 == 流真实入账');

test('D1 单帧流增量 = computeCps() × dt，切换策略后同步变化', () => {
  const saved = { upgrades: S.upgrades, cultists: S.cultists, projectsDone: S.projectsDone,
    orchestration: S.orchestration, ep: S.ep, earnedFull: S.earnedFull, collapsed: S.collapsed,
    buffUntil: S.buffUntil, restBonusUntil: S.restBonusUntil };
  try {
    S.upgrades = { scribble: 1 };
    S.cultists = [];
    S.projectsDone = 3;
    S.collapsed = false;
    S.buffUntil = 0; S.restBonusUntil = 0;
    S.orchestration = { mode: 'balanced', autoTide: false };
    S.ep = 0; S.earnedFull = 0;

    const cpsB = eco.computeCps();
    assert.ok(cpsB > 0, '夹具应产生非零 CPS');
    flow.resetFlowStats();
    flow.runFlows({ S, dt: 10, now: 0 }, P.EP_PRODUCE);
    assert.ok(Math.abs(S.earnedFull - cpsB * 10) < 1e-6, `均衡：入账 ${S.earnedFull} vs ${cpsB * 10}`);
    const epLedger = flow.flowLedger().ep;
    assert.ok(Math.abs(epLedger.gross - cpsB * 10) < 1e-6, '台账 gross 应等于钳前理论产出');

    S.orchestration = { mode: 'output', autoTide: false };
    S.ep = 0; S.earnedFull = 0;
    const cpsO = eco.computeCps();
    assert.ok(Math.abs(cpsO / cpsB - 1.25) < 1e-9, `产能优先应把 CPS 抬到 ×1.25，实际 ×${cpsO / cpsB}`);
    flow.runFlows({ S, dt: 10, now: 0 }, P.EP_PRODUCE);
    assert.ok(Math.abs(S.earnedFull - cpsO * 10) < 1e-6, '切换策略后入账仍与 CPS 同口径');

    S.orchestration = { mode: 'research', autoTide: false };
    assert.ok(Math.abs(orch.orchestrationMult('rp', S) - 1.4) < 1e-9);
    assert.ok(Math.abs(flow.flowMultiplier('rp', { S, dt: 10 }) - 1.4) < 1e-9, '流修饰器应与读侧同源');
  } finally {
    Object.assign(S, saved);
    flow.resetFlowStats();
  }
});

test('D2 DM 标准乘区随策略变化，且不重复叠加到 EP', () => {
  const saved = { projectsDone: S.projectsDone, orchestration: S.orchestration, converterOn: S.converterOn };
  try {
    S.projectsDone = 3;
    S.converterOn = { ...(S.converterOn || {}), vehicles: true };
    S.orchestration = { mode: 'balanced', autoTide: false };
    const base = eco.vehicleRateMult();
    S.orchestration = { mode: 'abyss', autoTide: false };
    const boosted = eco.vehicleRateMult();
    assert.ok(base > 0, '夹具应产生非零 DM 速率');
    assert.ok(Math.abs(boosted / base - 1.25) < 1e-9, `深渊优先 DM 应 ×1.25，实际 ×${boosted / base}`);
  } finally {
    Object.assign(S, saved);
  }
});
