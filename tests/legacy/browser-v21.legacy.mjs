import { chromePath } from '../_chrome.mjs';
// v2.1 浏览器数值验证（puppeteer-core + 系统 chromium，file:// 直开 dist）
import puppeteer from 'puppeteer-core';

const results = [];
function rec(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : '')); }

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
// v2.8.1 EP 0 开局后，数值断言注入启动资金 500（招募 40 / 存储节点 150 可购）
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('abyss_idle_v2', JSON.stringify({ _version: 6, chapter: '1', storyline: 'default', ep: 500, rp: 0, upgrades: {}, tech: {}, cultists: [], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }));
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const url = 'file://' + new URL('../../dist/index.html', import.meta.url).pathname;
await page.goto(url, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500)); // 等 defer 脚本 + 首帧渲染

// ---- 0. 页面无 JS 错误 ----
rec('页面加载无 JS 报错', errors.length === 0, errors.join('; '));

// ---- 1. 顶栏 EP 显示「当前 / 上限」 ----
const epText = await page.$eval('#h-ep', el => el.textContent);
rec('EP 常显 当前/上限', /\d[\d,]*\s*\/\s*\d[\d,]*/.test(epText), `#h-ep = "${epText}"`);

// ---- 2. 英雄点击产出（数值证据：EP 递增） ----
const ep0 = await page.$eval('#h-ep', el => el.textContent);
await page.click('#hero');
await page.click('#hero');
await new Promise(r => setTimeout(r, 300));
const ep1 = await page.$eval('#h-ep', el => el.textContent);
const n0 = parseFloat(ep0.replace(/,/g, '')), n1 = parseFloat(ep1.replace(/,/g, ''));
rec('英雄点击 2 次 EP 数值递增', n1 > n0, `${ep0} → ${ep1}`);

// ---- 3. 招募线程（数值证据：线程数 0→1 + EP 扣款） ----
const threadBefore = await page.$$eval('#hero .mono, #staff-status', els => els.map(e => e.textContent).join('|')).catch(() => '');
await page.click('#hire-btn');
await new Promise(r => setTimeout(r, 300));
const epAfterHire = await page.$eval('#h-ep', el => el.textContent);
const nAfterHire = parseFloat(epAfterHire.replace(/,/g, ''));
// 薪资每秒扣款 + 初始 40 成本：EP 应低于点击所得（相对 n1 已扣 40）
rec('招募线程扣款 360 EP（v2.8.27 firstCost）', n1 - nAfterHire >= 355 && n1 - nAfterHire <= 365, `点击后 ${n1} → 招募后 ${nAfterHire}（Δ=${(n1 - nAfterHire).toFixed(1)}，含 1s 内薪资）`);
// 线程产出：等待 3 秒，EP 应持续增长（R1：产出不再双重乘数爆炸）
await new Promise(r => setTimeout(r, 3000));
const ep3s = await page.$eval('#h-ep', el => el.textContent);
rec('线程挂机产出 EP 增长', parseFloat(ep3s.replace(/,/g, '')) > nAfterHire, `${nAfterHire} → ${ep3s}`);

// ---- 4. R1 数值复核：3 秒净增长应 ≈ 线程产出(3/s × 潮汐/腐化修正) - 薪资，量级 < 15/s ----
const rate = (parseFloat(ep3s.replace(/,/g, '')) - nAfterHire) / 3;
rec('R1：单线程产出量级正常（< 15 EP/s，无乘数爆炸）', rate > 0 && rate < 15, `≈ ${rate.toFixed(2)} EP/s`);

// ---- 5. R3：存储节点可购且扩容生效（数值证据：上限抬升 + 扣款 ≈500） ----
// 注：新档开局线程就位后 cps≥5 会触发首个里程碑 → 上限已自动 ×1.5（里程碑自动扩容路径）
// 故断言用增量口径：capAfter = (1000 + 2500×购前件数) × m，此处购前 0 件 → capAfter/capBefore = 3500/1000 = 3.5
// 用点击攒 EP 到 ≥ 520（新档真实路径；500 为存储节点首购价）
await page.evaluate(() => {
  const hero = document.getElementById('hero');
  for (let i = 0; i < 3000; i++) hero.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 400));
// v2.3.1 断言适配：#h-ep 为 fmt 输出（≥1000 显示 "2.00K"），parseFloat 丢 K 后缀会截成 2——后缀乘回
const epSavedTxt = await page.$eval('#h-ep', el => el.textContent);
const mSaved = epSavedTxt.split('/')[0].trim().match(/^([\d.,]+)\s*([KM]?)/);
const epSaved = mSaved ? parseFloat(mSaved[1].replace(/,/g, '')) * (mSaved[2] === 'K' ? 1e3 : mSaved[2] === 'M' ? 1e6 : 1) : 0;
rec('点击蓄能至 ≥ 500 EP（新档路径）', epSaved >= 500, `EP = ${epSaved}（受上限截断）`);
// v2.3.1 ⑤：窗口 K=p+1——先真实购入链前三项（草稿记录/自动化脚本/并行任务），
// 存储节点作为链内下一项进入窗口（用户真实推进路径）
for (const nm of ['草稿记录', '自动化脚本', '并行任务']) {
  await page.evaluate((name) => {
    const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes(name));
    if (el) el.click();
  }, nm);
  await new Promise(r => setTimeout(r, 400));
}
const capBeforeTxt = await page.$eval('#h-ep', el => el.textContent);
const epBeforeBuy = curNumOf(capBeforeTxt);
// 找到商店里的存储节点卡并点击
const bought = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#shop-list > *')];
  const card = cards.find(c => c.textContent.includes('存储节点'));
  if (!card) return 'not-found';
  card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return 'clicked';
});
await new Promise(r => setTimeout(r, 400));
const capAfterTxt = await page.$eval('#h-ep', el => el.textContent);
const epAfterBuy = curNumOf(capAfterTxt);
function curNumOf(s) { const m = s.split('/')[0].trim().match(/^([\d.,]+)\s*([KM]?)/); if (!m) return -1; return parseFloat(m[1].replace(/,/g, '')) * (m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : 1); } // v2.3.1：fmt 后缀乘回
function capNumOf(s) { const m = s.match(/\/\s*([\d.,]+K?M?)/); if (!m) return -1; const v = m[1]; const mult = v.includes('K') ? 1000 : v.includes('M') ? 1e6 : 1; return Math.round(parseFloat(v.replace(/[KM,]/g, '')) * mult); }
const capB = capNumOf(capBeforeTxt), capA = capNumOf(capAfterTxt);
const ratioOk = Math.abs(capA / capB - 3.5) < 0.02; // (2000+5000)/2000，v2.8.27 capPer 5000
// v2.3.2 断言加固：扣款测量加 cps 产出补偿——400ms 窗口内挂机产出（链内购入后 cps≈13/s → +5 EP）
// 叠加 #h-ep 的 K 格式舍入（±5）会挤爆原 ±10 容差（实测显示价与实扣均为 150，纯测量性问题）
const cpsVal = parseFloat(await page.$eval('#h-cps', el => el.textContent)) || 0;
const deductOk = Math.abs((epBeforeBuy - epAfterBuy) + cpsVal * 0.4 - 450) < 10; // 扣款 =450（v2.8.27 storage base 450）+ 产出回补
rec('R3：购买存储节点 → 上限×3.5（2000→7000，v2.8.27 capPer 5000）+ 扣款 450（含 cps 产出补偿）', bought === 'clicked' && ratioOk && deductOk,
  `${capBeforeTxt} → ${capAfterTxt}（cap比=${(capA / capB).toFixed(2)}，扣款=${(epBeforeBuy - epAfterBuy).toFixed(0)}，cps=${cpsVal}/s）`);

// ---- 6. EP 满仓截断（D1）：点击至溢出，EP 不超过上限 ----
await page.evaluate(() => {
  const hero = document.getElementById('hero');
  for (let i = 0; i < 2000; i++) hero.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 300));
const epNow = await page.$eval('#h-ep', el => el.textContent);
rec('D1：满仓点击不溢出上限', curNumOf(epNow) <= capNumOf(epNow), `EP = ${epNow}`);
await page.evaluate(() => { try { document.getElementById('hero').closest('#app'); localStorage.clear(); } catch (e) {} });

// ---- 7. hover 覆盖率：顶栏统计项 + 图例面板 ----
const legendExists = await page.evaluate(() => !!document.getElementById('wiki-modal'));
rec('v2.8.15 图例移至 Wiki 弹框（#wiki-modal 存在）', legendExists);
const hoverStats = await page.evaluate(() => {
  const stats = [...document.querySelectorAll('.stat')];
  return { total: stats.length, withTitle: stats.filter(s => (s.title || '').length > 10).length };
});
rec('顶栏统计项 100% 带 hover 说明', hoverStats.total > 0 && hoverStats.withTitle === hoverStats.total, `${hoverStats.withTitle}/${hoverStats.total}`);
const techRp = await page.evaluate(() => !!document.getElementById('tech-rp'));
rec('科技树页头常显 RP', techRp);

// ---- 8. P2 单屏布局：1920×1080 无纵向滚动 ----
const layout = await page.evaluate(() => ({
  scrollH: document.documentElement.scrollHeight,
  innerH: window.innerHeight,
  bodyScrollH: document.body.scrollHeight,
}));
rec('P2：1920×1080 单屏无纵向滚动', layout.scrollH <= layout.innerH + 2, `scrollHeight=${layout.scrollH} vs innerHeight=${layout.innerH}`);

// ---- 9. v2.1.1 两点修复集成验证（注入存档：活动裂隙 + 高产出线程触顶） ----
const page2 = await browser.newPage();
await page2.setViewport({ width: 1920, height: 1080 });
const errs2 = [];
page2.on('pageerror', (e) => errs2.push(String(e)));
// 在页面脚本执行前注入存档（绕开 beforeunload 的 save 覆盖）：
// EP 500 + 活动裂隙（封印价 100）+ 10 条 output=100 线程（cps≈1000/s，必然触顶）
await page2.evaluateOnNewDocument(() => {
  const cultists = [];
  for (let i = 0; i < 10; i++) cultists.push({ name: 'T' + i, output: 100, mood: '正常', moodTimer: 999 });
  localStorage.setItem('abyss_idle_v2', JSON.stringify({
    ep: 500, lastSeen: Date.now(), cultists,
    activeRift: { power: 1, sealCost: 100, dmReward: 1, expiresAt: Date.now() + 120000 },
  }));
});
await page2.goto(url, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1500));
rec('v2.1.1：注入档加载无 JS 报错且裂隙卡片渲染', errs2.length === 0 && await page2.$('#seal-rift') !== null, errs2.join('; '));
// P1-A：点击封印 → 卡片应在下一帧（≤500ms）消失
await page2.click('#seal-rift');
await new Promise(r => setTimeout(r, 500));
const riftGone = await page2.evaluate(() => {
  const panel = document.getElementById('rift-panel');
  const card = document.getElementById('rift-card');
  return (!panel || panel.children.length === 0) && (!card || card.style.display === 'none');
});
rec('P1-A：封印后裂隙卡片立即消失（≤500ms，无残留）', riftGone, `panel children=${await page2.evaluate(() => document.getElementById('rift-panel')?.children.length)}, card display=${await page2.evaluate(() => document.getElementById('rift-card')?.style.display)}`);
// P1-B：线程产出触顶 1000 → 溢出转腐化（数值：corruption-num > 0）
await new Promise(r => setTimeout(r, 4000));
const corruptionTxt = await page2.evaluate(() => document.getElementById('corruption-num')?.textContent || '');
const corruptionVal = parseFloat(corruptionTxt);
rec('P1-B：触顶挂机不产腐化（v2.8.21：EP 触顶溢出只转 RP，腐化=0）', corruptionVal === 0, `腐化 = ${corruptionTxt}（4s 实测）`);
// 触顶期间 EP 仍被截断在上限内（先加后截不破坏上限约束）
const epCapped = await page2.$eval('#h-ep', el => el.textContent);
rec('P1-B：触顶期间 EP 仍受上限截断', curNumOf(epCapped) <= capNumOf(epCapped) * 1.001, `EP = ${epCapped}`);
await page2.evaluate(() => localStorage.clear());

await browser.close();

const fails = results.filter(r => !r.ok).length;
console.log(`\n浏览器验证结果：${results.length - fails} 通过，${fails} 失败`);
process.exit(fails > 0 ? 1 : 0);
