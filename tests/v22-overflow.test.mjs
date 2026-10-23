// v2.2 缺陷 B 修复断言（架构方案第四章 + PM §4.2）
// tickCorruption 超 cap 存量 EP 不再直接丢弃，走与 addEp 相同的溢出池口径（公共记账 accountEpOverflow）
// 验收断言：构造 S.ep>cap 存档，tickCorruption 后 S.ep===cap、epOverflowTotal 增量===overflow、
// 同 overflow 值经 addEp 与 tickCorruption 两条路径的 RP 增量逐位相等（含 _overflowRpAcc 尾数逐位一致）
// 附：腐化积累语义不变（仍按溢出比例计算、位于截断前）；ep≤cap 时零记账零截断；
//     源码级断言（accountEpOverflow 恰 1 处定义 + 恰 2 处调用；旧截断行已移除）。
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };

let pass = 0, fail = 0, red = [];
const tests = [];
function t(name, fn) { tests.push([name, fn]); }

const { S } = await import('../src/state.js');
const { epStorageCap, addEp, tickCorruption } = await import('../src/modules/economy.js');

// 基线态：无任何扩容建筑/里程碑 → cap = 2000（epStorageCap 基础值）
function resetBaseline() {
  S.upgrades = {}; S.buildings = {}; S.milesDone = {}; S.storyline = 'default';
  S.ep = 0; S.rp = 0; S.corruption = 0;
  S.epOverflowTotal = 0; S._overflowRpAcc = 0;
  S.runEarned = 0; S.allTimeEp = 0;
}
const CAP = epStorageCap(); // 期望 2000
resetBaseline();

console.log('[1] tickCorruption 溢出记账（缺陷 B 主断言）');
t('基线 epStorageCap = 2000（fixture 前提）', () => { assert.strictEqual(CAP, 2000); });

t('超 cap 存量：tickCorruption 后 S.ep === cap 且 epOverflowTotal 增量 === overflow', () => {
  resetBaseline();
  const overflow = 1e6;
  S.ep = CAP + overflow;
  tickCorruption(0.1);
  assert.strictEqual(S.ep, CAP, `ep 应截断到 cap，实际 ${S.ep}`);
  assert.strictEqual(S.epOverflowTotal, overflow, `epOverflowTotal 应记 ${overflow}，实际 ${S.epOverflowTotal}`);
});

t('溢出转 RP（v2.5.2：1/20000，随转生递减）：overflow=1e6 → RP +50', () => {
  resetBaseline();
  const overflow = 1e6;
  S.ep = CAP + overflow;
  tickCorruption(0.1);
  assert.strictEqual(S.rp, 50, `RP 应 +50，实际 +${S.rp}`);
});

t('两路径逐位一致：同 overflow 值经 addEp 与 tickCorruption 的 RP/累计/尾数完全相等', () => {
  // 路径 A：addEp（cap 打满后注入，全额溢出）
  resetBaseline();
  const overflow = 1234567.89; // 故意选非整值，逼出浮点尾数差异
  S.ep = CAP;
  addEp(overflow);
  const a = { rp: S.rp, total: S.epOverflowTotal, acc: S._overflowRpAcc };
  // 路径 B：tickCorruption（存量超 cap）
  resetBaseline();
  S.ep = CAP + overflow;
  tickCorruption(0.1);
  const b = { rp: S.rp, total: S.epOverflowTotal, acc: S._overflowRpAcc };
  assert.strictEqual(a.rp, b.rp, `RP 增量不一致：addEp ${a.rp} vs tick ${b.rp}`);
  assert.strictEqual(a.total, b.total, `epOverflowTotal 不一致：${a.total} vs ${b.total}`);
  assert.strictEqual(a.acc, b.acc, `_overflowRpAcc 尾数不一致（逐位）：${a.acc} vs ${b.acc}`);
});

t('多轮溢出持续累计（第二次 tick 再记一笔）', () => {
  resetBaseline();
  S.ep = CAP + 1000;
  tickCorruption(0.1);
  S.ep = CAP + 2000; // 模拟再次超 cap（如离线注入）
  tickCorruption(0.1);
  assert.strictEqual(S.epOverflowTotal, 3000);
});

console.log('[2] 语义保持：不溢出/不越界路径零副作用');
t('ep ≤ cap：tickCorruption 不记账、不截断', () => {
  resetBaseline();
  S.ep = CAP - 500;
  tickCorruption(0.1);
  assert.strictEqual(S.ep, CAP - 500);
  assert.strictEqual(S.epOverflowTotal, 0);
  assert.strictEqual(S.rp, 0);
});

t('ep 恰等于 cap：零溢出零记账（边界）', () => {
  resetBaseline();
  S.ep = CAP;
  tickCorruption(0.1);
  assert.strictEqual(S.ep, CAP);
  assert.strictEqual(S.epOverflowTotal, 0);
});

t('腐化积累语义不变：溢出时按溢出比例累积腐化（截断前计算）', () => {
  resetBaseline();
  const overflow = CAP; // overflow/cap = 1
  S.ep = CAP + overflow;
  S.corruption = 0;
  tickCorruption(1); // dt=1s
  const expect = 0.1 * (overflow / CAP) * 1 * 100; // accumulateRate × 比例 × dt × 100
  assert.ok(Math.abs(S.corruption - expect) < 1e-9, `腐化应为 ${expect}，实际 ${S.corruption}`);
  assert.strictEqual(S.ep, CAP, '腐化记账后 ep 仍应截断到 cap');
});

t('addEp 部分入账回归：ep=cap-100 注入 1000 → 入账 100、溢出 900 记账', () => {
  resetBaseline();
  S.ep = CAP - 100;
  const gained = addEp(1000);
  assert.strictEqual(gained, 100);
  assert.strictEqual(S.ep, CAP);
  assert.strictEqual(S.epOverflowTotal, 900);
  assert.ok(S._overflowRpAcc > 0 && S._overflowRpAcc < 1, '900 溢出不足 1/20000，应滞留尾数');
});

console.log('[3] 源码级断言（公共记账单点）');
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const econSrc = readFileSync(join(SRC_DIR, 'modules', 'economy.js'), 'utf8');
t('accountEpOverflow 恰 1 处定义 + 恰 2 处调用（addEp 与 tickCorruption 共用）', () => {
  const defs = (econSrc.match(/function accountEpOverflow\(/g) || []).length;
  const calls = (econSrc.match(/accountEpOverflow\(/g) || []).length;
  assert.strictEqual(defs, 1, `定义应恰 1 处，实际 ${defs}`);
  assert.strictEqual(calls, 3, `出现总数应=1定义+2调用=3，实际 ${calls}`);
});
t('旧截断行已移除：tick 路径不再直接丢弃溢出 EP', () => {
  assert.ok(!econSrc.includes('if (S.ep > cap) S.ep = cap'), '旧截断行仍存在');
});
t('记账口径注释同源（v2.5.2：1 RP = 20000 溢出 EP、每转生 -500 下限 5000）', () => {
  assert.ok(econSrc.includes('Math.max(5000, 20000 - 500 * (S.prestige || 0))'), '公共函数内应有 20000-500×prestige 换算');
});

for (const [name, fn] of tests) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; red.push(name); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) { console.log('失败项:', red.join(' | ')); process.exit(1); }
