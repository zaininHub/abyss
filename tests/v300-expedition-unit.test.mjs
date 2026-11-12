// v3.0.0 单测：远征系统（最大并发 / 星殖民地解锁 / 派遣与结算计时口径）
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const ex = await import('../src/modules/expedition.js');

function setup(extra = {}) {
  Object.assign(S, {
    ep: 1e9, rp: 1e6, es: 0, dm: 0, faith: 0, prestige: 1, upgrades: {}, tech: {},
    expeditions: [], colonies: [], delve: { depth: 0 }, resDiscovered: { ep: true },
  }, extra);
}

test('expedition.maxExpeditions：无 deep_space 科技 → 1 并发', () => {
  setup({ tech: {} });
  assert.equal(ex.maxExpeditions(), 1);
});

test('expedition.maxExpeditions：解锁 deep_space → 2 并发', () => {
  setup({ tech: { deep_space: true } });
  assert.equal(ex.maxExpeditions(), 2);
});

// v3.12.9：深空殖民改成「宠物/PT → RP → 深空探测」三级链，与星图 tab 同源。
//   旧断言只认 deep_space 科技，属设计变更，此处按新口径补双向矩阵。
test('expedition.starColoniesUnlocked：宠物 + RP + deep_space 三级链', () => {
  setup({ tech: {} });
  assert.equal(ex.starColoniesUnlocked(), false);
  setup({ tech: { deep_space: true } });
  assert.equal(ex.starColoniesUnlocked(), false, '宠物未解锁时不可绕过星图 tab 购买殖民');
  setup({ tech: { deep_space: true }, upgrades: { pt_vault: 1 } });
  assert.equal(ex.starColoniesUnlocked(), false, '缺 RP 锚点');
  setup({ tech: { deep_space: true }, upgrades: { pt_vault: 1, rp_vault: 1 } });
  assert.equal(ex.starColoniesUnlocked(), true);
});

test('expedition.tickExpeditions：到期远征（startsAt+duration ≤ now）被结算移出', () => {
  setup();
  // 远征对象实际字段：startsAt / duration(ms) / galaxyId；完成条件 now - startsAt >= duration
  const probe = { id: 'p1', galaxyId: 'moon', startsAt: Date.now() - 10000, duration: 1000 };
  S.expeditions = [probe];
  ex.tickExpeditions();
  assert.equal(S.expeditions.includes(probe), false, '已到期远征应被结算移出');
});

test('expedition.tickExpeditions：未到期远征保持进行中', () => {
  setup();
  const probe = { id: 'p2', galaxyId: 'moon', startsAt: Date.now(), duration: 60000 };
  S.expeditions = [probe];
  ex.tickExpeditions();
  assert.equal(S.expeditions.includes(probe), true, '未到期远征应保持');
});
