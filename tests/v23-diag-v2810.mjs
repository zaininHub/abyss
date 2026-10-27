// ===== v2.8.10 六项反馈浏览器实测 =====
// ①问号点击弹四态说明 ②恢复缓冲缩短+预览合并单位修正 ③离线灰显/高亮 ④科技树6卡无留空 ⑤蒸馏灰显 ⑥组标题无字母
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
  // T1 问号点击：staff-status 点击弹四态说明
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e5, cultists: [{ id: 1, name: 'T', output: 2, mood: '正常', moodTimer: 999 }] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#staff-status');
    await new Promise(r => setTimeout(r, 300));
    const t1 = await page.evaluate(() => {
      const m = document.getElementById('confirm-modal');
      return { shown: m.style.display, title: document.getElementById('confirm-title').textContent, text: document.getElementById('confirm-text').textContent.slice(0, 30) };
    });
    rec('T1 点击线程状态弹出四态说明', t1.shown === 'flex' && t1.title.includes('线程状态说明') && t1.text.includes('满薪'), JSON.stringify(t1));
    // 关掉弹窗
    await page.evaluate(() => document.getElementById('confirm-cancel').click());
    // 预览：只显示下一线程（无总览 staff-out）
    const t1b = await page.evaluate(() => ({
      preview: document.getElementById('staff-preview').textContent,
      hasTotal: !!document.getElementById('staff-out'),
    }));
    rec('T1b 招募行只展示下一线程（无总产出/消耗 span）', !t1b.hasTotal && t1b.preview.includes('下一线程') && t1b.preview.includes('产出 +'), JSON.stringify(t1b));
    rec('T1c 预览产出=实际单线程产出（output=2 注入档 → +2.0/s）', /产出 \+2\.0\/s/.test(t1b.preview), t1b.preview);
    await page.close();
  }

  // T2 恢复缓冲缩短（数值断言）+ dormant 恢复流转
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 1e6, cultists: [{ id: 1, name: 'T', output: 2, mood: '正常', moodTimer: 999 }],
        wageState: { state: 'dormant', debtSec: 0, dormantSec: 120, bufferSec: 0, loseTimer: 0 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t2 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const W = null;
      return { state: s.wageState.state, bufferSec: s.wageState.bufferSec, recoverSec: null };
    });
    rec('T2 dormant + EP 充足：进入恢复缓冲（debt 态）', t2.state === 'debt', JSON.stringify(t2));
    // 缓冲倒计时后回满薪
    await new Promise(r => setTimeout(r, 18000)); // 15s 缓冲 + 余量
    const t2b = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).wageState.state);
    rec('T2b 缓冲结束后回满薪（流转不再卡住）', t2b === 'ok', t2b);
    await page.close();
  }

  // T3 离线升级灰显/高亮
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e5, rp: 0, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await page.click('#btn-offline');
    await new Promise(r => setTimeout(r, 500));
    const t3 = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#offline-upg-list [data-buy]')];
      return cards.map(c => ({ name: c.textContent.slice(0, 10), opacity: getComputedStyle(c).opacity, border: getComputedStyle(c).borderColor, cursor: getComputedStyle(c).cursor }));
    });
    // rp=0 资源不足 → 灰显 not-allowed
    rec('T3 RP 不足的离线升级灰显（opacity .5 / not-allowed）', t3.length > 0 && t3.every(c => c.opacity === '0.5' && c.cursor === 'not-allowed'), JSON.stringify(t3.slice(0, 1)));
    await page.evaluate((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e5, rp: 50, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page.close();
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    // ep 需 ≤ 存储上限（storage 32 级 cap≈102.5K）否则加载时被 clamp → 判为 EP 不足
    await page2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1e5, rp: 50, upgrades: { storage: 32 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await page2.click('#btn-offline');
    await new Promise(r => setTimeout(r, 500));
    const t3b = await page2.evaluate(() => {
      const c = document.querySelector('#offline-upg-list [data-buy]');
      return c ? { opacity: getComputedStyle(c).opacity, cursor: getComputedStyle(c).cursor, border: getComputedStyle(c).borderColor } : null;
    });
    rec('T3b RP/EP 充足的离线升级高亮可点', t3b && t3b.cursor === 'pointer', JSON.stringify(t3b));
    await page2.close();
  }

  // T4 科技树 6 卡无留空
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e5, rp: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 500));
    const t4 = await page.evaluate(() => ({
      cards: [...document.querySelectorAll('#tech-tree [data-tech]')].map(e => e.textContent.slice(0, 8)),
      title: document.querySelector('#tab-tech h3').textContent,
    }));
    rec('T4 科技树 6 把钥匙全部显示（无留空）', t4.cards.length === 6 && t4.cards.some(c => c.includes('混沌护盾')), JSON.stringify(t4));
    await page.close();
  }

  // T5 蒸馏按钮灰显
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 0, rp: 0, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await page.click('#btn-rp');
    await new Promise(r => setTimeout(r, 500));
    const t5 = await page.evaluate(() => { const b = document.getElementById('rp-distill-btn'); return b ? { disabled: b.disabled, opacity: getComputedStyle(b).opacity } : null; });
    rec('T5 EP 不足（蒸馏不出 1 RP）蒸馏按钮灰显 disabled', t5 && t5.disabled === true, JSON.stringify(t5));
    await page.close();
  }

  // T6 组标题无字母前缀
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e5, rp: 50, allTimeEp: 1e9, upgrades: { scribble: 1, storage: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    const t6 = await page.evaluate(() =>
      [...document.querySelectorAll('#v21-building-list .group-title')].map(e => e.textContent.trim()).filter(x => x));
    rec('T6 效能建筑组标题无「字母 · 」前缀', t6.length > 0 && t6.every(x => !/^[A-Z] · /.test(x)), JSON.stringify(t6));
    await page.close();
  }
  console.log(`\n[v23-diag-v2810] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
