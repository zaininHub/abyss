// v2.3.1 file:// 三场景留证截图（组长收尾清单项）
// 场景1：新档首屏最小化（B1——仅线程/升级商店/探采平台有子项，五分区整节不渲染）
// 场景2：锚点解锁推进（P4 两段式——购灵感工坊当帧顶栏 RP 出现 + 效能建筑/族升级分区亮出）
// 场景3：v6 旧档加载零回隐藏（B6——全解锁分区照常可见）
// 用法：node tests/v231-evidence.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const OUT = process.cwd() + '/../../artifacts/v231-evidence';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function shot(page, name) { return page.screenshot({ path: path.join(OUT, name) }); }

const mkSave = (over = {}) => JSON.parse(JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default',
  ep: 1000, rp: 0, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
  cultists: [], upgrades: {}, milesDone: {}, tech: {}, buildings: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(), ...over,
}));

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const errs = [];
try {
  // ── 场景 1：新档首屏最小化 ──
  console.log('[场景1] 新档首屏最小化');
  const p1 = await browser.newPage();
  await p1.setViewport({ width: 1920, height: 1080 });
  p1.on('pageerror', e => errs.push('s1:' + String(e)));
  await p1.evaluateOnNewDocument(() => localStorage.removeItem('abyss_idle_v2'));
  await p1.goto(URL, { waitUntil: 'load' });
  await sleep(1800);
  const s1 = await p1.evaluate(() => ({
    shop: document.querySelectorAll('#shop-list .item').length,
    thread: document.querySelectorAll('#thread-shop .item').length,
    vehicle: document.querySelectorAll('#vehicle-shop .item').length,
    dm: document.querySelectorAll('#dm-shop .item').length,
    v21: document.querySelectorAll('#v21-building-list > *').length,
    family: document.querySelectorAll('#family-upgrade-list > *').length,
    bld: document.querySelectorAll('#building-list > *').length,
    rpShown: getComputedStyle(document.getElementById('h-rp').parentElement).display,
  }));
  console.log(`[场景1] 分区计数=${JSON.stringify(s1)}`);
  await shot(p1, 's1-newgame-minimal.png');
  await p1.close();

  // ── 场景 2：锚点解锁推进（两段式：paused 冻结 → 购灵感工坊当帧 → 恢复） ──
  console.log('[场景2] 锚点解锁推进');
  const PRE = ['scribble','script','parallel','storage','intern','team','ai','cloud','global','quantum','singularity','dyson','multiverse','galactic','supercluster','cosmicweb','darkmatter','vacuum','brane','string','holographic','observer','simulation','creator','recursion','paradox','final','omega','zero','origin','essence','one','tao','void','dream','thought','unknown','god','universe','creation','infinity','absolute','beyond'];
  const preOwned = {}; PRE.forEach(id => preOwned[id] = 1); preOwned.storage = 20;
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1920, height: 1080 });
  p2.on('pageerror', e => errs.push('s2:' + String(e)));
  await p2.evaluateOnNewDocument((s) => { localStorage.removeItem('abyss_idle_v2'); localStorage.setItem('abyss_idle_v2', s); },
    JSON.stringify(mkSave({ ep: 60000, rp: 77, upgrades: preOwned, paused: true, pausedAt: Date.now() })));
  await p2.goto(URL, { waitUntil: 'load' });
  await sleep(1800);
  const pre = await p2.evaluate(() => ({
    rpShown: getComputedStyle(document.getElementById('h-rp').parentElement).display,
    v21: document.querySelectorAll('#v21-building-list > *').length,
  }));
  console.log(`[场景2] 购前=${JSON.stringify(pre)}（RP 隐藏、效能建筑分区不渲染）`);
  await shot(p2, 's2a-before-anchor.png');
  const clicked = await p2.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list .item')].find(e => e.textContent.includes('灵感工坊'));
    if (el) { el.click(); return true; } return false;
  });
  await sleep(600);
  const post = await p2.evaluate(() => ({
    rpShown: getComputedStyle(document.getElementById('h-rp').parentElement).display,
    rpVal: document.getElementById('h-rp').textContent,
    v21: document.querySelectorAll('#v21-building-list > *').length,
    family: document.querySelectorAll('#family-upgrade-list > *').length,
  }));
  console.log(`[场景2] 购后=${JSON.stringify(post)}（clicked=${clicked}）`);
  await shot(p2, 's2b-after-atrium.png');
  await p2.evaluate(() => document.getElementById('pauseBtn').click());
  await sleep(600);
  const disc = await p2.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}').resDiscovered);
  console.log(`[场景2] 恢复落档 resDiscovered=${JSON.stringify(disc)}`);
  await p2.close();

  // ── 场景 3：v6 旧档加载零回隐藏 ──
  console.log('[场景3] v6 旧档零回隐藏');
  const p3 = await browser.newPage();
  await p3.setViewport({ width: 1920, height: 1080 });
  p3.on('pageerror', e => errs.push('s3:' + String(e)));
  await p3.evaluateOnNewDocument((s) => { localStorage.removeItem('abyss_idle_v2'); localStorage.setItem('abyss_idle_v2', s); },
    JSON.stringify(mkSave({
      chapter: '7', storyline: 'line_faith', _forkTriggered: true, crossroad: 'locked',
      upgrades: { atrium: 1, scooter: 1 }, buildings: { canteen: 1 }, milesDone: { '10000': 1 },
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
    })));
  await p3.goto(URL, { waitUntil: 'load' });
  await sleep(1800);
  const s3 = await p3.evaluate(() => ({
    shop: document.querySelectorAll('#shop-list .item').length,
    vehicle: document.querySelectorAll('#vehicle-shop .item').length,
    dm: document.querySelectorAll('#dm-shop .item').length,
    v21: document.querySelectorAll('#v21-building-list > *').length,
    family: document.querySelectorAll('#family-upgrade-list > *').length,
    bld: document.querySelectorAll('#building-list > *').length,
    tech: !document.getElementById('btn-tech').disabled,
    rp: getComputedStyle(document.getElementById('h-rp').parentElement).display,
  }));
  console.log(`[场景3] 旧档分区计数=${JSON.stringify(s3)}`);
  await shot(p3, 's3-oldsave-no-rehide.png');
  await p3.close();

  console.log(errs.length === 0 ? '=== 三场景留证完成，无 JS 错误 ===' : `=== JS 错误：${errs.join('; ')} ===`);
} finally {
  await browser.close();
}
