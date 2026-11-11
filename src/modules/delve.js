// v2.6.0：终局层「深渊深潜」模块——解锁 / 下潜上浮 / 深潜产出与腐化 / 升级树 / 里程碑 / 面板
import { S, save } from '../state.js';
import { policyMult } from '../data/policies.js';
import { fmt, echoLv, delveTechMult, researchMult, epStorageCap, corruptionCap } from './economy.js';
import { religionUnlocked } from '../data/religions.js';
import { relicMult } from '../data/relics.js'; // v2.7.0：湮灭刻印——深潜产出乘区
import {
  DELVE, diveCost, diveEpCost, delveEpUpkeep, vsPerSec, delveCorruptRate, delveUpgradeCost, milestoneVs,
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
  if (!S.resDiscovered || !S.resDiscovered.dm) {
    // v3.0.3 第二批②：星尘金库买入即算发现 DM（与顶栏 anchorDone 同口径）
    if (!S.upgrades || !(S.upgrades.dm_vault || 0)) return { ok: false, reason: '需先发现深渊之力（DM）' };
  }
  if (!religionUnlocked()) return { ok: false, reason: '需先信奉一个宗教分支' };
  S.delve = S.delve || {};
  S.delve.unlocked = true;
  S.delve.up = S.delve.up || {}; // v3.0.3 后续反馈①：旧档兜底
  save(S);
  dlog('深渊之眼睁开：深潜层解锁——耗尽深渊之力，直取矩阵之底', 'good');
  if (toastFn) toastFn('🌀 深潜解锁：深渊之眼已睁开（终局层）');
  return { ok: true };
}

// v3.0.0 ①：下潜当前成本快照（EP 主成本 + DM 辅助成本）——面板与 startDelve 共用同一口径
export function diveCostNow() {
  const depth = delveDepth();
  return {
    dm: diveCost(depth),
    ep: diveEpCost(depth, epStorageCap(), delveUpgradeLv('hull')),
  };
}
// v3.0.0 ①：深潜维持开销（EP/秒，深潜中生效）
export function delveUpkeepNow(depth) {
  return delveEpUpkeep(Math.max(1, depth || delveDepth()), epStorageCap(), delveUpgradeLv('hull'));
}

// 下潜：消耗 EP（主成本，随层深按存储上限比例涨）+ DM（辅助成本，随层深指数涨），开启深潜产出与腐化累积
export function startDelve() {
  if (!delveUnlocked()) return { ok: false, reason: '未解锁' };
  if (delveActive()) return { ok: false, reason: '已在深潜中' };
  const { dm: cost, ep: epCost } = diveCostNow();
  if ((S.ep || 0) < epCost) return { ok: false, reason: `EP 不足：下潜至 Lv.${delveDepth() + 1} 需 ${fmt(epCost)} EP（当前 ${fmt(S.ep || 0)}）` };
  if ((S.dm || 0) < cost) return { ok: false, reason: `DM 不足：下潜至 Lv.${delveDepth() + 1} 需 ${fmt(cost)} DM（当前 ${fmt(S.dm || 0)}）` };
  S.ep -= epCost;
  S.dm -= cost;
  // v2.9.0 修复：下潜成功即层深 +1——此前 depth 从不递增（恒 0），层深里程碑/深渊政策组/轮回遗存维度全部失效
  S.delve.depth = (S.delve.depth || 0) + 1;
  S.delve.active = true;
  save(S);
  dlog(`下潜至 Lv.${delveDepth()}（-${fmt(epCost)} EP / -${fmt(cost)} DM）：虚空碎片产出开启，腐化与 EP 维持随层深累积`, 'good');
  return { ok: true, cost, epCost };
}

// 上浮：停止产出与腐化累积，层深保留
export function stopDelve() {
  if (!delveActive()) return { ok: false, reason: '未在深潜中' };
  S.delve.active = false;
  save(S);
  dlog(`上浮完成（当前层深 Lv.${delveDepth()} 保留，产出与腐化停止）`, 'good');
  return { ok: true };
}

// 深潜产出 / 腐化 / 里程碑（主循环 tick 驱动；仅深潜中生效）
export function tickDelve(dt) {
  if (!delveUnlocked() || !delveActive()) return;
  const depth = Math.max(1, delveDepth()); // 当前已下潜到的层（层深自下潜成功时递增）
  const rate = vsPerSec(depth, delveUpgradeLv('diver')) * relicMult('brand') * delveTechMult() * researchMult('delve'); // v2.7.0 遗物 + v2.8.4 虚空视界 + v2.8.25 ②：深渊观测
  if (rate > 0) S.vs = (S.vs || 0) + rate * dt * (1 + 0.5 * (echoLv('echo_delve') || 0)) * policyMult('delve'); // v2.7.3 ⑤：回响·深潜共振 + v2.8.6 B2a：观测主义/实证主义
  const cr = delveCorruptRate(depth, delveUpgradeLv('purge'));
  // v3.7.0：上限统一走 corruptionCap()（深渊线可由规则抬高），不再硬编码 100
  const cCap = corruptionCap();
  if (cr > 0) S.corruption = Math.min(cCap, (S.corruption || 0) + cr * dt);
  // v2.8.6 B2a：观测主义——腐化 +0.02/s（拿深潜产出强的代价）
  const obsMult = policyMult('corruption');
  if (obsMult > 1 && S.corruption < cCap) S.corruption = Math.min(cCap, (S.corruption || 0) + 0.02 * dt);
  // v3.0.0 ①：深潜维持开销——每秒烧 EP（层深驱动）。EP 耗尽 → 算力枯竭，强制上浮（防死锁，不吞层深）
  const upkeep = delveEpUpkeep(depth, epStorageCap(), delveUpgradeLv('hull'));
  if (upkeep > 0) {
    S.ep = Math.max(0, (S.ep || 0) - upkeep * dt);
    if ((S.ep || 0) <= 0) {
      stopDelve();
      dlog(`算力枯竭：EP 被维持开销抽干（-${fmt(upkeep)}/s），深潜强制上浮（层深 Lv.${depth} 保留）`, 'bad');
      if (toastFn) toastFn('⚠️ 算力枯竭：EP 耗尽，深潜强制上浮');
      save(S);
      return;
    }
  }
  // 层深里程碑（一次性 VS 奖励；v3.0.0：回声定位 +20%/级）
  const d = delveDepth();
  const sonarLv = delveUpgradeLv('sonar');
  for (const m of DELVE.milestones) {
    if (d >= m.depth && !(S.delve && S.delve.mileDone && S.delve.mileDone[m.depth])) {
      S.delve = S.delve || {};
      S.delve.mileDone = S.delve.mileDone || {};
      S.delve.mileDone[m.depth] = true;
      const gain = milestoneVs(m, sonarLv);
      S.vs = (S.vs || 0) + gain;
      dlog(`深潜 Lv.${m.depth} 达成：深渊之眼凝视，+${fmt(gain)} 虚空碎片`, 'good');
      if (toastFn) toastFn(`🌌 深潜里程碑 Lv.${m.depth}：+${fmt(gain)} VS`);
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
  // v3.0.3 后续反馈①：S.delve 默认 {} 无 up 字段（state.js），首次购买原 `S.delve.up[id]=lv+1` 对 undefined
  // 赋值抛 TypeError → 点击静默失败（「终局升级无法升级」根因）
  S.delve.up = S.delve.up || {};
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
  const { dm: nextCost, ep: nextEpCost } = diveCostNow();
  const upkeep = delveUpkeepNow(depth);
  const rate = vsPerSec(Math.max(1, depth), delveUpgradeLv('diver')) * relicMult('brand') * delveTechMult(); // v2.9.0：产出按当前真实层深（此前恒按第 1 层）
  const cr = delveCorruptRate(Math.max(1, depth), delveUpgradeLv('purge'));
  const afford = (S.ep || 0) >= nextEpCost && (S.dm || 0) >= nextCost;
  let html = `
    <div class="off-stat"><span>虚空碎片（VS）</span><b style="color:var(--cyan)">${fmt(S.vs || 0)}</b></div>
    <div class="off-stat"><span>层深</span><b>Lv.${depth}${active ? ' · 深潜中' : ''}</b></div>
    <div class="off-stat"><span>EP 存量 / 上限</span><b>${fmt(S.ep || 0)} / ${fmt(epStorageCap())}</b></div>
    <div class="off-stat"><span>DM 存量</span><b>${fmt(S.dm || 0)}</b></div>
    ${active ? `
      <div class="off-stat"><span>VS 产出</span><b style="color:var(--green)">+${rate.toFixed(2)}/s</b></div>
      <div class="off-stat"><span>EP 维持开销</span><b style="color:var(--warn,#d29922)">-${fmt(upkeep)}/s</b></div>
      <div class="off-stat"><span>深潜腐化</span><b style="color:var(--red, #f85149)">+${cr.toFixed(2)}%/s</b></div>` : ''}
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">${active ? '深潜中（EP 归零将强制上浮）' : `下次下潜至 Lv.${depth + 1}：${fmt(nextEpCost)} EP + ${fmt(nextCost)} DM`}</div>
    <button class="btn ${active ? '' : afford ? '' : 'disabled'}" data-delve-toggle="1"
      title="${active ? '上浮：停止产出与腐化' : `消耗 ${fmt(nextEpCost)} EP + ${fmt(nextCost)} DM 下潜一层`}">${active ? '上浮' : `下潜（${fmt(nextEpCost)} EP · ${fmt(nextCost)} DM）`}</button>
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
