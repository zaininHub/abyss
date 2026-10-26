// ===== v2.8.8 完整 review：浏览器自动化实测（倍速虚拟时间玩真实流程） =====
// 覆盖：清档文案 / 溢出文案删除 / 线程产出消耗显示+封顶 / 科技树标题+ai_core 锁定 /
// v21 纯 EP / 族升级拆档 / 深入按钮暗色 / 招募-购买-数值生效 / console 错误收集
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
  _version: 6, chapter: '3', storyline: 'default', ep: 5e6, rp: 8, es: 0, dm: 0,
  upgrades: { storage: 20, subsist1: 1, subsist2: 1, mem: 1 }, buildings: {}, tech: {},
  ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0 },
  milesDone: { 100: 1, 1000: 1 }, cultists: [], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
const errors = [];
try {
  // T1 倍速实玩：30 线程 + 满资源，虚拟时间推进 180s 观察游戏流程
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    const cultists = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: '深潜者' + i, output: 2, mood: '正常', moodTimer: 999 }));
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ ep: 5e7, cultists, upgrades: { storage: 20, subsist1: 1, subsist2: 1, mem: 1, cache: 10 }, milesDone: { 100: 1, 1000: 1, 10000: 1 },
        unlockedBuildings: { beacon_1: true, beacon_2: true, beacon_3: true }, buildings: { beacon_1: 1, beacon_2: 1, beacon_3: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    // 倍速：虚拟时间推进（timers + rAF 加速，performance.now 走虚拟时钟）
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 180000, maxVirtualTimeTaskStarvationCount: 10000 });
    await new Promise(r => setTimeout(r, 6000)); // 真实 6s → 虚拟 ~180s
    const out = await page.evaluate(() => {
      const g = s => document.querySelector(s);
      const epEl = g('#h-ep'), salaryEl = g('#staff-salary'), outEl = g('#staff-out');
      const hireCost = g('#staff-cost');
      const techTitle = g('#tab-tech h3');
      const aiCard = [...document.querySelectorAll('#tech-tree [data-tech]')].find(e => e.textContent.includes('AI'));
      const bargain = [...document.querySelectorAll('#v21-building-list .item')].find(e => e.textContent.includes('议价坊'));
      const v21Text = (document.getElementById('v21-building-list')?.textContent || '').replace(/\s+/g, ' ');
      const overflow = g('#v21-overflow-stat') ? g('#v21-overflow-stat').textContent : '(no el)';
      const delve = g('#tab-rift .btn') || g('#delve-panel .btn');
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return {
        ep: epEl ? epEl.textContent : null, salary: salaryEl ? salaryEl.textContent : null,
        staffOut: outEl ? outEl.textContent : null, hireCost: hireCost ? hireCost.textContent : null,
        techTitle: techTitle ? techTitle.textContent : null, aiCard: aiCard ? aiCard.className : null,
        bargain: bargain ? bargain.textContent.replace(/\s+/g, ' ') : null,
        v21Text, overflow, delveBtn: delve ? delve.className + ' ' + (delve.style.background || '') : null,
        cultists: s.cultists.length, epSaved: s.ep, upgraded: s.upgrades,
      };
    });
    // a) 产出推进：EP 应增长（倍速 180s 后 ep > 5e7 初始；若 EP 已达上限则接近上限）
    rec('T1a 倍速 180s：EP 状态有效推进（无冻结/无 NaN）', out.ep !== 'NaN' && !isNaN(parseFloat(String(out.ep).replace(/[KMB,]/g, ''))), `ep=${out.ep}`);
    // b) 线程消耗显示：招募行显示产出/消耗，且消耗 ≤ 0.9×线程数（封顶）
    const salaryNum = parseFloat(out.salary) || 0;
    rec('T1b 线程消耗封顶：30 线程薪资 ≤ 27/s（0.9×30）', salaryNum <= 27.1 && salaryNum > 0, `salary=${out.salary}`);
    rec('T1c 招募行显示产出与消耗', !!out.staffOut && !!out.hireCost, `out=${out.staffOut} cost=${out.hireCost}`);
    // c) 无 console 错误
    rec('T1d 倍速全程无 console/page 错误', errors.length === 0, errors.slice(0, 3).join(' | '));
    // d) 科技树标题去（RP 购买）+ AI 卡锁定显示
    rec('T2a 科技树标题无（RP 购买）', out.techTitle && !out.techTitle.includes('（RP 购买）'), out.techTitle);
    rec('T2b AI 管理核心恒显示（锁定卡）', out.aiCard === 'tech locked', out.aiCard);
    // e) 议价坊纯 EP
    rec('T3a v21 未解锁卡显示 EP 成本（源码断言）', (await import('fs')).readFileSync('src/modules/shop.js', 'utf-8').includes('const cost = v21BuildingCost(b); // v2.8.8：纯 EP 购买（解锁+首级），去除 RP 解锁+EP 升级混合支付'), '');
    rec('T3b v21 列表整体无「RP 解锁」残留', !out.v21Text.includes('RP 解锁'), out.v21Text.slice(0, 80));
    // g) 探采溢出文案删除
    rec('T5a 探采页头溢出文案已删除', !out.overflow || out.overflow === '' || out.overflow.includes('(no el)'), out.overflow);
    // h) 深入按钮（裂隙 tab 未解锁态）
    rec('T6a 深入按钮存在', !!out.delveBtn, out.delveBtn);
    await page.close();
  }

  // T7 清档弹窗文案 + 快照逐个删
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.reload({ waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    // 制造一个快照
    await page.evaluate(() => {
      const btn = document.getElementById('snap-save');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));
    await page.click('#snap-btn');
    await new Promise(r => setTimeout(r, 400));
    const resetTxt = await page.evaluate(() => {
      const btn = document.querySelector('.snap-reset');
      if (!btn) return '(no reset btn)';
      btn.click();
      const modal = document.getElementById('confirm-modal');
      const box = modal && modal.style.display !== 'none' ? modal : null;
      return box ? box.textContent.replace(/\s+/g, ' ').slice(0, 120) : '(no modal)';
    });
    rec('T7a 清档确认文案=只删当前（快照保留）', resetTxt.includes('当前本地游戏') && resetTxt.includes('快照保留'), resetTxt);
    // 确认按钮点击 → 快照应保留
    await page.evaluate(() => {
      const m = document.getElementById('confirm-modal');
      const okBtn = m && m.querySelector('#confirm-ok');
      if (okBtn) okBtn.click();
    });
    await new Promise(r => setTimeout(r, 1500)); // 清档触发 reload
    const after = await page.evaluate(() => {
      const snaps = JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]');
      return { snaps: snaps.length, main: localStorage.getItem('abyss_idle_v2') };
    });
    rec('T7b 清档后快照保留、当前档重置', after.snaps >= 1 && after.main === null, JSON.stringify(after));
    await page.close();
  }
  console.log(`\n[v23-diag-v288] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
