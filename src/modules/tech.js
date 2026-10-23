// v1.3：L1 techCostMult 接入（退潮 ×0.8）+ E 分区（已研究折叠）+ 容器级事件委托
import { S } from '../state.js';
import { getTechs } from '../core/provider.js';
import { ETERNALS } from '../data/eternals.js';
import { hasTech, fmt, esCost, tideMult, techCostOf } from './economy.js';
import { buildOwnedSection, partitionSort, pushBoughtOrder, scheduleMoveToOwned, boughtOrderIndex } from './listkit.js';
import { checkEasterEggs } from './progression.js';
import { chainSplit, CHAIN_PREVIEW } from './disclosure.js'; // v2.3.1 ⑤：makeExpandBtn 随展开交互移除；v2.3.2 §5.2：链提示废除
import { dirty } from '../main.js'; // v2.3：首次购入推进链前缀 → 窗口刷新

let techContainer = null;
let eternalContainer = null;
let techSection = null;   // 已研究折叠区
let techEls = new Map();  // id -> el（未研究可购项）
let eternalEls = new Map();

// v1.3 模块 A：AI 管理核心只在达成里程碑 cps≥1e4 后出现
function techVisible(t) {
  if (t.id !== 'ai_core') return true;
  return !!S.milesDone[1e4];
}

function techReqOk(t) { return t.req.every(r => hasTech(r)); }

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
  const sorted = partitionSort(rest, t => techCostOf(t), techReqOk);
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
  bindTechDelegate(container);
}

function techCostText(t) {
  const cur = techCostOf(t);
  const mult = tideMult('techCost');
  return mult !== 1 ? `${cur} RP（基准 ${t.cost}）` : `${cur} RP`;
}

function makeTechItem(t) {
  const on = hasTech(t.id);
  const reqOk = techReqOk(t);
  const afford = S.rp >= techCostOf(t);
  const div = document.createElement('div');
  div.dataset.tech = t.id;
  div.className = 'tech' + (on ? ' on' : '') + ((!on && (!reqOk || !afford)) ? ' locked' : '');
  const techs = getTechs();
  div.title = t.req.length ? `前置：${t.req.map(r => techs.find(x => x.id === r)?.name || r).join(' → ')}` : '无前置';
  div.innerHTML = `<div class="n">${t.name}</div><div class="d">${t.desc}</div>
    <div class="c">${on ? '✓' : techCostText(t)}</div>`;
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
  // v1.3 L1：科技成本按潮汐相位缩放（退潮 ×0.8）
  const cost = techCostOf(t);
  if (S.rp < cost) return;
  S.rp -= cost;
  S.tech[t.id] = true;
  pushBoughtOrder(S, t.id);
  // v2.0：科技序列彩蛋检查
  checkEasterEggs('tech_sequence', S);
  refreshTechState();
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
    const afford = S.rp >= techCostOf(t);
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
  split.visible.forEach((e, i) => {
    const owned = (S.eternal[e.id] || 0) > 0;
    const el = owned ? makeEternalItem(e) : makeEternalLockedCard();
    if (owned) eternalEls.set(e.id, el);
    container.appendChild(el);
  });
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
  const div = document.createElement('div');
  div.dataset.eternal = e.id;
  div.className = 'tech' + (!afford ? ' locked' : '');
  div.style.cursor = afford ? 'pointer' : 'not-allowed';
  div.innerHTML = `<div class="n">${e.name} <span style="color:var(--warn)">Lv.${lv}</span></div>
    <div class="d">${e.desc}</div>
    <div class="c" style="color:var(--warn)">${afford ? cost + ' ES' : '还差 ' + fmt(cost - S.es) + ' ES'}</div>`;
  return div;
}

function updateEternalItem(e) {
  const el = eternalEls.get(e.id);
  if (!el) return;
  const lv = S.eternal[e.id] || 0;
  const cost = esCost(e);
  const afford = S.es >= cost;
  el.style.cursor = afford ? 'pointer' : 'not-allowed';
  const n = el.querySelector('.n');
  if (n) n.innerHTML = `${e.name} <span style="color:var(--warn)">Lv.${lv}</span>`;
  const c = el.querySelector('.c');
  if (c) c.innerHTML = afford ? `${cost} ES` : `还差 ${fmt(cost - S.es)} ES`;
  el.classList.toggle('locked', !afford);
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
  const wasOwned = (S.eternal[e.id] || 0) > 0; // v2.3：首次购入推进已购前缀 → 链窗口刷新
  S.es -= cost;
  S.eternal[e.id] = (S.eternal[e.id] || 0) + 1;
  updateEternalItem(e); // v1.3 E：购后原地更新，不再整列表重建
  if (!wasOwned) dirty.tech = true; // v2.3：p 推进 → 下个 tick（≤100ms）整面板重入刷新链窗口
}
