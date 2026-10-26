import { S } from '../state.js';
import { TALENTS } from '../data/talents.js';
import { prestigeGain, prestigeRpGain, esGain, prestigeNeed, fmt, elv, discoverEs } from './economy.js';
import { spawnProject } from './projects.js';

export function canPrestige() {
  // v2.8.4：崩溃后必须转生——被深渊吞噬时豁免门槛（本局已失败，转生是唯一脱离路径）
  if (S.collapsed) return true;
  return prestigeGain() >= 1;
}

export function doPrestige(talentId) {
  const gain = prestigeGain();
  const rpg = prestigeRpGain();
  const esg = esGain();
  S.prestigePoints += gain;
  S.prestige++;
  S.rp += rpg;
  if (esg > 0) { S.es += esg; discoverEs(); } // v2.8.4：首次晋升获得 ES → 点亮 ES 发现锚点
  // v2.8.4：崩溃转生结算湮灭残片（新资源，暂无消费用途，仅保留，克制——每次崩溃转生 +1）
  if (S.collapsed) S.abyssSplinter = (S.abyssSplinter || 0) + 1;
  S.runTalent = talentId;
  S.ep = 0;
  S.runEarned = 0;
  S.earnedFull = 0; // v2.5.1：全量产出统计随轮次清零（任务进度口径同生命周期）
  S.upgrades = {};
  if (talentId !== 'legacy') S.focusLevel = 0;
  S.projects = [];
  S.cultists = [];
  // v1.3：AI 管理核心跨晋升保留（设计 §9：晋升一轮后 AI/建筑状态保持；建筑在 S.buildings 本就不随晋升清空）
  const keepAiCore = !!S.tech.ai_core;
  S.tech = {};
  if (keepAiCore) S.tech.ai_core = true;
  // v1.3：薪资状态机随线程清空重置
  S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 };
  S.corruption = 0; // v2.6.0 review：转生新轮从干净状态开始（旧轮腐化惩罚不带入新轮）
  S.collapsed = false; S._collapseTimer = 0; // v2.8.3：深渊吞噬脱离（晋升重置本局）
  S.vehCollectTimer = 0;
  S.pets = {};
  S.activePets = [];
  S.buffMult = 1; S.buffUntil = 0;
  S.clickBuffMult = 1; S.clickBuffUntil = 0;
  S.petXpMult = 1; S.petXpUntil = 0;
  S.fuseLuckUntil = 0;
  S.staffUnhappy = 0;
  S.activeRift = null;
  let startEp = 0;
  if (talentId === 'rich') startEp = 500;
  if (talentId === 'rich2') startEp = 1500;
  startEp *= (1 + elv('start') * 0.5);
  S.ep = startEp;
  // v2.0：转生后只生成一个初始任务
  if (S.projects.length === 0) spawnProject();
  // v2.5.1 反馈⑤：命运的岔路口可多次选择——转生后重新开放（可换线或继续本线）；
  // 走过并完成一局的线记入 storylinesCompleted（多周目解锁展示）
  if (S.storyline && S.storyline !== 'default' && !(S.storylinesCompleted || []).includes(S.storyline)) {
    S.storylinesCompleted = S.storylinesCompleted || [];
    S.storylinesCompleted.push(S.storyline);
  }
  const ch = parseInt(String(S.chapter || '1'), 10);
  S.crossroad = ch >= 5 ? 'open' : 'inactive';
  S.crossroadLockedBy = null;
  // 晋升 10% 概率获得信仰
  if (Math.random() < 0.10) {
    S.faith = (S.faith || 0) + 1;
  }
  return { gain, rpg, esg };
}

export function getTalentChoices() {
  const pool = [...TALENTS];
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picks;
}

export function renderPrestige(container) {
  if (!container) return;
  // v2.7.5 ①：晋升面板增量渲染——结构一次构建，此后只更新数值 span/状态行/按钮，
  // 不再整面板 innerHTML 重建（原每 2s 重建使按钮在慢速点击窗口被替换 → click 丢失）
  if (!container._prgBuilt) {
    container._prgBuilt = true;
    container.innerHTML = `<div style="font-size:11px;color:var(--text-2);margin-bottom:8px;line-height:1.7">循环体系：<b style="color:var(--accent)">晋升转生</b>结算职级（第一层循环）→ 本局晋升 ≥1 且累计 EP ≥10 亿后可<b style="color:var(--purple)">轮回</b>（第二层循环），结算深渊回响（全局 +5%/点，跨轮回保留）。</div>
      <div class="off-stat"><span>本局累计</span><b id="prg-run">0</b></div>
      <div class="off-stat"><span>晋升需求</span><b id="prg-need">0</b></div>
      <div class="off-stat"><span>可获得职级点</span><b id="prg-gain">0/1 PP</b></div>
      <div class="off-stat"><span>可获得 RP</span><b id="prg-rpg">0/1</b></div>
      <div class="off-stat"><span>可获得 ES</span><b id="prg-esg">0/1</b></div>
      <div class="prestige-bar" id="prg-bar"><div id="prg-bar-fill" style="width:0%"></div></div>
      <div class="prestige-status no" id="prg-status">未达标</div>
      <button class="btn prestige-btn no" id="prestige-btn" title="">晋升转生</button>
      <div style="margin-top:6px;font-size:11px;color:var(--text-3)" id="prg-note"></div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-2)" id="talent-display"></div>`;
  }
  const need = prestigeNeed();
  const gain = prestigeGain();
  const rpg = prestigeRpGain();
  const esg = esGain();
  const ready = S.collapsed || gain >= 1; // v2.8.4：崩溃后必须转生（豁免门槛）
  const lack = Math.max(0, need - S.runEarned);
  const pct = Math.min(100, S.runEarned / need * 100);
  const reward = `${gain} PP · ${rpg} RP${esg >= 1 ? ' · ' + esg + ' ES' : ''}${S.collapsed ? ' · 湮灭残片 ×1' : ''}`;
  const run = container.querySelector('#prg-run');
  if (run) run.textContent = fmt(S.runEarned);
  const nd = container.querySelector('#prg-need');
  if (nd) nd.textContent = fmt(need);
  const g = container.querySelector('#prg-gain');
  if (g) g.textContent = gain < 1 ? '0/1 PP' : gain + ' PP';
  const rg = container.querySelector('#prg-rpg');
  if (rg) rg.textContent = rpg < 1 ? '0/1' : rpg;
  const eg = container.querySelector('#prg-esg');
  if (eg) eg.textContent = esg < 1 ? '0/1' : esg;
  const bar = container.querySelector('#prg-bar-fill');
  if (bar) bar.style.width = pct + '%';
  const st = container.querySelector('#prg-status');
  if (st) { st.className = 'prestige-status ' + (ready ? 'ok' : 'no'); st.textContent = S.collapsed ? '深渊吞噬：本局已失败，必须转生（+1 湮灭残片）' : (ready ? '已达标：可晋升转生' : `未达标：还差 ${fmt(lack)} EP（${pct.toFixed(0)}%）`); }
  const btn = container.querySelector('#prestige-btn');
  if (btn) {
    btn.className = 'btn prestige-btn' + (ready ? '' : ' no');
    btn.title = S.collapsed ? '深渊吞噬：必须转生（本局已崩溃，转生 +1 湮灭残片）' : (ready ? '转生：本局产出清零，保留跨转生资产' : `晋升需求未达标：还差 ${fmt(lack)} EP 本局累计（1 PP 起步）`);
  }
  const note = container.querySelector('#prg-note');
  if (note) note.textContent = S.collapsed ? `本局被深渊吞噬，系统已停止产出。转生将获得 ${reward}，跨转生资产保留。` : (ready ? `转生将获得 ${reward}，跨转生资产（职级/RP/ES/宗教/裂隙/深潜/回响/永恒）保留。` : `晋升条件：本局累计 ≥ ${fmt(need)} EP 换 1 PP；未达标时按钮暗置，点击会提示还差多少。`);
  const td = container.querySelector('#talent-display');
  if (td) td.textContent = S.runTalent ? `本局天赋：${TALENTS.find(t => t.id === S.runTalent)?.name || ''}` : '';
}

export function renderTalentModal(container) {
  if (!container) return;
  const choices = getTalentChoices();
  let html = `<h3>选择本局天赋</h3><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">`;
  for (const t of choices) {
    html += `<div class="talent-option" data-talent="${t.id}" style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;cursor:pointer">
      <div style="font-weight:600;color:var(--purple)">${t.name}</div>
      <div style="color:var(--text-2);font-size:12px;margin-top:2px">${t.desc}</div>
    </div>`;
  }
  html += `</div>`;
  container.innerHTML = html;
  return choices;
}
