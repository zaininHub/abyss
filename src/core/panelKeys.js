// v3.10.0 控制流层补完：面板键 / 脏标记初始键 / 开档置脏清单的单一真源。
//
// v3.9.0 的 C3 静态审计只覆盖「置脏点 ↔ 面板消费者」，漏掉了三份初始清单：
//   runtime.dirty 初始键 19 个（含 offline / log 两个无面板的幽灵键，且缺 6 个已注册面板）、
//   registerPanel 26 个、startApp() 手写置脏 21 行。三者可以各自漂移而测试全绿。
// 本模块把 27 个面板键声明一次，三处全部由它派生，并新增 v3100 单测双向锁死。

/** 注册顺序即渲染顺序，与 main.js registerAllPanels() 逐字对应。 */
export const PANEL_KEYS = Object.freeze([
  '__prelude', 'top', 'hero', 'ai', 'tide', 'corruption', '__peak', 'shop', 'rp', 'tech',
  'pets', '__tentacle', 'prestige', 'relics', 'projects', 'story', 'storyline',
  'orchestration', 'achievements', 'religion', 'policy', 'delve', 'bazaar',
  'rift', 'riftTab', 'expedition', 'reincarn',
]);

/** always:true 的面板每帧执行，不受脏标记控制。 */
export const ALWAYS_PANEL_KEYS = Object.freeze(['__prelude', '__peak', '__tentacle']);

/** 有脏键但没有注册面板（历史遗留的日志 / 离线快刷标记），显式声明而非藏在字面量里。 */
export const NON_PANEL_DIRTY_KEYS = Object.freeze(['offline', 'log']);

/** 初始为 false 的脏键；未列出的面板键一律 true。 */
export const DIRTY_FALSE_KEYS = Object.freeze(['relics', 'storyline', 'achievements', 'log']);

/** 开档即需渲染一次的面板（其余靠帧系统置脏）。 */
export const PANEL_DIRTY_ON_START = Object.freeze([
  'top', 'hero', 'shop', 'tech', 'relics', 'pets', 'prestige', 'projects', 'story',
  'rift', 'expedition', 'riftTab', 'tide', 'corruption', 'ai', 'religion', 'delve',
  'bazaar', 'storyline', 'achievements', 'orchestration', 'reincarn',
]);

/** 由清单派生 runtime.dirty 初始键，消除幽灵键与缺键。 */
export function createDirty() {
  const d = {};
  for (const k of [...PANEL_KEYS, ...NON_PANEL_DIRTY_KEYS]) d[k] = !DIRTY_FALSE_KEYS.includes(k);
  return d;
}

/** 受脏标记控制的面板（C3 的 23 个消费者集合）。 */
export function dirtyDrivenPanels() {
  return PANEL_KEYS.filter(k => !ALWAYS_PANEL_KEYS.includes(k));
}
