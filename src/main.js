import { S, save, reset, SAVE_KEY, SAVE_VERSION } from './state.js'; // v2.5 ⑤：SAVE_KEY/SAVE_VERSION 供存档导出/导入
import { fxBest } from './core/effectEngine.js'; // v2.1 建筑驱动：点击暴击掷骰参数
import { fmtDepletionEta, epDepletionSec } from './core/format.js'; // v3.10.2 ②：顶栏 EP 耗尽预估（纯函数）
import {computeCps, staffSalaryPerSec, staffOutputPerSec, staffNetPerSec, cpsBreakdown, drainBreakdown, totalDrainPerSec,
  fmt, fmtTime, epStorageCap, clickMult, globalMult, setCollapseHooks, esDiscovered, collapseRemainMs,
  prestigeNeed, prestigeGain, bulkCostCalc, // v3.6.4 ④：两条购买路径同口径 QA 钩子（unitCost 已在下方导入）
  staffCost, focusCost, costMult, hasTech, petCount, elv, totalOwned, techCount,
  offlineRate, offlineCap, offlineEffRate, addEp, // v3.2.4 反馈⑤：offlineEffRate 统一离线效率口径（含离线协议研究）
  tidePhaseInfo, tideMult, corruptionPenalty, purifierCleanRate, tickCorruption,
  cancelCollapse, purgeCostFor, purgeDmFor, addDm, // v2.9.0：吞噬自救 + 主动净化经济
  wageDebtMult, wageKeepCostMult, wageLoseChance, // v1.3 C：四态徽章展示用
  isLazy, lazyProdMult, lazyCostMult, // v2.7.1：线程懒惰态（EP 满上限惩罚）
  rpDistillRate, vehicleDmPerMin, vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, rpEffScale, // v2.7.4 ⑦：RP 蒸馏效率 // v3.2.2 ①：DM 探采快捷开关解锁判定 // v3.3.3 反馈③：RP 效率递增
  multBreakdown, addRp, addPt, rpCap, dmCap, ptCap, focusPerLevel, focusTotalBonus, unitCost, fmtRes,
  corruptionCap, researchMult, clampRunResourceBalances } from './modules/economy.js'; // v3.10.2 ④：上限回落钳制 // v3.7.0 QA：腐化上限 / 研究读侧 // v2.8.22 ④：加成明细悬浮 + v2.8.30 专注曲线 // v3.4.1 ④：资源数值统一口径
// v2.0：特殊任务 + 彩蛋系统（从 events.js 提取，打破 main.js ↔ events.js 循环依赖）
import { checkEasterEggs, checkSpecialTasks } from './modules/progression.js';
// v2.5.4 ①：快照存档（最多 3 槽 / 覆盖当前本地游戏 / 二级确认）
import { saveSnapshot, coverOldest, listSnapshots, snapshotData, deleteSnapshot, overwriteSnapshot, importToSnapshot, SNAP_MAX, fmtStamp } from './modules/snapshots.js';
// v3.10.4 ④：导入模式（'current' = 覆盖当前；'snapshot' = 导入为新快照）；模块级声明，供模块级的 importSave 读取
let importMode = 'current';
// v2.0：故事线管理器
import { getCurrentStoryline, loadStoryline, lockStorylineSwitch, getStorylinePackage } from './core/storylineManager.js';
import { tickProjects, claimProject, spawnProject, maxProjects, normalizeProjectGoals, setProjectLogFn } from './modules/projects.js';
import { tickReligion, renderReligionPanel, bindReligionPanel, canUnlockReligion, setReligionLogFn, setReligionToastFn, refreshReligionAffordability } from './modules/religions.js'; // v2.8.26 ④
import { renderPolicyPanel, bindPolicyPanel, setPolicyLogFn, setPolicyToastFn } from './modules/policies.js';
import { policyOpenGroups, policyMult, POLICY_GROUPS } from './data/policies.js';
import { tickDelve, renderDelvePanel, bindDelvePanel, canUnlockDelve, delveUnlocked, setDelveLogFn, setDelveToastFn } from './modules/delve.js';
import { tickBazaar, renderBazaarPanel, bindBazaarPanel, canUnlockBazaar, bazaarUnlocked, setBazaarLogFn, setBazaarToastFn } from './modules/bazaar.js'; // v3.0.0：深渊集市（大模块）
import { religionUnlocked, faithCap } from './data/religions.js'; // v3.4.9 反馈⑧：FP 上限进顶栏
import { renderShop, renderThreadShop, renderVehicles, renderDmShop, renderBuildings, renderV21Buildings, renderCrossroadBuildings, renderFamilyUpgrades, renderOfflineUpgrades, refreshShopAffordability, refreshShopItem, refreshV21Item, refreshShopChain, renderRpFamily, renderResearchUpgrades, renderAtriumDistill, renderAtriumSwitch, renderHatchUpgrade, setToastFn, researchUpgCost, RP_GROUPS, buyUpgrade, researchResourceUnlocked, RESEARCH_RES_ANCHORS } from './modules/shop.js'; // v3.7.0 QA：研究分组 + 自动玩家走真实购买入口 // v2.3.1 ⑥：setBulk/getBulk 移除；v2.8.2 ④：renderRpFamily（RP 加成组）
import { EXPAND_KEY, anchorShown, anchorDone, petsModuleUnlocked } from './modules/disclosure.js'; // v2.3.1 缺陷④清档回收 + ①锚点判定（rev18 9.1/9.2）；v3.7.2 ①：异兽模块唯一解锁判定源
import { rollProfession, aiSuggestedProfession, tickThreads, autoAssignThreads, leaderCount, leaderGlobalMult, canBind, bindThread, unbindThread, releaseAllThreads, converterThreadBoost, threadLevelFromXp, converterEnabled, converterUnlocked, unlockedConverterIds, threadBindOutputFactor, threadBindSalaryFactor, setConverterEnabled, converterCapacity, converterLoad } from './modules/threadBinding.js'; // v3.6.5 ①~③：岗位容量 QA 钩子 // v3.3.0 线程绑定系统 // v3.3.1：转化器开关统一口径 // v3.6.3 ③：岗位解锁唯一判定源
// v3.0.0 测试性解耦：侧效工具（日志/toast/脏检查/确认框）下沉到 DOM 无关的 core 模块，
// 使 shop/expedition/reincarn/rift/tech 可在纯 Node 下单测，浏览器行为不变。
import { dirty, log, toast, askConfirm, registerConfirmHooks, bindConfirmButtons } from './core/runtime.js';
import { renderTech, refreshTechState, renderEternal, buyTech } from './modules/tech.js';
import { getTechs } from './core/provider.js'; // v3.11.0：30 天推演经产品真实入口购买「自动研究」
import { tickWages, setWageLogFn, setWageToastFn } from './modules/wages.js'; // v1.3 C
import { renderCrewPanel, crewPush, crewShown } from './modules/crew.js'; // v3.1.0 反馈③：班组面板（线程拟人化） // v3.6.2 反馈①：≥10 线程解锁
import { tickVehicleCollect, setVehicleLogFn } from './modules/vehicles.js'; // v1.3 D
import { tickAI, renderAiPanel, setAiLogFn, setAiUiRefreshFn, aiUnlocked, aiHireFlag, autoBuildUnlocked, allResDiscovered, autoBuildActivateCost, refreshAssistantAffordability,
  assistantCount, assistantCost, assistantBuyState, buyAssistant, setAiSwitch, allOffActions,
  actionCounts, totalActionCount, stalledActions, recordAction, actionAvailable,
  activateAutoBuild, autoBuildActivable } from './modules/ai.js'; // v1.3 A // v3.2.4 反馈④：自动购建区块显隐/EP 充足态检测 // v3.7.5：编队按钮可购态快刷 // v3.11.0：AI 自动化真实入口 QA 钩子
import { AI_ACTIONS, AI_ACTION_IDS, AI_ACTION_SWITCH_KEYS, AI_ASSISTANT_CONSUMER_IDS,
  ALL_OFF_SWITCH_KEYS, AI_ACTION_GROUPS, maxCycleAssistantDemand } from './core/aiActionRegistry.js'; // v3.11.0：自动化动作声明层 QA 钩子
import { renderRelics, buyRelic, buyPurifier, setRelicsLogFn, setRelicsToastFn, refreshRelicAffordability } from './modules/relics.js'; // v2.7.0：深渊遗物；v2.8.22 ⑥：净化节点；v2.8.26：DM 灰态每秒刷新
import { relicsUnlocked, RELICS, relicLevel } from './data/relics.js'; // v2.7.0：遗物入口门控；v3.3.7 反馈①：结构签名
import { renderPetGrid, renderPetFloat, gainPetExp, activePetIds, refreshPetsAffordability, petUpkeepTotalPerSec, petStarving } from './modules/pets.js'; // v2.8.26：PT 灰态每秒刷新 // v3.2.1 反馈⑨：出战维持 // v3.2.3 反馈⑥：休战过渡日志
import { renderPrestige, renderTalentModal, doPrestige, canPrestige } from './modules/prestige.js';
import { renderReincarn, doReincarn, reincarnReady } from './modules/reincarn.js'; // v2.7.3 ⑤：轮回（晋升面板底部）
import { isStageUnlocked } from './core/progressive.js';
import { checkGate, getAllGates } from './core/gates.js';
import { chapterRank, chapterProgress, chapterCode, chapterSeq, getStorylineEvents, getStorylinePets, validateEvent } from './core/storylineContent.js'; // v3.7.0：章节 ID 统一口径
import { lineRule, lineFlag, allLineRuleKeys, LINE_RULE_LABELS } from './core/lineRules.js'; // v3.7.0 QA
import { maybeTriggerEvent, peekNextEvent, eventPool } from './modules/events.js';
import { applyOffline, renderOfflinePanel } from './modules/offline.js';
import { renderStoryBar, currentChapter } from './modules/story.js';
import { tickRift, renderRift, renderRiftPanel, refreshRiftAffordability, buyRiftUpgrade, abortRiftExpedition, discoverDm, riftEtaSec, riftNextSec, fmtEta, renderRiftLevelTech, riftUpgradeLevel, riftPurgeCostMult, riftThreadsReady, riftLevelOf, riftLevelTech, buyRiftLevelTech } from './modules/rift.js'; // v3.6.4 ①：裂隙等级 QA 钩子 // v3.3.9 反馈⑤：裂隙等级科技（科技树）// v3.4.9：自动净化/净化成本倍率 // v3.6.2 反馈②：线程解锁门槛
import { ensureAbyssGaze } from './modules/abyssGaze.js'; // v3.4.2：凝视深渊彩蛋——重载后常驻裂开
import { tickExpeditions, tickColonies, renderExpeditions, refreshExpeditionAffordability } from './modules/expedition.js'; // v3.0.5 反馈②：星图/宇宙可购态快刷
import { UPGRADES } from './data/upgrades.js';
import { CHAPTERS } from './data/chapters.js'; // v2.8.15：Wiki 章节讲解
import { WIKI_SECTIONS, wikiUnlocked } from './data/wiki.js'; // v2.9.0：体系化百科（KG 风格）
import { PETS } from './data/pets.js';
import { MOOD_MULT, CONVERTERS } from './data/threads.js'; // v3.6.5 ⑤：招募自动安置的岗位名
import { BALANCE } from './data/balance.js';
// v3.8.0 核心玩法抽象：资源流引擎（声明 → 求值 → 消费），主循环不再内联任何结算公式
import { runFlows, flowStats, flowLedger, flowErrors, FLOW_PHASES } from './core/flowEngine.js';
import './systems/resourceFlows.js'; // 副作用：注册全部资源流（必须在 tick 之前完成）
// v3.9.0 核心玩法抽象（控制流层）：帧系统调度 + 声明式面板分发
import { runSystems, systemStats, systemErrors, FRAME_PHASES } from './core/systemScheduler.js';
import { registerFrameSystems } from './systems/frameSystems.js';
import { registerPanel, renderPanels, panelErrors, allPanels } from './core/panelRegistry.js';
import { ORCHESTRATION_MODES, TIDE_ORCHESTRATION, TIDE_PHASE_NAMES, SCHEDULE_UNLOCK,
  orchestrationUnlocked, orchestrationState, scheduleUnlocked, orchestrationSchedule,
  scheduleCustomized, setOrchestrationMode, setOrchestrationPhaseMode, resetOrchestrationSchedule,
  effectiveMode, effectiveModeId, orchestrationSummary,
  setOrchestrationAutoTide, toggleOrchestrationAutoTide, orchestrationMult } from './core/orchestration.js';
import './style.css';
// v3.10.0：成就表下沉为纯数据层 + 判定注册表（可在纯 Node 下单测）
import { ACHIEVEMENTS } from './data/achievements.js';
import { ACHIEVEMENT_IDS, evaluateAchievements, unlockAchievement, achievementProgress } from './core/achievementRegistry.js';
// v3.10.0：状态生命周期清单 / 面板键清单的单一真源
import { RESOURCE_DISCOVERY, shiftAbsoluteClocks, shiftProjectClocks, RUN_RUNTIME_KEYS, clampCappedResources } from './core/stateSchema.js';
import { PANEL_KEYS, PANEL_DIRTY_ON_START } from './core/panelKeys.js';
import { FRAME_DEPS_KEYS } from './systems/frameSystems.js';
// v3.10.0：新玩法「相位共鸣」
import { RESONANCE_FOCI, RESONANCE_TUNING, RESONANCE_UNLOCK, DEFAULT_RESONANCE,
  resonanceUnlocked, resonanceState, resonanceSummary, resonanceMult,
  setResonanceEnabled, toggleResonanceEnabled, setResonanceFocus } from './core/resonance.js';

const app = document.getElementById('app');

// ========== 日志系统 / toast / 脏检查渲染 ==========
// 以上三者已下沉至 src/core/runtime.js（log / toast / dirty），浏览器中行为不变，
// 纯 Node 环境下为 DOM 安全实现，便于核心模块单测。

// ========== v2.0 故事线面板（v2.2 只读状态卡：走向由定向建筑购买决定，面板不再提供任何选择按钮） ==========
// ========== v3.8.0 效能编排：把「资源管线取舍」做成可读、可切换的常驻卡 ==========
// 面板只陈述自身数据（当前策略 / 四条倍率 / 排班开关），不写跨面板指引、不暴露实现术语。
function renderOrchestrationPanel() {
  const card = document.getElementById('orchestration-card');
  const el = document.getElementById('orchestration-panel');
  if (!card || !el) return;
  // v3.10.3：合并面板——编排解锁或班组解锁其一即显示整卡；班组内容由 frameSystems 渲染到 sibling #crew-panel。
  const unlocked = orchestrationUnlocked(S);
  const visible = unlocked || crewShown();
  card.style.display = visible ? '' : 'none';
  if (!visible) return;
  // 仅当编排解锁时才渲染编排控件；未解锁时清空，腾出空间给班组（班组独立渲染，不进此面板）。
  if (!unlocked) { el.innerHTML = ''; return; }

  const st = orchestrationState(S);
  const auto = st.autoTide;
  const active = effectiveMode(S);
  const summary = orchestrationSummary(S);
  const schedOK = scheduleUnlocked(S);
  const sched = orchestrationSchedule(S);
  const res = resonanceSummary(S); // v3.10.0：相位共鸣读侧
  // 结构签名去重：2s 兜底刷新与潮汐相位变化都不重建按钮（防慢速点击被吞 / hover 闪烁）
  // v3.9.0：排班表 / 当前相位 / 解锁态一并进签名；v3.10.0 补共鸣开关 / 层数 / 焦点
  const sig = `${unlocked}|${st.mode}|${auto}|${active.id}|${summary.map(x => x.mult).join(',')}`
    + `|S:${schedOK ? sched.join('.') : '-'}|P:${auto ? S.tidePhase : -1}`
    + `|R:${res.unlocked ? 1 : 0}:${res.enabled ? 1 : 0}:${res.layers}:${res.focus}`;
  if (el._orchSig === sig) return;
  el._orchSig = sig;

  let html = `<div style="color:var(--text-2);font-size:11.5px;line-height:1.6;margin-bottom:8px">
    当前编排：<b style="color:var(--accent)">${active.icon} ${active.name}</b>${auto ? ' · 随潮汐排班' : ''}<br>
    <span style="color:var(--text-3)">${active.desc}</span></div>`;

  html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
  for (const m of ORCHESTRATION_MODES) {
    const on = !auto && m.id === st.mode;
    html += `<button class="btn-mini" data-orch-mode="${m.id}"${on ? ' style="border-color:var(--accent);color:var(--accent)"' : ''}${auto ? ' disabled title="随潮汐排班开启时由相位决定"' : ''}>${m.icon} ${m.short}</button>`;
  }
  html += `</div>`;

  const schedLine = TIDE_PHASE_NAMES
    .map((n, i) => `${n}→${(ORCHESTRATION_MODES.find(m => m.id === sched[i]) || {}).short || '均衡'}`)
    .join(' · ');
  html += `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
    <button class="btn-mini" data-orch-auto="1"${auto ? ' style="border-color:var(--accent);color:var(--accent)"' : ''}>随潮汐排班：${auto ? '开' : '关'}</button>
    <span style="color:var(--text-3);font-size:10.5px">${auto ? schedLine : '手动选定一条编排'}</span>
  </div>`;

  // v3.9.0「潮汐预案」：解锁后，随潮汐排班开启时逐相位改写策略。
  // 面板只陈述自身数据（四相位当前排班），不写获取入口、不暴露实现术语。
  if (auto && schedOK) {
    const curPhase = ((Number(S.tidePhase) || 0) % 4 + 4) % 4;
    // 标题与操作提示分行：窄卡内同行会把提示挤成「孤字」换行（实测末字单独占一行）
    html += `<div style="border-top:1px solid var(--border);padding-top:8px;margin:2px 0 8px">
      <div style="font-size:11.5px;color:var(--text-2)">潮汐预案 · 四相位排班表</div>
      <div style="color:var(--text-3);font-size:10.5px;margin:2px 0 7px">点相位下的策略即可改写</div>`;
    for (let i = 0; i < 4; i++) {
      const nowOn = curPhase === i;
      // 槽位按钮放大到 24×24（可访问性点击目标下限），相位标签/间距相应收窄，保持单行不换行
      html += `<div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap;margin:4px 0">
        <span style="min-width:44px;font-size:11px;color:${nowOn ? 'var(--accent)' : 'var(--text-3)'}">${nowOn ? '▶ ' : ''}${TIDE_PHASE_NAMES[i]}</span>`;
      for (const m of ORCHESTRATION_MODES) {
        const on = sched[i] === m.id;
        html += `<button class="btn-mini" data-orch-slot="${i}" data-orch-slot-mode="${m.id}" title="${TIDE_PHASE_NAMES[i]}改用${m.name}" aria-label="${TIDE_PHASE_NAMES[i]}改用${m.name}" style="min-width:24px;min-height:24px;display:inline-flex;align-items:center;justify-content:center;${on ? 'border-color:var(--accent);color:var(--accent);' : ''}">${m.icon}</button>`;
      }
      html += `<span style="font-size:10.5px;color:var(--text-3)">${(ORCHESTRATION_MODES.find(m => m.id === sched[i]) || {}).name || ''}</span></div>`;
    }
    if (scheduleCustomized(S)) html += `<button class="btn-mini" data-orch-schedule-reset="1">恢复默认排班</button>`;
    html += `</div>`;
  }

  // v3.10.0「相位共鸣」：标题与说明分行，避免窄卡内提示被挤成孤字换行；
  // 按钮点击目标 28×28 且带 aria-label / aria-pressed（可访问性），焦点态只用既有强调色。
  if (res.unlocked) {
    html += `<div style="border-top:1px solid var(--border);padding-top:8px;margin:2px 0 8px">
      <div style="font-size:11.5px;color:var(--text-2)">相位共鸣 · ${res.layers}/${res.maxLayers} 层</div>
      <div style="font-size:10.5px;color:var(--text-3);margin:2px 0 7px">同一相位停留越久叠得越高，换相位减半</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
        <button class="btn-mini" data-res-toggle="1" aria-label="切换相位共鸣开关" aria-pressed="${res.enabled}" style="min-height:28px;min-width:28px">共鸣：${res.enabled ? '开' : '关'}</button>
        <span style="font-size:10.5px;color:var(--text-3)">焦点每层 +1.5%，其余各 -0.2%</span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${RESONANCE_FOCI.map(f => `<button class="btn-mini" data-res-focus="${f.id}" title="共鸣焦点改为${f.name}" aria-label="共鸣焦点改为${f.name}" aria-pressed="${res.focus === f.id}" style="min-width:28px;min-height:28px;display:inline-flex;align-items:center;justify-content:center;${res.focus === f.id ? 'border-color:var(--accent);color:var(--accent);' : ''}">${f.icon}</button>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px 12px;font-size:10.5px;color:var(--text-2);margin-top:6px">
        ${res.rows.map(r => `<div>${r.label} <b class="mono" style="color:${r.mult > 1.0001 ? 'var(--good,#3fb950)' : r.mult < 0.9999 ? 'var(--warn)' : 'var(--text-3)'}">×${r.mult.toFixed(2)}</b></div>`).join('')}
      </div>
    </div>`;
  }

  // v3.10.1：明确标注这四行是编排层倍率（策略 + 相位共鸣合并），不是全部加成的总和。
  html += `<div style="font-size:10.5px;color:var(--text-3);margin-bottom:4px">编排倍率 · 策略与相位共鸣合并</div>`;
  html += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px;font-size:11px;color:var(--text-2)">`;
  for (const x of summary) {
    const color = x.mult > 1.0001 ? 'var(--good,#3fb950)' : x.mult < 0.9999 ? 'var(--warn)' : 'var(--text-3)';
    html += `<div>${x.label} <b class="mono" style="color:${color}">×${x.mult.toFixed(2)}</b></div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

function bindOrchestrationPanel() {
  const el = document.getElementById('orchestration-panel');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    if (btn.dataset.orchMode) {
      if (!setOrchestrationMode(S, btn.dataset.orchMode)) return;
      log(`效能编排：切换为「${effectiveMode(S).name}」`, 'good');
    } else if (btn.dataset.orchAuto) {
      toggleOrchestrationAutoTide(S);
      log(`效能编排：随潮汐排班${orchestrationState(S).autoTide ? '开启' : '关闭'}`, 'good');
    } else if (btn.dataset.orchSlot !== undefined) {
      // v3.9.0：潮汐预案——逐相位改写排班表（非法/未解锁写入由读侧单一真源拦截）
      const slot = Number(btn.dataset.orchSlot);
      const modeId = btn.dataset.orchSlotMode;
      if (!setOrchestrationPhaseMode(S, slot, modeId)) return;
      const nm = (ORCHESTRATION_MODES.find(m => m.id === modeId) || {}).name || '';
      log(`潮汐预案：${TIDE_PHASE_NAMES[slot]}改排「${nm}」`, 'good');
    } else if (btn.dataset.resToggle) {
      // v3.10.0：相位共鸣开关（未解锁写入由读侧单一真源拦截）
      if (!toggleResonanceEnabled(S)) return;
      log(`相位共鸣：${resonanceState(S).enabled ? '开启' : '关闭'}`, 'good');
    } else if (btn.dataset.resFocus) {
      if (!setResonanceFocus(S, btn.dataset.resFocus)) return;
      const f = RESONANCE_FOCI.find(x => x.id === btn.dataset.resFocus);
      log(`相位共鸣：焦点改为「${f ? f.name : ''}」`, 'good');
    } else if (btn.dataset.orchScheduleReset) {
      if (!resetOrchestrationSchedule(S)) return;
      log('潮汐预案：恢复默认排班', 'good');
    } else return;
    dirty.orchestration = true; dirty.top = true; dirty.hero = true;
    renderOrchestrationPanel();
  });
}

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
      const code = chapterCode(ch.id);
      // v3.7.0：新编码 + 旧档数字双向兼容
      if (seen.includes(code) || seen.includes(chapterSeq(ch.id)) || prevOk2) ok = true;
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
          const code = chapterCode(ch.id);
          // v3.7.0：新编码 + 旧档数字双向兼容（历史已进入 → 永久点亮）
          if (seenChs.includes(code) || seenChs.includes(chapterSeq(ch.id))) ok = true;
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

// ========== v3.9.0：渲染分发表（声明式，替代原 20 余段手写 if 链） ==========
// 注册顺序即渲染顺序，与 v3.8.0 原 render() 逐字对应；always 条目每帧执行。
// 新增面板只需 registerPanel()，不必再改 render()；「dirty 键 ↔ 消费者」由 v390 单测静态审计。
function registerAllPanels() {
  registerPanel({ key: '__prelude', always: true, render: () => {
    ensureWishWell();       // v2.8.30 ③：许愿池（购买研究升级后即时出现/移除）
    ensureFarewellGift();   // v2.9.2：离职礼盒（线程休眠/流失期间出现）
  } });
  registerPanel({ key: 'top', render: renderTop });
  registerPanel({ key: 'hero', render: renderHero });
  registerPanel({ key: 'ai', render: () => { // v1.3 A：AI 面板（未解锁时整卡隐藏）
    const aiEl = document.getElementById('ai-panel');
    const aiCard = document.getElementById('ai-card');
    if (aiEl) renderAiPanel(aiEl);
    if (aiCard) aiCard.style.display = aiUnlocked() ? '' : 'none';
  } });
  registerPanel({ key: 'tide', render: renderTide });
  registerPanel({ key: 'corruption', render: renderCorruption });
  registerPanel({ key: '__peak', always: true, render: () => {
    // v2.7.4 ③：腐化峰值记录（跨本局保留；深渊之心按峰值判定，净化节点不抵消）
    if ((S.corruption || 0) > (S.corruptionPeak || 0)) S.corruptionPeak = S.corruption;
  } });
  registerPanel({ key: 'shop', render: () => {
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
      const bldT = document.getElementById('bld-title');
      if (bldT) bldT.style.display = bldEl.children.length > 0 ? '' : 'none';
    }
    const v21El = document.getElementById('v21-building-list');
    if (v21El) renderV21Buildings(v21El);
    // v2.7.5 ⑦：容器跨 tab 但渲染仍随 shop 周期执行（隐藏 tab 渲染无碍，保证门控标题一致）
    const vehEl2 = document.getElementById('vehicle-shop');
    if (vehEl2) renderVehicles(vehEl2);
    const dmEl2 = document.getElementById('dm-shop');
    if (dmEl2) renderDmShop(dmEl2);
    const crEl2 = document.getElementById('crossroad-list');
    if (crEl2) { renderCrossroadBuildings(crEl2); lastCrRenderState = S.crossroad; }
    const famEl2 = document.getElementById('family-upgrade-list');
    if (famEl2) renderFamilyUpgrades(famEl2);
  } });
  registerPanel({ key: 'rp', render: () => {
    renderRpPanel();
    renderResearchUpgrades(document.getElementById('research-upgrade-list'));
  } });
  registerPanel({ key: 'tech', render: () => {
    const techEl = document.getElementById('tech-tree');
    if (techEl) renderTech(techEl);
    const eternalEl = document.getElementById('eternal-list');
    const eternalTitle = document.getElementById('eternal-title');
    if (eternalEl) {
      if (esDiscovered()) { renderEternal(eternalEl); if (eternalTitle) eternalTitle.style.display = ''; }
      else if (!eternalEl._esLocked) { eternalEl._esLocked = true; eternalEl.innerHTML = ''; if (eternalTitle) eternalTitle.style.display = 'none'; }
    }
    const riftTechEl = document.getElementById('rift-tech-list');
    if (riftTechEl) renderRiftLevelTech(riftTechEl);
  } });
  registerPanel({ key: 'pets', render: () => {
    const petEl = document.getElementById('pet-grid');
    if (petEl) renderPetGrid(petEl);
    const floatEl = document.getElementById('pet-float');
    if (floatEl) renderPetFloat(floatEl);
  } });
  registerPanel({ key: '__tentacle', always: true, render: () => {
    // v2.5.3 反馈③：深渊鱼缸触手（工作台底部缓慢摆动）
    const tentacleEl = document.getElementById('tentacle-deco');
    if (!tentacleEl) return;
    const fb = Math.min((S.buildings && S.buildings.abyss_fishbowl) || 0, 3);
    tentacleEl.style.display = fb >= 1 ? '' : 'none';
    tentacleEl.classList.toggle('tentacle-2', fb >= 2);
    tentacleEl.classList.toggle('tentacle-3', fb >= 3);
  } });
  registerPanel({ key: 'prestige', render: () => {
    syncPrestigePanelVisibility(); // v3.7.3 反馈⑤：P3 未到时整块隐藏
    const preEl = document.getElementById('prestige-panel');
    if (preEl) { renderPrestige(preEl); renderReincarn(preEl); }
  } });
  registerPanel({ key: 'relics', render: () => renderRelics(document.getElementById('relics-panel')) });
  registerPanel({ key: 'projects', render: renderProjects });
  registerPanel({ key: 'story', render: () => {
    const storyEl = document.getElementById('chapter-bar');
    if (storyEl) renderStoryBar(storyEl);
  } });
  registerPanel({ key: 'storyline', render: renderStorylinePanel });
  registerPanel({ key: 'orchestration', render: renderOrchestrationPanel });
  registerPanel({ key: 'achievements', render: () => renderAchievementPanel(document.getElementById('achievement-panel')) });
  registerPanel({ key: 'religion', render: () => {
    const relEl = document.getElementById('religion-panel');
    if (relEl) renderReligionPanel(relEl);
  } });
  registerPanel({ key: 'policy', render: () => {
    const polEl = document.getElementById('policy-panel');
    if (polEl) renderPolicyPanel(polEl);
  } });
  registerPanel({ key: 'delve', render: () => {
    const dvEl = document.getElementById('delve-panel');
    if (dvEl) renderDelvePanel(dvEl);
  } });
  registerPanel({ key: 'bazaar', render: () => {
    const bzEl = document.getElementById('bazaar-panel');
    if (bzEl) renderBazaarPanel(bzEl);
  } });
  registerPanel({ key: 'rift', render: () => {
    const riftEl = document.getElementById('rift-panel');
    if (riftEl) renderRift(riftEl);
  } });
  registerPanel({ key: 'riftTab', render: () => {
    const rtEl = document.getElementById('rift-tab-panel');
    if (rtEl) renderRiftPanel(rtEl);
  } });
  registerPanel({ key: 'expedition', render: () => {
    const expEl = document.getElementById('expedition-panel');
    if (expEl) renderExpeditions(expEl);
  } });
}

/** v3.9.0：渲染入口只负责把脏标记交给注册表，顺序与消费规则由注册声明决定。 */
function render() { renderPanels(dirty); }

// ========== v2.3.1 资源锚点发现（rev18 9.1：顶栏显示与升级解锁统一锚点制） ==========
// resDiscovered 写入条件由「首次持有」改为「锚点完成」；锚点前「盲获得」照常入账不显示，
// 锚点完成后连历史累计一并显示（A2 核心）。锚点完成恰一次 toast，归零不回隐藏。
// rank（职级）与 es 同锚点——完成首次晋升（S.prestige ≥ 1）。
const DISCOVER_TOASTS = RESOURCE_DISCOVERY.map(r => [r.key, () => anchorDone(r.anchorKey, S), r.toast]);
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
  const discStatIds = RESOURCE_DISCOVERY.map(r => r.statId);
  const discAnchorKeys = RESOURCE_DISCOVERY.map(r => r.anchorKey); // 单一真源：core/stateSchema.js
  for (let i = 0; i < discStatIds.length; i++) {
    const el = document.getElementById(discStatIds[i]);
    if (!el || !el.parentElement) continue;
    // v2.7.0 / v3.10.2 ③：PT 与 FP 顶栏显示走即时门控（anchorDone：本局制、转生清空），
    // 与「FP 相关研究项」的门控谓词严格同源，避免资源未解锁却出现对应研究升级。
    const shown = (discAnchorKeys[i] === 'pt' || discAnchorKeys[i] === 'faith')
      ? anchorDone(discAnchorKeys[i], S) : anchorShown(discAnchorKeys[i], S);
    el.parentElement.style.display = shown ? '' : 'none';
  }
  const cps = computeCps();
  // v3.10.2 ②：净流为负（产出 < 消耗）时给警告标志与「预期 EP 耗尽时间」。
  // 口径与顶栏展示值严格一致：computeCps() 与 totalDrainPerSec()，ETA = 当前 EP / 每秒净亏空。
  const drain = totalDrainPerSec();
  const drainWarn = drain > cps;
  const etaSec = epDepletionSec(S.ep, cps, drain);
  const etaTip = drainWarn ? `｜⚠ 净流为负：按当前产出/消耗，EP 预计 ${fmtDepletionEta(etaSec)} 后耗尽` : '';
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
    if (st) { const focusTag = S.focusLevel > 0 ? `专注 +${Math.round(focusTotalBonus(S.focusLevel) * 100)}%` : ''; st.dataset.tip = `产出来源：${cpsBreakdown().join(' · ') || '无'}${multBreakdown().length ? '｜加成：' + multBreakdown().join(' · ') : ''}${focusTag ? '｜' + focusTag : ''}${etaTip}`; } // v2.8.30 ⑥：专注总加成并入产出悬浮（按分段曲线累加）
  }
  const hDrainWarn = document.getElementById('h-drain-warn');
  if (hDrainWarn) {
    hDrainWarn.style.display = drainWarn ? '' : 'none';
    hDrainWarn.setAttribute('aria-label', drainWarn ? `产出小于消耗，EP 预计 ${fmtDepletionEta(etaSec)} 后耗尽` : '');
  }
  if (hSalary) {
    hSalary.textContent = fmt(drain) + '/s';
    const st2 = hSalary.closest('.stat');
    // v3.3.1 反馈⑪：消耗按实际扣减口径展示（休眠只扣保命成本、探采 EP 不足跳过、圣所关闭不扣）
    const wSt = (S.wageState || {}).state;
    const wageNote = (wSt === 'dormant' || wSt === 'losing') ? `（休眠期仅扣保命成本 ×${wageKeepCostMult()}）` : '';
    if (st2) st2.dataset.tip = `消耗来源：${drainBreakdown().join(' · ') || '无'}${wageNote}${multBreakdown().length ? '｜加成：' + multBreakdown().join(' · ') : ''}${etaTip}`;
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
  // v3.7.2 反馈①：程序化切换也走同一解锁判定源，防止绕过 nav 的 disabled 打开未解锁模块
  if (id === 'pets' && !petsModuleUnlocked(S)) { toast('🔒 异兽将在解锁 PT 后开放'); return; }
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
// v3.7.3 反馈②：未解锁的自动转化不再灰显占位——解锁后才出现（与 Wiki「各系统解锁后出现」一致）。
// 六枚开关各自用唯一解锁判定源（四枚转化器 + 两枚裂隙科技）；全部未解锁时整块面板隐藏，不留空壳。
function renderQuickSwitches() {
  const panel = document.getElementById('quick-switches-panel');
  const host = document.getElementById('quick-switches');
  if (!panel || !host) return;
  const items = [];
  if (converterUnlocked('atrium')) {
    const on = converterEnabled('atrium');
    items.push(`<button data-qs="atrium" title="灵感工坊自动蒸馏：EP → RP（与「研究点」页开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">蒸馏 ${on ? '开' : '关'}</button>`);
  }
  if (converterUnlocked('vehicles')) {
    const on = converterEnabled('vehicles');
    items.push(`<button data-qs="probe" title="载具探采：EP → DM（与「遗物」页探采开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">探采 ${on ? '开' : '关'}</button>`);
  }
  if (converterUnlocked('hatch')) {
    const on = converterEnabled('hatch');
    items.push(`<button data-qs="hatch" title="异兽孵化：EP → PT（与「异兽」页开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">孵化 ${on ? '开' : '关'}</button>`);
  }
  if (converterUnlocked('temple')) {
    const on = converterEnabled('temple');
    items.push(`<button data-qs="temple" title="信仰圣所：EP → FP（与「宗教」页开关同步）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">圣所 ${on ? '开' : '关'}</button>`);
  }
  // v3.4.9 反馈①：无限深入开关从裂隙科技树移到此处（与其余自动转化开关同一入口）
  if (riftUpgradeLevel('auto_descent') >= 1) {
    const on = S.riftAuto === 'auto_descent';
    items.push(`<button data-qs="descent" title="无限深入：裂隙出现时自动深入探索（消耗 EP，腐化超阈值会损失）与「自动封印/自动拥抱」互斥" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">深入 ${on ? '开' : '关'}</button>`);
  }
  // v3.4.9 反馈②：自动净化（腐化每涨 5% 自动净化 5%，消耗 EP；需先买「无限深入」）
  if (riftUpgradeLevel('auto_purify') >= 1) {
    const on = !!S.autoPurify;
    items.push(`<button data-qs="purify" title="自动净化：腐化每涨 5% 自动净化 5%（消耗 EP，EP 不足时暂停）" style="${on ? QS_STYLE_ON : QS_STYLE_OFF}">净化 ${on ? '开' : '关'}</button>`);
  }
  panel.style.display = items.length ? '' : 'none';
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
      '获取方式：\n· 灵感蒸馏塔：消耗当前 EP 的 25%，按蒸馏效率转化为 RP（默认 30000 EP → 1 RP）\n· 灵感工坊：自动蒸馏（每秒消耗 EP 转化 RP）\n· 任务奖励：RP 解锁后任务可能奖励 RP\n\n用途：\n· 科技树：开辟新玩法\n· 研究升级 / RP 加成 / 离线升级 / 族升级：强化已有内容\n\n上限：基础 2,500 + 矩阵存储库逐级扩容（首级 +400、之后每级 ×1.15）+ 产出基座（当前 EP 上限 ×25%，需星图远征开启后研究「星图同调」解锁）。未购星图同调前，上限只靠仓库线性增长；转生 / 轮回后本局扩容与产出基座一起归零，回到 3,000 再逐次扩容。达到上限后停止积累。', () => {});
  });
}

// v3.7.3 反馈⑤：晋升模块显隐的唯一判定源——与 btn-prestige 的 P3 阶段门控同源。
// P3（游玩 1 天）之前整块面板（含标题/进度条/轮回区块）不展示，达标后即时出现。
function prestigePanelVisible() { return isStageUnlocked('P3', S); }
function syncPrestigePanelVisibility() {
  const el = document.getElementById('tab-prestige');
  if (el) el.style.display = prestigePanelVisible() ? '' : 'none';
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
    // v3.7.2 反馈①：异兽再叠 PT 锚点（见 petsTabUnlocked），修复「PT 未解锁、异兽大模块却已开放」
    const unlocked = id === 'btn-pets'
      ? petsModuleUnlocked(S)
      : isStageUnlocked(stage, S) && (!anchorKey || anchorShown(anchorKey, S));
    if (!unlocked) {
      if (btn.dataset.locked === '1') continue; // v3.3.9 反馈④：已由 setTabLocked 接管（保留「???」与解锁提示）
      btn.classList.add('tab-locked');
      btn.textContent = '🔒 ???';
      btn.title = id === 'btn-pets'
        ? '异兽将在解锁 PT 后开放'
        : (anchorKey && isStageUnlocked(stage, S) && !anchorShown(anchorKey, S)
          ? `${label} 将在解锁对应资源后开放`
          : `${label} 将在 ${stage} 阶段解锁`);
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
  syncPrestigePanelVisibility(); // v3.7.3 反馈⑤：晋升模块与 P3 阶段门控同源
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
  bindOrchestrationPanel(); // v3.8.0：效能编排策略切换 / 潮汐排班事件委托
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
      const code = chapterCode(c.id);
      if (seen.includes(code) || seen.includes(chapterSeq(c.id))) ok = true;
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

  // v2.5 ⑤：存档导入（导入校验版本并写回刷新，原档自动备份）；导入入口见「📥 导入」按钮（importMode 分支）
  document.getElementById('import-file')?.addEventListener('change', importSave);

  // v2.5.4 ①：快照存档系统（3 槽 / 覆盖当前本地游戏 / 二级确认 / 新快照可覆盖旧快照）
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

  // v3.10.4 ④：存档管理简化为「💾 存档」下拉直接展示所有存档列表（参考 KG）。
  //   每条含 读取/覆盖/导出/删除；列表级含 保存新档/导入/清档；导入导出作为每条的功能。
  importMode = 'current'; // 复位为默认（'current' = 旧「导入覆盖当前」；'snapshot' = 导入为新快照入列）
  document.getElementById('save-new')?.addEventListener('click', () => { onSnapSave(); renderSaveList(); });
  document.getElementById('clear-game')?.addEventListener('click', () => {
    askConfirm('清档（删除当前游戏）', '将删除当前本地游戏，回到全新开局。\n存档快照保留，可逐个删除；此操作不可撤销，确定继续？', () => { doReset(); });
  });
  document.getElementById('import-btn2')?.addEventListener('click', () => {
    importMode = 'snapshot';
    document.getElementById('import-file')?.click();
  });
  const saveMenuEl = document.querySelector('.save-menu');
  if (saveMenuEl) {
    saveMenuEl.addEventListener('mouseenter', renderSaveList);
    saveMenuEl.addEventListener('focusin', renderSaveList);
  }
  document.getElementById('save-list')?.addEventListener('click', onSaveListClick);
  renderSaveList(); // 首屏预渲染（下拉展开时再刷新一次）

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
  shiftAbsoluteClocks(S, shift); // v3.10.0：字段清单来自 core/stateSchema.js，新增计时字段不再靠人肉记得改这里
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
    unlockAchievement(S, 'demon_friend');
    log(`贿赂深渊：上缴 ${fmt(paid)} EP（90%）——深渊收下了祭品，你成为了深渊的朋友（本局继续，腐化已被深渊收回）`, 'good');
    toast('🤝 成就解锁：恶魔的朋友');
    checkAch(); // 立即点亮成就面板
  } else {
    // 同归于尽：立即触发崩溃杀死深渊——本局湮灭并强制转生（湮灭残片 +1，成就「凝视深渊」）
    unlockAchievement(S, 'gaze_abyss');
    unlockAchievement(S, 'collapsed'); // 旧「被深渊吞噬」成就同步点亮
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
    renderSaveList();
    toast('快照已保存（' + listSnapshots().length + '/' + SNAP_MAX + '）');
    return;
  }
  if (r.needCover) {
    askConfirm('快照已满，覆盖最早的快照', `已保存 ${SNAP_MAX} 个快照。新快照将覆盖最早的「${r.needCover.name}（${fmtStamp(r.needCover.time)}）」，确定保存？`, () => {
      const res = coverOldest(r.snap);
      if (res.ok) { renderSnapshotList(); renderSaveList(); toast(res.covered ? '已覆盖旧快照，新快照已保存' : '快照已保存'); }
      else toast('保存失败：本地存储不可用');
    });
  } else {
    toast(r.reason || '保存失败');
  }
}

// v3.10.4 ④：下拉存档列表渲染（与模态列表同源数据，但每条多 覆盖/导出 操作）
function renderSaveList() {
  const box = document.getElementById('save-list');
  if (!box) return;
  const snaps = listSnapshots();
  box.innerHTML = '';
  if (!snaps.length) {
    box.innerHTML = `<div class="save-empty">暂无存档。点击「+ 保存新档」生成（最多 ${SNAP_MAX} 个）。</div>`;
    return;
  }
  for (const sn of snaps) {
    const row = document.createElement('div');
    row.className = 'item snap-row';
    row.dataset.snap = sn.id;
    row.dataset.name = sn.name;
    row.dataset.time = sn.timeText;
    const sm = sn.summary || {};
    const lineName = sm.storyline === 'line_abyss' ? '深渊线' : sm.storyline === 'line_order' ? '秩序线' : sm.storyline === 'line_faith' ? '信仰线' : '默认线';
    row.innerHTML = `<div class="snap-main">
        <div class="name"><span>${sn.slot}. ${sn.name}</span><span class="count mono">${sn.timeText}</span></div>
        <div class="snap-sub">EP ${fmt(sm.ep || 0)} · 职级 ${sm.prestige || 0} · 第 ${sm.chapter || 1} 章 · ${lineName}</div>
      </div>
      <div class="snap-btns">
        <button class="btn snap-use" title="用此存档覆盖当前进度">读取</button>
        <button class="btn snap-overwrite" title="用当前进度覆盖此存档">覆盖</button>
        <button class="btn snap-export" title="导出此存档为 JSON">导出</button>
        <button class="btn snap-del" title="删除此存档">删除</button>
      </div>`;
    box.appendChild(row);
  }
}

// v3.10.4 ④：下拉存档列表交互（读取/覆盖/导出/删除）
function onSaveListClick(e) {
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
  } else if (e.target.classList.contains('snap-overwrite')) {
    askConfirm('用当前进度覆盖该存档', `将用当前进度覆盖「${label}」。\n确定继续？`, () => {
      const cur = localStorage.getItem(SAVE_KEY);
      if (!cur) { toast('当前无存档'); return; }
      const r = overwriteSnapshot(id, cur);
      if (r.ok) { renderSaveList(); renderSnapshotList(); toast('已用当前进度覆盖该存档'); }
      else toast(r.reason || '覆盖失败');
    });
  } else if (e.target.classList.contains('snap-export')) {
    const data = snapshotData(id);
    if (!data) { toast('快照不存在'); return; }
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `abyss_save_${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('存档已导出');
  } else if (e.target.classList.contains('snap-del')) {
    askConfirm('删除快照', `确定删除快照「${label}」？`, () => {
      deleteSnapshot(id);
      renderSaveList(); renderSnapshotList();
      toast('快照已删除');
    });
  }
}

// v2.5 ⑤：导入存档——校验 JSON + 版本字段；按 importMode 决定「覆盖当前」或「作为新快照入列」
function importSave(e) {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const mode = importMode; // 捕获当前模式（文件选择为异步）
  importMode = 'current'; // 用完即复位，避免影响后续旧「导入覆盖当前」
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data || typeof data !== 'object' || data._version === undefined) {
        throw new Error('文件不是有效存档');
      }
      if (mode === 'snapshot') {
        // v3.10.4 ④：导入为新快照（入下拉列表），二级确认
        const sum = `EP ${fmt(data.ep || 0)} · 职级 ${data.prestige || 0}`;
        askConfirm('导入存档为新快照', `导入外部存档（${sum}）将作为新快照保存至下拉列表。\n槽位已满时会覆盖最早的快照。确定？`, () => {
          const r = importToSnapshot(JSON.stringify(data), '导入的存档');
          if (r.ok) { renderSaveList(); renderSnapshotList(); toast(r.covered ? '已覆盖旧快照，新快照已保存' : '已保存为新快照'); }
          else toast('保存失败：本地存储不可用');
        });
        return;
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
  const newcomer = {
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
  };
  S.cultists.push(newcomer);
  // v3.6.5 反馈⑤：新线程优先补「还有空位」的岗位；所有模块满员后才转入超线程。
  //   只安置这一条，绝不重排玩家已手动设定/在岗的线程（增量安置）。
  autoAssignThreads(newcomer);
  const placed = newcomer.boundTo && CONVERTERS[newcomer.boundTo] ? `· 自动安置至${CONVERTERS[newcomer.boundTo].name}` : '';
  crewPush(`招募新线程【${name}】加入班组（${profession}·Lv.1，+${fmt(BALANCE.thread.baseOutput)}~${fmt(BALANCE.thread.baseOutput + BALANCE.thread.baseOutputJitter)} EP/s）${placed}`, 'good');
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

// v3.10.0 review：暂停结算与离线回程严格同口径——只结算 EP + 小时 RP 加成。
// 旧实现在这里自行给「到期项目」发奖并 ++projectsDone，却与两处口径冲突：
//   tickProjects() 规定过期任务奖励作废；applyOffline() 的 projDone 恒为 0 且任务冻结。
// 同时该分支绕过 claimProject()（计数唯一真源 / save / RP 未解锁时的 EP 回退 / buff 奖励），
// 使「暂停 → 恢复」可以凭空累计任务数，进而提前解锁章节、政策、成就与编排 / 共鸣。
// 现在暂停期间只冻结任务时钟，恢复后任务仍需按真实入口领取。
function settlePause() {
  const nowMs = Date.now();
  const pausedAtMs = S.pausedAt || nowMs;
  const dt = (nowMs - pausedAtMs) / 1000;
  S.paused = false;
  S.pausedAt = 0;
  document.getElementById('pauseBtn').textContent = '暂停';
  document.body.classList.remove('paused');
  hidePauseModal();
  shiftProjectClocks(S, nowMs - pausedAtMs); // 任务冻结：deadline / pendingAt / startsAt 整体顺延
  const logPts = [];
  if (dt > 5) {
    const eff = Math.min(dt, offlineCap());
    const cps = computeCps();
    const gain = cps * eff * offlineEffRate(); // v3.2.4 反馈⑤：与离线结算统一口径
    if (gain >= 1) {
      const gained = addEp(gain); // v2.1 D1：统一入口，受 EP 上限约束
      if (gained > 0) logPts.push(`+${fmt(gained)} EP`);
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



function checkAch() {
  // v3.10.0：判定下沉到 core/achievementRegistry.js（纯函数、可单测），此处只负责播报与置脏重绘。
  const ctx = { totalOwned, techCount, petCount, chapterProgress };
  const fresh = evaluateAchievements(S, ctx);
  for (const a of fresh) {
    log(`成就解锁：${a.name}——${a.desc}`, 'good');
    if (toast) toast(`🏆 成就解锁：${a.name}`);
  }
  if (fresh.length) { dirty.achievements = true; dirty.storyline = true; }
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
// v3.8.0：触手拍动属于纯 DOM 副作用，由资源流通过 ctx.tentacleTap 回调触发
function triggerTentacleTap() {
  const deco = document.getElementById('tentacle-deco');
  if (!deco) return;
  deco.classList.remove('tap');
  void deco.offsetWidth; // 重排以重启动画
  deco.classList.add('tap');
  clearTimeout(S._tentacleTapTimer);
  S._tentacleTapTimer = setTimeout(() => deco.classList.remove('tap'), 500);
}

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
let _codeRainStarted = false, _codeRainTimer = null; // v3.0.0：前置声明（配合 __advance 时间加速，消除 TDZ）

// v3.9.0：帧上下文（长生命周期对象，避免每帧分配）。
// 原主循环十余个模块级缓存变量统一迁到此处，由 systemScheduler 与各声明式系统读写；
// 节流节拍由 systemScheduler 按 intervalSec / intervalMs / everyFrames 统一维护。
const frameCtx = {
  S, dirty, log, toast,
  dt: 0, now: 0, frame: 0,
  // 初值与 v3.8.0 模块级 let 逐字一致，重构不引入首次帧行为差异
  lastOrchUnlocked: false,
  tideCachePhase: -1, tideCacheTimer: -1,
  corruptionCacheFloor: -1, wageStateCache: '',
  lastGateHash: '', relicSig: '',
  lastUnlockedCount: -1,
  lastAiUnlocked: false, lastAbVisible: false, lastAbEpOk: false,
};

function tick(now) {
  frameCtx.frame++;
  const rawDt = (now - lastTick) / 1000;
  const dt = Math.max(0, Math.min(10, rawDt)); // v2.8.1：dt 上限 1→10s；v3.0.0：下限钳 0（时钟回拨/加速注入防负时间）
  // v3.3.5 反馈③：后台限流/挂起被钳掉的时间记账（单次上限 30 分钟），供裂隙计时补偿
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

  // v3.9.0：主循环只剩「四个资源流阶段 + 三个系统阶段」的调度骨架。
  // 结算公式在 systems/resourceFlows.js，模块顺序 / 节流 / 脏标记 / 重绘在 systems/frameSystems.js。
  // 执行点与 v3.8.0 逐字对应，新增玩法只需注册系统，不必改这里。
  frameCtx.dt = dt; frameCtx.now = now;
  const flowCtx = { S, dt, now, log, toast, tentacleTap: triggerTentacleTap };
  runFlows(flowCtx, FLOW_PHASES.EP_PRODUCE);
  runFlows(flowCtx, FLOW_PHASES.EP_AUX);
  runSystems(frameCtx, FRAME_PHASES.AFTER_EP_AUX);
  runFlows(flowCtx, FLOW_PHASES.PRODUCERS);
  runSystems(frameCtx, FRAME_PHASES.AFTER_PRODUCERS);
  runFlows(flowCtx, FLOW_PHASES.CONVERTERS);
  runSystems(frameCtx, FRAME_PHASES.FRAME);
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
  // v3.10.2 ④：旧档上限回落兜底——rp / pt / dm 余额是隐式保留，而上限随本局升级变化。
  // 加载即钳一次，避免「余额 31m / 上限 3,000」以及用超额 RP 绕过进度曲线购买。
  clampRunResourceBalances();

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

  for (const k of PANEL_DIRTY_ON_START) dirty[k] = true; // v3.10.0：清单来自 core/panelKeys.js

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

// v3.9.0：声明层一次性注册（函数声明已提升，必须在 startApp 之前完成）。
// deps 只注入 main.js 内的闭包函数，避免 systems/frameSystems.js 反向 import 主入口造成循环依赖。
registerFrameSystems({
  policyTickRefresh, updateProjectProgress, refreshTabVisibility, updateCrossroad,
  ensureCodeRain, tickTide, checkMiles, checkAch, discoverCheck, renderQuickSwitches, render,
});
registerAllPanels();

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
  window.__qa = { doPrestige, doReincarn, canPrestige, reincarnReady, computeCps, cpsBreakdown, epStorageCap, prestigeNeed, prestigeGain, totalDrainPerSec, staffSalaryPerSec, staffOutputPerSec,
    rpCap, dmCap, ptCap, // v3.4.4 反馈①：三仓库上限（逐级扩容）测试钩子
    faithCap, // v3.5.0 ②：FP 上限（已从圣所搬到誓约圣龛）测试钩子
    rpEffScale, // v3.3.3 反馈③：RP 效率递增系数（测试钩子）
    riftEtaSec, riftNextSec, // v3.3.5 反馈③：裂隙倒计时/下次间隔（测试钩子）
    vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, vehicleDmPerMin, // v3.3.6：探采汇率/乘区/结算口径（测试钩子）
    bulkCostCalc, unitCost, // v3.6.4 ④：粮仓首购价（卡面/实付同口径）
    riftLevelOf, riftLevelTech, buyRiftLevelTech, // v3.6.4 ①：裂隙等级只认科技
    // v3.3.0 线程绑定系统 QA 钩子
    petsModuleUnlocked, // v3.7.2 ①：异兽模块与顶栏 PT 同口径的唯一解锁判定
    prestigePanelVisible, // v3.7.3 ⑤：晋升模块与 P3 阶段门控同源
    threadBind: { bindThread, unbindThread, autoAssignThreads, releaseAllThreads, leaderCount, leaderGlobalMult, canBind, converterThreadBoost, threadLevelFromXp, rollProfession, aiSuggestedProfession, tickThreads,
      converterUnlocked, unlockedConverterIds, threadBindOutputFactor, threadBindSalaryFactor, converterCapacity, converterLoad }, // v3.6.3 ②③ / v3.6.5 ①~③：岗位解锁/系数/容量 QA 钩子
    // v3.7.0：核心抽象接线与 30 天浏览器推演所需的只读/纯函数钩子（不改变玩法）
    lineRule, lineFlag, allLineRuleKeys, LINE_RULE_LABELS,
    // v3.8.0：资源流引擎与效能编排（QA / 30 天推演数值守恒核对）
    runFlows, flowStats, flowLedger, flowErrors, FLOW_PHASES,
    // v3.9.0：控制流层（30 天推演核对「零异常 / 无漏帧 / 声明完整」）
    runSystems, systemStats, systemErrors, FRAME_PHASES, allPanels, panelErrors,
    orchestrationUnlocked, orchestrationState, effectiveModeId, effectiveMode,
    orchestrationMult, orchestrationSummary, setOrchestrationMode,
    setOrchestrationAutoTide, toggleOrchestrationAutoTide, ORCHESTRATION_MODES, TIDE_ORCHESTRATION,
    // v3.9.0：潮汐预案（自定义排班表）QA / 30 天推演钩子
    TIDE_PHASE_NAMES, SCHEDULE_UNLOCK, scheduleUnlocked, orchestrationSchedule,
    scheduleCustomized, setOrchestrationPhaseMode, resetOrchestrationSchedule,
    getStorylineEvents, getStorylinePets, validateEvent, eventPool,
    loadStoryline, maxProjects, corruptionCap, policyMult, researchMult,
    // v3.10.2：反馈清单 QA 钩子（净流预估 / 资源门控 / 上限重置）
    fmtDepletionEta, epDepletionSec, clampRunResourceBalances, researchResourceUnlocked,
    RESEARCH_RES_ANCHORS, RUN_RUNTIME_KEYS, clampCappedResources, anchorDone,
    researchUpgCost, RP_GROUPS, UPGRADES, BALANCE, PETS, POLICY_GROUPS,
    // v3.10.0：成就注册表 / 状态清单 / 相位共鸣 QA 钩子
    ACHIEVEMENTS, ACHIEVEMENT_IDS, evaluateAchievements, achievementProgress,
    RESOURCE_DISCOVERY, PANEL_KEYS, PANEL_DIRTY_ON_START, FRAME_DEPS_KEYS,
    // v3.11.0：自动化动作声明层 / 助手消耗（30 天浏览器推演核对「声明→消费」与长期续航）
    AI_ACTIONS, AI_ACTION_IDS, AI_ACTION_SWITCH_KEYS, AI_ASSISTANT_CONSUMER_IDS,
    ALL_OFF_SWITCH_KEYS, AI_ACTION_GROUPS, maxCycleAssistantDemand,
    assistantCount, assistantCost, assistantBuyState, actionCounts, totalActionCount,
    stalledActions, actionAvailable, autoBuildActivable, getTechs, buyTech,
    RESONANCE_FOCI, RESONANCE_TUNING, RESONANCE_UNLOCK, DEFAULT_RESONANCE,
    resonanceUnlocked, resonanceState, resonanceSummary, resonanceMult,
    setResonanceEnabled, toggleResonanceEnabled, setResonanceFocus,
    // v3.7.0 30 天 mock 推演：自动玩家只调用产品真实入口，禁止直接写 S 伪造进度
    sim: { doClick, buyUpgrade, switchTab, render, clickMult, addEp, canPrestige, doPrestige, reincarnReady, doReincarn,
      claimProject,
      // v3.11.0：AI 自动化的产品真实入口（推演不直接写 S 伪造进度）
      buyAssistant, setAiSwitch, allOffActions, recordAction, activateAutoBuild }, // v3.8.0：30 天推演自动玩家经产品真实入口领取任务，验证任务链路可达
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
