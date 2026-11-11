import { S, defaultState } from '../state.js';
import { resetRunState } from '../core/stateSchema.js';
import { recordPolicyRun } from '../data/policies.js';
import { TALENTS } from '../data/talents.js';
import { prestigeGain, prestigeRpGain, esGain, prestigeNeed, fmt, elv, discoverEs, addRp, clampRunResourceBalances } from './economy.js';
import { spawnProject } from './projects.js';
import { resetBazaarRun } from './bazaar.js'; // v3.0.0：集市本局状态（库存/汇率/刷新次数）每轮重置
import { crewPush } from './crew.js'; // v3.1.0 反馈③：班组流水

export function canPrestige() {
  // v2.9.0 优化③：深渊吞噬锁定——倒计时/抉择/崩溃期间晋升不可脱离深渊（仅命运抉择可终结；
  // 此前 collapsed 豁免门槛 + doPrestige 清除 collapsed = 转生一键逃离吞噬，与新机制冲突）
  if (S._collapseAt || S.collapsed || S._collapseChoicePending) return false;
  return prestigeGain() >= 1;
}

export function doPrestige(talentId) {
  const gain = prestigeGain();
  const rpg = prestigeRpGain();
  const esg = esGain();
  S.prestigePoints += gain;
  S.prestige++;
  if (esg > 0) { S.es += esg; discoverEs(); } // v2.8.4：首次晋升获得 ES → 点亮 ES 发现锚点
  // v2.9.0：湮灭残片改由「同归于尽」抉择结算发放（main.js），晋升不再发放/清除吞噬状态
  S.runTalent = talentId;
  // v3.10.0：本局重置字段清单与重置动作收敛到 core/stateSchema.js（晋升 / 轮回共用一条路径）。
  // 两条转生路径的差异只保留为 opts：晋升保留 AI 管理核心，legacy 天赋保留专注等级。
  // v3.12.0 反馈⑪：科技树不再保留 AI 管理核心（keepAiCore 选项仅保留给历史轮回路径兼容）
  recordPolicyRun(); // 必须在重置前记录本轮政策走向（读的是清空前的 S.policies）
  resetBazaarRun(); // 集市库存/汇率/刷新次数归位（成交笔数与等级跨周期保留）
  // v3.10.2 ④：重置后上限回落到新档值，隐式保留的 RP/PT/DM 余额同步钳制。
  resetRunState(S, defaultState(), { keepFocus: talentId === 'legacy', clamp: clampRunResourceBalances });
  // v3.12.0 反馈⑪：本次晋升的 RP 奖励在重置之后发放（否则会被清零），仍受新上限约束。
  addRp(rpg);
  // v3.12.0 反馈⑫：晋升推动故事线——驻留计时回拨，让「条件已满足」的下一章立即推进，
  // 但章节条件仍由 chapters.js 逐章判定，不会无条件跳章。
  S.chapterEnteredAt = Date.now() - 3 * 86400000;
  crewPush('晋升转生：班组解散，新轮回再聚', ''); // v3.1.0 反馈③：班组流水
  // v2.9.0：晋升不再清除 collapsed/_collapseAt——转生不可脱离深渊（吞噬仅由命运抉择结算）
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
  const abyssLock = !!(S._collapseAt || S.collapsed || S._collapseChoicePending); // v2.9.0：吞噬锁定（转生不可脱离）
  const ready = !abyssLock && gain >= 1;
  const lack = Math.max(0, need - S.runEarned);
  const pct = Math.min(100, S.runEarned / need * 100);
  const reward = `${gain} PP · ${rpg} RP${esg >= 1 ? ' · ' + esg + ' ES' : ''}`;
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
  if (st) { st.className = 'prestige-status ' + (ready ? 'ok' : 'no'); st.textContent = abyssLock ? '深渊吞噬：已被深渊锁定——转生不可脱离，直面命运抉择' : (ready ? '已达标：可晋升转生' : `未达标：还差 ${fmt(lack)} EP（${pct.toFixed(0)}%）`); }
  const btn = container.querySelector('#prestige-btn');
  if (btn) {
    btn.className = 'btn prestige-btn' + (ready ? '' : ' no');
    btn.title = abyssLock ? '深渊已锁定你——转生不可脱离深渊吞噬' : (ready ? '转生：本局产出清零，保留跨转生资产' : `晋升需求未达标：还差 ${fmt(lack)} EP 本局累计（1 PP 起步）`);
  }
  const note = container.querySelector('#prg-note');
  if (note) note.textContent = abyssLock ? '深渊吞噬倒计时/崩溃期间，晋升与轮回均被深渊锁定。主动净化（消耗 EP）压至满额以下可自救；否则直面终结时的抉择。' : (ready ? `转生将获得 ${reward}；职级点 / ES / 成就 / 宗教 / 深潜 / 回响 / 永恒保留，AI 助手 / 升级 / 科技 / 研究点 / RP / 裂隙余烬归零。` : `晋升条件：本局累计 ≥ ${fmt(need)} EP 换 1 PP。`)
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
