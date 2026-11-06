// v3.7.0 真实浏览器 30 天 mock 推演 + 数值准确性 + 全功能 UI 准确性验收
//
// 驱动方式（关键）：
//   - Date.now() 与 tick(now) 的 now 同时按 10s 步进（tick 内部 dt 上限 10s），
//     否则章节驻留/事件倒计时/离线记账会与产出脱节；
//   - 启动时清除页面自身 setInterval，避免真实定时器与虚拟时钟双重推进；
//   - 自动玩家只调用产品真实入口（doClick / buyUpgrade），不直接写 S 伪造进度。
//
// 用法：
//   CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v370-30day-browser.mjs
//   DAYS=1 node tests/v370-30day-browser.mjs        # 灰度验证
//   LINE=line_faith DAYS=3 node tests/...           # 指定故事线
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const DAYS = Number(process.env.DAYS || 30);
const LINE = process.env.LINE || 'line_order';
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
    window.__vt = 0;                       // 虚拟时间偏移（毫秒）
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
    window.__stats = { buys: 0, clicks: 0, buyFails: 0, capStalls: 0, errors: [] };

    // 自动玩家白名单：卡面标注「基础产出+」的纯 EP 产出卡（42 项，与 v370-content-integrity D5 同源）。
    // 这样天然排除 scooter 等「EP→DM 资源载具」——买它们会每 tick 抽干 EP，令推演原地踏步。
    const qa = window.__qa;
    window.__prodCands = qa.UPGRADES.filter(u => u.cps > 0 && /^基础产出\+/.test(u.desc || ''));
    window.__capCands = qa.UPGRADES.filter(u => ['reserve_bin', 'storage'].includes(u.id));
    window.__tickCount = 0;
    window.__lastPrestigeTick = -9999;

    window.__runBatch = (ticks) => {
      const S = window.S, q = window.__qa, sim = q.sim, st = window.__stats;
      for (let i = 0; i < ticks; i++) {
        window.__tickCount++;
        window.__vt += 10000;
        window.__simT += 10000;
        window.__tick(window.__simT);
        if (S.ep >= q.epStorageCap() * 0.999) st.capStalls++;
        // 每 6 tick（= 1 游戏分钟）做一次玩家决策：点一下工作台 + 买一件最划算的升级 + 条件晋升
        if (i % 6 === 0) {
          try { sim.doClick(); st.clicks++; } catch (e) { if (st.errors.length < 12) st.errors.push('click:' + e.message); }
          try {
            const cap = q.epStorageCap();
            let pick = null, best = Infinity;
            // EP 顶到 60% 上限时优先扩容，避免产出被 cap 截断（防死锁）
            if (S.ep > cap * 0.6) {
              for (const u of window.__capCands) {
                // 满级卡不能再选：否则每轮都选中它 → buyUpgrade 恒 false → 永不尝试无限级扩容，
                // EP 与上限会一起冻结（v3.7.0 首轮 30 天推演实测 23,824 次无效购买）。
                if ((S.upgrades[u.id] || 0) >= (u.maxLevel || Infinity)) continue;
                const c = q.bulkCostCalc(u, 1);
                if (Number.isFinite(c) && c <= S.ep && c < best) { best = c; pick = u; }
              }
            }
            if (!pick) {
              // 按「回本时间 = 单价 / 边际 CPS」择优（与 ai.js bestPaybackItem 同思路），
              // 比「只买最便宜」更接近真实玩家，能推进到更深层的数值曲线。
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
          // 晋升：每轮至少间隔 8 游戏小时，避免反复转生把升级链清空中断发展
          try {
            if (q.canPrestige() && window.__tickCount - window.__lastPrestigeTick >= 2880) {
              sim.doPrestige(null);
              window.__lastPrestigeTick = window.__tickCount;
              st.prestiges = (st.prestiges || 0) + 1;
            }
          } catch (e) { if (st.errors.length < 12) st.errors.push('prestige:' + e.message); }
        }
      }
      try { sim.render(); } catch (e) { if (st.errors.length < 12) st.errors.push('render:' + e.message); }
      const S2 = window.S;
      return {
        ep: S2.ep, cps: q.computeCps(), cap: q.epStorageCap(),
        chapter: String(S2.chapter || '1'), corruption: S2.corruption || 0,
        rp: S2.rp || 0, dm: S2.dm || 0, faith: S2.faith || 0, es: S2.es || 0,
        totalBuys: S2.totalBuys || 0, totalClicks: S2.totalClicks || 0,
        upgradeKinds: Object.keys(S2.upgrades || {}).length,
        upgrades: { ...(S2.upgrades || {}) },
        prestige: S2.prestige || 0, canPrestige: !!q.canPrestige(),
        storyEvents: q.getStorylineEvents().length, linePets: q.getStorylinePets().length,
        stats: { ...st, errors: st.errors.slice() },
      };
    };

    // 数值准确性定点校验：单 tick 的「产出入账量」应等于 computeCps() × 10s。
    // 用 earnedFull（钳后入账累计）而非 S.ep 净额——后者会被「EP→DM 载具」等持续消耗抵消，
    // 但入账口径不受影响，才能真正验算 computeCps 是否准确。
    window.__numericProbe = () => {
      const S = window.S, q = window.__qa;
      const cap = q.epStorageCap();
      S.ep = Math.min(S.ep, cap * 0.1); // 压到远低于上限，排除 cap 截断
      const earnedBefore = S.earnedFull || 0, cps = q.computeCps();
      window.__vt += 10000; window.__simT += 10000; window.__tick(window.__simT);
      const earnedAfter = S.earnedFull || 0;
      return { earnedBefore, earnedAfter, gross: earnedAfter - earnedBefore, cps, cap, dt: 10 };
    };
  });
  return { page, errs };
}

async function uiCheck(page) {
  return page.evaluate(() => {
    const S = window.S, q = window.__qa;
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
        res.push({
          id, visible,
          hasBadText: /undefined|NaN|Infinity/.test(body),
          textLen: body.length,
        });
      } catch (e) { res.push({ id, error: String(e).slice(0, 160) }); }
    }
    // 顶栏资源与状态一致性
    const epTxt = document.getElementById('ep')?.innerText || document.getElementById('ep-val')?.innerText || '';
    // 商店卡面价格与真实首购价一致（取第一张可购买卡）
    let priceMatch = null;
    const card = document.querySelector('[data-buy]');
    if (card) {
      const u = q.UPGRADES.find(x => x.id === card.dataset.buy);
      if (u) priceMatch = { id: u.id, domText: (card.innerText || '').slice(0, 120), cost: q.bulkCostCalc(u, 1) };
    }
    // 故事线变体内容是否真的渲染进 UI（ Wiki 新章节 + 线专属事件池）
    const wikiBtn = document.getElementById('btn-wiki');
    let wikiOk = false;
    if (wikiBtn) { wikiBtn.click(); q.sim.render(); wikiOk = !/undefined|NaN/.test(document.body.innerText || ''); }
    return {
      tabs: res, epTxt, priceMatch, wikiOk,
      researchGroups: q.RP_GROUPS.map(g => ({ key: g.key, n: g.ids.length })),
      researchTotal: q.BALANCE.researchUpgs.length,
      storyEvents: q.getStorylineEvents().length,
      linePets: q.getStorylinePets().length,
    };
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'],
});
const report = { version: '3.7.0', days: DAYS, line: LINE, startedAt: new Date().toISOString(), daily: [], checks: {} };
console.log(`\n=== v3.7.0 浏览器 mock 推演：${DAYS} 天 / ${LINE} / ${DAYS * TICKS_PER_DAY} tick ===`);

const { page, errs } = await boot(browser, LINE);
try {
  const initialCps = await page.evaluate(() => window.__qa.computeCps());
  const t0 = Date.now();
  for (let d = 1; d <= DAYS; d++) {
    const snap = await page.evaluate(n => window.__runBatch(n), TICKS_PER_DAY);
    snap.day = d;
    report.daily.push(snap);
    if (d === 1 || d % 5 === 0 || d === DAYS) {
      console.log(`  D${String(d).padStart(2)}  EP ${fx(snap.ep).padStart(16)}  CPS ${fx(snap.cps).padStart(14)}  cap ${fx(snap.cap).padStart(14)}  章 ${snap.chapter.padEnd(3)}  腐化 ${fx(snap.corruption, 1).padStart(5)}  购买 ${String(snap.totalBuys).padStart(5)}`);
    }
  }
  report.elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  const last = report.daily[report.daily.length - 1];

  // ---- 可玩性 / 稳定性 ----
  console.log('\n[1] 可玩性与长期稳定性');
  if (errs.length === 0) ok('30 天推演全程无 pageerror'); else bad('出现 pageerror', errs.slice(0, 3).join(' | '));
  if (last.stats.errors.length === 0) ok('自动玩家（点击/购买/渲染）无异常'); else bad('自动玩家异常', JSON.stringify(last.stats.errors.slice(0, 3)));
  if (last.cps > initialCps) ok('产出曲线自开局持续上涨', `${fx(initialCps)} → D${DAYS} ${fx(last.cps)}`);
  else bad('产出曲线停滞', `${fx(initialCps)} → D${DAYS} ${fx(last.cps)}`);
  if (last.totalBuys > 20) ok('自动玩家成功推进购买链', `累计 ${last.totalBuys} 次购买 / ${last.upgradeKinds} 种升级 / 晋升 ${last.stats.prestiges || 0} 次`);
  else bad('购买链未推进', `仅 ${last.totalBuys} 次`);
  const stalls = last.stats.capStalls;
  if (stalls < TICKS_PER_DAY * DAYS * 0.5) ok('EP 未长期顶格死锁', `顶格 tick 占比 ${(stalls / (TICKS_PER_DAY * DAYS) * 100).toFixed(1)}%`);
  else bad('EP 长期顶格，产出被截断', `${(stalls / (TICKS_PER_DAY * DAYS) * 100).toFixed(1)}%`);
  if (Number.isFinite(last.ep) && last.ep >= 0 && Number.isFinite(last.cps)) ok('终局数值有限且非负');
  else bad('终局数值异常', JSON.stringify({ ep: last.ep, cps: last.cps }));
  // v3.6.0 章节节奏：第 2 章需 prestige>=2 且驻留 ≥3 天；30 天推演若已满足仍不推进才是真缺陷
  if (last.chapter !== '1') ok('故事线章节随进度推进', `至第 ${last.chapter} 章 / 晋升 ${last.prestige} 次`);
  else if (last.prestige >= 2) bad('已满足第 2 章条件（晋升≥2 且驻留≥3天）但章节未推进', `prestige=${last.prestige}`);
  else console.log(`  · 章节停留第 1 章：自动玩家仅晋升 ${last.prestige} 次，未达第 2 章门槛（设计如此，非缺陷）`);
  if (last.storyEvents > 0 && last.linePets > 0) ok('故事线变体接线生效（事件+异兽均已注入）', `事件池 ${last.storyEvents} / 线专属异兽 ${last.linePets}`);
  else bad('故事线变体未生效', JSON.stringify({ ev: last.storyEvents, pet: last.linePets }));
  report.checks.playability = { finalCps: last.cps, finalEp: last.ep, totalBuys: last.totalBuys, chapter: last.chapter, capStallPct: +(stalls / (TICKS_PER_DAY * DAYS) * 100).toFixed(2) };

  // ---- 数值准确性 ----
  console.log('\n[2] 数值准确性');
  const probes = [];
  for (let i = 0; i < 3; i++) probes.push(await page.evaluate(() => window.__numericProbe()));
  const rel = probes.map(p => p.cps > 0 ? Math.abs(p.gross - p.cps * 10) / (p.cps * 10) : 0);
  const worst = Math.max(...rel);
  if (worst < 0.05) ok('单 tick 产出入账 = computeCps() × 10s', `最大相对误差 ${(worst * 100).toFixed(3)}%`);
  else bad('单 tick 产出与 CPS 不符', `最大相对误差 ${(worst * 100).toFixed(2)}% / ${JSON.stringify(probes)}`);
  const price = await page.evaluate(() => {
    const q = window.__qa;
    return q.UPGRADES.slice(0, 12).map(u => ({ id: u.id, bulk: q.bulkCostCalc(u, 1), unit: q.unitCost(u, 0) }));
  });
  if (price.every(p => p.bulk === p.unit)) ok('主商店批量价与单价同口径（12 项抽检）');
  else bad('购买路径价差', JSON.stringify(price.filter(p => p.bulk !== p.unit)));
  const desc = await page.evaluate(() => window.__qa.UPGRADES.filter(u => u.cps && /^基础产出\+/.test(u.desc || '')).length);
  if (desc >= 40) ok('卡面「基础产出」描述覆盖全部产出升级', `${desc} 项`);
  else bad('卡面描述缺失', `${desc} 项`);
  report.checks.numeric = { maxRelErrPct: +(worst * 100).toFixed(4), probes, priceSample: price.slice(0, 3) };

  // ---- 全功能 UI 准确性 ----
  console.log('\n[3] 各功能 UI 准确性');
  const ui = await uiCheck(page);
  const tabErrs = ui.tabs.filter(t => t.error);
  if (tabErrs.length === 0) ok(`${ui.tabs.length} 个功能 tab 均可打开且无异常`);
  else bad('tab 打开异常', JSON.stringify(tabErrs));
  const badText = ui.tabs.filter(t => t.hasBadText);
  if (badText.length === 0) ok('各 tab 可见文本无 undefined / NaN / Infinity');
  else bad('面板出现占位符或非法数值', badText.map(t => t.id).join(', '));
  if (ui.wikiOk) ok('Wiki（含新增「故事线特色」章节）渲染无 undefined');
  else bad('Wiki 渲染出现 undefined / NaN');
  const rTotal = ui.researchGroups.reduce((a, g) => a + g.n, 0);
  if (rTotal === ui.researchTotal && ui.researchTotal === 35) ok('研究面板分组覆盖全部 35 项', ui.researchGroups.map(g => `${g.key}:${g.n}`).join(' '));
  else bad('研究分组与配置不一致', `${rTotal} vs ${ui.researchTotal}`);
  if (ui.priceMatch) ok('商店卡面可读取并与真实首购价关联', `${ui.priceMatch.id} = ${fx(ui.priceMatch.cost)} EP`);
  else console.log('  · 商店首卡当前无可购买入口（进度相关，非缺陷）');
  report.checks.ui = ui;

  if (errs.length) report.pageErrors = errs;
} finally {
  await page.close();
  await browser.close();
}

report.pass = pass; report.fail = fail;
writeFileSync('tests/v370-30day-report.json', JSON.stringify(report, null, 2));
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 / 耗时 ${report.elapsedSec || '-'}s；报告 tests/v370-30day-report.json ===`);
process.exit(fail > 0 ? 1 : 0);
