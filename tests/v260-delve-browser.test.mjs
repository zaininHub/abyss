// v2.6.0 深潜浏览器链路：tab 出现 → 唤醒 → 下潜 → 产出 → 升级（真实 UI 冒烟）
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../dist/index.html');
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
try {
  const inject = JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, es: 3, dm: 5000, vs: 100, faith: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: { unlocked: true, branch: 'sun', sun: true }, pets: {}, activePets: [], fusesDone: 0,
    delve: {}, corruption: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true },
    lastSeen: Date.now(), startTime: Date.now(),
  });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));

  const btnVisible = await page.evaluate(() => {
    const b = document.getElementById('btn-delve');
    return b && b.style.display !== 'none';
  });
  rec('深潜 tab 入口出现（ES3+DM+宗教）', btnVisible === true);

  await page.evaluate(() => document.getElementById('btn-delve').click());
  await new Promise(r => setTimeout(r, 300));
  const unlockShown = await page.evaluate(() => document.getElementById('delve-panel').innerHTML.includes('唤醒深渊之眼'));
  rec('深潜面板显示唤醒按钮', unlockShown === true);

  await page.evaluate(() => document.querySelector('[data-delve-unlock]').click());
  await new Promise(r => setTimeout(r, 300));
  const afterUnlock = await page.evaluate(() => document.getElementById('delve-panel').innerHTML.includes('下潜'));
  rec('唤醒后显示下潜按钮', afterUnlock === true);

  await page.evaluate(() => document.querySelector('[data-delve-toggle]').click());
  await new Promise(r => setTimeout(r, 300));
  const diving = await page.evaluate(() => ({
    text: document.querySelector('[data-delve-toggle]').textContent.trim(),
    hasVS: document.getElementById('delve-panel').innerHTML.includes('VS 产出'),
  }));
  rec('下潜成功（按钮切至上浮 + 产出展示）', diving.text === '上浮' && diving.hasVS === true, diving.text);

  // 深潜 5.5s（跨 dirty.delve 5s 刷新）→ VS 产出（0.75/s × 5.5 ≈ 4.1，面板刷新后可见）
  await new Promise(r => setTimeout(r, 5500));
  const vsGain = await page.evaluate(() => {
    const m = document.getElementById('delve-panel').innerHTML.match(/虚空碎片（VS）<\/span><b[^>]*>([\d.]+)<\/b>/);
    return m ? m[1] : 'n/a';
  });
  rec('深潜中 VS 产出累计（面板随 5s 刷新显示 >100）', parseFloat(vsGain) > 100 && parseFloat(vsGain) < 106, `vs=${vsGain}`);

  // 升级树渲染 6 项
  const upgCount = await page.evaluate(() => document.querySelectorAll('[data-delve-upg]').length);
  rec('升级树渲染 6 项', upgCount === 6, `upg=${upgCount}`);

  // 上浮
  await page.evaluate(() => document.querySelector('[data-delve-toggle]').click());
  await new Promise(r => setTimeout(r, 200));
  const up = await page.evaluate(() => document.querySelector('[data-delve-toggle]').textContent.trim());
  rec('上浮成功（按钮切回下潜）', up.includes('下潜'), up);

  rec('无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(';'));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.0 深潜浏览器链路：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
