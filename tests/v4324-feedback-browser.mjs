// v4.3.24 反馈①：裂隙等级升级需求悬浮窗——浏览器验收。
// ①行内常驻需求移除（无价格胶囊/无深入消耗副标题/无原生 title）
// ②悬浮气泡即时显示（mouseover 同步 show）+ 需求/效果/可支付态文案
// ③资源变化后气泡文案实时刷新（面板重建写入新 data-rift-level-tip）
// ④升级按钮购买链路不受影响
import { launchBrowser, gotoAndSettle } from './chapters/_boot.mjs';
import { readFileSync } from 'node:fs';

const browser = await launchBrowser();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 120)));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok - ' + msg); } else { fail++; console.log('  NOT OK - ' + msg); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

await page.evaluateOnNewDocument(() => {
  localStorage.setItem('abyss_idle_v2', JSON.stringify({
    version: 6, chapter: '1', ep: 5e6, rp: 0, es: 0, dm: 500, pt: 0, vs: 0,
    // storage:8 → EP 上限 ≈250K，容得下 Lv0 升级需求 200K EP（tickCorruption 每帧把 EP 截回 cap——
    // 种子超额 EP 会被钳掉，必须先抬 cap 再种 EP）
    upgrades: { storage: 8 }, buildings: {}, tech: {}, cultists: [], faith: 0,
    religion: null, prestige: 0, prestigePoints: 0,
    resDiscovered: { ep: true, cps: true, run: true, dm: true },
    _riftSeen: true, riftsSealed: 1,
    lastSeen: Date.now(), startTime: Date.now(),
  }));
});
const V = (() => { const m = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/深渊效能工作台 v([\d.]+)/); return m ? m[1] : '?'; })();
console.log(`\n=== v${V} 浏览器验收：裂隙等级升级需求悬浮窗 ===`);

await gotoAndSettle(page);
await page.evaluate(() => document.getElementById('btn-rift-tab')?.click());
await sleep(800);

// ===== [1] 行内常驻需求移除 =====
console.log('[1] 行内常驻需求移除');
{
  const r = await page.evaluate(() => {
    const panel = document.getElementById('rift-tab-panel');
    const row = panel?.querySelector('[data-rift-level]');
    if (!row) return { err: 'no row' };
    const rowNoTip = row.cloneNode(true);
    rowNoTip.querySelectorAll('[data-rift-level-tip]').forEach(el => el.removeAttribute('data-rift-level-tip'));
    return {
      text: row.textContent,
      hasTip: row.hasAttribute('data-rift-level-tip'),
      titleAttr: row.getAttribute('title'),
      inlinePrice: /EP \+ [\d,.]+K? DM/.test(rowNoTip.textContent || ''),
      inlineDrain: /深入消耗/.test(rowNoTip.textContent || ''),
      hasBtn: !!row.querySelector('[data-rift-level-buy]'),
      lvText: /Lv\.\d+/.test(row.textContent || ''),
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.lvText, `行显示「裂隙等级 Lv.X」（实际「${r.text.slice(0, 24)}」）`);
    ok(r.hasBtn, '行内保留升级按钮（data-rift-level-buy）');
    ok(!r.inlinePrice, '行内无常驻价格胶囊（X EP + Y DM）');
    ok(!r.inlineDrain, '行内无常驻「深入消耗」副标题');
    ok(r.hasTip, '行挂 data-rift-level-tip 悬浮数据源');
    ok(r.titleAttr === null, '原生 title 已移除（~1s 延迟纪律）');
  }
}

// ===== [2] 悬浮气泡即时显示 + 文案 =====
console.log('[2] 悬浮气泡即时显示与文案');
{
  // 先种足额资源（cap 内 90%）→ affordability 帧刷新 tip 为「✓ 可支付」→ 再 hover
  await page.evaluate(async () => {
    window.S.ep = Math.floor(window.__qa.epStorageCap() * 0.9);
    window.S.dm = 500;
    await new Promise(r2 => setTimeout(r2, 600));
  });
  const r = await page.evaluate(async () => {
    const row = document.querySelector('[data-rift-level]');
    if (!row) return { err: 'no row' };
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 60));
    const pop = document.getElementById('rift-level-tip-pop');
    const shown = pop && pop.classList.contains('show');
    const text = pop ? pop.textContent : '';
    const fixed = pop ? getComputedStyle(pop).position : '';
    row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 60));
    const hiddenAfter = pop ? !pop.classList.contains('show') : false;
    return { shown, text, fixed, hiddenAfter };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.shown, 'mouseover 即时显示气泡（无需 ~1s 延迟）');
    ok(r.fixed === 'fixed', `气泡 fixed 定位（实际 ${r.fixed}）`);
    ok(/升级需求：[\d,.KMB]+ EP \+ [\d,.KMB]+ DM/.test(r.text), `气泡含升级需求（「${(r.text || '').split('\n')[0].slice(0, 50)}」）`);
    ok(/下一级效果：/.test(r.text) && /深入消耗/.test(r.text), '气泡含下一级效果（深入消耗/产出/封印奖励）');
    ok(/✓ 可支付/.test(r.text), '足额资源时气泡显示「✓ 可支付」');
    ok(r.hiddenAfter, 'mouseout 后气泡隐藏');
  }
}

// ===== [3] 资源变化后气泡文案实时刷新 =====
console.log('[3] 气泡文案随资源实时刷新');
{
  const r = await page.evaluate(async () => {
    const row = document.querySelector('[data-rift-level]');
    const before = row?.getAttribute('data-rift-level-tip') || '';
    // 清空资源 → affordability 帧（300ms）同步 tip 属性 → 可支付态应翻转（无需等面板重建）
    window.S.ep = 0; window.S.dm = 0;
    await new Promise(r2 => setTimeout(r2, 800));
    const row2 = document.querySelector('[data-rift-level]');
    const after = row2?.getAttribute('data-rift-level-tip') || '';
    return { flipped: before.includes('✓ 可支付') && after.includes('✗ 余额不足'), before, after };
  });
  ok(r.flipped, `清空资源后气泡可支付态翻转（「${(r.before || '').split('\n')[0].slice(0, 30)}」→「${(r.after || '').split('\n')[0].slice(0, 30)}」）`);
}

// ===== [4] 购买链路不受影响 =====
console.log('[4] 购买链路不受影响');
{
  const r = await page.evaluate(async () => {
    // cap 内种 EP（storage:8 → cap≈250K > 需求 200K），等 affordability 帧点亮按钮
    window.S.ep = Math.floor(window.__qa.epStorageCap() * 0.9);
    window.S.dm = 500;
    await new Promise(r2 => setTimeout(r2, 600));
    const lvBefore = window.S.riftLevelTech;
    const btn = document.querySelector('[data-rift-level-buy]');
    if (!btn) return { err: 'no btn' };
    if (btn.disabled) return { err: 'btn disabled after seeding', ep: window.S.ep, cap: window.__qa.epStorageCap() };
    btn.click();
    await new Promise(r2 => setTimeout(r2, 600));
    return { lvBefore, lvAfter: window.S.riftLevelTech };
  });
  if (r.err) ok(false, r.err + `（ep=${r.ep || '?'} cap=${r.cap || '?'}）`);
  else ok(r.lvAfter === r.lvBefore + 1, `升级按钮购买生效（Lv.${r.lvBefore} → Lv.${r.lvAfter}）`);
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');

await browser.close();
console.log(`\n浏览器专项：${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
