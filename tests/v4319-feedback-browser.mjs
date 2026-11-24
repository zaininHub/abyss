// v4.3.19 第九轮反馈浏览器专项（真实 DOM / computed style）：
// ⑦ 深空探测 ch1 不可见 ch3 可见（章节>前置）+ 章节字段驱动重渲染
// ② 满员岗位从空闲线程下拉移除（自身在岗保留）
// ① 擅长岗位图标 hover 即显气泡（无 ~1s 延迟）
// ⑤ 锁定 tab 双渲染路径观感一致（computed style）
// ⑥ 原位置开关点击入日志
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = path.join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_URL = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ok -', name); } else { fail++; console.log('  NOT OK -', name); } };

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 120)));
await page.goto(GAME_URL);
await sleep(1500);

// ===== ① 章节门禁：deep_space ch1 不可见 / ch3 可见 =====
console.log('[1] 深空探测章节门禁（章节>前置）');
{
  const r = await page.evaluate(async () => {
    const deepVisible = () => {
      const card = [...document.querySelectorAll('.tech-item, .tech')].find(c => (c.textContent || '').includes('深空探测'));
      return !!card && card.offsetParent !== null;
    };
    // ch1（新档默认）：切到科技面板后应不可见
    window.__qa.sim.switchTab('tech');
    await new Promise(r2 => setTimeout(r2, 600));
    const ch1Visible = deepVisible();
    // 种 chapter=3 → 重切面板触发 renderTech（渲染层读 chapterAtLeast）
    window.S.chapter = 3;
    window.__qa.sim.switchTab('rp');
    await new Promise(r2 => setTimeout(r2, 200));
    window.__qa.sim.switchTab('tech');
    await new Promise(r2 => setTimeout(r2, 600));
    const ch3Visible = deepVisible();
    return { ch1Visible, ch3Visible };
  });
  ok(!r.ch1Visible, `ch1 深空探测不可见（实际 ${r.ch1Visible}）`);
  ok(r.ch3Visible, 'ch3 深空探测出现（章节字段驱动渲染）');
}

// ===== ② 满员岗位下拉源头移除 =====
console.log('[2] 满员岗位下拉移除');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 2 };
    window.S.cultists = Array.from({ length: 4 }, (_, i) => ({
      id: i + 20, name: 'Y' + i, profession: 'worker', level: 1, xp: 0,
      leader: false, boundTo: i < 2 ? 'atrium' : null, output: 0.5, mood: '正常', moodTimer: 60,
    }));
    window.__gameDirty.orchestration = true;
    await new Promise(r2 => setTimeout(r2, 900));
    // 轮询等卡片渲染
    let sel = null;
    for (let i = 0; i < 20 && !sel; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      sel = document.querySelector('[data-bind="22"]');
    }
    if (!sel) return { err: 'no select' };
    // 空闲线程（Y2）：atrium 2/2 满员 → 不应出现在下拉
    const idleSel = [...sel.options].some(o => o.value === 'atrium');
    // 在岗线程（Y0）：自身 atrium 应保留
    const selSelf = document.querySelector('[data-bind="20"]');
    const selfSel = selSelf ? [...selSelf.options].some(o => o.value === 'atrium') : false;
    return { idleSel, selfSel };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(!r.idleSel, '空闲线程下拉无满员岗位（atrium 2/2 移除）');
    ok(r.selfSel, '在岗线程下拉保留自身岗位（原地重选不占新坑）');
  }
}

// ===== ③ 擅长岗位图标 hover 即显气泡 =====
console.log('[3] aff 气泡 hover 即显');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.cultists = Array.from({ length: 2 }, (_, i) => ({
      id: i + 30, name: 'Z' + i, profession: 'worker', level: 1, xp: 0,
      leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
      affinity: i === 0 ? 'scooter' : null,
    }));
    window.__gameDirty.orchestration = true;
    await new Promise(r2 => setTimeout(r2, 900));
    let anchor = null;
    for (let i = 0; i < 20 && !anchor; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      anchor = document.querySelector('[data-aff-tip]');
    }
    if (!anchor) return { err: 'no anchor' };
    // hover 派发 mouseover——即时显示（无原生 title 的 ~1s 延迟）
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 120));
    const pop = document.getElementById('aff-tip-pop');
    if (!pop) return { err: 'no pop node' };
    return {
      visible: pop.style.display !== 'none' && getComputedStyle(pop).display !== 'none',
      text: (pop.textContent || '').slice(0, 30),
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.visible, 'hover 即显（120ms 内可见，无延迟）');
    ok(/擅长|怠惰|暂无职业/.test(r.text), `气泡文案三段式（「${r.text}...」）`);
    // 移开后隐藏
    const hidden = await page.evaluate(async () => {
      document.querySelector('[data-aff-tip]').dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      await new Promise(r2 => setTimeout(r2, 120));
      const pop = document.getElementById('aff-tip-pop');
      return getComputedStyle(pop).display === 'none' || pop.style.display === 'none';
    });
    ok(hidden, '移开后气泡隐藏');
  }
}

// ===== ④ 锁定 tab 双路径观感一致 =====
console.log('[4] 锁定 tab 样式统一');
{
  const r = await page.evaluate(() => {
    const lockedEls = [...document.querySelectorAll('.tab-locked')];
    if (!lockedEls.length) return { err: 'no locked tab' };
    const cs = getComputedStyle(lockedEls[0]);
    return { opacity: parseFloat(cs.opacity), bg: cs.backgroundColor, count: lockedEls.length };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(Math.abs(r.opacity - 0.4) < 0.01, `锁定 opacity 统一 0.4（实际 ${r.opacity}，共 ${r.count} 个锁定元素）`);
    ok(r.bg === 'rgb(33, 38, 45)', `锁定底色统一 #21262d（实际 ${r.bg}）`);
  }
}

// ===== ⑤ 原位置开关点击入日志 =====
console.log('[5] 原位置开关日志');
{
  const r = await page.evaluate(async () => {
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 1 };
    window.S.ep = 5000; window.S.storage = 1e6;
    window.__gameDirty.shop = true;
    window.__qa.sim.switchTab('rp');
    await new Promise(r2 => setTimeout(r2, 600));
    const btn = document.querySelector('[data-atrium-switch]');
    if (!btn) return { err: 'no switch' };
    const logLen0 = (window.S.logs || []).length;
    btn.click();
    await new Promise(r2 => setTimeout(r2, 400));
    // logs 真源在 localStorage abyss_idle_v2_logcache（runtime 模块私有 + log() 落盘）
    const logs = JSON.parse(localStorage.getItem('abyss_idle_v2_logcache') || '[]');
    const last = logs[0] ? String(logs[0].h).replace(/<[^>]*>/g, '') : '';
    return { grew: logs.length > logLen0, last: last.slice(0, 40) };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.grew, `开关点击后日志增长（末条「${r.last}」）`);
    // v4.3.23 反转：v4.3.21 反馈⑤快捷开关类操作全部静默（开关不打日志）——
    //   本用例原断言 v4.3.19「自动蒸馏…」日志，现反转为静默口径（不新增日志）
    ok(!/自动蒸馏/.test(r.last), '开关点击静默（v4.3.21 反馈⑤：不打日志；末条非蒸馏日志）');
  }
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
