// 分章节测试体系 · 共享引导层（v4.2.6 反馈②，从 tests/v3110-30day-browser.mjs 抽取）
//
// 职责：浏览器启动参数统一、页面创建、存档种子注入、Date.now 时间虚拟化、
//       setInterval 拦截与游戏帧驱动准备（__vt / __simT / __tick 三件套）。
//       v3110 30 天推演与分章节推演共用本模块；抽取后 v3110 行为零变化。
//
// 时序约定（与 v3110 原 boot() 逐字一致）：
//   1. prepPage()        —— newPage / viewport / pageerror 监听 / evaluateOnNewDocument 注入
//                           （种子写入 localStorage + Date.now 虚拟化 + setInterval 拦截）；
//   2. （可选）调用方继续 page.evaluateOnNewDocument(...) 注册推演侧专用文档期初始化；
//   3. gotoAndSettle()   —— 真正加载 dist/index.html，sleep(1400) 等启动帧，
//                           清掉页面自身 setInterval，初始化 __simT；
//   4. （可选）调用方继续 page.evaluate(...) 注入推演侧专用运行时（如 __runBatch）。
//
// 用法（分章节推演，见 run-range.mjs）：
//   const browser = await launchBrowser();
//   const { page, errs } = await prepPage(browser, { save: seedFromSnapshot(snap) });
//   await gotoAndSettle(page);
//   await page.evaluate(chapterPlayerInit);
import puppeteer from 'puppeteer-core';
import { chromePath } from '../_chrome.mjs'; // Chrome 路径单一真源（跨平台 + CHROME_PATH 显式覆盖）

export const TICKS_PER_DAY = 8640; // 86400s / 10s（每 tick 10 游戏秒，与 v3110 一致）
export const sleep = ms => new Promise(r => setTimeout(r, ms));
// dist 路径基于本模块文件定位（对 process.cwd 不敏感——后台任务/异目录调用不会 ENOENT）
import { fileURLToPath } from 'node:url';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const gameUrl = () => 'file://' + REPO_ROOT + 'dist/index.html';

/** 统一浏览器启动参数（headless + 无沙箱，与 v3110 launch 逐字一致）。 */
export async function launchBrowser() {
  return puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'],
  });
}

/**
 * 基础种子：第 1 章新档。字段与 v3110 原 mkSave() 完全一致（v3.11.2 起解锁 ai_core，
 * 让推演真实覆盖 AI 自动化；助手余额从 0 开始，靠产品真实入口扩编，不伪造进度）。
 * overrides 供分章节推演合并跨局快照（seedFromSnapshot）或调整 storyline。
 */
export function baseSeed(overrides = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0, pt: 0,
    upgrades: {}, buildings: {}, tech: { ai_core: true }, cultists: [], faith: 0,
    religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
    resDiscovered: { ep: true, cps: true, run: true, tide: true },
    lastSeen: Date.now(), startTime: Date.now(),
    ...overrides,
  });
}

/**
 * 页面准备（goto 之前）：种子注入 + 时间虚拟化 + setInterval 拦截。
 * 返回 { page, errs }；之后仍可继续注册 evaluateOnNewDocument，最后调 gotoAndSettle()。
 */
export async function prepPage(browser, { save }) {
  const page = await browser.newPage();
  page.setDefaultTimeout(300000);
  await page.setViewport({ width: 1600, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await page.evaluateOnNewDocument((raw) => {
    localStorage.setItem('abyss_idle_v2', raw);
    window.__rawSaveHasResonance = raw.includes('"resonance"');
    window.__vt = 0;
    const origNow = Date.now.bind(Date);
    Date.now = () => origNow() + window.__vt;
    window.__timerIds = [];
    const origSI = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => { const id = origSI(fn, ms, ...a); window.__timerIds.push(id); return id; };
  }, save);
  return { page, errs };
}

/** 加载游戏并完成帧驱动准备：清页面自身 interval、初始化 __simT（与 v3110 原逻辑一致）。 */
export async function gotoAndSettle(page) {
  await page.goto(gameUrl(), { waitUntil: 'load' });
  await sleep(1400);
  await page.evaluate(() => {
    (window.__timerIds || []).forEach(id => clearInterval(id));
    window.__simT = performance.now() + 1000;
  });
  return page;
}
