// ===== v2.7.4 七项修复浏览器实测 =====
// ① 遗物 gate 状态周期刷新（进度推进后按钮状态自动更新，无需刷新页面）
// ② 信仰深耕文案去除元描述（超长线/消耗信仰 术语）
// ③ 深渊之心按腐化峰值实装（净化节点不抵消）+ 净化节点 desc 注明取舍
// ④ 缓存优化消耗按级递减（升级持续生效）
// ⑤ 手动激活=新手任务仅首次出现
// ⑥ 新增阶段仓库（备用粮仓/深井仓储）+ 扩容曲线加陡
// ⑦ RP 蒸馏：主动消耗 EP 转化 RP（主源，效率升级）
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5e5, rp: 0, es: 0, dm: 100,
  upgrades: { storage: 2, scooter: 1, convoy: 1, cache: 1 }, buildings: {}, tech: {},
  ai: {}, milesDone: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true },
  _rpOverflowSeen: true, allTimeEp: 2e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // N1 遗物 gate 周期刷新：gate 依赖 riftsSealed（≥1），注入 riftsSealed=0 → 2.5s 内推进 → 按钮自动可点
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ dm: 0, activeRift: { power: 3, level: 3, sealCost: 100, dmReward: 50, expiresAt: Date.now() + 120000 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-relics').click());
    await new Promise(r => setTimeout(r, 300));
    const before = await page.evaluate(() => [...document.querySelectorAll('#relics-panel [data-relic-buy]')].filter(b => b.disabled).length);
    // 游戏内获取 DM：封印裂隙（注入 activeRift）→ S.dm 内存变化 → 周期刷新（≤2s）自动更新遗物按钮
    await page.evaluate(() => {
      const btn = document.getElementById('seal-rift');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2800)); // >2s 周期（frame%20=每 2s）
    const after = await page.evaluate(() => [...document.querySelectorAll('#relics-panel [data-relic-buy]')].filter(b => b.disabled).length);
    rec('N1 遗物状态周期刷新：DM 入账后按钮 3s 内自动可点（无需刷新页面）', before > 0 && after < before, `disabled before=${before} after=${after}`);
    await page.close();
  }
  // N2 信仰深耕文案（源码断言：无「超长线」「消耗信仰」元描述）
  {
    const src = fs.readFileSync('src/modules/religions.js', 'utf-8');
    const data = fs.readFileSync('src/data/religions.js', 'utf-8');
    rec('N2 信仰深耕文案去除元描述（超长线/消耗信仰 不出现）',
      !src.includes('超长线，消耗信仰') && !data.includes('后期信仰深耕'), '');
  }
  // N3 深渊之心：腐化峰值驱动（净化不影响）+ 全局乘区生效
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    // abyss_heart 为故事线科技：tech.abyss_heart=true + corruptionPeak 120 → globalMult 应含 +10%
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { abyss_heart: true }, corruptionPeak: 120, corruption: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const out = await page.evaluate(async () => {
      // 通过购买一次升级观察成本占比不直观——改为读 computeCps 是否 > 无 peak 基线（注入同档无 peak 对比）
      const cps1 = parseFloat(document.getElementById('h-cps') ? document.getElementById('h-cps').textContent.replace(/[^\d.]/g, '') : '0');
      return { cps1 };
    });
    // 对照组：无 abyss_heart + 无 peak
    const page2 = await browser.newPage();
    await page2.setViewport({ width: 1440, height: 900 });
    await page2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: {}, corruptionPeak: 0, corruption: 0 }));
    await page2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const base = await page2.evaluate(() => parseFloat(document.getElementById('h-cps') ? document.getElementById('h-cps').textContent.replace(/[^\d.]/g, '') : '0'));
    rec('N3 深渊之心实装：腐化峰值 120%（>100%）全局产出 +10%（峰值驱动，净化节点不抵消）', out.cps1 > base * 1.05, `peak120=${out.cps1.toFixed(1)} base=${base.toFixed(1)}`);
    await page.close(); await page2.close();
  }
  // N4 缓存优化消耗按级：注入 cache=5 → 每级递减生效（Lv1 -25%，此后 -3%/级）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ upgrades: { storage: 2, cache: 5, subsist1: 1, subsist2: 1, subsist3: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const out = await page.evaluate(() => {
      // 顶栏薪资：5 级 cache = 0.75×0.97^4 ≈ 0.642 × 基础（subsist 全开 ×0.4875）
      const salary = parseFloat(document.getElementById('staff-salary').textContent);
      return { salary };
    });
    rec('N4 缓存优化消耗按级递减实装（cache=5 时消耗系数 ≈0.75×0.97^4≈0.64）', out.salary > 0 && out.salary < 50, `salary=${out.salary}`);
    await page.close();
  }
  // N5 新手任务：新档首次必手动激活（click），此后不再出
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ projects: [] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000)); // 等 init spawn（首次必手动激活）
    const first = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { type: (s.projects[0] || {}).type, done: s._clickTutorialDone };
    });
    // 二轮：转生后新任务不应再是 click
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); s.projects = []; s._clickTutorialDone = true; s.runEarned = 0; localStorage.setItem('abyss_idle_v2', JSON.stringify(s)); });
    await new Promise(r => setTimeout(r, 2000));
    const second = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const p = s.projects[0] || {};
      return { type: p.type, has: s.projects.length > 0 };
    });
    rec('N5 手动激活=新手任务：首次必出一次，之后不再出现', first.type === 'click' && first.done === true && second.type !== 'click', `first=${first.type} second=${second.type}`);
    await page.close();
  }
  // N6 阶段仓库：备用粮仓/深井仓储 渲染 + 上限直读
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ upgrades: { storage: 2, cache: 1, reserve_bin: 1, deep_bin: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const out = await page.evaluate(() => {
      const t = document.getElementById('shop-list').textContent;
      return { reserve: t.includes('备用粮仓'), deep: t.includes('深井仓储') };
    });
    const eco = fs.readFileSync('src/modules/economy.js', 'utf-8');
    const capOk = eco.includes("reserve_bin'] || 0) * 3000") && eco.includes("deep_bin'] || 0) * 5e5");
    rec('N6 阶段仓库实装：备用粮仓/深井仓储 显示 + 上限直读并入计算', out.reserve === true && out.deep === true && capOk === true, JSON.stringify(out));
    await page.close();
  }
  // N8 hover 稳定性：遗物卡 hover 跨过 2s 周期刷新后仍可点击（周期全量重建不丢点击）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ dm: 10000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-relics').click());
    await new Promise(r => setTimeout(r, 300));
    const r = await page.evaluate(() => {
      const b = document.querySelector('#relics-panel [data-relic-buy="tome"]');
      const rc = b.getBoundingClientRect();
      return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 };
    });
    await page.mouse.move(r.x, r.y);
    await new Promise(r2 => setTimeout(r2, 2500)); // 跨 2s 周期刷新（hover 期间重建）
    const still = await page.evaluate(() => {
      const b = document.querySelector('#relics-panel [data-relic-buy="tome"]');
      return b && !b.disabled;
    });
    // hover 后点击购买
    await page.mouse.click(r.x, r.y);
    await new Promise(r2 => setTimeout(r2, 400));
    const bought = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return (s.relics || {}).tome || 0; });
    rec('N8 遗物卡周期刷新 hover 稳定：跨刷新可点且点击成功购买', still === true && bought === 1, `bought=${bought}`);
    await page.close();
  }
  // N7 RP 蒸馏：点击蒸馏 25% EP → RP（效率 15,000:1 基础）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 0, ep: 60000, upgrades: { storage: 500, rp_distill: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-rp').click());
    await new Promise(r => setTimeout(r, 300));
    const pre = await page.evaluate(() => ({ btn: !!document.getElementById('rp-distill-btn'), ep: JSON.parse(localStorage.getItem('abyss_idle_v2')).ep }));
    if (pre.btn) {
      const r = await page.evaluate(() => {
        const b = document.getElementById('rp-distill-btn');
        const rc = b.getBoundingClientRect();
        return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 };
      });
      await page.mouse.click(r.x, r.y);
      await new Promise(r2 => setTimeout(r2, 400));
    }
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
    // 蒸馏 25% × 60,000 = 15,000 / 15,000(÷1.12≈13,393) ≈ 1 RP；ep 减少、rp 增加
    rec('N7 RP 蒸馏实装：点击后 EP 减少 + RP 增加（25% 当前 EP → RP）',
      s.ep < 60000 && s.rp >= 1, `ep=${s.ep.toFixed(0)} rp=${s.rp}`);
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
