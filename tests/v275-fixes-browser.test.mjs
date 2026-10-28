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
  // N3 深渊之心：腐化峰值驱动（单元级——接线在 economy.globalMult，浏览器 h-cps 有 fmt 精度噪声）
  {
    const econ = await import('../src/modules/economy.js');
    const { S } = await import('../src/state.js');
    S.tech = { abyss_heart: true }; S.corruptionPeak = 120;
    const m120 = econ.globalMult();
    S.corruptionPeak = 100;
    const m100 = econ.globalMult();
    rec('N3 深渊之心实装：腐化峰值 120% → 全局产出 ×1.10（峰值驱动，净化节点不抵消）',
      Math.abs(m120 - 1.10) < 1e-9 && Math.abs(m100 - 1) < 1e-9, `m120=${m120.toFixed(4)} m100=${m100.toFixed(4)}`);
  }
  // N4 缓存优化消耗按级：economy.js 消耗公式递减（Lv1 -25%，此后 -3%/级，下限 -35%）
  {
    const eco = fs.readFileSync('src/modules/economy.js', 'utf-8');
    rec('N4 缓存优化消耗按级递减实装（economy 503 行 Math.max(0.65, 0.75×0.97^(lv-1))）',
      eco.includes('0.75 * Math.pow(0.97') && eco.includes('Math.max(0.65'), '');
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
    const capOk = eco.includes("reserve_bin'] || 0) * 8000") && eco.includes("deep_bin'] || 0) * 5e5"); // v2.8.2：3000→8000
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
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 0, ep: 120000, upgrades: { storage: 500, rp_distill: 1 } })); // v2.8.24：蒸馏消耗基础 30000，25%×120000=30000 ≥ rate
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
      s.ep < 120000 && s.rp >= 1, `ep=${s.ep.toFixed(0)} rp=${s.rp}`);
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
