import { chromePath } from '../_chrome.mjs';
// v2.8.4 UI 层回归（浏览器实跑）：崩溃倒计时横幅 / 湮灭残片 / ES 门控渲染 / 研究升级区块 / code rain / AI 面板缩小 / 遗存区块
// 运行前提：npm run build 已产出最新 dist
import puppeteer from 'puppeteer-core';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

const mkRaw = (over) => JSON.stringify(Object.assign({
  _version: 6, chapter: '6', storyline: 'default', ep: 1000, rp: 0, es: 0, prestige: 0,
  prestigePoints: 0, runEarned: 0, corruption: 0, cultists: [], ai: null,
  upgrades: {}, buildings: {}, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(),
}, over));

async function withSave(rawObj, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument((raw) => {
    localStorage.setItem('abyss_idle_v2', raw);
  }, rawObj);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(900);
  try { return await fn(page); } finally { await page.close(); }
}

// B1 崩溃倒计时横幅：腐化满额 + EP 触顶 → 显示「深渊吞噬倒计时 mm:ss」
{
  const raw = mkRaw({ ep: 500000, corruption: 100, cultists: [{ name: 't1', mood: 'ok' }, { name: 't2', mood: 'ok' }], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: false } });
  const got = await withSave(raw, async (page) => {
    const t = await page.evaluate(() => document.getElementById('abyss-collapse')?.textContent || '');
    return t;
  });
  rec('B1 崩溃倒计时横幅显示（深渊吞噬倒计时 + mm:ss）', /深渊吞噬倒计时/.test(got) && /[0-9]{2}:[0-9]{2}/.test(got), got.slice(0, 60));
}

// B2 崩溃态横幅（强制转生文案）+ 湮灭残片顶栏
{
  const raw = mkRaw({ collapsed: true, corruption: 100, abyssSplinter: 2, cultists: [{ name: 't1', mood: 'ok' }] });
  const got = await withSave(raw, async (page) => {
    return await page.evaluate(() => {
      const bn = document.getElementById('abyss-collapse')?.textContent || '';
      const spl = document.getElementById('splinter-stat');
      const hv = document.getElementById('h-splinter')?.textContent;
      return { bn, splShown: spl ? spl.style.display !== 'none' : false, hv };
    });
  });
  rec('B2 崩溃态横幅「必须转生」+ 湮灭残片顶栏显示（2）', /必须转生/.test(got.bn) && got.splShown && got.hv === '2', JSON.stringify({ b: got.bn.slice(0, 30), hv: got.hv }));
}

// B3 ES 门控：resDiscovered.es=false → eternal-list 空；true → 渲染
{
  const rawLocked = mkRaw({ resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } });
  const got1 = await withSave(rawLocked, async (page) => {
    return await page.evaluate(() => document.querySelectorAll('#eternal-list .tech').length);
  });
  const rawOpen = mkRaw({ resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: false } });
  const got2 = await withSave(rawOpen, async (page) => {
    return await page.evaluate(() => document.querySelectorAll('#eternal-list .tech').length);
  });
  rec('B3 ES 门控：未解锁 eternal 隐藏(0)，解锁后渲染(>0)', got1 === 0 && got2 > 0, `locked=${got1}, open=${got2}`);
}

// B4 研究升级区块（RP tab）：进入研究点显示「研究升级」列表（RP 觉醒）
{
  const raw = mkRaw({ rp: 500, rpTheories: { rp_entropy: 1 } });
  const got = await withSave(raw, async (page) => {
    return await page.evaluate(() => {
      const tab = document.getElementById('btn-rp');
      if (tab) tab.click();
      return new Promise(res => setTimeout(() => {
        const list = document.getElementById('research-upgrade-list');
        res({ title: !!document.getElementById('research-upgrade-title'), cards: list ? list.querySelectorAll('.item').length : 0, locks: list ? list.querySelectorAll('.rp-group-lock').length : 0, text: (list?.textContent || '').slice(0, 50), pane: document.getElementById('tab-rp')?.style.display });
      }, 300));
    });
  });
  rec('B4 研究升级区块（v2.8.28 分批次）：标题 + 产出强化批 1 四卡 + 后续 2 类目锁定', got.title && got.cards === 4 && got.locks === 2 && /熵减研究/.test(got.text), JSON.stringify(got));
}

// B5 深渊遗存区块（轮回模块内，晋升≥1 显示）
{
  const raw = mkRaw({ prestige: 1, runEarned: 1e8, relicLegacy: { relic_core: 2 } });
  const got = await withSave(raw, async (page) => {
    return await page.evaluate(() => {
      const tab = [...document.querySelectorAll('.tab')].find(t => (t.textContent || '').includes('晋升'));
      if (tab) tab.click();
      return new Promise(res => setTimeout(() => {
        const lg = document.getElementById('echo-legacy-list');
        res({ has: !!lg, text: (lg?.textContent || '').slice(0, 60) });
      }, 300));
    });
  });
  rec('B5 遗存区块：湮灭核心 ×2/3 显示', got.has && /湮灭核心/.test(got.text) && /×2/.test(got.text), got.text);
}

// B6 编译器神殿 code-rain canvas：持有显示
{
  const raw = mkRaw({ upgrades: { compiler_temple: 1 } });
  const got = await withSave(raw, async (page) => {
    return await page.evaluate(() => {
      const cv = document.getElementById('code-rain');
      return { exists: !!cv, shown: cv ? cv.style.display !== 'none' : false };
    });
  });
  rec('B6 编译器神殿：code-rain canvas 显示', got.exists && got.shown, JSON.stringify(got));
}

// B7 AI 面板缩小：auto_tech 科技 → 自动研究开关存在
{
  const raw = mkRaw({ tech: { ai_core: true, auto_tech: true }, ai: { autoUpgrade: true, autoHire: true, autoClaim: true, autoBuild: true, reserve: 0.3 } });
  const got = await withSave(raw, async (page) => {
    return await page.evaluate(() => {
      const tab = document.getElementById('btn-ai');
      if (tab) tab.click();
      return new Promise(res => setTimeout(() => {
        const card = document.getElementById('ai-card') || document.querySelector('.ai-card');
        const sw = [...document.querySelectorAll('.ai-switch')].find(s => (s.textContent || '').includes('自动研究'));
        const names = [...document.querySelectorAll('.ai-switch .ai-switch-name')].map(n => n.textContent);
        res({ hasCard: !!card, hasSwitch: !!sw, names: names.join(',') });
      }, 300));
    });
  });
  rec('B7 AI 面板：自动研究开关渲染（auto_tech）', got.hasCard && got.hasSwitch, JSON.stringify(got));
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n=== v2.8.4 浏览器回归：${results.length - failed.length}/${results.length} 通过 ===`);
process.exit(failed.length ? 1 : 0);
