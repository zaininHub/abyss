// v3.10.0 核心玩法抽象（成就层）：声明 → 求值 → 消费 三段链的「求值」层。
//
// 纯函数，零 DOM、零闭包依赖：判定函数全部来自 data/achievements.js，外部查询函数由 ctx 注入，
// 因此可在纯 Node 下单测（v3.9.0 只能对 main.js 做字符串断言）。
// main.js 的 checkAch() 退化为薄适配：拿到新解锁列表 → 打日志 / toast / 置脏重绘。
import { ACHIEVEMENTS } from '../data/achievements.js';

export const ACHIEVEMENT_IDS = Object.freeze(ACHIEVEMENTS.map(a => a.id));
const BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

export function achievementById(id) { return BY_ID.get(id) || null; }
export function achievementCount() { return ACHIEVEMENTS.length; }

/**
 * 求值全部自动成就，写入 S.achievements 并返回本次新解锁的定义（供 UI 层播报）。
 * 单个 test 抛错被隔离，不阻断其余成就，也不击穿整帧。
 * @param {object} S 游戏状态
 * @param {object} ctx 外部查询函数：totalOwned / techCount / petCount / chapterProgress
 */
export function evaluateAchievements(S, ctx = {}) {
  if (!S) return [];
  const got = S.achievements || (S.achievements = {});
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (typeof a.test !== 'function' || got[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(S, ctx); } catch { ok = false; }
    if (ok) { got[a.id] = true; fresh.push(a); }
  }
  return fresh;
}

/** 剧情手动点亮的单一入口（demon_friend / gaze_abyss / collapsed 等无 test 成就）。 */
export function unlockAchievement(S, id) {
  if (!S || !BY_ID.has(id)) return false;
  const got = S.achievements || (S.achievements = {});
  if (got[id]) return false;
  got[id] = true;
  return true;
}

/**
 * 语义去重审计：判定函数源码去空白后逐字相同的成就视为重复定义。
 * v3.9.0 的 es1000 / es1k 正是此类；crossroad / vow 属人工审出的同义项（本轮已移除 vow）。
 */
export function duplicateAchievementTests() {
  const seen = new Map();
  for (const a of ACHIEVEMENTS) {
    if (typeof a.test !== 'function') continue;
    const key = a.test.toString().replace(/\s+/g, '');
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(a.id);
  }
  return [...seen.values()].filter(ids => ids.length > 1);
}

/** 面板用：已解锁数量 / 总数。 */
export function achievementProgress(S) {
  const got = (S && S.achievements) || {};
  return { unlocked: ACHIEVEMENTS.filter(a => got[a.id]).length, total: ACHIEVEMENTS.length };
}
