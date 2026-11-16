// v4.0.5 存档完整性单测（纯 Node）：进度不被代码常量覆盖 + 职级点整数化
//
// 玩家疑问：「是不是把进度也写进了代码，导致更新后进度覆盖？」
// 本文件把答案锁成不变量，防止未来任何一次改动把它们改坏：
//   A. 默认状态里不带任何「进度种子」（线程/任务/职级/EP 都是空值或 BALANCE 起点）；
//   B. load() 在缺省补齐与默认值合并中，**存档值永远压过默认值**（顺序写反 = 回档）；
//   C. 任务进度（progress / base）与任务累加器（_gainRes）原样往返，不被规范化逻辑改动；
//   D. 存档读崩时不再静默丢档：原始串备份到 *_broken_backup 后回落默认值；
//   E. 职级点恒为整数（旧档 1.4142… 一次性收敛，扣费后仍是整数）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- localStorage 内存实现（必须在 import state.js 之前挂好：模块顶层会执行一次 load()）----
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); },
  clear: () => mem.clear(),
};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  body: { classList: { add() {}, remove() {} } },
  addEventListener() {},
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const SAVE_KEY = 'abyss_idle_v2';
const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'state.js'), 'utf8');

// 种子：一份「打到中期」的存档，进度字段全部非默认值
const SEED = {
  _version: 6,
  ep: 12345, runEarned: 987654, earnedFull: 4321, allTimeEp: 1e7,
  chapter: '33', prestige: 7, prestigePoints: 9, es: 12,
  upgrades: { scribble: 5, reserve_bin: 20 }, tech: { ai_core: true }, focusLevel: 12,
  cultists: [{ id: 1, name: '线程 1', mood: '正常', profession: 'acolyte', level: 3, xp: 40, boundTo: '' }],
  _gainRes: { ep: 5555, rp: 7 }, _spentRes: { ep: 100 }, _buyRes: { ep: 3 },
  projects: [{
    type: 'res', resKey: 'ep', metric: 'gain', name: '产能冲刺', desc: '限时内累计获得 EP',
    goal: 1000, progress: 300, startsAt: Date.now(), deadline: Date.now() + 600000,
    reward: { kind: 'ep', amount: 200 }, status: 'active', pendingAt: 0, base: 5255,
  }],
  achievements: { a_first_click: true }, storylinesCompleted: ['default'],
  moduleUnlocks: { reincarn: true, bazaar: false },
  lastSeen: Date.now(), startTime: Date.now(),
};

const seed = (patch = {}) => { mem.set(SAVE_KEY, JSON.stringify({ ...SEED, ...patch })); };
const { load, defaultState } = await import('../src/state.js');

console.log('[A] 默认状态里不带「进度种子」');

test('A1 defaultState 的进度字段全是空值 / 起点值，不含任何演示进度', () => {
  const d = defaultState();
  assert.deepEqual(d.cultists, [], '默认不该有线程（否则每次新档自带进度）');
  assert.deepEqual(d.projects, [], '默认不该有任务');
  assert.equal(d.prestige, 0);
  assert.equal(d.prestigePoints, 0);
  assert.equal(d.es, 0);
  assert.equal(d.chapter, '1');
  assert.deepEqual(d.upgrades, {}, '默认不该预置任何升级等级');
  assert.deepEqual(d.achievements, {});
  assert.ok(Number.isFinite(d.ep), 'EP 起点必须是数值');
});

test('A2 源码里没有把存档写死的痕迹：load 不内联任何存档字段字面量', () => {
  assert.ok(!/localStorage\.setItem\(SAVE_KEY,\s*JSON\.stringify\(\{/.test(SRC), '不得向存档写入常量对象');
  assert.ok(!/cultists:\s*\[\s*\{/.test(SRC), '源码不得出现预置线程');
  assert.ok(!/projects:\s*\[\s*\{/.test(SRC), '源码不得出现预置任务');
});

console.log('[B] 存档值永远压过默认值（顺序反了就是回档）');

test('B1 load 的合并顺序必须是 {...默认, ...存档}', () => {
  assert.ok(/\{\s*\.\.\.defs,\s*\.\.\.normalizeCrew\(migrated\)/.test(SRC),
    'load() 必须让存档（migrated）覆盖默认值（defs），顺序写反会把玩家进度冲成默认值');
});

test('B2 中期存档加载后每个进度字段都保持原值', () => {
  seed();
  const s = load();
  assert.equal(s.ep, SEED.ep);
  assert.equal(s.runEarned, SEED.runEarned);
  assert.equal(s.allTimeEp, SEED.allTimeEp);
  assert.equal(s.chapter, SEED.chapter);
  assert.equal(s.prestige, SEED.prestige);
  assert.equal(s.prestigePoints, SEED.prestigePoints);
  assert.equal(s.es, SEED.es);
  assert.equal(s.focusLevel, SEED.focusLevel);
  assert.equal(s.upgrades.scribble, 5);
  assert.equal(s.upgrades.reserve_bin, 20);
  assert.equal(s.cultists.length, 1);
  assert.equal(s.cultists[0].level, 3);
  assert.deepEqual(s.achievements, SEED.achievements);
  assert.equal(s.moduleUnlocks.reincarn, true);
});

test('B3 缺字段用默认值补齐，但不改写已有字段（新增版本不冲掉旧进度）', () => {
  seed({ faith: undefined, religion: undefined });
  const s = load();
  assert.equal(s.ep, SEED.ep, '已有字段必须保留');
  assert.ok(Array.isArray(s.projects) && s.projects.length === 1);
});

console.log('[C] 任务进度 / 累加器原样往返');

test('C1 进行中任务的 progress / base / goal 不被加载逻辑改动', () => {
  seed();
  const s = load();
  const p = s.projects[0];
  assert.equal(p.progress, 300);
  assert.equal(p.base, 5255);
  assert.equal(p.goal, 1000);
  assert.equal(p.status, 'active');
});

test('C2 _gainRes / _spentRes / _buyRes 原样保留（任务进度基准不会被重置）', () => {
  seed();
  const s = load();
  assert.equal(s._gainRes.ep, 5555);
  assert.equal(s._gainRes.rp, 7);
  assert.equal(s._spentRes.ep, 100);
  assert.equal(s._buyRes.ep, 3);
});

test('C3 二次读写（save → load）幂等，进度不漂移', () => {
  seed();
  const a = load();
  mem.set(SAVE_KEY, JSON.stringify(a));
  const b = load();
  assert.equal(b.ep, a.ep);
  assert.equal(b.projects[0].progress, a.projects[0].progress);
  assert.equal(b._gainRes.ep, a._gainRes.ep);
  assert.equal(b.prestigePoints, a.prestigePoints);
});

console.log('[D] 读崩不静默丢档');

test('D1 损坏存档：不抛错、返回默认值、原始串已备份', () => {
  mem.set(SAVE_KEY, '{ this is not json ');
  const s = load();
  assert.equal(s.ep, defaultState().ep, '损坏时回落默认值');
  assert.equal(mem.get(SAVE_KEY), '{ this is not json ', '原始存档不得被删除');
  assert.equal(mem.get(SAVE_KEY + '_broken_backup'), '{ this is not json ', '必须先备份原始串');
});

console.log('[E] 职级点恒为整数');

test('E1 旧档残留小数职级点在加载时收敛为整数', () => {
  seed({ prestigePoints: 1.4142135623730951 });
  const s = load();
  assert.equal(s.prestigePoints, 1);
  assert.ok(Number.isInteger(s.prestigePoints));
});

test('E2 负值 / 非数字职级点被钳到 0', () => {
  seed({ prestigePoints: -3.2 });
  assert.equal(load().prestigePoints, 0);
  seed({ prestigePoints: 'abc' });
  assert.equal(load().prestigePoints, 0);
});

test('E3 结算与买断读写的都是整数（源码级：写入口都过 round）', () => {
  const eco = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'modules', 'prestige.js'), 'utf8');
  assert.ok(/S\.prestigePoints = Math\.max\(0, Math\.round/.test(eco), '晋升结算必须取整');
  const mu = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'modules', 'moduleUnlocks.js'), 'utf8');
  assert.ok(/S\.prestigePoints = Math\.max\(0, Math\.round\(S\.prestigePoints\) - st\.cost\)/.test(mu), 'PP 买断扣费必须保持整数');
});
