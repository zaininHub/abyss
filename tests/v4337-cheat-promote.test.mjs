// v4.3.37：__abyssCheat.fillChapter(n) 语义调整验收 —— 只备「从第 n 章晋升出去」的条件，
//   不代写 S.chapter / S.chaptersUnlocked；晋升门槛类条件补到「差最后一次」，由玩家手动点「晋升」。
// 口径：
//   1) S.chapter 一个字节都不写（章节推进交给 src/systems/frameSystems.js 的 chapter 系统）；
//   2) 静态条件（科技/建筑/数值/共鸣…）抬到「下一章 cond 成立」；
//   3) 晋升门槛类条件（prestige / prestigePoints）只补到 门槛-1，并把 runEarned 抬过晋升线，
//      模拟玩家点一次晋升（prestige++ / prestigePoints += gain）后 cond 立刻成立；
//   4) 驻留天数按游戏日 MS_PER_DAY 回拨到「下一章 minDays」，与 fillChapterResources 同口径。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, currentChapter } from '../src/data/chapters.js';
import { fillChapterPromotion, MODULE_PP_BY_CHAPTER } from '../src/core/devCheat.js';
import { daysSince } from '../src/core/time.js';

if (!globalThis.localStorage) {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
const { defaultState } = await import('../src/state.js');
const { S: LIVE_S } = await import('../src/state.js');
const { prestigeNeed } = await import('../src/modules/economy.js');

const CHAPTER_COUNT = CHAPTERS.length;

/** 模拟玩家在 UI 点一次「晋升」：doPrestige 的最少副作用（prestige++ / 职级点 += gain）。 */
function clickPrestige(S, gain = 1) {
  S.prestige = (Number(S.prestige) || 0) + 1;
  S.prestigePoints = (Number(S.prestigePoints) || 0) + gain;
}

test('第 1 章 → 第 2 章：不写章节，晋升次数留最后一次，点一次晋升即达标', () => {
  const S = defaultState();
  const before = S.chapter;
  const r = fillChapterPromotion(S, 1);

  assert.equal(r.chapter, 1, '入参章节即「你所在的章」');
  assert.equal(r.target, 2, '目标是下一章（要晋升进入的章）');
  assert.equal(r.days, CHAPTERS[1].minDays, '驻留回拨 = 下一章 minDays');
  assert.equal(r.manualPrestige, true, '第 2 章门槛是晋升 → 必须留一次手动晋升');

  // 章节一个字节都不写
  assert.equal(S.chapter, before, 'S.chapter 不得被改写');
  assert.ok(!S.chaptersUnlocked || !Object.keys(S.chaptersUnlocked).length, '不得代写章节图鉴');

  // 晋升条件「差最后一次」
  assert.equal(S.prestige, 1, '晋升次数补到 门槛-1（2-1）');
  assert.equal(S.prestigePoints, 0, '职级点不代打（最后 1 点由玩家点晋升拿到）');
  assert.ok(S.runEarned >= prestigeNeed(), '本局累计必须抬过晋升线，否则按钮点不动');
  assert.equal(CHAPTERS[1].cond(S), false, '补完后仍未达标：等玩家自己点晋升');

  clickPrestige(S);
  assert.equal(CHAPTERS[1].cond(S), true, '点一次晋升后第 2 章 cond 成立');

  // 章节推进由游戏判定：驻留 + cond 都满足 → currentChapter 前进一步
  assert.equal(currentChapter(S).id, 2, '点完晋升 + 驻留到位 → 第 2 章');
});

test('非晋升门槛章（第 2 → 第 3 章）：条件直接成立，不需要手动晋升', () => {
  const S = defaultState();
  S.chapter = '2';
  const r = fillChapterPromotion(S, 2);

  assert.equal(r.target, 3);
  assert.equal(r.manualPrestige, false, '科技数门槛与晋升无关');
  assert.equal(S.chapter, '2', 'S.chapter 不得被改写');
  assert.equal(CHAPTERS[2].cond(S), true, '第 3 章 cond 直接成立（科技 + 建筑 ≥8）');
  assert.ok(Object.keys(r.fields).length > 0, '应有字段被改写');
  assert.ok(daysSince(S.chapterEnteredAt) >= CHAPTERS[2].minDays, '驻留达到第 3 章 minDays');
  assert.equal(currentChapter(S).id, 3, '游戏自身判定可推进到第 3 章');
});

test('晋升次数门槛章（第 6 → 第 7 章）：补到 14 次并买得起集市，点一次晋升即 15', () => {
  const S = defaultState();
  const r = fillChapterPromotion(S, 6);

  assert.equal(r.target, 7);
  assert.equal(r.manualPrestige, true);
  assert.equal(S.prestige, 14, '晋升门槛 15 次 → 补到 14 次');
  assert.ok(S.prestigePoints >= 5, `职级点要够集市买断价 ${MODULE_PP_BY_CHAPTER[7]}（实际 ${S.prestigePoints}）`);
  assert.equal(CHAPTERS[6].cond(S), false, '差最后一次晋升');
  assert.equal(S.chapter, '1', 'S.chapter 不得被改写');

  clickPrestige(S);
  assert.equal(CHAPTERS[6].cond(S), true, '点一次晋升后第 7 章 cond 成立');
});

test('末章没有下一章：target 为 null，不抛错，驻留按本章 minDays', () => {
  const S = defaultState();
  let r;
  assert.doesNotThrow(() => { r = fillChapterPromotion(S, CHAPTER_COUNT); });
  assert.equal(r.chapter, CHAPTER_COUNT);
  assert.equal(r.target, null, '末章没有可晋升进入的下一章');
  assert.equal(r.days, CHAPTERS[CHAPTER_COUNT - 1].minDays);
  assert.equal(S.chapter, '1', 'S.chapter 不得被改写');
});

test('非法入参钳到 [1, CHAPTERS.length]，且始终不写章节', () => {
  for (const bad of [-99, 0, -1, CHAPTER_COUNT + 1, 999, NaN, 'abc', undefined, null, Infinity, -Infinity]) {
    const S = defaultState();
    const r = fillChapterPromotion(S, bad);
    assert.ok(r.chapter >= 1 && r.chapter <= CHAPTER_COUNT, `非法入参 ${String(bad)} 应被钳制`);
    assert.equal(S.chapter, '1', `非法入参 ${String(bad)} 也不得改写章节`);
  }
  assert.equal(fillChapterPromotion(defaultState(), -99).chapter, 1);
  assert.equal(fillChapterPromotion(defaultState(), 999).chapter, CHAPTER_COUNT);
  assert.equal(fillChapterPromotion(defaultState(), 999).target, null);
});

test('全章节 1..51 逐章调用：都不写 S.chapter，只抬不降', () => {
  const S = defaultState();
  for (let n = 1; n <= CHAPTER_COUNT; n += 1) {
    let r;
    assert.doesNotThrow(() => { r = fillChapterPromotion(S, n); }, `第 ${n} 章不应抛错`);
    assert.equal(r.chapter, n);
    assert.equal(S.chapter, '1', `第 ${n} 章调用后 S.chapter 应保持 1`);
    const snapshot = { prestige: S.prestige, pp: S.prestigePoints, es: S.es, allTimeEp: S.allTimeEp };
    fillChapterPromotion(S, n);
    assert.ok(S.prestige >= snapshot.prestige && S.prestigePoints >= snapshot.pp
      && S.es >= snapshot.es && S.allTimeEp >= snapshot.allTimeEp, `第 ${n} 章重复调用不得降低字段`);
  }
});

test('晋升门槛口径与 economy.prestigeNeed() 同源（防 devCheat 与线上漂移）', () => {
  // devCheat 内部用 pricing.powerScale 复算（不能 import economy：会拉起全局存档）。
  // 这里用线上真源反推：fillChapterPromotion 抬出的 runEarned 必须恰好 = ceil(prestigeNeed()*1.05)。
  for (const p of [0, 1, 7]) {
    LIVE_S.prestige = p;
    LIVE_S.runEarned = 0;
    fillChapterPromotion(LIVE_S, 6); // 第 7 章门槛是晋升次数 → 必定补 runEarned
    assert.equal(LIVE_S.runEarned, Math.ceil(prestigeNeed() * 1.05),
      `prestige=${p} 时 runEarned 口径应与 prestigeNeed() 一致`);
  }
});

test('下一章 cond 本就成立时不再提示晋升、也不白抬 runEarned', () => {
  // 场景：玩家已经晋升到第 2 次（第 2 章 cond 成立），又调了一次 fillChapter(1)
  const S = defaultState();
  S.chapter = '1';
  S.prestige = 2;
  S.prestigePoints = 1;
  S.runEarned = 0;

  const r = fillChapterPromotion(S, 1);

  assert.equal(r.target, 2);
  assert.equal(r.manualPrestige, false, '第 2 章 cond 已成立 → 不该再让人去点晋升');
  assert.equal(S.runEarned, 0, '不该白抬本局累计 EP');
  assert.equal(S.prestige, 2, '不得改写晋升次数');
  assert.equal(S.prestigePoints, 1, '不得改写职级点');
  assert.equal(CHAPTERS[1].cond(S), true);
  assert.equal(currentChapter(S).id, 2, '只等驻留够，游戏自己会推进');
});
