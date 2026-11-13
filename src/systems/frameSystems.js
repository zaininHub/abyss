// v3.9.0 声明层：全部「每帧推进」的玩法系统。
//
// 本文件只做声明，不持有调度逻辑（调度在 core/systemScheduler.js），不写任何结算公式
// （资源结算在 systems/resourceFlows.js），也不碰渲染 DOM（面板消费在 core/panelRegistry.js）。
//
// 三个执行点与 main.js tick() 的四个资源流阶段严格交错，顺序与 v3.8.0 原实现逐字一致：
//   EP_PRODUCE → EP_AUX → [AFTER_EP_AUX] → PRODUCERS → [AFTER_PRODUCERS]
//   → CONVERTERS → [FRAME]（其余模块 tick + 节流检查 + 最后统一 render）
//
// 「先产出、再扣费、后结算」的顺序不变，因此本次重构不引入任何数值漂移。
// main.js 只需在四个原执行点调用 runSystems(ctx, PHASE)；新增玩法注册一个系统即可。
//
// main.js 内的闭包函数（render / checkAch / tickTide 等）通过 deps 注入，
// 避免声明层反向 import 主入口造成循环依赖，同时让本文件可在纯 Node 下用 stub deps 单测。
import { registerSystem, FRAME_PHASES as P } from '../core/systemScheduler.js';
import { log, toast } from '../core/runtime.js';
import { computeCps, staffOutputPerSec, addRp, hasTech, tickCorruption, purgeCostFor } from '../modules/economy.js';
import { tickWages } from '../modules/wages.js';
import { tickThreads } from '../modules/threadBinding.js';
import { tickReligion, refreshReligionAffordability } from '../modules/religions.js';
import { tickDelve, delveUnlocked } from '../modules/delve.js';
import { tickBazaar, bazaarUnlocked } from '../modules/bazaar.js';
import { tickRift, riftEtaSec, fmtEta, renderRiftLevelTech, riftUpgradeLevel,
  riftPurgeCostMult, refreshRiftAffordability } from '../modules/rift.js';
import { tickVehicleCollect } from '../modules/vehicles.js';
import { tickProjects } from '../modules/projects.js';
import { tickExpeditions, tickColonies, refreshExpeditionAffordability } from '../modules/expedition.js';
import { maybeTriggerEvent, peekNextEvent } from '../modules/events.js';
import { gainPetExp, renderPetGrid, refreshPetsAffordability } from '../modules/pets.js';
import { tickAI, aiUnlocked, aiHireFlag, autoBuildUnlocked, allResDiscovered,
  autoBuildActivateCost, refreshAssistantAffordability } from '../modules/ai.js';
import { checkSpecialTasks, checkEasterEggs } from '../modules/progression.js';
import { getAllGates, checkGate } from '../core/gates.js';
import { chapterRank, chapterCode } from '../core/storylineContent.js';
import { currentChapter } from '../modules/story.js';
import { orchestrationUnlocked, orchestrationState, effectiveModeId,
  TIDE_PHASE_NAMES, MODE_BY_ID } from '../core/orchestration.js';
import { tickResonance } from '../core/resonance.js'; // v3.10.0：相位共鸣推进
import { refreshShopAffordability, refreshShopChain } from '../modules/shop.js';
import { refreshTechState } from '../modules/tech.js';
import { refreshRelicAffordability } from '../modules/relics.js';
import { crewShown, renderCrewPanel } from '../modules/crew.js';
import { RELICS, relicsUnlocked, relicLevel } from '../data/relics.js';
import { MOOD_MULT } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';

const { AFTER_EP_AUX, AFTER_PRODUCERS, FRAME } = P;

/**
 * 注册全部帧系统。deps 为 main.js 内的闭包函数（见文件头说明）。
 * 重复调用是幂等的：同 id 注册会替换，不会叠加。
 */
export function registerFrameSystems(deps = {}) {
  const D = deps;
  const doc = () => (typeof document !== 'undefined' ? document : null);

  // ===== ① AFTER_EP_AUX：薪资 → 线程晋升 → 个人贡献分摊 =====
  registerSystem({
    id: 'wages', phase: AFTER_EP_AUX, order: 10,
    run: (ctx) => { tickWages(ctx.dt); },
  });

  registerSystem({
    id: 'threads', phase: AFTER_EP_AUX, order: 20,
    run: (ctx) => {
      const leveled = tickThreads(ctx.dt);
      for (const nm of leveled) {
        log(`线程【${nm}】晋升，班组调度经验提升`, 'good');
        if (toast) toast(`🎖️ 线程【${nm}】晋升！`);
      }
    },
  });

  registerSystem({
    id: 'crew-earned', phase: AFTER_EP_AUX, order: 30,
    run: (ctx) => {
      const S = ctx.S, dt = ctx.dt;
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
    },
  });

  // ===== ② AFTER_PRODUCERS：宗教 / 政策开放组 / 深潜 / 集市 =====
  registerSystem({
    id: 'religion', phase: AFTER_PRODUCERS, order: 10,
    run: (ctx) => { tickReligion(ctx.dt); },
  });
  registerSystem({
    id: 'policy-refresh', phase: AFTER_PRODUCERS, order: 20,
    run: () => { if (typeof D.policyTickRefresh === 'function') D.policyTickRefresh(); },
  });
  registerSystem({
    id: 'delve', phase: AFTER_PRODUCERS, order: 30,
    run: (ctx) => { tickDelve(ctx.dt); },
  });
  registerSystem({
    id: 'bazaar', phase: AFTER_PRODUCERS, order: 40,
    run: (ctx) => { tickBazaar(ctx.dt); },
  });

  // ===== ③ FRAME：CONVERTERS 之后的全部模块与节流检查 =====

  // v3.0.5 反馈②：tab 入口显隐 + 裂隙倒计时，1s 快刷
  registerSystem({
    id: 'tab-visibility', phase: FRAME, order: 10, intervalSec: 1,
    run: (ctx) => {
      const S = ctx.S, d = ctx.dirty;
      const orchNow = orchestrationUnlocked(S);
      if (orchNow !== ctx.lastOrchUnlocked) { ctx.lastOrchUnlocked = orchNow; d.orchestration = true; }
      if (typeof D.refreshTabVisibility === 'function') D.refreshTabVisibility();
      if (typeof refreshReligionAffordability === 'function') refreshReligionAffordability();
      if (S._riftSeen && !S.activeRift && !S.riftExpedition) d.rift = true;
      const document_ = doc();
      if (!document_) return;
      const etaLabelEl = document_.getElementById('rift-eta-label');
      const etaTabEl = document_.getElementById('rift-eta-tab');
      if (!etaTabEl) return;
      if (S.activeRift) {
        if (etaLabelEl) etaLabelEl.textContent = '当前裂隙';
        etaTabEl.textContent = `进行中 · 剩余 ${fmtEta(Math.max(0, Math.ceil((S.activeRift.expiresAt - Date.now()) / 1000)))}`;
      } else {
        if (etaLabelEl) etaLabelEl.textContent = '下次裂隙';
        etaTabEl.textContent = fmtEta(riftEtaSec());
      }
    },
  });

  // 深潜 / 集市面板为 innerHTML 重建，保持 5s 低频（1s 会吞点击 / 闪烁）
  registerSystem({
    id: 'panel-check', phase: FRAME, order: 20, intervalSec: 5,
    run: (ctx) => {
      if (delveUnlocked()) ctx.dirty.delve = true;
      // v3.12.0 反馈⑬：未买断时购买卡也要随 PP 变化刷新（低频，不吞点击）
      ctx.dirty.bazaar = true;
      ctx.dirty.reincarn = true;
    },
  });

  registerSystem({
    id: 'rift', phase: FRAME, order: 30,
    run: (ctx) => {
      const S = ctx.S;
      const hadRift = !!S.activeRift;
      tickRift(ctx.dt);
      if (!!S.activeRift !== hadRift || S.activeRift) ctx.dirty.rift = true;
    },
  });

  // v3.4.9 反馈②：自动净化仪（腐化每涨 5% 净化 5%，EP 不足等待不刷屏）
  registerSystem({
    id: 'auto-purify', phase: FRAME, order: 40,
    run: (ctx) => {
      const S = ctx.S;
      if (!S.autoPurify || riftUpgradeLevel('auto_purify') < 1) return;
      const step = 5;
      if (!(S._autoPurifyMark >= 0)) S._autoPurifyMark = 0;
      if ((S.corruption || 0) < S._autoPurifyMark - 2) S._autoPurifyMark = Math.max(0, S.corruption || 0);
      if ((S.corruption || 0) >= S._autoPurifyMark + step) {
        const cost = Math.ceil(purgeCostFor(step) * riftPurgeCostMult());
        if ((S.ep || 0) >= cost) {
          S.ep -= cost;
          S.corruption = Math.max(0, (S.corruption || 0) - step);
          S._autoPurifyMark = Math.max(0, S.corruption || 0);
          ctx.dirty.corruption = true; ctx.dirty.top = true;
        } else {
          S._autoPurifyMark = (S.corruption || 0) - step;
        }
      }
    },
  });

  registerSystem({
    id: 'vehicle', phase: FRAME, order: 50,
    run: (ctx) => {
      const vehChanged = tickVehicleCollect(ctx.dt);
      if (vehChanged) {
        ctx.dirty.top = true;
        if (vehChanged === 'transition') ctx.dirty.shop = true;
      }
    },
  });

  registerSystem({
    id: 'projects', phase: FRAME, order: 60,
    run: (ctx) => { if (tickProjects()) ctx.dirty.projects = true; },
  });

  // 进度条原地更新（不整面板重建，消除吞点击）
  registerSystem({
    id: 'project-progress', phase: FRAME, order: 70, intervalMs: 1000,
    enabled: (ctx) => ctx.S.projects.length > 0,
    run: () => { if (typeof D.updateProjectProgress === 'function') D.updateProjectProgress(); },
  });

  registerSystem({
    id: 'expeditions', phase: FRAME, order: 80,
    run: (ctx) => {
      const S = ctx.S;
      const exBefore = S.expeditions.length;
      const exDoneBefore = S.expeditionsDone;
      tickExpeditions();
      tickColonies(ctx.dt);
      if (S.expeditions.length !== exBefore || S.expeditionsDone !== exDoneBefore) {
        ctx.dirty.expedition = true;
        if (typeof D.refreshTabVisibility === 'function') D.refreshTabVisibility();
      }
    },
  });

  // 章节推进 + 图鉴持久化 + 章节馈赠
  registerSystem({
    id: 'chapter', phase: FRAME, order: 90,
    run: (ctx) => {
      const S = ctx.S;
      const chNow = currentChapter(S);
      const chNowStr = String(chNow.id);
      const sChapterStr = String(S.chapter || '1');
      const [nNow, sufNow] = chapterRank(chNowStr);
      const [nCur, sufCur] = chapterRank(sChapterStr);
      if (nNow > nCur || (nNow === nCur && sufNow > sufCur)) {
        S.chapter = chNowStr;
        S.chapterEnteredAt = Date.now();
        ctx.dirty.story = true;
        S.chaptersUnlocked = S.chaptersUnlocked || {};
        const slId = S.storyline && S.storyline !== 'default' ? S.storyline : 'line_order';
        S.chaptersUnlocked[slId] = S.chaptersUnlocked[slId] || [];
        const code = chapterCode(chNowStr);
        if (!S.chaptersUnlocked[slId].includes(code)) S.chaptersUnlocked[slId].push(code);
        const chId = nNow;
        const gift = Math.max(5, chId * 5);
        addRp(gift);
        const chName = chNow.name || `第 ${chId} 章`;
        if (toast) toast(`📖 进入${chName}：章节馈赠 +${gift} RP`);
        log(`章节推进：${chName}——时间线向前折叠，+${gift} RP 馈赠`, 'good');
        ctx.dirty.top = true;
      }
    },
  });

  // 门控状态变化触发顶栏重绘
  registerSystem({
    id: 'gates', phase: FRAME, order: 100,
    run: (ctx) => {
      const gateStates = [];
      for (const gate of getAllGates()) gateStates.push(checkGate(gate.id, { S: ctx.S }) ? '1' : '0');
      const gateHash = gateStates.join('');
      if (gateHash !== ctx.lastGateHash) { ctx.lastGateHash = gateHash; ctx.dirty.top = true; }
    },
  });

  registerSystem({
    id: 'tide', phase: FRAME, order: 110,
    run: (ctx) => { if (typeof D.tickTide === 'function') D.tickTide(ctx.dt); },
  });
  // v3.9.0 新玩法配套系统：排班表生效策略翻转时同步编排卡。
  // 只新增一条注册，不修改主循环、不改任何既有系统 —— 这正是控制流抽象要达到的效果。
  registerSystem({
    id: 'tide-schedule', phase: FRAME, order: 115,
    run: (ctx) => {
      const S = ctx.S;
      const cur = effectiveModeId(S);
      if (cur !== ctx.lastScheduleMode) {
        ctx.lastScheduleMode = cur;
        ctx.dirty.orchestration = true;
        const st = orchestrationState(S);
        if (orchestrationUnlocked(S) && st.autoTide && ctx.lastScheduleModeBooted) {
          const phase = ((Number(S.tidePhase) || 0) % 4 + 4) % 4;
          log(`潮汐预案：进入${TIDE_PHASE_NAMES[phase]}，排班切换为「${(MODE_BY_ID.get(cur) || {}).name || cur}」`, 'good');
        }
        ctx.lastScheduleModeBooted = true;
      }
      // v3.10.0 新玩法「相位共鸣」：复用本系统推进，不新增系统 id、不改主循环。
      // 只有层数 / 相位变化才置脏，累加器每帧静默写入，避免每帧重建编排卡 DOM。
      if (tickResonance(S, ctx.dt).changed) ctx.dirty.orchestration = true;
    },
  });
  registerSystem({
    id: 'corruption', phase: FRAME, order: 120,
    run: (ctx) => { tickCorruption(ctx.dt); },
  });
  registerSystem({
    id: 'code-rain', phase: FRAME, order: 130,
    run: () => { if (typeof D.ensureCodeRain === 'function') D.ensureCodeRain(); },
  });
  registerSystem({
    id: 'crossroad', phase: FRAME, order: 140,
    run: () => { if (typeof D.updateCrossroad === 'function') D.updateCrossroad(); },
  });
  registerSystem({
    id: 'events', phase: FRAME, order: 150,
    run: () => { maybeTriggerEvent(); },
  });

  // v3.3.3 反馈④：预言广播 10 分钟一次（仅在持有 prophecy 科技时计时）
  registerSystem({
    id: 'prophecy', phase: FRAME, order: 160,
    run: (ctx) => {
      const S = ctx.S;
      if (!hasTech('prophecy')) { S._prophecyTimer = 0; return; }
      S._prophecyTimer = (S._prophecyTimer || 0) + ctx.dt;
      if (S._prophecyTimer < 600) return;
      S._prophecyTimer = 0;
      const nxt = peekNextEvent();
      if (nxt) {
        const changed = !S.prophecyNext || S.prophecyNext.id !== nxt.id;
        S.prophecyNext = { id: nxt.id, name: nxt.name, type: nxt.type, desc: nxt.desc || '', at: Date.now() };
        if (changed) {
          log(`🔮 神谕广播：下一个事件将是「${nxt.name}」——${nxt.desc || '效果未知'}`, 'good');
          const wait = S.nextEventAt - Date.now();
          if (wait > 15 * 60 * 1000) S.nextEventAt = Date.now() + (5 + Math.random() * 10) * 60 * 1000;
          ctx.dirty.ai = true;
        }
      } else if (S.prophecyNext) {
        S.prophecyNext = null;
      }
    },
  });

  registerSystem({
    id: 'pet-exp', phase: FRAME, order: 170,
    run: (ctx) => { gainPetExp(ctx.dt); },
  });
  registerSystem({
    id: 'pet-ui', phase: FRAME, order: 180, intervalSec: 5,
    run: (ctx) => { ctx.dirty.pets = true; },
  });

  registerSystem({
    id: 'special-tasks', phase: FRAME, order: 190,
    run: (ctx) => { checkSpecialTasks(ctx.S, log, toast); },
  });
  registerSystem({
    id: 'easter-eggs', phase: FRAME, order: 200,
    run: (ctx) => {
      const mark = () => { ctx.dirty.story = true; };
      checkEasterEggs('time_check', ctx.S, log, toast, mark);
      checkEasterEggs('idle', ctx.S, log, toast, mark);
      checkEasterEggs('state_check', ctx.S, log, toast, mark);
    },
  });
  registerSystem({
    id: 'idle', phase: FRAME, order: 210,
    run: (ctx) => { ctx.S._idleSec = ((Date.now() - ctx.S._lastActionAt) / 1000) || 0; },
  });
  registerSystem({
    id: 'milestones', phase: FRAME, order: 220,
    run: () => { if (typeof D.checkMiles === 'function') D.checkMiles(); },
  });
  registerSystem({
    id: 'achievements', phase: FRAME, order: 230,
    run: () => { if (typeof D.checkAch === 'function') D.checkAch(); },
  });
  registerSystem({
    id: 'discover', phase: FRAME, order: 240,
    run: () => { if (typeof D.discoverCheck === 'function') D.discoverCheck(); },
  });

  // v1.3 模块 A：AI 助手每 5s 决策（模块内部自节流）
  registerSystem({
    id: 'ai', phase: FRAME, order: 250,
    run: (ctx) => {
      const aiAct = tickAI(ctx.dt);
      if (aiAct) {
        ctx.dirty.hero = true; ctx.dirty.top = true; ctx.dirty.projects = true;
        if (aiHireFlag()) ctx.dirty.shop = true;
      }
    },
  });

  // ---- 脏标记 / UI 快刷（顺序与 v3.8.0 原 render 前置块一致）----
  registerSystem({
    id: 'dirty-tide', phase: FRAME, order: 260,
    run: (ctx) => {
      const S = ctx.S;
      const tideTimerCeil = Math.ceil(S.tideTimer);
      if (S.tidePhase !== ctx.tideCachePhase || tideTimerCeil !== ctx.tideCacheTimer) {
        ctx.dirty.tide = true; ctx.dirty.top = true; ctx.dirty.orchestration = true;
        ctx.tideCachePhase = S.tidePhase;
        ctx.tideCacheTimer = tideTimerCeil;
      }
    },
  });
  registerSystem({
    id: 'dirty-corruption', phase: FRAME, order: 270,
    run: (ctx) => {
      const corruptionFloor = Math.floor(ctx.S.corruption || 0);
      if (corruptionFloor !== ctx.corruptionCacheFloor) {
        ctx.dirty.corruption = true; ctx.dirty.hero = true; ctx.dirty.top = true;
        ctx.corruptionCacheFloor = corruptionFloor;
      }
    },
  });
  registerSystem({
    id: 'dirty-wage', phase: FRAME, order: 280,
    run: (ctx) => {
      const wageSt = (ctx.S.wageState || {}).state || 'ok';
      if (wageSt !== ctx.wageStateCache) {
        ctx.wageStateCache = wageSt;
        ctx.dirty.hero = true; ctx.dirty.top = true;
      }
    },
  });
  // 吞噬倒计时期间每秒强制刷新横幅；非倒计时状态显式复位计时
  registerSystem({
    id: 'collapse-ui', phase: FRAME, order: 290,
    run: (ctx) => {
      const S = ctx.S;
      if (S._collapseAt || S.collapsed || S._collapseChoicePending) {
        S._collapseUiTimer = (S._collapseUiTimer || 0) + ctx.dt;
        if (S._collapseUiTimer >= 1) { S._collapseUiTimer = 0; ctx.dirty.corruption = true; }
      } else {
        S._collapseUiTimer = 0;
      }
    },
  });
  registerSystem({
    id: 'dirty-basics', phase: FRAME, order: 300,
    run: (ctx) => { ctx.dirty.top = true; ctx.dirty.hero = true; },
  });
  // v2.7.5 ①：晋升 / 故事线 / 成就 / 编排降频至每 2s（防慢速点击被吞）
  registerSystem({
    id: 'dirty-periodic', phase: FRAME, order: 310, everyFrames: 20,
    run: (ctx) => {
      ctx.dirty.prestige = true; ctx.dirty.story = true; ctx.dirty.storyline = true;
      ctx.dirty.achievements = true; ctx.dirty.orchestration = true;
    },
  });
  // v3.3.7 反馈①：遗物结构签名比对，仅结构变化才整面重建
  registerSystem({
    id: 'relic-sig', phase: FRAME, order: 320,
    run: (ctx) => {
      const S = ctx.S;
      const relicSigNow = RELICS.map(r => `${r.id}:${relicLevel(r.id)}:${r.gate() ? 1 : 0}`).join(',')
        + `|P:${['purifier1', 'purifier2', 'purifier3'].map(id => (S.upgrades && S.upgrades[id]) || 0).join('.')}`
        + `|T:${(S.tech && S.tech.entropy_reduce) ? 1 : 0}`
        + `|U:${relicsUnlocked() ? 1 : 0}`;
      if (relicSigNow !== ctx.relicSig) { ctx.relicSig = relicSigNow; ctx.dirty.relics = true; }
    },
  });

  // 可购态 300ms 原地快刷（纯 class/textContent，不动 DOM 结构）
  registerSystem({
    id: 'affordability', phase: FRAME, order: 330, intervalMs: 300,
    run: () => {
      refreshTechState();
      refreshShopAffordability();
      refreshRelicAffordability();
      refreshPetsAffordability();
      refreshReligionAffordability();
      refreshRiftAffordability();
      refreshExpeditionAffordability();
      refreshAssistantAffordability();
      const document_ = doc();
      const riftTechEl = document_ && document_.getElementById('rift-tech-list');
      if (riftTechEl) renderRiftLevelTech(riftTechEl);
    },
  });

  // 商店解锁检测 / 班组 / 快捷开关 / AI 显隐，1s 低频
  registerSystem({
    id: 'shop-unlock', phase: FRAME, order: 340, intervalMs: 1000,
    run: (ctx) => {
      const S = ctx.S, d = ctx.dirty;
      const document_ = doc();
      if (!document_) return;
      // v3.10.3：编排 + 班组合并卡片显隐（两者解锁其一即显示整卡；编排控件由 renderOrchestrationPanel 负责）
      const mergeVisible = orchestrationUnlocked(S) || crewShown();
      const mergeCard = document_.getElementById('orchestration-card');
      if (mergeCard && mergeCard.style.display !== (mergeVisible ? '' : 'none')) mergeCard.style.display = mergeVisible ? '' : 'none';
      // 班组内容每帧渲染到合并卡片内的 #crew-panel（sibling of #orchestration-panel），保证 per-second 产出实时刷新
      if (crewShown()) renderCrewPanel(document_.getElementById('crew-panel'));
      renderPetGrid(document_.getElementById('pet-grid'));
      if (typeof D.renderQuickSwitches === 'function') D.renderQuickSwitches();
      const bldHost = document_.getElementById('building-list');
      if (bldHost) {
        const base = BALANCE.atrium.base || 5e4;
        const atrOwned = (S.upgrades && S.upgrades.atrium) || 0;
        const shouldAtr = atrOwned >= 1 || (S.ep || 0) >= base * 0.3 || (S.allTimeEp || 0) >= base * 0.3;
        const hasAtr = !!bldHost.querySelector('.atrium-distill');
        const shouldHatch = S.ptAutoHatch === true || (S.resDiscovered && S.resDiscovered.pt) || (S.pt || 0) > 0 || (S.ptHatchLv || 1) > 1;
        const hasHatch = !!bldHost.querySelector('.hatch-upg');
        if (hasAtr !== shouldAtr || hasHatch !== shouldHatch) d.shop = true;
      }
      let n = 0;
      for (const u of UPGRADES) {
        const owned = S.upgrades[u.id] || 0;
        if (owned > 0 || S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3) n++;
      }
      if (ctx.lastUnlockedCount === -1) ctx.lastUnlockedCount = n;
      if (n !== ctx.lastUnlockedCount) {
        ctx.lastUnlockedCount = n;
        refreshShopChain();
        toast('新升级模块已解锁');
      }
      const aiNow = aiUnlocked();
      if (aiNow !== ctx.lastAiUnlocked) { ctx.lastAiUnlocked = aiNow; d.ai = true; }
      const abNow = aiNow && (autoBuildUnlocked() || allResDiscovered(S));
      if (abNow !== ctx.lastAbVisible) { ctx.lastAbVisible = abNow; d.ai = true; }
      else if (abNow && !autoBuildUnlocked()) {
        // v3.12.13 ⑥：自动购建激活消耗由 EP 改为研究点 RP
        const rpOkNow = (S.rp || 0) >= autoBuildActivateCost();
        if (rpOkNow !== ctx.lastAbRpOk) { ctx.lastAbRpOk = rpOkNow; d.ai = true; }
      }
    },
  });

  // 终点：统一消费脏标记并重绘（注册顺序保证在所有系统之后）
  registerSystem({
    id: 'render', phase: FRAME, order: 9999,
    run: () => { if (typeof D.render === 'function') D.render(); },
  });
}

/**
 * v3.10.0：main.js 注入的闭包依赖清单（此前 11 个 deps 无任何清单，是控制流层唯一的审计盲区）。
 * 由 tests/v3100-state-schema.test.mjs 双向锁死：注入键 ↔ 本文件 D.<key> 消费点。
 */
export const FRAME_DEPS_KEYS = Object.freeze([
  'policyTickRefresh', 'updateProjectProgress', 'refreshTabVisibility', 'updateCrossroad',
  'ensureCodeRain', 'tickTide', 'checkMiles', 'checkAch', 'discoverCheck',
  'renderQuickSwitches', 'render',
]);

/** 供单测 / QA 校验「声明 → 消费」接线完整的系统 id 清单 */
/**
 * v3.12.13 反馈 #164：潮汐排班 UI 构建（纯字符串，由 main.js 的 renderOrchestrationPanel 拼入面板）。
 * 设计要点：
 *  - 「潮汐排班」与四种排版类型（ORCHESTRATION_MODES）处于同一行，均为切换按钮。
 *  - 「潮汐排班」仅用选中高亮（accent 边框）表达开/关，不显示「开启/关闭」字样。
 *  - 「潮汐预案」改为悬停浮层（role=tooltip），默认隐藏，仅悬停/聚焦「潮汐排班」时显示。
 * 浮层显隐的 CSS 规则（.tide-sched-pop 默认 display:none，hover/focus-within 时 display:block）
 * 在首渲时注入一次 <style id="tide-sched-style">，不改动 style.css。
 */
export function buildTideSchedulingHtml(ctx) {
  const { S, st, auto, schedOK, sched, ORCHESTRATION_MODES, scheduleCustomized } = ctx;
  let html = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">`;
  for (const m of ORCHESTRATION_MODES) {
    const on = !auto && m.id === st.mode;
    html += `<button class="btn-mini" data-orch-mode="${m.id}"${on ? ' style="border-color:var(--accent);color:var(--accent)"' : ''}${auto ? ' disabled title="随潮汐排班开启时由相位决定"' : ''}>${m.icon} ${m.short}</button>`;
  }
  // 潮汐排班：选中高亮即表示开启；无独立「开启/关闭」文字。
  html += `<div class="tide-sched-wrap" style="position:relative;display:inline-block">
    <button class="btn-mini" data-orch-auto="1" aria-pressed="${auto}"${auto ? ' style="border-color:var(--accent);color:var(--accent)"' : ''}>潮汐排班</button>`;
  // 潮汐预案：仅悬停/聚焦「潮汐排班」时显示的浮层，默认隐藏。
  if (auto && schedOK) {
    const curPhase = ((Number(S.tidePhase) || 0) % 4 + 4) % 4;
    // v4.0.0 反馈⑤：浮层改 position:fixed，彻底脱离 .first-col(overflow-y:auto) 的裁剪与祖先层叠上下文；
    //   left/top 由 main.js 的 placeTideSchedPop 按触发按钮视口坐标写入（此处仅占位）。
    html += `<div class="tide-sched-pop" role="tooltip" style="position:fixed;left:0;top:0;z-index:9999;background:var(--bg-2,#1a1d24);border:1px solid var(--border);border-radius:8px;padding:8px;min-width:240px;max-height:min(60vh,420px);overflow-y:auto;box-shadow:0 6px 18px rgba(0,0,0,.45)">
      <div style="font-size:11.5px;color:var(--text-2);margin-bottom:6px">潮汐预案 · 四相位排班表</div>`;
    for (let i = 0; i < 4; i++) {
      const nowOn = curPhase === i;
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
  html += `</div></div>`;

  // 注入浮层显隐规则（默认隐藏，悬停/聚焦显示），不改动 style.css。
  if (typeof document !== 'undefined' && !document.getElementById('tide-sched-style')) {
    const s = document.createElement('style');
    s.id = 'tide-sched-style';
    s.textContent = `.tide-sched-pop{display:none}.tide-sched-wrap:hover .tide-sched-pop,.tide-sched-wrap:focus-within .tide-sched-pop{display:block}`;
    (document.head || document.documentElement).appendChild(s);
  }
  return html;
}

export const FRAME_SYSTEM_IDS = Object.freeze([
  'wages', 'threads', 'crew-earned',
  'religion', 'policy-refresh', 'delve', 'bazaar',
  'tab-visibility', 'panel-check', 'rift', 'auto-purify', 'vehicle', 'projects',
  'project-progress', 'expeditions', 'chapter', 'gates', 'tide', 'corruption',
  'code-rain', 'tide-schedule', 'crossroad', 'events', 'prophecy', 'pet-exp', 'pet-ui',
  'special-tasks', 'easter-eggs', 'idle', 'milestones', 'achievements',
  'discover', 'ai', 'dirty-tide', 'dirty-corruption', 'dirty-wage', 'collapse-ui',
  'dirty-basics', 'dirty-periodic', 'relic-sig', 'affordability', 'shop-unlock', 'render',
]);

