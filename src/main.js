import { S, save, reset, SAVE_KEY, SAVE_VERSION } from './state.js'; // v2.5 ⑤：SAVE_KEY/SAVE_VERSION 供存档导出/导入
import { fxBest } from './core/effectEngine.js'; // v2.1 建筑驱动：点击暴击掷骰参数
import {
  computeCps, staffSalaryPerSec, staffOutputPerSec, staffNetPerSec,
  fmt, fmtTime, epStorageCap, clickMult, globalMult,
  prestigeNeed,
  staffCost, focusCost, costMult, hasTech, petCount, elv, totalOwned, techCount,
  offlineRate, offlineCap, addEp,
  tidePhaseInfo, tideMult, corruptionPenalty, purifierCleanRate, tickCorruption,
  wageDebtMult, wageKeepCostMult, wageLoseChance, // v1.3 C：四态徽章展示用
  isLazy, lazyProdMult, lazyCostMult, // v2.7.1：线程懒惰态（EP 满上限惩罚）
} from './modules/economy.js';
// v2.0：特殊任务 + 彩蛋系统（从 events.js 提取，打破 main.js ↔ events.js 循环依赖）
import { checkEasterEggs, checkSpecialTasks } from './modules/progression.js';
// v2.5.4 ①：快照存档（最多 3 槽 / 覆盖当前本地游戏 / 二级确认）
import { saveSnapshot, coverOldest, listSnapshots, snapshotData, deleteSnapshot, SNAP_MAX, fmtStamp } from './modules/snapshots.js';
// v2.0：故事线管理器
import { getCurrentStoryline, loadStoryline, lockStorylineSwitch, getStorylinePackage } from './core/storylineManager.js';
import { tickProjects, claimProject, spawnProject, maxProjects, normalizeProjectGoals, setProjectLogFn } from './modules/projects.js';
import { tickReligion, renderReligionPanel, bindReligionPanel, canUnlockReligion, setReligionLogFn, setReligionToastFn } from './modules/religions.js';
import { tickDelve, renderDelvePanel, bindDelvePanel, canUnlockDelve, delveUnlocked, setDelveLogFn, setDelveToastFn } from './modules/delve.js';
import { religionUnlocked } from './data/religions.js';
import { renderShop, renderThreadShop, renderVehicles, renderDmShop, renderBuildings, renderV21Buildings, renderCrossroadBuildings, renderFamilyUpgrades, renderOfflineUpgrades, refreshShopAffordability, refreshShopItem, refreshV21Item, refreshShopChain, setToastFn } from './modules/shop.js'; // v2.3.1 ⑥：setBulk/getBulk 移除
import { EXPAND_KEY, anchorShown, anchorDone } from './modules/disclosure.js'; // v2.3.1 缺陷④清档回收 + ①锚点判定（rev18 9.1/9.2）
import { renderTech, refreshTechState, renderEternal } from './modules/tech.js';
import { tickWages, setWageLogFn, setWageToastFn } from './modules/wages.js'; // v1.3 C
import { tickVehicleCollect, setVehicleLogFn } from './modules/vehicles.js'; // v1.3 D
import { tickAI, renderAiPanel, setAiLogFn, setAiUiRefreshFn, aiUnlocked, aiHireFlag } from './modules/ai.js'; // v1.3 A
import { renderRelics, buyRelic, setRelicsLogFn, setRelicsToastFn } from './modules/relics.js'; // v2.7.0：深渊遗物
import { relicsUnlocked } from './data/relics.js'; // v2.7.0：遗物入口门控
import { renderPetGrid, renderPetFloat, gainPetExp, activePetIds } from './modules/pets.js';
import { renderPrestige, renderTalentModal, doPrestige, canPrestige } from './modules/prestige.js';
import { renderReincarn } from './modules/reincarn.js'; // v2.7.3 ⑤：轮回（晋升面板底部）
import { isStageUnlocked } from './core/progressive.js';
import { checkGate, getAllGates } from './core/gates.js';
import { maybeTriggerEvent } from './modules/events.js';
import { applyOffline, renderOfflinePanel } from './modules/offline.js';
import { renderStoryBar, currentChapter } from './modules/story.js';
import { tickRift, renderRift, renderRiftPanel, buyRiftUpgrade } from './modules/rift.js';
import { tickExpeditions, renderExpeditions } from './modules/expedition.js';
import { UPGRADES } from './data/upgrades.js';
import { PETS } from './data/pets.js';
import { MOOD_MULT } from './data/threads.js';
import { BALANCE } from './data/balance.js';
import './style.css';

const app = document.getElementById('app');

// ========== 日志系统 ==========
const logs = [];
export function log(msg, cls) {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, '0'), mm = String(t.getMinutes()).padStart(2, '0');
  const clsHtml = cls === 'good' ? ' class="ev-good"' : cls === 'bad' ? ' class="ev-bad"' : '';
  logs.unshift(`<div><span class="t mono">${hh}:${mm}</span><span${clsHtml}>${msg}</span></div>`);
  if (logs.length > 40) logs.pop();
  const el = document.getElementById('log-content');
  if (el) el.innerHTML = logs.join('');
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ========== 脏检查渲染 ==========
export const dirty = {
  top: true, hero: true, shop: true, tech: true,
  pets: true, prestige: true, projects: true,
  offline: true, story: true, log: false,
  rift: true, expedition: true,
  tide: true, corruption: true, // v2.0 新增：潮汐卡片 / 腐化条
  ai: true, // v1.3 A：AI 助手面板
  relics: false, // v2.7.0：深渊遗物
};

// ========== v2.0 故事线面板（v2.2 只读状态卡：走向由定向建筑购买决定，面板不再提供任何选择按钮） ==========
function renderStorylinePanel() {
  const el = document.getElementById('storyline-panel');
  if (!el) return;
  const current = getCurrentStoryline();
  const completed = S.storylinesCompleted || [];
  const crossById = (BALANCE.crossroadBuildings || []).find(b => b.id === S.crossroadLockedBy);
  let html = `<h3>故事线</h3>`;
  // v2.3 顺延小修：线名中文映射（getCurrentStoryline 返回 id，直接展示对玩家不可读）
  const lineName = getStorylinePackage(current)?.name || current;
  html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">当前路线：<b style="color:var(--purple)">${lineName}</b></div>`;
  if (crossById) {
    html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">立誓建筑：<b>${crossById.name}</b>（本轮锁定该命运线，转生后岔路口重新开放）</div>`;
  } else if (S.crossroad === 'open') {
    html += `<div style="color:var(--warn);font-size:11.5px;margin-bottom:8px">命运的岔路口已开放——前往建筑区立誓，或保持中立（不买不锁，可一路走到终章）</div>`;
  } else if (S.crossroad === 'inactive') {
    html += `<div style="color:var(--text-3);font-size:11.5px;margin-bottom:8px">推进主线至第五章后，命运的岔路口将开放</div>`;
  }
  // 已完成的故事线（多周目解锁）
  if (completed.length > 0) {
    html += `<div style="margin-top:12px;color:var(--text-2);font-size:11px">已完成：${completed.join('、')}</div>`;
  }
  // v2.7.3 ⑥：故事线图鉴——仅显示已解锁路线（当前路线 + 已完成路线）
  const ALL_LINES = ['line_abyss', 'line_order', 'line_faith'];
  const unlockedLines = ALL_LINES.filter(id => id === current || completed.includes(id));
  if (unlockedLines.length > 0) {
    html += `<div style="margin-top:14px"><div style="color:var(--accent);font-size:11px;margin-bottom:6px">故事线图鉴（仅显示已解锁路线，章节解锁即亮起）</div>`;
    for (const id of unlockedLines) {
      const pkg = getStorylinePackage(id);
      if (!pkg) continue;
      html += `<div class="codex-line"><div class="codex-line-name">${pkg.name}</div>`;
      if (pkg.desc) html += `<div class="codex-desc">${pkg.desc}</div>`;
      const chs = (pkg.chapters && pkg.chapters.append) || [];
      if (chs.length > 0) {
        html += `<div class="codex-chs">`;
        for (const ch of chs) {
          let ok = false;
          try { ok = !!ch.cond(S); } catch (e) { /* cond 内部异常按未解锁处理 */ }
          html += `<div class="codex-ch${ok ? ' on' : ' locked'}"><span class="codex-ch-name">${ok ? '✓' : '🔒'} ${ch.name}</span>`;
          if (ok && ch.desc) html += `<div class="codex-ch-desc">${ch.desc}</div>`;
          html += `</div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}

// ========== v2.2 岔路口状态机（替代 v2.0 弹窗触发：资产持有即走向，open 不买是合法中立路径） ==========
let lastCrossroadState = null;
function updateCrossroad() {
  if (S.crossroad === 'inactive' && parseInt(String(S.chapter || '1'), 10) >= 5) {
    S.crossroad = 'open'; // inactive → open 单向转移；open → locked 由 buyCrossroadBuilding 购买钩子承担
  }
  if (lastCrossroadState !== S.crossroad) {
    lastCrossroadState = S.crossroad;
    dirty.shop = true; // 分区可见性结构性切换（inactive 隐藏 / open 可购 / locked 封印灰显）
  }
}

function render() {
  if (dirty.top) { renderTop(); dirty.top = false; }
  if (dirty.hero) { renderHero(); dirty.hero = false; }
  if (dirty.ai) { // v1.3 A：AI 面板（未解锁时整卡隐藏）
    const aiEl = document.getElementById('ai-panel');
    const aiCard = document.getElementById('ai-card');
    if (aiEl) renderAiPanel(aiEl);
    if (aiCard) aiCard.style.display = aiUnlocked() ? '' : 'none';
    dirty.ai = false;
  }
  if (dirty.tide) { renderTide(); dirty.tide = false; }
  if (dirty.corruption) { renderCorruption(); dirty.corruption = false; }
  if (dirty.shop) {
    const shopEl = document.getElementById('shop-list');
    if (shopEl) renderShop(shopEl);
    const threadEl = document.getElementById('thread-shop');
    if (threadEl) renderThreadShop(threadEl);
    const vehEl = document.getElementById('vehicle-shop');
    if (vehEl) renderVehicles(vehEl);
    const dmEl = document.getElementById('dm-shop');
    if (dmEl) renderDmShop(dmEl);
    const bldEl = document.getElementById('building-list'); // v1.3 B：设施分区
    if (bldEl) renderBuildings(bldEl);
    const v21El = document.getElementById('v21-building-list'); // v2.1：效能建筑分区
    if (v21El) renderV21Buildings(v21El);
    const crEl = document.getElementById('crossroad-list'); // v2.2：命运的岔路口分区
    if (crEl) renderCrossroadBuildings(crEl);
    const famEl = document.getElementById('family-upgrade-list'); // v2.2：族升级分区
    if (famEl) renderFamilyUpgrades(famEl);
    dirty.shop = false;
  }
  if (dirty.tech) {
    const techEl = document.getElementById('tech-tree');
    if (techEl) renderTech(techEl);
    const eternalEl = document.getElementById('eternal-list');
    if (eternalEl) renderEternal(eternalEl);
    dirty.tech = false;
  }
  if (dirty.pets) {
    const petEl = document.getElementById('pet-grid');
    if (petEl) renderPetGrid(petEl);
    const floatEl = document.getElementById('pet-float');
    if (floatEl) renderPetFloat(floatEl);
    dirty.pets = false;
  }
  // v2.5.3 反馈③：深渊鱼缸触手——工作台底部缓慢摆动（≥1 级显示；3 级展示全部三只触手）
  const tentacleEl = document.getElementById('tentacle-deco');
  if (tentacleEl) {
    const fb = Math.min((S.buildings && S.buildings.abyss_fishbowl) || 0, 3);
    tentacleEl.style.display = fb >= 1 ? '' : 'none';
    tentacleEl.classList.toggle('tentacle-3', fb >= 3);
  }
  if (dirty.prestige) {
    const preEl = document.getElementById('prestige-panel');
    if (preEl) {
      renderPrestige(preEl);
      renderReincarn(preEl); // v2.7.3 ⑤：轮回区块（晋升面板底部）
    }
    dirty.prestige = false;
    if (dirty.relics) { renderRelics(document.getElementById('relics-panel')); dirty.relics = false; } // v2.7.0：深渊遗物
  }
  if (dirty.projects) {
    renderProjects();
    dirty.projects = false;
  }
  if (dirty.story) {
    const storyEl = document.getElementById('chapter-bar');
    if (storyEl) renderStoryBar(storyEl);
    dirty.story = false;
  }
  if (dirty.religion) { // v2.5.7：宗教面板
    const relEl = document.getElementById('religion-panel');
    if (relEl) renderReligionPanel(relEl);
    dirty.religion = false;
  }
  if (dirty.delve) { // v2.6.0：深潜终局面板
    const dvEl = document.getElementById('delve-panel');
    if (dvEl) renderDelvePanel(dvEl);
    dirty.delve = false;
  }
  if (dirty.rift) {
    const riftEl = document.getElementById('rift-panel');
    if (riftEl) renderRift(riftEl);
    dirty.rift = false;
  }
  if (dirty.riftTab) { // v2.6.1：裂隙栏目（余烬升级树 + 历史）
    const rtEl = document.getElementById('rift-tab-panel');
    if (rtEl) renderRiftPanel(rtEl);
    dirty.riftTab = false;
  }
  if (dirty.expedition) {
    const expEl = document.getElementById('expedition-panel');
    if (expEl) renderExpeditions(expEl);
    dirty.expedition = false;
  }
}

// ========== v2.3.1 资源锚点发现（rev18 9.1：顶栏显示与升级解锁统一锚点制） ==========
// resDiscovered 写入条件由「首次持有」改为「锚点完成」；锚点前「盲获得」照常入账不显示，
// 锚点完成后连历史累计一并显示（A2 核心）。锚点完成恰一次 toast，归零不回隐藏。
// rank（职级）与 es 同锚点——完成首次晋升（S.prestige ≥ 1）。
const DISCOVER_TOASTS = [
  ['rp',    () => anchorDone('rp', S),    '新资源：研究点 RP——科技树货币'],
  ['es',    () => anchorDone('es', S),    '新资源：永恒碎片 ES'],
  ['rank',  () => anchorDone('es', S),    '晋升系统开启'],
  ['faith', () => anchorDone('faith', S), '新资源：信仰'],
  ['pt',    () => anchorDone('pt', S),    '新资源：宠物饼干'],
  ['dm',    () => anchorDone('dm', S),    '新资源：深渊物质 DM'],
];
function discoverCheck() {
  const D = S.resDiscovered || (S.resDiscovered = { ep: true, cps: true, run: true, tide: true });
  let changed = false;
  for (const [key, cond, msg] of DISCOVER_TOASTS) {
    if (!D[key] && cond()) { D[key] = true; changed = true; toast(msg); }
  }
  if (changed) { dirty.top = true; save(S); }
}

// ========== 顶部栏 ==========
function renderTop() {
  updateTabLocks(); // v2.0：渐进开放标签页锁定状态
  // v2.3.1 ①（rev18 9.1）：顶栏资源显示 = 锚点完成（anchorShown 双读：即时谓词 ∨ 持久标记）。
  // 锚点完成当帧即亮出（不等 discoverCheck 落档），且连历史盲获得累计一并显示。
  const discStatIds = ['h-rank', 'h-rp', 'h-es', 'h-faith', 'h-pt', 'h-dm'];
  const discAnchorKeys = ['es', 'rp', 'es', 'faith', 'pt', 'dm']; // rank 与 es 同锚点（首次晋升）
  for (let i = 0; i < discStatIds.length; i++) {
    const el = document.getElementById(discStatIds[i]);
    if (!el || !el.parentElement) continue;
    // v2.7.0：PT（异兽饼干）顶栏显示同即时门控（本局购入宠物乐园才亮出；转生后隐藏直至重购）
    const shown = discAnchorKeys[i] === 'pt' ? anchorDone('pt', S) : anchorShown(discAnchorKeys[i], S);
    el.parentElement.style.display = shown ? '' : 'none';
  }
  const cps = computeCps();
  const now = Date.now();
  let buffTag = '';
  if (now < S.buffUntil) {
    const left = Math.ceil((S.buffUntil - now) / 1000);
    const mins = Math.floor(left / 60), secs = left % 60;
    const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
    if (S.buffMult > 1) buffTag = `<span class="buff-tag buff-on">全局+${Math.round((S.buffMult - 1) * 100)}%（${timeStr}）</span>`;
    else if (S.buffMult < 1) buffTag = `<span class="buff-tag buff-off">产出-${Math.round((1 - S.buffMult) * 100)}%（${timeStr}）</span>`;
  }
  // v2.1 溢出池：探采页头累计统计（溢出 EP 总量 + 5% 转 RP）
  const ovEl = document.getElementById('v21-overflow-stat');
  if (ovEl) {
    ovEl.textContent = (S.epOverflowTotal || 0) > 0
      ? `· 溢出累计 ${fmt(S.epOverflowTotal)} EP（按 20,000:1 转 RP）` : ''; // v2.5.3：文案同步 v2.5.2 新转换公式
  }
  const hEp = document.getElementById('h-ep');
  const hCps = document.getElementById('h-cps');
  const hSalary = document.getElementById('h-salary'); // v2.4.1：顶栏 EP 消耗（线程薪资，负面红）
  const hRun = document.getElementById('h-run');
  const hRank = document.getElementById('h-rank');
  const hRp = document.getElementById('h-rp');
  const hEs = document.getElementById('h-es');
  const hFaith = document.getElementById('h-faith');
  const hPt = document.getElementById('h-pt');
  const hDm = document.getElementById('h-dm');
  const hBuff = document.getElementById('h-buff');
  if (hEp) hEp.textContent = `${fmt(S.ep)} / ${fmt(epStorageCap())}`; // v2.1 P1：EP 常显「当前/上限」
  if (hCps) hCps.textContent = fmt(cps) + '/s';
  if (hSalary) hSalary.textContent = fmt(staffSalaryPerSec()) + '/s'; // v2.4.1：薪资消耗（负面红，已含入 cps 净额）
  if (hRun) hRun.textContent = fmt(S.runEarned);
  if (hRank) hRank.textContent = S.prestigePoints;
  if (hRp) hRp.textContent = fmt(S.rp);
  if (hEs) hEs.textContent = fmt(S.es);
  if (hFaith) hFaith.textContent = (S.faith || 0).toFixed(2); // v2.6.4 ③：信仰精确 2 位小数
  if (hPt) hPt.textContent = Math.floor(S.pt || 0);
  if (hDm) hDm.textContent = (S.dm || 0).toFixed(2); // v2.4.2：DM 累计精确到小数
  if (hBuff) hBuff.innerHTML = buffTag;
  // v2.1 P1：科技树页头常显 RP / ES
  const tRp = document.getElementById('tech-rp');
  if (tRp) tRp.textContent = fmt(S.rp);
  const tEs = document.getElementById('tech-es');
  if (tEs) tEs.textContent = fmt(S.es);
  // v2.5 ⑦：主面板离线展示（离线效率/上限/预期）整块移除——离线玩法保留在「离线」tab
  refreshTabVisibility();
}

// ========== v2.0 潮汐卡片 ==========
function renderTide() {
  const el = document.getElementById('h-tide');
  if (!el) return;
  const info = tidePhaseInfo(S.tidePhase);
  const epMult = tideMult('ep');
  const salMult = tideMult('salary');
  const techMult = tideMult('techCost');
  // v2.1.2 修复：效果标签统一带属性名——产出效果原为裸百分比（如退潮"-30%"）不可读
  const pct = (m) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
  const epTag = epMult !== 1 ? `<span class="${epMult > 1 ? 'tide-buff' : 'tide-debuff'}">产出${pct(epMult)}</span>` : '';
  const salTag = salMult !== 1 ? `<span class="${salMult > 1 ? 'tide-buff' : 'tide-debuff'}">薪资${pct(salMult)}</span>` : '';
  const techTag = techMult !== 1 ? `<span class="${techMult < 1 ? 'tide-buff' : 'tide-debuff'}">科技成本${pct(techMult)}</span>` : '';
  // v2.1.2：hover 提示——当前相位与全部生效效果
  // v1.3 L1：techCostMult 已接入 buyTech 扣费，hover 补充科技成本效果
  const effects = [];
  if (epMult !== 1) effects.push(`产出${pct(epMult)}`);
  if (salMult !== 1) effects.push(`薪资${pct(salMult)}`);
  if (techMult !== 1) effects.push(`科技成本${pct(techMult)}（科技树按当前相位价格结算）`);
  if (info.eventBadWeight !== 1) effects.push(`负面事件概率×${info.eventBadWeight}`);
  if (info.eventGoodDur !== 1) effects.push(`正面事件持续时长×${info.eventGoodDur}`);
  el.title = `潮汐·${info.name}：${effects.length ? effects.join('，') : '无修正'}（每相位 150 秒轮转）`;
  el.innerHTML = `<span class="tide-icon ${info.cssClass}">${info.icon}</span><span>${info.name}</span><span class="tide-time mono">${fmtTime(S.tideTimer)}</span>${epTag}${salTag}${techTag}`;
  document.body.classList.remove('tide-flood', 'tide-calm', 'tide-ebb', 'tide-chaos');
  document.body.classList.add(info.cssClass);
}

// ========== v2.0 腐化条 ==========
function renderCorruption() {
  const el = document.getElementById('corruption-bar');
  if (!el) return;
  const c = Math.max(0, Math.min(100, S.corruption || 0));
  if (c <= 0.01) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const txt = c.toFixed(1);
  const fill = document.getElementById('corruption-fill');
  const num = document.getElementById('corruption-num');
  const pen = document.getElementById('corruption-pen');
  if (fill) fill.style.width = txt + '%';
  if (num) num.textContent = txt + '%';
  if (pen) pen.textContent = `-${Math.round((1 - corruptionPenalty()) * 100)}%`;
}

function renderHero() {
  const bigEp = document.getElementById('big-ep');
  const clickPower = document.getElementById('click-power');
  const staffCount = document.getElementById('staff-count');
  const staffStatus = document.getElementById('staff-status');
  const staffCostEl = document.getElementById('staff-cost');
  const hireBtn = document.getElementById('hire-btn');
  const focusLv = document.getElementById('focus-lv');
  const focusCostEl = document.getElementById('focus-cost');
  if (bigEp) bigEp.textContent = fmt(S.ep);
  if (clickPower) clickPower.textContent = fmt(clickMult());
  if (staffCount) staffCount.textContent = S.cultists.length;
  // v2.6.4 ⑧：每秒薪资显示（消耗优化购买后立即可感知）
  const salaryEl = document.getElementById('staff-salary');
  if (salaryEl) salaryEl.textContent = staffSalaryPerSec().toFixed(2) + '/s';
  // v2.6.4 ②：深入裂隙状态置顶显示
  const expStatus = document.getElementById('rift-exp-status');
  if (expStatus) {
    const ex = S.riftExpedition;
    if (ex) {
      const left = Math.max(0, Math.ceil((ex.until - Date.now()) / 1000));
      expStatus.style.display = '';
      expStatus.className = 'rift-exp-hero';
      expStatus.textContent = `🌌 深入裂隙 Lv.${ex.level} · 剩余 ${left}s · 已获 DM ${ex.gainedDm.toFixed(1)} · 腐化 ${S.corruption.toFixed(1)}%`;
    } else {
      expStatus.style.display = 'none';
      expStatus.textContent = '';
    }
  }
  if (staffStatus) {
    // v1.3 C：四态徽章 + 迁移倒计时 + tooltip（替代 staffUnhappy 的「资源耗尽!」）
    const w = S.wageState || {};
    const W = BALANCE.thread.wages;
    const salary = staffSalaryPerSec();
    let txt = '满薪', color = 'var(--good)';
    if (S.cultists.length === 0) { txt = '待招募'; color = 'var(--text-2)'; }
    else if (isLazy()) { // v2.7.1：懒惰态（EP 满上限惩罚）——消耗 > 产出
      txt = `懒惰 · 产出 ×${lazyProdMult()} 消耗 ×${lazyCostMult()}`;
      color = 'var(--warn)';
    }
    else if (w.state === 'debt') {
      if ((w.bufferSec || 0) > 0) { txt = `欠薪 ×${wageDebtMult()} · 恢复缓冲 ${Math.ceil(w.bufferSec)}s`; }
      else { txt = `欠薪 ×${wageDebtMult()} · 休眠还剩 ${Math.ceil(Math.max(0, W.dormantAfterSec - (w.debtSec || 0)))}s`; }
      color = 'var(--warn)';
    } else if (w.state === 'dormant') {
      txt = `休眠 ×0 · 流失还剩 ${Math.ceil(Math.max(0, W.loseAfterSec - (w.dormantSec || 0)))}s`;
      color = '#ff9800';
    } else if (w.state === 'losing') {
      txt = `流失预警 · 下次判定 ${Math.ceil(Math.max(0, 60 - (w.loseTimer || 0)))}s`;
      color = 'var(--bad)';
    }
    staffStatus.textContent = txt;
    staffStatus.style.color = color;
    staffStatus.title = `线程薪资四态（当前：${w.state}）\n` +
      `· 满薪（绿）：EP ≥ ${W.warnSec}s 薪资，无惩罚\n` +
      `· 欠薪降效（黄）：EP < ${W.warnSec}s 薪资，产出 ×${wageDebtMult()}；连续 ${W.dormantAfterSec}s 进入休眠\n` +
      `· 强制休眠（橙）：产出 ×0，保命成本 = 薪资 ×${wageKeepCostMult()}；持续 ${W.loseAfterSec}s 进入流失预警\n` +
      `· 流失预警（红）：每 60s ${Math.round(wageLoseChance() * 100)}% 概率流失 1 线程（维修坞 → 0，免疫）\n` +
      `· 懒惰（黄）：EP 持续满上限 ${BALANCE.lazy.afterSec}s → 线程怠工：产出 ×${BALANCE.lazy.prodMult}、消耗 ×${BALANCE.lazy.costMult}（消耗 > 产出）；EP 跌到 0 或任意升级/线程购买解除\n` +
      `恢复：EP ≥ ${W.recoverSec}s 薪资（当前薪资 ${fmt(salary)} EP/s，恢复线 ${fmt(salary * W.recoverSec)} EP）`;
  }
  if (staffCostEl) staffCostEl.textContent = fmt(staffCost());
  if (hireBtn) {
    hireBtn.disabled = S.ep < staffCost();
    hireBtn.style.opacity = S.ep < staffCost() ? '0.5' : '1';
  }
  if (focusLv) focusLv.textContent = S.focusLevel;
  if (focusCostEl) focusCostEl.textContent = fmt(focusCost());
  // v2.0 腐化条（与 renderCorruption 同源，双渲染点保持与发布版一致）
  const cbar = document.getElementById('corruption-bar');
  if (cbar) {
    if ((S.corruption || 0) > 0.01) {
      cbar.style.display = '';
      const fill = document.getElementById('corruption-fill');
      const num = document.getElementById('corruption-num');
      const pen = document.getElementById('corruption-pen');
      if (fill) fill.style.width = S.corruption.toFixed(1) + '%';
      if (num) num.textContent = S.corruption.toFixed(1) + '%';
      if (pen) pen.textContent = `-${Math.round((1 - corruptionPenalty()) * 100)}%`;
    } else {
      cbar.style.display = 'none';
    }
  }
  // v2.0 EP 容量提示：≥95% 警告溢出产生腐化，≥80% 黄色提示
  const cap = epStorageCap();
  const hint = document.getElementById('ep-cap-hint');
  if (hint) {
    if (S.ep >= cap * 0.95) {
      hint.style.display = '';
      hint.textContent = `EP 已近上限 (${fmt(cap)})，溢出将产生腐化`;
      hint.style.color = 'var(--bad)';
    } else if (S.ep >= cap * 0.8) {
      hint.style.display = '';
      hint.textContent = `EP ${Math.round(S.ep / cap * 100)}% / ${fmt(cap)}`;
      hint.style.color = 'var(--warn)';
    } else {
      hint.style.display = 'none';
    }
  }
}

function renderProjects() {
  const el = document.getElementById('projects');
  if (!el) return;
  el.innerHTML = '';
  const now = Date.now();
  if (S.projects.length === 0) {
    el.innerHTML = '<div style="color:var(--text-3);font-size:11.5px;padding:4px">无进行中任务…</div>';
    return;
  }
  S.projects.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'proj';
    div.dataset.pidx = i; // v2.1 R2：供原地进度更新定位
    if (p.status === 'pending') {
      const r = p.reward;
      const rw = r.kind === 'ep' ? `+${fmt(r.amount)} EP` : r.kind === 'rp' ? `+${r.amount} RP` : r.kind === 'buff' ? `${r.dur / 60}分钟全局+${Math.round((r.buffMult - 1) * 100)}%` : `任务期间产出-${Math.round((1 - r.buffMult) * 100)}%`;
      const rwColor = r.kind === 'debuff' ? 'var(--bad)' : 'var(--good)';
      const left = Math.max(0, Math.ceil((3600000 - (now - p.pendingAt)) / 1000));
      // v2.1 R2：领取按钮不再逐节点挂监听，统一由容器级事件委托处理
      div.innerHTML = `<div class="pn"><span style="color:var(--good)">✓ ${p.name}</span><span class="mono" style="color:${rwColor}">${rw}</span></div>
        <div style="font-size:11px;color:var(--text-2);margin:2px 0">领取有效期 <span class="pend-left">${fmtTime(left)}</span></div>
        <button class="btn" data-claim="${i}" style="width:100%;font-size:11px;padding:3px;margin-top:2px">领取奖励</button>`;
    } else {
      const left = Math.max(0, Math.ceil((p.deadline - now) / 1000));
      const pct = p.goal > 0 ? Math.min(100, p.progress / p.goal * 100) : 0;
      const r = p.reward;
      const rw = r.kind === 'ep' ? `+${fmt(r.amount)} EP` : r.kind === 'rp' ? `+${r.amount} RP` : r.kind === 'buff' ? `${r.dur / 60}分钟全局+${Math.round((r.buffMult - 1) * 100)}%` : `任务期间产出-${Math.round((1 - r.buffMult) * 100)}%`;
      const rwColor = r.kind === 'debuff' ? 'var(--bad)' : 'var(--good)';
      div.innerHTML = `<div class="pn"><span>${p.name}</span><span class="mono" style="color:${rwColor}">${rw}</span></div>
        <div class="prog-txt" style="font-size:11px;color:var(--text-2)">${p.desc}：${Math.floor(p.progress)}/${p.goal}（${pct.toFixed(0)}%）</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
          <div class="pt" style="flex:1"><div style="width:${pct}%"></div></div>
          <div class="pr mono deadline-left" style="font-size:11px;min-width:60px;text-align:right">${fmtTime(left)}</div>
        </div>`;
    }
    el.appendChild(div);
  });
}

// v2.1 R2：任务进度原地更新——只改文本节点和进度条宽度，不重建 DOM（消除吞点击根源）
function updateProjectProgress() {
  const el = document.getElementById('projects');
  if (!el) return;
  const now = Date.now();
  S.projects.forEach((p, i) => {
    const div = el.querySelector(`.proj[data-pidx="${i}"]`);
    if (!div) return;
    if (p.status === 'pending') {
      const leftEl = div.querySelector('.pend-left');
      if (leftEl) leftEl.textContent = fmtTime(Math.max(0, Math.ceil((3600000 - (now - p.pendingAt)) / 1000)));
    } else {
      const pct = p.goal > 0 ? Math.min(100, p.progress / p.goal * 100) : 0;
      const bar = div.querySelector('.pt > div');
      if (bar) bar.style.width = pct + '%';
      const txt = div.querySelector('.prog-txt');
      if (txt) txt.textContent = `${p.desc}：${Math.floor(p.progress)}/${p.goal}（${pct.toFixed(0)}%）`;
      const leftEl = div.querySelector('.deadline-left');
      if (leftEl) leftEl.textContent = fmtTime(Math.max(0, Math.ceil((p.deadline - now) / 1000)));
    }
  });
}

// ========== Tab 切换 ==========
function switchTab(id) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('on'));
  document.querySelectorAll('.tabs button').forEach(el => el.classList.remove('on'));
  const pane = document.getElementById('tab-' + id);
  const btn = document.getElementById('btn-' + id);
  if (pane) pane.classList.add('on');
  if (btn) btn.classList.add('on');
  if (id === 'shop') dirty.shop = true;
  if (id === 'tech') dirty.tech = true;
  if (id === 'rp') renderRpPanel(); // v2.5 ④：研究点独立栏目
  if (id === 'pets') dirty.pets = true;
  if (id === 'prestige') dirty.prestige = true;
  if (id === 'offline') {
    const offPanel = document.getElementById('offline-panel');
    if (offPanel) renderOfflinePanel(offPanel);
    // v1.3 E：离线升级列表改走分区渲染（可购置前 + 已解锁折叠 + 委托购买）
    renderOfflineUpgrades(document.getElementById('offline-upg-list'));
  }
  if (id === 'expedition') dirty.expedition = true;
  if (id === 'storyline') renderStorylinePanel();
  if (id === 'religion') {
    const relPanel = document.getElementById('religion-panel');
    if (relPanel) renderReligionPanel(relPanel);
  }
  if (id === 'delve') {
    const dvPanel = document.getElementById('delve-panel');
    if (dvPanel) renderDelvePanel(dvPanel);
  }
  if (id === 'rift-tab') {
    const rtPanel = document.getElementById('rift-tab-panel');
    if (rtPanel) renderRiftPanel(rtPanel);
  }
}

function refreshTabVisibility() {
  // v2.5 ④：研究点 tab 常显（解锁状态由面板内占位/内容表达，未解锁也可点击查看条件）
  const rpBtn = document.getElementById('btn-rp');
  if (rpBtn) rpBtn.style.display = '';
  // 星图：探索过或正在探索才显示（对齐原版 unlock 条件）
  const expBtn = document.getElementById('btn-expedition');
  if (expBtn) expBtn.style.display = (S.expeditionsDone > 0 || S.expeditions.length > 0) ? '' : 'none';
  // v2.5.7 宗教：解锁条件（仓库≥1 且库存达标）达成才出现入口，达成前不显示
  // v2.6.2：首次达标后持久显示（_religionHintSeen，跨转生保留），面板内表达未解锁状态——避免 EP 波动/存储上限升级导致入口抖动消失
  if (canUnlockReligion()) { S._religionHintSeen = true; }
  const relBtn = document.getElementById('btn-religion');
  if (relBtn) relBtn.style.display = (religionUnlocked() || canUnlockReligion() || S._religionHintSeen) ? '' : 'none';
  // v2.6.0 深潜：ES≥3 + DM 发现 + 宗教已信奉才出现入口
  const dvBtn = document.getElementById('btn-delve');
  if (dvBtn) dvBtn.style.display = (delveUnlocked() || canUnlockDelve()) ? '' : 'none';
  // v2.6.1 裂隙：首次触发裂隙（或已封印/深入）后出现栏目入口
  const riftTabBtn = document.getElementById('btn-rift-tab');
  if (riftTabBtn) riftTabBtn.style.display = (S._riftSeen || (S.riftsSealed || 0) > 0) ? '' : 'none';
  // v2.7.0：深渊遗物入口——裂隙触发 ∧ DM 已发现（与探采平台/深渊商店同门控链）
  const relicBtn = document.getElementById('btn-relics');
  if (relicBtn) relicBtn.style.display = relicsUnlocked() ? '' : 'none';
}

// v2.5 ④：研究点（RP）独立栏目——EP 首次溢出解锁；展示余额 / 溢出转换 / 用途说明
function renderRpPanel() {
  const panel = document.getElementById('rp-panel');
  if (!panel) return;
  if (!anchorShown('rp', S)) {
    panel.innerHTML = `<div class="panel" style="padding:14px">
      <h3 style="margin-top:0;color:var(--dim)">🔬 研究点（RP）未解锁</h3>
      <p style="font-size:13px;line-height:1.9;color:var(--text-2)">让 EP 溢出存储上限，效能外溢将觉醒研究点。<br>
      解锁后：溢出 EP 自动转换为 RP（20K 溢出 → 1 RP，满 1 转出；每转生转换效率 +2.5%，所需溢出递减），用于科技树、离线升级与族升级。</p>
      <p style="font-size:12px;color:var(--text-3)">当前存储上限：${fmt(epStorageCap())} EP · 点击英雄区或挂机持续产出即可触发溢出</p>
    </div>`;
    return;
  }
  panel.innerHTML = `<div class="panel" style="padding:14px">
    <h3 style="margin-top:0">🔬 研究点（RP）</h3>
    <div class="stat"><b>当前 RP</b><span class="mono" style="color:var(--cyan)">${fmt(S.rp)}</span></div>
    <div class="stat"><b>溢出累计</b><span class="mono">${fmt(S.epOverflowTotal || 0)} EP</span></div>
    <div class="stat"><b>转换比例</b><span>20,000 溢出 EP → 1 RP（满 1 转出；每转生 -500，下限 5,000）</span></div>
    <p style="font-size:12px;color:var(--text-2);line-height:1.8;margin-top:10px">RP 用途：科技树购买（科技树 tab）、离线升级（离线 tab）、族升级（升级商店底部）。<br>
    RP 获取：任务奖励、溢出转换（速率随转生递增：每轮 -500 溢出 EP，下限 5,000）、数据熔炉建筑（每秒 +0.5 RP）。<br>
    本栏目独立于深渊裂隙：EP 首次溢出即觉醒，与裂隙无关。</p>
  </div>`;
}

// v2.0：渐进开放标签页锁定状态更新
function updateTabLocks() {
  const locks = [
    { id: 'btn-tech', stage: 'P1', label: '科技树' },
    { id: 'btn-pets', stage: 'P2', label: '异兽' },
    { id: 'btn-prestige', stage: 'P3', label: '晋升' },
    { id: 'btn-expedition', stage: 'P4', label: '星图' },
    { id: 'btn-storyline', stage: 'P4', label: '故事线' },
  ];
  // v2.3.1 ②（rev18 9.2）：科技树/异兽 tab 叠加锚点串联——章节门控 ∧ 锚点门控一条判定链：
  // 科技树 = P1 ∧ RP 锚点（购入灵感工坊，RP 跨转生保留）、异兽 = P2 ∧ PT 锚点（购入宠物乐园）。
  // v2.7.0 异兽口径变更：PT/宠物为本局制（转生清空），pt 锚点改即时门控（本局购入宠物乐园才开放），
  // 不再读 resDiscovered.pt 持久标记——修复「未购宠物乐园却解锁异兽」（旧档历史置位误放行）。
  const TAB_ANCHOR = { 'btn-tech': 'rp' };
  for (const { id, stage, label } of locks) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    const anchorKey = TAB_ANCHOR[id];
    const petsPt = id === 'btn-pets' ? anchorDone('pt', S) : false;
    const unlocked = isStageUnlocked(stage, S) && (!anchorKey || anchorShown(anchorKey, S)) && (id !== 'btn-pets' || petsPt);
    if (!unlocked) {
      btn.classList.add('tab-locked');
      btn.textContent = '🔒 ???';
      btn.title = anchorKey && isStageUnlocked(stage, S) && !anchorShown(anchorKey, S)
        ? `${label} 将在解锁对应资源后开放`
        : `${label} 将在 ${stage} 阶段解锁`;
      btn.disabled = true;
    } else {
      btn.classList.remove('tab-locked');
      btn.title = '';
      btn.disabled = false;
      // 恢复原始文本
      if (id === 'btn-tech') btn.textContent = '科技树';
      else if (id === 'btn-pets') btn.textContent = '异兽';
      else if (id === 'btn-prestige') btn.textContent = '晋升';
      else if (id === 'btn-expedition') btn.textContent = '星图';
      else if (id === 'btn-storyline') btn.textContent = '故事线';
    }
  }
  // v2.0 P1-1：门控系统接入 UI——检查已注册门控，锁定对应模块
  for (const gate of getAllGates()) {
    const open = checkGate(gate.id, { S });
    const el = document.getElementById(gate.id);
    if (el) {
      el.style.display = open ? '' : 'none';
      if (!open && gate.label) el.title = gate.label;
    }
  }
}

// ========== 事件绑定 ==========
function bindEvents() {
  document.getElementById('hero')?.addEventListener('click', doClick);
  document.getElementById('hire-btn')?.addEventListener('click', hireCultist);
  document.getElementById('pauseBtn')?.addEventListener('click', togglePause);
  document.getElementById('reset-btn')?.addEventListener('click', doReset);
  document.getElementById('focus-bar')?.addEventListener('click', buyFocus);

  // v2.1 R2：任务面板容器级事件委托——领取按钮无论面板怎么刷新都能点到
  document.getElementById('projects')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-claim]');
    if (!btn) return;
    const idx = Number(btn.dataset.claim);
    const p = S.projects[idx];
    if (p && p.status === 'pending') {
      claimProject(p);
      dirty.projects = true; dirty.top = true;
    }
  });

  document.getElementById('btn-shop')?.addEventListener('click', () => switchTab('shop'));
  document.getElementById('btn-tech')?.addEventListener('click', () => switchTab('tech'));
  document.getElementById('btn-relics')?.addEventListener('click', () => switchTab('relics')); // v2.7.0：深渊遗物
  document.getElementById('btn-rp')?.addEventListener('click', () => switchTab('rp')); // v2.5 ④：研究点栏目
  document.getElementById('btn-pets')?.addEventListener('click', () => switchTab('pets'));
  document.getElementById('btn-prestige')?.addEventListener('click', () => switchTab('prestige'));
  document.getElementById('btn-offline')?.addEventListener('click', () => switchTab('offline'));
  // v2.7.1：触手交互动画——点击拍打 + 日志反馈（hover 蠕动走 CSS）
  document.getElementById('tentacle-deco')?.addEventListener('click', () => {
    const deco = document.getElementById('tentacle-deco');
    if (!deco) return;
    deco.classList.remove('tap');
    void deco.offsetWidth; // 重排以重启动画
    deco.classList.add('tap');
    clearTimeout(S._tentacleTapTimer);
    S._tentacleTapTimer = setTimeout(() => deco.classList.remove('tap'), 600);
    log('触手回应了你的触碰', 'good');
  });
  document.getElementById('btn-expedition')?.addEventListener('click', () => switchTab('expedition'));
  document.getElementById('btn-storyline')?.addEventListener('click', () => switchTab('storyline'));
  document.getElementById('btn-religion')?.addEventListener('click', () => switchTab('religion'));
  bindReligionPanel(document.getElementById('religion-panel')); // v2.5.7：宗教面板事件委托
  document.getElementById('btn-delve')?.addEventListener('click', () => switchTab('delve'));
  bindDelvePanel(document.getElementById('delve-panel')); // v2.6.0：深潜面板事件委托
  document.getElementById('btn-rift-tab')?.addEventListener('click', () => switchTab('rift-tab'));
  document.getElementById('rift-tab-panel')?.addEventListener('click', (e) => { // v2.6.1：裂隙余烬升级树
    const upEl = e.target.closest('[data-rift-upg]');
    if (!upEl) return;
    const r = buyRiftUpgrade(upEl.dataset.riftUpg);
    if (!r.ok) toast(r.reason);
    renderRiftPanel(document.getElementById('rift-tab-panel'));
  });

  // v2.5 ⑤：存档导出 / 导入（导出下载 JSON；导入校验版本并写回刷新，原档自动备份）
  document.getElementById('export-btn')?.addEventListener('click', exportSave);
  document.getElementById('import-btn')?.addEventListener('click', () => document.getElementById('import-file')?.click());
  document.getElementById('import-file')?.addEventListener('change', importSave);

  // v2.5.4 ①：快照存档系统（3 槽 / 覆盖当前本地游戏 / 二级确认 / 新快照可覆盖旧快照）
  document.getElementById('snap-btn')?.addEventListener('click', openSnapshotModal);
  document.getElementById('snap-save')?.addEventListener('click', onSnapSave);
  document.getElementById('snap-close')?.addEventListener('click', () => { const m = document.getElementById('snap-modal'); if (m) m.style.display = 'none'; });
  document.getElementById('snap-list')?.addEventListener('click', (e) => {
    const li = e.target.closest('[data-snap]');
    if (!li) return;
    const id = li.dataset.snap;
    const label = `${li.dataset.name}（${li.dataset.time}）`;
    if (e.target.classList.contains('snap-use')) {
      askConfirm('使用快照覆盖当前进度', `将用「${label}」覆盖当前本地游戏，当前进度将丢失。\n确定继续？`, () => {
        const data = snapshotData(id);
        if (!data) { toast('快照不存在'); return; }
        const cur = localStorage.getItem(SAVE_KEY);
        if (cur) localStorage.setItem(SAVE_KEY + '_bak', cur);
        localStorage.setItem(SAVE_KEY, data);
        toast('已恢复快照，页面即将刷新');
        setTimeout(() => location.reload(), 600);
      });
    } else if (e.target.classList.contains('snap-del')) {
      askConfirm('删除快照', `确定删除快照「${label}」？`, () => {
        deleteSnapshot(id);
        renderSnapshotList();
        toast('快照已删除');
      });
    }
  });

  // v2.3.1 ⑥（rev18 9.4）：×1/×10/×100 倍率按钮与监听整节移除（bulk-bar 已从 index.html 删除）

  // v2.7.0：深渊遗物购买（事件委托）
  document.getElementById('relics-panel')?.addEventListener('click', (e) => {
    const id = e.target && e.target.dataset ? e.target.dataset.relicBuy : null;
    if (!id) return;
    const r = buyRelic(id);
    if (!r.ok && r.reason) { log(`[遗物] ${r.reason}`, 'bad'); toast(r.reason); }
    renderRelics(document.getElementById('relics-panel'));
  });

  // 晋升按钮
  document.getElementById('prestige-panel')?.addEventListener('click', (e) => {
    if (e.target.id !== 'prestige-btn') return;
    if (canPrestige()) { openTalentModal(); return; }
    // v2.7.3：未达标点击有反馈（不再静默 disabled）——「没反应」观感根治
    const need = prestigeNeed();
    const lack = Math.max(0, need - S.runEarned);
    if (toast) toast(`晋升未达标：还差 ${fmt(lack)} EP 本局累计（1 PP 起步）`);
  });

  // v2.5 ⑦：主面板离线栏已移除，离线入口保留「离线」tab 按钮（离线玩法不删）

  // 宠物浮动
  // v2.7.3 ⑦：宠物交互动画——点击浮动宠物冒爱心 + 弹跳（不再切 tab，交互反馈即动画）
  document.getElementById('pet-float')?.addEventListener('click', (e) => {
    const item = e.target.closest('.pet-item');
    if (!item) return;
    const icon = item.textContent.trim() || '🐾';
    const heart = document.createElement('div');
    heart.className = 'pet-heart';
    heart.textContent = icon;
    item.style.animation = 'none';
    void item.offsetWidth;
    item.style.animation = '';
    const r = item.getBoundingClientRect();
    heart.style.left = r.left + r.width / 2 - 10 + 'px';
    heart.style.top = r.top - 6 + 'px';
    (document.getElementById('pet-float') || document.body).appendChild(heart);
    setTimeout(() => heart.remove(), 900);
  });

  // v2.0 腐化：主动净化按钮（每次清除最多 50%）
  document.getElementById('corruption-purge')?.addEventListener('click', () => {
    const cut = Math.min(S.corruption || 0, 50);
    S.corruption = Math.max(0, (S.corruption || 0) - cut);
    if (cut > 0) {
      log(`主动净化：清除 ${cut.toFixed(1)}% 腐化`, 'good');
      toast(`净化 -${cut.toFixed(1)}% 腐化`);
    }
    dirty.corruption = true; dirty.top = true;
  });

  // v2.3.1 缺陷④修复：清档守卫——doReset 清键后到 reload 完成前，任何回写路径
  // （beforeunload / 5s 自动保存）都不得把内存中的旧 S 写回，否则清档失效
  // （v2.3 回归根因：reset() 只清 localStorage，reload 触发 beforeunload 把
  // 内存档原样回写，与 v2.0.x 修过的现象同源）。
  window.addEventListener('beforeunload', () => { if (!resetGuard) save(S); });
}

// v2.5 ⑤：导出存档——先落盘再导出（与 localStorage 同源），下载 JSON 可跨设备导入
function exportSave() {
  try {
    save(S);
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { toast('导出失败：存档不存在'); return; }
    const blob = new Blob([raw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `abyss_idle_v${SAVE_VERSION}_save_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('存档已导出');
  } catch (e) {
    toast('导出失败：' + (e && e.message ? e.message : '未知错误'));
  }
}

// v2.5.4 ①：通用二级确认弹框（title / 正文 / 取消-确认）
let _confirmOk = null;
function askConfirm(title, text, onYes) {
  const m = document.getElementById('confirm-modal');
  const t = document.getElementById('confirm-title');
  const x = document.getElementById('confirm-text');
  if (!m || !t || !x) return;
  t.textContent = title;
  x.textContent = text;
  _confirmOk = onYes;
  m.style.display = 'flex';
}
document.getElementById('confirm-cancel')?.addEventListener('click', () => {
  const m = document.getElementById('confirm-modal'); if (m) m.style.display = 'none'; _confirmOk = null;
});
document.getElementById('confirm-ok')?.addEventListener('click', () => {
  const m = document.getElementById('confirm-modal'); if (m) m.style.display = 'none';
  const fn = _confirmOk; _confirmOk = null; if (fn) fn();
});

// v2.5.4 ①：快照面板
function renderSnapshotList() {
  const box = document.getElementById('snap-list');
  if (!box) return;
  const snaps = listSnapshots();
  box.innerHTML = '';
  if (!snaps.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--text-2);padding:8px;border:1px dashed var(--border);border-radius:5px">暂无快照。点击上方「保存当前进度为快照」生成（最多 ' + SNAP_MAX + ' 个）。</div>';
    return;
  }
  for (const sn of snaps) {
    const row = document.createElement('div');
    row.className = 'item snap-row';
    row.dataset.snap = sn.id;
    row.dataset.name = sn.name;
    row.dataset.time = sn.timeText;
    row.title = '点击行内按钮操作；「使用」= 作为本地游戏覆盖当前进度';
    row.innerHTML = `<div class="name"><span>${sn.slot}. ${sn.name}</span><span class="count mono">${sn.timeText}</span></div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn snap-use" style="flex:1;padding:4px 6px;font-size:11px">作为本地游戏</button>
        <button class="btn snap-del" style="flex:1;padding:4px 6px;font-size:11px;background:transparent">删除</button>
      </div>`;
    box.appendChild(row);
  }
}

function openSnapshotModal() {
  renderSnapshotList();
  const m = document.getElementById('snap-modal');
  if (m) m.style.display = 'flex';
}

// 保存快照：槽未满直接存；已满走二级确认覆盖最早快照
function onSnapSave() {
  const r = saveSnapshot();
  if (r.ok) {
    renderSnapshotList();
    toast('快照已保存（' + listSnapshots().length + '/' + SNAP_MAX + '）');
    return;
  }
  if (r.needCover) {
    askConfirm('快照已满，覆盖最早的快照', `已保存 ${SNAP_MAX} 个快照。新快照将覆盖最早的「${r.needCover.name}（${fmtStamp(r.needCover.time)}）」，确定保存？`, () => {
      const res = coverOldest(r.snap);
      if (res.ok) { renderSnapshotList(); toast(res.covered ? '已覆盖旧快照，新快照已保存' : '快照已保存'); }
      else toast('保存失败：本地存储不可用');
    });
  } else {
    toast(r.reason || '保存失败');
  }
}

// v2.5 ⑤：导入存档——校验 JSON + 版本字段，写回并刷新；原档自动备份到 abyss_idle_v2_bak
function importSave(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || typeof data !== 'object' || data._version === undefined) {
        throw new Error('文件不是有效存档');
      }
      const cur = localStorage.getItem(SAVE_KEY);
      if (cur) localStorage.setItem(SAVE_KEY + '_bak', cur);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      toast('存档导入成功，页面即将刷新');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      toast('导入失败：' + (err && err.message ? err.message : '文件无法解析'));
    }
  };
  reader.onerror = () => toast('导入失败：无法读取文件');
  reader.readAsText(f);
  e.target.value = '';
}

function openTalentModal() {
  const modal = document.getElementById('talent-modal');
  const box = document.getElementById('talent-options');
  if (!modal || !box) return;
  renderTalentModal(box);
  modal.style.display = 'flex';
  // v2.0：晋升跳过彩蛋——关闭模态框未选天赋时计数
  const onModalClose = (e) => {
    if (e.target === modal) {
      S._prestigeSkips = (S._prestigeSkips || 0) + 1;
      checkEasterEggs('prestige_skip', S, log, toast, () => { dirty.story = true; });
      modal.style.display = 'none';
      modal.removeEventListener('click', onModalClose);
    }
  };
  modal.addEventListener('click', onModalClose);
  box.querySelectorAll('.talent-option').forEach(el => {
    el.addEventListener('click', () => {
      const tid = el.dataset.talent;
      doPrestige(tid);
      save(S); // v2.7.1：转生立即持久化（消除 5s 保存窗口 → 选天赋后刷新不再回滚）
      modal.removeEventListener('click', onModalClose);
      S._prestigeSkips = 0; // 选择了天赋，重置跳过计数
      dirty.shop = true; dirty.tech = true; dirty.pets = true;
      dirty.prestige = true; dirty.projects = true; dirty.top = true;
      // v2.0：彩蛋检查
      checkEasterEggs('prestige', S, log, toast, () => { dirty.story = true; });
    });
  });
}

// ========== 动作 ==========
function doClick() {
  let p = clickMult();
  const crit = fxBest('clickCrit'); // v2.1 建筑驱动：会心反应炉（1%×5）/ 反应炉·锐（5%×5）掷骰
  if (crit && Math.random() < crit.chance) p *= crit.mult;
  p *= corruptionPenalty(); // v2.0 腐化：点击产出同样受腐化惩罚
  addEp(p); // v2.1 D1：统一入口（受上限约束 + 统一记账）
  S.totalClicks++;
  S._lastActionAt = Date.now();
  dirty.top = true; dirty.hero = true; dirty.prestige = true;
  // v2.0：彩蛋检查
  checkEasterEggs('click', S, log, toast, () => { dirty.story = true; });
}

function hireCultist() {
  const cost = staffCost();
  if (S.ep < cost) return;
  S.ep -= cost;
  S.lazySince = null; // v2.7.1：招募操作解除线程懒惰
  S._lastActionAt = Date.now();
  const names = ['外勤干员 A','斥候','深潜者','观测员','渗透单元','信使','无面者','印斯茅斯节点','沙丘行者','门之侍者'];
  // v2.0：线程基础产出由 BALANCE.thread 定义（3 + 随机 0~3），不再硬编码
  S.cultists.push({
    id: Date.now() + Math.random(),
    name: names[Math.floor(Math.random() * names.length)],
    output: BALANCE.thread.baseOutput + Math.random() * BALANCE.thread.baseOutputJitter,
    mood: '正常',
    moodTimer: 30 + Math.random() * 60,
  });
  dirty.top = true; dirty.hero = true;
}

function buyFocus() {
  const c = focusCost();
  if (S.ep < c) return;
  S.ep -= c; S.focusLevel++;
  S._lastActionAt = Date.now();
  dirty.hero = true; dirty.top = true;
}

function togglePause() {
  S._lastActionAt = Date.now();
  if (!S.paused) {
    S.paused = true;
    S.pausedAt = Date.now();
    document.getElementById('pauseBtn').textContent = '继续';
    document.body.classList.add('paused');
    log('系统暂停（按离线结算）', 'bad');
    showPauseModal(); // v2.5 ⑥：暂停弹框展示预计离线时间与收入
  } else {
    settlePause();
  }
  dirty.top = true; dirty.prestige = true;
}

// v2.5 ⑥：暂停弹框——实时展示已暂停时长与预计离线收入；「恢复并结算」结束暂停
function showPauseModal() {
  const modal = document.getElementById('pause-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  updatePausePreview();
  const btn = document.getElementById('pause-resume');
  if (btn) {
    btn.onclick = () => {
      modal.style.display = 'none';
      settlePause();
    };
  }
}

function hidePauseModal() {
  const modal = document.getElementById('pause-modal');
  if (modal) modal.style.display = 'none';
}

// 每秒刷新暂停时长与预计收入（tick 暂停分支调用；未暂停或弹框关闭时静默返回）
function updatePausePreview() {
  const modal = document.getElementById('pause-modal');
  const info = document.getElementById('pause-info');
  if (!info || !modal || modal.style.display !== 'flex') return;
  const dt = (Date.now() - (S.pausedAt || Date.now())) / 1000;
  const eff = Math.min(dt, offlineCap());
  const cps = computeCps();
  const epPreview = Math.max(0, cps * eff * offlineRate());
  const hours = eff / 3600;
  const rpPreview = hours >= 1 ? Math.floor(hours * 2 * (S.runTalent === 'fortunate' ? 2 : 1)) : 0;
  info.innerHTML = `已暂停（模拟离线）：<b class="mono">${fmtTime(dt)}</b><br>
    预计离线收入：<b style="color:var(--green)">+${fmt(epPreview)} EP</b>${rpPreview > 0 ? ` · <b style="color:var(--cyan)">+${rpPreview} RP</b>` : ''}<br>
    <span style="font-size:11px;color:var(--text-3)">按离线效率 × 已暂停时长结算，受离线上限与 EP 存储上限约束</span>`;
}

// v2.5 ⑥：暂停结算（与离线结算同口径：EP + 到期项目 + 小时 RP 加成）
function settlePause() {
  const dt = (Date.now() - S.pausedAt) / 1000;
  S.paused = false;
  S.pausedAt = 0;
  document.getElementById('pauseBtn').textContent = '暂停';
  document.body.classList.remove('paused');
  hidePauseModal();
  const now = Date.now();
  const logPts = [];
  if (dt > 5) {
    const eff = Math.min(dt, offlineCap());
    const cps = computeCps();
    const gain = cps * eff * offlineRate();
    if (gain >= 1) {
      const gained = addEp(gain); // v2.1 D1：统一入口，受 EP 上限约束
      if (gained > 0) logPts.push(`+${fmt(gained)} EP`);
    }
    // 暂停期间到期项目一并结算（与离线回程同口径）
    if (S.projects.length > 0) {
      const still = [];
      let projDone = 0;
      for (const p of S.projects) {
        if ((now - p.startsAt) >= (p.deadline - p.startsAt)) {
          if (p.reward.kind === 'ep') addEp(p.reward.amount);
          else if (p.reward.kind === 'rp') S.rp += p.reward.amount;
          S.projectsDone++; projDone++;
        } else still.push(p);
      }
      S.projects = still;
      if (projDone > 0) logPts.push(`${projDone} 个项目完成`);
    }
    const hours = eff / 3600;
    let bonusRp = 0;
    if (hours >= 1) {
      bonusRp = Math.floor(hours * 2 * (S.runTalent === 'fortunate' ? 2 : 1));
      if (bonusRp > 0) { S.rp += bonusRp; logPts.push(`+${bonusRp} RP`); }
    }
    if (logPts.length > 0) {
      log(`暂停恢复：离线 ${fmtTime(dt)}，${logPts.join('、')}`, 'good');
      toast(`暂停结算：${logPts.join('、')}`);
    }
  }
  S._pauseCycles = (S._pauseCycles || 0) + 1; // v2.0：彩蛋计数
  log('系统恢复', 'good');
  // v2.0：彩蛋检查
  checkEasterEggs('pause', S, log, toast, () => { dirty.story = true; });
  checkEasterEggs('pause_cycle', S, log, toast, () => { dirty.story = true; });
  dirty.top = true; dirty.prestige = true; dirty.projects = true;
}

// v2.3.1 缺陷④：清档守卫（置位后 beforeunload / 自动保存均不再回写）
let resetGuard = false;

function doReset() {
  if (confirm('确认清档？')) {
    resetGuard = true;
    reset();
    // 展开态属进度披露 UI 态，清档一并回收（新档回到首屏窗口，与换设备口径一致）
    try { localStorage.removeItem(EXPAND_KEY); } catch (e) { /* 隐私模式等静默忽略 */ }
    location.reload();
  }
}

// ========== 里程碑 & 成就 ==========
const MILES = BALANCE.miles; // v2.0：里程碑表移入 BALANCE

function checkMiles() {
  const cps = computeCps();
  for (const m of MILES) {
    if (cps >= m.cps && !S.milesDone[m.cps]) {
      S.milesDone[m.cps] = true;
      const rpGain = Math.ceil(m.rp * (S.runTalent === 'fortunate' ? 2 : 1) * (1 + elv('mile') * 0.05));
      S.rp += rpGain;
      log(`里程碑：每秒 ${fmt(m.cps)}，+${rpGain} RP`, 'good');
    }
  }
}

function checkAch() {
  const tests = [
    { id: 'click1', test: s => s.totalClicks >= 1 },
    { id: 'ep1k', test: s => s.allTimeEp >= 1e3 },
    { id: 'ep100k', test: s => s.allTimeEp >= 1e5 },
    { id: 'ep1m', test: s => s.allTimeEp >= 1e6 },
    { id: 'own10', test: s => totalOwned() >= 10 },
    { id: 'pre1', test: s => s.prestige >= 1 },
    { id: 'tech1', test: s => techCount() >= 1 },
    { id: 'offline', test: s => s.gotOffline },
    { id: 'pet1', test: s => petCount() >= 1 },
  ];
  for (const a of tests) {
    if (!S.achievements[a.id] && a.test(S)) {
      S.achievements[a.id] = true;
      log(`成就：${a.id}`, 'good');
    }
  }
}

// ========== v2.0 潮汐 tick ==========
function tickTide(dt) {
  // 存档字段兜底：类型异常时回退到默认相位
  if (typeof S.tideTimer !== 'number' || S.tideTimer < 0) S.tideTimer = BALANCE.tide.phaseDuration;
  if (typeof S.tidePhase !== 'number' || S.tidePhase < 0 || S.tidePhase > 3) S.tidePhase = 0;
  S.tideTimer -= dt;
  if (S.tideTimer <= 0) {
    const prev = S.tidePhase;
    S.tidePhase = (S.tidePhase + 1) % 4;
    S.tideTimer = BALANCE.tide.phaseDuration;
    const info = tidePhaseInfo(S.tidePhase);
    if (prev !== S.tidePhase) {
      log(`潮汐：进入${info.name}期 (${info.icon})`, 'good');
      toast(`潮汐→${info.name}`);
    }
  }
}

// ========== v2.0 腐化 tick ==========
// v2.1.1 P1-B：函数体迁至 economy.js 导出（便于数值自测），main.js 顶部统一 import

// ========== 主循环 ==========
let lastTick = performance.now();
let lastShopCheck = 0;
let lastUnlockedCount = -1;
let lastProjRender = 0;      // v2.0：任务面板 1s 节流重绘
let tideCachePhase = -1;     // v2.0：潮汐脏检查缓存
let tideCacheTimer = -1;
let corruptionCacheFloor = -1; // v2.0：腐化脏检查缓存
let lastAiUnlocked = false;  // v1.3 A：AI 核心解锁变化检测
let lastGateHash = '';       // v2.0 P1-1：门控状态变化检测

function tick(now) {
  const dt = Math.min(1, (now - lastTick) / 1000);
  lastTick = now;
  if (S.paused) {
    updatePausePreview(); // v2.5 ⑥：暂停弹框实时刷新（预计离线时间/收入）
    dirty.top = true; dirty.prestige = true;
    render();
    return;
  }

  // EP 核心产出
  const cps = computeCps();
  const gain = cps * dt;
  // v2.1.1 P1-B：挂机产出走「先加后截」——S.ep 先全额入账，溢出部分由
  // tickCorruption 按比例累积腐化（恢复 v2.0 设计本意）并截断到上限；
  // 一次性入口（点击/任务/事件/远征/离线/暂停补算）仍走 addEp() 直接截断。
  // v2.3.1 缺陷③修复（用户反馈③）：「本局/累计」统计改钳后口径，与 addEp()
  // 对齐——达上限后被钳制的增量不再计入 runEarned/allTimeEp（满上限后顶部
  // 「本局」不再上涨）。腐化累积与溢出池机制不变（S.ep 仍先加后截，tickCorruption
  // 的 overflow = gain - credited 与修复前完全一致）。
  const capNow = epStorageCap();
  const credited = Math.min(gain, Math.max(0, capNow - S.ep));
  S.ep += gain;
  S.runEarned += credited;
  S.allTimeEp += credited;
  S.earnedFull = (S.earnedFull || 0) + gain; // v2.5.1：任务进度全量口径（含被上限钳制部分）
  // v2.5.1 反馈④：深渊行者科技「触手协议」——每 60 秒自动点击一次
  if (S.tech && S.tech.tentacle_protocol === true) {
    S._tentacleTimer = (S._tentacleTimer || 0) + dt;
    if (S._tentacleTimer >= 60) {
      S._tentacleTimer -= 60;
      const tap = clickMult();
      if (tap > 0) {
        addEp(tap);
        log('触手轻点工作台', 'good');
        // v2.6.3 反馈③：触手协议要有动画——触发时触手拍动 + 工作台点击涟漪
        const deco = document.getElementById('tentacle-deco');
        if (deco) {
          deco.classList.remove('tap');
          void deco.offsetWidth; // 重排以重启动画
          deco.classList.add('tap');
          clearTimeout(S._tentacleTapTimer);
          S._tentacleTapTimer = setTimeout(() => deco.classList.remove('tap'), 500);
        }
      }
    }
  }

  // v2.7.1：线程懒惰态计时——EP 持续近满（≥98% cap）开始计时；进入懒惰后
  // 即使 EP 跌破近满线也保持（懒惰中消耗>产出自然下滑），直到 EP 跌到 0 或任意升级/购买解除
  if (isLazy()) {
    if (S.ep <= 0) S.lazySince = null;
  } else if (S.ep >= capNow * 0.98) {
    if (!S.lazySince) S.lazySince = now;
  } else {
    S.lazySince = null;
  }

  // 线程薪资 —— v1.3 模块 C：四态状态机（满薪/欠薪降效/强制休眠/流失预警），
  // 替代 staffUnhappy 隐藏计数器（旧字段保留读兼容）；个体 mood 在状态机内正交叠加
  tickWages(dt);

  // 资源型模块产出
  for (const u of UPGRADES) {
    if (!u.produces) continue;
    const n = S.upgrades[u.id] || 0;
    if (n === 0) continue;
    const p = u.produces;
    if (p.type === 'rp') S.rp += p.rate * n * dt;
    else if (p.type === 'pt') S.pt = (S.pt || 0) + p.rate * n * dt;
    else if (p.type === 'fa_chance') {
      if (Math.random() < p.rate * n * dt) {
        S.faith = (S.faith || 0) + 1;
        log(`神龛显灵：+1 信仰`, 'good');
      }
    }
  }

  // v2.5.7 宗教：圣所信仰产出 + 入口/面板状态刷新
  tickReligion(dt);
  // v2.6.0 深潜：深潜产出/腐化/里程碑
  tickDelve(dt);
  S._religCheckTimer = (S._religCheckTimer || 0) + dt;
  if (S._religCheckTimer >= 5) {
    S._religCheckTimer = 0;
    refreshTabVisibility(); // 宗教入口条件达成后出现
    dirty.religion = true;
    // v2.6.0：深潜面板随产出/腐化/里程碑低频刷新（HTML 相同由渲染层跳过重建）
    if (delveUnlocked()) dirty.delve = true;
  }

  // 深渊裂隙
  const hadRift = !!S.activeRift;
  tickRift(dt);
  if (!!S.activeRift !== hadRift || S.activeRift) dirty.rift = true;

  // v1.3 模块 D：载具被动采集 DM（60s roll，到账走 [采集] 日志）
  if (tickVehicleCollect(dt)) dirty.top = true;

  // 任务版
  // v2.0 P1 修复：tickProjects() 返回本帧任务状态是否变化（生成/完成/过期），
  // changed === true 时置 dirty.projects，任务面板只在奖励状态真正变化时重绘。
  const projChanged = tickProjects();
  if (projChanged) dirty.projects = true;
  // v2.1 R2：进度刷新不再触发整面板重建，改为原地更新文本/进度条（消除吞点击）
  if (S.projects.length > 0 && now - lastProjRender > 1000) {
    lastProjRender = now;
    updateProjectProgress();
  }

  // 星际探索
  const exBefore = S.expeditions.length;
  const exDoneBefore = S.expeditionsDone;
  tickExpeditions();
  if (S.expeditions.length !== exBefore || S.expeditionsDone !== exDoneBefore) {
    dirty.expedition = true;
    refreshTabVisibility();
  }

  // v2.0 章节进度同步
  const chNow = currentChapter(S);
  const chNowStr = String(chNow.id);
  const sChapterStr = String(S.chapter || '1');
  if (parseInt(chNowStr, 10) > parseInt(sChapterStr, 10)) {
    S.chapter = chNowStr;
    dirty.story = true;
  }

  // v2.0 P1-1：门控系统主循环检查——门控状态变化时触发 UI 重绘
  const gateStates = [];
  for (const gate of getAllGates()) {
    gateStates.push(checkGate(gate.id, { S }) ? '1' : '0');
  }
  const gateHash = gateStates.join('');
  if (gateHash !== lastGateHash) {
    lastGateHash = gateHash;
    dirty.top = true;
  }

  // v2.0 潮汐 / 腐化推进
  tickTide(dt);
  tickCorruption(dt);

  // v2.2 岔路口状态机推进（每帧幂等；替代 v2.0 弹窗强制选择）
  updateCrossroad();

  maybeTriggerEvent();

  // 异兽经验
  gainPetExp(dt);
  // v2.5.7 检查修复：挂机升级/经验增长驱动宠物 UI 低频刷新（5s；HTML 相同则重建跳过，不影响动画）
  S._petUiTimer = (S._petUiTimer || 0) + dt;
  if (S._petUiTimer >= 5) {
    S._petUiTimer = 0;
    dirty.pets = true;
  }

  // v2.0 特殊任务检查（每帧检查）
  checkSpecialTasks(S, log, toast);

  // v2.0 彩蛋检查（周期性触发类）
  checkEasterEggs('time_check', S, log, toast, () => { dirty.story = true; });
  checkEasterEggs('idle', S, log, toast, () => { dirty.story = true; });
  checkEasterEggs('state_check', S, log, toast, () => { dirty.story = true; });

  // v2.0  idle 时间追踪
  S._idleSec = ((Date.now() - S._lastActionAt) / 1000) || 0;

  // 检查
  checkMiles();
  checkAch();

  // v2.3 资源发现：集中单点检查（所有发放点统一覆盖；发现即 toast + 存档）
  discoverCheck();

  // v1.3 模块 A：AI 助手（每 5s 决策；有动作时刷英雄/顶栏/任务）
  // v2.7.1 修复：AI/混沌买入已走单卡原地刷新（refreshShopItem/refreshV21Item），不再置 dirty.shop
  // 整面板重建（原逻辑使混沌心智场景每 100ms 重建商店 → hover 卡被替换 → 闪烁/点击丢失）；
  // 仅自动招募（线程区结构变化）才置 dirty.shop 刷新线程区。
  const aiAct = tickAI(dt);
  if (aiAct) { dirty.hero = true; dirty.top = true; dirty.projects = true; if (aiHireFlag()) dirty.shop = true; }

  // v2.0 潮汐脏检查：相位或剩余秒数（向上取整）变化才重绘潮汐卡
  const tideTimerCeil = Math.ceil(S.tideTimer);
  if (S.tidePhase !== tideCachePhase || tideTimerCeil !== tideCacheTimer) {
    dirty.tide = true; dirty.top = true;
    tideCachePhase = S.tidePhase;
    tideCacheTimer = tideTimerCeil;
  }
  // v2.0 腐化脏检查：整数百分比变化才重绘腐化条
  const corruptionFloor = Math.floor(S.corruption || 0);
  if (corruptionFloor !== corruptionCacheFloor) {
    dirty.corruption = true; dirty.hero = true; dirty.top = true;
    corruptionCacheFloor = corruptionFloor;
  }

  // v2.1 R2：仅保留纯文本刷新的脏标记（top/hero 只更新 textContent，不重建可点击节点）；
  // 移除旧版无条件 dirty.projects —— 任务面板 100ms 全量重建是「奖励领不了」的根因
  dirty.top = true; dirty.hero = true; dirty.prestige = true; dirty.story = true;

  // v2.6.7：商店解锁检测降频至 5s，且解锁数变化只增量揭示新卡（refreshShopChain），
  // 不再整面板重建——「allTimeEp 每秒跨阈值 → 每秒整重建 → hover 闪烁/点击竞争」根因修复
  if (now - lastShopCheck > 5000) {
    lastShopCheck = now;
    let n = 0;
    for (const u of UPGRADES) {
      const owned = S.upgrades[u.id] || 0;
      if (owned > 0 || S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3) n++;
    }
    if (lastUnlockedCount === -1) lastUnlockedCount = n;
    if (n !== lastUnlockedCount) {
      lastUnlockedCount = n;
      refreshShopChain();
      toast('新升级模块已解锁');
    }
    refreshTechState();
    refreshShopAffordability(); // v2.1 R4：每秒快刷灰态（不重建 DOM）
    // v1.3 A：AI 核心研究完成后面板出现（也覆盖晋升保留 ai_core 的场景）
    const aiNow = aiUnlocked();
    if (aiNow !== lastAiUnlocked) { lastAiUnlocked = aiNow; dirty.ai = true; }
  }

  render();
}

// ========== 初始化 ==========
// v2.0.3：初始化入口加 DOM ready 保护——脚本以经典 <script defer> 加载时按规范在 DOM 解析完成后执行，
// 但为消除对脚本加载时序的任何依赖（未来加载方式再变也不回归 v2.0.2 的 P0），
// 统一走 readyState 判断：loading 中则等 DOMContentLoaded，已就绪则立即执行。
// v2.2 启动幂等链（v2.1.1 hotfix 缺陷A修复块的扩展与合流）：
// ① 跨版本一致化（防御层，规则与 migrateSave v4→v5 段完全同源）——旧档即使迁移段因异常未落，
//    启动时按同源规则补齐 crossroad 状态与定向建筑；
// ② 承自 v2.1.1 hotfix：按存档 S.storyline 恢复线运行态注册（科技/章节/建筑/宠物/规则/门控），
//    非 default 时锁定单局切换（与购买钩子路径行为一致）。
// loadStoryline 全库调用点恰 2 处：此处 + shop.buyCrossroadBuilding 购买钩子（PM 定稿断言 2 新口径）。
function ensureStorylineRuntime() {
  const sl = S.storyline || 'default';
  if (sl !== 'default' && S.crossroad !== 'locked') {
    S.crossroad = 'locked';
    S.crossroadLockedBy = BALANCE.lineToCrossroad[sl] || null;
    const bid = S.crossroadLockedBy;
    if (bid) S.buildings[bid] = Math.max(S.buildings[bid] || 0, 1);
  }
  if (loadStoryline(sl) && sl !== 'default') lockStorylineSwitch();
}

function startApp() {
  ensureStorylineRuntime();

  // v2.5 ⑥：暂停态重开——不结算普通离线（避免双重入账），改弹暂停恢复框结算暂停时长
  if (S.paused && S.pausedAt) {
    showPauseModal();
  } else {
    const offlineResult = applyOffline();
    if (offlineResult) {
      const { gain, projDone, bonusRp, dt } = offlineResult;
      log(`离线 ${fmtTime(dt)}：+${fmt(gain)} EP${projDone > 0 ? `、${projDone} 项目` : ''}${bonusRp > 0 ? `、+${bonusRp} RP` : ''}`, 'good');
    }
  }

  // v2.0：初始只生成一个任务（配合 120s 生成冷却，奖励链路由 tickProjects 的 changed 驱动）
  if (S.projects.length === 0) spawnProject();
  else normalizeProjectGoals(); // v2.4.1：存量任务目标规范化（旧公式大目标/小数 → 新基准）

  // 同步暂停 UI（若加载时处于暂停状态）
  if (S.paused) {
    document.getElementById('pauseBtn').textContent = '继续';
    document.body.classList.add('paused');
  }

  refreshTabVisibility();

  // v2.1 R4：把 toast 注入 shop 模块（灰态点击提示）
  setToastFn(toast);
  // v1.3 C/D/A：日志与 toast 注入（[薪资]/[采集]/[AI] 前缀统一走系统日志）
  setWageLogFn(log);
  setWageToastFn(toast);
  setVehicleLogFn(log);
  setAiLogFn(log);
  setRelicsLogFn(log); // v2.7.0：深渊遗物
  setRelicsToastFn(toast);
  // v2.6.6 ③：AI/混沌买入后单卡原地刷新（不整面板重建，消除 hover 闪烁/点击竞争）
  setAiUiRefreshFn((pick) => {
    if (pick.kind === 'upgrade') refreshShopItem(pick.u);
    else if (pick.kind === 'building') refreshV21Item(pick.b);
  });
  setProjectLogFn(log); // v2.5.6 review：任务过期日志
  setReligionLogFn(log);
  setReligionToastFn(toast); // v2.5.7：宗教日志/toast
  setDelveLogFn(log);
  setDelveToastFn(toast); // v2.6.0：深潜日志/toast

  dirty.top = true; dirty.hero = true; dirty.shop = true; dirty.tech = true; dirty.relics = true; // v2.7.0：深渊遗物
  dirty.pets = true; dirty.prestige = true; dirty.projects = true; dirty.story = true;
  dirty.rift = true; dirty.expedition = true; dirty.riftTab = true;
  dirty.tide = true; dirty.corruption = true; dirty.ai = true;
  dirty.religion = true; dirty.delve = true;

  // v2.1：旧档迁移一次性提示（PM 4.2 玩家沟通口径；localStorage 防重）
  if (S._v21Migrated && !localStorage.getItem('v21_migrated_toast')) {
    localStorage.setItem('v21_migrated_toast', '1');
    toast('存档已升级：旧研究的效力已折算进建筑体系，详见科技树说明卡');
  }

  bindEvents();
  render();

  setInterval(() => tick(performance.now()), 100);

  // v2.7.3：文案选中复制——拖选/选中文本时不触发任何点击购买（capture 拦截 click）
  // mousedown→mouseup 位移 >4px 视为拖选：停止该次 click 冒泡，选择文本保留可复制
  let dragGuard = null;
  document.addEventListener('mousedown', e => { dragGuard = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener('mouseup', e => {
    if (dragGuard && (Math.abs(e.clientX - dragGuard.x) > 4 || Math.abs(e.clientY - dragGuard.y) > 4)) dragGuard = { drag: true };
    else dragGuard = null;
  }, true);
  document.addEventListener('click', e => {
    if (dragGuard && dragGuard.drag) { dragGuard = null; e.stopPropagation(); e.preventDefault(); return; }
    dragGuard = null;
  }, true);
  setInterval(() => { if (!resetGuard) save(S); }, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
