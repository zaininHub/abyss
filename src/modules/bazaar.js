// v3.0.0 大模块：深渊集市——资源兑换 + 汇率波动 + 库存限购 + 集市等级（跨周期）
// 参考 Kittens Game 贸易/资源转换（多余资源换稀缺资源、汇率波动、限购），
// 解决本作中期痛点：EP 顶到存储上限没处花、RP/DM/信仰/余烬/虚空碎片彼此孤立无兑换通道。
import { S, save } from '../state.js';
import { fmt, epStorageCap, addRp, addDm, addPt, researchMult } from './economy.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：汇率倍率 → 带符号百分比
import { policyMult } from '../data/policies.js';
import { faithCap } from '../data/religions.js';
import { delveUnlocked } from './delve.js';
import { moduleBuyState, buyModuleUnlock, moduleUnlockCard } from './moduleUnlocks.js'; // v3.12.0 反馈⑬：集市改为职级点买断
import {
  BAZAAR, RES_LABEL, dealerById, bazaarTier, bazaarNextTierNeed, rollRate, bazaarRefreshEpCost,
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
  if (b.shuffleTimer === undefined) b.shuffleTimer = 0;
  if (b.regenTimer === undefined) b.regenTimer = 0;
  if (!b.rates || typeof b.rates !== 'object') b.rates = {};
  if (!b.stock || typeof b.stock !== 'object') b.stock = {};
  if (!b.events || typeof b.events !== 'object') b.events = { hot: null, cold: null }; // v3.0.3 反馈②：每轮随机特惠/涨价商人
  if (b.skipConfirm === undefined) b.skipConfirm = false; // v3.0.3 反馈③：二次确认可关
  const tier = bazaarTier(b.trades);
  for (const d of BAZAAR.dealers) {
    if (!(b.rates[d.id] > 0)) b.rates[d.id] = rollRate(tier);
    if (b.stock[d.id] === undefined) b.stock[d.id] = bazaarStockMax(d);
  }
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
    blog(`深渊集市开张：消耗 ${r.cost} PP，六位商人常驻矩阵夹层，汇率每 45 秒波动一次`, 'good');
    if (toastFn) toastFn('🏪 深渊集市开张：富余资源可以在这里换稀缺资源了');
  }
  return r;
}

// ========== 读侧 ==========
export function bazaarTrades() { return (S.bazaar && S.bazaar.trades) || 0; }
export function bazaarTierNow() { return bazaarTier(bazaarTrades()); }
// 库存上限 = 商人基础 + 政策（自由贸易 +2 —— 允许 0 或负，负向不跌破 0）
export function bazaarStockMax(d) {
  const bonus = policyMult('bazaarStock') - 1;
  return Math.max(0, (d.stock || 0) + Math.round(bonus));
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

// v3.0.3 反馈②：每轮随机「特惠/涨价」商人——手动刷新与定时波动时重掷，让「哪类商品涨价」显性随机
export function rollMarketEvents() {
  ensureBazaar();
  const tier = bazaarTierNow();
  const pool = BAZAAR.dealers.filter(d => tier >= d.tier);
  if (pool.length < 2) { S.bazaar.events = { hot: null, cold: null }; return; }
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  S.bazaar.events = { hot: shuffled[0].id, cold: shuffled[1].id };
}
export function marketEventOf(id) {
  const ev = (S.bazaar && S.bazaar.events) || {};
  return ev.hot === id ? 1.2 : ev.cold === id ? 0.8 : 1;
}

// 本批报价：{ give, get, mult }（give = 支付量，get = 获得量，已含汇率与政策）
export function lotOf(id) {
  const d = dealerById(id);
  if (!d) return null;
  ensureBazaar();
  const cap = epStorageCap();
  const tier = bazaarTierNow();
  const mult = bazaarRateOf(id) * policyMult('bazaarRate') * marketEventOf(id) * researchMult('bazaar'); // v3.12.0 反馈⑩：集市协议 // v3.0.3 反馈②：特惠/涨跌事件并入汇率
  let give = d.give, get = d.get;
  if (d.capRatio === 'give') give = Math.round(cap * d.give);
  if (d.capRatio === 'get') get = cap * d.get;
  get = get * mult * policyMult('bazaarGain');
  if (d.to !== 'ep') get = Math.max(1, Math.round(get));
  else get = Math.round(get);
  return { give: Math.round(give), get, mult, tier };
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
function spendRes(key, n) {
  switch (key) {
    case 'ep': S.ep = Math.max(0, (S.ep || 0) - n); break;
    case 'rp': S.rp = Math.max(0, (S.rp || 0) - n); break;
    case 'dm': S.dm = Math.max(0, (S.dm || 0) - n); break;
    case 'faith': S.faith = Math.max(0, (S.faith || 0) - n); break;
    case 'ember': S.riftEmber = Math.max(0, (S.riftEmber || 0) - n); break;
    case 'vs': S.vs = Math.max(0, (S.vs || 0) - n); break;
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
  if (d.to === 'vs' && !delveUnlocked()) return { ok: false, reason: '虚空商行只在深潜解锁后才收货（VS 尚未发现）' };
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
  blog(`与「${d.name}」成交：-${fmt(lot.give)} ${RES_LABEL[d.from]} → +${fmt(lot.get)} ${RES_LABEL[d.to]}（汇率 ${fmtMultDelta(lot.mult)}）`, 'good');
  return { ok: true, give: lot.give, get: lot.get, mult: lot.mult };
}

// ========== 手动刷新（重掷汇率 + 满库存） ==========
export function bazaarRefreshCost() {
  ensureBazaar();
  // v3.0.0：周期政策「自由贸易 +50% 刷新成本 / 垄断协议 -40%」接入刷新计价
  return Math.max(0, Math.round(bazaarRefreshEpCost(epStorageCap(), S.bazaar.refreshCount || 0) * policyMult('bazaarRefresh')));
}
export function refreshBazaar(useEcho = false) {
  if (!bazaarUnlocked()) return { ok: false, reason: '集市未解锁' };
  ensureBazaar();
  if (useEcho) {
    if ((S.abyssEcho || 0) < BAZAAR.echoRefresh) return { ok: false, reason: `回响不足：需 ${BAZAAR.echoRefresh} 点` };
    S.abyssEcho -= BAZAAR.echoRefresh;
  } else {
    const cost = bazaarRefreshCost();
    if ((S.ep || 0) < cost) return { ok: false, reason: `EP 不足：刷新需 ${fmt(cost)} EP` };
    S.ep -= cost;
    S.bazaar.refreshCount = (S.bazaar.refreshCount || 0) + 1;
  }
  restock(true);
  rollMarketEvents(); // v3.0.3 反馈②：手动刷新同时随机刷新特惠/涨价类型
  save(S);
  blog(`集市刷新（${useEcho ? `-${BAZAAR.echoRefresh} 回响` : '消耗 EP'}）：汇率重掷，库存补满，特惠/涨价商人重抽`, 'good');
  return { ok: true };
}

function restock(reroll) {
  ensureBazaar();
  const tier = bazaarTierNow();
  for (const d of BAZAAR.dealers) {
    if (reroll) S.bazaar.rates[d.id] = rollRate(tier);
    S.bazaar.stock[d.id] = bazaarStockMax(d);
  }
}

// ========== 主循环：汇率波动 + 库存自然恢复 ==========
export function tickBazaar(dt) {
  if (!bazaarUnlocked()) return;
  ensureBazaar();
  let changed = false;
  S.bazaar.shuffleTimer = (S.bazaar.shuffleTimer || 0) + dt;
  if (S.bazaar.shuffleTimer >= BAZAAR.shuffleSec) {
    S.bazaar.shuffleTimer = 0;
    const tier = bazaarTierNow();
    for (const d of BAZAAR.dealers) S.bazaar.rates[d.id] = rollRate(tier);
    rollMarketEvents(); // v3.0.3 反馈②：定时波动同步重抽特惠/涨价类型
    changed = true;
  }
  S.bazaar.regenTimer = (S.bazaar.regenTimer || 0) + dt;
  if (S.bazaar.regenTimer >= BAZAAR.stockRegenSec) {
    S.bazaar.regenTimer = 0;
      for (const d of BAZAAR.dealers) {
      const mx = bazaarStockMax(d);
      if ((S.bazaar.stock[d.id] || 0) < mx) S.bazaar.stock[d.id] = (S.bazaar.stock[d.id] || 0) + 1;
    }
    changed = true;
  }
  return changed;
}

// 每轮（晋升/轮回）重置本局状态：库存/汇率/刷新次数归位，成交笔数与等级跨周期保留
export function resetBazaarRun() {
  if (!S.bazaar) return;
  S.bazaar.refreshCount = 0;
  S.bazaar.shuffleTimer = 0;
  S.bazaar.regenTimer = 0;
  restock(true);
  rollMarketEvents(); // v3.0.3 反馈②：每轮特惠/涨价商人重抽
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
  let html = `
    <div class="religion-desc">深渊集市：${BAZAAR.dealers.length} 位商人常驻，汇率每 ${BAZAAR.shuffleSec}s 波动 ±${BAZAAR.volatility * 100}%，库存每 ${BAZAAR.stockRegenSec}s 自然 +1。累计成交 ${trades} 笔 → <b style="color:var(--accent)">集市等级 Lv.${tier}</b>${need !== null ? `（下一级需 ${need} 笔）` : '（已满级）'}。等级抬高汇率波动下限，不消除波动。</div>
    <div class="off-stat"><span>刷新汇率 + 补满库存</span><b style="color:var(--cyan)">${fmt(refreshCost)} EP</b></div>
    <div class="off-stat"><span>或消耗回响刷新</span><b>${BAZAAR.echoRefresh} 点（当前 ${S.abyssEcho || 0}）</b></div>
    <div style="display:flex;gap:8px;margin:8px 0 12px">
      <button class="btn ${(S.ep || 0) >= refreshCost ? '' : 'disabled'}" data-bazaar-refresh="1" style="flex:1">刷新（EP）</button>
      <button class="btn ${(S.abyssEcho || 0) >= BAZAAR.echoRefresh ? '' : 'disabled'}" data-bazaar-refresh-echo="1" style="flex:1">刷新（回响）</button>
      <button class="btn" data-bazaar-confirm-toggle="1" style="flex:1" title="开启后购买需点击两次确认；关闭后单击直接成交">二次确认：${S.bazaar.skipConfirm === true ? '关' : '开'}</button>
    </div>`;
  html += `<div class="shop-grid" style="margin-top:4px">`;
  for (const d of BAZAAR.dealers) {
    const lockedByTier = tier < d.tier;
    const lockedByVs = d.to === 'vs' && !delveUnlocked();
    const stock = bazaarStockOf(d.id);
    const mx = bazaarStockMax(d);
    const lot = lotOf(d.id);
    const rate = bazaarRateOf(d.id);
    const good = rate >= 1.08, bad = rate <= 0.92;
    const rateColor = good ? 'var(--green,#2ea043)' : bad ? 'var(--red,#f85149)' : 'var(--text-1)';
    const canTrade = !lockedByTier && !lockedByVs && stock > 0 && resOf(d.from) >= (lot ? lot.give : Infinity);
    const evTag = marketEventOf(d.id) > 1 ? '<span style="font-size:10.5px;color:var(--green,#3fb950)"> 🔥特惠</span>'
      : marketEventOf(d.id) < 1 ? '<span style="font-size:10.5px;color:var(--red,#f85149)"> 📈涨价</span>' : '';
    // v3.12.0 反馈④：与升级商店同一套 name / desc / cost 卡面；状态用文字角标显式区分。
    const state = lockedByTier ? `<span class="dealer-state dealer-state-lock">🔒 需 Lv.${d.tier}</span>`
      : lockedByVs ? '<span class="dealer-state dealer-state-lock">🔒 需深潜</span>'
      : stock <= 0 ? '<span class="dealer-state dealer-state-lock">库存已空</span>'
      : canTrade ? '<span class="dealer-state dealer-state-ok">可成交</span>'
      : '<span class="dealer-state dealer-state-bad">资源不足</span>';
    const rateSigned = fmtMultDelta(rate);
    html += `
      <div class="item ${canTrade ? '' : 'cant'}" data-bazaar-dealer="${d.id}" style="cursor:pointer;">
        <div class="name"><span>${d.icon} ${d.name}${evTag}</span><span class="count">${state}</span></div>
        <div class="desc">${d.desc}</div>
        <div class="cost mono dealer-cost">- ${fmt(lot ? lot.give : 0)} ${RES_LABEL[d.from]} → + ${fmt(lot ? lot.get : 0)} ${RES_LABEL[d.to]}</div>
        <div class="desc dealer-meta" style="margin-bottom:0">库存 ${stock}/${mx} · 汇率 <b style="color:${rateColor}">${rateSigned}</b>${good ? ' ↑优' : bad ? ' ↓劣' : ''}</div>
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
    if (e.target.closest('[data-bazaar-confirm-toggle]')) { // v3.0.3 反馈③：二次确认开关（存档持久化）
      S.bazaar.skipConfirm = S.bazaar.skipConfirm === true ? false : true;
      save(S);
      renderBazaarPanel(container);
      return;
    }
    const el = e.target.closest('[data-bazaar-dealer]');
    if (el) {
      const did = el.dataset.bazaarDealer;
      const now = Date.now();
      // v3.0.3 反馈③：skipConfirm 开启 → 单击直接成交
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
