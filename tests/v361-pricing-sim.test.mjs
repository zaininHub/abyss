// v3.6.1 复杂单测：纯价格内核 + 游戏推进 mock 模拟
// 仅 import src/core/pricing.js（无 S / 无 DOM），验证：
//   ① 几何单价「首价便宜、后期指数上涨」（cost(n+1)/cost(n) ≡ growth）
//   ② 批量成本 = 逐单 ceil 求和（闭合式偏差回归）
//   ③ 由目标反推增长率（deriveGeomGrowth 往返一致）
//   ④ 复利加成（线性 / 乘算）
//   ⑤ 等比级数前 n 项和（仓库扩容口径）
//   ⑥ 幂律规模（转生需求）
//   ⑦ simulateProgression：前期买得多、后期买得少（指数墙），且首购极早
//   ⑧ 加成复利：buff 使同一里程碑提前达成（加成亦是）
//   ⑨ 按预期天数推算定价：deriveGeomGrowth 设定增长 → 里程碑在第 expectedDay 前后可达
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  geomCostBase, bulkGeomCost, deriveGeomGrowth, compoundBuff,
  geomSeriesSum, powerScale, simulateProgression,
} from '../src/core/pricing.js';

// ① 几何单价：首价便宜、后期指数上涨
test('几何单价：cost(n+1)/cost(n) ≡ growth（指数曲线）且首价很小', () => {
  const base = 10, growth = 1.3;
  const c0 = geomCostBase({ base, growth, owned: 0, qty: 1 });
  const c1 = geomCostBase({ base, growth, owned: 1, qty: 1 });
  const c2 = geomCostBase({ base, growth, owned: 2, qty: 1 });
  assert.ok(c0 < 50, `首价应很小，实际 ${c0}`);
  assert.equal(Math.round(c1 / c0), Math.round(growth), '相邻比 ≈ growth');
  // 指数性：第 20 级单价应远大于首价（数量级跃迁）
  const c20 = geomCostBase({ base, growth, owned: 20, qty: 1 });
  assert.ok(c20 > c0 * 100, `后期应指数上涨：${c0} → ${c20}`);
});

// ② 批量成本 = 逐单求和（保留逐单 ceil 口径，不能闭式省去 ceil）
test('bulkGeomCost 等于逐单 ceil 求和', () => {
  const base = 1234, growth = 1.27;
  const owned = 3, qty = 9;
  let manual = 0;
  for (let i = 0; i < qty; i++) manual += geomCostBase({ base, growth, owned: owned + i, qty: 0 });
  assert.equal(bulkGeomCost({ base, growth, owned, qty }), manual, '批量须与逐单求和一致');
});

// ③ 由目标反推增长率：往返一致
test('deriveGeomGrowth 往返：反推出的 growth 使成本回到 target', () => {
  const base = 10, targetCost = 1e9, owned = 0, purchases = 15;
  const g = deriveGeomGrowth({ base, targetCost, owned, purchases });
  const back = geomCostBase({ base, growth: g, owned, qty: purchases });
  // 允许 ceil 造成的 ±1 取整误差
  assert.ok(Math.abs(back - targetCost) <= 1, `反推成本应≈目标：${back} vs ${targetCost}`);
});

// ④ 复利加成：线性 / 乘算
test('compoundBuff：线性 (1+perLevel·levels) 与乘算 (1+perLevel)^levels', () => {
  assert.equal(compoundBuff({ base: 1, perLevel: 0.1, levels: 5, mode: 'linear' }), 1.5);
  assert.ok(Math.abs(compoundBuff({ base: 1, perLevel: 0.1, levels: 5, mode: 'multiplicative' }) - Math.pow(1.1, 5)) < 1e-9);
});

// ⑤ 等比级数前 n 项和（仓库扩容口径）
test('geomSeriesSum：vaultCap 增量口径', () => {
  const expect = 400 * (Math.pow(1.15, 6) - 1) / (1.15 - 1);
  assert.ok(Math.abs(geomSeriesSum({ first: 400, growth: 1.15, n: 6 }) - expect) < 1e-6);
  assert.equal(geomSeriesSum({ first: 400, growth: 1.15, n: 0 }), 0, 'n=0 应为 0');
});

// ⑥ 幂律规模（转生需求 base·(index+1)^exp）
test('powerScale：3e9·(prestige+1)^1.5', () => {
  assert.equal(powerScale({ base: 3e9, exponent: 1.5, index: 2 }), 3e9 * Math.pow(3, 1.5));
});

// ⑦ simulateProgression：前期密集购买、后期稀疏（指数墙）+ 首购极早
test('simulateProgression：首购极早、前期买得多后期买得少', () => {
  const upgrades = [
    { id: 'a', base: 50, growth: 1.3, cps: 2 },
    { id: 'b', base: 200, growth: 1.4, cps: 5 },
    { id: 'c', base: 800, growth: 1.5, cps: 12 },
  ];
  const sim = simulateProgression({ upgrades, startCps: 5, dailyMul: 1, days: 30 });
  assert.ok(sim.buys.length > 5, `应发生多笔购买，实际 ${sim.buys.length}`);
  // 首购应在第 1 天内（首价便宜）
  assert.ok(sim.buys[0].day <= 1, `首购应极早，实际 day=${sim.buys[0].day}`);
  // 前 5 天购买数 >> 后 5 天（指数墙：越往后越买不动）
  const early = sim.buys.filter(b => b.day <= 5).length;
  const late = sim.buys.filter(b => b.day >= 25).length;
  assert.ok(early > late, `前期(${early})应多于后期(${late})`);
  // 末笔成本远大于首笔（指数上涨）
  const first = sim.buys[0].cost, last = sim.buys[sim.buys.length - 1].cost;
  assert.ok(last > first * 10, `成本应指数上涨：${first} → ${last}`);
});

// ⑧ 加成复利：同等其它条件，buff 使同一里程碑提前达成（加成亦是复利加速）
test('simulateProgression：buff（加成复利）使里程碑提前达成', () => {
  const startCps = 1000, expectedDay = 10, K = 4;
  const targetCost = startCps * 86400 * expectedDay;
  const growth = deriveGeomGrowth({ base: 1e3, targetCost, owned: 0, purchases: K + 1 });
  const noBuff = simulateProgression({ upgrades: [{ id: 'm', base: 1e3, growth, cps: 0 }], startCps, dailyMul: 1, days: 30 });
  const buffed = simulateProgression({ upgrades: [{ id: 'm', base: 1e3, growth, cps: 0 }], startCps, dailyMul: 1, days: 30, buffPerLevel: 0.1, buffLevels: 5 });
  assert.ok(noBuff.buys.length >= K + 1 && buffed.buys.length >= K + 1, '两路均应达成里程碑购买');
  assert.ok(buffed.buys[K].day < noBuff.buys[K].day,
    `加成应加速里程碑：buff day=${buffed.buys[K].day} < noBuff day=${noBuff.buys[K].day}`);
  assert.ok(buffed.finalCps > noBuff.finalCps, 'buff 终局产出应更高');
});

// ⑨ 按预期天数推算定价：deriveGeomGrowth 设定 growth → 里程碑约在第 expectedDay 达成
test('按预期天数推算定价：deriveGeomGrowth + simulateProgression 里程碑落在预期日', () => {
  const startCps = 1000;          // 恒定产出（cps:0，隔离曲线）
  const expectedDay = 10;
  const K = 4;                     // 第 5 次购买作为里程碑
  // 第 expectedDay 天累计可用资源（线性产出、dailyMul=1）：startCps·86400·day
  const targetCost = startCps * 86400 * expectedDay;
  const growth = deriveGeomGrowth({ base: 1e3, targetCost, owned: 0, purchases: K + 1 });
  const sim = simulateProgression({
    upgrades: [{ id: 'm', base: 1e3, growth, cps: 0 }],
    startCps, dailyMul: 1, days: 30,
  });
  assert.ok(sim.buys.length >= K + 1, `应至少发生 ${K + 1} 次购买，实际 ${sim.buys.length}`);
  const milestoneDay = sim.buys[K].day; // 第 (K+1) 次
  assert.ok(Math.abs(milestoneDay - expectedDay) <= 2,
    `里程碑应在第 ~${expectedDay} 天达成，实际 day=${milestoneDay}`);
  // 反推成本与第 (K+1) 次实际成本一致（验证推算闭环）
  const actualCost = sim.buys[K].cost;
  assert.ok(Math.abs(actualCost - targetCost) / targetCost < 0.05,
    `推算成本应≈实际：${actualCost} vs ${targetCost}`);
});

// ⑨b 产出复利（dailyMul>1）应比线性（dailyMul=1）更快达成同一里程碑
test('按预期天数推算定价：产出随时间复利使里程碑更早达成', () => {
  const startCps = 1000, expectedDay = 10, K = 4;
  const targetCost = startCps * 86400 * expectedDay;
  const growth = deriveGeomGrowth({ base: 1e3, targetCost, owned: 0, purchases: K + 1 });
  const linear = simulateProgression({ upgrades: [{ id: 'm', base: 1e3, growth, cps: 0 }], startCps, dailyMul: 1, days: 30 });
  const compound = simulateProgression({ upgrades: [{ id: 'm', base: 1e3, growth, cps: 0 }], startCps, dailyMul: 1.15, days: 30 });
  assert.ok(linear.buys.length >= K + 1 && compound.buys.length >= K + 1, '两路均应达成里程碑购买');
  assert.ok(compound.buys[K].day < linear.buys[K].day,
    `产出复利应加速里程碑：${compound.buys[K].day} < ${linear.buys[K].day}`);
});
