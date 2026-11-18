// v4.2.7 反馈专项（真实浏览器）：7 项 UI 反馈根治验证
//
// 覆盖：
//   ① 班组线程卡片重设计：2 行结构（身份行 + 数值/操作行）、产出/消耗同显、无错位
//   ② 线程绿点移除（is-dot display:none）+ 数字颜色随四态状态色
//   ③ 班组产出/薪资概要行删除 → 「▼ 班组」可折叠类目标题（点击真折叠/恢复）
//   ④ 存档摘要 EP 显示本局总量 runEarned（非当前余额 ep）
//   ⑤ 自动蒸馏文案去前缀/箭头（-150 EP/s +0.2 RP/s）
//   ⑥ 成就/班组翻页去尖括号（「上一页」「下一页」）
//   ⑦ 设施类目标题 13px/cyan/▼ 箭头（含未解锁首渲染也绑定的回归点）
//
// 用法：node tests/v427-ui-feedback-browser.mjs
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GAME_URL = 'file://' + ROOT + 'dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const seed = {
  _version: 6, chapter: '7', storyline: 'default',
  ep: 2e6, rp: 5000, es: 60, dm: 3000, pt: 100, faith: 20,
  upgrades: { canteen: 1, heater: 1, datacenter: 1, atrium: 1, cpu: 1, gpu: 1 },
  buildings: {}, tech: { ai_core: true, click_up: true, offline1: true, focus_opt: true, entropy_reduce: true, deep_space: true },
  cultists: [], prestige: 10, prestigePoints: 10, _crewUnlocked: true,
  milesDone: { 100: true, 1000: true, 10000: true, 100000: true },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, es: true, dm: true, pt: true, faith: true },
  lastSeen: Date.now(), startTime: Date.now(),
};
for (let i = 0; i < 15; i++) {
  seed.cultists.push({ id: 'c' + i, name: '线程' + String.fromCharCode(65 + i), mood: ['超频', '优化', '高效', '正常'][i % 4],
    profession: 'worker', level: 10, output: 8, boundTo: i < 12 ? 'hyper' : '', leader: false });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'] });
const pageErrors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
page.on('pageerror', e => pageErrors.push(String(e)));
await page.evaluateOnNewDocument((raw) => {
  localStorage.setItem('abyss_idle_v2', raw);
  const snapData = { ...JSON.parse(raw), ep: 777, runEarned: 123456789, prestige: 42, chapter: '9' };
  localStorage.setItem('abyss_idle_v2_snapshots', JSON.stringify([
    { id: 'diag1', name: '诊断档', time: Date.now(), data: JSON.stringify(snapData) },
  ]));
}, JSON.stringify(seed));
await page.goto(GAME_URL, { waitUntil: 'load' });
await sleep(1600);
await page.evaluate(() => { window.__qa && window.__qa.sim && window.__qa.sim.render(); });

try {
  // ① 卡片结构 + ② 绿点/数字色 + ③ 班组折叠标题
  const crew = await page.evaluate(() => {
    const card = document.querySelector('.crew-card');
    const cOut = card && card.querySelector('.c-out');
    const cSal = card && card.querySelector('.c-sal');
    const avatar = card && card.querySelector('.crew-avatar');
    const count = document.getElementById('staff-count');
    const status = document.getElementById('staff-status');
    const fold = document.querySelector('[data-crew-fold]');
    return {
      lines: card ? card.querySelectorAll('.crew-line').length : 0,
      out: cOut && cOut.textContent, sal: cSal && cSal.textContent,
      avatarTip: avatar && (avatar.getAttribute('title') || ''),
      countColor: count && getComputedStyle(count).color,
      statusIsDot: status && status.classList.contains('is-dot'),
      statusDisplay: status && getComputedStyle(status).display,
      foldText: fold && fold.textContent.replace(/\s+/g, ' ').trim(),
      hasSum: !!document.querySelector('.crew-sum'),
    };
  });
  crew.lines === 2 ? ok('① 班组卡片两行紧凑结构', `crew-line ×${crew.lines}`) : bad('① 卡片行数不符', JSON.stringify(crew));
  crew.out && crew.sal ? ok('① 产出/消耗同卡显示', `${crew.out} / ${crew.sal}`) : bad('① 消耗未显示', JSON.stringify(crew));
  crew.avatarTip && /空闲|超线程/.test(crew.avatarTip) ? ok('① 图标悬浮显示岗位/超线程状态', crew.avatarTip) : bad('① 图标悬浮缺状态', crew.avatarTip);
  // 满薪时 is-dot 必须 display:none；异常态时 is-dot 自然为 false。两种分支都不该看见绿点。
  (!crew.statusIsDot || crew.statusDisplay === 'none')
    ? ok('② 满薪绿点已隐去', crew.statusIsDot ? 'is-dot display:none' : '当前非满薪态，无绿点')
    : bad('② 满薪绿点仍可见', JSON.stringify(crew));
  crew.countColor && crew.countColor !== 'rgb(205, 210, 227)' ? ok('② 数字承载状态色', crew.countColor) : bad('② 数字未着色', crew.countColor);
  !crew.hasSum ? ok('③ 班组产出/薪资概要行已删除') : bad('③ crew-sum 仍存在');
  crew.foldText && /班组/.test(crew.foldText) && /▼/.test(crew.foldText) ? ok('③ 班组可折叠类目标题', crew.foldText) : bad('③ 折叠标题缺失', crew.foldText);

  // ③ 折叠点击真生效
  const beforeFold = await page.evaluate(() => !!document.querySelector('.crew-grid') && getComputedStyle(document.querySelector('.crew-fold-body')).display);
  await page.click('[data-crew-fold]');
  await sleep(120);
  const afterFold = await page.evaluate(() => {
    const b = document.querySelector('.crew-fold-body');
    const f = document.querySelector('[data-crew-fold]');
    return { display: b && getComputedStyle(b).display, arrow: f && f.querySelector('.rp-fold-arrow').textContent };
  });
  beforeFold !== 'none' && afterFold.display === 'none' && afterFold.arrow === '▶'
    ? ok('③ 班组折叠真实生效', `▶ / ${afterFold.display}`) : bad('③ 折叠无效', JSON.stringify({ beforeFold, afterFold }));
  await page.click('[data-crew-fold]');
  await sleep(120);

  // ④ 存档摘要本局总量
  await page.hover('#save-menu-btn');
  await sleep(300);
  const snapSub = await page.evaluate(() => {
    const r = document.querySelector('#save-list [data-snap] .snap-sub');
    return r && r.textContent.trim();
  });
  snapSub && /本局 123\.46M EP/.test(snapSub) && !/[^本局]EP 777/.test(snapSub)
    ? ok('④ 存档摘要显示本局总量', snapSub) : bad('④ 存档 EP 口径错误', snapSub);

  // ⑤ 自动蒸馏文案
  const atrium = await page.evaluate(() => {
    const el = document.querySelector('.atrium-distill');
    return el && el.textContent.replace(/\s+/g, ' ').trim();
  });
  atrium && /-150 EP\/s\s+\+\d/.test(atrium) && !/自动蒸馏：|→/.test(atrium)
    ? ok('⑤ 自动蒸馏文案去掉前缀/箭头', atrium) : bad('⑤ 蒸馏文案不符', atrium);

  // ⑥ 翻页文字（成就面板）
  await page.click('#btn-achievement').catch(() => {});
  await sleep(150);
  const achPager = await page.evaluate(() => {
    const el = document.querySelector('[data-ach-page]');
    return el && el.textContent.trim();
  });
  const crewPager = await page.evaluate(() => {
    const el = document.querySelector('[data-crew-page]');
    return el && el.textContent.trim();
  });
  (!achPager || !/[‹›<>]/.test(achPager)) && (!crewPager || !/[‹›<>]/.test(crewPager))
    ? ok('⑥ 翻页控件去除尖括号', `ach=${achPager} crew=${crewPager}`) : bad('⑥ 尖括号仍在', `ach=${achPager} crew=${crewPager}`);

  // ⑦ 设施标题（13px/cyan/箭头）
  const bld = await page.evaluate(() => {
    const t = document.getElementById('bld-title');
    return { text: t && t.textContent.trim(), cls: t && t.className,
      arrow: t && !!t.querySelector('.rp-fold-arrow'),
      fs: t && getComputedStyle(t).fontSize, color: t && getComputedStyle(t).color };
  });
  bld.arrow && bld.cls.includes('foldable-h3') && bld.fs === '13px' && bld.color === 'rgb(57, 197, 207)'
    ? ok('⑦ 设施标题与其他分类同口径', JSON.stringify(bld)) : bad('⑦ 设施标题格式不符', JSON.stringify(bld));

  pageErrors.length === 0 ? ok('全程 0 pageerror') : bad('pageerror', pageErrors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n结果：${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
