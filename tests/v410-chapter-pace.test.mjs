// v4.1.0 F5 章节速度重标定 防回归锁
//
// 用户口径：所有章节速度都应在 5 天左右；晋升带来的推进仅为解锁新模块/叙事体验，
// 不压缩节奏（「第二章及之后速度过快」根因 = 晋升回拨 3 天 ≥ 旧 minDays 3~4 +
// currentChapter 单帧连跳多章）。
//
// 三条不变量（本文件锁死）：
//   A. 主线 2~6 章 minDays ≥5（5~7 天带），全表 minDays ∈ [0,7]；
//   B. currentChapter 一次调用只推进一章（连跳防护，与变体分支同语义）；
//   C. 晋升回拨 = 1 天（doPrestige 源码锁定）——晋升仍推动故事线，但不再整章抹平。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS, currentChapter } from '../src/data/chapters.js';

const MAIN = CHAPTERS.filter(c => typeof c.id === 'number' && c.id >= 1 && c.id <= 18);

function rich(chapter, daysAgo) {
  return {
    chapter: String(chapter), chapterEnteredAt: Date.now() - daysAgo * 86400000,
    tech: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['t' + i, true])),
    unlockedBuildings: {}, prestige: 999, prestigePoints: 999, es: 1e9, faith: 999,
    expeditionsDone: 999, riftsSealed: 999, riftEmber: 1e9, dm: 1e9,
    allTimeEp: 1e21, projectsDone: 999, buildings: { end_shrine: 1 }, upgrades: {}, religion: {},
    wageState: { state: 'ok' }, storyline: 'default',
  };
}

test('A1 主线 2~6 章 minDays ≥5（v4.1.0 F5 重标定）', () => {
  for (const id of [2, 3, 4, 5, 6]) {
    const ch = MAIN.find(c => c.id === id);
    assert.ok(ch.minDays >= 5, `第 ${id} 章 minDays=${ch.minDays} < 5`);
  }
});

test('A2 主线 7~18 章 minDays 仍在 5~7 带', () => {
  for (const ch of MAIN.filter(c => c.id >= 7)) {
    assert.ok(ch.minDays >= 5 && ch.minDays <= 7, `第 ${ch.id} 章 minDays=${ch.minDays} 越界`);
  }
});

test('A3 番外 19+ 章 minDays 5~7 不变', () => {
  for (const ch of CHAPTERS.filter(c => typeof c.id === 'number' && c.id >= 19)) {
    assert.ok(ch.minDays >= 5 && ch.minDays <= 7, `第 ${ch.id} 章 minDays=${ch.minDays} 越界`);
  }
});

test('B1 驻留富余也只推进一章（连跳防护）', () => {
  // 富资产 + 30 天驻留：从任何一章出发都只 +1，绝不连跳
  for (const from of [1, 2, 5, 9, 14, 17]) {
    const ch = currentChapter(rich(from, 30), CHAPTERS);
    assert.equal(ch.id, from + 1, `第 ${from} 章 + 30 天驻留应只推进到 ${from + 1}，实际 ${ch.id}`);
  }
});

test('B2 驻留不足时停在本章', () => {
  assert.equal(currentChapter(rich(2, 4), CHAPTERS).id, 2, '4 天 < 第 3 章 5 天门槛');
  assert.equal(currentChapter(rich(1, 4), CHAPTERS).id, 1, '4 天 < 第 2 章 5 天门槛');
});

test('C 晋升回拨恒为 1 天（doPrestige 源码锁定）', () => {
  const src = readFileSync(new URL('../src/modules/prestige.js', import.meta.url), 'utf8');
  // v4.2.X：86400000 提到 core/time.js 的 MS_PER_DAY 真源，断言改锁符号名而非字面量。
  assert.ok(/chapterEnteredAt = Date\.now\(\) - 1 \* MS_PER_DAY/.test(src),
    'doPrestige 应回拨 1 天驻留（v4.1.0 F5：3→1，晋升只抵 1 天不再整章抹平）');
  assert.ok(!/Date\.now\(\) - 3 \* (MS_PER_DAY|86400000)/.test(src), '不得恢复 3 天回拨');
});

test('D 主线全链节奏 ≈ 5 天/章（1~18 章总驻留 85~110 天带）', () => {
  const total = MAIN.reduce((n, c) => n + c.minDays, 0);
  assert.ok(total >= 85 && total <= 110, `主线总驻留 ${total} 天越界（期望 85~110，约 5 天/章 × 18 章）`);
});
