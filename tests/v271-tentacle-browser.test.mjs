// v2.7.1：触手交互动画浏览器验证——hover 蠕动 + 点击拍打 + 鱼缸门控
import puppeteer from 'puppeteer-core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n} ${d}`); };
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const mkSave = (fish) => JSON.stringify({
  _version: 6, chapter: '3', storyline: 'default', ep: 2000, rp: 5, es: 0, dm: 0,
  upgrades: {}, buildings: { abyss_fishbowl: fish }, tech: {}, ai: {}, milesDone: {},
  cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(),
});
try {
  // 无鱼缸：触手隐藏
  const p0 = await browser.newPage();
  await p0.setViewport({ width: 1440, height: 900 });
  await p0.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(0));
  await p0.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 5000));
  const hide = await p0.evaluate(() => document.getElementById('tentacle-deco').style.display === 'none');
  rec('T1 无鱼缸：触手隐藏', hide);
  await p0.close();
  // 鱼缸 1 级：显示 + hover 蠕动 + 点击拍打
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(1));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 6000));
  const shown = await page.evaluate(() => {
    const d = document.getElementById('tentacle-deco');
    return d.style.display !== 'none' && d.getAttribute('aria-hidden') === 'true';
  });
  rec('T2 鱼缸 1 级：触手显示', shown);
  // hover：computed animation 切到 tentacle-writhe
  await page.hover('#tentacle-deco');
  await new Promise(r => setTimeout(r, 300));
  const hoverAnim = await page.evaluate(() => {
    const a = document.querySelector('#tentacle-deco .tentacle-a');
    const cs = getComputedStyle(a);
    return cs.animationName;
  });
  rec('T3 hover：触手蠕动动画（tentacle-writhe）', hoverAnim === 'tentacle-writhe', `name=${hoverAnim}`);
  // 点击：tap 动画 + 日志
  await page.click('#tentacle-deco');
  await new Promise(r => setTimeout(r, 400));
  const tap = await page.evaluate(() => {
    const d = document.getElementById('tentacle-deco');
    const logBox = document.getElementById('log-content');
    return { tap: d.classList.contains('tap'), hasLog: logBox ? logBox.textContent.includes('触手回应') : false };
  });
  rec('T4 点击触手：拍打动画 + 日志反馈', tap.tap && tap.hasLog, JSON.stringify(tap));
  await page.close();
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.7.1 触手交互浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
