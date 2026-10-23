// v2.6.0：终局层「深渊深潜」模块——解锁 / 下潜上浮 / 深潜产出与腐化 / 升级树 / 里程碑 / 面板
import { S, save } from '../state.js';
import { fmt } from './economy.js';
import { religionUnlocked } from '../data/religions.js';
import { relicMult } from '../data/relics.js'; // v2.7.0：湮灭刻印——深潜产出乘区
import {
  DELVE, diveCost, vsPerSec, delveCorruptRate, delveUpgradeCost,
} from '../data/delve.js';

let logFn = null;
let toastFn = null;
export function setDelveLogFn(fn) { logFn = fn; }
export function setDelveToastFn(fn) { toastFn = fn; }
function dlog(msg, cls) { if (logFn) logFn(`[深潜] ${msg}`, cls); }

export function delveUnlocked() {
  return !!(S.delve && S.delve.unlocked);
}
export function delveActive() {
  return !!(S.delve && S.delve.active);
}
export function delveDepth() {
  return (S.delve && S.delve.depth) || 0;
}
export function delveUpgradeLv(id) {
  return (S.delve && S.delve.up && S.delve.up[id]) || 0;
}

// 解锁判定：ES ≥ 3 且 DM 资源点已发现 且 宗教已信奉（贯穿全流程的终点层）
export function canUnlockDelve() {
  if (delveUnlocked()) return true;
  if ((S.es || 0) < DELVE.unlockEs) return false;
  if (!S.resDiscovered || !S.resDiscovered.dm) return false;
  return religionUnlocked();
}

export function unlockDelve() {
  if (delveUnlocked()) return { ok: false, reason: '已解锁' };
  if ((S.es || 0) < DELVE.unlockEs) return { ok: false, reason: `需转生 ES ≥ ${DELVE.unlockEs}` };
  if (!S.resDiscovered || !S.resDiscovered.dm) return { ok: false, reason: '需先发现深渊之力（DM）' };
  if (!religionUnlocked()) return { ok: false, reason: '需先信奉一个宗教分支' };
  S.delve = S.delve || {};
  S.delve.unlocked = true;
  save(S);
  dlog('深渊之眼睁开：深潜层解锁——耗尽深渊之力，直取矩阵之底', 'good');
  if (toastFn) toastFn('🌀 深潜解锁：深渊之眼已睁开（终局层）');
  return { ok: true };
}

// 下潜：消耗 DM（成本随层深指数涨），开启深潜产出与腐化累积
export function startDelve() {
  if (!delveUnlocked()) return { ok: false, reason: '未解锁' };
  if (delveActive()) return { ok: false, reason: '已在深潜中' };
  const cost = diveCost(delveDepth());
  if ((S.dm || 0) < cost) return { ok: false, reason: `DM 不足：下潜至 Lv.${delveDepth() + 1} 需 ${fmt(cost)} DM（当前 ${fmt(S.dm || 0)}）` };
  S.dm -= cost;
  S.delve.active = true;
  save(S);
  dlog(`下潜至 Lv.${delveDepth() + 1}（-${fmt(cost)} DM）：虚空碎片产出开启，腐化随层深累积`, 'good');
  return { ok: true, cost };
}

// 上浮：停止产出与腐化累积，层深保留
export function stopDelve() {
  if (!delveActive()) return { ok: false, reason: '未在深潜中' };
  S.delve.active = false;
  save(S);
  dlog(`上浮至 ${delveDepth() + 1} 层边界（当前层深 ${delveDepth() + 1} 保留）`, 'good');
  return { ok: true };
}

// 深潜产出 / 腐化 / 里程碑（主循环 tick 驱动；仅深潜中生效）
export function tickDelve(dt) {
  if (!delveUnlocked() || !delveActive()) return;
  const depth = delveDepth() + 1; // 当前已下潜到的层（下潜时层数 = 成本对应层）
  const rate = vsPerSec(depth, delveUpgradeLv('diver')) * relicMult('brand'); // v2.7.0 遗物：湮灭刻印
  if (rate > 0) S.vs = (S.vs || 0) + rate * dt;
  const cr = delveCorruptRate(depth, delveUpgradeLv('purge'));
  if (cr > 0) S.corruption = Math.min(100, (S.corruption || 0) + cr * dt);
  // 层深里程碑（一次性 VS 奖励）
  const d = delveDepth();
  for (const m of DELVE.milestones) {
    if (d >= m.depth && !(S.delve && S.delve.mileDone && S.delve.mileDone[m.depth])) {
      S.delve = S.delve || {};
      S.delve.mileDone = S.delve.mileDone || {};
      S.delve.mileDone[m.depth] = true;
      S.vs = (S.vs || 0) + m.vs;
      dlog(`深潜 Lv.${m.depth} 达成：深渊之眼凝视，+${fmt(m.vs)} 虚空碎片`, 'good');
      if (toastFn) toastFn(`🌌 深潜里程碑 Lv.${m.depth}：+${fmt(m.vs)} VS`);
    }
  }
}

// 升级树购买（VS 消耗）
export function buyDelveUpgrade(id) {
  if (!delveUnlocked()) return { ok: false, reason: '未解锁' };
  const u = DELVE.upgrades[id];
  if (!u) return { ok: false, reason: '未知升级' };
  const lv = delveUpgradeLv(id);
  if (lv >= u.cap) return { ok: false, reason: `「${u.name}」已满级` };
  const cost = delveUpgradeCost(id, lv);
  if ((S.vs || 0) < cost) return { ok: false, reason: `虚空碎片不足（需 ${fmt(cost)} VS）` };
  S.vs -= cost;
  S.delve.up[id] = lv + 1;
  save(S);
  dlog(`「${u.name}」升至 Lv.${lv + 1}（-${fmt(cost)} VS）：${u.desc}`, 'good');
  return { ok: true, level: lv + 1 };
}

// ========== 面板 ==========
export function renderDelvePanel(container) {
  if (!container) return;
  if (!delveUnlocked()) {
    const ok = canUnlockDelve();
    const esOk = (S.es || 0) >= DELVE.unlockEs;
    const dmOk = !!(S.resDiscovered && S.resDiscovered.dm);
    const relOk = religionUnlocked();
    container.innerHTML = `
      <div class="delve-desc">深渊之眼在矩阵之底沉睡……满足以下全部条件后深潜层开启（终局层，层深与虚空碎片跨转生保留）：</div>
      <div style="font-size:12px;line-height:1.9;color:var(--text-2)">
        转生 ES ≥ ${DELVE.unlockEs}：${esOk ? '✓' : `（当前 ${S.es || 0}）`}<br>
        发现深渊之力（DM）：${dmOk ? '✓' : '✗'}<br>
        信奉宗教分支：${relOk ? '✓' : '✗'}
      </div>
      <button class="btn ${ok ? '' : 'disabled'}" data-delve-unlock="1">唤醒深渊之眼</button>`;
    return;
  }
  const depth = delveDepth();
  const active = delveActive();
  const nextCost = diveCost(depth);
  const rate = vsPerSec(depth + 1, delveUpgradeLv('diver')) * relicMult('brand'); // v2.7.0 遗物：湮灭刻印
  const cr = delveCorruptRate(depth + 1, delveUpgradeLv('purge'));
  let html = `
    <div class="delve-desc">深渊深潜：消耗 DM 下潜，越深虚空碎片产出越高，但腐化随层深累积（净化核心可抵消）。上浮保留层深，产出停止。</div>
    <div class="off-stat"><span>虚空碎片（VS）</span><b style="color:var(--cyan)">${fmt(S.vs || 0)}</b></div>
    <div class="off-stat"><span>层深</span><b>Lv.${depth}${active ? ' · 深潜中' : ''}</b></div>
    <div class="off-stat"><span>DM 存量</span><b>${fmt(S.dm || 0)}</b></div>
    ${active ? `
      <div class="off-stat"><span>VS 产出</span><b style="color:var(--green)">+${rate.toFixed(2)}/s</b></div>
      <div class="off-stat"><span>深潜腐化</span><b style="color:var(--red, #f85149)">+${cr.toFixed(2)}%/s</b></div>` : ''}
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">${active ? '深潜中' : `下次下潜：${fmt(nextCost)} DM（至 Lv.${depth + 1}）`}</div>
    <button class="btn ${active ? '' : (S.dm || 0) < nextCost ? 'disabled' : ''}" data-delve-toggle="1"
      title="${active ? '上浮：停止产出与腐化' : '消耗 DM 下潜一层'}">${active ? '上浮' : `下潜（${fmt(nextCost)} DM）`}</button>
    <div style="margin:12px 0 6px;font-size:11px;color:var(--text-2)">终局升级（虚空碎片）</div>`;
  for (const [id, u] of Object.entries(DELVE.upgrades)) {
    const lv = delveUpgradeLv(id);
    const cost = lv >= u.cap ? null : delveUpgradeCost(id, lv);
    html += `
      <div class="delve-upg-row" data-delve-upg="${id}">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-1)">${u.icon} ${u.name} <span style="color:var(--text-3);font-size:11px">Lv.${lv}/${u.cap}</span></div>
          <div style="font-size:11px;color:var(--text-3)">${u.desc}</div>
        </div>
        <button class="btn ${cost === null || (S.vs || 0) < cost ? 'disabled' : ''}" ${cost === null ? 'disabled' : ''}>${cost === null ? '满级' : `${fmt(cost)} VS`}</button>
      </div>`;
  }
  container.innerHTML = html;
}

export function bindDelvePanel(container) {
  if (!container || container.dataset.delveBound) return;
  container.dataset.delveBound = '1';
  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-delve-unlock]')) {
      const r = unlockDelve();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderDelvePanel(container);
      return;
    }
    if (e.target.closest('[data-delve-toggle]')) {
      const r = delveActive() ? stopDelve() : startDelve();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderDelvePanel(container);
      return;
    }
    const upEl = e.target.closest('[data-delve-upg]');
    if (upEl) {
      const r = buyDelveUpgrade(upEl.dataset.delveUpg);
      if (!r.ok && toastFn) toastFn(r.reason);
      renderDelvePanel(container);
      return;
    }
  });
}
