// ===== v2.8.23 两项反馈：①线程升级解锁阶梯/价格；②内存泄漏（DOM 稳定性） =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

// T1（unit）：线程强化升级 base 阶梯拉开（门槛 = base×0.3，间隔 ≥4×，杜绝同时解锁一串）
const u = await import('../src/data/upgrades.js');
const thread = u.UPGRADES.filter(x => x.cat === 'thread').sort((a, b) => a.base - b.base);
const order = thread.map(x => `${x.id}:${x.base}`).join(' ');
const gapsOk = thread.every((x, i) => i === 0 || x.base >= thread[i - 1].base * 4);
rec('T1 线程强化解锁门槛阶梯（base 升序且相邻 ≥4×）', gapsOk && thread.length === 7, order);
const expectOrder = ['cpu', 'subsist1', 'mem', 'gpu', 'subsist2', 'cache', 'subsist3'];
rec('T2 线程强化解锁顺序（cpu→能量合剂→内存→GPU→循环供氧→缓存→生物餐）', thread.map(x => x.id).join(',') === expectOrder.join(','), thread.map(x => x.id).join(','));

// T3（browser）：线程区渲染按门槛顺序 + 购买扣费 = base×1.30^owned
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  const mkSave = (ep, over = {}) => JSON.stringify(Object.assign({
    _version: 6, chapter: '1', storyline: 'default', ep, rp: 0, es: 0, dm: 0,
    upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {},
    cultists: [], religion: { unlocked: false }, faith: 0, pets: {}, activePets: [],
    _lastActionAt: Date.now(), resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: false, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(),
  }, over));
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // EP 6e6：仅 cpu（门槛 6e6）进入解锁窗口
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(6e6, { upgrades: { storage: 500 } }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 300));
  const t3a = await page.evaluate(() => {
    const grid = document.getElementById('thread-shop');
    const txt = grid ? grid.textContent : '';
    return { hasCpu: txt.includes('CPU 超频'), hasMem: txt.includes('内存扩容'), hasGpu: txt.includes('GPU 加速') };
  });
  rec('T3 线程强化分段解锁（EP 6e6 仅 CPU 超频可见）', t3a.hasCpu && !t3a.hasMem && !t3a.hasGpu, JSON.stringify(t3a));
  // EP 1.5e8：mem 进入窗口，但 gpu/cache 仍未解锁（门槛 6e8 / 3e10）
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(1.5e8, { upgrades: { storage: 500, cpu: 1, subsist1: 1 } })); // 链窗口 K=3：cpu→能量合剂→内存
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 300));
  const t3b = await page.evaluate(() => {
    const grid = document.getElementById('thread-shop');
    const txt = grid ? grid.textContent : '';
    return { hasMem: txt.includes('内存扩容'), hasGpu: txt.includes('GPU 加速'), hasCache: txt.includes('缓存优化') };
  });
  rec('T4 线程强化分段解锁（EP 1.5e8 含内存、GPU/缓存仍未解锁）', t3b.hasMem && !t3b.hasGpu && !t3b.hasCache, JSON.stringify(t3b));
  // 购买扣费：cpu 首购 = 2e7×1.30^0 = 2e7
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(2.5e7, { upgrades: { storage: 500 } }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1200));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 300));
  const t3c = await page.evaluate(() => {
    const g = document.getElementById('thread-shop');
    const cards = g ? [...g.querySelectorAll('[class*="item"], [class*="card"]')] : [];
    const cpuCard = cards.find(c => c.textContent.includes('CPU 超频'));
    return cpuCard ? cpuCard.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : 'NO CARD';
  });
  rec('T5 CPU 超频首购卡面价格显示', /20\.00M|2[0e]\s*[KM]|20000000|20\.0M/i.test(t3c), t3c);
  // T6：DOM 稳定性（内存泄漏代理：切换/弹窗/购买循环后节点不增长）
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave(1e9));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  const d0 = await page.evaluate(() => document.querySelectorAll('*').length);
  for (let i = 0; i < 15; i++) {
    await page.evaluate((t) => { const el = document.querySelector(t); if (el) el.click(); }, ['#btn-shop', '#btn-tech', '#btn-relics', '#btn-pets', '#btn-storyline'][i % 5]);
    await new Promise(r => setTimeout(r, 120));
    await page.evaluate(() => { const w = document.getElementById('wiki-btn'); if (w) w.click(); });
    await new Promise(r => setTimeout(r, 90));
    await page.evaluate(() => { const x = document.getElementById('wiki-x'); if (x) x.click(); });
  }
  await new Promise(r => setTimeout(r, 3000));
  const d1 = await page.evaluate(() => document.querySelectorAll('*').length);
  rec('T6 DOM 节点稳定（15 轮 tab/wiki 切换后增量 < 400，无泄漏）', (d1 - d0) < 400, `nodes ${d0}→${d1} (+${d1 - d0})`);
  await page.close();
  console.log(`\n[v23-diag-v2823] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2823] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
