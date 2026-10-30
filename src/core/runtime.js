// v3.0.0 测试性解耦：把原本散落在 main.js 顶层的「侧效工具」(日志 / toast / 脏检查 / 通用确认框)
// 下沉到 DOM 无关的 core 模块，使 shop / expedition / reincarn / rift / tech 等核心逻辑模块
// 可在纯 Node 环境被单测（import 不再牵连整棵 DOM 依赖树）。
// 浏览器中这些函数仍代理到真实 DOM；Node(测试) 下为 no-op 或自动确认。

// ========== 脏检查渲染标记 ==========
export const dirty = {
  top: true, hero: true, shop: true, tech: true,
  pets: true, prestige: true, projects: true,
  offline: true, story: true, log: false,
  rift: true, expedition: true,
  tide: true, corruption: true, // v2.0 新增：潮汐卡片 / 腐化条
  ai: true, // v1.3 A：AI 助手面板
  relics: false, // v2.7.0：深渊遗物
};

// ========== 日志系统 ==========
const logs = [];
export function log(msg, cls) {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0');
  const clsHtml = cls === 'good' ? ' class="ev-good"' : cls === 'bad' ? ' class="ev-bad"' : '';
  logs.unshift(`<div><span class="t mono">${hh}:${mm}</span><span${clsHtml}>${msg}</span></div>`);
  if (logs.length > 40) logs.pop();
  const el = (typeof document !== 'undefined') ? document.getElementById('log-content') : null;
  if (el) el.innerHTML = logs.join('');
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
