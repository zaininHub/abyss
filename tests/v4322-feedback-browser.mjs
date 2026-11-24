// v4.3.22 第十二轮反馈浏览器专项（真实 DOM）：
// ① 领导文案消歧：卡面「全局产出 +1.00%」「津贴 -10 EP/s」+ 就任日志「全局 EP 产出」
// ② wiki 特殊任务表（博物馆的访客可查）+ intro「按问题找答案」速查表
// ③ wiki 章尾「相关章节」互链按钮（点击跳转生效）
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

// ===== ① 领导卡面消歧文案（v4.3.23 反转：津贴行/升级按钮下线，统一 Lv 口径） =====
console.log('[1] 领导卡面消歧');
{
  const r = await page.evaluate(async () => {
    window.S._crewUnlocked = true;
    window.S.cultists = [{
      id: 1, name: 'L0', profession: 'overseer', level: 1, xp: 0,
      leader: true, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
    }];
    let card = null;
    for (let i = 0; i < 40 && !card; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      card = document.querySelector('.crew-card');
    }
    if (!card) return { err: 'no card' };
    const numLine = card.querySelector('.crew-line-num');
    return { text: numLine ? numLine.textContent : '', upBtn: !!card.querySelector('[data-lead-up]'), badge: (card.querySelector('[style*="3fb950"]') || {}).title || '' };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(/全局产出 \+1\.00%/.test(r.text), `产出行写「全局产出 +1.00%」（实际「${r.text}」）`);
    ok(!/津贴/.test(r.text), '消耗行不再写「津贴」（v4.3.23 津贴下线）');
    ok(/全局产出 \+1% 起、每级 \+0\.01%/.test(r.badge), '星标悬浮写「全局产出 +1% 起、每级 +0.01%」（v4.3.25）');
    ok(!r.upBtn, '手动升级按钮已下线（v4.3.23）');
  }
}

// ===== ①b 就任日志口径（v4.3.23 反转：随等级提升、无津贴） =====
console.log('[1b] 就任日志消歧');
{
  const r = await page.evaluate(async () => {
    window.S.cultists = [
      { id: 10, name: 'WA', profession: 'worker', level: 7, xp: 0, leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60 },
    ];
    let btn = null;
    for (let i = 0; i < 40 && !btn; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      btn = document.querySelector('[data-leader="10"]');
    }
    if (!btn) return { err: 'no btn' };
    btn.click();
    await new Promise(r2 => setTimeout(r2, 600));
    return { feed: (window.S.crewFeed || []).map(e => e.msg).join('||') };
  });
  if (r.err) ok(false, r.err);
  else ok(/就任领导（Lv\.7，全局产出 \+1\.06%，随等级提升）/.test(r.feed), `就任日志写「全局产出 +1.06%，随等级提升」（实际含：${(r.feed.match(/就任领导[^\n|]*/) || ['无'])[0]}）`);
}

// ===== ② wiki 特殊任务表 + 速查表 =====
console.log('[2] wiki 特殊任务与速查表');
{
  const r = await page.evaluate(() => {
    const btn = document.getElementById('btn-wiki');
    if (!btn) return { err: 'no wiki btn' };
    btn.click();
    return { ok: true };
  });
  if (r.err) { ok(false, r.err); }
  else {
    await sleep(500);
    // intro 章速查表
    let r2 = await page.evaluate(() => {
      const body = document.getElementById('wiki-body');
      return { qa: body ? body.innerHTML : '', qaHit: /按问题找答案/.test(body ? body.textContent : '') };
    });
    ok(r2.qaHit, 'intro 章含「按问题找答案」速查表');
    ok(/wiki-qa/.test(r2.qa), '速查表走 wiki-qa 表格样式');
    // 跳 misc 章（许愿池与彩蛋）——通过左栏导航
    r2 = await page.evaluate(async () => {
      const navBtn = [...document.querySelectorAll('[data-wiki]')].find(b => b.textContent === '许愿池与彩蛋');
      if (!navBtn) return { err: 'no nav btn' };
      navBtn.click();
      await new Promise(r2 => setTimeout(r2, 400));
      const body = document.getElementById('wiki-body');
      return { text: body ? body.textContent : '' };
    });
    if (r2.err) ok(false, r2.err);
    else {
      ok(/特殊任务（后台自动判定/.test(r2.text), 'misc 章含「特殊任务」表');
      ok(/博物馆的访客/.test(r2.text), '特殊任务表含「博物馆的访客」');
      // v4.3.23 反转：博物馆条件改工位口径
      ok(/同时拥有 3 种工位/.test(r2.text), '达成条件写新口径「同时拥有 3 种工位…」（v4.3.23）');
      ok(/彩蛋（隐藏触发/.test(r2.text), '含「彩蛋」触发清单');
    }
  }
}

// ===== ③ 章尾「相关章节」互链 =====
console.log('[3] wiki 相关章节互链');
{
  const r = await page.evaluate(async () => {
    // 跳线程与薪资章（thread 卷 related: rift/delve/assistant）
    const navBtn = [...document.querySelectorAll('[data-wiki]')].find(b => b.textContent === '线程与薪资');
    if (!navBtn) return { err: 'no nav' };
    navBtn.click();
    await new Promise(r2 => setTimeout(r2, 400));
    const body = document.getElementById('wiki-body');
    const relBtns = [...body.querySelectorAll('.wiki-related-btn')];
    if (!relBtns.length) return { err: 'no related btns' };
    const names = relBtns.map(b => b.textContent);
    // 点击第一个互链（应为「裂隙与余烬」）验证跳转
    const target0 = relBtns[0].textContent;
    relBtns[0].click();
    await new Promise(r2 => setTimeout(r2, 400));
    const title = document.querySelector('#wiki-body .wiki-title');
    return { names, target0, afterTitle: title ? title.textContent : '' };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.names.includes('裂隙与余烬') && r.names.includes('深潜') && r.names.includes('AI 助手与自动化'), `互链列 Rift/Delve/Assistant（实际：${r.names.join('/')}）`);
    ok(r.afterTitle === r.target0, `点击互链跳转生效（${r.target0}）`);
  }
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
