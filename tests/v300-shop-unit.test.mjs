// v3.0.0 单测：核心商店购买链路（buyUpgrade / buyThreadUpgrade / buyVehicle / buyDmUpgrade / buyOfflineUpgrade）
// 依赖已下沉到 src/core/runtime.js（DOM 无关），故可在纯 Node 下直接单测。
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const shop = await import('../src/modules/shop.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const { computeCps, totalDrainPerSec } = await import('../src/modules/economy.js');

const scribble = UPGRADES.find(u => u.id === 'scribble');
const cpu = UPGRADES.find(u => u.id === 'cpu');

function baseState(extra = {}) {
  Object.assign(S, {
    ep: 1e12, allTimeEp: 1e12, runEarned: 1e9, rp: 1e6, es: 0, dm: 1e6, faith: 0, pt: 0,
    prestige: 1, prestigePoints: 0, abyssEcho: 0, reincarned: 0,
    upgrades: {}, tech: {}, buildings: {}, eternal: {}, religion: {}, delve: { depth: 0 },
    cultists: [], wageState: { state: 'ok' }, policies: {}, policyRuns: [], resDiscovered: {},
    bazaar: { unlocked: false, trades: 0 }, totalBuys: 0, lazySince: null, collapsed: false,
  }, extra);
}

test('shop.buyUpgrade：净产出 ≤ 0 时触发「产出不足」禁购（v2.8.30③）', () => {
  baseState(); // 无生产、无消耗 → computeCps - drain = 0 → 触发禁购
  assert.equal(computeCps() - totalDrainPerSec() <= 0, true, '空局净产出应为 ≤0');
  const r = shop.buyUpgrade(scribble);
  assert.equal(r.ok, false, `空局购买应被禁止，实际 ${JSON.stringify(r)}`);
  assert.equal(S.upgrades.scribble || 0, 0, '不应扣减/增加升级');
});

test('shop.buyUpgrade：净产出 > 0 时成功购买并扣 EP / 计 totalBuys', () => {
  baseState({ upgrades: { scribble: 10 } }); // 10 × 0.12 cps = 1.2/s，drain 0 → 闸门放行
  assert.ok(computeCps() - totalDrainPerSec() > 0, '应净产出为正');
  const ep0 = S.ep, tb0 = S.totalBuys;
  const r = shop.buyUpgrade(scribble); // buyUpgrade 成功时返回布尔 true
  assert.equal(r, true, `购买应成功，实际 ${JSON.stringify(r)}`);
  assert.equal(S.upgrades.scribble, 11, 'scribble 应 10→11');
  assert.equal(S.totalBuys, tb0 + 1, 'totalBuys 应 +1');
  assert.ok(S.ep < ep0, '应扣减 EP');
});

test('shop.buyThreadUpgrade：线程升级成功（cpu 0→1）', () => {
  baseState();
  const r = shop.buyThreadUpgrade(cpu);
  assert.equal(r, true, `线程购买应成功，实际 ${r}`);
  assert.equal(S.upgrades.cpu, 1);
  assert.equal(S.totalBuys, 1);
});

test('shop.buyVehicle：载具购买成功（合成 u）', () => {
  baseState();
  const r = shop.buyVehicle({ id: 'scooter', base: 100 });
  assert.equal(r, true, `载具购买应成功，实际 ${r}`);
  assert.equal(S.upgrades.scooter, 1);
});

test('shop.buyDmUpgrade：DM 消耗升级成功（dmsight）', () => {
  baseState();
  const dm0 = S.dm;
  const r = shop.buyDmUpgrade({ id: 'dmsight', dmCost: 5 });
  assert.equal(r, true, `DM 升级应成功，实际 ${r}`);
  assert.equal(S.upgrades.dmsight, 1);
  assert.equal(S.dm, dm0 - 5, '应扣 5 DM');
});

test('shop.buyOfflineUpgrade：EP+RP 双消耗升级成功（合成 o）', () => {
  baseState();
  const ep0 = S.ep, rp0 = S.rp;
  const r = shop.buyOfflineUpgrade({ id: '_off', epCost: 0, cost: 100, req: null });
  assert.equal(r, true, `离线升级应成功，实际 ${r}`);
  assert.equal(S.offUpgrades && S.offUpgrades._off, true);
  assert.equal(S.rp, rp0 - 100, '应扣 100 RP');
});

test('shop.buyUpgrade：EP 不足时购买失败且不改变状态', () => {
  baseState({ upgrades: { scribble: 10 }, ep: 1 }); // 净产出正，但 EP 远低于成本
  const r = shop.buyUpgrade(scribble);
  assert.equal(r, false, `EP 不足应失败，实际 ${r}`);
  assert.equal(S.upgrades.scribble, 10, 'scribble 不应变化');
});
