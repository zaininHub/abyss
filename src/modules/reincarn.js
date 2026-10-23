// v2.7.3 ⑤：轮回系统——终极重置（比晋升更深一层的循环）
// 设计（参考 KG 多轮发展，克制增长）：
//   · 门槛：本局累计 EP ≥ 10 亿 且 本局晋升 ≥ 1 次（prestige ≥ 1）
//   · 产出：深渊回响 abyssEcho = min(100, floor(8 × √(本局成就评分)))
//         评分 = 晋升×2 + 深潜层×0.5 + 裂隙余烬×0.1 + 信仰×0.05（本局增长口径）
//   · 效果：每点回响全局 ×1.05（叠乘，跨轮回保留）；特殊升级池消耗回响购买（cap 3~5，50×1.6^n）
//   · 克制：回响来源有限（每轮回上限 100）、升级成本指数涨、cap 封顶——资源不会失控
import { S, save } from '../state.js';
import { fmt } from './economy.js';
import { BALANCE } from '../data/balance.js';
import { toast, dirty } from '../main.js';
import { spawnProject } from './projects.js';

export function echoScore() {
  const W = BALANCE.reincarn.scoreWeights;
  const score = (S.prestige || 0) * W.prestige
    + (S.delveDepth || 0) * W.delve
    + (S.riftEmber || 0) * W.ember
    + (S.faith || 0) * W.faith;
  return score;
}

export function echoGain() {
  const w = BALANCE.reincarn;
  return Math.min(w.echoCap, Math.floor(w.echoBase * Math.sqrt(echoScore())));
}

export function reincarnReady() {
  if ((S.prestige || 0) < 1) return { ok: false, reason: '需先完成至少 1 次晋升（本局）' };
  if ((S.runEarned || 0) < BALANCE.reincarn.needEp) {
    return { ok: false, reason: `本局累计 EP 需 ≥ ${fmt(BALANCE.reincarn.needEp)}（当前 ${fmt(S.runEarned || 0)}）` };
  }
  return { ok: true, echo: echoGain() };
}

// 轮回：结算回响 → 深度重置（同晋升的重置范围），保留跨轮回资产（RP/ES/职级/宗教/裂隙/深潜/回响/已完成线）
export function doReincarn() {
  const ready = reincarnReady();
  if (!ready.ok) return ready;
  const gain = ready.echo;
  S.abyssEcho = (S.abyssEcho || 0) + gain;
  S.reincarned = (S.reincarned || 0) + 1;
  // 记录本局已走故事线（与晋升一致）
  if (S.storyline && S.storyline !== 'default' && !(S.storylinesCompleted || []).includes(S.storyline)) {
    S.storylinesCompleted = S.storylinesCompleted || [];
    S.storylinesCompleted.push(S.storyline);
  }
  // ---- 深度重置（本局内容清零，跨轮回资产保留） ----
  S.ep = 0;
  S.runEarned = 0;
  S.earnedFull = 0;
  S.upgrades = {};
  S.tech = {};
  S.focusLevel = 0;
  S.projects = [];
  S.cultists = [];
  S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 };
  S.corruption = 0;
  S.vehCollectTimer = 0;
  S.pets = {};
  S.activePets = [];
  S.buffMult = 1; S.buffUntil = 0;
  S.clickBuffMult = 1; S.clickBuffUntil = 0;
  S.petXpMult = 1; S.petXpUntil = 0;
  S.fuseLuckUntil = 0;
  S.staffUnhappy = 0;
  S.activeRift = null;
  S.riftExpedition = null;
  S.crossroad = 'inactive';
  S.crossroadLockedBy = null;
  // 保留：S.rp / S.es / S.prestige / S.prestigePoints / S.religion / S.faith /
  //       S.riftEmber / S.riftsSealed / S.delve* / S.resDiscovered / S.storylinesCompleted /
  //       S.abyssEcho / S.echoUpgrades / S.reincarned
  if (S.projects.length === 0) spawnProject();
  const ch = parseInt(String(S.chapter || '1'), 10);
  if (ch >= 5) S.crossroad = 'open';
  save(S);
  return { ok: true, gain, total: S.abyssEcho };
}

// 回响特殊升级
export function echoUpgradeCost(id) {
  const u = (BALANCE.reincarn.upgs || []).find(x => x.id === id);
  if (!u) return 0;
  const lv = (S.echoUpgrades && S.echoUpgrades[id]) || 0;
  return Math.ceil(BALANCE.reincarn.upgBase * Math.pow(BALANCE.reincarn.upgGrowth, lv));
}
export function buyEchoUpgrade(id) {
  const u = (BALANCE.reincarn.upgs || []).find(x => x.id === id);
  if (!u) return { ok: false, reason: '未知升级' };
  const lv = (S.echoUpgrades && S.echoUpgrades[id]) || 0;
  if (lv >= u.cap) return { ok: false, reason: '已达上限' };
  const cost = echoUpgradeCost(id);
  if ((S.abyssEcho || 0) < cost) return { ok: false, reason: `回响不足（需 ${cost}）` };
  S.abyssEcho -= cost;
  S.echoUpgrades = S.echoUpgrades || {};
  S.echoUpgrades[id] = lv + 1;
  save(S);
  return { ok: true };
}

// 渲染：晋升面板内轮回区块
export function renderReincarn(container) {
  if (!container) return;
  const ready = reincarnReady();
  const gain = echoGain();
  let html = `<div style="margin-top:16px;border-top:1px dashed var(--border);padding-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b style="color:var(--accent);font-size:12px">轮回（终极重置）</b>
      <span style="font-size:11px;color:var(--text-2)">深渊回响 <b style="color:var(--accent)">${S.abyssEcho || 0}</b> · 已轮回 ${S.reincarned || 0} 次</span>
    </div>
    <div style="font-size:11px;color:var(--text-2);margin:6px 0;line-height:1.6">
      结束当前发展：本轮成就结算为 <b style="color:var(--accent)">${gain}</b> 点深渊回响（单次上限 100），
      回响全局 +5%/点（跨轮回保留），并可在回响商店购买特殊升级。轮回清空本局（EP/升级/建筑/异兽），
      保留职级/RP/ES/宗教/裂隙/深潜/回响/已完成故事线。回响获取与升级成本均严格克制，不会失控增长。
    </div>
    <div style="font-size:11px;color:${ready.ok ? 'var(--green,#3fb950)' : 'var(--red,#f85149)'};margin-bottom:6px">
      ${ready.ok ? `可轮回：结算 +${gain} 回响（${fmt(S.runEarned || 0)} ≥ ${fmt(BALANCE.reincarn.needEp)} · 晋升 ${S.prestige || 0} ≥ 1）` : ready.reason}
    </div>
    <button class="btn reincarn-btn${ready.ok ? '' : ' no'}" id="reincarn-btn" style="width:100%">轮回 · 结算回响</button>
    <div style="margin-top:10px;font-size:11px;color:var(--text-2)">回响商店（升级永久，跨轮回）</div>`;
  for (const u of (BALANCE.reincarn.upgs || [])) {
    const lv = (S.echoUpgrades && S.echoUpgrades[u.id]) || 0;
    const cost = echoUpgradeCost(u.id);
    const maxed = lv >= u.cap;
    const afford = (S.abyssEcho || 0) >= cost;
    html += `<div class="echo-upg ${maxed ? 'maxed' : ''}" data-echo-upg="${u.id}" style="cursor:pointer">
      <div class="echo-upg-name">${u.name} <span class="echo-upg-lv">Lv.${lv}/${u.cap}</span></div>
      <div class="echo-upg-desc">${u.desc}</div>
      <div class="echo-upg-cost" style="color:${maxed ? 'var(--text-3)' : afford ? 'var(--green,#3fb950)' : 'var(--red,#f85149)'}">${maxed ? '已满级' : cost + ' 回响'}</div>
    </div>`;
  }
  html += `</div>`;
  container.insertAdjacentHTML('beforeend', html);
  container.querySelector('#reincarn-btn')?.addEventListener('click', () => {
    const r = doReincarn();
    if (r.ok) {
      if (toast) toast(`轮回完成：深渊回响 +${r.gain}（累计 ${r.total}）`);
    } else if (toast) toast(r.reason);
    dirty.prestige = true; dirty.top = true; dirty.shop = true;
  });
  container.querySelectorAll('[data-echo-upg]').forEach(el => {
    el.addEventListener('click', () => {
      const r = buyEchoUpgrade(el.dataset.echoUpg);
      if (r.ok) { if (toast) toast('回响升级成功'); dirty.prestige = true; }
      else if (toast) toast(r.reason);
    });
  });
}
