// v2.6.0：终局层「深渊深潜」数值配置
// 参考 Kittens Game 后期玩法密度（信仰塔/悖论层的「一层接一层下潜」张力），
// 单轮发展：不设挑战轮回，深潜层深/虚空碎片（VS）跨转生保留，作为一轮游戏的终点积累。
// 解锁：ES ≥ 3 且 DM 资源点已发现 且 宗教已信奉 → 深潜 tab 出现。
// 张力设计：越深产出越高，但 DM 下潜成本指数涨 + 深潜腐化线性涨（净化核心可抵消），
//          100 层达成「深渊之眼」终局徽记（贯穿 line_faith 终章氛围）。
export const DELVE = {
  unlockEs: 3,               // ES 门槛
  diveBase: 100,             // 下潜成本基数（DM）
  diveGrowth: 1.35,          // 成本随层深指数涨
  vsBase: 0.5,               // 基础 VS 产出（/s，深潜中）
  vsDepthMult: 0.5,          // 每层深 +50% 基础产出
  corruptPerDepth: 0.02,     // 每层深额外腐化累积 %/s（上浮即停）
  // 升级树（VS 消耗，费用 ×1.8^lv）
  upgrades: {
    diver:    { name: '深潜器',   icon: '🚀', base: 10,   cap: 5, desc: '虚空碎片产出 +50%/级' },
    void:     { name: '虚空强化', icon: '🌀', base: 50,   cap: 5, desc: '全局 EP 产出 ×1.10/级' },
    purge:    { name: '净化核心', icon: '💧', base: 100,  cap: 3, desc: '深潜腐化累积 -30%/级' },
    resonance:{ name: '深渊共鸣', icon: '🙏', base: 200,  cap: 3, desc: '圣印上限 +2/级 · 信仰产出 ×1.5/级' },
    matrix:   { name: '拟态矩阵', icon: '🤖', base: 300,  cap: 3, desc: 'AI 决策间隔 -20%/级' },
    ember:    { name: '星辰余烬', icon: '🌌', base: 500,  cap: 3, desc: '离线效率上限 ×(1+20%)/级' },
  },
  // 层深里程碑（一次性 VS 奖励）
  milestones: [
    { depth: 10,  vs: 50 },
    { depth: 25,  vs: 200 },
    { depth: 50,  vs: 1000 },
    { depth: 100, vs: 5000 },
  ],
};
export function diveCost(depth) { return Math.round(DELVE.diveBase * Math.pow(DELVE.diveGrowth, depth || 0)); }
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
