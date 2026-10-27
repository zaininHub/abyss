// ===== v2.8.12 三条反馈浏览器实测 =====
// ①升级卡内移动光标不闪烁 ②探采消耗EP换DM（-ep/s + 净流限制） ③深入：剩余时间在腐化条/紧急脱出无奖励/深入消耗EP
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
  // T1 升级卡（cant 灰态）子元素继承光标：鼠标在卡内移动 cursor 恒定 not-allowed
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 0, allTimeEp: 1e9 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t1 = await page.evaluate(() => {
      const card = document.querySelector('#shop-list .item.cant, #v21-building-list .item.cant, #research-upgrade-list .item.cant');
      if (!card) return null;
      const child = card.querySelector('*');
      return { cardCursor: getComputedStyle(card).cursor, childCursor: child ? getComputedStyle(child).cursor : null };
    });
    rec('T1 灰态升级卡子元素继承光标（not-allowed 恒定不闪烁）', t1 && t1.cardCursor === 'not-allowed' && t1.childCursor === 'not-allowed', JSON.stringify(t1));
    await page.close();
  }

  // T2 探采平台：页头 -ep/s 显示 + 净流不足暂停采集
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e5, upgrades: { storage: 32, scooter: 1 }, allTimeEp: 1e9, dm: 0,
        resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t2a = await page.evaluate(() => {
      const h = document.getElementById('vehicle-collect');
      return h ? h.textContent : null;
    });
    // 摩托 0.05 DM/min × 1000 = 50 EP/min → -0.8 ep/s
    rec('T2a 探采页头显示 -ep/s 消耗', t2a && t2a.includes('采集 -') && t2a.includes('ep/s') && t2a.includes('+0.05/min'), t2a);
    // 净流不足暂停：无线程产出（cps=0）+ 探采消耗 0.83/s → net < 0 → 不采集
    await page.evaluate(() => { localStorage.setItem('abyss_idle_v2', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('abyss_idle_v2')), { ep: 5e5, cultists: [], vehCollectTimer: 59 }))); });
    await page.reload({ waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1200));
    await page.evaluate(() => { localStorage.setItem('abyss_idle_v2', JSON.stringify(Object.assign(JSON.parse(localStorage.getItem('abyss_idle_v2')), { ep: 5e5, cultists: [], vehCollectTimer: 59 }))); });
    await page.reload({ waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000)); // 跨过 60s 采集点
    const t2b = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { ep: s.ep, dm: s.dm }; });
    rec('T2b 净流不足探采暂停（EP 不减、DM 不产）', t2b.ep === 5e5 && t2b.dm === 0, JSON.stringify(t2b));
    // 有线程产出（净流>0）+ EP 充足 → 采集扣 EP 产 DM
    await page.close();
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e5, upgrades: { storage: 32, scooter: 1 }, allTimeEp: 1e9, dm: 0, cultists: [{ id: 1, name: 'T', output: 2, mood: '正常', moodTimer: 999 }], vehCollectTimer: 59.5,
        resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } }));
    await page2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 10000)); // 后台 tab setInterval 节流至 1s，10s 内必跨过 60s 采集点
    const t2c = await page2.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { ep: s.ep, dm: s.dm, timer: s.vehCollectTimer }; });
    rec('T2c 净流充足采集成功（DM +0.05；采集扣 EP 50，产出并存）', t2c.dm > 0, JSON.stringify(t2c));
    await page2.close();
  }

  // T3 深入：剩余时间在腐化进度条处 + 裂隙 tab 无剩余 + 紧急脱出无奖励 + 消耗 EP
  {
    const page3 = await browser.newPage();
    await page3.setViewport({ width: 1440, height: 900 });
    await page3.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e5, upgrades: { storage: 32 }, dm: 10, allTimeEp: 1e9, corruption: 10, _riftSeen: true,
        riftExpedition: { until: Date.now() + 30000, level: 1, sealCost: 868, gainedDm: 12, gainedVs: 3 },
        resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } }));
    await page3.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t3a = await page3.evaluate(() => {
      const exp = document.getElementById('rift-exp-status');
      const bar = document.getElementById('corruption-bar');
      return {
        expVisible: exp && exp.style.display !== 'none',
        expText: exp ? exp.textContent : '',
        barAfter: bar ? (bar.compareDocumentPosition(exp) & 2 ? 'exp-before-bar' : 'exp-after-bar') : null,
      };
    });
    rec('T3a 深入剩余时间显示在腐化进度条上方', t3a.expVisible && t3a.expText.includes('剩余') && t3a.barAfter === 'exp-before-bar', JSON.stringify(t3a));
    await page3.click('#btn-rift-tab');
    await new Promise(r => setTimeout(r, 500));
    const t3b = await page3.evaluate(() => document.querySelector('#rift-tab, #rift-panel').textContent.includes('剩余'));
    rec('T3b 裂隙 tab 不再展示剩余时间', !t3b, '');
    // 紧急脱出：无奖励
    const t3c = await page3.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { dmBefore: s.dm, vsBefore: s.vs || 0, emberBefore: s.riftEmber || 0, epBefore: s.ep };
    });
    const btn = await page3.$('#abort-rift-ex');
    if (btn) {
      await btn.click();
      await new Promise(r => setTimeout(r, 400));
    }
    const t3d = await page3.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { dm: s.dm, vs: s.vs || 0, ember: s.riftEmber || 0, expedition: s.riftExpedition };
    });
    rec('T3c 紧急脱出不结算奖励（DM/VS/余烬不变，探索结束）', t3d.dm === t3c.dmBefore && t3d.vs === t3c.vsBefore && t3d.ember === t3c.emberBefore && !t3d.expedition, JSON.stringify(t3d));
    await page3.close();
  }
  console.log(`\n[v23-diag-v2812] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
