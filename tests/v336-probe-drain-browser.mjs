// v3.3.6 反馈回归（探采消耗对账）→ v3.3.8 口径重写：
// ① 探采**不吃班组乘区**（线程挂满也不改变产出），页头消耗 ≈ 100K EP/s、产出 ≈ 10 DM/s 量级
// ② **连续结算**：开启后每帧按 EP/s 扣、DM/s 入账；EP 归零才停（不存在「本周期跳过」文案）
// ③ DM 满仓时停止采集且不扣 EP（不再为溢出量付费）
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

  // 播种：与反馈截图一致的载具构成（10 / 15 / 2 = 27 辆）
  await page.evaluate(() => {
    window.S.cultists = []; window.S.dm = 0; window.S._riftSeen = true;
    window.S.upgrades = { ...(window.S.upgrades || {}), scooter: 10, convoy: 15, orbital: 2, deep_bin: 4000 };
    window.S.ep = 2e9;
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), dm: true };
    window.S.converterOn = { ...(window.S.converterOn || {}), vehicles: true };
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
  });
  await sleep(1500);

  const h0 = await page.evaluate(() => {
    const el = document.getElementById('vehicle-collect');
    const flow = window.__qa.probeFlowPerSec();
    return {
      txt: el?.querySelector('.probe-info')?.textContent || '', title: el?.title || '',
      cards: [...document.querySelectorAll('#vehicle-shop .item')].map(x => x.innerText).slice(0, 4),
      flow, mult: window.__qa.vehicleRateMult(), epPerDm: window.__qa.vehicleEpPerDm(),
    };
  });
  // ① 页头数量级：EP 消耗 10^5 级、DM 产出 10^0~10^1 级
  const epPerSec = h0.flow.epPerSec, dmPerSec = h0.flow.dmPerSec;
  if (epPerSec > 3e4 && epPerSec < 3e5 && dmPerSec > 1 && dmPerSec < 30) ok('① 消耗 ≈100K EP/s、产出 ≈10 DM/s 量级', `-${Math.round(epPerSec)} EP/s → +${dmPerSec.toFixed(2)} DM/s`);
  else bad('① 数量级不符', `-${Math.round(epPerSec)} EP/s → +${dmPerSec.toFixed(2)} DM/s`);
  if (!/本周期跳过|EP 不足/.test(h0.txt + h0.title)) ok('① 页头无「EP 不足，本周期跳过」文案');
  else bad('① 仍有旧文案', h0.txt.slice(0, 80));
  if (h0.epPerDm > 1000 && h0.epPerDm < 3e4) ok('① 汇率重标定（27 辆 ≈1.4万 EP/DM，非 65 万）', Math.round(h0.epPerDm));
  else bad('① 汇率口径', String(h0.epPerDm));

  // 卡片单价含汇率（不再是基础 300 EP/s 的裸值）
  const cardTxt = h0.cards.join(' | ');
  const cardEp = (cardTxt.match(/[−-]([\d.]+)([KMB]?) EP\/s/) || []);
  if (cardEp.length) ok('① 卡片显示真实单价', cardTxt.replace(/\n/g, ' ').slice(0, 60));
  else bad('① 卡片单价缺失', cardTxt.slice(0, 120));

  // ② 班组不再影响探采产出（挂满 18 条高等级线程，乘区仍为 1 附近）
  const tid = await page.evaluate(async () => {
    const before = { mult: window.__qa.vehicleRateMult(), dm: window.__qa.vehicleDmPerMin() };
    window.S.cultists = Array.from({ length: 18 }, (_, i) => ({
      id: 'c' + i, name: 'T' + i, profession: 'prospector', level: 10,
      boundTo: 'vehicles', mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false,
    }));
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
    await new Promise(r => setTimeout(r, 900));
    return { before, after: { mult: window.__qa.vehicleRateMult(), dm: window.__qa.vehicleDmPerMin() } };
  });
  if (Math.abs(tid.after.mult - tid.before.mult) < 1e-9 && Math.abs(tid.after.dm - tid.before.dm) < 1e-9) ok('② 探采不吃班组加成（18 条线程不改变产出/乘区）', `mult=${tid.after.mult.toFixed(2)}`);
  else bad('② 班组仍影响探采', JSON.stringify(tid));

  // ③ 连续结算：1 秒实扣 ≈ epPerDm × 入账 DM；扣到 EP=0 后停产
  const cont = await page.evaluate(async () => {
    window.S.ep = Math.min(window.__qa.epStorageCap() * 0.9, 5e6); window.S.dm = 0;
    await new Promise(r => setTimeout(r, 200));
    const ep0 = window.S.ep, dm0 = window.S.dm;
    await new Promise(r => setTimeout(r, 2000));
    const ep1 = window.S.ep, dm1 = window.S.dm;
    return { epSpent: ep0 - ep1, dmGain: dm1 - dm0, epPerDm: window.__qa.vehicleEpPerDm() };
  });
  const expectCost = cont.dmGain * cont.epPerDm;
  if (cont.dmGain > 0 && Math.abs(cont.epSpent - expectCost) / Math.max(1, expectCost) < 0.1) ok('③ 按 DM 实收量连续扣费（无周期、无跳过）', `+${cont.dmGain.toFixed(2)} DM / -${Math.round(cont.epSpent)} EP`);
  else bad('③ 连续结算比例异常', JSON.stringify(cont));

  const zero = await page.evaluate(async () => {
    window.S.ep = 200; window.S.dm = 0; // 只够买极少量 DM
    await new Promise(r => setTimeout(r, 1600));
    const a = { ep: window.S.ep, dm: window.S.dm };
    await new Promise(r => setTimeout(r, 1200));
    return { a, epAfter: window.S.ep, dmAfter: window.S.dm, txt: document.getElementById('vehicle-collect')?.querySelector('.probe-info')?.textContent || '' };
  });
  if (zero.epAfter <= 1 && zero.a.ep <= 1) ok('③ EP 扣到 0 后停止（无负值、无中断文案）', zero.txt.slice(0, 60));
  else bad('③ EP 归零行为', JSON.stringify(zero));

  // ④ DM 满仓 → 停止采集、消耗归零
  const full = await page.evaluate(async () => {
    window.S.ep = 2e9; window.S.dm = 1000; window.S._dmFull = true;
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
    await new Promise(r => setTimeout(r, 1400));
    const txt = document.getElementById('vehicle-collect')?.querySelector('.probe-info')?.textContent || '';
    return { txt, probeDrain: window.__qa.probeFlowPerSec().epPerSec, dm: window.S.dm };
  });
  if (/DM 已满/.test(full.txt) && full.probeDrain === 0) ok('④ 满仓停止采集且探采消耗归零', full.txt.slice(0, 50));
  else bad('④ 满仓仍在扣费', JSON.stringify(full));

  if (errs.length === 0) ok('全程无 JS 报错');
  else bad('页面异常', errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
