import { S, defaultState } from '../state.js';
import { resetRunState } from '../core/stateSchema.js';
import { MS_PER_DAY } from '../core/time.js'; // v4.2.X：时间常数单一真源
import { recordPolicyRun } from '../data/policies.js';
import { TALENTS } from '../data/talents.js';
import { crossRunUpgradeSubset } from '../data/upgrades.js'; // v3.12.3 反馈⑤：DM 计价升级跨转生保留
import { BALANCE } from '../data/balance.js'; // v4.2.X：回响/遗物传承配置单一真源
import { renderEchoShop } from './echoShop.js'; // v4.2.X：回响商店并入晋升面板（轮回已移除）
import { prestigeGain, prestigeRpGain, esGain, prestigeNeed, fmt, elv, discoverEs, addRp, clampRunResourceBalances, gainRes } from './economy.js';
import { spawnProject } from './projects.js';
import { resetBazaarRun } from './bazaar.js'; // v3.0.0：集市本局状态（库存/汇率/刷新次数）每轮重置
import { crewPush } from './crew.js'; // v3.1.0 反馈③：班组流水

export function canPrestige() {
  // v2.9.0 优化③：深渊吞噬锁定——倒计时/抉择/崩溃期间晋升不可脱离深渊（仅命运抉择可终结；
  // 此前 collapsed 豁免门槛 + doPrestige 清除 collapsed = 转生一键逃离吞噬，与新机制冲突）
  if (S._collapseAt || S.collapsed || S._collapseChoicePending) return false;
  return prestigeGain() >= 1;
}

// v4.2.X：轮回已移除，原「深度轮回」的回响结算 + 遗物传承并入每次晋升。
//   评分口径沿用旧 echoScore（本局晋升/深潜/余烬/信仰的加权和），但单次增益按晋升频率下调
//   （BALANCE.reincarn.echoBase 8→2、cap 100→60），避免与 PP 软递减的克制目标冲突。
function prestigeEchoScore() {
  const W = BALANCE.reincarn.scoreWeights;
  return (S.prestige || 0) * W.prestige
    + ((S.delve && S.delve.depth) || 0) * W.delve
    + (S.riftEmber || 0) * W.ember
    + (S.faith || 0) * W.faith;
}
function prestigeEchoGain() {
  const w = BALANCE.reincarn;
  return Math.min(w.echoCap, Math.floor(w.echoBase * Math.sqrt(Math.max(0, prestigeEchoScore()))));
}
// 遗物传承：每次晋升按本局最强维度携带至多 1 座（同种 cap 3，跨晋升保留）。
function grantPrestigeLegacy() {
  const w = BALANCE.reincarn;
  S.relicLegacy = S.relicLegacy || {};
  const colonyLv = Object.values(S.colonies || {}).filter(Boolean).length;
  const vals = { delve: (S.delve && S.delve.depth) || 0, colony: colonyLv, rift: S.riftsSealed || 0 };
  const cands = (w.legacy || [])
    .filter(L => (S.relicLegacy[L.id] || 0) < w.legacyCap && vals[L.needKey] >= L.need)
    .sort((a, b) => vals[b.needKey] / b.need - vals[a.needKey] / a.need);
  if (!cands.length) return null;
  const pick = cands[0];
  S.relicLegacy[pick.id] = (S.relicLegacy[pick.id] || 0) + 1;
  return pick;
}

export function doPrestige(talentId) {
  const gain = prestigeGain();
  const rpg = prestigeRpGain();
  const esg = esGain();
  const echo = prestigeEchoGain(); // v4.2.X：回响在重置前按本局评分结算
  S.prestigePoints = Math.max(0, Math.round(Number(S.prestigePoints) || 0) + gain); // v4.0.5：职级点恒为整数（结算侧再兜一层）
  S.prestige++;
  if (esg > 0) { S.es += esg; gainRes('es', esg); discoverEs(); } // v2.8.4：首次晋升获得 ES → 点亮 ES 发现锚点
  // v2.9.0：湮灭残片改由「同归于尽」抉择结算发放（main.js），晋升不再发放/清除吞噬状态
  S.runTalent = talentId;
  // v3.10.0：本局重置字段清单与重置动作收敛到 core/stateSchema.js（晋升 / 轮回共用一条路径）。
  // 两条转生路径的差异只保留为 opts：晋升保留 AI 管理核心，legacy 天赋保留专注等级。
  // v3.12.0 反馈⑪：科技树不再保留 AI 管理核心（keepAiCore 选项仅保留给历史轮回路径兼容）
  recordPolicyRun(); // 必须在重置前记录本轮政策走向（读的是清空前的 S.policies）
  resetBazaarRun(); // 集市库存/汇率/刷新次数归位（成交笔数与等级跨周期保留）
  // v3.12.3 反馈⑤：DM 计价的升级（深渊科技 / 净化节点）跨转生保留——DM 本身不清零，升级也不该清零。
  const keepUpgrades = crossRunUpgradeSubset(S.upgrades);
  const legacy = grantPrestigeLegacy(); // v4.2.X：遗物传承用「重置前」的本局维度挑选，返回项供日志
  // v4.2.X：轮回移除——晋升不保留 AI 核心，opts 不含 keepAiCore（resetRunState 会清空 tech）。
  // v3.10.2 ④：重置后上限回落到新档值，隐式保留的 RP/PT/DM 余额同步钳制。
  resetRunState(S, defaultState(), { keepFocus: talentId === 'legacy', clamp: clampRunResourceBalances });
  S.upgrades = keepUpgrades;
  // v4.2.X：回响与遗物跨晋升保留（原轮回专属收益并入）——发放放在重置后，避免被清零。
  S.abyssEcho = (S.abyssEcho || 0) + echo;
  if (legacy) crewPush(`晋升传承：深渊遗存·${legacy.name}（跨晋升保留）`, 'good');
  // v3.12.0 反馈⑪：本次晋升的 RP 奖励在重置之后发放（否则会被清零），仍受新上限约束。
  addRp(rpg);
  // v3.12.12 反馈⑥：永恒摇篮——开局 RP 启动资金，提前启动研究点扩展玩法（受 RP 上限钳制）
  const smoothRp = elv('smooth') * 12;
  if (smoothRp > 0) addRp(smoothRp);
  // v3.12.0 反馈⑫：晋升推动故事线——驻留计时回拨，让「条件已满足」的下一章更快推进，
  // 但章节条件仍由 chapters.js 逐章判定，不会无条件跳章。
  // v4.1.0 F5：回拨 3→1 天。晋升节奏 3~5 天/轮，旧回拨恰好 ≥ 旧 minDays(3~4)，
  //   「晋升 = 立即跳下一章」让第 2 章之后的推进速度远超设计（用户反馈「第二章及之后速度过快」）。
  //   现在回拨只抵 1 天驻留：晋升仍能提前 ~1 天进下一章（保留推进体感），但每章 5~7 天
  //   的驻留门槛由真实游玩时间承担，「每次晋升只解锁体验、不压缩节奏」。
  S.chapterEnteredAt = Date.now() - 1 * MS_PER_DAY;
  crewPush('晋升：班组解散，下一局再聚', ''); // v3.1.0 反馈③：班组流水 // v4.0.2 反馈④：晋升转生→晋升
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
    gainRes('fp', 1);
  }
  return { gain, rpg, esg, echo, legacy };
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
    container.innerHTML = `<div style="font-size:11px;color:var(--text-2);margin-bottom:8px;line-height:1.7">清空本局，结算职级点 / RP / ES / 深渊回响，并按本局最强维度传承深渊遗存。所有收益跨晋升保留。</div>
      <div class="off-stat"><span>本局累计</span><b id="prg-run">0</b></div>
      <div class="off-stat"><span>晋升需求</span><b id="prg-need">0</b></div>
      <div class="off-stat"><span>可获得职级点</span><b id="prg-gain">0/1 PP</b></div>
      <div class="off-stat"><span>可获得 RP</span><b id="prg-rpg">0/1</b></div>
      <div class="off-stat"><span>可获得 ES</span><b id="prg-esg">0/1</b></div>
      <div class="off-stat"><span>可获得回响</span><b id="prg-echo">0/1</b></div>
      <div class="prestige-bar" id="prg-bar"><div id="prg-bar-fill" style="width:0%"></div></div>
      <div class="prestige-status no" id="prg-status">未达标</div>
      <button class="btn prestige-btn no" id="prestige-btn" title="">晋升</button>
      <div style="margin-top:6px;font-size:11px;color:var(--text-3)" id="prg-note"></div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-2)" id="talent-display"></div>
      <div id="echo-shop-slot"></div>`;
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
  if (st) { st.className = 'prestige-status ' + (ready ? 'ok' : 'no'); st.textContent = abyssLock ? '深渊吞噬：已被深渊锁定——转生不可脱离，直面命运抉择' : (ready ? '已达标：可晋升' : `未达标：还差 ${fmt(lack)} EP（${pct.toFixed(0)}%）`); }
  const btn = container.querySelector('#prestige-btn');
  if (btn) {
    btn.className = 'btn prestige-btn' + (ready ? '' : ' no');
    btn.title = abyssLock ? '深渊已锁定你——转生不可脱离深渊吞噬' : (ready ? '晋升：本局产出清零，保留跨转生资产' : `晋升需求未达标：还差 ${fmt(lack)} EP 本局累计（1 PP 起步）`);
  }
  const note = container.querySelector('#prg-note');
  // v4.3.5 反馈⑦：去「晋升条件：本局累计 ≥ X EP 换 1 PP。」——「晋升需求」行与进度条已表达同口径，
  //   重复文案（用户点名删除）；未达标态只保留差额提示。
  if (note) note.textContent = abyssLock ? '深渊吞噬倒计时/崩溃期间，晋升被深渊锁定。主动净化（消耗 EP）压至满额以下可自救；否则直面终结时的抉择。' : (ready ? `清空所有资源，下局开局获得 ${reward}` : `还差 ${fmt(lack)} EP 本局累计`)
  const td = container.querySelector('#talent-display');
  if (td) {
    // v3.12.3 反馈⑩：本局天赋同时展示名称与效果（原只有名字，玩家看不到自己这一局拿到了什么）
    const t = S.runTalent ? TALENTS.find(x => x.id === S.runTalent) : null;
    td.innerHTML = t
      ? `本局天赋：<b style="color:var(--purple)">${t.name}</b><span style="color:var(--text-2)"> —— ${t.desc}</span>`
      : '';
  }
  const echoGainEl = container.querySelector('#prg-echo');
  if (echoGainEl) echoGainEl.textContent = prestigeEchoGain();
  renderEchoShop(container.querySelector('#echo-shop-slot')); // v4.2.X：轮回移除，回响商店嵌此
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
