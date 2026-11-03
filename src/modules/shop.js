// v1.3 模块 E：全列表「可购买置前（成本升序，??? 最后）+ 已升级折叠」分区规范
// 交互约束：容器级事件委托 + 购后原地更新（×N/成本/灰态），严禁整列表 DOM 重建
import { S, save } from '../state.js';
import { UPGRADES } from '../data/upgrades.js';
import { OFF_UPGRADES } from '../data/offlineUpgrades.js';
import { CROSSROAD_BUILDINGS, buildingCost, buildingLevel, buildingMaxed, V21_BUILDINGS, v21Level, v21Maxed, unlockRpV21, unlockMilestoneV21, capOf, crossroadById, crossroadOwned } from '../data/buildings.js';
import { getBuildings, getTechs } from '../core/provider.js';
import { computeCps, costMult, globalMult, fmt, unitCost, bulkCostCalc, vehicleDmPerMin, vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, CAP_EXPANSION_IDS, hasTech, v21BuildingCost, totalDrainPerSec, epStorageCap, epCapAfterBuy, rpCap, dmCap, ptCap, staffOutputPerSec, staffSalaryPerSec, rpEffScale } from './economy.js'; // v2.8.30 ③：禁购检查 // v3.0.8：epCapAfterBuy 存储文案统一口径 // v3.0.9：线程产出/薪资变化量 // v3.1.1 反馈⑤：探采汇率递增 // v3.3.3 反馈③：RP 效率递增
import { BALANCE } from '../data/balance.js';
import { buildOwnedSection, pushBoughtOrder, scheduleMoveToOwned, ownedItemHtml, boughtOrderIndex } from './listkit.js';
import { chainSplit, renderChainedGroups, anchorShown, riftShown, CHAIN_PREVIEW } from './disclosure.js'; // v2.5 ①：裂隙门控（riftShown）接管探采平台/深渊商店
import { dirty, log } from '../core/runtime.js'; // v3.0.0 测试性解耦：侧效工具下沉到 DOM 无关的 core
import { ptHatchUpgCost } from './pets.js'; // v3.3.1 反馈②：孵化升级卡移入设施区（成本口径与异兽页一致）
import { converterEnabled, setConverterEnabled } from './threadBinding.js'; // v3.3.1：蒸馏开关与班组/快捷开关同口径
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
// v3.0.7 反馈②：「产出不足」禁购只针对「消耗 EP 换其他资源」的转化项——
// 基础产出升级 / 存储扩容 / 一次性设施一律放行。原实现一刀切（净产出 ≤0 全禁），
// 把能提升产出、唯一能自救的那类升级也拦了 → 越卡越死（用户：EP 上限 2K 时什么都买不了）
const CONVERSION_IDS = ['atrium', 'rp_distill']; // 灵感工坊（自动蒸馏）/ 灵感蒸馏塔（EP→RP）
export function isConversionUpgrade(u) {
  return !!u && (!!u.produces || CONVERSION_IDS.includes(u.id));
}
function drainBlocked(u) {
  if (!isConversionUpgrade(u)) return false;
  return computeCps() - totalDrainPerSec() <= 0;
}
export function buyUpgrade(u) {
  if (drainBlocked(u)) { shopToast('产出不足：总消耗 ≥ 产出，暂不可购买「EP 换资源」类升级'); return { ok: false, reason: '产出不足' }; } // v2.8.30 ③ → v3.0.7 收窄范围
  const owned = S.upgrades[u.id] || 0;
  // v2.0.2：级制封顶——满级后购买入口锁定
  const maxLv = u.maxLevel || Infinity;
  if (owned >= maxLv) return false;
  const n = 1; // v2.3.1 ⑥：倍率移除，固定单件购买
  const cost = bulkCostCalc(u, n);
  // v2.8.21 ⑥：净化节点等 DM 消耗升级（不耗 EP）
  if (u.dmCost) {
    if ((S.dm || 0) < cost) return false;
    S.dm -= cost;
  } else {
    if (S.ep < cost) return false;
    S.ep -= cost;
  }
  S.upgrades[u.id] = owned + n;
  S.totalBuys += n;
  S.lazySince = null; // v2.7.1：任意升级/购买解除线程懒惰
  // v3.0.3 第三批③：购买后立即刷新主商店灰态/成本（不依赖每秒快刷）
  if (typeof refreshShopAffordability === 'function') refreshShopAffordability();
  return true;
}

// v2.0.2 复验 P0 修复：线程区成本统一走 threadCost——扩容项（cache）经 unitCost
// 挂 30% 防死锁钳制（显示与实扣同口径，杜绝显示误导/实扣穿透），其余项维持裸公式
function threadCost(u) {
  if (CAP_EXPANSION_IDS.includes(u.id)) return unitCost(u, 0);
  const owned = S.upgrades[u.id] || 0;
  return Math.ceil(u.base * Math.pow(1.55, owned) * costMult()); // v2.8.2：成本曲线 1.15→1.30 // v3.3.3 反馈⑪：线程/薪资强化大幅涨价 1.30→1.55
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
    // v3.0.3 反馈⑨：灰态/锁定卡点击不触发购买（防「灰色点击后仍生效」）
    if (el.classList.contains('cant') || el.classList.contains('locked') || el.classList.contains('disabled')) return;
    onBuy(el.dataset.buy, el);
  });
}

// ========== 渲染：主商店（可叠加项：永留可购区，成本升序 + ??? 最后） ==========
// v2.8.28 修复：资源仓库建筑按对应解锁链门控——EP 首次溢出前不显示「矩阵存储库」；
// DM 解锁（首辆载具）前不显示「星尘金库」；宠物乐园购入前不显示「饵料仓库」；已购/已解锁不受影响。
const VAULT_IDS = ['rp_vault', 'dm_vault', 'pt_vault'];
function vaultAnchorReady(u) {
  if (u.id === 'rp_vault') return !!(S._rpOverflowSeen || (S.resDiscovered && S.resDiscovered.rp));
  if (u.id === 'dm_vault') return !!((S.upgrades && S.upgrades.scooter) || (S.resDiscovered && S.resDiscovered.dm));
  if (u.id === 'pt_vault') return parseInt(S.chapter, 10) >= 3 || (S.resDiscovered && S.resDiscovered.pt) || (S.upgrades && S.upgrades.petland); // v3.1.1 反馈⑦：饵料仓库 = PT 解锁入口（矩阵存储库→RP 同构），P2 章节（第 3 章）后才开放；旧档标记兼容
  return false;
}
// v3.0.7 反馈① / v3.0.8 修正：资源仓库要「EP 上限存得下全价」才摆出来——
// 原用「首价一半」（矩阵存储库 75K）会在 78K 上限时就把 150K 的仓库摆出来，玩家点半天买不起，
// 而 RP 解锁链又必须买下它 → 研究点永久锁死（用户实测：溢出后 RP 标签依然不出现）
function vaultCapacityReady(u) {
  return epStorageCap() >= unitCost(u, 0);
}
function vaultForced(u) {
  return VAULT_IDS.includes(u.id) && vaultAnchorReady(u) && vaultCapacityReady(u);
}
function shopUnlocked(u) {
  const owned = S.upgrades[u.id] || 0;
  if (owned > 0) return true;
  // v3.0.7 反馈①：EP 存储节点是防死锁关键件——不参与「逐项揭示」链窗，始终可见。
  // 原实现里它排在并行任务（10,800 EP）之后，而上限只有 2,000 → 并行任务永远买不起 →
  // 存储节点永远揭示不出来 → 上限锁死 2K 的硬死锁（用户实测现象）
  if (u.id === 'storage') return true;
  if (VAULT_IDS.includes(u.id)) return vaultForced(u);
  return S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3;
}

export function renderShop(container) {
  shopContainer = container;
  container.innerHTML = '';
  shopItemEls.clear();
  // v2.8.2 反馈④：RP 相关升级（组 F 加成 + 灵感蒸馏塔）移入研究点 tab，主商店不再渲染
  const RP_FAMILY_IDS = ['exp_bench', 'rp_distiller', 'deep_lab', 'theory_desk', 'legend_institute', 'rp_distill'];
  const items = UPGRADES.filter(u => !VEHICLE_IDS.includes(u.id) && !DM_SKIP.includes(u.id) && !THREAD_IDS.includes(u.id) && !RP_FAMILY_IDS.includes(u.id)
    && u.cat !== 'purifier' && u.id !== 'atrium'); // v2.8.30 ⑤：灵感工坊移入研究点（自动蒸馏）（v2.8.22 移遗物后 filter 仍保留有熵减协议时渲染 → 兜底组「存储与资源建筑」重复出现）
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
  // v2.8.28 修复：资源仓库（矩阵存储库/星尘金库/饵料仓库）在对应资源解锁后强制可见（跳过链窗口）——
  // 资源解锁 = 购买对应仓库（EP 溢出后矩阵存储库即解锁），避免玩家已满足前置却因链窗口看不到可购仓库
  const split = chainSplit('shop', sorted, u => (S.upgrades[u.id] || 0) > 0 || vaultForced(u), S);
  // v3.0.7 反馈①：EP 存储节点钉死在可购区（不占链位、不算已购前缀）——防死锁关键件必须一直可见
  const storageItem = sorted.find(u => u.id === 'storage');
  if (storageItem && !split.visible.includes(storageItem)) {
    split.visible = sorted.filter(u => split.visible.includes(u) || u === storageItem);
    split.hiddenCount = sorted.length - split.visible.length;
  }
  // v2.6.7：记录链窗口状态（供 refreshShopChain 增量揭示，避免整面板重建）
  shopContainer._chain = {
    ids: new Set(split.visible.map(u => u.id)),
    split,
    groups: [{ title: '基础产出', test: u => u.cps > 0 && !u.produces && !u.cat }, { title: '存储与资源建筑', test: u => u.cat !== 'purifier' }], // v2.8.22 ⑥
  };
  // v2.3.1 ⑤（rev18 9.3 分组表）：基础产出在前、存储与资源建筑在后；分组纯显示不拆链
  // v2.8.18 ③：已购终态项（满级/一次性）收各组最下侧「已升级」折叠区
  renderChainedGroups(container, split, [
    { title: '基础产出', test: u => u.cps > 0 && !u.produces && !u.cat },
    { title: '存储与资源建筑', test: () => true }, // 兜底组：存储节点/资源建筑/净化节点族
  ], makeShopItem, (u, el) => shopItemEls.set(u.id, el), { verb: '升级' });

  bindDelegate(container, (id, el) => {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) return;
    const wasOwned = (S.upgrades[u.id] || 0) > 0; // v2.3：首次购入改变已购前缀 p → 链窗口/链提示结构性刷新
    if (buyUpgrade(u)) {
      updateShopItem(u); // v1.3 E：购后原地更新（×N / 成本 / 灰态），不重建列表
      // v2.8.20 ⑨：购买后立即刷新全部主商店卡（成本资源变化 → 灰显即时同步）
      for (const [sid, sel] of shopItemEls) { const su = UPGRADES.find(x => x.id === sid); if (su && sel) updateShopItem(su); }
      // v2.8.22 ①：购买后全相关面板置脏——线程/科技/遗物/腐化即时重算灰显（资源变化跨面板同步）
      dirty.tech = true; dirty.relics = true; dirty.corruption = true; dirty.hero = true;
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
const RP_FAMILY_SRC_IDS = ['exp_bench', 'rp_distiller', 'deep_lab', 'theory_desk', 'legend_institute']; // v2.8.30 ②：灵感蒸馏塔（非晋升）移出 RP 加成组，主商店/蒸馏按钮保留
function rpFamilyCost(u) {
  const owned = (S.upgrades[u.id] || 0);
  // v3.3.3 反馈⑪：晋升 RP 加成族大幅涨价——每级额外 ×1.35（有效曲线 1.28~1.42 → 1.73~1.92）
  return Math.ceil((u.rpCost || 8) * Math.pow((u.growth || 1.18) * 1.35, owned));
}
function makeRpFamilyItem(u) {
  const owned = (S.upgrades[u.id] || 0);
  const cost = rpFamilyCost(u);
  const maxed = !u.unlimited && owned >= (u.cap || Infinity); // v3.0.3 反馈④：满级态展示
  const afford = !maxed && S.rp >= cost;
  const div = document.createElement('div');
  div.dataset.buy = u.id;
  div.className = 'item' + (!afford ? ' cant' : '');
  if (maxed) {
    delete div.dataset.buy; // 满级移除购买入口（委托匹配 [data-buy] 不再命中）
    div.className = 'item owned-item';
    div.title = '已满级：晋升 RP 加成建筑数量受控';
  }
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">${maxed ? `Lv.${owned}/${u.cap} 满` : u.unlimited ? `×${owned}` : `Lv.${owned}/${u.cap}`}</span></div>
    <div class="desc">${u.desc}</div>
    <div class="cost mono">${maxed ? '已满级' : `${fmt(cost)} RP`}</div>`;
  return div;
}
function updateRpFamilyItem(u) {
  const el = rpFamilyItemEls.get(u.id);
  if (!el) return;
  const owned = (S.upgrades[u.id] || 0);
  const maxed = !u.unlimited && owned >= (u.cap || Infinity); // v3.0.3 反馈④
  const cost = rpFamilyCost(u);
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = maxed ? `Lv.${owned}/${u.cap} 满` : u.unlimited ? `×${owned}` : `Lv.${owned}/${u.cap}`;
  const c = el.querySelector('.cost');
  if (c) c.textContent = maxed ? '已满级' : `${fmt(cost)} RP`;
  el.classList.toggle('owned-item', maxed);
  el.classList.toggle('cant', !maxed && S.rp < cost);
}
export function renderRpFamily(container) {
  if (!container) return;
  rpFamilyContainer = container;
  const RP_IDS = RP_FAMILY_SRC_IDS;
  // v3.1.1 反馈①：晋升 RP 加成是晋升期内容——完成首次晋升（P3/ES 锚点同源）后才开放，前期不展示
  const preTitle = document.getElementById('rp-upgrade-title');
  const preShown = (S.prestige || 0) >= 1;
  if (preTitle) preTitle.style.display = preShown ? '' : 'none';
  if (!preShown) { container.innerHTML = ''; rpFamilyItemEls.clear(); return; }
  const rpItems = (BALANCE.buildingsV21 || []).filter(u => RP_IDS.includes(u.id)) // v2.8.26：数据源修复——thread.upgrades 不存在（实为裂隙配置），cat F 建筑在 buildingsV21；v2.8.7 声称修复但一直渲染为空
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
    const u = (BALANCE.buildingsV21 || []).find(x => x.id === id);
    if (!u || !rpFamilyItemEls.has(id)) return;
    const ownedNow = (S.upgrades[u.id] || 0);
    // v3.0.3 反馈④：RP 加成升级项满级拦截——原购买路径缺失 cap 检查，可无限超出 Lv 上限
    if (!u.unlimited && ownedNow >= (u.cap || Infinity)) return;
    const wasOwned = ownedNow > 0;
    const cost = rpFamilyCost(u);
    if (S.rp < cost) return;
    S.rp -= cost;
    S.upgrades[u.id] = ownedNow + 1;
    if (!wasOwned) renderRpFamily(container);
    else updateRpFamilyItem(u);
    save(S);
  });
}
let rpFamilyContainer = null;

// v2.8.30 ⑤：灵感工坊（自动蒸馏）——研究点 tab 卡（开关按钮 + 消耗/产出实时）
// v3.2.3 反馈③：修复首购入口缺失——原实现 n<1 直接 return 且主商店排除 atrium，
// 新档永远买不到第一座灵感工坊（wiki 也查不到解锁条件）。现未购时在本区摆首购卡：
// 解锁门槛与主商店同口径（EP 或累计产出 ≥ 首价 30% = 15K），EP 直购 50K。
// v3.3.2 反馈①④：改标准升级项样式——去独立升级按钮（整卡点击购买/升级）、
// 卡面文案只写当前总计（-X EP/s → +Y RP/s）；已购卡升级后原地更新，位置不再漂移。
export function renderAtriumDistill(container) {
  if (!container) return;
  const n = (S.upgrades && S.upgrades.atrium) || 0;
  const base = BALANCE.atrium.base || 5e4;
  const revealed = n >= 1 || (S.ep || 0) >= base * 0.3 || (S.allTimeEp || 0) >= base * 0.3;
  let el = container.querySelector('.atrium-distill');
  if (!revealed) { if (el) el.remove(); return; }
  const owned = n >= 1;
  const epRate = BALANCE.atrium.epRate || 150, rate = BALANCE.atrium.rate || 0.15;
  const cost = owned ? atriumUpgCost(n) : Math.ceil(base); // 已购：下一级升级成本；未购：首购价
  const afford = (S.ep || 0) >= cost;
  const rpPerS = (rate * n / rpEffScale()); // v3.3.3 反馈③：实际产出含效率递增折减
  const desc = owned
    ? `自动蒸馏：-${fmt(epRate * n)} EP/s → +${fmt(rpPerS)} RP/s`
    : `自动蒸馏：-${fmt(epRate)} EP/s → +${fmt(rate)} RP/s`;
  if (!el) {
    el = document.createElement('div');
    el.className = 'atrium-distill item';
    el.dataset.atriumUpg = '1'; // 整卡点击购买/升级（设施区共用容器委托，避开 [data-buy] 建筑口径）
    const hatchEl = container.querySelector('.hatch-upg');
    if (hatchEl) container.insertBefore(el, hatchEl); else container.appendChild(el); // 顺序稳定：灵感工坊在孵化工坊前
    if (!container._atriumDelegated) {
      container._atriumDelegated = true;
      container.addEventListener('click', (ev) => {
        const t = ev.target.closest ? ev.target.closest('[data-atrium-upg]') : null;
        if (!t) return;
        const lvl = (S.upgrades && S.upgrades.atrium) || 0;
        if (lvl < 1) {
          // v3.0.3 第六批①：首购与按钮同价（atriumUpgCost 口径），手动拦截扣费
          const c0 = Math.ceil(BALANCE.atrium.base || 5e4);
          if ((S.ep || 0) < c0) return;
          if (drainBlocked({ id: 'atrium' })) { shopToast('产出不足：总消耗 ≥ 产出，暂不可购买「EP 换资源」类升级'); return; }
          S.ep -= c0;
          S.upgrades.atrium = 1;
        } else {
          const cost = atriumUpgCost(lvl);
          if (!Number.isFinite(cost) || (S.ep || 0) < cost) return;
          S.ep -= cost;
          S.upgrades.atrium = lvl + 1;
        }
        S.totalBuys = (S.totalBuys || 0) + 1;
        S.lazySince = null;
        save(S);
        dirty.rp = true; // 研究点「自动蒸馏」开关行随渲染周期同步
        renderAtriumDistill(container);
      });
    }
  }
  el.innerHTML = `<div class="name"><span>灵感工坊</span>${owned ? `<span class="count mono">×${n}</span>` : ''}</div>
    <div class="desc">${desc}</div>
    <div class="cost mono">${fmt(cost)} EP</div>`;
  el.title = owned ? '点击升级灵感工坊' : '点击购入灵感工坊';
  el.classList.toggle('cant', !afford);
}
// v3.0.3 第四批③：灵感工坊升级成本——EP 指数曲线（参考研究升级项），消耗大幅增多
export function atriumUpgCost(n) {
  return Math.ceil((BALANCE.atrium.base || 5e4) * Math.pow(BALANCE.atrium.growth || 2.2, n - 1));
}

// v3.3.1 反馈①：灵感工坊「自动蒸馏」开关移入研究点页（设施区只留购买/升级）
export function renderAtriumSwitch(host) {
  if (!host) return;
  const n = (S.upgrades && S.upgrades.atrium) || 0;
  if (n < 1) { host.innerHTML = ''; host.style.display = 'none'; return; }
  host.style.display = '';
  const on = converterEnabled('atrium');
  const epS = (BALANCE.atrium.epRate || 150) * n;
  const rpS = (BALANCE.atrium.rate || 0.15) * n / rpEffScale(); // v3.3.3 反馈③：实际产出含效率递增折减
  host.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-2,#141821)">
    <span style="font-size:12px;color:var(--text-2)">灵感工坊 ×${n} · 自动蒸馏</span>
    <button class="mini-btn" data-atrium-switch style="cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:4px 16px;font-size:12px;background:${on ? 'var(--good,#3fb950)' : 'var(--red,#f85149)'};color:#fff">${on ? '开' : '关'}</button>
    <span style="font-size:11px;color:var(--text-3)">每秒 -${fmt(epS)} EP → +${fmt(rpS)} RP（EP 不足自动暂停，回升继续）</span>
  </div>`;
  const btn = host.querySelector('[data-atrium-switch]');
  if (btn) btn.addEventListener('click', () => {
    setConverterEnabled('atrium', !converterEnabled('atrium'));
    save(S);
    dirty.shop = true;
    dirty.rp = true;
    renderAtriumSwitch(host);
  });
}

// v3.3.1 反馈②：异兽孵化「购买/升级」移入设施区（异兽页只保留开关）
// v3.3.2 反馈①④：改标准升级项样式——去独立升级按钮（整卡点击）、文案只写当前总计、
// 升级后原地更新（卡位置不漂移），与灵感工坊卡同范式
export function renderHatchUpgrade(container) {
  if (!container) return;
  const unlocked = S.ptAutoHatch === true;
  const discovered = unlocked || (S.resDiscovered && S.resDiscovered.pt) || (S.pt || 0) > 0 || (S.ptHatchLv || 1) > 1;
  let el = container.querySelector('.hatch-upg');
  if (!discovered) { if (el) el.remove(); return; }
  const lv = S.ptHatchLv || 1;
  const cost = ptHatchUpgCost(lv);
  const afford = (S.ep || 0) >= cost;
  const desc = unlocked
    ? `自动孵化：-${fmt(5000 * lv)} EP/s → +${fmt(0.15 * lv)} PT/s`
    : `自动孵化：-${fmt(5000)} EP/s → +${fmt(0.15)} PT/s`;
  if (!el) {
    el = document.createElement('div');
    el.className = 'hatch-upg item';
    el.dataset.hatchUpg = '1'; // 整卡点击购买/解锁（与灵感工坊卡同范式）
    container.appendChild(el); // 固定在灵感工坊卡之后（renderAtriumDistill 先渲染并 insertBefore 本卡）
    if (!container._hatchDelegated) {
      container._hatchDelegated = true;
      container.addEventListener('click', (ev) => {
        const t = ev.target.closest ? ev.target.closest('[data-hatch-upg]') : null;
        if (!t) return;
        const lvl = S.ptHatchLv || 1;
        const c = ptHatchUpgCost(lvl);
        if ((S.ep || 0) < c) return;
        S.ep -= c;
        S.ptHatchLv = lvl + 1;
        if (S.ptAutoHatch !== true) S.ptAutoHatch = true; // 首次购买即解锁自动孵化
        S.totalBuys = (S.totalBuys || 0) + 1;
        S.lazySince = null;
        save(S);
        log(`异兽孵化工坊 ×${S.ptHatchLv}：-${fmt(5000 * S.ptHatchLv)} EP/s → +${fmt(0.15 * S.ptHatchLv)} PT/s`, 'good');
        dirty.pets = true;
        renderHatchUpgrade(container);
      });
    }
  }
  el.innerHTML = `<div class="name"><span>异兽孵化工坊</span>${unlocked ? `<span class="count mono">×${lv}</span>` : ''}</div>
    <div class="desc">${desc}</div>
    <div class="cost mono">${fmt(cost)} EP</div>`;
  el.title = unlocked ? '点击升级孵化工坊' : '点击购入并解锁自动孵化';
  el.classList.toggle('cant', !afford);
}
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
  // v2.8.18 ④：净化节点等卡面主句保持数值简洁，详细机制放悬浮 title
  if (u.cat === 'purifier') div.title = `净化节点：每秒清除 ${u.rate || 0}% 矩阵腐化；腐化越低，全局产出惩罚越弱（每 60 秒结算一次）。`;
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
      <div class="desc">${storageDesc(u)}</div>
      <div class="cost mono">已满级</div>`;
    return div;
  }
  const cost = bulkCostCalc(u, 1); // v2.3.1 ⑥：固定 ×1
  const afford = u.dmCost ? (S.dm || 0) >= cost : S.ep >= cost; // v2.8.21 ⑥：DM 消耗升级
  div.className = 'item' + (!afford ? ' cant' : '');
  const cpsStr = u.cps > 0 ? `${fmt(u.cps * globalMult())} EP/s` : storageDesc(u); // v3.0.3 后续①：storage desc 动态化
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">${levelCountHtml(u)}</span></div>
    <div class="desc">${cpsStr}</div>
    <div class="cost mono">${fmt(cost)}${u.dmCost ? ' DM' : ''}</div>`;
  return div;
}

// 购后原地更新单卡片（E 规范：可叠加项仅更新 ×N 计数与成本，不移动不重建）
export function refreshShopItem(u) { updateShopItem(u); } // v2.6.6 ③：AI/混沌买入后单卡原地刷新（不整面板重建）

// v3.0.9 反馈④：升级文案统一「变化量」口径——不显示购买后总量、不复读百分比，
// 统一展示「购买这一级，我的 XX 实际 +多少」。实现：临时 +1 级 → 重算 → 还原，取前后差值。
function withTempLv(bucket, id, fn) {
  if (!S[bucket]) S[bucket] = {};
  const b = S[bucket];
  const had = Object.prototype.hasOwnProperty.call(b, id);
  const cur = b[id] || 0;
  b[id] = cur + 1;
  try { return fn(); } finally { if (had) b[id] = cur; else delete b[id]; } // 原不存在的键直接删除，不往存档写 0
}
// 差值文案：'+1.2K EP/s' / '-12.5 EP/s'；无实际变化（重复购买一次性效果等）返回 null
function deltaStr(diff, unit) {
  const abs = Math.abs(diff);
  if (!(abs > 1e-9)) return null;
  return `${diff > 0 ? '+' : '-'}${fmt(abs)}${unit}`;
}
// 从静态 desc 剥离「+5%/级」「×1.04/级」「-4%/s」等百分比尾巴，只留效果名
function stripPct(desc) {
  return (desc || '').replace(/\s*[+×-][\d.]+(%|\/级|\/s)?.*$/, '').trim();
}

// v3.0.8：存储类卡面统一口径 → v3.0.9 反馈④：改为「+变化量」（当前 1.05M 买下一级 +234K 就写 +234K，不写总量）
const EP_STORAGE_IDS = ['storage', 'reserve_bin', 'deep_bin', 'cache'];
// 资源仓库（RP/DM/PT 上限）同口径：{资源} 上限 +{本级增量}——v3.0.9 修正原「+购买后总量」误读（+2900 实为总量，真实增量 +400）
const VAULT_RES = [['rp_vault', 'RP', () => rpCap()], ['dm_vault', 'DM', () => dmCap()], ['pt_vault', 'PT', () => ptCap()]];
function vaultDesc(u) {
  const row = VAULT_RES.find(([id]) => id === u.id);
  if (!row) return null;
  const [, label, capFn] = row;
  const before = capFn();
  const after = withTempLv('upgrades', u.id, capFn);
  return `${label} 上限 +${fmt(after - before)}`;
}
// 线程强化变化量：cpu/gpu → 线程产出差值；subsist1-3/mem → 线程消耗差值；cache → 存储差值 + 消耗差值
function threadEffectDesc(u) {
  const isOut = u.id === 'cpu' || u.id === 'gpu';
  const isCost = ['subsist1', 'subsist2', 'subsist3', 'mem'].includes(u.id);
  if (!isOut && !isCost && u.id !== 'cache') return null;
  const label = stripPct(u.desc) || (isOut ? '线程产出' : '线程消耗');
  if (u.id === 'cache') {
    const capBefore = epStorageCap();
    const capAfter = epCapAfterBuy(u.id);
    const s = deltaStr(withTempLv('upgrades', u.id, staffSalaryPerSec) - staffSalaryPerSec(), ' EP/s');
    return `EP 存储上限 +${fmt(capAfter - capBefore)}${s ? '，线程消耗 ' + s : ''}`;
  }
  const metric = isOut ? staffOutputPerSec : staffSalaryPerSec;
  const d = deltaStr(withTempLv('upgrades', u.id, metric) - metric(), ' EP/s');
  return d ? `${label} ${d}` : null; // 一次性效果已生效 → 重复购买无变化，回落静态 desc
}
function storageDesc(u) {
  const vd = vaultDesc(u);
  if (vd) return vd;
  const th = threadEffectDesc(u);
  if (th) return th;
  if (!EP_STORAGE_IDS.includes(u.id)) return u.desc || '';
  try {
    const before = epStorageCap();
    return `EP 存储上限 +${fmt(epCapAfterBuy(u.id) - before)}`;
  } catch { return u.desc || ''; }
}

// v2.8.18 ③：购后满级/一次性已购 → 移入组最下侧「已升级」折叠区（不重建列表，无闪烁）
function moveToOwnedFold(u, el) {
  const cont = THREAD_IDS.includes(u.id) ? threadContainer : shopContainer;
  if (!cont || !cont.__ownedBoxes || !cont.__itemGroup) return false;
  const gi = cont.__itemGroup[u.id];
  const box = cont.__ownedBoxes[gi];
  if (!box || el.parentElement === box) return false;
  box.appendChild(el);
  const header = box.previousElementSibling;
  const cnt = header && header.querySelector ? header.querySelector('.owned-count') : null;
  if (cnt) cnt.textContent = '×' + box.children.length;
  if (header) header.style.display = '';
  return true;
}

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
      <div class="desc">${storageDesc(u)}</div>
      <div class="cost mono">已满级</div>`;
    moveToOwnedFold(u, el); // v2.8.18 ③：移入折叠区
    return;
  }
  const cost = bulkCostCalc(u, 1); // v2.3.1 ⑥：固定 ×1
  const cnt = el.querySelector('.count');
  if (cnt) cnt.textContent = levelCountHtml(u);
  const c = el.querySelector('.cost');
  if (c) c.textContent = fmt(cost) + (u.dmCost ? ' DM' : ''); // v2.8.21 ⑥
  el.classList.toggle('cant', u.dmCost ? (S.dm || 0) < cost : S.ep < cost);
  const d = el.querySelector('.desc');
  if (d) d.textContent = `${u.cps > 0 ? fmt(u.cps * globalMult()) + ' EP/s' : storageDesc(u)}`; // v3.0.3 后续①：storage desc 动态化（购后原地更新同步）
  el.classList.toggle('cant', S.ep < cost);
}

// ========== 渲染：线程强化（可叠加，成本升序） ==========
export function renderThreadShop(container) {
  threadContainer = container;
  container.innerHTML = '';
  threadItemEls.clear();
  const threadMods = UPGRADES.filter(u => THREAD_IDS.includes(u.id));
  // v2.8.23 ①：线程强化链序按解锁门槛（base 升序）——原定义序（subsist1→subsist2→subsist3→cpu…）与门槛错位：
  // CPU（门槛 6e6）排在消耗三项之后，用户「该解锁的没解锁、不该同时解锁的一串弹」；base 为静态值（不随购买上浮），按 base 排序稳定
  const sorted = threadMods.slice().sort((a, b) => a.base - b.base);
  // v2.3 渐进披露链：同升级商店口径（定义序即链序）
  const split = chainSplit('thread', sorted, u => (S.upgrades[u.id] || 0) > 0, S);
  // v2.3.1 ⑤（rev18 9.3 分组表）：消耗优化在前（链首能量合剂在此组）、产出强化在后
  const COST_IDS = ['subsist1', 'subsist2', 'subsist3', 'mem', 'cache']; // 能量合剂/循环供氧/生物打印餐/内存扩容/缓存优化
  // v2.7.2：subsist1/2/3/mem 一次性（maxLevel:1，效果按拥有判定，多购无效已封顶）；cache 无限（存储上限 +5000/级）消耗 -25% 一次性
  renderChainedGroups(container, split, [
    { title: '消耗优化', test: u => COST_IDS.includes(u.id) },
    { title: '产出强化', test: () => true }, // CPU 超频 / GPU 加速
  ], makeThreadItem, (u, el) => threadItemEls.set(u.id, el), { verb: '升级' }); // v2.8.18 ③：已购终态收折叠
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
      <div class="desc">${storageDesc(u)}</div>
      <div class="cost mono">已满级</div>`;
    return div;
  }
  const cost = threadCost(u);
  const afford = S.ep >= cost;
  div.className = 'item' + (!afford ? ' cant' : '');
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count">×${owned}</span></div>
    <div class="desc">${storageDesc(u)}</div>
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
      <div class="desc">${storageDesc(u)}</div>
      <div class="cost mono">已满级</div>`;
    moveToOwnedFold(u, el); // v2.8.18 ③：移入折叠区
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
  const enabled = converterEnabled('vehicles'); // v3.3.4 反馈①：与快捷开关/tick 同一状态源
  const dmTxt = `当前 DM: ${(S.dm || 0).toFixed(2)}`;
  const flow = probeFlowPerSec();
  let info, tip;
  if (rate > 0) {
    // v3.3.6 反馈①：显示口径与实扣一致——按 DM 剩余容量钳制，并标明原因
    // （旧实现按理论产能全额展示/扣费，实际只入账 1000 DM，消耗看起来大得离谱且大半白烧）
    const interval = BALANCE.vehicles.collectInterval || 60;
    const epShown = flow.affordable ? flow.epPerSec : flow.needPerCycle / interval;
    const dmShown = flow.dmPerSec;
    const reason = !flow.affordable ? '（EP 不足，本周期跳过）' : (flow.limited ? '（受 DM 上限限制）' : '');
    info = `${dmTxt} · 探采 -${fmt(epShown)} EP/s → +${fmtDmPerSec(dmShown)} DM/s${reason}`;
    tip = `探采消耗 EP 换取深渊物质（当前每 1 DM 消耗 ${fmt(flow.epPerDm)} EP，随总载具数逐辆 ×${BALANCE.vehicles.epPerDmGrowth} 递增）\n`
      + `每辆摩托队/车队/轨道器/潜航器 0.05/0.1/0.25/0.5 DM/min；深渊鱼缸/集市/研究/班组可提升采集效率\n`
      + `理论产能 ${fmtDmPerSec(flow.nominalDmPerSec)} DM/s = 基础 ${fmtDmPerSec(vehicleDmPerMin() / 60 / Math.max(1e-9, vehicleRateMult()))} × 加成 ${vehicleRateMult().toFixed(2)}×（班组/研究/鱼缸/集市）\n`
      + `DM 剩余容量 ${flow.room.toFixed(2)} → 本周期只采 ${Math.min(flow.wantPerCycle, flow.room).toFixed(2)} DM，按实际采集量扣 EP（不再为溢出量付费）\n`
      + `EP 不足或 DM 满仓时本轮跳过，回升/扩容后自动恢复采集\n`
      + (flow.nominalDmPerSec * interval > dmCap()
        ? '⚠ 当前产能已超过 DM 存储上限：班组/建筑加成的边际收益为 0（只会更快满仓），可考虑撤回部分线程'
        : '');
  } else {
    info = dmTxt; // v2.4.2：DM 精确到小数
    tip = enabled ? '购买载具后每 60 秒自动采集深渊物质' : '探采已暂停：点击「已暂停」恢复采集（EP 消耗同步恢复）';
  }
  const dmFull = rate > 0 && S._dmFull && (S.dm || 0) >= dmCap() - 1e-9;
  // v3.3.4 反馈①：只建一次 DOM，之后原地改文本/class——原实现每次刷新都 innerHTML 重建，
  // 每秒重建一次按钮导致 hover 过渡反复重启（鼠标移上去闪烁）
  let infoEl = el.querySelector('.probe-info');
  if (!infoEl) {
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="probe-info"></span><b class="probe-warn" style="color:var(--warn);display:none">DM 已满，采集暂停（星尘金库扩容可提升上限）</b>
        <button class="btn probe-toggle" data-probe-toggle="1" style="padding:2px 10px;font-size:11px"></button>
      </div>`;
    infoEl = el.querySelector('.probe-info');
    const btn = el.querySelector('[data-probe-toggle]');
    if (btn) btn.addEventListener('click', () => {
      // v3.3.4 反馈①：统一走 setConverterEnabled（写 converterOn + _probeEnabled 镜像），
      // 避免「页头开关只改 _probeEnabled，而采购率读 converterOn」导致开启后仍不采集
      setConverterEnabled('vehicles', !converterEnabled('vehicles'));
      save(S); // v2.8.30 ②：开关即时落盘（刷新保持状态）
      updateVehicleCollectHeader();
      dirty.top = true;
    });
  }
  if (infoEl.textContent !== info) { infoEl.textContent = info; el.title = tip; }
  const warnEl = el.querySelector('.probe-warn');
  if (warnEl) warnEl.style.display = dmFull ? '' : 'none';
  const tb = el.querySelector('[data-probe-toggle]');
  if (tb) {
    const stateText = enabled ? '探采中' : '已暂停';
    if (tb.textContent !== stateText) tb.textContent = stateText;
    tb.classList.toggle('off', !enabled);
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
    else shopToast(`EP 不足：${u.name} 需要 ${fmt(Math.ceil(u.base * Math.pow(1.30, S.upgrades[u.id] || 0) * costMult()))} EP`); // v2.8.23：与 buyVehicle 1.30 口径一致
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

// v2.8.15：DM/s 格式化——极小数保留足够精度（0.0008 而非 0）
function fmtDmPerSec(v) {
  if (v <= 0) return '0';
  if (v < 0.01) return v.toFixed(4).replace(/\.?0+$/, '');
  return Number(v.toFixed(3)).toString();
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
  if (protoMult > 1) div.title = '载具协议 ×1.5（DM 采集速率提升）'; // v2.8.30：协议加成移入悬浮，卡片主文案精简
  const cpsEach = u.cps * globalMult() * protoMult;
  // v2.3.2 反馈②：载具命名彩蛋输入框按缺陷口径移除（用户反馈「外勤摩托队旁异常输入框」），
  // 命名 input / change 事件 / name_vehicle 彩蛋触发零残留；外勤区域不再渲染任何 input 元素。
  // v2.8.30：探采卡文案精简为两行（消耗负红 / 产出正绿），障碍信息移除
  const dmIdx = BALANCE.vehicles.ids.indexOf(u.id);
  const dmRate = dmIdx >= 0 ? BALANCE.vehicles.dmRates[dmIdx] : 0;
  // v3.3.6 反馈①：卡片单价与页头同口径——含「载具汇率 ×1.15^总载具数」与「班组/研究/鱼缸/集市乘区」；
  // 原卡片只显示基础单价（12.5 EP/s），页头却按 6600× 乘区显示 179.58M/s，两者差 6 个数量级
  const vehMult = vehicleRateMult();
  const probeEp = dmRate > 0 ? (dmRate * vehicleEpPerDm() * vehMult / 60) : 0;
  if (probeEp > 0) {
    div.title = `基础单价 ${Number((dmRate * BALANCE.vehicles.epPerDm / 60).toFixed(2))} EP/s × 汇率 ${fmt(vehicleEpPerDm() / BALANCE.vehicles.epPerDm)} × 加成 ${vehMult.toFixed(2)}× = ${fmt(probeEp)} EP/s（单辆；DM 满仓时按剩余容量结算，可能低于名义值）`;
  }
  const lines = probeEp > 0
    ? `<div class="veh-line" style="color:var(--bad)">−${fmt(probeEp)} EP/s</div><div class="veh-line" style="color:var(--good)">+${fmtDmPerSec(dmRate * vehMult / 60)} DM/s</div>`
    : `<div class="veh-line">${fmt(cpsEach)} EP/s</div>`;
  div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count">×${owned}</span></div>
    <div class="desc">${lines}</div>
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
  const renderAvail = (o, reqOk) => {
    const resOk = (S.rp || 0) >= o.cost && (S.ep || 0) >= (o.epCost || 0);
    const can = reqOk && resOk;
    const hint = !reqOk ? '（需先解锁前置）' : (!resOk ? '（RP/EP 不足）' : '');
    // v2.8.10：可升级高亮（accent 边框）、不可升级灰显
    return `<div class="off-upg" data-buy="${o.id}" style="${can ? 'cursor:pointer;border-color:var(--accent,#4a9eff)' : 'opacity:.5;cursor:not-allowed'}">
    <span>${o.name}<br><span style="color:var(--text-3)">${o.desc}${hint}</span></span>
    <span class="cost">${o.cost} RP + ${fmt(o.epCost || 0)} EP</span></div>`;
  };
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
  // v3.0.7 反馈②：一次性设施不是「EP 换资源」转化项，不再受「产出不足」闸门拦截
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

// v3.0.8：设施卡存储文案同口径 → v3.0.9 反馈④：数据中心「EP 存储上限 +{本级增量}」，其余设施原样
function bldDesc(b) {
  const lv = buildingLevel(b, S);
  const text = b.desc[lv] || '';
  if (b.id !== 'datacenter') return text;
  try { const before = epStorageCap(); return text.replace(/EP 存储上限 \+[\d,]+/, `EP 存储上限 +${fmt(epCapAfterBuy('datacenter', 'building') - before)}`); }
  catch { return text; }
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
    <div class="desc">${bldDesc(b)}</div>
    <div class="cost mono">${fmt(cost)} EP</div>`;
  return div;
}

function updateBldItem(b) {
  const el = bldItemEls.get(b.id);
  if (!el) return;
  const lv = buildingLevel(b, S);
  const cost = buildingCost(b, S, costMult());
  el.querySelector('.count').textContent = `Lv.${lv}/${b.levels}`;
  el.querySelector('.desc').textContent = bldDesc(b);
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
    const c = el.querySelector('.cost');
    if (c && c.textContent !== fmt(cost)) c.textContent = fmt(cost); // v2.8.25：thread 成本显示同步（含钳制动态价）
  }
  // v2.8.25 ④：探采平台（遗物 tab）灰态/成本同步——此前仅购后单卡刷新，EP 变化（其他购买/收入）不刷新 → 图二「EP 不够还显示可购买」
  for (const [id, el] of vehicleItemEls) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    const cost = Math.ceil(u.base * Math.pow(1.30, S.upgrades[u.id] || 0) * costMult()); // 同 buyVehicle 口径
    el.classList.toggle('cant', S.ep < cost);
    const c = el.querySelector('.cost');
    if (c) c.textContent = fmt(cost);
  }
  for (const [id, el] of dmItemEls) {
    const u = UPGRADES.find(x => x.id === id);
    if (!u) continue;
    el.classList.toggle('cant', (S.dm || 0) < u.dmCost);
  }
  // v2.8.26 ④：RP 加成组（研究点 tab）灰态/成本同步——此前 RP 变化后不刷新（「到处都出现」可购判断问题之一）
  for (const [id, el] of rpFamilyItemEls) {
    const u = (BALANCE.buildingsV21 || []).find(x => x.id === id);
    if (!u) continue;
    const cost = rpFamilyCost(u);
    el.classList.toggle('cant', (S.rp || 0) < cost);
    const c = el.querySelector('.cost');
    if (c && c.textContent !== fmt(cost) + ' RP') c.textContent = fmt(cost) + ' RP';
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
  // v2.8.26：研究点「RP 加成」组灰态每秒刷新（此前仅渲染时判断——同 tab 内买研究升级后 RP 减少，RP 加成卡仍亮）
  for (const [id, el] of rpFamilyItemEls) {
    const u = (BALANCE.buildingsV21 || []).find(x => x.id === id);
    if (!u) continue;
    const cost = rpFamilyCost(u);
    el.classList.toggle('cant', S.rp < cost);
    const c = el.querySelector('.cost');
    if (c) c.textContent = `${fmt(cost)} RP`;
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

// v3.0.8：效能建筑扩容项同样走「EP 存储上限 +{购买后总量}」单行口径（多效果建筑保留其他效果文字）
const V21_CAP_EXTRA = {
  abyss_reservoir: '，DM 采集效率 +15%/级',
  resonance_chamber: '，全局产出 +3%/级',
  dm_condenser: '，DM 采集效率 +30%/级',
};
function v21HasCapAdd(b) {
  const fxs = Array.isArray(b.fx) ? b.fx : (b.fx ? [b.fx] : []);
  return fxs.some(f => f.key === 'capAdd');
}
function v21Desc(b) {
  if (!v21HasCapAdd(b)) return b.desc;
  try { const before = epStorageCap(); return `EP 存储上限 +${fmt(epCapAfterBuy(b.id, 'building') - before)}${V21_CAP_EXTRA[b.id] || ''}`; } // v3.0.9 反馈④：总量→变化量
  catch { return b.desc; }
}
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
      <div class="desc">${v21Desc(b)}</div>
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
      <div class="desc">${v21Desc(b)}</div>
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
  const d = el.querySelector('.desc');
  if (d) d.textContent = v21Desc(b); // v3.0.8：扩容项购后同步「EP 存储上限 +总量」
  el.classList.toggle('cant', S.ep < cost);
}

function v21RealList() { return V21_BUILDINGS.filter(b => b.via !== 'upgrade'); } // 镜像项走升级商店；v3.1.1 反馈⑧：组 D 六座扩容建筑接回「存储与扩容」分区（v2.8.27 移除后一直无购买入口）

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
  v21Section = buildOwnedSection('v21-bld-list', container, '满级'); // v2.8.18：verb 去重复「已」
  const real = v21RealList();
  const maxed = real.filter(b => v21Maxed(b, S));
  maxed.sort((a, b) => boughtOrderIndex(S, b.id) - boughtOrderIndex(S, a.id));
  for (const b of maxed) {
    const div = document.createElement('div');
    div.className = 'item owned-item';
    div.title = '族内封顶：建筑数量受控，成长靠等级';
    div.innerHTML = ownedItemHtml(b.name, v21Desc(b), `Lv.${capOf(b, S)}/${capOf(b, S)} 满`); // v2.2 动态上限
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
      ({ title, test: b => (b.cat || '') === letter })), // v2.8.10：组标题去「字母 · 」前缀
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
        el.innerHTML = ownedItemHtml(b.name, v21Desc(b), `Lv.${capOf(b, S)}/${capOf(b, S)} 满`); // v2.2 动态上限
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
    log(msg.split('\n')[0], 'good'); // v2.8.15：命运选择内容同步写入系统日志（弹窗内容）
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
          <div class="desc">${v21Desc(b)}</div>
          <div class="cost mono" style="color:var(--purple)">✦ 命运已定</div>`;
      } else {
        div.className = 'item v21 cant';
        div.title = `已被「${vowName}」封印：本局无法再立其他誓`;
        div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono" style="color:var(--text-3)">封印</span></div>
          <div class="desc">${v21Desc(b)}</div>
          <div class="cost mono" style="color:var(--text-3)">已被 ${vowName} 封印</div>`;
      }
    } else {
      // open：三栋同显可购，明示互斥
      const afford = S.ep >= 3e5;
      div.className = 'item v21' + (!afford ? ' cant' : '');
      div.title = '三选一立誓：购买任意一栋后其余两栋封印；不买则保持中立（可走到终章）';
      div.innerHTML = `<div class="name"><span>${b.name}</span><span class="count mono">1 级封顶</span></div>
        <div class="desc">${v21Desc(b)}</div>
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
  // v3.1.1 反馈③：族升级属后期玩法——首档需里程碑 9，未达标整节隐藏（占位行删除口径，直到可达再出现）
  const famMilestone = Math.min(...Object.values(BALANCE.familyUpgradeTiers).map(c => c.tiers[0].milestone));
  const famShown = anchorShown('rp', S) && Object.keys(S.milesDone || {}).length >= famMilestone;
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
// v2.8.28：研究升级分类 + 分批次解锁（参考科技树/升级商店的类目分区与渐进揭示）
// 批次：产出强化（开局显现）→ 资源与消耗（累计 4 级）→ 深渊终局（累计 4 级）
const RP_GROUPS = [
  // v3.0.3：许愿池 wish_well 已从研究升级移入通用设施（BALANCE.buildings）——不再在研究点 tab 渲染
  { key: 'prod',  name: '产出强化',  ids: ['rp_entropy', 'rp_matrix', 'rp_singularity', 'rp_offline'], unlock: null },
  { key: 'res',   name: '资源与消耗', ids: ['rp_wage', 'rp_storage', 'rp_dm', 'rp_faith'],             unlock: { prev: 'prod', need: 4 } },
  { key: 'abyss', name: '深渊终局',  ids: ['rp_delve', 'rp_rift'],                                      unlock: { prev: 'res', need: 4 } },
];
let rpFold = {}; // 类目折叠状态（会话级，不落盘）

function rpGroupLv(key) {
  const g = RP_GROUPS.find(x => x.key === key);
  if (!g) return 0;
  return g.ids.reduce((n, id) => n + ((S.rpTheories && S.rpTheories[id]) || 0), 0);
}
function rpGroupShown(g) {
  if (!g.unlock) return true;
  return rpGroupLv(g.unlock.prev) >= g.unlock.need;
}
// v3.0.9 反馈④：研究升级文案改为「计算后变化量」——临时 +1 级重算差值，
// 展示「买入这一级实际 +多少」而非复读「+5%/级 → 下一级 +5%」；
// 无实时口径的项（信仰/离线/深潜/裂隙）保留「下一级 +X%」（该百分比即本级变化量）
const RESEARCH_METRIC = {
  ep:      { fn: () => computeCps(),        unit: ' EP/s' },
  thread:  { fn: () => staffOutputPerSec(), unit: ' EP/s' },
  global:  { fn: () => computeCps(),        unit: ' EP/s' },
  wage:    { fn: () => staffSalaryPerSec(), unit: ' EP/s' },
  storage: { fn: () => epStorageCap(),      unit: '' },
  dm:      { fn: () => vehicleDmPerMin(),   unit: ' /min' },
};
function researchDeltaDesc(u, maxed) {
  if (maxed || !u.fx) return null;
  const label = stripPct(u.desc) || u.name;
  const m = RESEARCH_METRIC[u.fx.key];
  const pct = `${u.fx.v > 0 ? '+' : ''}${Math.round(u.fx.v * 100)}%`;
  if (!m) return `${label} 下一级 ${pct}`;
  const d = deltaStr(withTempLv('rpTheories', u.id, m.fn) - m.fn(), m.unit);
  return d ? `${label} ${d}` : `${label} 下一级 ${pct}`; // 差值为 0（如无线程时薪酬协商）回落百分比
}
export function renderResearchUpgrades(container) {
  if (!container) return;
  const sig = RP_GROUPS.map(g =>
    `${g.key}:${rpGroupShown(g) ? 1 : 0}:${rpFold[g.key] ? 1 : 0}:${g.ids.map(id => (S.rpTheories?.[id] || 0)).join('.')}`
  ).join('|') + `:${Math.floor(S.rp || 0)}`; // v2.8.13：RP 变化即重建——灰态/可购判定不再滞后
  if (container._lastSig === sig) return; // 增量：内容未变不重建（v2.6.7 纪律）
  container._lastSig = sig;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const g of RP_GROUPS) {
    if (!rpGroupShown(g)) continue; // v3.1.1 反馈②：未达解锁条件的批次整体不渲染（占位行删除，直到解锁才出现）
    const title = document.createElement('div');
    title.className = 'rp-group-title';
    title.dataset.rpFold = g.key;
    title.innerHTML = `<span class="rp-fold-arrow">${rpFold[g.key] ? '▶' : '▼'}</span><b>${g.name}</b>`;
    title.title = g.ids.map(id => (BALANCE.researchUpgs.find(u => u.id === id)?.name || id)).join(' / ');
    frag.appendChild(title);
    if (rpFold[g.key]) continue; // 折叠：仅保留标题
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const id of g.ids) {
      const u = (BALANCE.researchUpgs || []).find(x => x.id === id);
      if (!u) continue;
      const lv = (S.rpTheories && S.rpTheories[u.id]) || 0;
      const maxed = lv >= u.cap;
      const cost = researchUpgCost(u.id);
      const afford = (S.rp || 0) >= cost;
      const div = document.createElement('div');
      div.className = 'item' + (maxed ? ' v21 owned-item' : (!afford ? ' cant' : ''));
      div.dataset.research = u.id;
      div.title = maxed ? '研究已达上限' : (afford ? `RP 购买：${u.desc}` : `RP 不足（需 ${fmt(cost)} RP）`); // v2.8.13：卡片不再重复展示当前 RP（顶部已有「当前 RP」）
      const delta = researchDeltaDesc(u, maxed); // v3.0.9 反馈④：变化量口径
      div.innerHTML = `<div class="name"><span>${u.name}</span><span class="count mono">${lv}/${u.cap}</span></div>
        <div class="desc">${delta || `${u.desc}${maxed ? '（已满级）' : ''}`}</div>
        <div class="cost mono">${maxed ? '✦ 已满级' : fmt(cost) + ' RP'}</div>`;
      grid.appendChild(div);
    }
    frag.appendChild(grid);
  }
  container.appendChild(frag);
  if (!container._bound) {
    container._bound = true;
    container.addEventListener('click', (ev) => {
      const foldEl = ev.target.closest('[data-rp-fold]');
      if (foldEl && container.contains(foldEl)) {
        rpFold[foldEl.dataset.rpFold] = !rpFold[foldEl.dataset.rpFold];
        renderResearchUpgrades(container);
        return;
      }
      const el = ev.target.closest('[data-research]');
      if (!el || !container.contains(el)) return;
      const r = buyResearchUpgrade(el.dataset.research);
      if (r.ok) renderResearchUpgrades(container);
      else if (r.reason) { /* RP 不足走卡面灰态，不弹 toast（v2.8.2 ⑪ 纪律） */ }
    });
  }
}
