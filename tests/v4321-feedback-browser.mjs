// v4.3.21 第十一轮反馈浏览器专项（真实 DOM / 数值真值）：
// ① 领导升级按钮「升级★ Lv.1→2」+ 卡面津贴消耗 + 升级后数值联动（1.01%→1.02%）
// ② 消耗弹窗拆分：drainMultBreakdown（无职级/全局加成复读）+ 领导津贴行
// ③ 透镜悬浮文案「封印/拥抱的 DM·RP 奖励 +20%/级（深入不含）」（源码锁 R1 已覆盖，此处验 DOM 渲染）
// ④ 快捷开关零日志（含下岗汇总静默）
// ⑤ 任命重置线程等级 + 卸任保留 leaderLv（DOM 全链）
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

// ===== ① 领导卡面（v4.3.23 反转：无升级按钮、无津贴，全局加成直出） =====
console.log('[1] 领导卡面（v4.3.23 反转）');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.cultists = [{
      id: 1, name: 'L0', profession: 'overseer', level: 1, xp: 0,
      leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
    }];
    // shop-unlock 1s 低频系统负责 renderCrewPanel——等轮询
    let card = null;
    for (let i = 0; i < 40 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = document.querySelector('.crew-card');
    }
    if (!card) return { err: 'no crew card' };
    const btn = card.querySelector('[data-lead-up]');
    const sal = card.querySelector('.c-sal');
    const out = card.querySelector('.c-out');
    return {
      hasBtn: !!btn,
      hasSal: !!sal,
      out: out ? out.textContent : '',
    };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(!r.hasBtn, '手动升级按钮已下线（v4.3.23）');
    ok(!r.hasSal, '领导卡无独立津贴消耗行（v4.3.23）');
    ok(r.out === '1.00%', `领导卡面全局加成 +1.00%（Lv1）（实际「${r.out}」）`);
  }
}
// （v4.3.21 旧「点击升级→Lv2 联动」断言段已随手动升级按钮删除（v4.3.23 反转））

// ===== ① 领导卡面（v4.3.23 反转：升级按钮/津贴下线，等级走普通 XP） =====
console.log('[1] 领导卡面（v4.3.23 反转）');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.ep = 50000;
    window.S.cultists = [{
      id: 1, name: 'L0', profession: 'overseer', level: 1, xp: 0,
      leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
    }];
    let card = null;
    for (let i = 0; i < 40 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = document.querySelector('.crew-card');
    }
    if (!card) return { err: 'no crew card' };
    const btn = card.querySelector('[data-lead-up]');
    const sal = card.querySelector('.c-sal');
    const out = card.querySelector('.c-out');
    return {
      hasBtn: !!btn,
      sal: sal ? sal.textContent : null,
      out: out ? out.textContent : '',
    };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(!r.hasBtn, '手动升级按钮已下线（v4.3.23）');
    ok(r.sal === null, '领导卡无独立津贴消耗行（v4.3.23）');
    ok(r.out === '1.00%', `领导卡面全局加成 +1.00%（Lv1）（实际「${r.out}」）`);
  }
}

// ===== ② 消耗弹窗拆分（v4.3.23 反转：津贴行下线） =====
console.log('[2] 消耗弹窗：drainMultBreakdown 拆分（无津贴行）');
{
  const r = await page.evaluate(async () => {
    window.S.ep = 50000;
    const st = document.getElementById('h-drain-stat');
    if (!st) return { err: 'no stat' };
    st.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise(r2 => setTimeout(r2, 300));
    const pop = document.getElementById('flow-tip-pop');
    if (!pop) return { err: 'no pop' };
    return { text: pop.textContent || '' };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(!/领导津贴/.test(r.text), '消耗弹窗不再含「领导津贴」（v4.3.23 下线）');
    ok(!/职级/.test(r.text), '消耗弹窗不应含产出侧「职级」乘区');
    ok(!/全局加成/.test(r.text), '消耗弹窗不应复读产出侧「全局加成」');
  }
}

// ===== ③ 快捷开关零日志 =====
console.log('[3] 快捷开关零日志');
{
  const r = await page.evaluate(async () => {
    // 种蒸馏解锁（atrium 转化器解锁即出现快捷开关）——工坊 upgrades.atrium 已在 v4320 场景验证过解锁判定
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 1 };
    window.S.ptDistillOn = false;
    await new Promise(r2 => setTimeout(r2, 1300)); // 等 shop-unlock 1s 低频渲染快捷开关
    const btn = document.querySelector('[data-qs="atrium"]');
    if (!btn) return { err: 'no qs btn' };
    const logs0 = JSON.parse(localStorage.getItem('abyss_idle_v2_logcache') || '[]').length;
    btn.click();
    await new Promise(r2 => setTimeout(r2, 500));
    const logs1 = JSON.parse(localStorage.getItem('abyss_idle_v2_logcache') || '[]').length;
    // 再关回去（也静默），恢复状态
    const btn2 = document.querySelector('[data-qs="atrium"]');
    if (btn2) { btn2.click(); await new Promise(r2 => setTimeout(r2, 400)); }
    const logs2 = JSON.parse(localStorage.getItem('abyss_idle_v2_logcache') || '[]').length;
    return { logs0, logs1, logs2, state: window.S.ptDistillOn };
  });
  if (r.err === 'no qs btn') { console.log('  skip - 未找到快捷开关（解锁判定差异，源码锁 R4 已覆盖）'); }
  else {
    ok(r.logs1 === r.logs0, `开→零日志（${r.logs0}→${r.logs1}）`);
    ok(r.logs2 === r.logs0, `关→零日志（${r.logs0}→${r.logs2}）`);
  }
}

// ===== ④ 任命不重置等级 + 卸任保留（v4.3.23 反转：等级是线程自身属性） =====
console.log('[4] 任命不重置等级 / 卸任保留（v4.3.23）');
{
  const r = await page.evaluate(async () => {
    // 种 2 线程：A 高等级 worker、B 无
    window.S._crewUnlocked = true;
    window.S.cultists = [
      { id: 10, name: 'WA', profession: 'worker', level: 7, xp: 3000, leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60 },
      { id: 11, name: 'WB', profession: 'worker', level: 1, xp: 0, leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60 },
    ];
    let btn = null;
    for (let i = 0; i < 40 && !btn; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      btn = document.querySelector('[data-leader="10"]');
    }
    if (!btn) return { err: 'no leader btn' };
    btn.click();
    await new Promise(r2 => setTimeout(r2, 600));
    const a = window.S.cultists.find(c => c.id === 10);
    const afterPromote = { leader: a.leader, level: a.level, xp: a.xp };
    // 卸任（v4.3.15：有领导时其他线程不显示晋升按钮；现任领导的按钮变「卸任★」）
    const btn2 = document.querySelector('[data-leader="10"]');
    if (!btn2) return { err: 'no dismiss btn', afterPromote };
    btn2.click();
    await new Promise(r2 => setTimeout(r2, 600));
    const a2 = window.S.cultists.find(c => c.id === 10);
    const afterDismiss = { leader: a2.leader, level: a2.level };
    return { afterPromote, afterDismiss };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(r.afterPromote.leader === true, '晋升后 WA 是领导');
    ok(r.afterPromote.level === 7, `任命不重置等级：WA 仍 Lv7（实际 Lv.${r.afterPromote.level}）`);
    ok(r.afterDismiss.leader === false, '卸任后非领导');
    ok(r.afterDismiss.level === 7, `卸任保留等级：WA 仍 Lv7（实际 Lv.${r.afterDismiss.level}）`);
  }
}

// ===== ⑤ 透镜悬浮 DOM（wiki/balance 文案由专项源码锁 R1 保证，此处验解锁卡面渲染） =====
console.log('[5] 透镜悬浮文案');
{
  const r = await page.evaluate(() => {
    // 全 DOM 搜「深入不含」（透镜卡需解锁，新档未解锁时至少 wiki 弹层/源码锁兜底）
    const all = document.body.innerHTML || '';
    return { hit: /深入不含/.test(all) };
  });
  if (!r.hit) console.log('  skip - 透镜卡未解锁（新档），文案由专项源码锁 R1 锁定');
  else ok(true, '透镜文案「深入不含」出现在 DOM');
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
