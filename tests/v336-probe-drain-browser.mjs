// v3.3.6 反馈回归：探采「班组乘区 × 载具汇率」导致的 EP 消耗爆炸与白烧
// ① 卡片单价与页头同口径（含汇率 ×1.15^载具数 与 班组/研究/鱼缸/集市乘区），不再是基础 12.5 EP/s
// ② 采集按 DM 剩余容量结算：本周期名义 16499 DM、容量只有 1000 → 只扣 1000 DM 的 EP（原全额扣费，94% 白烧）
// ③ DM 满仓时页头消耗归零（与 tick 实扣一致，不再虚报）
import puppeteer from 'puppeteer-core';
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  // 播种：与反馈截图一致的载具构成（10 / 15 / 2 = 27 辆，汇率 1.15^27 ≈ 43.6×）
  const base = await page.evaluate(() => {
    window.S.cultists = []; window.S.dm = 0; window.S._riftSeen = true; // 探采平台由首次裂隙门控
    // 27 辆载具的每周理论成本 ≈ 6.5e8 EP → 需要把存储上限也抬起来，否则 EP 被 cap 截断测不出真实扣费
    window.S.upgrades = { ...(window.S.upgrades || {}), scooter: 10, convoy: 15, orbital: 2, deep_bin: 4000 };
    window.S.ep = 2e9; // 27 辆载具一周期约 6.5e8 EP，需在存储上限（≈4.8e9）内
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), dm: true };
    window.S.converterOn = { ...(window.S.converterOn || {}), vehicles: true };
    window.S._probeEnabled = true;
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
    return { epPerDm: window.__qa.vehicleEpPerDm(), cap: window.__qa.epStorageCap() };
  });
  await sleep(1500);

  const h0 = await page.evaluate(() => {
    const el = document.getElementById('vehicle-collect');
    return { txt: el?.querySelector('.probe-info')?.textContent || '', title: el?.title || '', cards: [...document.querySelectorAll('#vehicle-shop .item')].map(x => x.innerText).slice(0, 4) };
  });
  // ① 页头：27 辆载具 → 汇率 43.6×，无班组时约 -27.21K EP/s
  if (/探采 -27\.\d+K EP\/s/.test(h0.txt)) ok('① 页头含载具汇率（10/15/2 → -27.2K EP/s）', h0.txt.slice(0, 60));
  else bad('① 页头汇率未生效', h0.txt.slice(0, 90));

  // 卡片单价 = 12.5 × 43.6 ≈ 545 EP/s（不再是基础 12.5）
  const cardTxt = h0.cards.join(' | ');
  if (/[−-]54\d EP\/s/.test(cardTxt)) ok('① 卡片单价含汇率乘区（≈544 EP/s，非基础 12.5）', cardTxt.slice(0, 80));
  else bad('① 卡片仍显示基础单价', cardTxt.slice(0, 120));

  // ===== 班组把产能推到离谱区间 =====
  const tid = await page.evaluate(() => {
    // 18 条匹配职业高等级线程 → 乘区 ≈ 1.51^18 ≈ 1600×
    window.S.cultists = Array.from({ length: 18 }, (_, i) => ({
      id: 'c' + i, name: 'T' + i, profession: 'prospector', level: 10,
      boundTo: 'vehicles', mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false,
    }));
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
    return {
      mult: window.__qa.vehicleRateMult ? window.__qa.vehicleRateMult() : null,
      nominalDmPerSec: (window.__qa.vehicleDmPerMin ? window.__qa.vehicleDmPerMin() / 60 : null),
      epPerDm: window.__qa.vehicleEpPerDm ? window.__qa.vehicleEpPerDm() : null,
    };
  });
  await sleep(1600);
  const h1 = await page.evaluate(() => {
    const el = document.getElementById('vehicle-collect');
    window.S.ep = 2e9;
    return { txt: el?.querySelector('.probe-info')?.textContent || '', title: el?.title || '' };
  });
  if (/受 DM 上限限制/.test(h1.txt)) ok('① 产能超容量时页头标注「受 DM 上限限制」', h1.txt.slice(0, 80));
  else bad('① 未标注上限限制', h1.txt.slice(0, 90));

  // ② 一个采集周期：名义 16499 DM、容量 1000 → 只扣 1000 DM 的钱
  const cycle = await page.evaluate(async () => {
    window.S.ep = Math.min(window.__qa.epStorageCap() * 0.9, 1e9); window.S.dm = 0; window.S.vehCollectTimer = 59.99;
    const epBefore = window.S.ep;
    window.__tick(performance.now() + 1000);
    await new Promise(r => setTimeout(r, 50));
    const epSpent = epBefore - window.S.ep;
    const epPerDm = window.__qa.vehicleEpPerDm();
    return { dm: window.S.dm, epSpent, epPerDm, wantPerCycle: window.__qa.vehicleDmPerMin() * 1, cap: 1000 };
  });
  const capCost = 1000 * cycle.epPerDm;
  if (cycle.dm <= 1001 && cycle.dm >= 999) ok('② 单周期实际入账不超过 DM 上限', `dm=${cycle.dm.toFixed(1)}`);
  else bad('② DM 入账异常', JSON.stringify(cycle));
  if (cycle.epSpent <= capCost * 1.15) ok('② 只按实际采集量扣 EP（不再为溢出量付费）', `扣 ${Math.round(cycle.epSpent)} / 名义 ${Math.round(cycle.wantPerCycle * cycle.epPerDm)}`);
  else bad('② 仍按名义产能扣费', `扣 ${Math.round(cycle.epSpent)}，上限应付 ${Math.round(capCost)}`);

  // ③ DM 满仓 → 页头消耗归零
  const full = await page.evaluate(async () => {
    window.S.dm = 1000; window.S._dmFull = true;
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
    await new Promise(r => setTimeout(r, 1400));
    const txt = document.getElementById('vehicle-collect')?.querySelector('.probe-info')?.textContent || '';
    return { txt, drain: window.__qa.totalDrainPerSec ? window.__qa.totalDrainPerSec() : null };
  });
  if (/DM 已满/.test(full.txt) || /探采 -0 EP\/s/.test(full.txt)) ok('③ 满仓时不再虚报探采消耗', full.txt.slice(0, 60));
  else bad('③ 满仓仍显示消耗', full.txt.slice(0, 90));

  if (errs.length === 0) ok('全程无 JS 报错');
  else bad('页面异常', errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
