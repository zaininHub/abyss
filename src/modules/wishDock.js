// 许愿池 / 离职礼盒：两个常驻浮动 UI 组件。
//
// 从 main.js 抽出的边界准则：只依赖状态单例 S、core/runtime 的侧效工具、
// economy 的资源入口、progression 的特殊任务结算，以及浏览器全局；
// 不引用 main.js 的任何局部状态。对外仅暴露四个初始化/刷新函数，行为与抽出前一致。
import { S, save } from '../state.js';
import { dirty, log, toast } from '../core/runtime.js';
import { spendRes, addEp, fmt } from './economy.js';
import { checkSpecialTasks } from './progression.js';

let wishCoolUntil = 0;
const WISH_COST = 100, WISH_CHANCE = 0.0001, WISH_REWARD = 100000;
// dock 位置 / 收起态是纯 UI 偏好，用独立 localStorage key 持久化，
// 不写进游戏存档 S（不随转生/清档清空，也不污染 SAVE_VERSION）。
const WISH_DOCK_KEY = 'abyss_wish_dock_v1';
const WISH_DOCK_W = 140;
const WISH_WELL_SVG = `<svg class="wish-svg" viewBox="0 0 120 132" width="96" height="106" aria-hidden="true">
  <defs>
    <radialGradient id="wish-water-g" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#7ef3e2"/><stop offset="45%" stop-color="#2aa8b8"/><stop offset="100%" stop-color="#0b2a33"/>
    </radialGradient>
    <linearGradient id="wish-roof-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d1d6e"/><stop offset="100%" stop-color="#1b0733"/>
    </linearGradient>
  </defs>
  <path d="M22 44 L60 20 L98 44 Z" fill="url(#wish-roof-g)" stroke="#4dd0e1" stroke-width="1.2" opacity="0.95"/>
  <line x1="30" y1="44" x2="30" y2="96" stroke="#3a4150" stroke-width="4"/>
  <line x1="90" y1="44" x2="90" y2="96" stroke="#3a4150" stroke-width="4"/>
  <line x1="60" y1="44" x2="60" y2="58" stroke="#565f6e" stroke-width="1.6"/>
  <rect x="55" y="58" width="10" height="8" rx="2" fill="#4a3b22" stroke="#c8a24a" stroke-width="1"/>
  <path d="M16 96 C16 86 104 86 104 96 L100 116 C100 124 20 124 20 116 Z" fill="#1c2128" stroke="#3a4150" stroke-width="2"/>
  <ellipse cx="60" cy="96" rx="44" ry="12" fill="#10151c" stroke="#3a4150" stroke-width="2"/>
  <ellipse class="wish-water" cx="60" cy="96" rx="34" ry="8.5" fill="url(#wish-water-g)"/>
  <ellipse class="wish-ripple" cx="60" cy="96" rx="34" ry="8.5" fill="none" stroke="#7ef3e2" stroke-width="1.5"/>
  <ellipse class="wish-ripple wish-ripple-2" cx="60" cy="96" rx="34" ry="8.5" fill="none" stroke="#a371f7" stroke-width="1.2"/>
</svg>
<span class="wish-coin"></span>
<span class="wish-label">许愿池</span>`;

function readWishDockState() {
  try {
    const v = JSON.parse(localStorage.getItem(WISH_DOCK_KEY) || 'null');
    if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y, collapsed: !!v.collapsed };
  } catch { /* 隐私模式 / 旧值损坏：回落默认位置 */ }
  return null;
}
function writeWishDockState(dock) {
  try {
    localStorage.setItem(WISH_DOCK_KEY, JSON.stringify({
      x: parseFloat(dock.style.left) || 0,
      y: parseFloat(dock.style.top) || 0,
      collapsed: dock.dataset.collapsed === 'true',
    }));
  } catch { /* localStorage 不可写时仅本次会话生效 */ }
}
function clampWishPos(x, y) {
  // 至少留 40px 在视口内，保证折叠把手永远可点
  return {
    x: Math.max(0, Math.min(x, Math.max(0, window.innerWidth - 40))),
    y: Math.max(0, Math.min(y, Math.max(0, window.innerHeight - 40))),
  };
}
function applyWishCollapsed(dock, collapsed) {
  dock.dataset.collapsed = collapsed ? 'true' : 'false';
  const btn = dock.querySelector('.wish-toggle');
  if (btn) {
    btn.textContent = collapsed ? '‹' : '›';
    btn.setAttribute('aria-label', collapsed ? '展开许愿池' : '收起许愿池');
    btn.title = collapsed ? '展开许愿池' : '收起 / 拖到屏幕边缘自动隐藏';
  }
  // 收起只动 transform（项目动效纪律）：把 dock 右移，仅露左端 30px 的折叠按钮
  const left = parseFloat(dock.style.left) || 0;
  dock.style.setProperty('--wish-shift', `${Math.max(0, window.innerWidth - 30 - left)}px`);
  writeWishDockState(dock);
}
function initWishDock(dock) {
  const st = readWishDockState();
  const p = clampWishPos(st ? st.x : window.innerWidth - WISH_DOCK_W - 14,
                         st ? st.y : Math.round(window.innerHeight * 0.36));
  dock.style.left = p.x + 'px';
  dock.style.top = p.y + 'px';
  applyWishCollapsed(dock, st ? st.collapsed : false);

  const bar = dock.querySelector('.wish-dock-bar');
  bar.querySelector('.wish-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    applyWishCollapsed(dock, dock.dataset.collapsed !== 'true');
  });

  // 自由拖动：只从标题栏发起；折叠按钮点击与收起态不触发
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.wish-toggle') || dock.dataset.collapsed === 'true') return;
    drag = { px: e.clientX, py: e.clientY,
             left: parseFloat(dock.style.left) || 0, top: parseFloat(dock.style.top) || 0 };
    try { bar.setPointerCapture(e.pointerId); } catch { /* 非指针环境忽略 */ }
    dock.classList.add('wish-dragging');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const n = clampWishPos(drag.left + e.clientX - drag.px, drag.top + e.clientY - drag.py);
    dock.style.left = n.x + 'px';
    dock.style.top = n.y + 'px';
  });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    dock.classList.remove('wish-dragging');
    try { bar.releasePointerCapture(e.pointerId); } catch { /* 已释放 */ }
    // 拖到屏幕右缘自动隐藏（贴边收起），仅露折叠把手
    const EDGE = 10;
    const fx = parseFloat(dock.style.left) || 0;
    if (fx >= window.innerWidth - WISH_DOCK_W - EDGE) applyWishCollapsed(dock, true);
    writeWishDockState(dock);
  };
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);

  // 视口变化：位置钳回视口并重新计算贴边位移（只绑一次）
  if (!initWishDock._resizeBound) {
    initWishDock._resizeBound = true;
    window.addEventListener('resize', () => {
      const d = document.getElementById('wish-dock');
      if (!d) return;
      const n = clampWishPos(parseFloat(d.style.left) || 0, parseFloat(d.style.top) || 0);
      d.style.left = n.x + 'px'; d.style.top = n.y + 'px';
      if (d.dataset.collapsed === 'true') d.style.setProperty('--wish-shift', `${Math.max(0, window.innerWidth - 30 - n.x)}px`);
      writeWishDockState(d);
    });
  }
}

export function ensureWishWell() {
  // 许愿池从研究升级移入通用设施——检查 S.buildings.wish_well（兼容旧档 S.rpTheories.wish_well）
  const owned = ((S.buildings && S.buildings.wish_well) || (S.rpTheories && S.rpTheories.wish_well) || 0) > 0;
  let dock = document.getElementById('wish-dock');
  if (!owned) { if (dock) dock.remove(); return; }
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'wish-dock';
    dock.className = 'wish-dock';
    dock.innerHTML = `<div class="wish-dock-bar">
        <button class="wish-toggle" type="button" aria-label="收起许愿池" title="收起 / 拖到屏幕边缘自动隐藏">›</button>
        <span class="wish-grip" aria-hidden="true">⠿</span>
        <span class="wish-dock-title">许愿池</span>
      </div>
      <button id="wish-well" class="wish-well" title="许愿池：投一枚硬币（100 EP）——万一呢？">${WISH_WELL_SVG}</button>`;
    document.body.appendChild(dock);
    dock.querySelector('#wish-well').addEventListener('click', onWishToss);
    initWishDock(dock);
  }
  dock.style.display = '';
}

function onWishToss() {
  const w = document.getElementById('wish-well');
  if (!w || w.disabled) return;
  const now = Date.now();
  if (now < wishCoolUntil) { toast('投币动画进行中，稍等片刻…'); return; }
  if ((S.ep || 0) < WISH_COST) { toast(`EP 不足（需 ${WISH_COST} EP）`); return; }
  S.ep -= WISH_COST; spendRes('ep', WISH_COST);
  S.wishCoins = (S.wishCoins || 0) + 1; // 投币计数（成就）
  wishCoolUntil = now + 3000;
  w.disabled = true;
  w.classList.add('tossing');
  save(S); dirty.top = true;
  // 硬币落井（1.1s 动效）后开奖，涟漪随之扩散
  setTimeout(() => {
    const win = Math.random() < WISH_CHANCE;
    w.classList.remove('tossing');
    w.classList.add(win ? 'win' : 'splash');
    if (win) {
      S.wishWon = true; // 中奖标记（成就）
      const gained = addEp(WISH_REWARD); // 统一入口：受 EP 上限约束，溢出部分入 RP 溢出池
      log(`许愿池：奇迹发生！+${fmt(gained)} EP${gained < WISH_REWARD ? '（已达存储上限，溢出转入 RP 池）' : ''}`, 'good');
      toast('✨ 奇迹发生了！+100K EP');
    } else {
      toast('水花都没有…（-100 EP）');
    }
    save(S); dirty.top = true;
  }, 1100);
  // 3s 冷却结束：复位硬币与按钮
  setTimeout(() => {
    w.classList.remove('win', 'splash');
    w.disabled = false;
  }, 3000);
}

export function initWishWell() { ensureWishWell(); }

// ========== 离职礼盒（sp3_farewell 购买入口） ==========
// 文案承诺「购买离职礼盒（1 EP）送给流失的线程」，条件加入 S._farewellBought 前置，
// 由本按钮提供购买入口。仅在休眠(dormant)/流失(losing)/staffUnhappy≥3 且本局未完成时显示。
const FAREWELL_COST = 1;
function farewellAvailable() {
  if ((S._specialTasksDone || {}).sp3_farewell) return false; // 本局已完成
  if (S._farewellBought) return false; // 已购买待结算（下一帧自动完成）
  const w = S.wageState || {};
  return w.state === 'dormant' || w.state === 'losing' || (S.staffUnhappy || 0) >= 3;
}
export function ensureFarewellGift() {
  let b = document.getElementById('farewell-gift');
  if (!farewellAvailable()) { if (b) b.style.display = 'none'; return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'farewell-gift';
    b.className = 'farewell-gift';
    b.title = '离职礼盒：送给流失线程的临别礼物（1 EP）—— 触发特殊任务「离职礼物」，解锁纪念墙';
    b.innerHTML = '🎁<span class="fg-label">离职礼盒</span><span class="fg-cost">1 EP</span>';
    b.addEventListener('click', onFarewellBuy);
    document.body.appendChild(b);
  }
  b.style.display = '';
}
function onFarewellBuy() {
  const b = document.getElementById('farewell-gift');
  if (!b || b.disabled) return;
  if ((S.ep || 0) < FAREWELL_COST) { toast(`EP 不足（需 ${FAREWELL_COST} EP）`); return; }
  S.ep -= FAREWELL_COST; spendRes('ep', FAREWELL_COST);
  S._farewellBought = true;
  b.disabled = true;
  b.classList.add('giving');
  save(S); dirty.top = true;
  // 礼盒飘出动画（0.8s）后立即结算 sp3_farewell（checkSpecialTasks 读到 _farewellBought=true 并完成）
  setTimeout(() => {
    b.classList.remove('giving');
    b.disabled = false;
    b.style.display = 'none';
    checkSpecialTasks(S, log, toast); // 立即结算，玩家即时看到奖励
    save(S); dirty.top = true; dirty.achievements = true;
  }, 800);
}
export function initFarewellGift() { ensureFarewellGift(); }
