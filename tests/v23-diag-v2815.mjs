// ===== v2.8.15 五条反馈浏览器实测 =====
// ①载具采集日志 ②命运选择日志 ③探采单位 EP/s + DM/s ④图鉴全局保留 ⑤Wiki 弹框
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
  _version: 6, chapter: '1', storyline: 'default', ep: 5e5, rp: 0, es: 0, dm: 0,
  upgrades: { storage: 32, scooter: 1 }, buildings: {}, tech: {}, ai: {}, milesDone: {}, cultists: [],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(), vehCollectTimer: 59.5,
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 载具采集日志（60s 周期后日志含「载具采集：-X EP → +Y DM」）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await new Promise(r => setTimeout(r, 9000)); // 后台节流：60.5s 采集点跨过（59.5 + 若干 1s tick）
    const t1 = await page.evaluate(() => {
      const logs = document.getElementById('log-content');
      return logs ? logs.textContent : '';
    });
    rec('T1 采集后日志显示「载具采集：-X EP → +Y DM」', t1.includes('载具采集：-'), t1.split('载具采集')[1] || '无');
    await page.close();
  }

  // T2 命运选择日志（立誓后日志含「已立誓」）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e5, chapter: '5', crossroad: 'open', storyline: 'default' }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-storyline');
    await new Promise(r => setTimeout(r, 400));
    // 点击立誓建筑卡
    const clicked = await page.evaluate(() => {
      const el = document.querySelector('[data-crossroad]');
      if (!el) return false;
      el.click();
      return true;
    });
    await new Promise(r => setTimeout(r, 500));
    const t2 = await page.evaluate(() => {
      const logs = document.getElementById('log-content');
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { log: logs ? logs.textContent : '', crossroad: s.crossroad, lockedBy: s.crossroadLockedBy };
    });
    rec('T2 立誓后日志显示弹窗内容（已立誓）', t2.log.includes('已立誓') && t2.crossroad === 'locked', `${t2.log.split('已立誓')[1]?.slice(0, 30) || '无'} crossroad=${t2.crossroad}`);
    await page.close();
  }

  // T3 探采文案单位 EP/s + DM/s（页头 + 载具卡）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ _riftSeen: true, riftsSealed: 1 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t3 = await page.evaluate(() => {
      const h = document.getElementById('vehicle-collect');
      const card = [...document.querySelectorAll('[data-buy]')].find(e => e.textContent.includes('外勤摩托队'));
      return { head: h ? h.textContent : '', card: card ? card.textContent.replace(/\s+/g, ' ') : '' };
    });
    rec('T3a 探采页头单位 EP/s + DM/s', t3.head.includes('EP/s → +') && t3.head.includes('DM/s'), t3.head);
    rec('T3b 载具卡单位 EP/s + DM/s', t3.card.includes('探采 -') && t3.card.includes('EP/s → +') && t3.card.includes('DM/s'), t3.card);
    await page.close();
  }

  // T4 图鉴全局保留：注入已解锁章节+已完成路线 → 转生后仍在
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 0, runEarned: 4e7, prestige: 0, chaptersUnlocked: { line_order: [1, 2] }, storylinesCompleted: ['line_order'], storyline: 'line_order' }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    // 转生
    await page.click('#btn-prestige');
    await new Promise(r => setTimeout(r, 400));
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('晋升转生')); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 600));
    await page.click('#btn-storyline');
    await new Promise(r => setTimeout(r, 400));
    const t4 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const body = document.body.textContent;
      return { completed: s.storylinesCompleted, chs: s.chaptersUnlocked, codexOrder: body.includes('秩序重构者'), codexCh: body.includes('第二章') || body.includes('第一章') };
    });
    rec('T4 图鉴跨周期保留（转生后已完成路线+章节仍显示）', t4.completed.includes('line_order') && (t4.chs.line_order || []).length > 0 && t4.codexOrder, JSON.stringify({ completed: t4.completed, chs: t4.chs, codexOrder: t4.codexOrder }));
    await page.close();
  }

  // T5 Wiki 弹框：按钮打开 → 图例/故事线效果/章节讲解
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await page.click('#btn-wiki');
    await new Promise(r => setTimeout(r, 400));
    const t5 = await page.evaluate(() => {
      const modal = document.getElementById('wiki-modal');
      const sl = document.getElementById('wiki-storylines');
      const ch = document.getElementById('wiki-chapters');
      return {
        visible: modal.style.display === 'flex',
        hasLegend: modal.textContent.includes('五种货币') && modal.textContent.includes('深渊潮汐'),
        hasLines: sl.textContent.includes('秩序重构者') && sl.textContent.includes('深渊行者') && sl.textContent.includes('信仰传播者'),
        hasChapters: ch.textContent.includes('第一章'),
      };
    });
    rec('T5 Wiki 弹框（图例/名词 + 故事线效果 + 章节讲解）', t5.visible && t5.hasLegend && t5.hasLines && t5.hasChapters, JSON.stringify(t5));
    // 关闭角标
    await page.click('#wiki-x');
    await new Promise(r => setTimeout(r, 300));
    const closed = await page.evaluate(() => document.getElementById('wiki-modal').style.display);
    rec('T5b Wiki 弹框关闭角标生效', closed === 'none', closed);
    await page.close();
  }
  console.log(`\n[v23-diag-v2815] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
