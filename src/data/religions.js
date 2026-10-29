// v2.5.7：宗教系统数据——多种分支（按游戏进度解锁），产出信仰，仓库有库存后解锁
// 分支倍率钩子已在 economy.js/pets.js 消费（sun/genesis/moon/reveal/nature/immortal/omnipot），
// 本表补 UI 元数据 + 进度门控 + 圣印（升级点）/圣所（信仰产出）数值。
// 全流程衔接：新手期仓库解锁 → 中期 RP 解锁更多分支 → 后期 DM 解锁 → 终局 ES 解锁最强分支；
// 章节 6「神格」条件（faith≥1 或 religion 非空）与 line_faith 故事线直接沿用。
import { S } from '../state.js';
import { relicMult } from './relics.js'; // v2.7.0：永暗祷文——信仰产出乘区

// 分支定义（可见性随进度；选一锁定，跨转生保留——crossRun 含 religion）
export const RELIGIONS = [
  { id: 'sun',      name: '日耀议会',   icon: '☀️', desc: '全局产出 ×2',          effect: '全局产出 ×2',          gate: () => true,
    hook: (s) => (s.religion && s.religion.sun) ? 2 : 1 },
  { id: 'genesis',  name: '创世枢机',   icon: '⚙️', desc: '所有成本 ×0.8',          effect: '所有成本 ×0.8',        gate: () => true,
    hook: (s) => (s.religion && s.religion.genesis) ? 0.8 : 1 },
  { id: 'moon',     name: '月影修道会', icon: '🌙', desc: '离线效率 ×1.5',          effect: '离线效率 ×1.5',        gate: () => !!(S.resDiscovered && S.resDiscovered.rp),
    hook: (s) => (s.religion && s.religion.moon) ? 1.5 : 1 },
  { id: 'reveal',   name: '天启密会',   icon: '📜', desc: '项目奖励 ×2',            effect: '项目奖励 ×2',          gate: () => !!(S.resDiscovered && S.resDiscovered.rp),
    hook: (s) => (s.religion && s.religion.reveal) ? 2 : 1 },
  { id: 'nature',   name: '自然亲和',   icon: '🌿', desc: '异兽加成 ×2',            effect: '异兽加成 ×2',          gate: () => !!(S.resDiscovered && S.resDiscovered.rp),
    hook: (s) => (s.religion && s.religion.nature) ? 2 : 1 },
  { id: 'immortal', name: '永生日轮',   icon: '♾️', desc: '转生 ES 获得 ×2',        effect: 'ES 获得 ×2',           gate: () => !!(S.resDiscovered && S.resDiscovered.dm),
    hook: (s) => (s.religion && s.religion.immortal) ? 2 : 1 },
  { id: 'omnipot',  name: '全知教团',   icon: '🔱', desc: '全局产出 ×10',         effect: '全局产出 ×10',         gate: () => (S.es || 0) >= 1,
    hook: (s) => (s.religion && s.religion.omnipot) ? 10 : 1 },
];

// 圣印（升级点）：随进度解锁等级上限——基础 3 / RP 后 5 / DM 后 8 / ES 后 10
export function sealMaxLevel() {
  let max = 3;
  if (S.resDiscovered && S.resDiscovered.rp) max = 5;
  if (S.resDiscovered && S.resDiscovered.dm) max = 8;
  if ((S.es || 0) >= 1) max = 10;
  // v2.6.0 深潜：深渊共鸣——圣印上限 +2/级（终局扩展，最高 10+2×3=16）
  if (S.delve && S.delve.up && S.delve.up.resonance > 0) max += 2 * S.delve.up.resonance;
  return max;
}

// v2.8.30 ③：圣印升级信仰消耗大幅提高并陡峭化：100 → 250 → 625 → …（×2.5 递增）
export function sealUpgradeCost(level) {
  return Math.round(100 * Math.pow(2.5, level));
}

// 圣所（信仰产出建筑）：EP 购买，每级 +0.15 信仰/s，上限 10 级
export const TEMPLE = { id: 'faith_temple', name: '信仰圣所', base: 1e5, growth: 1.25, cap: 10, faithPerSec: 0.05, faithEpPerUnit: 2000 }; // v2.8.30 ②：信仰生产消耗 EP（每 1 信仰耗 2000 EP/s，参考 DM 采集机制） // v2.6.4 ③：0.15 → 0.05（信仰超长线，缓慢累计）
export function templeCost() {
  const lv = (S.religion && S.religion.temple) || 0;
  return Math.round(TEMPLE.base * Math.pow(TEMPLE.growth, lv));
}
export function templeFaithPerSec() {
  let r = TEMPLE.faithPerSec * ((S.religion && S.religion.temple) || 0);
  // v2.6.0 深潜：深渊共鸣——信仰产出 ×1.5/级
  if (S.delve && S.delve.up && S.delve.up.resonance > 0) r *= Math.pow(1.5, S.delve.up.resonance);
  // v2.6.4 ⑤：神谕塔——信仰产出 ×1.15/级（超长线后期升级，消耗信仰）
  const olv = oracleLevel();
  if (olv > 0) r *= Math.pow(1 + ORACLE.effect, olv);
  // v2.7.0 遗物：永暗祷文——信仰产出 +15%/级（DM 超长线消费）
  r *= relicMult('prayer');
  // v2.8.25 ②：圣颂研究（研究点）——信仰产出 +10%/级（内联读取，避免 religions→economy 循环依赖）
  const flv = (S.rpTheories && S.rpTheories.rp_faith) || 0;
  if (flv > 0) r *= (1 + 0.10 * flv);
  return r;
}

// ===== v2.6.4 ⑤ 信仰超长线：神谕塔 / 圣战军（消耗信仰的后期升级点） =====
export const ORACLE = { id: 'oracle', name: '神谕塔', base: 10, growth: 1.5, cap: 5, effect: 0.15, desc: '信仰产出 ×1.15/级' };
export const CRUSADE = { id: 'crusade', name: '圣战军', base: 20, growth: 1.6, cap: 5, effect: 0.12, desc: '全局产出 ×1.12/级' };
export function oracleLevel() { return (S.religion && S.religion.oracle) || 0; }
export function crusadeLevel() { return (S.religion && S.religion.crusade) || 0; }
export function oracleCost() { const lv = oracleLevel(); return Math.round(ORACLE.base * Math.pow(ORACLE.growth, lv)); }
export function crusadeCost() { const lv = crusadeLevel(); return Math.round(CRUSADE.base * Math.pow(CRUSADE.growth, lv)); }

export function religionUnlocked() { return !!(S.religion && S.religion.unlocked); }

// ===== v2.8.6 B1a：信仰 → 赞颂 → 虔诚 → 超验 → 隐密圣学（参考 KG Order of the Sun 四层转化） =====
// 克制原则：转化收益软上限、超验成本指数涨、隐密圣学跨周期保留但解锁科技每轮重研
export const PRAISE = {
  thresholdRatio: 0.8,   // 信仰 ≥ 容量 80% 才可赞颂
  rateBase: 1,           // 转化率基础
  ratePerTranscend: 0.25,// 每超验层级 转化率 +0.25（叠乘于平方项：rate = 1 + 0.25×T²）
  devPerSqrt: 0.02,      // 虔诚全局加成 = √虔诚 × 0.02（软上限）
  devSoftCap: 0.40,      // 软上限 40%
  devSoftAfter: 500,     // 虔诚 > 500 后衰减 50%
  transcendBase: 100,    // 超验成本 100 × 2.2^层级
  transcendGrowth: 2.2,
};
export const SECRET_SANCTUMS = [
  { id: 'black_sanctum', name: '黑曜圣所', needTranscend: 1, costEmberBase: 10, costEmberGrowth: 1.8, devGate: 10,
    fx: { key: 'devCap', v: 0.10 }, desc: '虔诚加成软上限 +10%/座' },
  { id: 'star_hall',     name: '星辰回廊', needTranscend: 3, costEmberBase: 50, costEmberGrowth: 1.8, devGate: 50,
    fx: { key: 'faith', v: 0.10 }, desc: '信仰产出 +10%/座' },
  { id: 'void_altar',    name: '虚空祭坛', needTranscend: 5, costEmberBase: 200, costEmberGrowth: 1.8, devGate: 200,
    fx: { key: 'faithCap', v: 0.50 }, desc: '信仰存储上限 +50%/座' },
];
export function devotion() { return S.devotion || 0; }
export function transcendLevel() { return (S.transcend) || 0; }
export function secretSanctumLv(id) { return (S.secretSanctums && S.secretSanctums[id]) || 0; }
export function secretSanctumCost(id) {
  const d = SECRET_SANCTUMS.find(x => x.id === id);
  if (!d) return 0;
  return Math.round(d.costEmberBase * Math.pow(d.costEmberGrowth, secretSanctumLv(id)));
}
// 赞颂转化率 = 1 + 0.25 × 超验层级²（KG 风格：每层平方提升）
export function praiseRate() {
  const t = transcendLevel();
  return PRAISE.rateBase + PRAISE.ratePerTranscend * t * t;
}
// 信仰存储上限：基础 100 + 圣所×50 + 圣印×20，虚空祭坛 ×(1+0.5/座)
export function faithCap() {
  let cap = 100 + ((S.religion && S.religion.temple) || 0) * 50 + (sealLevel()) * 20;
  const va = secretSanctumLv('void_altar');
  if (va > 0) cap *= (1 + 0.5 * va);
  return Math.round(cap);
}
// 虔诚全局加成（软上限：≤40% 线性，超出部分 50% 衰减；黑曜圣所抬高软上限 +10%/座）
export function devotionMult() {
  const dev = S.devotion || 0;
  if (dev <= 0) return 1;
  let bonus = Math.sqrt(dev) * PRAISE.devPerSqrt;
  let cap = PRAISE.devSoftCap * (1 + 0.10 * secretSanctumLv('black_sanctum'));
  if (bonus > cap) bonus = cap + (bonus - cap) * 0.5; // 软上限后 50% 衰减
  return 1 + bonus;
}
// 超验成本
export function transcendCost() {
  const t = transcendLevel();
  return Math.round(PRAISE.transcendBase * Math.pow(PRAISE.transcendGrowth, t));
}
export function branchOf() { return S.religion && S.religion.branch ? S.religion.branch : null; }
export function sealLevel() { return (S.religion && S.religion.seal) || 0; }

export function visibleReligions() { return RELIGIONS.filter(r => r.gate()); }
