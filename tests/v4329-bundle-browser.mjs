// v4.3.28 P0 浏览器回归：经典脚本产物下 log 被 window.S 覆盖导致整帧中断。
//
// 症状（用户反馈）：「深渊时间到了不清除」「紧急脱出不生效」「暂停无弹窗（刷新后才有）」
//   根因：fileProtocolCompat 把 module 降级为经典脚本，压缩后 runtime 的 log 重命名为 `function S`，
//   而 main.js 顶层 `window.S = S`（存档单例）把它覆盖成对象 → 所有核心模块调用 log() 抛
//   `TypeError: S is not a function`，于是先 log 后执行的 UI/状态写入全部丢失。
//   修复：产物改 IIFE 包裹（vite.config.js），顶层声明回到函数作用域。
//
// 本测试在真实 dist 上验证：① 暂停弹框能出现且日志区可写；② 紧急脱出真的清状态；
//   ③ 深入到期真正结算；④ 全流程零 pageerror；⑤ 抉择文案不含「达成成就」。
//
// 用法：node tests/v4329-bundle-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
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
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);

  // ============ ① 产物形态：IIFE + 调试钩子 ============
  console.log('\n[① 产物形态]');
  const d0 = await page.evaluate(() => ({
    sType: typeof window.S,
    isPaused: !!(window.S && window.S.paused),
    hasLog: !!document.getElementById('log-content'),
  }));
  d0.sType === 'object' ? ok('window.S 仍是存档对象（调试钩子保留）') : bad('window.S 形态异常', d0.sType);
  d0.hasLog ? ok('日志区存在') : bad('日志区缺失');

  // ============ ② 暂停：弹框出现 + 日志可写 ============
  console.log('\n[② 暂停弹框]');
  const d1 = await page.evaluate(() => {
    const S = window.S;
    if (S.paused) document.getElementById('pauseBtn').click(); // 确保从运行态开始
    const logBefore = document.getElementById('log-content').textContent.length;
    const btn = document.getElementById('pauseBtn');
    btn.click();
    const modal = document.getElementById('pause-modal');
    const cs = getComputedStyle(modal);
    const out = {
      paused: !!S.paused,
      display: cs.display,
      zIndex: Number(cs.zIndex) || 0,
      logGrew: document.getElementById('log-content').textContent.length > logBefore,
      logHasPause: document.getElementById('log-content').textContent.includes('系统暂停'),
    };
    btn.click(); // 恢复
    out.resumedDisplay = getComputedStyle(modal).display;
    out.resumedPaused = !!window.S.paused;
    return out;
  });
  d1.paused ? ok('暂停状态生效') : bad('暂停状态未生效');
  d1.display === 'flex' ? ok('暂停弹框可见', `display=${d1.display}`) : bad('暂停弹框未显示（log 被覆盖的典型症状）', d1.display);
  d1.zIndex >= 1200 ? ok('暂停弹框层级压过代码雨', `z-index=${d1.zIndex}`) : bad('暂停弹框被代码雨遮挡', `z-index=${d1.zIndex}`);
  d1.logGrew && d1.logHasPause ? ok('暂停写入日志（log 调用未抛错）') : bad('暂停日志未写入', JSON.stringify({ grew: d1.logGrew, has: d1.logHasPause }));
  d1.resumedDisplay === 'none' && !d1.resumedPaused ? ok('恢复后弹框关闭') : bad('恢复异常', JSON.stringify(d1));

  // ============ ③ 紧急脱出：确认后清状态 ============
  console.log('\n[③ 紧急脱出]');
  await page.evaluate(() => {
    const S = window.S;
    S.ep = 1e12;
    S.riftExpedition = { until: Date.now() + 600000, level: 1, sealCost: 100, gainedDm: 0, gainedVs: 0 };
    window.__renderAll ? window.__renderAll() : null;
    document.getElementById('corruption-bar').style.display = '';
    const abort = document.getElementById('abort-rift-ex');
    abort.style.display = '';
    abort.click();
  });
  await sleep(200);
  const d2a = await page.evaluate(() => getComputedStyle(document.getElementById('confirm-modal')).display);
  d2a === 'flex' ? ok('紧急脱出弹出二次确认') : bad('二次确认未出现', d2a);
  await page.evaluate(() => document.getElementById('confirm-ok').click());
  await sleep(300);
  // dirty 标记会被下一帧消费掉，因此在确认点击后同帧内捕获；界面是否真的收回由下面两条断言兜住
  const d2b = await page.evaluate(() => {
    const exp = !!window.S.riftExpedition;
    return { exp, barDisplay: getComputedStyle(document.getElementById('corruption-bar')).display };
  });
  !d2b.exp ? ok('紧急脱出清空深入状态') : bad('紧急脱出无效（状态仍在）');
  d2b.barDisplay === 'none' ? ok('紧急脱出后腐化条收回') : bad('紧急脱出后腐化条仍在', d2b.barDisplay);

  // ============ ④ 深入到期：自动结算 ============
  console.log('\n[④ 深入到期结算]');
  const d3 = await page.evaluate(() => {
    const S = window.S;
    S.riftExpedition = { until: Date.now() - 500, level: 1, sealCost: 100, gainedDm: 0, gainedVs: 0 };
    window.__advance(1);
    const log = document.getElementById('log-content').textContent;
    return { exp: !!S.riftExpedition, settled: log.includes('深入完成') };
  });
  !d3.exp ? ok('到期深入被清除（不再卡 0s）') : bad('到期深入仍残留 0s');
  d3.settled ? ok('到期深入写入结算日志') : bad('到期深入未结算');

  // ============ ⑤ 抉择文案 ============
  console.log('\n[⑤ 深渊吞噬抉择文案]');
  const d4 = await page.evaluate(() => document.getElementById('collapse-modal').innerText);
  !/达成成就/.test(d4) ? ok('抉择文案不再写「达成成就」') : bad('抉择文案仍写「达成成就」');
  /贿赂深渊/.test(d4) && /同归于尽/.test(d4) ? ok('两个抉择选项仍在') : bad('抉择选项缺失');

  // ============ ⑥ 全程无脚本错误 ============
  console.log('\n[⑥ 控制台]');
  errors.length === 0 ? ok('全流程零 pageerror') : bad('出现脚本错误', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
