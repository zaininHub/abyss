import { S, save, reset, SAVE_KEY, SAVE_VERSION } from './state.js'; // v2.5 ⑤：SAVE_KEY/SAVE_VERSION 供存档导出/导入
import { fxBest } from './core/effectEngine.js'; // v2.1 建筑驱动：点击暴击掷骰参数
import { fmtDepletionEta, epDepletionSec, fmtMultDelta } from './core/format.js'; // v3.12.0 反馈⑮：倍率 → 带符号百分比 // v3.10.2 ②：顶栏 EP 耗尽预估（纯函数）
import {computeCps, staffSalaryPerSec, staffOutputPerSec, staffNetPerSec, cpsBreakdown, drainBreakdown, totalDrainPerSec,
  fmt, fmtTime, epStorageCap, clickMult, globalMult, setCollapseHooks, esDiscovered, collapseRemainMs,
  prestigeNeed, prestigeGain, bulkCostCalc, // v3.6.4 ④：两条购买路径同口径 QA 钩子（unitCost 已在下方导入）
  staffCost, focusCost, costMult, hasTech, petCount, elv, totalOwned, techCount,
  offlineRate, offlineCap, offlineEffRate, addEp, // v3.2.4 反馈⑤：offlineEffRate 统一离线效率口径（含离线协议研究）
  tidePhaseInfo, tideMult, corruptionPenalty, purifierCleanRate, tickCorruption,
  cancelCollapse, purgeCostFor, purgeDmFor, addDm, // v2.9.0：吞噬自救 + 主动净化经济
  wageDebtMult, wageKeepCostMult, // v1.3 C：四态徽章展示用（v4.2.3：wageLoseChance 随文案精简移出——概率不再对玩家展示）
  isLazy, // v2.7.1：线程懒惰态（EP 满上限惩罚）；倍率值直接读 BALANCE.lazy（v4.0.3 徽章只留状态名）
  rpDistillRate, vehicleDmPerMin, vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, rpEffScale, // v2.7.4 ⑦：RP 蒸馏效率 // v3.2.2 ①：DM 探采快捷开关解锁判定 // v3.3.3 反馈③：RP 效率递增
  multBreakdown, addRp, addPt, rpCap, dmCap, ptCap, focusPerLevel, unitCost, fmtRes,
  corruptionCap, researchMult, clampRunResourceBalances, spendRes, esCost, esGain } from './modules/economy.js'; // v3.10.2 ④：上限回落钳制 // v3.7.0 QA：腐化上限 / 研究读侧 // v2.8.22 ④：加成明细悬浮 + v2.8.30 专注曲线 // v3.4.1 ④：资源数值统一口径 // v3.12.13：资源增减统计（任务进度口径） // v4.2.6：esCost 走 economy 单参包装（闭包读 S.eternal，QA 钩子与产品读侧同源） // v4.2.8：esGain 供分章节推演累计晋升 ES 奖励（纯读函数）
// v2.0：特殊任务 + 彩蛋系统（从 events.js 提取，打破 main.js ↔ events.js 循环依赖）
import { checkEasterEggs } from './modules/progression.js';
// v2.5.4 ①：快照存档（最多 3 槽 / 覆盖当前本地游戏 / 二级确认）
import { saveSnapshot, coverOldest, listSnapshots, snapshotData, deleteSnapshot, overwriteSnapshot, importToSnapshot, createFreshSnapshot, renameSnapshot, SNAP_MAX, SNAP_NAME_MAX, fmtStamp } from './modules/snapshots.js';
// v3.10.4 ④：导入模式（'current' = 覆盖当前；'snapshot' = 导入为新快照）；模块级声明，供模块级的 importSave 读取
let importMode = 'current';
// v2.0：故事线管理器
import { getCurrentStoryline, loadStoryline, lockStorylineSwitch, getStorylinePackage } from './core/storylineManager.js';
import { tickProjects, claimProject, spawnProject, maxProjects, normalizeProjectGoals, setProjectLogFn, rewardText } from './modules/projects.js';
import { tickReligion, renderReligionPanel, bindReligionPanel, canUnlockReligion, setReligionLogFn, setReligionToastFn, refreshReligionAffordability } from './modules/religions.js'; // v2.8.26 ④
import { renderPolicyPanel, bindPolicyPanel, setPolicyLogFn, setPolicyToastFn } from './modules/policies.js';
import { policyOpenGroups, hasPendingPolicy, policyMult, POLICY_GROUPS } from './data/policies.js';
import { tickDelve, renderDelvePanel, bindDelvePanel, canUnlockDelve, delveUnlocked, setDelveLogFn, setDelveToastFn } from './modules/delve.js';
import { tickBazaar, renderBazaarPanel, bindBazaarPanel, canUnlockBazaar, bazaarUnlocked, setBazaarLogFn, setBazaarToastFn } from './modules/bazaar.js'; // v3.0.0：深渊集市（大模块）
import { religionUnlocked, faithCap } from './data/religions.js'; // v3.4.9 反馈⑧：FP 上限进顶栏
import { renderShop, renderThreadShop, renderVehicles, renderDmShop, renderBuildings, renderV21Buildings, renderCrossroadBuildings, renderFamilyUpgrades, renderOfflineUpgrades, refreshShopAffordability, refreshShopItem, refreshV21Item, refreshShopChain, renderRpFamily, renderResearchUpgrades, renderAtriumDistill, renderAtriumSwitch, renderHatchUpgrade, setToastFn, researchUpgCost, RP_GROUPS, buyUpgrade, researchResourceUnlocked, RESEARCH_RES_ANCHORS, bindFoldToggle } from './modules/shop.js'; // v3.7.0 QA：研究分组 + 自动玩家走真实购买入口 // v2.3.1 ⑥：setBulk/getBulk 移除；v2.8.2 ④：renderRpFamily（RP 加成组） // v4.2.5 ①：bindFoldToggle 导出（研究点/科技树/遗物纯类目 h3 统一折叠）
import { EXPAND_KEY, anchorShown, anchorDone, riftShown, petsModuleUnlocked, starChartUnlocked } from './modules/disclosure.js'; // v2.3.1 缺陷④清档回收 + ①锚点判定（rev18 9.1/9.2）；v3.7.2 ①：异兽模块唯一解锁判定源
import { rollProfession, aiSuggestedProfession, tickThreads, autoAssignThreads, leaderCount, leaderGlobalMult, canBind, bindThread, unbindThread, releaseAllThreads, converterThreadBoost, threadLevelFromXp, converterEnabled, converterUnlocked, unlockedConverterIds, threadBindOutputFactor, threadBindSalaryFactor, setConverterEnabled, converterCapacity, converterLoad } from './modules/threadBinding.js'; // v3.6.5 ①~③：岗位容量 QA 钩子 // v3.3.0 线程绑定系统 // v3.3.1：转化器开关统一口径 // v3.6.3 ③：岗位解锁唯一判定源
// v3.0.0 测试性解耦：侧效工具（日志/toast/脏检查/确认框）下沉到 DOM 无关的 core 模块，
// 使 shop/expedition/echoShop/rift/tech 可在纯 Node 下单测，浏览器行为不变。
import { dirty, log, toast, askConfirm, registerConfirmHooks, bindConfirmButtons } from './core/runtime.js';
import { gateOpen, chapterAtLeast } from './core/chapterGates.js'; // v4.2.0：章节门禁（一章一新模块）
import { renderTech, refreshTechState, renderEternal, buyTech, buyEternal } from './modules/tech.js';
import { ETERNALS } from './data/eternals.js'; // v4.2.6：分章节推演自动玩家购买永恒矩阵（QA 钩子；esCost 走 economy 包装版）
import { getTechs } from './core/provider.js'; // v3.11.0：30 天推演经产品真实入口购买「自动研究」
import { tickWages, setWageLogFn, setWageToastFn } from './modules/wages.js'; // v1.3 C
import { renderCrewPanel, crewPush, crewShown, crewStateMeta } from './modules/crew.js'; // v3.1.0 反馈③：班组面板（线程拟人化） // v3.6.2 反馈①：≥10 线程解锁
import { tickVehicleCollect, setVehicleLogFn } from './modules/vehicles.js'; // v1.3 D
import { tickAI, renderAiPanel, setAiLogFn, setAiUiRefreshFn, aiUnlocked, aiHireFlag, autoBuildUnlocked, allResDiscovered, autoBuildActivateCost, refreshAssistantAffordability,
  assistantCount, assistantCost, assistantBuyState, buyAssistant, setAiSwitch, allOffActions,
  crewOf, crewBoundTotal, crewIdle, setCrew,
  actionCounts, totalActionCount, stalledActions, recordAction, actionAvailable,
  activateAutoBuild, autoBuildActivable } from './modules/ai.js'; // v1.3 A // v3.2.4 反馈④：自动购建区块显隐/EP 充足态检测 // v3.7.5：编队按钮可购态快刷 // v3.11.0：AI 自动化真实入口 QA 钩子
import { AI_ACTIONS, AI_ACTION_IDS, AI_ACTION_SWITCH_KEYS, AI_CREW_REQUIRED_IDS,
  ALL_OFF_SWITCH_KEYS, AI_ACTION_GROUPS, maxCycleCrewDemand, crewSizeOf, groupRankOf } from './core/aiActionRegistry.js'; // v3.11.0：自动化动作声明层 QA 钩子；v3.11.2：消耗→常驻班组，重命名派生清单
import { renderRelics, buyRelic, buyPurifier, setRelicsLogFn, setRelicsToastFn, refreshRelicAffordability } from './modules/relics.js'; // v2.7.0：深渊遗物；v2.8.22 ⑥：净化节点；v2.8.26：DM 灰态每秒刷新
import { relicsUnlocked, RELICS, relicLevel } from './data/relics.js'; // v2.7.0：遗物入口门控；v3.3.7 反馈①：结构签名
import { renderPetGrid, renderPetFloat, gainPetExp, activePetIds, refreshPetsAffordability, petUpkeepTotalPerSec, petStarving } from './modules/pets.js'; // v2.8.26：PT 灰态每秒刷新 // v3.2.1 反馈⑨：出战维持 // v3.2.3 反馈⑥：休战过渡日志
import { renderPrestige, renderTalentModal, doPrestige, canPrestige } from './modules/prestige.js';
import { renderEchoShop } from './modules/echoShop.js'; // v4.2.X：轮回移除，回响商店并入晋升面板
import { moduleVisible, buyModuleUnlock } from './modules/moduleUnlocks.js'; // v3.12.0 反馈⑬：职级点买断大模块
import { isStageUnlocked } from './core/progressive.js';
import { checkGate, getAllGates } from './core/gates.js';
import { chapterRank, chapterProgress, chapterCode, chapterSeq, getStorylineEvents, getStorylinePets, validateEvent } from './core/storylineContent.js'; // v3.7.0：章节 ID 统一口径
import { lineRule, lineFlag, allLineRuleKeys, LINE_RULE_LABELS } from './core/lineRules.js'; // v3.7.0 QA
import { maybeTriggerEvent, peekNextEvent, eventPool } from './modules/events.js';
import { applyOffline, renderOfflinePanel } from './modules/offline.js';
import { renderStoryBar, currentChapter } from './modules/story.js';
import { tickRift, renderRift, renderRiftPanel, refreshRiftAffordability, buyRiftUpgrade, abortRiftExpedition, discoverDm, riftEtaSec, riftNextSec, fmtEta, riftUpgradeLevel, riftPurgeCostMult, riftThreadsReady, riftLevelOf, riftLevelTech, buyRiftLevelTech } from './modules/rift.js'; // v3.6.4 ①：裂隙等级 QA 钩子 // v3.3.9 反馈⑤：裂隙等级科技（v4.3.14 反馈③迁入裂隙模块）// v3.4.9：自动净化/净化成本倍率 // v3.6.2 反馈②：线程解锁门槛
import { ensureAbyssGaze, setGazeInteract } from './modules/abyssGaze.js'; // v3.4.2：凝视深渊彩蛋——重载后常驻裂开
import { ensureWishWell, initWishWell, ensureFarewellGift, initFarewellGift, tickFarewellRecall } from './modules/wishDock.js';
import { tickExpeditions, tickColonies, renderExpeditions, refreshExpeditionAffordability } from './modules/expedition.js'; // v3.0.5 反馈②：星图/宇宙可购态快刷
import { UPGRADES } from './data/upgrades.js';
import { CHAPTERS } from './data/chapters.js'; // v2.8.15：Wiki 章节讲解
import { WIKI_SECTIONS, WIKI_GROUPS, wikiUnlocked } from './data/wiki.js'; // v2.9.0：体系化百科（KG 风格）；v3.12.6 ⑨：玩法索引分组
import { PETS } from './data/pets.js';
import { MOOD_MULT, CONVERTERS } from './data/threads.js'; // v3.6.5 ⑤：招募自动安置的岗位名
import { BALANCE } from './data/balance.js';
// v3.8.0 核心玩法抽象：资源流引擎（声明 → 求值 → 消费），主循环不再内联任何结算公式
import { runFlows, flowStats, flowLedger, flowErrors, FLOW_PHASES } from './core/flowEngine.js';
import './systems/resourceFlows.js'; // 副作用：注册全部资源流（必须在 tick 之前完成）
// v3.9.0 核心玩法抽象（控制流层）：帧系统调度 + 声明式面板分发
import { runSystems, systemStats, systemErrors, FRAME_PHASES } from './core/systemScheduler.js';
import { registerFrameSystems, buildTideSchedulingHtml } from './systems/frameSystems.js';
import { registerPanel, renderPanels, panelErrors, allPanels } from './core/panelRegistry.js';
import { ORCHESTRATION_MODES, TIDE_ORCHESTRATION, TIDE_PHASE_NAMES, SCHEDULE_UNLOCK,
  orchestrationUnlocked, orchestrationState, scheduleUnlocked, orchestrationSchedule,
  scheduleCustomized, setOrchestrationPhaseMode, resetOrchestrationSchedule,
  chooseOrchestrationMode, chooseOrchestrationAutoTide,
  setOrchestrationMode, setOrchestrationAutoTide, toggleOrchestrationAutoTide,
  effectiveMode, effectiveModeId, orchestrationSummary,
  orchestrationMult } from './core/orchestration.js';
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

// v4.0.8 反馈①：共鸣焦点图标改三角形族（与编排策略的方块/菱形族区分）——
// 四条管线四种不同的三角形：实心上 ▲ / 空心 △ / 实心下 ▼ / 空心下 ▽。
const RES_FOCUS_ICONS = { ep: '▲', rp: '△', pt: '▼', dm: '▽' };

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

  // v3.12.8 ④：策略描述按需渲染——「均衡编排」无增益无代价，不再补一句说明文字。
  // v4.0.8 反馈①：删除「当前编排」行——按钮的 aria-pressed 高亮已表达当前策略，
  //   单独一行文字与相位共鸣的焦点按钮并存时反生歧义（用户反馈「容易引起误解」）。
  // v4.1.2 反馈②：按「效能编排 / 相位共鸣」分块展示——原实现策略行、共鸣三角按钮、
  //   两组倍率 grid 混排在一段里，文字与图标看不出归属。现在每块自带标题行，
  //   块间用分隔线区隔，倍率只读本块数据（编排 summary / 共鸣 res.rows）。
  let html = '';
  const blockTitle = (icon, name, note) => `<div class="orch-block-title"><span aria-hidden="true">${icon}</span> ${name}${note ? `<span class="orch-block-note">${note}</span>` : ''}</div>`;

  // ===== 块一：效能编排（策略按钮 + 潮汐排班 + 编排倍率） =====
  html += `<section class="orch-block" data-orch-block="orchestration">`;
  // v4.2.3 反馈②：删除标题注脚「策略与潮汐排班」与行尾「编排倍率」标签——两块内容自明，标签纯冗余。
  html += blockTitle('◈', '效能编排');
  // v3.12.13 反馈 #164：潮汐排班与四种策略同排。
  html += buildTideSchedulingHtml({ S, st, auto, schedOK, sched, ORCHESTRATION_MODES, scheduleCustomized });
  // v3.10.1：四行编排倍率（策略层，不含共鸣），圆族标记（●增益 ◐小幅 ○持平/减益）。
  html += `<div class="orch-mult-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px;font-size:11px;color:var(--text-2)">`;
  for (const x of summary) {
    const color = x.mult > 1.0001 ? 'var(--good,#3fb950)' : x.mult < 0.9999 ? 'var(--warn)' : 'var(--text-3)';
    const mark = x.mult > 1.05 ? '●' : x.mult > 1.0001 || (x.mult < 0.9999 && x.mult >= 0.95) ? '◐' : '○';
    html += `<div style="white-space:nowrap"><span aria-hidden="true">${mark}</span> ${x.label} <b class="mono" style="color:${color}">×${x.mult.toFixed(2)}</b></div>`;
  }
  html += `</div></section>`;

  // ===== 块二：相位共鸣（开关 + 焦点三角按钮 + 共鸣倍率 + 层数） =====
  // v4.0.0 反馈④：共鸣与编排同级——一个开关 + 四种焦点按钮同排；倍率读数与层数保留。
  // v4.0.8 反馈①：共鸣图标整族三角形（开=▲ / 四种焦点不同三角），与编排方/菱形族区分。
  // v4.1.0 反馈③：层数压缩为「0/20」跟在焦点后（nowrap）；焦点管线的倍率前显示其三角标。
  if (res.unlocked) {
    html += `<section class="orch-block" data-orch-block="resonance">`;
    html += blockTitle('▲', '相位共鸣');
    html += `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin:8px 0 6px">
      <button class="btn-mini" data-res-toggle="1" aria-label="切换相位共鸣开关" aria-pressed="${res.enabled}" title="相位共鸣 ${res.layers}/${res.maxLayers} 层" style="min-height:28px;min-width:28px;display:inline-flex;align-items:center;justify-content:center;${res.enabled ? 'border-color:var(--accent);color:var(--accent);' : ''}">${res.enabled ? '▲' : '△'}</button>
      ${RESONANCE_FOCI.map(f => `<button class="btn-mini" data-res-focus="${f.id}" title="共鸣焦点改为${f.name}" aria-label="共鸣焦点改为${f.name}" aria-pressed="${res.focus === f.id}" style="min-width:28px;min-height:28px;display:inline-flex;align-items:center;justify-content:center;${res.focus === f.id ? 'border-color:var(--accent);color:var(--accent);' : ''}">${RES_FOCUS_ICONS[f.id] || f.icon}</button>`).join('')}
      <span style="font-size:10.5px;color:var(--text-3);margin-left:auto;white-space:nowrap" title="相位共鸣层数（每 12 秒 +1，换相位减半）">${res.layers}/${res.maxLayers}</span>
    </div>
    <div class="orch-mult-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px 12px;font-size:10.5px;color:var(--text-2);margin-bottom:6px">
      ${res.rows.map(r => `<div style="white-space:nowrap"><span aria-hidden="true" style="${r.focused ? 'color:var(--accent)' : 'opacity:.35'}">${RES_FOCUS_ICONS[r.key] || r.icon}</span> ${r.label} <b class="mono" style="color:${r.mult > 1.0001 ? 'var(--good,#3fb950)' : r.mult < 0.9999 ? 'var(--warn)' : 'var(--text-3)'}">×${r.mult.toFixed(2)}</b></div>`).join('')}
    </div></section>`;
  // v4.3.11 反馈④：共鸣未解锁时整块不展示——v4.3.5 反馈④ 的「预告行」用户实测后仍嫌
  //   「展示并写明无用文案」（预告没有可操作内容，纯占位）；番外章节树与 wiki 已承担指引职责。
  }
  el.innerHTML = html;
  placeTideSchedPop(); // v4.0.0 ⑤：fixed 浮层按触发按钮视口坐标重定位
}

/**
 * v4.0.0 反馈⑤：潮汐预案浮层改 position:fixed 后，需按「潮汐排班」按钮的
 * 视口坐标写入 left/top，并在视口边界内翻转（下方放不下就翻到上方）。
 * 显隐仍由 .tide-sched-wrap:hover / :focus-within 的注入 CSS 控制，DOM 结构不变。
 */
function placeTideSchedPop() {
  if (typeof document === 'undefined') return;
  const wrap = document.querySelector('.tide-sched-wrap');
  const pop = wrap && wrap.querySelector('.tide-sched-pop');
  const btn = wrap && wrap.querySelector('[data-orch-auto]');
  if (!pop || !btn) return;
  // 浮层默认 display:none，先临时显示测量真实尺寸（不改变显隐契约）
  const prevDisplay = pop.style.display;
  const prevVisibility = pop.style.visibility;
  pop.style.visibility = 'hidden';
  pop.style.display = 'block';
  const w = pop.offsetWidth || 240;
  const h = pop.offsetHeight || 200;
  pop.style.display = prevDisplay;
  pop.style.visibility = prevVisibility;
  const r = btn.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  // 0 间隙：浮层是 wrap 的 DOM 后代，鼠标从按钮移入浮层时 :hover 不会中途丢失
  const below = r.bottom;
  const top = (below + h <= vh - 8) ? below : Math.max(8, r.top - h);
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function bindOrchestrationPanel() {
  const el = document.getElementById('orchestration-panel');
  if (!el) return;
  // v4.0.0 ⑤：hover 进入 / 窗口尺寸变化 / 任一层滚动时重定位 fixed 浮层。
  el.addEventListener('mouseover', (e) => {
    if (e.target && e.target.closest && e.target.closest('.tide-sched-wrap')) placeTideSchedPop();
  });
  el.addEventListener('focusin', (e) => {
    if (e.target && e.target.closest && e.target.closest('.tide-sched-wrap')) placeTideSchedPop();
  });
  window.addEventListener('resize', placeTideSchedPop);
  window.addEventListener('scroll', placeTideSchedPop, true);
  el.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn) return;
    if (btn.dataset.orchMode) {
      // v4.0.6 反馈①：五个选项互斥——选中具体策略即退出潮汐排班并固定该策略。
      const wasAuto = orchestrationState(S).autoTide;
      if (!chooseOrchestrationMode(S, btn.dataset.orchMode)) return;
      log(wasAuto
        ? `效能编排：退出潮汐排班，固定「${effectiveMode(S).name}」`
        : `效能编排：切换为「${effectiveMode(S).name}」`, 'good');
    } else if (btn.dataset.orchAuto) {
      // v4.0.6 反馈①：潮汐排班只是选项之一——已选中时再点不产生动作（不做「再点关闭」）。
      if (orchestrationState(S).autoTide) return;
      if (!chooseOrchestrationAutoTide(S)) return;
      log('效能编排：切换为「潮汐排班」', 'good');
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

// v3.12.7 ③：故事线正文抽成纯模板函数——右列窄卡与放大弹窗共用同一份树，
//   避免「弹窗里是另一套渲染」的两头维护。
function storylineBodyHtml() {
  const current = getCurrentStoryline();
  const completed = S.storylinesCompleted || [];
  const crossById = (BALANCE.crossroadBuildings || []).find(b => b.id === S.crossroadLockedBy);
  // v3.3.1 反馈⑧：面板标题已在 index.html（#storyline-h3）——此处不再重复输出「故事线」行
  let html = '';
  // v3.12.12 反馈⑨：故事线改为「章节树状结构」——主干按 S.chapter 渲染主线章节
  //   （第一章（剧情）/ 第二章（剧情）/ …），与具体故事线解耦，为将来岔路做铺垫；
  //   选定故事线后其变体章节作为分支挂在主干之后（同 .sl-forest 结构）。
  const cur = currentChapter(S, CHAPTERS);              // 主干当前章节（含 S.chapter 权威下限）
  const curName = getStorylinePackage(current)?.name || current;
  const storedNum = parseInt(S.chapter, 10) || 1;
  const mainIndex = Math.max(
    storedNum,
    typeof cur.id === 'number' ? cur.id : (parseInt(String(cur.id), 10) || storedNum)
  );
  html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">当前剧情：<b style="color:var(--purple)">${cur.name}</b>${current !== 'default' ? ` · 路线：<b>${curName}</b>` : ''}</div>`;
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
  // v3.12.12 反馈⑨：先渲染主干（主线章节，与故事线解耦），再挂选定故事线的变体分支。
  const mainChs = CHAPTERS.filter(ch => typeof ch.id === 'number' && ch.id <= mainIndex);
  const ALL_LINES = ['line_abyss', 'line_order', 'line_faith'];
  const branchLines = ALL_LINES.filter(id => id === current || completed.includes(id));
  if (mainChs.length > 0 || branchLines.length > 0) {
    html += `<div class="sl-forest">`;
    // —— 主干：主线章节 1..mainIndex ——
    if (mainChs.length > 0) {
      html += `<div class="sl-line"><div class="sl-line-name">主线剧情</div><div class="sl-tree">`;
      mainChs.forEach((ch, i) => {
        const last = i === mainChs.length - 1;
        const mark = ch.id === mainIndex ? '<span class="sl-cur">当前</span>' : '';
        const label = (ch.id >= 1 && ch.id <= 18) ? `第${ch.id}章（剧情）` : ch.name;
        const theme = ch.name.replace(/^第[^·]*·\s*/, '');
        html += `<div class="sl-node${last ? ' last' : ''}"><div class="sl-ch-name">${label}${mark}</div>`;
        html += `<div class="sl-ch-desc">${theme}：${ch.desc}</div></div>`;
      });
      html += `</div></div>`;
    }
    // —— 分支：选定故事线的变体章节（为岔路铺垫）——
    for (const id of branchLines) {
      const pkg = getStorylinePackage(id);
      if (!pkg) continue;
      const chs = (pkg.data && pkg.data.chapters && pkg.data.chapters.append) || []; // 章节数据在 pkg.data.chapters 下
      const seenChs = (S.chaptersUnlocked && S.chaptersUnlocked[id]) || [];
      const nodes = [];
      // v3.12.6 ⑦：树只挂「已解锁」的章节（cond 成立 或 写进 chaptersUnlocked），不再顺次外推。
      for (const ch of chs) {
        let ok = false;
        try { ok = !!ch.cond(S); } catch (e) { /* cond 内部异常按未解锁处理 */ }
        const code = chapterCode(ch.id);
        if (seenChs.includes(code) || seenChs.includes(chapterSeq(ch.id))) ok = true;
        if (ok) nodes.push(ch);
      }
      if (!nodes.length) continue;
      html += `<div class="sl-line"><div class="sl-line-name">${pkg.name}${id === current ? '<span class="sl-cur">当前</span>' : ''}</div>`;
      html += `<div class="sl-tree">`;
      nodes.forEach((ch, i) => {
        const last = i === nodes.length - 1;
        html += `<div class="sl-node${last ? ' last' : ''}"><div class="sl-ch-name">${ch.name}</div>`;
        if (ch.desc) html += `<div class="sl-ch-desc">${ch.desc}</div>`;
        html += `</div>`;
      });
      html += `</div></div>`;
    }
    html += `</div>`;
  }
  return html;
}

// 放大弹窗打开时才刷新内容（关闭态不做无谓重渲染）
function renderStorylineModal() {
  const m = document.getElementById('sl-modal');
  const body = document.getElementById('sl-modal-body');
  if (!m || !body || m.style.display !== 'flex') return;
  body.innerHTML = storylineBodyHtml();
}

function renderStorylinePanel() {
  const el = document.getElementById('storyline-panel');
  if (!el) return;
  el.innerHTML = storylineBodyHtml();
  renderStorylineModal();
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
  // v4.2.X：内联 parseInt(chapter)>=5 改走章节门禁真源（与 CHAPTER_GATES / 其它章节判定同口径）。
  if (S.crossroad === 'inactive' && chapterAtLeast(5, S)) {
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
    ensureFarewellGift();   // v2.9.2：离职礼盒（v4.3.11 起仅流失预警 losing 期间出现）
    tickFarewellRecall();   // v4.3.11 反馈③：礼盒 5 分钟召回窗（60s 一次概率判定）
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
      // v4.2.0：永恒矩阵绑第 8 章「飞升」（超脱本局）——原 esDiscovered 条件保留，AND 章节门禁。
      //   去掉旧 _esLocked 单次缓存：章节推进到 8 时若 ES 已发现但当时未渲染，必须能重新出现。
      if (esDiscovered() && gateOpen('eternals', S)) { renderEternal(eternalEl); if (eternalTitle) eternalTitle.style.display = ''; }
      else { eternalEl.innerHTML = ''; if (eternalTitle) eternalTitle.style.display = 'none'; }
    }
    const riftTechEl = document.getElementById('rift-tech-list');
    if (riftTechEl) riftTechEl.innerHTML = ''; // v4.3.14 反馈③：裂隙等级已迁入裂隙模块（旧挂载点清空兜底）
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
    if (preEl) renderPrestige(preEl); // v4.2.X：回响商店已并入晋升面板
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
  // v4.2.X：轮回已移除——回响商店并入晋升面板（见 renderPrestige 的 echo-shop 容器），无独立面板。
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
  // v3.12.3 反馈⑧：EP 耗尽预警不再并入「产出 / 消耗」两处气泡文案——
  // 改由消耗侧独立的 ❗ 承载（自带悬浮），气泡只陈述各自的来源与加成。
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
  // v4.3.15 反馈⑤：h-run（本局累计 EP）顶栏 stat 已删除——晋升面板同口径承载，runEarned 仍为结算真源
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
    // v3.12.9：星图未开放（宠物尚未解锁）时，顶栏也不亮出该模块的资源
    const starOn = starChartUnlocked(S) && ((S.starCps || 0) > 0 || !!S.fuelMode
      || (S.expeditionsDone || 0) > 0 || (S.expeditions || []).length > 0 || hasTech('deep_space'));
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
    emberStat.style.display = riftShown(S) ? '' : 'none'; // v4.2.X：统一裂隙门控真源
    hEmber.textContent = Math.floor(S.riftEmber || 0); // v3.3.8 反馈②：整数显示，与购买判定同口径（原四舍五入会出现「显示 20 但买不了 20 的项」）
  }
  const hVs = document.getElementById('h-vs');
  const vsStat = document.getElementById('vs-stat');
  if (hVs && vsStat) { // v3.0.3 第六批⑤：虚空碎片顶部展示（深潜解锁后常显）
    vsStat.style.display = delveUnlocked() ? '' : 'none';
    hVs.textContent = fmt(S.vs || 0);
  }
  const hBuff = document.getElementById('h-buff');
  // v4.2.X：轮回已移除，轮回次数 stat 不再渲染；回响数值保留顶栏独立显示（由晋升结算获得）。
  const hEcho = document.getElementById('h-echo');
  const echoStat = document.getElementById('echo-stat');
  if (hEcho && echoStat) {
    const echo = S.abyssEcho || 0;
    echoStat.style.display = echo > 0 ? '' : 'none';
    hEcho.textContent = fmt(echo);
    echoStat.title = `深渊回响 ${echo} · 全局产出 +${(echo * (BALANCE.reincarn?.echoPerPoint ?? 0.05) * 100).toFixed(0)}%（晋升时结算，跨晋升保留）`;
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
  // v4.1.2：来源悬浮改真实 DOM 气泡（#flow-tip-pop），按来源/加成分组换行；
  //   旧 data-tip 纯文本 + nowrap 会把长串挤成一团且被顶栏 overflow 裁剪，这里不再写入。
  //   气泡显示时由 refreshFlowTip() 同步最新数值（见下）。
  const hDrainWarn = document.getElementById('h-drain-warn');
  if (hDrainWarn) {
    hDrainWarn.style.display = drainWarn ? '' : 'none';
    // v4.3.3 反馈⑦：删感叹号自身的 data-tip 气泡——它挂在 #h-drain-stat 子元素上，
    //   悬浮冒泡同时触发 v4.1.2 的 #flow-tip-pop（来源明细含耗尽预估），形成双弹。
    //   保留 aria-label 声明语义，有效气泡只保留 flow-tip-pop 一个。
    const warnTip = drainWarn ? `净流为负：按当前产出/消耗，EP 预计 ${fmtDepletionEta(etaSec)} 后耗尽` : '';
    hDrainWarn.removeAttribute('data-tip');
    hDrainWarn.setAttribute('aria-label', warnTip);
  }
  if (hSalary) hSalary.textContent = fmt(drain) + '/s';
  // v4.1.2：气泡显示期间同步最新来源明细（数值每秒在变，避免悬浮时看到旧数据）
  if (_flowTipKind) {
    const p = document.getElementById('flow-tip-pop');
    if (p) {
      const html = flowTipHtml(_flowTipKind);
      if (p._tipSig !== html) { p._tipSig = html; p.innerHTML = html; }
    }
  }
  // v4.3.15 反馈⑤：h-run 写入已删（顶栏不再显示本局累计 EP）
  // v4.0.5：职级点按整数展示（旧档若残留 1.414… 也不会把顶栏撑成长小数）
  if (hRank) hRank.textContent = String(Math.max(0, Math.round(Number(S.prestigePoints) || 0)));
  if (hRp) hRp.textContent = fmt(S.rp) + ' / ' + fmt(rpCap()); // v2.8.27 ②：RP 存储上限（矩阵存储库扩容）
  if (hEs) hEs.textContent = fmt(S.es);
  // v3.4.9 反馈⑧：FP 有上限就必须显示上限（此前只有数值，玩家以为「卡住不涨」）
  if (hFaith) hFaith.textContent = `${(S.faith || 0).toFixed(2)} / ${faithCap()}`; // v2.6.4 ③：信仰精确 2 位小数
  // v3.4.1 反馈④：PT/DM 两侧统一走 fmtRes（<1000 两位小数，≥1000 k/M）——不再出现「2000.00 / 2.00k」
  if (hPt) hPt.textContent = fmtRes(S.pt || 0) + ' / ' + fmtRes(ptCap()); // v2.8.27 ②：PT 存储上限（饵料仓库扩容）
  if (hDm) hDm.textContent = fmtRes(S.dm || 0) + ' / ' + fmtRes(dmCap()); // v2.8.27 ②：DM 存储上限（星尘金库扩容）
  if (hBuff) hBuff.innerHTML = buffTag;
  // v2.5 ⑦：主面板离线展示（离线效率/上限/预期）整块移除——离线玩法保留在「离线」tab
  // v4.2.8 反馈④：科技树页头「当前 N RP」文案已下线（顶栏已有同口径），tech-rp 元素与更新逻辑一并移除
  const tEs = document.getElementById('tech-es');
  if (tEs) tEs.textContent = fmt(S.es);
  // v2.5 ⑦：主面板离线展示（离线效率/上限/预期）整块移除——离线玩法保留在「离线」tab
  refreshTabVisibility();
}

// ========== v2.0 潮汐卡片 ==========
// v4.2.2 反馈④：加成明细（产出/薪资/科技成本/事件权重）改为真实 DOM 悬浮气泡，
//   顶栏只留「图标 + 相位名 + 倒计时」——原内联 epTag/salTag/techTag 三段把顶栏挤满，
//   悬浮说明走 v4.1.2 flow-tip-pop 同款范式（fixed + JS rect 写坐标 + 语义色浅色主题覆盖）。
function renderTide() {
  const el = document.getElementById('h-tide');
  if (!el) return;
  const info = tidePhaseInfo(S.tidePhase);
  el.innerHTML = `<span class="tide-icon ${info.cssClass}">${info.icon}</span><span>${info.name}</span><span class="tide-time mono">${fmtTime(S.tideTimer)}</span>`;
  updateTideTip();
  document.body.classList.remove('tide-flood', 'tide-calm', 'tide-ebb', 'tide-chaos');
  document.body.classList.add(info.cssClass);
}

/** v4.2.2 反馈④：潮汐明细气泡内容（相位 + 全部生效效果分组展示）。 */
function tideTipHtml() {
  const info = tidePhaseInfo(S.tidePhase);
  const epMult = tideMult('ep');
  const salMult = tideMult('salary');
  const techMult = tideMult('techCost');
  const pct = (m) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`;
  const row = (label, txt, cls) => `<div>· <span class="w-dim">${label}</span> <b class="${cls}">${txt}</b></div>`;
  let html = `<b>潮汐·${info.name} <span class="w-dim">（每相位 150 秒轮转）</span></b>`;
  html += `<div class="ft-group"><span class="ft-label">当前加成</span>`;
  let any = false;
  if (epMult !== 1) { html += row('产出', pct(epMult), epMult > 1 ? 'w-good' : 'w-bad'); any = true; }
  if (salMult !== 1) { html += row('薪资', pct(salMult), salMult > 1 ? 'w-good' : 'w-bad'); any = true; }
  if (techMult !== 1) { html += row('科技成本', pct(techMult), techMult < 1 ? 'w-good' : 'w-bad'); any = true; }
  if (info.eventBadWeight !== 1) { html += row('负面事件概率', `×${info.eventBadWeight}`, info.eventBadWeight > 1 ? 'w-bad' : 'w-good'); any = true; }
  if (info.eventGoodDur !== 1) { html += row('正面事件持续', `×${info.eventGoodDur}`, info.eventGoodDur > 1 ? 'w-good' : 'w-bad'); any = true; }
  if (!any) html += `<div class="w-dim">· 无修正</div>`;
  html += `</div>`;
  html += `<div class="ft-note w-dim">四相位循环：涨潮（产出↑薪资↑）→ 平潮（无修正）→ 退潮（产出↓薪资↓）→ 乱流（负面事件↑）。科技树按当前相位价格结算。</div>`;
  return html;
}

/** v4.2.2 反馈④：潮汐气泡显隐与定位（复用 flow-tip-pop 的 wage-tip-pop 基类）。 */
function bindTideTipPop() {
  if (typeof document === 'undefined') return;
  const zone = document.getElementById('h-tide');
  if (!zone || zone._tideTipBound) return;
  zone._tideTipBound = true;
  // 移除 index.html 里的静态长 title，避免与真实 DOM 气泡双弹
  zone.removeAttribute('title');
  let pop = document.getElementById('tide-tip-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'tide-tip-pop';
    pop.className = 'wage-tip-pop tide-tip-pop';
    pop.setAttribute('role', 'tooltip');
    pop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pop);
  }
  const place = () => {
    const r = zone.getBoundingClientRect();
    const p = document.getElementById('tide-tip-pop');
    if (!p) return;
    const tipW = Math.min(340, window.innerWidth * 0.9);
    const below = r.top < 300; // 顶栏在页面顶部 → 一律翻到下方
    p.classList.toggle('tip-below', below);
    p.style.setProperty('--tip-x', Math.max(8, Math.min(r.left, window.innerWidth - tipW - 8)) + 'px');
    p.style.setProperty('--tip-y', (below ? r.bottom + 8 : r.top - 8) + 'px');
  };
  const show = () => {
    const p = document.getElementById('tide-tip-pop');
    if (!p) return;
    const html = tideTipHtml();
    if (p._tipSig !== html) { p._tipSig = html; p.innerHTML = html; }
    place();
    p.classList.add('show');
    p.setAttribute('aria-hidden', 'false');
  };
  const hide = () => {
    const p = document.getElementById('tide-tip-pop');
    if (p) { p.classList.remove('show'); p.setAttribute('aria-hidden', 'true'); }
  };
  zone.addEventListener('mouseenter', show);
  zone.addEventListener('focusin', show);
  zone.addEventListener('mouseleave', hide);
  zone.addEventListener('focusout', hide);
  window.addEventListener('scroll', () => { if (pop.classList.contains('show')) place(); }, true);
  window.addEventListener('resize', () => { if (pop.classList.contains('show')) place(); });
}

/** v4.2.2 反馈④：气泡显示期间同步倒计时/加成变化（数值每秒在变，避免悬浮时看到旧数据）。 */
function updateTideTip() {
  if (typeof document === 'undefined') return;
  const p = document.getElementById('tide-tip-pop');
  if (!p || !p.classList.contains('show')) return;
  const html = tideTipHtml();
  if (p._tipSig !== html) { p._tipSig = html; p.innerHTML = html; }
  const zone = document.getElementById('h-tide');
  if (zone) {
    const r = zone.getBoundingClientRect();
    p.style.setProperty('--tip-x', Math.max(8, Math.min(r.left, window.innerWidth - 348)) + 'px');
    p.style.setProperty('--tip-y', (r.top < 300 ? r.bottom + 8 : r.top - 8) + 'px');
  }
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

/**
 * v4.0.8 反馈②：线程薪资四态说明气泡——真实 DOM 版（彩色文本）。
 * 结构签名去重：同内容不重写 DOM（每帧渲染不抖动）；显隐由 mouseenter/mouseleave 控制。
 * 四态行语义色：满薪 var(--good) / 欠薪+懒惰 var(--warn) / 休眠 #ff9800 / 流失 var(--bad)，
 * 与行内角标四态色一一对应（renderHero 的 txt/color 分支同源）。
 */
function renderWageTipPop({ txt, detail, W, salary }) {
  if (typeof document === 'undefined') return;
  let pop = document.getElementById('wage-tip-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'wage-tip-pop';
    pop.className = 'wage-tip-pop';
    pop.setAttribute('role', 'tooltip');
    pop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pop);
  }
  // v4.2.3 反馈①：文案精简——原文 6 行含大量重复前缀（「满薪：」「欠薪降效：」）与内置机制细节
  //   （维修坞免疫、EP 跌 0 解除等），且 .wage-tip-pop 缺 white-space:pre-line 导致 \n 全折叠成
  //   一大段（「字数多又重复」的真因）。现在只留「当前状态」+ 四态一行结论 + 恢复线。
  const html = `<b>当前：<span class="${WAGE_TIP_CLS[txt] || 'w-dim'}">${txt}</span>${detail ? ' · ' + detail : ''}</b>\n`
    + `<span class="w-dim">满薪：EP ≥ ${W.warnSec}s 薪资，无惩罚</span>\n`
    + `<span class="w-warn">欠薪：产出 ${fmtMultDelta(wageDebtMult(), { digits: 1 })}，持续 ${W.dormantAfterSec}s 转休眠</span>\n`
    + `<span class="w-orange">休眠：产出归零，只扣保底；久拖会流失线程</span>\n`
    + `<span class="w-warn">怠工（满仓 ${BALANCE.lazy.afterSec}s）：产出 ${fmtMultDelta(BALANCE.lazy.prodMult, { digits: 1 })}、消耗 ${fmtMultDelta(BALANCE.lazy.costMult, { digits: 1 })}</span>\n`
    + `<span class="w-good">恢复：EP 回到 ${W.recoverSec}s 薪资（${fmt(salary * W.recoverSec)} EP）</span>`;
  if (pop._tipSig !== html) {
    pop._tipSig = html;
    pop.innerHTML = html;
  }
}

// 四态名 → 气泡内「当前状态」文字的语义色类（与 renderHero 四态色同源）
const WAGE_TIP_CLS = { '满薪': 'w-good', '欠薪': 'w-warn', '休眠': 'w-orange', '流失预警': 'w-bad', '懒惰': 'w-warn', '待招募': 'w-dim' };

/** v4.0.8 反馈②：气泡显隐 + 按 wage-help-zone rect 定位（fixed + 上下翻转 + 左右钳制，与旧 ::after 同规则）。 */
function bindWageTipPop() {
  if (typeof document === 'undefined') return;
  const zone = document.getElementById('wage-help-zone');
  if (!zone || zone._wageTipBound) return;
  zone._wageTipBound = true;
  const pop = () => document.getElementById('wage-tip-pop');
  const place = () => {
    const p = pop();
    if (!p) return;
    const r = zone.getBoundingClientRect();
    const tipW = Math.min(360, window.innerWidth * 0.88);
    const below = r.top < 260; // 上方容纳不下 7 行说明 → 翻到行下方
    p.classList.toggle('tip-below', below);
    p.style.setProperty('--tip-x', Math.max(8, Math.min(r.left, window.innerWidth - tipW - 8)) + 'px');
    p.style.setProperty('--tip-y', (below ? r.bottom + 8 : r.top - 8) + 'px');
  };
  const show = () => { place(); const p = pop(); if (p) { p.classList.add('show'); p.setAttribute('aria-hidden', 'false'); } };
  const hide = () => { const p = pop(); if (p) { p.classList.remove('show'); p.setAttribute('aria-hidden', 'true'); } };
  zone.addEventListener('mouseenter', show);
  zone.addEventListener('focusin', show);
  zone.addEventListener('mouseleave', hide);
  zone.addEventListener('focusout', hide);
  // 滚动/改尺寸时气泡跟着挪（旧 ::after 随 hover 天然跟随，DOM 版需手动）
  window.addEventListener('scroll', () => { if (pop() && pop().classList.contains('show')) place(); }, true);
  window.addEventListener('resize', () => { if (pop() && pop().classList.contains('show')) place(); });
}

// v4.3.15 反馈①：蒸馏按钮悬浮气泡——原生 title 有浏览器 ~1s 显示延迟（「过很久才展出」），
// 改 fixed DOM 气泡（wage-tip-pop 范式）即时显示。文案来源 data-distill-tip（renderAtriumSwitch
// 每次重渲染时写入），事件委托挂稳定宿主 #rp-panel 容器（按钮重建不丢监听）。
function bindDistillTipPop() {
  if (typeof document === 'undefined') return;
  const zone = document.getElementById('rp-panel');
  if (!zone || zone._distillTipBound) return;
  zone._distillTipBound = true;
  // 气泡节点一次性创建挂 body（renderRpPanel 重建面板不影响 fixed 定位的气泡本体）
  if (!document.getElementById('distill-tip-pop')) {
    const popEl = document.createElement('div');
    popEl.id = 'distill-tip-pop';
    popEl.className = 'wage-tip-pop distill-tip-pop';
    popEl.setAttribute('role', 'tooltip');
    popEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(popEl);
  }
  const pop = () => document.getElementById('distill-tip-pop');
  const place = (anchor) => {
    const p = pop();
    if (!p || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const tipW = Math.min(360, window.innerWidth * 0.88);
    const below = r.top < 260;
    p.classList.toggle('tip-below', below);
    p.style.setProperty('--tip-x', Math.max(8, Math.min(r.left, window.innerWidth - tipW - 8)) + 'px');
    p.style.setProperty('--tip-y', (below ? r.bottom + 8 : r.top - 8) + 'px');
  };
  const anchorOf = (e) => e.target.closest ? e.target.closest('[data-distill-tip]') : null;
  const show = (e) => {
    const anchor = anchorOf(e);
    if (!anchor) return;
    const p = pop();
    if (!p) return;
    p.textContent = anchor.dataset.distillTip || '';
    place(anchor);
    p.classList.add('show'); p.setAttribute('aria-hidden', 'false');
  };
  const hide = () => { const p = pop(); if (p) { p.classList.remove('show'); p.setAttribute('aria-hidden', 'true'); } };
  zone.addEventListener('mouseover', (e) => { if (anchorOf(e)) show(e); });
  zone.addEventListener('mouseout', (e) => { if (anchorOf(e)) hide(); });
  zone.addEventListener('focusin', (e) => { if (anchorOf(e)) show(e); });
  zone.addEventListener('focusout', hide);
  window.addEventListener('scroll', () => { if (pop() && pop().classList.contains('show')) hide(); }, true);
}

// v4.3.2 反馈①：AI 台账悬浮气泡——fixed DOM（复用 wage-tip-pop），取代 data-tip::after 竖排。
// head 由 renderAi 每次重建（slot.innerHTML），监听委托在稳定宿主 #ai-card；文案读宿主 dataset（同步写入）。
function bindAiTipPop() {
  if (typeof document === 'undefined') return;
  const zone = document.getElementById('ai-card');
  if (!zone || zone._aiTipBound) return;
  zone._aiTipBound = true;
  const pop = () => document.getElementById('ai-tip-pop');
  const place = () => {
    const p = pop();
    if (!p) return;
    const anchor = zone.querySelector('[data-ai-head]');
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const tipW = Math.min(360, window.innerWidth * 0.88);
    const below = r.top < 260; // 上方容纳不下（AI 标题在面板顶部）→ 翻到行下方，与 wage 气泡同规则
    p.classList.toggle('tip-below', below);
    p.style.setProperty('--tip-x', Math.max(8, Math.min(r.left, window.innerWidth - tipW - 8)) + 'px');
    p.style.setProperty('--tip-y', (below ? r.bottom + 8 : r.top - 8) + 'px');
  };
  const show = () => {
    const p = pop();
    if (!p) return;
    p.textContent = zone.dataset.aiLedgerTip || '';
    place();
    p.classList.add('show'); p.setAttribute('aria-hidden', 'false');
  };
  const hide = () => { const p = pop(); if (p) { p.classList.remove('show'); p.setAttribute('aria-hidden', 'true'); } };
  zone.addEventListener('mouseenter', (e) => { if (e.target.closest('[data-ai-head]')) show(); });
  zone.addEventListener('mousemove', (e) => { if (e.target.closest('[data-ai-head]')) show(); else hide(); });
  zone.addEventListener('mouseleave', hide);
  zone.addEventListener('focusin', (e) => { if (e.target.closest('[data-ai-head]')) show(); });
  zone.addEventListener('focusout', hide);
  window.addEventListener('scroll', () => { if (pop() && pop().classList.contains('show')) place(); }, true);
  window.addEventListener('resize', () => { if (pop() && pop().classList.contains('show')) place(); });
}

// ========== v4.1.2：顶栏产出/消耗悬浮——真实 DOM 气泡 + 分组换行（复用 wage-tip-pop 范式） ==========
// 旧实现用 attr(data-tip) + ::after{white-space:nowrap}，长串「产出来源：A · B｜加成：C · D」挤成一团，
// 且 absolute 定位被顶栏 overflow 裁剪。这里改 fixed + JS rect 定位 + 每条来源/加成独占一行。
let _flowTipKind = null;
function flowTipHtml(kind) {
  const isOut = kind === 'output';
  const parts = isOut ? cpsBreakdown() : drainBreakdown();
  const mults = multBreakdown();
  // v4.3.14 反馈⑥：专注已是产出来源里的独立行（+X/s 绝对量），「加成与说明」组不再重复列百分比
  const wSt = (S.wageState || {}).state;
  const wageNote = (wSt === 'dormant' || wSt === 'losing') ? `休眠期仅扣保命成本 ×${wageKeepCostMult()}` : '';
  const title = isOut
    ? `<b>产出/s <span class="w-good">${fmt(computeCps())}/s</span></b>`
    : `<b>消耗/s <span class="w-bad">${fmt(totalDrainPerSec())}/s</span></b>`;
  let html = title;
  html += `<div class="ft-group"><span class="ft-label">${isOut ? '产出来源' : '消耗来源'}</span>`;
  if (!parts.length) html += `<div class="w-dim">· 无</div>`;
  else for (const p of parts) html += `<div>· ${escHtml(p)}</div>`;
  html += `</div>`;
  if (mults.length || wageNote) {
    html += `<div class="ft-group"><span class="ft-label">加成与说明</span>`;
    for (const m of mults) html += `<div>· ${escHtml(m)}</div>`;
    if (wageNote) html += `<div class="w-warn">· ${escHtml(wageNote)}</div>`;
    html += `</div>`;
  }
  // v4.1.2：净流口径说明——明确「理论速率 vs 实际扣减」的差异来源，消除「产<消 EP 仍涨」的疑惑
  const cps = computeCps(), drain = totalDrainPerSec();
  const net = cps - drain;
  if (drain > cps) {
    const eta = fmtDepletionEta(epDepletionSec(S.ep, cps, drain));
    html += `<div class="ft-note w-warn">当前理论净流出 ${fmt(-net)}/s，若持续按此速率 EP 约 ${eta} 耗尽。</div>`;
  } else {
    html += `<div class="ft-note w-good">当前理论净流入 +${fmt(net)}/s。</div>`;
  }
  html += `<div class="ft-note w-dim">注：显示值为连续速率；实际入账受 EP 上限、余额不足钳制，以及满仓涓流等周期机制影响，瞬时余额变化可能与之略有出入。</div>`;
  return html;
}
function escHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function bindFlowTipPop() {
  if (typeof document === 'undefined') return;
  // 移除旧 data-tip，避免与真实 DOM 气泡双弹
  for (const id of ['h-output-stat', 'h-drain-stat']) {
    const st = document.getElementById(id);
    if (st) st.removeAttribute('data-tip');
  }
  let pop = document.getElementById('flow-tip-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'flow-tip-pop';
    pop.className = 'wage-tip-pop flow-tip-pop';
    pop.setAttribute('role', 'tooltip');
    pop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pop);
  }
  const place = (zone) => {
    const r = zone.getBoundingClientRect();
    const p = document.getElementById('flow-tip-pop');
    if (!p) return;
    const tipW = Math.min(420, window.innerWidth * 0.9);
    const below = r.top < 300; // 顶栏在页面顶部 → 一律翻到下方
    p.classList.toggle('tip-below', below);
    p.style.setProperty('--tip-x', Math.max(8, Math.min(r.left, window.innerWidth - tipW - 8)) + 'px');
    p.style.setProperty('--tip-y', (below ? r.bottom + 8 : r.top - 8) + 'px');
  };
  const show = (kind, zone) => {
    const p = document.getElementById('flow-tip-pop');
    if (!p) return;
    _flowTipKind = kind;
    const html = flowTipHtml(kind);
    if (p._tipSig !== html) { p._tipSig = html; p.innerHTML = html; }
    place(zone);
    p.classList.add('show');
    p.setAttribute('aria-hidden', 'false');
  };
  const hide = () => {
    const p = document.getElementById('flow-tip-pop');
    if (p) { p.classList.remove('show'); p.setAttribute('aria-hidden', 'true'); }
    _flowTipKind = null;
  };
  for (const [id, kind] of [['h-output-stat', 'output'], ['h-drain-stat', 'drain']]) {
    const zone = document.getElementById(id);
    if (!zone || zone._flowTipBound) continue;
    zone._flowTipBound = true;
    zone.addEventListener('mouseenter', () => show(kind, zone));
    zone.addEventListener('focusin', () => show(kind, zone));
    zone.addEventListener('mouseleave', hide);
    zone.addEventListener('focusout', hide);
  }
  window.addEventListener('scroll', () => { if (_flowTipKind) hide(); }, true);
  window.addEventListener('resize', () => { if (_flowTipKind) hide(); });
}

function renderHero() {
  const bigEp = document.getElementById('big-ep');
  const clickPower = document.getElementById('click-power');
  const staffCount = document.getElementById('staff-count');
  const staffStatus = document.getElementById('staff-status');
  const hireBtn = document.getElementById('hire-btn');
  const focusLv = document.getElementById('focus-lv');
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
  // v4.2.7 反馈②：线程数字（staff-count）颜色 = 四态状态色——绿点移除后由数字承载状态信号。
  const staffCountEl = document.getElementById('staff-count');
  if (staffStatus) {
    // v1.3 C：四态徽章 + 迁移倒计时 + tooltip（替代 staffUnhappy 的「资源耗尽!」）
    // v4.0.3 反馈③：徽章只留「状态名」——原先把整句惩罚与倒计时塞在行内，把右侧 NEXT 预览挤成省略号；
    //   细则（倍率 / 倒计时）全部改由悬浮说明承载，行内宽度还给下一线程预览。
    const w = S.wageState || {};
    const W = BALANCE.thread.wages;
    const salary = staffSalaryPerSec();
    let txt = '满薪', color = 'var(--good)', detail = '';
    if (S.cultists.length === 0) { txt = '待招募'; color = 'var(--text-2)'; }
    else if (isLazy()) { // v2.7.1：懒惰态（EP 满上限惩罚）——消耗 > 产出
      txt = '懒惰'; color = 'var(--warn)';
      // v4.1.1 BUGFIX：脏值（rAF 基 <1e12）不参与时长计算——旧档曾显示「怠工已持续 1794875137s」。
      //   isLazy() 已有同口径防御，这里再兜一层：即使非 load 路径注入脏值也不显示天文数字。
      const since = (S.lazySince > 1e12) ? S.lazySince : Date.now();
      detail = `怠工已持续 ${Math.max(0, Math.floor((Date.now() - since) / 1000))}s`;
    }
    else if (w.state === 'debt') {
      txt = '欠薪'; color = 'var(--warn)';
      detail = (w.bufferSec || 0) > 0
        ? `恢复缓冲 ${Math.ceil(w.bufferSec)}s`
        : `休眠还剩 ${Math.ceil(Math.max(0, W.dormantAfterSec - (w.debtSec || 0)))}s`;
    } else if (w.state === 'dormant') {
      txt = '休眠'; color = '#ff9800';
      detail = `流失还剩 ${Math.ceil(Math.max(0, W.loseAfterSec - (w.dormantSec || 0)))}s`;
    } else if (w.state === 'losing') {
      txt = '流失预警'; color = 'var(--bad)';
      detail = `下次判定 ${Math.ceil(Math.max(0, 60 - (w.loseTimer || 0)))}s`;
    }
    staffStatus.textContent = txt;
    staffStatus.style.color = color;
    // v4.0.4 反馈②：满薪是常态，不写「满薪」二字——角标收成一颗同色小圆点（颜色即状态），
    //   文字保留在 DOM 里但 CSS 清零字号（无障碍读 aria-label，视觉只剩色点）。
    staffStatus.classList.toggle('is-dot', txt === '满薪');
    staffStatus.setAttribute('aria-label', detail ? `${txt}（${detail}）` : txt);
    // v4.2.7 反馈②：状态色落到线程数字上——绿点隐去后，数字即状态灯
    if (staffCountEl && staffCountEl.dataset.stateColor !== color) {
      staffCountEl.style.color = color;
      staffCountEl.dataset.stateColor = color;
    }
    // 刻意不写原生 title：整行已有自定义气泡，双弹窗是本项目明确避开的坑；
    //   细则还可在触屏上通过「点击整块 → 线程状态说明」弹窗查看。
    // v4.2.0 反馈⑥：问号标记已从 DOM 移除（用户要求），说明完全由整块悬浮/点击承载。
    // v3.12.0 反馈⑯：说明承载从窄 span 的 title 移到整块，整行悬浮 / 点击均可触发。
    // v4.0.8 反馈②：四态说明改彩色 DOM（#wage-tip-pop）——四态行按语义色着色
    //   （满薪绿/欠薪黄/休眠橙/流失红/懒惰黄），attr(data-tip) 只能纯文本做不到。
    renderWageTipPop({ txt, detail, W, salary });
  }
  // v2.8.10：招募行只展示「下一线程」增量（总产出/消耗移出 hero——顶栏已有，避免重复显示）
  // v4.0.4 反馈②：NEXT 只留产出/消耗（价签移到招募按钮第二行，同一数字不再出现两次）
  const staffPrevEl = document.getElementById('staff-preview');
  const hireCostEl = document.getElementById('hire-cost');
  const canHire = S.ep >= staffCost();
  if (staffPrevEl) {
    const n = S.cultists.length;
    const base = BALANCE.thread.baseOutput, jit = BALANCE.thread.baseOutputJitter;
    const perCap = BALANCE.thread.salaryPerThreadCap || Infinity;
    const curOut = staffOutputPerSec();
    const avgOut = n > 0 ? curOut / n : (base + jit / 2); // 实际单线程产出（mood/加成一致口径）
    const nextSalary = Math.min(0.5 * Math.pow(BALANCE.thread.salaryBase, n), perCap);
    // v4.0.4：拆成三个不可断行的小块（NEXT / 产出 / 消耗）——窄列只会在块之间换行，
    //   不会再出现「· 消耗」被切成半句的断法；同值不重写 DOM，避免每帧重排。
    const nextHtml = `<b class="nri">NEXT</b><span class="nri">产出 +${avgOut.toFixed(1)}/s</span><span class="nri">消耗 +${nextSalary.toFixed(2)}/s</span>`;
    if (staffPrevEl.dataset.sig !== nextHtml) { staffPrevEl.innerHTML = nextHtml; staffPrevEl.dataset.sig = nextHtml; }
    // v4.0.4：NEXT 讲的是「下一线程的产出/消耗」而不是支付能力，买不起不再把整段染黄
    //   （警示交给按钮：价格变黄 + 整体淡化），避免一行出现两处互相打架的颜色信号。
    staffPrevEl.style.color = 'var(--text-2)';
  }
  if (hireCostEl) hireCostEl.textContent = fmt(staffCost());
  if (hireBtn) {
    hireBtn.disabled = !canHire;
    hireBtn.style.opacity = canHire ? '1' : '0.5';
    hireBtn.classList.toggle('poor', !canHire);
    hireBtn.setAttribute('aria-label', `招募一条线程，需要 ${fmt(staffCost())} EP`);
  }
  // v4.0.6 反馈②：专注行与线程行同构——等级 + NEXT（下一级加成）+「强化 / 价格」按钮。
  if (focusLv) {
    focusLv.textContent = `Lv.${S.focusLevel}`;
    focusLv.style.color = S.focusLevel > 0 ? 'var(--good)' : 'var(--text-2)';
    focusLv.style.fontWeight = S.focusLevel > 0 ? 'bold' : 'normal';
  }
  const focusPrevEl = document.getElementById('focus-preview');
  const focusCostEl = document.getElementById('focus-cost');
  const focusBtn = document.getElementById('focus-buy');
  const focusPrice = focusCost();
  const focusNxtPct = Math.round(focusPerLevel(S.focusLevel + 1) * 100);
  if (focusPrevEl) {
    // v4.0.8 反馈③：NEXT 直接写「线程产出+N%」——专注加成实际作用于线程产出
    //   （economy.staffOutputParts 的 outMult），旧文案「下一级 +N%」不指明对象；
    //   与线程 NEXT 同款 nowrap 小块，同值不重写 DOM。悬浮说明已按反馈删除。
    const nextHtml = `<b class="nri">NEXT</b><span class="nri">线程产出 +${focusNxtPct}%</span>`;
    if (focusPrevEl.dataset.sig !== nextHtml) { focusPrevEl.innerHTML = nextHtml; focusPrevEl.dataset.sig = nextHtml; }
    focusPrevEl.style.color = 'var(--text-2)';
  }
  if (focusCostEl) focusCostEl.textContent = fmt(focusPrice);
  const canFocus = S.ep >= focusPrice;
  if (focusBtn) {
    focusBtn.disabled = !canFocus;
    focusBtn.style.opacity = canFocus ? '1' : '0.5';
    focusBtn.classList.toggle('poor', !canFocus);
    focusBtn.setAttribute('aria-label', `强化专注至 Lv.${S.focusLevel + 1}，需要 ${fmt(focusPrice)} EP`);
  }
  // v2.8.17 ⑦：专注不再提示点击、不靠悬浮 title——EP 不足仅暗色
  // v4.0.8 反馈③：悬浮说明（data-tip）整条删除——NEXT 已写明「线程产出+N%」就地自明，
  //   原气泡的「强化后：+N% · 需 X EP」与按钮第二行价格重复。
  const focusBarEl = document.getElementById('focus-bar');
  if (focusBarEl) {
    delete focusBarEl.dataset.tip; // v4.0.8：清掉 index.html 静态 data-tip，防止残留旧气泡
    focusBarEl.classList.toggle('cant', !canFocus);
  }
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
      // v4.3.13 反馈⑤：RP 未解锁（未购矩阵存储库）时不提「溢出转入 RP」——该机制在
      //   RP 解锁前根本不生效（v3.0.9 反馈②口径），提示出现会让玩家误以为 RP 已解锁。
      const rpOn = !!(S.resDiscovered && S.resDiscovered.rp);
      hint.textContent = rpOn
        ? `EP 已达上限 (${fmt(cap)})，溢出转入 RP 溢出池（5% 转化）` // v2.8.21 ⑥：EP 上限后不再产生腐化
        : `EP 已达上限 (${fmt(cap)})`;
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
    const r = p.reward;
    const rw = rewardText(r);
    const rwColor = r.kind === 'debuff' ? 'var(--bad)' : 'var(--good)';
    if (p.status === 'pending') {
      const left = Math.max(0, Math.ceil((3600000 - (now - p.pendingAt)) / 1000));
      // v2.1 R2：领取按钮不再逐节点挂监听，统一由容器级事件委托处理
      div.innerHTML = `<div class="pn"><span style="color:var(--good)">✓ ${p.name}</span><span class="mono" style="color:${rwColor}">${rw}</span></div>
        <div style="font-size:11px;color:var(--text-2);margin:2px 0">领取有效期 <span class="pend-left">${fmtTime(left)}</span></div>
        <button class="btn" data-claim="${i}" style="width:100%;font-size:11px;padding:3px;margin-top:2px">领取奖励</button>`;
    } else {
      const left = Math.max(0, Math.ceil((p.deadline - now) / 1000));
      const pct = p.goal > 0 ? Math.min(100, p.progress / p.goal * 100) : 0;
      // v3.12.13：进度文案用紧凑格式化（如 12.4M / 84.9B），不裸露超长原始数字、也不只写百分比
      const progTxt = `${p.desc}：${fmt(p.progress)} / ${fmt(p.goal)}（${pct.toFixed(0)}%）`;
      div.innerHTML = `<div class="pn"><span>${p.name}</span><span class="mono" style="color:${rwColor}">${rw}</span></div>
        <div class="prog-txt" style="font-size:11px;color:var(--text-2)">${progTxt}</div>
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
      if (txt) txt.textContent = `${p.desc}：${fmt(p.progress)} / ${fmt(p.goal)}（${pct.toFixed(0)}%）`;
      const leftEl = div.querySelector('.deadline-left');
      if (leftEl) leftEl.textContent = fmtTime(Math.max(0, Math.ceil((p.deadline - now) / 1000)));
    }
  });
}

// ========== Tab 切换 ==========
// v2.8.6 B2a：政策开放组哈希（变化时刷新面板与按钮）
// v4.0.9 反馈⑩：新组开放要有存在感——diff 出本轮新开放的政策组，toast + 日志提示
// （首个哈希为空集 → 首次出现不提示，避免开局/读档刷屏；跨轮重置由晋升清空 policies 自然带回「新组」语义）
let _policyOpenHash = '';
function policyTickRefresh() {
  const open = policyOpenGroups();
  // v4.2.0 反馈②：hash 纳入「是否有待选组」——选定政策的下一帧 hash 变化即刷新 tab，感叹号消失。
  const h = open.map(g => g.id).sort().join(',') + '|' + (hasPendingPolicy() ? 1 : 0);
  if (h !== _policyOpenHash) {
    const prevIds = _policyOpenHash ? _policyOpenHash.split(',').map(x => x.split('|')[0]) : [];
    const fresh = open.filter(g => !prevIds.includes(g.id));
    _policyOpenHash = h;
    dirty.policy = true;
    // v4.0.9 ⑩：仅提示「新开放」的组；_policyOpenHash 为空（开局首帧/读档首帧）不提示
    if (_policyOpenHash && fresh.length) {
      for (const g of fresh) {
        toast(`🏛 新政策组开放：${g.name}${g.hint ? `（${g.hint}）` : ''}`);
        log(`政策组「${g.name}」已开放${g.hint ? `——${g.hint}` : ''}，可到政策页选用`, 'good');
      }
    }
    refreshTabVisibility();
  }
}
function switchTab(id) {
  // v3.7.2 反馈①：程序化切换也走同一解锁判定源，防止绕过 nav 的 disabled 打开未解锁模块
  if (id === 'pets' && !petsModuleUnlocked(S)) { toast('🔒 异兽将在解锁 PT 后开放'); return; }
  // v3.12.9：星图同样堵住程序化切换（QA / 自动化），与 nav 锁定态同源
  if (id === 'expedition' && !starChartUnlocked(S)) return;
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('on'));
  document.querySelectorAll('.tabs button').forEach(el => el.classList.remove('on'));
  const pane = document.getElementById('tab-' + id);
  const btn = document.getElementById('btn-' + id);
  if (pane) pane.classList.add('on');
  if (btn) btn.classList.add('on');
  if (id === 'shop') dirty.shop = true;
  if (id === 'tech') {
    dirty.tech = true;
    // v4.3.14 反馈③：科技树「裂隙等级」分类已删除（迁入裂隙模块）——rift-tech-title fold 绑定下线
  }
  if (id === 'rp') {
    renderRpPanel(); renderResearchUpgrades(document.getElementById('research-upgrade-list')); renderRpFamily(document.getElementById('rp-upgrade-list')); renderFamilyUpgrades(document.getElementById('family-upgrade-list'));
    // v4.2.5 反馈①：纯类目 h3 统一折叠——「晋升 RP 加成」「族升级」接入 foldable-h3（与商店设施同范式）
    for (const tid of ['rp-upgrade-title', 'family-upgrade-title']) {
      const el = document.getElementById(tid);
      if (el && !el.dataset.foldBound) { el.dataset.foldBound = '1'; bindFoldToggle(el); }
    }
  } // v3.3.1 反馈①：灵感工坊开关并入研究点页 // v2.5 ④ + v2.8.4 ④：研究升级：研究点独立栏目 + v2.7.5 ④：族升级并入 + v2.8.2 ④：RP 加成组并入
  if (id === 'relics') {
    renderVehicles(document.getElementById('vehicle-shop'));
    renderDmShop(document.getElementById('dm-shop'));
    // v4.2.5 反馈①：「深渊商店」「深渊遗物」纯类目 h3 接入折叠（探采平台带数据行保持页级观感）；
    // 遗物标题同时是深渊商店的折叠边界（foldSiblings 到 h3 即停），防越界收起遗物面板
    for (const tid of ['dm-shop-title', 'relic-title']) {
      const t = document.getElementById(tid);
      if (t && !t.dataset.foldBound) { t.dataset.foldBound = '1'; bindFoldToggle(t); }
    }
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

// v3.3.3 反馈⑨：未开放大模块不再隐藏——以「??？」锁定态常驻展示（可发现性）
// v3.12.3 反馈③：锁定态不再挂任何解锁条件文案（title / toast 全部移除，只表达「不可用」）
const TAB_LABELS = { 'btn-expedition': '星图', 'btn-relics': '遗物', 'btn-religion': '宗教', 'btn-policy': '政策', 'btn-delve': '深潜', 'btn-rift-tab': '裂隙', 'btn-bazaar': '集市' };
function setTabLocked(btn, locked) {
  if (!btn) return;
  const base = TAB_LABELS[btn.id] || btn.textContent;
  if (locked) {
    if (btn.dataset.locked !== '1') {
      btn.dataset.locked = '1';
      btn.textContent = '???';
      // v3.12.3 反馈③：未解锁大模块只表达「不可用」——不再给出解锁条件提示
      // （「？？？」仍是未知，写着条件等于把探索感直接剧透掉）
      btn.removeAttribute('title');
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
  // v3.12.0 反馈⑪：RP 改本局制后，tab 门控必须改用 anchorDone（不含跨转生持久标记），
  // 否则转生后 resDiscovered.rp 仍为 true 会误放行一个本局根本没解锁的研究点 tab。
  if (rpBtn) rpBtn.style.display = anchorDone('rp', S) ? '' : 'none';
  // 星图：v3.12.9 起唯一判定源 = starChartUnlocked(S)（宠物/PT 锚点 → RP 锚点 → 深空探测或远征记录）。
  //   未解锁仍是「???」锁定态；不再在此处另抄一份条件，避免顶栏 / tab / 研究分组口径分叉。
  setTabLocked(document.getElementById('btn-expedition'), !starChartUnlocked(S));
  // v4.2.0 宗教：章节门禁（第 4 章）+ 真实解锁态。
  //   旧实现的 _religionHintSeen 持久标记会在首章就放行 tab（用户反馈①：宗教第一章就解锁），
  //   且 v4.2 load() 已一次性清除该标记；此处不再重写，避免脏标记复活。
  setTabLocked(document.getElementById('btn-religion'), !(religionUnlocked() || canUnlockReligion()));
  // v2.6.0 深潜：ES≥3 + DM 发现 + 宗教已信奉才开放
  setTabLocked(document.getElementById('btn-delve'), !(delveUnlocked() || canUnlockDelve()));
  // v2.6.1 裂隙：首次触发裂隙（或已封印/深入）后开放
  const riftBtn = document.getElementById('btn-rift-tab');
  setTabLocked(riftBtn, !riftShown(S)); // v4.2.X：统一裂隙门控真源
  // v3.3.5 反馈③：未解锁时悬浮提示给出「还有多久首次出现」，让裂隙触发不再是黑箱
  // v3.12.3 反馈③：统一不再提示解锁条件——锁定态只保留「不可用」
  if (riftBtn && riftBtn.dataset.locked === '1') riftBtn.removeAttribute('title');
  // v2.7.0：深渊遗物——裂隙触发 ∧ DM 已发现（与探采平台/深渊商店同门控链）
  setTabLocked(document.getElementById('btn-relics'), !relicsUnlocked());
  // v2.8.6 B2a：政策——有开放政策组才开放
  const policyBtn = document.getElementById('btn-policy');
  setTabLocked(policyBtn, !(policyOpenGroups().length > 0));
  // v4.2.0 反馈②：有「开放但尚未选定」的政策组 → tab 上挂感叹号（::after 伪元素，不碰 textContent）；
  //   全部选定后自动消失。锁定态不挂（??? 阶段无可选语义）。
  if (policyBtn) {
    const pending = !policyBtn.dataset.locked && hasPendingPolicy();
    if (pending) policyBtn.setAttribute('data-pending', '1'); else policyBtn.removeAttribute('data-pending');
  }
  // v3.12.0 反馈⑬：集市 / 轮回在首次晋升后常驻入口；未买断也可点进去看「职级点开启」卡。
  setTabLocked(document.getElementById('btn-bazaar'), !moduleVisible('bazaar'));
}

// ========== v3.2.2 反馈①：自动转化快捷开关（任务版上方） ==========
// RP 蒸馏（灵感工坊）/ DM 探采（载具）/ PT 孵化（异兽）——解锁后各出现一枚快捷开关，
// 与原位置开关读写同一状态字段（atriumOn / _probeEnabled / ptDistillOn），功能完全一致；
// EP 不足时各系统自动暂停消耗，回升后自动恢复（v3.2.2：去除「需手动恢复」的自动关闭）
// v4.3.2 反馈③：开关改整行下拉列表项（与存档/皮肤弹层同观感）——保留 data-qs 与「开/关」文案供事件委托与测试。
function qsOption(key, label, on, title) {
  return `<button class="btn qs-opt ${on ? 'on' : ''}" data-qs="${key}" title="${title}"><span>${label}</span><span class="qs-state">${on ? '开' : '关'}</span></button>`;
}
// v3.7.3 反馈②：未解锁的自动转化不再灰显占位——解锁后才出现（与 Wiki「各系统解锁后出现」一致）。
// 六枚开关各自用唯一解锁判定源（四枚转化器 + 两枚裂隙科技）；全部未解锁时整块面板隐藏，不留空壳。
function renderQuickSwitches() {
  const host = document.getElementById('quick-switches');
  const fab = document.getElementById('qs-fab');
  if (!host) return;
  const items = [];
  if (converterUnlocked('atrium')) {
    items.push(qsOption('atrium', '蒸馏', converterEnabled('atrium'), '灵感工坊自动蒸馏：EP → RP（与「研究点」页开关同步）'));
  }
  if (converterUnlocked('vehicles')) {
    items.push(qsOption('probe', '探采', converterEnabled('vehicles'), '载具探采：EP → DM（与「遗物」页探采开关同步）'));
  }
  if (converterUnlocked('hatch')) {
    items.push(qsOption('hatch', '孵化', converterEnabled('hatch'), '异兽孵化：EP → PT（与「异兽」页开关同步）'));
  }
  if (converterUnlocked('temple')) {
    items.push(qsOption('temple', '圣所', converterEnabled('temple'), '信仰圣所：EP → FP（与「宗教」页开关同步）'));
  }
  // v4.3.3 反馈⑧：无限深入开关 unified 到裂隙科技树（与自动封印/自动拥抱三项互斥同源），
  //   此处不再重复——避免两个入口的开关状态不同步。
  // v3.4.9 反馈②：自动净化（腐化每涨 5% 自动净化 5%，消耗 EP；需先买「无限深入」）
  if (riftUpgradeLevel('auto_purify') >= 1) {
    items.push(qsOption('purify', '净化', !!S.autoPurify, '自动净化：腐化每涨 5% 自动净化 5%（消耗 EP，EP 不足时暂停）'));
  }
  // v4.0.1 反馈④：整块收入「⚡ 转化」悬浮按钮（#qs-fab）；无任何转化器解锁时隐藏该按钮（含其弹层）。
  if (fab) fab.style.display = items.length ? '' : 'none';
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

// ---- v4.3.1 反馈⑥：浏览器保活（Web Wake Lock）----
// 用户诉求：电脑休眠/息屏导致浏览器挂起时游戏不产出。主循环 dt 钳到 10s、挂起时长只记账给裂隙，
// 全局产出确实丢失；Wake Lock 让屏幕保持唤醒，从源头避免休眠。仅阻止系统休眠，切后台仍由浏览器节流——
// 这是 Web 平台限制，不伪造产出（伪造会破坏经济平衡）。不支持 Wake Lock 时按钮降级为提示，不假装已生效。
let wakeLockSentinel = null;
const WAKE_LOCK_SUPPORTED = typeof navigator !== 'undefined' && !!navigator.wakeLock && typeof navigator.wakeLock.request === 'function';
async function requestWakeLock() {
  if (!WAKE_LOCK_SUPPORTED || wakeLockSentinel) return !!wakeLockSentinel;
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    // 浏览器可能在系统休眠/切标签时主动释放——监听 release 后按开关意图重请求
    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; if (S.keepAwake) tryRequestWakeLock(); }, { once: true });
    return true;
  } catch { wakeLockSentinel = null; return false; }
}
function tryRequestWakeLock() { return requestWakeLock(); } // 宿主可能未授予，静默重试不打扰
async function releaseWakeLock() {
  if (!wakeLockSentinel) return;
  const s = wakeLockSentinel; wakeLockSentinel = null;
  try { await s.release(); } catch { /* 已释放/页面隐藏：忽略 */ }
}
function syncKeepAwakeUI() {
  const btn = document.getElementById('keep-awake-btn');
  if (!btn) return;
  const on = !!S.keepAwake;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('on', on);
  btn.classList.toggle('unsupported', !WAKE_LOCK_SUPPORTED);
  btn.title = !WAKE_LOCK_SUPPORTED
    ? '当前浏览器不支持屏幕保活（Wake Lock），开关不可用'
    : on ? '已开启保活：屏幕保持唤醒，防止休眠中断挂机产出（点击关闭）'
         : '保持屏幕唤醒：防止休眠/息屏导致浏览器挂起、挂机产出中断（点击开启）';
}
function bindKeepAwake() {
  const btn = document.getElementById('keep-awake-btn');
  if (!btn) return;
  syncKeepAwakeUI();
  btn.addEventListener('click', async () => {
    if (!WAKE_LOCK_SUPPORTED) {
      toast('此浏览器不支持屏幕保活（Wake Lock）');
      return;
    }
    S.keepAwake = !S.keepAwake;
    save(S);
    if (S.keepAwake) {
      const ok = await requestWakeLock();
      if (!ok) { S.keepAwake = false; save(S); toast('保活请求被浏览器拒绝，未开启'); }
      else log('浏览器保活已开启：屏幕保持唤醒，挂机产出不再因休眠中断', 'good');
    } else {
      await releaseWakeLock();
      log('浏览器保活已关闭', 'bad');
    }
    syncKeepAwakeUI();
  });
  // 切回前台时浏览器可能已释放锁——仅在开关仍打开时重请求（开关意图为单一真源）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.keepAwake && !wakeLockSentinel) tryRequestWakeLock();
  });
  // 启动即按存档偏好请求（多数浏览器要求用户手势，首次可能被拒——下次点击/切前台会重试）
  if (S.keepAwake) tryRequestWakeLock();
}

// v2.5 ④：研究点（RP）独立栏目——v3.0.9 反馈②：解锁唯一入口 = 购入「矩阵存储库」；
// tab 未解锁时入口整体隐藏，原「EP 已溢出存储上限…」引导文案随 v3.0.9 反馈① 移除
function renderRpPanel() {
  const panel = document.getElementById('rp-panel');
  if (!panel) return;
  if (!anchorDone('rp', S)) { panel.innerHTML = ''; return; } // 兜底：入口已隐藏，正常不会走到这里
  panel.innerHTML = `<div class="panel" style="padding:14px">
    <!-- v4.3.1 反馈⑤：去「研究点（RP）」页内标题与 ⓘ 悬浮窗（tab 名已标识；说明文案由 wiki 承担） -->
    <!-- v4.0.9 反馈②：顶部说明压到 1-2 行 -->
    <!-- v4.3.5 反馈⑤：去「当前 RP 2.90K / 2.90K」行——顶栏 🔬RP 已有同口径当前值，
         面板内重复数字且与上限同显时「2.90K / 2.90K」观感冗余。
         自动蒸馏开关上移为面板主体；手动蒸馏按钮下移到开关之后（高频操作排前，低频排后）。 -->
    <!-- v4.3.7 反馈④：蒸馏按钮并入灵感工坊开关行尾（shop.js renderAtriumSwitch 内渲染），
         原独立行删除；工坊未购（n=0）时 host 显示一行占位提示，蒸馏按钮仍可用（保留高频操作入口） -->
    <div id="atrium-switch-host"></div>
  </div>`; // v2.8.7：解释入问号 ⓘ、蒸馏按钮减小 // v3.3.1：工坊开关移入本页 // v4.0.9 反馈②：三行说明压一行 // v4.3.5 反馈⑤：蒸馏下移 // v4.3.7 反馈④：蒸馏并入开关行
  renderAtriumSwitch(document.getElementById('atrium-switch-host'));
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
      : isStageUnlocked(stage, S) && (!anchorKey || anchorDone(anchorKey, S));
    if (!unlocked) {
      if (btn.dataset.locked === '1') continue; // v3.3.9 反馈④：已由 setTabLocked 接管（保留「???」）
      btn.classList.add('tab-locked');
      btn.textContent = '???';
      btn.removeAttribute('title'); // v3.12.3 反馈③：锁定态不提示解锁条件
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
  // v3.12.7 ③：故事线放大弹窗——标题栏 ⤢ 打开（点击不能顺带切换收起态），点遮罩 / × 关闭
  const slZoom = document.getElementById('storyline-zoom');
  const slModal = document.getElementById('sl-modal');
  const slModalBody = document.getElementById('sl-modal-body');
  if (slZoom && slModal && slModalBody) {
    slZoom.addEventListener('click', (ev) => {
      ev.stopPropagation();
      slModalBody.innerHTML = storylineBodyHtml();
      slModal.style.display = 'flex';
    });
    document.getElementById('sl-modal-x')?.addEventListener('click', () => { slModal.style.display = 'none'; });
    slModal.addEventListener('click', (ev) => { if (ev.target === slModal) slModal.style.display = 'none'; });
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
      const willCollapse = !achPanel.classList.contains('sl-collapsed');
      localStorage.setItem('abyss_ach_collapsed', willCollapse ? '1' : '0');
      applyAch();
      // v4.3.18 反馈④：收起即重置浏览游标——收起只切 class 不重渲染，快速收展（无周期重建
      //   介入）时已加载的累积组与滚动位置原样保留，展开后视口停在半空而非顶部。
      //   收起瞬间把 achPage 归 1、清 _keepScroll 并在隐藏态重建一次列表，保证「复原能复原
      //   到第一个在顶部」；收起中重建不可见，无闪烁代价。同时清掉 10s 回缩计时避免展开后
      //   被旧计时器突然拉回顶部。
      if (willCollapse) {
        achPage = 1;
        const list = document.getElementById('achievement-panel');
        if (list) {
          clearTimeout(list._achIdleTimer);
          list._keepScroll = null;
          renderAchievementPanel(list); // display:none 中重建，prevScroll 读 0 不触发恢复
        }
      }
    });
    applyAch();
  }
  document.getElementById('hero')?.addEventListener('click', doClick);
  document.getElementById('hire-btn')?.addEventListener('click', hireCultist);
  // v2.8.10：线程状态点击弹出四态说明（欠薪/休眠状态悬停提示对点击无响应，改为点击弹窗）
  // v3.12.0 反馈⑯：整块触发（招募按钮除外，避免误弹说明）
  // v4.2.3 反馈①：与悬浮气泡同口径精简——只留结论，不写内置机制（维修坞免疫 / 过渡缓冲 / 补偿细节）。
  document.getElementById('wage-help-zone')?.addEventListener('click', (e) => {
    if (e.target.closest('#hire-btn')) return;
    const W = BALANCE.thread.wages;
    askConfirm('线程薪资 · 四态说明', `当前：${(S.wageState || {}).state || 'ok'}\n` +
      `满薪：EP ≥ ${W.warnSec}s 薪资，无惩罚\n` +
      `欠薪：产出 ${fmtMultDelta(wageDebtMult(), { digits: 1 })}，持续 ${W.dormantAfterSec}s 转休眠\n` +
      `休眠：产出归零，只扣保底；久拖会流失线程\n` +
      `怠工（满仓 ${BALANCE.lazy.afterSec}s）：产出 ${fmtMultDelta(BALANCE.lazy.prodMult, { digits: 1 })}、消耗 ${fmtMultDelta(BALANCE.lazy.costMult, { digits: 1 })}\n` +
      `恢复：EP 回到 ${W.recoverSec}s 薪资即可`, () => {});
  });
  // v4.0.3 反馈③：悬浮说明按本行 rect 实时定位（position:fixed + 上下自动翻转 + 左右钳制）。
  //   原先 absolute 定位在祖先 overflow 容器里会被裁剪，首屏这一行的说明首段整段看不见。
  // v4.0.8 反馈②：定位与显隐整体移交 bindWageTipPop（彩色 DOM 气泡），旧 ::after 定位绑定删除。
  bindWageTipPop();
  bindFlowTipPop(); // v4.1.2：顶栏产出/消耗悬浮改真实 DOM 气泡（分组换行 + 净流说明）
  bindTideTipPop(); // v4.2.2 反馈④：潮汐加成明细改真实 DOM 悬浮气泡（顶栏只留状态+时间）
  bindAiTipPop(); // v4.3.2 反馈①：AI 台账悬浮改 fixed DOM 气泡（原 data-tip::after 在窄锚点下竖排）
  bindDistillTipPop(); // v4.3.15 反馈①：蒸馏按钮悬浮改 DOM 气泡（原生 title ~1s 延迟）
  document.getElementById('pauseBtn')?.addEventListener('click', togglePause);
  bindKeepAwake(); // v4.3.1 反馈⑥：浏览器保活开关（Wake Lock）
  // v4.0.6 反馈②：购买入口从「整条可点」收成显式按钮（与招募按钮同构），避免行内误触。
  document.getElementById('focus-buy')?.addEventListener('click', buyFocus);

  // v2.1 R2：任务面板容器级事件委托——领取按钮无论面板怎么刷新都能点到
  document.getElementById('projects')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-claim]');
    if (!btn) return;
    const idx = Number(btn.dataset.claim);
    const p = S.projects[idx];
    if (p && p.status === 'pending') {
      claimProject(p);
      dirty.projects = true; dirty.top = true;
      // v4.3.16 反馈②：删除「任务 EP 已达存储上限」toast——addEp 统一入口内部已处理溢出
      //   （满仓涓流/RP 溢出池），任务领取照常结算，弹窗只会造成「被扣了什么」的困惑。
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
    S.ep -= spend; spendRes('ep', spend);
    addRp(rp); // v3.0.8：走统一入口，受 RP 上限约束
    S.epDistilledTotal = (S.epDistilledTotal || 0) + spend;
    save(S); dirty.top = true; dirty.rp = true;
    if (toast) toast(`蒸馏完成：-${fmt(spend)} EP → +${rp} RP`);
  });
  document.getElementById('btn-pets')?.addEventListener('click', () => switchTab('pets'));
  document.getElementById('btn-prestige')?.addEventListener('click', () => switchTab('prestige'));
  document.getElementById('btn-achievement')?.addEventListener('click', () => switchTab('achievement'));
  document.getElementById('btn-offline')?.addEventListener('click', () => switchTab('offline'));
  // v3.12.3 反馈⑥：触手连击——深渊里 5 秒内连点触手 5 次，扣 1% EP 并发放成就（日记不展示逐次计数）
  let tentacleTaps = [];
  document.getElementById('tentacle-tap-zone')?.addEventListener('click', () => {
    const deco = document.getElementById('tentacle-deco');
    if (!deco) return;
    deco.classList.remove('tap');
    void deco.offsetWidth; // 重排以重启动画
    deco.classList.add('tap');
    clearTimeout(S._tentacleTapTimer);
    S._tentacleTapTimer = setTimeout(() => deco.classList.remove('tap'), 600);
    // 触手有了真正的「交互」：连击触发深渊回应（日志只在结算时写一条，不展示逐次计数）
    const now = Date.now();
    tentacleTaps = tentacleTaps.filter(t => now - t < 5000);
    tentacleTaps.push(now);
    if (tentacleTaps.length >= 5 && !(S.achievements && S.achievements.tentacle_combo)) {
      tentacleTaps = [];
      const lost = (S.ep || 0) * 0.01;
      S.ep = Math.max(0, (S.ep || 0) - lost);
      unlockAchievement(S, 'tentacle_combo');
      log(`深渊回应了你的执念：触手连击收走了 ${fmt(lost)} EP`, 'bad');
      if (toast) toast('🐙 深渊连击！-1% EP');
      dirty.achievements = true; dirty.top = true; dirty.hero = true;
    }
  });
  // v3.12.2：深渊凝视点击交互——点一下「凝视深渊」给出反馈（视觉在 abyssGaze.js）
  // v3.12.7 ②：连击口径与触手一致——5 秒内点 5 次，深渊收走 20% EP 并点亮成就。
  //   日志只写结算那一条（不记逐次计数），平时点击只给一个轻提示，避免刷屏。
  let gazeTaps = [];
  setGazeInteract(() => {
    const now = Date.now();
    gazeTaps = gazeTaps.filter(t => now - t < 5000);
    gazeTaps.push(now);
    const done = S.achievements && S.achievements.gaze_stare;
    if (gazeTaps.length < 5) {
      try { toast('👁 凝视深渊'); } catch (_) { /* 早期 toast 未就绪 */ }
      return;
    }
    gazeTaps = [];
    if (done) { // 已点亮过：只保留「它记得你」的回应，不再重复扣 EP
      log('深渊回望了你一眼——它记得你的凝视。', 'good');
      try { toast('👁 深渊记住了你'); } catch (_) { /* 同上 */ }
      return;
    }
    const lost = Math.max(0, (S.ep || 0) * 0.20);
    S.ep = Math.max(0, (S.ep || 0) - lost);
    unlockAchievement(S, 'gaze_stare');
    log(`深渊回望了你：一次凝视收走 ${fmt(lost)} EP`, 'bad');
    try { toast('👁 五目相对！-20% EP'); } catch (_) { /* 同上 */ }
    save(S);
    dirty.achievements = true; dirty.top = true; dirty.hero = true;
  });
  document.getElementById('btn-expedition')?.addEventListener('click', () => switchTab('expedition'));
  document.getElementById('btn-storyline')?.addEventListener('click', () => switchTab('storyline'));
  document.getElementById('btn-religion')?.addEventListener('click', () => switchTab('religion'));
  bindReligionPanel(document.getElementById('religion-panel')); // v2.5.7：宗教面板事件委托
  bindQuickSwitches(); // v3.2.2 反馈①：自动转化快捷开关事件委托
  bindOrchestrationPanel(); // v3.8.0：效能编排策略切换 / 潮汐排班事件委托
  // v3.3.3 反馈⑨：锁定态（???）tab 点击不切换
  // v3.12.3 反馈③：也不再 toast 解锁路径——未解锁模块点击表现为纯粹的「无反应」
  document.querySelector('.tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset && b.dataset.locked === '1') e.stopPropagation();
  }, true);
  bindPolicyPanel(document.getElementById('policy-panel'));
  _policyOpenHash = policyOpenGroups().map(g => g.id).sort().join(',') + '|' + (hasPendingPolicy() ? 1 : 0);
  renderPolicyPanel(document.getElementById('policy-panel'));
  setPolicyLogFn(log); setPolicyToastFn(toast); // v2.8.6：政策模块日志/toast 接入
  document.getElementById('btn-delve')?.addEventListener('click', () => switchTab('delve'));
  bindDelvePanel(document.getElementById('delve-panel')); // v2.6.0：深潜面板事件委托
  document.getElementById('btn-rift-tab')?.addEventListener('click', () => switchTab('rift-tab'));
  // v3.0.0：深渊集市
  document.getElementById('btn-bazaar')?.addEventListener('click', () => switchTab('bazaar'));
  bindBazaarPanel(document.getElementById('bazaar-panel'));
  // v3.12.0 反馈⑬：模块购买卡（轮回页 / 集市页共用同一 data 属性与同一购买入口）
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest('[data-module-unlock]');
    if (!el) return;
    const r = buyModuleUnlock(el.dataset.moduleUnlock);
    if (r.ok) {
      toast(`已开启「${r.name}」：消耗 ${r.cost} PP`);
      dirty.bazaar = true; dirty.top = true; dirty.prestige = true;
      refreshTabVisibility();
    } else if (r.reason !== '已开启' && toast) toast(r.reason);
  });
  // v2.9.0：Wiki 重构为侧栏分章 + 内容区；v3.1.1 反馈⑥：全部章节无条件展示（不管是否解锁——
  // wiki 同时是研发手册，未解锁章节直接可见解锁条件，不再灰显锁定）
  const wikiBtn = document.getElementById('btn-wiki');
  const wikiModal = document.getElementById('wiki-modal');
  let wikiActiveId = 'intro';
  let wikiQuery = ''; // v3.2.3 反馈④：wiki 关键词检索（会话级，打开弹框时清空）
  function renderWikiNav() {
    const nav = document.getElementById('wiki-nav');
    if (!nav) return;
    // v3.12.6 ⑨：导航按「玩法索引」分卷——先卷名（一句说明），再卷内章节
    const byId = new Map(WIKI_SECTIONS.map(x => [x.id, x]));
    nav.innerHTML = WIKI_GROUPS.map(g => {
      const btns = g.ids.map(id => byId.get(id)).filter(Boolean).map(x =>
        `<button class="wiki-nav-btn${x.id === wikiActiveId ? ' on' : ''}" data-wiki="${x.id}">${x.name}</button>`).join('');
      return `<div class="wiki-nav-group"><div class="wiki-nav-head" title="${g.hint}">${g.name}</div>${btns}</div>`;
    }).join('');
    nav.querySelectorAll('[data-wiki]').forEach(b => b.addEventListener('click', () => {
      wikiActiveId = b.dataset.wiki;
      renderWikiNav();
      renderWikiBody();
    }));
  }
  // v3.2.3 反馈④：跨章节搜索——命中行摘录 + 点击跳转对应章节
  // v4.2.0 反馈⑤：搜索归一化——用户输「AI助手」应命中文案里的「AI 助手」（中英文间空格）。
  //   去掉空白/常见分隔符后再匹配，保留原文行用于展示，不改变 wiki 数据与章节指针。
  const wikiNorm = (s) => String(s || '').toLowerCase().replace(/[\s·・,，、_\-—]/g, '');
  function renderWikiSearch(q) {
    const body = document.getElementById('wiki-body');
    if (!body) return;
    const needle = wikiNorm(q.trim());
    let found = 0;
    let html = `<h4 class="wiki-title">搜索「${escWiki(q.trim())}」</h4>`;
    for (const s of WIKI_SECTIONS) {
      const probe = document.createElement('div');
      probe.innerHTML = s.body();
      const lines = (probe.textContent || '').split('\n').map(l => l.trim()).filter(Boolean);
      const hits = lines.filter(l => wikiNorm(l).includes(needle)).slice(0, 4);
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
      prestige:'完成首次晋升', policy:'开放任一政策组（晋升/深潜/信仰）',
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
      let ok = false; try { ok = !!c.cond(S); } catch { /* 章节 cond 容错：旧档缺字段不应中断百科渲染 */ }
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
    // v4.3.14 反馈③：裂隙等级行（自科技树迁入）——升级按钮
    const lvBtn = e.target.closest('[data-rift-level-buy]');
    if (lvBtn) {
      const r = buyRiftLevelTech();
      if (!r.ok) toast(r.reason);
      renderRiftPanel(document.getElementById('rift-tab-panel'));
      return;
    }
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
  // v3.10.4 ④：存档管理简化为「💾 存档」下拉直接展示所有存档列表（参考 KG）。
  //   每条含 读取/覆盖/导出/删除；列表级含 保存新档/导入/清档；导入导出作为每条的功能。
  importMode = 'current'; // 复位为默认（'current' = 旧「导入覆盖当前」；'snapshot' = 导入为新快照入列）
  // v4.2.0 反馈④：「+ 新建」生成全新初始存档入槽（不覆盖当前进度）；满槽时按钮已由
  //   renderSaveList 灰显禁用，不再走「覆盖最早」二次确认弹窗。旧数据无任何路径被静默覆盖。
  document.getElementById('save-new')?.addEventListener('click', () => {
    if (listSnapshots().length >= SNAP_MAX) return; // 兜底：满槽直接吞掉点击（按钮已 disabled）
    const r = createFreshSnapshot();
    if (r.ok) {
      renderSaveList(true);
          toast('新档已创建（读取即可开始新档）');
    } else toast(r.reason || '创建失败：本地存储不可用');
  });
  document.getElementById('clear-game')?.addEventListener('click', () => {
    askConfirm('清档（删除当前游戏）', '将删除当前本地游戏，回到全新开局。\n存档快照保留，可逐个删除；此操作不可撤销，确定继续？', () => { doReset(); });
  });
  document.getElementById('import-btn2')?.addEventListener('click', () => {
    importMode = 'snapshot';
    document.getElementById('import-file')?.click();
  });
  const saveMenuEl = document.querySelector('.save-menu');
  if (saveMenuEl) {
    // v3.12.1 反馈①：鼠标路径的开合完全交给 CSS :hover（移开即收、点击不再常驻）。
    //   键盘路径另用 .kbd-open 类维持展开：若只靠 :focus-visible 选择器，焦点从按钮
    //   移向菜单项的瞬间 pop 会变 display:none，菜单项被踢出 Tab 序列，键盘用户进不了下拉。
    //   focusout 延后一帧再判定，Tab 进入菜单内部时保持展开。
    const saveBtn = document.getElementById('save-menu-btn');
    const setSaveOpen = (open) => saveBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    saveMenuEl.addEventListener('mouseenter', () => { renderSaveList(); setSaveOpen(true); });
    // 鼠标点击按钮会留下 activeElement，不能据此判定「仍展开」；只有真正的键盘路径
    // （.kbd-open）才在移开鼠标后保持展开，否则 aria-expanded 会与视觉不一致。
    saveMenuEl.addEventListener('mouseleave', () => { if (!saveMenuEl.classList.contains('kbd-open')) setSaveOpen(false); });
    saveMenuEl.addEventListener('focusin', (e) => {
      renderSaveList(); setSaveOpen(true);
      if (e.target.matches(':focus-visible')) saveMenuEl.classList.add('kbd-open');
    });
    saveMenuEl.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (!saveMenuEl.contains(document.activeElement)) {
          saveMenuEl.classList.remove('kbd-open');
          setSaveOpen(false);
        }
      });
    });
  }
  document.getElementById('save-list')?.addEventListener('click', onSaveListClick);
  renderSaveList(); // 首屏预渲染（下拉展开时再刷新一次）

  // v3.12.12 反馈⑥：皮肤菜单（暂停左侧）——悬停展开（CSS :hover）+ 键盘 .kbd-open，
  //   点击切换 documentElement 主题类并持久化 localStorage（独立键，不入存档模式结构）。
  //   light 主题同步挂 .light 类，让 abyssGaze.js 既有的浅色检测真正生效。
  // v3.12.13 ⑦：皮肤改由「永恒矩阵」购买——默认仅 abyss 拥有，light/ember 需 S.eternal[skin_*] > 0。
  const skinMenuEl = document.getElementById('skin-menu');
  if (skinMenuEl) {
    // v4.0.0 反馈②：新增薄荷绿潮 / 秋日鎏金两款（均为浅色系，与 light 一起挂 .light 供凝视检测）。
    const SKINS = ['abyss', 'light', 'ember', 'mint', 'autumn'];
    const LIGHT_SKINS = ['light', 'mint', 'autumn'];
    const SKIN_KEY = 'abyss_skin';
    // 拥有判定：abyss 默认拥有；其余皮肤由永恒矩阵一次性解锁（S.eternal[skin_<name>] > 0）
    const skinOwned = (name) => name === 'abyss' || ((S.eternal && S.eternal['skin_' + name]) || 0) > 0;
    const refreshSkinOptions = (selected) => {
      document.querySelectorAll('#skin-pop .skin-opt').forEach(b => {
        const owned = skinOwned(b.dataset.skin);
        if (b.dataset.origTitle === undefined) b.dataset.origTitle = b.getAttribute('title') || '';
        b.classList.toggle('on', b.dataset.skin === selected);
        b.classList.toggle('locked', !owned);
        b.title = owned ? (b.dataset.origTitle || '') : '需在「永恒矩阵」用研究点（ES）购买后解锁';
      });
    };
    const applySkin = (name) => {
      if (!SKINS.includes(name) || !skinOwned(name)) name = 'abyss';
      const root = document.documentElement;
      SKINS.forEach(s => root.classList.toggle(`theme-${s}`, s === name));
      root.classList.toggle('light', LIGHT_SKINS.includes(name));
      try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* 隐私模式等忽略 */ }
      refreshSkinOptions(name);
    };
    const skinBtn = document.getElementById('skin-menu-btn');
    const setSkinOpen = (open) => skinBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    // 打开时刷新（购买皮肤后 S.eternal 已变化，需重算锁定态）
    const refreshOnOpen = () => {
      const cur = (() => { try { return localStorage.getItem(SKIN_KEY) || 'abyss'; } catch { return 'abyss'; } })();
      refreshSkinOptions(skinOwned(cur) ? cur : 'abyss');
    };
    skinMenuEl.addEventListener('mouseenter', () => { setSkinOpen(true); refreshOnOpen(); });
    skinMenuEl.addEventListener('mouseleave', () => { if (!skinMenuEl.classList.contains('kbd-open')) setSkinOpen(false); });
    skinMenuEl.addEventListener('focusin', (e) => {
      setSkinOpen(true);
      if (e.target.matches(':focus-visible')) skinMenuEl.classList.add('kbd-open');
      refreshOnOpen();
    });
    skinMenuEl.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (!skinMenuEl.contains(document.activeElement)) {
          skinMenuEl.classList.remove('kbd-open');
          setSkinOpen(false);
        }
      });
    });
    document.getElementById('skin-pop')?.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-skin]');
      if (opt) {
        if (!skinOwned(opt.dataset.skin)) { if (typeof toast === 'function') toast('该皮肤需在「永恒矩阵」购买后解锁'); return; }
        applySkin(opt.dataset.skin);
      }
    });
    let savedSkin = 'abyss';
    try { savedSkin = localStorage.getItem(SKIN_KEY) || 'abyss'; } catch (e) { /* 忽略 */ }
    if (!skinOwned(savedSkin)) savedSkin = 'abyss'; // 旧档/越权：未拥有回落默认
    applySkin(savedSkin); // 启动即恢复上次选择的主题
  }

  // v4.0.1 反馈④：自动转化「⚡ 转化」悬浮按钮（皮肤左侧）——复用存档/皮肤菜单的悬停 + 键盘 .kbd-open 展开范式，
  //   避免 hover 断档、保证键盘可达。点击开关在 #quick-switches 上委托（bindQuickSwitches），此处只管弹层显隐。
  const qsFabEl = document.getElementById('qs-fab');
  if (qsFabEl) {
    const qsBtn = document.getElementById('qs-fab-btn');
    const setQsOpen = (open) => qsBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    qsFabEl.addEventListener('mouseenter', () => setQsOpen(true));
    qsFabEl.addEventListener('mouseleave', () => { if (!qsFabEl.classList.contains('kbd-open')) setQsOpen(false); });
    qsFabEl.addEventListener('focusin', (e) => {
      setQsOpen(true);
      if (e.target.matches(':focus-visible')) qsFabEl.classList.add('kbd-open');
    });
    qsFabEl.addEventListener('focusout', () => {
      requestAnimationFrame(() => {
        if (!qsFabEl.contains(document.activeElement)) {
          qsFabEl.classList.remove('kbd-open');
          setQsOpen(false);
        }
      });
    });
  }

  // v4.0.2 反馈②：系统日志面板高度可拖拽调整（持久化到 localStorage）
  // v4.0.7 反馈②：旧实现用「手柄当前 rect.bottom - 指针 y」当新高度——每次移动都会重算 rect.bottom，
  //   而 rect.bottom 本身随高度变化 → 反馈自激、往上拖不动；叠加 CSS 的 max-height:190px 把上限钉死。
  //   现在改为「按下时记起始高度 + 指针位移」的纯增量模型，上限读 --log-max-h（随断点变化），
  //   并补上双击复位 / 方向键微调 / 窗口缩小后重新钳制。
  // v4.1.0 反馈①：手柄在面板底部，方向反转为「往下拖 = 拉大」（对齐底部手柄惯例）。
  const bindLogResize = () => {
    const panel = document.getElementById('log-panel');
    const handle = document.getElementById('log-resize');
    if (!panel || !handle) return;
    const KEY = 'abyss_log_h';
    const DEFAULT_H = 240;
    const MIN_H = 120;
    // 上限：CSS 变量（桌面 520 / 单屏 420 / 窄屏更矮）× 视口比例，两者取小——窗口再小也不会把侧栏撑爆
    const maxH = () => {
      const cssMax = parseFloat(getComputedStyle(panel).getPropertyValue('--log-max-h'));
      const cap = Number.isFinite(cssMax) && cssMax > 0 ? cssMax : 520;
      return Math.max(MIN_H, Math.min(cap, Math.round(window.innerHeight * 0.62)));
    };
    const clamp = (h) => Math.max(MIN_H, Math.min(maxH(), Math.round(Number(h) || 0)));
    const apply = (h, persist) => {
      const v = clamp(h);
      panel.style.height = v + 'px';
      if (persist) { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } }
    };
    const curH = () => panel.getBoundingClientRect().height;
    const saved = (() => { try { return Number(localStorage.getItem(KEY)); } catch { return NaN; } })();
    apply(Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_H, false);

    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', '拖拽调整日志高度（往下拖拉大，双击恢复默认，方向键微调）');
    handle.removeAttribute('aria-hidden');

    let drag = null;
    let lastTapAt = 0;
    handle.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 双击复位：自己数时间戳而不是监听 dblclick —— pointerdown 上的 preventDefault（防止拖拽时选中文字）
      // 会抑制浏览器合成 click/dblclick，靠原生 dblclick 在真机上永远收不到。
      const now = Date.now();
      if (now - lastTapAt < 320) { lastTapAt = 0; apply(DEFAULT_H, true); return; }
      lastTapAt = now;
      e.preventDefault();
      drag = { y: e.clientY, h: curH(), id: e.pointerId };
      try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      document.body.classList.add('log-resizing');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      apply(drag.h + (e.clientY - drag.y), false); // v4.1.0：往下拖 = 变高（底部手柄惯例）
    });
    const endDrag = () => {
      if (!drag) return;
      try { handle.releasePointerCapture(drag.id); } catch { /* ignore */ }
      drag = null;
      document.body.classList.remove('log-resizing');
      apply(curH(), true); // 落盘的是钳制后的真实高度
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 12;
      if (e.key === 'ArrowDown') { e.preventDefault(); apply(curH() + step, true); } // v4.1.0：↓=变高，与拖拽方向一致
      else if (e.key === 'ArrowUp') { e.preventDefault(); apply(curH() - step, true); }
      else if (e.key === 'Home') { e.preventDefault(); apply(DEFAULT_H, true); }
    });
    // 窗口变小后，旧的记忆高度可能超过新上限——重新钳制，避免侧栏被一个巨块顶到底
    window.addEventListener('resize', () => apply(curH(), false));
  };
  bindLogResize();

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
    S.ep -= cost; spendRes('ep', cost);
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

// v4.2.3 反馈③：快照改名——点名称原地变输入框（Enter/失焦提交，Esc 取消）。
//   不用原生 prompt（阻塞主线程、样式脱离主题）；改名只动 name 不动 time，
//   覆盖最早仍按 time 排序，语义不变。
function beginSnapRename(spanEl, id) {
  if (!spanEl || spanEl._renaming) return;
  spanEl._renaming = true;
  const cur = spanEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'snap-rename-input';
  input.maxLength = SNAP_NAME_MAX;
  input.value = cur;
  input.setAttribute('aria-label', '快照名称');
  spanEl.textContent = '';
  spanEl.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (saveIt) => {
    if (done) return;
    done = true;
    spanEl._renaming = false;
    if (!saveIt) { input.remove(); spanEl.textContent = cur; return; }
    const r = renameSnapshot(id, input.value);
    if (r.ok) {
      renderSaveList(true);
      toast(`快照已改名为「${r.name}」`);
    } else {
      input.remove();
      spanEl.textContent = cur;
      toast(r.reason || '改名失败');
    }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // 不让输入内容触发全局快捷键
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

// 保存快照：槽未满直接存；已满走二级确认覆盖最早快照
function onSnapSave() {
  const r = saveSnapshot();
  if (r.ok) {
    renderSaveList(true);
    toast('快照已保存（' + listSnapshots().length + '/' + SNAP_MAX + '）');
    return;
  }
  if (r.needCover) {
    askConfirm('快照已满，覆盖最早的快照', `已保存 ${SNAP_MAX} 个快照。新快照将覆盖最早的「${r.needCover.name}（${fmtStamp(r.needCover.time)}）」，确定保存？`, () => {
      const res = coverOldest(r.snap);
      if (res.ok) { renderSaveList(true); toast(res.covered ? '已覆盖旧快照，新快照已保存' : '快照已保存'); }
      else toast('保存失败：本地存储不可用');
    });
  } else {
    toast(r.reason || '保存失败');
  }
}

// v3.10.4 ④：下拉存档列表渲染（与模态列表同源数据，但每条多 覆盖/导出 操作）
// v4.0.3 反馈②：改为「按数据签名增量渲染」。此前 .save-menu 的 focusin 每次点击都整体重建列表，
//   mousedown 与 mouseup 之间按钮节点被销毁 → 浏览器不派发 click，读取/覆盖/导出/删除全部「点了没反应」。
let saveListSig = '';
function renderSaveList(force = false) {
  const box = document.getElementById('save-list');
  if (!box) return;
  const snaps = listSnapshots();
  const sig = snaps.map(s => `${s.id}|${s.time}|${s.name}|${(s.summary && s.summary.runEarned) || 0}`).join(',') || 'empty'; // v4.2.3：name 入签名；v4.2.7：ep→runEarned（本局总量入签名）
  // 同一份数据且列表已在位：跳过重建，保证按下与松开落在同一个按钮节点上（click 才会派发）
  if (!force && sig === saveListSig && box.childElementCount > 0) return;
  saveListSig = sig;
  const cnt = document.getElementById('save-count');
  if (cnt) cnt.textContent = `${snaps.length}/${SNAP_MAX}`;
  // v4.2.0 反馈④：满槽后「新建」按钮直接灰显——不再走「覆盖最早」二次确认弹窗（用户要的交互）。
  //   玩家想开新档先手动删一条旧档，避免任何路径静默覆盖玩家快照。
  const newBtn = document.getElementById('save-new');
  if (newBtn) {
    newBtn.disabled = snaps.length >= SNAP_MAX;
    newBtn.title = snaps.length >= SNAP_MAX ? `存档已满（${SNAP_MAX}/${SNAP_MAX}）——请先删除一条旧档再新建` : '新建一份全新初始存档（不影响当前进度，读取即可开始新档）';
  }
  box.innerHTML = '';
  if (!snaps.length) {
    box.innerHTML = `<div class="save-empty">暂无存档。点击「+ 新建」生成（最多 ${SNAP_MAX} 个）。</div>`;
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
        <div class="name"><span>${sn.slot}. <span class="snap-name" title="点击重命名" tabindex="0" role="button">${escHtml(sn.name)}</span></span><span class="count mono">${sn.timeText}</span></div>
        <div class="snap-sub">本局 ${fmt(sm.runEarned || 0)} EP · 职级 ${sm.prestige || 0} · 第 ${sm.chapter || 1} 章 · ${lineName}</div>
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
      // v4.3.8 BUGFIX：置位清档守卫——写入空档后到 reload 完成前，beforeunload / 5s 自动保存
      // 不得把内存中的旧 S 回写覆盖（与 doReset 同源；v438 实测未置位时空档读取被旧档覆盖）。
      resetGuard = true;
      localStorage.setItem(SAVE_KEY, data);
      toast('已恢复快照，页面即将刷新');
      setTimeout(() => location.reload(), 600);
    });
  } else if (e.target.classList.contains('snap-overwrite')) {
    askConfirm('用当前进度覆盖该存档', `将用当前进度覆盖「${label}」。\n确定继续？`, () => {
      const cur = localStorage.getItem(SAVE_KEY);
      if (!cur) { toast('当前无存档'); return; }
      const r = overwriteSnapshot(id, cur);
      if (r.ok) { renderSaveList(true); toast('已用当前进度覆盖该存档'); }
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
      renderSaveList(true);
      toast('快照已删除');
    });
  } else if (e.target.classList.contains('snap-name')) {
    beginSnapRename(e.target, id); // v4.2.3 反馈③：点名称改名
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
          if (r.ok) { renderSaveList(true); toast(r.covered ? '已覆盖旧快照，新快照已保存' : '已保存为新快照'); }
          else toast('保存失败：本地存储不可用');
        });
        return;
      }
      // v2.8.5 A4：导入 = 覆盖当前本地游戏，二次确认
      const sum = `EP ${fmt(data.ep || 0)} · 职级 ${data.prestige || 0} · 第 ${data.chapter || 1} 章`;
      askConfirm('导入存档并覆盖当前', `导入外部存档（${sum}）将覆盖当前本地游戏进度。\n当前进度会自动备份（abyss_idle_v2_bak）。确定继续？`, () => {
        const cur = localStorage.getItem(SAVE_KEY);
        if (cur) localStorage.setItem(SAVE_KEY + '_bak', cur);
        // v4.3.8 BUGFIX：与快照读取同因——导入覆盖当前后 reload 前必须挡住旧 S 回写。
        resetGuard = true;
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
  S.ep -= cost; spendRes('ep', cost);
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
  S.ep -= c; spendRes('ep', c); S.focusLevel++;
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
  const rpPreview = (S.tech && S.tech.offline1 && hours >= 1) ? Math.floor(hours * 2 * (S.runTalent === 'fortunate' ? 2 : 1)) : 0; // v4.2.4 反馈②：与结算同口径（随「远程协作」解锁）
  const offLocked = !(S.tech && S.tech.offline1);
  info.innerHTML = `已暂停（模拟离线）：<b class="mono">${fmtTime(dt)}</b><br>
    预计离线收入：${offLocked ? `<span style="color:var(--text-3)">未解锁（研究「远程协作」后生效）</span>` : `<b style="color:var(--green)">+${fmt(epPreview)} EP</b>${rpPreview > 0 ? ` · <b style="color:var(--cyan)">+${rpPreview} RP</b>` : ''}`}<br>
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
    // v4.2.4 反馈②：与 applyOffline 同口径——离线 RP 小时奖随「远程协作」一并解锁
    if (S.tech && S.tech.offline1 && hours >= 1) {
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
      // v4.2.8：里程碑数变化影响 v21 锁卡「需里程碑 N」门控与 RP 加成卡灰态——
      //   不置脏则锁卡 classList 停留在旧态（真实玩家与自动玩家都点不动新解锁的建筑锁卡）
      dirty.shop = true; dirty.rp = true;
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
  if (fresh.length) { dirty.achievements = true; dirty.storyline = true; achPage = 1; /* v4.3.6b：新成就倒序插入队首，累积列表顺序变化 → 重置为首组 */ }
}
// v2.8.1：成就页面——只显示已解锁成就（达成即点亮，未达成不展示）
const ACH_PAGE_SIZE = 5; // v3.3.3 反馈⑩：成就分页（与班组同范式，会话级页码）；v4.0.9 反馈⑪：一页 10 → 5 条
let achPage = 1; // v4.3.6b：语义 = 已展示 chunk 数（累积加载，非翻页替换，1 起步）——已展示 = achPage * ACH_PAGE_SIZE 条
function renderAchievementPanel(container) {
  if (!container) return;
  const defs = ACHIEVEMENTS;
  // v4.3.2 反馈②：成就按「解锁时间倒序」（最新解锁在前）。
  //   时间戳来自 achievementRegistry 解锁时写入的 S.achievementTimes；旧档无时间戳 → 回落注册表索引倒序
  //   （注册表大体按早期→后期排，后期成就通常更晚解锁，退化口径仍近似倒序）。
  const times = S.achievementTimes || {};
  const got = defs.filter(d => S.achievements[d.id]).slice().sort((a, b) => {
    const ta = times[a.id], tb = times[b.id];
    if (ta != null && tb != null) return tb - ta; // 都有时间戳：新的在前
    if (ta != null) return -1; // 有时间戳的优先于无时间戳的旧档
    if (tb != null) return 1;
    return defs.indexOf(b) - defs.indexOf(a); // 都无时间戳：注册表倒序
  });
  const n = got.length;
  // v3.12.3 反馈⑦：成就面板只保留「已解锁 N/总数」计数（由静态 #achievement-h3 常驻承载，
  // 它同时是收起开关，不在这里再产出嵌套面板 / 标题 / 说明段落）
  let html = '';
  const achH3 = document.getElementById('achievement-h3');
  if (achH3) {
    const collapsed = document.getElementById('tab-achievement')?.classList.contains('sl-collapsed');
    achH3.innerHTML = `已解锁 <b style="color:var(--purple)">${n}/${defs.length}</b> <span class="sl-ind" style="color:var(--text-3)">${collapsed ? '▸' : '▾'}</span>`;
  }
  // v4.3.6b：累积加载滚动位置保持（读后即清，常规重建不钉住视口）
  // v4.3.7 反馈⑥：fallback 实时捕获——dirty-periodic 每 2s 置脏全量重建（innerHTML 替换重置
  // scrollTop），而 _keepScroll 只在滚动触底加载下一组时写入，读后即清 → 第二次周期重建时无恢复值，
  // 视口跳回顶部，用户感知「翻页后约 10s 未操作就复原」。现在常规重建也捕获实时 scrollTop，
  // 周期刷新不再打断浏览位置；只有玩家主动收起/切页后才从顶部开始（符合直觉）。
  const prevScroll = container._keepScroll != null ? container._keepScroll : container.scrollTop;
  container._keepScroll = null;
  if (n === 0) {
    html += `<div style="font-size:13px;color:var(--text-3);padding:18px 0;text-align:center">尚未解锁任何成就——一切才刚刚开始。</div>`;
  } else {
    // v4.3.6b 反馈③：累积式加载——滚动触底「追加」下一组（6→12→18），旧卡保留可回看，
    //   不再是「翻页替换」（旧范式滚到底整面重建为下一页，列表跳顶且无法回看上一页）。
    const pageCount = Math.max(1, Math.ceil(n / ACH_PAGE_SIZE));
    if (!Number.isFinite(achPage) || achPage < 1) achPage = 1; // v4.3.6b：chunk 语义 1 起步（1 = 已展示第一组 5 条）
    if (achPage > pageCount) achPage = pageCount;
    const start = 0, end = Math.min(achPage * ACH_PAGE_SIZE, n); // 累积：始终从第 1 条渲染到已展示末尾
    for (const a of got.slice(start, end)) {
      html += `<div class="ach-card" style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin:6px 0;display:flex;align-items:center;gap:12px">
        <span style="font-size:22px">${a.icon}</span>
        <div style="flex:1">
          <div style="font-weight:600;color:var(--good)">${a.name}</div>
          <div style="font-size:12px;color:var(--text-2);margin-top:1px">${a.desc}</div>
        </div>
      </div>`;
    }
    if (end < n) {
      // v4.3.12 反馈①：进度文案「已展示 N / M 项 · 下滑加载更多」删除——玩家实测这种常驻行
      //   在容器不可滚动时（首组未撑出滚动高度）是死文案，且无法通过操作消除。
      //   新口径：仅当列表真实可滚（能触底加载）才渲染简短提示；不可滚时不渲染 pager 行。
      //   可滚判定用「待渲染内容是否超过容器高度」的近似：卡片数 × 卡高（~58px）+ 头部，
      //   渲染后由 _achFixPager 二次校正（真实 scrollHeight 口径，见 innerHTML 之后）。
      const approxH = end * 58 + 16;
      if (approxH > container.clientHeight) html += `<div class="crew-pager ach-pager-maybe" style="margin-top:8px"><span>下滑加载更多</span></div>`;
    } else if (pageCount > 1) {
      html += `<div class="crew-pager" style="margin-top:8px"><span>已全部展示 ${n} 项</span></div>`;
    }
  }
  container.innerHTML = html;
  container._achTotal = n; // v4.3.3 反馈②：滚动翻页判定总条数（渲染态，不入存档）
  // v4.3.12 反馈①：pager 可滚判定二次校正——渲染后按真实 scrollHeight 口径，
  //   「不可滚但 pager 在」则移除（rAF 前同步执行，无闪烁）。
  const maybe = container.querySelector('.ach-pager-maybe');
  if (maybe && container.scrollHeight <= container.clientHeight + 4) maybe.remove();
  else if (maybe) maybe.classList.remove('ach-pager-maybe');
  // v4.3.6b：重建后恢复滚动位置（累积追加时视口不跳）
  // v4.3.7 反馈⑥：周期重建也恢复（prevScroll 现回落到实时 scrollTop，见上方注释）；
  //   scrollTop=0 时不空耗 rAF（首次渲染本就从顶部开始）
  if (prevScroll != null && prevScroll > 0) {
    requestAnimationFrame(() => { container.scrollTop = prevScroll; });
  }
  // v3.3.3 反馈⑩：分页事件委托（容器级，重建不丢）
  // v4.3.3 反馈②：滚动触底自动翻页为主交互
  // v4.3.5 反馈③：移除 data-ach-page 按钮点击委托——按钮已删，滚动是唯一翻页入口；
  //   自动化脚本兼容：直接操纵列表滚动（scrollTop = scrollHeight）即可触发翻页。
  // v4.3.12 反馈②：10s 无操作回缩——累积加载出的额外组在 10s 无滚动后收起回第一页
  //   （恢复 v4.3.5 反馈③原始诉求；v4.3.6b 累积式重做时该行为被移除）。
  if (!container._achDelegated) {
    container._achDelegated = true;
    container.addEventListener('scroll', () => {
      if (container._achScrollLock) return;
      // 任何滚动都算「操作」：刷新回缩计时（achPage=1 时不挂计时器，无内容可收）
      clearTimeout(container._achIdleTimer);
      if (achPage > 1) {
        container._achIdleTimer = setTimeout(() => {
          achPage = 1; // 收起回第一页
          container._keepScroll = null; // 回缩后从顶部开始
          renderAchievementPanel(container);
        }, 10000);
      }
      const total = container._achTotal || 0;
      const shown = Math.min(achPage * ACH_PAGE_SIZE, total);
      if (shown >= total) return; // 已全部展示
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 20) {
        container._achScrollLock = true;
        achPage++; // v4.3.6b：追加下一组（旧卡保留）
        container._keepScroll = container.scrollTop; // 保持滚动位置（追加而非跳顶）
        renderAchievementPanel(container);
        requestAnimationFrame(() => { container._achScrollLock = false; });
      }
    }, { passive: true });
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
    // v4.3.14 反馈④：潮汐变换是周期性自然节律，不再打日志/toast（顶栏潮汐角标仍实时反映相位）
    if (prev !== S.tidePhase && toast) toast(`潮汐→${info.name}`);
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
  window.__qa = { doPrestige, canPrestige, computeCps, cpsBreakdown, epStorageCap, prestigeNeed, prestigeGain, totalDrainPerSec, staffSalaryPerSec, staffOutputPerSec,
    rpCap, dmCap, ptCap, // v3.4.4 反馈①：三仓库上限（逐级扩容）测试钩子
    faithCap, // v3.5.0 ②：FP 上限（已从圣所搬到誓约圣龛）测试钩子
    crewStateMeta, // v4.0.0 ④：全局薪资状态真源转为只读 QA 钩子（面板不再展示状态行，但机制仍可查询）
    rpEffScale, // v3.3.3 反馈③：RP 效率递增系数（测试钩子）
    riftEtaSec, riftNextSec, // v3.3.5 反馈③：裂隙倒计时/下次间隔（测试钩子）
    vehicleEpPerDm, vehicleRateMult, probeFlowPerSec, vehicleDmPerMin, // v3.3.6：探采汇率/乘区/结算口径（测试钩子）
    bulkCostCalc, unitCost, // v3.6.4 ④：粮仓首购价（卡面/实付同口径）
    riftLevelOf, riftLevelTech, buyRiftLevelTech, // v3.6.4 ①：裂隙等级只认科技
    // v3.3.0 线程绑定系统 QA 钩子
    petsModuleUnlocked, // v3.7.2 ①：异兽模块与顶栏 PT 同口径的唯一解锁判定
    starChartUnlocked, // v3.12.9：星图解锁唯一判定源（宠物在前）
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
    chooseOrchestrationMode, chooseOrchestrationAutoTide,
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
    // v3.11.0：自动化动作声明层 / 助手占编（30 天浏览器推演核对「声明→占编」与长期续航）
    AI_ACTIONS, AI_ACTION_IDS, AI_ACTION_SWITCH_KEYS, AI_CREW_REQUIRED_IDS,
    ALL_OFF_SWITCH_KEYS, AI_ACTION_GROUPS, maxCycleCrewDemand, crewSizeOf, groupRankOf,
    crewOf, crewBoundTotal, crewIdle, setCrew,
    assistantCount, assistantCost, assistantBuyState, actionCounts, totalActionCount,
    stalledActions, actionAvailable, autoBuildActivable, getTechs, buyTech,
    ETERNALS, esCost, buyEternal, esGain, // v4.2.6：分章节推演自动玩家消费 ES 的产品真实入口（esCost 为 economy 单参包装，读 S.eternal 同产品读侧）；v4.2.8：esGain 供推演按晋升时点累计 ES 奖励（原来 QA 未导出，prestigeEsGain 恒 0，预算校验 esDelta 失真）
    CHAPTERS, // v4.2.6：分章节推演读「下一章 cond 已满足」判定憋晋升恢复点（产品真源，不复制条件）
    RESONANCE_FOCI, RESONANCE_TUNING, RESONANCE_UNLOCK, DEFAULT_RESONANCE,
    resonanceUnlocked, resonanceState, resonanceSummary, resonanceMult,
    setResonanceEnabled, toggleResonanceEnabled, setResonanceFocus,
    // v4.3.1 反馈⑥：浏览器保活开关状态 QA 钩子（只读，行为走按钮真实点击）
    WAKE_LOCK_SUPPORTED, keepAwakeActive: () => !!wakeLockSentinel,
    // v3.7.0 30 天 mock 推演：自动玩家只调用产品真实入口，禁止直接写 S 伪造进度
    sim: { doClick, buyUpgrade, switchTab, render, clickMult, addEp, canPrestige, doPrestige,
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
