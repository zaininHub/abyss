// v2.9.2 ② 离职礼盒（sp3_farewell 购买入口）回归测试
// 文案承诺"购买离职礼盒（1 EP）送给流失的线程"，此前 condition 仅 dormant||staffUnhappy≥3 自动触发，
// 购买入口从未实现。现 condition 加入 S._farewellBought 前置，由浮动按钮提供购买入口。
// v4.3.11 反馈①：条件再收紧——仅 losing（流失预警）触发；dormant 只是「可能流失」不摆任务。
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { S } = await import('../src/state.js');
const { SPECIAL_TASKS, checkSpecialTasks } = await import('../src/modules/progression.js');

const reset = () => Object.assign(S, {
  ep: 0, cultists: [{ name: 't1', mood: '正常' }], wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 },
  staffUnhappy: 0, _specialTasksDone: {}, _farewellBought: false,
});

const sp3 = () => SPECIAL_TASKS.find(t => t.id === 'sp3_farewell');

test('v2.9.2 ② sp3_farewell condition：需 _farewellBought 前置（修复"没有地方购买"）', () => {
  reset();
  const t = sp3();
  // v4.3.11 反转：dormant（可能流失）即使已购买也不触发——用户反馈「没有流失就触发任务」
  S.wageState.state = 'dormant';
  S._farewellBought = true;
  assert.equal(t.condition(S), false, 'dormant + 已购买 → condition=false（v4.3.11 收紧）');
  checkSpecialTasks(S, () => {}, () => {});
  assert.equal(S._specialTasksDone.sp3_farewell, undefined, 'dormant 不应自动完成');
  // 未购买 + losing → 不触发（购买前置仍在）
  S.wageState.state = 'losing';
  S._farewellBought = false;
  assert.equal(t.condition(S), false, 'losing 但未购买 → condition=false');

  // 购买后 + losing（流失预警）→ 触发
  S._farewellBought = true;
  assert.equal(t.condition(S), true, 'losing + 已购买 → condition=true');
  checkSpecialTasks(S, () => {}, () => {});
  assert.ok(S._specialTasksDone.sp3_farewell, 'losing + 已购买 → 任务完成');
});

test('v2.9.2 ② sp3_farewell 文案保留"购买离职礼盒（1 EP）"承诺', () => {
  const t = sp3();
  assert.ok(t.desc.includes('离职礼盒'), 'desc 含"离职礼盒"');
  assert.ok(t.desc.includes('1 EP'), 'desc 含"1 EP"成本');
});

test('v2.9.2 ② 购买入口实现：wishDock 模块导出 + 主入口接线 + 1 EP 成本', async () => {
  // 组件已抽到 src/modules/wishDock.js：断言「模块真实导出 + main.js 接线 + 实现细节」，
  // 不再锁死函数必须定义在 main.js（源码位置重构不应误报）。
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const dockSrc = readFileSync(new URL('../src/modules/wishDock.js', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes("from './modules/wishDock.js'"), 'main.js 接入 wishDock 模块');
  assert.ok(mainSrc.includes('ensureFarewellGift()') && mainSrc.includes('initFarewellGift()'), '主入口调用初始化/刷新');

  const mod = await import('../src/modules/wishDock.js');
  for (const fn of ['ensureWishWell', 'initWishWell', 'ensureFarewellGift', 'initFarewellGift']) {
    assert.equal(typeof mod[fn], 'function', `wishDock 应导出 ${fn}`);
  }

  assert.ok(dockSrc.includes('function onFarewellBuy'), '含 onFarewellBuy 点击处理');
  assert.ok(dockSrc.includes('FAREWELL_COST = 1'), '成本常量 FAREWELL_COST = 1');
  assert.ok(dockSrc.includes('S._farewellBought = true'), '购买后设 _farewellBought=true');
  assert.ok(dockSrc.includes('checkSpecialTasks(S, log, toast)'), '购买后立即结算 checkSpecialTasks');
  // 仅 losing（流失预警）时显示（v4.3.11 反馈①：dormant 只是可能流失，不摆任务）
  assert.ok(dockSrc.includes("w.state === 'losing'"), '条件守卫：仅 losing');
  assert.ok(!dockSrc.includes("w.state === 'dormant' ||"), 'dormant 不再摆按钮');
});

test('v4.3.11 反馈③：5 分钟召回窗——tickFarewellRecall 导出 + main.js 接线 + lostLog 记录', async () => {
  const dockSrc = readFileSync(new URL('../src/modules/wishDock.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const wagesSrc = readFileSync(new URL('../src/modules/wages.js', import.meta.url), 'utf8');
  const mod = await import('../src/modules/wishDock.js');
  assert.equal(typeof mod.tickFarewellRecall, 'function', 'wishDock 导出 tickFarewellRecall');
  assert.ok(mainSrc.includes('tickFarewellRecall()'), 'main.js 周期调用召回 tick');
  assert.ok(dockSrc.includes('FAREWELL_RECALL_MS'), '召回窗常量存在');
  assert.ok(wagesSrc.includes('lostLog'), '流失时记录 lostLog 名单');
  // 行为：礼盒购买后窗口内 → 概率召回；窗口外 → 失效
  const { S: S2 } = await import('../src/state.js');
  // tickFarewellRecall 召回成功会 save(S)——纯 Node 下补最小 localStorage stub
  const prevLs = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
  try {
    Object.assign(S2, {
      _farewellBought: true,
      cultists: [],
      wageState: { state: 'ok', farewellGiftAt: Date.now(), lostLog: [{ name: '老线程', at: Date.now() }], _recallTimer: 59 },
      achievements: {},
    });
    let recalled = false;
    for (let i = 0; i < 400 && !recalled; i++) {
      S2.wageState._recallTimer = 59; // 每次都踩 60s 门槛，配合随机 30% 快速命中
      mod.tickFarewellRecall();
      recalled = S2.cultists.some(c => c.name === '老线程');
    }
    assert.ok(recalled, '窗口内反复 tick 最终召回流失线程');
    // 窗口关闭：farewellGiftAt 清零不再召回
    S2.wageState.farewellGiftAt = Date.now() - 6 * 60 * 1000;
    mod.tickFarewellRecall();
    assert.equal(S2.wageState.farewellGiftAt, 0, '窗口关闭后清零');
  } finally {
    if (prevLs === undefined) delete globalThis.localStorage; else globalThis.localStorage = prevLs;
  }
});

test('v4.3.11 反馈③：首购点亮成就 farewell_gift（checkSpecialTasks 完成时直写）', async () => {
  const progSrc = readFileSync(new URL('../src/modules/progression.js', import.meta.url), 'utf8');
  const ach = await import('../src/data/achievements.js');
  const def = ach.ACHIEVEMENTS.find(a => a.id === 'farewell_gift');
  assert.ok(def, '成就注册表含 farewell_gift「临别赠礼」');
  assert.ok(progSrc.includes("S.achievements = Object.assign({}, S.achievements, { farewell_gift: true })"), '完成 sp3 时直写点亮');
  // 注册表判定兜底：_specialTasksDone.sp3_farewell 也可点亮（晋升不清）
  assert.ok(def.test({ achievements: {}, _specialTasksDone: { sp3_farewell: true } }, {}), '兜底路径：_specialTasksDone 可点亮');
  assert.ok(def.test({ achievements: { farewell_gift: true }, _specialTasksDone: {} }, {}), '主路径：直写字段可点亮');
});

test('v4.3.11 反馈②：完成日志两段式（按「；」拆「名 - 时限」+「要求」）', () => {
  const progSrc = readFileSync(new URL('../src/modules/progression.js', import.meta.url), 'utf8');
  assert.ok(progSrc.includes("task.desc.indexOf('；')"), '按「；」拆分时限与要求');
  assert.ok(progSrc.includes('${timeLimit}'), '首行嵌「名 - 时限」');
  assert.ok(progSrc.includes('\\n${requirement}'), '次行换行嵌「要求」');
});

test('v2.9.2 ② 转生重置 _farewellBought（每局可再次触发）', async () => {
  // v3.10.0：两份复制的「S._farewellBought = false」收敛为 stateSchema.RUN_RESET_KEYS，
  // 改查单一真源 + 真实调用 resetRunState() 验证行为，避免只做源码字符串匹配。
  const schema = await import('../src/core/stateSchema.js');
  const st = await import('../src/state.js');
  assert.ok(schema.RUN_RESET_KEYS.includes('_farewellBought'), '本局重置清单含 _farewellBought');
  const prestigeSrc = readFileSync(new URL('../src/modules/prestige.js', import.meta.url), 'utf8');
  // v4.2.X：轮回已移除，唯一转生路径就是晋升——只验晋升走本局重置真源。
  assert.ok(prestigeSrc.includes('resetRunState('), '晋升走本局重置真源');
  const defs = st.defaultState();
  const s = { ...defs, _farewellBought: true };
  schema.resetRunState(s, defs, {});
  assert.equal(s._farewellBought, false, '轮回后每局可再次触发');
  const s2 = { ...defs, _farewellBought: true };
  schema.resetRunState(s2, defs, { keepAiCore: true, keepFocus: true });
  assert.equal(s2._farewellBought, false, '晋升后每局可再次触发');
});

test('v2.9.2 ② state.js 默认字段 + 存档迁移兜底 _farewellBought', async () => {
  const schema = await import('../src/core/stateSchema.js');
  const stateSrc = readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');
  assert.ok(stateSrc.includes('_farewellBought: false'), '默认字段 _farewellBought: false');
  assert.ok(schema.COMPAT_KEYS.includes('_farewellBought'), '旧档补齐清单含 _farewellBought');
  // 真实旧档：无该字段也应自动补齐 false
  const st = await import('../src/state.js');
  // 本套件是纯源码 + 纯状态测试，默认没有 DOM shim；这里临时注入最小 localStorage
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ _version: 6, ep: 10 }),
    setItem() {}, removeItem() {}, clear() {},
  };
  try {
    assert.equal(st.load()._farewellBought, false, '旧档缺字段自动兜底');
  } finally {
    if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev;
  }
});

test('v2.9.2 ② CSS：离职礼盒按钮样式 + reduced-motion 降级', () => {
  const cssSrc = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.ok(cssSrc.includes('.farewell-gift'), 'CSS 含 .farewell-gift 类');
  assert.ok(cssSrc.includes('@keyframes farewellGive'), '送礼动画 farewellGive');
  assert.ok(cssSrc.includes('@keyframes farewellBob'), '呼吸动画 farewellBob');
  assert.ok(/\.farewell-gift[^{]*\{[^}]*position:\s*fixed/.test(cssSrc), '浮动定位 position:fixed');
  // reduced-motion 降级块包含 farewell-gift
  assert.ok(/prefers-reduced-motion[\s\S]*\.farewell-gift/.test(cssSrc), 'reduced-motion 降级含 farewell-gift');
});
