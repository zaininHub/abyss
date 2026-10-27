// ===== v2.8.13 六条反馈浏览器实测 =====
// ①研究卡RP变化即刷新+title无重复 ②科技树UI统一 ③哨站无下限文案 ④探采卡-EP ⑤任务奖励不计任务进度 ⑥探采页头文案
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
  upgrades: { storage: 32 }, buildings: {}, tech: {}, ai: {}, milesDone: {}, cultists: [],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 研究卡：RP 变化后灰态刷新 + title 无「当前 X」
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 2.8 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-rp');
    await new Promise(r => setTimeout(r, 500));
    const t1 = await page.evaluate(() => {
      const card = document.querySelector('#research-upgrade-list .item:not(.owned-item)');
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      s.rp = 430; localStorage.setItem('abyss_idle_v2', JSON.stringify(s));
      return { before: card ? card.className : null, title: card ? card.title : null };
    });
    // RP 升到 430：新页面注入（reload 会被 beforeunload 用内存旧档覆盖）
    await page.close();
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 430 }));
    await page2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page2.click('#btn-rp');
    await new Promise(r => setTimeout(r, 500));
    const t1b = await page2.evaluate(() => {
      const cards = [...document.querySelectorAll('#research-upgrade-list .item:not(.owned-item)')];
      return {
        cantCount: cards.filter(c => c.className.includes('cant')).length,
        titles: cards.slice(0, 2).map(c => c.title),
        noDup: cards.every(c => !c.title.includes('当前')),
      };
    });
    rec('T1 研究卡 title 不再重复展示当前 RP', t1b.noDup, JSON.stringify(t1b.titles));
    rec('T1b RP 充足后卡片不再灰态（可购判定刷新）', t1b.cantCount === 0, `cant=${t1b.cantCount}`);
    await page2.close();
  }

  // T2 科技树卡片结构与 .item 统一（name/desc/cost）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 500));
    const t2 = await page.evaluate(() => {
      const card = document.querySelector('#tech-tree [data-tech]');
      return { name: !!card.querySelector('.name'), desc: !!card.querySelector('.desc'), cost: !!card.querySelector('.cost'), cls: card.className };
    });
    rec('T2 科技树卡片结构与升级商店统一（name/desc/cost）', t2.name && t2.desc && t2.cost, JSON.stringify(t2));
    await page.close();
  }

  // T3 哨站文案无「下限」
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ _riftSeen: true, riftsSealed: 1, riftUpgrades: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.evaluate(() => document.getElementById('btn-rift-tab').click());
    await new Promise(r => setTimeout(r, 500));
    const t3 = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.rift-upg-row')];
      const sentinel = rows.find(r => r.textContent.includes('哨站'));
      return { text: sentinel ? sentinel.textContent.replace(/\s+/g, ' ') : '', hasLimit: sentinel ? sentinel.textContent.includes('下限') : false };
    });
    rec('T3 哨站动态文案无「下限」', !t3.hasLimit && t3.text.includes('→'), t3.text);
    await page.close();
  }

  // T4 探采载具卡显示 -ep/s 消耗
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ upgrades: { storage: 32 }, _riftSeen: true, riftsSealed: 1, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-shop');
    await new Promise(r => setTimeout(r, 500));
    const t4 = await page.evaluate(() => {
      const card = document.querySelector('#vehicle-list .item, #vehicle-list [data-buy], [id*=vehicle] [data-buy]');
      const all = [...document.querySelectorAll('[data-buy]')].find(e => e.textContent.includes('外勤摩托队'));
      return { card: all ? all.textContent.replace(/\s+/g, ' ') : '' };
    });
    rec('T4 载具升级卡标注探采 -EP/s 消耗', t4.card.includes('探采 -0.8 EP/s → +0.0008 DM/s'), t4.card); // v2.8.15：单位 EP/s + DM/s
    await page.close();
  }

  // T5 任务奖励（addEp）不计任务进度：满 EP 点击/事件不入 earnedFull
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1000, earnedFull: 0, runEarned: 0, allTimeEp: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    // 点击产出（走 addEp）
    await page.click('#hero');
    await new Promise(r => setTimeout(r, 6000)); // 等 5s 自动存档落盘
    const t5 = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { ep: s.ep, earnedFull: s.earnedFull, runEarned: s.runEarned }; });
    rec('T5 点击/一次性入账不计任务进度（earnedFull 不涨）', t5.ep > 1000 && t5.earnedFull === 0, JSON.stringify(t5));
    await page.close();
  }

  // T6 探采页头文案明确
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ upgrades: { storage: 32, scooter: 1 }, _riftSeen: true, riftsSealed: 1, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t6 = await page.evaluate(() => { const h = document.getElementById('vehicle-collect'); return h ? h.textContent : ''; });
    rec('T6 探采页头文案明确（探采 -X EP/s → +Y DM/s）', t6.includes('探采 -0.8 EP/s → +0.0008 DM/s') && t6.includes('当前 DM:'), t6); // v2.8.15：单位统一
    await page.close();
  }
  console.log(`\n[v23-diag-v2813] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
