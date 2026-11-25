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
  // v2.3.0：判定下沉到 core/unlocks.js（access 权限层与 UI 共用同一份，杜绝第二份口径）。
  return hasAnchor(key, S);
}

// 锚点「已显示」：即时完成 或 持久化标记（resDiscovered，跨转生保留，旧档按 9.6 OR 语义迁移）。
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

/**
 * v3.12.9：星图（远征）解锁的唯一判定源 —— 必须排在「异兽 / 宠物」之后。
 * 星图远征要消耗 PT，且「携带出战异兽每只 +10% CPS 与专属资源收益」；宠物没解锁时
 * 这些产出与加成都没有落点，星图先开等于开一个残废模块。故把 PT 锚点设为硬前置。
 *
 * 其余条件沿用旧口径：RP 锚点 ∧（深空探测科技 / 已有远征记录）。
 * 判定刻意全用本局即时字段（anchorDone / S.tech / S.expeditions*），不读 resDiscovered：
 * PT / 宠物是本局制，转生后若尚未重购饵料仓库，旧远征记录也不该把星图提前放行。
 * 不 import economy.hasTech，避免链层反向依赖经济模块（hasTech 等价于 !!S.tech[id]）。
 */
export function starChartUnlocked(S) {
  // v2.3.0：判定下沉到 core/unlocks.js 的 starChartOpen（章节门禁走 CHAPTER_GATES.starchart，
  //   不再有 `< 3` 的字面章号）。异兽/PT → RP → 第 4 章（v2.4.0 后移）→ 深空科技或已有远征，顺序不可换。
  return starChartOpen(S);
}

// v2.5 ①：深渊裂隙触发门控——首次裂隙出现（S._riftSeen）后解锁探采平台与深渊商店；
// v2.4 及以前旧档（S._v25Legacy，迁移时按 DM/RP 锚点进度自动打标）保持解锁不回退；
// v2.5 起新档购入载具/灵感工坊不再解锁（解锁前提唯一 = 触发深渊裂隙）。
export function riftShown(S) {
  // v2.3.0：判定下沉到 core/unlocks.js 的 riftSeen（顶栏/tab/购买权限三处同口径）。
  return riftSeen(S);
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
  const visible = items.filter((it, i) => it.alwaysShow || i < K || flags[i]); // 前 K 项 ∪ 全部已购项 ∪ alwaysShow 项
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
import { hasAnchor, riftSeen, starChartOpen } from '../core/unlocks.js';
import { buildOwnedSection } from './listkit.js';

// v4.3.31 反馈③：组标题徽章图形（绶带 + 星章，16 视窗，11px 渲染）。
//   纯内联 SVG：跟着文字用 currentColor（各主题自动换金/深金），不引外部图片、不产生请求。
export const BADGE_ICON = '<svg class="g-badge-ico" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">'
  + '<path d="M6.05 1.5 8 5.1 6.35 5.1 5 1.5Z" fill="currentColor" opacity=".7"/>'
  + '<path d="M9.95 1.5 8 5.1l1.65 0L11 1.5Z" fill="currentColor" opacity=".7"/>'
  + '<circle cx="8" cy="9.9" r="4.35" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".95"/>'
  + '<path d="M8 7.15l.86 1.74 1.92.28-1.39 1.36.33 1.91L8 11.54l-1.72.9.33-1.91-1.39-1.36 1.92-.28Z" fill="currentColor"/>'
  + '</svg>';
// v2.0.0：囤囤鼠认证的图形——一只塞满粮袋的陶罐（内联 SVG，currentColor，无外部资源）。
//   与馆藏认证的「绶带星章」区分：徽章图形不同，玩家一眼能分「认证种类」。
export const BADGE_ICON_HOARD = '<svg class="g-badge-ico" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" focusable="false">'
  + '<path d="M6.2 2h3.6l.5 1.6H5.7Z" fill="currentColor" opacity=".75"/>'
  + '<path d="M5.2 3.9h5.6c1.7 1 2.5 2.3 2.5 4.2 0 3-2.4 5.4-5.3 5.4S2.7 11.1 2.7 8.1c0-1.9.8-3.2 2.5-4.2Z" fill="none" stroke="currentColor" stroke-width="1.25" opacity=".95"/>'
  + '<path d="M5.4 8.1h5.2M5.7 10.1h4.6" stroke="currentColor" stroke-width="1.05" opacity=".8"/>'
  + '</svg>';
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
    // v4.3.23 反馈③：支持 badge 字段——组标题旁挂小徽章（如博物馆「馆藏认证」）。
    //   v4.3.25 反馈①：徽章改挂标题**右侧**（原实现插在标题文字之前）。
    //   createTextNode 兜底：纯 Node 单测环境（mock document 无 createTextNode）回落 textContent。
    const canBadge = g.badge && typeof document.createTextNode === 'function';
    if (canBadge) {
      const b = document.createElement('span');
      b.className = 'group-title-badge' + (g.badgeClass ? ` ${g.badgeClass}` : ''); // v2.0.0：按认证种类加配色类
      // v4.3.31 反馈③：徽章不只文字——左侧加一枚小徽章图形（纯内联 SVG，随文字色 currentColor，
      //   无外部资源、无额外请求）。图形对读屏隐藏（aria-hidden），语义仍由右侧文字承担。
      b.innerHTML = (g.badgeIcon || BADGE_ICON) + g.badge; // v2.0.0：组可指定徽章图形（馆藏=星章 / 囤囤鼠=粮罐）
      b.title = g.badgeTip || g.badge;
      h.appendChild(document.createTextNode(g.title));
      h.appendChild(b);
    } else {
      h.textContent = (g.badge ? `${g.badge} ` : '') + g.title;
    }
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
