// v2.7.0：深渊遗物——科技树旁的新长线栏目（独立于 EP/RP 的 DM 超长线消费点）
// 解锁前提：深渊裂隙已触发（riftShown，与探采平台/深渊商店同门控链）且 DM 已发现；
// 跨转生保留（relics 入 crossRun）；消耗深渊物质 DM（后期过剩资源，新增长线消费）。
// 全流程：裂隙触发后开放入口 → 中期 RP/DM 解锁更多遗物 → 后期 ES 解锁深潜向遗物 → 终局持续深耕。
import { S } from '../state.js';

// 遗物定义（费用 DM ×1.8^级；gate 按游戏进度解锁）
export const RELICS = [
  { id: 'tome',     name: '深渊古卷', desc: '全局产出 +8%/级',            effect: 0.08, cap: 5, base: 50,  growth: 1.8, gate: () => true },
  { id: 'prayer',   name: '永暗祷文', desc: '信仰产出 +15%/级',           effect: 0.15, cap: 5, base: 80,  growth: 1.8, gate: () => true },
  { id: 'compass',  name: '星渊罗盘', desc: '研究点转换效率 +10%/级',      effect: 0.10, cap: 5, base: 150, growth: 1.8, gate: () => !!(S.resDiscovered && S.resDiscovered.rp) },
  { id: 'eye',      name: '虚空之眼', desc: '离线效率 +12%/级',            effect: 0.12, cap: 5, base: 120, growth: 1.8, gate: () => !!(S.resDiscovered && S.resDiscovered.rp) },
  { id: 'tentacle', name: '混沌触须', desc: 'AI 决策间隔 -10%/级', effect: 0.10, cap: 5, base: 200, growth: 1.8, gate: () => !!(S.tech && S.tech.ai_core) },
  { id: 'brand',    name: '湮灭刻印', desc: '深潜产出 +20%/级',            effect: 0.20, cap: 5, base: 300, growth: 1.8, gate: () => (S.es || 0) >= 1 },
];

export function relicLevel(id) {
  return (S.relics && S.relics[id]) || 0;
}
export function relicCost(id) {
  const r = RELICS.find(x => x.id === id);
  if (!r) return Infinity;
  return Math.ceil(r.base * Math.pow(r.growth, relicLevel(id)));
}
// 单件遗物倍率（效果线性累乘：1 + effect×级）
export function relicMult(id) {
  const r = RELICS.find(x => x.id === id);
  if (!r) return 1;
  return 1 + r.effect * relicLevel(id);
}
// 遗物入口解锁：裂隙已触发 ∧ DM 已发现（与探采平台/深渊商店同门控链）
export function relicsUnlocked() {
  if (!(S.resDiscovered && S.resDiscovered.dm)) return false;
  if (S._riftSeen === true || S._v25Legacy === true || (S.riftsSealed || 0) > 0) return true;
  return false;
}
