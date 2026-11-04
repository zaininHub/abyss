// v1.3 模块 E：升级类列表「可购买 / 已升级折叠」分区通用件
// 规范（设计 §3）：
//   1. 可购买区置前，按成本升序；未解锁（???）项列区末
//   2. 已升级区默认收起，头部「已×× ×N」计数，点击展开
//   3. 一次性项购后 1s 内移入已升级区（按购入时间倒序）；可叠加项永留可购区更新 ×N
//   4. 折叠状态 localStorage（key: ui_collapsed_<列表id>）；事件委托 + 原地更新，不整列表重建

const keyOf = (listId) => `ui_collapsed_${listId}`;

export function isCollapsed(listId) {
  try { return (localStorage.getItem(keyOf(listId)) ?? '1') !== '0'; } catch { return true; }
}

export function setCollapsed(listId, collapsed) {
  try { localStorage.setItem(keyOf(listId), collapsed ? '1' : '0'); } catch { /* 隐私模式等场景忽略 */ }
}

// 「已×× ×N」折叠头 + 已升级容器。返回 { header, box, updateCount }
export function buildOwnedSection(listId, container, verb) {
  const header = document.createElement('div');
  header.className = 'owned-header';
  const box = document.createElement('div');
  box.className = 'owned-box shop-grid';
  const collapsed = isCollapsed(listId);
  header.innerHTML = `<span class="owned-arrow">${collapsed ? '▸' : '▾'}</span> 已${verb} <span class="owned-count mono">×0</span>`;
  header.title = `点击展开 / 收起已${verb}列表（折叠状态记忆保存）`;
  box.style.display = collapsed ? 'none' : '';
  container.appendChild(header);
  container.appendChild(box);
  // 折叠柄监听绑在头部自身（build 时创建一次， survives 列表原地更新）
  header.addEventListener('click', () => {
    const open = box.style.display === 'none';
    box.style.display = open ? '' : 'none';
    header.querySelector('.owned-arrow').textContent = open ? '▾' : '▸';
    setCollapsed(listId, !open);
  });
  return {
    header, box,
    updateCount(n) {
      const c = header.querySelector('.owned-count');
      if (c) c.textContent = '×' + n;
      header.style.display = n > 0 ? '' : 'none';
    },
  };
}

// 可购买区排序：已解锁在前按成本升序，未解锁（???/需前置）在后
export function partitionSort(items, costOf, unlockedOf) {
  const unlocked = [], locked = [];
  for (const u of items) (unlockedOf(u) ? unlocked : locked).push(u);
  const byCost = (a, b) => costOf(a) - costOf(b);
  unlocked.sort(byCost);
  locked.sort(byCost);
  return [...unlocked, ...locked];
}

// 记录一次性购入顺序（已升级区按此倒序展示）
export function pushBoughtOrder(S, id) {
  if (!Array.isArray(S.boughtOrder)) S.boughtOrder = [];
  const i = S.boughtOrder.indexOf(id);
  if (i >= 0) S.boughtOrder.splice(i, 1);
  S.boughtOrder.push(id);
}

export function boughtOrderIndex(S, id) {
  if (!Array.isArray(S.boughtOrder)) return -1;
  return S.boughtOrder.indexOf(id);
}

// 一次性项购后 1s 延迟移入已升级区（先给玩家 1s「已购入」反馈）
export function scheduleMoveToOwned(el, box, onMove) {
  el.classList.add('just-bought');
  setTimeout(() => {
    if (!el.isConnected) return; // 期间整列表被重建（如解锁数变化）则放弃移动
    el.classList.remove('just-bought', 'cant');
    el.classList.add('owned-item');
    box.prepend(el);
    if (onMove) onMove();
  }, 1000);
}

// 已升级区灰阶 + ✓ 的统一展示（模块 E 一致性规范）
// v3.4.9 反馈③：数量受限项（轮回圣殿 2 级、传奇职级殿 1 级…）的「当前/上限」统一写进
//   count 位（与设施可购卡同口径，如「Lv.1/2 满」），不再只有一枚 ✓——玩家一眼能看出还剩几级。
export function ownedItemHtml(name, desc, extra, countText) {
  return `<div class="name"><span>${name}</span><span class="count mono">${countText || '✓'}</span></div>
    <div class="desc">${desc || ''}</div>
    <div class="cost mono" style="color:var(--good)">${extra || '已完成'}</div>`;
}
