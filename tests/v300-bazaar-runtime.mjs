// v3.0.0 真实浏览器运行冒烟（puppeteer-core + 本机 Chrome）：深渊集市 tab 全流程
// 覆盖：tab 出现 → 挂牌开张 → 面板渲染 6 位商人 → 成交落状态 → 刷新（EP）→ 无 JS 错误
// 用法：先启动 dev（npx vite），默认 http://localhost:5174/，可用 URL 环境变量覆盖
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.URL || 'http://localhost:5174/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (n, d = '') => { results.push({ n, ok: true }); console.log(`  ✓ ${n}${d ? '  [' + d + ']' : ''}`); };
const bad = (n, d = '') => { results.push({ n, ok: false }); console.log(`  ✗ ${n}${d ? '  [' + d + ']' : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900'] });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);

  // 0. 造一个可解锁集市的存档：职级 1 + RP 已发现
  await page.evaluate(() => {
    S.prestige = 1; S.resDiscovered.rp = true; S.ep = 1e9; S.rp = 500; S.abyssEcho = 3;
    S.bazaar = { unlocked: false, trades: 0, refreshCount: 0, shuffleTimer: 0, regenTimer: 0, rates: {}, stock: {} };
    window.__gameDirty.top = true;
  });
  await sleep(600);

  // 1. 集市 tab 出现（refreshTabVisibility 5s 内生效，这里直接判定显示逻辑）
  const shown = await page.evaluate(() => {
    const b = document.getElementById('btn-bazaar');
    return !!b && b.style.display !== 'none';
  });
  if (shown) ok('集市 tab 出现（职级≥1 + RP 已发现）'); else bad('集市 tab 出现');

  // 2. 进入 tab 并挂牌开张
  await page.evaluate(() => { document.getElementById('btn-bazaar').click(); });
  await sleep(400);
  const hasUnlockBtn = await page.$('[data-bazaar-unlock]');
  if (hasUnlockBtn) ok('未开张时面板给出「挂牌开张」入口'); else bad('未开张时面板入口');
  await page.click('[data-bazaar-unlock]').catch(() => {});
  await sleep(400);
  const unlocked = await page.evaluate(() => !!(S.bazaar && S.bazaar.unlocked));
  if (unlocked) ok('挂牌开张成功（S.bazaar.unlocked）'); else bad('挂牌开张成功');

  // 3. 面板渲染 6 位商人
  const dealerCount = await page.evaluate(() => document.querySelectorAll('[data-bazaar-dealer]').length);
  if (dealerCount === 6) ok('面板渲染 6 位商人'); else bad('面板渲染 6 位商人', `实际 ${dealerCount}`);

  // 4. 成交（熔炉协议 EP → RP）——先扩容，否则 EP 会被存储上限钳到 2000，付不起 12 万 EP 的一批
  await page.evaluate(() => { S.upgrades = { ...S.upgrades, storage: 80 }; S.ep = 1e9; S.rp = 0; window.__gameDirty.top = true; window.__gameDirty.shop = true; });
  await sleep(600);
  const capOk = await page.evaluate(() => S.ep > 2e5);
  if (capOk) ok('扩容后 EP 存量足以支付熔炉协议一批', `ep=${Math.round(await page.evaluate(() => S.ep))}`); else bad('扩容后 EP 存量', String(await page.evaluate(() => S.ep)));
  // v3.6.3 ⑥：集市成交已加二次确认（首次点击提示「再点一次确认购买」），旧脚本只点一次
  // v3.6.3 ⑥：熔炉协议现行口径是 EP → DM（数据层 from:'ep' to:'dm'），老脚本按 EP → RP 断言
  const before = await page.evaluate(() => ({ ep: S.ep, dm: S.dm, trades: S.bazaar.trades }));
  await page.evaluate(() => document.querySelector('[data-bazaar-dealer="forge"]').click());
  await sleep(150);
  await page.evaluate(() => document.querySelector('[data-bazaar-dealer="forge"]').click());
  await sleep(300);
  const after = await page.evaluate(() => ({ ep: S.ep, dm: S.dm, trades: S.bazaar.trades, stock: S.bazaar.stock.forge }));
  if (after.trades === before.trades + 1 && after.ep < before.ep && after.dm > before.dm) {
    ok('点击成交：EP 扣款 / DM 到账 / 笔数 +1', `EP ${Math.round(before.ep)}→${Math.round(after.ep)}，DM ${before.dm}→${after.dm}`);
  } else bad('点击成交', JSON.stringify({ before, after }));

  // 5. 刷新（EP）→ 库存补满
  await page.evaluate(() => { S.bazaar.stock.forge = 0; });
  await page.evaluate(() => document.querySelector('[data-bazaar-refresh]').click());
  await sleep(300);
  const st = await page.evaluate(() => S.bazaar.stock.forge);
  if (st > 0) ok('EP 刷新：库存补满', `stock=${st}`); else bad('EP 刷新：库存补满', `stock=${st}`);

  // 6. 回响刷新
  const echo0 = await page.evaluate(() => S.abyssEcho);
  await page.evaluate(() => document.querySelector('[data-bazaar-refresh-echo]').click());
  await sleep(300);
  const echo1 = await page.evaluate(() => S.abyssEcho);
  if (echo1 === echo0 - 1) ok('回响刷新：扣 1 回响', `${echo0}→${echo1}`); else bad('回响刷新', `${echo0}→${echo1}`);

  // 7. 深潜面板展示 EP 成本（v3.0.0 ①）
  // v3.6.3 ⑥：深潜面板按脏标记异步渲染，同步读 textContent 会拿到空串
  await page.evaluate(() => {
    S.delve = { unlocked: true, active: false, depth: 0, up: {}, mileDone: {} };
    S.es = 3; S.dm = 1e6; S.resDiscovered.dm = true; S.religion = { unlocked: true };
    document.getElementById('btn-delve').style.display = '';
    document.getElementById('btn-delve').click();
    window.__gameDirty.delve = true;
  });
  await sleep(700);
  const delveTxt = await page.evaluate(() => document.getElementById('delve-panel').textContent);
  if (/E?P?\s*存量|EP/.test(delveTxt) && delveTxt.includes('下潜')) ok('深潜面板渲染（含 EP 成本口径）');
  else bad('深潜面板渲染', delveTxt.slice(0, 60));

  // 8. 深潜下潜真的扣 EP（v3.0.0 ① 核心修复，真实点击验证）
  // v3.6.3 ⑥：下潜成本按「存储上限 ×4%」（本夹具约 918M），而前面几轮刷新已把 EP 消耗到 ~540M；
  //   补足预算后再验证真实扣费，否则会因资源不足被拒（不是玩法回归）。
  await page.evaluate(() => { S.ep = Math.min(window.__qa.epStorageCap() * 0.9, 2e9); });
  await sleep(150);
  const dvBefore = await page.evaluate(() => ({ ep: S.ep, dm: S.dm, depth: S.delve.depth }));
  await page.evaluate(() => document.querySelector('#delve-panel [data-delve-toggle]').click());
  await sleep(300);
  const dvAfter = await page.evaluate(() => ({ ep: S.ep, dm: S.dm, depth: S.delve.depth, active: S.delve.active }));
  if (dvAfter.ep < dvBefore.ep && dvAfter.dm < dvBefore.dm && dvAfter.depth === dvBefore.depth + 1) {
    ok('下潜同时扣 EP 与 DM（层深 +1）', `EP ${Math.round(dvBefore.ep)}→${Math.round(dvAfter.ep)}，DM ${Math.round(dvBefore.dm)}→${Math.round(dvAfter.dm)}`);
  } else bad('下潜同时扣 EP 与 DM', JSON.stringify({ dvBefore, dvAfter }));

  if (errors.length === 0) ok('无 JS 运行时错误 / console.error'); else bad('无 JS 运行时错误', errors.slice(0, 2).join(' | '));
} catch (e) {
  bad('运行异常', String(e).slice(0, 200));
} finally {
  await browser.close();
}

const pass = results.filter(r => r.ok).length;
console.log(`\n===== v3.0.0 集市真实运行冒烟：${pass}/${results.length} 通过 =====`);
process.exit(pass === results.length ? 0 : 1);
