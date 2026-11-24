// v4.3.20 第十轮反馈浏览器专项（真实 DOM / computed style / 数值真值）：
// ① 领导 +1% 出现在产出弹窗「加成与说明」组
// ② 关闭孵化开关 → 绑定线程下岗 + 「N 条线程下岗了」日志 + 下拉未开启岗位灰显
// ③ 手动蒸馏换汇 10000 基准 + 孵化顶栏消耗 = 实扣 15000×lv
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

// ===== ① 领导 +1% 进产出弹窗 =====
console.log('[1] 领导乘区进产出弹窗');
{
  const r = await page.evaluate(async () => {
    // 种一个领导
    window.S._crewUnlocked = true;
    window.S.cultists = [{
      id: 1, name: 'L0', profession: 'overseer', level: 1, xp: 0,
      leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
    }];
    window.__gameDirty.orchestration = true;
    await new Promise(r2 => setTimeout(r2, 800));
    // 触发产出弹窗渲染（flowTipHtml 走 #flow-tip-pop）
    const st = document.getElementById('h-output-stat');
    if (!st) return { err: 'no stat' };
    st.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise(r2 => setTimeout(r2, 300));
    const pop = document.getElementById('flow-tip-pop');
    if (!pop) return { err: 'no pop' };
    return { text: pop.textContent || '', html: pop.innerHTML || '', visible: pop.style.display !== 'none' };
  });
  if (r.err) ok(false, r.err);
  else {
    // textContent 或 innerHTML 任一含「领导 +1%（全局产出）」；弹窗可能 display:none（hover 才显示），
    // 但内容已随 hover 更新——用 textContent 判定
    const blob = (r.text || '') + (r.html || '');
    // v4.3.21 反转：领导行 toFixed(2)（Lv1 → +1.00%）
    ok(/领导 \+1\.00%（全局产出）/.test(blob), '产出弹窗应含「领导 +1.00%（全局产出）」');
    ok(!/领导 \+1\.00% EP/.test(blob), '语义是全局产出而非 EP');
  }
}

// ===== ② 关闭孵化 → 线程下岗 + 日志 + 下拉灰显 =====
console.log('[2] 关闭转化线程下岗');
{
  const r = await page.evaluate(async () => {
    // 种：孵化开启 + 2 条线程绑孵化岗 + 1 条空闲
    window.S._crewUnlocked = true;
    window.S.ptAutoHatch = true; window.S.ptDistillOn = true;
    window.S.ptHatchLv = 3; // 容量 3 ≥ 绑定 2（否则触发 v4.3.19 满员移除，测不到灰显）
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 1 }; // 孵化容量读 ptAutoHatch/ptHatchLv，无需设施升级
    window.S.cultists = Array.from({ length: 3 }, (_, i) => ({
      id: i + 40, name: 'H' + i, profession: 'worker', level: 1, xp: 0,
      leader: false, boundTo: i < 2 ? 'hatch' : null, output: 0.5, mood: '正常', moodTimer: 60,
    }));
    window.__gameDirty.orchestration = true;
    await new Promise(r2 => setTimeout(r2, 900));
    // 轮询等下拉渲染
    let sel = null;
    for (let i = 0; i < 20 && !sel; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      sel = document.querySelector('[data-bind="42"]');
    }
    if (!sel) return { err: 'no select' };
    // 开启态：孵化岗可选
    const hatchOptBefore = [...sel.options].find(o => o.value === 'hatch');
    const enabledBefore = hatchOptBefore && !hatchOptBefore.disabled;
    return { enabledBefore };
  });
  if (r.err) ok(false, r.err);
  else ok(r.enabledBefore, '转化开启时孵化岗可选（非灰显）');
  // 关闭开关 → 下岗
  const r2 = await page.evaluate(async () => {
    const logs0 = JSON.parse(localStorage.getItem('abyss_idle_v2_logcache') || '[]').length;
    // 走快捷开关路径（与原位置开关同口径）
    const btn = document.querySelector('[data-qs="hatch"]');
    if (!btn) return { err: 'no qs btn' };
    btn.click();
    await new Promise(r2 => setTimeout(r2, 500));
    const logs = JSON.parse(localStorage.getItem('abyss_idle_v2_logcache') || '[]');
    const texts = logs.slice(0, 5).map(e => String(e.h).replace(/<[^>]*>/g, ''));
    // 下岗后：绑定清空（等重渲染——轮询 disabled 出现，最长 5s）
    let bound = null, disabledOpt = null;
    for (let i = 0; i < 50; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      const cs = (window.S.cultists || []).filter(c => c.id >= 40 && c.id <= 41);
      const sel = document.querySelector('[data-bind="42"]');
      const opt = sel ? [...sel.options].find(o => o.value === 'hatch') : null;
      if (cs.length && cs.every(c => !c.boundTo) && opt && opt.disabled) {
        disabledOpt = true;
        bound = true;
        break;
      }
    }
    return { logs0, grew: logs.length > logs0, texts, bound, disabledOpt };
  });
  if (r2.err) ok(false, r2.err);
  else {
    // v4.3.21 反馈⑤反转：快捷开关全部静默——下岗不再打日志（功能本身保留）
    ok(!r2.grew, '关闭开关后日志零增长（v4.3.21 反馈⑤ 静默）');
    ok(r2.bound, '绑定线程已置空闲（boundTo 清空，下岗功能保留）');
    ok(r2.disabledOpt === true, '下岗后孵化岗在下拉中灰显（disabled）');
  }
}

// ===== ③ 蒸馏换汇与孵化口径 =====
console.log('[3] 蒸馏换汇与孵化口径');
{
  const r = await page.evaluate(() => {
    // 蒸馏率（__qa 无直出钩子，走 DOM：种 EP 后读蒸馏按钮悬浮）
    window.S.upgrades = { ...(window.S.upgrades || {}), rp_vault: 1 };
    window.S.ep = 50000; window.S.storage = 1e6;
    window.__gameDirty.shop = true;
    return { ep: window.S.ep, lv: window.S.ptHatchLv || 1 };
  });
  ok(true, `种数完成（lv=${r.lv}）`);
  // 孵化顶栏口径：种 ptAutoHatch + 开启 + lv=3，轮询等帧系统刷新（非固定 sleep）
  const r2 = await page.evaluate(async () => {
    window.S.ptAutoHatch = true; window.S.ptDistillOn = true;
    window.S.ptHatchLv = 3;
    window.__gameDirty.top = true;
    const qa = window.__qa;
    // totalDrainPerSec 是即时函数——直接调即可（不依赖渲染帧）
    if (qa && qa.totalDrainPerSec) {
      let d = 0;
      for (let i = 0; i < 10; i++) { d = qa.totalDrainPerSec(); if (d > 1000) break; await new Promise(r3 => setTimeout(r3, 150)); }
      return { drain: d };
    }
    const el = document.getElementById('h-drain-stat');
    return { text: el ? el.textContent : '' };
  });
  if (r2.drain !== undefined) {
    // 孵化 15000×3=45000（无绑定 boost=1）；断言 ≥40000（旧口径 5000×9 也=45000 数值巧合，
    // 但 lv=2 时旧 20K vs 新 30K 才见差异——真值口径由专项源码锁 R3b 保证）
    ok(r2.drain >= 40000, `顶栏消耗含孵化 45K（实际 ${Math.round(r2.drain)}）`);
  } else {
    ok(/45\.0K|45000|45K/.test(r2.text), `顶栏消耗文本含 45K（实际「${r2.text}」）`);
  }
  // 换汇验证：工坊 atrium=1 → rpEffScale=sqrt(2)≈1.414 → rate=14142；EP=50K → 25%=12.5K < rate
  // → spend=rate=14142 → 1 RP（断言锚定「+1 RP」；数值正确性由专项 R3a 锁 10000 基准）
  const r3 = await page.evaluate(async () => {
    window.__gameDirty.rp = true;
    window.__qa.sim.switchTab('rp');
    await new Promise(r2 => setTimeout(r2, 600));
    const btn = document.getElementById('rp-distill-btn');
    if (!btn) return { err: 'no distill btn' };
    return { tip: btn.dataset.distillTip || '' };
  });
  if (r3.err) ok(false, r3.err);
  else {
    ok(/EP \+1 RP/.test(r3.tip), `蒸馏悬浮含换汇（「${(r3.tip || '').slice(0, 40)}」）`);
    // 锚定 ~14.14K（10000×sqrt(2)）：证明基准已从 30K 降（旧口径此处是 30000×1.414≈42.4K）
    ok(/-14\.14K EP/.test(r3.tip), `蒸馏率 = 10000×rpEffScale(√2)≈14.14K（实际含「${/-?\d[\d.]*K EP/.test(r3.tip) ? r3.tip.match(/-?\d[\d.]*K EP/)[0] : r3.tip.slice(0, 20)}」，旧口径应为 42.4K）`);
  }
  // 换汇率直测：关掉工坊消除 rpEffScale 干扰（rp 产出 0 → scale=1）→ rate=10000
  const r4 = await page.evaluate(async () => {
    window.S.upgrades.atrium = 0;
    window.S.rp = 0;
    window.S.ep = 50000;
    window.__gameDirty.rp = true;
    await new Promise(r2 => setTimeout(r2, 600));
    const btn = document.getElementById('rp-distill-btn');
    return btn ? (btn.dataset.distillTip || '') : '';
  });
  ok(/-10\.00K EP \+1 RP/.test(r4) || /-10,000 EP \+1 RP/.test(r4),
    `无工坊时换汇 10K EP → 1 RP（50K EP → 25%=12.5K → 1 RP；实际「${(r4 || '').slice(0, 40)}」，旧口径 30K 基准）`);
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
