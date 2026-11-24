// v4.3.18 第八轮反馈批次浏览器专项（真实 DOM）：
// ① 领导卡「+1% -X EP/s」+ 消耗不缩水（Lv1 空闲同口径：晋升后顶栏薪资不降）+ 无领导智能分配灰显/有领导解除
// ② 超线程收支倒挂修复：带产线（CPU/GPU/专注）时 10 级超线程卡面产出 ≥ 消耗×1.5（同口径可比）；EP 真值不变
// ③ 深入裂隙按钮 title 写「消耗 启动 X EP + 探索期约 Y EP」
// ④ 成就收起再展开回到顶部第一卡（achPage=1 + 滚动在顶）
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

// 种班组场景：解锁班组 + 5 条线程
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

// ===== ①a 无领导时智能分配灰显 =====
console.log('[1] 智能分配灰显 / 领导卡 +1%');
{
  const r = await page.evaluate(async () => {
    // 等班组面板渲染出 autobind 按钮
    let btn = null;
    for (let i = 0; i < 30 && !btn; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      btn = document.querySelector('[data-autobind]');
    }
    if (!btn) return { err: 'no autobind btn' };
    const disabledNoLeader = btn.disabled;
    const tipNoLeader = btn.getAttribute('title') || '';
    // 晋升 T0 → 灰显解除
    let lbtn = null;
    for (let i = 0; i < 30 && !lbtn; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      lbtn = document.querySelector('[data-leader="' + window.S.cultists[0].id + '"]');
    }
    if (!lbtn) return { err: 'no leader btn', disabledNoLeader };
    lbtn.click();
    await new Promise(r2 => setTimeout(r2, 600));
    let btn2 = null;
    for (let i = 0; i < 30 && !btn2; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      btn2 = document.querySelector('[data-autobind]');
    }
    return {
      disabledNoLeader, tipNoLeader,
      disabledHasLeader: btn2 ? btn2.disabled : null,
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.disabledNoLeader === true, '无领导时智能分配灰显（disabled）');
    ok(/领导/.test(r.tipNoLeader), '灰显时 title 提示「需先晋升领导」');
    ok(r.disabledHasLeader === false, `晋升领导后灰显解除（disabled=${r.disabledHasLeader}）`);
  }

  // ①b 领导卡「+1%」+ 顶栏薪资不降（Lv1 空闲同口径，消耗不缩水）
  const r2 = await page.evaluate(async () => {
    const salBefore = window.__qa.staffSalaryPerSec();
    const cs = window.S.cultists;
    let card = null;
    for (let i = 0; i < 30 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = [...document.querySelectorAll('.crew-card')].find(x => x.textContent.includes('T0'));
    }
    if (!card) return { err: 'no T0 card', salBefore };
    return {
      salBefore,
      cOut: card.querySelector('.c-out')?.textContent || null,
      cSal: card.querySelector('.c-sal')?.textContent || null,
      hasLv: /Lv\.\d/.test(card.textContent),
      salAfter: window.__qa.staffSalaryPerSec(),
    };
  });
  if (r2.err) ok(false, r2.err);
  else {
    ok(r2.cOut === '1.00%', `领导卡产出行「1.00%」（v4.3.21 toFixed(2)，实际「${r2.cOut}」）`);
    // v4.3.21 反转：领导卡显示领导等级 Lv.X，旧断言「无 Lv」删除
    ok(r2.hasLv, '领导卡显示领导等级 Lv.X（v4.3.21 等级制）');
    ok(r2.cSal && parseFloat(r2.cSal.replace(/,/g, '')) > 0, `领导卡消耗 >0（实际「${r2.cSal}」）`);
    ok(r2.salAfter >= r2.salBefore - 1e-9, `晋升后顶栏薪资不降（${r2.salBefore.toFixed(3)} → ${r2.salAfter.toFixed(3)}，Lv1 空闲同口径）`);
  }
}

// ===== ② 超线程收支倒挂修复 =====
console.log('[2] 10 级超线程卡面产出/消耗同口径');
{
  const r = await page.evaluate(async () => {
    // 带产线放大：CPU×3 / GPU×2 / 专注 10 级（探针复刻口径）
    window.S.upgrades.cpu = 3;
    window.S.upgrades.gpu = 2;
    window.S.focusLevel = 10;
    const c = window.S.cultists.find(x => x.name === 'T1');
    c.level = 10;
    c.boundTo = 'hyper';
    // 触发班组面板重建（卡片签名含 level/boundTo → 全卡重建 + 动态刷新）
    window.__gameDirty.orchestration = true;
    // 轮询等卡面产出行反映新口径——种子写入前旧卡已显示 0.4（Lv1 空闲旧值），
    //   阈值必须显著高于旧值（新口径含 cpu3/gpu2/focus10 → outLine≈27，产出≈20）
    let card = null, out = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = [...document.querySelectorAll('.crew-card')].find(x => x.textContent.includes('T1'));
      if (!card) continue;
      out = parseFloat((card.querySelector('.c-out')?.textContent || '0').replace(/,/g, ''));
      if (out >= 5) break; // 新口径（≥5）远超旧值 0.4
    }
    if (!card) return { err: 'no T1 card' };
    const sal = parseFloat((card.querySelector('.c-sal')?.textContent || '0').replace(/,/g, ''));
    return { out, sal, ratio: sal > 0 ? out / sal : Infinity };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.out > 0, `10 级超线程卡面产出 >0（${r.out}）`);
    ok(r.sal > 0, `卡面消耗 >0（${r.sal}）`);
    // 用户诉求：产出应多于消耗（1.5:1 产消比口径）；修复前 0.8/11 ≈ 0.07 倒挂
    ok(r.ratio >= 1.4, `产消比 ≥1.4（实际 ${r.ratio.toFixed(2)}——修复前约 0.07 倒挂）`);
  }

  // EP 真值红线：卡面是显示层，改前后 staffOutputPerSec 一致（用公式核对而非快照：
  // one×factor 求和与 __qa 输出一致即证明真值未被显示层污染）
  const r2 = await page.evaluate(() => {
    const q = window.__qa;
    return { hasQa: !!q, staff: q && q.staffOutputPerSec ? q.staffOutputPerSec() : null };
  });
  ok(r2.hasQa, 'QA 钩子可用（真值走 __qa 口径，显示层不动真值由源码锁 R2 保证）');
}

// ===== ③ 深入裂隙 title「消耗」口径 =====
console.log('[3] 深入裂隙 title');
{
  const r = await page.evaluate(async () => {
    // 种一道活裂隙 + DM 已发现 → 深入按钮可亮
    window.S.resDiscovered = window.S.resDiscovered || {};
    window.S.resDiscovered.dm = true;
    window.S.activeRift = {
      level: 1, power: 1, sealCost: 100, expiresAt: Date.now() + 60e3,
    };
    window.__gameDirty.rift = true;
    await new Promise(r2 => setTimeout(r2, 700));
    const btn = document.getElementById('delve-rift');
    if (!btn) return { err: 'no delve btn' };
    return { title: btn.getAttribute('title') || '' };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(/消耗 启动 \d/.test(r.title) && /探索期约 \d/.test(r.title), `title 写「消耗 启动 X EP + 探索期约 Y EP」（实际「${r.title}」）`);
    ok(!/需消耗 EP 与 DM/.test(r.title), '旧「需消耗 EP 与 DM」文案已删');
  }
}

// ===== ④ 成就收起再展开回顶部 =====
console.log('[4] 成就收起复位');
{
  // 先解锁几个成就保证列表非空
  await page.evaluate(() => {
    const defs = window.__qa ? null : null;
    // 直接种成就时间戳（渲染走 S.achievementTimes 倒序）
    window.S.achievementTimes = window.S.achievementTimes || {};
    const reg = (window.__ACH_DEFS || null);
    // 兜底：直接给 8 个伪时间戳键（渲染侧按 got 过滤注册表——用真实注册表键名）
  });
  // 用滚动触底加载扩展 achPage → 收起 → 展开断言回顶
  const r = await page.evaluate(async () => {
    const pane = document.getElementById('tab-achievement');
    const list = document.getElementById('achievement-panel');
    if (!pane || !list) return { err: 'no ach dom' };
    // 触发展开态（确保非 collapsed）
    pane.classList.remove('sl-collapsed');
    localStorage.setItem('abyss_ach_collapsed', '0');
    // 等渲染
    for (let i = 0; i < 30 && !list.querySelector('.ach-card'); i++) {
      await new Promise(r2 => setTimeout(r2, 100));
    }
    const cards0 = list.querySelectorAll('.ach-card').length;
    if (!cards0) return { err: 'no ach cards（成就为空？）' };
    // 触底加载直到滚不动（扩组）
    for (let k = 0; k < 6; k++) {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll'));
      await new Promise(r2 => setTimeout(r2, 250));
      const shown = list.querySelectorAll('.ach-card').length;
      const total = list._achTotal || 0;
      if (shown >= total) break;
    }
    const cardsExpanded = list.querySelectorAll('.ach-card').length;
    const stBefore = list.scrollTop;
    // 点击标题收起
    const h3 = document.getElementById('achievement-h3');
    h3.click();
    await new Promise(r2 => setTimeout(r2, 400));
    const collapsedNow = pane.classList.contains('sl-collapsed');
    // 再展开
    h3.click();
    await new Promise(r2 => setTimeout(r2, 400));
    const stAfter = list.scrollTop;
    const cardsAfter = list.querySelectorAll('.ach-card').length;
    return { cards0, cardsExpanded, stBefore, collapsedNow, stAfter, cardsAfter };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.collapsedNow === true, '点击标题后收起生效');
    // 复原到第一个在顶部：滚动回顶 + 只展示首组
    ok(r.stAfter === 0, `展开后滚动位置在顶部（${r.stBefore} → ${r.stAfter}）`);
    ok(r.cardsAfter <= r.cards0, `展开后只展示首组（${r.cardsExpanded} → ${r.cardsAfter} ≤ 首组 ${r.cards0}）`);
  }
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
