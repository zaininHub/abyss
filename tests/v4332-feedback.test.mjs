// v4.3.31 反馈（m02273 四项）：
//   ① 日志保留最近 20 条，刷新后仍在（取消「1 小时窗口」）
//   ② 馆藏认证的「触发 / 获取 / 失效」都要打日志
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

test('②-1 任务「触发」打一次日志（本局首次拥有工位）', () => {
  assert.match(PROG, /let _museumTriggered = false;/);
  assert.match(PROG, /特殊任务触发：博物馆的访客/, '触发日志文案');
  const block = PROG.slice(PROG.indexOf("if (task.id === 'sp1_museum')"));
  assert.ok(block.indexOf('_museumTriggered = true;') < block.indexOf('特殊任务触发：博物馆的访客'),
    '先置位再打日志（同帧不会重复触发）');
});

test('②-2 徽章的「获取 / 失效」都有日志', () => {
  assert.match(PROG, /馆藏认证：已达标（工位 \$\{kinds\} 种 \/ 等级和 \$\{sum\}）/, '已颁证老档重新达标要留痕');
  assert.match(PROG, /馆藏认证：当前未达标（工位 \$\{kinds\} 种 \/ 等级和 \$\{sum\}，需 3 种 \/ 50）——徽章已隐藏/,
    '达标被打破要留痕');
});

test('②-3 行为：触发 → 完成 → 失效 → 重新达标，日志按顺序出现', async () => {
  const prog = await import('../src/modules/progression.js');
  const lines = [];
  const push = (m) => lines.push(String(m));
  const S = {
    _specialTasksDone: {},
    upgrades: { storage: 300, scribble: 20, script: 20, parallel: 10 },
    storyline: 'any',
    tech: {}, buildings: {}, faith: 0, ep: 0, dm: 0, rp: 0,
  };
  prog.checkSpecialTasks(S, push, () => {});
  assert.ok(lines.some((l) => /特殊任务触发：博物馆的访客/.test(l)), '首次拥有工位要有触发日志');
  assert.ok(lines.some((l) => /馆藏认证已颁发/.test(l)), '完成时要有颁发日志');

  // 已颁过证的老档：工位被清空 → 徽章失效要留痕
  lines.length = 0;
  const S2 = {
    _specialTasksDone: { sp1_museum: true },
    upgrades: {},
    storyline: 'any', tech: {}, buildings: {}, faith: 0, ep: 0, dm: 0, rp: 0,
  };
  prog.checkSpecialTasks(S2, push, () => {}); // 第一次：从上一次的达标态翻到不达标
  assert.ok(lines.some((l) => /徽章已隐藏/.test(l)), '达标被打破要有失效日志');

  // 重新达标 → 「已达标」日志（不再重复颁发）
  lines.length = 0;
  S2.upgrades = { storage: 300, scribble: 20, script: 20, parallel: 10 };
  prog.checkSpecialTasks(S2, push, () => {});
  assert.ok(lines.some((l) => /馆藏认证：已达标/.test(l)), '重新达标要有获取日志');
  assert.ok(!lines.some((l) => /馆藏认证已颁发/.test(l)), '已颁过证不应重复「颁发」日志');
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
