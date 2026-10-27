// ===== v2.8.11 五条反馈浏览器实测（逐条） =====
// ①EP达上限任务进度不涨 ②蒸馏按钮注释文本不再显示 ③科技树3列无留空 ④hero无薪资行 ⑤研究点消耗显示总消耗
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  ok ? pass++ : fail++;
};
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {}, cultists: [],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: false, run: false, tide: false, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
  unlockedBuildings: {}, allTimeEp: 0, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 EP 达上限后任务进度（earnedFull）不涨：注入满 EP + 产出线程，等 3s 检查
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 2000, runEarned: 0, allTimeEp: 0, earnedFull: 0, cultists: [{ id: 1, name: 'T', output: 2, mood: '正常', moodTimer: 999 }] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));
    const t1 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { ep: s.ep, earnedFull: s.earnedFull, runEarned: s.runEarned };
    });
    rec('T1 EP 满上限后任务进度 earnedFull 不再增长', t1.earnedFull === 0 && t1.ep === 2000, JSON.stringify(t1));
    await page.close();
  }

  // T2 蒸馏按钮无注释文本（// v2.8.10 不应渲染到界面）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 0, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-rp');
    await new Promise(r => setTimeout(r, 500));
    const t2 = await page.evaluate(() => {
      const b = document.getElementById('rp-distill-btn');
      const leak = (b ? b.outerHTML : '').includes('v2.8.10') || document.body.textContent.includes('// v2.8.10');
      return { leak, btnText: b ? b.textContent : null, disabled: b ? b.disabled : null };
    });
    rec('T2 蒸馏按钮不渲染 JS 注释文本', !t2.leak && t2.btnText === '蒸馏 25% EP' && t2.disabled === true, JSON.stringify(t2));
    await page.close();
  }

  // T3 科技树固定 3 列：6 卡满排无空位
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e5, rp: 0, upgrades: { storage: 32 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 500));
    const t3 = await page.evaluate(() => {
      const grid = document.querySelector('#tech-tree .tech-grid') || document.querySelector('#tech-tree');
      const cols = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      const cards = [...document.querySelectorAll('#tech-tree [data-tech]')].length;
      const emptyTrack = cols - (cards % cols || cols);
      return { cols, cards, emptyTracks: emptyTrack };
    });
    rec('T3 科技树 3 列固定（6 卡排满无留空）', t3.cols === 3 && t3.cards === 6 && t3.emptyTracks === 0, JSON.stringify(t3));
    await page.close();
  }

  // T4 hero 无薪资行（薪资总额只顶部 h-salary）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t4 = await page.evaluate(() => ({
      hasSalary: !!document.getElementById('staff-salary'),
      heroText: document.getElementById('hero').parentElement.textContent.includes('薪资'),
      topSalary: !!document.getElementById('h-salary'),
    }));
    rec('T4 hero 无「薪资」行，顶部消耗/s 保留', !t4.hasSalary && !t4.heroText && t4.topSalary, JSON.stringify(t4));
    await page.close();
  }

  // T5 研究点升级消耗显示总消耗（无「还差」）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e5, rp: 5, upgrades: { storage: 32 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-rp');
    await new Promise(r => setTimeout(r, 500));
    const t5 = await page.evaluate(() => {
      const costs = [...document.querySelectorAll('#research-upgrade-list .cost')].map(e => e.textContent.trim());
      return { costs: costs.slice(0, 3), hasDiff: document.querySelector('#research-upgrade-list').textContent.includes('还差') };
    });
    rec('T5 研究点升级消耗显示总 RP（无「还差 X」）', !t5.hasDiff && t5.costs.every(x => /^\d/.test(x)), JSON.stringify(t5));
    await page.close();
  }
  console.log(`\n[v23-diag-v2811] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
