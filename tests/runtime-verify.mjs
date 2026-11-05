// v2.0 第三轮修复：运行时核心机制验证脚本
// 验证 P0-1 章节推进、P0-2 特殊任务、P0-3 数据接入、P1-1 门控、P1-2 死字段清理
import assert from 'node:assert';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 最小 DOM stub
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} }, dataset: {} }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { S: _S, load, defaultState } = await import('../src/state.js');
const { getTechs, getBuildings, getEvents, getChapters, setStoryline, registerVariants, _resetProvider } = await import('../src/core/provider.js');
const { registerStoryline, loadStoryline, _resetStorylineManager } = await import('../src/core/storylineManager.js');
const { isStageUnlocked } = await import('../src/core/progressive.js');
const { checkGate, registerGate, _clearGates } = await import('../src/core/gates.js');
const { SPECIAL_TASKS, checkSpecialTasks } = await import('../src/modules/progression.js');
const { currentChapter } = await import('../src/modules/story.js');

const slOrder = (await import('../src/storylines/line_order.js')).default;
const slAbyss = (await import('../src/storylines/line_abyss.js')).default;
const slFaith = (await import('../src/storylines/line_faith.js')).default;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' :: ' + e.message); }
}

// 重置全局状态辅助
function freshState() {
  const s = defaultState();
  for (const k of Object.keys(s)) _S[k] = s[k];
  return _S;
}

console.log('[P0-1] 章节推进验证：字符串 chapter 与 storyline 章节比较');
{
  const S = freshState();
  t('chapter 初始值为字符串 "1"', () => assert.equal(S.chapter, '1'));
  t('默认线 currentChapter 返回数字 ID', () => {
    const ch = currentChapter(S);
    assert.equal(typeof ch.id, 'number');
    assert.equal(ch.id, 1);
  });

  // v3.6.0 方向⑥：章节由「条件满足 + 最短驻留 3~7 天」共同推进，不再一天连跳多章
  S.prestige = 2;
  S.chapterEnteredAt = Date.now();
  t('晋升条件满足但驻留 0 天：章节不推进（3-7 天/章）', () => assert.equal(currentChapter(S).id, 1));
  S.chapterEnteredAt = Date.now() - 4 * 86400000;
  let ch = currentChapter(S);
  if (ch.id > S.chapter) S.chapter = String(ch.id);
  t('驻留 4 天且条件满足：章节向前推进', () => assert.ok(Number(S.chapter) >= 2));

  // 注册并切换到秩序线
  _resetStorylineManager();
  _resetProvider();
  registerStoryline(slOrder);
  loadStoryline('line_order');
  S.storyline = 'line_order';
  S._forkTriggered = true;

  t('秩序线 Provider 返回专属科技', () => {
    const techs = getTechs();
    assert.ok(techs.find(t => t.id === 'new_protocol'), '应含 new_protocol');
  });

  t('秩序线 Provider 返回专属建筑', () => {
    const blds = getBuildings();
    assert.ok(blds.find(b => b.id === 'compiler_temple'), '应含 compiler_temple');
  });

  t('秩序线 Provider 返回专属事件', () => {
    const evs = getEvents();
    assert.ok(evs.find(e => e.id === 'protocol_bug'), '应含 protocol_bug');
  });

  t('秩序线章节 6A 条件满足时推进', () => {
    // 6A 条件：S.storyline === 'line_order'（已满足）
    const ch = currentChapter(S);
    const chStr = String(ch.id);
    const sChStr = String(S.chapter || '1');
    assert.ok(chStr > sChStr, `6A('${chStr}') 应 > 当前 chapter('${sChStr}')`);
    S.chapter = chStr;
    assert.equal(S.chapter, '6A');
  });

  t('7A 条件满足时继续推进', () => {
    // 模拟满足 7A 条件：techCount >= 15
    for (let i = 0; i < 15; i++) S.tech[`t${i}`] = true;
    const ch = currentChapter(S);
    const chStr = String(ch.id);
    const sChStr = String(S.chapter || '1');
    assert.ok(chStr > sChStr, `7A('${chStr}') 应 > 当前 chapter('${sChStr}')`);
    S.chapter = chStr;
    assert.equal(S.chapter, '7A');
  });

  // v3.6.0 方向⑦：模块解锁与章节解耦，改按游玩天数推进（约 2 大块/天）
  t('渐进开放按游玩天数推进（P6 需 2.5 天，P7 需 3 天）', () => {
    const saved = S.startedAt;
    S.startedAt = Date.now() - 2.6 * 86400000;
    assert.equal(isStageUnlocked('P6', S), true, '2.6 天：P6 解锁');
    assert.equal(isStageUnlocked('P7', S), false, '2.6 天：P7（3 天）仍锁定');
    S.startedAt = Date.now() - 3.1 * 86400000;
    assert.equal(isStageUnlocked('P7', S), true, '3.1 天：P7 解锁');
    S.startedAt = saved;
  });

  // 深渊线验证
  _resetStorylineManager();
  _resetProvider();
  registerStoryline(slAbyss);
  loadStoryline('line_abyss');
  S.storyline = 'line_abyss';
  S.chapter = '5';
  t('深渊线 Provider 返回 chaos_born', () => {
    const techs = getTechs();
    assert.ok(techs.find(t => t.id === 'chaos_born'), '应含 chaos_born');
  });

  // 信仰线验证
  _resetStorylineManager();
  _resetProvider();
  registerStoryline(slFaith);
  loadStoryline('line_faith');
  S.storyline = 'line_faith';
  S.chapter = '5';
  t('信仰线 Provider 返回 divine_right', () => {
    const techs = getTechs();
    assert.ok(techs.find(t => t.id === 'divine_right'), '应含 divine_right');
  });
}

console.log('[P0-2] 特殊任务触发验证');
{
  const S = freshState();
  S._specialTasksDone = {};

  t('sp2_last_thread：100 线程时触发', () => {
    S.cultists = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    checkSpecialTasks(S, null, null);
    assert.ok(S._specialTasksDone['sp2_last_thread'], '应触发 sp2');
  });

  t('sp1_museum：建筑足够时触发', () => {
    S._specialTasksDone = {};
    S.buildings = { canteen: 2, dorm: 1 };
    checkSpecialTasks(S, null, null);
    assert.ok(S._specialTasksDone['sp1_museum'], '应触发 sp1');
  });

  t('sp3_farewell：休眠状态时触发', () => {
    S._specialTasksDone = {};
    S.buildings = {};
    S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 10, bufferSec: 0, loseTimer: 0 };
    S._farewellBought = true; // 达成条件含「已购买离职礼盒」（1 EP），此前测试漏设 → 恒失败
    checkSpecialTasks(S, null, null);
    assert.ok(S._specialTasksDone['sp3_farewell'], '应触发 sp3');
  });

  t('sp_order_protocol：秩序线 + 3 次重写', () => {
    S._specialTasksDone = {};
    S.storyline = 'line_order';
    S.orderRewrites = { a: 1, b: 1, c: 1 };
    checkSpecialTasks(S, null, null);
    assert.ok(S._specialTasksDone['sp_order_protocol'], '应触发 sp_order_protocol');
  });

  t('sp_abyss_gaze：深渊线 + 腐化≥30', () => {
    S._specialTasksDone = {};
    S.storyline = 'line_abyss';
    S.corruption = 35;
    checkSpecialTasks(S, null, null);
    assert.ok(S._specialTasksDone['sp_abyss_gaze'], '应触发 sp_abyss_gaze');
  });

  t('sp_faith_mission：信仰线 + 50 线程', () => {
    S._specialTasksDone = {};
    S.storyline = 'line_faith';
    S.cultists = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    checkSpecialTasks(S, null, null);
    assert.ok(S._specialTasksDone['sp_faith_mission'], '应触发 sp_faith_mission');
  });
}

console.log('[P0-3] 故事线数据接入验证：渲染层通过 Provider 获取数据');
{
  const techSrc = fs.readFileSync(join(__dirname, '../src/modules/tech.js'), 'utf8');
  const shopSrc = fs.readFileSync(join(__dirname, '../src/modules/shop.js'), 'utf8');
  const eventsSrc = fs.readFileSync(join(__dirname, '../src/modules/events.js'), 'utf8');

  t('tech.js 不再硬编码导入 data/techs.js', () => {
    assert.ok(!techSrc.includes("from '../data/techs.js'"), 'tech.js 不应硬编码导入 techs');
    assert.ok(techSrc.includes("from '../core/provider.js'"), 'tech.js 应从 provider 导入');
  });

  t('shop.js 不再硬编码导入 BUILDINGS', () => {
    assert.ok(!shopSrc.includes("BUILDINGS } from '../data/buildings.js'"), 'shop.js 不应硬编码导入 BUILDINGS');
    assert.ok(shopSrc.includes("from '../core/provider.js'"), 'shop.js 应从 provider 导入');
  });

  t('events.js 不再硬编码导入 data/events.js', () => {
    assert.ok(!eventsSrc.includes("from '../data/events.js'"), 'events.js 不应硬编码导入 events');
    assert.ok(eventsSrc.includes("from '../core/provider.js'"), 'events.js 应从 provider 导入');
  });
}

console.log('[P1-1] 门控系统接入验证');
{
  _clearGates();
  registerGate('test_panel', () => false, '测试锁定');

  t('checkGate 在主循环中被调用（源码断言）', () => {
    const mainSrc = fs.readFileSync(join(__dirname, '../src/main.js'), 'utf8');
    assert.ok(mainSrc.includes('checkGate'), 'main.js 应调用 checkGate');
    assert.ok(mainSrc.includes('getAllGates'), 'main.js 应调用 getAllGates');
  });

  t('checkGate 返回 false 时门控生效', () => {
    assert.equal(checkGate('test_panel'), false);
  });
}

console.log('[P1-2] storyChapter 死字段清理验证');
{
  const stateSrc = fs.readFileSync(join(__dirname, '../src/state.js'), 'utf8');
  t('defaultState 不再定义 storyChapter', () => {
    assert.ok(!stateSrc.includes('storyChapter:'), 'defaultState 应删除 storyChapter');
  });
  t('迁移代码不再兜底 storyChapter', () => {
    assert.ok(!stateSrc.includes("data.storyChapter"), '迁移不应处理 storyChapter');
  });
}

console.log('\n========================');
console.log(`运行时验证结果：${pass} 通过，${fail} 失败`);
console.log('========================');
process.exit(fail > 0 ? 1 : 0);
