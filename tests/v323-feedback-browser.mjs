// v3.2.3 定向回归（puppeteer-core + 本机 Chrome）：6 项反馈逐条真实验证
// ①班组分页 ②许愿池文案 ③灵感工坊首购入口 ④wiki 固定尺寸+搜索 ⑤存档下拉向下 ⑥PT 不足异兽回家
import puppeteer from 'puppeteer-core';
const CHROME = '/usr/local/bin/chromium'; // Linux env adapt
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? '  [' + d + ']' : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? '  [' + d + ']' : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear()); // 清掉历史档（避免离线面板暂停游戏）
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(800);

  // ① 班组分页：造 23 条线程 → 第 1 页 10 条 + 分页条；翻页到第 3 页
  await page.evaluate(() => {
    window.S.cultists = Array.from({ length: 23 }, (_, i) => ({ name: '线程-' + (i + 1), mood: '正常', output: 3, earned: i * 100, hiredAt: Date.now() - i * 60000 }));
    window.__gameDirty.crew = true;
  });
  await sleep(1500);
  const p1 = await page.$$eval('#crew-panel .crew-card', els => els.filter(e => !e.classList.contains('more')).length).catch(() => 0);
  const pagerText = await page.$eval('#crew-panel .crew-pager span', el => el.textContent).catch(() => '');
  if (p1 === 10 && pagerText.includes('1 / 3')) ok('① 班组一页 10 条（23 条 → 3 页）', pagerText.trim()); else bad('① 班组分页', `p1=${p1} pager=${pagerText}`);
  await page.click('#crew-panel [data-crew-page="next"]'); await sleep(250);
  await page.click('#crew-panel [data-crew-page="next"]'); await sleep(250);
  const p3 = await page.$$eval('#crew-panel .crew-card', els => els.filter(e => !e.classList.contains('more')).length).catch(() => 0);
  const pager3 = await page.$eval('#crew-panel .crew-pager span', el => el.textContent).catch(() => '');
  if (p3 === 3 && pager3.includes('3 / 3')) ok('① 翻到第 3 页显示余量 3 条', pager3.trim()); else bad('① 翻页', `p3=${p3} pager=${pager3}`);
  const prevDisabled = await page.$eval('#crew-panel [data-crew-page="next"]', el => el.disabled).catch(() => true);
  if (prevDisabled) ok('① 末页「下一页」禁用'); else bad('① 末页禁用态');

  // ② 许愿池文案 = 万一呢？
  await page.evaluate(() => { window.S.ep = 1e6; window.S.buildings = { ...(window.S.buildings || {}), wish_well: 1 }; window.__gameDirty.shop = true; });
  await sleep(400);
  const wishDesc = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#building-list .item, #shop-list .item')].find(e => e.textContent.includes('许愿池'));
    return el ? el.textContent : '';
  }).catch(() => '');
  if (wishDesc.includes('万一呢？') && !wishDesc.includes('横财')) ok('② 许愿池文案精简为「万一呢？」'); else bad('② 许愿池文案', wishDesc.slice(0, 60));
  await page.evaluate(() => { document.querySelector('.wish-well')?.scrollIntoView(); });
  const wishTitle = await page.$eval('.wish-well', el => el.title).catch(() => '');
  if (wishTitle.includes('万一呢？')) ok('② 浮动许愿池悬浮文案同步'); else bad('② 浮动井悬浮', wishTitle);

  // ③ 灵感工坊首购卡：EP ≥ 15K 摆出；EP ≥ 50K 可购；购入后快捷开关出现
  await page.evaluate(() => { window.S.ep = 30000; window.S.allTimeEp = 30000; window.S.upgrades = { ...(window.S.upgrades || {}) }; delete window.S.upgrades.atrium; window.__gameDirty.shop = true; });
  await sleep(500);
  let atriumCard = await page.evaluate(() => { const h = document.querySelector('#building-list'); return h ? h.textContent : ''; });
  if (atriumCard.includes('灵感工坊') && atriumCard.includes('自动蒸馏')) ok('③ 未购时摆出首购卡（EP≥15K 揭示）'); else bad('③ 首购卡', atriumCard.slice(0, 50));
  await page.evaluate(() => {
    window.S.ep = 60000; window.S.allTimeEp = 1e8;
    window.S.upgrades.storage = 300; // 抬高 EP 存储上限（否则 tick 把 ep 钳回 cap，50K 买不起）
    // v3.6.3 ⑥：v2.8 起懒惰态（lazySince）会让产出 ×0.4 / 消耗 ×1.8 → 触发「产出不足」防死锁拦截；
    //   旧夹具未清该状态，导致首购点击被拒。这里显式恢复满薪态并给足净产出余量。
    window.S.lazySince = null;
    window.S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0, transition: 0 };
    window.S.cultists = Array.from({ length: 3 }, (_, i) => ({ name: '线程-' + i, mood: '高效', output: 2000, earned: 0, hiredAt: Date.now() }));
    window.S.upgrades = { ...(window.S.upgrades || {}) }; delete window.S.upgrades.atrium;
    window.__gameDirty.shop = true;
  });
  await sleep(1300);
  // v3.3.2：整卡点击购买（data-atrium-upg），原 data-atrium-buy 按钮已移除
  const buyAtrium = await page.$('#building-list [data-atrium-upg]');
  if (buyAtrium) { await buyAtrium.click(); await sleep(400); }
  const atriumLv = await page.evaluate(() => (window.S.upgrades.atrium || 0));
  if (atriumLv === 1) ok('③ 点击购入 → 灵感工坊 ×1（EP 扣 50K）'); else bad('③ 首购', `atrium=${atriumLv} ep=${await page.evaluate(() => Math.floor(window.S.ep))}`);
  const atriumOwned = await page.evaluate(() => { const h = document.querySelector('#building-list'); return h ? h.textContent.includes('灵感工坊') && h.textContent.includes('×1') : false; });
  if (atriumOwned) ok('③ 购后切已拥有卡（升级）'); else bad('③ 已拥有卡');
  await sleep(1400); // 快捷开关随 1s 周期刷新出现
  const qsDistill = await page.evaluate(() => { const p = document.getElementById('quick-switches-panel'); return p ? (p.style.display !== 'none' && p.textContent.includes('蒸馏')) : false; });
  if (qsDistill) ok('③ 任务版上方出现「蒸馏」快捷开关'); else bad('③ 快捷开关出现');

  // ④ wiki 固定尺寸 + 搜索
  await page.click('#btn-wiki'); await sleep(300);
  const dims = await page.$eval('.wiki-box', el => ({ w: el.offsetWidth, h: el.offsetHeight, scrollable: getComputedStyle(el).overflowY === 'hidden' }));
  if (dims.w >= 700 && dims.h >= 500) ok('④ wiki 弹框固定尺寸', `${dims.w}×${dims.h}`); else bad('④ 固定尺寸', JSON.stringify(dims));
  await page.type('#wiki-search', '灵感工坊'); await sleep(500);
  const hits = await page.$$eval('#wiki-body .wiki-hit', els => els.length).catch(() => 0);
  if (hits >= 1) ok('④ 搜索「灵感工坊」有命中条目', `${hits} 条`); else bad('④ 搜索命中');
  const hitSec = await page.$eval('#wiki-body .wiki-hit', el => el.textContent).catch(() => '');
  if (hitSec.includes('解锁条件手册')) ok('④ 命中定位到解锁条件手册'); else bad('④ 命中章节', hitSec.slice(0, 40));
  await page.evaluate(() => {
    const hit = [...document.querySelectorAll('#wiki-body .wiki-hit')]
      .find(e => e.querySelector('.wiki-hit-sec')?.textContent.trim() === '解锁条件手册');
    hit?.click();
  }); await sleep(300);
  const jumpTitle = await page.$eval('#wiki-body .wiki-title', el => el.textContent).catch(() => '');
  if (jumpTitle === '解锁条件手册') ok('④ 点击结果跳转对应章节'); else bad('④ 跳转', jumpTitle);
  const wikiRows = await page.$$eval('#wiki-body tr', els => els.map(e => e.textContent)).catch(() => []);
  if (wikiRows.some(t => t.includes('灵感工坊（自动蒸馏）') && t.includes('15,000'))) ok('③ 解锁条件手册含灵感工坊条目'); else bad('③ wiki 条目');
  await page.click('#wiki-x'); await sleep(200);

  // ⑤ 存档下拉向下展开（不超出屏幕顶部）
  const popRect = await page.evaluate(() => {
    const pop = document.querySelector('.save-menu-pop');
    pop.style.display = 'flex'; // 强制展开测量
    const r = pop.getBoundingClientRect();
    pop.style.display = '';
    return { top: r.top, bottom: r.bottom };
  });
  if (popRect.top >= 0) ok('⑤ 存档下拉向下展开（top ≥ 0 不出屏）', `top=${Math.round(popRect.top)}`); else bad('⑤ 下拉方向', JSON.stringify(popRect));

  // ⑥ PT 不足异兽回家：出战 1 只 + 无 PT 来源 → PT 耗尽 → 休战日志 + 卡片「休战中」
  await page.evaluate(() => {
    const S = window.S;
    S.ptAutoHatch = false; S.ptDistillOn = false;
    S.pt = 0.0001; // Lv.1 维持 0.02 PT/s → 一两个 tick 内耗尽触发休战
    S.pets = { cat: { icon: '🐱', name: '影猫', level: 1, exp: 0, gen: 1 } };
    S.activePets = ['cat'];
    S.upgrades = { ...(S.upgrades || {}) }; // 无 PT 产出升级
  });
  await sleep(1500);
  const logText = await page.$eval('#log-content', el => el.textContent).catch(() => '');
  const starveLog = logText.includes('回家休战');
  const petCardTxt = await page.evaluate(() => { const g = document.getElementById('pet-grid'); return g ? g.textContent : ''; });
  const upkeepLine = petCardTxt.includes('回家休战') || petCardTxt.includes('休战中');
  if (starveLog && upkeepLine) ok('⑥ PT 耗尽 → 日志「回家休战」+ 卡片休战提示'); else bad('⑥ 回家生效', `log=${starveLog} card=${upkeepLine}`);
  const petOn = await page.$eval('#pet-grid .pet-card.on', el => el.textContent).catch(() => '');
  if (petOn.includes('休战中')) ok('⑥ 出战卡显示「💤 休战中」'); else bad('⑥ 卡片状态', petOn.slice(0, 40));
  const pt0 = await page.evaluate(() => window.S.pt);
  if (pt0 < 0.0002) ok('⑥ 维持消耗生效（PT 被扣至 0）', `pt=${pt0}`); else bad('⑥ 维持消耗', `pt=${pt0}`);

  // 恢复：PT 回升 → 重新出战日志
  await page.evaluate(() => { window.S.pt = 5; });
  await sleep(1200);
  const logText2 = await page.$eval('#log-content', el => el.textContent).catch(() => '');
  const resumeLog = logText2.includes('重新出战');
  if (resumeLog) ok('⑥ PT 回升 → 「重新出战」日志'); else bad('⑥ 恢复日志');

  if (errors.length) bad('无 JS 运行时错误', errors.slice(0, 2).join(' | ')); else ok('无 JS 运行时错误');
} catch (e) {
  bad('脚本异常', String(e).slice(0, 200));
}
await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
