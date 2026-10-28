// ===== v2.8.26：①编译器神殿粒子密度（截图可辨）；④可购买判断全局统一（RP 加成组/宗教/裂隙余烬） =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const mk = (o) => JSON.stringify(Object.assign({ _version: 6, chapter: '6', storyline: 'line_abyss', ep: 5e7, rp: 50, es: 0, dm: 400,
  upgrades: { compiler_temple: 1, storage: 30 }, buildings: {}, tech: { entropy_reduce: true }, ai: {},
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: true, branch: 'sun', temple: 1 }, faith: 0,
  pets: {}, activePets: [], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now() }, o));
try {
  // T1 粒子密度：144 列双层雨（bright 应远高于上一轮 5064）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({}));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));
    const rain = await page.evaluate(() => {
      const c = document.getElementById('code-rain');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let bright = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 120 && d[i + 3] > 180) bright++; }
      return { display: c.style.display, bright };
    });
    rec('T1 编译器神殿粒子密集（bright > 12000，144 列双层雨）', rain.display === '' && rain.bright > 12000, JSON.stringify(rain));
    await page.close();
  }
  // T2 RP 加成组灰态：RP 50 → 卡 cant；RP 5000 → 卡可购
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ rp: 0, ep: 1000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const b = document.getElementById('btn-rp'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const poor = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#rp-upgrade-list .item')];
      return cards.length > 0 ? cards.some(c => c.classList.contains('cant')) : 'NO CARDS';
    });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ rp: 50000, ep: 1000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const b = document.getElementById('btn-rp'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const rich = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#rp-upgrade-list .item')];
      return cards.length > 0 ? cards.some(c => c.classList.contains('cant')) : 'NO CARDS';
    });
    rec('T2 RP 加成组灰态（RP 0 灰显 / RP 50000 可购）', poor === true && rich === false, `poor=${poor} rich=${rich}`);
    await page.close();
  }
  // T3 宗教按钮：信仰 0 → 圣印/神谕塔 disabled；信仰 1000 → 可购
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ faith: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const b = document.getElementById('btn-religion'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const poor = await page.evaluate(() => {
      const seal = document.querySelector('[data-religion-seal]');
      return { sealDis: seal ? seal.classList.contains('disabled') : 'none' };
    });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ faith: 5000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const b = document.getElementById('btn-religion'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const rich = await page.evaluate(() => {
      const seal = document.querySelector('[data-religion-seal]');
      return { sealDis: seal ? seal.classList.contains('disabled') : 'none' };
    });
    rec('T3 宗教按钮灰态（信仰 0 → 圣印灰显；信仰 5000 → 可购）', poor.sealDis === true && rich.sealDis === false, JSON.stringify({ poor, rich }));
    await page.close();
  }
  // T4 裂隙余烬升级：余烬 0 → disabled；余烬 1000 → 可购
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ riftEmber: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const b = document.getElementById('btn-rift-tab'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const poor = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-rift-upg]')];
      return { rows: rows.length, anyDisabled: rows.some(row => { const b = row.querySelector('button'); return b ? b.classList.contains('disabled') : false; }) };
    });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ riftEmber: 2000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const b = document.getElementById('btn-rift-tab'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 500));
    const rich = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-rift-upg]')];
      return { anyDisabled: rows.some(row => { const b = row.querySelector('button'); return b ? b.classList.contains('disabled') : false; }) };
    });
    rec('T4 裂隙余烬升级灰态（余烬 0 → disabled；余烬 2000 → 可购）', poor.rows > 0 && poor.anyDisabled === true && rich.anyDisabled === false, JSON.stringify({ poor, rich }));
    await page.close();
  }
  console.log(`\n[v23-diag-v2826] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2826] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
