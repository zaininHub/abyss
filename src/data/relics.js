// v2.7.0：深渊遗物——科技树旁的新长线栏目（独立于 EP/RP 的 DM 超长线消费点）
// 解锁前提：深渊裂隙已触发（riftShown，与探采平台/深渊商店同门控链）且 DM 已发现；
// 跨转生保留（relics 入 crossRun）；消耗深渊物质 DM（后期过剩资源，新增长线消费）。
// 全流程：裂隙触发后开放入口 → 中期 RP/DM 解锁更多遗物 → 后期 ES 解锁深潜向遗物 → 终局持续深耕。
import { S } from '../state.js';

// 遗物定义（费用 DM ×1.85^级；gate 按游戏进度解锁）
// v3.4.1 反馈⑦：继续涨价——基础价 ×3（古卷 50 → 150 DM），增速 1.8 → 1.85；
// 满级单件总价 ≈ 150×(1+1.85+3.42+6.33+11.7) ≈ 3.5K DM（旧 ≈ 1.1K），对齐「DM 长线沉淀」定位
export const RELICS = [
  { id: 'tome',     name: '深渊古卷', desc: '全局产出 +8%/级',            effect: 0.08, cap: 5, base: 150, growth: 1.85, gate: () => true },
  // v3.10.4 ①：永暗祷文是 FP(信仰) 产出加成，FP 未解锁（宗教未解锁）前不应作为可购升级出现，
  //   gate 由恒 true 改为「宗教已解锁」——与顶栏 FP / FP 研究项门控同源（religionUnlocked），避免「FP 没解锁却解锁 FP 相关升级」。
  { id: 'prayer',   name: '永暗祷文', desc: 'FP 产出 +15%/级',           effect: 0.15, cap: 5, base: 240, growth: 1.85, gate: () => !!(S.religion && S.religion.unlocked), gateHint: '信仰解锁（FP 可用）后苏醒' },
  { id: 'compass',  name: '星渊罗盘', desc: '研究点转换效率 +10%/级',      effect: 0.10, cap: 5, base: 450, growth: 1.85, gate: () => !!(S.resDiscovered && S.resDiscovered.rp) },
  { id: 'eye',      name: '虚空之眼', desc: '离线效率 +12%/级',            effect: 0.12, cap: 5, base: 360, growth: 1.85, gate: () => !!(S.resDiscovered && S.resDiscovered.rp) },
  { id: 'tentacle', name: '混沌触须', desc: 'AI 决策间隔 -10%/级', effect: 0.10, cap: 5, base: 600, growth: 1.85, gate: () => !!(S.tech && S.tech.ai_core) },
  { id: 'brand',    name: '湮灭刻印', desc: '深潜产出 +20%/级',            effect: 0.20, cap: 5, base: 900, growth: 1.85, gate: () => (S.es || 0) >= 1 },
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
