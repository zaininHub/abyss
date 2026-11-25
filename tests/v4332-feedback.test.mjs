// v4.3.31 反馈（m02273 四项）：
//   ① 日志保留最近 20 条，刷新后仍在（取消「1 小时窗口」）
//   ② 馆藏认证改成「馆长来信」三段式：3 种工位邀请 → 每 2 小时关注 → 完成会晤
//   ③ 里程碑未达的效能建筑不进入链条窗口（第一章不该露出里程碑 5 的机会感知器）
//   ④ 隐藏测试命令 __abyssCheat.fillChapter（模块实现见 tests/v4331-cheat-fill.test.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const RUNTIME = read('src/core/runtime.js');
const MAIN = read('src/main.js');
const SHOP = read('src/modules/shop.js');
const PROG = read('src/modules/progression.js');
const LOG_KEY = 'abyss_idle_v2_logcache';

// ---------- ① 日志 20 条 + 跨刷新保留 ----------

test('①-1 日志常量改为「最近 20 条」，不再按 1 小时时间窗口裁剪', () => {
  assert.match(RUNTIME, /export const LOG_MAX = 20;/, 'LOG_MAX 必须是 20');
  assert.match(RUNTIME, /if \(logs\.length > LOG_MAX\) logs\.length = LOG_MAX;/,
    '按条数截断（不是按时间）');
  assert.doesNotMatch(RUNTIME, /LOG_TTL/, '旧的 1 小时窗口常量必须删除，否则慢节奏会话整批日志会过期消失');
});

test('①-2 log() 只留最近 20 条，且写入 localStorage（刷新后能读回同一批）', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const panel = { innerHTML: '' };
  globalThis.document = { getElementById: (id) => (id === 'log-content' ? panel : null) };

  const rt = await import('../src/core/runtime.js?case=log-20');
  for (let i = 1; i <= 25; i++) rt.log(`第${i}条`);

  const cached = JSON.parse(store.get(LOG_KEY));
  assert.equal(cached.length, 20, '缓存里只能有最近 20 条');
  assert.match(cached[0].h, /第25条/, '最近的一条在最前（倒序）');
  assert.match(cached[19].h, /第6条/, '最老的恰好是第 6 条（25-20+1）');

  // 面板同步渲染 20 行
  assert.equal((panel.innerHTML.match(/<div>/g) || []).length, 20);

  // 模拟刷新：新模块实例从 localStorage 恢复，仍能画出这 20 条
  const panel2 = { innerHTML: '' };
  globalThis.document = { getElementById: (id) => (id === 'log-content' ? panel2 : null) };
  const rt2 = await import('../src/core/runtime.js?case=log-20-reload');
  assert.equal(rt2.LOG_MAX, 20);
  rt2.paintLogs();
  assert.equal((panel2.innerHTML.match(/<div>/g) || []).length, 20, '刷新后启动即补画缓存日志');
  assert.match(panel2.innerHTML, /第25条/);
  assert.match(panel2.innerHTML, /第6条/);

  delete globalThis.localStorage;
  delete globalThis.document;
});

test('①-3 startApp 启动时调用 paintLogs()，刷新后不必等下一条日志才显示历史', () => {
  assert.match(MAIN, /import \{[^}]*paintLogs[^}]*\} from '\.\/core\/runtime\.js';/,
    'main.js 必须 import paintLogs');
  const body = MAIN.slice(MAIN.indexOf('function startApp()'));
  const start = body.indexOf('paintLogs();');
  assert.ok(start > 0, 'startApp 内必须有 paintLogs() 调用');
  assert.ok(start < body.indexOf('render();', start),
    'paintLogs 必须在首次 render 之前，保证首屏就有历史日志');
});

// ---------- ② 馆藏认证日志 ----------

test('②-1 工位满 3 种时打一条邀请日志（只一次，落档 _museumInvited）', () => {
  assert.match(PROG, /export const MUSEUM_HINT_INTERVAL_MS = 2 \* 60 \* 60 \* 1000;/,
    '完成前的关注提醒间隔 = 2 小时');
  assert.match(PROG, /馆长期待与您共进晚餐，请携带3种共计50件宝物觐见\.\.\.\./, '邀请文案');
  assert.match(PROG, /if \(kinds >= 3 && !S\._museumInvited\)/, '触发条件 = 工位 ≥3 种且尚未邀请过');
  assert.match(PROG, /S\._museumInvited = true;/, '邀请必须落档，刷新不重复');
});

test('②-2 完成前每 2 小时一条「馆长在关注您...」，完成后打会晤收尾', () => {
  assert.match(PROG, /馆长在关注您\.\.\./, '关注提醒文案');
  assert.match(PROG, /now - \(Number\(S\._museumHintAt\) \|\| 0\) >= MUSEUM_HINT_INTERVAL_MS/,
    '按落档时间戳控 2 小时节奏（刷新不重置）');
  assert.match(PROG, /馆长十分满意与您的会晤，期待下次会面/, '完成会晤文案');
  assert.doesNotMatch(PROG, /博物馆的访客仍在参观/, '旧的 60 秒进度提醒必须移除');
  assert.doesNotMatch(PROG, /馆藏认证已颁发/, '旧的第二条颁发日志必须移除（改为单条会晤文案）');
  assert.doesNotMatch(PROG, /馆藏认证：已达标|馆藏认证：当前未达标/, '旧的达标/失效日志必须移除');
});

test('②-3 行为：邀请一次 → 2 小时后再关注 → 完成只打会晤文案', async () => {
  const prog = await import('../src/modules/progression.js');
  const lines = [];
  const push = (m) => lines.push(String(m));
  const mkS = (upgrades, done = {}) => ({
    _specialTasksDone: done,
    upgrades,
    storyline: 'any', tech: {}, buildings: {}, faith: 0, ep: 0, dm: 0, rp: 0,
  });
  const threeLow = { scribble: 10, script: 10, parallel: 10 }; // 3 种但等级和 30 < 50：只邀请、不完成

  // 只有 2 种工位：不邀请
  const s2 = mkS({ scribble: 20, script: 10 }); // 2 种工位，等级和 30
  prog.checkSpecialTasks(s2, push, () => {});
  assert.ok(!lines.some((l) => /馆长/.test(l)), '未满 3 种不应出现馆长日志');
  assert.equal(s2._museumInvited, undefined);

  // 满 3 种：邀请一次
  const s3 = mkS(threeLow);
  prog.checkSpecialTasks(s3, push, () => {});
  assert.equal(lines.filter((l) => /馆长期待与您共进晚餐/.test(l)).length, 1, '邀请只打一条');
  assert.equal(s3._museumInvited, true);

  // 再跑两帧：不重复邀请、2 小时内不关注
  prog.checkSpecialTasks(s3, push, () => {});
  prog.checkSpecialTasks(s3, push, () => {});
  assert.equal(lines.filter((l) => /馆长期待与您共进晚餐/.test(l)).length, 1, '刷新/多帧不重复邀请');
  assert.equal(lines.filter((l) => /馆长在关注您/.test(l)).length, 0, '2 小时内不催');

  // 把落档时间拨回 2 小时前 → 关注一次；再拨回 1 小时前 → 不再催
  s3._museumHintAt = Date.now() - prog.MUSEUM_HINT_INTERVAL_MS - 1000;
  prog.checkSpecialTasks(s3, push, () => {});
  assert.equal(lines.filter((l) => /馆长在关注您/.test(l)).length, 1, '满 2 小时催一次');
  s3._museumHintAt = Date.now() - 60 * 60 * 1000;
  prog.checkSpecialTasks(s3, push, () => {});
  assert.equal(lines.filter((l) => /馆长在关注您/.test(l)).length, 1, '不足 2 小时不催');

  // 补满 50 级 → 完成：只打会晤文案，徽章同帧上店
  lines.length = 0;
  s3.upgrades = { scribble: 20, script: 20, parallel: 10 }; // 3 种、等级和 50 → 完成
  prog.checkSpecialTasks(s3, push, () => {});
  assert.ok(lines.some((l) => /馆长十分满意与您的会晤，期待下次会面/.test(l)), '完成要打会晤文案');
  assert.ok(!lines.some((l) => /特殊任务：博物馆的访客/.test(l)), '不再套通用任务模板');
  assert.ok(!lines.some((l) => /馆藏认证已颁发/.test(l)), '不再有第二条颁发日志');
  assert.equal(s3._specialTasksDone.sp1_museum, true);
});

// ---------- ③ 里程碑门控 ----------

test('③-1 里程碑未达的效能建筑不进入链序', () => {
  assert.match(SHOP, /const milesAchieved = Object\.keys\(S\.milesDone \|\| \{\}\)\.length;/);
  assert.match(SHOP, /const locked = avail\.filter\(b => !v21UnlockedMark\(b\) && milesAchieved >= unlockMilestoneV21\(b\)\);/,
    '未达里程碑的项必须从 locked 列表剔除（不占链条窗口）');
  assert.match(SHOP, /import \{[^}]*unlockMilestoneV21[^}]*\} from '\.\.\/data\/buildings\.js';/,
    'unlockMilestoneV21 必须已导入');
});

test('③-2 语义：机会感知器门槛 = 里程碑 5，而第一章只到 m0 建筑', async () => {
  const { unlockMilestoneV21, V21_BUILDINGS } = await import('../src/data/buildings.js');
  const sensor = V21_BUILDINGS.find((b) => b.id === 'chance_sensor');
  assert.ok(sensor, '机会感知器必须存在');
  assert.equal(unlockMilestoneV21(sensor), 5, '机会感知器按 base 6e5 落在里程碑 5');
  // 新档 milesDone 为空 → 达成数 0 < 5 → 不进链序（第一章不露出）
  const fresh = { milesDone: {} };
  const achieved = Object.keys(fresh.milesDone).length;
  assert.ok(achieved < unlockMilestoneV21(sensor));
  // 达成 5 个里程碑后 → 进链序（灰卡显示「需里程碑 5」式需求不再出现，直接可买）
  const later = { milesDone: { 100: true, 1000: true, 10000: true, 100000: true, 1000000: true } };
  assert.ok(Object.keys(later.milesDone).length >= unlockMilestoneV21(sensor));
});

// ---------- ④ 隐藏测试命令 ----------

test('④ 控制台隐藏命令已接线（__abyssCheat.fillChapter）', () => {
  assert.match(MAIN, /window\.__abyssCheat = \{/, '必须暴露 window.__abyssCheat');
  assert.match(MAIN, /fillChapter\(n\) \{/, '必须有 fillChapter(n)');
  assert.match(MAIN, /const r = fillChapterResources\(S, n\);/, '必须复用纯函数实现');
  assert.match(MAIN, /__abyssCheat\.fillChapter\(5\)/, '注释里给出控制台用法示例');
  assert.match(MAIN, /来自 '\.\/core\/devCheat\.js'|from '\.\/core\/devCheat\.js'/,
    'main.js 必须 import devCheat');
});
