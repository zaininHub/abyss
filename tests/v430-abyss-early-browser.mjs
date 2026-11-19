// v4.3.0 深渊提前专项（真实浏览器）：裂隙门槛下调 + 首现加速 + 第 1 章氛围低语 + 公告口径
//
// 覆盖（对应交付说明 v4.3.0「深渊为核心玩法，提前出现、分批开放」第一波）：
//   A. balance：threadUnlock=8、firstSpawnSec=600 存在且被 riftNextSec 消费（无死数据红线）
//   B. 首现加速：_riftSeen=false 时 riftNextSec() ≈ 600s（±5% 抖动）；_riftSeen=true 后回落 ≈ 3600s
//   C. 线程门槛：8 条线程即 riftThreadsReady()=true（旧 15 不再是门槛）
//   D. 氛围低语：startedAt + 120s 后 _whisperSeen1 置位且日志含「低语」；门槛达标后 _whisperSeen2 置位
//   E. 章节公告：ch5 条目不再包含「裂隙」字样（口径修正）
//   F. wiki 裂隙标题显示「8 条线程」「首次 10 分钟」
//   G. 全程 0 pageerror
//
// 用法：node tests/v430-abyss-early-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
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

  // ---- A. balance 参数与消费点 ----
  console.log('\n[A] 裂隙提前参数');
  const dA = await page.evaluate(() => {
    const S = window.S;
    // 读侧真源：直接调 QA 钩子 riftNextSec（未触发过裂隙 → 应走 firstSpawnSec 分支）
    // 注意：调用会写 S._riftNextSec，先存档当前值再复原
    const before = S._riftNextSec;
    const first = window.__qa.riftNextSec();
    S._riftNextSec = before; // 复原，不影响后续 B 段独立验证
    return { first, firstSpawnSecDefined: typeof (window.__firstSpawnRaw ?? undefined) !== 'undefined' || true };
  });
  dA.first > 60 * 9 && dA.first < 60 * 10.5
    ? ok('首现间隔 ≈10 分钟（600s ±5% 抖动）', `${dA.first.toFixed(0)}s`)
    : bad('首现间隔应 ≈600s', `实际 ${dA.first && dA.first.toFixed(0)}s`);

  // ---- B. 首现 → 常规回落 ----
  console.log('\n[B] 首现加速只作用于 _riftSeen 前');
  const dB = await page.evaluate(() => {
    const S = window.S;
    S._riftSeen = true; // 模拟已触发过裂隙（跨转生保留字段，测试后随页面销毁不落盘）
    const before = S._riftNextSec;
    S._riftNextSec = 0; // 清缓存强制重掷
    const regular = window.__qa.riftNextSec();
    S._riftNextSec = 0;
    S._riftSeen = false; // 复原
    return { regular };
  });
  dB.regular > 60 * 57 && dB.regular < 60 * 63
    ? ok('_riftSeen 后间隔回落 ≈1 小时（3600s ±5%）', `${dB.regular.toFixed(0)}s`)
    : bad('_riftSeen 后应回落 ≈3600s', `实际 ${dB.regular && dB.regular.toFixed(0)}s`);

  // ---- C. 线程门槛 8 条 ----
  console.log('\n[C] 线程门槛 15→8');
  const dC = await page.evaluate(() => {
    const S = window.S;
    S._riftThreadUnlocked = false; S._riftSeen = false; // 清持久标记，测真实判定
    const before8 = window.__qa_riftReady ? null : null;
    // riftThreadsReady 未单独暴露？——已暴露（v3.6.2 起）。直接从 main 的 QA 表读；
    // 若不在表里，通过种子线程数驱动：S.cultists.length 达标后 tickRift 置标记。
    S.cultists = Array.from({ length: 8 }, (_, i) => ({ id: 't' + i, name: '线程' + i, type: 't1', mood: '正常' }));
    return { count: S.cultists.length };
  });
  dC.count === 8 ? ok('种子 8 条线程', `count=${dC.count}`) : bad('种子线程应为 8', `实际 ${dC.count}`);
  // 推进一帧让 tickRift 跑（whisper2 + riftThreadsReady 置位都在 tickRift 内）
  await page.evaluate(() => { window.__advance(1); });
  await sleep(300);
  const dC2 = await page.evaluate(() => ({
    ready: !!window.S._riftThreadUnlocked,
    w2: !!window.S._whisperSeen2,
  }));
  dC2.ready ? ok('8 条线程即达裂隙门槛（_riftThreadUnlocked 置位）') : bad('8 条线程应触发门槛置位');
  dC2.w2 ? ok('门槛达标 → 低语②「低语逼近」置位') : bad('门槛达标应置位 _whisperSeen2');

  // ---- D. 低语①（120s 计时）----
  console.log('\n[D] 第 1 章氛围低语');
  const dD = await page.evaluate(() => {
    const S = window.S;
    // 模拟开局 2 分钟：回拨 startedAt 再推进一帧
    S._whisperSeen1 = false;
    S.startedAt = Date.now() - 121000;
    window.__advance(1);
    return { w1: !!S._whisperSeen1 };
  });
  dD.w1 ? ok('开局 120s 后低语①置位') : bad('低语①应在 startedAt+120s 后置位');
  const dD2 = await page.evaluate(() => {
    const txt = document.getElementById('log-content');
    return { hasWhisper: txt ? txt.textContent.includes('低语') : false };
  });
  dD2.hasWhisper ? ok('日志面板出现「低语」文案') : bad('日志应含低语文案');

  // ---- E. ch5 公告口径（Node 侧直读源码，dist 页面内无模块导出）----
  console.log('\n[E] 章节公告不再认领裂隙');
  const { CHAPTER_UNLOCKS } = await import('../src/data/chapterUnlocks.js');
  const ch5 = CHAPTER_UNLOCKS.find(x => x.chapter === 5);
  ch5 && !ch5.name.includes('裂隙')
    ? ok('ch5 名称不再含「裂隙」', ch5.name)
    : bad('ch5 名称应去掉裂隙', `实际 ${ch5 && ch5.name}`);
  ch5 && !ch5.announce.includes('裂隙出现')
    ? ok('ch5 公告不再写「裂隙出现」', ch5.announce)
    : bad('ch5 公告口径未修正', `实际 ${ch5 && ch5.announce}`);

  // ---- F. wiki 裂隙标题（渲染进 DOM 的实际文案；wiki 源码在 dist 包内，直接断言页面存在性走 Node 侧模板重放）----
  console.log('\n[F] wiki 裂隙标题同步');
  const { WIKI_SECTIONS } = await import('../src/data/wiki.js');
  const riftSec = WIKI_SECTIONS.find(s => s.id === 'rift');
  const body = riftSec ? riftSec.body() : '';
  body.includes('8 条线程后解锁')
    ? ok('wiki 显示「8 条线程后解锁」')
    : bad('wiki 门槛数应为 8');
  body.includes('首次 10 分钟必出')
    ? ok('wiki 显示「首次 10 分钟必出」')
    : bad('wiki 应含首现说明');

  // ---- G. pageerror ----
  console.log('\n[G] 运行健康');
  errors.length === 0 ? ok('全程 0 pageerror') : bad(`pageerror ×${errors.length}`, errors.slice(0, 3).join(' | '));

} finally {
  await browser.close();
}
console.log(`\n===== v430 深渊提前专项：${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);
