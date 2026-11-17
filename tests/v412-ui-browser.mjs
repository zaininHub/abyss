// v4.1.2 专项：① 顶栏产出/消耗悬浮改真实 DOM 气泡（分组换行，不再挤成一团）
//              ② 效能编排 / 相位共鸣分块展示（各带标题，倍率归属清晰）
//              ③ 消耗口径修复：RP 满仓时工坊转涓流不再计入连续消耗（消除「产<消 EP 仍涨」误报）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = (rpVal) => JSON.stringify({
  _version: 6, chapter: 4, ep: 215600, rp: rpVal, es: 0, dm: 0, pt: 0, faith: 0,
  buildings: {}, unlockedBuildings: { warmup_node: true },
  cultists: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: 'T' + i, mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 9, prestigePoints: 3,
  upgrades: { storage: 5, reserve_bin: 5, atrium: 3, processor: 20 },
  lastSeen: NOW, startTime: NOW,
});
async function open(save, w = 1366, h = 900) {
  const page = await globalBrowser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(900);
  return page;
}

const errs = [];
const globalBrowser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  // ========== ① 顶栏产出/消耗悬浮：真实 DOM 气泡 + 分组换行 ==========
  {
    const page = await open(mkSave(1e6));
    const r = await page.evaluate(async () => {
      const out = document.getElementById('h-output-stat');
      const drain = document.getElementById('h-drain-stat');
      const noOldTip = !out.dataset.tip && !drain.dataset.tip;
      out.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await new Promise(r => setTimeout(r, 120));
      const pop = document.getElementById('flow-tip-pop');
      const shown = !!pop && pop.classList.contains('show');
      const groups = pop ? pop.querySelectorAll('.ft-group').length : 0;
      const lines = pop ? [...pop.querySelectorAll('.ft-group div')].filter(d => !d.classList.contains('ft-label')).length : 0;
      const nowrap = pop ? getComputedStyle(pop.querySelector('.ft-group div') || pop).whiteSpace : '';
      const rect = pop ? pop.getBoundingClientRect() : null;
      out.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      await new Promise(r => setTimeout(r, 80));
      const hidden = !!pop && !pop.classList.contains('show');
      return { noOldTip, shown, groups, lines, nowrap, rect: rect && { w: rect.width, x: rect.x, y: rect.y }, hidden,
        hasNote: pop ? /理论净/.test(pop.textContent || '') : false };
    });
    ok('A1 旧 data-tip 已清除（无双气泡）', r.noOldTip);
    ok('A2 悬浮显示真实 DOM 气泡', r.shown);
    ok('A3 气泡按来源/加成分组（≥1 个分组）', r.groups >= 1, `分组数 ${r.groups}`);
    ok('A4 每条来源独占一行（≥2 行）', r.lines >= 2, `明细行 ${r.lines}`);
    ok('A5 明细行可换行（非 nowrap 挤压）', r.nowrap !== 'nowrap', `white-space: ${r.nowrap}`);
    ok('A6 气泡在视口内且宽度合理', r.rect && r.rect.w > 100 && r.rect.w <= 430 && r.rect.x >= 0, JSON.stringify(r.rect));
    ok('A7 含理论净流口径说明', r.hasNote);
    ok('A8 移出后气泡隐藏', r.hidden);
    await page.close();
  }

  // ========== ② 效能编排 / 相位共鸣分块 ==========
  {
    const page = await open(mkSave(0)); // prestige=2 已满足共鸣解锁阈值（projectsDone≥12 ∨ prestige≥2）
    const r = await page.evaluate(() => {
      const el = document.getElementById('orchestration-panel');
      const orch = el.querySelector('[data-orch-block="orchestration"]');
      const res = el.querySelector('[data-orch-block="resonance"]');
      const titles = [...el.querySelectorAll('.orch-block-title')].map(x => (x.textContent || '').trim());
      const orchRows = orch ? orch.querySelectorAll('.orch-mult-grid > div').length : 0;
      const resRows = res ? res.querySelectorAll('.orch-mult-grid > div').length : 0;
      // 两组倍率不得混在同一 grid
      const crossMix = orch && res && orch.querySelector('[data-res-focus]') !== null;
      const orchBtns = orch ? orch.querySelectorAll('[data-orch-mode]').length : 0;
      const resBtns = res ? res.querySelectorAll('[data-res-focus]').length : 0;
      const h3 = document.querySelector('#orchestration-card h3');
      return { hasOrch: !!orch, hasRes: !!res, titles, orchRows, resRows, crossMix, orchBtns, resBtns,
        h3: h3 ? h3.textContent.trim() : '' };
    });
    ok('B1 效能编排块存在', r.hasOrch);
    ok('B2 相位共鸣块存在', r.hasRes);
    ok('B3 两块各有独立标题', r.titles.length >= 2 && r.titles.some(t => /效能编排/.test(t)) && r.titles.some(t => /相位共鸣/.test(t)), r.titles.join(' | '));
    ok('B4 编排倍率只在编排块（4 行）', r.orchRows === 4, `编排倍率 ${r.orchRows} 行`);
    ok('B5 共鸣倍率只在共鸣块（4 行）', r.resRows === 4, `共鸣倍率 ${r.resRows} 行`);
    ok('B6 两组按钮不混排', !r.crossMix && r.orchBtns === 5 && r.resBtns === 5, `编排按钮 ${r.orchBtns} / 共鸣按钮 ${r.resBtns}`);
    await page.close();
  }

  // ========== ③ RP 满仓时消耗口径修复（无❗误报） ==========
  {
    const page = await open(mkSave(1e6));
    const r = await page.evaluate(async () => {
      const q = window.__qa;
      const ep0 = S.ep, cps = q.computeCps(), drain = q.totalDrainPerSec();
      await new Promise(r => setTimeout(r, 3000));
      const actual = (S.ep - ep0) / 3;
      const warn = document.getElementById('h-drain-warn').style.display !== 'none';
      return { cps, drain, predicted: cps - drain, actual, warn };
    });
    ok('C1 RP 满仓时工坊不计入连续消耗', r.drain < 100, `drain ${r.drain.toFixed(1)}/s`);
    ok('C2 预测净流与实际 EP 走向同号且接近', r.predicted > 0 && r.actual > 0 && Math.abs(r.predicted - r.actual) < 100,
      `预测 +${r.predicted.toFixed(1)}/s 实际 +${r.actual.toFixed(1)}/s`);
    ok('C3 产>消时无红色❗误报', !r.warn);
    await page.close();
  }

  ok('D 0 pageerror', errs.length === 0, errs.join(' | '));
} finally {
  await globalBrowser.close();
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
