// v4.3.8 回归：快照「读取覆盖本地」必须在 reload 后真正生效
//
// 根因：snap-use / 导入覆盖当前 两条路径写入新存档后靠 600ms 延时 reload，
//   但未置位 resetGuard —— beforeunload（`if (!resetGuard) save(S)`）与 5s 自动保存
//   会把内存中的旧 S 回写，覆盖刚落盘的新档。玩家表现：「新建初始空档→读取」后
//   页面刷新回来还是旧进度（本局 EP 等未归零）。
// 本专项核心断言放在 **reload 完成之后**（不是写入瞬间），否则抓不到 beforeunload 回写。
//
// 用法：node tests/v438-snapshot-reload-browser.mjs
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const GAME_URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

// 有进度的旧存档（runEarned / chapter 用于区分是否被空档覆盖）
const SEED = JSON.stringify({
  _version: 6, chapter: 3, ep: 50000, runEarned: 123456, allTimeEp: 123456,
  lastSeen: Date.now(), startTime: Date.now(),
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1600, height: 960 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument((raw) => {
    if (sessionStorage.getItem('__seeded')) return; // reload 不再重播种子
    localStorage.clear();
    localStorage.setItem('abyss_idle_v2', raw);
    sessionStorage.setItem('__seeded', '1');
  }, SEED);
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await sleep(1200);

  console.log('\n[1] 初始旧档前置');
  const boot = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('abyss_idle_v2'));
    return { runEarned: d.runEarned, chapter: d.chapter };
  });
  boot.runEarned === 123456 && boot.chapter === 3
    ? ok('旧档已载入', `runEarned=${boot.runEarned} chapter=${boot.chapter}`)
    : bad('旧档种子失败', JSON.stringify(boot));

  console.log('\n[2] 新建初始空档');
  await page.evaluate(() => document.getElementById('save-new').click());
  await sleep(300);
  const snaps = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').map(s => ({ name: s.name, runEarned: JSON.parse(s.data).runEarned })));
  snaps.length === 1 && snaps[0].name === '初始空档' && snaps[0].runEarned === 0
    ? ok('空档快照入槽且为全新初始状态', JSON.stringify(snaps))
    : bad('空档快照异常', JSON.stringify(snaps));

  console.log('\n[3] 读取空档覆盖当前 + reload 后核验（核心）');
  await page.evaluate(() => document.querySelector('#save-list .snap-use').click());
  await sleep(300);
  const confirmTitle = await page.evaluate(() => document.getElementById('confirm-title')?.textContent || '');
  /使用快照覆盖当前进度/.test(confirmTitle) ? ok('弹出二次确认', confirmTitle) : bad('确认框未弹出', confirmTitle);
  await page.evaluate(() => document.getElementById('confirm-ok').click());
  await sleep(2000); // 覆盖 setTimeout(600) + reload 完成

  const after = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('abyss_idle_v2'));
    return { runEarned: d.runEarned, chapter: d.chapter, ep: d.ep, memRunEarned: window.S?.runEarned };
  });
  after.runEarned === 0
    ? ok('reload 后存档为新档（未被 beforeunload 旧 S 回写）', `runEarned=${after.runEarned}`)
    : bad('读取被旧档覆盖（BUG 回归）', `runEarned=${after.runEarned}`);
  String(after.chapter) === '1'
    ? ok('reload 后章节回退初始章', `chapter=${after.chapter}`)
    : bad('章节未回退', `chapter=${after.chapter}`);
  after.memRunEarned === 0
    ? ok('reload 后内存 S 亦为新档', `memRunEarned=${after.memRunEarned}`)
    : bad('内存 S 非新档', `memRunEarned=${after.memRunEarned}`);

  const bak = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2_bak') || 'null')?.runEarned);
  bak === 123456 ? ok('旧档已备份到 _bak（可回滚）', `bak.runEarned=${bak}`) : bad('旧档备份异常', `bak.runEarned=${bak}`);

  errs.length === 0 ? ok('0 pageerror') : bad('pageerror', errs.join(' | '));

  console.log(`\n=== v438 快照读取回归：${pass} PASS / ${fail} FAIL ===`);
} finally {
  await browser.close();
}
process.exit(fail > 0 ? 1 : 0);
