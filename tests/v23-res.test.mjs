// v2.3 resDiscovered 回归断言（PM §4.1-4.3 / 架构 §三）：顶栏资源首次持有才显示、恰一次 toast、
// v5→v6 迁移直写 0 弹窗、归零不回隐藏、跨转生保留。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const COLLECT = () => {
  const s = (id) => {
    const el = document.getElementById(id);
    if (!el || !el.parentElement) return null;
    return getComputedStyle(el.parentElement).display;
  };
  return { ep: s('h-ep'), cps: s('h-cps'), run: s('h-run'), rank: s('h-rank'), rp: s('h-rp'), es: s('h-es'), faith: s('h-faith'), pt: s('h-pt'), dm: s('h-dm') };
};

// ===== 场景 A：全新档 —— 仅四常显项 + 潮汐可见，六资源项不渲染 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  const d = await page.evaluate(() => ({
    ep: getComputedStyle(document.getElementById('h-ep').parentElement).display,
    cps: getComputedStyle(document.getElementById('h-cps').parentElement).display,
    run: getComputedStyle(document.getElementById('h-run').parentElement).display,
    rank: getComputedStyle(document.getElementById('h-rank').parentElement).display,
    rp: getComputedStyle(document.getElementById('h-rp').parentElement).display,
    es: getComputedStyle(document.getElementById('h-es').parentElement).display,
    faith: getComputedStyle(document.getElementById('h-faith').parentElement).display,
    pt: getComputedStyle(document.getElementById('h-pt').parentElement).display,
    dm: getComputedStyle(document.getElementById('h-dm').parentElement).display,
  }));
  rec('A1 新档四常显项显示（EP/产出/本局）', d.ep !== 'none' && d.cps !== 'none' && d.run !== 'none', JSON.stringify(d));
  rec('A2 新档六资源项全部隐藏', d.rank === 'none' && d.rp === 'none' && d.es === 'none' && d.faith === 'none' && d.pt === 'none' && d.dm === 'none', JSON.stringify(d));
  rec('A3 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 B：锚点制发现路径（v2.3.1 ①）——盲获得不显示；购入灵感工坊后显示含盲累计 =====
// B-neg：rp>0（盲获得）但未购灵感工坊 → 不显示、无 toast、不落档
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default',
      ep: 1000, rp: 50, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
      upgrades: {}, milesDone: {}, tech: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
    window.__toasts = [];
    const obs = new MutationObserver(() => {
      const el = document.getElementById('toast');
      if (el && el.textContent && !window.__toasts.includes(el.textContent)) window.__toasts.push(el.textContent);
    });
    const start = () => { const el = document.getElementById('toast'); if (el) obs.observe(el, { childList: true, characterData: true, subtree: true }); };
    if (document.getElementById('toast')) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const st = await page.evaluate(COLLECT);
  const toasts = await page.evaluate(() => window.__toasts || []);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('B1 锚点前盲获得不显示（rp=50 未购灵感工坊）', st.rp === 'none', st.rp);
  rec('B2 锚点前盲获得无 toast', toasts.filter(t => t.includes('研究点')).length === 0, toasts.join(' | ').slice(0, 120));
  rec('B3 锚点未完成不落档（resDiscovered.rp=false）', saved.resDiscovered && saved.resDiscovered.rp === false, JSON.stringify(saved.resDiscovered));
  await page.close();
}
// B-pos：注入灵感工坊（锚点完成）→ 显示 + 恰一次 toast + 落档 + 含盲累计
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default',
      ep: 1e6, rp: 50, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
      upgrades: { atrium: 1 }, milesDone: {}, tech: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
    window.__toasts = [];
    const obs = new MutationObserver(() => {
      const el = document.getElementById('toast');
      if (el && el.textContent && !window.__toasts.includes(el.textContent)) window.__toasts.push(el.textContent);
    });
    const start = () => { const el = document.getElementById('toast'); if (el) obs.observe(el, { childList: true, characterData: true, subtree: true }); };
    if (document.getElementById('toast')) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const st = await page.evaluate(COLLECT);
  const rpVal = await page.evaluate(() => parseFloat((document.getElementById('h-rp').textContent || '').replace(/,/g, '')) || 0);
  const toasts = await page.evaluate(() => window.__toasts || []);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('B4 锚点完成后顶栏 RP 显示', st.rp !== 'none', st.rp);
  rec('B5 锚点完成后恰一次 toast（文案=新资源：研究点 RP——科技树货币）', toasts.filter(t => t.includes('研究点')).length === 1, toasts.join(' | ').slice(0, 120));
  rec('B6 锚点完成落档（resDiscovered.rp=true）', saved.resDiscovered && saved.resDiscovered.rp === true, JSON.stringify(saved.resDiscovered));
  rec('B7 显示数值含盲累计（≥50，50+工坊产出）', rpVal >= 50, `h-rp=${rpVal}`);
  rec('B8 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 C：v5→v6 迁移 —— 七类存量直写回填、0 弹窗、版本号 6 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 5, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 300, es: 120, faith: 9, pt: 4, dm: 3, prestigePoints: 7,
      upgrades: {}, milesDone: {}, tech: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
    window.__toasts = [];
    const obs = new MutationObserver(() => {
      const el = document.getElementById('toast');
      if (el && el.textContent && !window.__toasts.includes(el.textContent)) window.__toasts.push(el.textContent);
    });
    const start = () => { const el = document.getElementById('toast'); if (el) obs.observe(el, { childList: true, characterData: true, subtree: true }); };
    if (document.getElementById('toast')) start(); else document.addEventListener('DOMContentLoaded', start);
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const st = await page.evaluate(COLLECT);
  const toasts = await page.evaluate(() => (window.__toasts || []).filter(t => t.includes('新资源') || t.includes('晋升')));
  // 等待 5s 自动存档周期（main.js setInterval save 5000ms），使迁移后的运行态落盘后再断言
  await sleep(5800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('C1 v5 旧档资源可见（rank/rp/es/faith/dm），异兽即时门控锁定（无宠物乐园）', st.rank !== 'none' && st.rp !== 'none' && st.es !== 'none' && st.faith !== 'none' && st.pt === 'none' && st.dm !== 'none', JSON.stringify(st));
  rec('C2 迁移 0 弹窗（无新资源/晋升 toast）', toasts.length === 0, toasts.join(' | ').slice(0, 120));
  rec('C3 存档版本升至 6', saved._version === 6, String(saved._version));
  const D = saved.resDiscovered || {};
  rec('C4 回填标记与存量一致（全 true）', D.ep && D.cps && D.run && D.tide && D.rp && D.rank && D.es && D.faith && D.pt && D.dm, JSON.stringify(D));
  rec('C5 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 D：v5 档部分持有 —— 未持有资源不回显（rp 有值、其余 0） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 5, chapter: '1', storyline: 'default',
      ep: 1e5, rp: 300, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
      upgrades: {}, milesDone: {}, tech: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const st = await page.evaluate(COLLECT);
  rec('D1 v5 部分持有：rp 可见、rank/es/faith/pt/dm 隐藏', st.rp !== 'none' && st.rank === 'none' && st.es === 'none' && st.faith === 'none' && st.pt === 'none' && st.dm === 'none', JSON.stringify(st));
  rec('D2 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 E：归零不回隐藏 —— resDiscovered.rp=true 且 rp=0 仍显示 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default',
      ep: 1e5, rp: 0, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
      upgrades: {}, milesDone: {}, tech: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  const st = await page.evaluate(COLLECT);
  rec('E1 归零不回隐藏（全标记 true、rp=0 仍全显示）', st.rp !== 'none' && st.rank !== 'none' && st.es !== 'none', JSON.stringify(st));
  rec('E2 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 F：跨转生保留 —— crossRun 名单源码断言 + 默认四常显断言 =====
{
  const src = readFileSync('src/state.js', 'utf-8');
  const crLine = src.split('\n').find(l => l.includes('const crossRun'));
  rec('F1 crossRun 名单含 resDiscovered（转生保留）', crLine && crLine.includes("'resDiscovered'"), (crLine || '').trim().slice(0, 100));
  rec('F2 newFields 兜底名单含 resDiscovered', src.includes("'_lastActionAt', 'resDiscovered'"), '');
  rec('F3 SAVE_VERSION = 6', /export const SAVE_VERSION = 6;/.test(src), '');
  const dflt = /resDiscovered:\s*\{[^}]+\}/.exec(src)?.[0] || '';
  rec('F4 defaultState 四常显项 true、六资源项 false', dflt.includes('ep: true') && dflt.includes('tide: true') && dflt.includes('rp: false') && dflt.includes('dm: false'), dflt.slice(0, 80));
}

await browser.close();
const fail = results.filter(r => !r.ok).length;
console.log(`\n[v23-res] ${results.length - fail}/${results.length} 项通过`);
process.exit(fail ? 1 : 0);
