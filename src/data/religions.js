// v2.5.7：宗教系统数据——多种分支（按游戏进度解锁），产出信仰，仓库有库存后解锁
// 分支倍率钩子已在 economy.js/pets.js 消费（sun/genesis/moon/reveal/nature/immortal/omnipot），
// 本表补 UI 元数据 + 进度门控 + 圣印（升级点）/圣所（信仰产出）数值。
// 全流程衔接：新手期仓库解锁 → 中期 RP 解锁更多分支 → 后期 DM 解锁 → 终局 ES 解锁最强分支；
// 章节 6「神格」条件（faith≥1 或 religion 非空）与 line_faith 故事线直接沿用。
import { S } from '../state.js';

// 分支定义（可见性随进度；选一锁定，跨转生保留——crossRun 含 religion）
export const RELIGIONS = [
  { id: 'sun',      name: '日耀议会',   icon: '☀️', desc: '全局产出 ×2（进攻型）',          effect: '全局产出 ×2',          gate: () => true,
    hook: (s) => (s.religion && s.religion.sun) ? 2 : 1 },
  { id: 'genesis',  name: '创世枢机',   icon: '⚙️', desc: '所有成本 ×0.8（基建型）',          effect: '所有成本 ×0.8',        gate: () => true,
    hook: (s) => (s.religion && s.religion.genesis) ? 0.8 : 1 },
  { id: 'moon',     name: '月影修道会', icon: '🌙', desc: '离线效率 ×1.5（挂机型）',          effect: '离线效率 ×1.5',        gate: () => !!(S.resDiscovered && S.resDiscovered.rp),
    hook: (s) => (s.religion && s.religion.moon) ? 1.5 : 1 },
  { id: 'reveal',   name: '天启密会',   icon: '📜', desc: '项目奖励 ×2（任务型）',            effect: '项目奖励 ×2',          gate: () => !!(S.resDiscovered && S.resDiscovered.rp),
    hook: (s) => (s.religion && s.religion.reveal) ? 2 : 1 },
  { id: 'nature',   name: '自然亲和',   icon: '🌿', desc: '异兽加成 ×2（宠物型）',            effect: '异兽加成 ×2',          gate: () => !!(S.resDiscovered && S.resDiscovered.rp),
    hook: (s) => (s.religion && s.religion.nature) ? 2 : 1 },
  { id: 'immortal', name: '永生日轮',   icon: '♾️', desc: '转生 ES 获得 ×2（转生型）',        effect: 'ES 获得 ×2',           gate: () => !!(S.resDiscovered && S.resDiscovered.dm),
    hook: (s) => (s.religion && s.religion.immortal) ? 2 : 1 },
  { id: 'omnipot',  name: '全知教团',   icon: '🔱', desc: '全局产出 ×10（终局爆发）',         effect: '全局产出 ×10',         gate: () => (S.es || 0) >= 1,
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

// 圣印升级信仰消耗：10 → 20 → 40 → …（×2 递增）
export function sealUpgradeCost(level) {
  return Math.round(10 * Math.pow(2, level));
}

// 圣所（信仰产出建筑）：EP 购买，每级 +0.15 信仰/s，上限 10 级
export const TEMPLE = { id: 'faith_temple', name: '信仰圣所', base: 1e5, growth: 1.25, cap: 10, faithPerSec: 0.05 }; // v2.6.4 ③：0.15 → 0.05（信仰超长线，缓慢累计）
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
  return r;
}

// ===== v2.6.4 ⑤ 信仰超长线：神谕塔 / 圣战军（消耗信仰的后期升级点） =====
export const ORACLE = { id: 'oracle', name: '神谕塔', base: 10, growth: 1.5, cap: 5, effect: 0.15, desc: '信仰产出 ×1.15/级（后期信仰深耕）' };
export const CRUSADE = { id: 'crusade', name: '圣战军', base: 20, growth: 1.6, cap: 5, effect: 0.12, desc: '全局产出 ×1.12/级（信仰驱动的终局军势）' };
export function oracleLevel() { return (S.religion && S.religion.oracle) || 0; }
export function crusadeLevel() { return (S.religion && S.religion.crusade) || 0; }
export function oracleCost() { const lv = oracleLevel(); return Math.round(ORACLE.base * Math.pow(ORACLE.growth, lv)); }
export function crusadeCost() { const lv = crusadeLevel(); return Math.round(CRUSADE.base * Math.pow(CRUSADE.growth, lv)); }

export function religionUnlocked() { return !!(S.religion && S.religion.unlocked); }
export function branchOf() { return S.religion && S.religion.branch ? S.religion.branch : null; }
export function sealLevel() { return (S.religion && S.religion.seal) || 0; }

export function visibleReligions() { return RELIGIONS.filter(r => r.gate()); }
