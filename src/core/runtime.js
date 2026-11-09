// v3.0.0 测试性解耦：把原本散落在 main.js 顶层的「侧效工具」(日志 / toast / 脏检查 / 通用确认框)
// 下沉到 DOM 无关的 core 模块，使 shop / expedition / reincarn / rift / tech 等核心逻辑模块
// 可在纯 Node 环境被单测（import 不再牵连整棵 DOM 依赖树）。
// 浏览器中这些函数仍代理到真实 DOM；Node(测试) 下为 no-op 或自动确认。

// ========== 脏检查渲染标记 ==========
// v3.10.0：初始键由 core/panelKeys.js 的面板清单派生，消除 v3.9.0 的「19 个初始键 ↔ 26 个注册面板」
// 漂移（offline / log 两个幽灵键 + rp / religion / policy / delve / bazaar / riftTab 六个缺键）。
import { createDirty } from './panelKeys.js';
export const dirty = createDirty();

// ========== 日志系统 ==========
// v3.10.4 ②：改为「最近 1 小时」时间窗口保留 + localStorage 缓存（刷新后恢复，即"缓存 1 小时"）。
//   旧实现为内存数组上限 40、无持久化，刷新即丢。每条记 { t: 时间戳, h: HTML }，渲染时按 1h 过滤。
const LOG_TTL = 3600 * 1000; // 1 小时
const LOG_KEY = 'abyss_idle_v2_logcache';
let logs = [];
function loadLogCache() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) {
      const now = Date.now();
      logs = arr.filter(e => e && typeof e.t === 'number' && now - e.t < LOG_TTL);
    }
  } catch { /* 坏档忽略 */ }
}
function saveLogCache() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch { /* 容量超限忽略 */ }
}
loadLogCache();
export function log(msg, cls) {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0');
  const clsHtml = cls === 'good' ? ' class="ev-good"' : cls === 'bad' ? ' class="ev-bad"' : '';
  logs.unshift({ t: t.getTime(), h: `<div><span class="t mono">${hh}:${mm}</span><span${clsHtml}>${msg}</span></div>` });
  // 时间窗口裁剪（1 小时）+ 安全硬上限（防止异常高频日志无限增长）
  const cutoff = t.getTime() - LOG_TTL;
  while (logs.length && logs[logs.length - 1].t < cutoff) logs.pop();
  if (logs.length > 500) logs.length = 500;
  saveLogCache();
  const el = (typeof document !== 'undefined') ? document.getElementById('log-content') : null;
  if (el) el.innerHTML = logs.map(e => e.h).join('');
}

// ========== toast 提示 ==========
let toastTimer = null;
export function toast(msg) {
  const el = (typeof document !== 'undefined') ? document.getElementById('toast') : null;
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ========== 通用二级确认弹框（title / 正文 / 取消-确认） ==========
let _confirmOk = null;
let _confirmHooks = { pause() {}, resume() {} };
// 浏览器中由 main.js 注入 pauseGameClock / resumeGameClock，使确认期间一切计时暂停；
// Node(测试) 下无 DOM，直接自动确认回调，便于单测无需模拟弹框交互。
export function registerConfirmHooks(h) {
  if (h && typeof h.pause === 'function') _confirmHooks.pause = h.pause;
  if (h && typeof h.resume === 'function') _confirmHooks.resume = h.resume;
}
export function askConfirm(title, text, onYes) {
  const m = (typeof document !== 'undefined') ? document.getElementById('confirm-modal') : null;
  const t = (typeof document !== 'undefined') ? document.getElementById('confirm-title') : null;
  const x = (typeof document !== 'undefined') ? document.getElementById('confirm-text') : null;
  if (!m || !t || !x) { if (onYes) onYes(); return; } // 非 DOM：自动确认（测试）
  t.textContent = title;
  x.textContent = text;
  _confirmOk = onYes;
  m.style.display = 'flex';
  _confirmHooks.pause(); // v2.9.0：弹框期间一切计时暂停
}
// 在浏览器启动时由 main.js 调用，绑定确认框 取消/确定 按钮
export function bindConfirmButtons() {
  if (typeof document === 'undefined') return;
  const cancel = document.getElementById('confirm-cancel');
  const ok = document.getElementById('confirm-ok');
  if (cancel) cancel.addEventListener('click', () => {
    const m = document.getElementById('confirm-modal'); if (m) m.style.display = 'none'; _confirmOk = null;
    _confirmHooks.resume();
  });
  if (ok) ok.addEventListener('click', () => {
    const m = document.getElementById('confirm-modal'); if (m) m.style.display = 'none';
    _confirmHooks.resume();
    const fn = _confirmOk; _confirmOk = null; if (fn) fn();
  });
}
