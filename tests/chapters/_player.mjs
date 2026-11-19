// 分章节测试体系 · 共享自动玩家层（v4.2.6 反馈②，从 tests/v3110-30day-browser.mjs 抽取）
//
// 职责：把 v3110 的自动玩家骨架（候选集收集 / __runBatch 决策循环 / __numericProbe 定点探针）
//       抽成可被 page.evaluate(playerInit, config) 注入的自包含函数，v3110 与分章节推演共用。
//
// 纪律（不可违反）：自动玩家只调用产品真实入口（window.__qa.sim.* / __qa.*），
//       不直接写 S 伪造进度。决策骨架与 v3110 原 __runBatch 逐字一致，仅做参数化：
//       - prestigeGapTicks：两次晋升的最小间隔（默认 2880 tick = 8 游戏小时，v3110 原值）；
//       - goalChapter / maxDays：分章节推演的目标章与单章模拟天上限（仅记录于 __playerCfg，
//         供 run-range.mjs 超时判定与报告读取；章节推进本身由产品帧系统真实驱动）。
//
// 注入方式：await page.evaluate(playerInit, cfg) —— 函数体序列化后在页面执行，
//       因此内部只允许引用 window.* 与参数，不允许引用 Node 侧闭包 / import。

/**
 * 页面运行期初始化：__stats 统计器、升级候选集、__runBatch 决策循环、__numericProbe 探针。
 * 必须在 gotoAndSettle() 之后、第一次 __runBatch 调用之前执行。
 */
export function playerInit(cfg = {}) {
  const PRESTIGE_GAP = Number(cfg.prestigeGapTicks || 2880);
  window.__playerCfg = {
    prestigeGapTicks: PRESTIGE_GAP,
    goalChapter: cfg.goalChapter != null ? String(cfg.goalChapter) : null,
    maxDays: Number(cfg.maxDays || 0) || null,
    label: cfg.label || 'default',
    // v4.2.6 校准③：分章节推演传 true = 未推进到目标章前憋晋升（真人冲章节策略）；
    // v3110 不传（falsy）= canPrestige 即升，行为不变。
    holdPrestigeUntilAdvanced: !!cfg.holdPrestigeUntilAdvanced,
  };
  const S = window.S, q = window.__qa;
  window.__prodCands = q.UPGRADES.filter(u => u.cps > 0 && /^基础产出\+/.test(u.desc || ''));
  window.__capCands = q.UPGRADES.filter(u => ['reserve_bin', 'storage'].includes(u.id));
  window.__tickCount = 0;
  window.__lastPrestigeTick = -9999;
  window.__orchSeq = ['output', 'research', 'abyss', 'balanced'];
  window.__orchIdx = 0;
  window.__scheduleEdits = 0;
  window.__resFoci = ['ep', 'rp', 'pt', 'dm'];
  window.__resFocusIdx = 0;
  window.__lastResLayers = 0;
  window.__lastResPhase = -1;
  window.__stats = { buys: 0, clicks: 0, buyFails: 0, capStalls: 0, errors: [],
    orchSwitches: 0, orchChecks: [], claims: 0, scheduleEdits: 0, scheduleChecks: [],
    resonanceEnables: 0, focusSwitches: 0, resonanceChecks: [], layerSamples: [],
    phaseDecays: 0,
    // v3.11.0：AI 自动化长期推演统计（全部经产品真实入口产生）
    aiBuys: 0, aiBuyFails: 0, aiSwitchToggles: 0, aiStallTicks: 0,
    aiBuildActivations: 0, aiTechBought: 0, aiLedgerSamples: [] };

  window.__runBatch = (ticks) => {
    const S = window.S, q = window.__qa, sim = q.sim, st = window.__stats;
    for (let i = 0; i < ticks; i++) {
      window.__tickCount++;
      window.__vt += 10000;
      window.__simT += 10000;
      window.__tick(window.__simT);
      if (S.ep >= q.epStorageCap() * 0.999) st.capStalls++;

      // 每 6 tick（= 1 游戏分钟）做一次玩家决策
      if (i % 6 === 0) {
        try { sim.doClick(); st.clicks++; } catch (e) { if (st.errors.length < 12) st.errors.push('click:' + e.message); }
        // v4.2.6 分章节补充：科技/建筑解锁/远征（全部产品真实入口；v3110 共用时行为不变——
        // 这些动作只在「买得起/点得动」时产生副作用，30 天推演同样受益）
        try { window.__chapterTick && window.__chapterTick(); } catch (e) { /* 已在内部 catch */ }
        // v3.8.0：真实玩家会领取已完成（pending）的任务；只走产品真实入口 claimProject
        try {
          for (const p of (S.projects || [])) {
            if (p.status === 'pending' && sim.claimProject(p)?.ok) st.claims++;
          }
        } catch (e) { if (st.errors.length < 12) st.errors.push('claim:' + e.message); }
        try {
          const cap = q.epStorageCap();
          let pick = null, best = Infinity;
          if (S.ep > cap * 0.6) {
            for (const u of window.__capCands) {
              if ((S.upgrades[u.id] || 0) >= (u.maxLevel || Infinity)) continue;
              const c = q.bulkCostCalc(u, 1);
              if (Number.isFinite(c) && c <= S.ep && c < best) { best = c; pick = u; }
            }
          }
          if (!pick) {
            let bestScore = Infinity;
            for (const u of window.__prodCands) {
              if ((S.upgrades[u.id] || 0) >= (u.maxLevel || Infinity)) continue;
              const c = q.bulkCostCalc(u, 1);
              if (!Number.isFinite(c) || c > S.ep * 0.95) continue;
              const score = c / Math.max(u.cps, 1e-9);
              if (score < bestScore) { bestScore = score; pick = u; }
            }
          }
          if (pick) {
            const r = sim.buyUpgrade(pick);
            if (r === false || (r && r.ok === false)) st.buyFails++; else st.buys++;
          }
        } catch (e) { if (st.errors.length < 12) st.errors.push('buy:' + e.message); }
        try {
          // v4.2.6 校准⑥（第五轮推翻「憋晋升」伪需求）：晋升只在 canPrestige 时发生，
          // 憋住不禁——真正的杠杆是晋升间隔（PRESTIGE_GAP）：间隔 8h 会在 need 刚过线就升，
          // 重置损失 > 收益（CPS 从百级重爬）；拉到 5 游戏天让 runEarned 攒到 need 的数倍
          // 再升，单次 ES 按 sqrt 曲线提升且不打断 CPS 里程碑冲刺（真人「攒一波再升」策略）。
          // holdPrestigeUntilAdvanced 语义随之修正为「间隔拉大开关」，v3110 不传=2880 行为不变。
          const gap = window.__playerCfg.holdPrestigeUntilAdvanced ? 43200 : PRESTIGE_GAP;
          if (q.canPrestige() && window.__tickCount - window.__lastPrestigeTick >= gap) {
            const esBefore = q.esGain ? q.esGain() : 0; // 本章该次晋升的 ES 奖励（esGain 为纯读函数）
            sim.doPrestige(null);
            window.__lastPrestigeTick = window.__tickCount;
            st.prestiges = (st.prestiges || 0) + 1;
            st.prestigeEsGain = (st.prestigeEsGain || 0) + esBefore; // v4.2.6 校准①：余额差不反映奖励（永恒消费），按晋升时点瞬时值累计
          }
        } catch (e) { if (st.errors.length < 12) st.errors.push('prestige:' + e.message); }
        // v3.11.0：AI 自动化长期覆盖——五项开关常开（只在被关掉时经产品入口补开），
        // 余额偏低且 EP 可负担时买 1 名助手；逐分钟采样台账用于守恒与可玩性评估。
        try {
          // v3.12.3 反馈⑦：面板取消 ON/OFF 开关，「占编 > 0」即开启——
          // 自动玩家改走同一产品入口 setCrew 绑定 1 名助手（不再直接写开关）。
          for (const id of q.AI_ACTION_IDS) {
            if (q.crewOf(id) > 0 || q.crewIdle() <= 0) continue;
            if (!q.actionAvailable(id)) continue;
            q.setCrew(id, 1); st.aiSwitchToggles++;
          }
          // 进阶动作不是默认解锁：经产品真实入口激活自动购建 / 购买「自动研究」科技，
          // 让长期推演真实覆盖到进阶自动化，而不是只跑基础三项。
          if (q.autoBuildActivable()) {
            const r = sim.activateAutoBuild();
            if (r && r.ok) st.aiBuildActivations = (st.aiBuildActivations || 0) + 1;
          }
          if (!S.tech.auto_tech) {
            const t = q.getTechs().find(x => x.id === 'auto_tech');
            if (t) {
              q.buyTech(t, null); // 产品入口内部自行判定前置与可负担，未满足时无副作用
              if (S.tech.auto_tech) st.aiTechBought = (st.aiTechBought || 0) + 1;
            }
          }
          if (q.assistantCount() < 24 && q.assistantBuyState().afford) {
            const r = sim.buyAssistant();
            if (r && r.ok) st.aiBuys++; else st.aiBuyFails++;
          }
          if (q.stalledActions().length) st.aiStallTicks++;
          if (st.aiLedgerSamples.length < 240) {
            st.aiLedgerSamples.push({ t: window.__tickCount, assistants: q.assistantCount(),
              total: q.totalActionCount(q.actionCounts()),
              bound: q.crewBoundTotal() });
          }
        } catch (e) { if (st.errors.length < 12) st.errors.push('ai:' + e.message); }
      }

      // 效能编排：解锁后每 6 游戏小时轮换一次策略，同步核对 CPS 与倍率严格同口径
      if (q.orchestrationUnlocked(S) && window.__tickCount % 2160 === 0) {
        const next = window.__orchSeq[window.__orchIdx % window.__orchSeq.length];
        window.__orchIdx++;
        const before = q.computeCps();
        const oldMode = q.effectiveModeId(S);
        q.setOrchestrationAutoTide(S, false);
        q.setOrchestrationMode(S, next);
        const after = q.computeCps();
        const oldMult = q.orchestrationMult('ep', { ...S, orchestration: { mode: oldMode, autoTide: false } });
        const newMult = q.orchestrationMult('ep', S);
        st.orchSwitches++;
        if (before > 0 && st.orchChecks.length < 200) {
          st.orchChecks.push({ from: oldMode, to: next, ratio: after / before, expect: newMult / oldMult });
        }
      }
      // v3.9.0「潮汐预案」：解锁后每 12 游戏小时经产品入口真实改写某一相位，
      // 随后开启随潮汐排班，让 tide-schedule 帧系统真实驱动生效策略翻转。
      if (q.scheduleUnlocked(S) && window.__tickCount % 4320 === 0) {
        const phase = window.__scheduleEdits % 4;
        const modeId = window.__orchSeq[(window.__scheduleEdits + 4) % window.__orchSeq.length];
        const before = q.orchestrationSchedule(S).slice();
        if (q.setOrchestrationPhaseMode(S, phase, modeId)) {
          const after = q.orchestrationSchedule(S);
          st.scheduleEdits++;
          if (st.scheduleChecks.length < 60) {
            st.scheduleChecks.push({ phase, modeId, hit: after[phase] === modeId,
              othersKept: before.every((m, i) => i === phase || m === after[i]) });
          }
          window.__scheduleEdits++;
        }
        q.setOrchestrationAutoTide(S, true);
      }
      // v3.10.0「相位共鸣」：解锁后经产品真实入口开启、轮换焦点；
      // 逐帧由 tide-schedule 系统推进叠层，记录相位切换减半与四管线倍率同口径。
      if (q.resonanceUnlocked(S)) {
        const rs = q.resonanceState(S);
        if (!rs.enabled && q.toggleResonanceEnabled(S)) st.resonanceEnables++;
        if (window.__tickCount % 2160 === 0) {
          const want = window.__resFoci[window.__resFocusIdx % window.__resFoci.length];
          window.__resFocusIdx++;
          if (q.setResonanceFocus(S, want)) st.focusSwitches++;
        }
        const cur = q.resonanceSummary(S);
        if (window.__lastResPhase >= 0 && rs.phase !== window.__lastResPhase
            && cur.layers < window.__lastResLayers) st.phaseDecays++;
        if (window.__tickCount % 720 === 0 && st.layerSamples.length < 200) {
          st.layerSamples.push({ t: window.__tickCount, phase: rs.phase, layers: cur.layers,
            focus: cur.focus, ep: q.resonanceMult('ep', S), side: q.resonanceMult('rp', S) });
        }
        if (window.__tickCount % 2160 === 0 && st.resonanceChecks.length < 100) {
          // 对照组只关闭共鸣，不能动 projectsDone / prestige —— 否则会把编排解锁也一起关掉，
          // orchestrationMult 回落为 1，基准倍率消失（v3.10.0 灰度实测踩过）。
          const off = { ...S, resonance: { ...rs, enabled: false } };
          st.resonanceChecks.push(['ep', 'rp', 'pt', 'dm'].map(k => ({
            key: k, got: q.orchestrationMult(k, S),
            expect: q.orchestrationMult(k, off) * q.resonanceMult(k, S),
          })));
        }
        window.__lastResLayers = cur.layers;
        window.__lastResPhase = rs.phase;
      }
    }
    try { sim.render(); } catch (e) { if (st.errors.length < 12) st.errors.push('render:' + e.message); }
    const S2 = window.S;
    const st2 = q.flowStats();
    return {
      ep: S2.ep, cps: q.computeCps(), cap: q.epStorageCap(),
      chapter: String(S2.chapter || '1'), corruption: S2.corruption || 0,
      rp: S2.rp || 0, dm: S2.dm || 0, faith: S2.faith || 0, es: S2.es || 0,
      totalBuys: S2.totalBuys || 0, totalClicks: S2.totalClicks || 0,
      upgradeKinds: Object.keys(S2.upgrades || {}).length,
      upgrades: { ...(S2.upgrades || {}) },
      prestige: S2.prestige || 0, canPrestige: !!q.canPrestige(),
      prestigeEsGain: st.prestigeEsGain || 0, // v4.2.6 校准①：本章晋升 ES 奖励累计（esGain 瞬时值求和）
      storyEvents: q.getStorylineEvents().length, linePets: q.getStorylinePets().length,
      eventsSeen: S2.eventsSeen || 0,
      projectsDone: S2.projectsDone || 0,
      orchMode: q.effectiveModeId(S2), orchUnlocked: q.orchestrationUnlocked(S2),
      flowErrors: Object.values(st2).reduce((n, s) => n + (s.errors || 0), 0),
      flowCount: Object.keys(st2).length,
      flowTicks: st2['ep:main'] ? st2['ep:main'].ticks : 0,
      sysStats: q.systemStats(), sysErrors: q.systemErrors().length,
      panelErrs: q.panelErrors().length, panelCount: q.allPanels().length,
      renderTicks: (q.systemStats().render || {}).ticks || 0,
      scheduleUnlocked: q.scheduleUnlocked(S2), schedule: q.orchestrationSchedule(S2),
      scheduleCustomized: q.scheduleCustomized(S2),
      // v3.11.3：AI 助手（常驻班组，手动绑定占编）/ 动作台账逐日快照
      ai: { assistants: q.assistantCount(), bound: q.crewBoundTotal(), idle: q.crewIdle(),
        counts: q.actionCounts(), total: q.totalActionCount(q.actionCounts()),
        stalled: q.stalledActions().map(a => a.id),
        cost: q.assistantCost(),
        switches: q.AI_ACTION_SWITCH_KEYS.filter(k => !!S2.ai[k]) },
      resonance: (() => { const r = q.resonanceSummary(S2); return {
        unlocked: r.unlocked, enabled: r.enabled, layers: r.layers, focus: r.focus,
        maxLayers: r.maxLayers, rows: r.rows.map(x => ({ key: x.key, mult: x.mult })),
      }; })(),
      stats: { ...st, errors: st.errors.slice(), orchChecks: st.orchChecks.slice(),
        scheduleChecks: st.scheduleChecks.slice(),
        resonanceChecks: st.resonanceChecks.slice(), layerSamples: st.layerSamples.slice() },
    };
  };

  // 数值准确性定点校验：单 tick 产出入账量 = computeCps() × 10s
  window.__numericProbe = () => {
    const S = window.S, q = window.__qa;
    const cap = q.epStorageCap();
    S.ep = Math.min(S.ep, cap * 0.1);
    const earnedBefore = S.earnedFull || 0, cps = q.computeCps();
    window.__vt += 10000; window.__simT += 10000; window.__tick(window.__simT);
    return { earnedBefore, earnedAfter: S.earnedFull || 0, gross: (S.earnedFull || 0) - earnedBefore,
      cps, cap, dt: 10, orchMult: q.orchestrationMult('ep', S),
      resMult: q.resonanceMult('ep', S), resLayers: q.resonanceSummary(S).layers };
  };

  // ---- v4.2.6 分章节推演补充动作（全部产品真实入口）----
  // 章节条件不只是晋升：ch3/ch10 要 techCount>=8/38（v4.2.8：科技 + unlockedBuildings 数，
  // ch3 = 5 科技（deep_space 需 1000 DM 属载具内容不入门槛）+ 4 栋无门槛建筑，需 m3/cps 1e4）、
  // ch5/ch9 要 expeditionsDone>=8/20、ch16/ch17 要信仰、ch18 要 end_shrine/true_end。
  // 自动玩家每决策周期（6 tick）除基础购买外，按「当前可负担」推进这些维度；
  // 所有动作都走产品入口（buyTech / buyUnlockV21+buyV21Building 的 DOM 委托等效 /
  // 星图卡真实 DOM click），不直接写 S。
  window.__chapterTick = () => {
    const S = window.S, q = window.__qa, st = window.__stats;
    st.chapBuys = st.chapBuys || 0; st.chapTechs = st.chapTechs || [];
    // ⓪ 入口升级：晋升重置清空 upgrades（RUN_RESET_KEYS 语义：仓库是本局投入），
    //   anchorDone('rp') 随之回落 false → 效能建筑分区（v21）锁死，
    //   techCount 卡在 5 科技无法过 ch3 gate（v4.2.8 校准二轮探针实锤：bld=[无] 恒 130 天）。
    //   修复 = 经产品真实入口重购「矩阵存储库」rp_vault（RP 解锁唯一入口）。
    //   只买 rp_vault 不买 atrium：蒸馏满仓涓流每 5s 烧 50K EP（三轮探针实锤——
    //   低 CPS 阶段 ep 永远卡在 0~50K 区间，产出升级 60% 水位永不触发，CPS 恒 88 死锁）。
    //   不设 cap 水位门槛：rp_vault 15 万固定价在 ep 百万级时占比极小，但它是 techCount
    //   唯一增长路径（四轮探针实锤——60% 水位被 capCands 仓储循环压制，永不触发）。
    try {
      const epCap = q.epStorageCap();
      // v4.2.8 六轮探针抓坑：upgrades.rp_vault 是 undefined（晋升重置清空后未写过），
      //   `undefined < 1` === false —— 入口购买从未触发。必须 `|| 0` 归一后比较。
      if (((S.upgrades && S.upgrades.rp_vault) || 0) < 1 && S.ep > epCap * 0.5) {
        const u = q.UPGRADES.find(x => x.id === 'rp_vault');
        const c = u && q.bulkCostCalc(u, 1);
        if (u && Number.isFinite(c) && c <= S.ep * 0.9) {
          const r = q.sim.buyUpgrade(u);
          if (!(r === false || (r && r.ok === false))) st.chapBuys++;
        }
      }
      // RP 满仓且 EP 低于水位时经产品入口（快捷开关 [data-qs=atrium]）关蒸馏防 EP 抽血；
      // EP 回升过 80% 水位再开回来（研究升级还需要 RP 产出）。
      try {
        const qs = document.querySelector('#quick-switches [data-qs="atrium"]');
        if (qs) {
          const rpFull = (S.rp || 0) >= q.rpCap();
          const epLow = S.ep < epCap * 0.6, epOk = S.ep > epCap * 0.8;
          if (rpFull && epLow && S.atriumOn !== false) { qs.click(); st.atriumToggles = (st.atriumToggles || 0) + 1; }
          else if (rpFull && epOk && S.atriumOn === false) { qs.click(); st.atriumToggles = (st.atriumToggles || 0) + 1; }
        }
      } catch (e) { if (st.errors.length < 12) st.errors.push('atriumQs:' + e.message); }
    } catch (e) { if (st.errors.length < 12) st.errors.push('chapEntry:' + e.message); }
    // ① 钥匙科技：买得起就买（deep_space 180 RP + 5e6 EP + 1000 DM 是远征前置；
    //    offline1 顺带解锁离线；entropy_reduce/chaos_shield 补 techCount）
    // v4.2.8 校准根因修复：自动玩家从不切 tech tab → dirty.tech 恒 false → renderTech 从未跑
    //   → #tech-tree 恒空 → el.click() 永远找不到目标，科技一个都没买（ch2 推演全程 chapter=2，
    //   RP 攒到 301 也无法推进 gate 8）。改走产品购买函数 q.buyTech（与 v3110 买 auto_tech 同一入口，
    //   main.js QA 钩子原样导出玩家购买函数），并在前置检查里自行判定可负担。
    try {
      for (const t of q.getTechs()) {
        if (S.tech[t.id]) continue;
        if (t.id === 'auto_tech') continue; // AI 补编路径已处理
        const c = t.cost || {};
        const rp = Math.ceil((c.rp || 0) * 1), ep = c.ep || 0, dm = c.dm || 0, es = c.es || 0;
        if (S.rp >= rp && S.ep >= ep && (S.dm || 0) >= dm && (S.es || 0) >= es) {
          const before = Object.keys(S.tech).length;
          q.buyTech(t, null); // 产品入口内部自行判定前置与可负担，未满足时无副作用
          if (Object.keys(S.tech).length > before) {
            st.chapBuys++;
            if (!st.chapTechs.includes(t.id)) st.chapTechs.push(t.id);
          }
        }
      }
    } catch (e) { if (st.errors.length < 12) st.errors.push('chapTech:' + e.message); }
    // ② 效能建筑解锁（RP 买断解锁 + EP 首级）：techCount 由 unlockedBuildings 累计；
    //    优先解锁便宜的无钥匙建筑（warmup_node 6e4 EP 起），里程碑到了继续往下解锁
    try {
      const list = document.getElementById('v21-building-list');
      if (list && !list.dataset.v21Delegated) {
        // 渲染器未跑（tab 未打开）时兜底：直接调用产品渲染入口再走委托
        q.sim.render();
      }
      for (const el of list.querySelectorAll('[data-v21]')) {
        const b = (q.BALANCE && q.BALANCE.buildingsV21 || []).find(x => x.id === el.dataset.v21);
        if (!b) continue;
        const locked = !(S.unlockedBuildings && S.unlockedBuildings[b.id]);
        const lv = (S.buildings && S.buildings[b.id]) || 0;
        // 只解锁不升级（升级走自动玩家基础购买评分，不在此扩散预算）
        if (locked && !el.classList.contains('locked')) { el.click(); st.chapBuys++; }
        else if (!locked && lv === 0) { el.click(); st.chapBuys++; }
      }
    } catch (e) { if (st.errors.length < 12) st.errors.push('chapBld:' + e.message); }
    // ③ 星图远征：切到星图 tab 点最便宜可负担目的地（真实 DOM click，与玩家路径一致）；
    //    探索返回由产品 tick 结算（expeditionsDone++ 在 expedition.js 内）
    // v4.3.1 ch4 校准：星图三前置 = PT 锚点 ∧ RP 锚点 ∧ deep_space 科技（disclosure.starChartUnlocked）。
    //   ch1~ch3 晋升链只攒 ES/RP，PT 锚点未解 → 星图 tab 锁定 → expeditionsDone 恒 0 → ch5 条件永不可达。
    //   真玩家在 ch4（cps ~1e4）会买「饵料仓库」解 PT 锚点——补上这个产品真实入口（30 万 EP，占比极小）。
    //   deep_space 还需 1000 DM；ch4 种子 dm=0 → 经产品真实入口封裂拿 DM（裂隙门槛 8 线程，v4.3.0 后首裂 10 分钟）。
    try {
      const wantExps = [4, 8].includes(parseInt(String(S.chapter), 10) + 1) || (S.expeditionsDone || 0) < 24;
      if (wantExps && !(S.resDiscovered && S.resDiscovered.pt) && ((S.upgrades && S.upgrades.pt_vault) || 0) < 1) {
        const u = q.UPGRADES.find(x => x.id === 'pt_vault');
        const c = u && q.bulkCostCalc(u, 1);
        if (u && Number.isFinite(c) && c <= S.ep) { q.sim.buyUpgrade(u); st.chapBuys++; }
      }
      // v4.3.1 收口说明：ch4 深空探测需 1000 DM，而 carry 种子 dm=0；裂隙封印成本=EP上限×30~50%，
      //   低 CPS 阶段封印成功率极低（实测 12 天 2501 次点击仅 +76 DM）——需在独立批次重标定
      //   ch4 的 DM 来源（种子带 DM / 调整 deep_space 成本 / 裂隙早期奖励），本批不塞无效点击。
      if (wantExps && (S.expeditions || []).length < 2 && (S.starCps || 0) >= 0) {
        q.sim.switchTab('expedition');
        q.sim.render();
        const panel = document.getElementById('expedition-panel');
        if (panel) {
          for (const el of panel.querySelectorAll('[data-galaxy]')) {
            if (el.classList.contains('cant')) continue;
            el.click(); st.chapBuys++;
            break; // 每周期只派一路（远征队列上限由产品控制）
          }
        }
        q.sim.switchTab('shop');
      }
    } catch (e) { if (st.errors.length < 12) st.errors.push('chapExp:' + e.message); }
    // ④ 永恒矩阵：ES 闲着就是浪费——链式推演的 carry ES 必须被真实消费才能复利到 CPS
    //    （ch2/ch3 校准实测：es=93/262 全程闲置；v4.2.8 后 techCount>=16 需 CPS>=1e6
    //    过 m5 解锁建筑，永恒「eff」等级是爬坡主力）。优先买最便宜的永久增益项，跳过皮肤（一次性，不入战力）。
    try {
      if ((S.es || 0) > 0 && q.ETERNALS && q.buyEternal) {
        const eternal = S.eternal = S.eternal || {}; // 手造种子缺键兜底（load 语义等价）
        // 留 10% ES 底仓：下一章起点仍带跨局资产；每周期只买 1 级（决策节拍 6 tick，足够频）
        const keep = S.es * 0.1;
        let pick = null, best = Infinity;
        for (const e of q.ETERNALS) {
          if (e.id.startsWith('skin_')) continue;
          if (e.cap && (eternal[e.id] || 0) >= e.cap) continue;
          const c = q.esCost(e);
          if (c <= S.es - keep && c < best) { best = c; pick = e; }
        }
        if (pick) { q.buyEternal(pick); st.chapBuys++; st.eternalBuys = (st.eternalBuys || 0) + 1; }
      }
    } catch (e) { if (st.errors.length < 12) st.errors.push('chapEternal:' + e.message); }
  };
  return window.__playerCfg;
}

/** Node 侧默认配置：v3110 30 天推演（与抽取前行为完全一致）。 */
export const v3110PlayerCfg = { prestigeGapTicks: 2880, label: 'v3110-30day' };
