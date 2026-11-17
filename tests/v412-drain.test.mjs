// v4.1.2 BUGFIX：RP 满仓时灵感工坊转「满仓涓流」（周期扣减），不计入连续消耗速率。
// 旧实现 atriumDrainPerSec 不判满仓 → 顶栏消耗虚高 n²×150/s，与 cps 比较误报红色❗，
// 玩家看到「产出<消耗但 EP 仍在涨」（用户截图 778<863 却 EP 上涨）。
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { S } = await import('../src/state.js');
const { atriumDrainPerSec, drainBreakdown, rpCap, totalDrainPerSec } = await import('../src/modules/economy.js');

function base() {
  S.ep = 215600; S.rp = 0; S.upgrades = { atrium: 3 };
  S.atriumOn = true; S.converterOn = { vehicles: true, atrium: true };
  S.religion = {}; S.ptAutoHatch = false; S.ptDistillOn = false;
  S.wageState = { state: 'ok' }; S.cultists = [];
}

test('D1 RP 未满：工坊按 150×n² 连续扣（3 级 = 1350/s）', () => {
  base(); S.rp = 0;
  assert.ok(S.rp < rpCap());
  assert.equal(atriumDrainPerSec(), 1350);
});

test('D2 RP 满仓：工坊不计连续消耗（避免顶栏❗误报）', () => {
  base(); S.rp = rpCap();
  assert.ok(S.rp >= rpCap());
  assert.equal(atriumDrainPerSec(), 0, '满仓涓流是每 5s 周期扣减，不能按连续速率计入');
});

test('D3 满仓时明细仍有涓流说明（玩家不困惑「工坊开着怎么消耗没变」）', () => {
  base(); S.rp = rpCap();
  const parts = drainBreakdown();
  assert.ok(parts.some(p => /满仓涓流/.test(p)), `明细应含涓流说明：${parts.join(' | ')}`);
  assert.ok(!parts.some(p => /灵感工坊 -\d/.test(p)), '不应再有「灵感工坊 -1350/s」的连续速率文案');
});

test('D4 工坊开关关闭时两种口径都不计', () => {
  base(); S.rp = 0; S.atriumOn = false;
  assert.equal(atriumDrainPerSec(), 0);
  base(); S.rp = rpCap(); S.converterOn = { vehicles: true, atrium: false };
  assert.equal(atriumDrainPerSec(), 0);
  assert.ok(!drainBreakdown().some(p => /涓流/.test(p)));
});

test('D5 总消耗随满仓口径回落（与 computeCps 比较不再虚假净流为负）', () => {
  base(); S.rp = 0;
  const full = totalDrainPerSec();
  S.rp = rpCap();
  const capped = totalDrainPerSec();
  assert.ok(capped < full, `满仓总消耗应低于未满（${capped} < ${full}）`);
  assert.equal(full - capped, 1350, '差额正好是工坊连续扣减 1350/s');
});
