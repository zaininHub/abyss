// v4.2.4 反馈专项（真实浏览器）：班组未解锁线程不升级 + 离线收益默认 0
//
// 覆盖：
//   ① 新档暂停预览显示「未解锁——研究远程协作」口径（不显示误导 +0 EP）
//   ② 离线面板效率 0% + 引导文案
//   ③ 班组未解锁（<10 线程）时线程 XP 不积累（产品真实帧系统跑 2s 后 xp 仍 0）
//   ④ 达标 10 线程后 XP 恢复积累（crewShown 同语义）
//   ⑤ 研究「远程协作」后暂停预览恢复 +N EP 口径
//   ⑥ 全程 0 pageerror
//
// 用法：node tests/v424-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
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

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await sleep(800);

  // ---- ① 新档：未研究远程协作、无线程 ----
  await page.click('#pauseBtn');
  await sleep(500);
  const pauseTxt = await page.evaluate(() => document.getElementById('pause-info')?.textContent || '');
  if (pauseTxt.includes('未解锁') && pauseTxt.includes('远程协作')) ok('① 暂停预览显示「未解锁」引导', pauseTxt.slice(0, 60));
  else bad('① 暂停预览显示「未解锁」引导', pauseTxt.slice(0, 60));

  // ---- ② 离线面板文案 ----
  const offTxt = await page.evaluate(() => document.getElementById('offline-panel')?.textContent || '');
  if (offTxt.includes('0%') && offTxt.includes('未解锁')) ok('② 离线面板效率 0% + 引导文案');
  else bad('② 离线面板效率 0% + 引导文案', offTxt.slice(0, 80));

  // ---- ③ 班组未解锁：1 条线程绑超线程，产品帧系统跑 2s → xp 仍 0 ----
  await page.click('#pause-resume');
  await sleep(300);
  const lvA = await page.evaluate(() => {
    const q = window.__qa, S = window.S;
    S.cultists = [{ id: 1, name: '测试线程', profession: 'observer', level: 1, xp: 0, leader: false, boundTo: 'hyper', output: 2, mood: '正常', moodTimer: 60, hiredAt: Date.now(), earned: 0 }];
    return S.cultists[0].xp;
  });
  await sleep(2000);
  const lvB = await page.evaluate(() => {
    const S = window.S;
    return { xp: S.cultists[0].xp, lv: S.cultists[0].level };
  });
  if (lvB.xp === 0 && lvB.lv === 1) ok('③ 班组未解锁 2s 内 XP 恒 0（不升级）', JSON.stringify(lvB));
  else bad('③ 班组未解锁 2s 内 XP 恒 0（不升级）', JSON.stringify(lvB));

  // ---- ④ 补满 10 条线程 → 达标即解锁 → XP 恢复 ----
  await page.evaluate(() => {
    const S = window.S;
    while (S.cultists.length < 10) {
      S.cultists.push({ id: Math.random(), name: 'x' + S.cultists.length, profession: 'observer', level: 1, xp: 0, leader: false, boundTo: 'hyper', output: 2, mood: '正常', moodTimer: 60, hiredAt: Date.now(), earned: 0 });
    }
  });
  await sleep(1500);
  const lvC = await page.evaluate(() => {
    const S = window.S;
    return { xp: S.cultists[0].xp, unlocked: S._crewUnlocked === true, crewVisible: !!(window.__qa && document.getElementById('orchestration-card')?.style.display !== 'none') };
  });
  if (lvC.xp > 0 && lvC.unlocked) ok('④ 达标 10 条后 XP 恢复积累 + 持久标记落位', JSON.stringify(lvC));
  else bad('④ 达标 10 条后 XP 恢复积累 + 持久标记落位', JSON.stringify(lvC));

  // ---- ⑤ 研究远程协作后：暂停预览恢复 +N EP ----
  await page.evaluate(() => {
    const S = window.S;
    S.tech = { offline1: true };
    S.ep = 1e5;
    S.upgrades = { scribble: 1 }; // 给一点 cps
  });
  await page.click('#pauseBtn');
  await sleep(500);
  const pauseTxt2 = await page.evaluate(() => document.getElementById('pause-info')?.textContent || '');
  if (!pauseTxt2.includes('未解锁') && pauseTxt2.includes('预计离线收入')) ok('⑤ 解锁后暂停预览恢复收益口径', pauseTxt2.replace(/\n/g, ' ').slice(0, 80));
  else bad('⑤ 解锁后暂停预览恢复收益口径', pauseTxt2.slice(0, 80));
  await page.click('#pause-resume').catch(() => {});
  await sleep(300);

  // ---- ⑥ pageerror ----
  if (errors.length === 0) ok('⑥ 全程 0 pageerror');
  else bad('⑥ 全程 0 pageerror', errors.join(' | ').slice(0, 150));

  console.log(`\nREPORT v424: ${pass}/${pass + fail} pass`);
  process.exit(fail > 0 ? 1 : 0);
} finally {
  await browser.close();
}
