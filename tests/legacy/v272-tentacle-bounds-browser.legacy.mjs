import { chromePath } from '../_chrome.mjs';
// ===== v2.7.2 章鱼触手重做：动效不超出屏幕（浏览器实测） =====
// c 触手尖端原 x204/206 超出 viewBox 200 右缘（fixed right:6 → 摆动时越出视口）；
// 重做：c 触手整体内移（尖端 ≤198）、sway/writhe/tap 角度全面收敛、SVG overflow hidden 兜底
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../../dist/index.html');
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5000, rp: 5, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {},
  cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 鱼缸 3 级：c 触手尖端坐标在 viewBox（200x126）内（重做后 ≤198）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ buildings: { abyss_fishbowl: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 5000));
    const inner = await page.evaluate(() => {
      const g = document.querySelector('.tentacle-deco svg');
      const c = g.querySelector('.tentacle-c path');
      const maxX = Math.max(...c.getAttribute('d').match(/\d+(?:\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 0));
      return { maxX, overflow: getComputedStyle(g).overflow };
    });
    rec('T1 c 触手尖端 ≤ viewBox 192（16px 描边外扩预算内不越界）', inner.maxX <= 192, `maxX=${inner.maxX}`);
    rec('T1b SVG overflow hidden 兜底裁剪', inner.overflow === 'hidden', inner.overflow);
    await page.close();
  }
  // T2 动画运行中采样 4s：所有触手 bounding rect 不超出视口（hover 蠕动 / 常驻抽摆交替）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ buildings: { abyss_fishbowl: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 5000));
    await page.hover('#tentacle-deco');
    let maxRight = 0, maxBottom = 0, inView = true;
    const vw = await page.evaluate(() => window.innerWidth);
    // SVG 容器自身固定在视口内（right:6/bottom:4 且 200x126）；触手动画产生的
    // 几何 bbox 亚像素外扩由 SVG overflow:hidden 裁剪（T1b 已证），视觉不超屏
    const svgBox = await page.evaluate(() => {
      const g = document.querySelector('.tentacle-deco svg');
      const r = g.getBoundingClientRect();
      return { right: r.right, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
    });
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 400));
      const r = await page.evaluate(() => {
        const rects = [...document.querySelectorAll('#tentacle-deco .tentacle')].map(el => {
          const b = el.getBoundingClientRect();
          return { r: b.right, b: b.bottom };
        });
        return { maxR: Math.max(...rects.map(x => x.r)), maxB: Math.max(...rects.map(x => x.b)) };
      });
      maxRight = Math.max(maxRight, r.maxR); maxBottom = Math.max(maxBottom, r.maxB);
      // 亚像素容差 2px：旋转 AABB 外扩（≈110px×sin2°），视觉上被 svg overflow 裁剪
      if (r.maxR > vw + 2) inView = false;
    }
    rec('T2 svg 容器自身不超出视口（right:6/bottom:4）', svgBox.right <= svgBox.w && svgBox.bottom <= svgBox.h, `svgRight=${svgBox.right.toFixed(1)}/${svgBox.w}`);
    rec('T2b 动效运行中：触手不超出视口右缘（亚像素容差，含 hover 蠕动）', inView, `maxRight=${maxRight.toFixed(1)} vw=${vw}`);
    rec('T2c 动画期间触手不超出视口底缘', maxBottom <= 900 + 2, `maxBottom=${maxBottom.toFixed(1)}`);
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
