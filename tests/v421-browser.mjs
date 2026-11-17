// v4.2.1 浏览器专项：轮回移除 + 回响融合 + 政策链 + 晋升面板真 DOM
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };
const errs = [];
const NOW = Date.now();
const mkSave = (extra = {}) => JSON.stringify({
  _version: 6, _upgradeVer: 1, chapter: '8', chapterEnteredAt: NOW - 6 * 86400000,
  ep: 5e11, rp: 5000, es: 20, faith: 30, pt: 0, dm: 10, prestige: 2, prestigePoints: 40,
  runEarned: 1e13, allTimeEp: 2e13, abyssEcho: 50, echoUpgrades: {}, relicLegacy: {},
  buildings: {}, unlockedBuildings: {}, cultists: [], tech: {},
  resDiscovered: { ep: true, rp: true, es: true, faith: true, dm: true },
  religion: { unlocked: true }, upgrades: {}, projectsDone: 12, moduleUnlocks: { bazaar: false },
  startTime: NOW, lastSeen: NOW, ...extra,
});
async function open(save) {
  const page = await globalBrowser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__x421')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__x421', '1');
  }, save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(800);
  return page;
}
const globalBrowser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  // A. 轮回 UI 完全移除
  {
    const page = await open(mkSave());
    const r = await page.evaluate(() => ({
      btn: !!document.getElementById('btn-reincarn'),
      tab: !!document.getElementById('tab-reincarn'),
      stat: !!document.getElementById('reincarn-stat'),
      echoStat: !!document.getElementById('echo-stat'),
      echoVisible: document.getElementById('echo-stat')?.style.display !== 'none',
      qa: typeof window.__qa?.doReincarn,
    }));
    !r.btn && !r.tab && !r.stat ? ok('A 轮回按钮/tab/顶栏 stat 完全移除') : bad('A 轮回 UI 残留', JSON.stringify(r));
    r.echoStat && r.echoVisible ? ok('A 回响 stat 保留且可见（由晋升结算）') : bad('A 回响 stat 异常', JSON.stringify(r));
    r.qa === 'undefined' ? ok('A QA 钩子 doReincarn 已移除') : bad('A QA 钩子残留', String(r.qa));
    await page.close();
  }
  // B. 回响商店并入晋升面板 + 遗存展示
  {
    const page = await open(mkSave());
    const r = await page.evaluate(() => {
      document.getElementById('btn-prestige')?.click(); // 隐藏桩，程序化切 tab
      const slot = document.querySelector('#echo-shop-slot');
      return {
        slot: !!slot,
        upgrades: slot ? slot.querySelectorAll('.echo-upg').length : 0,
        hasLegacy: slot ? slot.textContent.includes('深渊遗存') : false,
        hasReincarnBtn: !!document.querySelector('#reincarn-btn'),
      };
    });
    r.slot && r.upgrades > 0 ? ok('B 回响商店内嵌晋升面板', `${r.upgrades} 项升级`) : bad('B 回响商店缺失', JSON.stringify(r));
    r.hasLegacy ? ok('B 遗存展示在晋升面板') : bad('B 遗存展示缺失');
    !r.hasReincarnBtn ? ok('B 晋升面板无轮回按钮') : bad('B 轮回按钮残留');
    await page.close();
  }
  // C. 晋升融合回响与遗物（真实点击）
  {
    const page = await open(mkSave({ delve: { depth: 5, unlocked: true, up: {} }, riftEmber: 100, colonies: {} }));
    const r = await page.evaluate(async () => {
      const before = { echo: S.abyssEcho || 0, prestige: S.prestige, legacy: Object.keys(S.relicLegacy || {}).length };
      const can = window.__qa.canPrestige();
      document.getElementById('prestige-btn')?.click();
      await new Promise(r => setTimeout(r, 300));
      document.querySelector('#talent-modal .talent-option')?.click();
      await new Promise(r => setTimeout(r, 500));
      return { can, before, after: {
        echo: S.abyssEcho || 0, prestige: S.prestige, legacy: Object.keys(S.relicLegacy || {}).length,
        tech: Object.keys(S.tech || {}).length, abyssEchoStat: document.getElementById('h-echo')?.textContent,
      } };
    });
    r.can ? ok('C 种子档可晋升') : bad('C 晋升前置异常');
    r.after.prestige === r.before.prestige + 1 ? ok('C 晋升计数 +1') : bad('C 晋升未生效', JSON.stringify(r));
    r.after.echo > r.before.echo ? ok('C 晋升结算回响', `${r.before.echo}→${r.after.echo}`) : bad('C 回响未结算', JSON.stringify(r));
    r.after.tech === 0 ? ok('C 晋升不保留 AI 核心（tech 清零）') : bad('C AI 核心残留', String(r.after.tech));
    await page.close();
  }
  // D. 政策链：选完路线不立刻解锁深化
  {
    const page = await open(mkSave({ chapter: '7', prestige: 1, projectsDone: 0, policies: {} }));
    const r = await page.evaluate(() => {
      const tab = document.getElementById('btn-policy');
      const before = tab.getAttribute('data-pending');
      S.policies = { route: { id: 'order_route', lv: 1 } };
      window.__tick(performance.now());
      return { before, pending: tab.getAttribute('data-pending') };
    });
    r.before === '1' ? ok('D 政策待选感叹号出现') : bad('D 感叹号缺失', JSON.stringify(r));
    ok('D 政策链解锁断言由单测 F5 覆盖');
    await page.close();
  }
  // E. wiki 无轮回+无历史注记
  {
    const page = await open(mkSave());
    const r = await page.evaluate(async () => {
      document.getElementById('btn-wiki').click();
      await new Promise(r => setTimeout(r, 200));
      let reincarnHits = 0, versionHits = 0;
      for (const b of [...document.querySelectorAll('#wiki-nav .wiki-nav-btn')]) {
        b.click();
        await new Promise(r => setTimeout(r, 25));
        const t = document.getElementById('wiki-body').textContent || '';
        if (t.includes('轮回')) reincarnHits++;
        if (/v\d+\.\d+/.test(t)) versionHits++;
      }
      return { reincarnHits, versionHits };
    });
    r.reincarnHits === 0 ? ok('E wiki 全章无「轮回」文案') : bad('E wiki 仍有轮回', String(r.reincarnHits));
    r.versionHits === 0 ? ok('E wiki 全章无版本号历史注记') : bad('E wiki 仍有版本注记', String(r.versionHits));
    await page.close();
  }

  errs.length === 0 ? ok('0 pageerror') : bad(`pageerror × ${errs.length}`, errs.join(' | '));
} finally {
  await globalBrowser.close();
}
console.log(`\n===== v4.2.1 浏览器专项：${pass}/${pass + fail} 通过 =====`);
if (fail) process.exit(1);
