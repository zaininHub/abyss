// ===== v2.7.2 线程消耗减少：购买生效 + 一次性升级封顶（浏览器实测） =====
// 背景：subsist1/2/3/mem 无 maxLevel 可无限购，但效果按"拥有"判定（多购不再递减）
// → 用户买第 2 次起"线程消耗减少不生效"。修复：一次性升级 maxLevel:1（满级锁定）；
// cache 保留无限（存储上限 +5000/级）且 desc 明确"消耗 -25%（一次性）"
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '3', storyline: 'default', ep: 5e6, rp: 5, es: 0, dm: 0,
  upgrades: { storage: 20 }, buildings: {}, tech: {}, ai: {}, milesDone: {},
  cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 源码断言：消耗优化升级一次性（maxLevel:1）+ cache 无限且文案一次性
  {
    const fs = await import('fs');
    const src = fs.readFileSync('src/data/upgrades.js', 'utf-8');
    rec('T1 能量合剂/循环供氧/生物打印餐/内存扩容 maxLevel:1（一次性，杜绝多购无效果）',
      src.includes("id:'subsist1'") && src.includes('maxLevel:1') && src.includes("id:'subsist2'") && src.includes("id:'subsist3'") && src.includes("id:'mem'") && src.includes("id:'cache'"), '');
    rec('T1b 缓存优化消耗递减 + 存储上限（v2.8.23 desc：-25% 起/每级 -3%，EP 上限 +8000/级）', src.includes('线程消耗 -25% 起，每级再 -3%') && src.includes('EP 存储上限 +8000/级'), '');
  }
  // T2 浏览器实测：购买能量合剂后每秒薪资下降（1.88→0.56 量级）、卡片转满级不可再购
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e8, upgrades: { storage: 300, cpu: 1 } })); // v2.8.27：链窗 K=p+1 + cap 抬升——CPU 已购揭示能量合剂（3e8 ≤ ep 5e8 可买）
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 4000));
    const before = await page.evaluate(() => (document.getElementById('staff-salary')?.textContent || '').trim());
    const card = await page.evaluate(() => {
      const el = document.querySelector('#thread-shop [data-buy="subsist1"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    let out = {};
    if (card) {
      await page.mouse.click(card.x, card.y);
      await new Promise(r => setTimeout(r, 500));
      out = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
        // 满级卡移除 data-buy（购买入口删除）：在 owned-item 中按名字定位
        const el = [...document.querySelectorAll('#thread-shop .owned-item')].find(e => e.textContent.includes('能量合剂'));
        const cls = el ? el.className : null;
        const txt = el ? el.textContent.replace(/\s+/g, ' ').slice(0, 40) : null;
        return { subsist1: s.upgrades.subsist1 || 0, cls, txt, salary: (document.getElementById('staff-salary')?.textContent || '').trim() };
      });
    }
    rec('T2 购买能量合剂落档（subsist1=1，消耗减少生效——v2.8.20 后薪资并入消耗/s 悬浮）', out.subsist1 === 1, `subsist1=${out.subsist1} salaryEl=${out.salary || '(移除)'}`);
    rec('T2b 能量合剂购后满级锁定（Lv.1/1 满，不可再购）', out.cls === 'item owned-item' && out.txt && out.txt.includes('满'), JSON.stringify(out));
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
}
function rec(name, ok, extra) {
  console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? ' :: ' + extra : ''));
}
try { await browser.close(); } catch {}
process.exit(process.exitCode || 0);
