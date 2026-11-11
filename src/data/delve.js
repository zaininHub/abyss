// 深渊深潜数值配置
// v3.12.6 反馈①~④：深潜从「每秒结算 + 一次性 EP/DM 下潜」改成「每 10 分钟一次结算」的
//   周期玩法，层深改为「注入虚空碎片（VS）填经验条」提升——原设计里一秒结算一次的产出
//   在终局乘区叠加后半天就能刷出 2K+ VS，而升级树单价还停在 10~800，稀缺性被彻底抹平；
//   下潜成本（EP+DM）相对每秒产出也几乎可以忽略（用户实报「消耗过少、VS 过多」）。
//
// 现口径（四条铁律，改动前先读）：
//   ① 一个结算周期 = 600 秒，产出与消耗同时结算一次，面板按「/10min」展示；
//   ② 消耗 = 你 10 分钟 EP 产出 × 比例（比例随层深抬高）+ 存储上限兜底下限，深潜不再是免费副业；
//   ③ 产出 = 每周期固定 VS，随层深与深潜器线性抬高，数量级回落到「几 VS / 周期」；
//   ④ 等级（层深）只吃 VS：注入经验条，满则 +1 级，产出与消耗同时抬一档。
export const DELVE = {
  unlockEs: 3,               // ES 门槛
  cycleSec: 600,             // v3.12.6 ②：结算周期（10 分钟）
  // 等级经验条（VS 注入）
  levelBase: 6,              // Lv.0 → Lv.1 需要 6 VS
  levelGrowth: 1.32,         // 每级需求 ×1.32
  // 每周期 EP 消耗
  epDrainBase: 0.12,         // 消耗 = 10 分钟 EP 产出 × (0.12 + 0.03×层深) × 耐压舱减免
  epDrainPerDepth: 0.03,
  epDrainFloorRatio: 0.02,   // 下限：存储上限 × 2%（零产出时也不给白嫖）
  hullDrainCut: 0.15,        // 耐压舱：每周期消耗 -15%/级
  // 每周期 VS 产出
  // v3.12.6 ①：原 0.22/s × 层深加成 = 半天 2K+，现按「每周期」计价，同层深约为原来的 1/25
  vsCycleBase: 0.55,
  vsDepthMult: 0.35,         // 每层深 +35% 基础产出
  corruptPerCycle: 0.6,      // 每周期额外腐化 +0.6% × 层深（净化核心 -30%/级）
  maxCyclesPerTick: 240,     // 单帧最多补算的周期数（离线回归防死循环）
  // 升级树（VS 消耗，费用 ×1.8^lv）
  upgrades: {
    diver:    { name: '深潜器',   icon: '🚀', base: 40,   cap: 5, desc: '虚空碎片产出 +50%/级' },
    void:     { name: '虚空强化', icon: '🌀', base: 50,   cap: 5, desc: '全局 EP 产出 +10%/级' },
    purge:    { name: '净化核心', icon: '💧', base: 100,  cap: 3, desc: '深潜腐化累积 -30%/级' },
    resonance:{ name: '深渊共鸣', icon: '🙏', base: 200,  cap: 3, desc: '圣印上限 +2/级 · FP 产出 +50%/级' },
    matrix:   { name: '拟态矩阵', icon: '🤖', base: 300,  cap: 3, desc: 'AI 决策间隔 -20%/级' },
    ember:    { name: '星辰余烬', icon: '🌌', base: 500,  cap: 3, desc: '离线效率上限 ×(1+20%)/级' },
    hull:     { name: '耐压舱',   icon: '🛡️', base: 400,  cap: 3, desc: '每周期 EP 消耗 -15%/级' },
    sonar:    { name: '回声定位', icon: '📡', base: 800,  cap: 5, desc: '层深里程碑 VS +20%/级' },
  },
  // 层深里程碑（一次性 VS 奖励）
  milestones: [
    { depth: 10,  vs: 50 },
    { depth: 25,  vs: 200 },
    { depth: 50,  vs: 1000 },
    { depth: 75,  vs: 2500 },
    { depth: 100, vs: 5000 },
    { depth: 150, vs: 20000 },  // 终局徽记之后的超长线锚点
  ],
};

// 升到下一级所需的 VS（层深 = 当前等级）
export function levelNeed(depth) {
  return Math.max(1, Math.round(DELVE.levelBase * Math.pow(DELVE.levelGrowth, Math.max(0, depth || 0))));
}

// 每周期 VS 产出（深潜器 +50%/级）
export function vsPerCycle(depth, diverLv) {
  return DELVE.vsCycleBase * (1 + Math.max(0, depth || 0) * DELVE.vsDepthMult) * (1 + 0.5 * (diverLv || 0));
}

// 每周期 EP 消耗：按「10 分钟 EP 产出 × 比例」计价——用产出而非上限计价，
// 才能保证无论在哪个阶段，「深潜都在真实占用你的产能」。
// cps 由调用方传入（数据层不依赖 economy，避免循环引用）；零产出时退回存储上限兜底。
export function epPerCycle(depth, cps, cap, hullLv) {
  const ratio = (DELVE.epDrainBase + DELVE.epDrainPerDepth * Math.max(0, depth || 0))
    * Math.max(0, 1 - DELVE.hullDrainCut * (hullLv || 0));
  const byIncome = Math.max(0, cps || 0) * DELVE.cycleSec * ratio;
  const floor = Math.max(0, cap || 0) * DELVE.epDrainFloorRatio;
  return Math.round(Math.max(byIncome, floor));
}

// 每周期腐化累积（上浮即停）
export function corruptPerCycle(depth, purgeLv) {
  if (!(depth > 0)) return 0;
  return Math.max(0, DELVE.corruptPerCycle * depth * (1 - 0.3 * (purgeLv || 0)));
}

export function delveUpgradeCost(id, lv) {
  const u = DELVE.upgrades[id];
  return Math.round(u.base * Math.pow(1.8, lv || 0));
}
// 层深里程碑奖励（回声定位 +20%/级）
export function milestoneVs(m, sonarLv) {
  return Math.round((m.vs || 0) * (1 + 0.2 * (sonarLv || 0)));
}
