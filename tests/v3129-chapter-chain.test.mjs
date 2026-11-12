// v3.12.9 章节链防回归：故事线变体分支不得在主线分叉点之前越权接管。
//
// 背景（真实浏览器实测）：主线第 1 章 + line_order + 富资产存档，3 天后 S.chapter 直接
// 变成字符串变体 '11A'，主线 1~4 章剧情整段丢失。根因是 currentChapter 的变体段在
// at === -1（当前为数字章）时从索引 0 起遍历全部变体并连续覆盖 vCur，
// 且 `return vCur || cur` 让变体盖掉主线；frameSystems 再按 chapterRank 写成字符串章。
//
// 本测试同时覆盖：① 纯函数 data/chapters.js；② 真实调用链 modules/story.js + provider。
import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { CHAPTERS, currentChapter } = await import('../src/data/chapters.js');
const provider = await import('../src/core/provider.js');
const { currentChapter: storyChapter } = await import('../src/modules/story.js');

// 富状态：让主线 2~6 章的 cond 全部成立（tech 造 30 项假钥匙，仅用于 techCount 计数）
function rich(chapter, daysAgo) {
  return {
    chapter: String(chapter), chapterEnteredAt: Date.now() - daysAgo * 86400000,
    tech: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['t' + i, true])),
    unlockedBuildings: {}, prestige: 999, prestigePoints: 999, es: 1e6, faith: 1e6,
    expeditionsDone: 999, riftsSealed: 999, riftEmber: 1e9, dm: 1e9,
    allTimeEp: 1e18, projectsDone: 999, buildings: {}, upgrades: {}, religion: {},
    wageState: { state: 'ok' }, storyline: 'line_order',
  };
}

const VARIANTS = [
  { id: '5A', name: '立誓章', desc: '需定向建筑', cond: () => false, minDays: 5 },
  { id: '6A', name: '协议草案', desc: '线专属', cond: () => true, minDays: 3 },
  { id: '7A', name: '编译器觉醒', desc: '线专属', cond: () => true, minDays: 3 },
  { id: '8A', name: '逻辑门', desc: '线专属', cond: () => true, minDays: 5 },
];
// 主线只截到 6 章，避免 7~46 章的 cond 干扰本测试关注的分叉行为
const LIST = [...CHAPTERS.filter(c => typeof c.id === 'number' && c.id <= 6), ...VARIANTS];

console.log('[v3.12.9] 章节链 / 变体分支门控');

test('C1 主线未到分叉点时，变体不得覆盖主线章节', () => {
  const S = rich(1, 3);
  const ch = currentChapter(S, LIST);
  assert.equal(typeof ch.id, 'number', '第 1 章不应被字符串变体接管');
  assert.equal(ch.id, 3, '3 天驻留应正常推进到第 3 章（连跳属既有设计）');
});

test('C2 到达分叉点后进入变体分支，且一次只推进一章', () => {
  const ch = currentChapter(rich(5, 10), LIST);
  assert.equal(ch.id, '6A', '应从第一个满足条件的变体进入，而不是跳到分支末尾 8A');
});

test('C3 已在变体分支内同样逐章推进', () => {
  const ch = currentChapter(rich('6A', 10), LIST);
  assert.equal(ch.id, '7A', '6A → 7A，不应一次跳到 8A');
});

test('C4 变体条件不满足时跳过而非断链', () => {
  const list = [...CHAPTERS.filter(c => typeof c.id === 'number' && c.id <= 6),
    { id: '5A', cond: () => false, minDays: 3, name: '', desc: '' },
    { id: '6A', cond: () => false, minDays: 3, name: '', desc: '' },
    { id: '7A', cond: () => true, minDays: 3, name: '', desc: '' }];
  assert.equal(currentChapter(rich(5, 10), list).id, '7A');
});

test('C5 默认线（无变体）保持既有连跳节奏与不回退', () => {
  assert.equal(currentChapter(rich(2, 1), CHAPTERS).id, 2, '驻留 1 天停在 2');
  assert.equal(currentChapter(rich(2, 4), CHAPTERS).id, 6, '驻留 4 天推进到 6');
  assert.equal(currentChapter(rich(1, 3), CHAPTERS).id, 3, '第 1 章 3 天推进到 3');
  assert.equal(currentChapter(rich(5, 0), CHAPTERS).id, 5, '已抵达章节不回退');
});

test('C6 真实调用链（modules/story + provider 合并表）不越权', () => {
  try {
    provider._resetProvider();
    provider.setStoryline('line_order');
    provider.registerVariants({ chapters: { append: VARIANTS } });
    // 主线第 1 章 + 3 天：真实链也不得返回字符串变体
    const early = storyChapter(rich(1, 3));
    assert.equal(typeof early.id, 'number', `真实链把第 1 章跳成了 ${early.id}`);
    // 到达分叉点后进入变体，且一次只推进一章
    const forked = storyChapter(rich(5, 10));
    assert.equal(String(forked.id), '6A', `真实链分叉结果异常：${forked.id}`);
  } finally {
    provider._resetProvider();
  }
});
