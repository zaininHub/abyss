// ===== v2.8.17 七项反馈浏览器实测 =====
// ①异兽商店去来源/解锁 ②宠物点击无蓝色方块（SVG/icon 粒子） ③宠物动画差异化 ④Wiki 并入右上角按钮组 ⑤深入探索去括号+进度条 ⑥紧急脱出在进度条处 ⑦专注线程产出文案
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
  _version: 6, chapter: '1', storyline: 'default', ep: 2e6, rp: 50, es: 0, dm: 10, pt: 2000,
  upgrades: { storage: 40 }, buildings: {}, tech: {}, ai: {}, milesDone: { 10000: true },
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: { hamster: { level: 5, exp: 10, gen: 1 } }, activePets: ['hamster'], fusesDone: 0, familyUpgrades: {},
  _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: true, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 异兽商店文案无「来源/解锁」
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { pet_shop: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-pets');
    await new Promise(r => setTimeout(r, 400));
    const t1 = await page.evaluate(() => {
      const body = document.body.textContent;
      return { noSource: !body.includes('来源：宠物乐园') && !body.includes('解锁：商店购入'), hasCount: body.includes('异兽商店（异兽饼干：') };
    });
    rec('T1 异兽商店去「来源/解锁」', t1.noSource && t1.hasCount, JSON.stringify(t1));
    await page.close();
  }

  // T2 宠物点击粒子非蓝色方块（SVG/icon，无 ♥ 字符）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.evaluate(() => { const it = document.querySelector('.pet-item'); if (it) it.click(); });
    await new Promise(r => setTimeout(r, 300));
    const t2 = await page.evaluate(() => {
      const hearts = [...document.querySelectorAll('.pet-heart')];
      const hasHeartChar = hearts.some(h => h.textContent.trim() === '♥');
      return { count: hearts.length, noHeartChar: !hasHeartChar, inner: hearts[0] ? hearts[0].innerHTML.slice(0, 60) : '' };
    });
    rec('T2 点击粒子无 ♥ 字符（宠物 icon 上浮，无蓝色方块源）', t2.count > 0 && t2.noHeartChar, JSON.stringify(t2));
    await page.close();
  }

  // T3 宠物 idle 动画差异化（不同宠物不同动画类）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ pets: { hamster: { level: 3, exp: 0, gen: 1 }, cat: { level: 3, exp: 0, gen: 1 } }, activePets: ['hamster', 'cat'] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t3 = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.pet-item')];
      return { anims: items.map(i => i.className), diff: new Set(items.map(i => (i.getAttribute('data-pet-anim') || ''))).size > 1 };
    });
    rec('T3 出战宠物动画差异化（不同动画类）', t3.diff && t3.anims.length >= 2, JSON.stringify(t3));
    await page.close();
  }

  // T4 Wiki 并入右上角 sys-btns（不再独立悬浮、不挤占快照）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t4 = await page.evaluate(() => {
      const w = document.getElementById('btn-wiki');
      const sys = document.querySelector('.sys-btns');
      const snap = document.getElementById('snap-btn');
      const cs = getComputedStyle(w);
      const wr = w.getBoundingClientRect(), sr = snap.getBoundingClientRect();
      return { inSys: sys.contains(w), noFixed: cs.position !== 'fixed', overlap: !(wr.right <= sr.left + 1 || wr.left >= sr.right - 1), wr: `${wr.x.toFixed(0)},${wr.y.toFixed(0)}`, sr: `${sr.x.toFixed(0)},${sr.y.toFixed(0)}` };
    });
    rec('T4 Wiki 并入右上角按钮组、不挤占快照', t4.inSys && t4.noFixed && !t4.overlap, JSON.stringify(t4));
    await page.close();
  }

  // T5+T6 深入探索：去括号文案 + 进度条 + 紧急脱出在进度条处
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({
      riftExpedition: { level: 1, until: Date.now() + 30000, gainedDm: 1.2, gainedVs: 0.5, costEp: 100 },
    }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.evaluate(() => { const b = document.getElementById('btn-rift-tab') || [...document.querySelectorAll('button')].find(x => x.textContent.includes('裂隙')); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 400));
    const t56 = await page.evaluate(() => {
      const body = document.body.textContent;
      const abort = document.getElementById('abort-rift-ex');
      const bar = [...document.querySelectorAll('div')].find(d => d.style.height === '10px');
      const barEl = bar ? bar.parentElement.parentElement.textContent : '';
      return {
        noParen: !body.includes('（剩余时间见腐化进度条上方）') && body.includes('深入探索中：'),
        hasBar: !!bar && barEl.includes('探索进度') && barEl.includes('剩余'),
        abortAtBar: !!abort && !!bar && Math.abs(abort.getBoundingClientRect().y - bar.parentElement.parentElement.getBoundingClientRect().y) < 120,
        abortText: abort ? abort.textContent : '',
      };
    });
    rec('T5 深入探索去括号文案', t56.noParen);
    rec('T6a 深入探索显示探索进度条+剩余时间', t56.hasBar, t56.hasBar ? '' : 'bar missing');
    rec('T6b 紧急脱出按钮位于进度条处', t56.abortAtBar, t56.abortText);
    await page.close();
  }

  // T7 专注等级：文案线程产出 + 无悬浮 title
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ focusLevel: 3 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t7 = await page.evaluate(() => {
      const lv = document.getElementById('focus-lv');
      const bar = document.getElementById('focus-bar');
      return { text: lv ? lv.textContent : '', noTitle: bar ? !bar.title && !bar.getAttribute('title') : true, noClickWord: true };
    });
    rec('T7 专注等级显示线程产出加成+去悬浮', t7.text.includes('线程产出') && t7.text.includes('+60%') && t7.noTitle, JSON.stringify(t7));
    await page.close();
  }

  console.log(`\n[v23-diag-v2817] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
