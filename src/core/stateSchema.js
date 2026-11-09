// v3.10.0 核心玩法抽象（状态生命周期层）：状态字段清单的单一真源。
//
// 背景：v3.9.0 之前，同一批状态字段的「生命周期语义」被复制成 6+ 份互不对齐的清单：
//   defaultState() 字面量 / load() 的 crossRun 白名单 / load() 的 newFields 补齐白名单 /
//   doPrestige() 与 doReincarn() 两份本局重置 / resumeGameClock() 的绝对时间戳顺延 /
//   DISCOVER_TOASTS + discStatIds + discAnchorKeys + resDiscovered 的资源发现键。
// 新增一个字段要人肉改 4~7 处，漏一处即静默 bug（弹框期间计时流逝、转生未清零、顶栏不显示）。
//
// 本模块把「清单」收敛为声明，把「消费动作」收敛为纯函数；defaultState() 仍是默认值的唯一真源
// （本模块不复制任何默认值，只复制键名），因此重构不引入任何数值漂移，SAVE_VERSION 保持 6。
//
// 接线纪律（由 tests/v3100-state-schema.test.mjs 静态审计锁死）：
//   - 清单内每个键必须存在于 defaultState() 输出（无孤儿键）；
//   - state.js / main.js / prestige.js / reincarn.js 不得再内联同名清单，必须消费本模块；
//   - 新增状态字段时，只需在此声明一次，并用审计测试确认覆盖。
// 注意：本模块刻意不 import state.js —— state.js 需要消费本模块的清单，反向 import 会形成循环。
// 覆盖率审计由调用方传入 Object.keys(defaultState())。

// ① 跨局保留：load() 时从旧档覆盖默认值（转生/轮回不清空）
export const CROSS_RUN_KEYS = Object.freeze([
  'es', 'prestigePoints', 'eternal', 'achievements', 'religion', 'faith', 'offHistory',
  'allTimeEp', 'storylinesCompleted', 'storyline', 'crossroad', 'crossroadLockedBy',
  'familyUpgrades', 'resDiscovered', 'delve', 'vs', 'riftEmber', 'riftUpgrades',
  'riftLevelTech', '_religionHintSeen', 'relics', 'bazaar', 'abyssGazeUnlocked',
]);

// ② 旧档补齐：字段缺失时用默认值填上（与 ① 语义不同，允许重叠：保留 vs 补齐）
export const COMPAT_KEYS = Object.freeze([
  'tidePhase', 'tideTimer', 'corruption', 'wageState', 'buildings', 'vehCollectTimer', 'ai',
  'boughtOrder', 'unlockedBuildings', 'buildingOverflow', 'epOverflowTotal', '_overflowRpAcc',
  'delve', 'vs', 'storyline', 'storylinesCompleted', '_forkTriggered', '_specialTasksDone',
  '_easterEggsFound', '_pauseCycles', 'crossroad', 'crossroadLockedBy', 'familyUpgrades',
  '_farewellBought', 'orderRewrites', 'orderCompileProgress', 'orderLogicGates',
  'abyssGazeCount', 'chaosIntuitionEnabled', 'chaosLogEnabled', 'bazaar', 'cosmos',
  'faithTemples', 'miraclesTriggered', 'prophecyNext', '_prestigeSkips', '_idleSec',
  '_catClicks', '_lastActionAt', 'resDiscovered', 'abyssGazeUnlocked',
  // v3.10.0：新增状态字段一律在此声明即自动兜底，无需 bump SAVE_VERSION
  'resonance',
]);

// ③ 深兜底：嵌套对象字段部分缺失时逐键补齐（不覆盖已有值）
export const NESTED_DEFAULT_KEYS = Object.freeze(['wageState', 'ai', 'resDiscovered', 'resonance']);

// ④ 绝对时间戳：弹框暂停恢复时整体顺延，否则 Date.now() 型计时会在弹框期间暗中流逝。
//    支持 'a.b' 路径；只对有限正数生效（与原 `if (S.x > 0)` 口径一致，且更安全）。
export const ABSOLUTE_CLOCK_PATHS = Object.freeze([
  'riftExpedition.until', 'activeRift.expiresAt',
  'buffUntil', 'clickBuffUntil', '_collapseAt', 'nextEventAt', 'petXpUntil',
  'fuseLuckUntil', 'restBonusUntil', 'lazySince', 'pausedAt',
]);
export const PROJECT_CLOCK_FIELDS = Object.freeze(['deadline', 'pendingAt', 'startsAt']);

// ⑤ 本局重置：晋升 / 轮回共用的字段集。两者的差异（AI 核心科技、天赋豁免、裂隙远征等）
//    由 resetRunState(S, defs, opts) 的 opts 显式表达，不再靠两份复制代码漂移。
export const RUN_RESET_KEYS = Object.freeze([
  'ep', 'runEarned', 'earnedFull', 'upgrades', 'tech', 'focusLevel', 'projects', 'cultists',
  'wageState', 'corruption', 'vehCollectTimer', 'pets', 'activePets',
  'buffMult', 'buffUntil', 'clickBuffMult', 'clickBuffUntil', 'petXpMult', 'petXpUntil',
  'fuseLuckUntil', 'staffUnhappy', '_farewellBought', 'activeRift',
  'crossroad', 'crossroadLockedBy', 'policies', 'policyRerolls', 'vowPolicyBoost',
  'cosmos', 'resDiscovered',
]);

// ⑥ 资源发现：顶栏统计条 id ↔ 锚点 key ↔ toast 文案，三处此前各自手写一份。
export const ALWAYS_VISIBLE_RESOURCES = Object.freeze(['ep', 'cps', 'run', 'tide']);
export const RESOURCE_DISCOVERY = Object.freeze([
  { key: 'rp',    statId: 'h-rp',    anchorKey: 'rp',    toast: '新资源：研究点 RP——科技树货币' },
  { key: 'es',    statId: 'h-es',    anchorKey: 'es',    toast: '新资源：永恒碎片 ES' },
  { key: 'rank',  statId: 'h-rank',  anchorKey: 'es',    toast: '晋升系统开启' },
  { key: 'faith', statId: 'h-faith', anchorKey: 'faith', toast: '新资源：信仰（FP）' },
  { key: 'pt',    statId: 'h-pt',    anchorKey: 'pt',    toast: '新资源：PT' },
  { key: 'dm',    statId: 'h-dm',    anchorKey: 'dm',    toast: '新资源：深渊物质 DM' },
]);

/** 资源发现标记默认值：开局四常显项恒 true，其余按锚点完成点亮。 */
export function defaultResDiscovered() {
  const d = {};
  for (const k of ALWAYS_VISIBLE_RESOURCES) d[k] = true;
  for (const r of RESOURCE_DISCOVERY) d[r.key] = false;
  return d;
}

function clone(v) {
  return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
}

/** load()：跨局字段从旧档覆盖默认值。 */
export function mergeCrossRun(defs, migrated) {
  for (const k of CROSS_RUN_KEYS) {
    if (migrated[k] !== undefined) defs[k] = migrated[k];
  }
  return defs;
}

/** load()：旧档缺失字段用默认值补齐。 */
export function fillMissingFields(migrated, defs) {
  for (const k of COMPAT_KEYS) {
    if (migrated[k] === undefined) migrated[k] = clone(defs[k]);
  }
  return migrated;
}

/** load()：嵌套对象部分缺失时逐键补齐（不覆盖已写值）。 */
export function applyNestedDefaults(migrated, defs) {
  for (const key of NESTED_DEFAULT_KEYS) {
    const d = defs[key], cur = migrated[key];
    if (!d || typeof d !== 'object' || !cur || typeof cur !== 'object') continue;
    for (const k of Object.keys(d)) if (cur[k] === undefined) cur[k] = clone(d[k]);
  }
  return migrated;
}

function resolvePath(obj, path) {
  const parts = path.split('.');
  let host = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!host || typeof host !== 'object') return null;
    host = host[parts[i]];
  }
  return (host && typeof host === 'object') ? { host, key: parts[parts.length - 1] } : null;
}

/**
 * 任务时钟顺延：暂停 / 离线期间任务冻结（剩余时间不消耗、不到期、不需补发奖励）。
 * 与 applyOffline() 的「离线期间任务冻结」同口径；单独导出便于暂停结算复用与单测。
 */
export function shiftProjectClocks(S, ms) {
  if (!S || !Number.isFinite(ms) || ms <= 0) return 0;
  let n = 0;
  for (const p of (S.projects || [])) {
    if (!p || typeof p !== 'object') continue;
    for (const f of PROJECT_CLOCK_FIELDS) {
      if (Number.isFinite(p[f]) && p[f] > 0) { p[f] += ms; n++; }
    }
  }
  return n;
}

/** 弹框暂停恢复：把全部绝对时间戳整体顺延 ms 毫秒。返回实际顺延的字段数。 */
export function shiftAbsoluteClocks(S, ms) {
  if (!S || !Number.isFinite(ms) || ms <= 0) return 0;
  let n = 0;
  for (const path of ABSOLUTE_CLOCK_PATHS) {
    const slot = resolvePath(S, path);
    if (!slot) continue;
    const v = slot.host[slot.key];
    if (Number.isFinite(v) && v > 0) { slot.host[slot.key] = v + ms; n++; }
  }
  return n + shiftProjectClocks(S, ms);
}

/**
 * 晋升 / 轮回共用的本局重置。
 * @param {object} S 当前状态
 * @param {object} defs defaultState() 的输出（默认值唯一真源）
 * @param {{keepAiCore?:boolean, keepFocus?:boolean}} opts 两条转生路径的差异
 */
export function resetRunState(S, defs, opts = {}) {
  const prevDiscovered = S.resDiscovered;
  const prevFocus = S.focusLevel;
  for (const k of RUN_RESET_KEYS) S[k] = clone(defs[k]);
  // 资源发现：只保留跨周期锚点，其余重新发现（与 v3.9.0 两份实现的逐字口径一致）
  S.resDiscovered = {
    ep: true,
    es: !!(prevDiscovered && prevDiscovered.es),
    faith: !!(prevDiscovered && prevDiscovered.faith),
    rp: !!(prevDiscovered && prevDiscovered.rp),
  };
  // 晋升保留 AI 管理核心科技，轮回不保留
  S.tech = opts.keepAiCore ? { ai_core: true } : {};
  // legacy 天赋保留本局专注等级
  if (opts.keepFocus) S.focusLevel = prevFocus;
  return S;
}

/** 审计用：全部被声明的顶层状态字段名（含路径首段），供单测与 defaultState() 全集比对。 */
export function declaredFieldNames() {
  const out = new Set([
    ...CROSS_RUN_KEYS, ...COMPAT_KEYS, ...NESTED_DEFAULT_KEYS,
    ...RUN_RESET_KEYS,
    ...ABSOLUTE_CLOCK_PATHS.map(p => p.split('.')[0]),
  ]);
  return [...out];
}

/**
 * 审计用：resDiscovered 命名空间下的键。
 * 注意：cps / run / tide / rank 是「资源发现标记」的子键，不是顶层状态字段，
 * v3.10.0 初版把它们混进 declaredFieldNames() 导致孤儿键误报，此处拆成独立命名空间。
 */
export function declaredDiscoveryKeys() {
  return [...new Set([...ALWAYS_VISIBLE_RESOURCES, ...RESOURCE_DISCOVERY.map(r => r.key)])];
}

/** 审计用：声明中是否存在 defaultState() 里没有的孤儿键。 */
export function orphanFieldNames(actualKeys) {
  const actual = new Set(actualKeys || []);
  // 绝对时间戳中的运行时字段（旧档可缺省）不要求出现在 defaultState()
  const runtimeOnly = new Set(['_collapseAt', 'restBonusUntil', 'lazySince', 'collapsed']);
  return declaredFieldNames().filter(k => !actual.has(k) && !runtimeOnly.has(k));
}
