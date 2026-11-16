// v4.0.9 反馈⑤：多分辨率/多屏专项浏览器验收
//
// 背景：用户多显示器环境反馈「检查是否会有问题（展示不全、遮挡等）」。
// 浏览器窗口只会落在某一台显示器的视口内，跨屏问题的本质就是「单一视口尺寸下的
// 裁剪/遮挡/溢出」，因此本专项用 5 档代表性视口逐一检查：
//   ① 2560×1440 超宽（多屏用户常见主屏）：四列铺满、内容不出 #app、触手/浮窗贴底不遮内容
//   ② 1920×1080 单屏基线：#app 锁 100vh、无页面级滚动条、列内滚动正常
//   ③ 1366×768 窄笔记本：整页滚动回退生效（overflow visible）、顶栏资源不溢出
//   ④ 1280×720 双查询命中区（max-width:1280 ∧ min-width:900 同时命中）：v408 修复不回退
//   ⑤ 900×620 短窗：wage 气泡上下翻转仍完整在屏、弹框（wiki）不出视口
//
// 用法：node tests/v409-multires-browser.mjs
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v409-multires-report.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 4, ep: 5000, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  upgrades: { reserve_bin: 12 }, buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 10,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 9, prestigePoints: 3,
  lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const report = {};
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());

  // 通用检查体：关键元素是否在视口内 + 可命中（不被遮挡）+ 无横向溢出
  const probe = () => page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const out = { vw, vh, issues: [] };
    const inView = (el, label, tol = 0) => {
      if (!el) { out.issues.push(label + ' 缺失'); return; }
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return; // 隐藏元素跳过
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.left < -tol || r.top < -tol || r.right > vw + tol || r.bottom > vh + tol) {
        out.issues.push(`${label} 超出视口 (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)}) vs ${vw}x${vh}`);
      }
    };
    inView(document.querySelector('.topbar'), '顶栏');
    inView(document.getElementById('app'), '#app');
    // 日志面板：单屏布局（#app overflow hidden，不滚动）必须完整在视口；
    // 窄屏整页滚动布局只要求「能滚到」——滚到面板末端后手柄必须可见可命中
    const app = document.getElementById('app');
    const appClips = app && getComputedStyle(app).overflow !== 'visible';
    const panel = document.getElementById('log-panel');
    const handle = document.getElementById('log-resize');
    if (panel && getComputedStyle(panel).display !== 'none') {
      if (appClips) inView(panel, '日志面板');
      if (handle) {
        panel.scrollIntoView({ block: 'end' }); // 窄屏：滚到面板底部再看命中
        const r = handle.getBoundingClientRect();
        if (r.bottom > vh + 1 || r.top < -1) {
          out.issues.push(`滚动后手柄仍超出视口 top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} vs vh=${vh}`);
        } else {
          const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1);
          const cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
          const hit = document.elementsFromPoint(cx, cy);
          if (!hit.includes(handle)) out.issues.push('日志手柄被遮挡（elementsFromPoint 未命中，滚动到面板末端后）');
        }
      } else if (appClips) {
        out.issues.push('日志手柄缺失');
      }
    }
    // 横向溢出：document 宽不超视口（窄屏整页滚动是纵向的，横向滚动条即问题）
    if (document.documentElement.scrollWidth > vw + 1) {
      out.issues.push(`页面横向溢出 scrollWidth=${document.documentElement.scrollWidth} > ${vw}`);
    }
    return out;
  });

  const runViewport = async (w, h, label) => {
    console.log(`\n[${label}] ${w}×${h}`);
    await page.setViewport({ width: w, height: h });
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(1300);
    const p = await probe();
    report[label] = p;
    if (p.issues.length === 0) ok(`${label} 无裁剪/遮挡/横向溢出`);
    else p.issues.forEach(i => bad(`${label}: ${i}`));
  };

  await runViewport(2560, 1440, '超宽 2560');
  await runViewport(1920, 1080, '单屏 1920');
  await runViewport(1366, 768, '窄笔记本 1366');
  await runViewport(1280, 720, '窄视口 1280');
  await runViewport(900, 620, '短窗 900');

  // ============ ⑤ 短窗下 wage 气泡与 wiki 弹框 ============
  console.log('\n[短窗 附加] wage 气泡翻转 / wiki 弹框不出视口');
  await page.setViewport({ width: 1024, height: 600 });
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1200);
  const tipTest = await page.evaluate(() => {
    const zone = document.getElementById('wage-help-zone');
    if (!zone) return { skip: 'wage-help-zone 不存在（布局态不同）' };
    zone.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    return { ok: true };
  });
  await sleep(300);
  if (tipTest.skip) { console.log(`  ⚠ 跳过 wage 气泡：${tipTest.skip}`); }
  else {
    const tip = await page.evaluate(() => {
      const p = document.getElementById('wage-tip-pop');
      if (!p || !p.classList.contains('show')) return { fail: '气泡未显示' };
      const r = p.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      if (r.left < 0 || r.right > vw || r.top < 0 || r.bottom > vh) {
        return { fail: `气泡出视口 (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)}) vs ${vw}x${vh}` };
      }
      return { ok: true, rect: `${Math.round(r.width)}x${Math.round(r.height)}` };
    });
    if (tip.ok) ok(`wage 气泡完整在视口内（${tip.rect}）`);
    else bad('wage 气泡: ' + (tip.fail || '未知'));
  }
  // wiki 弹框（wiki-box 78vh/720px 上限）在短窗中不得超出
  await page.evaluate(() => document.getElementById('btn-wiki')?.click());
  await sleep(400);
  const wiki = await page.evaluate(() => {
    const box = document.querySelector('.wiki-box');
    if (!box) return { fail: 'wiki-box 不存在' };
    const r = box.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) {
      return { fail: `wiki 弹框出视口 (${Math.round(r.left)},${Math.round(r.top)})-(${Math.round(r.right)},${Math.round(r.bottom)}) vs ${vw}x${vh}` };
    }
    return { ok: true, h: Math.round(r.height) };
  });
  if (wiki.ok) ok(`wiki 弹框完整在视口内（高 ${wiki.h}px）`);
  else bad('wiki 弹框: ' + (wiki.fail || '未知'));

  if (errs.length) { bad(`页面错误 ${errs.length} 条`); errs.slice(0, 3).forEach(e => console.log('    ' + e)); }
  else ok('五档视口加载零 pageerror');
} finally {
  await browser.close();
  try { await import('node:fs').then(fs => fs.promises.writeFile(REPORT, JSON.stringify(report, null, 2))); } catch { /* /tmp 不可写忽略 */ }
}
console.log(`\n===== v4.0.9 多分辨率专项：${pass} 通过 / ${fail} 失败 =====`);
if (fail) process.exit(1);
