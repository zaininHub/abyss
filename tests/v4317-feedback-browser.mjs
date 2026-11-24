// v4.3.17 反馈浏览器专项（真实 DOM / computed style）：
// 岗位下拉框宽度恒定——晋升领导出现/消失两态跳变消除 + 长选项不溢出卡片
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

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 120)));
await page.goto(GAME_URL);
await sleep(1500);

await page.evaluate(() => {
  window.S._crewUnlocked = true;
  window.S.cultists = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1, name: 'T' + i, profession: 'worker', level: 1, xp: 0,
    leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
  }));
  window.__gameDirty && (window.__gameDirty.orchestration = true);
});
await sleep(800);

// ===== ① 晋升前后下拉宽度恒定 =====
console.log('[1] 晋升两态宽度恒定');
{
  const r = await page.evaluate(async () => {
    const selW = (id) => document.querySelector(`[data-bind="${id}"]`)?.getBoundingClientRect().width;
    // 轮询等首张卡渲染
    for (let i = 0; i < 30 && selW(2) == null; i++) await new Promise(r2 => setTimeout(r2, 100));
    const before = selW(2);
    const beforeBtnW = document.querySelector('[data-leader="2"]')?.getBoundingClientRect().width ?? 0;
    // 晋升 T0 → T1 卡的晋升按钮消失
    document.querySelector('[data-leader="1"]')?.click();
    await new Promise(r2 => setTimeout(r2, 600));
    const after = selW(2);
    const afterBtnExists = !!document.querySelector('[data-leader="2"]');
    return { before, after, beforeBtnW, afterBtnExists };
  });
  ok(r.before != null && r.after != null, `下拉宽度可测（before=${r.before} after=${r.after}）`);
  ok(Math.abs(r.before - r.after) < 0.5, `晋升前后下拉宽度恒定（${r.before} → ${r.after}，两态跳变消除）`);
  ok(r.before <= 100, `下拉不宽（${r.before}px ≤ 100px）`);
  ok(!r.afterBtnExists, '领导在任时其他卡晋升按钮已隐藏（v4.3.15 ③ 维持）');
}

// ===== ② 长选项场景恒宽 + 不溢出卡片 =====
console.log('[2] 长选项恒宽不溢出');
{
  const r = await page.evaluate(async () => {
    // 种多岗位解锁场景（v4.3.19：满员岗位从下拉移除——长选项文案改为「（未解锁）」标注路径，
    // 用未解锁岗位项验证长文案下恒宽；满员标注已随 v4.3.15 ② 反转删除）
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 2, scooter: 1 };
    window.S.cultists = Array.from({ length: 5 }, (_, i) => ({
      id: i + 10, name: 'X' + i, profession: 'worker', level: 1, xp: 0,
      leader: i === 0, boundTo: i === 1 ? 'atrium' : i === 2 ? 'atrium' : null,
      output: 0.5, mood: '正常', moodTimer: 60,
    }));
    window.__gameDirty && (window.__gameDirty.orchestration = true);
    await new Promise(r2 => setTimeout(r2, 800));
    // 轮询等重建——查一条**空闲**线程的卡（id=13 X3 未绑岗）：满员岗位（atrium 已 2/2）
    // 不应出现在其下拉里（v4.3.19 ② 口径）
    let sel = null;
    for (let i = 0; i < 30 && !sel; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      sel = document.querySelector('[data-bind="13"]');
    }
    if (!sel) return { err: 'no select' };
    const card = sel.closest('.crew-card');
    const sr = sel.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    return {
      w: sr.width,
      overflow: sr.right > cr.right + 0.5,
      hasAtrium: [...sel.options].some(o => o.value === 'atrium'),
      optCount: sel.options.length,
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(Math.abs(r.w - 78) < 1, `长选项下仍恒 78px（实际 ${r.w}）`);
    ok(!r.overflow, '下拉不溢出卡片');
    ok(!r.hasAtrium, '满员岗位已从空闲线程下拉移除（v4.3.19 反转）');
    // 按钮不换行（★ 不掉第二行）：按钮高度应 ~19px 而非 32px
    const btnH = await page.evaluate(() =>
      document.querySelector('.crew-card [data-leader]')?.getBoundingClientRect().height ?? 0);
    ok(btnH > 0 && btnH < 26, `晋升按钮单行高（${btnH}px < 26px，★ 未换行）`);
  }
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
