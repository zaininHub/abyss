// v2.7.1：懒惰态浏览器验证——EP 满上限持续超阈值 → 线程徽章显示「懒惰」；购买后解除
import puppeteer from 'puppeteer-core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`${ok ? '✓' : '✗'} ${n} ${d}`); };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const mkSave = (lazySince) => JSON.stringify({
  _version: 6, chapter: '3', storyline: 'default', ep: 2000, rp: 5, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {},
  cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  lazySince,
  lastSeen: Date.now(), startTime: Date.now(),
});
try {
  // 场景 1：EP 满（cap 2000）且 lazySince 61s 前 → 懒惰显示
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(Date.now() - 61_000));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 6000));
  const st = await page.evaluate(() => {
    const el = document.getElementById('staff-status');
    return { txt: el ? el.textContent.trim() : null, color: el ? el.style.color : null };
  });
  rec('L-B1 满上限超阈值：线程徽章显示懒惰（含产出/消耗乘数）', !!st.txt && st.txt.includes('懒惰') && st.txt.includes('0.25') && st.txt.includes('2.5'), JSON.stringify(st));
  // 场景 2：购买升级 → 解除（lazySince 清空 → 徽章恢复非懒惰）
  await page.evaluate(() => {
    const el = document.querySelector('#shop-list [data-buy="scribble"]');
    if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await new Promise(r => setTimeout(r, 600));
  const st2 = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
    const el = document.getElementById('staff-status');
    return { lazySince: s.lazySince, txt: el ? el.textContent.trim() : null };
  });
  rec('L-B2 任意升级购买 → 懒惰解除（lazySince 清空）', !st2.lazySince, JSON.stringify(st2));
  await page.close();
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.7.1 懒惰态浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
