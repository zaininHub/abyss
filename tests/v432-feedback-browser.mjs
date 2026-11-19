// v4.3.2 反馈专项（真实浏览器）：AI 台账气泡 / 成就解锁倒序 / 转化下拉列表
//
// 覆盖：
//   ① AI 台账悬浮从 data-tip::after（窄锚点竖排）改 fixed DOM 气泡——宽度 ≥150px、不逐字竖排
//   ② 成就按解锁时间倒序（最新解锁在前）——种 3 条不同时间戳，断言首条为最新
//   ③ 「⚡ 转化」弹层改竖排下拉列表（.qs-opt 整行 + 状态右对齐，不再并排 inline style）
//   ④ deep_space DM 1000→50（Node 侧读源码）
//   ⑤ 0 pageerror
//
// 用法：node tests/v432-feedback-browser.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromePath } from './_chrome.mjs';

const GAME_URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(GAME_URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await sleep(900);

  // ---- 种子：AI 核心 + 台账数据 + 3 条带时间戳成就 + 转化器解锁 ----
  await page.evaluate(() => {
    const S = window.S;
    S.tech = Object.assign({}, S.tech, { ai_core: true, deep_space: true, entropy_reduce: true });
    S.upgrades = Object.assign({}, S.upgrades, { atrium: 1, scooter: 1, petland: 1, temple: 1 });
    S.buildings = Object.assign({}, S.buildings, { canteen: 1 });
    S.cultists = [{ id: 1, name: 'T', profession: 'distiller', level: 1, xp: 0, leader: false, boundTo: 'atrium', output: 5, mood: '正常' }];
    S.ep = 1e7; S.rp = 1e4;
    // ② 成就时间戳：3 条不同时间，最新的是第 3 条
    const ids = window.__qa.ACHIEVEMENT_IDS;
    S.achievements = { [ids[0]]: true, [ids[1]]: true, [ids[2]]: true };
    S.achievementTimes = { [ids[0]]: 1000, [ids[1]]: 3000, [ids[2]]: 2000 };
    S._seedAchOrder = [ids[0], ids[1], ids[2]];
    // 种子直接写 S 不置 dirty——手动置位让 registerPanel('ai') / 成就 / 快捷开关即时重绘
    window.__gameDirty.ai = true;
    window.__gameDirty.achievements = true;
    window.__gameDirty.shop = true;
    window.__qa.sim.render();
  });
  await sleep(1200); // 等帧系统渲染 AI / 成就 / 快捷开关

  // ---- ① AI 台账气泡 ----
  console.log('\n[① AI 台账 fixed 气泡]');
  const d1a = await page.evaluate(() => {
    const head = document.querySelector('[data-ai-head]');
    const pop = document.getElementById('ai-tip-pop');
    return { headExists: !!head, popExists: !!pop,
      hasOldTip: !!(head && head.hasAttribute('data-tip')),
      tipText: document.getElementById('ai-card')?.dataset.aiLedgerTip || '' };
  });
  d1a.headExists && d1a.popExists ? ok('AI 台账锚点与 fixed 气泡容器都在') : bad('气泡容器缺失', JSON.stringify(d1a));
  !d1a.hasOldTip ? ok('旧 data-tip 竖排源已移除') : bad('data-tip 仍在');
  d1a.tipText.includes('本局已执行') ? ok('台账文案写入稳定宿主 dataset') : bad('台账文案未写入', d1a.tipText.slice(0, 80));

  // 真实 hover → 测气泡 rect 宽度（竖排时约 40px）
  await page.hover('[data-ai-head]');
  await sleep(300);
  const d1b = await page.evaluate(() => {
    const p = document.getElementById('ai-tip-pop');
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return { shown: p.classList.contains('show'), w: Math.round(r.width), h: Math.round(r.height),
      position: cs.position, text: p.textContent.slice(0, 60), lines: p.textContent.length / Math.max(1, Math.round(r.width) / 11) };
  });
  d1b.shown && d1b.position === 'fixed' ? ok('hover 显示 fixed 气泡', `position=${d1b.position}`) : bad('气泡未显示', JSON.stringify(d1b));
  d1b.w >= 150 ? ok('气泡宽度正常（非逐字竖排窄条）', `${d1b.w}px × ${d1b.h}px`) : bad('气泡仍竖排', JSON.stringify(d1b));
  d1b.text.includes('本局已执行') ? ok('气泡内容为台账文案', d1b.text) : bad('气泡内容不符', d1b.text);

  // ---- ② 成就倒序 ----
  console.log('\n[② 成就解锁倒序]');
  const d2 = await page.evaluate(() => {
    const order = window.S._seedAchOrder;
    const defs = window.__qa.ACHIEVEMENTS;
    // 运行期 checkAch 会额外解锁成就——只收集「我种的 3 条」在全量列表中的位置，不锁总数
    const names = [...document.querySelectorAll('#achievement-panel .ach-card')]
      .map(el => el.textContent.replace(/\s+/g, ' ').trim());
    const targetNames = order.map(id => defs.find(a => a.id === id).name);
    const idx = targetNames.map(nm => names.findIndex(t => t.includes(nm)));
    // 时间戳：order[1]=3000 最新 → 位置最小；order[2]=2000 次之；order[0]=1000 最后
    return { count: names.length, idx, names: names.slice(0, 3),
      ordered: idx[1] >= 0 && idx[2] > idx[1] && idx[0] > idx[2] };
  });
  d2.idx.every(i => i >= 0) ? ok('种的 3 条成就都在列表中', `positions=${d2.idx.join(',')}`) : bad('成就缺失', JSON.stringify(d2));
  d2.ordered ? ok('按解锁时间倒序（新→旧：t3000 > t2000 > t1000）', `positions=${d2.idx.join(',')}`)
    : bad('倒序失败', JSON.stringify(d2));

  // ---- ③ 转化下拉列表 ----
  console.log('\n[③ 转化下拉列表]');
  const d3 = await page.evaluate(() => {
    const host = document.getElementById('quick-switches');
    const opts = [...(host?.querySelectorAll('.qs-opt') || [])];
    return { isList: !!host?.classList.contains('qs-list'), count: opts.length,
      tags: opts.map(b => ({ qs: b.dataset.qs, cls: b.className.trim(), inlineStyle: b.getAttribute('style') || '',
        display: getComputedStyle(b).display, w: Math.round(b.getBoundingClientRect().width) })) };
  });
  d3.isList ? ok('#quick-switches 带 qs-list 类（竖排列表容器）') : bad('列表容器类缺失');
  d3.count >= 2 ? ok('已解锁转化器渲染为列表项', `count=${d3.count}`) : bad('列表项不足', `count=${d3.count}`);
  d3.tags.every(t => t.cls.includes('qs-opt')) ? ok('每项为整行 .qs-opt 按钮') : bad('项样式不符', JSON.stringify(d3.tags.slice(0, 2)));
  d3.tags.every(t => !t.inlineStyle) ? ok('旧内联 QS_STYLE 样式已移除') : bad('内联样式残留', JSON.stringify(d3.tags.find(t => t.inlineStyle)));
  d3.tags.every(t => t.display === 'flex') ? ok('列表项 flex 整行（标签 + 状态）') : bad('项非 flex', JSON.stringify(d3.tags.slice(0, 2)));

  // ---- ④ deep_space DM 成本 ----
  console.log('\n[④ deep_space DM 重标定]');
  const techSrc = readFileSync(fileURLToPath(new URL('../src/data/techs.js', import.meta.url)), 'utf8');
  /deep_space[^\n]*dm:\s*50\b/.test(techSrc)
    ? ok('deep_space DM 成本 1000→50') : bad('DM 成本未下调');
  !/deep_space[^\n]*dm:\s*1000\b/.test(techSrc) ? ok('旧 1000 DM 口径已移除') : bad('旧成本残留');

  // ---- ⑤ pageerror ----
  console.log('\n[⑤ 稳定性]');
  errors.length === 0 ? ok('0 pageerror') : bad(`pageerror ×${errors.length}`, errors.slice(0, 3).join(' | '));

  console.log(`\n=== v4.3.2 专项：${pass} PASS / ${fail} FAIL ===`);
  process.exitCode = fail > 0 ? 1 : 0;
} finally {
  await browser.close();
}
