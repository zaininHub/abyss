// v2.3.1 缺陷修复断言套件（用户七项反馈之 ③④⑦，组长派发：复现→修复→断言锁定）
// ③ EP 满上限后「本局」不再上涨（钳后记账，与 addEp 同口径；腐化/溢出池机制不变）
// ④ 清档按钮失效（resetGuard 阻断 beforeunload/自动保存回写；展开态一并回收）
// ⑦ 链提示挂错对象（shop/thread/vehicles 链序改定义序；真实点击验证链推进）
// 运行前提：npm run build 已产出最新 dist（本套件走 file:// 真实浏览器实跑）
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const EV = process.cwd() + '/../../artifacts/v231-evidence';
mkdirSync(EV, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const saveBase = (over = {}) => ({
  _version: 6, chapter: '1', storyline: 'default',
  ep: 1000, rp: 0, runEarned: 500, allTimeEp: 5000,
  upgrades: {}, milesDone: {}, tech: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(),
  ...over,
});

// ===== ⑦-A：用户截图场景（scribble×15 + script×1）——链序 = 定义序，提示挂真链下一项 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const save = saveBase({ upgrades: { scribble: 15, script: 1 } });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-list .item')];
    const nameOf = (el) => (el.querySelector('.name')?.textContent || '').replace(/×\d+|Lv\.\d+\/\d+/g, '').trim();
    const nextCard = cards.find(el => nameOf(el) === '存储节点');
    return {
      order: cards.slice(0, 5).map(nameOf),
      hintCount: document.querySelectorAll('.chain-hint').length,
      hintTextAnywhere: cards.filter(el => el.textContent.includes('购入前一项解锁')).length,
      nextBuy: nextCard ? nextCard.dataset.buy || null : null,
      nextLocked: nextCard ? nextCard.classList.contains('locked') : null,
    };
  });
  rec('⑦A1 v2.8.1：显示序 = 解锁门槛升序且窗口 K=p+1（已购2 → 前3=草稿记录→自动化脚本→存储节点）',
    c.order.slice(0, 3).join(',') === '草稿记录,自动化脚本,存储节点', JSON.stringify(c.order));
  rec('⑦A2 §5.2 链提示废除：全页 .chain-hint 零残留、无卡片携带提示文本',
    c.hintCount === 0 && c.hintTextAnywhere === 0, `hintCount=${c.hintCount}`);
  rec('⑦A3 v2.8.1：链内下一项「存储节点」为真实可购卡（data-buy、非 locked）——锁定感由预览卡承担',
    c.nextBuy === 'storage' && c.nextLocked === false, JSON.stringify({ nextBuy: c.nextBuy, nextLocked: c.nextLocked }));
  rec('⑦A4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.screenshot({ path: EV + '/q7-A-order-fixed.png' });
  await page.close();
}

// ===== ⑦-B：真实点击复现链推进（购入链提示项「并行任务」→ 提示移至「存储节点」） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const save = saveBase({ upgrades: { scribble: 15, script: 1 } });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const before = await page.evaluate(() => ({
    ep: document.getElementById('h-ep')?.textContent || '',
  }));
  // v2.8.1：真实点击链提示项（存储节点，成本 150 ≤ EP 1000）
  const clicked = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#shop-list .item')].find(el => (el.querySelector('.name')?.textContent || '').includes('存储节点') && !el.classList.contains('locked'));
    if (!card) return null;
    card.click();
    return card.dataset.buy || null;
  });
  await sleep(1500); // 购后 p 推进 → 下个 tick 整面板重入刷新链窗口
  const after = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-list .item')];
    const nameOf = (el) => (el.querySelector('.name')?.textContent || '').replace(/×\d+|Lv\.\d+\/\d+/g, '').trim();
    const storage = cards.find(el => nameOf(el) === '存储节点');
    return {
      storageCount: storage ? (storage.querySelector('.name')?.textContent || '') : null,
      nextVisible: cards.some(el => nameOf(el) === '备用粮仓'),
      hintCount: document.querySelectorAll('.chain-hint').length,
    };
  });
  rec('⑦B1 v2.8.1 真实点击链提示项（dataset.buy=storage）', clicked === 'storage', String(clicked));
  rec('⑦B2 购入成功：存储节点 ×1', /存储节点×1/.test(after.storageCount || ''), String(after.storageCount));
  rec('⑦B3 v2.8.1 链正常推进：按门槛升序揭示下一卡「备用粮仓」（base 800 在 storage 150 与 parallel 900 之间）且链提示零残留', after.nextVisible && after.hintCount === 0, `next=${after.nextVisible}`);
  rec('⑦B4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.screenshot({ path: EV + '/q7-B-chain-advanced.png' });
  await page.close();
}

// ===== ⑦-C：成本上浮漂移场景（scribble×40，已购成本 2.68K 上浮）——链序仍稳定 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const save = saveBase({ ep: 1e6, upgrades: { scribble: 40, script: 1 } });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-list .item')];
    const nameOf = (el) => (el.querySelector('.name')?.textContent || '').replace(/×\d+|Lv\.\d+\/\d+/g, '').trim();
    const nextCard = cards.find(el => nameOf(el) === '存储节点');
    return {
      first: cards[0] ? nameOf(cards[0]) : null,
      order: cards.slice(0, 4).map(nameOf),
      nextBuy: nextCard ? nextCard.dataset.buy || null : null,
      hintCount: document.querySelectorAll('.chain-hint').length,
    };
  });
  rec('⑦C1 已购高浮项不漂移：第 1 项仍「草稿记录」（修复前漂至队尾）', c.first === '草稿记录', JSON.stringify(c.order));
  rec('⑦C2 v2.8.1 真链下一项「存储节点」为可购卡且链提示零残留', c.nextBuy === 'storage' && c.hintCount === 0, `nextBuy=${c.nextBuy}`);
  rec('⑦C3 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== ⑦-D：thread / vehicles 链序同口径（定义序 + 提示挂点） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const save = saveBase({ ep: 1e6, upgrades: { subsist1: 1, scooter: 1 } });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => {
    const threadCards = [...document.querySelectorAll('#thread-shop .item')];
    const vehCards = [...document.querySelectorAll('#vehicle-shop .item')];
    const nameOf = (el) => (el.querySelector('.name')?.textContent || '').replace(/×\d+|Lv\.\d+\/\d+/g, '').trim();
    const tNext = threadCards[1] || null;
    const vNext = vehCards[1] || null;
    return {
      threadFirst: threadCards[0] ? (threadCards[0].querySelector('.name')?.textContent || '') : null,
      threadCount: threadCards.length,
      threadNextBuy: tNext ? (tNext.dataset.buy || null) : null,
      vehNextBuy: vNext ? (vNext.dataset.buy || null) : null,
      vehNextName: vNext ? nameOf(vNext) : null,
      vehNextLocked: vNext ? vNext.classList.contains('locked') : null,
      vehFirstOwned: vehCards[0] ? nameOf(vehCards[0]) : null,
      hintCount: document.querySelectorAll('.chain-hint').length,
    };
  });
  rec('⑦D1 thread 首项「能量合剂满」（定义序，已购 subsist1 不漂移；v2.7.2 消耗升级一次性 maxLevel:1 → Lv.1/1 满）', /能量合剂Lv\.1\/1 满/.test(c.threadFirst || ''), String(c.threadFirst));
  rec('⑦D2 thread 链内下一项在第 2 位（K=p+1=2；??? 预览卡承担锁定感）且链提示零残留', c.threadCount === 2 && c.threadNextBuy !== null && c.hintCount === 0, JSON.stringify({ count: c.threadCount, buy: c.threadNextBuy }));
  rec('⑦D3 vehicles 已购 scooter 首位 + 链内下一项为可购卡（??? 卡无购买入口）', c.vehFirstOwned === '外勤摩托队' && c.vehNextBuy !== null && c.vehNextLocked === false, JSON.stringify({ first: c.vehFirstOwned, next: c.vehNextName, buy: c.vehNextBuy }));
  rec('⑦D4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== ③-A：EP 满上限后「本局」不再上涨（tick 多轮断言） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  // ep=2000 = 基础 cap（无存储/缓存加成）；scribble×50 提供 cps>0；runEarned=500 锚点
  const save = saveBase({ ep: 2000, runEarned: 500, allTimeEp: 5000, upgrades: { scribble: 50 }, corruption: 0 });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const s0 = await page.evaluate(() => ({
    run: document.getElementById('h-run')?.textContent || '',
    ep: document.getElementById('h-ep')?.textContent || '',
    st: JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'),
  }));
  await sleep(3000); // tick 多轮（100ms/轮 ≈ 30 轮，cps≈5/s → 未修复时应 +15EP）
  const s1 = await page.evaluate(() => ({
    run: document.getElementById('h-run')?.textContent || '',
    ep: document.getElementById('h-ep')?.textContent || '',
    st: JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'),
  }));
  const run0 = parseFloat(s0.st.runEarned), run1 = parseFloat(s1.st.runEarned);
  rec('③A1 满上限后「本局」不再变化（500 锚点保持）', Math.abs(run1 - run0) < 1e-6 && Math.abs(run0 - 500) < 1, `${run0} → ${run1}`);
  rec('③A2 EP 钳在上限（2000/2000）', Math.abs(parseFloat(s1.st.ep) - 2000) < 1, String(s1.st.ep));
  rec('③A3 溢出池机制保留：epOverflowTotal 仍在增长', (s1.st.epOverflowTotal || 0) > (s0.st.epOverflowTotal || 0), `${s0.st.epOverflowTotal || 0} → ${s1.st.epOverflowTotal || 0}`);
  rec('③A4 顶栏「本局」显示稳定（2.01K 量级修复前会持续上漂）', s0.run === s1.run, `${s0.run} → ${s1.run}`);
  rec('③A5 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.screenshot({ path: EV + '/q3-fullcap-run-frozen.png' });
  await page.close();
}

// ===== ③-B：未满上限场景「本局」正常累计（防误伤回归） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const save = saveBase({ ep: 100, runEarned: 0, upgrades: { scribble: 50 }, corruption: 0 });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    try { localStorage.clear(); } catch (e) {}
    localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(6500); // 过 5s 自动保存落盘后再读（避免读到注入原值）
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('③B1 未满上限「本局」正常累计（runEarned > 0 且 < cap）', (s.runEarned || 0) > 0 && (s.runEarned || 0) < 2000, String(s.runEarned));
  rec('③B2 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== ④：清档真实点击——存档清空 + 回到新档首屏（防回归断言） =====
// 注档用 sessionStorage 一次性守卫：evaluateOnNewDocument 在 reload 后的第二个文档
// 会重新执行，直接注档会把旧档「复活」污染清档后观察；sessionStorage 同标签页跨
// reload 存续，保证只在第一个文档注入（游戏以旧档冷启动），reset 触发的 reload 后
// 的第二个文档不再注入 → 新档首屏的观察干净。
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const save = saveBase({ ep: 1234, runEarned: 321, upgrades: { scribble: 7, script: 2 } });
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`
    if (!sessionStorage.getItem('__v231_injected')) {
      sessionStorage.setItem('__v231_injected', '1');
      try { localStorage.clear(); } catch (e) {}
      localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
      localStorage.setItem('abyss_v2_expand', JSON.stringify({ shop: 8 }));
    }
  `));
  await page.goto(BASE, { waitUntil: 'networkidle0' }); // 旧档冷启动（模拟真实玩家进游戏）
  await sleep(1200);
  const pre = await page.evaluate(() => ({
    ep: document.getElementById('h-ep')?.textContent || '',
    shopItems: document.querySelectorAll('#shop-list .item').length,
  }));
  rec('④0 前置：旧档已加载（EP 1.23K 量级 / 窗口 K=p+1=3；预埋展开态已被 ⑤ 加载清除）', /1\.2\dK/.test(pre.ep) && pre.shopItems === 3, `ep=${pre.ep} items=${pre.shopItems}`);
  // 真实点击清档按钮（confirm 放行），点击后同步读 localStorage（reload 前的窗口期）
  const sync = await page.evaluate(() => {
    window.confirm = () => true;
    document.getElementById('reset-btn')?.click();
    return {
      saveNow: localStorage.getItem('abyss_idle_v2'),
      expandNow: localStorage.getItem('abyss_v2_expand'),
    };
  });
  rec('④1 点击后（reload 前）存档已清空', sync.saveNow === null, String(sync.saveNow)?.slice(0, 40));
  rec('④2 展开态一并回收（abyss_v2_expand 清空）', sync.expandNow === null, String(sync.expandNow));
  // 等 reload 完成，验证 beforeunload 未回写旧档、页面回到新档首屏
  await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' }).catch(() => {});
  await sleep(1500);
  const after = await page.evaluate(() => ({
    save: localStorage.getItem('abyss_idle_v2'),
    ep: document.getElementById('h-ep')?.textContent || '',
    run: document.getElementById('h-run')?.textContent || '',
    shopItems: document.querySelectorAll('#shop-list .item').length,
  }));
  const st = after.save ? JSON.parse(after.save) : null;
  const oldLeak = st && (Math.abs(st.ep - 1234) < 1 || (st.upgrades && st.upgrades.scribble === 7));
  rec('④3 reload 后旧档未被 beforeunload 回写（修复根因断言）', !oldLeak, JSON.stringify({ ep: st?.ep, scribble: st?.upgrades?.scribble }));
  rec('④4 v2.8.1 回到新档首屏（EP 0 起始 / 本局 0）', after.ep === '0' || after.ep.startsWith('0') && !after.ep.startsWith('0.'), `ep=${after.ep} run=${after.run}`);
  rec('④5 新档首屏商店回到 K=p+1=1 项窗口（展开交互已移除、展开态已回收）', after.shopItems === 1, String(after.shopItems));
  rec('④6 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.screenshot({ path: EV + '/q4-after-reset-fresh.png' });
  await page.close();
}

await browser.close();
const fail = results.filter(r => !r.ok);
console.log(`\n=== v2.3.1 修复断言：${results.length - fail.length}/${results.length} 通过 ===`);
if (fail.length) {
  console.log('失败项：', fail.map(f => f.name).join(' | '));
  process.exit(1);
}
