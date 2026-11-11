// 终局层「深渊深潜」模块——解锁 / 10 分钟周期结算 / VS 注入升级 / 升级树 / 里程碑 / 面板
// v3.12.6 反馈①~④：结算制重做（详见 data/delve.js 头部注释）
import { S, save } from '../state.js';
import { policyMult } from '../data/policies.js';
import { fmt, fmtTime, echoLv, delveTechMult, researchMult, epStorageCap, corruptionCap, computeCps } from './economy.js';
import { religionUnlocked } from '../data/religions.js';
import { relicMult } from '../data/relics.js';
import {
  DELVE, levelNeed, vsPerCycle, epPerCycle, corruptPerCycle, delveUpgradeCost, milestoneVs,
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
// v3.12.6 ④：经验条（已注入 VS / 本级需求）
export function delveXp() {
  return (S.delve && S.delve.xp) || 0;
}
export function delveLevelNeed() {
  return levelNeed(delveDepth());
}
// 距离下次结算还剩多少秒
export function delveNextSettleSec() {
  if (!delveActive()) return DELVE.cycleSec;
  const t = (S.delve && S.delve.cycleT) || 0;
  return Math.max(0, DELVE.cycleSec - t);
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
  S.delve.up = S.delve.up || {};
  if (S.delve.xp == null) S.delve.xp = 0;
  if (S.delve.cycleT == null) S.delve.cycleT = 0;
  save(S);
  dlog('深渊之眼睁开：深潜层解锁——每 10 分钟结算一次，注入虚空碎片可下潜更深', 'good');
  if (toastFn) toastFn('🌀 深潜解锁：深渊之眼已睁开（终局层）');
  return { ok: true };
}

// 单个结算周期的快照（面板与 tick 共用同一口径）
export function delveCycleNow(depthArg) {
  const depth = Math.max(1, depthArg || delveDepth());
  const runMult = relicMult('brand') * delveTechMult() * researchMult('delve')
    * (1 + 0.5 * (echoLv('echo_delve') || 0)) * policyMult('delve');
  return {
    vs: vsPerCycle(depth, delveUpgradeLv('diver')) * runMult,
    ep: epPerCycle(depth, computeCps(), epStorageCap(), delveUpgradeLv('hull')),
    corrupt: corruptPerCycle(depth, delveUpgradeLv('purge')),
  };
}

// 开始 / 继续深潜：只切换开关，不再一次性收费（消耗改由周期结算承担）
export function startDelve() {
  if (!delveUnlocked()) return { ok: false, reason: '未解锁' };
  if (delveActive()) return { ok: false, reason: '已在深潜中' };
  S.delve.active = true;
  S.delve.cycleT = S.delve.cycleT || 0;   // 中断后续着走，不重置进度
  save(S);
  dlog(`开始深潜（Lv.${delveDepth()}）：每 ${DELVE.cycleSec / 60} 分钟结算一次产出与消耗`, 'good');
  return { ok: true };
}

// 上浮：停止结算，等级与经验条保留
export function stopDelve() {
  if (!delveActive()) return { ok: false, reason: '未在深潜中' };
  S.delve.active = false;
  save(S);
  dlog(`上浮完成（当前等级 Lv.${delveDepth()} 保留，产出与腐化停止）`, 'good');
  return { ok: true };
}

// 注入 VS 升一级（v3.12.6 ④）：一次点击最多升一级，差额不足时按余额部分注入
export function injectVs() {
  if (!delveUnlocked()) return { ok: false, reason: '未解锁' };
  if (!S.delve) S.delve = {};
  S.delve.xp = S.delve.xp || 0;
  // 先结算可能存在的历史溢出（旧档 / 手动改档兜底），再取本级真实缺口
  let leveled = 0;
  while (S.delve.xp >= levelNeed(delveDepth())) {
    S.delve.xp -= levelNeed(delveDepth());
    S.delve.depth = (S.delve.depth || 0) + 1;
    leveled++;
  }
  const have = S.vs || 0;
  if (have <= 0) {
    if (leveled) { save(S); checkMilestones(); }
    return { ok: false, reason: '虚空碎片不足' };
  }
  const need = Math.max(0, levelNeed(delveDepth()) - S.delve.xp);
  const take = Math.min(need, have);
  S.vs = have - take;
  S.delve.xp += take;
  while (S.delve.xp >= levelNeed(delveDepth())) {
    S.delve.xp -= levelNeed(delveDepth());
    S.delve.depth = (S.delve.depth || 0) + 1;
    leveled++;
  }
  save(S);
  if (leveled) {
    dlog(`深潜等级提升至 Lv.${delveDepth()}（-${fmt(take)} VS）：产出与每周期消耗同步抬高`, 'good');
    if (toastFn) toastFn(`🌑 深潜 Lv.${delveDepth()}`);
    checkMilestones();
  } else {
    dlog(`注入 ${fmt(take)} VS：${fmt(S.delve.xp)} / ${fmt(levelNeed(delveDepth()))}`, 'info');
  }
  return { ok: true, spent: take, leveled };
}

function checkMilestones() {
  const d = delveDepth();
  const sonarLv = delveUpgradeLv('sonar');
  for (const m of DELVE.milestones) {
    if (d >= m.depth && !(S.delve.mileDone && S.delve.mileDone[m.depth])) {
      S.delve.mileDone = S.delve.mileDone || {};
      S.delve.mileDone[m.depth] = true;
      const gain = milestoneVs(m, sonarLv);
      S.vs = (S.vs || 0) + gain;
      dlog(`深潜 Lv.${m.depth} 达成：深渊之眼凝视，+${fmt(gain)} 虚空碎片`, 'good');
      if (toastFn) toastFn(`🌌 深潜里程碑 Lv.${m.depth}：+${fmt(gain)} VS`);
    }
  }
}

// 单周期结算：先扣 EP，再给 VS；EP 不足以覆盖时按可用比例折算（不吞进度、不出现负数）
function settleCycle() {
  const depth = Math.max(1, delveDepth());
  const c = delveCycleNow(depth);
  const ratio = c.ep > 0 ? Math.min(1, (S.ep || 0) / c.ep) : 1;
  if (ratio <= 0) {
    stopDelve();
    dlog(`EP 见底：无法支付 Lv.${depth} 的维持开销（需 ${fmt(c.ep)} EP / 周期），已自动上浮`, 'bad');
    if (toastFn) toastFn('⚠️ EP 见底，深潜已自动上浮');
    return;
  }
  S.ep = Math.max(0, (S.ep || 0) - c.ep * ratio);
  const gain = c.vs * ratio;
  if (gain > 0) S.vs = (S.vs || 0) + gain;
  const cCap = corruptionCap();
  if (c.corrupt > 0) S.corruption = Math.min(cCap, (S.corruption || 0) + c.corrupt);
  if (ratio < 0.999) {
    dlog(`EP 不足：本周期只结算 ${Math.round(ratio * 100)}%（+${fmt(gain)} VS / -${fmt(c.ep * ratio)} EP）`, 'bad');
  } else {
    dlog(`Lv.${depth} 结算：+${fmt(gain)} VS · -${fmt(c.ep)} EP`, 'good');
  }
  checkMilestones();
}

// 周期推进（主循环 tick 驱动；仅深潜中生效）
export function tickDelve(dt) {
  if (!delveUnlocked() || !delveActive()) return;
  if (!S.delve) return;
  S.delve.cycleT = (S.delve.cycleT || 0) + dt;
  let guard = 0;
  while (S.delve.cycleT >= DELVE.cycleSec && S.delve.active && guard < DELVE.maxCyclesPerTick) {
    S.delve.cycleT -= DELVE.cycleSec;
    guard++;
    settleCycle();
  }
  if (guard >= DELVE.maxCyclesPerTick) S.delve.cycleT = 0; // 极端离线回归：放弃溢出部分，防卡帧
  // v2.8.6 B2a：观测主义政策——腐化额外累积（政策侧效果，与周期结算无关，仍按秒）
  const obsMult = policyMult('corruption');
  if (obsMult > 1 && S.corruption < corruptionCap()) {
    S.corruption = Math.min(corruptionCap(), (S.corruption || 0) + 0.02 * dt);
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
      <div class="delve-desc">深渊之眼在矩阵之底沉睡……满足以下全部条件后深潜层开启（终局层，等级与虚空碎片跨转生保留）：</div>
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
  const need = delveLevelNeed();
  const xp = delveXp();
  const pct = Math.min(100, (xp / need) * 100);
  const c = delveCycleNow(Math.max(1, depth));
  // 注入按钮：一次注入「补满本级缺口」与「当前余额」中较小者
  const injectTake = Math.min(Math.max(0, need - xp), S.vs || 0);
  const canInject = injectTake > 0;
  const left = delveNextSettleSec();
  const muted = (S.corruption || 0) >= corruptionCap();

  let html = `
    <div class="off-stat"><span>虚空碎片（VS）</span><b style="color:var(--cyan)">${fmt(S.vs || 0)}</b></div>
    <div class="delve-lv">
      <div class="delve-lv-head">
        <span>深潜等级 <b style="color:var(--accent)">Lv.${depth}</b>${active ? '<span class="delve-lv-on">深潜中</span>' : ''}</span>
        <span class="delve-lv-num">${fmt(xp)} / ${fmt(need)} VS</span>
      </div>
      <div class="delve-lv-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>
    <div class="delve-cycle">
      <div class="delve-cycle-row"><span>产出 / 10 分钟</span><b style="color:var(--green,#3fb950)">+${fmt(c.vs)} VS</b></div>
      <div class="delve-cycle-row"><span>消耗 / 10 分钟</span><b style="color:var(--warn,#d29922)">-${fmt(c.ep)} EP</b></div>
      ${active ? `<div class="delve-cycle-row"><span>腐化 / 10 分钟</span><b style="color:var(--red,#f85149)">+${c.corrupt.toFixed(1)}%</b></div>` : ''}
    </div>
    <div class="delve-actions">
      <button class="btn ${canInject ? '' : 'disabled'}" data-delve-inject="1" ${canInject ? '' : 'disabled'}
        title="把虚空碎片注入经验条，填满即升 1 级（产出与消耗同步抬高）">注入 ${fmt(injectTake)} VS → Lv.${depth + 1}</button>
      <button class="btn" data-delve-toggle="1"
        title="${active ? '上浮：停止周期结算（等级与经验条保留）' : `开始深潜：每 ${DELVE.cycleSec / 60} 分钟结算 +${fmt(c.vs)} VS / -${fmt(c.ep)} EP`}">${active ? '上浮' : '开始深潜'}</button>
    </div>
    <div class="delve-state">${active
      ? (muted
        ? '<span style="color:var(--red,#f85149)">腐化已满：先净化再继续</span>'
        : `下次结算 <b>${fmtTime(left)}</b> 后`)
      : '已上浮：不产出也不消耗'}</div>
    <div class="delve-hint">等级只吃虚空碎片：每 10 分钟结算一次，越深赚得越多、烧得也越多。</div>
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
    if (e.target.closest('[data-delve-inject]')) {
      const r = injectVs();
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
