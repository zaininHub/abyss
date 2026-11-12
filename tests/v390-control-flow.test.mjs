// v3.9.0 核心玩法抽象（控制流层 / 渲染分发层）+ 潮汐预案：纯 Node 单测
//
// 守住本次重构的五条红线：
//   A. 帧系统调度器：预排序 / 三种节流 / 异常隔离 / 脏标记归一 / 统计台账；
//   B. 面板注册表：注册顺序即渲染顺序 / always 每帧 / 单面板异常隔离；
//   C. 静态接线：主循环只剩 7 次阶段调用、43 条系统声明双向对齐、dirty 键 ↔ 面板消费者一一对应；
//   D. 潮汐预案读侧：默认映射零漂移、旧档兼容、非法写入拦截、逐相位改写即时生效；
//   E. 存档版本不 bump、QA 暴露完整、暂停/弹窗/模态暂停等原有行为保留。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const sys = await import('../src/core/systemScheduler.js');
const panels = await import('../src/core/panelRegistry.js');
const orch = await import('../src/core/orchestration.js');
const { SAVE_VERSION, defaultState } = await import('../src/state.js');
const { PANEL_DIRTY_ON_START } = await import('../src/core/panelKeys.js');
const { ACHIEVEMENT_IDS } = await import('../src/core/achievementRegistry.js');

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = p => readFileSync(join(SRC_ROOT, p), 'utf8');
const MAIN = read('main.js');
const SYS = read(join('systems', 'frameSystems.js'));
function allSource() {
  let out = '';
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out += readFileSync(p, 'utf8') + '\n';
    }
  };
  walk(SRC_ROOT);
  return out;
}
const ALL_SRC = allSource();
const P = sys.FRAME_PHASES;

console.log('[A] 帧系统调度内核');

test('A1 阶段常量有序且注册校验拒绝非法声明', () => {
  assert.deepEqual([...sys.FRAME_PHASE_ORDER], [P.AFTER_EP_AUX, P.AFTER_PRODUCERS, P.FRAME]);
  sys._resetSystems();
  try {
    assert.throws(() => sys.registerSystem({ id: 'x', phase: 'bogus', run() {} }), /未知阶段/);
    assert.throws(() => sys.registerSystem({ phase: P.FRAME, run() {} }), /必须包含/);
    assert.throws(() => sys.registerSystem({ id: 'x', phase: P.FRAME }), /必须包含/);
    assert.equal(sys.allSystems().length, 0, '非法注册不得污染注册表');
  } finally { sys._resetSystems(); }
});

test('A2 注册时预排序，同 order 按 seq 稳定，同 id 替换不叠加', () => {
  sys._resetSystems();
  try {
    const run = () => {};
    sys.registerSystem({ id: 'c', phase: P.FRAME, order: 30, run });
    sys.registerSystem({ id: 'a', phase: P.FRAME, order: 10, run });
    sys.registerSystem({ id: 'b', phase: P.FRAME, order: 20, run });
    sys.registerSystem({ id: 'b2', phase: P.FRAME, order: 20, run });
    assert.deepEqual(sys.systemsOfPhase(P.FRAME).map(s => s.id), ['a', 'b', 'b2', 'c']);
    sys.registerSystem({ id: 'b', phase: P.FRAME, order: 20, run });
    assert.equal(sys.systemsOfPhase(P.FRAME).length, 4, '同 id 应替换而非叠加');
    assert.equal(sys.unregisterSystem('c'), true);
    assert.equal(sys.unregisterSystem('missing'), false);
    assert.deepEqual(sys.systemsOfPhase(P.FRAME).map(s => s.id).sort(), ['a', 'b', 'b2']);
  } finally { sys._resetSystems(); }
});

test('A3 intervalSec / intervalMs / everyFrames 三种节流统一生效', () => {
  sys._resetSystems();
  try {
    const calls = [];
    sys.registerSystem({ id: 'sec', phase: P.FRAME, order: 1, intervalSec: 2, run() { calls.push('sec'); } });
    sys.registerSystem({ id: 'ms', phase: P.FRAME, order: 2, intervalMs: 300, run() { calls.push('ms'); } });
    sys.registerSystem({ id: 'every', phase: P.FRAME, order: 3, everyFrames: 3, run() { calls.push('every'); } });
    const ctx = { frame: 0, dt: 0, now: 0, dirty: {} };
    assert.equal(sys.runSystems(ctx, P.FRAME), 2);
    assert.deepEqual(calls, ['ms', 'every'], '首帧：计时类跳过、帧数类命中');
    ctx.frame = 1; ctx.dt = 1; ctx.now = 100;
    assert.equal(sys.runSystems(ctx, P.FRAME), 0, '未满周期应全部跳过');
    ctx.frame = 3; ctx.dt = 1; ctx.now = 300;
    assert.equal(sys.runSystems(ctx, P.FRAME), 3);
    assert.deepEqual(calls.slice(-3).sort(), ['every', 'ms', 'sec']);
    assert.equal(ctx._sysAcc_sec, 0, '秒节流触发后归零，保证与旧存档节拍同频');
    assert.equal(ctx._sysLast_ms, 300);
  } finally { sys._resetSystems(); }
});

test('A4 单系统异常被隔离，后续系统照常执行，返回值可声明 dirty', () => {
  sys._resetSystems();
  try {
    const ctx = { frame: 1, dt: 1, now: 1, dirty: {} };
    sys.registerSystem({ id: 'throw', phase: P.FRAME, order: 1, run() { throw new Error('boom'); } });
    sys.registerSystem({ id: 'array', phase: P.FRAME, order: 2, run() { return ['a', 'b']; } });
    sys.registerSystem({ id: 'object', phase: P.FRAME, order: 3, run() { return { c: true, d: false }; } });
    sys.registerSystem({ id: 'string', phase: P.FRAME, order: 4, run() { return 'e'; } });
    assert.equal(sys.runSystems(ctx, P.FRAME), 3, '异常系统不计入执行数，其余 3 个照常');
    for (const k of ['a', 'b', 'c', 'e']) assert.equal(ctx.dirty[k], true, `缺 dirty.${k}`);
    assert.equal(ctx.dirty.d, undefined, '假值不应置脏');
    assert.equal(sys.systemStats().throw.errors, 1);
    assert.equal(sys.systemStats().array.ticks, 1);
    assert.ok(sys.systemErrors().some(e => e.id === 'throw' && /boom/.test(e.error)));
    sys.resetSystemStats();
    assert.deepEqual(sys.systemErrors(), []);
    assert.deepEqual(sys.systemStats(), {});
  } finally { sys._resetSystems(); }
});

test('A5 enabled 跳过 / enabled 抛错按跳过处理，不击穿整帧', () => {
  sys._resetSystems();
  try {
    let off = 0, on = 0;
    sys.registerSystem({ id: 'off', phase: P.FRAME, order: 1, enabled: () => false, run() { off++; } });
    sys.registerSystem({ id: 'bad', phase: P.FRAME, order: 2, enabled: () => { throw new Error('bad enabled'); }, run() { off++; } });
    sys.registerSystem({ id: 'on', phase: P.FRAME, order: 3, run() { on++; } });
    assert.equal(sys.runSystems({ frame: 1, dt: 1, now: 1, dirty: {} }, P.FRAME), 1);
    assert.equal(off, 0);
    assert.equal(on, 1);
    assert.deepEqual(sys.systemErrors(), [], 'enabled 异常按跳过处理，不记运行异常');
  } finally { sys._resetSystems(); }
});

console.log('[B] 声明式面板注册表');

test('B1 注册顺序即渲染顺序，always 每帧执行，脏标记消费后复位', () => {
  panels._resetPanels();
  try {
    const out = [];
    panels.registerPanel({ key: 'a', render: () => out.push('a') });
    panels.registerPanel({ key: 'always1', always: true, render: () => out.push('X') });
    panels.registerPanel({ key: 'b', render: () => out.push('b') });
    const d = { a: true, b: true, orphan: true };
    assert.equal(panels.renderPanels(d), 3);
    assert.deepEqual(out, ['a', 'X', 'b']);
    assert.equal(d.a, false);
    assert.equal(d.b, false);
    assert.equal(d.orphan, true, '无人消费的脏键不得被静默吞掉（由 C3 静态审计拦截）');
    assert.equal(panels.renderPanels(d), 1, '第二帧只剩 always 条目');
    assert.deepEqual(out, ['a', 'X', 'b', 'X']);
    assert.equal(panels.allPanels().length, 3);
  } finally { panels._resetPanels(); }
});

test('B2 单面板异常被隔离，后续面板照常渲染，panelErrors 可观测', () => {
  panels._resetPanels();
  try {
    let after = 0;
    panels.registerPanel({ key: 'throw', render() { throw new Error('panel boom'); } });
    panels.registerPanel({ key: 'after', render() { after++; } });
    const d = { throw: true, after: true };
    assert.equal(panels.renderPanels(d), 1, '异常面板不计入渲染数');
    assert.equal(after, 1);
    assert.equal(d.throw, false, '异常面板也要复位脏标记，避免每帧重复报错');
    assert.ok(panels.panelErrors().some(e => e.key === 'throw' && /panel boom/.test(e.error)));
    panels.resetPanelErrors();
    assert.deepEqual(panels.panelErrors(), []);
  } finally { panels._resetPanels(); }
});

test('B3 同 key 替换不叠加，注销生效', () => {
  panels._resetPanels();
  try {
    let first = 0, second = 0;
    panels.registerPanel({ key: 'x', render: () => first++ });
    panels.registerPanel({ key: 'x', render: () => second++ });
    panels.renderPanels({ x: true });
    assert.equal(first, 0);
    assert.equal(second, 1);
    assert.equal(panels.unregisterPanel('x'), true);
    assert.equal(panels.unregisterPanel('x'), false);
    assert.equal(panels.renderPanels({ x: true }), 0);
  } finally { panels._resetPanels(); }
});

console.log('[C] 控制流层静态接线审计');

test('C1 主循环只剩 7 次阶段调用，且执行顺序与 v3.8.0 逐字对应', () => {
  const calls = [...MAIN.matchAll(/runFlows\(flowCtx, FLOW_PHASES\.(\w+)\)|runSystems\(frameCtx, FRAME_PHASES\.(\w+)\)/g)]
    .map(m => m[1] || m[2]);
  assert.deepEqual(calls, [
    'EP_PRODUCE', 'EP_AUX', 'AFTER_EP_AUX', 'PRODUCERS', 'AFTER_PRODUCERS', 'CONVERTERS', 'FRAME',
  ]);
  const tickBody = MAIN.match(/function tick\(now\) \{[\s\S]*?\n\}/);
  assert.ok(tickBody, '取不到 tick 函数体');
  const body = tickBody[0];
  for (const fn of ['tickWages(', 'tickAI(', 'tickReligion(', 'refreshShopAffordability(', 'renderShop(', 'checkAch(']) {
    assert.ok(!body.includes(fn), `主循环不应再直调 ${fn}`);
  }
  assert.ok(body.includes('S.paused') && body.includes('snap-modal') && body.includes('modalPauseAt') && body.includes('_riftCatchup'),
    '暂停 / 存档弹窗 / 模态暂停 / 裂隙补时四条原有行为必须保留');
});

test('C2 43 条系统声明与 FRAME_SYSTEM_IDS 清单双向对齐', () => {
  const declared = [...SYS.matchAll(/registerSystem\(\{[\s\S]{0,120}?id: '([a-z0-9-]+)'/g)].map(m => m[1]);
  const idBlock = SYS.slice(SYS.indexOf('export const FRAME_SYSTEM_IDS'));
  const listed = [...idBlock.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
  assert.equal(new Set(declared).size, declared.length, '系统 id 重复注册');
  assert.equal(new Set(listed).size, listed.length, '清单内有重复 id');
  assert.equal(declared.length, 43);
  assert.deepEqual(new Set(declared), new Set(listed), '声明与清单不一致（漏注册 / 幽灵 id）');
  assert.ok(listed.includes('tide-schedule'), '新玩法「潮汐预案同步」以新增一条系统注册落地');
  assert.ok(listed.includes('render') && listed.includes('affordability'));
  assert.ok(MAIN.includes('registerFrameSystems({') && MAIN.includes('registerAllPanels();'));
});

test('C3 dirty 键 ↔ 面板消费者一一对应（无孤儿脏键、无死面板）', () => {
  const panelKeys = [...MAIN.matchAll(/registerPanel\(\{ key: '([^']+)'/g)].map(m => m[1]);
  const alwaysKeys = new Set([...MAIN.matchAll(/registerPanel\(\{ key: '([^']+)', always: true/g)].map(m => m[1]));
  const assigned = new Set([...ALL_SRC.matchAll(/\b(?:ctx\.)?dirty\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true|\bd\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true/g)]
    .map(m => m[1] || m[2]));
  // v3.10.0：开档置脏改为遍历 PANEL_DIRTY_ON_START 清单，源码里不再有逐行 dirty.X = true
  for (const k of PANEL_DIRTY_ON_START) assigned.add(k);
  const consumers = new Set(panelKeys.filter(k => !alwaysKeys.has(k)));
  assert.equal(new Set(panelKeys).size, panelKeys.length, '面板 key 重复注册');
  assert.equal(consumers.size, 24, 'v3.12.0 起应有 24 个受脏标记控制的面板（新增 reincarn）');
  for (const k of assigned) assert.ok(consumers.has(k), `dirty.${k} 无注册面板消费（幽灵脏键）`);
  for (const k of consumers) assert.ok(assigned.has(k), `面板 ${k} 无任何置脏点（死面板）`);
  assert.deepEqual([...consumers].sort(), [...assigned].sort());
});

test('C4 300ms 可购态快刷与潮汐预案同步都由帧系统声明，不改主循环', () => {
  // 截到下一个 registerSystem 之前，避免被系统体内部的 `});` 提前截断
  const seg = (id) => {
    const at = SYS.indexOf(`id: '${id}'`);
    assert.ok(at > 0, `缺系统 ${id}`);
    const next = SYS.indexOf('registerSystem({', at);
    return SYS.slice(at, next > 0 ? next : at + 1400);
  };
  const aff = seg('affordability');
  assert.ok(/intervalMs: 300/.test(aff));
  assert.ok(aff.includes('refreshShopAffordability();') && aff.includes('refreshAssistantAffordability();'));
  const tide = seg('tide-schedule');
  assert.ok(tide.includes('effectiveModeId(S)') && tide.includes('ctx.dirty.orchestration = true'));
  assert.ok(MAIN.includes('runSystems(frameCtx, FRAME_PHASES.FRAME);'));
});

test('C5 __qa 暴露帧系统 / 面板注册表 / 潮汐预案钩子', () => {
  for (const s of [
    'runSystems, systemStats, systemErrors, FRAME_PHASES, allPanels, panelErrors',
    'TIDE_PHASE_NAMES, SCHEDULE_UNLOCK, scheduleUnlocked, orchestrationSchedule',
    'scheduleCustomized, setOrchestrationPhaseMode, resetOrchestrationSchedule',
  ]) assert.ok(MAIN.includes(s), `QA 缺暴露：${s}`);
});

console.log('[D] 潮汐预案读侧单一真源');

test('D1 默认排班表与 v3.8.0 固定映射逐字一致（零数值漂移）', () => {
  // v3.12.8 ③：删掉值守/级联后，默认排班回到四档全覆盖
  assert.deepEqual([...orch.TIDE_ORCHESTRATION], ['output', 'balanced', 'research', 'abyss']);
  assert.equal(orch.TIDE_PHASE_NAMES.length, 4);
  assert.deepEqual(defaultState().orchestration.schedule, ['output', 'balanced', 'research', 'abyss']);
  const S = { projectsDone: 3, orchestration: { mode: 'abyss', autoTide: true } };
  assert.deepEqual([0, 1, 2, 3].map(p => orch.effectiveModeId({ ...S, tidePhase: p })),
    ['output', 'balanced', 'research', 'abyss']);
  assert.equal(orch.effectiveModeId({ ...S, tidePhase: 99 }), 'abyss', '越界相位取模而非崩溃（相位 3 = 深渊优先）');
  assert.equal(SAVE_VERSION, 6, 'SAVE_VERSION 不 bump，旧档无迁移成本');
});

test('D2 未解锁 / 旧档 / 非法存档 / 越界 id 一律回落默认', () => {
  const def = [...orch.TIDE_ORCHESTRATION];
  assert.deepEqual(orch.orchestrationSchedule({}), def);
  assert.deepEqual(orch.orchestrationSchedule({ projectsDone: 3, orchestration: { schedule: ['vigil', 'vigil', 'vigil', 'vigil'] } }),
    def, '未解锁排班时不得读自定义表（防越权放大）');
  assert.deepEqual(orch.orchestrationSchedule({ projectsDone: 20, orchestration: { autoTide: true } }), def,
    '旧档无 schedule 字段应回落');
  assert.deepEqual(orch.orchestrationSchedule({ projectsDone: 20, orchestration: { autoTide: true, schedule: 'bogus' } }), def);
  // v3.12.8：旧档排班里的 vigil（已删除策略）按位回落到默认表，不放大数值
  assert.deepEqual(orch.orchestrationSchedule({ projectsDone: 20, orchestration: { autoTide: true,
    schedule: ['bogus', 'vigil', null, 'output', 'extra'] } }), ['output', 'balanced', 'research', 'output']);
  assert.deepEqual(orch.orchestrationState({ orchestration: { schedule: ['x'], mode: 'bogus', autoTide: 'yes' } }),
    { mode: 'balanced', autoTide: true }, '读侧状态保持 v3.8.0 二字段口径，不破坏旧档断言');
});

test('D3 解锁门槛分层：3 任务开编排，8 任务或 2 职级开排班', () => {
  assert.equal(orch.orchestrationUnlocked({}), false);
  assert.equal(orch.scheduleUnlocked({}), false);
  assert.equal(orch.orchestrationUnlocked({ projectsDone: 3 }), true);
  assert.equal(orch.scheduleUnlocked({ projectsDone: 3 }), false, '编排刚解锁时还不能改写排班');
  assert.equal(orch.scheduleUnlocked({ projectsDone: 8 }), true);
  assert.equal(orch.scheduleUnlocked({ prestige: 2 }), true);
  assert.deepEqual({ ...orch.SCHEDULE_UNLOCK }, { projectsDone: 8, prestige: 2 });
});

test('D4 逐相位改写即时生效，手动策略不丢失，恢复默认可回退', () => {
  const S = { projectsDone: 20, tidePhase: 1,
    orchestration: { mode: 'abyss', autoTide: true, schedule: ['output', 'balanced', 'research', 'abyss'] } };
  assert.equal(orch.effectiveModeId(S), 'balanced');
  assert.equal(orch.setOrchestrationPhaseMode(S, 1, 'research'), true);
  assert.equal(orch.effectiveModeId(S), 'research');
  assert.equal(orch.orchestrationMult('ep', S), 0.92);
  assert.equal(orch.orchestrationMult('rp', S), 1.40);
  assert.equal(orch.orchestrationMult('pt', S), 0.92);
  assert.equal(orch.orchestrationMult('dm', S), 1);
  assert.equal(orch.orchestrationState(S).mode, 'abyss', '手动策略不得被排班改写');
  assert.equal(orch.scheduleCustomized(S), true);
  assert.equal(orch.resetOrchestrationSchedule(S), true);
  assert.equal(orch.effectiveModeId(S), 'balanced', '相位 1 回到默认表的均衡');
  assert.equal(orch.scheduleCustomized(S), false);
  assert.equal(orch.orchestrationState(S).mode, 'abyss');
  S.tidePhase = 0;
  S.orchestration.autoTide = false;
  assert.equal(orch.effectiveModeId(S), 'abyss', '关掉排班回到手动策略');
});

test('D5 非法写入不污染状态（未解锁 / 越界 / 非法 id）', () => {
  const locked = { projectsDone: 3, orchestration: { mode: 'balanced', autoTide: false } };
  const before = JSON.stringify(locked);
  assert.equal(orch.setOrchestrationPhaseMode(locked, 0, 'research'), false);
  assert.equal(orch.resetOrchestrationSchedule(locked), false);
  assert.equal(JSON.stringify(locked), before);
  const S = { projectsDone: 20, orchestration: { mode: 'balanced', autoTide: false,
    schedule: ['output', 'balanced', 'research', 'abyss'] } };
  for (const [p, id] of [[-1, 'research'], [4, 'research'], [1.5, 'research'], [1, 'bogus'], ['1', 'research'], [1, null]]) {
    assert.equal(orch.setOrchestrationPhaseMode(S, p, id), false, `非法写入 ${p}/${id} 应被拦截`);
  }
  assert.deepEqual(S.orchestration.schedule, ['output', 'balanced', 'research', 'abyss']);
  assert.equal(S.orchestration.mode, 'balanced');
});

test('D6 改模式 / 切开关都保留已排班表，不丢玩家配置', () => {
  const S = { projectsDone: 20, tidePhase: 0,
    orchestration: { mode: 'balanced', autoTide: false, schedule: ['research', 'research', 'research', 'research'] } };
  assert.equal(orch.setOrchestrationMode(S, 'output'), true);
  assert.deepEqual(S.orchestration.schedule, ['research', 'research', 'research', 'research']);
  assert.equal(orch.setOrchestrationAutoTide(S, true), true);
  assert.deepEqual(S.orchestration.schedule, ['research', 'research', 'research', 'research']);
  assert.equal(orch.effectiveModeId(S), 'research');
  assert.equal(orch.setOrchestrationMode(S, 'bogus'), false);
  assert.equal(orch.orchestrationState(S).mode, 'output');
});

test('D7 四档策略四键数值正确，且增益与代价成对', () => {
  assert.equal(orch.ORCHESTRATION_MODES.length, 4, 'v3.12.8：值守/级联已删除');
  assert.deepEqual([...orch.ORCHESTRATION_KEYS], ['ep', 'rp', 'pt', 'dm']);
  assert.deepEqual(orch.ORCHESTRATION_MODES.map(m => m.id), ['balanced', 'output', 'research', 'abyss']);
  const ab = orch.ORCHESTRATION_MODES.find(m => m.id === 'abyss');
  assert.ok(ab && ab.name && ab.icon && ab.short && ab.desc);
  assert.deepEqual(ab.effects, { ep: 0.88, rp: 0.92, pt: 1.40, dm: 1.25 });
  for (const m of orch.ORCHESTRATION_MODES) {
    if (m.id === 'balanced') continue;
    assert.ok(Object.values(m.effects).some(x => x > 1), `${m.id} 应有增益`);
    assert.ok(Object.values(m.effects).some(x => x < 1), `${m.id} 应有代价`);
  }
  assert.equal(orch.orchestrationMult('unknown', { projectsDone: 20 }), 1);
  assert.equal(orch.orchestrationMult('ep', {}), 1, '未解锁不放大数值');
});

console.log('[E] 新增内容无死数据（真实调用链）');

test('E1 新增章节进入真实章节链，防「data 层同名双实现」陷阱', async () => {
  const provider = await import('../src/core/provider.js');
  const story = await import('../src/modules/story.js');
  assert.ok(read('modules/story.js').includes("from '../data/chapters.js'"),
    '真实调用链必须复用 data/chapters 的 minDays 门控实现');
  provider._resetProvider();
  provider.setStoryline('default');
  const chs = provider.getChapters();
  assert.equal(chs.length, 51); // v3.12.9：并行审查又补了 47~51 章
  for (const id of Array.from({ length: 19 }, (_, i) => 33 + i)) {
    assert.ok(chs.some(c => String(c.id) === String(id)), `第 ${id} 章未进入真实章节表`);
  }
  // v3.10.0 新增 6 章均带 minDays 5~7 的驻留门控；chapterEnteredAt 必须是真实的过去时间戳
  // （旧的 0 会被 `S.chapterEnteredAt || now` 吞掉 → daysIn=0 → 永远停在第 32 章）。
  const rich = { chapter: '32', chapterEnteredAt: Date.now() - 30 * 86400000,
    prestige: 999, projectsDone: 999,
    riftsSealed: 999, dm: 1e9, allTimeEp: 1e18, es: 1e9, faith: 1e9, expeditionsDone: 999,
    riftEmber: 1e9, tech: {}, buildings: {}, unlockedBuildings: {}, upgrades: {}, religion: {},
    wageState: { state: 'ok' }, resonance: { enabled: true, layers: 20, focus: 'rp' } };
  const cur = story.currentChapter(rich);
  assert.equal(Number.parseInt(String(cur.id), 10), 51, `真实推进应能走完新增章节，实际 ${cur.id}`);
  provider._resetProvider();
});

test('E2 v3.10.0 新增 17 条成就全部注册（判定只读已持久化字段）', () => {
  for (const id of ['resonance_on', 'resonance_10', 'resonance_20', 'resonance_focus',
    'chapter35', 'chapter38', 'policy11', 'research55', 'miles13', 'event300',
    'projects400', 'rift40', 'es100k', 'dm1b', 'exped100', 'thread100']) {
    assert.ok(ACHIEVEMENT_IDS.includes(id), `缺成就 ${id}`);
  }
  assert.ok(MAIN.includes('evaluateAchievements(S, ctx)'),
    '成就表必须有统一消费点（checkAch 调注册表纯函数），不能只声明不判定');
  assert.equal(new Set(ACHIEVEMENT_IDS).size, ACHIEVEMENT_IDS.length, '成就 id 唯一');
});

test('E3 新增 4 章 Wiki 与 2 档里程碑渲染 / 数值合法', async () => {
  const { WIKI_SECTIONS } = await import('../src/data/wiki.js');
  const { BALANCE } = await import('../src/data/balance.js');
  for (const id of ['schedule', 'watch', 'chronicle2', 'resonance', 'chronicle3', 'longline']) {
    const sec = WIKI_SECTIONS.find(s => s.id === id);
    assert.ok(sec, `缺百科章节 ${id}`);
    const html = sec.body();
    assert.ok(typeof html === 'string' && html.length > 50, `${id} 内容过短`);
    assert.ok(!/undefined|NaN|Infinity/.test(html), `${id} 渲染出非法数值`);
  }
  assert.equal(BALANCE.miles.length, 16);
  assert.equal(BALANCE.miles[9].cps, 1e11);
  assert.equal(BALANCE.miles[10].cps, 1e12);
  assert.ok(BALANCE.miles[10].rp > BALANCE.miles[9].rp);
  assert.equal(BALANCE.miles[11].cps, 1e13);
  assert.equal(BALANCE.miles[12].cps, 1e14);
  assert.ok(BALANCE.miles[12].rp > BALANCE.miles[11].rp);
});
