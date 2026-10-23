// v2.7.1：①升级点击真实鼠标路径 + 立即落盘（修复 5s 保存窗口丢购买）
// ②晋升转生真实鼠标全链路 + 文案直观化（达标绿/未达标红 + 立即落盘）
import puppeteer from 'puppeteer-core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const base = { _version: 6, chapter: '3', storyline: 'default', ep: 5000, rp: 5, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {},
  cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now() };
try {
  // ① 升级点击：真实鼠标点击 → 300ms 内购买落盘（无 5s 等待）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify({ ...base }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000));
    const card = await page.evaluate(() => {
      const el = document.querySelector('#shop-list [data-buy="scribble"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    rec('C1 升级卡存在可点击', !!card);
    if (card) {
      await page.mouse.click(card.x, card.y);
      await new Promise(r => setTimeout(r, 300)); // 立即读（<5s 保存窗口）
      const s = await page.evaluate(() => { const x = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { scribble: x.upgrades.scribble || 0, ep: x.ep }; });
      rec('C2 真实鼠标点击升级卡：300ms 内购买落盘（修复保存窗口丢购买）', s.scribble === 1 && s.ep > 1970 && s.ep < 2000, JSON.stringify(s));
      const dom = await page.evaluate(() => { const el = document.querySelector('#shop-list [data-buy="scribble"]'); return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) : null; });
      rec('C3 DOM 卡状态同步（×1）', !!dom && dom.includes('×1'), dom);
    }
    await page.close();
  }
  // ② 晋升：达标档真实鼠标点击 → 模态 → 选天赋 → 转生立即落盘
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      JSON.stringify({ ...base, runEarned: 4e7, ep: 100, chapter: '5', storyline: 'line_abyss' }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000));
    await page.click('#btn-prestige');
    await new Promise(r => setTimeout(r, 500));
    const p = await page.evaluate(() => {
      const b = document.getElementById('prestige-btn');
      const panel = document.getElementById('prestige-panel').textContent;
      const st = document.querySelector('.prestige-status');
      const r = b.getBoundingClientRect();
      return { disabled: b.disabled, hasOk: !!st && st.className.includes('ok'), text: b.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2, panelHasReward: panel.includes('已达标：可晋升转生') };
    });
    rec('P1 达标档：按钮可点 + 绿色「已达标」状态行 + 奖励明细', !p.disabled && p.hasOk && p.panelHasReward, JSON.stringify(p).slice(0, 100));
    await page.mouse.click(p.x, p.y);
    await new Promise(r => setTimeout(r, 600));
    const modal = await page.evaluate(() => {
      const m = document.getElementById('talent-modal');
      const opts = document.querySelectorAll('.talent-option');
      return { display: m ? getComputedStyle(m).display : 'no', n: opts.length };
    });
    rec('P2 真实鼠标点击晋升按钮：天赋模态弹出', modal.display === 'flex' && modal.n >= 1, JSON.stringify(modal));
    if (modal.n) {
      const opt = await page.evaluate(() => { const o = document.querySelector('.talent-option'); const r = o.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.click(opt.x, opt.y);
      await new Promise(r => setTimeout(r, 600));
      const after = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { runEarned: s.runEarned, pp: s.prestigePoints, prestige: s.prestige }; });
      rec('P3 选择天赋：转生立即落盘（runEarned 清零、PP+2、prestige+1）', after.runEarned === 0 && after.pp === 2 && after.prestige === 1, JSON.stringify(after));
    }
    await page.close();
  }
  // ③ 晋升：未达标档按钮暗置 + 红色「未达标」状态行
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify({ ...base }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 5000));
    await page.click('#btn-prestige');
    await new Promise(r => setTimeout(r, 500));
    const p = await page.evaluate(() => {
      const b = document.getElementById('prestige-btn');
      const st = document.querySelector('.prestige-status');
      return { disabled: b.disabled, hasNo: !!st && st.className.includes('no'), text: st ? st.textContent.trim() : null };
    });
    rec('P4 未达标档：按钮可点暗置（非 disabled）+ 红色「未达标：还差 N EP（%）」状态行', !p.disabled && p.hasNo && p.text.includes('未达标：还差'), JSON.stringify(p));
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.7.1 点击/晋升浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
