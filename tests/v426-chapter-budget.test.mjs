// v4.2.6 分章节测试体系 · 单测护栏（方案文档步骤 5）
//
// 锁死三类不变量（纯 Node，不依赖浏览器）：
//   A. 预算表条目完整性：1~18 章无缺、区间形状合法；
//   B. 预算值与公式重算一致：es/prestigeNeed 推导口径不被静默改动；
//   C. 链式可达性：上一章预算的「晋升产出」必须足以满足下一章 cond 的晋升类门槛
//      （防预算表自身把主线线性链弄断——v4.0.0 终章断链教训的预算侧镜像）；
//   D. 快照键一致性：run-range.mjs 页面侧内联 KEYS 与 _snapshot.mjs SNAPSHOT_KEYS 同步。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUDGET, MAIN_CHAPTERS, budgetIntegrity } from './chapters/budget.mjs';
import { SNAPSHOT_KEYS, PROGRESS_KEYS, inRange } from './chapters/_snapshot.mjs';
import { CROSS_RUN_KEYS } from '../src/core/stateSchema.js';
import { CHAPTERS } from '../src/data/chapters.js';
import { powerScale } from '../src/core/pricing.js';

const need = p => Math.floor(powerScale({ base: 3e9, exponent: 1.5, index: p }));
const esAt = runEarned => Math.floor(Math.sqrt(runEarned / 2e7));

test('A1. 预算表 1~18 章条目完整且形状合法', () => {
  const r = budgetIntegrity();
  assert.equal(r.ok, true, `缺失/非法条目：${JSON.stringify(r.missing)}`);
  for (let n = 1; n <= MAIN_CHAPTERS; n++) {
    const b = BUDGET[n];
    for (const key of ['es', 'pp', 'rp']) {
      assert.ok(Array.isArray(b[key]) && b[key].length === 2
        && b[key][0] >= 0 && b[key][0] <= b[key][1], `ch${n}.${key} 区间非法`);
    }
  }
});

test('A2. MAIN_CHAPTERS 与 chapters.js 主线一致（1~18）', () => {
  const mainIds = CHAPTERS.filter(c => typeof c.id === 'number' && c.id >= 1 && c.id <= 18).map(c => c.id);
  assert.deepEqual(mainIds, Array.from({ length: MAIN_CHAPTERS }, (_, i) => i + 1));
});

test('B1. 第 1 章 ES 预算下界 ≤ 公式推导首两升 ES 合计', () => {
  // 首升 runEarned≈need(0)=3e9 → ES≈12；二升 need(1)=8.49e9 → ES≈20；合计≈32
  const two = esAt(need(0)) + esAt(need(1));
  assert.ok(two >= BUDGET[1].es[0], `公式推导 ES 合计 ${two} 应落在预算下界 ${BUDGET[1].es[0]} 之上`);
  assert.ok(inRange(two, BUDGET[1].es).ok, `推导值 ${two} 应在区间 ${JSON.stringify(BUDGET[1].es)} 内`);
});

test('B2. 各章「单次晋升 ES 增量」随章号单调不减（幂律 presteeNeed 的必然结论）', () => {
  let prev = 0;
  for (let n = 1; n <= 14; n++) {
    const p0 = BUDGET[n] && entryStartPrestige(n);
    if (p0 == null) continue;
    const es = esAt(need(p0));
    assert.ok(es >= prev, `ch${n} 起点晋升 ES(${es}) 不应低于上一章(${prev})`);
    prev = es;
  }
});

test('C1. 预算链：上一章预算的 minPrestige 累计满足晋升类章节门槛', () => {
  // 晋升类门槛：第 2(>=2)/7(>=15)/8(>=40)/13(>=70)/14(>=130)/15(>=260) 章
  const gates = { 2: 2, 7: 15, 8: 40, 13: 70, 14: 130, 15: 260 };
  // 进入第 N 章前的晋升下限 = 前 N-1 章 minPrestige 之和
  let acc = 0;
  for (let n = 1; n <= MAIN_CHAPTERS; n++) {
    if (gates[n] != null) {
      assert.ok(acc >= gates[n] - BUDGET[n].minPrestige,
        `进入 ch${n} 前（累计 ${acc} 次晋升）+ 本章 minPrestige(${BUDGET[n].minPrestige}) 必须跨过门槛 ${gates[n]}`);
    }
    acc += BUDGET[n].minPrestige;
  }
  // 全链累计应覆盖第 15 章后 260+ 门槛
  assert.ok(acc >= 260 + 20, `全链累计晋升 ${acc} 应≥ 15 章门槛 260 + 终章余量`);
});

test('C2. ES 类门槛（11 章 >=150 / 12 章 >=800）在预算下界累计后可达', () => {
  let es = 0;
  for (let n = 1; n <= MAIN_CHAPTERS; n++) {
    if (n === 11) assert.ok(es >= 150, `进入 ch11 前预算下界 ES 累计 ${es} 应≥150`);
    if (n === 12) assert.ok(es >= 800, `进入 ch12 前预算下界 ES 累计 ${es} 应≥800`);
    es += BUDGET[n].es[0];
  }
});

test('D1. 快照键 = CROSS_RUN_KEYS ∪ PROGRESS_KEYS（无遗漏无孤儿）', () => {
  for (const k of CROSS_RUN_KEYS) assert.ok(SNAPSHOT_KEYS.includes(k), `CROSS_RUN_KEY ${k} 未入快照`);
  for (const k of ['prestige', 'chapter', 'chapterEnteredAt', 'expeditionsDone', 'milesDone', 'projectsDone']) {
    assert.ok(PROGRESS_KEYS.includes(k), `进度键 ${k} 未入 PROGRESS_KEYS`);
  }
  // 无孤儿：SNAPSHOT_KEYS 中的进度键都在 PROGRESS_KEYS；其余必须来自 CROSS_RUN_KEYS
  for (const k of SNAPSHOT_KEYS) {
    assert.ok(CROSS_RUN_KEYS.includes(k) || PROGRESS_KEYS.includes(k), `快照孤儿键 ${k}`);
  }
});

test('D2. run-range.mjs 页面侧内联 KEYS 与 SNAPSHOT_KEYS 逐字一致', () => {
  const src = readFileSync('./tests/chapters/run-range.mjs', 'utf8');
  const m = src.match(/const KEYS = \[([^\]]+)\]/);
  assert.ok(m, 'run-range.mjs 未找到页面侧 KEYS 内联清单');
  const inline = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  assert.deepEqual(inline.sort(), [...SNAPSHOT_KEYS].sort());
});

/** 章节起点晋升数（各章 minPrestige 累计到该章之前），仅用于 B2 单调性检查。 */
const startCache = {};
function entryStartPrestige(n) {
  if (startCache[n] !== undefined) return startCache[n];
  let acc = 0;
  for (let i = 1; i < n; i++) acc += BUDGET[i] ? BUDGET[i].minPrestige : 0;
  startCache[n] = acc;
  return acc;
}
