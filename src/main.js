import { S, save, reset, SAVE_KEY, SAVE_VERSION } from './state.js'; // v2.5 ⑤：SAVE_KEY/SAVE_VERSION 供存档导出/导入
import { fxBest } from './core/effectEngine.js'; // v2.1 建筑驱动：点击暴击掷骰参数
import {computeCps, staffSalaryPerSec, staffOutputPerSec, staffNetPerSec, cpsBreakdown, drainBreakdown, totalDrainPerSec,
  fmt, fmtTime, epStorageCap, clickMult, globalMult, setCollapseHooks, esDiscovered, collapseRemainMs,
  prestigeNeed, prestigeGain,
  staffCost, focusCost, costMult, hasTech, petCount, elv, totalOwned, techCount,
  offlineRate, offlineCap, offlineEffRate, addEp, // v3.2.4 反馈⑤：offlineEffRate 统一离线效率口径（含离线协议研究）
  tidePhaseInfo, tideMult, corruptionPenalty, purifierCleanRate, tickCorruption,
  cancelCollapse, purgeCostFor, purgeDmFor, addDm, // v2.9.0：吞噬自救 + 主动净化经济
  wageDebtMult, wageKeepCostMult, wageLoseChance, // v1.3 C：四态徽章展示用
  isLazy, lazyProdMult, lazyCostMult, // v2.7.1：线程懒惰态（EP 满上限惩罚）
  rpDistillRate, vehicleDmPerMin, vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, rpEffScale, // v2.7.4 ⑦：RP 蒸馏效率 // v3.2.2 ①：DM 探采快捷开关解锁判定 // v3.3.3 反馈③：RP 效率递增
  multBreakdown, addRp, addPt, rpCap, dmCap, ptCap, focusPerLevel, focusTotalBonus, unitCost, fmtRes } from './modules/economy.js'; // v2.8.22 ④：加成明细悬浮 + v2.8.30 专注曲线 // v3.4.1 ④：资源数值统一口径
// v2.0：特殊任务 + 彩蛋系统（从 events.js 提取，打破 main.js ↔ events.js 循环依赖）
import { checkEasterEggs, checkSpecialTasks } from './modules/progression.js';
// v2.5.4 ①：快照存档（最多 3 槽 / 覆盖当前本地游戏 / 二级确认）
import { saveSnapshot, coverOldest, listSnapshots, snapshotData, deleteSnapshot, SNAP_MAX, fmtStamp } from './modules/snapshots.js';
// v2.0：故事线管理器
import { getCurrentStoryline, loadStoryline, lockStorylineSwitch, getStorylinePackage } from './core/storylineManager.js';
import { tickProjects, claimProject, spawnProject, maxProjects, normalizeProjectGoals, setProjectLogFn } from './modules/projects.js';
import { tickReligion, renderReligionPanel, bindReligionPanel, canUnlockReligion, setReligionLogFn, setReligionToastFn, refreshReligionAffordability } from './modules/religions.js'; // v2.8.26 ④
import { renderPolicyPanel, bindPolicyPanel, setPolicyLogFn, setPolicyToastFn } from './modules/policies.js';
import { policyOpenGroups } from './data/policies.js';
import { tickDelve, renderDelvePanel, bindDelvePanel, canUnlockDelve, delveUnlocked, setDelveLogFn, setDelveToastFn } from './modules/delve.js';
import { tickBazaar, renderBazaarPanel, bindBazaarPanel, canUnlockBazaar, bazaarUnlocked, setBazaarLogFn, setBazaarToastFn } from './modules/bazaar.js'; // v3.0.0：深渊集市（大模块）
import { religionUnlocked, faithCap } from './data/religions.js'; // v3.4.9 反馈⑧：FP 上限进顶栏
import { renderShop, renderThreadShop, renderVehicles, renderDmShop, renderBuildings, renderV21Buildings, renderCrossroadBuildings, renderFamilyUpgrades, renderOfflineUpgrades, refreshShopAffordability, refreshShopItem, refreshV21Item, refreshShopChain, renderRpFamily, renderResearchUpgrades, renderAtriumDistill, renderAtriumSwitch, renderHatchUpgrade, setToastFn } from './modules/shop.js'; // v2.3.1 ⑥：setBulk/getBulk 移除；v2.8.2 ④：renderRpFamily（RP 加成组）
import { EXPAND_KEY, anchorShown, anchorDone } from './modules/disclosure.js'; // v2.3.1 缺陷④清档回收 + ①锚点判定（rev18 9.1/9.2）
import { rollProfession, aiSuggestedProfession, tickThreads, autoAssignThreads, leaderCount, bindThread, unbindThread, converterThreadBoost, threadLevelFromXp, converterEnabled, setConverterEnabled } from './modules/threadBinding.js'; // v3.3.0 线程绑定系统 // v3.3.1：转化器开关统一口径
// v3.0.0 测试性解耦：侧效工具（日志/toast/脏检查/确认框）下沉到 DOM 无关的 core 模块，
// 使 shop/expedition/reincarn/rift/tech 可在纯 Node 下单测，浏览器行为不变。
import { dirty, log, toast, askConfirm, registerConfirmHooks, bindConfirmButtons } from './core/runtime.js';
import { renderTech, refreshTechState, renderEternal } from './modules/tech.js';
import { tickWages, setWageLogFn, setWageToastFn } from './modules/wages.js'; // v1.3 C
import { renderCrewPanel, crewPush, crewShown } from './modules/crew.js'; // v3.1.0 反馈③：班组面板（线程拟人化） // v3.6.2 反馈①：≥10 线程解锁
import { tickVehicleCollect, setVehicleLogFn } from './modules/vehicles.js'; // v1.3 D
import { tickAI, renderAiPanel, setAiLogFn, setAiUiRefreshFn, aiUnlocked, aiHireFlag, autoBuildUnlocked, allResDiscovered, autoBuildActivateCost } from './modules/ai.js'; // v1.3 A // v3.2.4 反馈④：自动购建区块显隐/EP 充足态检测
import { renderRelics, buyRelic, buyPurifier, setRelicsLogFn, setRelicsToastFn, refreshRelicAffordability } from './modules/relics.js'; // v2.7.0：深渊遗物；v2.8.22 ⑥：净化节点；v2.8.26：DM 灰态每秒刷新
import { relicsUnlocked, RELICS, relicLevel } from './data/relics.js'; // v2.7.0：遗物入口门控；v3.3.7 反馈①：结构签名
import { renderPetGrid, renderPetFloat, gainPetExp, activePetIds, refreshPetsAffordability, petUpkeepTotalPerSec, petStarving } from './modules/pets.js'; // v2.8.26：PT 灰态每秒刷新 // v3.2.1 反馈⑨：出战维持 // v3.2.3 反馈⑥：休战过渡日志
import { renderPrestige, renderTalentModal, doPrestige, canPrestige } from './modules/prestige.js';
import { renderReincarn, doReincarn, reincarnReady } from './modules/reincarn.js'; // v2.7.3 ⑤：轮回（晋升面板底部）
import { isStageUnlocked } from './core/progressive.js';
import { checkGate, getAllGates } from './core/gates.js';
import { maybeTriggerEvent, peekNextEvent } from './modules/events.js';
import { applyOffline, renderOfflinePanel } from './modules/offline.js';
import { renderStoryBar, currentChapter } from './modules/story.js';
import { tickRift, renderRift, renderRiftPanel, refreshRiftAffordability, buyRiftUpgrade, abortRiftExpedition, discoverDm, riftEtaSec, riftNextSec, fmtEta, renderRiftLevelTech, riftUpgradeLevel, riftPurgeCostMult, riftThreadsReady } from './modules/rift.js'; // v3.3.9 反馈⑤：裂隙等级科技（科技树）// v3.4.9：自动净化/净化成本倍率 // v3.6.2 反馈②：线程解锁门槛
import { ensureAbyssGaze } from './modules/abyssGaze.js'; // v3.4.2：凝视深渊彩蛋——重载后常驻裂开
import { tickExpeditions, tickColonies, renderExpeditions, refreshExpeditionAffordability } from './modules/expedition.js'; // v3.0.5 反馈②：星图/宇宙可购态快刷
import { UPGRADES } from './data/upgrades.js';
import { CHAPTERS } from './data/chapters.js'; // v2.8.15：Wiki 章节讲解
import { WIKI_SECTIONS, wikiUnlocked } from './data/wiki.js'; // v2.9.0：体系化百科（KG 风格）
import { PETS } from './data/pets.js';
import { MOOD_MULT } from './data/threads.js';
import { BALANCE } from './data/balance.js';
import './style.css';

const app = document.getElementById('app');

// ========== 日志系统 / toast / 脏检查渲染 ==========
// 以上三者已下沉至 src/core/runtime.js（log / toast / dirty），浏览器中行为不变，
// 纯 Node 环境下为 DOM 安全实现，便于核心模块单测。

// ========== v2.0 故事线面板（v2.2 只读状态卡：走向由定向建筑购买决定，面板不再提供任何选择按钮） ==========
function renderStorylinePanel() {
  const el = document.getElementById('storyline-panel');
  if (!el) return;
  const current = getCurrentStoryline();
  const completed = S.storylinesCompleted || [];
  const crossById = (BALANCE.crossroadBuildings || []).find(b => b.id === S.crossroadLockedBy);
  // v3.3.1 反馈⑧：面板标题已在 index.html（#storyline-h3）——此处不再重复输出「故事线」行
  let html = '';
  // v2.3 顺延小修：线名中文映射（getCurrentStoryline 返回 id，直接展示对玩家不可读）
  const lineName = getStorylinePackage(current)?.name || current;
  // v3.2.1 反馈③：展示当前进度——已解锁剧情章节数（含顺次可见）占该线总章节数
  let progTxt = '';
  const curPkg = getStorylinePackage(current);
  const curChs = (curPkg && curPkg.data && curPkg.data.chapters && curPkg.data.chapters.append) || [];
  if (curChs.length > 0) {
    const seen = (S.chaptersUnlocked && S.chaptersUnlocked[current]) || [];
    let unlockedN = 0, prevOk2 = true;
    for (const ch of curChs) {
      let ok = false;
      try { ok = !!ch.cond(S); } catch (e) { /* 未解锁 */ }
      const chIdx = ch.id !== undefined ? parseInt(ch.id, 10) : curChs.indexOf(ch) + 1;
      if (seen.includes(chIdx) || prevOk2) ok = true;
      if (ok) unlockedN++;
      prevOk2 = ok;
    }
    progTxt = ` · 剧情进度 ${unlockedN}/${curChs.length} 章`;
  }
  html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">当前路线：<b style="color:var(--purple)">${lineName}</b>${progTxt}</div>`;
  if (crossById) {
    html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">立誓建筑：<b>${crossById.name}</b>（本轮锁定该命运线，转生后岔路口重新开放）</div>`;
  } else if (S.crossroad === 'open') {
    html += `<div style="color:var(--warn);font-size:11.5px;margin-bottom:8px">命运的岔路口已开放——在下方岔路口立誓锁定走向，或保持中立</div>`; // v3.2.1 反馈③：去除「不买不锁，可一路走到终章」占位说明
  } else if (S.crossroad === 'inactive') {
    html += `<div style="color:var(--text-3);font-size:11.5px;margin-bottom:8px">推进主线至第五章后，命运的岔路口将开放</div>`;
  }
  // 已完成的故事线（多周目解锁）
  if (completed.length > 0) {
    html += `<div style="margin-top:12px;color:var(--text-2);font-size:11px">已完成：${completed.map(id => getStorylinePackage(id)?.name || id).join('、')}</div>`;
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
      const chs = (pkg.data && pkg.data.chapters && pkg.data.chapters.append) || []; // v3.0.3 第六批⑥：修复路径——章节数据在 pkg.data.chapters 下（原 pkg.chapters 恒 undefined 致剧情从不渲染）
      if (chs.length > 0) {
        html += `<div class="codex-chs">`;
        // v2.8.5 A3：解锁判定 = 持久化已进入（chaptersUnlocked）优先，其次即时 cond（未写入前的兼容）
        const seenChs = (S.chaptersUnlocked && S.chaptersUnlocked[id]) || [];
        let prevOk = true; // v3.0.3 第三批⑥：故事线解锁的是剧情——前章解锁后本章顺次可见
        for (const ch of chs) {
          let ok = false;
          try { ok = !!ch.cond(S); } catch (e) { /* cond 内部异常按未解锁处理 */ }
          const chIdx = ch.id !== undefined ? parseInt(ch.id, 10) : chs.indexOf(ch) + 1;
          if (seenChs.includes(chIdx)) ok = true; // 历史已进入 → 永久点亮
          if (prevOk) ok = true; // 前一章可见 → 本章剧情顺次解锁（cond 节奏仍作用于后续）
          html += `<div class="codex-ch${ok ? ' on' : ' locked'}"><span class="codex-ch-name">${ok ? '✓' : '🔒'} ${ch.name}</span>`;
          if (ok && ch.desc) html += `<div class="codex-ch-desc">${ch.desc}</div>`;
          html += `</div>`;
          prevOk = ok;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  // v2.8.6 B2a：历史政策走向（跨周期记录，展示每次游戏周期的不同选择）
  const runs = S.policyRuns || [];
  if (runs.length > 0) {
    html += `<div style="margin-top:14px"><div style="color:var(--accent);font-size:11px;margin-bottom:6px">历史周期走向（政策选择）</div>`;
    for (let i = runs.length - 1; i >= 0; i--) {
      const run = runs[i];
      const lineName = run.storyline === 'line_abyss' ? '深渊线' : run.storyline === 'line_order' ? '秩序线' : run.storyline === 'line_faith' ? '信仰线' : '默认线';
      html += `<div class="codex-line" style="padding:4px 6px;margin-bottom:4px"><div class="codex-line-name" style="font-size:10.5px">周期 ${i + 1} · ${lineName}</div><div style="font-size:10.5px;color:var(--text-2)">${run.picks.join(' / ') || '（本轮未选政策）'}</div></div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
  // v2.7.5 ⑤：命运的岔路口移入故事线 tab（原在建筑区）——状态/立誓跟随故事线叙事
  // v3.2.4：岔路口卡改由 dirty.shop 周期渲染（render() 内已有调用点），此处仅状态切换/首空时重建，
  // 避免 2s 兜底刷新每帧重建立誓按钮（v2.7.5 ① 同款「慢速点击丢失」风险）
  const crEl = document.getElementById('crossroad-list');
  if (crEl && (crEl.childElementCount === 0 || lastCrRenderState !== S.crossroad)) {
    lastCrRenderState = S.crossroad;
    const crTitle = document.getElementById('crossroad-title');
    if (crTitle) crTitle.style.display = S.crossroad === 'inactive' ? 'none' : '';
    renderCrossroadBuildings(crEl);
  }
}
let lastCrRenderState = null; // v3.2.4：岔路口卡重建去重

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
  ensureWishWell(); // v2.8.30 ③：许愿池（购买研究升级后即时出现/移除）
  ensureFarewellGift(); // v2.9.2：离职礼盒（线程休眠/流失期间出现，1 EP 购买触发 sp3_farewell）
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
  // v2.7.4 ③：腐化峰值记录（跨本局保留；深渊之心按峰值判定，净化节点不抵消）
  if ((S.corruption || 0) > (S.corruptionPeak || 0)) { S.corruptionPeak = S.corruption; }
  if (dirty.shop) {
    const shopEl = document.getElementById('shop-list');
    if (shopEl) renderShop(shopEl);
    const threadEl = document.getElementById('thread-shop');
    if (threadEl) renderThreadShop(threadEl);
    const bldEl = document.getElementById('building-list'); // v1.3 B：设施分区
    if (bldEl) {
      renderBuildings(bldEl);
      // v3.3.1 反馈①②：灵感工坊 / 异兽孵化升级并入「设施」列表（只有购买与升级）
      renderAtriumDistill(bldEl);
      renderHatchUpgrade(bldEl);
      // 设施区标题：建筑未解锁但工坊卡已可见时仍需显示（原按建筑门控会空挂无标题的卡片）
      const bldT = document.getElementById('bld-title');
      if (bldT) bldT.style.display = bldEl.children.length > 0 ? '' : 'none';
    }
    const v21El = document.getElementById('v21-building-list'); // v2.1：效能建筑分区
    if (v21El) renderV21Buildings(v21El);
    // v2.7.5 ⑦：探采/深渊商店移入遗物 tab、岔路口移入故事线、族升级移入研究点——
    // 容器跨 tab 但渲染仍随 shop 周期执行（隐藏 tab 渲染无碍，保证全页 DOM 查询与门控标题一致）
    const vehEl2 = document.getElementById('vehicle-shop');
    if (vehEl2) renderVehicles(vehEl2);
    const dmEl2 = document.getElementById('dm-shop');
    if (dmEl2) renderDmShop(dmEl2);
    const crEl2 = document.getElementById('crossroad-list');
    if (crEl2) { renderCrossroadBuildings(crEl2); lastCrRenderState = S.crossroad; }
    const famEl2 = document.getElementById('family-upgrade-list');
    if (famEl2) renderFamilyUpgrades(famEl2);
    dirty.shop = false;
  }
  if (dirty.rp) {
    renderRpPanel();
    renderResearchUpgrades(document.getElementById('research-upgrade-list')); // v2.8.4 ④：研究升级（RP 购买长线）
    dirty.rp = false;
  } // v2.7.4 ⑦：RP 蒸馏后面板刷新
  if (dirty.tech) {
    const techEl = document.getElementById('tech-tree');
    if (techEl) renderTech(techEl);
    const eternalEl = document.getElementById('eternal-list');
    // v2.8.4 ③：ES 未解锁（首次晋升获得 ES 前）不渲染永恒矩阵——升级项不再早于资源显示
    // v2.8.7：标题一并隐藏（原仅清空列表，标题「永恒矩阵（ES 购买）· 当前 0 ES」仍显示）
    const eternalTitle = document.getElementById('eternal-title');
    if (eternalEl) {
      if (esDiscovered()) { renderEternal(eternalEl); if (eternalTitle) eternalTitle.style.display = ''; }
      else if (!eternalEl._esLocked) { eternalEl._esLocked = true; eternalEl.innerHTML = ''; if (eternalTitle) eternalTitle.style.display = 'none'; }
    }
    // v3.3.9 反馈⑤：科技树「裂隙等级」（EP + DM 无限升级）
    const riftTechEl = document.getElementById('rift-tech-list');
    if (riftTechEl) renderRiftLevelTech(riftTechEl);
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
    // v2.8.2 反馈⑫：1 级 1 条触手、2 级 2 条、3 级 3 条（CSS 默认只显示 tentacle-a）
    tentacleEl.classList.toggle('tentacle-2', fb >= 2);
    tentacleEl.classList.toggle('tentacle-3', fb >= 3);
  }
  if (dirty.prestige) {
    const preEl = document.getElementById('prestige-panel');
    if (preEl) {
      renderPrestige(preEl);
      renderReincarn(preEl); // v2.7.3 ⑤：轮回区块（晋升面板底部）
    }
    dirty.prestige = false;
  }
  // v2.7.4 ①：遗物面板独立于晋升刷新（周期 gate/DM 状态更新；原嵌在 prestige 块内会导致
  // dirty.relics 置位但 prestige 未脏时永不消费）
  if (dirty.relics) { renderRelics(document.getElementById('relics-panel')); dirty.relics = false; } // v2.7.0：深渊遗物
  if (dirty.projects) {
    renderProjects();
    dirty.projects = false;
  }
  if (dirty.story) {
    const storyEl = document.getElementById('chapter-bar');
    if (storyEl) renderStoryBar(storyEl);
    dirty.story = false;
  }
  // v3.2.4 反馈②：右列故事线/成就常驻面板——v3.2.1 三列布局后原 switchTab('storyline'/'achievement')
  // 渲染入口已不可达（按钮移除），面板从开档起恒空。现在走脏标记：开档渲染 + 每 2s 兜底 + 事件置位
  if (dirty.storyline) { renderStorylinePanel(); dirty.storyline = false; }
  if (dirty.achievements) { renderAchievementPanel(document.getElementById('achievement-panel')); dirty.achievements = false; }
  if (dirty.religion) { // v2.5.7：宗教面板
    const relEl = document.getElementById('religion-panel');
    if (relEl) renderReligionPanel(relEl);
    dirty.religion = false;
  }
  if (dirty.policy) { // v2.8.6 B2a：政策面板（开放组/选择状态实时刷新）
    const polEl = document.getElementById('policy-panel');
    if (polEl) renderPolicyPanel(polEl);
    dirty.policy = false;
  }
  if (dirty.delve) { // v2.6.0：深潜终局面板
    const dvEl = document.getElementById('delve-panel');
    if (dvEl) renderDelvePanel(dvEl);
    dirty.delve = false;
  }
  if (dirty.bazaar) { // v3.0.0：深渊集市面板
    const bzEl = document.getElementById('bazaar-panel');
    if (bzEl) renderBazaarPanel(bzEl);
    dirty.bazaar = false;
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
  ['faith', () => anchorDone('faith', S), '新资源：信仰（FP）'],
  ['pt',    () => anchorDone('pt', S),    '新资源：PT'],
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
  initWishWell(); // v2.8.30 ③：许愿池
  initFarewellGift(); // v2.9.2 ②：离职礼盒（休眠/流失期间出现）
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
  // v2.8.8：探采页头不再显示溢出转换文案（溢出仅记账，自动转 RP 已移除）
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
  const hDev = document.getElementById('h-devotion');
  const devStat = document.getElementById('devotion-stat');
  // v3.4.8 反馈③：顶部常显星图 CPS（星图解锁 / 有余额 / 燃料模式开启时亮出）
  const hStarCps = document.getElementById('h-starcps');
  const starCpsStat = document.getElementById('starcps-stat');
  if (hStarCps && starCpsStat) {
    const starOn = (S.starCps || 0) > 0 || !!S.fuelMode || (S.expeditionsDone || 0) > 0
      || (S.expeditions || []).length > 0 || hasTech('deep_space');
    starCpsStat.style.display = starOn ? '' : 'none';
    hStarCps.textContent = fmt(S.starCps || 0);
    hStarCps.style.color = S.fuelMode ? 'var(--good, #3fb950)' : '';
  }
  if (hDev && devStat) { // v2.8.30 ③：虔诚顶部展示（>0 才显示）
    devStat.style.display = (S.devotion || 0) > 0 ? '' : 'none';
    hDev.textContent = S.devotion || 0;
  }
  const hEmber = document.getElementById('h-ember');
  const emberStat = document.getElementById('ember-stat');
  if (hEmber && emberStat) { // v2.8.30 ③：裂隙余烬顶部展示（裂隙解锁后常显）
    emberStat.style.display = S._riftSeen ? '' : 'none';
    hEmber.textContent = Math.floor(S.riftEmber || 0); // v3.3.8 反馈②：整数显示，与购买判定同口径（原四舍五入会出现「显示 20 但买不了 20 的项」）
  }
  const hVs = document.getElementById('h-vs');
  const vsStat = document.getElementById('vs-stat');
  if (hVs && vsStat) { // v3.0.3 第六批⑤：虚空碎片顶部展示（深潜解锁后常显）
    vsStat.style.display = delveUnlocked() ? '' : 'none';
    hVs.textContent = fmt(S.vs || 0);
  }
  const hBuff = document.getElementById('h-buff');
  // v2.7.5 ⑧：顶部轮回次数 + 悬停弹框显示回响加成（全局 +5%/点）
  const hReincarn = document.getElementById('h-reincarn');
  const reincarnStat = document.getElementById('reincarn-stat');
  if (hReincarn && reincarnStat) {
    const n = S.reincarned || 0;
    const echo = S.abyssEcho || 0;
    reincarnStat.style.display = n > 0 ? '' : 'none';
    hReincarn.textContent = n;
    reincarnStat.title = `轮回 ${n} 次 · 深渊回响 ${echo} · 全局产出 +${(echo * 5).toFixed(0)}%（每点回响 +5%，跨轮回保留）`;
  }
  // v2.8.4 ②：湮灭残片（崩溃转生 +1，>0 才显示）
  const hSpl = document.getElementById('h-splinter');
  const splStat = document.getElementById('splinter-stat');
  if (hSpl && splStat) {
    splStat.style.display = (S.abyssSplinter || 0) > 0 ? '' : 'none';
    hSpl.textContent = S.abyssSplinter || 0;
  }
  if (hEp) hEp.textContent = `${fmt(S.ep)} / ${fmt(epStorageCap())}`; // v2.1 P1：EP 常显「当前/上限」
  if (hCps) hCps.textContent = fmt(cps) + '/s';
  // v2.8.22 ④：来源悬浮气泡（只留自定义 CSS 气泡，移除原生 title —— 双弹窗）；气泡含来源 + 加成明细
  if (hCps) {
    const st = hCps.closest('.stat');
    if (st) { const focusTag = S.focusLevel > 0 ? `专注 +${Math.round(focusTotalBonus(S.focusLevel) * 100)}%` : ''; st.dataset.tip = `产出来源：${cpsBreakdown().join(' · ') || '无'}${multBreakdown().length ? '｜加成：' + multBreakdown().join(' · ') : ''}${focusTag ? '｜' + focusTag : ''}`; } // v2.8.30 ⑥：专注总加成并入产出悬浮（按分段曲线累加）
  }
  if (hSalary) {
    hSalary.textContent = fmt(totalDrainPerSec()) + '/s';
    const st2 = hSalary.closest('.stat');
    // v3.3.1 反馈⑪：消耗按实际扣减口径展示（休眠只扣保命成本、探采 EP 不足跳过、圣所关闭不扣）
    const wSt = (S.wageState || {}).state;
    const wageNote = (wSt === 'dormant' || wSt === 'losing') ? `（休眠期仅扣保命成本 ×${wageKeepCostMult()}）` : '';
    if (st2) st2.dataset.tip = `消耗来源：${drainBreakdown().join(' · ') || '无'}${wageNote}${multBreakdown().length ? '｜加成：' + multBreakdown().join(' · ') : ''}`;
  }
  if (hRun) hRun.textContent = fmt(S.runEarned);
  if (hRank) hRank.textContent = S.prestigePoints;
  if (hRp) hRp.textContent = fmt(S.rp) + ' / ' + fmt(rpCap()); // v2.8.27 ②：RP 存储上限（矩阵存储库扩容）
  if (hEs) hEs.textContent = fmt(S.es);
  // v3.4.9 反馈⑧：FP 有上限就必须显示上限（此前只有数值，玩家以为「卡住不涨」）
  if (hFaith) hFaith.textContent = `${(S.faith || 0).toFixed(2)} / ${faithCap()}`; // v2.6.4 ③：信仰精确 2 位小数
  // v3.4.1 反馈④：PT/DM 两侧统一走 fmtRes（<1000 两位小数，≥1000 k/M）——不再出现「2000.00 / 2.00k」
  if (hPt) hPt.textContent = fmtRes(S.pt || 0) + ' / ' + fmtRes(ptCap()); // v2.8.27 ②：PT 存储上限（饵料仓库扩容）
  if (hDm) hDm.textContent = fmtRes(S.dm || 0) + ' / ' + fmtRes(dmCap()); // v2.8.27 ②：DM 存储上限（星尘金库扩容）
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
// v3.4.9 反馈⑨：深渊吞噬横幅独立同步——原实现挂在本函数末尾，
//   而「贿赂深渊」会把腐化清零并触发上面的早退（c<=0.01 → return），
//   横幅因此永远停在「请做出命运抉择」；抽成独立函数后两条分支都会刷新。
function renderAbyssCollapseBanner() {
  const bn = document.getElementById('abyss-collapse');
  if (!bn) return;
  if (S.collapsed || S._collapseChoicePending) {
    bn.style.display = '';
    bn.className = 'abyss-banner-danger';
    bn.innerHTML = `🌑 <b>深渊吞噬</b>：深渊将你拖入矩阵之底——请做出命运抉择（转生不可脱离）。`;
    return;
  }
  const remain = collapseRemainMs();
  if (remain !== null) {
    const mm = Math.floor(remain / 60000), ss = Math.floor((remain % 60000) / 1000);
    bn.style.display = '';
    bn.className = 'abyss-banner-warn';
    bn.innerHTML = `⚠️ <b>深渊吞噬倒计时</b>：已被深渊腐化，崩溃倒计时 <b>${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}</b>。<span style="opacity:.85">主动净化（消耗 EP）压至满额以下可自救；转生不可脱离深渊。</span>`;
  } else {
    bn.style.display = 'none';
    bn.innerHTML = '';
  }
}

function renderCorruption() {
  const el = document.getElementById('corruption-bar');
  if (!el) return;
  const c = Math.max(0, Math.min(100, S.corruption || 0));
  renderAbyssCollapseBanner();
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
  // v2.8.3：深渊吞噬横幅（v3.4.9 ⑨：刷新逻辑已抽到 renderAbyssCollapseBanner，函数开头统一调用）
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
  // v2.8.10：每秒薪资总额已由顶部「消耗/s」显示（hero 重复行删除）
  // v2.6.4 ②：深入裂隙状态置顶显示
  const expStatus = document.getElementById('rift-exp-status');
  if (expStatus) {
    const ex = S.riftExpedition;
    const riftCard = document.getElementById('rift-card'); // v3.3.8 反馈③：HUD 已移入裂隙卡，深入时确保卡片可见
    if (ex && riftCard) riftCard.style.display = '';
    if (ex) {
      const left = Math.max(0, Math.ceil((ex.until - Date.now()) / 1000));
      expStatus.style.display = '';
      expStatus.className = 'rift-exp-hero';
      if (S.paused) {
        // v2.8.14：暂停时探索计时冻结，不显示实时倒计时
        expStatus.textContent = `🌌 深入裂隙 Lv.${ex.level} · 已暂停（探索计时冻结） · 已获 DM ${ex.gainedDm.toFixed(1)} · 腐化 ${S.corruption.toFixed(1)}%`;
      } else {
        expStatus.textContent = `🌌 深入裂隙 Lv.${ex.level} · 剩余 ${left}s · 已获 DM ${ex.gainedDm.toFixed(1)} · 腐化 ${S.corruption.toFixed(1)}%`;
      }
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
  // v2.8.10：招募行只展示「下一线程」增量（总产出/消耗移出 hero——顶栏已有，避免重复显示）
  const staffPrevEl = document.getElementById('staff-preview');
  if (staffPrevEl) {
    const n = S.cultists.length;
    const base = BALANCE.thread.baseOutput, jit = BALANCE.thread.baseOutputJitter;
    const perCap = BALANCE.thread.salaryPerThreadCap || Infinity;
    const curOut = staffOutputPerSec();
    const avgOut = n > 0 ? curOut / n : (base + jit / 2); // 实际单线程产出（mood/加成一致口径）
    const nextSalary = Math.min(0.5 * Math.pow(BALANCE.thread.salaryBase, n), perCap);
    staffPrevEl.textContent = `下一线程：产出 +${avgOut.toFixed(1)}/s · 消耗 +${nextSalary.toFixed(2)}/s · 需 ${fmt(staffCost())} EP`;
    staffPrevEl.style.color = S.ep < staffCost() ? 'var(--warn,#c8a24a)' : 'var(--text-2)';
  }
  if (hireBtn) {
    hireBtn.disabled = S.ep < staffCost();
    hireBtn.style.opacity = S.ep < staffCost() ? '0.5' : '1';
  }
  if (focusLv) { const nxt = Math.round(focusPerLevel(S.focusLevel + 1) * 100); focusLv.textContent = `专注等级：Lv.${S.focusLevel} · 下一级 +${nxt}%`; focusLv.style.color = S.focusLevel > 0 ? 'var(--good)' : 'var(--text-2)'; focusLv.style.fontWeight = S.focusLevel > 0 ? 'bold' : 'normal'; } // v2.8.30：等级旁显示下一级加成（加成从少到多，达上限后固定）
  if (focusCostEl) focusCostEl.textContent = fmt(focusCost());
  // v2.8.17 ⑦：专注不再提示点击、不靠悬浮 title——EP 不足仅暗色
  const focusBarEl = document.getElementById('focus-bar');
  if (focusBarEl) focusBarEl.classList.toggle('cant', !(S.ep >= focusCost()));
  // v2.0 腐化条（与 renderCorruption 同源，双渲染点保持与发布版一致）
  const cbar = document.getElementById('corruption-bar');
  if (cbar) {
    if ((S.corruption || 0) > 0.01 || S.riftExpedition) { // v2.8.30：深入探索中腐化条恒显（含紧急脱出按钮）
      cbar.style.display = '';
      const rc = document.getElementById('rift-card'); // v3.3.8 反馈③：腐化条在裂隙卡内，确保卡片可见
      if (rc) rc.style.display = '';
      const fill = document.getElementById('corruption-fill');
      const num = document.getElementById('corruption-num');
      const pen = document.getElementById('corruption-pen');
      if (fill) fill.style.width = S.corruption.toFixed(1) + '%';
      if (num) num.textContent = S.corruption.toFixed(1) + '%';
      if (pen) pen.textContent = `-${Math.round((1 - corruptionPenalty()) * 100)}%`;
      const ab = document.getElementById('abort-rift-ex');
      if (ab) ab.style.display = S.riftExpedition ? '' : 'none';
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
      hint.textContent = `EP 已达上限 (${fmt(cap)})，溢出转入 RP 溢出池（5% 转化）`; // v2.8.21 ⑥：EP 上限后不再产生腐化
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
// v2.8.6 B2a：政策开放组哈希（变化时刷新面板与按钮）
let _policyOpenHash = '';
function policyTickRefresh() {
  const h = policyOpenGroups().map(g => g.id).sort().join(',');
  if (h !== _policyOpenHash) {
    _policyOpenHash = h;
    dirty.policy = true;
    refreshTabVisibility();
  }
}
function switchTab(id) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('on'));
  document.querySelectorAll('.tabs button').forEach(el => el.classList.remove('on'));
  const pane = document.getElementById('tab-' + id);
  const btn = document.getElementById('btn-' + id);
  if (pane) pane.classList.add('on');
  if (btn) btn.classList.add('on');
  if (id === 'shop') dirty.shop = true;
  if (id === 'tech') dirty.tech = true;
  if (id === 'rp') { renderRpPanel(); renderResearchUpgrades(document.getElementById('research-upgrade-list')); renderRpFamily(document.getElementById('rp-upgrade-list')); renderFamilyUpgrades(document.getElementById('family-upgrade-list')); } // v3.3.1 反馈①：灵感工坊开关并入研究点页 // v2.5 ④ + v2.8.4 ④：研究升级：研究点独立栏目 + v2.7.5 ④：族升级并入 + v2.8.2 ④：RP 加成组并入
  if (id === 'relics') {
    renderVehicles(document.getElementById('vehicle-shop'));
    renderDmShop(document.getElementById('dm-shop'));
  } // v2.7.5 ⑦：探采平台与深渊商店并入遗物 tab（DM 资源系统合一）
  if (id === 'pets') dirty.pets = true;
  if (id === 'prestige') dirty.prestige = true;
  if (id === 'achievement') renderAchievementPanel(document.getElementById('achievement-panel'));
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
  if (id === 'policy') {
    const polPanel = document.getElementById('policy-panel');
    if (polPanel) renderPolicyPanel(polPanel);
  }
  if (id === 'delve') {
    const dvPanel = document.getElementById('delve-panel');
    if (dvPanel) renderDelvePanel(dvPanel);
  }
  if (id === 'rift-tab') {
    const rtPanel = document.getElementById('rift-tab-panel');
    if (rtPanel) renderRiftPanel(rtPanel);
  }
  if (id === 'bazaar') { // v3.0.0：深渊集市
    const bzPanel = document.getElementById('bazaar-panel');
    if (bzPanel) renderBazaarPanel(bzPanel);
  }
}

// v3.3.3 反馈⑨：未开放大模块不再隐藏——以「??？」锁定态常驻展示（可发现性），点击提示解锁路径
const TAB_LABELS = { 'btn-expedition': '星图', 'btn-relics': '遗物', 'btn-religion': '宗教', 'btn-policy': '政策', 'btn-delve': '深潜', 'btn-rift-tab': '裂隙', 'btn-bazaar': '集市' };
const TAB_LOCK_HINTS = {
  'btn-expedition': '星图未解锁：完成首次远征准备（或研究科技「深空探测」）后开放',
  'btn-relics': '遗物未解锁：触发首次深渊裂隙并发现 DM 后开放',
  'btn-religion': '宗教未解锁：存储扩建 ≥3 级后可唤醒信仰',
  'btn-policy': '政策未解锁：达成对应政策开放条件后出现',
  'btn-delve': '深潜未解锁：ES≥3 + DM 已发现 + 宗教已信奉',
  'btn-rift-tab': '裂隙未解锁：班组 ≥15 条线程后开放',
  'btn-bazaar': '集市未解锁：达成集市开启条件后开放',
};
function setTabLocked(btn, locked) {
  if (!btn) return;
  const base = TAB_LABELS[btn.id] || btn.textContent;
  if (locked) {
    if (btn.dataset.locked !== '1') {
      btn.dataset.locked = '1';
      btn.textContent = '???';
      btn.title = '🔒 ' + (TAB_LOCK_HINTS[btn.id] || '尚未解锁');
      btn.classList.add('tab-locked');
    }
    btn.style.display = '';
  } else {
    if (btn.dataset.locked === '1') {
      btn.dataset.locked = '';
      btn.textContent = base;
      btn.removeAttribute('title');
      btn.classList.remove('tab-locked');
    }
    btn.style.display = '';
  }
}
function refreshTabVisibility() {
  // v2.8.7：研究点 tab 仅 RP 解锁后显示（保持可探索性，未解锁不展示入口）
  // v3.0.9 反馈②：解锁口径收紧为「购入矩阵存储库」（anchorShown('rp')）——溢出只开放仓库购买入口，
  // 不再显示研究点 tab（未购仓库时的「未解锁」提示页与溢出引导文案一并移除）
  const rpBtn = document.getElementById('btn-rp');
  if (rpBtn) rpBtn.style.display = anchorShown('rp', S) ? '' : 'none';
  // 星图：探索过或正在探索才显示（对齐原版 unlock 条件）——v3.3.3 反馈⑨：未解锁改「??？」锁定态
  // v3.4.0 反馈⑤：科技树「深空探测」本身即解锁星图（深空殖民/第二路探索都在星图内），
  // 此前只认 expeditionsDone/expeditions，玩家买完科技仍看到「???」，以为解锁没生效
  setTabLocked(document.getElementById('btn-expedition'), !(S.expeditionsDone > 0 || S.expeditions.length > 0 || hasTech('deep_space')));
  // v2.5.7 宗教：解锁条件（仓库≥1 且库存达标）达成才开放
  // v2.6.2：首次达标后持久显示（_religionHintSeen，跨转生保留），面板内表达未解锁状态——避免 EP 波动/存储上限升级导致入口抖动消失
  if (canUnlockReligion()) { S._religionHintSeen = true; }
  setTabLocked(document.getElementById('btn-religion'), !(religionUnlocked() || canUnlockReligion() || S._religionHintSeen));
  // v2.6.0 深潜：ES≥3 + DM 发现 + 宗教已信奉才开放
  setTabLocked(document.getElementById('btn-delve'), !(delveUnlocked() || canUnlockDelve()));
  // v2.6.1 裂隙：首次触发裂隙（或已封印/深入）后开放
  const riftBtn = document.getElementById('btn-rift-tab');
  setTabLocked(riftBtn, !(S._riftSeen || (S.riftsSealed || 0) > 0));
  // v3.3.5 反馈③：未解锁时悬浮提示给出「还有多久首次出现」，让裂隙触发不再是黑箱
  // v3.6.2 反馈②：解锁门槛改为线程数——不足 15 条时提示门槛与当前进度，达标后才显示倒计时
  if (riftBtn && riftBtn.dataset.locked === '1') {
    if (!riftThreadsReady()) {
      const n = (S.cultists || []).length, need = (BALANCE.rift && BALANCE.rift.threadUnlock) || 15;
      riftBtn.title = `🔒 裂隙未解锁：班组需 ${need} 条线程（当前 ${n}）`;
    } else {
      riftBtn.title = `🔒 裂隙未解锁：约 ${fmtEta(riftEtaSec())} 后首次出现（后台挂机同样计时）`;
    }
  }
  // v2.7.0：深渊遗物——裂隙触发 ∧ DM 已发现（与探采平台/深渊商店同门控链）
  setTabLocked(document.getElementById('btn-relics'), !relicsUnlocked());
  // v2.8.6 B2a：政策——有开放政策组才开放
  setTabLocked(document.getElementById('btn-policy'), !(policyOpenGroups().length > 0));
  // v3.0.0：深渊集市——解锁或可解锁时开放
  setTabLocked(document.getElementById('btn-bazaar'), !(bazaarUnlocked() || canUnlockBazaar()));
}

// ========== v3.2.2 反馈①：自动转化快捷开关（任务版上方） ==========
// RP 蒸馏（灵感工坊）/ DM 探采（载具）/ PT 孵化（异兽）——解锁后各出现一枚快捷开关，
// 与原位置开关读写同一状态字段（atriumOn / _probeEnabled / ptDistillOn），功能完全一致；
// EP 不足时各系统自动暂停消耗，回升后自动恢复（v3.2.2：去除「需手动恢复」的自动关闭）
const QS_STYLE_ON = 'padding:4px 14px;font-size:11.5px;background:var(--good,#3fb950);color:#fff;border:none;border-radius:4px;cursor:pointer';
const QS_STYLE_OFF = 'padding:4px 14px;font-size:11.5px;background:var(--red,#f85149);color:#fff;border:none;border-radius:4px;cursor:pointer';
const QS_STYLE_LOCK = 'padding:4px 14px;font-size:11.5px;background:rgba(120,130,145,.16);color:var(--text-3,#6e7681);border:1px dashed var(--border);border-radius:4px;cursor:not-allowed;opacity:.75';
function renderQuickSwitches() {
  const panel = document.getElementById('quick-switches-panel');
  const host = document.getElementById('quick-switches');
  if (!panel || !host) return;
  // v3.3.1 反馈④：常驻展示开关，未解锁的灰显（不再整块隐藏）
  // v3.3.3 反馈⑦：扩为四枚——蒸馏 / 探采 / 孵化 / 圣所（孵化、圣所接入线程绑定统一口径）
  const atriumOk = (S.upgrades.atrium || 0) >= 1;
  const vehCount = (BALANCE.vehicles.ids || []).reduce((a, id) => a + (S.upgrades[id] || 0), 0);
  const probeOk = vehCount > 0;
  const hatchOk = S.ptAutoHatch === true;
  const templeOk = ((S.religion && S.religion.temple) || 0) >= 1;
  const items = [];
  if (atriumOk) {
    const on = converterEnabled('atrium');
    items.push(`<button data-qs="atrium" title="灵感工坊自动蒸馏：EP → RP（与「研究点」页开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">蒸馏 ${on ? '开' : '关'}</button>`);
  } else {
    items.push(`<button data-qs="-1" data-qs-lock="atrium" style="${QS_STYLE_LOCK}" title="未解锁：在「升级商店 · 设施」购入灵感工坊后可用">蒸馏 未解锁</button>`);
  }
  if (probeOk) {
    const on = converterEnabled('vehicles');
    items.push(`<button data-qs="probe" title="载具探采：EP → DM（与「遗物」页探采开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">探采 ${on ? '开' : '关'}</button>`);
  } else {
    items.push(`<button data-qs="-1" data-qs-lock="probe" style="${QS_STYLE_LOCK}" title="未解锁：在「遗物 · 探采平台」购入任一载具后可用">探采 未解锁</button>`);
  }
  if (hatchOk) {
    const on = converterEnabled('hatch');
    items.push(`<button data-qs="hatch" title="异兽孵化：EP → PT（与「异兽」页开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">孵化 ${on ? '开' : '关'}</button>`);
  } else {
    items.push(`<button data-qs="-1" data-qs-lock="hatch" style="${QS_STYLE_LOCK}" title="未解锁：在「升级商店 · 设施」购入异兽孵化工坊后可用">孵化 未解锁</button>`);
  }
  if (templeOk) {
    const on = converterEnabled('temple');
    items.push(`<button data-qs="temple" title="信仰圣所：EP → FP（与「宗教」页开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">圣所 ${on ? '开' : '关'}</button>`);
  } else {
    items.push(`<button data-qs="-1" data-qs-lock="temple" style="${QS_STYLE_LOCK}" title="未解锁：信奉宗教后建造「信仰圣所」可用">圣所 未解锁</button>`);
  }
  // v3.4.9 反馈①：无限深入开关从裂隙科技树移到此处（与其余自动转化开关同一入口）
  const descentOk = riftUpgradeLevel('auto_descent') >= 1;
  if (descentOk) {
    const on = S.riftAuto === 'auto_descent';
    items.push(`<button data-qs="descent" title="无限深入：裂隙出现时自动深入探索（消耗 EP，腐化超阈值会损失）与「自动封印/自动拥抱」互斥" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">深入 ${on ? '开' : '关'}</button>`);
  } else {
    items.push(`<button data-qs="-1" data-qs-lock="descent" style="${QS_STYLE_LOCK}" title="未解锁：裂隙科技树购入「无限深入」（200 余烬）后可用">深入 未解锁</button>`);
  }
  // v3.4.9 反馈②：自动净化（腐化每涨 5% 自动净化 5%，消耗 EP；需先买「无限深入」）
  const purifyOk = riftUpgradeLevel('auto_purify') >= 1;
  if (purifyOk) {
    const on = !!S.autoPurify;
    items.push(`<button data-qs="purify" title="自动净化：腐化每涨 5% 自动净化 5%（消耗 EP，EP 不足时暂停）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">净化 ${on ? '开' : '关'}</button>`);
  } else {
    items.push(`<button data-qs="-1" data-qs-lock="purify" style="${QS_STYLE_LOCK}" title="未解锁：裂隙科技树购入「自动净化仪」（1200 余烬，需先有无限深入）后可用">净化 未解锁</button>`);
  }
  panel.style.display = '';
  const sig = items.join('|');
  if (host._qsSig === sig) return;
  host._qsSig = sig;
  host.innerHTML = items.join('');
}
function bindQuickSwitches() {
  const host = document.getElementById('quick-switches');
  if (!host || host._qsBound) return;
  host._qsBound = true;
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qs]');
    if (!b) return;
    const k = b.dataset.qs;
    if (k === '-1') { // 灰显态：给出解锁指引，不改变任何状态
      const lock = b.dataset.qsLock;
      const hint = { atrium: '灵感工坊未解锁：升级商店 · 设施 → 灵感工坊', probe: '探采未解锁：遗物 → 探采平台（先购入载具）', hatch: '孵化未解锁：升级商店 · 设施 → 异兽孵化工坊', temple: '圣所未解锁：信奉宗教后建造「信仰圣所」', descent: '无限深入未解锁：裂隙科技树（余烬 200）', purify: '自动净化仪未解锁：裂隙科技树（余烬 1200，需先有无限深入）' };
      if (toast) toast(`🔒 ${hint[lock] || '尚未解锁'}`);
      return;
    }
    if (k === 'atrium') setConverterEnabled('atrium', !converterEnabled('atrium'));
    else if (k === 'probe') setConverterEnabled('vehicles', !converterEnabled('vehicles'));
    else if (k === 'hatch') setConverterEnabled('hatch', !converterEnabled('hatch'));
    else if (k === 'temple') setConverterEnabled('temple', !converterEnabled('temple'));
    // v3.4.9 反馈①：无限深入（与自动封印/自动拥抱互斥——同一 riftAuto 字段）
    else if (k === 'descent') {
      const on = S.riftAuto === 'auto_descent';
      S.riftAuto = on ? null : 'auto_descent';
      log(`快捷开关：无限深入${on ? '关闭' : '开启（裂隙出现即自动深入，消耗 EP 换 DM/余烬）'}`, on ? 'bad' : 'good');
    }
    // v3.4.9 反馈②：自动净化
    else if (k === 'purify') {
      S.autoPurify = !S.autoPurify;
      log(`快捷开关：自动净化${S.autoPurify ? '开启（腐化每涨 5% 自动净化 5%，消耗 EP）' : '关闭'}`, S.autoPurify ? 'good' : 'bad');
    }
    save(S); // 状态即时落盘（与原位置开关同口径）
    dirty.shop = true; dirty.top = true; dirty.rp = true; dirty.pets = true; dirty.religion = true; dirty.rift = true; // 原位置开关卡随渲染周期同步
    renderQuickSwitches();
    if (k === 'descent' || k === 'purify') return; // 上面已单独打日志（不走下方的转化器文案）
    const labels = { atrium: '灵感蒸馏', probe: '载具探采', hatch: '异兽孵化', temple: '圣所产出' };
    const nowOn = converterEnabled(k);
    log(`快捷开关：${labels[k]}${nowOn ? '开启（按秒结算消耗，EP 归零后自动暂停）' : '关闭'}`, nowOn ? 'good' : 'bad');
  });
}

// v2.5 ④：研究点（RP）独立栏目——v3.0.9 反馈②：解锁唯一入口 = 购入「矩阵存储库」；
// tab 未解锁时入口整体隐藏，原「EP 已溢出存储上限…」引导文案随 v3.0.9 反馈① 移除
function renderRpPanel() {
  const panel = document.getElementById('rp-panel');
  if (!panel) return;
  if (!anchorShown('rp', S)) { panel.innerHTML = ''; return; } // 兜底：入口已隐藏，正常不会走到这里
  panel.innerHTML = `<div class="panel" style="padding:14px">
    <h3 style="margin-top:0">🔬 研究点（RP） <span id="rp-info-i" title="RP 获取：灵感蒸馏塔主动转化（消耗 25% 当前 EP）、灵感工坊自动蒸馏、任务奖励。RP 用途：科技树、研究升级、RP 加成、离线升级与族升级。" style="cursor:pointer;font-size:11px;color:var(--text-3)">ⓘ</span></h3>
    <div class="stat"><b>当前 RP</b><span class="mono" style="color:var(--cyan)">${fmt(S.rp)} / ${fmt(rpCap())}</span></div>
    <div class="stat"><b>蒸馏效率</b><span>${fmt(rpDistillRate())} EP → 1 RP</span></div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <button class="btn rp-distill-btn" id="rp-distill-btn" style="padding:2px 8px;font-size:11px" ${((S.ep || 0) < rpDistillRate() || (S.rp || 0) >= rpCap()) ? 'disabled' : ''} title="蒸馏当前 EP 的 25%（不足 1 RP 时按最低 1 RP 额消耗），按蒸馏效率转化为 RP">蒸馏 25% EP</button>
      <span style="font-size:11px;color:var(--text-2)" id="rp-distill-preview">预计 ${S.ep > 0 ? fmt(Math.floor(Math.max(Math.floor((S.ep || 0) * 0.25), rpDistillRate()) / rpDistillRate())) : 0} RP</span>
    </div>
    <!-- v3.3.1 反馈①：灵感工坊自动蒸馏开关（设施区只保留购买/升级） -->
    <div id="atrium-switch-host" style="margin-top:10px"></div>
  </div>`; // v2.8.7：解释入问号 ⓘ、蒸馏按钮减小 // v3.3.1：工坊开关移入本页
  renderAtriumSwitch(document.getElementById('atrium-switch-host'));
  // v2.8.28 修复：ⓘ 点击弹窗说明（与线程状态说明同款交互——原生 title 悬停在部分环境无响应）
  panel.querySelector('#rp-info-i')?.addEventListener('click', () => {
    askConfirm('研究点（RP）说明',
      '获取方式：\n· 灵感蒸馏塔：消耗当前 EP 的 25%，按蒸馏效率转化为 RP（默认 30000 EP → 1 RP）\n· 灵感工坊：自动蒸馏（每秒消耗 EP 转化 RP）\n· 任务奖励：RP 解锁后任务可能奖励 RP\n\n用途：\n· 科技树：开辟新玩法\n· 研究升级 / RP 加成 / 离线升级 / 族升级：强化已有内容\n\n上限：基础 2,500，矩阵存储库首级 +400、之后每级 ×1.15 递增（EP 购买），达到上限后停止积累。', () => {});
  });
}

// v2.0：渐进开放标签页锁定状态更新
function updateTabLocks() {
  const locks = [
    { id: 'btn-tech', stage: 'P1', label: '科技树' },
    { id: 'btn-pets', stage: 'P2', label: '异兽' },
    { id: 'btn-prestige', stage: 'P3', label: '晋升' },
    // v3.3.9 反馈④：星图不再走阶段门控——改由 refreshTabVisibility 的 setTabLocked 统一接管
    // （两处同时写 textContent/title，原实现会把「???」覆盖回「星图」并清空 title，点击只弹「🔒 尚未解锁」）
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
    // v3.0.4 反馈②：异兽回归 P2 章节门控（chapter≥3）——此前 petsPt 恒 true 导致开局即解锁
    const unlocked = isStageUnlocked(stage, S) && (!anchorKey || anchorShown(anchorKey, S));
    if (!unlocked) {
      if (btn.dataset.locked === '1') continue; // v3.3.9 反馈④：已由 setTabLocked 接管（保留「???」与解锁提示）
      btn.classList.add('tab-locked');
      btn.textContent = '🔒 ???';
      btn.title = anchorKey && isStageUnlocked(stage, S) && !anchorShown(anchorKey, S)
        ? `${label} 将在解锁对应资源后开放`
        : `${label} 将在 ${stage} 阶段解锁`;
      btn.disabled = true;
    } else {
      if (btn.dataset.locked === '1') continue; // v3.3.9 反馈④：锁定态由 setTabLocked 管，勿覆盖其文案
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

// ========== v2.8.30 ③：许愿池（研究升级解锁，右侧浮动投币） ==========
// v2.9.0：视觉重做——内联 SVG 许愿井（亭顶/石圈/发光井水）+ 投币落井、涟漪扩散、中奖金光动效
// （纯 SVG + CSS keyframes，无外部图片依赖，任何环境均可渲染）
let wishCoolUntil = 0;
const WISH_COST = 100, WISH_CHANCE = 0.0001, WISH_REWARD = 100000;
const WISH_WELL_SVG = `<svg class="wish-svg" viewBox="0 0 120 132" width="96" height="106" aria-hidden="true">
  <defs>
    <radialGradient id="wish-water-g" cx="50%" cy="42%" r="65%">
      <stop offset="0%" stop-color="#7ef3e2"/><stop offset="45%" stop-color="#2aa8b8"/><stop offset="100%" stop-color="#0b2a33"/>
    </radialGradient>
    <linearGradient id="wish-roof-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d1d6e"/><stop offset="100%" stop-color="#1b0733"/>
    </linearGradient>
  </defs>
  <path d="M22 44 L60 20 L98 44 Z" fill="url(#wish-roof-g)" stroke="#4dd0e1" stroke-width="1.2" opacity="0.95"/>
  <line x1="30" y1="44" x2="30" y2="96" stroke="#3a4150" stroke-width="4"/>
  <line x1="90" y1="44" x2="90" y2="96" stroke="#3a4150" stroke-width="4"/>
  <line x1="60" y1="44" x2="60" y2="58" stroke="#565f6e" stroke-width="1.6"/>
  <rect x="55" y="58" width="10" height="8" rx="2" fill="#4a3b22" stroke="#c8a24a" stroke-width="1"/>
  <path d="M16 96 C16 86 104 86 104 96 L100 116 C100 124 20 124 20 116 Z" fill="#1c2128" stroke="#3a4150" stroke-width="2"/>
  <ellipse cx="60" cy="96" rx="44" ry="12" fill="#10151c" stroke="#3a4150" stroke-width="2"/>
  <ellipse class="wish-water" cx="60" cy="96" rx="34" ry="8.5" fill="url(#wish-water-g)"/>
  <ellipse class="wish-ripple" cx="60" cy="96" rx="34" ry="8.5" fill="none" stroke="#7ef3e2" stroke-width="1.5"/>
  <ellipse class="wish-ripple wish-ripple-2" cx="60" cy="96" rx="34" ry="8.5" fill="none" stroke="#a371f7" stroke-width="1.2"/>
</svg>
<span class="wish-coin"></span>
<span class="wish-label">许愿池</span>`;
function ensureWishWell() {
  let w = document.getElementById('wish-well');
  // v3.0.3：许愿池从研究升级移入通用设施——检查 S.buildings.wish_well（兼容旧档 S.rpTheories.wish_well）
  const owned = ((S.buildings && S.buildings.wish_well) || (S.rpTheories && S.rpTheories.wish_well) || 0) > 0;
  if (!owned) { if (w) w.remove(); return; }
  if (!w) {
    w = document.createElement('button');
    w.id = 'wish-well';
    w.className = 'wish-well';
    w.title = '许愿池：投一枚硬币（100 EP）——万一呢？'; // v3.2.3 反馈②：悬浮文案同步精简
    w.innerHTML = WISH_WELL_SVG;
    w.addEventListener('click', onWishToss);
    document.body.appendChild(w);
  }
  w.style.display = '';
}
function onWishToss() {
  const w = document.getElementById('wish-well');
  if (!w || w.disabled) return;
  const now = Date.now();
  if (now < wishCoolUntil) { toast('投币动画进行中，稍等片刻…'); return; }
  if ((S.ep || 0) < WISH_COST) { toast(`EP 不足（需 ${WISH_COST} EP）`); return; }
  S.ep -= WISH_COST;
  S.wishCoins = (S.wishCoins || 0) + 1; // v3.0.3 第二批①：许愿池投币计数（成就）
  wishCoolUntil = now + 3000;
  w.disabled = true;
  w.classList.add('tossing');
  save(S); dirty.top = true;
  // 硬币落井（1.1s 动效）后开奖，涟漪随之扩散
  setTimeout(() => {
    const win = Math.random() < WISH_CHANCE;
    w.classList.remove('tossing');
    w.classList.add(win ? 'win' : 'splash');
    if (win) {
      S.wishWon = true; // v3.0.3 第二批①：许愿池中奖标记（成就）
      const gained = addEp(WISH_REWARD); // 统一入口：受 EP 上限约束，溢出部分入 RP 溢出池
      log(`许愿池：奇迹发生！+${fmt(gained)} EP${gained < WISH_REWARD ? '（已达存储上限，溢出转入 RP 池）' : ''}`, 'good');
      toast('✨ 奇迹发生了！+100K EP');
    } else {
      toast('水花都没有…（-100 EP）');
    }
    save(S); dirty.top = true;
  }, 1100);
  // 3s 冷却结束：复位硬币与按钮
  setTimeout(() => {
    w.classList.remove('win', 'splash');
    w.disabled = false;
  }, 3000);
}
function initWishWell() { ensureWishWell(); }

// ========== v2.9.2 ②：离职礼盒（sp3_farewell 购买入口） ==========
// sp3_farewell 文案承诺"购买离职礼盒（1 EP）送给流失的线程"，此前 condition 仅 dormant||staffUnhappy≥3
// 自动触发——购买入口从未实现。现 condition 加入 S._farewellBought 前置，由本按钮提供购买入口。
// 仅在 线程休眠(dormant)/流失(losing)/staffUnhappy≥3 且本局未完成时显示，避免新手误触。
const FAREWELL_COST = 1;
function farewellAvailable() {
  if ((S._specialTasksDone || {}).sp3_farewell) return false; // 本局已完成
  if (S._farewellBought) return false; // 已购买待结算（下一帧自动完成）
  const w = S.wageState || {};
  return w.state === 'dormant' || w.state === 'losing' || (S.staffUnhappy || 0) >= 3;
}
function ensureFarewellGift() {
  let b = document.getElementById('farewell-gift');
  if (!farewellAvailable()) { if (b) b.style.display = 'none'; return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'farewell-gift';
    b.className = 'farewell-gift';
    b.title = '离职礼盒：送给流失线程的临别礼物（1 EP）—— 触发特殊任务「离职礼物」，解锁纪念墙';
    b.innerHTML = '🎁<span class="fg-label">离职礼盒</span><span class="fg-cost">1 EP</span>';
    b.addEventListener('click', onFarewellBuy);
    document.body.appendChild(b);
  }
  b.style.display = '';
}
function onFarewellBuy() {
  const b = document.getElementById('farewell-gift');
  if (!b || b.disabled) return;
  if ((S.ep || 0) < FAREWELL_COST) { toast(`EP 不足（需 ${FAREWELL_COST} EP）`); return; }
  S.ep -= FAREWELL_COST;
  S._farewellBought = true;
  b.disabled = true;
  b.classList.add('giving');
  save(S); dirty.top = true;
  // 礼盒飘出动画（0.8s）后立即结算 sp3_farewell（checkSpecialTasks 会读到 _farewellBought=true 并完成）
  setTimeout(() => {
    b.classList.remove('giving');
    b.disabled = false;
    b.style.display = 'none';
    checkSpecialTasks(S, log, toast); // 立即结算，玩家即时看到奖励
    save(S); dirty.top = true; dirty.achievements = true;
  }, 800);
}
function initFarewellGift() { ensureFarewellGift(); }

// ========== 事件绑定 ==========
function bindEvents() {
  // v3.2.4 反馈①：故事线面板收起/展开（记忆在 localStorage，跨开档保留）
  const slPanel = document.getElementById('tab-storyline');
  const slH3 = document.getElementById('storyline-h3');
  if (slPanel && slH3) {
    const applySl = () => {
      const c = localStorage.getItem('abyss_story_collapsed') === '1';
      slPanel.classList.toggle('sl-collapsed', c);
      const ind = slH3.querySelector('.sl-ind');
      if (ind) ind.textContent = c ? '▸' : '▾';
    };
    slH3.addEventListener('click', () => {
      localStorage.setItem('abyss_story_collapsed', slPanel.classList.contains('sl-collapsed') ? '0' : '1');
      applySl();
    });
    applySl();
  }
  // v3.3.1 反馈⑨：成就面板同样支持点击标题收起/展开（键独立记忆）
  const achPanel = document.getElementById('tab-achievement');
  const achH3 = document.getElementById('achievement-h3');
  if (achPanel && achH3) {
    const applyAch = () => {
      const c = localStorage.getItem('abyss_ach_collapsed') === '1';
      achPanel.classList.toggle('sl-collapsed', c);
      const ind = achH3.querySelector('.sl-ind');
      if (ind) ind.textContent = c ? '▸' : '▾';
    };
    achH3.addEventListener('click', () => {
      localStorage.setItem('abyss_ach_collapsed', achPanel.classList.contains('sl-collapsed') ? '0' : '1');
      applyAch();
    });
    applyAch();
  }
  document.getElementById('hero')?.addEventListener('click', doClick);
  document.getElementById('hire-btn')?.addEventListener('click', hireCultist);
  // v2.8.10：线程状态点击弹出四态说明（欠薪/休眠状态悬停提示对点击无响应，改为点击弹窗）
  document.getElementById('staff-status')?.addEventListener('click', () => {
    const W = BALANCE.thread.wages;
    askConfirm('线程状态说明', `线程薪资四态（当前：${(S.wageState || {}).state || 'ok'}）\n` +
      `· 满薪（绿）：EP ≥ ${W.warnSec}s 薪资，无惩罚\n` +
      `· 欠薪降效（黄）：EP < ${W.warnSec}s 薪资，产出 ×${wageDebtMult()}；连续 ${W.dormantAfterSec}s 进入休眠\n` +
      `· 强制休眠（橙）：产出 ×0，保命成本 = 薪资 ×${wageKeepCostMult()}；持续 ${W.loseAfterSec}s 进入流失预警\n` +
      `· 流失预警（红）：每 60s ${Math.round(wageLoseChance() * 100)}% 概率流失 1 线程\n` +
      `· 懒惰（黄）：EP 持续满上限 ${BALANCE.lazy.afterSec}s → 线程怠工：产出 ×${BALANCE.lazy.prodMult}、消耗 ×${BALANCE.lazy.costMult}\n` +
      `恢复：EP ≥ ${W.recoverSec}s 薪资后经 ${W.transitionSec}s 过渡 / ${W.bufferSec}s 缓冲回到满薪（恢复后休眠 ≥60s 触发补偿 ×1.5）`, () => {});
  });
  document.getElementById('pauseBtn')?.addEventListener('click', togglePause);
  document.getElementById('focus-bar')?.addEventListener('click', buyFocus);

  // v2.1 R2：任务面板容器级事件委托——领取按钮无论面板怎么刷新都能点到
  document.getElementById('projects')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-claim]');
    if (!btn) return;
    const idx = Number(btn.dataset.claim);
    const p = S.projects[idx];
    if (p && p.status === 'pending') {
      const res = claimProject(p);
      dirty.projects = true; dirty.top = true;
      // v2.8.28 修复：EP 奖励领取时已达存储上限 → 溢出自动转入 RP 蒸馏池，明确提示避免「无法领取」困惑
      if (res && res.ok && res.amount > 0 && res.epGained < res.amount) {
        toast(`任务 EP 已达存储上限，超出 ${fmt(res.amount - res.epGained)} EP 自动转入 RP 蒸馏池`);
      }
    }
  });

  document.getElementById('btn-shop')?.addEventListener('click', () => switchTab('shop'));
  document.getElementById('btn-tech')?.addEventListener('click', () => switchTab('tech'));
  document.getElementById('btn-relics')?.addEventListener('click', () => switchTab('relics'));
  document.getElementById('btn-policy')?.addEventListener('click', () => switchTab('policy')); // v2.7.0：深渊遗物
  document.getElementById('btn-rp')?.addEventListener('click', () => switchTab('rp')); // v2.5 ④：研究点栏目
  // v2.7.4 ⑦：RP 蒸馏——消耗 25% 当前 EP 转化 RP（主动消耗，防溢出）
  document.getElementById('rp-panel')?.addEventListener('click', (e) => {
    if (!e.target || e.target.id !== 'rp-distill-btn') return;
    const rate = rpDistillRate();
    // v3.0.8：RP 已满上限时不再蒸馏（原实现直写 S.rp 绕过 rpCap，既浪费 EP 又让矩阵存储库的上限失去意义）
    if ((S.rp || 0) >= rpCap()) { if (toast) toast(`RP 已达上限 ${fmt(rpCap())}：升级「矩阵存储库」扩容后再蒸馏`); return; }
    const spend = Math.max(Math.floor((S.ep || 0) * 0.25), rate); // v2.8.30：25% 不足 1 RP 时按最低 1 RP 额蒸馏（ep ≥ 蒸馏率即可点）
    if (spend < rate || (S.ep || 0) < spend) { if (toast) toast('EP 不足：需至少蒸馏出 1 RP'); return; }
    const rp = Math.floor(spend / rate);
    S.ep -= spend;
    addRp(rp); // v3.0.8：走统一入口，受 RP 上限约束
    S.epDistilledTotal = (S.epDistilledTotal || 0) + spend;
    save(S); dirty.top = true; dirty.rp = true;
    if (toast) toast(`蒸馏完成：-${fmt(spend)} EP → +${rp} RP`);
  });
  document.getElementById('btn-pets')?.addEventListener('click', () => switchTab('pets'));
  document.getElementById('btn-prestige')?.addEventListener('click', () => switchTab('prestige'));
  document.getElementById('btn-achievement')?.addEventListener('click', () => switchTab('achievement'));
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
  bindQuickSwitches(); // v3.2.2 反馈①：自动转化快捷开关事件委托
  // v3.3.3 反馈⑨：锁定态（???）tab 点击不切换——捕获阶段拦截并提示解锁路径
  document.querySelector('.tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset && b.dataset.locked === '1') {
      e.stopPropagation();
      // v3.3.9 反馈④：提示走统一文案表（原 b.title 被清空时只弹「🔒 尚未解锁」，信息量为零）
      const hint = b.title || TAB_LOCK_HINTS[b.id] || '尚未解锁';
      toast(hint.startsWith('🔒') ? hint : '🔒 ' + hint);
    }
  }, true);
  bindPolicyPanel(document.getElementById('policy-panel'));
  _policyOpenHash = policyOpenGroups().map(g => g.id).sort().join(',');
  renderPolicyPanel(document.getElementById('policy-panel'));
  setPolicyLogFn(log); setPolicyToastFn(toast); // v2.8.6：政策模块日志/toast 接入
  document.getElementById('btn-delve')?.addEventListener('click', () => switchTab('delve'));
  bindDelvePanel(document.getElementById('delve-panel')); // v2.6.0：深潜面板事件委托
  document.getElementById('btn-rift-tab')?.addEventListener('click', () => switchTab('rift-tab'));
  // v3.0.0：深渊集市
  document.getElementById('btn-bazaar')?.addEventListener('click', () => switchTab('bazaar'));
  bindBazaarPanel(document.getElementById('bazaar-panel'));
  // v2.9.0：Wiki 重构为侧栏分章 + 内容区；v3.1.1 反馈⑥：全部章节无条件展示（不管是否解锁——
  // wiki 同时是研发手册，未解锁章节直接可见解锁条件，不再灰显锁定）
  const wikiBtn = document.getElementById('btn-wiki');
  const wikiModal = document.getElementById('wiki-modal');
  let wikiActiveId = 'intro';
  let wikiQuery = ''; // v3.2.3 反馈④：wiki 关键词检索（会话级，打开弹框时清空）
  function renderWikiNav() {
    const nav = document.getElementById('wiki-nav');
    if (!nav) return;
    nav.innerHTML = WIKI_SECTIONS.map(s =>
      `<button class="wiki-nav-btn${s.id === wikiActiveId ? ' on' : ''}" data-wiki="${s.id}">${s.name}</button>`
    ).join('');
    nav.querySelectorAll('[data-wiki]').forEach(b => b.addEventListener('click', () => {
      wikiActiveId = b.dataset.wiki;
      renderWikiNav();
      renderWikiBody();
    }));
  }
  // v3.2.3 反馈④：跨章节搜索——命中行摘录 + 点击跳转对应章节
  function renderWikiSearch(q) {
    const body = document.getElementById('wiki-body');
    if (!body) return;
    const needle = q.trim().toLowerCase();
    let found = 0;
    let html = `<h4 class="wiki-title">搜索「${escWiki(q.trim())}」</h4>`;
    for (const s of WIKI_SECTIONS) {
      const probe = document.createElement('div');
      probe.innerHTML = s.body();
      const lines = (probe.textContent || '').split('\n').map(l => l.trim()).filter(Boolean);
      const hits = lines.filter(l => l.toLowerCase().includes(needle)).slice(0, 4);
      if (!hits.length) continue;
      found += hits.length;
      html += `<div class="wiki-hit" data-wiki-hit="${s.id}">
        <div class="wiki-hit-sec">${s.name} ${wikiActiveId === s.id ? '（当前章节）' : ''}</div>
        ${hits.map(l => `<div class="wiki-hit-line">…${escWiki(l.length > 120 ? l.slice(0, 120) + '…' : l)}…</div>`).join('')}
      </div>`;
    }
    html += found ? `<p class="wiki-hint">共 ${found} 条命中——点击条目跳转对应章节（关键词已清空）</p>`
      : `<p class="wiki-hint">没有找到「${escWiki(q.trim())}」相关内容——试试别的关键词（资源名 / 系统名 / 机制名）</p>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-wiki-hit]').forEach(el => el.addEventListener('click', () => {
      wikiActiveId = el.dataset.wikiHit;
      wikiQuery = '';
      const inp = document.getElementById('wiki-search');
      if (inp) inp.value = '';
      renderWikiNav();
      renderWikiBody();
    }));
  }
  function renderWikiBody() {
    // v3.2.3 反馈④：有搜索词时优先展示检索结果
    if (wikiQuery && wikiQuery.trim()) { renderWikiSearch(wikiQuery); return; }
    const body = document.getElementById('wiki-body');
    if (!body) return;
    const s = WIKI_SECTIONS.find(x => x.id === wikiActiveId) || WIKI_SECTIONS[0];
    let html = `<h4 class="wiki-title">${s.name}</h4><div class="wiki-content">${s.body()}</div>`;
    // 故事线/章节讲解并入对应章节（intro/ach 已含；此处保留故事线图鉴入口在 ach 章末）
    if (s.id === 'ach') html += renderStorylineAppendix();
    body.innerHTML = html;
    body.scrollTop = 0;
  }
  function hintFor(key) {
    const m = { rp:'EP 溢出一次后，把存储上限抬到矩阵存储库售价即可购入解锁', es:'完成首次晋升', faith:'信奉宗教分支', pt:'第 3 章后商店开放「饵料仓库」，购入即解锁 PT',
      dm:'触发首次深渊裂隙', rift:'触发首次深渊裂隙', delve:'ES≥3 + DM 已发现 + 宗教已信奉',
      prestige:'完成首次晋升', reincarn:'完成首次轮回', policy:'开放任一政策组（晋升/深潜/信仰）',
      bazaar:'职级 ≥1 且已发现研究点（RP）' }; // v3.0.0 // v3.1.1 反馈⑦：pt 提示同步仓库解锁链
    return m[key] || '推进主线解锁';
  }
  function renderStorylineAppendix() {
    const LINES = [
      ['默认线', '标准矩阵发展：不立誓不锁线，可一路推进主线到终章。'],
      ['秩序重构者', '立誓「秩序之柱」。新编译器路线：全局 ×3 起点、AI 自动科技/自动购买、负面仅减缓、乘区稳定。'],
      ['深渊行者', '立誓「深渊之锚」。混沌路线：混沌之子随机乘区、混沌心智接管 AI、裂隙余烬/DM 强化、触手协议自动点击。'],
      ['信仰传播者', '立誓「信仰圣龛」。精神路线：神权协议全局产出 ×3 且 FP（信仰）获取 ×2、信仰长线升级、异兽/神殿联动。'],
    ];
    let h = `<h4 class="wiki-title" style="margin-top:18px">故事线选择区别</h4>` + LINES.map(([n, d]) => `<p class="wiki-line"><b>${n}</b>：${d}</p>`).join('');
    h += `<h4 class="wiki-title" style="margin-top:14px">主线章节</h4>`;
    const seen = (S.chaptersUnlocked && S.chaptersUnlocked[S.storyline]) || [];
    h += CHAPTERS.map(c => {
      let ok = false; try { ok = !!c.cond(S); } catch {}
      const idx = parseInt(c.id, 10) || 0;
      if (seen.includes(idx)) ok = true;
      return `<p class="wiki-line"><span style="color:${ok ? 'var(--green)' : 'var(--text-3)'}">${ok ? '✓' : '🔒'} ${escWiki(c.name)}</span>${ok ? `：${escWiki(c.desc)}` : ''}</p>`;
    }).join('');
    return h;
  }
  function escWiki(s) { return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
  function renderWikiContent() {
    wikiActiveId = 'intro';
    wikiQuery = '';
    const inp = document.getElementById('wiki-search');
    if (inp) inp.value = '';
    renderWikiNav();
    renderWikiBody();
  }
  if (wikiBtn && wikiModal) {
    wikiBtn.addEventListener('click', () => { renderWikiContent(); wikiModal.style.display = 'flex'; });
    document.getElementById('wiki-x')?.addEventListener('click', () => { wikiModal.style.display = 'none'; });
    // v3.2.3 反馈④：搜索框输入即检索（防抖 200ms，避免长 wiki 每键全量重排）
    const wikiSearchInput = document.getElementById('wiki-search');
    if (wikiSearchInput) {
      let wikiSearchTimer = null;
      wikiSearchInput.addEventListener('input', () => {
        clearTimeout(wikiSearchTimer);
        wikiSearchTimer = setTimeout(() => {
          if (wikiModal.style.display === 'flex') { wikiQuery = wikiSearchInput.value; renderWikiBody(); }
        }, 200);
      });
    }
    // v2.8.19：天赋弹框 × 关闭（绑定常驻，不依赖打开流程）
    document.getElementById('talent-x')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const tm = document.getElementById('talent-modal');
      if (!tm) return;
      S._prestigeSkips = (S._prestigeSkips || 0) + 1;
      tm.style.display = 'none';
    });
    wikiModal.addEventListener('click', (ev) => { if (ev.target === wikiModal) wikiModal.style.display = 'none'; });
  }
  document.getElementById('rift-tab-panel')?.addEventListener('click', (e) => { // v2.6.1：裂隙余烬升级树
    // v2.8.30：自动动作开关（互斥单开——再点关闭；开新的自动关旧）
    const autoEl = e.target.closest('[data-rift-auto]');
    if (autoEl) {
      const id = autoEl.dataset.riftAuto;
      S.riftAuto = S.riftAuto === id ? null : id;
      save(S);
      renderRiftPanel(document.getElementById('rift-tab-panel'));
      return;
    }
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
    // v2.8.6：清档行不在 [data-snap] 内，须先处理（否则无快照行时被 li 早退拦截）
    if (e.target.classList.contains('snap-reset')) {
      askConfirm('清档（删除当前游戏）', '将删除当前本地游戏，回到全新开局。\n存档快照保留，可逐个删除；此操作不可撤销，确定继续？', () => {
        doReset();
      });
      return;
    }
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
    const pb = e.target && e.target.dataset ? e.target.dataset.purifierBuy : null;
    if (pb) {
      const r = buyPurifier(pb);
      if (!r.ok && r.reason) { log(`[净化节点] ${r.reason}`, 'bad'); toast(r.reason); }
      renderRelics(document.getElementById('relics-panel'));
      dirty.corruption = true; // 净化速率变化 → 腐化条即时刷新
      return;
    }
    const id = e.target && e.target.dataset ? e.target.dataset.relicBuy : null;
    if (!id) return;
    const r = buyRelic(id);
    if (!r.ok && r.reason) { log(`[遗物] ${r.reason}`, 'bad'); toast(r.reason); }
    renderRelics(document.getElementById('relics-panel'));
  });

  // 晋升按钮
  document.getElementById('prestige-panel')?.addEventListener('click', (e) => {
    if (e.target.id !== 'prestige-btn') return;
    // v2.9.0 优化③：吞噬锁定提示（转生不可脱离深渊）
    if (S._collapseAt || S.collapsed || S._collapseChoicePending) { if (toast) toast('深渊已锁定你——转生不可脱离深渊吞噬'); return; }
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
    const icon = item.textContent.trim() || '';
    const heart = document.createElement('div');
    heart.className = 'pet-heart';
    // v2.8.17 ②③：点击反馈 = 该宠物自身图标上浮（差异化，不再统一爱心）；icon 缺失时退化为内联 SVG 爱心（系统缺字体时 ♥/emoji 会渲染成蓝色方块，SVG 无字体依赖）
    heart.innerHTML = icon
      ? `<span style="font-size:18px;line-height:1;display:block">${icon}</span>`
      : '<svg viewBox="0 0 32 29" width="20" height="18" style="display:block"><path d="M16 29 C5 20 0 14 0 8 C0 3 4 0 8 0 C11 0 15 3 16 6 C17 3 21 0 24 0 C28 0 32 3 32 8 C32 14 27 20 16 29 Z" fill="#ff3b6b"/></svg>';
    item.style.animation = 'none';
    void item.offsetWidth;
    item.style.animation = '';
    const r = item.getBoundingClientRect();
    heart.style.left = r.left + r.width / 2 - 10 + 'px';
    heart.style.top = r.top - 6 + 'px';
    (document.getElementById('pet-float') || document.body).appendChild(heart);
    setTimeout(() => heart.remove(), 900);
  });

  // v2.9.0 优化①：主动净化——消耗 EP（随净化量与存储上限计价），清除最多 50% 腐化，
  // 并按平方曲线析出 DM（腐化越严重 DM 越多）；吞噬倒计时中净化至满额以下 = 唯一自救路径
  document.getElementById('corruption-purge')?.addEventListener('click', () => {
    const cur = S.corruption || 0;
    if (cur <= 0) { toast('当前无腐化可净化'); return; }
    const cut = Math.min(cur, BALANCE.corruption.purge?.maxCut || 50);
    const cost = Math.ceil(purgeCostFor(cut) * riftPurgeCostMult()); // v3.4.9 反馈④：净化 EP 成本随裂隙等级 ×(1+0.30/级)
    if ((S.ep || 0) < cost) { toast(`EP 不足：净化 ${cut.toFixed(1)}% 腐化需 ${fmt(cost)} EP`); return; }
    S.ep -= cost;
    S.corruption = Math.max(0, cur - cut);
    const dmGain = purgeDmFor(cut);
    if (dmGain > 0) { addDm(dmGain); discoverDm(); }
    let rescued = false;
    if (S._collapseAt && S.corruption < (BALANCE.corruption.max || 100)) rescued = cancelCollapse();
    log(`主动净化：-${fmt(cost)} EP，清除 ${cut.toFixed(1)}% 腐化，析出 +${dmGain} DM${rescued ? '——吞噬倒计时已解除' : ''}`, 'good');
    toast(rescued ? `净化成功：-${cut.toFixed(1)}% 腐化，吞噬倒计时解除！` : `净化 -${cut.toFixed(1)}% 腐化 · +${dmGain} DM`);
    save(S);
    dirty.corruption = true; dirty.top = true; dirty.hero = true;
  });
  // v2.9.0 优化②：紧急脱出二次确认——弹框打开期间一切计时暂停（模态暂停机制）
  document.getElementById('abort-rift-ex')?.addEventListener('click', () => {
    if (!S.riftExpedition) return;
    askConfirm('紧急脱出确认',
      '确定立即中止深入探索？\n· 已消耗的 EP / DM 不退还；\n· 提前脱出无任何结算奖励（完整探索 60s 才能带回产物）。\n确认期间一切计时暂停。', () => {
        const r = abortRiftExpedition();
        dirty.top = true; dirty.rift = true; dirty.hero = true;
        if (r && r.ok) toast('紧急脱出：探索中止');
      });
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

// ========== v2.9.0 优化②：模态暂停——确认/抉择弹框打开期间一切计时暂停 ==========
// 两层冻结：① tick 的 dt 直接跳过（不再累积）；② 恢复时把绝对时间戳字段整体顺延，
// 否则 Date.now() 型计时（裂隙探索/吞噬倒计时/buff/任务截止等）会在弹框期间暗中流逝。
let modalPauseAt = 0;
function pauseGameClock() { if (!modalPauseAt) modalPauseAt = Date.now(); }
function resumeGameClock() {
  if (!modalPauseAt) return;
  const cm = document.getElementById('collapse-modal');
  if (cm && cm.style.display === 'flex') return; // 抉择弹框仍打开（如取消同归于尽二次确认）→ 保持暂停
  const shift = Date.now() - modalPauseAt;
  modalPauseAt = 0;
  if (shift <= 0) return;
  if (S.riftExpedition) S.riftExpedition.until += shift;
  if (S.activeRift) S.activeRift.expiresAt += shift;
  if (S.buffUntil > 0) S.buffUntil += shift;
  if (S.clickBuffUntil > 0) S.clickBuffUntil += shift;
  if (S._collapseAt) S._collapseAt += shift;
  if (S.nextEventAt) S.nextEventAt += shift;
  if (S.petXpUntil) S.petXpUntil += shift;
  if (S.fuseLuckUntil) S.fuseLuckUntil += shift;
  if (S.restBonusUntil) S.restBonusUntil += shift;
  if (S.lazySince) S.lazySince += shift;
  if (S.pausedAt) S.pausedAt += shift;
  for (const p of (S.projects || [])) { if (p.deadline) p.deadline += shift; if (p.pendingAt) p.pendingAt += shift; if (p.startsAt) p.startsAt += shift; }
  S._lastActionAt = Date.now();
  lastTick = performance.now();
}

// v2.5.4 ①：通用二级确认弹框已下沉至 src/core/runtime.js（askConfirm / bindConfirmButtons / registerConfirmHooks）。
// 浏览器启动时注入游戏时钟的暂停/恢复钩子并绑定确认框按钮（DOM 存在时才生效）：
registerConfirmHooks({ pause: pauseGameClock, resume: resumeGameClock });
bindConfirmButtons();

// ========== v2.9.0：深渊吞噬·命运抉择（倒计时终结触发；不可关闭，二选一） ==========
function showCollapseChoice() {
  const m = document.getElementById('collapse-modal');
  if (!m) return;
  pauseGameClock(); // 抉择期间一切计时暂停（含崩溃倒计时/探索/buff/任务）
  m.style.display = 'flex';
}
function resolveCollapseChoice(kind) {
  const m = document.getElementById('collapse-modal');
  if (m) m.style.display = 'none';
  S._collapseChoicePending = false;
  S._collapseAt = null; S._collapseTimer = 0;
  S.collapsed = false; // v3.0.1：显式清除崩溃标记（防刷新后启动检查再次弹出抉择）
  resumeGameClock();
  if (kind === 'bribe') {
    // 贿赂深渊：上缴 90% EP，成为深渊的朋友——本局继续
    // v3.0.1：腐化清零（原回落 50%——但线程被吞殆尽时无线程净化，腐化卡住或快速回满再次触发倒计时→抉择，形成死循环）
    const paid = Math.floor((S.ep || 0) * 0.9);
    S.ep = Math.max(0, (S.ep || 0) - paid);
    S.corruption = 0;
    S.achievements.demon_friend = true;
    log(`贿赂深渊：上缴 ${fmt(paid)} EP（90%）——深渊收下了祭品，你成为了深渊的朋友（本局继续，腐化已被深渊收回）`, 'good');
    toast('🤝 成就解锁：恶魔的朋友');
    checkAch(); // 立即点亮成就面板
  } else {
    // 同归于尽：立即触发崩溃杀死深渊——本局湮灭并强制转生（湮灭残片 +1，成就「凝视深渊」）
    S.achievements.gaze_abyss = true;
    S.achievements.collapsed = true; // 旧「被深渊吞噬」成就同步点亮
    S.abyssSplinter = (S.abyssSplinter || 0) + 1;
    S.collapsed = true;
    log('同归于尽：你引爆了全部效能核心——崩溃吞没了你，也杀死了深渊。新局将在灰烬中重启', 'bad');
    toast('🌑 成就解锁：凝视深渊');
    S.collapsed = false; // 崩溃已结算（强制转生是唯一收尾，非「转生逃离吞噬」）
    doPrestige(null);
    dirty.shop = true; dirty.tech = true; dirty.pets = true;
  }
  save(S);
  dirty.top = true; dirty.hero = true; dirty.corruption = true; dirty.prestige = true; dirty.projects = true;
}
document.getElementById('collapse-bribe')?.addEventListener('click', () => resolveCollapseChoice('bribe'));
document.getElementById('collapse-mutual')?.addEventListener('click', () => {
  // 同归于尽不可撤销，加一道确认（确认期间同样计时暂停）
  askConfirm('同归于尽 · 最终确认', '崩溃将吞没本局（强制转生，湮灭残片 +1），深渊与你一同湮灭。\n确定执行？', () => resolveCollapseChoice('mutual'));
});

// v2.5.4 ①：快照面板
function renderSnapshotList() {
  const box = document.getElementById('snap-list');
  if (!box) return;
  const snaps = listSnapshots();
  box.innerHTML = '';
  if (!snaps.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--text-2);padding:8px;border:1px dashed var(--border);border-radius:5px">暂无快照。点击上方「保存当前进度为快照」生成（最多 ' + SNAP_MAX + ' 个）。</div>';
    // v2.8.6：无快照时清档行仍需渲染（清档 = 重置当前本地游戏，与快照有无无关）
  } else {
  for (const sn of snaps) {
    const row = document.createElement('div');
    row.className = 'item snap-row';
    row.dataset.snap = sn.id;
    row.dataset.name = sn.name;
    row.dataset.time = sn.timeText;
    row.title = '「读取」= 用快照覆盖当前本地游戏（二次确认）；「删除」= 移除该快照';
    const sm = sn.summary || {};
    const lineName = sm.storyline === 'line_abyss' ? '深渊线' : sm.storyline === 'line_order' ? '秩序线' : sm.storyline === 'line_faith' ? '信仰线' : '默认线';
    row.innerHTML = `<div class="name"><span>${sn.slot}. ${sn.name}</span><span class="count mono">${sn.timeText}</span></div>
      <div style="font-size:10.5px;color:var(--text-3);margin-top:2px">EP ${fmt(sm.ep || 0)} · 职级 ${sm.prestige || 0} · 第 ${sm.chapter || 1} 章 · ${lineName}</div>
      <div style="display:flex;gap:4px;margin-top:4px">
        <button class="btn snap-use" style="flex:1;padding:2px 4px;font-size:10px">读取</button>
        <button class="btn snap-del" style="flex:1;padding:2px 4px;font-size:10px;background:transparent">删除</button>
      </div>`;
    box.appendChild(row);
  }
  }
  // v2.8.5 A4：清档移入快照列表（外侧移除）——v2.8.6：无条件渲染（无快照时同样可清档）
  const clearRow = document.createElement('div');
  clearRow.className = 'snap-reset-row';
  clearRow.style.cssText = 'margin-top:8px;border-top:1px dashed var(--border);padding-top:8px;text-align:center';
  clearRow.innerHTML = `<button class="btn snap-reset" style="width:100%;padding:3px 6px;font-size:11px;background:transparent;color:var(--red,#f85149)">清档（删除当前游戏，快照保留）</button>`; // v2.8.8：清档只删当前，快照逐个删
  box.appendChild(clearRow);
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
      // v2.8.5 A4：导入 = 覆盖当前本地游戏，二次确认
      const sum = `EP ${fmt(data.ep || 0)} · 职级 ${data.prestige || 0} · 第 ${data.chapter || 1} 章`;
      askConfirm('导入存档并覆盖当前', `导入外部存档（${sum}）将覆盖当前本地游戏进度。\n当前进度会自动备份（abyss_idle_v2_bak）。确定继续？`, () => {
        const cur = localStorage.getItem(SAVE_KEY);
        if (cur) localStorage.setItem(SAVE_KEY + '_bak', cur);
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        toast('存档导入成功，页面即将刷新');
        setTimeout(() => location.reload(), 600);
      });
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
      modal.style.display = 'none'; // v2.8.4 ⑪：转生后立即关闭模态框（原残留可重复选择）
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
  const name = names[Math.floor(Math.random() * names.length)];
  const profession = rollProfession(aiSuggestedProfession()); // v3.3.0 ⑤：招募按需求建议职业（与线程职业联动）
  S.cultists.push({
    id: Date.now() + Math.random(),
    name,
    profession,                  // v3.3.0 线程绑定系统：职业（天赋）
    level: 1, xp: 0,             // v3.3.0 线程等级（按在岗时间累积）
    leader: false,               // v3.3.0 领导者标记
    boundTo: null,               // v3.3.0 绑定到的转化器
    output: BALANCE.thread.baseOutput + Math.random() * BALANCE.thread.baseOutputJitter,
    mood: '正常',
    moodTimer: 30 + Math.random() * 60,
    hiredAt: Date.now(), // v3.1.0 反馈③：工龄
    earned: 0,           // v3.1.0 反馈③：个人累计贡献（按实际入账份额分摊）
  });
  crewPush(`招募新线程【${name}】加入班组（${profession}·Lv.1，+${fmt(BALANCE.thread.baseOutput)}~${fmt(BALANCE.thread.baseOutput + BALANCE.thread.baseOutputJitter)} EP/s）`, 'good');
  dirty.top = true; dirty.hero = true;
  save(S); // v2.8.9：招募即持久化（v2.7.1 购买即保存惯例，防刷新丢招募）
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
    // v2.8.14：暂停时深入裂隙计时冻结（恢复时顺延剩余时长）
    if (S.riftExpedition) {
      const left = Math.max(0, (S.riftExpedition.until - Date.now()) / 1000);
      S.riftExpedition.until = Date.now() + left * 1000;
    }
    document.getElementById('pauseBtn').textContent = '继续';
    document.body.classList.add('paused');
    log('系统暂停（按离线结算）', 'bad');
    showPauseModal(); // v2.5 ⑥：暂停弹框展示预计离线时间与收入
  } else {
    // v2.8.14：恢复时深入裂隙按冻结剩余继续计时
    if (S.riftExpedition) {
      const left = Math.max(0, (S.riftExpedition.until - Date.now()) / 1000);
      S.riftExpedition.until = Date.now() + left * 1000;
    }
    settlePause();
  }
  dirty.top = true; dirty.prestige = true; dirty.hero = true; // v2.8.14：暂停/恢复时同步刷新英雄区（深入裂隙「已暂停」状态显示）
}

// v2.5 ⑥：暂停弹框——实时展示已暂停时长与预计离线收入；「恢复并结算」结束暂停
// v3.2.1 反馈⑤：离线管理（离线面板/离线升级）并入暂停界面——暂停打开即渲染
function showPauseModal() {
  const modal = document.getElementById('pause-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const offPanel = document.getElementById('offline-panel');
  if (offPanel) renderOfflinePanel(offPanel);
  renderOfflineUpgrades(document.getElementById('offline-upg-list'));
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
  const epPreview = Math.max(0, cps * eff * offlineEffRate()); // v3.2.4 反馈⑤：与离线结算统一口径
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
    const gain = cps * eff * offlineEffRate(); // v3.2.4 反馈⑤：与离线结算统一口径
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
          else if (p.reward.kind === 'rp') addRp(p.reward.amount); // v3.0.8：走统一入口，受 RP 上限约束
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
      if (bonusRp > 0) { addRp(bonusRp); logPts.push(`+${bonusRp} RP`); } // v3.0.8：受 RP 上限约束
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
  // v2.8.6：清档入口（快照列表 .snap-reset）已由 askConfirm 完成二次确认，移除此处原生
  // confirm 阻塞（headless/自动化环境下原生 confirm 会挂起页面；真实浏览器双重弹窗冗余）。
  resetGuard = true;
  reset();
  // 展开态属进度披露 UI 态，清档一并回收（新档回到首屏窗口，与换设备口径一致）
  try { localStorage.removeItem(EXPAND_KEY); } catch (e) { /* 隐私模式等静默忽略 */ }
  location.reload();
}

// ========== 里程碑 & 成就 ==========
const MILES = BALANCE.miles; // v2.0：里程碑表移入 BALANCE

function checkMiles() {
  const cps = computeCps();
  for (const m of MILES) {
    if (cps >= m.cps && !S.milesDone[m.cps]) {
      S.milesDone[m.cps] = true;
      const rpGain = Math.ceil(m.rp * (S.runTalent === 'fortunate' ? 2 : 1) * (1 + elv('mile') * 0.05));
      addRp(rpGain); // v3.0.8：受 RP 上限约束
      log(`里程碑：每秒 ${fmt(m.cps)}，+${rpGain} RP`, 'good');
    }
  }
}

// v3.4.2：统一成就表（判定 + 面板同源，消除 tests/defs 双表漂移隐患）
// id 唯一；含 test 的项由 checkAch 自动判定，无 test 的项（demon_friend / gaze_abyss）由剧情手动点亮
const ACHIEVEMENTS = [
  { id: 'click1',    name: '初次接触', icon: '👆', desc: '第一次点击工作台，深渊回应了你的触碰', test: s => s.totalClicks >= 1 },
  { id: 'ep1k',      name: '一丝涟漪', icon: '🌊', desc: '累计获得 1K EP', test: s => s.allTimeEp >= 1e3 },
  { id: 'ep100k',    name: '涌动',     icon: '🌊', desc: '累计获得 100K EP', test: s => s.allTimeEp >= 1e5 },
  { id: 'ep1m',      name: '深流',     icon: '🌊', desc: '累计获得 1M EP', test: s => s.allTimeEp >= 1e6 },
  { id: 'ep1b',      name: '渊海',     icon: '🌊', desc: '累计获得 1B EP', test: s => s.allTimeEp >= 1e9 },
  { id: 'ep1t',      name: '滔天',     icon: '🌊', desc: '累计获得 1T EP', test: s => s.allTimeEp >= 1e12 },
  { id: 'ep1qa',     name: '湮灭临界', icon: '🌊', desc: '累计获得 1Qa EP', test: s => s.allTimeEp >= 1e15 },
  { id: 'ep1sx',     name: '奇点之外', icon: '🌊', desc: '累计获得 1Sx EP', test: s => s.allTimeEp >= 1e18 },
  { id: 'own10',     name: '十件造物', icon: '🏗️', desc: '同时拥有 10 个升级/建筑', test: s => totalOwned() >= 10 },
  { id: 'own25',     name: '造物者',   icon: '🏗️', desc: '同时拥有 25 个升级/建筑', test: s => totalOwned() >= 25 },
  { id: 'own100',    name: '百工',     icon: '🏗️', desc: '同时拥有 100 个升级/建筑', test: s => totalOwned() >= 100 },
  { id: 'thread3',   name: '三人成众', icon: '🧵', desc: '同时拥有 3 条产出线程', test: s => (s.cultists || []).length >= 3 },
  { id: 'thread10',  name: '军团',     icon: '🧵', desc: '拥有 10 条产出线程', test: s => (s.cultists || []).length >= 10 },
  { id: 'thread50',  name: '文明',     icon: '🧵', desc: '拥有 50 条产出线程', test: s => (s.cultists || []).length >= 50 },
  { id: 'pre1',      name: '初次超脱', icon: '⬆️', desc: '完成首次晋升转生', test: s => s.prestige >= 1 },
  { id: 'pre5',      name: '五度超脱', icon: '⬆️', desc: '完成 5 次晋升', test: s => s.prestige >= 5 },
  { id: 'pre50',     name: '五十度轮回', icon: '⬆️', desc: '完成 50 次晋升', test: s => s.prestige >= 50 },
  { id: 'pre150',    name: '百五十度', icon: '⬆️', desc: '完成 150 次晋升', test: s => s.prestige >= 150 },
  { id: 'reincarn1', name: '循环之始', icon: '♻️', desc: '完成首次轮回（第二层循环）', test: s => (s.reincarned || 0) >= 1 },
  { id: 'reincarn5', name: '五重循环', icon: '♻️', desc: '完成 5 次轮回', test: s => (s.reincarned || 0) >= 5 },
  { id: 'es1',       name: '永恒碎片', icon: '💎', desc: '首次获得 ES（晋升结算）', test: s => (s.es || 0) >= 1 },
  { id: 'es100',     name: '永恒印记', icon: '💎', desc: '持有 100 ES', test: s => (s.es || 0) >= 100 },
  { id: 'es1000',    name: '永恒之主', icon: '💎', desc: '持有 1000 ES', test: s => (s.es || 0) >= 1000 },
  { id: 'tech1',     name: '认知扩展', icon: '🔬', desc: '解锁首个科技', test: s => techCount() >= 1 },
  { id: 'offline',   name: '短暂告别', icon: '🌙', desc: '离开一段时间后回归，领取离线收益', test: s => s.gotOffline },
  { id: 'pet1',      name: '深渊伙伴', icon: '🐈', desc: '拥有一位深渊宠物伙伴', test: s => petCount() >= 1 },
  { id: 'pet5',      name: '群兽之主', icon: '🐈', desc: '拥有 5 只异兽', test: s => petCount() >= 5 },
  { id: 'rift1',     name: '裂缝缝合', icon: '🌀', desc: '首次封印深渊裂隙', test: s => (s.riftsSealed || 0) >= 1 },
  { id: 'delve1',    name: '深渊之下', icon: '🌑', desc: '深潜达到 10 层', test: s => (s.delve && s.delve.depth) >= 10 },
  { id: 'delve50',   name: '深潜者',   icon: '🌑', desc: '深潜达到 50 层', test: s => (s.delve && s.delve.depth) >= 50 },
  { id: 'faith1',    name: '信仰觉醒', icon: '🙏', desc: '信奉一个宗教分支', test: s => !!(s.religion && s.religion.unlocked) },
  { id: 'faith500',  name: '万世朝拜', icon: '🙏', desc: '持有 500 信仰', test: s => (s.faith || 0) >= 500 },
  { id: 'dm100',     name: '深渊物质', icon: '🜏', desc: '持有 100 DM', test: s => (s.dm || 0) >= 100 },
  { id: 'dm1k',      name: '深渊富翁', icon: '🜏', desc: '持有 1000 DM', test: s => (s.dm || 0) >= 1000 },
  { id: 'dm100k',    name: '深渊之渊', icon: '🜏', desc: '持有 100K DM', test: s => (s.dm || 0) >= 100000 },
  { id: 'fishbowl1', name: '缸中之渊', icon: '🐙', desc: '建造深渊鱼缸（触手苏醒）', test: s => (s.upgrades && s.upgrades.abyss_fishbowl) >= 1 },
  { id: 'collapsed', name: '被深渊吞噬', icon: '🌊', desc: '腐化满额且 EP 触顶，线程出逃殆尽——本局被深渊吞噬（轮回失败）', test: s => !!s.collapsed },
  { id: 'idle60', name: '静默一分钟', icon: '⏳', desc: '开局后 1 分钟不做任何操作（静置彩蛋）', test: s => !!(s._easterEggsFound && s._easterEggsFound.idle_start) },
  { id: 'crossroad', name: '三岔抉择', icon: '🛤️', desc: '在岔路口立誓，选择一条故事线', test: s => !!(s.storyline && s.storyline !== 'default') },
  { id: 'abyss_gaze_egg', name: '凝视深渊', icon: '👁️', desc: '在裂隙余烬中购得「深渊凝视」——屏幕底部中央浮起一只眼睛，正左右打量着你', test: s => !!s.abyssGazeUnlocked },
  { id: 'wish1',    name: '掷币入井', icon: '🪙', desc: '首次向许愿池投币（100 EP）', test: s => (s.wishCoins || 0) >= 1 },
  { id: 'wishwin',  name: '奇迹发生', icon: '✨', desc: '许愿池中奖（0.01% 概率 +100K EP）', test: s => !!s.wishWon },
  { id: 'bazaar1',    name: '初次交易', icon: '🏪', desc: '在深渊集市完成首笔交易', test: s => (s.bazaar && s.bazaar.trades) >= 1 },
  { id: 'bazaar_t3',  name: '集市巨贾', icon: '💼', desc: '集市等级达到 Lv.3（累计 60 笔成交）', test: s => (s.bazaar && s.bazaar.trades) >= 60 },
  { id: 'bazaar100', name: '百笔成交', icon: '📈', desc: '在深渊集市累计完成 100 笔交易', test: s => (s.bazaar && s.bazaar.trades) >= 100 },
  { id: 'bazaar_t5', name: '星际巨贾', icon: '🛰️', desc: '在深渊集市累计完成 500 笔交易', test: s => (s.bazaar && s.bazaar.trades) >= 500 },
  { id: 'demon_friend', name: '恶魔的朋友', icon: '🤝', desc: '深渊吞噬倒计时终结时选择贿赂深渊——上缴 90% EP，成为深渊的朋友' },
  { id: 'gaze_abyss', name: '同归于尽', icon: '🌑', desc: '深渊吞噬倒计时终结时选择同归于尽——崩溃吞没了你，也杀死了深渊' },
  // v3.6.0 成就扩充（方向②）：覆盖星际/宗教/政策/裂隙/AI/剧情/长线
  { id: 'exped1',    name: '初次远征',   icon: '🛰️', desc: '完成首次星际探索，星图在眼前展开', test: s => (s.expeditionsDone || 0) >= 1 },
  { id: 'exped10',   name: '星海旅人',   icon: '🛰️', desc: '累计完成 10 次星际探索', test: s => (s.expeditionsDone || 0) >= 10 },
  { id: 'exped50',   name: '深空常客',   icon: '🛰️', desc: '累计完成 50 次星际探索', test: s => (s.expeditionsDone || 0) >= 50 },
  { id: 'cps1k',     name: '燃料点火',   icon: '🔥', desc: '星际燃料 CPS 达到 1K', test: s => (s.starCps || 0) >= 1e3 },
  { id: 'cps100k',   name: '星炬燎原',   icon: '🔥', desc: '星际燃料 CPS 达到 100K', test: s => (s.starCps || 0) >= 1e5 },
  { id: 'cosmos1',   name: '宇宙工坊',   icon: '🌌', desc: '启动首个宇宙探索工程', test: s => Object.values(s.cosmos?.lv || {}).filter(v => v >= 1).length >= 1 },
  { id: 'cosmos5',   name: '群星匠人',   icon: '🌌', desc: '五类宇宙工程各至少 1 级', test: s => { const v = s.cosmos?.lv || {}; return ['asteroid','collider','starwish','cinder','beacon','distill'].filter(k => (v[k] || 0) >= 1).length >= 5; } },
  { id: 'faith5k',   name: '信徒如云',   icon: '🙏', desc: '持有 5K 信仰', test: s => (s.faith || 0) >= 5000 },
  { id: 'faith100k', name: '神国降临',   icon: '🙏', desc: '持有 100K 信仰', test: s => (s.faith || 0) >= 1e5 },
  { id: 'temple5',   name: '圣殿巍峨',   icon: '⛩️', desc: '神殿等级达到 Lv.5', test: s => (s.religion?.temple || 0) >= 5 },
  { id: 'relbranch', name: '分道扬镳',   icon: '⛪', desc: '选择一条宗教分支（深渊/秩序/混沌）', test: s => !!s.religion?.branch },
  { id: 'oracle3',   name: '神谕低语',   icon: '🔮', desc: '神谕等级达到 Lv.3', test: s => (s.religion?.oracle || 0) >= 3 },
  { id: 'seal3',     name: '誓约封印',   icon: '📜', desc: '宗教封印等级达到 Lv.3', test: s => (s.religion?.seal || 0) >= 3 },
  { id: 'policy3',   name: '律令初成',   icon: '⚖️', desc: '同时采用 3 项周期政策', test: s => Object.keys(s.policies || {}).length >= 3 },
  { id: 'policy6',   name: '纲纪井然',   icon: '⚖️', desc: '同时采用 6 项周期政策', test: s => Object.keys(s.policies || {}).length >= 6 },
  { id: 'policyruns3', name: '岁月更迭', icon: '🔁', desc: '经历 3 轮政策周期', test: s => (s.policyRuns || []).length >= 3 },
  { id: 'rift5',     name: '裂隙牧者',   icon: '🌀', desc: '累计封印 5 道深渊裂隙', test: s => (s.riftsSealed || 0) >= 5 },
  { id: 'rift20',    name: '裂隙之主',   icon: '🌀', desc: '累计封印 20 道深渊裂隙', test: s => (s.riftsSealed || 0) >= 20 },
  { id: 'ember10k',  name: '余烬成山',   icon: '🕯️', desc: '持有 10K 裂隙余烬', test: s => (s.riftEmber || 0) >= 1e4 },
  { id: 'delve200',  name: '无尽下潜',   icon: '🌑', desc: '深潜达到 200 层', test: s => (s.delve?.depth || 0) >= 200 },
  { id: 'ai_unlock', name: '机械之心',   icon: '🤖', desc: '解锁 AI 助手（科技「AI 管理核心」）', test: s => !!s.tech?.ai_core },
  { id: 'ai_autobuild', name: '自治协议', icon: '🤖', desc: '激活 AI 自动购建', test: s => !!(s.ai && s.ai.autoBuildUnlocked) },
  { id: 'ai_assist', name: '助手编队',   icon: '🤖', desc: '解锁并分配首位 AI 助手', test: s => (s.upgrades?.ai_assist || 0) >= 1 && Object.values(s.ai?.alloc || {}).some(v => v > 0) },
  { id: 'chapter5',  name: '星图展开',   icon: '📖', desc: '剧情推进至第 5 章', test: s => parseInt(s.chapter || '1', 10) >= 5 },
  { id: 'chapter9',  name: '命运分岔',   icon: '📖', desc: '剧情推进至第 9 章', test: s => parseInt(s.chapter || '1', 10) >= 9 },
  { id: 'chapter18', name: '终末序曲',   icon: '📖', desc: '剧情推进至第 18 章', test: s => parseInt(s.chapter || '1', 10) >= 18 },
  { id: 'es10k',     name: '永恒长城',   icon: '💎', desc: '持有 10K ES', test: s => (s.es || 0) >= 1e4 },
  { id: 'reincarn20', name: '二十重劫', icon: '♻️', desc: '完成 20 次轮回', test: s => (s.reincarned || 0) >= 20 },
  { id: 'pt1m',      name: '契约帝国',   icon: '🍪', desc: '持有 1M PT', test: s => (s.pt || 0) >= 1e6 },
  { id: 'dm10m',     name: '深渊富矿',   icon: '🜏', desc: '持有 10M DM', test: s => (s.dm || 0) >= 1e7 },
];

function checkAch() {
  // v2.8.1：成就列表扩充（名称/描述/判定；仅判定不渲染，页面只显示已解锁）
  const tests = ACHIEVEMENTS.filter(a => typeof a.test === "function");
  let unlocked = false;
  for (const a of tests) {
    if (!S.achievements[a.id] && a.test(S)) {
      S.achievements[a.id] = true;
      log(`成就解锁：${a.name}——${a.desc}`, 'good');
      if (toast) toast(`🏆 成就解锁：${a.name}`);
      unlocked = true;
    }
  }
  if (unlocked && document.getElementById('achievement-panel')) renderAchievementPanel(document.getElementById('achievement-panel'));
}

// v2.8.1：成就页面——只显示已解锁成就（达成即点亮，未达成不展示）
const ACH_PAGE_SIZE = 10; // v3.3.3 反馈⑩：成就一页 10 条 + 分页（与班组同范式，会话级页码）
let achPage = 0;
function renderAchievementPanel(container) {
  if (!container) return;
  const defs = ACHIEVEMENTS;
  const got = defs.filter(d => S.achievements[d.id]);
  const n = got.length;
  let html = `<div class="panel" style="padding:14px">
    <h3 style="margin-top:0;color:var(--purple)">🏆 深渊成就 <span style="font-size:12px;font-weight:400;color:var(--text-2)">已解锁 ${n}/${defs.length} · 只显示已达成项</span></h3>
    <p style="font-size:12px;line-height:1.8;color:var(--text-2);margin:4px 0 10px">成就跨转生保留，达成即时点亮。未达成的成就不会显示——深渊只记录已发生的奇迹。</p>`;
  if (n === 0) {
    html += `<div style="font-size:13px;color:var(--text-3);padding:18px 0;text-align:center">尚未解锁任何成就——一切才刚刚开始。</div>`;
  } else {
    // v3.3.3 反馈⑩：一页 10 条 + 分页（页码会话级，新达成项自动钳回最后一页）
    const pageCount = Math.max(1, Math.ceil(n / ACH_PAGE_SIZE));
    if (!Number.isFinite(achPage) || achPage < 0) achPage = 0;
    if (achPage >= pageCount) achPage = pageCount - 1;
    const start = achPage * ACH_PAGE_SIZE;
    for (const a of got.slice(start, start + ACH_PAGE_SIZE)) {
      html += `<div class="ach-card" style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin:6px 0;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">${a.icon}</span>
        <div style="flex:1">
          <div style="font-weight:600;color:var(--good)">${a.name}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:1px">${a.desc}</div>
        </div>
      </div>`;
    }
    if (pageCount > 1) {
      html += `<div class="crew-pager" style="margin-top:8px">
        <button data-ach-page="prev" ${achPage <= 0 ? 'disabled' : ''}>‹ 上一页</button>
        <span>第 ${achPage + 1} / ${pageCount} 页 · 共 ${n} 项</span>
        <button data-ach-page="next" ${achPage >= pageCount - 1 ? 'disabled' : ''}>下一页 ›</button>
      </div>`;
    }
  }
  html += '</div>';
  container.innerHTML = html;
  // v3.3.3 反馈⑩：分页按钮事件委托（容器级，重建不丢）
  if (!container._achDelegated) {
    container._achDelegated = true;
    container.addEventListener('click', (ev) => {
      const btn = ev.target.closest ? ev.target.closest('[data-ach-page]') : null;
      if (btn && !btn.disabled) {
        achPage += btn.dataset.achPage === 'prev' ? -1 : 1;
        renderAchievementPanel(container);
      }
    });
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
let lastAffordCheck = 0; // v3.0.5 反馈②：可购买态（灰态/价格）快刷节拍——原与 5s 解锁检测同块，玩家感知「能不能买」滞后严重
let _relicSig = ''; // v3.3.7 反馈①：遗物面板结构签名（gate/等级/净化节点/解锁）——变化才整面重建，杜绝周期性闪烁
let lastUnlockedCount = -1;
let lastProjRender = 0;      // v2.0：任务面板 1s 节流重绘
let tideCachePhase = -1;     // v2.0：潮汐脏检查缓存
let tideCacheTimer = -1;
let corruptionCacheFloor = -1; // v2.0：腐化脏检查缓存
let wageStateCache = '';      // v2.9.2 ②：线程薪资状态变化脏检查（dormant/losing 触发离职礼盒按钮出现）
let lastAiUnlocked = false;  // v1.3 A：AI 核心解锁变化检测
let lastAbVisible = false;   // v3.2.4 反馈④：自动购建区块（已激活或全资源解锁）显隐检测
let lastAbEpOk = false;      // v3.2.4 反馈④：激活按钮 EP 充足态检测（原 disabled 后 EP 攒够不刷新 → 按钮永久禁点）
let lastGateHash = '';       // v2.0 P1-1：门控状态变化检测

let frame = 0; // v2.7.4 ①：遗物 gate 周期刷新用计数器
let _codeRainStarted = false, _codeRainTimer = null; // v3.0.0：前置声明（配合 __advance 时间加速，消除 TDZ）
function tick(now) {
  frame++;
  const rawDt = (now - lastTick) / 1000;
  const dt = Math.max(0, Math.min(10, rawDt)); // v2.8.1：dt 上限 1→10s——掉帧/切后台不丢真实计时；v3.0.0：下限钳 0（时钟回拨/加速注入防负时间）
  // v3.3.5 反馈③：后台限流/挂起被钳掉的时间记账（单次上限 30 分钟）——供裂隙计时补偿，
  // 原上限 60s 导致「挂后台 2 小时回来，裂隙只推进 70 秒」，裂隙长期不出现
  if (rawDt > 10) S._riftCatchup = Math.min(1800, (S._riftCatchup || 0) + Math.min(rawDt, 1800) - 10);
  lastTick = now;
  if (S.paused) {
    updatePausePreview(); // v2.5 ⑥：暂停弹框实时刷新（预计离线时间/收入）
    dirty.top = true; dirty.prestige = true;
    render();
    return;
  }
  // v2.8.7：打开存档管理时暂停所有产出/计时（防存档窗口内进度漂移）
  const snapOpen = document.getElementById('snap-modal') && document.getElementById('snap-modal').style.display === 'flex';
  if (snapOpen) { lastTick = now; return; }
  // v2.9.0 优化②：模态暂停（确认/抉择弹框打开期间一切计时暂停；绝对时间戳恢复时顺延）
  if (modalPauseAt) { lastTick = now; return; }

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
  S.earnedFull = (S.earnedFull || 0) + credited; // v2.8.10：任务进度钳后口径（EP 达上限后不再累计）
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
  // v2.8.30 ④：EP 跌破近满线且持续 afterSec 即解除（对称缓冲）——避免消耗基数过低导致 EP 不跌、懒惰文案永不消失
  const lazyAfterMs = (BALANCE.lazy?.afterSec || 60) * 1000;
  if (isLazy()) {
    if (S.ep <= 0) { S.lazySince = null; S.lazyLowSince = null; }
    else if (S.ep < capNow * 0.98) {
      if (!S.lazyLowSince) S.lazyLowSince = now;
      if (now - S.lazyLowSince >= lazyAfterMs) S.lazySince = null;
    } else S.lazyLowSince = null;
  } else if (S.ep >= capNow * 0.98) {
    if (!S.lazySince) S.lazySince = now;
    S.lazyLowSince = null;
  } else {
    S.lazySince = null; S.lazyLowSince = null;
  }

  // v2.8.30 ⑤：灵感工坊自动蒸馏（研究点开关）——消耗 EP 转化 RP（v3.2.2 反馈①：EP 不足自然暂停，回升自动恢复，不再自动关闭）
  const atriumN = S.upgrades && S.upgrades.atrium ? S.upgrades.atrium : 0;
  // v3.3.0：灵感工坊绑定开关（关闭→停止蒸馏、释放绑定→线程消耗恢复）
  const atriumOn = converterEnabled('atrium'); // v3.3.1：统一口径（班组/快捷开关/研究点任一处关闭都生效）
  // v3.3.9 反馈⑦：满仓即停——RP 达到上限时不产出也不消耗（开关保持开启，腾出空间自动恢复）
  // v3.4.6 反馈⑦：满仓涓流——满仓后每 5s 一条批量转化（-50K EP → +0.01 RP），替代「完全断流」：
  //   每秒不再烧 EP，涓流让上限提升后蒸馏管线始终有活水（批量直接入账，不受上限截断）
  const atriumRpFull = (S.rp || 0) >= rpCap();
  if (atriumN > 0 && atriumOn && S.ep > 0 && !atriumRpFull) {
    const epNeed = (BALANCE.atrium.epRate || 150) * atriumN * dt;
    const used = Math.min(S.ep, epNeed);
    S.ep -= used;
    // v3.3.3 反馈③（根因修复）：原公式 used/epRate × rate × atriumN 隐含 ×N²（used 已含 N）——
    // 卡面宣称 +0.15×N RP/s 实际产出 0.15×N²，中期 RP 泛滥的元凶。改为严格线性：
    // RP = 实扣 EP × (rate/epRate) × 绑定加成 ÷ 效率递增系数
    // v3.4.6 反馈⑤：绑定加成封顶 ×2（rpProdPerSec 同口径——否则高绑定下汇率被压穿、RP 近乎免费）
    addRp(used * ((BALANCE.atrium.rate || 0.15) / (BALANCE.atrium.epRate || 150)) * Math.min(converterThreadBoost('atrium'), 2) / rpEffScale());
  } else if (atriumN > 0 && atriumOn && atriumRpFull) {
    // v3.4.6 反馈⑦：满仓涓流（每 5s：-50K EP → +0.01 RP；EP 不足 50K 时不扣）
    S._atriumTrickle = (S._atriumTrickle || 0) + dt;
    if (S._atriumTrickle >= 5) {
      S._atriumTrickle = 0;
      if ((S.ep || 0) >= 50000) {
        S.ep -= 50000;
        S.rp = (S.rp || 0) + 0.01; // 涓流直入账（微量溢出可接受，腾空间后恢复正常蒸馏）
        // v3.4.8 反馈④：不再写日志——每 5s 一条会把日志刷满，机制照常生效（可在资源数字上看到）
      }
    }
  }

  // 线程薪资 —— v1.3 模块 C：四态状态机（满薪/欠薪降效/强制休眠/流失预警），
  // 替代 staffUnhappy 隐藏计数器（旧字段保留读兼容）；个体 mood 在状态机内正交叠加
  tickWages(dt);

  // v3.3.0 线程等级推进（在岗累积 XP → 刷新等级；合适岗位涨得快）
  const leveled = tickThreads(dt);
  for (const nm of leveled) { log(`线程【${nm}】晋升，班组调度经验提升`, 'good'); if (toast) toast(`🎖️ 线程【${nm}】晋升！`); }

  // v3.1.0 反馈③：线程个人「累计贡献」——按实际入账 CPS 份额分摊到每条线程（休眠 ×0 时自然停止累计）
  if (S.cultists.length > 0) {
    const credited = computeCps() * dt;
    const totalNominal = staffOutputPerSec();
    if (credited > 0 && totalNominal > 0) {
      for (const c of S.cultists) {
        const nom = (c.output || 3) * 0.8 * (MOOD_MULT[c.mood] || 1);
        c.earned = (c.earned || 0) + credited * (nom / totalNominal);
      }
    }
  }

  // 资源型模块产出
  for (const u of UPGRADES) {
    if (!u.produces) continue;
    const n = S.upgrades[u.id] || 0;
    if (n === 0) continue;
    const p = u.produces;
    if (p.type === 'rp') addRp(p.rate * n * dt); // v2.8.27 ②：RP 上限
    else if (p.type === 'pt') addPt(p.rate * n * dt); // v2.8.27 ②：PT 上限
    else if (p.type === 'fa_chance') {
      if (Math.random() < p.rate * n * dt) {
        S.faith = (S.faith || 0) + 1;
        log(`神龛显灵：+1 FP`, 'good');
      }
    }
  }

  // v2.5.7 宗教：圣所信仰产出 + 入口/面板状态刷新
  tickReligion(dt);
  policyTickRefresh(); // v2.8.6 B2a：政策开放组变化刷新
  // v2.6.0 深潜：深潜产出/腐化/里程碑（v3.0.0：含 EP 维持开销）
  tickDelve(dt);
  // v3.0.0：深渊集市——汇率波动 / 库存自然恢复
  tickBazaar(dt);
  // v3.0.3 反馈⑫：饼干蒸馏（消耗 EP 自动产饼干）
  // v3.2.1 反馈①：自动孵化需先购买「孵化升级」解锁（S.ptAutoHatch），不再开局直给
  // v3.2.2 反馈①：去除「EP 归零自动停」——开关保持玩家手动控制，EP 不足时 take=0 自然暂停，回升自动恢复
  // v3.3.9 反馈⑦：PT 达到存储上限后不再生产、不再扣 EP（原实现直接 S.pt += 无视上限，溢出后继续烧 EP）
  if (S.ptAutoHatch === true && S.ptDistillOn === true) {
    const hatchLv = (S.ptHatchLv || 1); // v3.0.3 第四批③：孵化升级——每级消耗/产量 ×级数
    const hatchCfg = BALANCE.hatch || { epPerSec: 15000, epPerPt: 150000 };
    const ptRoom = Math.max(0, ptCap() - (S.pt || 0));
    // v3.4.4：门槛从 1e-9 抬到 1 PT——满仓后出战异兽每秒扣掉 0.02 PT 会让「剩余容量」始终留一线，
    // 旧实现随即每帧补那一线，EP 按 15 万/PT 被持续烧掉（满仓状态形同虚设）。留 1 PT 余量即视为满仓。
    if (ptRoom >= 1) {
      // v3.4.0 反馈③：EP 消耗与 PT 汇率统一走 BALANCE.hatch（15000 EP/s/级 ÷ 15 万 EP/PT = 0.10 PT/s/级）
      // 线程加成同时作用于「消耗」与「产出」——否则人越多单位 PT 越便宜（旧口径 5000 EP/s 固定，PT/s 却 ×boost）
      const boost = converterThreadBoost('hatch'); // v3.3.3 反馈⑦：绑定线程参与孵化（只放大 EP 消耗，PT 按汇率等比例产出）
      const need = hatchCfg.epPerSec * hatchLv * boost * dt;
      const rate = 1 / Math.max(hatchCfg.epPerPt, 1); // PT/EP：线程不再二次放大汇率（否则人越多单位 PT 越便宜）
      // 满仓前最后一帧只按剩余容量折算消耗，避免溢出的那部分 EP 白烧
      const needClamped = Math.min(need, ptRoom / Math.max(rate, 1e-12));
      const take = Math.min(needClamped, S.ep);
      S.ep -= take;
      // v3.3.3 反馈⑦：绑定线程参与孵化（饲育师匹配岗位加成更高）——与灵感工坊同范式
      S.pt = Math.min(ptCap(), (S.pt || 0) + take * rate);
    } else {
      // v3.4.6 反馈⑦：满仓涓流（每 5s：-50K EP → +0.01 PT）——满仓不烧 EP，涓流让异兽维持与孵化管线不断流
      S._ptTrickle = (S._ptTrickle || 0) + dt;
      if (S._ptTrickle >= 5) {
        S._ptTrickle = 0;
        if ((S.ep || 0) >= 50000) {
          S.ep -= 50000;
          S.pt = (S.pt || 0) + 0.01;
          // v3.4.8 反馈④：满仓涓流不再写日志（与 RP 涓流同口径，避免日志被刷屏）
        }
      }
    }
  }
  // v3.4.6 反馈③：星际燃料燃烧——燃料模式开启时每秒消耗 2 CPS，全局产出 ×1.5（globalMult）；
  // CPS 耗尽自动熄火（一次性提示，不刷屏）
  if (S.fuelMode) {
    const burn = 2 * dt;
    if ((S.starCps || 0) >= burn) {
      S.starCps -= burn;
    } else {
      S.starCps = 0;
      S.fuelMode = false;
      log('星际燃料耗尽：燃料模式已熄火（全局加成失效）', 'warn');
    }
  }
  // v3.2.1 反馈⑨：出战异兽存活维持——每秒消耗 PT（随等级/世代增长），PT 归零即休战（见 pets.petStarving）
  const petUpkeep = petUpkeepTotalPerSec();
  if (petUpkeep > 0 && (S.pt || 0) > 0) S.pt = Math.max(0, (S.pt || 0) - petUpkeep * dt);
  // v3.2.3 反馈⑥：休战/复出战过渡可见——进入休战（回家）与恢复各记一条日志（边缘触发，不刷屏）
  const petStarvingNow = petStarving();
  if (petStarvingNow && !S._petStarving) log('PT 耗尽：出战异兽已回家休战（加成失效，不再消耗维持）', 'warn');
  else if (!petStarvingNow && S._petStarving) log('PT 回升：异兽重新出战', 'good');
  S._petStarving = petStarvingNow;
  // v3.0.5 反馈②：tab 入口显隐（纯 display 开关，零重建）1s 快刷——原 5s 导致「条件已达成但入口迟迟不出现」
  S._religCheckTimer = (S._religCheckTimer || 0) + dt;
  if (S._religCheckTimer >= 1) {
    S._religCheckTimer = 0;
    refreshTabVisibility(); // 宗教/深潜/星图/裂隙/遗物/政策/集市入口条件达成后出现
    if (typeof refreshReligionAffordability === 'function') refreshReligionAffordability();
    // v3.3.5 反馈③：裂隙倒计时每秒原地刷新（首列常驻卡 + 裂隙页签），让「裂隙会不会来」可见可验证
    if (S._riftSeen && !S.activeRift && !S.riftExpedition) dirty.rift = true;
    const etaLabelEl = document.getElementById('rift-eta-label');
    const etaTabEl = document.getElementById('rift-eta-tab');
    if (etaTabEl) {
      // v3.4.0 反馈①：裂隙在场时该行改语义（当前裂隙 · 剩余 Xs），不再显示「下次裂隙 0 秒」
      if (S.activeRift) {
        if (etaLabelEl) etaLabelEl.textContent = '当前裂隙';
        etaTabEl.textContent = `进行中 · 剩余 ${fmtEta(Math.max(0, Math.ceil((S.activeRift.expiresAt - Date.now()) / 1000)))}`;
      } else {
        if (etaLabelEl) etaLabelEl.textContent = '下次裂隙';
        etaTabEl.textContent = fmtEta(riftEtaSec());
      }
    }
  }
  // v2.6.0 / v3.0.0：深潜与集市面板为 innerHTML 重建（无内容签名跳过），保持 5s 低频——1s 重建会吞点击/闪烁
  S._panelCheckTimer = (S._panelCheckTimer || 0) + dt;
  if (S._panelCheckTimer >= 5) {
    S._panelCheckTimer = 0;
    if (delveUnlocked()) dirty.delve = true;
    if (bazaarUnlocked()) dirty.bazaar = true;
  }

  // 深渊裂隙
  const hadRift = !!S.activeRift;
  tickRift(dt);
  if (!!S.activeRift !== hadRift || S.activeRift) dirty.rift = true;

  // v3.4.9 反馈②：自动净化仪——腐化每涨 5% 自动净化 5%（EP 充足时；EP 不足则暂停等待，不报错刷屏）
  if (S.autoPurify && riftUpgradeLevel('auto_purify') >= 1) {
    const step = 5;
    // 基准点 = 上一次净化后的腐化值；首帧从 0 起算（不能对齐到当前值，否则永远差 5% 才触发一次）
    if (!(S._autoPurifyMark >= 0)) S._autoPurifyMark = 0;
    // 腐化大幅回落（手动净化 / 贿赂清零）→ 基准跟着下来，避免旧基准把下一次触发推得很晚
    if ((S.corruption || 0) < S._autoPurifyMark - 2) S._autoPurifyMark = Math.max(0, S.corruption || 0);
    if ((S.corruption || 0) >= S._autoPurifyMark + step) {
      const cost = Math.ceil(purgeCostFor(step) * riftPurgeCostMult());
      if ((S.ep || 0) >= cost) {
        S.ep -= cost;
        S.corruption = Math.max(0, (S.corruption || 0) - step);
        S._autoPurifyMark = Math.max(0, S.corruption || 0);
        dirty.corruption = true; dirty.top = true;
      } else {
        S._autoPurifyMark = (S.corruption || 0) - step; // EP 不足：不反复重试，等 EP 回升/腐化再涨 5%
      }
    }
  }

  // v1.3 模块 D：载具被动采集 DM（60s roll，到账走 [采集] 日志）
  // v2.9.0 Bug④：'transition' = 自动暂停↔恢复切换 → 同步刷新探采页头（EP 不足自动暂停提示）
  const vehChanged = tickVehicleCollect(dt);
  if (vehChanged) { dirty.top = true; if (vehChanged === 'transition') dirty.shop = true; }

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
  tickColonies(dt); // v2.8.3 深空殖民：RP 产出结算
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
    S.chapterEnteredAt = Date.now(); // v3.6.0 方向⑥：重置章节驻留计时
    dirty.story = true;
    // v2.8.5 A3：章节解锁持久化写入图鉴（进入即记录，跨周期保留——图鉴不再依赖即时状态推断）
    S.chaptersUnlocked = S.chaptersUnlocked || {};
    const slId = S.storyline && S.storyline !== 'default' ? S.storyline : 'line_order';
    S.chaptersUnlocked[slId] = S.chaptersUnlocked[slId] || [];
    if (!S.chaptersUnlocked[slId].includes(parseInt(chNowStr, 10))) S.chaptersUnlocked[slId].push(parseInt(chNowStr, 10));
    // v2.8.3：章节转变触发明显事件——toast + 日志 + 章节馈赠（RP 克制奖励）
    const chId = parseInt(chNowStr, 10);
    const gift = Math.max(5, chId * 5);
    addRp(gift); // v3.0.8：受 RP 上限约束
    const chName = chNow.name || `第 ${chId} 章`;
    if (toast) toast(`📖 进入${chName}：章节馈赠 +${gift} RP`);
    log(`章节推进：${chName}——时间线向前折叠，+${gift} RP 馈赠`, 'good');
    dirty.top = true;
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
  ensureCodeRain(); // v2.8.4 ⑤：编译器神殿——青色代码雨粒子（低调，持有即启）

  // v2.2 岔路口状态机推进（每帧幂等；替代 v2.0 弹窗强制选择）
  updateCrossroad();

  maybeTriggerEvent();

  // v3.3.1 反馈③：预言系统（信仰线科技 prophecy）真正生效——神谕广播预告下一个随机事件；
  // 预告写入 S.prophecyNext，事件触发时优先兑现（events.maybeTriggerEvent）
  // v3.3.3 反馈④：广播频率 30s → 10 分钟（原频率刷屏且事件 4-7h 才触发一次，预言形同虚设）；
  // 广播时若下一次事件过远（>15 分钟）则把事件提前到 5-15 分钟内——保证预言「真实生效、当场可验证」
  if (hasTech('prophecy')) {
    S._prophecyTimer = (S._prophecyTimer || 0) + dt;
    if (S._prophecyTimer >= 600) {
      S._prophecyTimer = 0;
      const nxt = peekNextEvent();
      if (nxt) {
        const changed = !S.prophecyNext || S.prophecyNext.id !== nxt.id;
        // v3.3.5 反馈②：广播同时给出事件效果（如「顿悟」+80 RP），不再只报名字
        S.prophecyNext = { id: nxt.id, name: nxt.name, type: nxt.type, desc: nxt.desc || '', at: Date.now() };
        if (changed) {
          log(`🔮 神谕广播：下一个事件将是「${nxt.name}」——${nxt.desc || '效果未知'}`, 'good');
          const wait = S.nextEventAt - Date.now();
          if (wait > 15 * 60 * 1000) S.nextEventAt = Date.now() + (5 + Math.random() * 10) * 60 * 1000; // 预言事件限时兑现
          dirty.ai = true;
        }
      } else if (S.prophecyNext) {
        S.prophecyNext = null;
      }
    }
  }

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
  // v2.9.2 ②：线程薪资状态变化（进入/离开 dormant·losing）触发离职礼盒按钮出现/隐藏
  const wageSt = (S.wageState || {}).state || 'ok';
  if (wageSt !== wageStateCache) {
    wageStateCache = wageSt;
    dirty.hero = true; dirty.top = true;
  }
  // v2.9.0：吞噬倒计时期间每秒强制刷新横幅（腐化钉在满额时 floor 不再变化，倒计时文本需独立节拍）
  if (S._collapseAt || S.collapsed || S._collapseChoicePending) {
    S._collapseUiTimer = (S._collapseUiTimer || 0) + dt;
    if (S._collapseUiTimer >= 1) { S._collapseUiTimer = 0; dirty.corruption = true; }
  } else {
    S._collapseUiTimer = 0;
  }

  // v2.1 R2：仅保留纯文本刷新的脏标记（top/hero 只更新 textContent，不重建可点击节点）；
  // 移除旧版无条件 dirty.projects —— 任务面板 100ms 全量重建是「奖励领不了」的根因
  dirty.top = true; dirty.hero = true;
  // v2.7.5 ①：晋升面板（含轮回区块）与故事线面板重建降频至每 2s——
  // 原每 tick 无条件置位 → renderPrestige+renderReincarn+renderStorylinePanel 每 100ms innerHTML 重建
  // → 晋升/轮回/岔路口按钮每帧被替换 → 慢速点击（mousedown/mouseup 间隔 >100ms）丢失（「大量点击才成功一次」）
  // → 轮回卡/岔路口卡 hover 每帧替换闪烁。购买/转生等事件仍即时置位，此处仅降频兜底刷新
  if ((frame % 20) === 0) { dirty.prestige = true; dirty.story = true; dirty.storyline = true; dirty.achievements = true; } // v3.2.4 反馈②：右列故事线/成就随 2s 兜底刷新

  // v2.7.4 ①：遗物 gate 状态周期刷新——v3.3.7 反馈①：不再无条件每 2s 整面重建！
  // 原实现 dirty.relics 每 2s 置位 → renderRelics 每 2s innerHTML 全量替换 → 按钮/卡片每 2s 销毁重建，
  // hover 一直闪烁、慢速点击（mousedown→mouseup 间隔跨重建点）被吞——「净化节点存活 68DM 消耗 50 一直闪烁无法购买」
  // 现改为结构签名比对：仅 gate/等级/解锁结构变化时才整面重建；可购态（DM 够不够）由 300ms
  // refreshRelicAffordability 原地维护（纯 class/disabled 切换，不动 DOM 结构，零闪烁）
  const relicSigNow = RELICS.map(r => `${r.id}:${relicLevel(r.id)}:${r.gate() ? 1 : 0}`).join(',')
    + `|P:${['purifier1', 'purifier2', 'purifier3'].map(id => (S.upgrades && S.upgrades[id]) || 0).join('.')}`
    + `|T:${(S.tech && S.tech.entropy_reduce) ? 1 : 0}`
    + `|U:${relicsUnlocked() ? 1 : 0}`;
  if (relicSigNow !== _relicSig) { _relicSig = relicSigNow; dirty.relics = true; }

  // v3.0.5 反馈②：可购买态快刷（灰态/价格，纯 class/textContent 原地更新不重建 DOM）——300ms
  // 原实现与 5s 解锁检测同块执行，导致「EP 已够但卡片仍灰」「新解锁卡片迟迟不出现」肉眼可见延迟
  if (now - lastAffordCheck > 300) {
    lastAffordCheck = now;
    refreshTechState();
    refreshShopAffordability(); // 主商店/线程/载具/深渊商店/设施/效能建筑/岔路口/族升级灰态
    refreshRelicAffordability(); // v2.8.26：遗物/净化 DM 可购
    refreshPetsAffordability(); // v2.8.26：宠物 PT 可购
    refreshReligionAffordability(); // v2.8.26 ④：宗教按钮可购
    refreshRiftAffordability(); // v2.8.26 ④：裂隙余烬/深入按钮可购
    refreshExpeditionAffordability(); // v3.0.5 反馈②：深空殖民 / 宇宙探索卡片可购态
    const riftTechEl2 = document.getElementById('rift-tech-list'); // v3.3.9 反馈⑤：裂隙等级卡可购态
    if (riftTechEl2) renderRiftLevelTech(riftTechEl2);
  }

  // v2.6.7：商店解锁检测（链窗揭示 + toast），v3.0.5 由 5s 收紧到 1s；
  // 解锁数变化只增量揭示新卡（refreshShopChain），不整面板重建——保持「不每秒全重建」的防闪烁纪律
  if (now - lastShopCheck > 1000) {
    lastShopCheck = now;
    // v3.6.2 反馈①：班组面板 ≥10 条线程后才显示（达标即持久解锁，跨转生保留）——未解锁整卡隐藏、不渲染
    const crewVisible = crewShown();
    const crewCard = document.getElementById('crew-card');
    if (crewCard && crewCard.style.display !== (crewVisible ? '' : 'none')) crewCard.style.display = crewVisible ? '' : 'none';
    if (crewVisible) renderCrewPanel(document.getElementById('crew-panel')); // v3.1.0 反馈③：班组面板（内部 sig 增量 + 动态数值原地刷新）
    renderPetGrid(document.getElementById('pet-grid')); // v3.2.1 反馈⑥⑨：孵化文案/维持消耗/休战提示随周期刷新（内部 html 签名去重，无闪烁）
    renderQuickSwitches(); // v3.2.2 反馈①：自动转化快捷开关（解锁态/开关态随周期同步，sig 去重）
    // v3.3.1 反馈①②：设施区（灵感工坊 / 异兽孵化工坊）卡的揭示随周期检测——
    // 只在「应显示 ↔ 未显示」翻转时整列表重建（避免每秒重建按钮致点击丢失）
    const bldHost = document.getElementById('building-list');
    if (bldHost) {
      const base = BALANCE.atrium.base || 5e4;
      const atrOwned = (S.upgrades && S.upgrades.atrium) || 0;
      const shouldAtr = atrOwned >= 1 || (S.ep || 0) >= base * 0.3 || (S.allTimeEp || 0) >= base * 0.3;
      const hasAtr = !!bldHost.querySelector('.atrium-distill');
      const shouldHatch = S.ptAutoHatch === true || (S.resDiscovered && S.resDiscovered.pt) || (S.pt || 0) > 0 || (S.ptHatchLv || 1) > 1;
      const hasHatch = !!bldHost.querySelector('.hatch-upg');
      if (hasAtr !== shouldAtr || hasHatch !== shouldHatch) dirty.shop = true;
    }
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
    // v1.3 A：AI 核心研究完成后面板出现（也覆盖晋升保留 ai_core 的场景）
    const aiNow = aiUnlocked();
    if (aiNow !== lastAiUnlocked) { lastAiUnlocked = aiNow; dirty.ai = true; }
    // v3.2.4 反馈④：自动购建区块在「全资源解锁/已激活」翻转时刷新 AI 面板（激活后区块形态切换）；
    // EP 充足态翻转同样刷新——否则激活按钮渲染时 EP 不足被 disabled，攒够后面板不重渲染 → 永久禁点
    const abNow = aiNow && (autoBuildUnlocked() || allResDiscovered(S));
    if (abNow !== lastAbVisible) { lastAbVisible = abNow; dirty.ai = true; }
    else if (abNow && !autoBuildUnlocked()) {
      const epOkNow = (S.ep || 0) >= autoBuildActivateCost();
      if (epOkNow !== lastAbEpOk) { lastAbEpOk = epOkNow; dirty.ai = true; }
    }
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
  ensureAbyssGaze(S.abyssGazeUnlocked); // v3.4.2：已解锁凝视深渊则重载后裂开常驻

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
  setCollapseHooks(log, toast, showCollapseChoice); // v2.8.3：深渊吞噬日志/toast；v2.9.0：终结抉择弹框
  setDelveToastFn(toast); // v2.6.0：深潜日志/toast
  setBazaarLogFn(log); setBazaarToastFn(toast); // v3.0.0：深渊集市

  dirty.top = true; dirty.hero = true; dirty.shop = true; dirty.tech = true; dirty.relics = true; // v2.7.0：深渊遗物
  dirty.pets = true; dirty.prestige = true; dirty.projects = true; dirty.story = true;
  dirty.rift = true; dirty.expedition = true; dirty.riftTab = true;
  dirty.tide = true; dirty.corruption = true; dirty.ai = true;
  dirty.religion = true; dirty.delve = true; dirty.bazaar = true; // v3.0.0：集市
  dirty.storyline = true; dirty.achievements = true; // v3.2.4 反馈②：右列常驻面板开档即渲染

  // v2.1：旧档迁移一次性提示（PM 4.2 玩家沟通口径；localStorage 防重）
  if (S._v21Migrated && !localStorage.getItem('v21_migrated_toast')) {
    localStorage.setItem('v21_migrated_toast', '1');
    toast('存档已升级：旧研究的效力已折算进建筑体系，详见科技树说明卡');
  }

  bindEvents();
  render();
  // v2.9.0：旧档兼容——已崩溃/待抉择的存档重开时直接弹出命运抉择（不再走「转生脱离」旧路径）；
  // 已过期的 _collapseAt 由首帧 tickCollapse 触发抉择，无需在此处理
  if (S.collapsed || S._collapseChoicePending) showCollapseChoice();

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

// v2.9.1：暴露游戏状态到 window 供调试 / 自动化测试访问（存档类游戏，无敏感信息）
if (typeof window !== 'undefined') {
  window.S = S; window.__gameDirty = dirty;
  // v3.0.0 QA：自动化加速回放钩子（不改变正常玩法，仅暴露句柄供测试驱动时间加速与转生）
  window.__tick = tick;
  window.__advance = (sec) => { const n = Math.max(1, Math.ceil(sec / 10)); let t = performance.now(); for (let i = 0; i < n; i++) { t += 10000; tick(t); } };
  window.__qa = { doPrestige, doReincarn, canPrestige, reincarnReady, computeCps, epStorageCap, prestigeNeed, prestigeGain, totalDrainPerSec, staffSalaryPerSec, staffOutputPerSec,
    rpCap, dmCap, ptCap, // v3.4.4 反馈①：三仓库上限（逐级扩容）测试钩子
    faithCap, // v3.5.0 ②：FP 上限（已从圣所搬到誓约圣龛）测试钩子
    rpEffScale, // v3.3.3 反馈③：RP 效率递增系数（测试钩子）
    riftEtaSec, riftNextSec, // v3.3.5 反馈③：裂隙倒计时/下次间隔（测试钩子）
    vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, vehicleDmPerMin, // v3.3.6：探采汇率/乘区/结算口径（测试钩子）
    // v3.3.0 线程绑定系统 QA 钩子
    threadBind: { bindThread, unbindThread, autoAssignThreads, leaderCount, converterThreadBoost, threadLevelFromXp, rollProfession, aiSuggestedProfession, tickThreads },
  };
}


// ========== v2.8.4 ⑤：编译器神殿——青色代码雨粒子（背景特效） ==========
// v2.8.21 ①：setInterval 替代 RAF（headless/低功耗环境 RAF 可能暂停 → 粒子不绘制）；字符可见度 0.22→0.45
// v3.0.0：_codeRainStarted / _codeRainTimer 已前置声明于主循环区
function ensureCodeRain() {
  const canvas = document.getElementById('code-rain');
  if (!canvas) return;
  const owned = (S.upgrades && S.upgrades.compiler_temple) >= 1;
  if (!owned) {
    canvas.style.display = 'none';
    if (_codeRainTimer) { clearInterval(_codeRainTimer); _codeRainTimer = null; }
    _codeRainStarted = false;
    return;
  }
  if (_codeRainStarted) return;
  _codeRainStarted = true;
  canvas.style.display = '';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const CHARS = '01<>/\\{}[]=+*#%&αβγδεθλμπΣΩ§¶†‡';
  const COLS = Math.floor(canvas.width / 10); // v2.8.26：列距 16→10——1440 宽 144 列，字符雨密度再翻倍（上一轮截图仍被用户判定「没有」）
  // v2.9.1 impeccable：列速随机化（0.22~0.48）——同屏字符流速参差，破除整齐感，更接近 Matrix 真实雨幕
  const drops = new Array(COLS).fill(0).map(() => ({ y: Math.random() * -80, v: 0.22 + Math.random() * 0.26 }));
  const drops2 = new Array(COLS).fill(0).map(() => ({ y: Math.random() * -80 + 40, v: 0.22 + Math.random() * 0.26 })); // 双层雨：每列两串字符错位下落，同屏字符 ×2
  const FONT = 18; // 18px 配合 10px 列距——字符紧凑成流
  // resize 重设画布尺寸
  window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
  _codeRainTimer = setInterval(() => {
    if (!_codeRainStarted) return;
    if (document.hidden) return; // v2.9.0 优化⑤：标签页隐藏时跳过绘制（节省 CPU/电池，回归前台无缝续绘）
    ctx.fillStyle = 'rgba(8,6,14,0.10)'; // 拖尾加深——字符尾迹连成光流
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold ' + FONT + 'px monospace';
    for (let i = 0; i < COLS; i++) {
      const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
      const d = drops[i];
      const y = d.y * FONT;
      // v2.9.1 impeccable：偶发紫色「故障」字符（~2%）——破除纯青单调，呼应深渊紫主题
      const glitch = Math.random() < 0.02;
      ctx.fillStyle = glitch ? 'rgba(163,113,247,1)' : 'rgba(102, 255, 224, 1)';
      ctx.fillText(ch, i * 10, y);
      ctx.fillStyle = 'rgba(230, 255, 250, 1)'; // 列首白光
      ctx.fillText(ch, i * 10, y - FONT);
      d.y += d.v;
      if (y > canvas.height && Math.random() > 0.972) d.y = 0;
      const d2 = drops2[i];
      const y2 = d2.y * FONT;
      ctx.fillStyle = 'rgba(80, 220, 200, 0.95)';
      ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * 10, y2);
      d2.y += d2.v;
      if (y2 > canvas.height && Math.random() > 0.972) d2.y = 0;
    }
  }, 60);
}
