// v3.11.0 真实浏览器 30 天 mock 推演 + 可玩性 / 数值准确性 / 全功能 UI 准确性验收
//
// v3.11.0 新增（相对 v3.10.0 基线）：
//   - 存档种子解锁 ai_core，自动玩家经产品真实入口（setAiSwitch / buyAssistant）
//     常开五项自动化动作并按需补助手，长期推演首次覆盖 AI 自动化路径（此前零覆盖）；
//   - 逐日快照记录助手余额 / 动作台账 / 停摆状态 / 补给计时 / 定价；
//   - 验收「五项动作都消耗助手」「扣费与台账守恒」「补给持续发放」「停摆提示与读侧同源」；
//   - AI 面板 UI 准确性：分组横幅、开关集合、台账 / 停摆提示、孤字换行（getClientRects）、
//     按钮点击目标 ≥24×24、无 undefined/NaN、一键全关真实 DOM 点击覆盖全部 5 个开关。
//
// v3.10.2 反馈清单新增的 UI 验收（feedbackUI）：
//   - 顶栏「产出/s → 消耗/s」位于最左；警告标志显隐与净流读侧一致；
//   - 受控夹具压低产出 / 抬高消耗，实证 ⚠ 出现、产出与消耗两项悬浮均含预期 EP 耗尽时间、
//     aria-label 同步；夹具用完整快照 + finally 恢复，不污染推演终态；
//   - FP 资源门控：未解锁时研究面板 DOM 无 FP 卡片，解锁后三项齐全；
//   - 顶栏 RP 余额未超上限（重置钳制）、任务面板不存在待领取的负面任务。
//
// 与 v3.9.0 版相比的增强（v3.10.0 基线）：
//   - 新玩法「相位共鸣」：自动玩家在解锁后经产品真实入口开启共鸣、轮换焦点，
//     长期推演中核对叠层 / 换相位减半 / 上限 20 / 四管线增益与代价 / CPS 同口径；
//   - 抽象层：状态生命周期单一真源、成就注册表、面板键 / deps 清单在真实浏览器里
//     核对旧档兼容（无 resonance 字段）、成就逐页渲染、27 面板 / 43 帧系统零异常；
//   - 内容扩充：主表事件 62 + 线专属 12、研究 55、政策 11 组 33 项、编排 4 条策略、百科 24 章；
//   - UI 侧新增：共鸣开关 / 四焦点按钮的 aria-label / aria-pressed / ≥24×24 点击目标、
//     窄卡孤字换行（getClientRects）、真实 DOM 点击后读侧同步；排班表升级为 4×6 槽位。
//
// 驱动方式：Date.now() 与 tick(now) 同时按 10s 步进（tick 内部 dt 上限 10s）；
//   启动时清除页面自身 setInterval；自动玩家只调用产品真实入口（doClick / buyUpgrade / claimProject /
//   setOrchestrationMode / setOrchestrationPhaseMode / toggleResonanceEnabled / setResonanceFocus），
//   UI 侧另有真实 DOM 点击，不直接写 S 伪造进度。
//
// 用法：
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v3110-30day-browser.mjs
//   DAYS=1 REPORT=/tmp/gray.json node tests/v3110-30day-browser.mjs        # 灰度
//   LINE=line_faith DAYS=3 REPORT=/tmp/faith.json node ...
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'node:fs';

// v3.10.1：报告版本直接取 package.json，不再随版本 bump 手改硬编码。
// 注意：本脚本后面有 `const URL = 'file://...'`，会遮蔽全局 URL 构造器（TDZ），此处只能用 cwd 相对路径。
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const DAYS = Number(process.env.DAYS || 30);
const LINE = process.env.LINE || 'line_order';
const REPORT = process.env.REPORT || 'tests/v3110-30day-report.json';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const TICKS_PER_DAY = 8640; // 86400s / 10s
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };
const fx = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d });

const mkSave = (storyline) => JSON.stringify({
  _version: 6, chapter: '1', storyline, ep: 0, rp: 0, es: 0, dm: 0, pt: 0,
  // v3.11.2：解锁 AI 管理核心，让 30 天推演真正跑 AI 自动化；助手是常驻班组（不消耗），
  // 余额刻意从 0 开始（不伪造进度），靠 buyAssistant() 真实扩编，靠 setAiSwitch / setCrew 绑定占编到各动作。
  upgrades: {}, buildings: {}, tech: { ai_core: true }, cultists: [], faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(),
});

async function boot(browser, storyline) {
  const page = await browser.newPage();
  page.setDefaultTimeout(300000);
  await page.setViewport({ width: 1600, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await page.evaluateOnNewDocument((save) => {
    localStorage.setItem('abyss_idle_v2', save);
    window.__rawSaveHasResonance = save.includes('"resonance"');
    window.__vt = 0;
    const origNow = Date.now.bind(Date);
    Date.now = () => origNow() + window.__vt;
    window.__timerIds = [];
    const origSI = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { const id = origSI(fn, ms, ...a); window.__timerIds.push(id); return id; };
  }, mkSave(storyline));
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);
  await page.evaluate(() => {
    (window.__timerIds || []).forEach(id => clearInterval(id));
    window.__simT = performance.now() + 1000;
    window.__stats = { buys: 0, clicks: 0, buyFails: 0, capStalls: 0, errors: [],
      orchSwitches: 0, orchChecks: [], claims: 0, scheduleEdits: 0, scheduleChecks: [],
      resonanceEnables: 0, focusSwitches: 0, resonanceChecks: [], layerSamples: [],
      phaseDecays: 0,
      // v3.11.0：AI 自动化长期推演统计（全部经产品真实入口产生）
      aiBuys: 0, aiBuyFails: 0, aiSwitchToggles: 0, aiStallTicks: 0,
      aiBuildActivations: 0, aiTechBought: 0, aiLedgerSamples: [] };

    const qa = window.__qa;
    window.__prodCands = qa.UPGRADES.filter(u => u.cps > 0 && /^基础产出\+/.test(u.desc || ''));
    window.__capCands = qa.UPGRADES.filter(u => ['reserve_bin', 'storage'].includes(u.id));
    window.__tickCount = 0;
    window.__lastPrestigeTick = -9999;
    window.__orchSeq = ['output', 'research', 'abyss', 'balanced'];
    window.__orchIdx = 0;
    window.__scheduleEdits = 0;
    window.__resFoci = ['ep', 'rp', 'pt', 'dm'];
    window.__resFocusIdx = 0;
    window.__lastResLayers = 0;
    window.__lastResPhase = -1;

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
            if (q.canPrestige() && window.__tickCount - window.__lastPrestigeTick >= 2880) {
              sim.doPrestige(null);
              window.__lastPrestigeTick = window.__tickCount;
              st.prestiges = (st.prestiges || 0) + 1;
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
            // 让 30 天长期推演真实覆盖到进阶自动化，而不是只跑基础三项。
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
        storyEvents: q.getStorylineEvents().length, linePets: q.getStorylinePets().length,
        eventsSeen: S2.eventsSeen || 0,
        projectsDone: S2.projectsDone || 0,
        orchMode: q.effectiveModeId(S2), orchUnlocked: q.orchestrationUnlocked(S2),
        flowErrors: Object.values(st2).reduce((n, s) => n + (s.errors || 0), 0),
        flowCount: Object.keys(st2).length, // v3.11.2：删除 assistant:supply 后回到 8 条资源流，日志不再硬编码
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
  });
  return { page, errs };
}

async function uiCheck(page) {
  return page.evaluate(() => {
    const S = window.S, q = window.__qa;
    // UI 定点验证：状态由测试钩子设置后显式置脏，模拟真实帧的刷新链路
    window.__gameDirty.orchestration = true;
    q.sim.render();
    const tabs = [...document.querySelectorAll('.tabs button[id^="btn-"]')];
    const res = [];
    for (const b of tabs) {
      const id = b.id;
      try {
        b.click();
        q.sim.render();
        const body = document.body.innerText || '';
        const visible = [...document.querySelectorAll('.panel, [id$="-panel"]')]
          .filter(p => p.offsetParent !== null).length;
        res.push({ id, visible, hasBadText: /undefined|NaN|Infinity/.test(body), textLen: body.length });
      } catch (e) { res.push({ id, error: String(e).slice(0, 160) }); }
    }
    const epTxt = document.getElementById('ep')?.innerText || document.getElementById('ep-val')?.innerText || '';
    let priceMatch = null;
    const card = document.querySelector('[data-buy]');
    if (card) {
      const u = q.UPGRADES.find(x => x.id === card.dataset.buy);
      if (u) priceMatch = { id: u.id, domText: (card.innerText || '').slice(0, 120), cost: q.bulkCostCalc(u, 1) };
    }
    const wikiBtn = document.getElementById('btn-wiki');
    let wikiOk = false, wikiSections = 0;
    if (wikiBtn) {
      wikiBtn.click(); q.sim.render();
      wikiOk = !/undefined|NaN|Infinity/.test(document.body.innerText || '');
      wikiSections = document.querySelectorAll('#wiki-body h4, #wiki-content h4, .wiki-sec').length;
    }
    // 新玩法卡：解锁后应可见，且四条倍率文本与读侧一致
    const orchCard = document.getElementById('orchestration-card');
    const orchPanel = document.getElementById('orchestration-panel');
    const orchText = (orchPanel && orchPanel.innerText) || '';
    const summary = q.orchestrationSummary(S);
    const orchTextOk = summary.every(x => orchText.includes(x.label) && orchText.includes('×' + x.mult.toFixed(2)));
    // v3.10.1：新增「编排倍率」口径标签必须单行呈现，窄卡不得出现孤字换行（与共鸣区同范式）
    const orchLabel = [...(orchPanel ? orchPanel.querySelectorAll('div') : [])]
      .find(d => d.children.length === 0 && (d.textContent || '').includes('编排倍率 ·'));
    let orchLabelOrphans = -1;
    if (orchLabel) {
      const range = document.createRange();
      range.selectNodeContents(orchLabel);
      const rects = [...range.getClientRects()];
      orchLabelOrphans = rects.length > 1 && rects[rects.length - 1].width < 28 ? 1 : 0;
    }
    // 成就面板为「已解锁分页」制，新增 3 条在列表末尾（末页）。
    // 只取第一页会漏判，故逐页点击「下一页」收集全量文本再与读侧比对。
    const achPanel = document.getElementById('achievement-panel');
    let achText = '', achPages = 0;
    if (achPanel) {
      for (let guard = 0; guard < 30; guard++) {
        achText += '\n' + (achPanel.innerText || '');
        achPages++;
        const next = achPanel.querySelector('[data-ach-page="next"]');
        if (!next || next.disabled) break;
        next.click(); // 容器级事件委托，同步重渲染本页
      }
    }
    // v3.9.0：控制流层台账 + 潮汐预案排班表 DOM 准确性 + 真实点击链路
    const schedUI = (() => {
      const card = document.getElementById('orchestration-panel');
      if (!card) return { ok: false, reason: 'orchestration-panel missing' };
      q.setOrchestrationAutoTide(S, true);
      window.__gameDirty.orchestration = true;
      q.sim.render();
      const slots = [...card.querySelectorAll('[data-orch-slot]')];
      const labelsOk = slots.length === 16 && slots.every(b => !!b.getAttribute('aria-label'));
      const phaseMarks = ((card.innerText || '').match(/▶/g) || []).length;
      const cur = ((Number(S.tidePhase) || 0) % 4 + 4) % 4;
      const before = q.effectiveModeId(S);
      // 必须挑一个与当前相位不同的策略，才能证明「点击真的改变了生效策略」
      const curMode = q.orchestrationSchedule(S)[cur];
      const targetMode = curMode === 'research' ? 'output' : 'research';
      const wantEp = q.ORCHESTRATION_MODES.find(m => m.id === targetMode).effects.ep;
      let clickOk = false, after = before, resetOk = false;
      const target = card.querySelector(`[data-orch-slot="${cur}"][data-orch-slot-mode="${targetMode}"]`);
      if (target) {
        target.click(); // 容器级事件委托：产品真实入口
        q.sim.render();
        after = q.effectiveModeId(S);
        // v3.10.0：共鸣开启时编排倍率 = 策略基准 × 共鸣乘区，断言需带走同一乘区
        clickOk = before !== after && after === targetMode
          && Math.abs(q.orchestrationMult('ep', S) - wantEp * q.resonanceMult('ep', S)) < 1e-9;
        const resetBtn = card.querySelector('[data-orch-schedule-reset]');
        if (resetBtn) {
          resetBtn.click();
          q.sim.render();
          resetOk = !q.scheduleCustomized(S);
        }
      }
      return { unlocked: q.scheduleUnlocked(S), slots: slots.length, labelsOk, phaseMarks,
        clickOk, before, after, resetOk, modes: q.ORCHESTRATION_MODES.length,
        panelCount: q.allPanels().length, panelErrs: q.panelErrors().length,
        sysErrs: q.systemErrors().length, sysCount: Object.keys(q.systemStats()).length };
    })();

    // v3.10.0 相位共鸣 UI：按钮可访问性 / 点击目标 / 孤字换行 / 真实点击链路 / 倍率文本
    const resonanceUI = (() => {
      const card = document.getElementById('orchestration-panel');
      if (!card) return { ok: false, reason: 'orchestration-panel missing' };
      const sm = q.resonanceSummary(S);
      if (!sm.unlocked) return { ok: false, unlocked: false, reason: 'resonance locked' };
      if (!sm.enabled) q.toggleResonanceEnabled(S);
      window.__gameDirty.orchestration = true;
      q.sim.render();
      const toggle = card.querySelector('[data-res-toggle]');
      const focusBtns = [...card.querySelectorAll('[data-res-focus]')];
      const allBtns = [toggle, ...focusBtns].filter(Boolean);
      const labelsOk = allBtns.length === 5 && allBtns.every(b => !!b.getAttribute('aria-label'));
      const pressedOk = allBtns.length === 5 && allBtns.every(b => b.getAttribute('aria-pressed') !== null);
      const sizes = allBtns.map(b => { const r = b.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });
      const sizeOk = sizes.length === 5 && sizes.every(s => s.w >= 24 && s.h >= 24);
      // 窄卡孤字换行：纯文本节点被拆行且末行宽度 < 28px（约 2 个汉字）即判孤字
      let orphanLines = 0;
      for (const el of card.querySelectorAll('div, span')) {
        if (el.children.length > 0 || (el.textContent || '').trim().length < 8) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        if (rects.length > 1 && rects[rects.length - 1].width < 28) orphanLines++;
      }
      let clickOk = false, focusOk = false;
      const beforeEnabled = q.resonanceState(S).enabled;
      if (toggle) {
        toggle.click(); q.sim.render();
        const mid = q.resonanceState(S).enabled;
        const t2 = card.querySelector('[data-res-toggle]');
        if (t2) { t2.click(); q.sim.render(); }
        const after = q.resonanceState(S).enabled;
        clickOk = beforeEnabled !== mid && after === beforeEnabled;
      }
      const want = sm.focus === 'ep' ? 'rp' : 'ep';
      const fb = card.querySelector(`[data-res-focus="${want}"]`);
      if (fb) {
        fb.click(); q.sim.render();
        focusOk = q.resonanceState(S).focus === want;
        q.setResonanceFocus(S, sm.focus);
        window.__gameDirty.orchestration = true; q.sim.render();
      }
      const sm2 = q.resonanceSummary(S);
      const text = card.innerText || '';
      const textOk = sm2.rows.every(r => text.includes('×' + r.mult.toFixed(2)))
        && text.includes(`${sm2.layers}/${sm2.maxLayers}`);
      return { ok: true, unlocked: true, enabled: sm2.enabled, layers: sm2.layers,
        focus: sm2.focus, buttons: allBtns.length, labelsOk, pressedOk, sizeOk, sizes,
        orphanLines, clickOk, focusOk, textOk, rows: sm2.rows.map(r => ({ key: r.key, mult: r.mult })) };
    })();

    // v3.10.2 反馈清单 UI：顶栏顺序 / 负净流告警与耗尽 ETA / FP 研究门控 / 余额钳制 / 负面任务
    const feedbackUI = (() => {
      const bar = document.querySelector('.topbar');
      const stats = bar ? [...bar.children].filter(el => el.classList.contains('stat')) : [];
      const firstTwo = [stats[0]?.querySelector('span')?.id, stats[1]?.querySelector('span')?.id];
      const orderOk = firstTwo[0] === 'h-cps' && firstTwo[1] === 'h-salary';
      const warn = document.getElementById('h-drain-warn');
      // v3.12.7 ④：EP 耗尽 ETA 已从「消耗/s」气泡移到感叹号自身的气泡，读侧一并纳入
      const tipText = () => [stats[0], stats[1], warn].map(el => (el && el.dataset ? el.dataset.tip : '') || '').join('|');
      const cps0 = q.computeCps(), drain0 = q.totalDrainPerSec();
      const restWarnOk = !!warn && ((warn.style.display !== 'none') === (drain0 > cps0));
      const restTipOk = (drain0 > cps0) === tipText().includes('EP 预计');

      // 受控夹具：压低产出、抬高消耗，实证「产出 < 消耗」时警告标志与悬浮 ETA 真的出现。
      // 完整快照 + finally 恢复，不污染 30 天推演终态。
      const snapshot = JSON.stringify(S);
      let forced = { ok: false, cps: 0, drain: 0, warnShown: false, etaOk: false, ariaOk: false, eta: '' };
      try {
        S.buffMult = 0.001; S.buffUntil = Date.now() + 60000;
        S.ep = 1e12;
        S.ptAutoHatch = true; S.ptDistillOn = true; S.ptHatchLv = 20;
        S.converterOn = { vehicles: false, atrium: false, hatch: true };
        window.__gameDirty.top = true;
        q.sim.render();
        const cps1 = q.computeCps(), drain1 = q.totalDrainPerSec();
        const eta = q.fmtDepletionEta(q.epDepletionSec(S.ep, cps1, drain1));
        const tip = tipText();
        forced = {
          ok: drain1 > cps1, cps: cps1, drain: drain1, eta,
          warnShown: !!warn && warn.style.display !== 'none',
          // v3.12.3 反馈⑧：ETA 不再写进产出/消耗气泡，改由消耗侧 ❗ 自己的 data-tip 承载。
          //   v3.12.7 ④：tipText() 已纳入 warn 自身气泡，此处「生产/消耗两个 stat 气泡不含 ETA」
          //   的判定必须排除 warn，否则自相矛盾恒 false。
          etaOk: (warn?.dataset?.tip || '').includes('EP 预计') && (warn?.dataset?.tip || '').includes(eta)
            && (warn?.dataset?.tip || '').includes('后耗尽')
            && ![stats[0], stats[1]].map(el => (el && el.dataset ? el.dataset.tip : '') || '').join('|').includes('EP 预计'),
          ariaOk: !!warn && (warn.getAttribute('aria-label') || '').includes(eta),
        };
      } finally {
        const saved = JSON.parse(snapshot);
        for (const k of Object.keys(S)) delete S[k];
        Object.assign(S, saved);
        window.__gameDirty.top = true;
        q.sim.render();
      }

      // FP 研究门控：资源未解锁时 DOM 不得出现 FP 卡片，解锁后三项齐全。
      // v3.11.0：FP 项归属 RP_GROUPS 的「资源与消耗」组，该组另有 rpGroupLv('prod') >= 4
      //   的前置门槛（30 天自动玩家不买研究项 → 整组不渲染）。旧断言把「资源锚点已达成」
      //   直接等价于「FP 卡片必须可见」，会在长跑后期误报。这里先按分组可见性判定，
      //   再用受控夹具显式解锁分组，实证资源门控本身双向正确。
      const list = document.getElementById('research-upgrade-list');
      const domIds = [...(list?.querySelectorAll('[data-research]') || [])].map(el => el.dataset.research);
      const fpIds = q.BALANCE.researchUpgs.filter(u => u.fx && u.fx.key === 'faith').map(u => u.id);
      const fpUnlocked = q.anchorDone('faith', S);
      const resGroupShown = !!list?.querySelector('[data-rp-fold="res"]');
      const fpDomCount = fpIds.filter(id => domIds.includes(id)).length;
      const fpGateOk = fpDomCount === (resGroupShown && fpUnlocked ? fpIds.length : 0);
      const fpForced = (() => {
        const snap = JSON.stringify(S);
        const rerender = () => { window.__gameDirty.rp = true; q.sim.render(); };
        const readFp = () => {
          const d = [...(list?.querySelectorAll('[data-research]') || [])].map(el => el.dataset.research);
          return { shown: !!list?.querySelector('[data-rp-fold="res"]'),
            count: fpIds.filter(id => d.includes(id)).length, domCount: d.length };
        };
        try {
          // 先解除分组前置门槛，让判定只落在资源门控上
          S.rpTheories = S.rpTheories || {};
          S.rpTheories[q.RP_GROUPS[0].ids[0]] = 4; // 产出强化累计 4 级 → 解锁「资源与消耗」组
          rerender();
          const natural = { ...readFp(), expected: fpUnlocked ? fpIds.length : 0 };
          // 资源锚点强制开：三项 FP 研究卡必须全部出现
          S.religion = { unlocked: true };
          rerender();
          const on = { ...readFp(), expected: fpIds.length };
          // 资源锚点强制关：三项必须全部隐藏（同一面板，验证不是缓存残留）
          S.religion = { unlocked: false }; S.faith = 0;
          if (S.upgrades) S.upgrades.shrine = 0;
          rerender();
          const off = { ...readFp(), expected: 0 };
          const ok = natural.shown && natural.count === natural.expected
            && on.shown && on.count === on.expected
            && off.shown && off.count === off.expected;
          return { ok, natural, on, off };
        } catch (e) {
          return { ok: false, error: String(e).slice(0, 160) };
        } finally {
          const saved = JSON.parse(snap);
          for (const k of Object.keys(S)) delete S[k];
          Object.assign(S, saved);
          window.__gameDirty.rp = true;
          q.sim.render();
        }
      })();

      // v3.12.9：星图解锁排在宠物 / PT 之后。完整快照 + finally 恢复，双向验证
      //   tab 锁定态、顶栏星图 CPS、程序化切换，三者都读 starChartUnlocked(S)。
      const starGate = (() => {
        const btn = document.getElementById('btn-expedition');
        const st = document.getElementById('starcps-stat');
        const saved = JSON.stringify(S);
        const read = () => ({
          gate: q.starChartUnlocked(S),
          locked: !!btn && btn.dataset.locked === '1',
          starCpsShown: st ? st.style.display !== 'none' : false,
          paneOn: !!document.getElementById('tab-expedition')?.classList.contains('on'),
        });
        const render = () => { window.__gameDirty.top = true; window.__gameDirty.rp = true; q.sim.render(); };
        try {
          S.upgrades = { rp_vault: 1 };
          S.tech = { deep_space: true };
          S.pt = 0; S.expeditionsDone = 3; S.expeditions = []; S.starCps = 12;
          render();
          const before = read();
          q.sim.switchTab('expedition'); render();
          const beforePane = read().paneOn;
          S.upgrades.pt_vault = 1;
          render();
          const after = read();
          q.sim.switchTab('expedition'); render();
          const afterPane = read().paneOn;
          return { ok: true, before, beforePane, after, afterPane };
        } catch (e) { return { ok: false, reason: String(e).slice(0, 120) }; }
        finally {
          const back = JSON.parse(saved);
          for (const k of Object.keys(S)) delete S[k];
          Object.assign(S, back);
          q.sim.switchTab('shop');
          render();
        }
      })();

      const rpTxt = document.getElementById('h-rp')?.textContent || '';
      const capOk = (S.rp || 0) <= q.rpCap() && !/NaN|undefined|Infinity/.test(rpTxt);
      const pendingDebuff = (S.projects || [])
        .filter(p => p.status === 'pending' && p.reward && p.reward.kind === 'debuff').length;
      return { orderOk, firstTwo, restWarnOk, restTipOk, forced,
        fpIds, fpUnlocked, fpGateOk, fpDomCount, resGroupShown, fpForced,
        domCount: domIds.length, capOk, rpTxt,
        pendingDebuff, runtimeKeys: q.RUN_RUNTIME_KEYS.length, starGate };
    })();

    // v3.11.0：AI 面板 UI 准确性。夹具用完整快照 + finally 恢复，不污染推演终态。
    const aiUI = (() => {
      const card = document.getElementById('ai-card');
      const panel = document.getElementById('ai-panel');
      if (!panel) return { ok: false, reason: 'ai-panel missing' };
      const savedSwitches = Object.fromEntries(q.AI_ACTION_SWITCH_KEYS.map(k => [k, !!S.ai[k]]));
      const savedAutoTech = !!(S.tech && S.tech.auto_tech);
      const savedAutoBuild = !!(S.ai && S.ai.autoBuildUnlocked);
      const savedCardDisplay = card ? card.style.display : null;
      const savedCrew = Object.fromEntries(q.AI_ACTION_IDS.map(id => [id, q.crewOf(id)]));
      try {
        if (card) card.style.display = '';
        // 让进阶组（自动研究 + 自动购建）在夹具中可见，验证两个分组横幅与 5 张开关的接线。
        // 两者都是产品解锁后才渲染的开关，未激活时不显示属于设计，夹具需显式备齐前置。
        S.tech.auto_tech = true;
        S.ai.autoBuildUnlocked = true;
        window.__gameDirty.ai = true; q.sim.render();
        const text = panel.innerText || '';
        // v3.12.3：分组横幅与 ON/OFF 开关已删除；改为断言「动作卡 + 占编步进器」
        const groups = [...panel.querySelectorAll('[data-ai-group]')].map(g => g.dataset.aiGroup);
        const switches = [...panel.querySelectorAll('[data-ai-switch]')].map(s => s.dataset.aiSwitch);
        const cards = [...panel.querySelectorAll('[data-ai-action]')].map(c => c.dataset.aiAction);
        const steppers = [...panel.querySelectorAll('[data-ai-crew-inc]')].map(b => b.dataset.aiCrewInc);
        const ledger = panel.querySelector('[data-ai-ledger]');
        // v3.12.5 反馈④：台账不再独占一行，改为助手行的 data-tip
        // v3.12.7 ⑤：助手行（4/N + 购买）已并入面板标题 <h3>，查询范围放宽到 #ai-card
        const scope = card || panel;
        const headEl = scope.querySelector('[data-ai-head]');
        const headTip = (headEl && headEl.dataset.tip) || '';
        const stall = panel.querySelector('[data-ai-stall]');
        const countEl = scope.querySelector('[data-ai-assistant-count]');
        // 孤字换行：inline 元素换行会返回多个矩形，末矩形过窄即孤字（v3.9.0 同范式）
        let orphans = 0;
        const orphanDetails = [];
        for (const el of [...panel.querySelectorAll('.ai-group-title, .ai-desc, .ai-ledger')]) {
          const range = document.createRange(); range.selectNodeContents(el);
          const rects = [...range.getClientRects()];
          if (rects.length > 1 && rects[rects.length - 1].width < 28) {
            orphans++;
            orphanDetails.push({ cls: el.className, text: (el.innerText || '').slice(0, 90),
              rects: rects.length, lastW: +rects[rects.length - 1].width.toFixed(1) });
          }
        }
        const btns = [...scope.querySelectorAll('button')];
        const sizes = btns.map(b => { const r = b.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; });
        const sizeOk = sizes.length > 0 && sizes.every(s => s.w >= 24 && s.h >= 24);
        const stalled = q.stalledActions().length > 0;
        const anyOn = q.AI_ACTION_SWITCH_KEYS.some(k => !!S.ai[k]);
        // v3.11.3：绑定模型下「未绑定提示」与「存在开启但未绑定占编的动作」同源（不再等价于余额 0）
        const stallConsistent = !!stall === (q.stalledActions().length > 0);
        // v3.12.7 ⑩：面板上的「一键全关」按钮已移除（占编 − 到 0 即关闭）。
        //   现在断言两件事：① 按钮确实不在 DOM 里；② allOffActions() 作为注册表派生实现仍然
        //   覆盖全部 5 个开关（含 autoTech），供自动化 / QA 使用。
        for (const id of q.AI_ACTION_IDS) q.setCrew(id, 1);
        window.__gameDirty.ai = true; q.sim.render();
        const offBtn = panel.querySelector('[data-ai-alloff]');
        const noAllOffBtn = !offBtn;
        q.sim.allOffActions();
        const allOffOk = !noAllOffBtn ? false : q.ALL_OFF_SWITCH_KEYS.every(k => !S.ai[k]);
        return { ok: true, groups, switches, cards, steppers, hasLedger: !!ledger, hasStall: !!stall,
          stalled, stallConsistent, countText: countEl ? countEl.textContent : '',
          orphans, orphanDetails, sizeOk, sizes: sizes.slice(0, 10), buttonCount: btns.length,
          allOffOk, noAllOffBtn, badText: /undefined|NaN|Infinity/.test(text),
          crewHint: /常驻班组|每动作每周期执行次数/.test(text),
          headTip,
          ledgerText: ledger ? (ledger.innerText || '').slice(0, 160) : '',
          ids: [...q.AI_ACTION_IDS], crew: [...q.AI_CREW_REQUIRED_IDS] };
      } finally {
        for (const k of q.AI_ACTION_SWITCH_KEYS) q.sim.setAiSwitch(k, savedSwitches[k]);
        for (const id of q.AI_ACTION_IDS) q.setCrew(id, savedCrew[id] || 0);
        S.tech.auto_tech = savedAutoTech;
        S.ai.autoBuildUnlocked = savedAutoBuild;
        if (card && savedCardDisplay !== null) card.style.display = savedCardDisplay;
        window.__gameDirty.ai = true; q.sim.render();
      }
    })();

    return {
      tabs: res, epTxt, priceMatch, wikiOk, wikiSections, schedUI, resonanceUI, feedbackUI, aiUI,
      researchGroups: q.RP_GROUPS.map(g => ({ key: g.key, n: g.ids.length })),
      researchTotal: q.BALANCE.researchUpgs.length,
      policyGroups: q.POLICY_GROUPS.length,
      policyTotal: q.POLICY_GROUPS.reduce((n, g) => n + g.policies.length, 0),
      achPanelTextLen: achText.length,
      storyEvents: q.getStorylineEvents().length,
      linePets: q.getStorylinePets().length,
      orch: { unlocked: q.orchestrationUnlocked(S), visible: !!(orchCard && orchCard.style.display !== 'none'),
        textOk: orchTextOk, text: orchText.slice(0, 220), modes: q.ORCHESTRATION_MODES.length,
        labelOk: orchLabelOrphans === 0, labelOrphans: orchLabelOrphans },
      achPages,
      achNew: ['另排一班', '随潮而动', '排班表的人'].filter(n => achText.includes(n)),
      achNewUnlocked: ['orch_switch', 'orch_tide', 'chapter25']
        .filter(id => !!(S.achievements && S.achievements[id])),
      achV390Unlocked: ['schedule_edit', 'projects200', 'event200', 'miles11']
        .filter(id => !!(S.achievements && S.achievements[id])),
      achV3100Unlocked: ['resonance_on', 'resonance_10', 'resonance_20',
        'chapter35', 'policy11', 'research55']
        .filter(id => !!(S.achievements && S.achievements[id])),
      achV3100Names: ['听见相位', '潮汐级联'].filter(n => achText.includes(n)),
      achTotal: q.ACHIEVEMENTS.length,
      flow: { stats: q.flowStats(), ledger: q.flowLedger(), errors: q.flowErrors() },
    };
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'],
});
const report = { version: VERSION, days: DAYS, line: LINE, startedAt: new Date().toISOString(), daily: [], checks: {} };
console.log(`\n=== v${VERSION} 浏览器 mock 推演：${DAYS} 天 / ${LINE} / ${DAYS * TICKS_PER_DAY} tick ===`);

const { page, errs } = await boot(browser, LINE);
try {
  // v3.10.0：夹具存档刻意不含 resonance 字段，用来验收旧档兼容路径（不 bump SAVE_VERSION）
  const bootState = await page.evaluate(() => ({
    version: window.S._version, resonance: window.S.resonance,
    saveRawHasResonance: window.__rawSaveHasResonance,
    panels: window.__qa.allPanels().length, systems: Object.keys(window.__qa.systemStats()).length,
    achievements: window.__qa.ACHIEVEMENTS.length,
  }));
  const initialCps = await page.evaluate(() => window.__qa.computeCps());
  const t0 = Date.now();
  let last = null;
  for (let d = 1; d <= DAYS; d++) {
    const snap = await page.evaluate(n => window.__runBatch(n), TICKS_PER_DAY);
    snap.day = d;
    last = snap;
    // 逐日快照只留趋势字段；编排实测明细与升级全集留在最后一天，避免报告膨胀到数 MB
    report.daily.push({ ...snap, upgrades: undefined, sysStats: undefined,
      stats: { ...snap.stats, orchChecks: undefined, scheduleChecks: undefined,
        resonanceChecks: undefined, layerSamples: undefined, aiLedgerSamples: undefined } });
    if (d === 1 || d % 5 === 0 || d === DAYS) {
      console.log(`  D${String(d).padStart(2)}  EP ${fx(snap.ep).padStart(16)}  CPS ${fx(snap.cps).padStart(14)}  cap ${fx(snap.cap).padStart(14)}  章 ${snap.chapter.padEnd(3)}  腐化 ${fx(snap.corruption, 1).padStart(5)}  购买 ${String(snap.totalBuys).padStart(5)}  任务 ${String(snap.projectsDone).padStart(3)}  编排 ${snap.orchMode}`);
    }
  }
  report.elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  const totalTicks = DAYS * TICKS_PER_DAY;

  // ---- [1] 可玩性与长期稳定性 ----
  console.log('\n[1] 可玩性与长期稳定性');
  if (!bootState.saveRawHasResonance && bootState.version === 6 && bootState.resonance
      && bootState.resonance.enabled === false && bootState.resonance.layers === 0
      && bootState.resonance.focus === 'ep') {
    ok('旧档（无 resonance 字段）安全加载且 SAVE_VERSION 保持 6',
      `默认 ${JSON.stringify(bootState.resonance)}`);
  } else bad('旧档兼容或存档版本异常', JSON.stringify(bootState));
  // v3.12.8：成就基线 140 → 138（守夜人 / 潮汐级联两条随策略移除）
  if (bootState.panels === 27 && bootState.achievements === 138) {
    ok('面板清单 / 成就注册表启动期完整接线',
      `${bootState.panels} 面板 / ${bootState.achievements} 成就 / ${bootState.systems} 系统已登记`);
  } else bad('启动期声明清单不完整', JSON.stringify(bootState));
  if (errs.length === 0) ok('30 天推演全程无 pageerror');
  else bad('出现 pageerror', errs.slice(0, 3).join(' | '));
  if (last.stats.errors.length === 0) ok('自动玩家（点击/购买/晋升/渲染）无异常');
  else bad('自动玩家异常', JSON.stringify(last.stats.errors.slice(0, 3)));
  if (last.cps > initialCps) ok('产出曲线自开局持续上涨', `${fx(initialCps)} → D${DAYS} ${fx(last.cps)}`);
  else bad('产出曲线停滞', `${fx(initialCps)} → D${DAYS} ${fx(last.cps)}`);
  if (last.totalBuys > 20) ok('自动玩家成功推进购买链', `累计 ${last.totalBuys} 次购买 / ${last.upgradeKinds} 种升级 / 晋升 ${last.stats.prestiges || 0} 次`);
  else bad('购买链未推进', `仅 ${last.totalBuys} 次`);
  const stalls = last.stats.capStalls;
  const stallPct = stalls / totalTicks * 100;
  if (stalls < totalTicks * 0.5) ok('EP 未长期顶格死锁', `顶格 tick 占比 ${stallPct.toFixed(1)}%`);
  else bad('EP 长期顶格，产出被截断', `${stallPct.toFixed(1)}%`);
  if (Number.isFinite(last.ep) && last.ep >= 0 && Number.isFinite(last.cps)) ok('终局数值有限且非负');
  else bad('终局数值异常', JSON.stringify({ ep: last.ep, cps: last.cps }));
  if (last.chapter !== '1') ok('故事线章节随进度推进', `至第 ${last.chapter} 章 / 晋升 ${last.prestige} 次`);
  else console.log(`  · 章节停留第 1 章：自动玩家仅晋升 ${last.prestige} 次，未达第 2 章门槛（设计如此，非缺陷）`);
  if (last.storyEvents === 88 && last.linePets === 7) ok('故事线变体接线生效（74 主表 + 14 线专属事件 / 7 异兽）', `事件池 ${last.storyEvents}`);
  else bad('故事线变体数量不符', JSON.stringify({ ev: last.storyEvents, pet: last.linePets }));
  if (last.eventsSeen > 0) ok('新增事件池在 30 天内被真实触发', `累计 ${last.eventsSeen} 次随机事件`);
  else console.log('  · 推演期内未触发随机事件（随机性，非缺陷）');

  // 资源流引擎全程健康
  if (last.flowErrors === 0) ok(`${last.flowCount} 条资源流在 ${DAYS} 天内零异常（单流异常隔离生效）`);
  else bad('资源流出现运行异常', `累计 ${last.flowErrors} 次`);
  if (last.flowTicks >= totalTicks) ok('EP 主产出流每帧执行', `${last.flowTicks} ticks / ${totalTicks} 帧`);
  else bad('EP 主产出流漏帧', `${last.flowTicks} / ${totalTicks}`);

  // v3.9.0 控制流层：帧系统 / 面板注册表全程零异常，render 无漏帧，声明完整
  if (last.sysErrors === 0 && last.panelErrs === 0) ok('43 条帧系统与 27 个注册面板 30 天零异常（异常隔离生效）');
  else bad('控制流层出现运行异常', JSON.stringify({ sys: last.sysErrors, panel: last.panelErrs }));
  const sysIds = Object.keys(last.sysStats || {});
  if (last.renderTicks >= totalTicks) ok('render 帧系统每帧执行（无漏帧）', `${last.renderTicks} ticks / ${totalTicks} 帧`);
  else bad('render 帧系统漏帧', `${last.renderTicks} / ${totalTicks}`);
  if (sysIds.length >= 40 && last.panelCount === 27) ok('帧系统 / 面板声明完整接线', `${sysIds.length} 个系统已运行 / ${last.panelCount} 个面板已注册`);
  else bad('声明缺失', JSON.stringify({ sys: sysIds.length, panels: last.panelCount }));

  if (last.projectsDone >= 3) ok('任务链路在线可达（领取即计入累计完成）',
    `30 天累计完成 ${last.projectsDone} 个任务 / 成功领取 ${last.stats.claims} 次`);
  else bad('任务链路不可达：累计完成数未增长',
    JSON.stringify({ projectsDone: last.projectsDone, claims: last.stats.claims }));
  // 新玩法在长期推演中被真实使用
  if (last.orchUnlocked && last.stats.orchSwitches > 0) {
    ok('效能编排在长期推演中解锁并被自动玩家真实切换', `${last.stats.orchSwitches} 次切换，当前 ${last.orchMode}`);
  } else if (!last.orchUnlocked) bad('效能编排 30 天内未解锁（新玩法不可达）',
    `projectsDone=${last.projectsDone} prestige=${last.prestige}`);
  else bad('编排已解锁但自动玩家未切换');
  // v3.9.0 新玩法可达性 + 改写正确性
  if (last.scheduleUnlocked && last.stats.scheduleEdits > 0) {
    ok('潮汐预案在长期推演中解锁并被自动玩家真实改写',
      `${last.stats.scheduleEdits} 次改写，排班 ${last.schedule.join('/')}`);
  } else if (!last.scheduleUnlocked) bad('潮汐预案 30 天内未解锁（新玩法不可达）',
    `projectsDone=${last.projectsDone} prestige=${last.prestige}`);
  else bad('排班已解锁但自动玩家未改写');
  const schedChecks = last.stats.scheduleChecks || [];
  if (schedChecks.length > 0 && schedChecks.every(c => c.hit && c.othersKept)) {
    ok('每次排班改写只影响目标相位且即时生效', `${schedChecks.length} 次实测`);
  } else bad('排班改写串相位或未生效', JSON.stringify(schedChecks.slice(0, 3)));
  const checks = last.stats.orchChecks || [];
  if (checks.length > 0) {
    const worst = Math.max(...checks.map(c => Math.abs(c.ratio - c.expect)));
    if (worst < 1e-6) ok('每次策略切换的 CPS 变化与编排倍率严格同口径', `${checks.length} 次实测，最大误差 ${worst.toExponential(2)}`);
    else bad('策略切换与 CPS 脱钩', `最大误差 ${worst}`);
  }
  // v3.10.0 新玩法「相位共鸣」在长期推演中的可达性与叠层行为
  const R = last.resonance || {};
  if (R.unlocked && last.stats.resonanceEnables > 0 && R.enabled) {
    ok('相位共鸣在长期推演中解锁并经产品入口开启',
      `开启 ${last.stats.resonanceEnables} 次 / 焦点轮换 ${last.stats.focusSwitches} 次 / 终局 ${R.layers} 层`);
  } else if (!R.unlocked) bad('相位共鸣 30 天内未解锁（新玩法不可达）',
    `projectsDone=${last.projectsDone} prestige=${last.prestige}`);
  else bad('共鸣已解锁但自动玩家未开启', JSON.stringify(R));
  const samples = last.stats.layerSamples || [];
  if (samples.some(x => x.layers > 0) && samples.every(x => x.layers <= 20)) {
    ok('共鸣层数真实累积且不超过上限 20',
      `采样 ${samples.length} 次 / 峰值 ${Math.max(...samples.map(x => x.layers))} 层 / 终局 ${R.layers} 层`);
  } else bad('共鸣叠层异常', JSON.stringify(samples.slice(0, 3)));
  if (last.stats.phaseDecays > 0) ok('换相位时共鸣层数减半在长期推演中真实发生',
    `记录 ${last.stats.phaseDecays} 次`);
  else console.log('  · 推演期内未捕捉到相位切换减半（随机性，非缺陷）');
  const resChecks = (last.stats.resonanceChecks || []).flat();
  const resWorst = resChecks.length ? Math.max(...resChecks.map(c => Math.abs(c.got - c.expect))) : 0;
  if (resChecks.length > 0 && resWorst < 1e-9) {
    ok('四管线 orchestrationMult = 编排基准 × resonanceMult（长期同口径）',
      `${resChecks.length} 次实测，最大误差 ${resWorst.toExponential(2)}`);
  } else bad('共鸣乘区与读侧脱钩', `最大误差 ${resWorst}`);
  report.checks.playability = {
    finalCps: last.cps, finalEp: last.ep, totalBuys: last.totalBuys, chapter: last.chapter,
    capStallPct: +stallPct.toFixed(2), eventsSeen: last.eventsSeen,
    orchSwitches: last.stats.orchSwitches, orchChecks: checks.length, flowTicks: last.flowTicks,
    scheduleEdits: last.stats.scheduleEdits, scheduleChecks: schedChecks.length,
    sysIds: sysIds.length, renderTicks: last.renderTicks, panels: last.panelCount,
    projectsDone: last.projectsDone, claims: last.stats.claims,
    resonance: R, resonanceEnables: last.stats.resonanceEnables,
    focusSwitches: last.stats.focusSwitches, phaseDecays: last.stats.phaseDecays,
    layerSamples: samples, resonanceChecks: resChecks.length, resonanceWorstErr: resWorst,
  };

  // ---- [2] 数值准确性 ----
  console.log('\n[2] 数值准确性');
  const probes = [];
  for (let i = 0; i < 3; i++) probes.push(await page.evaluate(() => window.__numericProbe()));
  const rel = probes.map(p => p.cps > 0 ? Math.abs(p.gross - p.cps * 10) / (p.cps * 10) : 0);
  const worst = Math.max(...rel);
  if (worst < 0.05) ok('单 tick 产出入账 = computeCps() × 10s（含编排倍率）', `最大相对误差 ${(worst * 100).toFixed(3)}%`);
  else bad('单 tick 产出与 CPS 不符', `最大相对误差 ${(worst * 100).toFixed(2)}% / ${JSON.stringify(probes)}`);
  const price = await page.evaluate(() => {
    const q = window.__qa;
    return q.UPGRADES.slice(0, 12).map(u => ({ id: u.id, bulk: q.bulkCostCalc(u, 1), unit: q.unitCost(u, 0) }));
  });
  if (price.every(p => p.bulk === p.unit)) ok('主商店批量价与单价同口径（12 项抽检）');
  else bad('购买路径价差', JSON.stringify(price.filter(p => p.bulk !== p.unit)));

  // 编排四策略逐一定点核对（复位到推演前状态，不污染后续 UI 检查）
  const orchProbe = await page.evaluate(() => {
    const S = window.S, q = window.__qa;
    const st = q.orchestrationState(S);
    const saved = { mode: st.mode, auto: st.autoTide, tide: S.tidePhase,
      sched: q.orchestrationSchedule(S).slice(), resEnabled: q.resonanceState(S).enabled };
    // v3.10.0：策略声明值的定点核对需要「纯编排基准」，先关闭共鸣乘区，末尾用产品入口还原
    q.setResonanceEnabled(S, false);
    // v3.8.0 review：不再伪造解锁进度——30 天推演必须靠真实任务链解锁编排
    q.setOrchestrationAutoTide(S, false);
    q.setOrchestrationMode(S, 'balanced');
    const base = q.computeCps();
    const out = {};
    for (const m of q.ORCHESTRATION_MODES) {
      q.setOrchestrationMode(S, m.id);
      out[m.id] = { cpsRatio: base > 0 ? q.computeCps() / base : 1, ep: q.orchestrationMult('ep', S),
        rp: q.orchestrationMult('rp', S), pt: q.orchestrationMult('pt', S), dm: q.orchestrationMult('dm', S) };
    }
    // 默认排班表（恢复后用产品入口写回，不改 S）后，相位切换应立即改变生效倍率
    if (q.scheduleUnlocked(S)) q.resetOrchestrationSchedule(S);
    q.setOrchestrationAutoTide(S, true);
    S.tidePhase = 0; const tide0 = q.effectiveModeId(S);
    S.tidePhase = 3; const tide3 = q.effectiveModeId(S);
    // v3.9.0：改写相位 2，核对生效策略与四键倍率，再恢复默认
    // v3.12.8：默认表相位 2 = 研究优先，改成深渊优先才能证明「真的写进去了」
    const unlocked = q.scheduleUnlocked(S);
    const edited = unlocked ? q.setOrchestrationPhaseMode(S, 2, 'abyss') : false;
    S.tidePhase = 2;
    const editedMode = q.effectiveModeId(S);
    const editedMult = { ep: q.orchestrationMult('ep', S), rp: q.orchestrationMult('rp', S),
      pt: q.orchestrationMult('pt', S), dm: q.orchestrationMult('dm', S) };
    const editedCustomized = q.scheduleCustomized(S);
    const reset = unlocked ? q.resetOrchestrationSchedule(S) : false;
    const resetMode = q.effectiveModeId(S);
    const resetCustomized = q.scheduleCustomized(S);
    // 夹具复位：全部走产品入口，保留推演结束时的真实玩家配置
    q.setOrchestrationAutoTide(S, saved.auto);
    q.setOrchestrationMode(S, saved.mode);
    if (q.scheduleUnlocked(S)) {
      q.resetOrchestrationSchedule(S);
      for (let i = 0; i < 4; i++) q.setOrchestrationPhaseMode(S, i, saved.sched[i]);
    }
    S.tidePhase = saved.tide;
    q.setResonanceEnabled(S, saved.resEnabled);
    return { out, tide0, tide3, base, unlocked, edited, editedMode, editedMult,
      editedCustomized, reset, resetMode, resetCustomized };
  });
  const orchOk = Object.entries(orchProbe.out).every(([id, v]) =>
    Math.abs(v.cpsRatio - v.ep) < 1e-9);
  if (orchOk && orchProbe.base > 0) ok('四种编排策略的 CPS 实测倍率与声明值完全一致',
    Object.entries(orchProbe.out).map(([k, v]) => `${k} ×${v.cpsRatio.toFixed(2)}`).join(' / '));
  else bad('编排声明值与实测 CPS 不符', JSON.stringify(orchProbe.out));
  if (orchProbe.tide0 === 'output' && orchProbe.tide3 === 'abyss') ok('默认排班表四相位各挂一条不同策略（零数值漂移）', `涨潮→产能 / 平潮→均衡 / 退潮→研究 / 乱流→深渊`);
  else bad('默认排班映射错误', JSON.stringify({ t0: orchProbe.tide0, t3: orchProbe.tide3 }));
  if (orchProbe.unlocked && orchProbe.edited && orchProbe.editedMode === 'abyss'
      && Math.abs(orchProbe.editedMult.ep - 0.88) < 1e-9 && Math.abs(orchProbe.editedMult.rp - 0.92) < 1e-9
      && Math.abs(orchProbe.editedMult.pt - 1.40) < 1e-9 && Math.abs(orchProbe.editedMult.dm - 1.25) < 1e-9
      && orchProbe.editedCustomized) {
    ok('潮汐预案改写后生效策略与四条倍率同口径', '相位 2 → 深渊优先 EP×0.88 / RP×0.92 / PT×1.40 / DM×1.25');
  } else bad('潮汐预案改写倍率不符', JSON.stringify(orchProbe));
  if (orchProbe.reset && orchProbe.resetMode === 'research' && !orchProbe.resetCustomized) {
    ok('恢复默认排班可一键回退', '相位 2 回到研究优先');
  } else bad('恢复默认排班未回退', JSON.stringify({ r: orchProbe.reset, m: orchProbe.resetMode, c: orchProbe.resetCustomized }));

  // v3.10.0 相位共鸣数值：用纯读侧探针核对焦点增益 / 其余代价 / 上限 / 未解锁回落
  const resProbe = await page.evaluate(() => {
    const q = window.__qa, T = q.RESONANCE_TUNING;
    const mk = (layers, focus = 'ep') => ({ projectsDone: 999, prestige: 0,
      resonance: { enabled: true, layers, focus, phase: 1, acc: 0 } });
    const s10 = mk(10), s20 = mk(20);
    const off = { ...s10, projectsDone: 0, prestige: 0, resonance: { ...s10.resonance, enabled: false } };
    return { tuning: T,
      locked: q.resonanceMult('ep', off),
      focus10: q.resonanceMult('ep', s10), side10: q.resonanceMult('rp', s10),
      focus20: q.resonanceMult('ep', s20), side20: q.resonanceMult('dm', s20),
      zero: q.resonanceMult('ep', mk(0)), badKey: q.resonanceMult('nope', s20),
      rows: q.resonanceSummary(s20).rows.map(r => ({ key: r.key, mult: r.mult, focused: r.focused })),
    };
  });
  const resNumericOk = resProbe.locked === 1 && resProbe.zero === 1 && resProbe.badKey === 1
    && Math.abs(resProbe.focus10 - 1.15) < 1e-9 && Math.abs(resProbe.side10 - 0.98) < 1e-9
    && Math.abs(resProbe.focus20 - 1.30) < 1e-9 && Math.abs(resProbe.side20 - 0.96) < 1e-9
    && resProbe.rows.length === 4 && resProbe.rows.filter(r => r.focused).length === 1;
  if (resNumericOk) ok('相位共鸣焦点 +1.5%/层、其余 -0.2%/层、上限 20 层、未解锁恒 ×1',
    `10 层 ×${resProbe.focus10.toFixed(2)} / ×${resProbe.side10.toFixed(2)}，20 层 ×${resProbe.focus20.toFixed(2)} / ×${resProbe.side20.toFixed(2)}`);
  else bad('共鸣倍率与声明不符', JSON.stringify(resProbe));
  if (resProbe.rows.filter(r => r.mult > 1).length === 1 && resProbe.rows.filter(r => r.mult < 1).length === 3) {
    ok('四管线「一条增益 / 三条代价」成对生效', resProbe.rows.map(r => `${r.key}×${r.mult.toFixed(2)}`).join(' '));
  } else bad('四管线增益代价不成对', JSON.stringify(resProbe.rows));

  const ledger = await page.evaluate(() => window.__qa.flowLedger());
  if (ledger.ep && ledger.ep.gross > 0) ok('守恒台账累计了 30 天 EP 理论产出', `gross=${fx(ledger.ep.gross, 0)} EP`);
  else bad('守恒台账缺失', JSON.stringify(ledger).slice(0, 200));
  report.checks.numeric = {
    maxRelErrPct: +(worst * 100).toFixed(4), probes, priceSample: price.slice(0, 3),
    orchestration: orchProbe.out, schedule: orchProbe, resonance: resProbe, ledger,
  };

  // ---- [3] 各功能 UI 准确性 ----
  console.log('\n[3] 各功能 UI 准确性');
  const ui = await uiCheck(page);
  const tabErrs = ui.tabs.filter(t => t.error);
  if (tabErrs.length === 0) ok(`${ui.tabs.length} 个功能 tab 均可打开且无异常`);
  else bad('tab 打开异常', JSON.stringify(tabErrs));
  const badText = ui.tabs.filter(t => t.hasBadText);
  if (badText.length === 0) ok('各 tab 可见文本无 undefined / NaN / Infinity');
  else bad('面板出现占位符或非法数值', badText.map(t => t.id).join(', '));
  if (ui.wikiOk) ok('Wiki（含 v3.11.0 五个新章节）渲染无 undefined / NaN');
  else bad('Wiki 渲染出现 undefined / NaN');
  const rTotal = ui.researchGroups.reduce((a, g) => a + g.n, 0);
  if (rTotal === ui.researchTotal && ui.researchTotal === 68) ok('研究面板分组覆盖全部 68 项', ui.researchGroups.map(g => `${g.key}:${g.n}`).join(' '));
  else bad('研究分组与配置不一致', `${rTotal} vs ${ui.researchTotal}`);
  if (ui.policyGroups === 13 && ui.policyTotal === 39) ok('政策面板 13 组 39 项全部注册', `组 ${ui.policyGroups} / 项 ${ui.policyTotal}`);
  else bad('政策数量不符', JSON.stringify({ g: ui.policyGroups, n: ui.policyTotal }));
  if (ui.priceMatch) ok('商店卡面可读取并与真实首购价关联', `${ui.priceMatch.id} = ${fx(ui.priceMatch.cost)} EP`);
  else console.log('  · 商店首卡当前无可购买入口（进度相关，非缺陷）');
  if (ui.orch.unlocked && ui.orch.visible && ui.orch.textOk && ui.orch.modes === 4) {
    ok('效能编排卡可见，四条倍率文本与读侧一致', ui.orch.text.replace(/\n/g, ' ').slice(0, 90));
  } else if (!ui.orch.unlocked) bad('编排卡未解锁，新玩法对玩家不可见', JSON.stringify(ui.orch));
  else bad('编排卡 UI 与读侧不一致', JSON.stringify(ui.orch));
  if (ui.orch.labelOk) ok('编排倍率口径标签单行呈现，窄卡无孤字换行', '编排倍率 · 策略与相位共鸣合并');
  else bad('编排倍率标签缺失或出现孤字换行', JSON.stringify(ui.orch.labelOrphans));
  if (ui.achPanelTextLen > 0 && ui.achNew.length === ui.achNewUnlocked.length) {
    ok('成就面板逐页渲染与读侧一致（已解锁的新成就全部可见）',
      `${ui.achPages} 页 / 全页 ${ui.achPanelTextLen} 字；已解锁新成就 ${ui.achNewUnlocked.length} 条，面板可见 ${ui.achNew.length} 条`);
  } else bad('成就面板与读侧不一致',
    JSON.stringify({ pages: ui.achPages, len: ui.achPanelTextLen, unlocked: ui.achNewUnlocked, visible: ui.achNew }));
  // v3.9.0 潮汐预案 UI（v3.10.0 升级为 4×6 槽位）：aria-label、当前相位 ▶、真实点击与恢复默认
  const s = ui.schedUI || {};
  if (s.unlocked && s.slots === 16 && s.labelsOk && s.phaseMarks === 1) {
    ok('潮汐预案排班表 UI 完整（4 相位 × 4 策略 / aria-label / 当前相位 ▶）', `${s.slots} 个槽位按钮`);
  } else bad('排班表 UI 不完整', JSON.stringify(s));
  if (s.clickOk && s.resetOk) ok('排班表真实点击后读侧同步，恢复默认按钮生效',
    `${s.before} → ${s.after} → 默认排班`);
  else bad('排班表点击链路异常', JSON.stringify({ clickOk: s.clickOk, resetOk: s.resetOk }));
  if (s.panelCount === 27 && s.panelErrs === 0 && s.sysErrs === 0) {
    ok('渲染分发层与控制流层台账零异常', `${s.panelCount} 面板 / ${s.sysCount} 系统`);
  } else bad('控制流层台账异常', JSON.stringify({ p: s.panelCount, pe: s.panelErrs, se: s.sysErrs }));
  // v3.10.0 相位共鸣 UI 准确性
  const rui = ui.resonanceUI || {};
  if (rui.ok && rui.buttons === 5 && rui.labelsOk && rui.pressedOk && rui.sizeOk) {
    ok('共鸣开关 + 四焦点按钮均有 aria-label / aria-pressed 且点击目标 ≥24×24',
      `最小 ${Math.min(...rui.sizes.map(x => x.w))}×${Math.min(...rui.sizes.map(x => x.h))}px`);
  } else bad('共鸣按钮可访问性不达标', JSON.stringify(rui));
  if (rui.ok && rui.orphanLines === 0) ok('编排卡窄卡文案无孤字换行', 'getClientRects 末行宽度检测');
  else bad('编排卡存在孤字换行', JSON.stringify({ orphanLines: rui.orphanLines }));
  if (rui.ok && rui.clickOk && rui.focusOk) ok('共鸣开关 / 焦点真实 DOM 点击后读侧即时同步',
    '开关双态回环 + 焦点切换生效');
  else bad('共鸣真实点击链路异常', JSON.stringify({ clickOk: rui.clickOk, focusOk: rui.focusOk }));
  if (rui.ok && rui.textOk) ok('共鸣层数与四管线倍率文本与读侧一致',
    `${rui.layers}/20 层 · ${rui.rows.map(x => x.key + '×' + x.mult.toFixed(2)).join(' ')}`);
  else bad('共鸣卡文案与读侧不一致', JSON.stringify(rui));
  // v3.12.8：基线下移到 138（删除 orch_vigil / cascade 两条随策略一并移除的成就）
  if (ui.achTotal === 138) ok('成就注册表 138 条完整渲染（逐页）', `${ui.achPages} 页 / ${ui.achTotal} 条`);
  else bad('成就总数不符', JSON.stringify({ total: ui.achTotal }));
  if (ui.achV3100Unlocked.length >= 2) ok('v3.10.0 新增成就在 30 天推演中真实达成',
    ui.achV3100Unlocked.join(', '));
  else bad('v3.10.0 新增成就不可达', JSON.stringify(ui.achV3100Unlocked));
  // 历史成就门槛按推演天数放宽：1 天灰度只需证明其可达，30 天长跑仍要求 ≥2 条。
  const needV390 = DAYS >= 30 ? 2 : 1;
  if (ui.achV390Unlocked.length >= needV390) ok('v3.9.0 新增成就在长期推演中真实达成',
    `${ui.achV390Unlocked.join(', ')}（${DAYS} 天门槛 ${needV390} 条）`);
  else bad('v3.9.0 新增成就不可达', JSON.stringify(ui.achV390Unlocked));
  // v3.10.2 编号反馈清单：四条改动的浏览器侧 UI 验收
  const fb = ui.feedbackUI || {};
  if (fb.orderOk) ok('顶栏产出/s 与 消耗/s 位于最左', fb.firstTwo.join(' → '));
  else bad('顶栏顺序不符', JSON.stringify(fb.firstTwo));
  if (fb.restWarnOk && fb.restTipOk) ok('警告标志显隐与净流读侧一致，悬浮 ETA 按状态出现');
  else bad('顶栏净流状态与 UI 不一致', JSON.stringify({ w: fb.restWarnOk, t: fb.restTipOk }));
  if (fb.forced?.ok && fb.forced.warnShown && fb.forced.etaOk && fb.forced.ariaOk) {
    ok('产出 < 消耗时显示 ⚠ 并在悬浮给出预期 EP 耗尽时间',
      `cps ${fx(fb.forced.cps)} < 消耗 ${fx(fb.forced.drain)} / ETA ${fb.forced.eta}`);
  } else bad('负净流告警或 ETA 未生效', JSON.stringify(fb.forced));
  if (fb.fpGateOk) ok('FP 资源门控：研究面板与顶栏 FP 同源（含分组前置门槛）',
    `FP ${fb.fpUnlocked ? '已' : '未'}解锁 / 资源与消耗组 ${fb.resGroupShown ? '可见' : '未解锁'} / 面板 ${fb.domCount} 项 / FP 项 ${fb.fpDomCount}`);
  else bad('FP 研究项门控与资源解锁不一致', JSON.stringify(fb));
  if (fb.fpForced && fb.fpForced.ok) ok('受控夹具解锁分组后，FP 三项按资源锚点双向显隐',
    `自然态 ${fb.fpForced.natural.count}/${fb.fpForced.natural.expected} · 锚点开 ${fb.fpForced.on.count}/3 · 锚点关 ${fb.fpForced.off.count}/0`);
  else bad('FP 资源门控受控夹具失败', JSON.stringify(fb.fpForced));
  const sg = fb.starGate || {};
  if (sg.ok && !sg.before.gate && sg.before.locked && !sg.before.starCpsShown && !sg.beforePane
      && sg.after.gate && !sg.after.locked && sg.after.starCpsShown && sg.afterPane)
    ok('星图解锁排在宠物之后（tab 锁定态 / 顶栏 CPS / 程序化切换同源）',
      'PT 未点亮 → ??? + 顶栏隐藏 + 切换被拦；PT 点亮 → 星图 + 顶栏亮出 + 可打开');
  else bad('星图门控矩阵失败', JSON.stringify(sg));
  if (fb.capOk) ok('顶栏 RP 余额未超上限（重置钳制生效）', fb.rpTxt);
  else bad('RP 余额超过上限', fb.rpTxt);
  if (fb.pendingDebuff === 0) ok('任务面板不存在待领取的负面任务');
  else bad('负面任务仍停在待领取状态', String(fb.pendingDebuff));

  // ---- [4] AI 自动化 / 常驻班组（手动绑定）/ 不消耗（v3.11.3） ----
  console.log('\n[4] AI 自动化、常驻班组（绑定）与数值守恒');
  const aiSt = last.stats || {};
  const aiAudit = await page.evaluate(() => {
    const S = window.S, q = window.__qa;
    return {
      ids: [...q.AI_ACTION_IDS], crew: [...q.AI_CREW_REQUIRED_IDS],
      allOff: [...q.ALL_OFF_SWITCH_KEYS],
      assistants: q.assistantCount(),
      boundTotal: q.crewBoundTotal(), idle: q.crewIdle(),
      crewMap: (() => { const m = {}; for (const id of q.AI_ACTION_IDS) m[id] = q.crewOf(id); return m; })(),
      counts: q.actionCounts(), total: q.totalActionCount(q.actionCounts()),
      switchesOn: q.AI_ACTION_SWITCH_KEYS.filter(k => !!S.ai[k]),
      cost: q.assistantCost(),
    };
  });
  report.checks.ai = { ...aiAudit, stats: {
    aiBuys: aiSt.aiBuys || 0, aiBuyFails: aiSt.aiBuyFails || 0,
    aiSwitchToggles: aiSt.aiSwitchToggles || 0, aiStallTicks: aiSt.aiStallTicks || 0,
    aiBuildActivations: aiSt.aiBuildActivations || 0, aiTechBought: aiSt.aiTechBought || 0 },
    daily: report.daily.map(d => ({ day: d.day, assistants: d.ai && d.ai.assistants,
      total: d.ai && d.ai.total,
      stalled: d.ai && d.ai.stalled && d.ai.stalled.length })) };

  // v3.12.0：首价 8e6 高于前几日经济量级，灰度（DAYS<10）里 AI 零执行是定价设计而非漏接线。
  // 长期覆盖类断言统一延后到 30 天完整推演；UI / 守恒 / 门控断言在灰度仍照常验收。
  const isGray = DAYS < 10;
  if (aiAudit.ids.length === 5 && aiAudit.crew.length === 5
      && ['upgrade', 'hire', 'claim'].every(id => aiAudit.crew.includes(id)))
    ok('五项自动化动作全部声明需占编（含自动升级/领取/招募）', aiAudit.crew.join(', '));
  else bad('动作注册表占编清单不完整', JSON.stringify(aiAudit.crew));
  if (isGray) ok('灰度：AI 长期执行覆盖延后到 30 天推演',
    `${DAYS} 天 / 助手 ${aiAudit.assistants} 名 / 执行 ${aiAudit.total} 次 / 首价 ${fx(aiAudit.cost)} EP`);
  else if (aiAudit.total > 0) ok('30 天推演中 AI 自动化真实执行',
    `累计 ${aiAudit.total} 次 / 分布 ${JSON.stringify(aiAudit.counts)}`);
  else bad('AI 自动化全程零执行（长期覆盖失效）');
  // v3.11.3：绑定（占编）守恒——占编 + 空闲 = 助手总数，且常驻不消耗（非自动均分）。
  if (aiAudit.boundTotal + aiAudit.idle === aiAudit.assistants)
    ok('占编 + 空闲 = 助手总数（绑定守恒，常驻不消耗）',
      `占编 ${aiAudit.boundTotal} + 空闲 ${aiAudit.idle} = ${aiAudit.assistants}`);
  else bad('占编与空闲之和不等于助手总数', JSON.stringify({ bound: aiAudit.boundTotal, idle: aiAudit.idle, total: aiAudit.assistants }));
  if (isGray) ok('灰度：绑定占编覆盖延后到 30 天推演', `占编 ${aiAudit.boundTotal} / 助手 ${aiAudit.assistants}`);
  else if (aiAudit.boundTotal >= 1) ok('30 天推演中 AI 动作均通过绑定占编生效（非自动均分）', `占编合计 ${aiAudit.boundTotal}`);
  else bad('全程无动作被绑定占编');
  // v3.11.2：助手是常驻班组，不随动作消耗；余额只增不减（仅由购买扩编）。
  if (aiAudit.assistants === (aiSt.aiBuys || 0))
    ok('助手余额 = 累计购买数（全程零消耗，常驻班组守恒）',
      `余额 ${aiAudit.assistants} = 购买 ${aiSt.aiBuys || 0}`);
  else bad('助手余额与购买数不一致（不应被消耗）',
    JSON.stringify({ assistants: aiAudit.assistants, buys: aiSt.aiBuys || 0 }));
  // 覆盖面按「本次推演实际解锁了哪些动作」判定：autoBuild / autoTech 都需产品内额外解锁，
  // 未解锁时执行数为 0 属于门控设计而非漏接线。无论覆盖面如何，都要求「执行过的动作
  // 一律落在占编清单内」。
  const counts = aiAudit.counts || {};
  const executedKinds = Object.keys(counts).filter(id => (counts[id] || 0) > 0);
  const activeKinds = executedKinds.length;
  const rogueKinds = executedKinds.filter(id => !(aiAudit.crew || []).includes(id));
  const advancedUnlocked = (aiSt.aiTechBought || 0) > 0 || (aiSt.aiBuildActivations || 0) > 0;
  if (isGray) ok('灰度：动作清单覆盖延后到 30 天推演', `执行类别 ${activeKinds}/5 · 清单外 ${rogueKinds.length}`);
  else if (rogueKinds.length === 0 && activeKinds > 0)
    ok('长期执行过的动作全部属于 5 项占编清单（无清单外动作）',
      `${activeKinds}/5 类有记录 · 分布 ${JSON.stringify(counts)}`);
  else bad('出现清单外动作或全程零执行', JSON.stringify({ rogueKinds, counts }));
  if (!advancedUnlocked) {
    ok('进阶动作未解锁时执行数为 0，符合门控设计',
      `本次 ${DAYS} 天推演：自动购建激活 ${aiSt.aiBuildActivations || 0} 次 / 自动研究科技购入 ${aiSt.aiTechBought || 0} 次`);
  } else if (activeKinds >= 2) {
    ok('进阶动作已解锁且长期推演覆盖多类自动化', `${activeKinds}/5 类动作有执行记录`);
  } else if (isGray) {
    ok('灰度：进阶动作多类覆盖延后到 30 天推演', JSON.stringify({ counts, activeKinds }));
  } else {
    bad('进阶动作已解锁但只有单一动作执行', JSON.stringify({ counts, advancedUnlocked }));
  }
  // v3.12.0 反馈⑥：助手大幅涨价后是「稀缺编制」，自动玩家仍把 5 个开关全开，
  // 「任一已开启动作缺人」几乎全程为真；旧断言 aiStallPct <= 50 编码的是 v3.11.3
  // 「30 天买满 24 名、5 动作全程满编」的旧设计，不再适用。
  // 新口径按可玩性底线验收：中期能首购、末段满编零停摆、末段有真实执行。
  const decisionPoints = DAYS * TICKS_PER_DAY / 6;
  const aiStallPct = (aiSt.aiStallTicks || 0) / decisionPoints * 100;
  const aiDaily = report.daily.map(d => ({
    day: d.day, assistants: (d.ai && d.ai.assistants) || 0,
    stalled: ((d.ai && d.ai.stalled) || []).length,
    total: (d.ai && d.ai.total) || 0,
  }));
  const firstBuyDay = (aiDaily.find(x => x.assistants > 0) || {}).day;
  const lastStallDay = aiDaily.filter(x => x.stalled > 0).reduce((n, x) => Math.max(n, x.day), 0);
  const tailN = Math.min(5, DAYS);
  const tail = aiDaily.slice(-tailN);
  const tailClean = tail.length === tailN && tail.every(x => x.stalled === 0);
  const tailActions = tail.length >= 2 && tail[tail.length - 1].total > tail[0].total;
  const midAvailable = firstBuyDay != null && firstBuyDay <= Math.ceil(DAYS / 2);
  const stallDetail = `首购 D${firstBuyDay == null ? '-' : firstBuyDay} / 末次缺编 D${lastStallDay} / 末 ${tailN} 天零停摆 ${tailClean} / 末段执行 ${tailActions} / 全程缺编采样 ${aiStallPct.toFixed(1)}% / 购买 ${aiSt.aiBuys || 0} 次`;
  if (DAYS < 10) {
    ok('灰度：自动化供给曲线已记录（可玩性判定在 30 天完整推演）', stallDetail);
  } else if (aiAudit.total > 0 && midAvailable && tailClean && tailActions) {
    ok('自动化中期可用、末段满编且真实执行（v3.12.0 助手稀缺口径）', stallDetail);
  } else bad('自动化供给未达可玩性底线', stallDetail);
  const A = ui.aiUI || {};
  if (A.ok && A.cards && A.cards.length === 5 && A.switches && A.switches.length === 0 && A.steppers && A.steppers.length === 5)
    ok('AI 面板 5 张动作卡 + 占编步进器由注册表完整渲染（无 ON/OFF 开关）',
      `${A.cards.join(',')}`);
  else bad('AI 面板动作卡或步进器缺项', JSON.stringify({ cards: A.cards, switches: A.switches, steppers: A.steppers }));
  // v3.12.5 反馈④：面板不再写「常驻班组/涨价」与独立台账行，台账改为悬浮在助手行上
  if (!A.hasLedger && !A.crewHint && /本局已执行/.test(A.headTip || '') && !A.badText)
    ok('助手区块只留数量/占编/购买，台账移至悬浮（面板无教学文案）', (A.headTip || '').slice(0, 46));
  else bad('助手区块 UI 文案异常', JSON.stringify({ l: A.hasLedger, c: A.crewHint, t: (A.headTip || '').slice(0, 40), b: A.badText }));
  if (A.stallConsistent) ok('未绑定提示与占用读侧同源（开启但未绑定占编的动作才提示）');
  else bad('未绑定提示与读侧不一致', JSON.stringify({ s: A.stalled, h: A.hasStall }));
  if (A.orphans === 0) ok('AI 面板窄卡无孤字换行（getClientRects）');
  else bad('AI 面板出现孤字换行', JSON.stringify(A.orphanDetails || A.orphans));
  if (A.sizeOk) ok('AI 面板全部按钮点击目标 ≥24×24', `${A.buttonCount} 个按钮`);
  else bad('AI 面板按钮点击目标过小', JSON.stringify(A.sizes));
  if (A.allOffOk && A.noAllOffBtn) ok('一键全关按钮已移除，allOffActions() 仍覆盖全部 5 个动作',
    (aiAudit.allOff || []).join(','));
  else bad('一键全关清理不彻底', JSON.stringify({ btn: A.noAllOffBtn, ok: A.allOffOk, off: aiAudit.allOff }));

  const flowErrList = ui.flow.errors || [];
  if (flowErrList.length === 0) ok('资源流错误队列为空');
  else bad('资源流错误队列非空', JSON.stringify(flowErrList.slice(0, 2)));
  report.checks.ui = { ...ui, flow: { stats: ui.flow.stats, ledger: ui.flow.ledger, errors: flowErrList } };

  if (errs.length) report.pageErrors = errs;
} finally {
  await page.close();
  await browser.close();
}

report.pass = pass; report.fail = fail;
writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 / 耗时 ${report.elapsedSec || '-'}s；报告 ${REPORT} ===`);
process.exit(fail > 0 ? 1 : 0);
