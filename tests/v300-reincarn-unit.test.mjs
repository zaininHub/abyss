// v3.0.0 单测：轮回系统（reincarnReady 门槛 / doReincarn 跨周期保留与深度重置）
// 依赖已解耦到 src/core/runtime.js，askConfirm 在非 DOM 下自动确认，故可单测。
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const rc = await import('../src/modules/reincarn.js');
const eco = await import('../src/modules/economy.js');

function setup(extra = {}) {
  Object.assign(S, {
    ep: 1e9, allTimeEp: 1e9, runEarned: 1e9, rp: 5000, es: 100, dm: 0, faith: 1e6, pt: 0,
    prestige: 1, prestigePoints: 1, abyssEcho: 0, reincarned: 0, achievements: { v_first: 1 },
    upgrades: { scribble: 3 }, tech: { ai_core: true }, focusLevel: 2, projects: [], cultists: [],
    wageState: { state: 'ok' }, corruption: 0,
    delve: { depth: 5, active: false, unlocked: true }, religion: { unlocked: true, branch: 'sun', seal: 1 },
    riftEmber: 300, riftsSealed: 3, bazaar: { unlocked: true, trades: 12 }, resDiscovered: { ep: true, es: true, faith: true, rp: true },
    storylinesCompleted: [], storyline: 'line_order', collapsed: false, _collapseAt: 0, _collapseChoicePending: false,
    policies: {}, policyRuns: [], relicLegacy: {}, chapters: 9,
  }, extra);
}

test('reincarnReady：本局晋升 < 1 → 未就绪', () => {
  setup({ prestige: 0 });
  const r = rc.reincarnReady();
  assert.equal(r.ok, false);
  assert.match(r.reason || '', /晋升/);
});

test('reincarnReady：本局累计 EP < 10 亿 → 未就绪', () => {
  setup({ runEarned: 1e8, prestige: 1 });
  const r = rc.reincarnReady();
  assert.equal(r.ok, false);
  assert.match(r.reason || '', /EP/);
});

test('reincarnReady：深渊吞噬中（collapsed）→ 未就绪', () => {
  setup({ collapsed: true });
  const r = rc.reincarnReady();
  assert.equal(r.ok, false);
});

test('reincarnReady：满足条件 → 就绪并返回回响增益', () => {
  setup();
  const r = rc.reincarnReady();
  assert.equal(r.ok, true, r.reason || '应就绪');
  assert.ok(r.echo > 0, '回响增益应 > 0');
});

test('doReincarn：深度重置本局并保留跨周期资产', () => {
  setup();
  const before = {
    rp: S.rp, es: S.es, delveDepth: S.delve.depth, bazaarTrades: S.bazaar.trades,
    achievements: Object.keys(S.achievements).length, religion: S.religion.unlocked,
    prestige: S.prestige, echo: S.abyssEcho, reincarned: S.reincarned,
    storylineDone: S.storylinesCompleted.length,
  };
  const r = rc.doReincarn();
  assert.equal(r.ok, true, r.reason || '应成功');
  assert.ok(r.gain > 0, '应获得回响');
  assert.equal(S.abyssEcho, before.echo + r.gain, '回响应累计');
  assert.equal(S.reincarned, before.reincarned + 1, '轮回次数 +1');
  // 跨周期保留
  // v3.10.2 ④：RP 余额仍是跨周期保留，但本局扩容与产出基座归零后上限回落到新档值，
  // 超限部分必须按新上限钳制，否则会出现「余额 31m / 上限 3,000」与超上限购买。
  assert.equal(S.rp, Math.min(before.rp, eco.rpCap()), 'RP 跨周期保留并钳到重置后的新上限');
  assert.ok(S.rp <= eco.rpCap(), '余额不得高于当前上限');
  assert.equal(S.es, before.es, 'ES 跨周期保留');
  assert.equal(S.delve.depth, before.delveDepth, '深潜层深保留');
  assert.equal(S.bazaar.trades, before.bazaarTrades, '集市笔数保留');
  assert.equal(Object.keys(S.achievements).length, before.achievements, '成就保留');
  assert.equal(S.religion.unlocked, before.religion, '宗教保留');
  assert.equal(S.prestige, before.prestige, '职级保留');
  assert.ok(S.storylinesCompleted.includes('line_order'), '已完成故事线保留');
  // 本局深度重置
  assert.equal(S.ep, 0, 'EP 清零');
  assert.equal(S.runEarned, 0, '本局累计 EP 清零');
  assert.deepEqual(S.upgrades, {}, '升级本局清空');
  assert.deepEqual(S.tech, {}, '科技本局清空');
  assert.deepEqual(S.policies, {}, '政策本局清空');
});
