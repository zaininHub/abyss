// ===== v2.8.9 四项反馈浏览器实测 =====
// ①新解锁升级项直接到右侧（=切tab位置）②线程购买预览+可购买 ③静置60s彩蛋成就 ④裂隙深入按钮DM门控暗色
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
  familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {},
  resDiscovered: { ep: true, cps: false, run: false, tide: false, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
  unlockedBuildings: {}, allTimeEp: 0, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 新解锁升级项：购买自动化（fresh）后 DOM 顺序 == 切 tab 后顺序
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    // 草稿已购 + EP 充足
    const save = mkSave({ ep: 5e5, allTimeEp: 1e9, upgrades: { scribble: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, save);
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const orderBefore = await page.evaluate(() =>
      [...document.querySelectorAll('#shop-list .item')].map(e => (e.dataset.buy || e.textContent.slice(0, 8))).join('|'));
    // 点击链窗口第一个未购卡（fresh 揭示）
    await page.evaluate(() => {
      const el = document.querySelector('#shop-list [data-buy="storage"]') || document.querySelector('#shop-list [data-buy]');
      if (el) el.click();
    });
    await new Promise(r => setTimeout(r, 600));
    const orderAfter = await page.evaluate(() =>
      [...document.querySelectorAll('#shop-list .item')].map(e => (e.dataset.buy || e.textContent.slice(0, 8))).join('|'));
    // 切 tab 再回（全量重渲染）比较
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 300));
    await page.click('#btn-shop');
    await new Promise(r => setTimeout(r, 400));
    const orderRendered = await page.evaluate(() =>
      [...document.querySelectorAll('#shop-list .item')].map(e => (e.dataset.buy || e.textContent.slice(0, 8))).join('|'));
    rec('T1 新解锁后列表顺序 = 切 tab 重渲染顺序', orderAfter === orderRendered && orderAfter !== orderBefore, `after=${orderAfter} rendered=${orderRendered}`);
    rec('T1b 购买后列表刷新（fresh 揭示）', orderAfter !== orderBefore, orderAfter);
    await page.close();
  }

  // T2 线程购买预览 + EP 足可购买
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 50 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const prevLow = await page.evaluate(() => document.getElementById('staff-preview').textContent);
    rec('T2a EP 不足时也显示下一线程预览（产出/消耗/门槛）', prevLow.includes('下一线程') && prevLow.includes('产出 +') && prevLow.includes('消耗 +') && prevLow.includes('需 120 EP'), prevLow);
    // EP 充足购买：新页面注入（避免 reload 时 beforeunload 用内存旧档覆盖）
    await page.close();
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 500 }));
    await page2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const r2 = await page2.evaluate(() => {
      const btn = document.getElementById('hire-btn');
      const disabled = btn.disabled;
      btn.click();
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { disabled, cultists: s.cultists.length, ep: s.ep };
    });
    rec('T2b EP 充足时招募按钮可点且购买成功', r2.disabled === false && r2.cultists === 1 && r2.ep < 500, JSON.stringify(r2));
    await page2.close();
  }

  // T3 静置 60s 彩蛋 + 成就（虚拟时间推进）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 70000, maxVirtualTimeTaskStarvationCount: 10000 });
    await new Promise(r => setTimeout(r, 4000));
    const r3 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { egg: !!(s._easterEggsFound && s._easterEggsFound.idle_start), idleSec: s._idleSec, ach: !!(s.achievements && s.achievements.idle60) };
    });
    rec('T3a 静置 60s 触发 idle_start 彩蛋', r3.egg, JSON.stringify(r3));
    rec('T3b 彩蛋同步解锁「静默一分钟」成就', r3.ach, JSON.stringify(r3));
    await page.close();
  }

  // T4 裂隙深入按钮：DM 未解锁 disabled 暗色
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const save = mkSave({ ep: 5e4, activeRift: { power: 1, expiresAt: Date.now() + 90000, sealCost: 868, level: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, save);
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const r4 = await page.evaluate(() => {
      const btn = document.getElementById('delve-rift');
      if (!btn) return { err: 'no delve-rift btn' };
      const cs = getComputedStyle(btn);
      return { disabled: btn.disabled, opacity: cs.opacity, bg: cs.backgroundColor, title: btn.title };
    });
    rec('T4a DM 未解锁：深入按钮 disabled（暗色不可点）', r4.disabled === true && r4.opacity === '0.45', JSON.stringify(r4));
    // DM 已解锁 → 可点
    await page.close();
    const page3 = await browser.newPage();
    await page3.setViewport({ width: 1440, height: 900 });
    const save2 = mkSave({ ep: 5e4, dm: 10, activeRift: { power: 1, expiresAt: Date.now() + 90000, sealCost: 868, level: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } });
    await page3.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, save2);
    await page3.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const r4b = await page3.evaluate(() => { const b = document.getElementById('delve-rift'); return b ? { disabled: b.disabled, title: b.title } : { err: 'no btn' }; });
    rec('T4b DM 解锁：深入按钮可点', r4b.disabled === false, JSON.stringify(r4b));
    await page3.close();
  }
  console.log(`\n[v23-diag-v289] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
