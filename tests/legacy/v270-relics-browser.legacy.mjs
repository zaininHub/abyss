import { chromePath } from '../_chrome.mjs';
// v2.7.0 深渊遗物浏览器实测：入口门控 / 面板渲染 / 购买 / 截屏自检
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5e6, rp: 20, es: 1, dm: 900, runEarned: 2e7,
  upgrades: { scribble: 3, fishbowl: 3 }, buildings: { abyss_anchor: 1, end_shrine: 1 },
  tech: { ai_core: true }, ai: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: true, branch: 'sun', sun: true, seal: 1 }, faith: 3,
  pets: {}, activePets: [], fusesDone: 0, delve: {}, activeRift: null, riftsSealed: 3, riftEmber: 0, riftUpgrades: {},
  relics: { tome: 2, prayer: 1 }, // v2.7.0 已购遗物
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now(), unlockedBuildings: { abyss_anchor: true, end_shrine: true } };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 120)));
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
  await page.goto(fileUrl, { waitUntil: 'load' });
  await sleep(6000);
  // 遗物入口显示（裂隙+DM → 应可见）
  const relicBtnShown = await page.evaluate(() => {
    const b = document.getElementById('btn-relics');
    return b ? b.style.display !== 'none' : null;
  });
  rec('V1 遗物 tab 入口显示（裂隙触发 + DM 发现）', relicBtnShown === true, `shown=${relicBtnShown}`);
  // 切遗物 tab → 面板渲染
  await page.evaluate(() => document.getElementById('btn-relics').click());
  await sleep(400);
  const panel = await page.evaluate(() => {
    const p = document.getElementById('relics-panel');
    const cards = p ? p.querySelectorAll('.relic-card').length : 0;
    const text = p ? p.textContent : '';
    return { cards, hasTome: text.includes('深渊古卷'), hasLv: text.includes('Lv.2/5'), dmShown: text.includes('900') || text.includes('DM') };
  });
  rec('V2 遗物面板渲染（6 张卡 + 已购等级显示）', panel.cards === 6 && panel.hasTome && panel.hasLv, JSON.stringify(panel));
  // 购买永暗祷文（DM 900，prayer Lv1 → 成本 80×1.8=144）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#relics-panel button')].find(b => b.dataset.relicBuy === 'prayer');
    if (btn) btn.click();
  });
  await sleep(300);
  const bought = await page.evaluate(() => {
    const p = document.getElementById('relics-panel');
    const card = [...p.querySelectorAll('.relic-card')].find(c => c.dataset.relic === 'prayer');
    return card ? card.textContent.includes('Lv.2/5') : false;
  });
  rec('V3 购买永暗祷文成功（Lv.1 → Lv.2）', bought === true);
  // 截屏自检：商店 tab（含触手鱼缸）
  await page.evaluate(() => document.getElementById('btn-shop').click());
  await sleep(400);
  await page.screenshot({ path: '../../artifacts/screenshots_v270/_shot-shop.png' });
  // 晋升页截屏
  await page.evaluate(() => document.getElementById('btn-prestige').click());
  await sleep(400);
  await page.screenshot({ path: '../../artifacts/screenshots_v270/_shot-prestige.png' });
  // 遗物页截屏
  await page.evaluate(() => document.getElementById('btn-relics').click());
  await sleep(400);
  await page.screenshot({ path: '../../artifacts/screenshots_v270/_shot-relics.png' });
  console.log('SHOTS saved');
  await page.close();
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.7.0 遗物浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
