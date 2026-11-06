// v2.3.1 渐进披露链：通用链门控层（rev18 第九章）
// 边界（沿架构 §2.1 裁定）：链层只管「哪些条目可见」，不管「条目长什么样」——
// 占位渲染仍走各模块既有卡片生成器（??? 载体 / lock-card / 置灰）；既有 buy 路径、
// 解锁条件数值、排序逻辑零改动。豁免模块（科技树/族升级/岔路口/v1.3 设施）不注册。
//
// 窗口公式（rev18 9.3，替代 rev17 §2.3 首屏/步长列）：
//   已购前缀 p = 链序上从头起连续「已完成链动作」的最大条目数
//   窗口 K = p + 1
//   可见集 = 链序前 K 项 ∪ 全部已购项
// 新档任意模块同屏未购项恒为 1；数量控制由解锁链独立承担，无分页、无展开交互。
// v2.3.2 §5.2（PM 详设 hotfix，用户两轮反馈缺陷）：链提示文案与挂载逻辑整体废除——
// 链内下一项就是当前唯一可购项，不挂任何锁定提示；锁定与预告感由 ??? 预览卡承担。

// v2.3.1 ⑤：展开交互整节移除（rev17 §2.5 由 rev18 9.3 显式废止）。
// 本键不再有任何写入点；模块加载时清除历史存量（rev18 9.6：加载时清除、不迁移）。
// 导出保留：main.doReset 清档回收路径与历史测试引用本常量。
export const EXPAND_KEY = 'abyss_v2_expand';
try {
  if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem(EXPAND_KEY);
} catch { /* 隐私模式等场景静默忽略：无存量可清不阻塞游戏 */ }

// 模块注册表（rev18 9.3：CHAIN_CONF 的 first / step 字段废止，仅保留模块注册
// 供 chainSplit 合法性判定；窗口大小完全由 K = p + 1 推导，不再有配置化首屏）
export const CHAIN_CONF = {
  shop:     {},  // 升级商店（53）
  thread:   {},  // 线程强化（7）
  vehicles: {},  // 探采平台（4）
  dm:       {},  // 深渊商店（4）
  v21:      {},  // 效能建筑（51，已购=RP 解锁）
  eternal:  { extraK: (items, flags, p, S) => Math.min(items.length, p + 1 + Math.floor((S.es || 0) / 8)) },  // v3.0.3 反馈③：ES 每 8 点多揭示 1 项（17 ES 时至少可见 3 项可购）
  offline:  {},  // 离线升级（4，既有 req 链=已购链特例）
};

// v2.3.2 §5.2：链提示文案随废除移除（零残留）；预览占位文案保留——
// 锁定与预告感由 ??? 预览卡（本文案）承担
export const CHAIN_PREVIEW = '沿链条逐步解锁';

// v2.3.1 ①：资源锚点完成判定（rev18 9.1 锚点表；判定语义与 9.5 链语义同款——
// 数量型持有 ≥1、等级型等级 ≥1、一次性达成即完成）。
// 这是「锚点完成的即时谓词」；持久化显示态走 S.resDiscovered（锚点完成即写入，
// 跨转生保留，旧档按 9.6 OR 语义迁移），顶栏显示与 ② 分区可见性统一读持久化标记。
export function anchorDone(key, S) {
  const up = (S && S.upgrades) || {};
  switch (key) {
    case 'rp':    return (up.rp_vault || 0) >= 1 || (up.atrium || 0) >= 1; // v3.0.9 反馈②：研究点解锁唯一入口 = 购入「矩阵存储库」（旧档「灵感工坊购入」兼容保留）；EP 溢出仅开放仓库购买入口，不再直接解锁研究点（修复：未购仓库 RP 已解锁）
    case 'pt':    return (S && (S.pt || 0) > 0) || ((up.petland || 0) >= 1) || ((up.pt_vault || 0) >= 1); // v3.0.5 反馈①：PT 锚点 = 首次持有 PT；v3.1.1 反馈⑦：购入「饵料仓库」即开放 PT（与矩阵存储库→RP 同构：仓库是资源解锁入口，修复「买了饵料仓库顶栏/异兽仍不上」）
    // v3.4.6 反馈⑩：路边神龛删除——信仰锚点改判「宗教已解锁 / 持有 FP / 旧档已购神龛」任一完成
    case 'faith': return !!(S.religion && S.religion.unlocked) || (S.faith || 0) > 0 || (up.shrine || 0) >= 1;
    case 'dm':    return (up.scooter || 0) >= 1 || (up.dm_vault || 0) >= 1; // DM ← 首辆载具（外勤摩托队）购入；v3.0.3 反馈⑪：星尘金库买入亦亮出
    case 'es':    return ((S && S.prestige) || 0) >= 1; // ES 与职级 ← 完成首次晋升
    default: return false;
  }
}

// 持久化锚点标记读取（② 分区可见性与 tab 锁定统一走这里：
// 新档锚点未完成 → false；锚点完成过一次 → true 且跨转生保留，不回隐藏）
export function anchorShown(key, S) {
  if (anchorDone(key, S)) return true; // 即时完成当帧即视为已显示（discoverCheck 随后落档）
  return !!(S && S.resDiscovered && S.resDiscovered[key]);
}

// v3.7.2 反馈①：异兽模块的唯一解锁判定源 = PT 锚点完成，与顶栏 PT 完全同口径。
// 此前 btn-pets 只挂 P2 天数门控（游玩满 0.5 天），而顶栏 PT 走 anchorDone('pt') 即时门控，
// 于是出现「PT 还没解锁、异兽大模块却已开放」的错位；Wiki 口径本就是「仓库即 PT 解锁入口，
// 顶栏 PT、异兽 tab 同步开放」，故废弃 P2 天数门控，避免反向错位（PT 已亮、tab 还锁）。
// 口径刻意用 anchorDone 而非 anchorShown：PT / 宠物是本局制（转生清空），
// 不能让跨转生持久标记 resDiscovered.pt 在顶栏 PT 隐藏时仍把模块放行。
export function petsModuleUnlocked(S) {
  return anchorDone('pt', S);
}

// v2.5 ①：深渊裂隙触发门控——首次裂隙出现（S._riftSeen）后解锁探采平台与深渊商店；
// v2.4 及以前旧档（S._v25Legacy，迁移时按 DM/RP 锚点进度自动打标）保持解锁不回退；
// v2.5 起新档购入载具/灵感工坊不再解锁（解锁前提唯一 = 触发深渊裂隙）。
export function riftShown(S) {
  if (S && (S._riftSeen === true || S._v25Legacy === true)) return true;
  return false;
}

// 核心：链窗口切分（纯函数，基于 S 即时判定，无持久状态）
// 返回 { visible: [...], hiddenCount, chainNextIdx: p, K }
export function chainSplit(mod, items, purchasedOf, S) {
  const conf = CHAIN_CONF[mod];
  if (!conf) {
    return { visible: items.slice(), hiddenCount: 0, chainNextIdx: -1, K: items.length };
  }
  const flags = items.map(it => !!purchasedOf(it, S));
  let p = 0;
  while (p < items.length && flags[p]) p++; // 已购前缀
  const K = conf.extraK ? conf.extraK(items, flags, p, S) : Math.min(items.length, p + 1); // rev18 9.3：K = p + 1（eternal 按 ES 扩展）
  const visible = items.filter((it, i) => i < K || flags[i]); // 前 K 项 ∪ 全部已购项
  const hiddenCount = items.length - visible.length;
  return { visible, hiddenCount, chainNextIdx: p, K };
}

// v2.3.2 §5.2：isChainNext / attachChainHint 随链提示废除一并移除（零残留）——
// 链内下一项定位改由 split.chainNextIdx 直接承担（各渲染器可购判据不受影响）。

// v2.3.1 ⑤：分组渲染通用器（rev18 9.3 分组口径）——分组是纯显示分区，
// 不改变链序、不拆链、不改链判定：条目按「链序中的位置」取可见性（split.visible
// 已算好），再按类型归组渲染；链内下一项落在哪个组就显示在哪个组。
// groups: [{ title, test(item) }]，组序即渲染序；组内可见 0 项时整组（含组头）不渲染。
// v2.8.18 ③：ownedOpts = { verb }（可选）——组内「已购终态」项（一次性已购 / 满级）
// 收进组最下侧「已×」折叠区，不影响未购/可叠加项展示；未传该参数时行为与旧版完全一致。
import { S } from '../state.js';
import { buildOwnedSection } from './listkit.js';
export function renderChainedGroups(container, split, groups, makeItem, onItem, ownedOpts) {
  const buckets = groups.map(() => []);
  split.visible.forEach((it, i) => {
    let gi = groups.findIndex(g => g.test(it));
    if (gi < 0) gi = groups.length - 1; // 未命中任何组谓词 → 兜底进末组，条目永不丢
    buckets[gi].push({ it, i });
  });
  // v2.8.18：记录 条目→组 映射 + 各折叠区 box（供购后原地移卡）
  const itemGroup = container.__itemGroup || (container.__itemGroup = {});
  const ownedBoxes = container.__ownedBoxes || (container.__ownedBoxes = []);
  groups.forEach((g, gi) => {
    const active = [], owned = [];
    for (const { it, i } of buckets[gi]) {
      if (ownedOpts) itemGroup[it.id] = gi;
      const ownedCnt = S.upgrades && (S.upgrades[it.id] || 0);
      const done = ownedCnt > 0 && (it.maxLevel === 1 || (it.maxLevel && ownedCnt >= it.maxLevel));
      (ownedOpts && done ? owned : active).push({ it, i });
    }
    if (!active.length && !owned.length) { ownedBoxes[gi] = null; return; } // 组内可见 0 项：整组不渲染（含组头）
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = g.title;
    container.appendChild(h);
    for (const { it, i } of active) {
      const el = makeItem(it);
      if (typeof onItem === 'function') onItem(it, el);
      container.appendChild(el);
    }
    if (ownedOpts && owned.length) {
      const sec = buildOwnedSection('owned-' + g.title, container, ownedOpts.verb || '升级');
      ownedBoxes[gi] = sec.box;
      for (const { it, i } of owned) {
        const el = makeItem(it);
        if (el) { el.classList.add('owned-item'); sec.box.appendChild(el); }
      }
      sec.updateCount(owned.length);
    } else {
      ownedBoxes[gi] = null;
    }
  });
}
