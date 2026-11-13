// v4.0.0 完整故事线回放发现的真 BUG 防回归：
//   主线是线性链（currentChapter「条件断链即停」），任一章条件若在默认资源容量下不可达，
//   后续所有章节（含终章）就永远到不了。v3.12.10 把 FP 基础容量重标定为 capBase=100，
//   但 16/17 章阈值仍是 80/160，17 章要求 160 > 100 → 终章不可达。
//
// 本测试锁死不变量：主线 1~18 章中，凡以「瞬时余额」为条件的章节，
// 其阈值必须 ≤ 该资源的默认容量（否则线性链必然断链）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTERS, currentChapter } from '../src/data/chapters.js';
import { FP_BALANCE } from '../src/data/balance.js';

const MAIN = CHAPTERS.filter(c => typeof c.id === 'number' && c.id >= 1 && c.id <= 18);

test('A. 主线 1~18 章共 18 章，id 连续无缺', () => {
  assert.equal(MAIN.length, 18);
  assert.deepEqual(MAIN.map(c => c.id), Array.from({ length: 18 }, (_, i) => i + 1));
});

test('B. FP 类章节阈值不得超过默认信仰容量（防线性链断链）', () => {
  const baseCap = FP_BALANCE.capBase; // 无任何扩容时的 faithCap()
  assert.ok(baseCap > 0);
  // 取 16/17 章：在 faith = 默认容量下条件必须成立。
  // （圣龛 / 圣印 / 虚空祭坛属于可选加速，不应是通关的隐形硬门槛。）
  for (const id of [16, 17]) {
    const ch = MAIN.find(c => c.id === id);
    assert.ok(ch, `第 ${id} 章应存在`);
    assert.equal(ch.cond({ faith: baseCap }), true,
      `第 ${id} 章在默认信仰容量 ${baseCap} 下必须可达，否则终章永不可达`);
    // 阈值应严格小于容量，留出赞颂/消耗后的恢复空间
    assert.equal(ch.cond({ faith: baseCap - 1 }), true,
      `第 ${id} 章阈值不应贴着容量边界`);
  }
});

test('C. 终章在「默认容量 + 已建终焉圣殿」下真实可达（线性链不断）', () => {
  const now = Date.now.bind(Date);
  const entered = now() - 200 * 86400000; // 驻留远超所有 minDays
  const S = {
    chapter: '1', chapterEnteredAt: entered,
    prestige: 999, prestigePoints: 999, es: 1e6, faith: FP_BALANCE.capBase,
    expeditionsDone: 999, riftsSealed: 999, dm: 1e6, projectsDone: 999,
    allTimeEp: 1e21, runEarned: 1e21, riftEmber: 1e6,
    tech: { true_end: true }, buildings: { end_shrine: 1 },
    upgrades: {}, religion: {}, resonance: { layers: 24, focus: 'rp' },
    unlockedBuildings: Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['b' + i, 1])),
  };
  const cur = currentChapter(S, CHAPTERS);
  assert.ok(cur.id >= 18, `应推进到终章或之后，实际停在第 ${cur.id} 章（${cur.name}）`);
});

test('D. 源码不得再出现旧的超容量阈值', () => {
  const src = readFileSync(new URL('../src/data/chapters.js', import.meta.url), 'utf8');
  assert.ok(!/s\.faith>=160/.test(src), '不得恢复 160 这一超过默认容量的章节阈值');
});
