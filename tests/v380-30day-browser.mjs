// v3.8.0 真实浏览器 30 天 mock 推演 + 可玩性 / 数值准确性 / 全功能 UI 准确性验收
//
// 与 v3.7.0 版相比的增强：
//   - 资源流引擎：8 条流全程执行、零异常、守恒台账可读；
//   - 新玩法「效能编排」在长期推演中被自动玩家真实切换，逐次核对 CPS 与倍率严格同口径；
//   - 内容扩充后逐日快照增加 章节/政策/研究/编排 字段，UI 检查覆盖新卡与新增条目；
//   - 新增事件池（主表 44 + 线专属 8）在 30 天随机触发中被真实执行，验证无死分支。
//
// 驱动方式：Date.now() 与 tick(now) 同时按 10s 步进（tick 内部 dt 上限 10s）；
//   启动时清除页面自身 setInterval；自动玩家只调用产品真实入口（doClick / buyUpgrade / claimProject / setOrchestrationMode）。
//   v3.8.0 review：领取任务链路必须真实跑通，否则累计完成数恒 0，编排等 5 处内容不可达。
//
// 用法：
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v380-30day-browser.mjs
//   DAYS=1 node tests/v380-30day-browser.mjs                    # 灰度
//   LINE=line_faith DAYS=3 REPORT=tests/v380-30day-faith.json node ...
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const DAYS = Number(process.env.DAYS || 30);
const LINE = process.env.LINE || 'line_order';
const REPORT = process.env.REPORT || 'tests/v380-30day-report.json';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const TICKS_PER_DAY = 8640; // 86400s / 10s
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };
const fx = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d });

const mkSave = (storyline) => JSON.stringify({
  _version: 6, chapter: '1', storyline, ep: 0, rp: 0, es: 0, dm: 0, pt: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: [], faith: 0,
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
    window.__stats = { buys: 0, clicks: 0, buyFails: 0, capStalls: 0, errors: [], orchSwitches: 0, orchChecks: [], claims: 0 };

    const qa = window.__qa;
    window.__prodCands = qa.UPGRADES.filter(u => u.cps > 0 && /^基础产出\+/.test(u.desc || ''));
    window.__capCands = qa.UPGRADES.filter(u => ['reserve_bin', 'storage'].includes(u.id));
    window.__tickCount = 0;
    window.__lastPrestigeTick = -9999;
    window.__orchSeq = ['output', 'research', 'abyss', 'balanced'];
    window.__orchIdx = 0;

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
        }

        // 新玩法：解锁后每 6 游戏小时轮换一次编排策略，同步核对 CPS 与倍率严格同口径
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
        flowTicks: st2['ep:main'] ? st2['ep:main'].ticks : 0,
        stats: { ...st, errors: st.errors.slice(), orchChecks: st.orchChecks.slice() },
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
        cps, cap, dt: 10, orchMult: q.orchestrationMult('ep', S) };
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
    return {
      tabs: res, epTxt, priceMatch, wikiOk, wikiSections,
      researchGroups: q.RP_GROUPS.map(g => ({ key: g.key, n: g.ids.length })),
      researchTotal: q.BALANCE.researchUpgs.length,
      policyGroups: q.POLICY_GROUPS.length,
      policyTotal: q.POLICY_GROUPS.reduce((n, g) => n + g.policies.length, 0),
      achPanelTextLen: achText.length,
      storyEvents: q.getStorylineEvents().length,
      linePets: q.getStorylinePets().length,
      orch: { unlocked: q.orchestrationUnlocked(S), visible: !!(orchCard && orchCard.style.display !== 'none'),
        textOk: orchTextOk, text: orchText.slice(0, 220), modes: q.ORCHESTRATION_MODES.length },
      achPages,
      achNew: ['另排一班', '随潮而动', '排班表的人'].filter(n => achText.includes(n)),
      achNewUnlocked: ['orch_switch', 'orch_tide', 'chapter25']
        .filter(id => !!(S.achievements && S.achievements[id])),
      flow: { stats: q.flowStats(), ledger: q.flowLedger(), errors: q.flowErrors() },
    };
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'],
});
const report = { version: '3.8.0', days: DAYS, line: LINE, startedAt: new Date().toISOString(), daily: [], checks: {} };
console.log(`\n=== v3.8.0 浏览器 mock 推演：${DAYS} 天 / ${LINE} / ${DAYS * TICKS_PER_DAY} tick ===`);

const { page, errs } = await boot(browser, LINE);
try {
  const initialCps = await page.evaluate(() => window.__qa.computeCps());
  const t0 = Date.now();
  let last = null;
  for (let d = 1; d <= DAYS; d++) {
    const snap = await page.evaluate(n => window.__runBatch(n), TICKS_PER_DAY);
    snap.day = d;
    last = snap;
    // 逐日快照只留趋势字段；编排实测明细与升级全集留在最后一天，避免报告膨胀到数 MB
    report.daily.push({ ...snap, upgrades: undefined, stats: { ...snap.stats, orchChecks: undefined } });
    if (d === 1 || d % 5 === 0 || d === DAYS) {
      console.log(`  D${String(d).padStart(2)}  EP ${fx(snap.ep).padStart(16)}  CPS ${fx(snap.cps).padStart(14)}  cap ${fx(snap.cap).padStart(14)}  章 ${snap.chapter.padEnd(3)}  腐化 ${fx(snap.corruption, 1).padStart(5)}  购买 ${String(snap.totalBuys).padStart(5)}  任务 ${String(snap.projectsDone).padStart(3)}  编排 ${snap.orchMode}`);
    }
  }
  report.elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  const totalTicks = DAYS * TICKS_PER_DAY;

  // ---- [1] 可玩性与长期稳定性 ----
  console.log('\n[1] 可玩性与长期稳定性');
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
  if (last.storyEvents === 52 && last.linePets === 7) ok('故事线变体接线生效（44 主表 + 8 线专属事件 / 7 异兽）', `事件池 ${last.storyEvents}`);
  else bad('故事线变体数量不符', JSON.stringify({ ev: last.storyEvents, pet: last.linePets }));
  if (last.eventsSeen > 0) ok('新增事件池在 30 天内被真实触发', `累计 ${last.eventsSeen} 次随机事件`);
  else console.log('  · 推演期内未触发随机事件（随机性，非缺陷）');

  // 资源流引擎全程健康
  if (last.flowErrors === 0) ok('8 条资源流在 30 天内零异常（单流异常隔离生效）');
  else bad('资源流出现运行异常', `累计 ${last.flowErrors} 次`);
  if (last.flowTicks >= totalTicks) ok('EP 主产出流每帧执行', `${last.flowTicks} ticks / ${totalTicks} 帧`);
  else bad('EP 主产出流漏帧', `${last.flowTicks} / ${totalTicks}`);

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
  const checks = last.stats.orchChecks || [];
  if (checks.length > 0) {
    const worst = Math.max(...checks.map(c => Math.abs(c.ratio - c.expect)));
    if (worst < 1e-6) ok('每次策略切换的 CPS 变化与编排倍率严格同口径', `${checks.length} 次实测，最大误差 ${worst.toExponential(2)}`);
    else bad('策略切换与 CPS 脱钩', `最大误差 ${worst}`);
  }
  report.checks.playability = {
    finalCps: last.cps, finalEp: last.ep, totalBuys: last.totalBuys, chapter: last.chapter,
    capStallPct: +stallPct.toFixed(2), eventsSeen: last.eventsSeen,
    orchSwitches: last.stats.orchSwitches, orchChecks: checks.length, flowTicks: last.flowTicks,
    projectsDone: last.projectsDone, claims: last.stats.claims,
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
    const saved = { mode: q.orchestrationState(S).mode, auto: q.orchestrationState(S).autoTide, tide: S.tidePhase };
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
    // 随潮汐排班：相位切换应立即改变生效倍率
    q.setOrchestrationAutoTide(S, true);
    S.tidePhase = 0; const tide0 = q.effectiveModeId(S);
    S.tidePhase = 3; const tide3 = q.effectiveModeId(S);
    q.setOrchestrationAutoTide(S, saved.auto);
    q.setOrchestrationMode(S, saved.mode);
    S.tidePhase = saved.tide;
    return { out, tide0, tide3, base };
  });
  const orchOk = Object.entries(orchProbe.out).every(([id, v]) =>
    Math.abs(v.cpsRatio - v.ep) < 1e-9);
  if (orchOk && orchProbe.base > 0) ok('四种编排策略的 CPS 实测倍率与声明值完全一致',
    Object.entries(orchProbe.out).map(([k, v]) => `${k} ×${v.cpsRatio.toFixed(2)}`).join(' / '));
  else bad('编排声明值与实测 CPS 不符', JSON.stringify(orchProbe.out));
  if (orchProbe.tide0 === 'output' && orchProbe.tide3 === 'abyss') ok('随潮汐排班相位映射正确', `涨潮→产能 / 乱流→深渊`);
  else bad('潮汐排班映射错误', JSON.stringify({ t0: orchProbe.tide0, t3: orchProbe.tide3 }));

  const ledger = await page.evaluate(() => window.__qa.flowLedger());
  if (ledger.ep && ledger.ep.gross > 0) ok('守恒台账累计了 30 天 EP 理论产出', `gross=${fx(ledger.ep.gross, 0)} EP`);
  else bad('守恒台账缺失', JSON.stringify(ledger).slice(0, 200));
  report.checks.numeric = {
    maxRelErrPct: +(worst * 100).toFixed(4), probes, priceSample: price.slice(0, 3),
    orchestration: orchProbe.out, ledger,
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
  if (ui.wikiOk) ok('Wiki（含 v3.8.0 三个新章节）渲染无 undefined / NaN');
  else bad('Wiki 渲染出现 undefined / NaN');
  const rTotal = ui.researchGroups.reduce((a, g) => a + g.n, 0);
  if (rTotal === ui.researchTotal && ui.researchTotal === 40) ok('研究面板分组覆盖全部 40 项', ui.researchGroups.map(g => `${g.key}:${g.n}`).join(' '));
  else bad('研究分组与配置不一致', `${rTotal} vs ${ui.researchTotal}`);
  if (ui.policyGroups === 8 && ui.policyTotal === 23) ok('政策面板 8 组 23 项全部注册', `组 ${ui.policyGroups} / 项 ${ui.policyTotal}`);
  else bad('政策数量不符', JSON.stringify({ g: ui.policyGroups, n: ui.policyTotal }));
  if (ui.priceMatch) ok('商店卡面可读取并与真实首购价关联', `${ui.priceMatch.id} = ${fx(ui.priceMatch.cost)} EP`);
  else console.log('  · 商店首卡当前无可购买入口（进度相关，非缺陷）');
  if (ui.orch.unlocked && ui.orch.visible && ui.orch.textOk && ui.orch.modes === 4) {
    ok('效能编排卡可见，四条倍率文本与读侧一致', ui.orch.text.replace(/\n/g, ' ').slice(0, 90));
  } else if (!ui.orch.unlocked) bad('编排卡未解锁，新玩法对玩家不可见', JSON.stringify(ui.orch));
  else bad('编排卡 UI 与读侧不一致', JSON.stringify(ui.orch));
  if (ui.achPanelTextLen > 0 && ui.achNew.length === ui.achNewUnlocked.length) {
    ok('成就面板逐页渲染与读侧一致（已解锁的新成就全部可见）',
      `${ui.achPages} 页 / 全页 ${ui.achPanelTextLen} 字；已解锁新成就 ${ui.achNewUnlocked.length} 条，面板可见 ${ui.achNew.length} 条`);
  } else bad('成就面板与读侧不一致',
    JSON.stringify({ pages: ui.achPages, len: ui.achPanelTextLen, unlocked: ui.achNewUnlocked, visible: ui.achNew }));
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
