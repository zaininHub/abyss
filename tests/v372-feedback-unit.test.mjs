// v3.7.2 四项反馈单测（纯 Node，无需浏览器）
//
// ① 异兽模块解锁与顶栏 PT 同口径：PT 锚点未完成 → 不开放，旧档持久标记不误放行。
// ② 一键收回：所有线程撤离岗位置为空闲，幂等，消耗恢复，领导者不受影响。
// ③ 班组卡不再展示「已共事」工龄，个人产出动态刷新不受影响。
// ④ 智能分配：所有可绑定线程统一重排，资源岗位按容量优先填满，放不下的才进超线程；
//    废弃 v3.6.5「手动超线程保留」语义，同时守住容量约束/擅长归位/增量安置/领导不变量。
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
const DISC = await import('../src/modules/disclosure.js');
const { petsModuleUnlocked, anchorDone, anchorShown } = DISC;
const TB = await import('../src/modules/threadBinding.js');
const {
  autoAssignThreads, releaseAllThreads, bindThread, canBind,
  converterCapacity, converterLoad, converterEnabled, bindingActive,
  threadBindSalaryFactor, threadBindOutputFactor, leaderGlobalMult,
} = TB;

const CREW_SRC = readFileSync(new URL('../src/modules/crew.js', import.meta.url), 'utf8');
const TB_SRC = readFileSync(new URL('../src/modules/threadBinding.js', import.meta.url), 'utf8');
const MAIN_SRC = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const WIKI_SRC = readFileSync(new URL('../src/data/wiki.js', import.meta.url), 'utf8');
const DISC_SRC = readFileSync(new URL('../src/modules/disclosure.js', import.meta.url), 'utf8');

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
  S.pt = 0; S.faith = 0; S.dm = 0; S.rp = 0;
  S.resDiscovered = { ep: true, cps: true, run: true, tide: true };
  S.startedAt = Date.now(); // 新档：P2 天数门控未达（本次修复后已不参与异兽判定）
  S.ep = 1e9; S.runEarned = 0; S.storyline = 'default';
  Object.assign(S, over);
}
const loadOf = () => Object.fromEntries(
  [...RESOURCE_CONVERTER_IDS, HYPER_CONVERTER_ID, 'free'].map(t => [
    t, t === 'free' ? S.cultists.filter(c => !c.boundTo).length : converterLoad(t),
  ]));
const totalBound = () => S.cultists.filter(c => !!c.boundTo).length;

// ============ A. 反馈① 异兽模块 PT 门控 ============
console.log('[A] 异兽模块解锁 = PT 锚点（与顶栏 PT 同口径）');

test('A1 新档 PT 未解锁 → 异兽模块不开放（即使游玩天数已过 P2）', () => {
  const s = { upgrades: {}, pt: 0, resDiscovered: {}, startedAt: Date.now() - 10 * 86400000 };
  assert.equal(petsModuleUnlocked(s), false);
  assert.equal(anchorDone('pt', s), false, '顶栏 PT 也应隐藏');
});

test('A2 购入饵料仓库 / PT 金库 / 首次持有 PT 任一完成即开放', () => {
  const base = { upgrades: {}, pt: 0, resDiscovered: {} };
  assert.equal(petsModuleUnlocked({ ...base, upgrades: { petland: 1 } }), true, '饵料仓库');
  assert.equal(petsModuleUnlocked({ ...base, upgrades: { pt_vault: 1 } }), true, 'PT 金库');
  assert.equal(petsModuleUnlocked({ ...base, pt: 0.5 }), true, '首次持有 PT');
});

test('A3 旧档持久标记 resDiscovered.pt 不误放行（本局制即时门控）', () => {
  const s = { upgrades: {}, pt: 0, resDiscovered: { pt: true }, startedAt: Date.now() - 99 * 86400000 };
  assert.equal(anchorShown('pt', s), true, '持久标记确实置位，anchorShown 会亮');
  assert.equal(anchorDone('pt', s), false, '但顶栏 PT 不亮');
  assert.equal(petsModuleUnlocked(s), false, '异兽模块也不得开放——与顶栏严格同口径');
});

test('A4 对任意状态，模块解锁恒等于顶栏 PT 锚点', () => {
  const cases = [
    { upgrades: {}, pt: 0, resDiscovered: {} },
    { upgrades: { petland: 1 }, pt: 0, resDiscovered: {} },
    { upgrades: {}, pt: 12, resDiscovered: {} },
    { upgrades: {}, pt: 0, resDiscovered: { pt: true } },
    { upgrades: { pt_vault: 2 }, pt: 0, resDiscovered: { pt: true } },
  ];
  for (const s of cases) assert.equal(petsModuleUnlocked(s), anchorDone('pt', s));
});

test('A5 接线：tab 与 switchTab 都走同一判定源，锁定提示已同步', () => {
  assert.match(MAIN_SRC, /import\s*\{[^}]*petsModuleUnlocked[^}]*\}\s*from\s*'\.\/modules\/disclosure\.js'/, 'main.js 应导入判定源');
  assert.match(MAIN_SRC, /\?\s*petsModuleUnlocked\(S\)/, 'updateTabLocks 应使用判定源');
  assert.match(MAIN_SRC, /id === 'pets' && !petsModuleUnlocked\(S\)/, 'switchTab 应有兜底');
  assert.match(MAIN_SRC, /异兽将在解锁 PT 后开放/, '锁定提示应说明 PT 条件');
  assert.match(DISC_SRC, /export function petsModuleUnlocked/, '判定源应是 disclosure.js 的纯函数');
  assert.doesNotMatch(DISC_SRC, /isStageUnlocked\('P2', S\) && anchorDone/, 'P2 天数门控应已废弃');
});

test('A6 Wiki 解锁条件手册已同步 PT 口径', () => {
  assert.doesNotMatch(WIKI_SRC, /第 3 章 ∧ 购入「饵料仓库」/, '旧的章节 ∧ 仓库口径应移除');
  assert.match(WIKI_SRC, /PT 未解锁时异兽模块不会开放/, '应写明 PT 未解锁不开放');
});

// ============ B. 反馈② 一键收回 ============
console.log('\n[B] 一键收回全部岗位 → 空闲');

test('B1 releaseAllThreads 清空资源岗位与超线程，返回变更数', () => {
  reset({ upgrades: { scooter: 3, atrium: 2 } });
  S.cultists.push(
    mk(1, { boundTo: 'vehicles' }), mk(2, { boundTo: 'atrium' }),
    mk(3, { boundTo: HYPER_CONVERTER_ID }), mk(4, { boundTo: null }),
  );
  const n = releaseAllThreads();
  assert.equal(n, 3, '仅 3 条在岗线程被收回');
  assert.equal(totalBound(), 0);
  assert.deepEqual(S.cultists.map(c => c.boundTo), [null, null, null, null]);
});

test('B2 幂等：已全部空闲时返回 0', () => {
  reset();
  S.cultists.push(mk(1), mk(2));
  assert.equal(releaseAllThreads(), 0);
  assert.equal(releaseAllThreads(), 0);
});

test('B3 收回后绑定失效、薪资系数恢复为 1（消耗恢复）', () => {
  reset({ upgrades: { scooter: 2 } });
  const c = mk(1, { boundTo: 'vehicles' });
  S.cultists.push(c);
  assert.ok(bindingActive(c), '收回前绑定生效');
  releaseAllThreads();
  assert.equal(bindingActive(c), false);
  assert.equal(threadBindSalaryFactor(c), 1);
  assert.equal(threadBindOutputFactor(c), 1);
});

test('B4 领导者不受影响，全局加成不丢失', () => {
  reset({ upgrades: { scooter: 2 } });
  S.cultists.push(mk(1, { leader: true }), mk(2, { boundTo: 'vehicles' }));
  const before = leaderGlobalMult();
  assert.equal(canBind(S.cultists[0]), false);
  releaseAllThreads();
  assert.equal(S.cultists[0].boundTo, null);
  assert.equal(leaderGlobalMult(), before, '全局加成与岗位无关');
});

test('B5 接线：班组按钮 / 事件委托 / QA 钩子 / Wiki 四处齐备', () => {
  assert.match(CREW_SRC, /data-release-all="1"/, '班组操作区应有一键收回按钮');
  assert.match(CREW_SRC, /\[data-release-all\]/, '应有事件委托分支');
  assert.match(CREW_SRC, /releaseAllThreads\(\)/, '应调用单一真源');
  assert.match(MAIN_SRC, /threadBind:\s*\{[^}]*releaseAllThreads/, 'QA 钩子应暴露');
  assert.match(WIKI_SRC, /「一键收回」把所有线程撤离岗位/, 'Wiki 应同步');
});

// ============ C. 反馈③ 去除已共事时间 ============
console.log('\n[C] 班组卡移除「已共事」工龄');

test('C1 crew.js 不再有 tenure 函数 / c-tenure 节点 / 已共事文案', () => {
  assert.doesNotMatch(CREW_SRC, /已共事/);
  assert.doesNotMatch(CREW_SRC, /c-tenure/);
  assert.doesNotMatch(CREW_SRC, /function tenure\(/);
  assert.doesNotMatch(CREW_SRC, /crew-stat dim/);
});

test('C2 个人产出动态刷新仍在（避免误删 c-out 更新链）', () => {
  assert.match(CREW_SRC, /class="c-out"/);
  assert.match(CREW_SRC, /outEls\[i\]\.textContent = fmt\(/);
  assert.match(CREW_SRC, /function refreshCrewDyn/);
});

test('C3 Wiki 班组说明不再写「工龄」', () => {
  assert.doesNotMatch(WIKI_SRC, /个人产出、工龄/);
});

// ============ D. 反馈④ 资源岗位优先、超线程最后 ============
console.log('\n[D] 智能分配：资源岗位优先填满，其余才进超线程');

test('D1 全部手动超线程 + 单岗位容量 ≥ 线程数 → 全部拉回资源岗位，超线程清零', () => {
  reset({ upgrades: { scooter: 5 } });
  for (let i = 1; i <= 5; i++) S.cultists.push(mk(i, { boundTo: HYPER_CONVERTER_ID }));
  autoAssignThreads();
  const l = loadOf();
  assert.equal(l.vehicles, 5, '探采 5 个槽全满');
  assert.equal(l.hyper, 0, '超线程清空');
  assert.equal(l.free, 0);
});

test('D2 多岗位容量总和 < 线程数 → 资源岗位全满，剩余恰好进超线程', () => {
  reset({ upgrades: { scooter: 3, atrium: 2 } });
  for (let i = 1; i <= 10; i++) S.cultists.push(mk(i, { boundTo: HYPER_CONVERTER_ID }));
  autoAssignThreads();
  const l = loadOf();
  assert.equal(l.vehicles, converterCapacity('vehicles'));
  assert.equal(l.atrium, converterCapacity('atrium'));
  assert.equal(l.hyper, 10 - l.vehicles - l.atrium);
});

test('D3 设施扩容后重排：原超线程线程被拉回来补满新增槽位', () => {
  reset({ upgrades: { scooter: 4 } });
  S.cultists.push(mk(1, { boundTo: 'vehicles' }));
  for (let i = 2; i <= 4; i++) S.cultists.push(mk(i, { boundTo: HYPER_CONVERTER_ID }));
  const n = autoAssignThreads();
  assert.ok(n > 0, '扩容后点击智能分配应产生可见调整');
  assert.equal(loadOf().vehicles, 4);
  assert.equal(loadOf().hyper, 0);
});

test('D4 混合空闲 / 超线程：资源岗位先填满，剩余才进超线程', () => {
  reset({ upgrades: { scooter: 4 } });
  for (let i = 1; i <= 3; i++) S.cultists.push(mk(i, { boundTo: HYPER_CONVERTER_ID }));
  for (let i = 4; i <= 5; i++) S.cultists.push(mk(i));
  autoAssignThreads();
  assert.equal(loadOf().vehicles, 4);
  assert.equal(loadOf().hyper, 1);
  assert.equal(loadOf().free, 0);
});

test('D5 无解锁 / 开关全关 → 全部超线程（v3.7.1 兜底语义不回退）', () => {
  reset();
  for (let i = 1; i <= 5; i++) S.cultists.push(mk(i));
  autoAssignThreads();
  assert.equal(loadOf().hyper, 5, '无模块解锁');

  reset({ upgrades: { scooter: 1 }, _probeEnabled: false });
  for (let i = 1; i <= 5; i++) S.cultists.push(mk(i, { boundTo: 'vehicles' }));
  autoAssignThreads();
  assert.equal(loadOf().hyper, 5, '开关全关');
  assert.equal(loadOf().free, 0, '不再有「释放为空闲」旁路');
});

test('D6 容量约束不突破（20 条线程 / 多岗位），且无空闲残留', () => {
  reset({ upgrades: { scooter: 2, atrium: 3 }, ptAutoHatch: true, ptHatchLv: 2 });
  for (let i = 1; i <= 20; i++) S.cultists.push(mk(i, { profession: i % 2 ? 'prospector' : 'distiller' }));
  autoAssignThreads();
  const l = loadOf();
  for (const t of RESOURCE_CONVERTER_IDS) {
    assert.ok(converterLoad(t) <= converterCapacity(t), `${t} 不得超容量`);
  }
  assert.equal(l.free, 0);
  assert.equal(Object.values(l).reduce((a, b) => a + b, 0), 20, '线程总数守恒');
});

test('D7 领导者恒不占岗位（含不进超线程），全局加成保持', () => {
  reset({ upgrades: { scooter: 2 } });
  S.cultists.push(mk(1, { leader: true, boundTo: 'vehicles' }), mk(2), mk(3));
  const before = leaderGlobalMult();
  autoAssignThreads();
  assert.equal(S.cultists[0].boundTo, null);
  assert.equal(canBind(S.cultists[0]), false);
  assert.equal(leaderGlobalMult(), before);
  assert.equal(S.cultists.filter(c => c.boundTo === HYPER_CONVERTER_ID).length, 0, '容量足够时无人进超线程');
});

test('D8 增量 only：其余线程固定，新线程优先补资源岗位空缺', () => {
  reset({ upgrades: { scooter: 3 } });
  const fixed = [mk(1, { boundTo: 'vehicles' }), mk(2, { boundTo: HYPER_CONVERTER_ID })];
  const newcomer = mk(3);
  S.cultists.push(...fixed, newcomer);
  autoAssignThreads(newcomer);
  assert.equal(fixed[0].boundTo, 'vehicles', '固定线程不打扰');
  assert.equal(fixed[1].boundTo, HYPER_CONVERTER_ID, '固定超线程不打扰');
  assert.equal(newcomer.boundTo, 'vehicles', '新线程补资源岗位而非直接进超线程');
});

test('D9 擅长职业归位仍生效', () => {
  reset({ upgrades: { scooter: 1, atrium: 1 } });
  S.cultists.push(mk(1, { profession: 'distiller' }), mk(2, { profession: 'prospector' }));
  autoAssignThreads();
  assert.equal(S.cultists[0].boundTo, 'atrium');
  assert.equal(S.cultists[1].boundTo, 'vehicles');
});

test('D10 源码不再有 spare 池 / 手动超线程保留语义（防接线回退）', () => {
  assert.doesNotMatch(TB_SRC, /const spare = \[\]/, '手动超线程池应已删除');
  assert.match(TB_SRC, /阶段 C：资源岗位分配完，剩下的才进超线程/, '兜底阶段注释应为新语义');
  assert.match(CREW_SRC, /原本手动设定的超线程也会先被拉回来补资源岗位/, '班组说明应同步');
  assert.match(WIKI_SRC, /原本手动设定的超线程也会先被拉回来补资源岗位/, 'Wiki 应同步');
});

// ============ E. 组合流程 ============
console.log('\n[E] 一键收回 → 智能分配 组合流程');

test('E1 收回后再分配：全部置为空闲，资源岗位填满、溢出进超线程', () => {
  reset({ upgrades: { scooter: 2, atrium: 1 } });
  for (let i = 1; i <= 6; i++) S.cultists.push(mk(i, { boundTo: i % 2 ? 'vehicles' : HYPER_CONVERTER_ID }));
  const released = releaseAllThreads();
  assert.equal(released, 6);
  assert.equal(loadOf().free, 6);
  autoAssignThreads();
  const l = loadOf();
  assert.equal(l.vehicles, 2);
  assert.equal(l.atrium, 1);
  assert.equal(l.hyper, 3);
  assert.equal(l.free, 0);
});
