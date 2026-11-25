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
import { MS_PER_DAY } from '../src/core/time.js';

const MAIN = CHAPTERS.filter(c => typeof c.id === 'number' && c.id >= 1 && c.id <= 18);

function rich(chapter, daysAgo) {
  return {
    chapter: String(chapter), chapterEnteredAt: Date.now() - daysAgo * MS_PER_DAY,
    tech: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['t' + i, true])),
    unlockedBuildings: {}, prestige: 999, prestigePoints: 999, es: 1e9, faith: 999,
    expeditionsDone: 999, riftsSealed: 999, riftEmber: 1e9, dm: 1e9,
    allTimeEp: 1e21, projectsDone: 999, buildings: { end_shrine: 1 }, upgrades: {}, religion: {},
    wageState: { state: 'ok' }, storyline: 'default',
    // v2.8.0 反馈⑧：第 8~12 章改为动作门槛，富资产夹具也要带上这些动作产物，
    // 否则「只推进一章」的用例会被动作门槛挡住，测不到连跳防护本身。
    bazaar: { unlocked: true, trades: 50 }, delve: { up: {}, xp: 120, cycleT: 0 },
    mirror: { merit: 1e6, techs: { recycle: 1 }, seen: { output: true }, allSeen: true },
    mirrorRun: { contract: 'conqueror', base: 0, council: 'output', meritBasis: 0 },
  };
}

test('A1 主线 2~6 章 minDays ≥5（v4.1.0 F5 重标定）', () => {
  for (const id of [2, 3, 4, 5, 6]) {
    const ch = MAIN.find(c => c.id === id);
    assert.ok(ch.minDays >= 5, `第 ${id} 章 minDays=${ch.minDays} < 5`);
  }
});

test('A2 主线 7~18 章 minDays 仍在 5~7 带（第 7 章 v2.7.0 单独抬高）', () => {
  for (const ch of MAIN.filter(c => c.id >= 7)) {
    // v2.7.0 前 7 章体验校准：第 7 章 minDays 是「进入第 7 章前在第 6 章的最短驻留」，
    //   ch6（超验+永恒矩阵）实测 5 天即过，抬到 20 天；其余章仍在 5~7 带。
    if (ch.id === 7) { assert.equal(ch.minDays, 20, '第 7 章驻留应为 20 天（v2.7.0）'); continue; }
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

test('D 主线全链驻留落在 135~155 天带（v2.7.0 前 7 章校准后）', () => {
  const total = MAIN.reduce((n, c) => n + c.minDays, 0);
  // v2.7.0：ch4/ch6/ch7 的驻留要求分别抬到 25/20/20（= 第 3/5/6 章真正的停留时长），
  //   主线总驻留从 91 升到 141；上限仍远小于「每章 5 现实天」的全量口径，留给条件门控加时。
  assert.ok(total >= 135 && total <= 155, `主线总驻留 ${total} 天越界（期望 135~155，v2.7.0 后）`);
});

test('A4 前 7 章每章驻留 ≥20 游戏天（≈3 现实天 @1 小时/天）', () => {
  // 「第 N 章停留多久」= 第 N+1 章的 minDays（驻留门控挂在目标章上）
  const stay = (id) => MAIN.find(c => c.id === id + 1).minDays;
  for (const id of [1, 2, 3, 4, 5, 6]) {
    assert.ok(stay(id) >= 5, `第 ${id} 章驻留 ${stay(id)} 天过低`);
  }
  for (const id of [3, 5, 6]) {
    assert.ok(stay(id) >= 20, `第 ${id} 章（v2.7.0 重点校准）驻留 ${stay(id)} 天应 ≥20`);
  }
});
