// v2.8.1 成就系统：只显示已解锁 + 判定即时点亮
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '..', 'dist', 'index.html');
let pass = 0, fail = 0;
function rec(name, ok, detail = '') { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`); }
const mainSrc = readFileSync('src/main.js', 'utf-8');
const achSrc = readFileSync('src/data/achievements.js', 'utf-8'); // v3.10.0：成就表下沉到数据层

// A. 源码断言：成就定义 ≥16、含名称/描述、页面只渲染已解锁
rec('A1 成就定义 ≥16 项（数据层 id 计数）', (achSrc.match(/\{ id: '/g) || []).length >= 16, 'count');
rec('A2 成就含中文名与描述', achSrc.includes("name: '初次接触'") && achSrc.includes("desc: '第一次点击工作台"));
rec('A3 页面只渲染已解锁（filter S.achievements[d.id]）', mainSrc.includes("S.achievements[d.id]"), 'filter');
const idxSrc = readFileSync('index.html', 'utf-8');
rec('A4 成就 tab 按钮与面板（index.html）', idxSrc.includes('id="btn-achievement"') && idxSrc.includes('id="tab-achievement"'), 'tab');

// B. 浏览器实测：新档无成就 → 空态；达成条件 → 即时点亮；页面只显示已解锁
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => { localStorage.setItem('abyss_idle_v2', JSON.stringify({ _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, totalClicks: 0, upgrades: {}, tech: {}, cultists: [], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() })); });
await page.goto(BASE, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1200));
await page.evaluate(() => document.getElementById('btn-achievement').click());
await new Promise(r => setTimeout(r, 300));
const empty = await page.evaluate(() => document.getElementById('achievement-panel').textContent);
rec('B1 新档成就页显示空态（尚未解锁任何成就）', empty.includes('尚未解锁任何成就'), 'empty');
rec('B2 新档成就页只显示已解锁（0 张卡）', !empty.includes('初次接触'), 'no-card');
// 点击一次 → click1 解锁即时点亮
await page.evaluate(() => { const hero = document.getElementById('hero'); hero.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('btn-achievement').click());
await new Promise(r => setTimeout(r, 300));
const afterClick = await page.evaluate(() => document.getElementById('achievement-panel').textContent);
rec('B3 点击后成就页即时显示「初次接触」', afterClick.includes('初次接触') && /已解锁 1\/2\d/.test(afterClick), 'click1'); // v3.3.3 成就 24+（宽匹配）
// 未解锁成就不显示（ep1m 不应出现）
rec('B4 未解锁成就不显示（无「深流」）', !afterClick.includes('深流'), 'hidden');
await page.close(); await browser.close();
console.log(`\n成就测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
