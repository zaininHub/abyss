// v2.7.1：EP 上限线程懒惰态——EP 持续近满 → 产出降/消耗升；EP=0 或购买解除
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../src/state.js';
import { isLazy, lazyProdMult, lazyCostMult, staffSalaryPerSec, staffOutputPerSec, staffNetPerSec } from '../src/modules/economy.js';

function freshState() {
  S.ep = 5000; S.lazySince = null;
  S.cultists = [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }];
  S.wageState = { state: 'ok' };
  S.upgrades = {}; S.allTimeEp = 0; S.runEarned = 0; S.prestige = 0; S.tech = {};
}
function fakeClock(msAgo) { const r = Date.now; Date.now = () => r() + msAgo; return () => { Date.now = r; }; }

test('L1 未满上限/未计时：不懒惰（isLazy=false，乘数 ×1）', () => {
  freshState();
  assert.equal(isLazy(), false);
  assert.equal(lazyProdMult(), 1);
  assert.equal(lazyCostMult(), 1);
});

test('L2 计时未达阈值（10s < 60s）：不懒惰', () => {
  freshState();
  S.lazySince = Date.now() - 10_000;
  assert.equal(isLazy(), false);
});

test('L3 持续满上限超阈值（61s）：懒惰（产出 ×0.25、消耗 ×2.5）', () => {
  freshState();
  S.lazySince = Date.now() - 61_000;
  assert.equal(isLazy(), true);
  assert.equal(lazyProdMult(), 0.25);
  assert.equal(lazyCostMult(), 2.5);
});

test('L4 懒惰中消耗 > 产出（net 转负）', () => {
  freshState();
  S.lazySince = Date.now() - 61_000;
  // 单线程 3/s 基础，满薪无其它惩罚：产出 ×0.4 vs 消耗 ×1.8 → net < 0
  const net = staffNetPerSec();
  assert.ok(net < 0, `懒惰态净收益应为负（实际 ${net}）`);
  assert.ok(staffOutputPerSec() * 0.25 < staffSalaryPerSec() * 2.5, '产出降+消耗升 → 消耗>产出');
});

test('L5 任意购买解除（S.lazySince=null → 不懒惰）', () => {
  freshState();
  S.lazySince = Date.now() - 61_000;
  assert.equal(isLazy(), true);
  S.lazySince = null; // buyUpgrade/hireCultist 成功路径会写 null
  assert.equal(isLazy(), false);
  assert.equal(lazyProdMult(), 1);
});
