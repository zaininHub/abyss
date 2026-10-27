// ===== v2.8.18 四项反馈浏览器实测 =====
// ①AI 管理核心移除 cps 门槛（低 cps 也可购） ②顶部产出/消耗来源直接显示 ③已升级内容收最下侧折叠区 ④净化节点卡面无括号、机制放悬浮 + 载具采集日志
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
  _version: 6, chapter: '1', storyline: 'default', ep: 3e6, rp: 200, es: 0, dm: 0, pt: 500,
  upgrades: { scribble: 50, storage: 40, purifier1: 1, subsist1: 1, scooter: 1 }, buildings: {}, tech: {}, ai: {}, milesDone: {},
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: true, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 ai_core 无 cps 门槛：低 cps（scribble 50 级约 12.5/s）+ 充足 RP/EP → 卡片可购、点击购买成功
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 400));
    const t1a = await page.evaluate(() => {
      const card = [...document.querySelectorAll('[data-tech]')].find(e => e.textContent.includes('AI 管理核心'));
      const cps = document.getElementById('h-cps');
      return { cls: card ? card.className : '', cps: cps ? cps.textContent : '', hasLockHint: card ? (card.title || '').includes('cps ≥') : false };
    });
    rec('T1a 低 cps 时 ai_core 不再锁定（无 cps 门槛）', t1a.cls === 'tech' && !t1a.hasLockHint, JSON.stringify(t1a));
    await page.evaluate(() => { const c = [...document.querySelectorAll('[data-tech]')].find(e => e.textContent.includes('AI 管理核心')); if (c) c.click(); });
    await new Promise(r => setTimeout(r, 1200));
    const t1b = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { hasTech: !!s.tech.ai_core, rp: s.rp };
    });
    rec('T1b ai_core 低 cps 可购买成功（持久化）', t1b.hasTech && t1b.rp < 200, JSON.stringify(t1b));
    await page.close();
  }

  // T2 顶部产出/消耗来源直接显示
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t2 = await page.evaluate(() => {
      const cps = document.getElementById('h-cps');
      const sal = document.getElementById('h-salary');
      return { cps: cps ? cps.title : '', drain: sal ? sal.title : '' };
    });
    rec('T2 顶部来源改悬浮（数值 title 含来源，常驻行移除）', t2.cps.includes('产出来源') && t2.drain.includes('消耗来源'), JSON.stringify(t2)); // v2.8.20 ③：来源改悬浮
    await page.close();
  }

  // T3 已升级内容收最下侧折叠区（主商店 + 线程强化）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { entropy_reduce: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t3 = await page.evaluate(() => {
      const headers = [...document.querySelectorAll('.owned-header')].map(h => h.textContent.replace(/\s+/g, ' '));
      const shop = document.getElementById('shop-list');
      const thread = document.getElementById('thread-list') || [...document.querySelectorAll('[id]')].find(e => e.id.includes('thread'));
      // 净化节点 I 不在可购主链（应已收折叠）
      const purifierInMain = shop && [...shop.querySelectorAll('.item:not(.owned-item)')].some(e => e.textContent.includes('净化节点 I'));
      const ownedItems = [...document.querySelectorAll('.owned-box .owned-item, .owned-box .item')].map(e => e.textContent.replace(/\s+/g, ' ').slice(0, 20));
      return { headers, purifierInMain, ownedSample: ownedItems.filter(x => x.includes('净化') || x.includes('能量合剂') || x.includes('循环供氧')).slice(0, 4) };
    });
    rec('T3a 主商店/线程区底部出现「已升级」折叠区', t3.headers.some(h => h.includes('已升级')), JSON.stringify(t3.headers));
    rec('T3b 一次性已购项（能量合剂等）收折叠区；可叠加项（净化节点 ×N）留主链', t3.ownedSample.length > 0 && t3.purifierInMain, JSON.stringify({ owned: t3.ownedSample, purifierInMain: t3.purifierInMain }));
    await page.close();
  }

  // T4 净化节点卡面无括号 + 悬浮 title 有机制说明
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { entropy_reduce: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t4 = await page.evaluate(() => {
      const shop = document.getElementById('shop-list');
      const card = shop ? [...shop.querySelectorAll('.item')].find(e => e.textContent.includes('净化节点 I')) : null;
      const foldCard = [...document.querySelectorAll('.owned-box .item, .owned-box .owned-item')].find(e => e.textContent.includes('净化节点 I'));
      return { mainDesc: card ? card.textContent.replace(/\s+/g, ' ') : '', foldTitle: foldCard ? foldCard.title || '' : '' };
    });
    rec('T4 净化节点卡面无括号（可购/折叠区均无「（」）', !t4.mainDesc.includes('（') && !t4.foldTitle.includes('（'), JSON.stringify(t4));
    await page.close();
  }

  // T5 载具采集日志（干净注入 59.5s → 采集日志出现）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ vehCollectTimer: 59.5 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await new Promise(r => setTimeout(r, 5000)); // 等自动存档，DM 落盘
    const t5 = await page.evaluate(() => {
      const logs = document.getElementById('log-content');
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { hasCollect: logs.textContent.includes('载具采集'), dm: s.dm };
    });
    rec('T5 载具采集到账无日志、DM 正常入账', !t5.hasCollect && t5.dm > 0, `dm=${t5.dm}`); // v2.8.20 ②：采集日志已移除
    await page.close();
  }

  console.log(`\n[v23-diag-v2818] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
