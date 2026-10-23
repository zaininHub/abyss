import { S } from '../state.js';
import { TALENTS } from '../data/talents.js';
import { prestigeGain, prestigeRpGain, esGain, prestigeNeed, fmt, elv } from './economy.js';
import { spawnProject } from './projects.js';

export function canPrestige() {
  return prestigeGain() >= 1;
}

export function doPrestige(talentId) {
  const gain = prestigeGain();
  const rpg = prestigeRpGain();
  const esg = esGain();
  S.prestigePoints += gain;
  S.prestige++;
  S.rp += rpg;
  if (esg > 0) S.es += esg;
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
  const need = prestigeNeed();
  const gain = prestigeGain();
  const rpg = prestigeRpGain();
  const esg = esGain();
  const ready = gain >= 1;
  const lack = Math.max(0, need - S.runEarned);
  const pct = Math.min(100, S.runEarned / need * 100);
  const reward = `${gain} PP · ${rpg} RP${esg >= 1 ? ' · ' + esg + ' ES' : ''}`;
  container.innerHTML = `<div class="off-stat"><span>本局累计</span><b>${fmt(S.runEarned)}</b></div>
    <div class="off-stat"><span>晋升需求</span><b>${fmt(need)}</b></div>
    <div class="off-stat"><span>可获得职级点</span><b>${gain < 1 ? '0/1' : gain} PP</b></div>
    <div class="off-stat"><span>可获得 RP</span><b>${rpg < 1 ? '0/1' : rpg}</b></div>
    <div class="off-stat"><span>可获得 ES</span><b>${esg < 1 ? '0/1' : esg}</b></div>
    <div class="prestige-bar"><div style="width:${pct}%"></div></div>
    <div class="prestige-status ${ready ? 'ok' : 'no'}">${ready ? '已达标：可晋升转生' : '未达标：还差 ' + fmt(lack) + ' EP（' + pct.toFixed(0) + '%）'}</div>
    <button class="btn" id="prestige-btn" ${ready ? '' : 'disabled'} title="${ready ? '转生：本局产出清零，保留跨转生资产' : '晋升需求未达标：还差 ' + fmt(lack) + ' EP 本局累计（1 PP 起步）'}">晋升转生</button>
    <div style="margin-top:6px;font-size:11px;color:var(--text-3)">${ready ? '转生将获得 ' + reward + '，跨转生资产（职级/RP/ES/宗教/裂隙/深潜）保留。' : '晋升条件：本局累计 ≥ ' + fmt(need) + ' EP 换 1 PP；未达标时按钮暗置不可点。'}</div>
    <div style="margin-top:8px;font-size:11px;color:var(--text-2)" id="talent-display">
      ${S.runTalent ? `本局天赋：${TALENTS.find(t => t.id === S.runTalent)?.name || ''}` : ''}
    </div>`;
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
