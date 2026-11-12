// v3.10.0 核心玩法抽象（状态生命周期层 / 成就层 / 清单锁死）：纯 Node 单测
//
// 覆盖：状态字段清单单一真源、存档兼容零漂移、本局重置共用路径、绝对时钟顺延、
//       成就表下沉后的可单测判定、语义去重、面板键 / deps 清单双向对齐。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  body: { classList: { add() {}, remove() {} } }, addEventListener() {},
  querySelectorAll: () => [],
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = p => readFileSync(join(SRC, p), 'utf8');
const schema = await import('../src/core/stateSchema.js');
const state = await import('../src/state.js');
const reg = await import('../src/core/achievementRegistry.js');
const { ACHIEVEMENTS } = await import('../src/data/achievements.js');
const pk = await import('../src/core/panelKeys.js');
const { dirty } = await import('../src/core/runtime.js');
// frameSystems.js 会连带 import 整棵玩法模块树，纯 Node 下只做源码静态审计（与 v390 C2 同范式）
const SYS_SRC = read(join('systems', 'frameSystems.js'));
const DEPS_BLOCK = SYS_SRC.slice(SYS_SRC.indexOf('export const FRAME_DEPS_KEYS'));
// 数组以 `]);` 收尾（Object.freeze([...])），不是 `];`；切错边界会把后面 FRAME_SYSTEM_IDS
// 的 'wages' 等系统 id 一起抓进来（v3.10.0 首跑 C3 即因此误报「deps 缺注入 wages」）。
const FRAME_DEPS_KEYS = [...DEPS_BLOCK.slice(0, DEPS_BLOCK.indexOf(']);')).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map(m => m[1]);

console.log('[A] 状态字段生命周期单一真源');

test('A1 清单内无孤儿键，defaultState 字段全集稳定', () => {
  const d = state.defaultState();
  const keys = Object.keys(d);
  assert.deepEqual(schema.orphanFieldNames(keys), [], '声明的顶层字段必须存在于 defaultState()');
  // 资源发现标记是独立命名空间（cps/run/tide/rank 不是顶层状态字段），单独锁死
  assert.deepEqual(Object.keys(state.defaultState().resDiscovered).sort(),
    schema.declaredDiscoveryKeys().sort(), 'resDiscovered 键集与声明一致');
  assert.equal(state.SAVE_VERSION, 6, 'SAVE_VERSION 不 bump，旧档无迁移成本');
  assert.equal(d._version, 6);
  assert.ok(keys.includes('resonance'), 'v3.10.0 新字段必须在默认状态里');
  assert.equal(keys.length, 131, 'v3.10.2 的 129 + v3.12.0 ⑬ 的 moduleUnlocks + v3.12.6 ⑤ 的 _purifierSeen');
  assert.deepEqual(d.moduleUnlocks, { reincarn: false, bazaar: false }, '新档两个大模块均未开启');
});

test('A2 资源发现键 / 顶栏锚点 / 默认值三者同源', () => {
  const d = schema.defaultResDiscovered();
  assert.deepEqual(Object.keys(d).sort(), Object.keys(state.defaultState().resDiscovered).sort());
  for (const k of schema.ALWAYS_VISIBLE_RESOURCES) assert.equal(d[k], true);
  for (const r of schema.RESOURCE_DISCOVERY) assert.equal(d[r.key], false);
  assert.deepEqual(schema.RESOURCE_DISCOVERY.map(r => r.statId).sort(),
    ['h-dm', 'h-es', 'h-faith', 'h-rank', 'h-rp', 'h-pt'].sort());
  assert.ok(schema.RESOURCE_DISCOVERY.find(r => r.key === 'rank').anchorKey === 'es', '职级与 ES 同锚点');
});

test('A3 各清单内部无重复，且跨局 / 补齐 / 重置口径互不越界', () => {
  for (const [name, list] of Object.entries({
    CROSS_RUN_KEYS: schema.CROSS_RUN_KEYS, COMPAT_KEYS: schema.COMPAT_KEYS,
    RUN_RESET_KEYS: schema.RUN_RESET_KEYS, ABSOLUTE_CLOCK_PATHS: schema.ABSOLUTE_CLOCK_PATHS,
    NESTED_DEFAULT_KEYS: schema.NESTED_DEFAULT_KEYS,
  })) {
    assert.equal(new Set(list).size, list.length, `${name} 内有重复项`);
  }
  assert.ok(schema.COMPAT_KEYS.includes('resonance'), '新字段声明即自动兜底');
  assert.ok(!schema.CROSS_RUN_KEYS.includes('resonance'), '共鸣是本局状态，转生不保留');
  assert.ok(!schema.CROSS_RUN_KEYS.includes('corruption'), '腐化必须随本局清零');
});

test('A4 load()：跨局保留 / 缺失补齐 / 嵌套兜底三动作', () => {
  const defs = state.defaultState();
  const migrated = { _version: 6, es: 777, achievements: { click1: true }, ai: { autoUpgrade: true } };
  const merged = schema.mergeCrossRun(defs, migrated);
  assert.equal(merged.es, 777);
  assert.equal(merged.achievements.click1, true);
  assert.equal(merged.ep, state.defaultState().ep, '未列入跨局的字段保持默认');
  schema.fillMissingFields(migrated, state.defaultState());
  assert.deepEqual(migrated.resonance, state.defaultState().resonance, '旧档无 resonance 自动补齐');
  assert.ok(migrated.tidePhase !== undefined && migrated.bazaar !== undefined);
  schema.applyNestedDefaults(migrated, state.defaultState());
  assert.equal(migrated.ai.autoUpgrade, true, '深兜底不得覆盖已有值');
  assert.equal(migrated.ai.autoClaim, false, '深兜底应补齐缺失键');
});

test('A5 load() 真实旧档：无 resonance 字段也能安全加载', () => {
  const raw = JSON.stringify({ _version: 6, ep: 12345, es: 8, resDiscovered: { ep: true }, _forkTriggered: false });
  globalThis.localStorage.getItem = () => raw;
  try {
    const loaded = state.load();
    assert.deepEqual(loaded.resonance, state.defaultState().resonance);
    assert.equal(loaded.ep, 12345);
    assert.equal(loaded.es, 8);
    assert.equal(loaded.resDiscovered.rp, false, 'resDiscovered 部分键缺失补默认');
    assert.equal(loaded._version, 6);
  } finally { globalThis.localStorage.getItem = () => null; }
});

test('A6 shiftAbsoluteClocks：顶层 / 嵌套 / 项目时间戳整体顺延', () => {
  const S = {
    buffUntil: 1000, clickBuffUntil: 0, nextEventAt: 500, _collapseAt: 200,
    petXpUntil: undefined, fuseLuckUntil: 300,
    riftExpedition: { until: 900 }, activeRift: { expiresAt: 1500 },
    projects: [{ deadline: 2000, pendingAt: 0, startsAt: 100 }, { deadline: 0 }],
  };
  const n = schema.shiftAbsoluteClocks(S, 500);
  assert.equal(S.buffUntil, 1500);
  assert.equal(S.clickBuffUntil, 0, '零值不参与顺延');
  assert.equal(S.nextEventAt, 1000);
  assert.equal(S._collapseAt, 700);
  assert.equal(S.riftExpedition.until, 1400, 'a.b 路径');
  assert.equal(S.activeRift.expiresAt, 2000);
  assert.equal(S.projects[0].deadline, 2500);
  assert.equal(S.projects[0].startsAt, 600);
  assert.equal(S.projects[0].pendingAt, 0);
  // 8 个正数字段：buffUntil / nextEventAt / _collapseAt / fuseLuckUntil /
  // riftExpedition.until / activeRift.expiresAt / projects[0].deadline / projects[0].startsAt
  assert.equal(n, 8, `实际顺延字段数 ${n}`);
  assert.equal(schema.shiftAbsoluteClocks(S, 0), 0, '非正位移不动作');
  assert.equal(S.buffUntil, 1500);
});

test('A7 resetRunState：晋升 / 轮回共用一条路径，差异由 opts 表达', () => {
  const defs = state.defaultState();
  const mk = () => ({
    ep: 1e9, runEarned: 1e9, earnedFull: 1e9, upgrades: { a: 1 }, tech: { ai_core: true },
    focusLevel: 7, projects: [{}], cultists: [{}], wageState: { state: 'bad' },
    corruption: 50, vehCollectTimer: 99, pets: { cat: 1 }, activePets: ['cat'],
    buffMult: 3, buffUntil: 999, clickBuffMult: 2, clickBuffUntil: 999,
    petXpMult: 2, petXpUntil: 999, fuseLuckUntil: 999, staffUnhappy: 9,
    _farewellBought: true, activeRift: { x: 1 }, crossroad: 'locked', crossroadLockedBy: 'order_pillar',
    policies: { a: 1 }, policyRerolls: { a: 2 }, vowPolicyBoost: true, cosmos: { lv: { a: 1 } },
    resDiscovered: { ep: true, es: true, faith: true, rp: true, dm: true },
  });
  const a = schema.resetRunState(mk(), defs, { keepAiCore: true, keepFocus: true });
  assert.deepEqual(a.tech, { ai_core: true }, '晋升保留 AI 管理核心');
  assert.equal(a.focusLevel, 7, 'legacy 天赋保留专注等级');
  assert.equal(a.ep, defs.ep);
  assert.deepEqual(a.wageState, defs.wageState);
  // v3.12.3 反馈⑤：dm 锚点一旦发现即永久保留（DM 是跨转生资产，遗漏会让遗物页/净化节点整块回退成「???」）
  assert.deepEqual(a.resDiscovered, { ep: true, es: true, faith: true, rp: true, dm: true }, '只保留跨周期锚点（含 dm）');
  const b = schema.resetRunState(mk(), defs, {});
  assert.deepEqual(b.tech, {}, '轮回不保留 AI 核心');
  assert.equal(b.focusLevel, 0);
  assert.equal(b.crossroad, 'inactive');
});

test('A8 静态接线：各处不再内联手写清单', () => {
  const st = read('state.js'), main = read('main.js');
  const pre = read(join('modules', 'prestige.js')), rein = read(join('modules', 'reincarn.js'));
  assert.ok(st.includes('mergeCrossRun(') && st.includes('fillMissingFields(') && st.includes('applyNestedDefaults('));
  assert.ok(!st.includes("const crossRun = ['es'"), 'load() 不得再内联跨局白名单');
  assert.ok(main.includes('shiftAbsoluteClocks(S, shift)'));
  assert.ok(!main.includes('riftExpedition.until += shift'), '时钟顺延不得再手写');
  assert.ok(main.includes('RESOURCE_DISCOVERY') && !main.includes("const discAnchorKeys = ['es'"));
  assert.ok(pre.includes('resetRunState(') && rein.includes('resetRunState('));
  assert.ok(!pre.includes('S.ep = 0;') && !rein.includes('S.ep = 0;'), '两份复制重置代码已消除');
  assert.ok(main.includes('PANEL_DIRTY_ON_START'));
});

console.log('[B] 成就注册表（纯函数可单测）');

test('B1 138 条成就、id 唯一、无语义重复', () => {
  // v3.12.8：删除 orch_vigil（守夜人）/ cascade（潮汐级联）——对应策略已按反馈移除
  assert.equal(ACHIEVEMENTS.length, 138);
  assert.equal(reg.ACHIEVEMENT_IDS.length, 138);
  assert.equal(new Set(reg.ACHIEVEMENT_IDS).size, 138);
  assert.deepEqual(reg.duplicateAchievementTests(), [], 'es1000/es1k 类重复不得回归');
  assert.equal(ACHIEVEMENTS.filter(a => typeof a.test === 'function').length, 134); // 138 - 4 条手动点亮
  assert.ok(!reg.ACHIEVEMENT_IDS.includes('es1k') && !reg.ACHIEVEMENT_IDS.includes('vow'), '两条语义重复项已移除');
});

test('B2 evaluateAchievements：只解锁新达成项、幂等、写回状态', () => {
  const S = { achievements: {}, totalClicks: 1, allTimeEp: 1e3 };
  const ctx = { totalOwned: () => 0, techCount: () => 0, petCount: () => 0, chapterProgress: () => 1 };
  const fresh = reg.evaluateAchievements(S, ctx);
  assert.ok(fresh.some(a => a.id === 'click1'));
  assert.ok(fresh.some(a => a.id === 'ep1k'));
  assert.equal(S.achievements.click1, true);
  assert.deepEqual(reg.evaluateAchievements(S, ctx), [], '重复求值不再重复解锁');
});

test('B3 单个 test 抛错被隔离，不阻断其余成就', () => {
  const S = { achievements: {}, es: 1e5 };
  const ctx = { totalOwned: () => { throw new Error('boom'); }, techCount: () => 0, petCount: () => 0, chapterProgress: () => 1 };
  const fresh = reg.evaluateAchievements(S, ctx);
  assert.ok(fresh.some(a => a.id === 'es100k'), 'ctx 抛错不应影响只读字段的成就');
});

test('B4 unlockAchievement 是手动点亮的单一入口', () => {
  const S = { achievements: {} };
  assert.equal(reg.unlockAchievement(S, 'demon_friend'), true);
  assert.equal(reg.unlockAchievement(S, 'demon_friend'), false, '重复点亮返回 false');
  assert.equal(reg.unlockAchievement(S, 'not_exist'), false, '未知 id 不写状态');
  assert.equal(S.achievements.not_exist, undefined);
  assert.equal(reg.achievementProgress(S).unlocked, 1);
});

test('B5 main.js 只保留薄适配，成就表与判定都在新层', () => {
  const main = read('main.js');
  assert.ok(!main.includes('const ACHIEVEMENTS = ['), '表不得再内联在 main.js');
  assert.ok(main.includes('evaluateAchievements(S, ctx)'));
  assert.ok(main.includes("unlockAchievement(S, 'demon_friend')"));
  assert.ok(read(join('data', 'achievements.js')).includes('export const ACHIEVEMENTS'));
});

console.log('[C] 面板键 / deps 清单双向锁死');

test('C1 PANEL_KEYS 27 个、always 3 个、受脏标记控制 24 个', () => {
  assert.equal(pk.PANEL_KEYS.length, 27);
  assert.equal(pk.ALWAYS_PANEL_KEYS.length, 3);
  assert.equal(pk.dirtyDrivenPanels().length, 24);
  const main = read('main.js');
  const registered = [...main.matchAll(/registerPanel\(\{ key: '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(registered, [...pk.PANEL_KEYS], '注册顺序必须与清单逐字一致');
});

test('C2 createDirty 由清单派生，无幽灵键 / 无缺键', () => {
  const keys = Object.keys(dirty).sort();
  const expect = [...pk.PANEL_KEYS, ...pk.NON_PANEL_DIRTY_KEYS].sort();
  assert.deepEqual(keys, expect);
  for (const k of pk.DIRTY_FALSE_KEYS) assert.equal(dirty[k], false, `${k} 初始应为 false`);
  for (const k of pk.PANEL_DIRTY_ON_START) assert.ok(k in dirty, `开档置脏键 ${k} 必须存在`);
  assert.deepEqual(Object.keys(pk.createDirty()).sort(), expect);
});

test('C3 FRAME_DEPS_KEYS 与注入 / 消费点双向对齐', () => {
  const main = read('main.js'), sys = read(join('systems', 'frameSystems.js'));
  const block = main.slice(main.indexOf('registerFrameSystems({'), main.indexOf('});', main.indexOf('registerFrameSystems({')));
  const injected = block.replace('registerFrameSystems({', '').replace(/[\s\S]*?\/\/.*$/gm, '')
    .split(',').map(x => x.trim()).filter(Boolean);
  // 注入是「简写属性」，逐项核对清单而非解析整块
  for (const k of FRAME_DEPS_KEYS) assert.ok(block.includes(k + ',') || block.includes(k + '\n'), `deps 缺注入 ${k}`);
  const consumed = new Set([...sys.matchAll(/\bD\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]));
  consumed.delete('get'); // MODE_BY_ID.get 的误匹配
  assert.deepEqual([...consumed].sort(), [...FRAME_DEPS_KEYS].sort(), 'D.<key> 消费点 ↔ 清单');
  assert.equal(FRAME_DEPS_KEYS.length, 11);
  assert.ok(injected.length >= 0);
});

console.log('[D] 相位共鸣玩法（数值 / 状态 / 接线）');

const res = await import('../src/core/resonance.js');
const orch = await import('../src/core/orchestration.js');
const sc = await import('../src/core/storylineContent.js');
const { BALANCE } = await import('../src/data/balance.js');
const { EVENTS } = await import('../src/data/events.js');
const { CHAPTERS } = await import('../src/data/chapters.js');
const { POLICY_GROUPS } = await import('../src/data/policies.js');
const { WIKI_SECTIONS } = await import('../src/data/wiki.js');
const { RP_GROUPS } = await import('../src/modules/shop.js');
const ORCH_SRC = read('core/orchestration.js');
const SHOP_SRC = read('modules/shop.js');
const EVENTS_MOD_SRC = read('modules/events.js');
const OFFLINE_SRC = read('modules/offline.js');
const ECONOMY_SRC = read('modules/economy.js');
const SYS_FULL = read('systems/frameSystems.js');
const MAIN = read('main.js');

test('D1 共鸣解锁是编排解锁的严格超集，默认关闭且旧档零漂移', () => {
  assert.deepEqual({ ...res.RESONANCE_UNLOCK }, { projectsDone: 12, prestige: 2 });
  let strict = false;
  for (let n = 0; n <= 20; n++) for (let p = 0; p <= 4; p++) {
    const S = { projectsDone: n, prestige: p };
    if (res.resonanceUnlocked(S)) {
      assert.ok(orch.orchestrationUnlocked(S), `${n} 任务 / ${p} 职级：共鸣解锁却未开编排`);
    } else if (orch.orchestrationUnlocked(S)) strict = true;
  }
  assert.ok(strict, '存在「已开编排但未开共鸣」的中间阶段');
  assert.deepEqual(state.defaultState().resonance, { ...res.DEFAULT_RESONANCE });
  assert.ok(schema.COMPAT_KEYS.includes('resonance'), '旧档自动兜底');
  assert.ok(!schema.CROSS_RUN_KEYS.includes('resonance'), '共鸣属本局状态，转生清零');
});

test('D2 非法存档一律回落安全值，绝不放大数值', () => {
  assert.deepEqual(res.resonanceState({}), { enabled: false, layers: 0, focus: 'ep', phase: -1, acc: 0 });
  assert.equal(res.resonanceState(null).enabled, false);
  const bad = res.resonanceState({ resonance: {
    enabled: 'yes', layers: 999, focus: 'hack', phase: 9, acc: -5,
  } });
  assert.equal(bad.layers, res.RESONANCE_TUNING.maxLayers);
  assert.equal(bad.focus, 'ep');
  assert.equal(bad.phase, -1);
  assert.equal(bad.acc, 0);
});

test('D3 倍率：未解锁 / 关闭 / 0 层 / 非法键一律 1，增益与代价成对', () => {
  const base = { projectsDone: 50, prestige: 0,
    resonance: { enabled: true, layers: 10, focus: 'ep', phase: 1, acc: 0 } };
  assert.equal(res.resonanceMult('ep', { ...base, projectsDone: 0, prestige: 0 }), 1);
  assert.equal(res.resonanceMult('ep', { ...base, resonance: { ...base.resonance, enabled: false } }), 1);
  assert.equal(res.resonanceMult('ep', { ...base, resonance: { ...base.resonance, layers: 0 } }), 1);
  assert.equal(res.resonanceMult('not_a_key', base), 1);
  assert.ok(Math.abs(res.resonanceMult('ep', base) - 1.15) < 1e-9);
  assert.ok(Math.abs(res.resonanceMult('rp', base) - 0.98) < 1e-9);
  const capped = { ...base, resonance: { ...base.resonance, layers: 20 } };
  assert.ok(Math.abs(res.resonanceMult('ep', capped) - 1.30) < 1e-9);
  assert.ok(Math.abs(res.resonanceMult('dm', capped) - 0.96) < 1e-9);
  assert.ok(res.resonanceMult('dm', capped) >= res.RESONANCE_TUNING.sideFloor);
  // CPS 显示 / 卡面倍率 / 真实入账共享同一乘区：orchestrationMult 必须 = base × resonanceMult
  const S = { ...base, orchestration: { mode: 'balanced', autoTide: false } };
  const off = { ...S, projectsDone: 0, prestige: 0,
    resonance: { ...base.resonance, enabled: false } };
  for (const k of ['ep', 'rp', 'pt', 'dm']) {
    assert.ok(Math.abs(orch.orchestrationMult(k, S)
      - orch.orchestrationMult(k, off) * res.resonanceMult(k, S)) < 1e-12,
    `${k} 乘区口径不一致`);
  }
});

test('D4 每 12 秒叠一层、上限 20、换相位减半；累加器静默写入不置脏', () => {
  const mk = () => ({ tidePhase: 1, projectsDone: 50, prestige: 0,
    resonance: { enabled: true, layers: 0, focus: 'ep', phase: 1, acc: 0 } });
  const S = mk();
  let r = res.tickResonance(S, 11);
  assert.equal(r.changed, false, '不足一层不重建面板 DOM');
  assert.equal(r.layers, 0);
  assert.ok(Math.abs(S.resonance.acc - 11) < 1e-9, '累加器每帧静默写入');
  r = res.tickResonance(S, 1);
  assert.equal(r.changed, true);
  assert.equal(r.layers, 1);
  assert.equal(S.resonance.layers, 1);
  for (let i = 0; i < 400; i++) res.tickResonance(S, 12);
  assert.equal(S.resonance.layers, res.RESONANCE_TUNING.maxLayers);
  S.tidePhase = 2;
  const ph = res.tickResonance(S, 0);
  assert.equal(ph.phaseChanged, true);
  assert.equal(ph.layers, 10);
  assert.equal(S.resonance.layers, 10);
  const off = mk();
  off.resonance.enabled = false; off.resonance.layers = 7; off.tidePhase = 3;
  const ro = res.tickResonance(off, 12);
  assert.equal(ro.changed, true, '关闭时仍记录相位');
  assert.equal(off.resonance.phase, 3);
  assert.equal(off.resonance.layers, 7, '关闭时层数保留、不累积');
});

test('D5 开关与焦点入口严格校验，非法输入不写状态', () => {
  const locked = { projectsDone: 0, prestige: 0, resonance: {} };
  assert.equal(res.setResonanceEnabled(locked, true), false);
  assert.equal(locked.resonance.enabled, undefined);
  const S = { projectsDone: 50, prestige: 0,
    resonance: { ...res.DEFAULT_RESONANCE, phase: 2, layers: 4 } };
  assert.equal(res.toggleResonanceEnabled(S), true);
  assert.equal(S.resonance.enabled, true);
  assert.equal(res.setResonanceFocus(S, 'bogus'), false);
  assert.equal(S.resonance.focus, 'ep');
  assert.equal(res.setResonanceFocus(S, 'dm'), true);
  assert.equal(S.resonance.focus, 'dm');
  assert.ok(Math.abs(res.resonanceMult('dm', S) - (1 + 4 * 0.015)) < 1e-9);
});

test('D6 面板摘要四管线与数值读侧同源', () => {
  const S = { projectsDone: 50, prestige: 0,
    resonance: { enabled: true, layers: 5, focus: 'rp', phase: 0, acc: 0 } };
  const sm = res.resonanceSummary(S);
  assert.equal(sm.unlocked, true);
  assert.equal(sm.enabled, true);
  assert.equal(sm.layers, 5);
  assert.equal(sm.rows.length, 4);
  assert.equal(sm.rows.filter(x => x.focused).length, 1);
  for (const row of sm.rows) assert.equal(row.mult, res.resonanceMult(row.key, S));
});

test('D7 声明 → 求值 → 消费：帧系统 / 乘区 / 面板 / QA 四处接上', () => {
  assert.match(SYS_FULL, /tickResonance\(S, ctx\.dt\)/);
  assert.match(ORCH_SRC, /resonanceMult\(key, S\)/);
  assert.match(ECONOMY_SRC, /orchestrationMult\('ep', S\)/);
  assert.match(ECONOMY_SRC, /orchestrationMult\('dm', S\)/);
  assert.match(MAIN, /data-res-toggle/);
  assert.match(MAIN, /data-res-focus/);
  assert.match(MAIN, /resonanceSummary\(S\)/);
  assert.match(MAIN, /RESONANCE_TUNING, RESONANCE_UNLOCK, DEFAULT_RESONANCE/);
  assert.ok(MAIN.includes('setResonanceFocus,') && MAIN.includes('toggleResonanceEnabled,'));
});

console.log('[E] Review 回归：暂停口径 / 事件分支 / 数值单一真源 / 新内容接线');

test('E1 暂停只冻结任务时钟，不再绕过领取入口发奖或计数', () => {
  const S = { projects: [{ deadline: 1000, startsAt: 100, pendingAt: 0 }, { deadline: 0 }] };
  assert.equal(schema.shiftProjectClocks(S, 500), 2);
  assert.equal(S.projects[0].deadline, 1500);
  assert.equal(S.projects[0].startsAt, 600);
  assert.equal(S.projects[0].pendingAt, 0, '零值不参与顺延');
  assert.equal(schema.shiftProjectClocks(S, 0), 0);
  assert.ok(!MAIN.includes('S.projectsDone++'), '累计完成数唯一真源不得回归');
  assert.match(MAIN, /shiftProjectClocks\(S, nowMs - pausedAtMs\)/);
  assert.match(OFFLINE_SRC, /const projDone = 0/, '离线回程同口径');
});

test('E2 SUPPORTED_EVENT_TYPES ↔ applyEvent 真实分支双向对齐', () => {
  const declared = new Set([...sc.SUPPORTED_EVENT_TYPES]);
  const branches = new Set([...EVENTS_MOD_SRC.matchAll(/ev\.type === '([a-z_]+)'/g)].map(m => m[1]));
  assert.deepEqual([...declared].sort(), [...branches].sort());
  assert.equal(declared.size, 13);
});

test('E3 红包数值回归数据表单一真源', () => {
  const ev = EVENTS.find(e => e.id === 'redpacket');
  assert.ok(ev);
  assert.equal(ev.amount, 10000);
  assert.ok(!EVENTS_MOD_SRC.includes("ev.id === 'redpacket'"), '不得再硬编码覆写');
});

test('E4 内容扩充数量与 UI 分组一一对应（无死数据）', () => {
  assert.equal(CHAPTERS.length, 51); // v3.12.9 并行审查内容扩充：46→51 章
  assert.equal(EVENTS.length, 82);    // v3.12.9：74→82 事件
  assert.equal(BALANCE.researchUpgs.length, 68);
  assert.equal(BALANCE.miles.length, 16);
  assert.equal(WIKI_SECTIONS.length, 28); // v3.12.8：删除「第六条策略」
  assert.equal(POLICY_GROUPS.length, 13);
  assert.equal(POLICY_GROUPS.reduce((n, g) => n + g.policies.length, 0), 39);
  assert.equal(orch.ORCHESTRATION_MODES.length, 4); // v3.12.8：值守/级联已移除
  const grouped = RP_GROUPS.flatMap(g => g.ids).sort();
  assert.deepEqual(grouped, BALANCE.researchUpgs.map(u => u.id).sort(),
    'RP_GROUPS ↔ researchUpgs：新增研究项必须玩家可见可买');
  assert.ok(SHOP_SRC.includes('rp_ep6') && SHOP_SRC.includes('rp_cosmos3'));
});

test('E5 新增事件 / 章节 / 政策条件全部可执行且类型合法', () => {
  for (const ev of EVENTS.slice(-10)) {
    assert.deepEqual(sc.validateEvent(ev), [], `${ev.id} 事件声明不合法`);
  }
  for (const c of CHAPTERS.filter(c => Number(c.id) >= 33)) {
    assert.equal(typeof c.cond, 'function', `章节 ${c.id} 缺条件`);
    assert.equal(typeof c.cond({ resonance: { layers: 99 }, allTimeEp: 1e20, projectsDone: 999 }), 'boolean');
  }
  for (const g of POLICY_GROUPS.filter(g => g.id === 'resonance_law' || g.id === 'longnight')) {
    assert.equal(typeof g.unlock, 'function');
    assert.equal(typeof g.unlock({ resonance: { enabled: true }, projectsDone: 200, prestige: 9 }), 'boolean');
  }
  for (const id of ['resonance', 'chronicle3', 'longline']) {
    const sec = WIKI_SECTIONS.find(s => s.id === id);
    assert.ok(sec && typeof sec.body === 'function', `百科 ${id} 缺正文`);
    assert.ok(sec.body().length > 20);
  }
  assert.equal(ACHIEVEMENTS.filter(a => typeof a.test !== 'function').length, 4,
    '仅 demon_friend / gaze_abyss / tentacle_combo / gaze_stare 为手动点亮（v3.12.7 新增凝视连击）');
  assert.ok(MAIN.includes("unlockAchievement(S, 'demon_friend')")
    && MAIN.includes("unlockAchievement(S, 'gaze_abyss')"));
});

console.log('[F] v3.10.1 编排 / 班组口径澄清（方案 A：仅文案，不动数值与交互）');
const WIKI_SRC = read('data/wiki.js');

test('F1 Wiki 两节都写明「编排调倍率 / 班组调人头 / 分层相乘」', () => {
  const thread = WIKI_SECTIONS.find(s => s.id === 'thread').body();
  const orch = WIKI_SECTIONS.find(s => s.id === 'orchestration').body();
  for (const [name, body] of [['thread', thread], ['orchestration', orch]]) {
    assert.ok(body.includes('效能编排') && body.includes('班组'), `${name} 节应同时提到两套系统`);
    assert.ok(body.includes('相乘'), `${name} 节应说明相乘关系`);
    assert.ok(!/undefined|NaN|Infinity/.test(body), `${name} 渲染出非法数值`);
  }
  assert.ok(orch.includes('不是全部加成的总和'), '编排节需明确卡面倍率不是总倍率');
  assert.ok(thread.includes('DM 探采只看编排'), '班组节需说明 DM 不吃班组加成');
});

test('F2 编排卡倍率行标注口径，四条倍率仍由统一读侧驱动', () => {
  assert.ok(MAIN.includes('编排倍率 · 策略与相位共鸣合并'), '卡面需标注「编排倍率」');
  assert.ok(MAIN.includes('const summary = orchestrationSummary(S)'));
  assert.ok(MAIN.includes('for (const x of summary)'), '倍率行仍走统一读侧，不得内联数值');
});

test('F3 Wiki 不再把编排倍率写成「每条管线的总倍率」', () => {
  assert.doesNotMatch(WIKI_SRC, /倍率与(顶栏)?每秒产出始终同口径/);
  assert.ok(WIKI_SRC.includes('编排倍率与真实入账同口径'));
});

test('F4 方案 A 边界：数值入口与交互绑定保持原样', () => {
  assert.ok(MAIN.includes('data-res-toggle="1"') && MAIN.includes('data-orch-mode='));
  assert.match(read('core/orchestration.js'), /return base \* resonanceMult\(key, S\)/,
    '编排乘区仍与共鸣合并，口径澄清不得改数值');
});
