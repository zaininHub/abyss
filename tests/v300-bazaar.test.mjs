// v3.0.0 大模块：深渊集市回归测试
// 覆盖：解锁门控 / 汇率波动区间 / 库存限购与自然恢复 / 交易扣款与到账 / 集市等级门槛 /
//       手动刷新（EP 递增 · 回响）/ 政策联动（关税/自由贸易/垄断）/ 跨周期保留口径
import assert from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const bz = await import('../src/modules/bazaar.js');
const { BAZAAR, bazaarTier, rollRate, bazaarRefreshEpCost, dealerById } = await import('../src/data/bazaar.js');
const { epStorageCap } = await import('../src/modules/economy.js');

function setup(extra = {}) {
  Object.assign(S, {
    ep: 1e12, rp: 0, es: 0, dm: 0, vs: 0, faith: 0, pt: 0, riftEmber: 0, abyssEcho: 0,
    prestige: 1, upgrades: {}, buildings: {}, tech: {}, religion: {},
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, es: false, faith: false, pt: false, dm: false },
    delve: {}, policies: {}, policyRerolls: {}, vowPolicyBoost: false,
    bazaar: { unlocked: false, trades: 0, refreshCount: 0, shuffleTimer: 0, regenTimer: 0, rates: {}, stock: {} },
  }, extra);
}

test('v3.0.0 集市：解锁门控 = 职级 ≥1 + RP 已发现', () => {
  setup({ prestige: 0 });
  assert.equal(bz.canUnlockBazaar(), false, '职级不足不可解锁');
  setup({ prestige: 1, resDiscovered: { rp: false } });
  assert.equal(bz.canUnlockBazaar(), false, '未发现 RP 不可解锁');
  setup();
  assert.equal(bz.canUnlockBazaar(), true);
  assert.equal(bz.unlockBazaar().ok, true);
  assert.equal(bz.bazaarUnlocked(), true);
});

test('v3.0.0 集市：开张后 6 位商人就位、汇率在波动区间内、库存满', () => {
  setup();
  bz.unlockBazaar();
  for (const d of BAZAAR.dealers) {
    const r = bz.bazaarRateOf(d.id);
    assert.ok(r >= 1 - BAZAAR.volatility - 1e-9 && r <= 1 + BAZAAR.volatility + 1e-9, `${d.id} 汇率越界：${r}`);
    assert.ok(bz.bazaarStockOf(d.id) > 0, `${d.id} 初始库存应 > 0`);
  }
  assert.equal(BAZAAR.dealers.length, 6);
});

test('v3.0.0 集市：交易扣款与到账（EP → RP）', () => {
  setup();
  bz.unlockBazaar();
  const lot = bz.lotOf('forge');
  const ep0 = S.ep, rp0 = S.rp, st0 = bz.bazaarStockOf('forge');
  const r = bz.trade('forge');
  assert.equal(r.ok, true, r.reason);
  assert.equal(S.ep, ep0 - lot.give, '扣 EP');
  assert.ok(S.rp > rp0, '到账 RP');
  assert.equal(bz.bazaarStockOf('forge'), st0 - 1, '库存 -1');
  assert.equal(bz.bazaarTrades(), 1, '成交笔数 +1');
});

test('v3.0.0 集市：库存耗尽后拒绝成交，自然恢复可补货', () => {
  setup();
  bz.unlockBazaar();
  const d = dealerById('forge');
  let guard = 0;
  while (bz.bazaarStockOf('forge') > 0 && guard++ < 20) bz.trade('forge');
  const r = bz.trade('forge');
  assert.equal(r.ok, false, '库存为 0 应拒绝');
  assert.match(r.reason, /库存已空/);
  bz.tickBazaar(BAZAAR.stockRegenSec + 1);
  assert.ok(bz.bazaarStockOf('forge') >= 1, '库存自然恢复 +1');
  assert.ok(bz.bazaarStockOf('forge') <= bz.bazaarStockMax(d), '恢复不超过上限');
});

test('v3.0.0 集市：支付资源不足时拒绝且不扣款', () => {
  setup({ rp: 0 });
  bz.unlockBazaar();
  // 走私信道需 RP；先把等级刷到可交易（tier 0 即可）
  const r = bz.trade('smuggle');
  assert.equal(r.ok, false);
  assert.match(r.reason, /不足/);
  assert.equal(S.rp, 0, '失败不扣资源');
});

test('v3.0.0 集市：汇率每 45s 波动一次（波动存在但受区间约束）', () => {
  setup();
  bz.unlockBazaar();
  const before = BAZAAR.dealers.map(d => bz.bazaarRateOf(d.id));
  bz.tickBazaar(BAZAAR.shuffleSec + 1);
  const after = BAZAAR.dealers.map(d => bz.bazaarRateOf(d.id));
  const changed = before.some((v, i) => v !== after[i]);
  assert.ok(changed, '汇率应重掷');
  for (const v of after) assert.ok(v >= 1 - BAZAAR.volatility - 1e-9 && v <= 1 + BAZAAR.volatility + 1e-9);
});

test('v3.0.0 集市：集市等级按成交笔数升级（波动下限抬高，不消除波动）', () => {
  assert.equal(bazaarTier(0), 0);
  assert.equal(bazaarTier(8), 1);
  assert.equal(bazaarTier(24), 2);
  assert.equal(bazaarTier(150), 4);
  const lo0 = rollRate(0, () => 0);
  const lo4 = rollRate(4, () => 0);
  assert.ok(lo4 > lo0, '等级抬高波动下限');
  assert.ok(lo4 < 1, '永不消除波动（下限仍 < 1）');
});

test('v3.0.0 集市：高阶商人需集市等级（典当核心 Lv.1 / 虚空商行 Lv.2）', () => {
  setup();
  bz.unlockBazaar();
  S.faith = 1e6;
  const r = bz.trade('pawn');
  assert.equal(r.ok, false, '等级不足应拒绝');
  assert.match(r.reason, /集市等级/);
  S.bazaar.trades = BAZAAR.tiers[1];
  const r2 = bz.trade('pawn');
  assert.equal(r2.ok, true, r2.reason);
});

test('v3.0.0 集市：虚空商行在深潜解锁前不收货', () => {
  setup();
  bz.unlockBazaar();
  S.bazaar.trades = BAZAAR.tiers[2];
  const r = bz.trade('voidfirm');
  assert.equal(r.ok, false);
  assert.match(r.reason, /深潜/);
  S.delve = { unlocked: true, depth: 1, up: {} };
  const r2 = bz.trade('voidfirm');
  assert.equal(r2.ok, true, r2.reason);
});

test('v3.0.0 集市：手动刷新——EP 成本 ×1.6^n 或 1 回响（回响不计次数）', () => {
  setup();
  bz.unlockBazaar();
  const cap = epStorageCap();
  const c0 = bz.bazaarRefreshCost();
  assert.equal(c0, bazaarRefreshEpCost(cap, 0), '首次刷新 = 上限 × 2%');
  const ep0 = S.ep;
  assert.equal(bz.refreshBazaar(false).ok, true);
  assert.equal(S.ep, ep0 - c0, '扣 EP');
  const c1 = bz.bazaarRefreshCost();
  assert.equal(c1, bazaarRefreshEpCost(cap, 1), '第二次刷新成本 ×1.6');
  assert.ok(c1 > c0, '刷新成本递增（防无脑刷最优汇率）');
  // 回响刷新不计入次数
  S.abyssEcho = 3;
  const n0 = S.bazaar.refreshCount;
  assert.equal(bz.refreshBazaar(true).ok, true);
  assert.equal(S.abyssEcho, 2, '扣 1 回响');
  assert.equal(S.bazaar.refreshCount, n0, '回响刷新不推高 EP 刷新次数');
  S.abyssEcho = 0;
  assert.equal(bz.refreshBazaar(true).ok, false, '回响不足应拒绝');
});

test('v3.0.0 集市：政策联动（关税 +15% 汇率 / 自由贸易 +2 库存 +50% 刷新 / 垄断 -40% 刷新 -20% 所得）', () => {
  setup();
  bz.unlockBazaar();
  S.bazaar.rates.forge = 1.0; // 固定汇率，隔离随机波动，单测只验证政策乘区
  const baseStock = bz.bazaarStockMax(dealerById('forge'));
  const baseGain = bz.lotOf('forge').get;
  // 关税同盟：汇率 +15%
  S.policies = { market: { id: 'tariff', lv: 1 } };
  assert.ok(Math.abs(bz.lotOf('forge').mult - bz.bazaarRateOf('forge') * 1.15) < 1e-9, '关税同盟汇率 ×1.15');
  assert.ok(bz.lotOf('forge').get > baseGain, '关税同盟提高所得');
  // 自由贸易：库存 +2、刷新成本 +50%
  S.policies = { market: { id: 'freetrade', lv: 1 } };
  assert.equal(bz.bazaarStockMax(dealerById('forge')), baseStock + 2, '自由贸易库存 +2');
  assert.equal(bz.bazaarRefreshCost(), Math.round(bazaarRefreshEpCost(epStorageCap(), 0) * 1.5), '自由贸易刷新 +50%');
  // 垄断协议：刷新 -40%、所得 -20%
  S.policies = { market: { id: 'monopoly', lv: 1 } };
  assert.equal(bz.bazaarRefreshCost(), Math.round(bazaarRefreshEpCost(epStorageCap(), 0) * 0.6), '垄断刷新 -40%');
  assert.ok(bz.lotOf('forge').get < baseGain, '垄断所得 -20%');
});

test('v3.0.0 集市：周期政策组 3 → 4（新增集市组，组内互斥）', async () => {
  const { POLICY_GROUPS } = await import('../src/data/policies.js');
  assert.equal(POLICY_GROUPS.length, 4, '政策组 4 组');
  const g = POLICY_GROUPS.find(x => x.id === 'market');
  assert.ok(g, '存在集市政策组');
  assert.equal(g.policies.length, 3);
  const keys = g.policies.map(p => p.id);
  assert.ok(keys.includes('tariff') && keys.includes('freetrade') && keys.includes('monopoly'));
});

test('v3.0.0 集市：跨周期只保留成交笔数（库存/汇率/刷新次数每轮重置）', () => {
  setup();
  bz.unlockBazaar();
  bz.trade('forge');
  bz.refreshBazaar(false);
  const trades = bz.bazaarTrades();
  const tier = bz.bazaarTierNow();
  bz.resetBazaarRun();
  assert.equal(bz.bazaarTrades(), trades, '成交笔数保留');
  assert.equal(bz.bazaarTierNow(), tier, '集市等级保留');
  assert.equal(S.bazaar.refreshCount, 0, '刷新次数每轮重置');
  assert.ok(bz.bazaarStockOf('forge') > 0, '库存每轮补满');
  // 源码口径：bazaar 在 crossRun（跨周期保留），prestige/reincarn 调 resetBazaarRun
  const st = readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');
  assert.match(st, /'relics', 'bazaar'/, 'state.js crossRun 含 bazaar');
  const pr = readFileSync(new URL('../src/modules/prestige.js', import.meta.url), 'utf8');
  const rc = readFileSync(new URL('../src/modules/reincarn.js', import.meta.url), 'utf8');
  assert.ok(pr.includes('resetBazaarRun()'), '晋升重置集市本局状态');
  assert.ok(rc.includes('resetBazaarRun()'), '轮回重置集市本局状态');
});
