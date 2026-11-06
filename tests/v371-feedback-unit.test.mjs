// v3.7.1 两项反馈单测（纯 Node，无需浏览器）
//
// ① 领导者是全局加成位，恒不占任何岗位：绑定 / 智能分配 / 晋升 / 旧档加载四条路径同一口径，
//    且全局加成 leaderGlobalMult 不因解绑而丢失。
// ② 智能分配必须能把线程送进超线程：删除「已解锁但开关全关 → 释放为空闲」旁路后，
//    资源岗位满员 / 未解锁 / 开关关闭 / 容量 0 四种情况统一由超线程兜底，全量与增量同口径。
//
// 同时守住 v3.6.5 的容量约束不被本次重写破坏。
// 注：v3.7.2 反馈④已废弃「手动超线程保留」语义（改为资源岗位优先、超线程最后），
// B7/B10 的断言随之对齐；B7 场景（开关全关）在新旧语义下结果一致，仍为有效回归。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { HYPER_CONVERTER_ID, RESOURCE_CONVERTER_IDS } = await import('../src/data/threads.js');
const TB = await import('../src/modules/threadBinding.js');
const {
  canBind, isLeader, bindThread, unbindThread, autoAssignThreads, leaderGlobalMult, leaderCount,
  converterCapacity, converterLoad, converterUnlocked, converterEnabled, converterThreadBoost,
  threadBindOutputFactor, threadBindSalaryFactor,
} = TB;

const CREW_SRC = readFileSync(new URL('../src/modules/crew.js', import.meta.url), 'utf8');
const STATE_SRC = readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');
const TB_SRC = readFileSync(new URL('../src/modules/threadBinding.js', import.meta.url), 'utf8');

const mk = (i, over = {}) => ({
  id: i, name: 'T' + i, profession: 'prospector', level: 1, xp: 0, leader: false, boundTo: null,
  output: 3, mood: '正常', moodTimer: 0, hiredAt: Date.now(), earned: 0, ...over,
});
function reset(over = {}) {
  S.cultists = [];
  S.upgrades = {}; S.buildings = {}; S.tech = {}; S.religion = {};
  S.converterOn = {}; S.wageState = { state: 'ok' };
  S._probeEnabled = undefined; S.atriumOn = undefined; S.ptDistillOn = undefined;
  S.ptAutoHatch = false; S.ptHatchLv = 0;
  S.ep = 1e9; S.runEarned = 0; S.storyline = 'default';
  Object.assign(S, over);
}
const loadOf = () => Object.fromEntries(
  [...RESOURCE_CONVERTER_IDS, HYPER_CONVERTER_ID, 'null'].map(t => [
    t, t === 'null' ? S.cultists.filter(c => !c.boundTo).length : converterLoad(t),
  ]));

// ============ A. 反馈① 领导者恒不占岗位 ============
console.log('[A] 领导者 = 全局加成位，不占任何岗位');

test('A1 canBind 是「能否占岗位」的唯一判定源：领导 false，普通线程 true', () => {
  assert.equal(canBind(mk(1, { leader: true })), false);
  assert.equal(canBind(mk(2)), true);
  assert.equal(canBind(mk(3, { leader: true, profession: 'overseer' })), false);
});

test('A2 bindThread 拒绝领导者，并清空旧档残留绑定', () => {
  reset();
  const c = mk(1, { leader: true, boundTo: 'vehicles' });
  S.cultists.push(c);
  assert.equal(bindThread(c, 'atrium'), false);
  assert.equal(c.boundTo, null, '被拒绝后必须回到空闲，不能留在原岗位');
  const n = mk(2);
  S.cultists.push(n);
  assert.equal(bindThread(n, 'vehicles'), true);
  assert.equal(n.boundTo, 'vehicles');
});

test('A3 全量智能分配：领导者恒空闲、不占容量、不进超线程，其它线程照常分配', () => {
  reset({ upgrades: { scooter: 1, atrium: 2 } });
  const leader = mk(0, { leader: true, profession: 'overseer' });
  S.cultists.push(leader, ...Array.from({ length: 6 }, (_, i) => mk(i + 1)));
  autoAssignThreads();
  const l = loadOf();
  assert.equal(leader.boundTo, null, '领导者不得出现在任何岗位（含超线程）');
  assert.equal(l.null, 1, '仅领导者空闲');
  assert.equal(l.vehicles, 1, '探采容量 1 被普通线程占满');
  assert.equal(l.atrium, 2, '工坊容量 2 被普通线程占满');
  assert.equal(l.hyper, 3, '其余 3 条普通线程转超线程');
  assert.equal(converterLoad('vehicles') + converterLoad('atrium'), 3);
});

test('A4 旧档残留（领导绑在资源岗位）被任意一次智能分配纠正', () => {
  reset({ upgrades: { scooter: 1 } });
  const leader = mk(0, { leader: true, boundTo: 'vehicles' });
  const p = mk(1);
  S.cultists.push(leader, p);
  autoAssignThreads();
  assert.equal(leader.boundTo, null, '旧档残留绑定必须清除');
  assert.equal(p.boundTo, 'vehicles', '空出的容量交给普通线程');
});

test('A5 增量安置（only）同样纠正领导，但不重排其它线程', () => {
  reset({ upgrades: { scooter: 1 } });
  const leader = mk(0, { leader: true, boundTo: 'vehicles' });
  const fixed = mk(1, { boundTo: 'hyper' });
  const newcomer = mk(2);
  S.cultists.push(leader, fixed, newcomer);
  autoAssignThreads(newcomer);
  assert.equal(leader.boundTo, null, '增量安置也纠正领导不变量');
  assert.equal(fixed.boundTo, HYPER_CONVERTER_ID, '玩家手动设定的超线程不被打扰');
  assert.equal(newcomer.boundTo, 'vehicles', '领导空出的探采容量由新线程补上（v3.6.5 ⑤ 优先补空缺）');
  assert.equal(converterLoad('vehicles'), 1, '该岗位仍不超容量');
});

test('A6 领导者解绑不影响全局加成，也不再吃岗位转化加成', () => {
  reset({ upgrades: { scooter: 1 } });
  const leader = mk(0, { leader: true, boundTo: 'vehicles', profession: 'overseer' });
  const p = mk(1);
  S.cultists.push(leader, p);
  const gWith = leaderGlobalMult();
  const boostWith = converterThreadBoost('vehicles');
  assert.equal(leaderCount(), 1);
  assert.ok(gWith > 1, '全局加成应生效');
  unbindThread(leader);
  assert.equal(leaderGlobalMult(), gWith, '全局加成来自 leaderCount，与是否占岗位无关');
  assert.ok(converterThreadBoost('vehicles') < boostWith, '领导撤离后岗位转化加成应回落');
  // 正常路径下领导不再进入岗位，boost 只由普通线程贡献
  autoAssignThreads();
  assert.equal(leader.boundTo, null);
});

test('A7 晋升入口自动撤离岗位（源码接线，防止 UI 只改标记）', () => {
  assert.match(CREW_SRC, /c\.leader\s*=\s*true/, '晋升分支存在');
  assert.match(CREW_SRC, /if \(c\.boundTo\) \{ unbindThread\(c\)/, '晋升时解绑');
  assert.match(CREW_SRC, /isLeader\(c\)\s*\?\s*'<span title="全局加成位/, '领导卡不再提供岗位下拉');
  assert.match(STATE_SRC, /c\.boundTo = null;\s*\n\s*if \(seenLeader\)/, '旧档加载清除领导岗位残留');
  assert.match(TB_SRC, /export function canBind\(c\) \{ return !isLeader\(c\); \}/, '单一判定源存在');
});

// ============ B. 反馈② 超线程兜底 ============
console.log('[B] 智能分配：无法进入资源岗位的线程统一转入超线程');

test('B1 有模块解锁但开关全关 → 全部转超线程（v3.6.4 遗留旁路，本次修复）', () => {
  reset({ upgrades: { scooter: 1 }, _probeEnabled: false });
  assert.equal(converterUnlocked('vehicles'), true, '探采已解锁');
  assert.equal(converterEnabled('vehicles'), false, '但开关关闭');
  S.cultists.push(...Array.from({ length: 10 }, (_, i) => mk(i)));
  const changed = autoAssignThreads();
  const l = loadOf();
  assert.equal(l.hyper, 10, '10 条全部进入超线程，而不是释放为空闲');
  assert.equal(l.null, 0, '不得留下空闲线程');
  assert.equal(changed, 10, '点击必须有可见变化（旧实现返回 0）');
});

test('B2 全量与增量(only) 在「开关全关」时同口径', () => {
  const setup = () => {
    reset({ upgrades: { scooter: 1 }, _probeEnabled: false });
    S.cultists.push(...Array.from({ length: 5 }, (_, i) => mk(i)));
  };
  setup();
  autoAssignThreads();
  const full = loadOf();
  setup();
  for (const c of S.cultists.slice()) autoAssignThreads(c);
  const incremental = loadOf();
  assert.deepEqual(incremental, full, '全量与增量结果必须一致');
  assert.equal(incremental.hyper, 5);
});

test('B3 新档无任何模块解锁 → 全部转超线程（防回归）', () => {
  reset();
  S.cultists.push(...Array.from({ length: 6 }, (_, i) => mk(i)));
  autoAssignThreads();
  assert.equal(loadOf().hyper, 6);
});

test('B4 资源岗位满员后溢出 → 全部转超线程（防回归）', () => {
  reset({ upgrades: { scooter: 1, atrium: 2 } });
  S.cultists.push(...Array.from({ length: 8 }, (_, i) => mk(i)));
  autoAssignThreads();
  const l = loadOf();
  assert.equal(l.vehicles, 1);
  assert.equal(l.atrium, 2);
  assert.equal(l.hyper, 5);
});

test('B5 部分模块可用、部分关闭 → 关闭模块的线程统一转超线程', () => {
  reset({ upgrades: { scooter: 2, atrium: 1 }, _probeEnabled: false });
  S.cultists.push(...Array.from({ length: 7 }, (_, i) => mk(i)));
  autoAssignThreads();
  const l = loadOf();
  assert.equal(l.vehicles, 0, '关闭的探采不接收线程');
  assert.equal(l.atrium, 1, '开启的工坊按容量接收');
  assert.equal(l.hyper, 6);
});

test('B6 容量 0 的已解锁模块不接收线程，且不突破任何容量', () => {
  reset({ upgrades: { scooter: 1, atrium: 2 } });
  S.cultists.push(...Array.from({ length: 20 }, (_, i) => mk(i)));
  autoAssignThreads();
  const l = loadOf();
  for (const t of RESOURCE_CONVERTER_IDS) {
    assert.ok(converterLoad(t) <= converterCapacity(t), `${t} 不得超容量`);
  }
  assert.equal(l.hyper, 20 - l.vehicles - l.atrium - l.hatch - l.temple);
});

test('B7 开关全关时全部线程（含手动设定的超线程）统一进超线程', () => {
  reset({ upgrades: { scooter: 1 }, _probeEnabled: false });
  const manual = mk(0, { boundTo: HYPER_CONVERTER_ID });
  S.cultists.push(manual, ...Array.from({ length: 4 }, (_, i) => mk(i + 1)));
  autoAssignThreads();
  assert.equal(manual.boundTo, HYPER_CONVERTER_ID, '手动超线程不被清空');
  assert.equal(loadOf().hyper, 5);
});

test('B8 关闭的模块重新开启后，智能分配能把超线程抽调回资源岗位', () => {
  reset({ upgrades: { scooter: 1 }, _probeEnabled: false });
  S.cultists.push(...Array.from({ length: 4 }, (_, i) => mk(i)));
  autoAssignThreads();
  assert.equal(loadOf().hyper, 4);
  S._probeEnabled = true;
  autoAssignThreads();
  const l = loadOf();
  assert.equal(l.vehicles, 1, '开启后探采重新有人');
  assert.equal(l.hyper, 3, '其余仍在超线程');
});

test('B9 超线程分配沿用既有经济口径（产出/消耗各 +10%）', () => {
  reset();
  const c = mk(0);
  S.cultists.push(c);
  autoAssignThreads();
  assert.equal(c.boundTo, HYPER_CONVERTER_ID);
  assert.equal(threadBindOutputFactor(c), BALANCE.thread.binding.hyperOutputMult);
  assert.equal(threadBindSalaryFactor(c), BALANCE.thread.binding.hyperSalaryMult);
});

test('B10 源码不再有「释放为空闲」旁路（防接线回退）', () => {
  assert.doesNotMatch(TB_SRC, /有已解锁岗位但开关全关/, 'v3.6.4 遗留分支应已删除');
  assert.doesNotMatch(TB_SRC, /if \(!types\.length\)/, '不得再有 types 为空的提前返回');
  assert.match(TB_SRC, /阶段 C：资源岗位分配完，剩下的才进超线程/, 'v3.7.2 统一兜底阶段存在');
});
