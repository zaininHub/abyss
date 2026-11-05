// v3.6.4 定向回归（4 项反馈）：① 裂隙不自行升级 ② 恢复 1~3h 存满且上限解耦
// ③ 智能分配生效 ④ 粮仓首购价 ≤ 初始库存
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const cultists = (n = 10) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60,
  profession: 'prospector', hiredAt: Date.now() - 60000, earned: 0,
}));
const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: cultists(), faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(), ...over,
});

async function boot(browser, save, width = 1600, height = 1000) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', e => { throw new Error('pageerror: ' + String(e).slice(0, 200)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1300);
  return page;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

// ---- ① 裂隙等级只认科技，不随 cps 自行升级 ----
{
  const page = await boot(browser, mkSave());
  const r = await page.evaluate(() => {
    const qa = window.__qa;
    const l1 = qa.riftLevelOf(1);
    const l2 = qa.riftLevelOf(1e12);  // 极高产能也不该跳级
    window.S.ep = 1e12; window.S.dm = 1e6;
    const bought = qa.buyRiftLevelTech();
    const l3 = qa.riftLevelOf(1e12);
    return { l1, l2, l3, tech: qa.riftLevelTech(), ok: bought && bought.ok };
  });
  if (r.l1 === 1 && r.l2 === 1) ok('① 裂隙恒 Lv.1，cps 从 1 拉到 1e12 也不自行升级', `l1=${r.l1} l2=${r.l2}`);
  else bad('① 等级仍随 cps 变化', JSON.stringify(r));
  if (r.ok && r.tech === 1 && r.l3 === 2) ok('① 只有主动购买「裂隙等级」科技才升级（Lv.1 → Lv.2）', `tech=${r.tech} lv=${r.l3}`);
  else bad('① 科技升级未生效', JSON.stringify(r));
  await page.close();
}

// ---- ② 1~3 小时存满 + 上限与线程状态解耦 ----
{
  const page = await boot(browser, mkSave({ _rpOverflowSeen: true }));
  const r = await page.evaluate(() => {
    const qa = window.__qa;
    window.S._rpOverflowSeen = true;
    const cap0 = qa.epStorageCap();
    const cps = qa.computeCps();
    const hours = cap0 / Math.max(1e-9, cps) / 3600;
    window.S.cultists = [];
    const capEmpty = qa.epStorageCap();
    window.S.lazySince = Date.now() - 1e6;
    const capLazy = qa.epStorageCap();
    window.S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 120, bufferSec: 0, loseTimer: 0, transition: 0 };
    const capDormant = qa.epStorageCap();
    window.S.collapsed = true;
    const capCollapsed = qa.epStorageCap();
    window.S.collapsed = false; window.S.lazySince = null;
    window.S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0, transition: 0 };
    window.S.cultists = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60, profession: 'prospector' }));
    const beforeBuy = qa.epStorageCap();
    window.S.upgrades.storage = 1; // 结构性投入变化 → 快照刷新
    const afterBuy = qa.epStorageCap();
    return { cap0, cps, hours, capEmpty, capLazy, capDormant, capCollapsed, beforeBuy, afterBuy, sig: window.S._epCapBasisSig, basis: window.S._epCapBasisCps };
  });
  if (r.hours >= 1 && r.hours <= 3) ok('② 首次溢出后存满一次 ≈ 2 小时（1~3h 区间）', `${r.hours.toFixed(2)}h（cap ${r.cap0} / cps ${r.cps.toFixed(1)}）`);
  else bad('② 存满节奏不在 1~3 小时', JSON.stringify(r));
  if (['capEmpty', 'capLazy', 'capDormant', 'capCollapsed'].every(k => r[k] === r.cap0)) ok('② 线程数/懒惰/休眠/吞噬均不改上限（快照解耦）', `cap=${r.cap0}`);
  else bad('② 上限仍随线程状态抖动', JSON.stringify(r));
  if (r.afterBuy > r.beforeBuy) ok('② 结构性投入（买扩容）仍会刷新快照并抬升上限', `${r.beforeBuy} → ${r.afterBuy}`);
  else bad('② 买扩容未生效', JSON.stringify(r));
  if (r.basis > 0 && r.sig) ok('② 产能快照已落档（只在签名变化时取样）', `basis=${r.basis.toFixed(1)}`);
  else bad('② 快照未生效', JSON.stringify(r));
  await page.close();

  // 零产出档：基座下限保证仍为结构性 ×4，不缩水
  const page2 = await boot(browser, mkSave({ cultists: [], _rpOverflowSeen: true }));
  const z = await page2.evaluate(() => {
    window.S._rpOverflowSeen = true;
    const cap = window.__qa.epStorageCap();
    window.S._rpOverflowSeen = false;
    const early = window.__qa.epStorageCap();
    return { cap, early, ratio: cap / early };
  });
  if (Math.abs(z.ratio - 4) < 0.02) ok('② 零产出/纯结构性档仍有 ×4 兜底（上限不缩水）', `${z.early} → ${z.cap}`);
  else bad('② 零产出档上限异常', JSON.stringify(z));
  await page2.close();
}

// ---- ③ 智能分配开局即可用（无领导者 / 无解锁模块）----
{
  const page = await boot(browser, mkSave());
  const before = await page.evaluate(() => ({
    disabled: document.querySelector('[data-autobind]')?.disabled,
    hasLeader: window.S.cultists.some(c => c.leader),
    unlocked: window.__qa.threadBind.unlockedConverterIds(),
  }));
  if (before.disabled === false && !before.hasLeader) ok('③ 无领导者时「智能分配」按钮不再禁用', JSON.stringify(before));
  else bad('③ 按钮仍被禁用', JSON.stringify(before));
  const after = await page.evaluate(() => {
    document.querySelector('[data-autobind]').click();
    return { bound: window.S.cultists.map(c => c.boundTo), feed: (window.S.crewFeed || []).slice(-1)[0]?.msg || '' };
  });
  if (after.bound.every(t => t === 'hyper') && after.bound.length === 10) ok('③ 未解锁任何模块时统一转入超线程（点击有实际效果）', `hyper=${after.bound.filter(t => t === 'hyper').length}/10`);
  else bad('③ 点击后线程未转入超线程', JSON.stringify(after));
  if (/智能分配/.test(after.feed)) ok('③ 班组流水写明智能分配结果', after.feed);
  else bad('③ 流水文案未更新', after.feed);

  // 解锁岗位后智能分配恢复正常岗位优化，且不覆盖手动超线程
  const r2 = await page.evaluate(() => {
    window.S.upgrades.atrium = 1;
    window.S.upgrades.scooter = 1;
    window.S.cultists[0].boundTo = 'hyper';
    window.S.cultists.slice(1).forEach(c => { c.boundTo = null; });
    const changed = window.__qa.threadBind.autoAssignThreads();
    return { changed, hyperKept: window.S.cultists[0].boundTo, rest: window.S.cultists.slice(1).map(c => c.boundTo) };
  });
  if (r2.hyperKept === 'hyper' && r2.rest.every(t => t && t !== 'hyper')) ok('③ 解锁岗位后按岗位重排，手动超线程保留', JSON.stringify(r2));
  else bad('③ 解锁后重排异常', JSON.stringify(r2));
  await page.close();
}

// ---- ④ 粮仓首购价 ≤ 初始库存上限，且卡面/实付同口径 ----
{
  const page = await boot(browser, mkSave());
  const r = await page.evaluate(() => {
    const qa = window.__qa;
    const rb = { id: 'reserve_bin', base: 12000, growth: 1.45 };
    const bulk = qa.bulkCostCalc(rb, 1);
    const unit = qa.unitCost(rb, 0);
    const cap = qa.epStorageCap();
    const card = [...document.querySelectorAll('[data-buy="reserve_bin"]')].map(e => e.textContent.replace(/\s+/g, ' ').trim())[0] || '';
    return { bulk, unit, cap, card };
  });
  if (r.bulk === r.unit) ok('④ 主商店卡面/实付与 unitCost 同口径（30% 防死锁钳制）', `bulk=${r.bulk} unit=${r.unit}`);
  else bad('④ 两条购买路径口径不一致', JSON.stringify(r));
  if (r.bulk <= r.cap && r.bulk < 12000) ok('④ 粮仓首购价 ≤ 初始库存上限（不再显示 12K）', `首购 ${r.bulk} / 上限 ${r.cap}`);
  else bad('④ 首购价仍大于初始库存', JSON.stringify(r));
  if (!/12\.00K|12K/.test(r.card)) ok('④ 卡面不再出现买不起的 12K 标价', r.card.slice(0, 80));
  else bad('④ 卡面仍是 12K', r.card.slice(0, 100));

  // 卡片灰态由渲染周期判定，设完 EP 后需让商店刷新一次，否则「cant」卡的点击会被委托跳过
  await page.evaluate(() => {
    const cost = window.__qa.bulkCostCalc({ id: 'reserve_bin', base: 12000, growth: 1.45 }, 1);
    window.S.ep = cost * 3; // 留足薪资消耗余量，仍低于初始上限 2000
    window.__gameDirty.shop = true;
  });
  await sleep(1300);
  const buy = await page.evaluate(() => {
    const cost = window.__qa.bulkCostCalc({ id: 'reserve_bin', base: 12000, growth: 1.45 }, 1);
    const cls = document.querySelector('[data-buy="reserve_bin"]')?.className || '';
    const ep0 = window.S.ep;
    document.querySelector('[data-buy="reserve_bin"]')?.click();
    return { cost, cls, ep0, lv: window.S.upgrades.reserve_bin || 0, ep: window.S.ep };
  });
  if (buy.lv === 1 && buy.ep < buy.ep0) ok('④ 开局攒到钳制价即可真实购入粮仓', `扣 ${Math.round(buy.ep0 - buy.ep)} EP → Lv.${buy.lv}（${buy.cls}）`);
  else bad('④ 仍买不起粮仓', JSON.stringify(buy));
  await page.close();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
await browser.close();
if (fail) process.exit(1);
