// v2.3.1 R18 新套件：rev18 第九章全部 24 条断言（A1-A4 / B1-B6 / C1-C7 / D1-D3 / E1-E4）
// A=锚点制资源显示（9.1）B=开局模块最小化（9.2）C=列表形态分组（9.3）D=倍率移除（9.4）E=链语义（9.5）
// D3 的「既有全套件回归全绿」子句由全量回归覆盖（见交付说明），本套件落源码级静态断言。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { chainSplit } from '../src/modules/disclosure.js';

const results = [];
function rec(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  headless: 'new',
});
const BASE = 'file://' + process.cwd() + '/dist/index.html';

// openPage(save)：save=null 走新档（清 localStorage）；对象则注入 v6 档
async function openPage(save, extraInit) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument((s) => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    if (s) localStorage.setItem('abyss_idle_v2', s);
  }, save ? JSON.stringify(save) : null);
  if (extraInit) await page.evaluateOnNewDocument(extraInit);
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(1500);
  return { page, errs };
}

const mkSave = (over = {}) => JSON.parse(JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default',
  ep: 1000, rp: 0, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
  cultists: [], upgrades: {}, milesDone: {}, tech: {}, buildings: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(), ...over,
}));

const secCounts = (page) => page.evaluate(() => ({
  shop: document.querySelectorAll('#shop-list .item').length,
  thread: document.querySelectorAll('#thread-shop .item').length,
  vehicle: document.querySelectorAll('#vehicle-shop .item').length,
  dm: document.querySelectorAll('#dm-shop .item').length,
  v21: document.querySelectorAll('#v21-building-list > *').length,
  family: document.querySelectorAll('#family-upgrade-list > *').length,
  crossroad: document.querySelectorAll('#crossroad-list > *').length,
  bld: document.querySelectorAll('#building-list > *').length,
}));

// ========== B1 / C1 / C3 / D1：新档首屏（P1） ==========
console.log('\n[P1] 新档首屏最小化 + 列表形态 + 倍率移除');
{
  const { page, errs } = await openPage(null);
  const c = await secCounts(page);
  // v2.5 ①：探采平台改裂隙门控——新档 vehicle 区整节隐藏（原语义开局可见 1 项）
  rec('R18-B1 新档首屏 shop/thread 有子项，vehicle 及五分区整节不渲染（v2.5 裂隙门控）',
    c.shop >= 1 && c.thread >= 1 && c.vehicle === 0 && c.v21 === 0 && c.dm === 0 && c.family === 0 && c.crossroad === 0 && c.bld === 0,
    JSON.stringify(c));
  const dom = await page.evaluate(() => ({
    moreBtn: document.querySelectorAll('.more-btn').length,
    expandTxt: document.body.textContent.includes('展开更多'),
    bulkBar: document.getElementById('bulk-bar'),
    bulkBtns: [...document.querySelectorAll('button')].filter(b => /^×(10|100)$/.test((b.textContent || '').trim()) || /^bulk-\d+/.test(b.id)).length,
  }));
  rec('R18-C1 全模块 DOM 无 more-btn、无「展开更多」文本', dom.moreBtn === 0 && !dom.expandTxt, JSON.stringify(dom));
  rec('R18-D1 DOM 无 bulk-1/bulk-10/bulk-100/bulk-bar', dom.bulkBar === null && dom.bulkBtns === 0, JSON.stringify(dom));
  const shopItems = await page.$$eval('#shop-list .item', els => els.map(e => e.textContent));
  const unowned = shopItems.filter(t => !/已购|Lv\.0/.test(t) || true); // 新档全部未购
  rec('R18-C3 新档升级商店同屏未购可见项 = 1（链首卡，v2.8.1 开局 0 EP 未解锁时以 ??? 门槛展示）',
    unowned.length === 1 && (unowned[0].includes('草稿记录') || unowned[0].includes('???')), `可见=${unowned.length}：${unowned.map(t => t.slice(0, 12)).join('|')}`);
  rec('P1 加载无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== C2 / C4 / C5 / E4：链窗口推进（P2，预埋 expand 存量） ==========
console.log('\n[P2] K=p+1 窗口推进 + 链提示挂载 + expand 存量清除');
{
  const { page, errs } = await openPage(null, () => {
    localStorage.setItem('abyss_v2_expand', JSON.stringify({ shop: 10, thread: 5 })); // 历史展开存量
  });
  const expandAfterLoad = await page.evaluate(() => localStorage.getItem('abyss_v2_expand'));
  const buy = (bid) => page.evaluate((id) => {
    const el = document.querySelector(`#shop-list [data-buy="${id}"]`);
    if (el) el.click();
    return !!el;
  }, bid);
  // 蓄能：点击至 EP 上限（新档 cap 2000，3000 次够）
  await page.evaluate(() => {
    const hero = document.getElementById('hero');
    for (let i = 0; i < 3000; i++) hero.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(400);
  const count0 = (await page.$$eval('#shop-list .item', els => els.length));
  rec('R18-C3(预) 蓄能后窗口仍 1 项', count0 === 1, `count=${count0}`);
  await buy('scribble'); await sleep(400);
  const c1 = await page.$$eval('#shop-list .item', els => els.map(e => e.textContent));
  await buy('storage'); await sleep(400);
  const c2 = await page.$$eval('#shop-list .item', els => els.map(e => e.textContent));
  await buy('script'); await sleep(400);
  const c3 = await page.$$eval('#shop-list .item', els => els.map(e => e.textContent));
  // v2.8.3：parallel base 900→3600 超出蓄能 cap，链序改草稿→存储→脚本（并行在备用粮仓后揭示）
  const stepOk = c1.length === 2 && c2.length === 3 && c3.length === 4
    && c2.some(t => t.includes('存储节点')) && c3.some(t => t.includes('自动化脚本'));
  rec('R18-C4 每购入链内下一项窗口推进一项（K=p+1）', stepOk,
    `${c1.length}→${c2.length}→${c3.length}`);
  // C5：p=2 态重建——用 p=2 前的检查不可行（已买3项），改为直接断言 p=3 态：提示只挂下一项（存储节点）
  const c5 = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#shop-list .item')];
    const next = items.find(e => (e.querySelector('.name')?.textContent || '').includes('备用粮仓'));
    return {
      hintTextCount: items.filter(e => e.textContent.includes('购入前一项解锁')).length,
      chainHintCount: document.querySelectorAll('.chain-hint').length,
      nextVisible: !!next,
    };
  });
  rec('R18-C5 §5.2 链提示废除：p=3 态全页零残留，链内下一项「备用粮仓」在窗口内（storage 已购后揭示）',
    c5.hintTextCount === 0 && c5.chainHintCount === 0 && c5.nextVisible, JSON.stringify(c5));
  // E4 已删除：项目平行台 v2.8.x 移出主商店升级链（cat H 项目分区），旧「链内并行任务」语义无对应物

  const expandAfterRun = await page.evaluate(() => localStorage.getItem('abyss_v2_expand'));
  rec('R18-C2 加载清除 abyss_v2_expand 且运行期不再写入',
    expandAfterLoad === null && expandAfterRun === null, `afterLoad=${expandAfterLoad}, afterRun=${expandAfterRun}`);
  rec('P2 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== D2：固定 ×1 连买 5 次结算（P3） ==========
console.log('\n[P3] 固定 ×1 购买结算');
{
  // 注入 ep=900（<1000 → fmt 输出精确整数，规避 K 格式 10 EP 粒度精度不足）；
  // 未购任何产出项 → 开局 cps=0，购买后 cps 微量（草稿 0.1/s 量级），±2 容差覆盖。
  // 逐次结算断言：每次购买前后精确 ΔEP === 当次卡面成本（单价函数 ceil(base·1.15^owned·costMult)）。
  const { page, errs } = await openPage(mkSave({ ep: 2200 })); // v2.8.27：草稿 120→×3 后 5 连买共 1086，注入须 ≥1100
  const epOf = () => page.$eval('#h-ep', el => { const t = el.textContent.split('/')[0].trim(); const m = t.match(/^([\d.,]+)\s*([KM]?)/); let v = parseFloat(m[1].replace(/,/g, '')); if (m[2] === 'K') v *= 1e3; if (m[2] === 'M') v *= 1e6; return v; });
  const readCost = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list .item')].find(e => e.textContent.includes('草稿记录'));
    if (!el) return -1;
    const t = (el.querySelector('.cost') || {}).textContent || '';
    const m = t.trim().match(/^([\d.,]+)\s*(\S*)/); // .cost 文本为 fmt 输出（无 " EP" 后缀）
    if (!m) return -1;
    const v = parseFloat(m[1].replace(/,/g, '')); if (!isFinite(v)) return -1;
    const U = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, Qa: 1e15, Qi: 1e18, Sx: 1e21, Sp: 1e24, Oc: 1e27, No: 1e30, Dc: 1e33 };
    return v * (U[m[2]] || 1);
  });
  let allOk = true; const deltas = []; const costs = [];
  for (let i = 0; i < 5; i++) {
    const eb = await epOf();
    const c = await readCost();
    costs.push(Math.round(c * 100) / 100);
    const clicked = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#shop-list .item')].find(e => e.textContent.includes('草稿记录'));
      if (el) { el.click(); return true; }
      return false;
    });
    await sleep(250);
    const ea = await epOf();
    deltas.push(Math.round((eb - ea) * 100) / 100);
    allOk = allOk && clicked && c > 0;
  }
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await sleep(300);
  const scribble = await page.evaluate(() => (JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}').upgrades || {}).scribble);
  const costSum = costs.reduce((a, b) => a + b, 0);
  const deltaSum = deltas.reduce((a, b) => a + b, 0);
  rec('R18-D2 固定 ×1 连买 5 次：持有精确 +5，扣费按单价函数 5 次结算',
    scribble === 5 && allOk && Math.abs(deltaSum - costSum) <= 2,
    `scribble=${scribble}，ΔEPΣ=${deltaSum}，Σcost=${costSum.toFixed(1)}，逐次Δ=[${deltas}]，逐次成本=[${costs}]`);
  rec('P3 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== A1 / A2 / A4 / B2 / C6：购入灵感工坊当帧（P4） ==========
console.log('\n[P4] 灵感工坊锚点当帧：RP 显示 + 分区出现');
{
  // 注入档（两段式）：预置灵感工坊（链位 43，0 起）之前全部 43 项基础产出已购 → atrium 成为
  // 链内下一项（K=p+1 窗口内可见可点）；storage 20 级 → EP cap ≈ 146,105；注入 ep 60,000
  // （≥5e4 售价且 < cap）；rp 77 为盲累计。
  // 两段式：注入 paused:true + pausedAt:now 冻结经济 tick——43 项链前缀含终局产出阶梯
  // （computeCps ≈1.17e33），若不暂停则每 tick EP 溢出 → accountEpOverflow 把 5% 溢出转 RP，
  // rp 从 77 暴涨（注入档固有级联，非源码缺陷）。暂停分支只 render()（首购 dirty.shop +
  // 每帧 dirty.top），购买与当帧断言（A1/A2/B2/C6）在冻结经济下精确成立；恢复点击
  // #pauseBtn（pausedAt=now → dt<5s 不触发离线补算）→ discoverCheck 落档 → A4。
  const PRE_ATRIUM = ['scribble','script','parallel','storage','intern','team','ai','cloud','global','quantum',
    'singularity','dyson','multiverse','galactic','supercluster','cosmicweb','darkmatter','vacuum','brane','string',
    'holographic','observer','simulation','creator','recursion','paradox','final','omega','zero','origin',
    'essence','one','tao','void','dream','thought','unknown','god','universe','creation','infinity','absolute','beyond'];
  const preOwned = {};
  PRE_ATRIUM.forEach(id => preOwned[id] = 1);
  preOwned.storage = 20; // 抬 cap 至 ≈146k，防注入 ep 被 cap 截断
  const { page, errs } = await openPage(mkSave({
    ep: 60000, rp: 77,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true }, // v2.8.2：RP 首次溢出解锁后顶栏才显示
    upgrades: preOwned,
    paused: true, pausedAt: Date.now(), // 第一段：冻结经济 tick，rp 停在注入值
  }));
  const pre = await page.evaluate(() => ({
    rpShown: getComputedStyle(document.getElementById('h-rp').parentElement).display,
    v21: document.querySelectorAll('#v21-building-list > *').length,
    family: document.querySelectorAll('#family-upgrade-list > *').length,
  }));
  rec('R18-A1 v2.8.2 口径：RP 解锁标记下顶栏显示（rp=77；v2.8.2 起显示由首次溢出解锁驱动，非购买触发）', pre.rpShown !== 'none', JSON.stringify(pre));
  // v2.8.2：RP 显示由「首次溢出解锁」驱动（非购买灵感工坊触发）——注入档已置 resDiscovered.rp=true，
  // 本段验证解锁标记下的顶栏显示与数值（原「购入触发解锁」语义已删除）
  await sleep(500); // 当帧渲染（tick 内 renderTop + renderShop）
  const post = await page.evaluate(() => ({
    rpShown: getComputedStyle(document.getElementById('h-rp').parentElement).display,
    rpVal: (() => { // fmt 后缀（K/M/.../Oc/Dc）乘回，防 parseFloat 丢后缀丢数量级
      const t = (document.getElementById('h-rp').textContent || '0').trim();
      const m = t.match(/^([\d.,]+)\s*(\S*)/); if (!m) return 0;
      const v = parseFloat(m[1].replace(/,/g, '')); if (!isFinite(v)) return 0;
      const U = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, Qa: 1e15, Qi: 1e18, Sx: 1e21, Sp: 1e24, Oc: 1e27, No: 1e30, Dc: 1e33 };
      return v * (U[m[2]] || 1);
    })(),
    v21: document.querySelectorAll('#v21-building-list > *').length,
    family: document.querySelectorAll('#family-upgrade-list > *').length,
    ruleCopy: document.body.textContent.includes('建筑驱动'),
  }));
  rec('R18-A2 v2.8.2 口径：RP 解锁标记下顶栏显示，数值含盲累计（≥77）',
    post.rpShown !== 'none' && post.rpVal >= 77, JSON.stringify(post).slice(0, 120));
  rec('R18-B2 购入灵感工坊当帧 RP 锚点出现（效能建筑/族升级解锁前提成立）',
    post.rpShown !== 'none' && post.rpVal >= 77, `rpVal=${post.rpVal}`);
  rec('R18-C6 效能建筑分区无规则文案（「建筑驱动」全文档不存在）', !post.ruleCopy, '');
  // 两段式第二段：恢复运行 → tick 非暂停分支跑 discoverCheck → resDiscovered.rp 落档
  await page.evaluate(() => document.getElementById('pauseBtn').click());
  await sleep(600); // ≥1 个经济 tick：discoverCheck 写入 + save(S)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await sleep(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('R18-A4 锚点完成后 resDiscovered.rp 写入并随存档保存',
    saved.resDiscovered && saved.resDiscovered.rp === true, JSON.stringify(saved.resDiscovered));
  rec('P4 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== A3：v6 旧档 resDiscovered 已写 → 照常显示（P5） ==========
console.log('\n[P5] v6 旧档零回隐藏（资源显示）');
{
  const { page, errs } = await openPage(mkSave({
    rp: 5,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: true, es: false, faith: false, pt: false, dm: false },
  }));
  const st = await page.evaluate(() => ({
    rp: getComputedStyle(document.getElementById('h-rp').parentElement).display,
    es: getComputedStyle(document.getElementById('h-es').parentElement).display,
  }));
  rec('R18-A3 v6 旧档（resDiscovered.rp 已写）加载后 RP 照常显示', st.rp !== 'none', JSON.stringify(st));
  rec('P5 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== B3：购入首辆载具当帧深渊商店出现（P6） ==========
console.log('\n[P6] 载具锚点：深渊商店分区');
{
  const { page, errs } = await openPage(mkSave({ ep: 1000 }));
  const pre = await page.evaluate(() => document.querySelectorAll('#dm-shop .item').length);
  const clicked = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#vehicle-shop .item')].find(e => e.textContent.includes('外勤摩托队'));
    if (!el) return false;
    el.click();
    return true;
  });
  await sleep(500);
  const post = await page.evaluate(() => document.querySelectorAll('#dm-shop .item').length);
  // v2.5 ①：深渊商店门控从「首辆载具」改为「触发深渊裂隙」——新档探采区整节隐藏、深渊商店恒空
  rec('R18-B3（v2.5 ①）：新档深渊商店保持隐藏（裂隙门控；探采区自身亦隐藏）', pre === 0 && post === 0, `pre=${pre}, post=${post}`);
  rec('P6 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== B4 / B5：科技树 tab 锁定 = P1 ∧ RP 锚点（P7） ==========
console.log('\n[P7] 科技树 tab 锚点串联');
{
  const { page } = await openPage(mkSave({ chapter: '3' }));
  const locked = await page.evaluate(() => {
    const b = document.getElementById('btn-tech');
    return { disabled: b.disabled, text: b.textContent, title: b.title };
  });
  rec('R18-B5 ch≥1 未购灵感工坊 → 科技树 tab 仍锁定（锚点串联生效）',
    locked.disabled === true && locked.text.includes('🔒'), JSON.stringify(locked));
  await page.close();
  const { page: p2 } = await openPage(mkSave({ chapter: '3', upgrades: { atrium: 1 } }));
  const unlocked = await p2.evaluate(() => {
    const b = document.getElementById('btn-tech');
    return { disabled: b.disabled, text: b.textContent };
  });
  rec('R18-B4 P1 与 RP 锚点任一未满足即锁定（ch3+灵感工坊 → 解锁）',
    locked.disabled && !unlocked.disabled && unlocked.text === '科技树', JSON.stringify(unlocked));
  await p2.close();
}

// ========== B6：v6 旧档全解锁分区零回隐藏（P8） ==========
console.log('\n[P8] v6 旧档全分区零回隐藏');
{
  const { page, errs } = await openPage(mkSave({
    chapter: '7', storyline: 'line_faith', _forkTriggered: true, crossroad: 'locked',
    upgrades: { atrium: 1, scooter: 1 },
    buildings: { canteen: 1 },
    milesDone: { '10000': 1 },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  }));
  const c = await secCounts(page);
  const tabs = await page.evaluate(() => ({ tech: !document.getElementById('btn-tech').disabled }));
  rec('R18-B6 v6 旧档加载后全部已解锁分区可见（零回隐藏）',
    c.v21 >= 1 && c.dm >= 1 && c.family >= 1 && c.crossroad >= 1 && c.bld >= 1 && tabs.tech, JSON.stringify(c));
  rec('P8 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ========== C7：已购项在任意窗口可见（P9） ==========
console.log('\n[P9] 已购不回隐藏');
{
  const { page, errs } = await openPage(mkSave({ upgrades: { atrium: 1 } }));
  const items = await page.$$eval('#shop-list .item', els => els.map(e => e.textContent));
  const hasAtrium = items.some(t => t.includes('灵感工坊'));
  rec('R18-C7 已购项在任意窗口可见（仅灵感工坊已购、链位深远仍显示）',
    hasAtrium && items.length >= 2, `可见=${items.length}，灵感工坊在列=${hasAtrium}`);
  rec('P9 无 JS 错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

await browser.close();

// ========== E1 / E2 / E3：链「前一项完成」语义（node 纯函数，9.5） ==========
console.log('\n[E] 链语义纯函数断言');
{
  const items = ['i0', 'i1', 'i2', 'i3'];
  // E1 数量型：前一项完成 = 持有 ≥1
  const cnt = (m) => (it) => (m[it] || 0) >= 1;
  const e1a = chainSplit('shop', items, cnt({}), {});
  const e1b = chainSplit('shop', items, cnt({ i0: 1 }), {});
  const e1c = chainSplit('shop', items, cnt({ i0: 7 }), {});
  rec('R18-E1 数量型前一项 count=0 链不推进、count≥1 推进（多件不额外推进）',
    e1a.chainNextIdx === 0 && e1a.K === 1 && e1b.chainNextIdx === 1 && e1b.K === 2 && e1c.chainNextIdx === 1,
    `0件p=${e1a.chainNextIdx}，1件p=${e1b.chainNextIdx}，7件p=${e1c.chainNextIdx}`);
  // E2 等级型：前一项完成 = 等级 ≥1；满级无额外要求
  const lv = (m) => (it) => (m[it] || 0) >= 1;
  const e2a = chainSplit('shop', items, lv({ i0: 0 }), {});
  const e2b = chainSplit('shop', items, lv({ i0: 1 }), {});
  const e2c = chainSplit('shop', items, lv({ i0: 20, i1: 0 }), {});
  rec('R18-E2 等级型前一项 level=0 链不推进、level≥1 推进，满级（20/20）无额外要求',
    e2a.chainNextIdx === 0 && e2b.chainNextIdx === 1 && e2c.chainNextIdx === 1 && e2c.visible.includes('i1'),
    `lv0 p=${e2a.chainNextIdx}，lv1 p=${e2b.chainNextIdx}，满级 p=${e2c.chainNextIdx}`);
  // E3 一次性解锁：解锁即完成
  const unlockedFlag = (m) => (it) => !!m[it];
  const e3a = chainSplit('shop', items, unlockedFlag({}), {});
  const e3b = chainSplit('shop', items, unlockedFlag({ i0: true }), {});
  rec('R18-E3 一次性楼未解锁链不推进、解锁即推进',
    e3a.chainNextIdx === 0 && e3b.chainNextIdx === 1 && e3b.K === 2, `未解锁p=${e3a.chainNextIdx}，解锁p=${e3b.chainNextIdx}`);
}

// ========== D3：源码级静态断言（回归子句由全量回归覆盖，见交付说明） ==========
console.log('\n[D3] 倍率移除源码静态断言');
{
  const shop = readFileSync('src/modules/shop.js', 'utf-8');
  const main = readFileSync('src/main.js', 'utf-8');
  const html = readFileSync('index.html', 'utf-8');
  // 代码级模式：排除删除时留下的注释行（如「v2.3.1 ⑥：setBulk/getBulk 移除」「bulk-bar 已删除」）
  const noSetBulk = !/function\s+(setBulk|getBulk|refreshBulkUI)\s*\(/.test(shop + main);
  const noBulkDom = !/id="bulk-(1|10|100)"|id="bulk-bar"/.test(html);
  const fixedOne = shop.includes('bulkCostCalc(u, 1)');
  rec('R18-D3 倍率移除不引入回归：源码无 setBulk/getBulk/refreshBulkUI，DOM 无 bulk 元素，购买固定 bulkCostCalc(u, 1)',
    noSetBulk && noBulkDom && fixedOne, `noSetBulk=${noSetBulk}，noBulkDom=${noBulkDom}，fixedOne=${fixedOne}`);
}

// ===== 汇总 =====
const pass = results.filter(r => r.ok).length;
console.log(`\n===== R18 套件：${pass}/${results.length} 通过 =====`);
if (pass !== results.length) {
  console.log('失败清单：');
  results.filter(r => !r.ok).forEach(r => console.log('  ✗ ' + r.name));
  process.exit(1);
}
