// v1.3：L1 techCostMult 接入（退潮 ×0.8）+ E 分区（已研究折叠）+ 容器级事件委托
import { S, save } from '../state.js'; // v2.8.16：科技购买即持久化
import { getTechs } from '../core/provider.js';
import { ETERNALS } from '../data/eternals.js';
import { hasTech, fmt, esCost, tideMult, techCostOf, techAfford, spendRes, gainRes } from './economy.js';
import { buildOwnedSection, partitionSort, pushBoughtOrder, scheduleMoveToOwned, boughtOrderIndex } from './listkit.js';
import { checkEasterEggs } from './progression.js';
import { chainSplit, CHAIN_PREVIEW } from './disclosure.js'; // v2.3.1 ⑤：makeExpandBtn 随展开交互移除；v2.3.2 §5.2：链提示废除
import { dirty, log } from '../core/runtime.js'; // v3.0.0 测试性解耦

let techContainer = null;
let eternalContainer = null;
let techSection = null;   // 已研究折叠区
let techEls = new Map();  // id -> el（未研究可购项）
let eternalEls = new Map();

// v2.8.18：AI 管理核心恒显示、无 cps 里程碑门槛（RP 50 + 1M EP 即门槛，不足时灰态）——用户多轮反馈「无法升级」根因是 cps≥1e4 门槛在中期不可达
function techVisible(t) { return true; }
export function techReqOk(t) { return t.req.every(r => hasTech(r)); }

export function renderTech(container) {
  techContainer = container;
  container.innerHTML = '';
  techEls.clear();
  techSection = buildOwnedSection('tech-tree', container, '研究');
  const techs = getTechs();
  // v2.1 兼容：旧档已研究的非钥匙科技保留为标记，展示一次性说明卡
  const keyIds = new Set(techs.map(t => t.id));
  const legacyOwned = Object.keys(S.tech || {}).filter(id => !keyIds.has(id));
  if (legacyOwned.length) {
    const note = document.createElement('div');
    note.className = 'tech-note';
    note.style.cssText = 'grid-column:1/-1;padding:8px 12px;margin:4px 0;border:1px dashed var(--warn,#c8a24a);border-radius:8px;font-size:12px;opacity:.85';
    note.innerHTML = `已研究的 ${legacyOwned.length} 项旧研究的效力已折算进建筑体系，此处仅保留解锁标记。`;
    container.appendChild(note);
  }
  const visible = techs.filter(techVisible);
  const owned = visible.filter(t => hasTech(t.id));
  const rest = visible.filter(t => !hasTech(t.id));
  owned.sort((a, b) => boughtOrderIndex(S, b.id) - boughtOrderIndex(S, a.id));
  // v1.3 E：可购区成本升序（L1：成本含潮汐乘数），前置未满足项列区末
  const sorted = partitionSort(rest, t => (typeof t.cost === 'number' ? t.cost : (t.cost?.rp || 0)), techReqOk); // v2.8.7：多资源成本按 RP 排序
  for (const t of owned) {
    const div = document.createElement('div');
    div.className = 'tech on owned-item';
    div.innerHTML = `<div class="n">${t.name}</div><div class="d">${t.desc}</div><div class="c">✓</div>`;
    techSection.box.appendChild(div);
  }
  techSection.updateCount(owned.length);
  for (const t of sorted) {
    const div = makeTechItem(t);
    techEls.set(t.id, div);
    container.appendChild(div);
  }
  // v2.8.20 ⑦：已研究折叠区移到类目下方（可购项之后；buildOwnedSection 默认挂顶部，这里重挂到底部）
  container.appendChild(techSection.header);
  container.appendChild(techSection.box);
  bindTechDelegate(container);
}

function techCostText(t) {
  const cur = techCostOf(t);
  const parts = [];
  if (cur.rp) parts.push(`${fmt(cur.rp)} RP`);
  if (cur.ep) parts.push(`${fmt(cur.ep)} EP`);
  if (cur.dm) parts.push(`${fmt(cur.dm)} DM`);
  if (cur.es) parts.push(`${fmt(cur.es)} ES`);
  return parts.join(' + ');
}

function makeTechItem(t) {
  const on = hasTech(t.id);
  const reqOk = techReqOk(t);
  const afford = techAfford(t); // v2.8.7：多资源可购判定
  const div = document.createElement('div');
  div.dataset.tech = t.id;
  div.className = 'tech' + (on ? ' on' : '') + ((!on && (!reqOk || !afford)) ? ' locked' : '');
  // v2.8.18：锁定原因 title——前置科技（cps 门槛已移除，ai_core 仅 RP+EP 判定）
  const techs = getTechs();
  const hints = [];
  if (t.req.length) hints.push(`前置：${t.req.map(r => techs.find(x => x.id === r)?.name || r).join(' → ')}`);
  div.title = hints.join('；') || '无前置';
  // v2.8.13：科技卡片结构与升级商店 .item 统一（name/desc/cost），UI 设计一致
  div.innerHTML = `<div class="name"><span>${t.name}</span></div><div class="desc">${t.desc}</div>
    <div class="cost mono">${on ? '✓' : techCostText(t)}</div>`;
  return div;
}

function bindTechDelegate(container) {
  if (!container || container.dataset.v13Delegated) return;
  container.dataset.v13Delegated = '1';
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tech]');
    if (!el || !container.contains(el)) return;
    const t = getTechs().find(x => x.id === el.dataset.tech);
    if (t) buyTech(t, el);
  });
}

export function buyTech(t, el) {
  if (hasTech(t.id)) return;
  if (!techReqOk(t)) return;
  // v2.8.7：科技树多资源成本（RP + EP + DM + ES 综合消耗，退潮乘数作用于 RP）
  const cost = techCostOf(t);
  if (!techAfford(t)) return;
  S.rp -= cost.rp || 0;
  spendRes('rp', cost.rp || 0);
  S.ep -= cost.ep || 0; spendRes('ep', cost.ep || 0);
  S.dm = (S.dm || 0) - (cost.dm || 0); spendRes('dm', cost.dm || 0);
  S.es = (S.es || 0) - (cost.es || 0); spendRes('es', cost.es || 0);
  S.tech[t.id] = true;
  pushBoughtOrder(S, t.id);
  save(S); // v2.8.16：科技购买即持久化（此前仅靠 5s 自动存档兜底——购买后立即刷新会丢科技，「AI 管理核心」等一次性科技购买后丢失）
  // v2.0：科技序列彩蛋检查
  checkEasterEggs('tech_sequence', S);
  refreshTechState();
  if (t.id === 'auto_tech') dirty.ai = true; // v2.8.20 ⑥：购买「自动研究」后 AI 面板即时重渲染（此前需刷新页面才出现开关）
  // v1.3 E：一次性项购后 1s 移入「已研究」折叠区
  const target = el || techEls.get(t.id);
  if (target && techSection) {
    delete target.dataset.tech;
    target.className = 'tech on just-bought';
    target.title = '';
    target.innerHTML = `<div class="n">${t.name}</div><div class="d">${t.desc}</div><div class="c">✓</div>`;
    scheduleMoveToOwned(target, techSection.box, () => {
      const n = getTechs().filter(x => hasTech(x.id) && techVisible(x)).length;
      techSection.updateCount(n);
    });
  }
}

export function refreshTechState() {
  if (!techContainer) return;
  const techs = getTechs();
  for (const [id, el] of techEls) {
    const t = techs.find(x => x.id === id);
    if (!t) continue;
    const on = hasTech(t.id);
    const reqOk = techReqOk(t);
    const afford = techAfford(t); // v2.8.7：多资源可购判定
    el.classList.toggle('on', on);
    el.classList.toggle('locked', !on && (!reqOk || !afford));
    // v1.3 L1：价格文本随潮汐相位与 RP 余额原地刷新
    // v2.6.5 ③：防抖——文本不变则跳过 DOM 写入，消除每秒文本节点重写导致的 hover 抖动/闪烁
    const c = el.querySelector('.c');
    if (c && !on) {
      const txt = techCostText(t);
      if (c.textContent !== txt) c.textContent = txt;
    }
  }
}

// ========== 永恒矩阵（可叠加升级：成本升序 + 购后原地更新） ==========
export function renderEternal(container) {
  eternalContainer = container;
  container.innerHTML = '';
  eternalEls.clear();
  let totalLv = 0;
  for (const e of ETERNALS) totalLv += S.eternal[e.id] || 0;
  // v2.3 渐进披露链：链序固定为定义序——若沿用 v1.3 的当前级成本升序，
  // 已购项价格上浮后会漂移到队尾，已购前缀 p 恒为 0，链窗口语义整体失效
  const split = chainSplit('eternal', [...ETERNALS], e => (S.eternal[e.id] || 0) > 0, S);
  // v4.0.0 反馈②「学习完一样要收起」：仿科技树「已研究」折叠区。
  //   只把「已学完」的一次性项（有 cap 且满级，如皮肤解锁）收进「已拥有」区；
  //   可叠加升级项没有「学完」这一天，必须永留可购区，否则玩家无法继续升级（listkit 既有规范）。
  const learned = split.visible.filter(e => e.cap && (S.eternal[e.id] || 0) >= e.cap);
  const buyable = split.visible.filter(e => !(e.cap && (S.eternal[e.id] || 0) >= e.cap));
  for (const e of buyable) {
    // v3.0.3 第二批⑧：链窗口内未购项显示真卡（可购/ES 不足灰显），不再 ??? 占位
    const el = makeEternalItem(e);
    eternalEls.set(e.id, el); // 可叠加项购后需原地更新，全部登记
    container.appendChild(el);
  }
  if (learned.length) {
    const section = buildOwnedSection('eternal', container, '拥有');
    for (const e of learned) {
      const el = makeEternalItem(e);
      delete el.dataset.eternal; // 已学完不再响应购买（与科技树 owned 项同款）
      el.style.cursor = 'default';
      el.classList.add('owned-item');
      section.box.appendChild(el);
    }
    section.updateCount(learned.length);
  }
  // v2.3.1 ⑤（rev18 9.3）：窗口 K = p + 1，「展开更多 ▾」按钮整节移除
  bindEternalDelegate(container);
  return totalLv;
}

// v2.3：永恒占位卡——窗口内未购条目（复用 .tech.locked 样式，无购买入口）
function makeEternalLockedCard() {
  const div = document.createElement('div');
  div.className = 'tech locked';
  div.style.cursor = 'default';
  div.innerHTML = `<div class="n">???</div>
    <div class="d">${CHAIN_PREVIEW}</div>
    <div class="c">—</div>`;
  return div;
}

function makeEternalItem(e) {
  const lv = S.eternal[e.id] || 0;
  const cost = esCost(e);
  const afford = S.es >= cost;
  const maxed = e.cap && lv >= e.cap; // v3.12.13 ⑦：一次性解锁项（如皮肤）满级后显示「已拥有」
  const div = document.createElement('div');
  div.dataset.eternal = e.id;
  div.className = 'tech' + (!afford && !maxed ? ' locked' : '');
  div.style.cursor = maxed ? 'default' : (afford ? 'pointer' : 'not-allowed');
  div.innerHTML = `<div class="n">${e.name} <span style="color:var(--warn)">Lv.${lv}</span></div>
    <div class="d">${e.desc}</div>
    <div class="c" style="color:var(--warn)">${maxed ? '已拥有' : (afford ? cost + ' ES' : '还差 ' + fmt(cost - S.es) + ' ES')}</div>`;
  return div;
}

function updateEternalItem(e) {
  const el = eternalEls.get(e.id);
  if (!el) return;
  const lv = S.eternal[e.id] || 0;
  const cost = esCost(e);
  const afford = S.es >= cost;
  const maxed = e.cap && lv >= e.cap;
  el.style.cursor = maxed ? 'default' : (afford ? 'pointer' : 'not-allowed');
  const n = el.querySelector('.n');
  if (n) n.innerHTML = `${e.name} <span style="color:var(--warn)">Lv.${lv}</span>`;
  const c = el.querySelector('.c');
  if (c) c.innerHTML = maxed ? '已拥有' : (afford ? `${cost} ES` : `还差 ${fmt(cost - S.es)} ES`);
  el.classList.toggle('locked', !afford && !maxed);
}

function bindEternalDelegate(container) {
  if (!container || container.dataset.v13Delegated) return;
  container.dataset.v13Delegated = '1';
  container.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-eternal]');
    if (!el || !container.contains(el)) return;
    const e = ETERNALS.find(x => x.id === el.dataset.eternal);
    if (e) buyEternal(e);
  });
}

export function buyEternal(e) {
  const cost = esCost(e);
  if (S.es < cost) return;
  // v3.12.13 ⑦：一次性解锁项（如皮肤）满级后不可重复购买
  if (e.cap && (S.eternal[e.id] || 0) >= e.cap) return;
  const wasOwned = (S.eternal[e.id] || 0) > 0; // v2.3：首次购入推进已购前缀 → 链窗口刷新
  S.es -= cost;
  spendRes('es', cost);
  S.eternal[e.id] = (S.eternal[e.id] || 0) + 1;
  updateEternalItem(e); // v1.3 E：购后原地更新，不再整列表重建
  if (!wasOwned) dirty.tech = true; // v2.3：p 推进 → 下个 tick（≤100ms）整面板重入刷新链窗口
}
