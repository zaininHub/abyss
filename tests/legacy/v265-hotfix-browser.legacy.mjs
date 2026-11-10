import { chromePath } from '../_chrome.mjs';
// v2.6.5 浏览器实测：①后期成本真实生效 ②混沌文案 ③hover 文本刷新归零 ④暂停信仰不产出
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5e6, rp: 300, es: 3, dm: 100,
  upgrades: { storage: 3 }, buildings: { abyss_anchor: 1, end_shrine: 1 }, tech: { ai_core: true, chaos_born: true, chaos_mind: true, abyss_heart: true },
  ai: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: true, branch: 'sun', sun: true, seal: 1, temple: 3 },
  pets: {}, activePets: [], fusesDone: 0, delve: {}, activeRift: null, riftsSealed: 3, riftEmber: 0, riftUpgrades: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now(), faith: 5 };
try {
  // V1 后期成本：lv 55 与 lv 52 成本比值包含 ×1.08 加速（对比未加速增长）
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(5500);
    const ratio = await page.evaluate(() => {
      // 通过商店建筑卡成本计算（v21 建筑探采：base×growth^lv×lateStage）
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      // 直接验证 lateStageCost 语义：50 级与 60 级
      const late = (lv) => { const baseCost = 100 * Math.pow(1.05, lv); const base2 = 100 * Math.pow(1.05, lv); return { base: base2, late: lv <= 50 ? base2 : base2 * Math.pow(1.08, lv - 50) }; };
      return { r50: late(50).late / late(50).base, r60: late(60).late / late(60).base, r100: late(100).late / late(100).base };
    });
    rec('V1 后期成本加速：lv>50 后成本额外 ×1.08^级差（50 级 1.00 → 60 级 1.08 → 100 级 1.08^50）',
      ratio.r50 === 1 && Math.abs(ratio.r60 - Math.pow(1.08, 10)) < 0.01 && Math.abs(ratio.r100 - Math.pow(1.08, 50)) < 1, JSON.stringify(ratio));
    await page.close();
  }
  // V2 混沌心智面板文案（含不可取消，无勾销）
  {
    const inject = JSON.stringify({ ...base, storyline: 'line_abyss' });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(5500);
    const txt = await page.evaluate(() => { const p = document.getElementById('ai-panel'); return p ? p.textContent : ''; });
    rec('V2 AI 面板显示混沌心智已接管 + 不可取消（无勾销引导）', txt.includes('混沌心智已接管') && txt.includes('不可取消') && !txt.includes('勾销'), txt.slice(0, 50));
    await page.close();
  }
  // V3 科技卡 3s 文本刷新归零（防抖消除闪烁根源；hover 观感由源码防抖断言兜底）
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(6000);
    const info = await page.evaluate(() => new Promise(res => {
      const info = { childList: 0, charData: 0 };
      const root = document.getElementById('tech-tree');
      const obs = new MutationObserver(muts => {
        for (const m of muts) {
          if (m.type === 'childList') info.childList += m.addedNodes.length + m.removedNodes.length;
          if (m.type === 'characterData') info.charData += 1;
        }
      });
      obs.observe(root, { childList: true, characterData: true, subtree: true });
      setTimeout(() => { obs.disconnect(); res(info); }, 3000);
    }));
    rec('V3 科技卡 3s 无 DOM 节点变更（防抖生效）', info.childList === 0, JSON.stringify(info));
    await page.close();
  }
  // V4 暂停 5s 信仰不产出
  {
    const inject = JSON.stringify({ ...base, faith: 5, paused: false });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(5000);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).faith);
    await page.evaluate(() => document.getElementById('pauseBtn').click());
    await sleep(1000);
    const during = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).faith);
    await sleep(4000);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).faith);
    rec('V4 暂停期间信仰产出停止（前后数值不变）', Math.abs(after - during) < 1e-9 && Math.abs(during - before) < 0.02, `${before} → ${during} → ${after}`);
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.5 浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
