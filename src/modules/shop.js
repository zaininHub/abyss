// v1.3 模块 E：全列表「可购买置前（成本升序，??? 最后）+ 已升级折叠」分区规范
// 交互约束：容器级事件委托 + 购后原地更新（×N/成本/灰态），严禁整列表 DOM 重建
import { S, save } from '../state.js';
import { UPGRADES } from '../data/upgrades.js';
import { OFF_UPGRADES } from '../data/offlineUpgrades.js';
import { CROSSROAD_BUILDINGS, buildingCost, buildingLevel, buildingMaxed, V21_BUILDINGS, v21Level, v21Maxed, unlockRpV21, unlockMilestoneV21, capOf, crossroadById, crossroadOwned } from '../data/buildings.js';
import { getBuildings, getTechs } from '../core/provider.js';
import { computeCps, costMult, globalMult, fmt, unitCost, bulkCostCalc, vehicleDmPerMin, CAP_EXPANSION_IDS, hasTech, v21BuildingCost } from './economy.js';
import { BALANCE } from '../data/balance.js';
import { buildOwnedSection, pushBoughtOrder, scheduleMoveToOwned, ownedItemHtml, boughtOrderIndex } from './listkit.js';
import { chainSplit, renderChainedGroups, anchorShown, riftShown, CHAIN_PREVIEW } from './disclosure.js'; // v2.5 ①：裂隙门控（riftShown）接管探采平台/深渊商店
import { dirty } from '../main.js'; // v2.0 修复：buyDmUpgrade 后置 dirty.shop 重渲染
// v2.3.2 反馈②：命名彩蛋移除后 checkEasterEggs 在本模块零调用，import 一并清理
import { loadStoryline, lockStorylineSwitch } from '../core/storylineManager.js';
import { getStorylinePackage } from '../core/storylineManager.js';

// v2.3.1 ⑥（rev18 9.4）：倍率交互整节移除——bulkN / setBulk / getBulk 删除，
// 所有购买固定按 ×1 执行；bulkCostCalc 签名保留，n 固定传 1（最小化改动）。
let shopContainer = null;
let threadContainer = null;
let vehicleContainer = null;
let dmContainer = null;
let shopItemEls = new Map();   // id -> el（主商店，含未解锁 ??? 卡）
let threadItemEls = new Map();
let vehicleItemEls = new Map();
let dmItemEls = new Map();     // id -> el（深渊商店未购项）
let dmSection = null;          // { box, updateCount }
let toastFn = null; // v2.1 R4：由 main.js 注入 toast，灰态点击时提示

const VEHICLE_IDS = BALANCE.vehicles.ids;
const DM_SKIP = ['dmsight', 'dmfeed', 'dmmind', 'dmprotocol'];
const THREAD_IDS = ['subsist1', 'subsist2', 'subsist3', 'cpu', 'mem', 'gpu', 'cache'];

export function setToastFn(fn) { toastFn = fn; }
function shopToast(msg) { if (toastFn) toastFn(msg); }

// ========== 核心购买（口径不变；v2.3.1 ⑥ 固定 ×1） ==========
export function buyUpgrade(u) {
  const owned = S.upgrades[u.id] || 0;
  // v2.0.2：级制封顶——满级后购买入口锁定
  const maxLv = u.maxLevel || Infinity;
  if (owned >= maxLv) return false;
  const n = 1; // v2.3.1 ⑥：倍率移除，固定单件购买
  const cost = bulkCostCalc(u, n);
  if (S.ep < cost) return false;
  S.ep -= cost;
  S.upgrades[u.id] = owned + n;
  S.totalBuys += n;
  S.lazySince = null; // v2.7.1：任意升级/购买解除线程懒惰
  return true;
}

// v2.0.2 复验 P0 修复：线程区成本统一走 threadCost——扩容项（cache）经 unitCost
// 挂 30% 防死锁钳制（显示与实扣同口径，杜绝显示误导/实扣穿透），其余项维持裸公式
function threadCost(u) {
  if (CAP_EXPANSION_IDS.includes(u.id)) return unitCost(u, 0);
  const owned = S.upgrades[u.id] || 0;
  return Math.ceil(u.base * Math.pow(1.30, owned) * costMult()); // v2.8.2：成本曲线 1.15→1.30 陡峭化
}

export function buyThreadUpgrade(u) {
  const owned = S.upgrades[u.id] || 0;
  const maxLv = u.maxLevel || Infinity;
  if (owned >= maxLv) return false; // v2.0.2 maxLevel：cache 20 级封顶，满级不可购
  const cost = threadCost(u);
  if (S.ep < cost) return false;
  S.ep -= cost;
  S.upgrades[u.id] = owned + 1;
  S.totalBuys++;
  S.lazySince = null; // v2.7.1：线程购买解除懒惰
  return true;
}

export function buyVehicle(u) {
  const owned = S.upgrades[u.id] || 0;
  const cost = Math.ceil(u.base * Math.pow(1.30, owned) * costMult()); // v2.8.2
  if (S.ep < cost) return false;
  S.ep -= cost;
  S.upgrades[u.id] = owned + 1;
  S.totalBuys++;
  return true;
}

export function buyDmUpgrade(u) {
  if ((S.dm || 0) < u.dmCost) return false;
  S.dm -= u.dmCost;
  S.upgrades[u.id] = 1;
  dirty.shop = true; // v2.0 修复：购买后重渲染商店
  return true;
}

export function buyOfflineUpgrade(o) {
  // v2.7.5 ⑥：离线升级改为 EP + RP 双消耗（EP 门槛随级提高，RP 主消耗不变）
  const epCost = o.epCost || 0;
  if (S.ep < epCost) return false;
  if (S.rp < o.cost) return false;
  if (o.req && !S.offUpgrades[o.req]) return false;
  S.ep -= epCost;
  S.rp -= o.cost;
  S.offUpgrades[o.id] = true;
  save(S); // v2.7.5 ⑥：购买即落盘（与主商店 v2.7.1 同口径，消除 5s 节流保存窗口）
  return true;
}

// ========== v1.3 E：容器级事件委托（绑定一次，全列表共用） ==========
function bindDelegate(container, onBuy) {
  if (!container || container.dataset.v13Delegated) return;
  container.dataset.v13Delegated = '1';
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-buy]');
    if (!el || !container.contains(el)) return;
    onBuy(el.dataset.buy, el);
  });
}

// ========== 渲染：主商店（可叠加项：永留可购区，成本升序 + ??? 最后） ==========
function shopUnlocked(u) {
  const owned = S.upgrades[u.id] || 0;
  return owned > 0 || S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3;
}

export function renderShop(container) {
  shopContainer = container;
  container.innerHTML = '';
  shopItemEls.clear();
  // v2.8.2 反馈④：RP 相关升级（组 F 加成 + 灵感蒸馏塔）移入研究点 tab，主商店不再渲染
  const RP_FAMILY_IDS = ['exp_bench', 'rp_distiller', 'deep_lab', 'theory_desk', 'legend_institute', 'rp_distill'];
  const items = UPGRADES.filter(u => !VEHICLE_IDS.includes(u.id) && !DM_SKIP.includes(u.id) && !THREAD_IDS.includes(u.id) && !RP_FAMILY_IDS.includes(u.id)
    && (u.cat !== 'purifier' || hasTech('entropy_reduce')));
  // v2.3.1 缺陷⑦修复：链序改定义序（与 eternal v2.3 修复同口径）。
  // 原 v1.3 E「已解锁按成本升序」在 v2.3 渐进披露链下失效：已购项成本上浮后
  // 与未购项按成本交错，chainSplit 的已购前缀 p 判定失真 → 链提示挂错对象
  // （用户截图场景：「存储节点」显示链提示而其链前一项「并行任务」排在其后，
  // 定义序实为 parallel→storage）。链序必须稳定，定义序即链序；??? 项随链位
  // 置出现（链是线性的，??? 即链上尚未抵达的位置）。
  // v2.8.1：主商店按解锁门槛排序——解锁门槛 = 累计 EP ≥ base×0.3（shopUnlocked），base 升序即先解锁先显示；
  // 门槛是静态值（不随已购成本上浮变化），规避 v2.3.1「已购成本上浮后与未购项交错」问题，链窗口判定不受影响
  const sorted = items.slice().sort((a, b) => (a.base || Infinity) - (b.base || Infinity));
  // v2.3 渐进披露链：链序 = 定义序；窗口内渲染（K = p + 1），已购永不隐藏，链内下一项挂链提示
  const split = chainSplit('shop', sorted, u => (S.upgrades[u.id] || 0) > 0, S);
  // v2.6.7：记录链窗口状态（供 refreshShopChain 增量揭示，避免整面板重建）
  shopContainer._chain = {
    ids: new Set(split.visible.map(u => u.id)),
    split,
    groups: [{ title: '基础产出', test: u => u.cps > 0 && !u.produces && !u.cat }, { title: '存储与资源建筑', test: () => true }],
  };
  // v2.3.1 ⑤（rev18 9.3 分组表）：基础产出在前、存储与资源建筑在后；分组纯显示不拆链
  renderChainedGroups(container, split, [
    { title: '基础产出', test: u => u.cps > 0 && !u.produces && !u.cat },
    { title: '存储与资源建筑', test: () => true }, // 兜底组：存储节点/资源建筑/净化节点族
  ], makeShopItem, (u, el) => shopItemEls.set(u.id, el));

  bindDelegate(container, (id, el) => {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return;
    const wasOwned = (S.upgrades[u.id] || 0) > 0; // v2.3：首次购入改变已购前缀 p → 链窗口/链提示结构性刷新
    if (buyUpgrade(u)) {
      updateShopItem(u); // v1.3 E：购后原地更新（×N / 成本 / 灰态），不重建列表
      if (!wasOwned) refreshShopChain(); // v2.6.7：p 推进 → 增量揭示后续链卡（原整面板重入 → hover 闪烁根因）
      save(S); // v2.7.1：购买即持久化，消除 5s 节流保存窗口（点击后立即刷新不再丢购买）
    } else {
      /* v2.8.2 反馈⑪：EP 不足不弹框（卡片已暗色 cant 提示） */
    }
  });
}
// v2.8.2 反馈④：研究点 tab 渲染 RP 加成组（组 F + 灵感蒸馏塔），按解锁门槛（base 升序）排
// v2.8.7 修复：数据源改 BALANCE.thread.upgrades（原 UPGRADES 数组不含 cat F——列表一直为空）；
// 成本改 RP 购买（第 22 项：不做「RP 解锁后 EP 购买」）
const RP_FAMILY_SRC_IDS = ['exp_bench', 'rp_distiller', 'deep_lab', 'theory_desk', 'legend_institute', 'rp_distill'];
function rpFamilyCost(u) {
  const owned = (S.upgrades[u.id] || 0);
  return Math.ceil((u.rpCost || 8) * Math.pow(u.growth || 1.18, owned));
}
function makeRpFamilyItem(u) {
  const owned = (S.upgrades[u.id] || 0);
  const cost = rpFamilyCost(u);
  const afford = S.rp >= cost;
  const div = document.createElement('div');
  div.dataset.buy = u.id;
  div.className = 'item' + (!afford ? ' cant' : '');
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">${u.unlimited ? `×${owned}` : `Lv.${owned}/${u.cap}`}</span></div>
    <div class="desc">${u.desc}</div>
    <div class="cost mono">${fmt(cost)} RP</div>`;
  return div;
}
function updateRpFamilyItem(u) {
  const el = rpFamilyItemEls.get(u.id);
  if (!el) return;
  const owned = (S.upgrades[u.id] || 0);
  const cost = rpFamilyCost(u);
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = u.unlimited ? `×${owned}` : `Lv.${owned}/${u.cap}`;
  const c = el.querySelector('.cost');
  if (c) c.textContent = `${fmt(cost)} RP`;
  el.classList.toggle('cant', S.rp < cost);
}
export function renderRpFamily(container) {
  if (!container) return;
  rpFamilyContainer = container;
  const RP_IDS = RP_FAMILY_SRC_IDS;
  const rpItems = (BALANCE.thread.upgrades || []).filter(u => RP_IDS.includes(u.id))
    .slice().sort((a, b) => (a.base || Infinity) - (b.base || Infinity));
  const split = chainSplit('rp', rpItems, u => (S.upgrades[u.id] || 0) > 0, S);
  const list = split.visible;
  container.innerHTML = '';
  rpFamilyItemEls.clear();
  const frag = document.createDocumentFragment();
  for (const u of list) {
    const el = makeRpFamilyItem(u);
    rpFamilyItemEls.set(u.id, el);
    frag.appendChild(el);
  }
  container.appendChild(frag);
  bindDelegate(container, (id, el) => {
    const u = (BALANCE.thread.upgrades || []).find(x => x.id === id);
    if (!u || !rpFamilyItemEls.has(id)) return;
    const wasOwned = (S.upgrades[u.id] || 0) > 0;
    const cost = rpFamilyCost(u);
    if (S.rp < cost) return;
    S.rp -= cost;
    S.upgrades[u.id] = (S.upgrades[u.id] || 0) + 1;
    if (!wasOwned) renderRpFamily(container);
    else updateRpFamilyItem(u);
    save(S);
  });
}
let rpFamilyContainer = null;
let rpFamilyItemEls = new Map();

// v2.6.7：商店链窗口增量揭示——解锁数/已购前缀变化时只插入新可见卡，不整面板重建
// （消除「allTimeEp 每秒跨阈值 → 每秒整重建 → hover 闪烁 + 点击竞争」根因）
export function refreshShopChain() {
  // v2.8.9：增量插入位置与全量渲染不一致（新解锁卡出现于左侧、切 tab 才归位）——
  // 直接全量重渲染（顺序与切 tab 完全一致；购买瞬间一次性重建无 hover 闪烁）
  if (!shopContainer) return;
  renderShop(shopContainer);
}

// v2.0.2：级制项（如存储节点）满级判定与展示辅助
function maxedLevel(u) {
  return u.maxLevel && (S.upgrades[u.id] || 0) >= u.maxLevel;
}
function levelCountHtml(u) {
  const owned = S.upgrades[u.id] || 0;
  return u.maxLevel ? `Lv.${owned}/${u.maxLevel}` : `×${owned}`;
}

function makeShopItem(u) {
  const owned = S.upgrades[u.id] || 0;
  const unlocked = shopUnlocked(u);
  const div = document.createElement('div');
  div.dataset.buy = u.id;
  if (!unlocked) {
    div.className = 'item locked';
    div.innerHTML = `<div class="name"><span>???</span></div><div class="desc">累计 ${fmt(u.base * 0.3)} EP 解锁</div><div class="cost">—</div>`;
    return div;
  }
  // v2.0.2：满级锁定——购买入口移除、卡片转满级态（不再参与可购排序灰态刷新）
  if (maxedLevel(u)) {
    delete div.dataset.buy;
    div.className = 'item owned-item';
    div.title = '已满级：建筑数量受控，成长靠等级';
    div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">Lv.${Math.min(owned, u.maxLevel)}/${u.maxLevel} 满</span></div>
      <div class="desc">${u.desc}</div>
      <div class="cost mono">已满级</div>`;
    return div;
  }
  const cost = bulkCostCalc(u, 1); // v2.3.1 ⑥：固定 ×1
  const afford = S.ep >= cost;
  div.className = 'item' + (!afford ? ' cant' : '');
  const cpsStr = u.cps > 0 ? `${fmt(u.cps * globalMult())} EP/s` : (u.desc || '');
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">${levelCountHtml(u)}</span></div>
    <div class="desc">${cpsStr}</div>
    <div class="cost mono">${fmt(cost)}</div>`;
  return div;
}

// 购后原地更新单卡片（E 规范：可叠加项仅更新 ×N 计数与成本，不移动不重建）
export function refreshShopItem(u) { updateShopItem(u); } // v2.6.6 ③：AI/混沌买入后单卡原地刷新（不整面板重建）

function updateShopItem(u) {
  const el = shopItemEls.get(u.id);
  if (!el) return;
  const owned = S.upgrades[u.id] || 0;
  // v2.0.2：购后到达满级——原地转满级锁定态
  if (u.maxLevel && owned >= u.maxLevel) {
    delete el.dataset.buy;
    el.className = 'item owned-item';
    el.title = '已满级：建筑数量受控，成长靠等级';
    el.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">Lv.${Math.min(owned, u.maxLevel)}/${u.maxLevel} 满</span></div>
      <div class="desc">${u.desc}</div>
      <div class="cost mono">已满级</div>`;
    return;
  }
  const cost = bulkCostCalc(u, 1); // v2.3.1 ⑥：固定 ×1
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = levelCountHtml(u);
  const c = el.querySelector('.cost');
  if (c) c.textContent = fmt(cost);
  const d = el.querySelector('.desc');
  if (d) d.textContent = `${u.cps > 0 ? fmt(u.cps * globalMult()) + ' EP/s' : (u.desc || '')}`;
  el.classList.toggle('cant', S.ep < cost);
}

// ========== 渲染：线程强化（可叠加，成本升序） ==========
export function renderThreadShop(container) {
  threadContainer = container;
  container.innerHTML = '';
  threadItemEls.clear();
  const threadMods = UPGRADES.filter(u => THREAD_IDS.includes(u.id));
  // v2.3.1 缺陷⑦修复：链序改定义序（原成本升序在成本上浮后漂移，同 renderShop 口径）
  const sorted = threadMods;
  // v2.3 渐进披露链：同升级商店口径（定义序即链序）
  const split = chainSplit('thread', sorted, u => (S.upgrades[u.id] || 0) > 0, S);
  // v2.3.1 ⑤（rev18 9.3 分组表）：消耗优化在前（链首能量合剂在此组）、产出强化在后
  const COST_IDS = ['subsist1', 'subsist2', 'subsist3', 'mem', 'cache']; // 能量合剂/循环供氧/生物打印餐/内存扩容/缓存优化
  // v2.7.2：subsist1/2/3/mem 一次性（maxLevel:1，效果按拥有判定，多购无效已封顶）；cache 无限（存储上限 +5000/级）消耗 -25% 一次性
  renderChainedGroups(container, split, [
    { title: '消耗优化', test: u => COST_IDS.includes(u.id) },
    { title: '产出强化', test: () => true }, // CPU 超频 / GPU 加速
  ], makeThreadItem, (u, el) => threadItemEls.set(u.id, el));
  bindDelegate(container, (id) => {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return;
    const wasOwned = (S.upgrades[u.id] || 0) > 0; // v2.3：首次购入推进已购前缀 → 链窗口刷新
    if (buyThreadUpgrade(u)) {
      updateThreadItem(u);
      if (!wasOwned) dirty.shop = true;
      save(S); // v2.7.1：购买即持久化（同上）
    }
    /* v2.8.2 反馈⑪：EP 不足不弹框 */
  });
}

function makeThreadItem(u) {
  const owned = S.upgrades[u.id] || 0;
  const unlocked = shopUnlocked(u);
  const div = document.createElement('div');
  div.dataset.buy = u.id;
  if (!unlocked) {
    div.className = 'item locked';
    div.innerHTML = `<div class="name"><span>???</span></div><div class="desc">累计 ${fmt(u.base * 0.3)} EP 解锁</div><div class="cost">—</div>`;
    return div;
  }
  // v2.0.2 maxLevel：满级锁定——购买入口移除、卡片转满级态（对齐 storage 口径）
  if (maxedLevel(u)) {
    delete div.dataset.buy;
    div.className = 'item owned-item';
    div.title = '已满级：建筑数量受控，成长靠等级';
    div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">Lv.${Math.min(owned, u.maxLevel)}/${u.maxLevel} 满</span></div>
      <div class="desc">${u.desc}</div>
      <div class="cost mono">已满级</div>`;
    return div;
  }
  const cost = threadCost(u);
  const afford = S.ep >= cost;
  div.className = 'item' + (!afford ? ' cant' : '');
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count">×${owned}</span></div>
    <div class="desc">${u.desc}</div>
    <div class="cost mono">${fmt(cost)}</div>`;
  return div;
}

function updateThreadItem(u) {
  const el = threadItemEls.get(u.id);
  if (!el) return;
  const owned = S.upgrades[u.id] || 0;
  // v2.0.2 maxLevel：购后到达满级——原地转满级锁定态
  if (u.maxLevel && owned >= u.maxLevel) {
    delete el.dataset.buy;
    el.className = 'item owned-item';
    el.title = '已满级：建筑数量受控，成长靠等级';
    el.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">Lv.${Math.min(owned, u.maxLevel)}/${u.maxLevel} 满</span></div>
      <div class="desc">${u.desc}</div>
      <div class="cost mono">已满级</div>`;
    return;
  }
  const cost = threadCost(u);
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = '×' + owned;
  const c = el.querySelector('.cost');
  if (c) c.textContent = fmt(cost);
  el.classList.toggle('cant', S.ep < cost);
}

// ========== 渲染：探采平台（可叠加 + v1.3 D 采集页头） ==========
// v2.0.2：DM 展示修复——页头追加当前持有（当前 DM: X · 采集 +Y/min）
// v2.4：确定性产出——页头速率即实际到账速率（不再掷骰，删除「（期望）」标注）
function updateVehicleCollectHeader() {
  const el = document.getElementById('vehicle-collect');
  if (!el) return;
  const rate = vehicleDmPerMin();
  if (rate > 0) {
    el.textContent = `当前 DM: ${(S.dm || 0).toFixed(2)} · 采集 +${Math.round(rate * 100) / 100}/min`;
    el.title = '载具按速率稳定产出深渊物质（每 60 秒确定性到账）：每辆摩托队/车队/轨道器/潜航器 0.05/0.1/0.25/0.5 DM/min；深渊蓄能池/凝析塔等建筑可提升采集效率';
  } else {
    el.textContent = `当前 DM: ${(S.dm || 0).toFixed(2)}`; // v2.4.2：DM 精确到小数
    el.title = '购买载具后每 60 秒自动采集深渊物质';
  }
}

export function renderVehicles(container) {
  vehicleContainer = container;
  // v2.5 ①：探采平台 ← 深渊裂隙触发门控（首次裂隙出现解锁；旧档按 DM/RP 锚点兼容，不回退）
  const vehShown = riftShown(S);
  const vehTitle = document.getElementById('vehicle-title');
  if (vehTitle) vehTitle.style.display = vehShown ? '' : 'none';
  const vcEl = document.getElementById('vehicle-collect');
  if (vcEl) vcEl.style.display = vehShown ? '' : 'none';
  if (!vehShown) { container.innerHTML = ''; vehicleItemEls.clear(); return; }
  container.innerHTML = '';
  vehicleItemEls.clear();
  const vehicles = UPGRADES.filter(u => VEHICLE_IDS.includes(u.id));
  // v2.3.1 缺陷⑦修复：链序改定义序（原 1.15^n 成本上浮使已购载具漂移，同 renderShop 口径）
  const sorted = vehicles;
  // v2.3 渐进披露链：探采平台原本无任何锁定态——未购且在窗口内的条目以 ??? 占位
  // （其余用预览文案），未购且在窗口外不渲染。
  // v2.3.1 B3 修复（rev18 9.1 / R18-B3，回传明示裁定项）：链内下一项的未购载具
  // 必须渲染为真实可购卡——原实现把窗口内全部未购载具渲染为 ??? 占位卡（无
  // data-buy），链首外勤摩托队永不可购 → DM 锚点死锁（v2.3.0 即存在的既有缺陷）。
  // 修复取「与用户诉求最贴近、不引入死锁」方向：仅链内下一项解锁为可购卡，其余
  // 未购项仍 ??? 占位；链语义（K=p+1）不变。
  const split = chainSplit('vehicles', sorted, u => (S.upgrades[u.id] || 0) > 0, S);
  split.visible.forEach((u, i) => {
    const owned = (S.upgrades[u.id] || 0) > 0;
    // B3 修复补充：可购判据 = 链内下一项（index === chainNextIdx，含链首 p=0）——
    // 链首必须可购否则链永不推进（v2.3.2 §5.2 链提示废除，本判据保留不动）。
    const isNext = i === split.chainNextIdx;
    const el = (owned || isNext) ? makeVehicleItem(u) : makeVehicleLockedCard(u);
    // v2.7.3：链内下一项未购可购卡也入 vehicleItemEls——否则 refreshShopAffordability
    // 灰态刷新覆盖不到它（EP 花掉后仍显示可点 → 点击才报 EP 不足）
    if (owned || isNext) vehicleItemEls.set(u.id, el);
    container.appendChild(el);
  });
  // v2.3.1 ⑤：探采平台单组不拆分，「展开更多」交互移除（K = p + 1 窗口足够）
  bindDelegate(container, (id) => {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return;
    const wasOwned = (S.upgrades[u.id] || 0) > 0; // v2.3：首次购入推进已购前缀 → 链窗口刷新
    if (buyVehicle(u)) {
      updateVehicleItem(u); updateVehicleCollectHeader();
      if (!wasOwned) dirty.shop = true;
    }
    else shopToast(`EP 不足：${u.name} 需要 ${fmt(Math.ceil(u.base * Math.pow(1.15, S.upgrades[u.id] || 0) * costMult()))} EP`);
  });
  updateVehicleCollectHeader();
}

// v2.3：探采占位卡——窗口内非链内下一项的未购载具（复用 .item.locked 样式）；
// v2.3.1 B3：仅链内下一项可购；v2.3.2 §5.2：锁定感由本 ??? 卡承担（无购买入口）
function makeVehicleLockedCard(u) {
  const div = document.createElement('div');
  div.className = 'item locked';
  div.innerHTML = `<div class="name"><span>???</span></div>
    <div class="desc">${CHAIN_PREVIEW}</div>
    <div class="cost">—</div>`;
  return div;
}

function makeVehicleItem(u) {
  const owned = S.upgrades[u.id] || 0;
  const cost = Math.ceil(u.base * Math.pow(1.30, owned) * costMult()); // v2.8.2
  const afford = S.ep >= cost;
  const div = document.createElement('div');
  div.dataset.buy = u.id;
  div.className = 'item' + (!afford ? ' cant' : '');
  // v1.3 D：载具协议加成实时体现在描述里
  const protoMult = S.upgrades.dmprotocol ? BALANCE.vehicles.protocolMult : 1;
  const cpsEach = u.cps * globalMult() * protoMult;
  // v2.3.2 反馈②：载具命名彩蛋输入框按缺陷口径移除（用户反馈「外勤摩托队旁异常输入框」），
  // 命名 input / change 事件 / name_vehicle 彩蛋触发零残留；外勤区域不再渲染任何 input 元素。
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count">×${owned}</span></div>
    <div class="desc">${fmt(cpsEach)} EP/s${protoMult > 1 ? '（协议×1.5）' : ''}</div>
    <div class="cost mono">${fmt(cost)}</div>`;
  return div;
}

function updateVehicleItem(u) {
  const el = vehicleItemEls.get(u.id);
  if (!el) return;
  const owned = S.upgrades[u.id] || 0;
  const cost = Math.ceil(u.base * Math.pow(1.30, owned) * costMult()); // v2.8.2
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = '×' + owned;
  const c = el.querySelector('.cost');
  if (c) c.textContent = fmt(cost);
  el.classList.toggle('cant', S.ep < cost);
}

// ========== 渲染：深渊商店（一次性项：E 分区 + 购后 1s 移入折叠区） ==========
function dmOwnedCount() {
  return UPGRADES.filter(u => u.cat === 'dm' && S.upgrades[u.id]).length;
}

// v2.4.2：深渊商店不再显示当前 DM 余额（顶栏 h-dm 已常显；#dm-balance 展示移除）
export function renderDmShop(container) {
  dmContainer = container;
  // v2.5 ①：深渊商店分区 = 深渊裂隙触发门控（首次裂隙出现解锁；旧档按 DM/RP 锚点兼容，不回退）
  const dmTitle = document.getElementById('dm-shop-title');
  const dmShown = riftShown(S);
  if (dmTitle) dmTitle.style.display = dmShown ? '' : 'none';
  if (!dmShown) { container.innerHTML = ''; return; }
  container.innerHTML = '';
  dmItemEls.clear();
  dmSection = buildOwnedSection('dm-shop', container, '解锁');
  const dmMods = UPGRADES.filter(u => u.cat === 'dm');
  // v2.3 渐进披露链：链序 = DM 价升序（原 avail 排序口径）；窗口内未购渲染，已购整表走折叠区永不隐藏
  const chainList = [...dmMods].sort((a, b) => a.dmCost - b.dmCost);
  const split = chainSplit('dm', chainList, u => !!S.upgrades[u.id], S);
  const owned = chainList.filter(u => S.upgrades[u.id]);
  // 已解锁区：按购入时间倒序（E 规范 3）
  owned.sort((a, b) => boughtOrderIndex(S, b.id) - boughtOrderIndex(S, a.id));
  for (const u of owned) {
    const div = document.createElement('div');
    div.className = 'item owned-item';
    div.innerHTML = ownedItemHtml(u.name, u.desc, '已解锁');
    dmSection.box.appendChild(div);
  }
  dmSection.updateCount(owned.length);
  // 可购区：沿链序（=可见集顺序）遍历，已购项跳过（它们只出现在折叠区）
  split.visible.forEach((u, i) => {
    if (S.upgrades[u.id]) return;
    const afford = (S.dm || 0) >= u.dmCost;
    const div = document.createElement('div');
    div.dataset.buy = u.id;
    div.className = 'item' + (!afford ? ' cant' : '');
    div.innerHTML = `<div class="name"><span>${u.name}</span></div><div class="desc">${u.desc}</div>
      <div class="cost mono" style="color:var(--purple)">${u.dmCost} DM</div>`;
    dmItemEls.set(u.id, div);
    container.appendChild(div);
  });
  // v2.3.1 ⑤：深渊商店单组不拆分，「展开更多」交互移除
  bindDelegate(container, (id, el) => {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return;
    if (buyDmUpgrade(u)) {
      pushBoughtOrder(S, u.id);
      // 立即置为「已解锁」视觉，1s 后移入折叠区（E 规范 3）
      delete el.dataset.buy;
      el.className = 'item just-bought';
      el.innerHTML = ownedItemHtml(u.name, u.desc, '已解锁');
      scheduleMoveToOwned(el, dmSection.box, () => dmSection.updateCount(dmOwnedCount()));
      save(S);
    } else {
      shopToast(`深渊物质不足：${u.name} 需要 ${u.dmCost} DM`);
    }
  });
}

// ========== 渲染：离线升级（一次性项：E 分区；v1.3 修复——补上购买入口） ==========
let offSection = null;
let offChainSplit = null; // v2.3：离线链窗口缓存（购后判定是否需要结构性重入）

export function renderOfflineUpgrades(container) {
  if (!container) return;
  container.innerHTML = '';
  offSection = buildOwnedSection('off-upg', container, '解锁');
  const owned = OFF_UPGRADES.filter(o => S.offUpgrades[o.id]);
  // v2.3 渐进披露链：链序 = 定义序（与既有 req 链同构）；仅首屏窗口（first 3 ≥ n-1，
  // hiddenCount 恒 ≤1），不提供展开按钮；既有 req 置灰语义原样保留
  const split = chainSplit('offline', OFF_UPGRADES, o => !!S.offUpgrades[o.id], S);
  offChainSplit = split;
  const avail = split.visible.filter(o => !S.offUpgrades[o.id]).filter(o => !o.req || S.offUpgrades[o.req]);
  const locked = split.visible.filter(o => !S.offUpgrades[o.id] && o.req && !S.offUpgrades[o.req]);
  owned.sort((a, b) => boughtOrderIndex(S, b.id) - boughtOrderIndex(S, a.id));
  for (const o of owned) {
    const div = document.createElement('div');
    div.className = 'off-upg owned-item';
    div.innerHTML = `<span>${o.name} ✓</span><span style="color:var(--good)">已解锁</span>`;
    offSection.box.appendChild(div);
  }
  offSection.updateCount(owned.length);
  const renderAvail = (o, reqOk) => `<div class="off-upg" data-buy="${o.id}" style="${reqOk ? 'cursor:pointer' : 'opacity:.5;cursor:not-allowed'}">
    <span>${o.name}<br><span style="color:var(--text-3)">${o.desc}${!reqOk ? '（需先解锁前置）' : ''}</span></span>
    <span class="cost">${o.cost} RP + ${fmt(o.epCost || 0)} EP</span></div>`;
  for (const o of avail) container.insertAdjacentHTML('beforeend', renderAvail(o, true));
  for (const o of locked) container.insertAdjacentHTML('beforeend', renderAvail(o, false));
  // v1.3 修复：离线升级此前没有任何购买监听（不可购买的死 UI），补容器级委托
  bindDelegate(container, (id, el) => {
    const o = OFF_UPGRADES.find(x => x.id === id);
    if (!o) return;
    if (buyOfflineUpgrade(o)) {
      pushBoughtOrder(S, o.id);
      // v2.3：链头推进（购入的是链内下一项）→ 窗口可能前移，整列表重入；
      // 非链头购入保持 v1.3 原地更新路径（1s 折叠区动画不破坏）
      const wasChainNext = offChainSplit && OFF_UPGRADES.indexOf(o) === offChainSplit.chainNextIdx;
      if (wasChainNext) { renderOfflineUpgrades(container); return; }
      delete el.dataset.buy;
      el.classList.add('just-bought');
      el.innerHTML = `<span>${o.name} ✓</span><span style="color:var(--good)">已解锁</span>`;
      scheduleMoveToOwned(el, offSection.box, () => offSection.updateCount(OFF_UPGRADES.filter(x => S.offUpgrades[x.id]).length));
    }
  });
}

// ========== 渲染：设施（v1.3 模块 B：一次性多级功能建筑，套 E 分区规范） ==========
let bldContainer = null;
let bldItemEls = new Map();  // id -> el（未满级建筑）
let bldSection = null;

export function buyBuilding(b) {
  const lv = (S.buildings?.[b.id]) || 0;
  if (lv >= b.levels) return false;
  const cost = buildingCost(b, S, costMult());
  if (S.ep < cost) return false;
  S.ep -= cost;
  S.buildings[b.id] = lv + 1;
  return true;
}

export function renderBuildings(container) {
  if (!container) return;
  bldContainer = container;
  // v2.3.1 ②（rev18 9.2）：设施分区门控——组长裁定 7698654240398511409：
  // anyBuilt ∨ milesDone[1e4]。1e4 与 tech.js ai_core 出现同拍（死锁同样消除）；
  // 设施四栋无里程碑门控（解锁即 EP 可购），「首栋解锁」语义贴 rev18 字面；
  // milesDone 单向持久标记，不随 EP 波动回隐藏。
  const anyBuilt = getBuildings().some(b => buildingLevel(b, S) >= 1);
  const bldShown = anyBuilt || !!(S.milesDone && S.milesDone[1e4]);
  const bldTitle = document.getElementById('bld-title');
  if (bldTitle) bldTitle.style.display = bldShown ? '' : 'none';
  if (!bldShown) { container.innerHTML = ''; return; }
  container.innerHTML = '';
  bldItemEls.clear();
  bldSection = buildOwnedSection('bld-list', container, '建成');
  const buildings = getBuildings();
  const owned = buildings.filter(b => buildingMaxed(b, S));
  const avail = buildings.filter(b => !buildingMaxed(b, S));
  owned.sort((a, b) => boughtOrderIndex(S, b.id) - boughtOrderIndex(S, a.id));
  for (const b of owned) {
    const div = document.createElement('div');
    div.className = 'item owned-item';
    div.innerHTML = ownedItemHtml(b.name, b.desc[b.levels - 1], `${b.levels}/${b.levels} 满`);
    bldSection.box.appendChild(div);
  }
  bldSection.updateCount(owned.length);
  // 可购区按当前级成本升序
  const sorted = [...avail].sort((a, b) => buildingCost(a, S, costMult()) - buildingCost(b, S, costMult()));
  for (const b of sorted) {
    const el = makeBldItem(b);
    bldItemEls.set(b.id, el);
    container.appendChild(el);
  }
  bindDelegate(container, (id, el) => {
    const b = getBuildings().find(x => x.id === id);
    if (!b) return;
    if (buyBuilding(b)) {
      pushBoughtOrder(S, b.id);
      const lv = buildingLevel(b, S);
      save(S);
      if (buildingMaxed(b, S)) {
        // 满级：1s 后移入「已建成」折叠区
        delete el.dataset.buy;
        el.className = 'item just-bought';
        el.innerHTML = ownedItemHtml(b.name, b.desc[b.levels - 1], `${b.levels}/${b.levels} 满`);
        scheduleMoveToOwned(el, bldSection.box, () => bldSection.updateCount(getBuildings().filter(x => buildingMaxed(x, S)).length));
      } else {
        // 未满级：留在可购区原地更新等级/效果/成本
        updateBldItem(b);
      }
    } else {
      const lv = buildingLevel(b, S);
      /* v2.8.2 反馈⑪：EP 不足不弹框 */
    }
  });
}

function makeBldItem(b) {
  const lv = buildingLevel(b, S);
  const cost = buildingCost(b, S, costMult());
  const afford = S.ep >= cost;
  const div = document.createElement('div');
  div.dataset.buy = b.id;
  div.className = 'item bld' + (!afford ? ' cant' : '');
  div.title = `一次性多级建筑（${b.levels} 级）：效果经线程状态机生效，不直接加 CPS`;
  div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono">Lv.${lv}/${b.levels}</span></div>
    <div class="desc">${b.desc[lv]}</div>
    <div class="cost mono">${fmt(cost)} EP</div>`;
  return div;
}

function updateBldItem(b) {
  const el = bldItemEls.get(b.id);
  if (!el) return;
  const lv = buildingLevel(b, S);
  const cost = buildingCost(b, S, costMult());
  el.querySelector('.count').textContent = `Lv.${lv}/${b.levels}`;
  el.querySelector('.desc').textContent = b.desc[lv];
  el.querySelector('.cost').textContent = `${fmt(cost)} EP`;
  el.classList.toggle('cant', S.ep < cost);
}

// ========== 刷新（每秒快刷，不重建 DOM；v2.1 R4 口径延续） ==========
export function refreshAllShop() {
  // v1.3 E：仅供整列表结构变化时调用（解锁数变化 / 批量档位切换 / tab 进入）
  if (shopContainer) renderShop(shopContainer);
  if (threadContainer) renderThreadShop(threadContainer);
  if (vehicleContainer) renderVehicles(vehicleContainer);
  if (dmContainer) renderDmShop(dmContainer);
  if (bldContainer) renderBuildings(bldContainer);
  if (v21Container) renderV21Buildings(v21Container);
  if (crossroadContainer) renderCrossroadBuildings(crossroadContainer);
  if (familyContainer) renderFamilyUpgrades(familyContainer);
}

export function refreshShopAffordability() {
  if (!shopContainer) return;
  // v2.4.2：深渊商店余额展示已移除（顶栏 h-dm 常显），不再每帧同步
  for (const [id, el] of shopItemEls) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    if (maxedLevel(u)) continue; // v2.0.2：满级锁定项不参与灰态刷新
    const cost = bulkCostCalc(u, 1); // v2.3.1 ⑥：倍率移除，固定 ×1
    el.classList.toggle('cant', S.ep < cost);
    // v2.8.7：成本数字随 costMult 变化同步（议价坊族购买后即时生效，不再依赖切 tab 重渲染）
    const c = el.querySelector('.cost');
    if (c) c.textContent = fmt(cost);
  }
  for (const [id, el] of threadItemEls) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    if (maxedLevel(u)) continue; // v2.0.2 maxLevel：满级项不参与灰态与显示价刷新
    const cost = threadCost(u); // v2.0.2 复验 P0 修复：cache 走钳制口径，灰态与实扣一致
    // v2.6.5 ③：防抖——灰态不变则跳过 class 写入（消除 hover 抖动）
    const cant = S.ep < cost;
    if (el.classList.contains('cant') !== cant) el.classList.toggle('cant', cant);
    // 扩容项钳制价随上限动态变化：每秒同步显示价，保证显示价=实扣价恒成立
    if (CAP_EXPANSION_IDS.includes(id)) {
      const c = el.querySelector('.cost');
      if (c && c.textContent !== fmt(cost)) c.textContent = fmt(cost);
    }
  }
  for (const [id, el] of vehicleItemEls) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    const owned = S.upgrades[u.id] || 0;
    const cost = Math.ceil(u.base * Math.pow(u.growth || 1.15, owned) * costMult());
    // v2.6.5 ③：防抖
    const vcant = S.ep < cost;
    if (el.classList.contains('cant') !== vcant) el.classList.toggle('cant', vcant);
  }
  for (const [id, el] of dmItemEls) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    el.classList.toggle('cant', (S.dm || 0) < u.dmCost);
  }
  // v1.3 B：设施灰态快刷
  const buildings = getBuildings();
  for (const [id, el] of bldItemEls) {
    const b = buildings.find(x => x.id === id);
    if (!b) continue;
    el.classList.toggle('cant', S.ep < buildingCost(b, S, costMult()));
  }
  // v2.1：效能建筑灰态 + 价格同步（含 30% 钳制动态价，显示价=实扣价恒成立）
  for (const [id, el] of v21ItemEls) {
    const b = V21_BUILDINGS.find(x => x.id === id);
    if (!b) continue;
    if (!v21UnlockedMark(b)) { el.classList.toggle('cant', S.ep < v21BuildingCost(b)); continue; } // v2.8.8：纯 EP
    if (v21Maxed(b, S)) continue;
    const cost = v21BuildingCost(b);
    el.classList.toggle('cant', S.ep < cost);
    const c = el.querySelector('.cost');
    if (c) c.textContent = `${fmt(cost)} EP`;
  }
  // v2.2：岔路口三栋 EP 灰态 + 族升级 RP 灰态（1s 快刷，不重建 DOM）
  for (const [id, el] of crossroadItemEls) {
    if (crossroadOwned(id, S)) continue;
    el.classList.toggle('cant', S.ep < 3e5);
  }
  for (const [key, el] of familyItemEls) {
    const fam = key.split(':')[0];
    const cfg = BALANCE.familyUpgradeTiers[fam];
    if (!cfg) continue;
    const cur = (S.familyUpgrades || {})[fam] || 0;
    if (cur >= cfg.tiers.length) continue;
    const next = cfg.tiers[cur];
    el.classList.toggle('cant', S.rp < next.rp || Object.keys(S.milesDone || {}).length < next.milestone);
  }
  // v1.3 D：采集页头期望值随载具数变化（1s 节奏足够）
  updateVehicleCollectHeader();
}


// ========== 渲染：v2.1 效能建筑（科技=钥匙，成长靠等级，数量受控红线） ==========
let v21Container = null;
let v21ItemEls = new Map();  // id -> el（未解锁 / 已解锁未满级）
let v21Section = null;

function keyTechName(id) {
  const t = getTechs().find(x => x.id === id);
  return t ? t.name : id;
}

export function buyUnlockV21(b) {
  if (S.unlockedBuildings && S.unlockedBuildings[b.id]) return false;
  // 三重门控中的钥匙与里程碑必须先满足（RP 门控由本函数自身承担）
  if (b.unlockTech && BALANCE.v21KeyTechs.includes(b.unlockTech) && !S.tech[b.unlockTech]) {
    shopToast(`需先研究钥匙科技「${keyTechName(b.unlockTech)}」`); return false;
  }
  const m = unlockMilestoneV21(b);
  if (m && Object.keys(S.milesDone || {}).length < m) {
    shopToast(`需先达成里程碑 ${m}`); return false;
  }
  const cost = v21BuildingCost(b); // v2.8.8：纯 EP 购买（解锁+首级），去除 RP 解锁+EP 升级混合支付
  if (S.ep < cost) { shopToast(`EP 不足：${b.name} 需要 ${fmt(cost)} EP`); return false; }
  S.ep -= cost;
  S.unlockedBuildings[b.id] = true;
  S.buildings[b.id] = 1;
  return true;
}

export function buyV21Building(b) {
  const lv = v21Level(b.id, S);
  if (lv >= capOf(b, S)) return false; // v2.2：动态上限（族升级扩展）
  const cost = v21BuildingCost(b);
  if (S.ep < cost) return false;
  S.ep -= cost;
  S.buildings[b.id] = lv + 1;
  return true;
}

function v21UnlockedMark(b) { return !!(S.unlockedBuildings && S.unlockedBuildings[b.id]); }

function makeV21Item(b) {
  const div = document.createElement('div');
  div.dataset.v21 = b.id;
  if (!v21UnlockedMark(b)) {
    const cost = v21BuildingCost(b);
    div.className = 'item v21 lock-card';
    div.title = '效能建筑：纯 EP 购买（需对应里程碑）；等级成长，数量受控';
    let gate = '';
    if (b.unlockTech && BALANCE.v21KeyTechs.includes(b.unlockTech) && !S.tech[b.unlockTech]) gate += `需钥匙「${keyTechName(b.unlockTech)}」· `;
    const m = unlockMilestoneV21(b);
    if (m && Object.keys(S.milesDone || {}).length < m) gate += `需里程碑 ${m} · `;
    if (gate) div.classList.add('locked');
    div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono">${fmt(cost)} EP</span></div>
      <div class="desc">${b.desc}</div>
      <div class="cost mono">${gate}${fmt(cost)} EP</div>`;
  } else {
    const lv = v21Level(b.id, S);
    const cost = v21BuildingCost(b);
    const afford = S.ep >= cost;
    div.className = 'item v21' + (!afford ? ' cant' : '');
    const cap = capOf(b, S); // v2.2：动态上限（族升级扩展后满级数随之上升）；v2.4：unlimited 建筑返回 Infinity
    const finite = isFinite(cap);
    div.title = finite ? `族内封顶：建筑数量受控（${cap} 级满，当前 Lv.${lv}）` : `无限升级：成本递增、后期性价比递减（当前 Lv.${lv}）`;
    div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono">${finite ? `Lv.${lv}/${cap}` : `Lv.${lv}`}</span></div>
      <div class="desc">${b.desc}</div>
      <div class="cost mono">${fmt(cost)} EP</div>`;
  }
  return div;
}

export function refreshV21Item(b) { updateV21Item(b); } // v2.6.6 ③：AI/混沌购建后单卡原地刷新（不整面板重建）

function updateV21Item(b) {
  const el = v21ItemEls.get(b.id);
  if (!el) return;
  const lv = v21Level(b.id, S);
  const cost = v21BuildingCost(b);
  const cap = capOf(b, S);
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = isFinite(cap) ? `Lv.${lv}/${cap}` : `Lv.${lv}`; // v2.4 无限建筑显示无上限
  const c = el.querySelector('.cost');
  if (c) c.textContent = `${fmt(cost)} EP`;
  el.classList.toggle('cant', S.ep < cost);
}

function v21RealList() { return V21_BUILDINGS.filter(b => b.via !== 'upgrade'); } // 镜像项走升级商店

// v2.3.1 ⑤（rev18 9.3）：效能建筑 cat A-X 分组显示名（研发命名，回填设计文档 9.3 表）。
// 组序 = 字母序（A→I，X 岔路镜像实际渲染于岔路口分区不进本列表）；「其他」为兜底组，未命中组谓词的条目归入、组内可见 0 项整组不渲染。
const V21_GROUP_NAMES = {
  // v2.6.3 反馈①：B「点击与暴击」分区移除（弱化主动点击）
  A: '全局产出强化', C: '成本与效率优化', D: '存储与扩容',
  E: '线程与薪资', F: '研究点强化', G: '离线续航', H: '事件与项目',
  I: '职级强化', X: '命运誓言',
};

export function renderV21Buildings(container) {
  if (!container) return;
  v21Container = container;
  // v2.5：效能建筑分区保持 RP 锚点（EP 首次溢出解锁 RP 后开放；需求①只改探采平台/深渊商店 → 裂隙门控）
  const v21Shown = anchorShown('rp', S);
  const v21Title = document.getElementById('v21-title');
  if (v21Title) v21Title.style.display = v21Shown ? '' : 'none';
  if (!v21Shown) { container.innerHTML = ''; v21ItemEls.clear(); return; }
  container.innerHTML = '';
  v21ItemEls.clear();
  v21Section = buildOwnedSection('v21-bld-list', container, '已满级');
  const real = v21RealList();
  const maxed = real.filter(b => v21Maxed(b, S));
  maxed.sort((a, b) => boughtOrderIndex(S, b.id) - boughtOrderIndex(S, a.id));
  for (const b of maxed) {
    const div = document.createElement('div');
    div.className = 'item owned-item';
    div.title = '族内封顶：建筑数量受控，成长靠等级';
    div.innerHTML = ownedItemHtml(b.name, b.desc, `Lv.${capOf(b, S)}/${capOf(b, S)} 满`); // v2.2 动态上限
    v21Section.box.appendChild(div);
  }
  v21Section.updateCount(maxed.length);
  // 可购区：已解锁未满级按当前级成本升序置前；未解锁按解锁 RP 价升序殿后
  const avail = real.filter(b => !v21Maxed(b, S));
  const open = avail.filter(v21UnlockedMark);
  const locked = avail.filter(b => !v21UnlockedMark(b));
  open.sort((a, b) => v21BuildingCost(a) - v21BuildingCost(b));
  locked.sort((a, b) => v21BuildingCost(a) - v21BuildingCost(b)); // v2.8.8：纯 EP 成本排序
  // v2.3.1 ⑤（rev18 9.3）：链序 = 可购区既有序（open 前 locked 后）；窗口 K = p + 1，
  // 已解锁=已购永不隐藏；按 cat 分组渲染（分组纯显示不拆链，组内可见 0 项整组不渲染）
  const chainList = [...open, ...locked];
  const split = chainSplit('v21', chainList, b => v21UnlockedMark(b), S);
  const groups = [
    ...Object.entries(V21_GROUP_NAMES).map(([letter, title]) =>
      ({ title: `${letter} · ${title}`, test: b => (b.cat || '') === letter })),
    { title: '其他', test: () => true }, // 兜底组：未命中 cat 谓词的条目归入，条目永不丢
  ];
  renderChainedGroups(container, split, groups, makeV21Item, (b, el) => v21ItemEls.set(b.id, el));
  bindV21Delegate(container);
}

function bindV21Delegate(container) {
  if (!container || container.dataset.v21Delegated) return;
  container.dataset.v21Delegated = '1';
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-v21]');
    if (!el || !container.contains(el)) return;
    const b = V21_BUILDINGS.find(x => x.id === el.dataset.v21);
    if (!b) return;
    if (!v21UnlockedMark(b)) {
      if (el.classList.contains('locked')) return; // v2.5.4 ②：前置未满足（钥匙/里程碑）卡片整体禁点
      if (buyUnlockV21(b)) {
        pushBoughtOrder(S, b.id);
        save(S);
        renderV21Buildings(container); // 解锁->升级态结构性切换（低频，整面板重入）
      }
    } else if (buyV21Building(b)) {
      pushBoughtOrder(S, b.id);
      save(S);
      if (v21Maxed(b, S)) {
        delete el.dataset.v21;
        el.className = 'item just-bought';
        el.title = '族内封顶：建筑数量受控，成长靠等级';
        el.innerHTML = ownedItemHtml(b.name, b.desc, `Lv.${capOf(b, S)}/${capOf(b, S)} 满`); // v2.2 动态上限
        scheduleMoveToOwned(el, v21Section.box, () => v21Section.updateCount(v21RealList().filter(x => v21Maxed(x, S)).length));
      } else {
        updateV21Item(b);
      }
    } else {
      const lv = v21Level(b.id, S);
      /* v2.8.2 反馈⑪：EP 不足不弹框 */
    }
  });
}


// ========== v2.2 命运的岔路口（三栋互斥定向建筑；open 不买是合法中立路径） ==========
let crossroadContainer = null;
let crossroadItemEls = new Map(); // id -> el（open 态可购三栋）

// 购买钩子：loadStoryline 全库调用点之一（另一处 main.ensureStorylineRuntime；PM 定稿断言 2 新口径）。
// 落账字段集与 migrateSave v4→v5 迁移合成完全同源：buildings[id]=1 + storyline + crossroad='locked' + crossroadLockedBy。
export function buyCrossroadBuilding(id) {
  const b = crossroadById(id);
  if (!b || S.crossroad !== 'open') return false; // 状态机门控（唯一合法入口；inactive 隐藏 / locked 已立誓）
  if (crossroadOwned(id, S)) return false;        // 1 级封顶
  const cost = 3e5;                                // 固定价（PM §2.2：不乘 costMult、不受 30% 钳制）
  if (S.ep < cost) return false; // v2.8.2 反馈⑪：EP 不足不弹框
  S.ep -= cost;
  S.buildings[id] = 1;
  const line = BALANCE.crossroadToLine[id];
  if (loadStoryline(line)) {
    lockStorylineSwitch();
    S.storyline = line;
    S.crossroad = 'locked';
    S.crossroadLockedBy = id;
    S.vowPolicyBoost = true; // v2.8.6 B2a：立誓——本局政策正向幅度 +5%
    save(S);
    // v2.2 组长裁定（评论 7698335062311341299 选项③）：立誓 toast 附 5X 章名+文案一次性播报——
    // 5X 章在剧情条上被 6X 遮蔽（currentChapter 取最后满足章），其叙事由本 toast 承接，随购买路径唯一触发（只播一次）
    const pkg = getStorylinePackage(line);
    const ch5 = pkg?.data?.chapters?.append?.find((c) => /^5[ABC]$/.test(c.id));
    let msg = `已立誓：${pkg?.name || b.name}——本轮锁定该命运线，转生后岔路口将重新开放，可再次选择`;
    if (ch5) msg += `\n【${ch5.name}】${ch5.desc}`;
    shopToast(msg);
    dirty.shop = true; dirty.tech = true; dirty.story = true;
    return true;
  }
  // loadStoryline 失败（理论不可达）：回滚扣款，保持状态机不被污染
  S.ep += cost;
  delete S.buildings[id];
  return false;
}

export function renderCrossroadBuildings(container) {
  if (!container) return;
  crossroadContainer = container;
  crossroadItemEls.clear();
  // inactive：第五章前分区整体隐藏（标题+列表，状态机门控，不走 RP/钥匙三重门控）
  const crTitle = document.getElementById('crossroad-title');
  if (crTitle) crTitle.style.display = (S.crossroad === 'inactive') ? 'none' : '';
  if (S.crossroad === 'inactive') { container.innerHTML = ''; return; }
  container.innerHTML = '';
  const vowName = S.crossroadLockedBy ? (crossroadById(S.crossroadLockedBy)?.name || S.crossroadLockedBy) : null;
  for (const b of CROSSROAD_BUILDINGS) {
    const div = document.createElement('div');
    div.dataset.crossroad = b.id;
    if (S.crossroad === 'locked') {
      if (crossroadOwned(b.id, S)) {
        div.className = 'item v21 owned-item';
        div.title = '已立誓：本轮锁定该命运线（转生后可重新选择）';
        div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono">已立誓</span></div>
          <div class="desc">${b.desc}</div>
          <div class="cost mono" style="color:var(--purple)">✦ 命运已定</div>`;
      } else {
        div.className = 'item v21 cant';
        div.title = `已被「${vowName}」封印：本局无法再立其他誓`;
        div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono" style="color:var(--text-3)">封印</span></div>
          <div class="desc">${b.desc}</div>
          <div class="cost mono" style="color:var(--text-3)">已被 ${vowName} 封印</div>`;
      }
    } else {
      // open：三栋同显可购，明示互斥
      const afford = S.ep >= 3e5;
      div.className = 'item v21' + (!afford ? ' cant' : '');
      div.title = '三选一立誓：购买任意一栋后其余两栋封印；不买则保持中立（可走到终章）';
      div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono">1 级封顶</span></div>
        <div class="desc">${b.desc}</div>
        <div class="cost mono">${fmt(3e5)} EP · 三选一</div>`;
      crossroadItemEls.set(b.id, div);
    }
    container.appendChild(div);
  }
  bindCrossroadDelegate(container);
}

function bindCrossroadDelegate(container) {
  if (!container || container.dataset.crossroadDelegated) return;
  container.dataset.crossroadDelegated = '1';
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-crossroad]');
    if (!el || !container.contains(el)) return;
    if (buyCrossroadBuilding(el.dataset.crossroad)) {
      renderCrossroadBuildings(container); // open→locked 结构性切换（低频，整分区重入）
    }
  });
}

// ========== v2.2 族升级（扩容族/产出族动态上限；跨转生保留） ==========
let familyContainer = null;
let familyItemEls = new Map(); // familyKey -> el

// PM 终稿 7698334831112899877 白名单口径：产出族 = 组E 非锚点 3 座（coop_hall/eco_battery/eco_battery_2），组B 整组不开放
// v2.4：扩容族（组D）随 KG 模式改造移除——扩容类建筑已无限升级，族升级档位失去钳制对象
// v2.8.3：文案通俗化——说清这三座建筑是什么、买了得到什么
const FAMILY_LABELS = { output: '产出族扩容' }; // v2.8.8：长文案拆入各档位 desc，标签精简

export function buyFamilyUpgrade(familyKey) {
  const cfg = BALANCE.familyUpgradeTiers[familyKey];
  if (!cfg) return false;
  const cur = (S.familyUpgrades || {})[familyKey] || 0;
  if (cur >= cfg.tiers.length) return false; // 已满档
  const next = cfg.tiers[cur];
  const mDone = Object.keys(S.milesDone || {}).length;
  if (mDone < next.milestone) { shopToast(`需先达成里程碑 ${next.milestone}`); return false; }
  if (S.rp < next.rp) { shopToast(`RP 不足：${FAMILY_LABELS[familyKey]} T${cur + 1} 需要 ${fmt(next.rp)} RP`); return false; }
  S.rp -= next.rp;
  S.familyUpgrades = S.familyUpgrades || {};
  S.familyUpgrades[familyKey] = cur + 1;
  save(S);
  shopToast(`族升级完成：${FAMILY_LABELS[familyKey]} → T${cur + 1}（等级上限 +${next.addCap}）`);
  dirty.shop = true; // 上限变化 → v21 分区满级折叠/文案结构性刷新
  return true;
}

export function renderFamilyUpgrades(container) {
  if (!container) return;
  familyContainer = container;
  // v2.3.1 ②（rev18 9.2）：族升级分区 ← RP 锚点串联（仅整节可见性；anchorShown 双读不回隐藏）
  const famShown = anchorShown('rp', S);
  const famTitle = document.getElementById('family-upgrade-title');
  if (famTitle) famTitle.style.display = famShown ? '' : 'none';
  if (!famShown) { container.innerHTML = ''; familyItemEls.clear(); return; }
  container.innerHTML = '';
  familyItemEls.clear();
  for (const [fam, cfg] of Object.entries(BALANCE.familyUpgradeTiers)) {
    const cur = (S.familyUpgrades || {})[fam] || 0;
    const total = cfg.tiers.reduce((a, t) => a + t.addCap, 0);
    if (cur >= cfg.tiers.length) {
      const div = document.createElement('div');
      div.className = 'item v21 owned-item';
      div.title = '族扩容：三座建筑的上限扩展已全部购满（跨转生保留）';
      div.innerHTML = `<div class="name"><span>${FAMILY_LABELS[fam]}</span><span class="count mono">满档</span></div>
        <div class="desc">已购满：三座建筑上限共扩展 +${total} 级（上限硬顶 ${cfg.hardCap} 级）</div>
        <div class="cost mono" style="color:var(--purple)">✦ 已满档</div>`;
      container.appendChild(div);
      continue;
    }
    // v2.8.8：每档独立升级项（消除超长文案）
    for (let ti = cur; ti < cfg.tiers.length; ti++) {
      const t = cfg.tiers[ti];
      const mDone = Object.keys(S.milesDone || {}).length;
      const prevOk = ti === 0 || cur >= ti;
      const ok = prevOk && S.rp >= t.rp && mDone >= t.milestone;
      const div = document.createElement('div');
      div.dataset.family = fam;
      div.className = 'item v21' + (prevOk ? (!ok ? ' cant' : '') : ' locked');
      div.title = '族扩容：RP 购买，逐档线性（买满前档才能买下一档）；跨转生保留';
      const gate = !prevOk ? '需先购买前一档 · ' : (mDone < t.milestone ? `需里程碑 ${t.milestone} · ` : '');
      div.innerHTML = `<div class="name"><span>${FAMILY_LABELS[fam]}</span><span class="count mono">档位 T${ti + 1}</span></div>
        <div class="desc">三座建筑可购买等级上限 +${t.addCap} 级</div>
        <div class="cost mono">${gate}${fmt(t.rp)} RP</div>`;
      if (prevOk) familyItemEls.set(`${fam}:${ti}`, div);
      container.appendChild(div);
    }
  }
  bindFamilyDelegate(container);
}

function bindFamilyDelegate(container) {
  if (!container || container.dataset.familyDelegated) return;
  container.dataset.familyDelegated = '1';
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-family]');
    if (!el || !container.contains(el)) return;
    if (buyFamilyUpgrade(el.dataset.family)) {
      renderFamilyUpgrades(container);
    }
  });
}


// ========== v2.8.4：研究升级（研究点 tab · RP 购买 · 长线） ==========
export function researchUpgCost(id) {
  const u = (BALANCE.researchUpgs || []).find(x => x.id === id);
  if (!u) return 0;
  const lv = (S.rpTheories && S.rpTheories[id]) || 0;
  return Math.ceil(u.base * Math.pow(u.growth, lv));
}
export function buyResearchUpgrade(id) {
  const u = (BALANCE.researchUpgs || []).find(x => x.id === id);
  if (!u) return { ok: false, reason: '未知研究' };
  const lv = (S.rpTheories && S.rpTheories[id]) || 0;
  if (lv >= u.cap) return { ok: false, reason: '已达上限' };
  const cost = researchUpgCost(id);
  if ((S.rp || 0) < cost) return { ok: false, reason: `RP 不足（需 ${fmt(cost)}）` };
  S.rp -= cost;
  S.rpTheories = S.rpTheories || {};
  S.rpTheories[id] = lv + 1;
  save(S);
  return { ok: true };
}
export function renderResearchUpgrades(container) {
  if (!container) return;
  const list = (BALANCE.researchUpgs || []).slice().sort((a, b) => a.base - b.base);
  let sig = list.map(u => `${u.id}:${S.rpTheories?.[u.id] || 0}`).join(',');
  if (container._lastSig === sig) return; // 增量：内容未变不重建（v2.6.7 纪律）
  container._lastSig = sig;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const u of list) {
    const lv = (S.rpTheories && S.rpTheories[u.id]) || 0;
    const maxed = lv >= u.cap;
    const cost = researchUpgCost(u.id);
    const afford = (S.rp || 0) >= cost;
    const div = document.createElement('div');
    div.className = 'item' + (maxed ? ' v21 owned-item' : (!afford ? ' cant' : ''));
    div.dataset.research = u.id;
    div.title = maxed ? '研究已达上限' : (afford ? `RP 购买：${u.desc}` : `RP 不足（需 ${fmt(cost)}，当前 ${fmt(S.rp || 0)}）`);
    div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">${lv}/${u.cap}</span></div>
      <div class="desc">${u.desc}（当前 ${u.fx.key === 'global' ? '×' + (Math.pow(1 + u.fx.v, lv)).toFixed(2) : '+' + Math.round(u.fx.v * lv * 100) + '%'}）</div>
      <div class="cost mono">${maxed ? '✦ 已满级' : afford ? cost + ' RP' : '还差 ' + fmt(cost - (S.rp || 0)) + ' RP'}</div>`;
    frag.appendChild(div);
  }
  container.appendChild(frag);
  if (!container._bound) {
    container._bound = true;
    container.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-research]');
      if (!el || !container.contains(el)) return;
      const r = buyResearchUpgrade(el.dataset.research);
      if (r.ok) renderResearchUpgrades(container);
      else if (r.reason) { /* RP 不足走卡面灰态，不弹 toast（v2.8.2 ⑪ 纪律） */ }
    });
  }
}
