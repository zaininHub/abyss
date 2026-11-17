// v2.7.1：EP 上限线程懒惰态——EP 持续近满 → 产出降/消耗升；EP=0 或购买解除
import { test } from 'node:test';
import assert from 'node:assert/strict';
// v4.1.1：L8 需要驱动 load() 验证读侧清洗——提供可控 localStorage stub（其它测试各文件独立进程）
let _lsData = null;
globalThis.localStorage = {
  getItem: (k) => (k === 'abyss_idle_v2' ? _lsData : null),
  setItem: (k, v) => { if (k === 'abyss_idle_v2') _lsData = String(v); },
  removeItem: (k) => { if (k === 'abyss_idle_v2') _lsData = null; },
};
const { S } = await import('../src/state.js');
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

// v4.1.1 BUGFIX：v4.1.0 只修了写入侧（ctx.now → Date.now），旧档已落盘的 rAF 基
// 脏值没有被清洗 → isLazy 恒 true + 显示「怠工已持续 1794875137s」（≈ 当前 Unix 秒时间戳）。
test('L6 旧档 rAF 基脏 lazySince（<1e12）不触发懒惰（读取侧清洗 + isLazy 防御）', () => {
  freshState();
  S.lazySince = 48_321; // rAF 基：页面运行 ~48 秒的 performance.now() 值
  assert.equal(isLazy(), false, 'rAF 基脏值不得被判为懒惰（差值≈17 亿秒，旧 bug）');
  assert.equal(lazyProdMult(), 1);
  assert.equal(lazyCostMult(), 1);
});

test('L7 合法 Unix 毫秒时间戳仍然正常触发懒惰', () => {
  freshState();
  S.lazySince = Date.now() - 61_000; // ~1.7e12，>1e12 阈值
  assert.ok(S.lazySince > 1e12, '合法时间戳量级断言');
  assert.equal(isLazy(), true);
});

test('L8 load() 读侧清洗：旧档 rAF 基 lazySince 归零（与 v4.0.5 职级点取整同构）', async () => {
  const { load } = await import('../src/state.js');
  const raw = JSON.parse(_lsData || '{}');
  raw.lazySince = 79_123; // rAF 基脏值
  raw.lazyLowSince = 12_345;
  raw._version = 6;
  _lsData = JSON.stringify(raw);
  const loaded = load();
  assert.equal(loaded.lazySince, null, '读侧应清洗 rAF 基 lazySince');
  assert.equal(loaded.lazyLowSince, null, '读侧应清洗 rAF 基 lazyLowSince（同一时间基）');
});
