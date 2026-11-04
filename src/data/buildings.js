// v1.3 模块 B：功能建筑定义（配置本体在 BALANCE.buildings，此处只做导出聚合）
// v2.1：聚合层扩展——getAllBuildings() 统一注册 55 栋（级制红线全量断言口径），
//       并提供 v2.1 建筑的级价 / RP 解锁定价 / 里程碑门控。
import { BALANCE } from './balance.js';

export const BUILDINGS = [
  BALANCE.buildings.canteen,
  BALANCE.buildings.dorm,
  BALANCE.buildings.dock,
  BALANCE.buildings.datacenter,
  // v2.5.2 反馈③：深渊鱼缸从「深渊行者线专属 append」移入通用建筑表——此前仅线注册且设施区
  // 需里程碑/已有建筑才显示，导致玩家在商店底部找不到出售入口；现全线可见、效果通用
  // （DM 采集 +20%/级、3 级裂隙封印 +5 DM，读侧见 economy.abyssFishbowlLevel）
  BALANCE.buildings.abyss_fishbowl,
  BALANCE.buildings.wish_well, // v3.0.3：许愿池从研究升级移入通用设施
];

// v2.1 建筑表（46 新增 + storage/cache 升级镜像）
export const V21_BUILDINGS = BALANCE.buildingsV21;

// v2.2 定向建筑表（岔路口三栋，独立于 v21 表）
export const CROSSROAD_BUILDINGS = BALANCE.crossroadBuildings;

// 58 栋统一注册表（4 既有 + 51 v2.1 表项 + 3 定向建筑，镜像含在内仅作注册/断言，购买入口仍在升级商店）
export function getAllBuildings() {
  return [...BUILDINGS, ...BALANCE.buildingsV21, ...BALANCE.crossroadBuildings];
}

// ========== v2.2 族升级动态上限 ==========

// 组D 全族按 cat 映射（cat==='D' 共 5 栋：三梯 + storage/cache 升级镜像，PM §3.2 表含镜像）。
// 产出族按 id 白名单（组长裁定 7698323937784007918 → PM 终稿 7698334831112899877 收窄 + 组长批准）：
//   产出族 = 组E 非锚点 3 座（coop_hall / eco_battery / eco_battery_2，语义聚焦线程经济：产出加算 + 薪资折扣，
//   组D 3 座成族先例支撑体感）。
//   排除集 7 id（maxLevel 恒静态 cap，乘数与概率堆叠专项后续版本处理，不废弃）：
//   组B field_1~4（clickMul ×1.5/×2/×3/×5）、组E team_temple/super_team（threadMul ×1.5/×2）——
//   锚点上限被抬会产生 7 级乘数级联的威力膨胀，远超 v2.1 RESCALE 校定的终局平衡；
//   组B crit_furnace / crit_reactor / crit_reactor_2——effectEngine agg:'crit' 按级连乘
//   Π(1+chance×(mult-1))，crit_reactor_2 cap 1→16 = ×381.8，期望堆叠本质等同乘算威力；
//   且 3 座全是 cap 1「1 级即生效」楼型，抬 cap 还要先新定义每级堆叠语义。
export const OUTPUT_FAMILY_IDS = ['coop_hall', 'eco_battery', 'eco_battery_2'];

// 楼 → 族映射：D 全族 / 产出族 id 白名单；其余（A/C/F/G/H/I/X、基础栋、组B 整组、组E 乘算锚点）无映射
// → 静态 cap 恒真——组A 锚链 / 组I 双楼 / 乘算锚点楼在 v2.2 全代码路径上 maxLevel 不可变（PM 断言 5 + 乘数保护）。
export function familyOfBuilding(b) {
  if (b.cat === 'D') return 'D';
  if (OUTPUT_FAMILY_IDS.includes(b.id)) return 'output';
  return null;
}

// 动态级制上限：静态表 cap 是基线，族升级档位做扩展，hardCap 钳制。
// v2.4 KG 模式改造：unlimited 建筑（扩容类 storage/cache/组D 三梯 + 新增多效果上限建筑）
// 返回 Infinity —— 无限升级、无族升级钳制；成本递增 + 30% 防死锁钳制承担「后期性价比递减」。
// 静态 cap 读取点统一经此函数（effectEngine.effectiveLevel / v21Level / v21Maxed / shop 购买与文案）。
export function capOf(b, state) {
  if (b.unlimited) return Infinity;
  const fam = familyOfBuilding(b);
  if (!fam) return b.cap ?? b.levels;
  const cfg = BALANCE.familyUpgradeTiers[fam];
  if (!cfg) return b.cap ?? b.levels; // 族条目删除兜底（v2.4 扩容族移除后 cat D 恒走 unlimited 分支，不触达）
  const tiersBought = Math.min((state && state.familyUpgrades && state.familyUpgrades[fam]) || 0, cfg.tiers.length);
  let cap = b.cap ?? b.levels;
  for (let i = 0; i < tiersBought; i++) cap += cfg.tiers[i].addCap;
  return Math.min(cap, cfg.hardCap);
}

export function buildingLevel(b, S) {
  return (S.buildings && S.buildings[b.id]) || 0;
}

export function buildingMaxed(b, S) {
  return buildingLevel(b, S) >= b.levels;
}

// v2.6.5 ①：后期成本加速——基础产出升级超过 50 级后，每级额外 ×1.08
// （防止单个建筑无限升级到几百级：200 级时成本再 ×1.08^150 ≈ ×13000）
export function lateStageCost(lv, baseCost) {
  if (lv <= 50) return baseCost;
  return baseCost * Math.pow(1.08, lv - 50);
}

// 当前级成本（base × growth^lv × costMult；lv>50 套用后期加速）
export function buildingCost(b, S, costMultVal) {
  const lv = buildingLevel(b, S);
  const base = b.base * Math.pow(b.growth, lv);
  return Math.ceil(lateStageCost(lv, base) * (costMultVal ?? 1));
}

// ========== v2.1 建筑聚合读侧 ==========

export function v21ById(id) {
  return BALANCE.buildingsV21.find(b => b.id === id) || null;
}

// 级制红线读侧：等级读值一律截断到 capOf（v2.2 动态上限；与 effectEngine.effectiveLevel 同口径）
export function v21Level(id, S) {
  const b = v21ById(id);
  if (!b) return 0;
  return Math.min((S.buildings && S.buildings[id]) || 0, capOf(b, S));
}

export function v21Maxed(b, S) {
  return v21Level(b.id, S) >= capOf(b, S);
}

// v2.1 级价：base × growth^当前级 × costMult（沿用 v1.3 模块 B 公式；防死锁 30% 钳制在 economy.v21BuildingCost 统一施加）
export function buildingCostV21(b, S, costMultVal) {
  const lv = v21Level(b.id, S);
  const base = b.base * Math.pow(b.growth, lv);
  return Math.ceil(lateStageCost(lv, base) * (costMultVal ?? 1)); // v2.6.5 ①：lv>50 后期成本加速
}

// RP 解锁定价：原科技 RP × 1.5（PM §1 设计要点 / §7.2 裁决：每座单独定价，RP 保持稀缺）
export function unlockRpV21(b) {
  if (!b.unlockTech) return 0;
  const rp = BALANCE.legacyTechRp[b.unlockTech] || 0;
  return Math.ceil(rp * BALANCE.buildingUnlockRatio);
}

// 里程碑解锁门控（终章 RESCALE §7，按价位档映射：m=5→低价档、m=6→中档、m=7→高档，防前期速通）
// v3.4.2 反馈①：效能建筑全面涨价（base ×3~×8）后门槛随价位映射同步上移，保持各建筑原里程碑档位基本不变
export function unlockMilestoneV21(b) {
  if (b.base >= 4e6) return 7;
  if (b.base >= 1.5e6) return 6;
  if (b.base >= 6e5) return 5;
  return 0;
}

// 建筑是否已解锁可购（RP 解锁标记 + 里程碑门控 + 钥匙科技门控）；
// 46 个删除科技的 unlockTech 仅作 RP 定价基准不设门；6 项钥匙科技（v21KeyTechs）必须实际已购。
export function buildingUnlockedV21(b, S) {
  const rpOk = !!(S.unlockedBuildings && S.unlockedBuildings[b.id]);
  const keyOk = !b.unlockTech || !BALANCE.v21KeyTechs.includes(b.unlockTech) || !!S.tech[b.unlockTech];
  const mOk = Object.keys(S.milesDone || {}).length >= unlockMilestoneV21(b);
  return rpOk && keyOk && mOk;
}

// ========== v2.2 定向建筑读侧 ==========

export function crossroadById(id) {
  return BALANCE.crossroadBuildings.find(b => b.id === id) || null;
}

// 是否已立誓（持有该定向建筑 ≥1 级）
export function crossroadOwned(id, S) {
  return ((S.buildings && S.buildings[id]) || 0) >= 1;
}
