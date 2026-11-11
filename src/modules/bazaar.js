// v3.0.0 大模块：深渊集市——资源兑换 + 汇率波动 + 品质限购 + 集市等级（跨周期）
// 参考 Kittens Game 贸易/资源转换（多余资源换稀缺资源、汇率波动、限购），
// 解决本作中期痛点：EP 顶到存储上限没处花、RP/DM/信仰/余烬/虚空碎片彼此孤立无兑换通道。
//
// v3.12.3 反馈② 重做：
//   · 汇率与库存改为 30 分钟整体刷新（每次刷新重掷摊位 / 品质 / 汇率并补满库存）；
//   · 每次只上架 3~8 个摊位，每件商品带 6 档品质（库存 / 价格 / 稀有度不同）；
//   · 集市等级单独一行，等级抬高汇率波动下限与高品质概率；
//   · 回响刷新按钮需在升级商店购买「回响账簿」后出现，且与 EP 刷新视觉区分；
//   · 二次确认改为独立拨动开关；
//   · 交付的资源未解锁时该摊位灰显并标「未解锁」，不可购买。
import { S, save } from '../state.js';
import { fmt, epStorageCap, addRp, addDm, addPt, researchMult } from './economy.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：汇率倍率 → 带符号百分比
import { policyMult } from '../data/policies.js';
import { faithCap } from '../data/religions.js';
import { delveUnlocked } from './delve.js';
import { anchorDone, anchorShown } from './disclosure.js';
import { moduleBuyState, buyModuleUnlock, moduleUnlockCard } from './moduleUnlocks.js'; // v3.12.0 反馈⑬：集市改为职级点买断
import {
  BAZAAR, QUALITY, qualityOf, RES_LABEL, RES_SHORT, dealerById, bazaarTier, bazaarNextTierNeed,
  rollRate, rollQuality, rollDealerCount, bazaarRefreshEpCost,
} from '../data/bazaar.js';

let logFn = null;
let toastFn = null;
export function setBazaarLogFn(fn) { logFn = fn; }
export function setBazaarToastFn(fn) { toastFn = fn; }
function blog(msg, cls) { if (logFn) logFn(`[集市] ${msg}`, cls); }

// ========== 状态初始化（幂等，兼容旧档） ==========
export function ensureBazaar() {
  S.bazaar = S.bazaar || {};
  const b = S.bazaar;
  if (b.trades === undefined) b.trades = 0;
  if (b.refreshCount === undefined) b.refreshCount = 0;
  if (b.marketTimer === undefined) b.marketTimer = 0;
  // v3.12.3：旧档的 shuffleTimer / regenTimer 不再使用（两套计时器已合并为市场整体刷新）
  if (!b.rates || typeof b.rates !== 'object') b.rates = {};
  if (!b.stock || typeof b.stock !== 'object') b.stock = {};
  if (!b.quality || typeof b.quality !== 'object') b.quality = {};
  if (!Array.isArray(b.lineup)) b.lineup = [];
  if (!b.events || typeof b.events !== 'object') b.events = { hot: null, cold: null }; // v3.0.3 反馈②：每轮随机特惠/涨价商人
  if (b.skipConfirm === undefined) b.skipConfirm = false; // v3.0.3 反馈③：二次确认可关
  // 旧档 / 首次开张没有摊位 → 立刻摇一次市场
  if (b.lineup.length === 0) rollMarket();
  return b;
}

// ========== 解锁 ==========
export function bazaarUnlocked() { return !!(S.bazaar && S.bazaar.unlocked); }
// v3.12.0 反馈⑬：集市不再「免费挂牌」，改为首次晋升后在职级点商店买断。
// 价格 / 可见性 / 扣费 / 跨局保留全部委托 modules/moduleUnlocks.js（单一真源）。
export function canUnlockBazaar() { return moduleBuyState('bazaar').ok; }
export function unlockBazaar() {
  const r = buyModuleUnlock('bazaar');
  if (r.ok) {
    ensureBazaar();
    blog('深渊集市开张：消耗 PP，摊位每 30 分钟换一批', 'good');
    if (toastFn) toastFn('🏪 深渊集市开张：富余资源可以在这里换稀缺资源了');
  }
  return r;
}

// 回响刷新按钮的解锁态（升级商店一次性购买「回响账簿」）
export function echoRefreshUnlocked() {
  return ((S.upgrades || {})[BAZAAR.echoUpgradeId] || 0) > 0;
}

// ========== 读侧 ==========
export function bazaarTrades() { return (S.bazaar && S.bazaar.trades) || 0; }
export function bazaarTierNow() { return bazaarTier(bazaarTrades()); }
// 库存上限 = 品质库存 + 政策（自由贸易 +2 —— 允许 0 或负，负向不跌破 0）
export function bazaarStockMax(d) {
  const bonus = policyMult('bazaarStock') - 1;
  const base = qualityOf(qualityOfDealer(d.id)).stock;
  return Math.max(0, base + Math.round(bonus));
}
export function qualityOfDealer(id) {
  // 刻意不调 ensureBazaar：本函数被 rollMarket 内部（补库存）调用，再进 ensureBazaar 会成环。
  const b = S.bazaar || {};
  return (b.quality && b.quality[id]) || 1;
}
export function bazaarRateOf(id) {
  ensureBazaar();
  const r = S.bazaar.rates[id];
  return r > 0 ? r : 1;
}
export function bazaarStockOf(id) {
  ensureBazaar();
  return S.bazaar.stock[id] || 0;
}
// 本次上架的摊位（顺序稳定，仅供展示遍历）
export function bazaarLineup() {
  ensureBazaar();
  return S.bazaar.lineup.map(dealerById).filter(Boolean);
}

// v3.0.3 反馈②：每轮随机「特惠/涨价」商人——在市场刷新时重掷，让「哪类商品涨价」显性随机
export function rollMarketEvents() {
  ensureBazaar();
  const ids = S.bazaar.lineup;
  if (ids.length < 2) { S.bazaar.events = { hot: null, cold: null }; return; }
  const shuffled = ids.slice().sort(() => Math.random() - 0.5);
  S.bazaar.events = { hot: shuffled[0], cold: shuffled[1] };
}
export function marketEventOf(id) {
  const ev = (S.bazaar && S.bazaar.events) || {};
  return ev.hot === id ? 1.2 : ev.cold === id ? 0.8 : 1;
}

// 市场整体刷新：选摊位（3~8）→ 逐件摇品质 → 重掷汇率 → 补满库存 → 重抽特惠/涨价
export function rollMarket() {
  if (!S.bazaar) S.bazaar = {};
  const b = S.bazaar;
  const tier = bazaarTier(b.trades || 0);
  if (!b.quality) b.quality = {};
  if (!b.rates) b.rates = {};
  if (!b.stock) b.stock = {};
  // 摊位候选：只看当前等级已开放的商人
  const pool = BAZAAR.dealers.filter(d => tier >= d.tier);
  const n = Math.min(pool.length, rollDealerCount(tier));
  const picked = pool.slice().sort(() => Math.random() - 0.5).slice(0, n);
  b.lineup = picked.map(d => d.id);
  // 品质与汇率只为本次上架的摊位重掷；库存按新品质补满
  for (const d of picked) {
    b.quality[d.id] = rollQuality(tier);
    b.rates[d.id] = rollRate(tier);
    b.stock[d.id] = bazaarStockMax(d);
  }
  rollMarketEvents();
}

// v3.12.3：本批报价 —— 已含汇率、政策、特惠事件与品质倍率。
export function lotOf(id) {
  const d = dealerById(id);
  if (!d) return null;
  ensureBazaar();
  const cap = epStorageCap();
  const tier = bazaarTierNow();
  const q = qualityOf(qualityOfDealer(id));
  const mult = bazaarRateOf(id) * policyMult('bazaarRate') * marketEventOf(id) * researchMult('bazaar');
  let give = d.give, get = d.get;
  if (d.capRatio === 'give') give = Math.round(cap * d.give);
  if (d.capRatio === 'get') get = cap * d.get;
  give = give * q.priceMult;            // 品质越高单价越贵
  get = get * q.gainMult * mult * policyMult('bazaarGain'); // 品质越高产出越多
  if (d.to !== 'ep') get = Math.max(1, Math.round(get));
  else get = Math.round(get);
  return { give: Math.round(give), get, mult, tier, q };
}

function resOf(key) {
  switch (key) {
    case 'ep': return S.ep || 0;
    case 'rp': return S.rp || 0;
    case 'dm': return S.dm || 0;
    case 'faith': return S.faith || 0;
    case 'ember': return S.riftEmber || 0;
    case 'vs': return S.vs || 0;
    case 'pt': return S.pt || 0;
    default: return 0;
  }
}
// 资源是否已被玩家解锁（未解锁的商品不能买：灰显 + 「未解锁」）
export function resUnlocked(key) {
  switch (key) {
    case 'ep': return true;
    case 'rp': return anchorDone('rp', S);
    case 'faith': return anchorDone('faith', S);
    case 'pt': return anchorDone('pt', S);
    case 'dm': return anchorShown('dm', S);
    case 'ember': return !!S._riftSeen;
    case 'vs': return delveUnlocked();
    default: return false;
  }
}
function spendRes(key, n) {
  switch (key) {
    case 'ep': S.ep = Math.max(0, (S.ep || 0) - n); break;
    case 'rp': S.rp = Math.max(0, (S.rp || 0) - n); break;
    case 'dm': S.dm = Math.max(0, (S.dm || 0) - n); break;
    case 'faith': S.faith = Math.max(0, (S.faith || 0) - n); break;
    case 'ember': S.riftEmber = Math.max(0, (S.riftEmber || 0) - n); break;
    case 'pt': S.pt = Math.max(0, (S.pt || 0) - n); break;
    default: break;
  }
}
function gainRes(key, n) {
  switch (key) {
    case 'ep': S.ep = Math.min(epStorageCap(), (S.ep || 0) + n); break;
    case 'rp': addRp(n); break;
    case 'dm': addDm(n); break;
    case 'pt': addPt(n); break;
    case 'faith': S.faith = Math.min(faithCap(), (S.faith || 0) + n); break;
    case 'ember': S.riftEmber = (S.riftEmber || 0) + n; break;
    case 'vs': S.vs = (S.vs || 0) + n; break;
    default: break;
  }
}

// ========== 交易 ==========
export function trade(id) {
  if (!bazaarUnlocked()) return { ok: false, reason: '集市未解锁' };
  const d = dealerById(id);
  if (!d) return { ok: false, reason: '未知商人' };
  ensureBazaar();
  const tier = bazaarTierNow();
  if (tier < d.tier) return { ok: false, reason: `「${d.name}」需集市等级 Lv.${d.tier}（当前 Lv.${tier}）` };
  if (!S.bazaar.lineup.includes(id)) return { ok: false, reason: `「${d.name}」本轮未上架——等下一批或手动刷新` };
  // v3.12.3 反馈②：交付的资源未解锁 → 直接拒绝（卡面已灰显）
  if (!resUnlocked(d.to)) return { ok: false, reason: `${RES_LABEL[d.to]} 尚未解锁——这一通道暂时对你无效` };
  const stock = bazaarStockOf(id);
  if (stock <= 0) return { ok: false, reason: `「${d.name}」本轮库存已空——等补货或手动刷新` };
  const lot = lotOf(id);
  if (!lot || lot.give <= 0) return { ok: false, reason: '当前存储上限过低，本批无法计价' };
  if (resOf(d.from) < lot.give) return { ok: false, reason: `${RES_LABEL[d.from]} 不足：需 ${fmt(lot.give)}（当前 ${fmt(resOf(d.from))}）` };
  spendRes(d.from, lot.give);
  gainRes(d.to, lot.get);
  S.bazaar.stock[id] = stock - 1;
  S.bazaar.trades = (S.bazaar.trades || 0) + 1;
  save(S);
  blog(`与「${d.name}」成交：-${fmt(lot.give)} ${RES_LABEL[d.from]} → +${fmt(lot.get)} ${RES_LABEL[d.to]}（汇率 ${fmtMultDelta(lot.mult)} · ${lot.q.name}）`, 'good');
  return { ok: true, give: lot.give, get: lot.get, mult: lot.mult };
}

// ========== 手动刷新（重掷摊位 / 汇率 / 品质 + 满库存） ==========
export function bazaarRefreshCost() {
  ensureBazaar();
  // v3.0.0：周期政策「自由贸易 +50% 刷新成本 / 垄断协议 -40%」接入刷新计价
  return Math.max(0, Math.round(bazaarRefreshEpCost(epStorageCap(), S.bazaar.refreshCount || 0) * policyMult('bazaarRefresh')));
}
export function refreshBazaar(useEcho = false) {
  if (!bazaarUnlocked()) return { ok: false, reason: '集市未解锁' };
  ensureBazaar();
  if (useEcho) {
    if (!echoRefreshUnlocked()) return { ok: false, reason: '回响刷新需在升级商店购买「回响账簿」' };
    if ((S.abyssEcho || 0) < BAZAAR.echoRefresh) return { ok: false, reason: `回响不足：需 ${BAZAAR.echoRefresh} 点` };
    S.abyssEcho -= BAZAAR.echoRefresh;
  } else {
    const cost = bazaarRefreshCost();
    if ((S.ep || 0) < cost) return { ok: false, reason: `EP 不足：刷新需 ${fmt(cost)} EP` };
    S.ep -= cost;
    S.bazaar.refreshCount = (S.bazaar.refreshCount || 0) + 1;
  }
  S.bazaar.marketTimer = 0;
  rollMarket();
  save(S);
  blog(`集市刷新（${useEcho ? `-${BAZAAR.echoRefresh} 回响` : '消耗 EP'}）：换一批摊位，汇率与品质重掷，库存补满`, 'good');
  return { ok: true };
}

// ========== 主循环：30 分钟整体刷新 ==========
export function tickBazaar(dt) {
  if (!bazaarUnlocked()) return false;
  ensureBazaar();
  let changed = false;
  S.bazaar.marketTimer = (S.bazaar.marketTimer || 0) + dt;
  if (S.bazaar.marketTimer >= BAZAAR.marketRefreshSec) {
    S.bazaar.marketTimer = 0;
    rollMarket();
    changed = true;
  }
  return changed;
}

// 每轮（晋升/轮回）重置本局状态：摊位/品质/汇率/刷新次数归位，成交笔数与等级跨周期保留
export function resetBazaarRun() {
  if (!S.bazaar) return;
  S.bazaar.refreshCount = 0;
  S.bazaar.marketTimer = 0;
  rollMarket();
}

// ========== 面板 ==========
export function renderBazaarPanel(container) {
  if (!container) return;
  if (!bazaarUnlocked()) {
    const card = moduleUnlockCard('bazaar');
    if (container._lastUnlockHtml !== card) {
      container._lastUnlockHtml = card;
      container.innerHTML = card;
    }
    return;
  }
  container._lastUnlockHtml = null;
  ensureBazaar();
  const tier = bazaarTierNow();
  const trades = bazaarTrades();
  const need = bazaarNextTierNeed(trades);
  const refreshCost = bazaarRefreshCost();
  const epOk = (S.ep || 0) >= refreshCost;
  const echoOn = echoRefreshUnlocked();
  const echoOk = (S.abyssEcho || 0) >= BAZAAR.echoRefresh;
  // v3.12.5 反馈③：删掉「集市等级」标题行与两行大按钮——
  // 等级/进度、刷新、二次确认压成一条紧凑控制行（「集市等级」四个字不再出现，只留 Lv.N 与进度）。
  const tierPct = need === null ? 100 : Math.min(100, (trades / need) * 100);
  let html = `
    <div class="bz-bar">
      <span class="bz-lv">Lv.${tier}</span>
      <span class="bz-bar-track"><i style="width:${tierPct}%"></i></span>
      <span class="bz-bar-num">${trades}${need === null ? '' : `/${need}`}</span>
      <button class="btn bz-btn-ep ${epOk ? '' : 'disabled'}" data-bazaar-refresh="1" ${epOk ? '' : 'disabled'} title="重掷摊位与汇率，库存补满">刷新 ${fmt(refreshCost)} EP</button>
      ${echoOn ? `<button class="btn bz-btn-echo ${echoOk ? '' : 'disabled'}" data-bazaar-refresh-echo="1" ${echoOk ? '' : 'disabled'} title="用 1 点深渊回响刷新（不消耗 EP）">✨ 回响刷新 ${BAZAAR.echoRefresh}</button>` : ''}
      <button class="btn bz-btn-confirm" data-bazaar-confirm-toggle="1" role="switch" aria-checked="${S.bazaar.skipConfirm !== true}" title="开启后购买需再点一次确认">二次确认<span class="bz-switch ${S.bazaar.skipConfirm === true ? '' : 'on'}"><i></i></span></button>
    </div>`;
  html += `<div class="shop-grid bz-grid" style="margin-top:4px">`;
  for (const d of bazaarLineup()) {
    const stock = bazaarStockOf(d.id);
    const mx = bazaarStockMax(d);
    const lot = lotOf(d.id);
    const rate = bazaarRateOf(d.id);
    const q = qualityOf(qualityOfDealer(d.id));
    const good = rate >= 1.08, bad = rate <= 0.92;
    const rateColor = good ? 'var(--green,#2ea043)' : bad ? 'var(--red,#f85149)' : 'var(--text-1)';
    const toLocked = !resUnlocked(d.to);
    const canTrade = !toLocked && stock > 0 && resOf(d.from) >= (lot ? lot.give : Infinity);
    const evTag = marketEventOf(d.id) > 1 ? '<span style="font-size:10.5px;color:var(--green,#3fb950)"> 🔥特惠</span>'
      : marketEventOf(d.id) < 1 ? '<span style="font-size:10.5px;color:var(--red,#f85149)"> 📈涨价</span>' : '';
    const state = toLocked ? '<span class="dealer-state dealer-state-lock">未解锁</span>'
      : stock <= 0 ? '<span class="dealer-state dealer-state-lock">库存已空</span>'
      : canTrade ? '<span class="dealer-state dealer-state-ok">可成交</span>'
      : '<span class="dealer-state dealer-state-bad">资源不足</span>';
    const rateSigned = fmtMultDelta(rate);
    html += `
      <div class="item bz-card ${canTrade ? '' : 'cant'}" data-bazaar-dealer="${d.id}" style="cursor:pointer;">
        <div class="name"><span class="bz-name">${d.icon} ${d.name}${evTag}</span><span class="count">${state}</span></div>
        <div class="desc bz-quality" style="color:${q.color}">${q.name}品质 · 库存 ${stock}/${mx}</div>
        <div class="cost mono dealer-cost">−${fmt(lot ? lot.give : 0)} ${RES_SHORT[d.from]} → +${fmt(lot ? lot.get : 0)} ${RES_SHORT[d.to]}</div>
        <div class="desc dealer-meta" style="margin-bottom:0">汇率 <b style="color:${rateColor}">${rateSigned}</b>${good ? ' ↑优' : bad ? ' ↓劣' : ''}</div>
      </div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

let _pendingTrade = null; // v3.0.3 反馈⑥：集市购买二次确认（两阶段点击）
export function bindBazaarPanel(container) {
  if (!container || container.dataset.bazaarBound) return;
  container.dataset.bazaarBound = '1';
  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-bazaar-unlock]')) {
      const r = unlockBazaar();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderBazaarPanel(container);
      return;
    }
    if (e.target.closest('[data-bazaar-refresh-echo]')) {
      const r = refreshBazaar(true);
      if (!r.ok && toastFn) toastFn(r.reason);
      renderBazaarPanel(container);
      return;
    }
    if (e.target.closest('[data-bazaar-refresh]')) {
      const r = refreshBazaar(false);
      if (!r.ok && toastFn) toastFn(r.reason);
      renderBazaarPanel(container);
      return;
    }
    if (e.target.closest('[data-bazaar-confirm-toggle]')) { // 二次确认拨动开关（存档持久化）
      S.bazaar.skipConfirm = S.bazaar.skipConfirm === true ? false : true;
      save(S);
      renderBazaarPanel(container);
      return;
    }
    const el = e.target.closest('[data-bazaar-dealer]');
    if (el) {
      const did = el.dataset.bazaarDealer;
      const now = Date.now();
      // 二次确认关闭 → 单击直接成交
      if (S.bazaar.skipConfirm === true) {
        const r = trade(did);
        if (!r.ok && toastFn) toastFn(r.reason);
        renderBazaarPanel(container);
        return;
      }
      if (_pendingTrade && _pendingTrade.id === did && now - _pendingTrade.t < 3000) {
        _pendingTrade = null;
        const r = trade(did);
        if (!r.ok && toastFn) toastFn(r.reason);
        renderBazaarPanel(container);
      } else {
        _pendingTrade = { id: did, t: now };
        if (toastFn) toastFn('再点一次确认购买');
        container.querySelectorAll('[data-bazaar-dealer]').forEach(x => { x.style.borderColor = ''; x.style.boxShadow = ''; });
        el.style.borderColor = 'var(--green)'; el.style.boxShadow = '0 0 0 1px var(--green)';
      }
      return;
    }
  });
}
