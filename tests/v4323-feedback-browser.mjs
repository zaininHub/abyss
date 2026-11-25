// v4.3.23 第十三轮反馈浏览器专项（真实 DOM / 数值真值）：
// ① 领导升级改革：无津贴行/无升级按钮、全局加成随等级联动、XP 自动升级
// ② 任命不重置等级 + 卸任保留
// ③ 博物馆任务：工位条件 + 触发日志 + 完成「馆藏认证」徽章上店
// ④ 智能分配擅长优先（DOM 侧验证）
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

// 日志 DOM 文本（#log-content innerHTML 含 div 包裹——取 textContent 验关键词）
const logText = () => page.evaluate(() => (document.getElementById('log-content') || {}).textContent || '');

// ===== ① 领导卡面：无津贴行 + 无升级按钮 + 全局加成直出 =====
console.log('[1] 领导卡面改革（v4.3.23）');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.cultists = [{
      id: 1, name: 'L0', profession: 'overseer', level: 3, xp: 500,
      leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
    }];
    let card = null;
    for (let i = 0; i < 40 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = document.querySelector('.crew-card');
    }
    if (!card) return { err: 'no crew card' };
    const upBtn = card.querySelector('[data-lead-up]');
    const out = card.querySelector('.c-out');
    const lv = card.querySelector('.crew-lv');
    return {
      hasUpBtn: !!upBtn,
      out: out ? out.textContent : '',
      lv: lv ? lv.textContent : '',
      sal: card.querySelector('.c-sal') ? card.querySelector('.c-sal').textContent : null,
    };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(!r.hasUpBtn, '领导卡不应再有手动升级按钮（v4.3.23）');
    ok(r.out === '1.02%', `Lv3 全局加成 = 1.00% + 2×0.01 = +1.02%（实际「${r.out}」）`);
    ok(r.lv === 'Lv.3', `卡面统一 Lv 显示 = 普通等级（实际「${r.lv}」）`);
    ok(r.sal !== null, `领导卡恢复 -EP/s 消耗行（实际「${r.sal}」）`);
  }
}

// ===== ② XP 自动升级：领导在岗积 XP → Lv3→Lv4，全局加成联动 =====
console.log('[2] 领导 XP 自动升级联动');
{
  const r = await page.evaluate(async () => {
    // Lv3→Lv4 阈值：xpThreshold(4)=100×4^1.8≈1211；种 xp=1300 等 tickThreads 推进
    const lead = window.S.cultists.find(c => c.leader);
    lead.xp = 1300;
    for (let i = 0; i < 50; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      if (lead.level >= 4) break;
    }
    // 卡面重建走 shop-unlock 1s 低频系统——轮询等到 +1.24%
    let out = '';
    for (let i = 0; i < 40; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      const card = document.querySelector('.crew-card');
      out = card && card.querySelector('.c-out') ? card.querySelector('.c-out').textContent : '';
      if (out === '1.03%') break;
    }
    return {
      level: lead.level,
      out,
      gqa: window.__qa && window.__qa.threadBind ? window.__qa.threadBind.leaderGlobalMult() : null,
    };
  });
  ok(r.level >= 4, `领导 XP 达阈值自动升级 Lv4（实际 Lv.${r.level}）`);
  ok(r.gqa !== null && Math.abs(r.gqa - (1 + 0.01 + 0.0001 * (Math.min(r.level, 10) - 1))) < 1e-9, `leaderGlobalMult = 1+1%+每级 0.01 个百分点（实际 ${r.gqa}）`);
  ok(r.out === '1.03%', `卡面联动 +1.03%（实际「${r.out}」）`);
}

// ===== ③ 任命不重置等级 + 卸任保留 =====
console.log('[3] 任命/卸任等级保留');
{
  const r = await page.evaluate(async () => {
    const S = window.S;
    S.cultists = [
      { id: 1, name: 'L0', profession: 'overseer', level: 5, xp: 2000, leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60 },
      { id: 2, name: 'W1', profession: 'distiller', level: 7, xp: 3000, leader: false, boundTo: null, output: 3, mood: '正常', moodTimer: 60 },
    ];
    for (let i = 0; i < 40; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      if (document.querySelectorAll('.crew-card').length >= 2) break;
    }
    // v4.3.15 反馈③：已有领导时其他线程不渲染晋升按钮——先卸任现任领导 L0，再晋升 W1
    const l0btn = [...document.querySelectorAll('[data-leader]')].find(b => (S.cultists.find(c => String(c.id) === String(b.dataset.leader)) || {}).name === 'L0');
    if (!l0btn) return { err: 'no L0 abdicate btn' };
    l0btn.click(); // L0 卸任（等级保留）
    await new Promise(r2 => setTimeout(r2, 300));
    const w1btn = [...document.querySelectorAll('[data-leader]')].find(b => (S.cultists.find(c => String(c.id) === String(b.dataset.leader)) || {}).name === 'W1');
    if (!w1btn) return { err: 'no W1 promote btn' };
    w1btn.click(); // W1（Lv7）晋升
    await new Promise(r2 => setTimeout(r2, 300));
    const feed = (S.crewFeed || []).map(f => f.msg).join(' | ');
    const w1 = S.cultists.find(c => c.name === 'W1');
    const l0 = S.cultists.find(c => c.name === 'L0');
    return {
      w1Leader: w1 && w1.leader === true,
      w1Level: w1 ? w1.level : null,
      l0Level: l0 ? l0.level : null,
      feed,
    };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(r.w1Leader, 'W1 晋升成功');
    ok(r.w1Level === 7, `任命不重置等级：W1 仍 Lv7（实际 Lv.${r.w1Level}）`);
    ok(r.l0Level === 5, `卸任保留等级：L0 仍 Lv5（实际 Lv.${r.l0Level}）`);
    ok(/就任领导（Lv\.7，全局产出 \+1\.06%，随等级提升）/.test(r.feed), `就任日志写等级与加成（实际「${(r.feed.match(/【W1】就任领导[^|]*/) || [''])[0]}」）`);
    ok(/经验保留，回归普通线程/.test(r.feed), '卸任日志写「经验保留，回归普通线程」');
  }
}

// ===== ④ 博物馆任务：工位条件 + 触发日志 + 徽章 =====
console.log('[4] 博物馆任务与馆藏认证徽章');
{
  const r = await page.evaluate(async () => {
    const S = window.S;
    // v4.3.32 反馈②（重做）：清掉完成态与剧情节奏，种 3 种工位、等级和 30 <50 → 只邀请不完成
    S._specialTasksDone = {};
    S._museumInvited = false;
    S._museumHintAt = 0;
    S.upgrades.scribble = 10; S.upgrades.script = 10; S.upgrades.parallel = 10;
    for (let i = 0; i < 30; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      const lt = (document.getElementById('log-content') || {}).textContent || '';
      if (/馆长期待与您共进晚餐/.test(lt)) break;
    }
    const lt1 = (document.getElementById('log-content') || {}).textContent || '';
    const invited = /馆长期待与您共进晚餐，请携带3种共计50件宝物觐见\.\.\.\./.test(lt1);
    // 把落档时间拨回 2 小时前 → 关注提醒
    S._museumHintAt = Date.now() - 2 * 60 * 60 * 1000 - 1000;
    for (let i = 0; i < 30; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      const lt = (document.getElementById('log-content') || {}).textContent || '';
      if (/馆长在关注您/.test(lt)) break;
    }
    const lt1b = (document.getElementById('log-content') || {}).textContent || '';
    const hinted = /馆长在关注您\.\.\./.test(lt1b);
    // 补足 ≥50：intern +20 → 和 50
    S.upgrades.intern = 20;
    for (let i = 0; i < 30; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      if (S._specialTasksDone.sp1_museum) break;
    }
    const done = !!S._specialTasksDone.sp1_museum;
    const lt2 = (document.getElementById('log-content') || {}).textContent || '';
    const doneLog = /馆长十分满意与您的会晤，期待下次会面/.test(lt2);
    return { invited, hinted, done, doneLog };
  });
  ok(r.invited, '工位满 3 种：邀请日志「请携带3种共计50件宝物觐见....」');
  ok(r.hinted, '完成前满 2 小时：关注日志「馆长在关注您...」');
  ok(r.done, '补足等级和 ≥50 后任务完成');
  ok(r.doneLog, '完成日志「馆长十分满意与您的会晤，期待下次会面」');
  // 打开商店看徽章
  const badge = await page.evaluate(async () => {
    const btn = document.getElementById('btn-shop') || [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '商店' || /商店/.test(b.textContent || ''));
    if (!btn) return { err: 'no shop btn' };
    btn.click();
    let badgeEl = null;
    for (let i = 0; i < 30 && !badgeEl; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      badgeEl = document.querySelector('.group-title-badge');
    }
    return { badge: badgeEl ? badgeEl.textContent : null };
  });
  if (badge.err) ok(false, badge.err);
  else ok(badge.badge === '馆藏认证', `商店工位标题徽章「馆藏认证」（实际「${badge.badge}」）`);
}

// ===== ⑤ 智能分配擅长优先（DOM 侧） =====
console.log('[5] 智能分配擅长优先');
{
  const r = await page.evaluate(async () => {
    const S = window.S;
    S.upgrades.atrium = 1; // atrium 容量 1
    S.cultists = [
      { id: 1, name: 'L0', profession: 'overseer', level: 1, xp: 0, leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60 },
      { id: 2, name: 'K', profession: 'keeper', level: 1, xp: 0, leader: false, boundTo: null, output: 3, mood: '正常', moodTimer: 60 },
      { id: 3, name: 'D', profession: 'distiller', level: 1, xp: 0, leader: false, boundTo: null, output: 3, mood: '正常', moodTimer: 60 },
    ];
    for (let i = 0; i < 40; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      if (document.querySelectorAll('.crew-card').length >= 3) break;
    }
    const ab = document.querySelector('[data-autobind]');
    if (!ab) return { err: 'no autobind btn' };
    ab.click();
    await new Promise(r2 => setTimeout(r2, 200));
    const d = S.cultists.find(c => c.name === 'D');
    const k = S.cultists.find(c => c.name === 'K');
    return { dBound: d.boundTo, kBound: k.boundTo };
  });
  if (r.err) { ok(false, r.err); }
  else {
    ok(r.dBound === 'atrium', `distiller 智能分配进擅长岗位 atrium（实际 ${r.dBound}）`);
    ok(r.kBound !== 'atrium', `keeper（无可用擅长岗位）不占 atrium（实际 ${r.kBound}）`);
  }
}

console.log(`\n浏览器专项：${pass} pass / ${fail} fail`);
if (pageErrors.length) console.log('pageerror:', pageErrors.slice(0, 3));
await browser.close();
process.exit(fail > 0 || pageErrors.length > 0 ? 1 : 0);
