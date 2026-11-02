// v2.6.0：终局层「深渊深潜」数值配置
// v3.0.0 ①：下潜成本 EP 化——原「只吃 DM」使深潜与 EP 主经济完全脱钩（EP 在终局没有出口），
//            现改为 EP 主成本（与存储上限挂钩→存储扩容重新成为深潜的真实约束）+ DM 辅助成本（保留门控意义）。
// 参考 Kittens Game 后期玩法密度（信仰塔/悖论层的「一层接一层下潜」张力），
// 单轮发展：不设挑战轮回，深潜层深/虚空碎片（VS）跨转生保留，作为一轮游戏的终点积累。
// 解锁：ES ≥ 3 且 DM 资源点已发现 且 宗教已信奉 → 深潜 tab 出现。
// 张力设计：越深产出越高，但 DM 下潜成本指数涨 + 下潜 EP 成本按存储上限比例涨 + 深潜中每秒 EP 维持开销
//          + 腐化线性涨（净化核心可抵消），100 层达成「深渊之眼」终局徽记（贯穿 line_faith 终章氛围）。
export const DELVE = {
  unlockEs: 3,               // ES 门槛
  diveBase: 100,             // 下潜成本基数（DM，辅助成本）
  diveGrowth: 1.35,          // DM 成本随层深指数涨
  // v3.0.0 ①：EP 成本（主成本）——按当前 EP 存储上限计价，随进度自然缩放
  epDiveRatio: 0.04,         // 下潜 EP 成本 = 存储上限 × 4% × 1.12^层深
  epDiveGrowth: 1.12,
  epDiveRatioCap: 0.75,      // 单次下潜 EP 成本封顶为存储上限 75%（防死锁：永远留一口气）
  // v3.0.0 ①：深潜维持开销（每秒按存储上限比例烧 EP，层深越深越烫手）
  epUpkeepPerDepth: 0.0002,  // 每秒 EP 维持 = 存储上限 × 0.02% × 层深（耐压舱 -25%/级）
  vsBase: 0.5,               // 基础 VS 产出（/s，深潜中）
  vsDepthMult: 0.5,          // 每层深 +50% 基础产出
  corruptPerDepth: 0.02,     // 每层深额外腐化累积 %/s（上浮即停）
  // 升级树（VS 消耗，费用 ×1.8^lv）
  upgrades: {
    diver:    { name: '深潜器',   icon: '🚀', base: 10,   cap: 5, desc: '虚空碎片产出 +50%/级' },
    void:     { name: '虚空强化', icon: '🌀', base: 50,   cap: 5, desc: '全局 EP 产出 ×1.10/级' },
    purge:    { name: '净化核心', icon: '💧', base: 100,  cap: 3, desc: '深潜腐化累积 -30%/级' },
    resonance:{ name: '深渊共鸣', icon: '🙏', base: 200,  cap: 3, desc: '圣印上限 +2/级 · FP 产出 ×1.5/级' },
    matrix:   { name: '拟态矩阵', icon: '🤖', base: 300,  cap: 3, desc: 'AI 决策间隔 -20%/级' },
    ember:    { name: '星辰余烬', icon: '🌌', base: 500,  cap: 3, desc: '离线效率上限 ×(1+20%)/级' },
    // v3.0.0 扩展（升级树 6 → 8 项）
    hull:     { name: '耐压舱',   icon: '🛡️', base: 400,  cap: 3, desc: '深潜 EP 维持 -25%/级 · 下潜 EP 成本 -8%/级' },
    sonar:    { name: '回声定位', icon: '📡', base: 800,  cap: 5, desc: '虚空碎片产出 +35%/级 · 层深里程碑 VS +20%/级' },
  },
  // 层深里程碑（一次性 VS 奖励）
  milestones: [
    { depth: 10,  vs: 50 },
    { depth: 25,  vs: 200 },
    { depth: 50,  vs: 1000 },
    { depth: 75,  vs: 2500 },   // v3.0.0 扩展（里程碑 4 → 6 档）
    { depth: 100, vs: 5000 },
    { depth: 150, vs: 20000 },  // v3.0.0 扩展：终局徽记之后的超长线锚点
  ],
};
export function diveCost(depth) { return Math.round(DELVE.diveBase * Math.pow(DELVE.diveGrowth, depth || 0)); }

// v3.0.0 ①：下潜 EP 成本比例（占存储上限）→ 绝对值由调用方传入 epStorageCap() 计算（数据层不依赖 economy，避免循环引用）
export function diveEpRatio(depth, hullLv) {
  const raw = DELVE.epDiveRatio * Math.pow(DELVE.epDiveGrowth, depth || 0) * (1 - 0.08 * (hullLv || 0));
  return Math.min(DELVE.epDiveRatioCap, Math.max(0, raw));
}
export function diveEpCost(depth, cap, hullLv) { return Math.round((cap || 0) * diveEpRatio(depth, hullLv)); }
// v3.0.0 ①：深潜维持开销（EP/秒）——层深驱动，耐压舱减免
export function delveEpUpkeep(depth, cap, hullLv) {
  if (!(depth > 0)) return 0;
  return (cap || 0) * DELVE.epUpkeepPerDepth * depth * Math.max(0, 1 - 0.25 * (hullLv || 0));
}
export function vsPerSec(depth, diverLv) {
  return DELVE.vsBase * (1 + (depth || 0) * DELVE.vsDepthMult) * (1 + 0.5 * (diverLv || 0));
}
export function delveCorruptRate(depth, purgeLv) {
  if (!(depth > 0)) return 0;
  return Math.max(0, DELVE.corruptPerDepth * depth * (1 - 0.3 * (purgeLv || 0)));
}
export function delveUpgradeCost(id, lv) {
  const u = DELVE.upgrades[id];
  return Math.round(u.base * Math.pow(1.8, lv || 0));
}
// v3.0.0 扩展：层深里程碑奖励（回声定位 +20%/级）
export function milestoneVs(m, sonarLv) {
  return Math.round((m.vs || 0) * (1 + 0.2 * (sonarLv || 0)));
}
