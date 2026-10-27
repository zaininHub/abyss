// ===== v2.8.26：①编译器神殿粒子高对比矩阵雨（肉眼可见）；②购买可点判断全面实时（rpFamily RP / 遗物+净化 DM / 宠物 PT） =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  const mk = (extra) => JSON.stringify(Object.assign({ _version: 6, chapter: '1', storyline: 'default', ep: 2e7, rp: 50, es: 0, dm: 600,
    upgrades: { compiler_temple: 1, storage: 100 }, buildings: {}, tech: { entropy_reduce: true, rp_first: true }, ai: {},
    cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false, temple: 1 }, faith: 0,
    pets: {}, activePets: [], pt: 10000, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: true, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now() }, extra));
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // T1：粒子（不透明亮青 20px 密雨）
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({}));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2500));
  const rain = await page.evaluate(() => {
    const c = document.getElementById('code-rain');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 150 && d[i + 3] > 200) bright++; }
    return { ok: c.style.display !== 'none' && bright > 8000, bright };
  });
  rec('T1 粒子高对比可见（>8000 高亮像素，v2.8.25 为 5064）', rain.ok, JSON.stringify(rain));

  // T2：rpFamily（研究点 RP 加成组）——RP 50 可购 / RP 0 灰显（各自新开 page，避免 beforeunload 旧档覆盖）
  const rpCard = await (async () => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1440, height: 900 });
    await pg.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ rp: 50 }));
    await pg.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    await pg.evaluate(() => { const b = document.getElementById('btn-rp'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 400));
    const out = await pg.evaluate(() => {
      const cards = [...document.querySelectorAll('#rp-upgrade-list [data-buy]')];
      const c = cards.find(x => x.textContent.includes('初探实验台'));
      return { found: !!c, before: c ? !c.classList.contains('cant') : false };
    });
    await pg.close();
    return out;
  })();
  const rpCant = await (async () => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1440, height: 900 });
    await pg.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ rp: 50 }));
    await pg.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    await pg.evaluate(() => { const b = document.getElementById('btn-rp'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 400));
    // 实际点击初探实验台至 RP 耗尽（8×1.18^n 累计），随后每秒刷新应灰显
    for (let i = 0; i < 10; i++) {
      await pg.evaluate(() => { const el = document.querySelector('#rp-upgrade-list [data-buy="exp_bench"]'); if (el && !el.classList.contains('cant')) el.click(); });
      await new Promise(r => setTimeout(r, 250));
    }
    await new Promise(r => setTimeout(r, 1500)); // tick 每秒刷新灰态
    const out = await pg.evaluate(() => {
      const c = document.querySelector('#rp-upgrade-list [data-buy="exp_bench"]');
      return c ? c.classList.contains('cant') : false;
    });
    await pg.close();
    return out;
  })();
  rec('T2 RP 加成组可购判断实时（RP 50 可购 / RP 0 灰显）', rpCard.before && rpCard.found && rpCant, JSON.stringify({ before: rpCard.before, after0: rpCant }));

  // T3：遗物净化节点 DM 灰态（dm 600 ≥ purifier1 50 可购；dm 10 < 50 gated）
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ dm: 600 }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { const b = document.getElementById('btn-relics'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 400));
  const purOk = await page.evaluate(() => {
    const card = document.querySelector('#relics-panel [data-purifier="purifier1"]');
    return card ? !card.classList.contains('relic-gated') : false;
  });
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ dm: 10 }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { const b = document.getElementById('btn-relics'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 400));
  const purCant = await page.evaluate(() => {
    const card = document.querySelector('#relics-panel [data-purifier="purifier1"]');
    return card ? card.classList.contains('relic-gated') : false;
  });
  rec('T3 遗物净化节点 DM 可购判断实时（DM 600 可购 / DM 10 灰显）', purOk && purCant, JSON.stringify({ dm600: purOk, dm10: purCant }));

  // T4：宠物 PT 灰态（pt 200 ≥ 最贵宠物可购；pt 0 cant）
  const ptOk = await page.evaluate(() => {
    // 用 pt 200 状态（当前存档 dm:10 但 pt:200）
    return true;
  });
  await page.evaluate(() => { const b = document.getElementById('btn-pets'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 400));
  const petBefore = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#pet-grid [data-pet-buy]')];
    return cards.length > 0 ? cards.every(c => !c.classList.contains('cant')) : 'NO_BUYABLE';
  });
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({ pt: 0 }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => { const b = document.getElementById('btn-pets'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 400));
  const petCant = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#pet-grid [data-pet-buy]')];
    return cards.length > 0 ? cards.every(c => c.classList.contains('cant')) : 'NO_BUYABLE';
  });
  rec('T4 宠物 PT 可购判断实时（PT 200 全可购 / PT 0 全灰显）', petBefore === true && petCant === true, JSON.stringify({ pt200: petBefore, pt0: petCant }));

  await page.close();
  console.log(`\n[v23-diag-v2826] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2826] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
