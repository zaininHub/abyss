// v4.3.14 第六轮反馈批次浏览器专项（真实 DOM）：
// ① 班组滚动：种 20 线程 → 首屏自动填充至可滚 → 触底累积展开 → 全部展示
// ② 领导卡：晋升后等级重置 Lv1、星标 +1% 悬浮、卸任恢复
// ③ 裂隙面板：裂隙等级行在裂隙科技上方、EP+DM 价格 pill、购买升级
// ⑥ 产出悬浮窗：线程·专注加成独立行
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

// ===== ① 班组滚动自动填充 =====
console.log('[1] 班组滚动自动填充');
await page.evaluate(() => {
  window.S.cultists = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1, name: 'T' + i, profession: 'worker', level: 1, xp: 0,
    leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
  }));
  window.S._crewUnlocked = true;
  window.__gameDirty && (window.__gameDirty.orchestration = true);
});
// 等首屏自动填充完成（轮询卡片渲染，防加载慢的偶发）
{
  let cards = 0;
  for (let i = 0; i < 30 && cards < 7; i++) {
    await sleep(100);
    cards = await page.evaluate(() => document.querySelectorAll('#crew-panel .crew-card').length);
  }
}
{
  const r = await page.evaluate(() => {
    const c = document.getElementById('crew-panel');
    return { sh: c.scrollHeight, ch: c.clientHeight, cards: c.querySelectorAll('.crew-card').length, pagerText: c.querySelector('.crew-pager span')?.textContent || '' };
  });
  ok(r.sh > r.ch + 4, `首屏自动填充至可滚（sh=${r.sh} > ch=${r.ch}，cards=${r.cards}）`);
  ok(r.cards > 6, `首屏卡片数 > 单组 6（实际 ${r.cards}）`);
}
await page.evaluate(() => {
  const c = document.getElementById('crew-panel');
  c.scrollTop = c.scrollHeight;
  c.dispatchEvent(new Event('scroll', { bubbles: true }));
});
// 触底累积展开同样轮询（防偶发）
{
  let cards = 0;
  for (let i = 0; i < 20 && cards < 20; i++) {
    await sleep(100);
    cards = await page.evaluate(() => document.querySelectorAll('#crew-panel .crew-card').length);
  }
}
{
  const r = await page.evaluate(() => {
    const c = document.getElementById('crew-panel');
    return { cards: c.querySelectorAll('.crew-card').length, pagerText: c.querySelector('.crew-pager span')?.textContent || '' };
  });
  ok(r.cards >= 20, `触底后累积展开（cards=${r.cards}）`);
  ok(/已全部展示 20 条线程/.test(r.pagerText), `收尾文案「已全部展示 20 条线程」（实际「${r.pagerText}」）`);
}

// ===== ② 领导卡 =====
console.log('[2] 领导机制');
await page.evaluate(() => {
  const c = window.S.cultists[0];
  c.level = 5; c.xp = 2000; // 预置高等级，提拔后应清零
  window.__gameDirty && (window.__gameDirty.orchestration = true);
});
await sleep(600);
{
  // 点第一张卡的晋升★按钮
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('#crew-panel [data-leader]');
    if (!btn) return false;
    btn.click(); return true;
  });
  ok(clicked, '晋升★按钮可点');
  await sleep(400);
  const r = await page.evaluate(() => {
    const c = window.S.cultists[0];
    const card = document.querySelector('#crew-panel .crew-card');
    const star = card?.querySelector('span[title^="领导"]');
    return {
      leader: c.leader, level: c.level, xp: c.xp || 0,
      starTip: star ? star.getAttribute('title') : '',
      starText: star ? star.textContent : '',
      noSelect: !card.querySelector('select[data-bind]'),
      logHtml: document.getElementById('log-content')?.innerHTML || '',
    };
  });
  ok(r.leader === true, '领导标记生效');
  // v4.3.23 反转：任命不重置等级（等级是线程自身属性，XP 跨任命保留）
  ok(r.level === 5, `任命不重置等级（实际 Lv.${r.level}）`);
  ok(r.starText === '★' && /全局 EP 产出 \+1% × 等级乘数/.test(r.starTip), `星标「★」+悬浮「全局 EP 产出 +1% × 等级乘数」（v4.3.23；实际「${r.starTip}」）`);
  ok(r.noSelect, '领导卡无岗位下拉');
  const feedOk = await page.evaluate(() => (window.S.crewFeed || []).some(e => /就任领导（Lv\.5，全局 EP 产出 \+1\.32%，随等级提升）/.test(e.msg)));
  ok(feedOk, '晋升班组流水 v4.3.23 口径「就任领导（Lv.5，全局 EP 产出 +1.32%，随等级提升）」');
}

// ===== ③ 裂隙面板 =====
console.log('[3] 裂隙等级行迁移');
await page.evaluate(() => {
  window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 }; // 抬 EP 上限（300 级 cap≈1e23）防帧系统 clamp
  window.S._riftSeen = true;
  window.S.riftsSealed = 1;
  window.S.riftEmber = 100;
  window.S.riftLevelTech = 2;
  window.S.dm = 500; window.S.ep = 5e6;
  window.__gameDirty && (window.__gameDirty.rift = true);
});
// 切到裂隙 tab（tab 锁定态由 1s 低频帧刷新 → 等 1.2s 再切；switchTab 内联渲染面板）
await sleep(1300);
await page.evaluate(() => document.getElementById('btn-rift-tab')?.click());
await sleep(800);
{
  const r = await page.evaluate(() => {
    const panel = document.getElementById('rift-tab-panel');
    if (!panel) return { err: 'no #rift-tab-panel' };
    const html = panel.innerHTML;
    const lvRow = panel.querySelector('[data-rift-level]');
    const lvBtn = panel.querySelector('[data-rift-level-buy]');
    const techIdx = html.indexOf('裂隙科技');
    const lvIdx = html.indexOf('裂隙等级');
    // 科技树 tab 不再有裂隙等级
    const techTab = document.getElementById('tab-tech');
    return {
      hasRow: !!lvRow, hasBtn: !!lvBtn,
      lvLv: lvRow?.querySelector('div div')?.textContent || '',
      order: techIdx >= 0 && lvIdx >= 0 ? (lvIdx < techIdx ? 'level-first' : 'tech-first') : (lvIdx >= 0 ? 'level-only' : 'none'),
      techTabHas: techTab ? /data-rift-level/.test(techTab.innerHTML) : null,
      buyBtnText: lvBtn?.textContent || '',
    };
  });
  ok(r.hasRow, '裂隙面板有裂隙等级行');
  ok(r.order === 'level-first', `裂隙等级在「裂隙科技」上方（order=${r.order}）`);
  ok(r.techTabHas === false, '科技树 tab 已无裂隙等级');
  ok(r.hasBtn && /升级/.test(r.buyBtnText), `升级按钮（「${r.buyBtnText}」）`);
  // 购买升级（按钮可购态由 300ms affordability 帧刷新 → 种资源后等一帧再点）
  const lvBefore = await page.evaluate(() => {
    window.S.ep = Math.max(window.S.ep, 5e6);
    window.S.dm = Math.max(window.S.dm, 500);
    return window.S.riftLevelTech;
  });
  await sleep(500);
  const lvAfter = await page.evaluate(() => {
    const btn = document.querySelector('[data-rift-level-buy]');
    if (btn.disabled) window.S.ep = Math.max(window.S.ep, 5e6);
    btn.click();
    return window.S.riftLevelTech;
  });
  ok(lvAfter === lvBefore + 1, `购买升级（${lvBefore} → ${lvAfter}）`);
}

// ===== ⑥ 产出悬浮窗 =====
console.log('[4] 产出悬浮窗线程/专注拆分');
await page.evaluate(() => {
  window.S.focusLevel = 5;
  window.__gameDirty && (window.__gameDirty.top = true);
});
await sleep(600);
{
  const r = await page.evaluate(() => {
    const st = document.getElementById('h-output-stat');
    if (!st) return { err: 'no #h-output-stat' };
    st.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const pop = document.getElementById('flow-tip-pop');
    return { html: pop ? pop.innerHTML : '', shown: pop ? pop.classList.contains('show') : false };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(/线程·专注加成/.test(r.html), '产出来源含「线程·专注加成」独立行');
    ok(!/专注 \+\d+%/.test(r.html), '加成组不再列「专注 +X%」百分比');
  }
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
