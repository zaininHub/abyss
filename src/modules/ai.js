// v1.3 模块 A：AI 助手 MVP（三开关：自动升级 / 自动招募 / 自动领取 + 预留线）
// 解锁：科技树「AI 管理核心」（ai_core，里程碑 cps≥1e4 后可见，50 RP，跨晋升保留）
// 规范（设计 §5）：
//   - 三开关默认全关，每开关独立可关；关闭后无新动作
//   - 自动升级：每 5s 买「回本最短」产出项（payback = 成本 ÷ 边际 CPS 含全局乘数），EP ≥ 预留线才买
//   - 自动招募：staffNetPerSec() > 0 且 EP ≥ staffCost×2（net<0 自然停）
//   - 自动领取：任务 pending 即领（EP 类奖励走 addEp 上限口径，由 claimProject 内部处理）
//   - 预留线：EP 上限的 10% / 30% / 50% 三档（默认 30%）
//   - 所有动作走日志带 [AI] 前缀；面板顶部一键全关
import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';
import {
  hasTech, computeCps, globalMult, epStorageCap, staffCost, staffNetPerSec,
  fmt, unitCost, costMult, addEp,
} from './economy.js';
import { claimProject } from './projects.js';
// v2.5.5：AI 自动购建（全部资源点解锁后可激活，大量 EP 激活，可调速率，严格限速防竞争）
import { V21_BUILDINGS, v21Level, v21Maxed, capOf } from '../data/buildings.js';
import { v21BuildingCost } from './economy.js';

let logFn = null;
export function setAiLogFn(fn) { logFn = fn; }
function ailog(msg, cls) { if (logFn) logFn(`[AI] ${msg}`, cls); }

const VEHICLE_IDS = BALANCE.vehicles.ids;
const DM_SKIP = ['dmsight', 'dmfeed', 'dmmind', 'dmprotocol'];
const THREAD_IDS = ['subsist1', 'subsist2', 'subsist3', 'cpu', 'mem', 'gpu', 'cache'];

export function aiUnlocked() { return hasTech('ai_core'); }

// v2.5.5：全部资源点解锁判定（resDiscovered 十个锚点全 true）
const ALL_RES_KEYS = ['ep', 'cps', 'run', 'tide', 'rank', 'rp', 'es', 'faith', 'pt', 'dm'];
export function allResDiscovered(S) {
  const rd = (S && S.resDiscovered) || {};
  return ALL_RES_KEYS.every(k => rd[k] === true);
}
export function autoBuildUnlocked() { return !!(S.ai && S.ai.autoBuildUnlocked); }
export function autoBuildActivateCost() { return BALANCE.ai.aiAutoBuild.activateCost; }
export function autoBuildRate() {
  const r = (S.ai && S.ai.autoBuildRate) || BALANCE.ai.aiAutoBuild.defaultRate;
  return Math.max(BALANCE.ai.aiAutoBuild.minRate, Math.min(3600, r)); // 硬下限 5s：改档/改存档均不生效
}
export function autoBuildActivable() {
  return aiUnlocked() && !autoBuildUnlocked() && allResDiscovered(S) && S.ep >= autoBuildActivateCost();
}
// 激活：校验 + 一次性扣除大量 EP
export function activateAutoBuild() {
  if (autoBuildUnlocked()) return { ok: false, reason: '已激活' };
  if (!allResDiscovered(S)) return { ok: false, reason: '未解锁全部资源点' };
  const cost = autoBuildActivateCost();
  if (S.ep < cost) return { ok: false, reason: `EP 不足（需 ${fmt(cost)}）` };
  S.ep -= cost;
  S.ai.autoBuildUnlocked = true;
  S.ai.autoBuild = true;
  save(S);
  return { ok: true, cost };
}

export function reserveLine() {
  return epStorageCap() * (S.ai?.reserve ?? BALANCE.ai.defaultReserve);
}

function aiShopUnlocked(u) {
  const owned = S.upgrades[u.id] || 0;
  return owned > 0 || S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3;
}

// 自动升级候选：主商店产出项（可解锁、cps>0），回本 = 成本 ÷ 边际 CPS（含全局乘数）
function bestPaybackItem() {
  let best = null, bestPayback = Infinity;
  for (const u of UPGRADES) {
    if (VEHICLE_IDS.includes(u.id) || DM_SKIP.includes(u.id) || THREAD_IDS.includes(u.id)) continue;
    if (!u.cps || u.cps <= 0) continue;
    if (!aiShopUnlocked(u)) continue;
    const cost = Math.ceil(u.base * Math.pow(u.growth || 1.15, S.upgrades[u.id] || 0) * costMult());
    const margCps = u.cps * globalMult();
    if (margCps <= 0) continue;
    const payback = cost / margCps;
    if (payback < bestPayback) { bestPayback = payback; best = u; }
  }
  return best ? { u: best, cost: Math.ceil(best.base * Math.pow(best.growth || 1.15, S.upgrades[best.id] || 0) * costMult()), payback: bestPayback } : null;
}

function aiHireOne() {
  // 与 main.js hireCultist 同构的最小招募（[AI] 日志口径独立，避免循环依赖）
  S.ep -= staffCost();
  const names = ['外勤干员 A','斥候','深潜者','观测员','渗透单元','信使','无面者','印斯茅斯节点','沙丘行者','门之侍者'];
  S.cultists.push({
    id: Date.now() + Math.random(),
    name: names[Math.floor(Math.random() * names.length)],
    output: BALANCE.thread.baseOutput + Math.random() * BALANCE.thread.baseOutputJitter,
    mood: '正常',
    moodTimer: 30 + Math.random() * 60,
  });
}

// 返回本轮是否有动作（供脏标记）
export function tickAI(dt) {
  if (!aiUnlocked()) return false;
  // v2.6.3 反馈②：混沌心智——AI 全面禁用，混沌直觉接管（每 10s 随机购买最便宜的未拥有升级）
  if (S.tech && S.tech.chaos_mind) {
    // v2.6.3 反馈②：持有混沌心智 = AI 禁用 + 混沌直觉接管（直接生效，不再依赖额外开关）
    chaosIntuitionTick(dt);
    return true;
  }
  const ai = S.ai;
  if (!ai || (!ai.autoUpgrade && !ai.autoHire && !ai.autoClaim && !ai.autoBuild)) return false;
  ai.timer = (ai.timer || 0) + dt;
  // v2.6.0 深潜：拟态矩阵——决策间隔 -20%/级（下限 40% 原间隔）
  const matLv = (S.delve && S.delve.up && S.delve.up.matrix) || 0;
  const interval = Math.max(BALANCE.ai.interval * 0.4, BALANCE.ai.interval * (1 - 0.2 * matLv));
  if (ai.timer < interval) return false;
  ai.timer -= interval;

  let acted = false;
  const line = reserveLine();

  // a. 自动升级：回本最短项，EP ≥ 预留线才买
  if (ai.autoUpgrade) {
    const pick = bestPaybackItem();
    if (pick && S.ep - pick.cost >= line && S.ep >= pick.cost) {
      S.ep -= pick.cost;
      S.upgrades[pick.u.id] = (S.upgrades[pick.u.id] || 0) + 1;
      S.totalBuys++;
      ailog(`自动升级：购入 ${pick.u.name}（-${fmt(pick.cost)} EP，回本约 ${pick.payback >= 100 ? fmt(Math.round(pick.payback)) + 's' : pick.payback.toFixed(1) + 's'}）`, 'good');
      acted = true;
    }
  }

  // b. 自动招募：净产出为正且 EP ≥ 2×招募成本；net<0 自然停止
  if (ai.autoHire) {
    const cost = staffCost();
    if (staffNetPerSec() > 0 && S.ep >= cost * 2 && S.ep - cost >= line) {
      aiHireOne();
      ailog(`自动招募：+1 线程（-${fmt(cost)} EP）`, 'good');
      acted = true;
    }
  }

  // c. 自动领取：任务进入 pending 即领
  if (ai.autoClaim) {
    for (const p of S.projects) {
      if (p.status === 'pending') {
        claimProject(p);
        ailog(`自动领取：任务「${p.name}」奖励到账`, 'good');
        acted = true;
      }
    }
  }

  // v2.5.5 d. 自动购建：全部资源解锁激活后可用；严格限速——
  // 间隔硬下限 5s（autoBuildRate() 已 clamp）、每决策周期至多 1 栋、只 EP 升级已解锁建筑（不花 RP）、
  // 且受预留线约束（与手动购买共享预算，不把 EP 花到预留线以下）
  if (ai.autoBuild && ai.autoBuildUnlocked) {
    const rate = autoBuildRate();
    ai.autoBuildTimer = (ai.autoBuildTimer || 0) + dt;
    if (ai.autoBuildTimer >= rate) {
      ai.autoBuildTimer = 0;
      // 候选：已解锁（unlockedBuildings）未满级，按 EP 成本升序取最低；EP 扣后仍 ≥ 预留线才买
      const cands = V21_BUILDINGS
        .filter(b => b.via !== 'upgrade' && S.unlockedBuildings && S.unlockedBuildings[b.id] && !v21Maxed(b, S))
        .map(b => ({ b, cost: v21BuildingCost(b) }))
        .sort((a, b2) => a.cost - b2.cost);
      for (const { b, cost } of cands) {
        if (S.ep < cost || S.ep - cost < line) continue;
        S.ep -= cost;
        S.buildings[b.id] = v21Level(b.id, S) + 1;
        S.totalBuys = (S.totalBuys || 0) + 1;
        const cap = capOf(b, S);
        ailog(`自动购建：${b.name} 升至 Lv.${v21Level(b.id, S)}/${isFinite(cap) ? cap : '∞'}（-${fmt(cost)} EP）`, 'good');
        acted = true;
        break; // 每周期至多 1 栋（perTickMax）
      }
    }
  }
  return acted;
}

// v2.6.3 反馈②：混沌直觉——每 10s 从「最便宜的一批未拥有升级」中随机选一个购买（EP 够即买）
let chaosTimer = 0;
const CHAOS_INT = 10; // 秒
function chaosIntuitionTick(dt) {
  chaosTimer += dt;
  if (chaosTimer < CHAOS_INT) return;
  chaosTimer = 0;
  const cands = UPGRADES
    .filter(u => !(S.upgrades[u.id] || 0))
    .map(u => ({ u, cost: unitCost(u, 1) }))
    .filter(c => S.ep >= c.cost)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 3); // 最便宜一批随机
  if (!cands.length) return;
  const pick = cands[Math.floor(Math.random() * cands.length)];
  S.ep -= pick.cost;
  S.upgrades[pick.u.id] = 1;
  S.totalBuys = (S.totalBuys || 0) + 1;
  save(S);
  ailog(`混沌直觉：随机购入 ${pick.u.name}（-${fmt(pick.cost)} EP）`, 'bad');
}

// ========== 面板 ==========
export function renderAiPanel(container) {
  if (!container) return;
  if (!aiUnlocked()) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = '';
  const ai = S.ai;
  // v2.6.3 反馈②：混沌心智生效中 → 面板整体表达 AI 已禁用
  if (S.tech && S.tech.chaos_mind) {
    container.innerHTML = `
      <div style="font-size:13px;line-height:1.9;color:var(--text-2)">
        <b style="color:var(--red,#f85149)">混沌心智已接管</b>：AI 自动化全面禁用，混沌直觉每 10 秒随机购入最便宜的未拥有升级（深渊行者科技线）。<b style="color:var(--warn,#c8a24a)">永久生效，不可取消</b>——勾选混沌心智后 AI 无法恢复，请谨慎选择。</div>`;
    return;
  }
  const line = reserveLine();
  const sw = (key, name, desc) => `
    <div class="ai-switch ${ai[key] ? 'on' : ''}" data-ai-switch="${key}" title="${desc}">
      <span class="ai-switch-dot"></span>
      <span class="ai-switch-name">${name}</span>
      <span class="ai-switch-state">${ai[key] ? 'ON' : 'OFF'}</span>
    </div>`;
  const reserveOpts = BALANCE.ai.reserveOptions.map(r =>
    `<button class="btn ai-reserve-btn ${ai.reserve === r ? 'on' : ''}" data-ai-reserve="${r}">${Math.round(r * 100)}%</button>`).join('');
  // v2.5.5：自动购建区块（全部资源点解锁后可激活）
  const AB = BALANCE.ai.aiAutoBuild;
  let buildHtml;
  if (!autoBuildUnlocked()) {
    const resOk = allResDiscovered(S);
    const epOk = S.ep >= autoBuildActivateCost();
    buildHtml = `
      <div class="ai-build-box ${resOk && epOk ? '' : 'ai-build-locked'}">
        <div class="ai-build-title">自动购建（全部资源点解锁后可用）</div>
        <div style="font-size:12px;line-height:1.9;color:var(--text-2)">
          资源点：${ALL_RES_KEYS.filter(k => S.resDiscovered[k] === true).length}/${ALL_RES_KEYS.length} 已解锁
          ${resOk ? '' : '（未全部解锁，不可激活）'}
          <br>激活消耗：${fmt(autoBuildActivateCost())} EP（一次性）${epOk ? '' : '（EP 不足）'}
        </div>
        <button class="btn ${resOk && epOk ? '' : 'disabled'}" data-ai-build-activate="1" ${resOk && epOk ? '' : 'disabled'}
          title="全部资源点解锁且 EP 充足后，消耗 ${fmt(autoBuildActivateCost())} EP 激活自动购建">激活自动购建</button>
        <div style="font-size:11px;color:var(--text-2)">激活后 AI 将按设定速率自动购买建筑（EP 升级，不消耗 RP）；间隔下限 5 秒、每周期至多 1 栋，且不低于预留线，不会与手动操作抢资源。</div>
      </div>`;
  } else {
    const rateBtns = AB.rateOptions.map(r =>
      `<button class="btn ai-rate-btn ${(ai.autoBuildRate ?? AB.defaultRate) === r ? 'on' : ''}" data-ai-build-rate="${r}">${r}s</button>`).join('');
    buildHtml = `
      <div class="ai-build-box">
        <div class="ai-build-title">自动购建（已激活）</div>
        ${sw('autoBuild', '自动购建', `每 ${autoBuildRate()}s 购买 1 栋已解锁建筑（EP 成本最低优先）；硬性间隔下限 ${AB.minRate}s、每周期至多 ${AB.perTickMax} 栋，不低于预留线`)}
        <div class="ai-reserve-row" style="margin-top:4px">
          <span>购买间隔</span>${rateBtns}
        </div>
        <div style="font-size:11px;color:var(--text-2);margin-top:4px">当前间隔 ${autoBuildRate()}s（下限 ${AB.minRate}s，改档不生效）；下次购建倒计时 ${Math.max(0, autoBuildRate() - (ai.autoBuildTimer || 0)).toFixed(1)}s</div>
      </div>`;
  }
  container.innerHTML = `
    <div class="ai-desc">预留线：EP 上限的 ${Math.round((ai.reserve ?? BALANCE.ai.defaultReserve) * 100)}%（当前 ${fmt(line)} EP）——自动化不会把 EP 花到预留线以下</div>
    ${sw('autoUpgrade', '自动升级', '每 5s 购买回本时间最短的产出项（成本 ÷ 边际 CPS，含全局乘数）；EP 低于预留线时暂停')}
    ${sw('autoHire', '自动招募', '线程净产出为正且 EP ≥ 2×招募成本时自动招募；净产出为负自动停止')}
    ${sw('autoClaim', '自动领取', '任务完成进入待领取状态立即自动领取')}
    ${buildHtml}
    <div class="ai-reserve-row">
      <span>预留线</span>${reserveOpts}
      <button class="btn" data-ai-alloff="1" title="关闭全部自动化开关">一键全关</button>
    </div>`;

  if (!container.dataset.v13Delegated) {
    container.dataset.v13Delegated = '1';
    container.addEventListener('click', (e) => {
      const swEl = e.target.closest('[data-ai-switch]');
      if (swEl) {
        const key = swEl.dataset.aiSwitch;
        if (key in S.ai) { S.ai[key] = !S.ai[key]; save(S); renderAiPanel(container); }
        return;
      }
      const rEl = e.target.closest('[data-ai-reserve]');
      if (rEl) {
        S.ai.reserve = Number(rEl.dataset.aiReserve);
        save(S);
        renderAiPanel(container);
        return;
      }
      if (e.target.closest('[data-ai-alloff]')) {
        S.ai.autoUpgrade = false; S.ai.autoHire = false; S.ai.autoClaim = false; S.ai.autoBuild = false;
        ailog('一键全关：所有自动化已停止', 'bad');
        save(S);
        renderAiPanel(container);
      }
      // v2.5.5：激活自动购建——二次确认（首次点击变确认态，再点执行）
      const actEl = e.target.closest('[data-ai-build-activate]');
      if (actEl) {
        if (!autoBuildActivable()) { ailog('激活条件未满足：需全部资源点解锁且 EP 充足', 'bad'); return; }
        if (actEl.dataset.confirm === '1') {
          const r = activateAutoBuild();
          if (r.ok) { ailog(`自动购建已激活（-${fmt(r.cost)} EP）；设置购买间隔与开关即可开始`, 'good'); }
          else ailog(`激活失败：${r.reason}`, 'bad');
          renderAiPanel(container);
        } else {
          actEl.dataset.confirm = '1';
          actEl.textContent = `再次点击确认（消耗 ${fmt(autoBuildActivateCost())} EP）`;
          setTimeout(() => { if (actEl.isConnected && actEl.dataset.confirm === '1') { actEl.dataset.confirm = ''; actEl.textContent = '激活自动购建'; } }, 4000);
        }
        return;
      }
      const rateEl = e.target.closest('[data-ai-build-rate]');
      if (rateEl) {
        S.ai.autoBuildRate = Math.max(BALANCE.ai.aiAutoBuild.minRate, Number(rateEl.dataset.aiBuildRate));
        save(S);
        renderAiPanel(container);
      }
    });
  }
}
