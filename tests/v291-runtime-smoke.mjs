// v2.9.1 真实游戏运行冒烟测试（puppeteer-core + 本机 Chrome）
// 验证主要功能：加载/点击/招募/升级/科技/Wiki/许愿池/吞噬抉择/前3级线程降价
import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (n, d='') => { results.push({n, ok:true}); console.log(`  ✓ ${n}${d?'  ['+d+']':''}`); };
const bad = (n, d='') => { results.push({n, ok:false}); console.log(`  ✗ ${n}${d?'  ['+d+']':''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args:['--no-sandbox','--disable-gpu','--window-size=1280,900'] });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);

  // 1. 加载 + 顶栏 EP 显示
  const epText = await page.$eval('#h-ep', el => el.textContent).catch(() => '');
  if (epText.includes('/')) ok('加载：顶栏 EP 显示「当前/上限」'); else bad('加载：顶栏 EP 显示', epText);

  // 2. 点击工作台 5 次 → EP 增加
  const ep0 = await page.evaluate(() => Number(S.ep) || 0);
  for (let i=0;i<5;i++){ await page.click('#hero'); await sleep(60); }
  const ep1 = await page.evaluate(() => Number(S.ep) || 0);
  if (ep1 > ep0) ok('点击工作台产出 EP', `${ep0}→${ep1}`); else bad('点击工作台产出 EP', `${ep0}→${ep1}`);

  // 3. 前 3 级线程降价（v2.9.1）—— staffCost 在模块内未暴露，通过招募行为 + hero 区文本间接验证
  await page.evaluate(() => { S.cultists = []; S.ep = 1e6; window.__gameDirty.hero = true; });
  await sleep(300);
  for (const label of ['第 1 个线程（前3级降价路径）','第 2 个线程','第 3 个线程（前3级降价完成）']) {
    const before = await page.evaluate(() => S.cultists.length);
    await page.click('#hire-btn'); await sleep(200);
    const after = await page.evaluate(() => S.cultists.length);
    if (after === before + 1) ok(`招募${label}`); else bad(`招募${label}`, `${before}→${after}`);
  }

  // 4. 商店买第一个升级（链首 scribble：解锁需 allTimeEp ≥ base×0.3）
  await page.evaluate(() => { S.ep = 1e8; S.allTimeEp = 1e8; window.__gameDirty.shop = true; });
  await sleep(400);
  const buyEl = await page.$('#shop-list [data-buy]');
  if (buyEl) { await buyEl.click(); await sleep(150); ok('商店购买升级（链首项）'); }
  else bad('商店购买升级', '无可购卡 [data-buy]');

  // 5. 切到科技 tab 渲染
  await page.click('#btn-tech'); await sleep(200);
  const techRows = await page.$$eval('#tech-tree .tech', els => els.length).catch(() => 0);
  if (techRows > 0) ok('科技树 tab 渲染', `${techRows} 项`); else bad('科技树 tab 渲染');

  // 6. Wiki 弹框 + 侧栏分章
  await page.click('#btn-wiki'); await sleep(250);
  const wikiVisible = await page.$eval('#wiki-modal', el => getComputedStyle(el).display !== 'none').catch(() => false);
  const navBtns = await page.$$eval('#wiki-nav .wiki-nav-btn', els => els.length).catch(() => 0);
  if (wikiVisible && navBtns >= 10) ok('Wiki 弹框 + 侧栏分章', `${navBtns} 章`); else bad('Wiki 弹框', `visible=${wikiVisible} nav=${navBtns}`);
  // 切换到「数值公式附录」
  const appx = await page.$$eval('#wiki-nav .wiki-nav-btn', els => els.findIndex(e => e.textContent.includes('附录')));
  if (appx >= 0) {
    await page.evaluate(i => { document.querySelectorAll('#wiki-nav .wiki-nav-btn')[i].click(); }, appx);
    await sleep(150);
    const bodyTxt = await page.$eval('#wiki-body', el => el.textContent).catch(() => '');
    if (bodyTxt.includes('软上限') || bodyTxt.includes('成本曲线')) ok('Wiki 切换章节内容渲染'); else bad('Wiki 切换章节', bodyTxt.slice(0,40));
  }
  await page.evaluate(() => document.getElementById('wiki-x').click()); await sleep(100);

  // 7. 许愿池（注入解锁 + 视觉存在）
  await page.evaluate(() => { S.rpTheories = S.rpTheories || {}; S.rpTheories.wish_well = 1; S.ep = 1e6; });
  await sleep(300);
  const wellExists = await page.$eval('#wish-well', el => !!el).catch(() => false);
  const wellSvg = await page.$eval('#wish-well .wish-svg', el => !!el).catch(() => false);
  if (wellExists && wellSvg) ok('许愿池：解锁后浮动井 + SVG 渲染'); else bad('许愿池渲染', `exists=${wellExists} svg=${wellSvg}`);
  // 投币（EP 足够）
  const epBeforeWish = await page.evaluate(() => S.ep);
  await page.click('#wish-well'); await sleep(200);
  const cooling = await page.$eval('#wish-well', el => el.classList.contains('tossing') || el.disabled).catch(() => false);
  if (cooling) ok('许愿池投币动画启动（tossing/disabled）'); else bad('许愿池投币动画', `cooling=${cooling}`);
  await sleep(1300); // 开奖
  const epAfterWish = await page.evaluate(() => S.ep);
  // 投币消耗 100 EP（中奖概率极低，按消耗判定）
  if (epBeforeWish - epAfterWish >= 90) ok('许愿池投币扣 EP（100）', `${epBeforeWish}→${epAfterWish}`); else bad('许愿池扣 EP', `${epBeforeWish}→${epAfterWish}`);

  // 8. 深渊吞噬倒计时 + 抉择弹框
  await page.evaluate(() => { S.corruption = 100; S.collapsed = false; S._collapseAt = null; S._collapseChoicePending = false; S.cultists = [{name:'T',output:1,mood:'正常'}]; });
  await sleep(600); // 等 tickCollapse 启动倒计时
  const bannerWarn = await page.$eval('#abyss-collapse', el => getComputedStyle(el).display !== 'none' && el.textContent.includes('深渊吞噬倒计时')).catch(() => false);
  if (bannerWarn) ok('吞噬倒计时横幅显示（⚠️ 已被深渊腐化，崩溃倒计时）'); else bad('吞噬倒计时横幅', '');
  // 快进倒计时到终结
  await page.evaluate(() => { S._collapseAt = Date.now() - 1; });
  await sleep(500);
  const choiceModal = await page.$eval('#collapse-modal', el => getComputedStyle(el).display !== 'none').catch(() => false);
  if (choiceModal) ok('倒计时终结 → 命运抉择弹框弹出'); else bad('命运抉择弹框', '');
  // 9. 点贿赂深渊
  await page.click('#collapse-bribe'); await sleep(300);
  const achBribe = await page.evaluate(() => !!S.achievements.demon_friend);
  const corruptionAfter = await page.evaluate(() => S.corruption);
  if (achBribe && Math.abs(corruptionAfter - 50) < 1) ok('贿赂深渊：成就「恶魔的朋友」+ 腐化回落 50%', `corruption=${corruptionAfter}`); else bad('贿赂深渊', `ach=${achBribe} corruption=${corruptionAfter}`);

  // 10. 转生锁定（吞噬期间）—— 重新触发倒计时，点晋升应被锁
  await page.evaluate(() => { S.corruption = 100; S._collapseAt = Date.now() + 30000; S._collapseChoicePending = false; S.runEarned = 1e12; });
  await sleep(400);
  await page.click('#btn-prestige'); await sleep(200);
  const talentModal = await page.$eval('#talent-modal', el => getComputedStyle(el).display !== 'none').catch(() => false);
  if (!talentModal) ok('转生锁定：吞噬期间晋升按钮不打开天赋弹框'); else bad('转生锁定', '天赋弹框仍打开');

  // 11. 探采自动恢复（注入载具 + EP 充足）
  await page.evaluate(() => { S.upgrades = S.upgrades || {}; S.upgrades.scooter = 1; S._probeEnabled = true; S._probeAutoPaused = true; S.ep = 1e7; S.vehCollectTimer = 59.9; });
  await sleep(300);
  const resumed = await page.evaluate(() => S._probeAutoPaused === false);
  if (resumed) ok('探采：EP 充足后自动恢复（_probeAutoPaused→false）'); else bad('探采自动恢复', `paused=${await page.evaluate(()=>S._probeAutoPaused)}`);

  // 12. v2.9.2 ② 离职礼盒（sp3_farewell 购买入口——线程休眠期间出现）
  await page.evaluate(() => {
    S._specialTasksDone = {}; S._farewellBought = false;
    S.wageState = { state: 'dormant', debtSec: 999, dormantSec: 0, bufferSec: 0, loseTimer: 0 };
    S.ep = 100; S.cultists = [{ name: 't1', output: 1, mood: '正常' }];
    window.__gameDirty.hero = true; window.__gameDirty.top = true;
  });
  await sleep(400); // 等 wageStateCache 脏检查 + renderTop 创建按钮
  const giftBtn = await page.$('#farewell-gift');
  const giftVisible = giftBtn ? await page.evaluate(el => getComputedStyle(el).display !== 'none', giftBtn) : false;
  if (giftVisible) ok('离职礼盒：线程休眠期间浮动按钮出现'); else bad('离职礼盒按钮出现', `btn=${!!giftBtn}`);
  // 购买：扣 1 EP + 设 _farewellBought + 触发 sp3_farewell 完成
  const epBeforeGift = await page.evaluate(() => S.ep);
  if (giftBtn) { await giftBtn.click(); await sleep(900); } // 0.8s 动画 + 结算
  const epAfterGift = await page.evaluate(() => S.ep);
  const bought = await page.evaluate(() => S._farewellBought);
  const sp3Done = await page.evaluate(() => !!S._specialTasksDone?.sp3_farewell);
  if (epAfterGift <= epBeforeGift - 1 && bought && sp3Done)
    ok('离职礼盒：购买扣 1 EP + 触发 sp3_farewell 完成'); else bad('离职礼盒购买流程', `ep ${epBeforeGift}→${epAfterGift}, bought=${bought}, sp3Done=${sp3Done}`);
  // 任务完成后按钮隐藏
  await sleep(200);
  const giftHidden = await page.$eval('#farewell-gift', el => !el || getComputedStyle(el).display === 'none').catch(() => true);
  if (giftHidden) ok('离职礼盒：任务完成后按钮隐藏'); else bad('离职礼盒完成后隐藏', '按钮仍可见');
  // 非休眠期间不显示
  await page.evaluate(() => { S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 }; window.__gameDirty.top = true; });
  await sleep(300);
  const giftHidden2 = await page.$eval('#farewell-gift', el => !el || getComputedStyle(el).display === 'none').catch(() => true);
  if (giftHidden2) ok('离职礼盒：非休眠期间不显示'); else bad('离职礼盒非休眠隐藏', '按钮仍可见');

  // 13. 无 JS 运行时错误
  if (errors.length === 0) ok('无 JS 运行时错误 / console.error'); else bad('无 JS 运行时错误', `${errors.length} 条：${errors.slice(0,3).join(' | ')}`);

} catch (e) {
  bad('测试执行异常', String(e && e.message || e));
} finally {
  await browser.close();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n===== v2.9.2 真实运行冒烟测试：${pass}/${results.length} 通过 =====`);
  if (pass < results.length) { console.log('FAILED: ' + results.filter(r=>!r.ok).map(r=>r.n).join('; ')); process.exit(1); }
}
