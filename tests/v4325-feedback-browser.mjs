// v4.3.25 反馈浏览器专项（真实 DOM / computed style / 数值真值）：
// ① 馆藏认证徽章：历史完成标记 + 当前工位条件实时复核（晋升/清空工位即隐藏）+ 标题右侧 + 无问号手
// ② 领导卡 -EP/s 消耗行回归 + 线性全局加成（Lv2 = 1.01%）
// ③ 产出悬浮窗领导行去「（全局 EP 产出）」括号
import { launchBrowser, prepPage, gotoAndSettle } from './chapters/_boot.mjs';
import { readFileSync } from 'node:fs';

const browser = await launchBrowser();
const save = JSON.stringify({
  version: 6, chapter: '1', ep: 1e9, rp: 5000, es: 0, dm: 1000, pt: 0, vs: 0,
  // storage 抬上限防 tickCorruption 把 EP 钳回去；3 种工位等级和 50 → 徽章达标
  upgrades: { storage: 300, scribble: 20, script: 20, parallel: 10 },
  buildings: {}, tech: {},
  cultists: [{ id: 1, name: 'L0', profession: 'overseer', level: 2, xp: 0, leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60 }],
  faith: 0, religion: null, prestige: 0, prestigePoints: 0,
  resDiscovered: { ep: true, cps: true, run: true, dm: true, rp: true },
  _riftSeen: true, riftsSealed: 1,
  _specialTasksDone: { sp1_museum: true },  // 历史已完成标记（旧档/晋升前完成）
  _crewUnlocked: true,
  lastSeen: Date.now(), startTime: Date.now(),
});
const { page, errs } = await prepPage(browser, { save });

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok - ' + msg); } else { fail++; console.log('  NOT OK - ' + msg); } };
const V = (() => { const m = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/深渊效能工作台 v([\d.]+)/); return m ? m[1] : '?'; })();
console.log(`\n=== v${V} 浏览器验收：认证徽章 / 领导卡 / 产出弹窗 ===`);

await gotoAndSettle(page);
await page.evaluate(() => document.getElementById('btn-shop')?.click());
await new Promise(r => setTimeout(r, 800));

// ===== [1] 徽章：右侧 + 无问号手 + 实时条件 =====
console.log('[1] 馆藏认证徽章位置与实时条件');
{
  const r = await page.evaluate(() => {
    const b = document.querySelector('.group-title-badge');
    if (!b) return { err: 'no badge' };
    const cs = getComputedStyle(b);
    const prev = b.previousSibling;
    return {
      text: b.textContent,
      prevType: prev ? prev.nodeType : -1,
      prevText: prev && prev.nodeType === 3 ? prev.textContent : '',
      cursor: cs.cursor,
      marginLeft: cs.marginLeft,
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.text === '馆藏认证', `工位标题佩戴「馆藏认证」（实际「${r.text}」）`);
    ok(r.prevType === 3 && /工位/.test(r.prevText), `徽章在标题文字右侧（前节点「${r.prevText}」）`);
    ok(r.cursor === 'default', `徽章无问号手 cursor:default（实际 ${r.cursor}）`);
    ok(r.marginLeft === '4px', `徽章左间距 4px（实际 ${r.marginLeft}）`);
  }
}

// 清空工位（模拟晋升后 upgrades 清零但 _specialTasksDone 仍在）→ 徽章应自动隐藏
{
  const hidden = await page.evaluate(async () => {
    window.S.upgrades = { storage: 300 };
    // chapters/_boot.mjs 为确定性推演会清掉页面 interval；手动推进一帧以跑 special-tasks watcher 和重绘。
    window.__advance(10);
    for (let i = 0; i < 30; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      if (!document.querySelector('.group-title-badge')) return true;
    }
    return false;
  });
  ok(hidden, '工位条件不足（0 种）时徽章自动隐藏（修复「没满 50 级就认证」）');

  const restored = await page.evaluate(async () => {
    window.S.upgrades = { storage: 300, scribble: 20, script: 20, parallel: 10 };
    window.__advance(10);
    for (let i = 0; i < 30; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      const b = document.querySelector('.group-title-badge');
      if (b && b.textContent === '馆藏认证') return true;
    }
    return false;
  });
  ok(restored, '重新达标后徽章自动恢复');
}

// ===== [2] 领导卡：-EP/s 消耗行 + 线性加成 =====
console.log('[2] 领导卡消耗行与线性加成');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.cultists = [{
      id: 1, name: 'L0', profession: 'overseer', level: 2, xp: 0,
      leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
    }];
    window.__gameDirty.orchestration = true;
    let card = null;
    for (let i = 0; i < 40 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = document.querySelector('.crew-card');
    }
    if (!card) return { err: 'no card' };
    const sal = card.querySelector('.c-sal');
    return {
      out: card.querySelector('.c-out')?.textContent || '',
      sal: sal ? sal.textContent : null,
      salLine: card.querySelector('.crew-line-num')?.textContent || '',
      starTip: card.querySelector('span[title^="领导"]')?.getAttribute('title') || '',
    };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.out === '1.01%', `Lv2 全局加成 = 1.00% + 0.01 = +1.01%（实际「${r.out}」）`);
    ok(r.sal !== null, `领导卡恢复 -EP/s 消耗行（实际 c-sal=${r.sal}）`);
    ok(/EP\/s/.test(r.salLine), `数值行同时含产出与消耗（实际「${r.salLine.replace(/\s+/g, ' ').trim().slice(0, 40)}」）`);
    ok(/全局产出 \+1% 起、每级 \+0\.01%/.test(r.starTip), `星标悬浮线性口径（实际「${r.starTip}」）`);
  }
}

// ===== [3] 产出悬浮窗领导行去括号 =====
console.log('[3] 产出悬浮窗领导行去括号');
{
  const r = await page.evaluate(async () => {
    const st = document.getElementById('h-output-stat');
    if (!st) return { err: 'no stat' };
    st.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise(r2 => setTimeout(r2, 400));
    const pop = document.getElementById('flow-tip-pop');
    return { text: pop ? pop.textContent : '', html: pop ? pop.innerHTML : '' };
  });
  if (r.err) ok(false, r.err);
  else {
    const blob = (r.text || '') + (r.html || '');
    ok(/领导 \+1\.01%/.test(blob), `产出弹窗含「领导 +1.01%」（实际片段「${(blob.match(/领导 \+[\d.]+%[^<）]*/) || ['无'])[0]}」）`);
    ok(!/（全局 EP 产出）/.test(blob), '领导行不再带「（全局 EP 产出）」括号');
  }
}

console.log(`\n页面错误: ${errs.length}${errs.length ? ' → ' + errs.join(' | ') : ''}`);
ok(errs.length === 0, '零页面错误');

await browser.close();
console.log(`\n浏览器专项：${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);