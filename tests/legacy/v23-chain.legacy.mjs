import { chromePath } from '../_chrome.mjs';
// v2.3.1 渐进披露链 E2E 断言（rev18 9.3/9.4 口径重写）：
// 窗口 K = p + 1（新档任意模块同屏未购项恒 1）；展开交互与 more-btn 全移除；
// ② 分区锚点门控（深渊商店←DM 锚点、效能建筑/族升级←RP 锚点、设施←里程碑）；
// v2.3.2 §5.2（hotfix）：链提示整体废除——无可购卡携带「购入前一项解锁」文本，
// .chain-hint 全页零残留，锁定感由 ??? 预览卡（无购买入口）承担。
// 纯函数语义（chainSplit K=p+1 / 锚点判定 / 分组渲染器）见 v23-chain-pure.test.mjs。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const CLEAN = () => {
  localStorage.removeItem('abyss_idle_v2');
  localStorage.removeItem('v21_migrated_toast');
  localStorage.removeItem('abyss_v2_expand');
};

// ===== 场景 A：新档首屏（rev18 9.3：任意模块同屏未购项恒 1；② 锚点门控全隐藏） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(CLEAN);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => {
    const q = (sel) => document.querySelectorAll(sel).length;
    const vis = (id) => (document.getElementById(id)?.style.display || '') !== 'none';
    return {
      shop: q('#shop-list .item'), thread: q('#thread-shop .item'), veh: q('#vehicle-shop .item'),
      dm: q('#dm-shop .item'), v21: q('#v21-building-list .item'), fam: q('#family-upgrade-list .item'),
      bld: q('#building-list .item'), eternal: q('#eternal-list .tech'),
      shopHint: q('#shop-list .chain-hint'), docHint: q('.chain-hint'), bulkBar: q('#tab-shop .bulk-bar'),
      moreBtns: q('.more-btn'),
      dmTitleShown: vis('dm-shop-title'), v21TitleShown: vis('v21-title'), famTitleShown: vis('family-upgrade-title'), bldTitleShown: vis('bld-title'),
      vehTitleShown: (document.querySelector('h3')?.textContent || '').length > 0,
    };
  });
  rec('A1 9.3：shop 新档首屏 1 项（K=p+1，p=0）', c.shop === 1, JSON.stringify(c.shop));
  // v2.5 ①：探采平台改裂隙门控——新档（未触发裂隙）载具区整节隐藏
  // v2.8.4 ③：ES 未解锁（首次晋升前）永恒矩阵整节隐藏——升级项不早于资源显示
  rec('A2 9.3：thread 新档首屏 1 项，vehicles 隐藏，eternal 隐藏（ES 未解锁）', c.thread === 1 && c.veh === 0 && c.eternal === 0, JSON.stringify({ thread: c.thread, veh: c.veh, eternal: c.eternal }));
  rec('A3 9.2：深渊商店/效能建筑/族升级/设施 新档整节隐藏（锚点门控）', c.dm === 0 && c.v21 === 0 && c.fam === 0 && c.bld === 0 && !c.dmTitleShown && !c.v21TitleShown && !c.famTitleShown && !c.bldTitleShown, JSON.stringify({ dm: c.dm, v21: c.v21, fam: c.fam, bld: c.bld }));
  rec('A4 9.2（v2.5 ①）：探采平台开局隐藏——裂隙触发前无载具条目', c.veh === 0, String(c.veh));
  rec('A5 §5.2：链提示废除——新档全页 .chain-hint 零残留', c.shopHint === 0 && c.docHint === 0, JSON.stringify({ shop: c.shopHint, doc: c.docHint }));
  rec('A6 ⑤：全页无 more-btn（展开交互移除）', c.moreBtns === 0, String(c.moreBtns));
  rec('A7 ⑥：bulk-bar 倍率条不在 DOM', c.bulkBar === 0, String(c.bulkBar));
  rec('A8 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 B：已购前 2 项（K = p+1 = 3；链提示挂链内下一项且前置已购） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.removeItem('abyss_v2_expand');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default',
      ep: 1e4, rp: 0, upgrades: { scribble: 1, script: 1 }, milesDone: {}, tech: {},
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-list .item')];
    const third = cards[2] || null;
    return {
      hintCount: document.querySelectorAll('#shop-list .chain-hint').length,
      hintText: document.querySelector('#shop-list .chain-hint')?.textContent?.trim() || null,
      hintTextAnywhere: cards.filter(e => e.textContent.includes('购入前一项解锁')).length,
      thirdName: third ? (third.querySelector('.name')?.textContent || '').replace(/×\d+$|Lv\.\d+\/\d+$/g, '').trim() : null,
      thirdBuy: third ? (third.dataset.buy || null) : null,
      thirdLocked: third ? third.classList.contains('locked') : null,
      shopItems: cards.length,
      firstOwned: [...document.querySelectorAll('#shop-list .item .name')].slice(0, 2).map(e => e.textContent.trim()),
    };
  });
  rec('B1 §5.2：链提示废除——.chain-hint 零残留、无卡片携带「购入前一项解锁」文本', c.hintCount === 0 && c.hintText === null && c.hintTextAnywhere === 0, JSON.stringify({ hintCount: c.hintCount, anywhere: c.hintTextAnywhere }));
  rec('B2 v2.8.1：链内下一项（第 3 项「存储节点」——按解锁门槛 base 升序）为真实可购卡（data-buy、非 locked）', c.thirdName === '存储节点' && c.thirdBuy === 'storage' && c.thirdLocked === false, JSON.stringify({ name: c.thirdName, buy: c.thirdBuy, locked: c.thirdLocked }));
  rec('B3 断言3（可测化）：提示项前缀已购（前 2 项 = 草稿记录/自动化脚本 已购）', c.firstOwned[0] === '草稿记录×1' && c.firstOwned[1] === '自动化脚本×1', JSON.stringify(c.firstOwned));
  rec('B4 9.3：已购 ∪ 窗口 K = p+1 = 3', c.shopItems === 3, String(c.shopItems));
  rec('B5 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 C：展开交互移除（⑤：abyss_v2_expand 加载时清除、不再有任何写入点） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    // 预埋历史展开态：9.6 口径——加载时清除、不迁移
    localStorage.setItem('abyss_v2_expand', JSON.stringify({ shop: 8, v21: 12 }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    store: localStorage.getItem('abyss_v2_expand'),
    shop: document.querySelectorAll('#shop-list .item').length,
    more: document.querySelectorAll('.more-btn').length,
  }));
  rec('C1 9.6：预埋 abyss_v2_expand 加载后清除（null）', c.store === null, String(c.store));
  rec('C2 预埋展开态不影响窗口（仍 K=p+1=1）', c.shop === 1, String(c.shop));
  rec('C3 全页无展开按钮（more-btn 0）', c.more === 0, String(c.more));
  rec('C4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 D：全购旧档全放行（已购 ∪ 窗口，hiddenCount=0，无按钮无提示） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  const allIds = [...readFileSync('src/data/upgrades.js', 'utf-8').matchAll(/id:'([^']+)'/g)].map(m => m[1]);
  await page.evaluateOnNewDocument((ids) => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.removeItem('abyss_v2_expand');
    const upg = {};
    for (const id of ids) upg[id] = 1;
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 0, upgrades: upg, milesDone: {}, tech: {},
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  }, allIds);
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    items: document.querySelectorAll('#shop-list .item').length,
    more: document.querySelectorAll('#shop-list .more-btn').length,
    hint: document.querySelectorAll('#shop-list .chain-hint').length,
  }));
  rec('D1 全购旧档：无展开按钮', c.more === 0, JSON.stringify(c));
  rec('D2 全购旧档：全部已购项可见（shop 区全量 50）', c.items >= 50, String(c.items));
  rec('D3 §5.2：链提示废除——全购旧档零残留', c.hint === 0, String(c.hint));
  rec('D4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 E：v21 效能建筑（已解锁首楼 → K=2；分组标题随组渲染） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.removeItem('abyss_v2_expand');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 100, upgrades: {}, milesDone: {}, tech: {},
      unlockedBuildings: { warmup_node: true }, buildings: { warmup_node: 0 },
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: true, es: false, faith: false, pt: false, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    cards: document.querySelectorAll('#v21-building-list .item').length,
    more: document.querySelectorAll('#v21-building-list .more-btn').length,
    hint: document.querySelectorAll('#v21-building-list .chain-hint').length,
    lockCards: document.querySelectorAll('#v21-building-list .lock-card').length,
    lockCardsWithBuy: [...document.querySelectorAll('#v21-building-list .lock-card')].filter(e => e.dataset.buy !== undefined).length,
    groups: [...document.querySelectorAll('#v21-building-list .group-title')].map(e => e.textContent),
    titleShown: (document.getElementById('v21-title')?.style.display || '') !== 'none',
  }));
  rec('E1 9.3：v21 已解锁 1 楼 ⟹ K = p+1 = 2（已购 ∪ 窗口）', c.cards === 2, String(c.cards));
  rec('E2 §5.2：v21 链提示零残留 + ??? 预览卡（lock-card）无购买按钮', c.hint === 0 && c.lockCards >= 1 && c.lockCardsWithBuy === 0, JSON.stringify(c));
  rec('E3 v21 无展开按钮', c.more === 0, String(c.more));
  rec('E4 ⑤：cat 分组标题随组渲染（组内可见 0 项整组不渲染）', c.groups.length >= 1 && c.groups.length <= 2, JSON.stringify(c.groups));
  rec('E5 ②：RP 锚点已持久 ⟹ 效能建筑分区可见', c.titleShown, String(c.titleShown));
  rec('E6 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 F：eternal 永恒矩阵（已购首项 → K=2，无展开按钮） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.removeItem('abyss_v2_expand');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 0, es: 500, prestigePoints: 5, eternal: { eff: 1 },
      upgrades: {}, milesDone: {}, tech: {},
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    cards: document.querySelectorAll('#eternal-list .tech').length,
    more: document.querySelectorAll('#eternal-list .more-btn').length,
    hint: document.querySelectorAll('#eternal-list .chain-hint').length,
    previewCards: [...document.querySelectorAll('#eternal-list .tech')].filter(e => e.dataset.eternal === undefined).length,
    previewWithBuyAttr: [...document.querySelectorAll('#eternal-list .tech')].filter(e => e.dataset.eternal === undefined && (e.dataset.buy !== undefined || e.dataset.tech !== undefined)).length,
  }));
  rec('F1 9.3：eternal 已购首项 ⟹ K = p+1 = 2', c.cards === 2, String(c.cards));
  rec('F2 §5.2：eternal 链提示零残留 + ??? 预览卡无购买入口', c.hint === 0 && c.previewCards === 1 && c.previewWithBuyAttr === 0, JSON.stringify(c));
  rec('F3 eternal 无展开按钮', c.more === 0, String(c.more));
  rec('F4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 G：七模块接入完整性（源码断言：渲染函数均调用 chainSplit） =====
{
  const shop = readFileSync('src/modules/shop.js', 'utf-8');
  const tech = readFileSync('src/modules/tech.js', 'utf-8');
  const fns = ['renderShop', 'renderThreadShop', 'renderVehicles', 'renderDmShop', 'renderOfflineUpgrades', 'renderV21Buildings'];
  let n = 0;
  for (const fn of fns) {
    const body = shop.slice(shop.indexOf(`function ${fn}`), shop.indexOf('function', shop.indexOf(`function ${fn}`) + 10));
    if (body.includes('chainSplit(')) n++;
  }
  rec('G1 shop.js 六渲染函数全部接入 chainSplit', n === 6, `n=${n}`);
  rec('G2 tech.js renderEternal 接入 chainSplit', tech.slice(tech.indexOf('function renderEternal')).includes('chainSplit('), '');
  rec('G3 §5.2：链提示废除——shop/tech 源码 attachChainHint 与提示文案零引用，CHAIN_PREVIEW 预览文案保留',
    !shop.includes('attachChainHint') && !tech.includes('attachChainHint')
    && !shop.includes('购入前一项解锁') && !tech.includes('购入前一项解锁')
    && shop.includes('CHAIN_PREVIEW') && tech.includes('CHAIN_PREVIEW'), '');
  const idx = readFileSync('index.html', 'utf-8');
  rec('G4 ⑤：index.html 规则文案已删且无「展开更多」字样', !idx.includes('建筑驱动 · 科技是钥匙') && !idx.includes('展开更多'), '');
  rec('G5 ⑥：index.html 无 ×10/×100 按钮与 bulk-bar', !idx.includes('bulk-10') && !idx.includes('bulk-100') && !idx.includes('class="bulk-bar"'), '');
}

await browser.close();
const fail = results.filter(r => !r.ok).length;
console.log(`\n[v23-chain] ${results.length - fail}/${results.length} 项通过`);
process.exit(fail ? 1 : 0);
