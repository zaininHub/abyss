// ===== v3.3.0 线程绑定系统：浏览器自动化实测 =====
// 覆盖用户在 UI 上的真实交互链路（班组面板）：
//   ① 绑定下拉 → 线程绑定到探采/灵感工坊（匹配无惩罚、不匹配产出↓消耗↑）
//   ② 领导晋升按钮 → 领导者全局加成（leaderCount 变化）
//   ③ 智能分配（领导者决策）→ 空闲线程被分配到合适岗位
//   ④ 转化器开关 → 关闭释放绑定（消耗恢复、boost 归 1）
//   ⑤ 卡片展示职业/等级/岗位
// 同时做源码断言（threadBinding.js / crew.js / main.js QA 钩子）。
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');

// Chrome / Chromium 可执行文件（Windows 本机 + CI Linux 兼容）
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/local/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];
const EXEC = CHROME_CANDIDATES.find(p => existsSync(p)) || CHROME_CANDIDATES[0];

const results = [];
const rec = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' :: ' + extra : ''}`);
};

const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '3', storyline: 'default', ep: 5e8, rp: 50, es: 0, dm: 0, vs: 0,
  upgrades: { storage: 300, cpu: 1 }, buildings: {}, tech: {}, ai: {}, milesDone: {},
  // 三个已知职业的线程（覆盖匹配/不匹配/领导三种链路）
  cultists: [
    { id: 'c1', name: '勘探员A', profession: 'prospector', level: 1, xp: 0, leader: false, boundTo: null, output: 3, mood: '正常', moodTimer: 999, hiredAt: Date.now() - 1000, earned: 0 },
    { id: 'c2', name: '蒸馏师B', profession: 'distiller', level: 1, xp: 0, leader: false, boundTo: null, output: 3, mood: '正常', moodTimer: 999, hiredAt: Date.now() - 1000, earned: 0 },
    { id: 'c3', name: '统御官C', profession: 'overseer', level: 1, xp: 0, leader: true, boundTo: null, output: 3, mood: '正常', moodTimer: 999, hiredAt: Date.now() - 1000, earned: 0 },
  ],
  converterOn: { vehicles: true, atrium: true },
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EXEC,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  headless: 'new',
});
try {
  // ---------- 源码断言 ----------
  {
    const fs = await import('fs');
    const tb = fs.readFileSync('src/modules/threadBinding.js', 'utf-8');
    rec('源码 threadBinding.js 导出核心函数',
      ['bindThread', 'unbindThread', 'autoAssignThreads', 'leaderCount', 'converterThreadBoost', 'threadLevelFromXp', 'rollProfession', 'aiSuggestedProfession', 'tickThreads']
        .every(fn => tb.includes(`export function ${fn}`)),
      '');
    const crew = fs.readFileSync('src/modules/crew.js', 'utf-8');
    rec('源码 crew.js 含绑定/领导/智能分配/转化器开关钩子',
      ['data-bind', 'data-leader', 'data-autobind', 'data-conv-toggle'].every(k => crew.includes(k)),
      '');
    const main = fs.readFileSync('src/main.js', 'utf-8');
    rec('源码 main.js 暴露 window.__qa.threadBind 与 window.S',
      main.includes('threadBind:') && main.includes('window.S = S'),
      '');
  }

  // ---------- 浏览器交互 ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
  await page.goto(BASE, { waitUntil: 'load' });

  // 等待班组面板渲染出卡片
  let cards = 0;
  for (let i = 0; i < 30; i++) {
    cards = await page.evaluate(() => document.querySelectorAll('#crew-panel .crew-card').length);
    if (cards >= 3) break;
    await wait(200);
  }
  rec('班组面板渲染出 3 张线程卡', cards >= 3, `cards=${cards}`);

  // ⑤ 卡片展示职业/等级/岗位
  {
    const txt = await page.evaluate(() => document.getElementById('crew-panel').textContent);
    rec('卡片展示「Lv.1」等级', txt.includes('Lv.1'), '');
    rec('卡片展示职业（勘探员/蒸馏师/统御官）', txt.includes('勘探员') && txt.includes('蒸馏师') && txt.includes('统御官'), '');
    // v3.3.1 反馈⑩：协议标题与「关闭开关释放绑定」尾句已删除，只保留规则本身
    rec('面板含绑定规则帮助文案（无协议标题）', txt.includes('匹配职业') && !txt.includes('班组调度协议'), '');
  }

  // 绑定下拉存在
  {
    const selCount = await page.evaluate(() => document.querySelectorAll('#crew-panel select[data-bind]').length);
    rec('每张线程卡含绑定下拉 select[data-bind]', selCount === 3, `selCount=${selCount}`);
    const convCount = await page.evaluate(() => document.querySelectorAll('#crew-panel [data-conv-toggle]').length);
    rec('含 2 个转化器开关按钮', convCount === 2, `convCount=${convCount}`);
  }

  // ② 领导晋升：c3 初始为领导者 → leaderCount=1
  {
    const lc = await page.evaluate(() => window.__qa.threadBind.leaderCount());
    rec('初始领导者计数 = 1（统御官C）', lc === 1, `lc=${lc}`);
    // 点击 c3 的晋升/取消领导按钮 → 取消
    await page.evaluate(() => document.querySelector('[data-leader="c3"]').click());
    await wait(150);
    const lc2 = await page.evaluate(() => window.__qa.threadBind.leaderCount());
    rec('点击取消领导后 leaderCount = 0', lc2 === 0, `lc=${lc2}`);
    // 再点回 → 1
    await page.evaluate(() => document.querySelector('[data-leader="c3"]').click());
    await wait(150);
    const lc3 = await page.evaluate(() => window.__qa.threadBind.leaderCount());
    rec('再次点击晋升领导后 leaderCount = 1', lc3 === 1, `lc=${lc3}`);
  }

  // ① 绑定下拉交互：勘探员A（prospector）绑探采 → 匹配，无惩罚
  {
    await page.select('[data-bind="c1"]', 'vehicles');
    await wait(150);
    const r = await page.evaluate(() => {
      const c = window.S.cultists.find(x => x.id === 'c1');
      const boost = window.__qa.threadBind.converterThreadBoost('vehicles');
      return { boundTo: c.boundTo, boost };
    });
    rec('下拉绑定勘探员A→探采成功', r.boundTo === 'vehicles', `boundTo=${r.boundTo}`);
    rec('匹配绑定的线程提升探采 boost（>1）', r.boost > 1, `boost=${r.boost}`);
  }

  // 蒸馏师B（distiller）绑探采 → 不匹配，产出↓消耗↑
  {
    await page.select('[data-bind="c2"]', 'vehicles');
    await wait(150);
    const r = await page.evaluate(() => {
      const c = window.S.cultists.find(x => x.id === 'c2');
      return { boundTo: c.boundTo };
    });
    rec('下拉绑定蒸馏师B→探采成功', r.boundTo === 'vehicles', `boundTo=${r.boundTo}`);
    // 不匹配 → 该线程自由 EP 产出因子 0.6（通过总产出对比验证）
    const outCmp = await page.evaluate(() => {
      // staffOutputPerSec 受全局乘数影响，改用单线程口径：c2 当前产出 vs 解绑后产出
      const econ = window.__qa;
      const before = econ.staffOutputPerSec();
      // 解绑 c2 看差值
      const c2 = window.S.cultists.find(x => x.id === 'c2');
      const prev = c2.boundTo; c2.boundTo = null;
      const after = econ.staffOutputPerSec();
      c2.boundTo = prev;
      return { diff: before - after };
    });
    rec('非匹配绑定使该线程自由 EP 产出下降（解绑后该线程贡献更高）', outCmp.diff < 0, `diff=${outCmp.diff}`);
  }

  // ③ 智能分配（领导者决策）：先解绑 c1/c2，再点智能分配
  {
    await page.evaluate(() => {
      window.__qa.threadBind.unbindThread(window.S.cultists.find(x => x.id === 'c1'));
      window.__qa.threadBind.unbindThread(window.S.cultists.find(x => x.id === 'c2'));
    });
    await wait(100);
    const before = await page.evaluate(() => window.S.cultists.filter(c => !c.boundTo).length);
    await page.evaluate(() => document.querySelector('[data-autobind]').click());
    await wait(150);
    const after = await page.evaluate(() => window.S.cultists.filter(c => !c.boundTo).length);
    rec('智能分配前存在空闲线程', before >= 1, `idleBefore=${before}`);
    rec('智能分配把空闲线程分配到岗位（空闲数减少）', after < before, `idleBefore=${before} idleAfter=${after}`);
  }

  // ④ 转化器开关：关闭探采 → 释放绑定、boost 归 1
  {
    const onBefore = await page.evaluate(() => window.__qa.threadBind.converterThreadBoost('vehicles'));
    await page.evaluate(() => document.querySelector('[data-conv-toggle="vehicles"]').click());
    await wait(150);
    const r = await page.evaluate(() => ({
      off: window.S.converterOn.vehicles === false,
      boost: window.__qa.threadBind.converterThreadBoost('vehicles'),
      btnTxt: document.querySelector('[data-conv-toggle="vehicles"]').textContent,
    }));
    rec('点击探采开关后 converterOn.vehicles=false', r.off, `onBefore=${onBefore}`);
    rec('关闭探采后绑定 boost 归 1（释放）', r.boost === 1, `boost=${r.boost}`);
    rec('开关按钮文案显示「关」', r.btnTxt.includes('关'), `txt=${r.btnTxt}`);
    // 再开启恢复
    await page.evaluate(() => document.querySelector('[data-conv-toggle="vehicles"]').click());
    await wait(150);
    const restored = await page.evaluate(() => window.S.converterOn.vehicles !== false);
    rec('再次点击恢复探采开启', restored, '');
  }

  // ④ 等级推进：匹配岗位线程在岗累积 XP → 升级，卡片展示更高等级
  {
    // 显式把勘探员A绑到探采（匹配岗位 → 合适，XP 获取更快）
    await page.evaluate(() => {
      const c = window.S.cultists.find(x => x.id === 'c1');
      window.__qa.threadBind.bindThread(c, 'vehicles');
      // 模拟约 200s 在岗（合适岗位 XP ×2.5 → 越过 Lv.2 阈值 348）
      for (let i = 0; i < 4; i++) window.__qa.threadBind.tickThreads(50);
    });
    await wait(1200); // 等面板刷新显示新等级
    const r = await page.evaluate(() => {
      const c = window.S.cultists.find(x => x.id === 'c1');
      const cardTxt = document.getElementById('crew-panel').textContent;
      return { level: c.level, showsLv: cardTxt.includes('Lv.' + c.level) };
    });
    rec('匹配岗位累积 XP 后线程等级提升（≥2）', r.level >= 2, `level=${r.level}`);
    rec('卡片同步展示升级后的等级', r.showsLv, `level=${r.level}`);
  }

  await page.close();
} catch (e) {
  rec('浏览器链路异常', false, String(e && e.stack || e).slice(0, 300));
  process.exitCode = 1;
}
try { await browser.close(); } catch {}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v3.3.0 线程绑定浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join('; ')); process.exit(1); }
