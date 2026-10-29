// v3.0.0 ① 深潜 EP 化回归测试
// 原缺陷：下潜只吃 DM，深潜与 EP 主经济完全脱钩（终局 EP 无出口、存储扩容对下潜毫无意义）。
// 现口径：EP 主成本（按存储上限比例 × 1.12^层深，封顶 75%）+ DM 辅助成本 + 深潜中每秒 EP 维持开销。
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const delve = await import('../src/modules/delve.js');
const { DELVE, diveEpCost, diveEpRatio, delveEpUpkeep, diveCost, milestoneVs } = await import('../src/data/delve.js');
const { epStorageCap } = await import('../src/modules/economy.js');

function setup(extra = {}) {
  Object.assign(S, {
    ep: 1e12, rp: 0, es: 3, dm: 1e6, vs: 0, faith: 0, pt: 0, riftEmber: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: { unlocked: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, es: true, faith: true, pt: true, dm: true },
    delve: { unlocked: true, active: false, depth: 0, up: {}, mileDone: {} },
    corruption: 0, policies: {}, policyRerolls: {}, vowPolicyBoost: false,
  }, extra);
}

test('v3.0.0 ①：下潜消耗 EP（此前只扣 DM）', () => {
  setup();
  const cap = epStorageCap();
  const epCost = diveEpCost(0, cap, 0);
  assert.ok(epCost > 0, '下潜 EP 成本 > 0');
  assert.equal(Math.round(epCost), Math.round(cap * DELVE.epDiveRatio), 'Lv.0 EP 成本 = 存储上限 × 4%');
  const before = { ep: S.ep, dm: S.dm };
  const r = delve.startDelve();
  assert.equal(r.ok, true, r.reason);
  assert.equal(S.ep, before.ep - epCost, '下潜扣 EP');
  assert.equal(S.dm, before.dm - diveCost(0), '下潜同时扣 DM（辅助成本）');
  assert.equal(delve.delveDepth(), 1);
});

test('v3.0.0 ①：EP 不足无法下潜（合理门槛）', () => {
  setup({ ep: 1, dm: 1e6 });
  const r = delve.startDelve();
  assert.equal(r.ok, false, 'EP 不足应拒绝下潜');
  assert.match(r.reason, /EP 不足/);
  assert.equal(delve.delveDepth(), 0, '未下潜则层深不变');
  assert.equal(S.dm, 1e6, '失败不扣任何资源');
});

test('v3.0.0 ①：EP 成本随层深指数涨且封顶 75% 上限（防死锁）', () => {
  const cap = 1e6;
  const c0 = diveEpCost(0, cap, 0);
  const c10 = diveEpCost(10, cap, 0);
  assert.ok(c10 > c0 * 2, '层深 10 成本显著高于层深 0');
  assert.equal(diveEpRatio(100, 0), DELVE.epDiveRatioCap, '极深层封顶 75% 上限');
  assert.ok(diveEpCost(100, cap, 0) <= cap * DELVE.epDiveRatioCap + 1, '单次下潜永不超过上限的 75%');
});

test('v3.0.0 ①：耐压舱同时降低下潜 EP 成本与维持开销', () => {
  const cap = 1e6;
  assert.ok(diveEpCost(5, cap, 3) < diveEpCost(5, cap, 0), '耐压舱降低下潜 EP 成本（-8%/级）');
  assert.ok(delveEpUpkeep(10, cap, 3) < delveEpUpkeep(10, cap, 0), '耐压舱降低维持开销（-25%/级）');
  assert.equal(delveEpUpkeep(0, cap, 0), 0, '未下潜无维持开销');
});

test('v3.0.0 ①：深潜中每秒烧 EP，EP 归零强制上浮（保留层深）', () => {
  setup();
  delve.startDelve();
  assert.equal(delve.delveActive(), true);
  const cap = epStorageCap();
  const upkeep = delveEpUpkeep(1, cap, 0);
  assert.ok(upkeep > 0, '层深 1 有维持开销');
  const ep0 = S.ep;
  delve.tickDelve(1);
  assert.ok(S.ep < ep0, '深潜中 EP 被维持开销消耗');
  assert.equal(delve.delveActive(), true, 'EP 充足时不会被强制上浮');
  // 抽干 EP → 强制上浮
  S.ep = 1;
  delve.tickDelve(10);
  assert.equal(delve.delveActive(), false, 'EP 耗尽 → 强制上浮');
  assert.equal(delve.delveDepth(), 1, '强制上浮保留层深（不吞进度）');
});

test('v3.0.0 ①：上浮后停止 EP 维持开销', () => {
  setup();
  delve.startDelve();
  delve.stopDelve();
  const ep0 = S.ep;
  delve.tickDelve(30);
  assert.equal(S.ep, ep0, '上浮后不再烧 EP');
});

test('v3.0.0 扩展：里程碑 6 档 + 回声定位加成', () => {
  assert.equal(DELVE.milestones.length, 6, '里程碑 4 → 6 档');
  assert.ok(DELVE.milestones.some(m => m.depth === 75));
  assert.ok(DELVE.milestones.some(m => m.depth === 150));
  const m = DELVE.milestones.find(x => x.depth === 10);
  assert.equal(milestoneVs(m, 0), m.vs, '无回声定位 = 原值');
  assert.ok(milestoneVs(m, 5) > m.vs, '回声定位提升里程碑奖励');
});

test('v3.0.0 扩展：深潜升级树 6 → 8 项（耐压舱 / 回声定位）', () => {
  assert.equal(Object.keys(DELVE.upgrades).length, 8);
  assert.ok(DELVE.upgrades.hull && DELVE.upgrades.sonar);
});
