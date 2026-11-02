// v2.7.3 ⑤：轮回系统——终极重置（比晋升更深一层的循环）
// 设计（参考 KG 多轮发展，克制增长）：
//   · 门槛：本局累计 EP ≥ 10 亿 且 本局晋升 ≥ 1 次（prestige ≥ 1）
//   · 产出：深渊回响 abyssEcho = min(100, floor(8 × √(本局成就评分)))
//         评分 = 晋升×2 + 深潜层×0.5 + 裂隙余烬×0.1 + 信仰×0.05（本局增长口径）
//   · 效果：每点回响全局 ×1.05（叠乘，跨轮回保留）；特殊升级池消耗回响购买（cap 3~5，50×1.6^n）
//   · 克制：回响来源有限（每轮回上限 100）、升级成本指数涨、cap 封顶——资源不会失控
import { S, save } from '../state.js';
import { recordPolicyRun } from '../data/policies.js';
import { fmt } from './economy.js';
import { resetBazaarRun } from './bazaar.js'; // v3.0.0：集市本局状态每轮重置
import { BALANCE } from '../data/balance.js';
import { toast, dirty, askConfirm } from '../core/runtime.js'; // v3.0.0 测试性解耦
import { spawnProject } from './projects.js';

export function echoScore() {
  const W = BALANCE.reincarn.scoreWeights;
  const score = (S.prestige || 0) * W.prestige
    + ((S.delve && S.delve.depth) || 0) * W.delve // v2.9.0：层深改读 S.delve.depth（原 S.delveDepth 键不存在，维度恒 0）
    + (S.riftEmber || 0) * W.ember
    + (S.faith || 0) * W.faith;
  return score;
}

export function echoGain() {
  const w = BALANCE.reincarn;
  return Math.min(w.echoCap, Math.floor(w.echoBase * Math.sqrt(echoScore())));
}

export function reincarnReady() {
  // v2.9.0 优化③：深渊吞噬锁定——倒计时/抉择/崩溃期间轮回不可脱离深渊（仅命运抉择可终结）
  if (S._collapseAt || S.collapsed || S._collapseChoicePending) {
    return { ok: false, reason: '深渊吞噬中：已被深渊锁定，轮回不可脱离——直面命运抉择' };
  }
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
  // v2.8.4：深渊遗存——每次轮回按本局最强维度自动携带 1 座（克制：每轮回至多 +1、同种 cap 3、跨轮回保留）
  S.relicLegacy = S.relicLegacy || {};
  const legacyDefs = BALANCE.reincarn.legacy || [];
  const colonyLv = (S.colonies || []).reduce((a, c) => a + (c.lv || 0), 0);
  const vals = { delve: (S.delve && S.delve.depth) || 0, colony: colonyLv, rift: S.riftsSealed || 0 }; // v2.9.0：层深键修正（同 echoScore）
  const cands = legacyDefs
    .filter(L => (S.relicLegacy[L.id] || 0) < BALANCE.reincarn.legacyCap && vals[L.needKey] >= L.need)
    .sort((a, b2) => vals[b2.needKey] / b2.need - vals[a.needKey] / a.need);
  if (cands.length > 0) {
    const pick = cands[0];
    S.relicLegacy[pick.id] = (S.relicLegacy[pick.id] || 0) + 1;
    // 日志并入 main 侧？——此处直接记录（无日志钩子，通过返回值带出）
    ready.legacy = pick;
  }
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
  // v2.9.0 优化③：轮回不再清除 collapsed/_collapseAt——转生不可脱离深渊（崩溃仅由「同归于尽」抉择结算）
  S.vehCollectTimer = 0;
  S.pets = {};
  S.activePets = [];
  S.buffMult = 1; S.buffUntil = 0;
  S.clickBuffMult = 1; S.clickBuffUntil = 0;
  S.petXpMult = 1; S.petXpUntil = 0;
  S.fuseLuckUntil = 0;
  S.staffUnhappy = 0;
  S._farewellBought = false; // v2.9.2 ②：sp3_farewell 每局可再次触发
  S.activeRift = null;
  S.riftExpedition = null;
  S.crossroad = 'inactive';
  S.crossroadLockedBy = null;
  // v2.8.6 B2a：政策每轮重选（清空本局政策与改选次数；虔诚/超验/隐密圣学保留跨周期）
  recordPolicyRun();
  S.policies = {};
  S.policyRerolls = {};
  S.vowPolicyBoost = false;
  resetBazaarRun(); // v3.0.0：集市库存/汇率/刷新次数归位（成交笔数与等级跨周期保留）
  S.cosmos = { lv: {} }; // v3.0.3 后续反馈④：宇宙探索本局制重置
  // v2.8.5 A2：跨周期解锁模块克制（参考 KG）——本局解锁进度不带到下周期，
  // 仅保留跨周期资产对应的锚点（ep/es/faith/rp）；cps/run/tide/rank/pt/dm 重置，重新发现
  S.resDiscovered = {
    ep: true, es: !!S.resDiscovered.es, faith: !!S.resDiscovered.faith, rp: !!S.resDiscovered.rp,
  };
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

// 渲染：晋升面板内轮回区块（v2.7.5 ①：增量——结构一次构建，数值/状态/卡列表轻量更新）
export function renderReincarn(container) {
  if (!container) return;
  // v2.8.2 反馈③：晋升完成前（本局 prestige < 1）不显示轮回模块——轮回是晋升之上的第二层循环，
  // 未晋升时不占界面；晋升达成后即时渲染
  if ((S.prestige || 0) < 1) {
    if (container._echoBuilt) {
      const blk = container.querySelector('#echo-block');
      if (blk) blk.remove();
      container._echoBuilt = false;
    }
    return;
  }
  if (!container._echoBuilt) {
    container._echoBuilt = true;
    container.insertAdjacentHTML('beforeend', `<div id="echo-block" style="margin-top:16px;border-top:1px dashed var(--border);padding-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:var(--accent);font-size:12px">轮回 · 第二层循环（晋升之上）</b>
        <span style="font-size:11px;color:var(--text-2)" id="echo-stat">深渊回响 <b style="color:var(--accent)">0</b> · 已轮回 0 次</span>
      </div>
      <div style="font-size:11px;color:var(--text-2);margin:6px 0;line-height:1.6" id="echo-desc">
        轮回 = 终局循环（晋升之上）：本轮成就结算为深渊回响（单次上限 100），回响全局 +5%/点（跨轮回保留），并可在回响商店购买特殊升级。
        与晋升的分工：<b style="color:var(--accent)">晋升</b>保留职级/RP/ES/回响/永恒——积累研究；<b style="color:var(--purple)">轮回</b>额外按本局最强维度携带 1 座「深渊遗存」建筑（跨轮回，参考 KG：跨周期资源由建筑承载而非直接继承）。
        轮回清空本局（EP/升级/建筑/异兽），保留职级/RP/ES/宗教/裂隙/深潜/回响/遗存/已完成故事线。回响与遗存均严格克制。
      </div>
      <div style="font-size:11px;color:var(--red,#f85149);margin-bottom:6px" id="echo-status">未就绪</div>
      <button class="btn reincarn-btn no" id="reincarn-btn" style="width:100%">轮回 · 结算回响（二次确认）</button>
      <div style="margin-top:10px;font-size:11px;color:var(--text-2)">深渊遗存（跨轮回携带建筑 · 每次轮回按本局最强维度 +1 座，同种上限 3）</div>
      <div id="echo-legacy-list" style="display:flex;flex-direction:column;gap:6px;margin:6px 0 12px"></div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-2)">回响商店（升级永久，跨轮回）</div>
      <div id="echo-upg-list"></div>
    </div>`);
    container.querySelector('#reincarn-btn')?.addEventListener('click', () => {
      // v2.7.5 ②：轮回二次确认弹窗（显示收益与重置范围，避免误触终局重置）
      const ready2 = reincarnReady();
      if (!ready2.ok) { if (toast) toast(ready2.reason); return; }
      askConfirm('轮回 · 终极重置', `结算深渊回响 +${ready2.echo}（全局 +5%/点，跨轮回保留）。\n将清空本局（EP/升级/建筑/异兽/任务），保留职级/RP/ES/宗教/裂隙/深潜/回响/已完成故事线。\n确认开始轮回？`, () => {
        const r = doReincarn();
        if (r.ok) {
          if (toast) toast(`轮回完成：深渊回响 +${r.gain}（累计 ${r.total}）`);
        } else if (toast) toast(r.reason);
        dirty.prestige = true; dirty.top = true; dirty.shop = true;
      });
    });
  }
  const ready = reincarnReady();
  const gain = echoGain();
  const st = container.querySelector('#echo-stat');
  if (st) st.innerHTML = `深渊回响 <b style="color:var(--accent)">${S.abyssEcho || 0}</b> · 已轮回 ${S.reincarned || 0} 次`;
  const ds = container.querySelector('#echo-desc');
  if (ds) ds.innerHTML = `结束当前发展：本轮成就结算为 <b style="color:var(--accent)">${gain}</b> 点深渊回响（单次上限 100），回响全局 +5%/点（跨轮回保留），并可在回响商店购买特殊升级。轮回清空本局（EP/升级/建筑/异兽），保留职级/RP/ES/宗教/裂隙/深潜/回响/已完成故事线。`;
  const sts = container.querySelector('#echo-status');
  if (sts) {
    sts.style.color = ready.ok ? 'var(--green,#3fb950)' : 'var(--red,#f85149)';
    sts.textContent = ready.ok ? `可轮回：结算 +${gain} 回响（${fmt(S.runEarned || 0)} ≥ ${fmt(BALANCE.reincarn.needEp)} · 晋升 ${S.prestige || 0} ≥ 1）` : ready.reason;
  }
  const btn = container.querySelector('#reincarn-btn');
  if (btn) btn.className = 'btn reincarn-btn' + (ready.ok ? '' : ' no');
  // v2.8.4：深渊遗存列表
  const lg = container.querySelector('#echo-legacy-list');
  if (lg) {
    const legacyHtml = (BALANCE.reincarn.legacy || []).map(L => {
      const lv = (S.relicLegacy && S.relicLegacy[L.id]) || 0;
      // v2.8.30 review：未购遗存显示获取条件（随进度解锁可见）
      const needHint = lv > 0 ? '' : (L.needKey === 'delve' ? ` · 需深潜 ≥ ${L.need} 层`
        : L.needKey === 'colony' ? ` · 需异兽 ≥ ${L.need} 只`
        : L.needKey === 'rift' ? ` · 需裂隙余烬 ≥ ${L.need}` : '');
      return `<div style="display:flex;justify-content:space-between;font-size:11px;color:${lv > 0 ? 'var(--green,#3fb950)' : 'var(--text-3)'}">
        <span>${L.name} ${lv > 0 ? '×' + lv : ''}<span style="opacity:.75"> · ${L.desc}</span><span style="opacity:.7;color:var(--text-2)">${needHint}</span></span>
        <span class="mono">${lv}/3</span></div>`;
    }).join('');
    if (lg._last !== legacyHtml) { lg._last = legacyHtml; lg.innerHTML = legacyHtml; }
  }
  // 回响商店卡列表局部重渲染（v2.8：内容不变跳过 innerHTML 重建——hover 期间节点替换仍会闪/重置 :hover 状态）
  const list = container.querySelector('#echo-upg-list');
  if (list) {
    let html = '';
    for (const u of (BALANCE.reincarn.upgs || [])) {
      const lv = (S.echoUpgrades && S.echoUpgrades[u.id]) || 0;
      const cost = echoUpgradeCost(u.id);
      const maxed = lv >= u.cap;
      const afford = (S.abyssEcho || 0) >= cost;
      html += `<div class="echo-upg ${maxed ? 'maxed' : ''}" data-echo-upg="${u.id}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border:1px solid ${maxed ? 'var(--border)' : afford ? 'rgba(63,185,80,.45)' : 'var(--border)'};border-radius:8px;background:rgba(255,255,255,.03);cursor:pointer;transition:border-color .15s,background .15s" onmouseover="this.style.background='rgba(255,255,255,.07)'" onmouseout="this.style.background='rgba(255,255,255,.03)'">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text-1)">${u.name} <span style="color:var(--text-3);font-size:10px">Lv.${lv}/${u.cap}</span></div>
          <div style="font-size:10px;color:var(--text-2);margin-top:2px">${u.desc}</div>
        </div>
        <div style="flex-shrink:0;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:${maxed ? 'rgba(139,148,158,.15)' : afford ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.12)'};color:${maxed ? 'var(--text-3)' : afford ? 'var(--green,#3fb950)' : 'var(--red,#f85149)'}">${maxed ? '已满级' : cost + ' 回响'}</div>
      </div>`;
    }
    if (list._lastHtml !== html) {
      list._lastHtml = html;
      list.innerHTML = html;
      list.querySelectorAll('[data-echo-upg]').forEach(el => {
        el.addEventListener('click', () => {
          const r = buyEchoUpgrade(el.dataset.echoUpg);
          if (r.ok) { if (toast) toast('回响升级成功'); dirty.prestige = true; }
          else if (toast) toast(r.reason);
        });
      });
    }
  }
}
