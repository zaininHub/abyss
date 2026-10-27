// ===== v2.8.24 三项反馈：①净化节点移出主商店；②编译器神殿粒子可见；③EP 持续消耗大幅上调 =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

// 单元断言：③ 数值上调
const { BALANCE } = await import('../src/data/balance.js');
rec('T1 线程薪资大幅上调（salaryBase 1.12 / 单线程封顶 1.8/s）', BALANCE.thread.salaryBase === 1.12 && BALANCE.thread.salaryPerThreadCap === 1.8, `base=${BALANCE.thread.salaryBase} cap=${BALANCE.thread.salaryPerThreadCap}`);
rec('T2 载具采集 EP 消耗 ×2.5（epPerDm=2500）', BALANCE.vehicles.epPerDm === 2500, `epPerDm=${BALANCE.vehicles.epPerDm}`);

// 浏览器：①净化节点仅遗物区 + ②粒子可见
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  const mk = (up, tech) => JSON.stringify({ _version: 6, chapter: '1', storyline: 'default', ep: 2e8, rp: 100, dm: 600, es: 0,
    upgrades: Object.assign({ compiler_temple: 1, storage: 100, purifier1: 1 }, up), buildings: {}, tech, ai: {},
    cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
    pets: {}, activePets: [], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: true, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now() });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  // ①：有熵减协议 + 已购净化节点——主商店「存储与资源建筑」不应含净化节点；遗物区应有
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mk({}, { entropy_reduce: true }));
  await page.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const shopTxt = await page.evaluate(() => {
    const g = document.getElementById('shop'); const g2 = document.getElementById('thread-shop');
    return (g ? g.textContent : '') + (g2 ? g2.textContent : '');
  });
  rec('T3 主商店不再渲染净化节点（仅遗物区 DM 购买）', !shopTxt.includes('净化节点'), shopTxt.includes('净化节点') ? '仍含净化节点' : '商店无净化节点');
  await page.click('#btn-relics');
  await new Promise(r => setTimeout(r, 400));
  const relicTxt = await page.evaluate(() => document.body.textContent.includes('净化节点 I'));
  rec('T4 遗物区仍展示净化节点（净化节点 I）', relicTxt);
  // ②：编译器神殿粒子 canvas 可见（display 非 none + 绘制像素量级正确）
  const rain = await page.evaluate(() => {
    const c = document.getElementById('code-rain');
    if (!c) return { ok: false, why: 'no canvas' };
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let bright = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 1] > 100 && d[i + 3] > 120) bright++; } // 青色分量 + 高透明
    return { ok: c.style.display !== 'none' && bright > 800, display: c.style.display, bright }; // 截图实证：16px 青色字符雨肉眼可见（单帧 ~2500 高亮像素 ≈ 50+ 字符）
  });
  rec('T5 编译器神殿粒子可见（canvas 绘制青色字符像素）', rain.ok, JSON.stringify(rain));
  await page.close();
  console.log(`\n[v23-diag-v2824] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2824] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
