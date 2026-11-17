// v4.1.1 BUGFIX 专项：旧档 rAF 基 lazySince 脏值不再显示「怠工已持续 17 亿秒」
//
// 用户反馈：v4.1.0 F4 声称修了「17 亿秒」，但旧档仍然显示 1794875137s（≈当前 Unix 秒时间戳）。
// 根因：v4.1.0 只修了写入侧（ctx.now rAF 基 → Date.now），存量脏值没清洗。
// 本专项用真实浏览器 + 真实 dist/index.html + 注入旧档脏值，验收：
//   ① 旧档 lazySince=48321（rAF 基）→ 加载后不懒惰、徽章非「懒惰」；
//   ② 悬浮说明不含 17 亿秒级数字（怠工时长 ≤ 合理秒数）；
//   ③ 合法 Unix 毫秒时间戳（Date.now()-61s）仍正常触发懒惰（防过度修复）；
//   ④ 0 pageerror。
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = (lazySince, lazyLowSince) => JSON.stringify({
  _version: 6, chapter: 4, ep: 5000, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 10,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 9, prestigePoints: 3,
  lazySince, lazyLowSince,
  lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const errs = [];
try {
  // ========== 场景 A：旧档 rAF 基脏值 ==========
  {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push('A:' + String(e).slice(0, 160)));
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1366, height: 800 });
    await page.evaluateOnNewDocument(s => {
      if (sessionStorage.getItem('__seeded')) return;
      localStorage.setItem('abyss_idle_v2', s);
      sessionStorage.setItem('__seeded', '1');
    }, mkSave(48321, 12345));
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(1500);

    const r = await page.evaluate(() => {
      const el = document.getElementById('staff-status');
      const tip = document.querySelector('[data-tip], #wage-tip-pop');
      return {
        lazySince: window.S && window.S.lazySince,
        lazyLowSince: window.S && window.S.lazyLowSince,
        badge: el ? el.textContent.trim() : null,
        aria: el ? el.getAttribute('aria-label') : null,
        tip: tip ? (tip.textContent || tip.getAttribute('data-tip') || '') : '',
        isLazy: !!(window.__qa && window.__qa.isLazy && window.__qa.isLazy()),
      };
    });
    ok('A1 load() 清洗旧档 rAF 基 lazySince', r.lazySince === null || r.lazySince === 0, JSON.stringify(r.lazySince));
    ok('A2 load() 清洗旧档 rAF 基 lazyLowSince', r.lazyLowSince === null || r.lazyLowSince === 0, JSON.stringify(r.lazyLowSince));
    ok('A3 徽章不显示「懒惰」', r.badge !== '懒惰', `徽章：${r.badge}`);
    const allText = `${r.aria || ''} ${r.tip || ''}`;
    const bigNum = /怠工已持续\s*(\d+)s/.exec(allText);
    ok('A4 无 17 亿秒级时长', !bigNum || Number(bigNum[1]) < 3600, allText.slice(0, 120));
    await page.close();
  }

  // ========== 场景 B：合法 Unix 毫秒时间戳仍正常触发 ==========
  {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push('B:' + String(e).slice(0, 160)));
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: 1366, height: 800 });
    await page.evaluateOnNewDocument(s => {
      if (sessionStorage.getItem('__seeded')) return;
      localStorage.setItem('abyss_idle_v2', s);
      sessionStorage.setItem('__seeded', '1');
    }, mkSave(Date.now() - 61000, null));
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(1500);

    const r = await page.evaluate(() => {
      const el = document.getElementById('staff-status');
      return {
        badge: el ? el.textContent.trim() : null,
        aria: el ? el.getAttribute('aria-label') : null,
        lazySince: window.S && window.S.lazySince,
      };
    });
    ok('B1 合法时间戳不被读侧误清洗', r.lazySince > 1e12, JSON.stringify(r.lazySince));
    ok('B2 合法时间戳仍触发懒惰态', r.badge === '懒惰', `徽章：${r.badge}`);
    const m = /怠工已持续\s*(\d+)s/.exec(r.aria || '');
    ok('B3 怠工时长合理（60~300s）', !!m && Number(m[1]) >= 60 && Number(m[1]) < 300, r.aria || '');
    await page.close();
  }

  ok('C 0 pageerror', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
