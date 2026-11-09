// v2.9.2 ② 离职礼盒（sp3_farewell 购买入口）回归测试
// 文案承诺"购买离职礼盒（1 EP）送给流失的线程"，此前 condition 仅 dormant||staffUnhappy≥3 自动触发，
// 购买入口从未实现。现 condition 加入 S._farewellBought 前置，由浮动按钮提供购买入口。
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
  // dormant 但未购买 → 不触发（修复前：dormant 即自动触发，购买入口从未实现）
  S.wageState.state = 'dormant';
  assert.equal(t.condition(S), false, 'dormant 但未购买 → condition=false');
  checkSpecialTasks(S, () => {}, () => {});
  assert.equal(S._specialTasksDone.sp3_farewell, undefined, 'dormant 未购买不应自动完成');

  // 购买后 + dormant → 触发
  S._farewellBought = true;
  assert.equal(t.condition(S), true, 'dormant + 已购买 → condition=true');
  checkSpecialTasks(S, () => {}, () => {});
  assert.ok(S._specialTasksDone.sp3_farewell, 'dormant + 已购买 → 任务完成');

  // staffUnhappy≥3 路径同样需要前置
  reset();
  S.staffUnhappy = 3;
  assert.equal(t.condition(S), false, 'staffUnhappy≥3 但未购买 → condition=false');
  S._farewellBought = true;
  assert.equal(t.condition(S), true, 'staffUnhappy≥3 + 已购买 → condition=true');
});

test('v2.9.2 ② sp3_farewell 文案保留"购买离职礼盒（1 EP）"承诺', () => {
  const t = sp3();
  assert.ok(t.desc.includes('离职礼盒'), 'desc 含"离职礼盒"');
  assert.ok(t.desc.includes('1 EP'), 'desc 含"1 EP"成本');
});

test('v2.9.2 ② 购买入口实现：main.js 含 ensureFarewellGift + onFarewellBuy + 1 EP 成本', () => {
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes('function ensureFarewellGift'), 'main.js 含 ensureFarewellGift 函数');
  assert.ok(mainSrc.includes('function onFarewellBuy'), 'main.js 含 onFarewellBuy 点击处理');
  assert.ok(mainSrc.includes('FAREWELL_COST = 1'), '成本常量 FAREWELL_COST = 1');
  assert.ok(mainSrc.includes('S._farewellBought = true'), '购买后设 _farewellBought=true');
  assert.ok(mainSrc.includes('checkSpecialTasks(S, log, toast)'), '购买后立即结算 checkSpecialTasks');
  // 仅 dormant/losing/staffUnhappy≥3 时显示（避免新手误触）
  assert.ok(mainSrc.includes("w.state === 'dormant'") && mainSrc.includes("w.state === 'losing'"), '条件守卫：dormant/losing');
});

test('v2.9.2 ② 转生重置 _farewellBought（每局可再次触发）', async () => {
  // v3.10.0：两份复制的「S._farewellBought = false」收敛为 stateSchema.RUN_RESET_KEYS，
  // 改查单一真源 + 真实调用 resetRunState() 验证行为，避免只做源码字符串匹配。
  const schema = await import('../src/core/stateSchema.js');
  const st = await import('../src/state.js');
  assert.ok(schema.RUN_RESET_KEYS.includes('_farewellBought'), '本局重置清单含 _farewellBought');
  const prestigeSrc = readFileSync(new URL('../src/modules/prestige.js', import.meta.url), 'utf8');
  const reincarnSrc = readFileSync(new URL('../src/modules/reincarn.js', import.meta.url), 'utf8');
  assert.ok(prestigeSrc.includes('resetRunState(') && reincarnSrc.includes('resetRunState('),
    '两条转生路径共用本局重置');
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
