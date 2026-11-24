// v4.3.16 第七轮反馈追加批次浏览器专项（真实 DOM）：
// ① 领导「消耗固定 EP」全链：卡面产出显示 0、消耗显示固定份额（>0）、卡面无 Lv、
//    staffOutputParts 薪资基数计入领导（顶栏薪资 ≥ 无领导口径）、晋升时产出下降全局产出上升
// ② 任务领取不再弹「任务 EP 已达存储上限」toast（满仓领 EP 任务静默结算）
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

// 种班组场景：解锁班组 + 5 条线程（1 条将任领导）
await page.evaluate(() => {
  window.S._crewUnlocked = true;
  window.S.ep = 50000; // v4.3.21：领导津贴在 EP<=0 时钳 0——种 EP 才能验卡面消耗
  window.S.cultists = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, name: 'T' + i, profession: 'worker', level: 1, xp: 0,
    leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
  }));
  window.__gameDirty && (window.__gameDirty.orchestration = true);
});
await sleep(800);

// ===== ① 领导消耗固定 EP + 卡面无 Lv + 产出 0 =====
console.log('[1] 领导固定消耗 + 卡面无等级');
{
  // 先记录晋升前顶栏薪资
  const salBefore = await page.evaluate(() => window.__qa.staffSalaryPerSec());
  // 晋升 T0 为领导（轮询等卡渲染——renderCrewPanel 低频周期重建）
  const r = await page.evaluate(async () => {
    const cs = window.S.cultists;
    let btn = null;
    for (let i = 0; i < 30 && !btn; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      btn = document.querySelector('[data-leader="' + cs[0].id + '"]');
    }
    if (!btn) return { err: 'no leader btn' };
    btn.click();
    await new Promise(r2 => setTimeout(r2, 500));
    // 重建后重查 T0 卡
    let card = null;
    for (let i = 0; i < 30 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = document.querySelector('[data-bind="' + cs[0].id + '"]')?.closest('.crew-card')
        || [...document.querySelectorAll('.crew-card')].find(x => x.textContent.includes('T0'));
    }
    if (!card) return { err: 'no card' };
    return {
      leader: cs[0].leader === true,
      cardText: card.textContent,
      hasLv: /Lv\.\d/.test(card.textContent),
      cOut: card.querySelector('.c-out')?.textContent || null,
      cSal: card.querySelector('.c-sal')?.textContent || null,
    };
  });
  if (r.err) ok(false, r.err);
  else {
    const salAfter = await page.evaluate(() => window.__qa.staffSalaryPerSec());
    ok(r.leader, 'T0 晋升为领导');
    // v4.3.21 反转：领导卡现在显示领导等级 Lv.X（leaderLv），旧断言「不显示 Lv」删除
    ok(/Lv\.\d/.test(r.cardText), '领导卡面显示领导等级 Lv.X（v4.3.21 等级制）');
    // v4.3.21 反转：领导产出行 toFixed(2)（不再是整数「1%」）
    ok(r.cOut === '1.00%', `领导卡面产出行显示「1.00%」（实际「${r.cOut}」）`);
    // v4.3.25 反馈③：领导卡恢复 -EP/s 消耗行（与普通线程同构），并显示「全局产出 +X%」
    ok(r.cSal !== null && /全局产出 \+/.test(r.cardText), `领导卡恢复 -EP/s 消耗行 + 「全局产出 +X%」（实际 cSal=${r.cSal}）`);
    ok(salAfter > salBefore - 1e-9 && Math.abs(salAfter - salBefore) < 1e-9 || salAfter >= salBefore,
      `晋升前后顶栏薪资不变（Lv1 空闲同口径；bug 口径是下降：${salBefore.toFixed(3)} → ${salAfter.toFixed(3)}）`);
  }

  // 普通线程卡仍有 Lv + 产出 >0（对照，确保只改领导）
  const r2 = await page.evaluate(async () => {
    const cs = window.S.cultists;
    let card = null;
    for (let i = 0; i < 30 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = [...document.querySelectorAll('.crew-card')].find(x => x.textContent.includes('T1'));
    }
    if (!card) return { err: 'no T1 card' };
    return { hasLv: /Lv\.\d/.test(card.textContent), cOut: card.querySelector('.c-out')?.textContent || null };
  });
  if (r2.err) ok(false, r2.err);
  else {
    ok(r2.hasLv, '普通线程卡仍显示 Lv');
    ok(r2.cOut && parseFloat(r2.cOut.replace(/,/g, '')) > 0, `普通线程产出 >0（实际「${r2.cOut}」）`);
  }
}

// ===== ② 任务领取满仓无「已达存储上限」toast =====
console.log('[2] 任务领取满仓静默');
{
  const r = await page.evaluate(async () => {
    // 满仓 + 种一个 pending EP 任务
    window.S.ep = window.__qa.epStorageCap();
    window.S.projects = window.S.projects || [];
    window.S.projects.unshift({
      id: 'qa_v4316', type: 'earn_ep', status: 'pending',
      reward: { kind: 'ep', amount: 1000 },
      goals: [], title: 'QA 满仓领取', desc: '',
      name: 'QA 满仓领取', pendingAt: Date.now(), deadline: Date.now() + 3600e3, progress: 0, goal: 1,
    });
    window.__gameDirty.projects = true; // 触发 renderProjects 重建领取按钮
    await new Promise(r2 => setTimeout(r2, 600));
    const btn = document.querySelector('#projects button[data-claim="0"]');
    if (!btn) return { err: 'no claim btn（projects 面板未渲染？）' };
    btn.click();
    await new Promise(r2 => setTimeout(r2, 600));
    // 收集当前 DOM 上所有 toast/日志文本
    const texts = [...document.querySelectorAll('.toast, #log-panel, .log-line')]
      .map(x => x.textContent || '').join('|');
    const st = (window.S.projects || []).find(p => p.id === 'qa_v4316');
    return {
      // 领取成功 = status 变 claimed，或已被任务系统清理移出列表（两者都证明 claimProject 走完）
      claimed: !st || st.status === 'claimed',
      texts,
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.claimed, '满仓领取任务成功结算');
    ok(!/已达存储上限/.test(r.texts), '领取后无「已达存储上限」toast/日志');
  }
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
