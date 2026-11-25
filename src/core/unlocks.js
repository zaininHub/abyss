// v2.3.0：纯状态判定层（anchors / rift / starchart）
//   把「资源锚点、裂隙可见、星图开启」这类只读 state 的事实判定从 UI 模块（modules/disclosure.js）
//   抽到 core 里，供三处共用：可见性（disclosure）、购买权限（core/access.js）、UI 文案。
//   约束：本文件只读已持久化字段，不 import 任何 modules/——避免 core→modules 反向依赖成环；
//   判定口径与旧实现逐字一致（v3.1.1/v3.4.6/v3.12.9 的反馈修复都在这里，不要再抄第二份）。
import { gateOpen } from './chapterGates.js';

const up = (s, id) => ((s && s.upgrades && s.upgrades[id]) || 0);

/**
 * 资源锚点：某资源是否「已经存在于本局」的唯一判定。
 * rp ← 矩阵存储库（旧档灵感工坊兼容）；pt ← 首持 PT / 宠物乐园 / 饵料仓库；
 * faith ← 宗教解锁 / 持有 FP / 旧档路边神龛；dm ← 首辆载具（外勤摩托队）/ 星尘金库；
 * es ← 完成首次晋升。
 */
export function hasAnchor(key, s) {
  switch (key) {
    case 'rp': return up(s, 'rp_vault') >= 1 || up(s, 'atrium') >= 1;
    case 'pt': return ((s && s.pt) || 0) > 0 || up(s, 'petland') >= 1 || up(s, 'pt_vault') >= 1;
    case 'faith': return !!(s && s.religion && s.religion.unlocked) || ((s && s.faith) || 0) > 0 || up(s, 'shrine') >= 1;
    case 'dm': return up(s, 'scooter') >= 1 || up(s, 'dm_vault') >= 1;
    case 'es': return ((s && s.prestige) || 0) >= 1;
    default: return false;
  }
}

/** 裂隙是否可见（粘性：一旦见过就长期可见；旧档 _v25Legacy 兼容）。 */
export function riftSeen(s) {
  return !!(s && (s._riftSeen === true || s._v25Legacy === true || (s.riftsSealed || 0) > 0));
}

/**
 * 星图（远征）是否开启：异兽/PT → RP → 第 3 章（gate 'starchart'）→ 深空科技或已有远征记录。
 * 顺序不可换：这是「入口早开、章节给实质」的既有节奏。
 */
export function starChartOpen(s) {
  if (!hasAnchor('pt', s)) return false;
  if (!hasAnchor('rp', s)) return false;
  if (!gateOpen('starchart', s)) return false;
  return !!((s.tech && s.tech.deep_space) || (s.expeditionsDone || 0) > 0 || (s.expeditions || []).length > 0);
}

/** 异兽模块：PT 锚点完成即开放（与顶栏 PT 完全同口径，本局制不读跨局标记）。 */
export function petsModuleOpen(s) {
  return hasAnchor('pt', s);
}
