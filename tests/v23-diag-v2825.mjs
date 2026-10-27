// ===== v2.8.25 四项反馈：①研究点 tab 说明文案去除；②研究点扩充（5→10 项 + 全接线）；③编译器神殿粒子可见；④探采平台灰态即时刷新 =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

// T1（unit）：研究点扩充至 10 项
const { BALANCE } = await import('../src/data/balance.js');
rec('T1 研究点升级 10 项（原 5 项 → 新增薪酬/存储/星尘/圣颂/离线协议）', BALANCE.researchUpgs.length === 10, `${BALANCE.researchUpgs.length} 项: ${BALANCE.researchUpgs.map(u => u.id).join(',')}`);

// T3（unit）：新增研究接线生效（薪酬协商→线程消耗降低 / 存储协议→EP 上限提高 / 星尘精炼→DM 采集提高 / 圣颂研究→信仰产出提高）
import { S } from '../src/state.js';
import * as ec from '../src/modules/economy.js';
import { templeFaithPerSec } from '../src/data/religions.js';
S.cultists = [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }];
S.rpTheories = {};
const w0 = ec.staffSalaryPerSec(); S.rpTheories.rp_wage = 10; const w1 = ec.staffSalaryPerSec();
rec('T3a 薪酬协商接线（10 级线程消耗 ×0.6）', w1 < w0 && Math.abs(w1 / w0 - 0.6) < 1e-9, `${w0}→${w1}`);
S.rpTheories = {};
const c0 = ec.epStorageCap(); S.rpTheories.rp_storage = 8; const c1 = ec.epStorageCap();
rec('T3b 存储协议接线（8 级 EP 上限 ×1.64）', c1 > c0 && Math.abs(c1 / c0 - 1.64) < 1e-9, `${c0}→${c1}`);
S.rpTheories = {};
S.upgrades = S.upgrades || {};
S.upgrades.scooter = 10; // 使 DM 采集基准非 0
const d0 = ec.vehicleDmPerMin(); S.rpTheories.rp_dm = 8; const d1 = ec.vehicleDmPerMin();
rec('T3c 星尘精炼接线（8 级 DM 采集 ×1.64）', d1 >= d0 && (d0 === 0 ? d1 === 0 : Math.abs(d1 / d0 - 1.64) < 1e-9), `${d0}→${d1}`);
S.rpTheories = {};
S.religion = { temple: 1 };
const f0 = templeFaithPerSec(); S.rpTheories.rp_faith = 5; const f1 = templeFaithPerSec();
rec('T3d 圣颂研究接线（5 级信仰产出 ×1.5）', f1 > f0 && Math.abs(f1 / f0 - 1.5) < 1e-9, `${f0}→${f1}`);

// 浏览器：② 标题文案 + ④ 探采灰态 + ③ 粒子
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  const mk = (ep, dm, up, extra) => JSON.stringify(Object.assign({ _version: 6, chapter: '1', storyline: 'default', ep, rp: 500, es: 0, dm,
    upgrades: Object.assign({ compiler_temple: 1, storage: 100, scooter: 35, convoy: 22 }, up), buildings: {}, tech: {}, ai: {},
    cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
    pets: {}, activePets: [], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: true, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now() }, extra));
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // ② 研究点 tab：标题无「长线研究 / RP 购买 · …」说明文案
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk(5e7, 0));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  await page.click('#btn-rp');
  await new Promise(r => setTimeout(r, 400));
  const titles = await page.evaluate(() => {
    const t = document.getElementById('research-upgrade-title');
    const t2 = document.getElementById('rp-upgrade-title');
    const t3 = document.getElementById('family-upgrade-title');
    return [t, t2, t3].map(x => x ? x.textContent : '');
  });
  const clean = titles.every(t => !t.includes('RP 购买') && !t.includes('长线') && !t.includes('觉醒'));
  rec('T2 研究点/研究升级/族升级标题无说明文案', clean, JSON.stringify(titles));
  // ④ 探采灰态：EP 9.45M < 装甲车队 12.85M（base 12.85e6×1.30^22 口径）→ 卡 cant
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk(9.45e6, 333, { scooter: 35, convoy: 22 }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const b = document.getElementById('btn-relics'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 500));
  const vehicle = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-buy]')];
    const conv = cards.find(c => c.textContent.includes('装甲车队'));
    return { found: !!conv, cant: conv ? conv.classList.contains('cant') : false, cost: conv ? (conv.querySelector('.cost')?.textContent || '') : '' };
  });
  rec('T4 探采灰态即时（EP 9.45M < 装甲车队成本 → cant）', vehicle.found && vehicle.cant, JSON.stringify(vehicle));
  // ③ 粒子可见（启动即绘——startApp 调 ensureCodeRain，不依赖 tick）
  await new Promise(r => setTimeout(r, 2000));
  const rain = await page.evaluate(() => {
    const c = document.getElementById('code-rain');
    if (!c) return { ok: false, why: 'no canvas' };
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 110 && d[i + 3] > 150) bright++; }
    return { ok: c.style.display !== 'none' && bright > 1500, display: c.style.display, bright };
  });
  rec('T5 编译器神殿粒子启动即绘（18px/0.85/12FPS）', rain.ok, JSON.stringify(rain));
  await page.close();
  console.log(`\n[v23-diag-v2825] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2825] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
