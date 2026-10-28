// v2.0.2 真实试玩自测（用户硬规则：编译完成后必须真实打开游戏试玩，通过才允许交付）
// 覆盖设计文档 §6.1-6.4 验收清单：
//   A 6.1 新档开局（file:// 冷启动，真实点击，首级 150 + 上限 2000 截断）
//   B 6.1/6.2 级制购买推演（连买 5 级全程 < 上限×30% / cache +5000 / 数据中心 +10K）
//   C 6.2 DM 三处展示（#dm-balance / #rift-dm-balance / 探采页头）+ 封印到账 1s 同步
//   D 6.3 满 20 级锁定（已满级卡片 + 点击不可购买 + 满级上限 146.11K）
//   E 6.4 旧档 v2.0.1（storage=13）映射同级 + 零错误
//   F 6.4 边界（0 线程状态机 / 离线收益受新上限约束）
//   G http 子路径部署冒烟
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const SHOT_DIR = process.cwd() + '/../../artifacts/screenshots_v202/';
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : ''));
}
function parseNum(s) {
  const m = String(s).trim().match(/^([\d.]+)([KM]?)/);
  if (!m) return NaN;
  return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6 }[m[2] || '']);
}
// "938 / 2.00K" → { ep: 938, cap: 2000 }
function parseEpText(s) {
  const parts = String(s).split('/');
  return { ep: parseNum(parts[0]), cap: parseNum(parts[1] || '') };
}

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const fileUrl = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

async function openPage(saveObj, url = fileUrl, expandObj = null) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (saveObj !== null) {
    await page.evaluateOnNewDocument((s) => {
      localStorage.setItem('abyss_idle_v2', JSON.stringify(s));
    }, saveObj);
  } else {
    await page.evaluateOnNewDocument(() => localStorage.removeItem('abyss_idle_v2'));
  }
  if (expandObj) {
    // v2.3.1 ⑦ 修复口径适配：链窗口按定义序收窄，测试需要把链外条目拉进窗口时
    // 注入展开态（纯 UI 态，无玩法副作用，不影响实扣/上限断言）
    await page.evaluateOnNewDocument((x) => {
      localStorage.setItem('abyss_v2_expand', JSON.stringify(x));
    }, expandObj);
  }
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  return { page, errs };
}

const readEp = (page) => page.$eval('#h-ep', el => el.textContent);

// ========== A. 6.1 新档开局（file:// 冷启动 + 真实点击） ==========
console.log('\n[A] 6.1 新档开局（file:// 冷启动）');
{
  const { page, errs } = await openPage(null);
  rec('A1 冷启动零 JS 错误', errs.length === 0, errs.join(';'));
  const boot = parseEpText(await readEp(page));
  rec('A2 新档基础上限 = 2000', Math.abs(boot.cap - 2000) < 1, `h-ep="${boot.ep} / ${boot.cap}"`);
  // 点击蓄能：EP 增长且受上限截断
  await page.evaluate(() => {
    const hero = document.getElementById('hero');
    for (let i = 0; i < 3000; i++) hero.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));
  const afterClick = parseEpText(await readEp(page));
  rec('A3 点击产出增长且 ≤ 上限 2000（触顶不溢出）', afterClick.ep > 50 && afterClick.ep <= 2000,
    `ep=${afterClick.ep} cap=${afterClick.cap}`);
  // 真实点击购买存储节点首级：150 EP 扣款、上限 2000→4000
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  // v2.8.1：窗口 K=p+1 + 按解锁门槛（base 升序）——购入草稿记录/自动化脚本后，
  // 存储节点（门槛 45 EP）作为链内下一项进入窗口（先于并行任务 450 EP，先解锁先显示）
  for (const nm of ['草稿记录', '自动化脚本']) {
    await page.evaluate((name) => {
      const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes(name));
      if (el) el.click();
    }, nm);
    await new Promise(r => setTimeout(r, 400));
  }
  const costTxt = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
    return el ? el.querySelector('.cost').textContent : '';
  });
  rec('A4 存储节点首级价格展示 450（v2.8.27 base 150→450）', parseNum(costTxt) === 450, `cost="${costTxt}"`);
  const epBefore = parseEpText(await readEp(page));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
    el.click();
  });
  await new Promise(r => setTimeout(r, 500));
  const epAfter = parseEpText(await readEp(page));
  rec('A5 真实购买首级：扣款 450 且上限 2000→7000（v2.8.27 capPer 5000）',
    Math.abs((epBefore.ep - epAfter.ep) - 450) < 15 && Math.abs(epAfter.cap - 7000) < 1,
    `${epBefore.ep}/${epBefore.cap} → ${epAfter.ep}/${epAfter.cap}`);
  await page.screenshot({ path: SHOT_DIR + 'A_新档开局_首级购买.png' });
  await page.close();
}

// ========== B. 6.1/6.2 级制购买推演（注入档，真实点击连买） ==========
console.log('\n[B] 6.1/6.2 级制购买推演（连买 5 级 / cache / 数据中心）');
{
  const { page, errs } = await openPage({
    ep: 5e6, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { scribble: 1, script: 1, parallel: 1 }, buildings: {}, tech: {},
    chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  rec('B0 注入档启动零错误', errs.length === 0, errs.join(';'));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  // 连买 3 级存储节点：每级价格 < 当前上限×30%（防死锁实测）；v2.8.27 成本 ×3 后首轮 EP 截断 2000 只够 3 次
  let allUnder = true, levelOk = true, trace = [];
  for (let i = 0; i < 3; i++) {
    const st = parseEpText(await readEp(page));
    const info = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
      if (!el) return null;
      const lv = el.textContent.match(/×(\d+)/);
      return { cost: parse0(el.querySelector('.cost').textContent), lv: lv ? +lv[1] : -1, text: el.textContent.slice(0, 50) };
      function parse0(s) { const m = s.trim().match(/^([\d.]+)([KM]?)/); if (!m) return NaN; return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6 }[m[2] || '']); }
    });
    if (!info) { allUnder = false; trace.push('card-missing'); break; }
    if (!(info.cost < st.cap * 0.3)) allUnder = false;
    if (info.lv !== i) levelOk = false;
    trace.push(`L${info.lv}:${info.cost}/${Math.round(st.cap)}(${(info.cost / st.cap * 100).toFixed(1)}%)`);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
      el.click();
    });
    await new Promise(r => setTimeout(r, 700)); // v2.8.27：成本 ×3 后等待渲染刷新（防点击未命中）
  }
  rec('B1 连买 3 级：等级 Lv.0→3 递增（EP 截断 2000 内）', levelOk, trace.join(' → '));
  rec('B2 连买 3 级：每级价格 < 上限×30%（6.1 验收）', allUnder, trace.join(' → '));
  await page.screenshot({ path: SHOT_DIR + 'B_级制购买推演.png' });
  await page.close();
}
// B3/B4 说明：注入档 ep 会在加载时被存储上限截断（EP ≤ 上限为设计行为），
// 故用「已推进存档」分别验证 cache/数据中心对上限的贡献（对应设计 6.2 清单项）。
{
  // B3 缓存优化：满 20 级存储档（cap 146,105），买 cache 1 级（成本 1e5）→ 上限 +5000
  // v2.3.1 ⑤ 口径适配：展开态注入失效（加载即清除），改注入线程链前 6 项已购 → p=6、K=7，cache 进窗口
  const { page, errs } = await openPage({
    ep: 300000, rp: 0, es: 0, dm: 0, cultists: [], // v2.8.27：EP ≥ cache 钳制价 220K
    upgrades: { storage: 20, subsist1: 1, subsist2: 1, subsist3: 1, cpu: 1, mem: 1, gpu: 1 }, buildings: {}, tech: {},
    allTimeEp: 1e12, // v2.8.27：cache 门槛 9e10 chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  const capBoot = parseEpText(await readEp(page));
  const capBeforeCache = capBoot.cap;
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const cacheInfo = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    if (!el) return null;
    return { cls: el.className, text: el.textContent.slice(0, 60) };
  });
  rec('B3a 满 20 级档启动：上限 = 735,140（v2.8.27 曲线，页头 K 格式显示精度 ±150）', Math.abs(capBoot.cap - 735140) < 150,
    `h-ep="${capBoot.ep} / ${capBoot.cap}"`);
  const click3 = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    if (!el) return false;
    el.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 500));
  const capAfterCache = parseEpText(await readEp(page)).cap;
  rec('B3 买缓存优化：上限 +8000（v2.8.2）', click3 && Math.abs(capAfterCache - capBeforeCache - 8000) < 2,
    `${capBeforeCache} → ${capAfterCache}${cacheInfo ? ' [' + cacheInfo.cls + ']' : ' [card-not-found]'}`);
  await page.screenshot({ path: SHOT_DIR + 'B3_缓存优化.png' });
  await page.close();
}
{
  // B4 数据中心 dcBonus 三档：maxLevel=20 后 cache 超买注入档被截断（cap≤246K < dc1 成本 1e6），
  // 改为三档真实启动断言（0 里程碑 + default 线，无乘数干扰，档位差精确 +10K/+15K/+25K）
  const capPer = 5000, capGrowth = 1.18; // v2.8.27
  let storageSum = 0; for (let i = 1; i <= 20; i++) storageSum += capPer * Math.pow(capGrowth, i - 1);
  const base = 2000 + 20 * 8000 + storageSum; // storage20+cache20 满级基座（cache 8000/级）
  for (const [dcLv, bonus] of [[0, 0], [1, 10000], [2, 25000], [3, 50000]]) {
    const { page, errs } = await openPage({
      ep: 200000, rp: 0, es: 0, dm: 0, cultists: [],
      upgrades: { storage: 20, cache: 20 }, buildings: { datacenter: dcLv }, tech: {},
      allTimeEp: 1e7, chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
    });
    const st = parseEpText(await readEp(page));
    const expect = Math.round(base + bonus);
    rec(`B4 dcBonus 档位 dc${dcLv}：上限 = ${expect.toLocaleString()}`, errs.length === 0 && Math.abs(st.cap - expect) <= 20,
      `h-ep="${st.ep} / ${st.cap}" 期望=${expect}`);
    await page.close();
  }
}
// B4b 新档终局边界（如实记录，随 v2.1 RESCALE 处理）：dc1 成本 1e6 > 无 dc 最大 cap 919,817
{
  const milesDone = { 5: true, 10: true, 100: true, 1000: true, 10000: true, 100000: true, 1000000: true, 10000000: true, 100000000: true };
  const { page, errs } = await openPage({
    ep: 5e6, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { storage: 20, cache: 20 }, buildings: {}, tech: {},
    milesDone, allTimeEp: 5e7, chapter: '3', storyline: 'line_abyss', _forkTriggered: true, lastSeen: Date.now(),
  });
  const st = parseEpText(await readEp(page));
  rec('B4b v2.8.27 无 dc 满配上限 ≈ 3,350,000（895,100 基座 ×1.15 abyss ×3.25 里程碑）',
    errs.length === 0 && Math.abs(st.cap - 3350000) <= 30000, `h-ep="${st.ep} / ${st.cap}"`);
  await page.close();
}


// ========== C. 6.2 DM 三处展示 + 封印到账同步 ==========
console.log('\n[C] 6.2 DM 三处展示（深渊商店 / 裂隙面板 / 探采页头）');
{
  const cap2000 = 2000 + 2000 * (Math.pow(1.12, 5) - 1) / 0.12 + 5000; // storage5+cache
  const { page, errs } = await openPage({
    ep: Math.floor(cap2000 * 0.45), // 够付封印成本（上限×~40%）
    rp: 0, es: 0, dm: 7,
    cultists: [], upgrades: { storage: 5, cache: 1, scooter: 20 }, buildings: {}, tech: {},
    chapter: '3', storyline: 'default', _forkTriggered: true,
    activeRift: { power: 1, sealCost: Math.floor(cap2000 * 0.4), dmReward: 3, expiresAt: Date.now() + 600000 },
    lastSeen: Date.now(),
  });
  rec('C0 注入档启动零错误（裂隙在场 + DM=7 + 20 摩托）', errs.length === 0, errs.join(';'));
  // C1 裂隙面板当前 DM（v2.4.2：小数显示）
  const riftBal = await page.$eval('#rift-dm-balance', el => el.textContent).catch(() => 'missing');
  rec('C1 裂隙面板 #rift-dm-balance = 7.00（小数）', riftBal === '7.00', `实际 "${riftBal}"`);
  // C2 深渊商店页头 DM：v2.4.2 已移除（顶栏 h-dm 常显）
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 500));
  const dmBal = await page.$eval('#dm-balance', el => el.textContent).catch(() => 'missing');
  rec('C2 深渊商店已无 #dm-balance 余额元素', dmBal === 'missing', `实际 "${dmBal}"`);
  // C3 探采页头当前 DM + 采集期望（v2.4.2：当前 DM 小数显示）
  const vc = await page.$eval('#vehicle-collect', el => el.textContent);
  rec('C3 探采页头含「当前 DM: 7.00 · 采集 → +」', vc.includes('当前 DM: 7') && vc.includes('→ +'), `text="${vc}"`);
  // C4 封印裂隙 → DM 到账 → 1s 内同步（深渊商店余额元素已移除）
  const dm0 = parseNum(await page.$eval('#h-dm', el => el.textContent));
  await page.click('#seal-rift');
  await new Promise(r => setTimeout(r, 1200));
  const dm1 = parseNum(await page.$eval('#h-dm', el => el.textContent));
  const dmBal1 = await page.$eval('#dm-balance', el => el.textContent).catch(() => 'missing');
  const vc1 = await page.$eval('#vehicle-collect', el => el.textContent);
  const expectDm = dm0 + 3; // dmReward 3
  rec('C4 封印到账：顶栏 DM +3（小数显示）且深渊商店已无余额元素', dm1 === expectDm && dmBal1 === 'missing',
    `h-dm ${dm0}→${dm1}，#dm-balance="${dmBal1}"`);
  rec('C5 封印到账：探采页头 1s 内同步', vc1.includes(`当前 DM: ${expectDm}`), `text="${vc1}"`);
  await page.screenshot({ path: SHOT_DIR + 'C_DM展示.png' });
  await page.close();
}

// ========== D. 6.3 满 20 级锁定 ==========
console.log('\n[D] 6.3 满 20 级锁定（购买入口锁定）');
{
  const { page, errs } = await openPage({
    ep: 5e6, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { storage: 20 }, buildings: {}, tech: {},
    chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  rec('D0 满 20 级档启动零错误', errs.length === 0, errs.join(';'));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 500));
  const st = parseEpText(await readEp(page));
  rec('D1 v2.8.27 满 20 级上限 = 735,140（735.14K）', Math.abs(st.cap - 735140) < 150, `cap=${st.cap}`);
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
    if (!el) return null;
    return { text: el.textContent.slice(0, 70), hasBuy: el.hasAttribute('data-buy') };
  });
  rec('D2 v2.4 无限：20 级显示 ×20 且不再「已满级」（无 20/20 分母）', card && !card.text.includes('已满级') && !card.text.includes('20/20') && card.text.includes('×20'),
    `text="${card?.text}"`);
  rec('D3 v2.4 无限：卡片保留购买入口（可购 21 级）', card && card.hasBuy, `data-buy=${card?.hasBuy}`);
  // 点击卡片应购入第 21 级（v2.4 无限）
  const ep0 = st.ep;
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); // 强制落盘（自动存档 5s 周期，不等）
  await new Promise(r => setTimeout(r, 300));
  const st1 = parseEpText(await readEp(page));
  const saved = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('abyss_idle_v2')).upgrades.storage; } catch { return -1; }
  });
  rec('D4 v2.4 无限：点击购入第 21 级并扣款', saved === 21 && st1.ep <= ep0, `storage=${saved} ep ${ep0}→${st1.ep}`);
  await page.screenshot({ path: SHOT_DIR + 'D_满级锁定.png' });
  await page.close();
}

// ========== E. 6.4 旧档 v2.0.1（storage=13）映射同级 ==========
console.log('\n[E] 6.4 旧档兼容（v2.0.1 实存 13 节点 → 13 级）');
{
  const cap13 = Math.round(2000 + 5000 * (Math.pow(1.18, 13) - 1) / 0.18); // v2.8.27
  const { page, errs } = await openPage({
    ep: 1000, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { storage: 13, scribble: 5 }, buildings: {}, tech: {},
    _version: 3, chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  rec('E1 旧档（13 节点）加载零错误', errs.length === 0, errs.join(';'));
  const st = parseEpText(await readEp(page));
  rec('E2 v2.8.27 旧档 13 节点按 13 级重算上限 ≈ 213,090', Math.abs(st.cap - cap13) < 100, `cap=${st.cap} 期望≈${cap13}`);
  // 0 线程薪资状态机 3 秒不报错（6.4 边界）
  await new Promise(r => setTimeout(r, 3000));
  rec('E3 0 线程运行 3s 零错误（薪资状态机边界）', errs.length === 0, errs.join(';'));
  await page.screenshot({ path: SHOT_DIR + 'E_旧档13节点.png' });
  await page.close();
}

// ========== F. 6.4 离线收益受新上限约束 ==========
console.log('\n[F] 6.4 离线收益受新上限约束');
{
  const { page, errs } = await openPage({
    ep: 0, rp: 0, es: 0, dm: 0, cultists: [],
    // 造一个可观 cps： scribble 0.3×100 + script 2×100 = 230/s 基础
    upgrades: { scribble: 100, script: 100, storage: 3 }, buildings: {}, tech: {},
    chapter: '3', storyline: 'default', _forkTriggered: true,
    lastSeen: Date.now() - 3600 * 1000, // 离线 1 小时
  });
  await new Promise(r => setTimeout(r, 2500)); // 等离线结算 + 面板
  const st = parseEpText(await readEp(page));
  rec('F1 离线 1h 结算零错误', errs.length === 0, errs.join(';'));
  rec('F2 离线收益 ≤ 新上限（3 级 storage ≈ 8.7K）', st.ep <= st.cap + 1 && st.cap > 2000,
    `ep=${st.ep} / cap=${st.cap}`);
  await page.screenshot({ path: SHOT_DIR + 'F_离线上限约束.png' });
  await page.close();
}

// ========== G. http 子路径部署冒烟 ==========
console.log('\n[G] http 子路径部署');
{
  const { spawn } = await import('child_process');
  const root = new URL('../', import.meta.url).pathname;
  const server = spawn('python3', ['-m', 'http.server', '8643', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1000));
  try {
    const { page, errs } = await openPage(null, 'http://127.0.0.1:8643/dist/index.html');
    const st = parseEpText(await readEp(page));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('#btn-shop');
    await new Promise(r => setTimeout(r, 400));
    const vc = await page.$eval('#vehicle-collect', el => el.textContent);
    rec('G1 http 子路径启动零错误 + 上限 2000', errs.length === 0 && Math.abs(st.cap - 2000) < 1,
      `ep/cap="${st.ep}/${st.cap}" bg=${bg}`);
    rec('G2 http 新档无裂隙：探采页头门控隐藏（v2.5 裂隙门控）', vc === '', `text="${vc}"`);
    await page.screenshot({ path: SHOT_DIR + 'G_http部署.png' });
    await page.close();
  } finally {
    server.kill();
  }
}

// ========== H. 复验 P0 回归：cache 防死锁钳制真实购买路径（buyThreadUpgrade 接线 unitCost） ==========
console.log('\n[H] cache 钳制真实路径（实扣 = min(裸价, floor(cap×0.3)) / 全满可购 / 显示=实扣）');
{
  // H1+H3：storage20 态（cap=146,105）买第 1 级 cache——裸价 100,000 应钳制为 43,831
  // v2.3.1 ⑤ 口径适配：展开态注入失效（加载即清除），改注入线程链前 6 项已购 → cache 进窗口
  const { page, errs } = await openPage({
    ep: 309330, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { storage: 20, subsist1: 1, subsist2: 1, subsist3: 1, cpu: 1, mem: 1, gpu: 1 }, buildings: {}, tech: {},
    allTimeEp: 1e12, // v2.8.27：cache 门槛 9e10 chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  rec('H1a storage20 态启动零错误', errs.length === 0, errs.join(';'));
  const capBoot = parseEpText(await readEp(page));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const disp1 = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    return el ? el.querySelector('.cost').textContent : '';
  });
  const clamp1 = Math.floor(735140 * 0.3); // v2.8.27 220,542（裸价 3e11 > 钳制价）
  rec('H1 cache 显示价 = 钳制价（非裸价 3e11）', Math.abs(parseNum(disp1) - clamp1) <= 100, // K 格式精度
    `display="${disp1}" 期望=${clamp1}（裸价 100,000 应被钳制）`);
  const stBefore = parseEpText(await readEp(page));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    el.click();
  });
  await new Promise(r => setTimeout(r, 500));
  const stAfter = parseEpText(await readEp(page));
  const actualDeduct = stBefore.ep - stAfter.ep;
  rec('H2 cache 实扣 = 钳制价（防死锁 ≤ cap×30%，非 68.4% 裸价穿透）', Math.abs(actualDeduct - clamp1) <= 2,
    `实扣=${Math.round(actualDeduct)} 期望=${clamp1}（cap=${Math.round(stBefore.cap)}，裸价 100,000=${(100000 / stBefore.cap * 100).toFixed(1)}%cap）`);
  rec('H3 显示价 = 实扣价（同口径）', Math.abs(parseNum(disp1) - actualDeduct) <= 2,
    `display="${disp1}"(${parseNum(disp1)}) vs 实扣=${Math.round(actualDeduct)}`);
  await page.close();
}
{
  // H4：全局最满状态（storage20+cache17+dc3+9里程碑+abyss，最大上限 1,050,630）第 18 级可购买
  const milesDone = { 5: true, 10: true, 100: true, 1000: true, 10000: true, 100000: true, 1000000: true, 10000000: true, 100000000: true };
  const { page, errs } = await openPage({
    ep: 3.5e6, rp: 0, es: 0, dm: 0, cultists: [], // v2.8.27：注入 ≥ 新 cap（3,440,000 内截断）
    upgrades: { storage: 20, cache: 17 }, buildings: { datacenter: 3 }, tech: {},
    milesDone, allTimeEp: 5e7, chapter: '3', storyline: 'line_abyss', _forkTriggered: true, lastSeen: Date.now(),
  });
  rec('H4a 全满状态启动零错误', errs.length === 0, errs.join(';'));
  const capMax = parseEpText(await readEp(page));
  rec('H4b v2.8.27 全局最大上限 ≈ 3,440,000', Math.abs(capMax.cap - 3440000) <= 20000,
    `h-ep="${capMax.ep} / ${capMax.cap}"（页头 M 格式 2 位小数，显示精度 ±10K）`);
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const dispInfo = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    if (!el) return null;
    return { cost: el.querySelector('.cost').textContent, cnt: el.querySelector('.count')?.textContent || '' };
  });
  const clamp2 = Math.floor(3440000 * 0.3); // v2.8.27：cap≈3,440,000 ×30%（裸价 3e11×1.3^16 被钳制）
  rec('H4c 第 18 级显示价 = 钳制价（裸价被钳制，无终局硬墙）',
    dispInfo && Math.abs(parseNum(dispInfo.cost) - clamp2) <= 3000, // M 格式精度
    `display="${dispInfo?.cost}" ${dispInfo?.cnt} 期望=${clamp2}`);
  const stB = parseEpText(await readEp(page));
  const buyOk = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    if (!el) return false;
    el.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 600));
  const stA = parseEpText(await readEp(page));
  // 存档 5s 一存，购后即时状态从 DOM 卡片读（updateThreadItem 购后原地更新 ×计数）
  const cacheCnt = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    return el ? (el.querySelector('.count')?.textContent || '') : '';
  });
  // 购后期望余量 = 1,050,630 − 315,189 = 735,441（页头 K 格式显示精度 ±20；裸价 1.08M 口径下余量应为 ~0）
  const epAfterExpect = capMax.cap - clamp2;
  rec('H4 全满状态第 18 级可购买（无终局硬墙）',
    buyOk && cacheCnt === '×18' && Math.abs(stA.ep - epAfterExpect) <= 15000, // 页头 M 格式 2 位小数，±10K
    `cache ×17→${cacheCnt}，购后 ep=${stA.ep} 期望≈${epAfterExpect}（钳制扣款；裸价 1.08M 则买不起）`);
  await page.screenshot({ path: SHOT_DIR + 'H_cache钳制_全满可购.png' });
  await page.close();
}

// ========== I. maxLevel=20 封顶：cache 满级锁定真实路径（对齐 storage 口径） ==========
console.log('\n[I] v2.4 cache 无限升级（×20 后仍可购 21 级 / 旧档 25 级全额计入）');
{
  const milesDone = { 5: true, 10: true, 100: true, 1000: true, 10000: true, 100000: true, 1000000: true, 10000000: true, 100000000: true };
  const { page, errs } = await openPage({
    ep: 1941071, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { storage: 20, cache: 20 }, buildings: { datacenter: 3 }, tech: {},
    milesDone, allTimeEp: 5e7, chapter: '3', storyline: 'line_abyss', _forkTriggered: true, lastSeen: Date.now(),
  });
  rec('I0 全满状态（cache=20）启动零错误', errs.length === 0, errs.join(';'));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    if (!el) return null;
    return {
      cls: el.className, buy: 'buy' in el.dataset, text: el.textContent.replace(/\s+/g, ' ').slice(0, 80),
    };
  });
  rec('I1 v2.4 无限：cache=20 显示 ×20 无「已满级」且保留购买入口',
    card && !card.cls.includes('owned-item') && card.buy && card.text.includes('×20') && !card.text.includes('已满级'),
    `cls="${card?.cls}" data-buy=${card?.buy} text="${card?.text}"`);
  const stBefore = parseEpText(await readEp(page));
  const clickI = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    if (!el) return false;
    el.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); // 强制落盘（5s 周期不等）
  await new Promise(r => setTimeout(r, 300));
  const stAfter = parseEpText(await readEp(page));
  const cardAfter = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#thread-shop > *')].find(e => e.textContent.includes('缓存优化'));
    return el ? el.textContent.replace(/\s+/g, ' ').slice(0, 60) : '';
  });
  const savedCache = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('abyss_idle_v2')).upgrades.cache; } catch { return -1; }
  });
  rec('I2 v2.4 无限：第 21 级可购买（×20→×21 且扣款）',
    clickI && savedCache === 21 && stAfter.ep < stBefore.ep && cardAfter.includes('×21'),
    `ep ${stBefore.ep}→${stAfter.ep}（cap=${stAfter.cap}），cache=${savedCache}，卡片="${cardAfter}"`);
  await page.screenshot({ path: SHOT_DIR + 'I_cache无限21级.png' });
  await page.close();
}
{
  // I3 旧档 cache=25：v2.4 无限全额计入（2000 + 25×5000 = 127,000；v2.0.2 截断口径已废止）
  const { page, errs } = await openPage({
    ep: 200000, rp: 0, es: 0, dm: 0, cultists: [],
    upgrades: { cache: 25 }, buildings: {}, tech: {},
    allTimeEp: 1e7, chapter: '3', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  const st = parseEpText(await readEp(page));
  rec('I3 v2.4 旧档 cache=25 全额计入：上限 = 202,000（v2.8.2 8000/级，不再按 20 级截断）', errs.length === 0 && Math.abs(st.cap - 202000) <= 20,
    `h-ep="${st.ep} / ${st.cap}" 期望=127,000（2000+25×5000）`);
  await page.close();
}

await browser.close();
const fails = results.filter(r => !r.ok).length;
console.log(`\nv2.0.2 真实试玩自测结果：${results.length - fails} 通过，${fails} 失败`);
console.log(`截图目录：${SHOT_DIR}`);
process.exit(fails > 0 ? 1 : 0);
