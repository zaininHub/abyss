// v2.6.6 浏览器实测：①离线暂停结算 25% ②触手平滑曲线渲染 ③混沌心智购建筑日志 ④异兽饼干统一/减缓
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../dist/index.html');
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5e6, rp: 300, es: 3, dm: 100,
  upgrades: { storage: 3, scribble: 100, cache: 5, petland: 1, garden: 1 }, buildings: { abyss_anchor: 1, end_shrine: 1 },
  tech: { ai_core: true, chaos_born: true, chaos_mind: true, abyss_heart: true },
  ai: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: true, branch: 'sun', sun: true, seal: 1, temple: 3 },
  pets: {}, activePets: [], fusesDone: 0, delve: {}, activeRift: null, riftsSealed: 3, riftEmber: 0, riftUpgrades: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now(), faith: 5, unlockedBuildings: { abyss_anchor: true, end_shrine: true, fishbowl: true } };
try {
  // V1 暂停结算按 25% 离线效率
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(6000);
    const pre = await page.evaluate(() => ({ ep: parseFloat(document.getElementById('h-ep').textContent.split('/')[0].replace(/,/g, '')), cps: parseFloat(document.getElementById('h-cps').textContent.replace(/,/g, '')) }));
    const t0 = Date.now();
    await page.evaluate(() => document.getElementById('pauseBtn').click());
    await sleep(6500);
    await page.evaluate(() => document.getElementById('pause-resume').click());
    const pausedSec = (Date.now() - t0) / 1000;
    await sleep(800);
    const post = await page.evaluate(() => { const lines = [...document.querySelectorAll('#log-content div')].map(e => e.textContent); const l = lines.find(x => x.includes('暂停恢复：离线')) || ''; const m = l.match(/\+([\d,.]+)\s*EP/) || []; return { gained: parseFloat((m[1] || '0').replace(/,/g, '')), line: l }; });
    const expect = pre.cps * pausedSec * 0.25;
    rec('V1 暂停离线结算 ≈ cps × dt × 25%（显著低于在线）', post.gained >= 1 && post.gained < expect * 1.6, `gained=${post.gained.toFixed(0)} expect~${expect.toFixed(0)}`);
    await page.close();
  }
  // V2 触手渲染：SVG 含平滑曲线 + 圆头描边
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(6000);
    const svg = await page.evaluate(() => { const g = document.querySelector('.tentacle-deco svg'); return g ? g.innerHTML : ''; });
    rec('V2 触手 SVG 渲染为平滑曲线（贝塞尔+圆头）', svg.includes('C38 114') && svg.includes('stroke-linecap="round"') && svg.includes('<ellipse'), '');
    await page.close();
  }
  // V3 混沌心智购建筑日志（注入已解锁可购建筑，等待混沌直觉触发）
  {
    const inject = JSON.stringify({ ...base, ep: 1e9, buildings: { abyss_anchor: 1, end_shrine: 1, fishbowl: 0 }, unlockedBuildings: { abyss_anchor: true, end_shrine: true, fishbowl: true } });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(6000);
    // 等待最多 25s 混沌直觉触发（10s 周期）
    let logLine = '';
    for (let i = 0; i < 5; i++) {
      await sleep(5000);
      const lines = await page.evaluate(() => [...document.querySelectorAll('#log-content div')].map(e => e.textContent));
      logLine = lines.find(l => l.includes('混沌直觉：随机购建建筑') || l.includes('混沌直觉：随机购入')) || '';
      if (logLine.includes('混沌直觉')) break;
    }
    rec('V3 混沌直觉买入（升级或建筑）产生日志', logLine.includes('混沌直觉：随机购建建筑') || logLine.includes('混沌直觉：随机购入升级'), logLine.slice(0, 40));
    await page.close();
  }
  // V4 文案统一 + PT 产出减缓
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(6000);
    const stat = await page.evaluate(() => { const el = [...document.querySelectorAll('.stat')].find(s => (s.querySelector('#h-pt'))); const el2 = document.querySelector('.stat[title*="异兽"]'); return { title: el2 ? el2.title : '', label: el ? el.querySelector('b').textContent : '' }; });
    rec('V4 顶部显示「异兽饼干」+ 来源/解锁说明', stat.title.includes('来源：宠物乐园 / 伊甸花园') && stat.label.includes('异兽饼干') && !stat.label.includes('饼干</b>🍪'), JSON.stringify(stat));
    const pt0 = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).pt || 0);
    await sleep(10000);
    const pt1 = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).pt || 0);
    rec('V4 异兽饼干产出减缓（乐园 0.1/s + 花园 0.5/s ≈ 0.6/s，10s ≈ +6）', Math.abs((pt1 - pt0) - 6) < 3, `pt ${pt0.toFixed(1)} → ${pt1.toFixed(1)}`);
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.6 浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
