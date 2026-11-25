// v4.3.31 隐藏测试命令：src/core/devCheat.js 的章节资源补齐验收。
// 口径：fillChapterResources(S, n) 必须让 CHAPTERS[n-1].cond(S) 成立；驻留计时按游戏日
// MS_PER_DAY（10 分钟/日）回拨；非法入参钳到 [1, CHAPTERS.length]；字段只抬不降。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, currentChapter } from '../src/data/chapters.js';
import { fillChapterResources } from '../src/core/devCheat.js';
import { MS_PER_DAY, daysSince } from '../src/core/time.js';
import { TECHS } from '../src/data/techs.js';
import { V21_BUILDINGS } from '../src/data/buildings.js';

// Node 无 localStorage：补最小桩，避免 state.js 的 load() 走「存档读取失败」分支（仅测试用）。
if (!globalThis.localStorage) {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
const { defaultState } = await import('../src/state.js');

const TARGETS = [1, 2, 3, 4, 5, 6, 10, 18, 21, 34, 51];
const CHAPTER_COUNT = CHAPTERS.length;

test('指定章节（1/2/3/4/5/6/10/18/21/34/51）条件全部成立', () => {
  for (const target of TARGETS) {
    const S = defaultState();
    const r = fillChapterResources(S, target);
    assert.equal(r.chapter, target, `返回值 chapter 应为 ${target}`);
    assert.equal(typeof r.days, 'number', '返回值 days 应为数字');
    assert.ok(r.fields && typeof r.fields === 'object', '返回值 fields 应为对象');
    assert.equal(CHAPTERS[target - 1].cond(S), true, `第 ${target} 章 cond 应成立`);
    if (target > 1) {
      assert.ok(Object.keys(r.fields).length > 0, `第 ${target} 章应有字段被改写`);
    }
  }
});

test('全章节 1..51 逐章独立补齐：每章 cond 都成立（阈值表与 chapters.js 不漂移）', () => {
  for (let target = 1; target <= CHAPTER_COUNT; target += 1) {
    const S = defaultState();
    const r = fillChapterResources(S, target);
    assert.equal(r.chapter, target);
    assert.equal(CHAPTERS[target - 1].cond(S), true, `第 ${target} 章 cond 应成立`);
  }
});

test('连续调用 1→51（同一状态）：不抛错且每章 cond 都成立', () => {
  const S = defaultState();
  for (let target = 1; target <= CHAPTER_COUNT; target += 1) {
    let r;
    assert.doesNotThrow(() => { r = fillChapterResources(S, target); }, `第 ${target} 章不应抛错`);
    assert.equal(r.chapter, target);
    assert.equal(CHAPTERS[target - 1].cond(S), true, `第 ${target} 章 cond 应成立`);
    assert.ok(r.fields && typeof r.fields === 'object', '返回值 fields 应为对象');
  }
});

test('techCount 用真实 tech/建筑 id 补足（ch10 需 38）', () => {
  const S = defaultState();
  const r = fillChapterResources(S, 10);
  const techIds = new Set(TECHS.map(t => t.id));
  const buildingIds = new Set(V21_BUILDINGS.filter(b => b.via !== 'upgrade').map(b => b.id));
  const count = Object.keys(S.tech).length + Object.keys(S.unlockedBuildings).length;
  assert.ok(count >= 38, `techCount 应 ≥38，实际 ${count}`);
  assert.ok(r.fields.techCount >= 38, '返回值应记录最终 techCount');
  assert.ok(!r.fields.techCountCapped, '当前数据（6 科技 + 34 建筑）足够，不应标记上限不足');
  for (const id of Object.keys(S.tech)) assert.ok(techIds.has(id), `科技 id 必须真实：${id}`);
  for (const id of Object.keys(S.unlockedBuildings)) assert.ok(buildingIds.has(id), `建筑 id 必须真实：${id}`);
  assert.ok(!('rp_distill' in S.unlockedBuildings), 'via:upgrade 的 rp_distill 不应写进 unlockedBuildings');
});

test('特殊条件：ch18 end_shrine / ch21 dmmind / ch34 focus / ch4 es>0', () => {
  const s18 = defaultState();
  fillChapterResources(s18, 18);
  assert.ok(s18.buildings.end_shrine >= 1, 'ch18 应直接写 buildings.end_shrine=1');
  assert.equal(CHAPTERS[17].cond(s18), true);

  const s21 = defaultState();
  fillChapterResources(s21, 21);
  assert.ok(s21.upgrades.dmmind >= 1, 'ch21 应写 upgrades.dmmind');
  assert.equal(CHAPTERS[20].cond(s21), true);

  const s34 = defaultState();
  fillChapterResources(s34, 34);
  assert.ok(s34.resonance.focus && s34.resonance.focus !== 'ep', 'ch34 应把 focus 设为非 ep（pt）');
  assert.equal(CHAPTERS[33].cond(s34), true);

  const s4 = defaultState();
  fillChapterResources(s4, 4);
  assert.ok(s4.es > 0, 'ch4 的 es>0 应成立');
  assert.equal(CHAPTERS[3].cond(s4), true);
});

test('驻留天数按 MS_PER_DAY（游戏日）回拨，而不是 86400000', () => {
  const S = defaultState();
  const r = fillChapterResources(S, 51);
  assert.equal(r.days, CHAPTERS[50].minDays, '回拨天数 = 目标章节 minDays');
  assert.ok(r.days > 0, '第 51 章 minDays 应 >0');
  assert.ok(Date.now() - S.chapterEnteredAt >= r.days * MS_PER_DAY, '回拨量应 ≥ 目标 minDays × MS_PER_DAY');
  assert.ok(daysSince(S.chapterEnteredAt) >= r.days, 'daysSince 应达到 minDays');
  // 若误用 86400000 会回拨过多；这里锁住「游戏日 ≠ 真实日」的口径。
  assert.ok(Date.now() - S.chapterEnteredAt < r.days * 86400000, '不应按真实日 86400000 回拨');
});

test('回拨后 currentChapter 能前进到下一章', () => {
  const S = defaultState();
  fillChapterResources(S, 6);
  const cur = currentChapter(S);
  assert.equal(cur.id, 2, '默认从第 1 章出发，满足第 2 章条件后应推进到第 2 章');
});

test('非法 targetChapter 钳制到 [1, CHAPTERS.length]，返回 fields 非空', () => {
  for (const bad of [-99, 0, -1, CHAPTER_COUNT + 1, 999, NaN, 'abc', undefined, null, Infinity, -Infinity]) {
    const S = defaultState();
    const r = fillChapterResources(S, bad);
    assert.ok(r.chapter >= 1 && r.chapter <= CHAPTER_COUNT, `非法入参 ${String(bad)} 应被钳制`);
  }
  assert.equal(fillChapterResources(defaultState(), -99).chapter, 1);
  assert.equal(fillChapterResources(defaultState(), 999).chapter, CHAPTER_COUNT);
  assert.equal(fillChapterResources(defaultState(), Infinity).chapter, CHAPTER_COUNT);
  assert.equal(fillChapterResources(defaultState(), -Infinity).chapter, 1);
  const high = fillChapterResources(defaultState(), 999);
  assert.ok(Object.keys(high.fields).length > 0, '钳制到末章后 fields 应非空');
});

test('console 推章后本章模块买得起：fillChapter(7) 的职级点 ≥ 集市买断价', () => {
  const S = defaultState();
  fillChapterResources(S, 7);
  assert.ok(S.prestigePoints >= 5, `第 7 章应至少补到 5 PP（集市 5 PP 买断），实际 ${S.prestigePoints}`);
  // 第 2 章不再需要为集市补 PP：当年 fillChapter(2) 只给 2 PP、集市要 5 PP 才点不动
  const s2 = defaultState();
  fillChapterResources(s2, 2);
  assert.ok(s2.prestige >= 2 || s2.prestigePoints >= 1, 'ch2 条件仍成立');
});
