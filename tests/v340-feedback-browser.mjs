// v3.4.0 反馈回归（5 项，只覆盖受影响面）
// ① 最左列加宽；裂隙在场时不再显示「下次裂隙 0 秒」，改「当前裂隙 · 剩余」
// ② 余烬不足时对应升级项必须置灰（原每秒快刷把置灰的按钮又全部点亮）
// ③ PT 产出下调 + 单位 PT 的 EP 成本上调（孵化 15 万 EP/PT，线程加成同时乘消耗）
// ④ DM 产出下调到 ≈1 DM/s（27 辆），单位 DM 的 EP 成本 ×5
// ⑤ 科技「深空探测」购入后星图页签解锁（不再是 ???）
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
  await page.setViewport({ width: 1920, height: 1080 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  await page.evaluate(() => { window.sleep = (ms) => new Promise(r => setTimeout(r, ms)); }); // 页面内等待工具

  // ===== ① 最左列加宽 =====
  const l = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.grid > *')].map(e => Math.round(e.getBoundingClientRect().width));
    return { cols, docH: document.documentElement.scrollHeight, winH: window.innerHeight };
  });
  if (l.cols[0] >= 290) ok('① 最左列加宽（≥290px @1920）', l.cols.join(' / '));
  else bad('① 最左列宽度', l.cols.join(' / '));
  if (l.docH <= l.winH + 2) ok('① 仍为单屏无整页滚动');
  else bad('① 整页滚动', `docH=${l.docH} winH=${l.winH}`);

  // ===== ① 裂隙在场时倒计时行改语义 =====
  const eta = await page.evaluate(async () => {
    window.S._riftSeen = true; window.S.riftsSealed = 1; window.S.riftEmber = 84; window.S.riftExpedition = null;
    window.__gameDirty.riftTab = true;
    document.getElementById('btn-rift-tab')?.click();
    await sleep(600);
    const idle = document.getElementById('rift-eta-tab')?.textContent || '';
    const idleLabel = document.getElementById('rift-eta-label')?.textContent || '';
    window.S.activeRift = { power: 3, level: 3, expiresAt: Date.now() + 95000, sealCost: 1000 };
    window.__gameDirty.riftTab = true;
    await sleep(1500); // 等 1s 快刷
    const active = document.getElementById('rift-eta-tab')?.textContent || '';
    const activeLabel = document.getElementById('rift-eta-label')?.textContent || '';
    const panelTxt = document.getElementById('rift-tab-panel')?.innerText.replace(/\s+/g, ' ') || '';
    window.S.activeRift = null;
    return { idle, idleLabel, active, activeLabel, panelTxt };
  });
  if (/下次裂隙/.test(eta.idleLabel) && /(秒|分)/.test(eta.idle)) ok('① 无裂隙时显示「下次裂隙 + 倒计时」', `${eta.idleLabel} ${eta.idle}`);
  else bad('① 空闲倒计时行', JSON.stringify(eta));
  if (eta.activeLabel === '当前裂隙' && /剩余/.test(eta.active) && !/0 秒/.test(eta.active)) ok('① 裂隙在场时不再显示「下次裂隙 0 秒」', `${eta.activeLabel} ${eta.active}`);
  else bad('① 在场文案', JSON.stringify({ label: eta.activeLabel, text: eta.active }));

  // ===== ② 余烬不足必须置灰（余烬 84 → 200 项不可购、20 项可购） =====
  const em = await page.evaluate(async () => {
    window.S.riftEmber = 84; window.S.activeRift = null; window.S.riftUpgrades = {};
    window.__gameDirty.riftTab = true;
    await sleep(1400); // 让 1s 快刷跑过（原 bug 就是在这里被点亮的）
    return [...document.querySelectorAll('#rift-tab-panel [data-rift-upg]')].map(row => {
      const btn = row.querySelector('button');
      return { id: row.dataset.riftUpg, cost: btn?.textContent || '', disabled: !!btn?.disabled, opacity: btn ? +getComputedStyle(btn).opacity : 1 };
    });
  });
  const cheap = em.filter(r => parseInt(r.cost) === 20);
  const dear = em.filter(r => parseInt(r.cost) === 200);
  if (dear.length > 0 && dear.every(r => r.disabled && r.opacity < 1)) ok('② 余烬不足（200 > 84）的项置灰不可点', dear.map(r => r.id).join(','));
  else bad('② 余烬不足仍显示可购', JSON.stringify(dear));
  if (cheap.length > 0 && cheap.every(r => !r.disabled)) ok('② 余烬足够的项仍可购', cheap.map(r => r.id).join(','));
  else bad('② 足够却被置灰', JSON.stringify(cheap));

  // 购买后余烬同步下降 + 立即重新判灰
  const buy = await page.evaluate(async () => {
    const before = window.S.riftEmber;
    document.querySelector('#rift-tab-panel [data-rift-upg="lens"] button')?.click();
    await sleep(700);
    const afterBuy = window.S.riftEmber;
    const lv = (window.S.riftUpgrades || {}).lens || 0;
    // 把余烬压到 8：20 的项也应立刻置灰
    window.S.riftEmber = 8;
    await sleep(1300);
    const still = [...document.querySelectorAll('#rift-tab-panel [data-rift-upg]')].map(r => {
      const b = r.querySelector('button');
      return { id: r.dataset.riftUpg, cost: parseInt(b?.textContent || ''), disabled: !!b?.disabled };
    });
    return { before, after: afterBuy, lv, still };
  });
  if (buy.after === buy.before - 20 && buy.lv === 1) ok('② 购买扣除余烬且升级到 Lv.1', `${buy.before}→${buy.after}`);
  else bad('② 购买结算', JSON.stringify(buy));
  if (buy.still.every(r => r.disabled)) ok('② 余烬降到 8 后所有项立刻置灰');
  else bad('② 余烬 8 仍有可购项', JSON.stringify(buy.still));

  // ===== ③ PT：产出下调、EP 成本上调 =====
  const pt = await page.evaluate(async () => {
    window.S.ep = 1e9; window.S.upgrades = window.S.upgrades || {}; window.S.upgrades.storage = 400;
    window.S.ptAutoHatch = true; window.S.ptDistillOn = true; window.S.ptHatchLv = 1; window.S.pt = 0;
    window.S.cultists = []; // 无绑定线程（boost=1）
    const ep0 = window.S.ep, pt0 = window.S.pt, t0 = performance.now();
    await sleep(3000);
    const dt = (performance.now() - t0) / 1000;
    return { ptPerSec: (window.S.pt - pt0) / dt, epPerSec: (ep0 - window.S.ep) / dt };
  });
  if (pt.ptPerSec > 0.08 && pt.ptPerSec < 0.13) ok('③ PT 产出下调至 ≈0.10 PT/s（原 0.15）', `${pt.ptPerSec.toFixed(3)} PT/s`);
  else bad('③ PT 产出', `${pt.ptPerSec.toFixed(3)} PT/s`);
  if (pt.epPerSec > 1.2e4 && pt.epPerSec < 1.8e4) ok('③ EP 消耗上调至 ≈15000 EP/s（原 5000）', `-${Math.round(pt.epPerSec)} EP/s`);
  else bad('③ EP 消耗', `-${Math.round(pt.epPerSec)} EP/s`);
  const ratio = pt.epPerSec / Math.max(pt.ptPerSec, 1e-9);
  if (ratio > 1.3e5 && ratio < 1.7e5) ok('③ 单位 PT 的 EP 成本 ≈15 万（原 3.3 万）', `${Math.round(ratio)} EP/PT`);
  else bad('③ EP/PT 汇率', `${Math.round(ratio)}`);

  // 线程加成同时乘消耗：EP/PT 不随线程数变便宜
  const pt2 = await page.evaluate(async () => {
    window.S.cultists = Array.from({ length: 3 }, (_, i) => ({
      id: 'p' + i, name: 'P' + i, profession: 'keeper', level: 5, boundTo: 'hatch',
      mood: '正常', output: 5, hiredAt: Date.now(), moodTimer: 90, leader: false,
    }));
    window.S.ep = 1e9; window.S.pt = 0;
    const ep0 = window.S.ep, pt0 = window.S.pt, t0 = performance.now();
    await sleep(3000);
    const dt = (performance.now() - t0) / 1000;
    return { ptPerSec: (window.S.pt - pt0) / dt, epPerSec: (ep0 - window.S.ep) / dt };
  });
  const ratio2 = pt2.epPerSec / Math.max(pt2.ptPerSec, 1e-9);
  if (ratio2 > 1.3e5 && ratio2 < 1.7e5) ok('③ 线程加速只提产量、不提性价比（EP/PT 恒定）', `${Math.round(ratio2)} EP/PT · ${pt2.ptPerSec.toFixed(2)} PT/s`);
  else bad('③ 线程加成漏乘消耗', `EP/PT=${Math.round(ratio2)}`);

  // ===== ④ DM：27 辆 ≈1 DM/s，单位 DM 的 EP 成本 ≈7 万 =====
  const dm = await page.evaluate(async () => {
    window.S.cultists = [];
    window.S.upgrades = window.S.upgrades || {};
    window.S.upgrades.scooter = 3; window.S.upgrades.convoy = 6; window.S.upgrades.orbital = 8; window.S.upgrades.submersible = 10;
    window.S.converterOn = { ...(window.S.converterOn || {}), vehicles: true };
    window.S._probeEnabled = true;
    window.S.dm = 0; window.S.ep = 1e12; window.S.upgrades.dm_vault = 20;
    const dm0 = window.S.dm, ep0 = window.S.ep, t0 = performance.now();
    await sleep(4000);
    const dt = (performance.now() - t0) / 1000;
    const gain = window.S.dm - dm0, spent = ep0 - window.S.ep;
    return { dmPerSec: gain / dt, epPerDm: spent / Math.max(gain, 1e-9), rate: window.__qa.vehicleEpPerDm(), perMin: window.__qa.vehicleDmPerMin() };
  });
  // v3.4.1 反馈⑦：dmRates 再砍半 → 27 辆 ≈0.5 DM/s（个位数 DM/s 区间内）
  if (dm.dmPerSec > 0.3 && dm.dmPerSec < 0.75) ok('④ 27 辆 DM 产出 ≈0.5 DM/s', `${dm.dmPerSec.toFixed(2)} DM/s（${dm.perMin} DM/min）`);
  else bad('④ DM 产出', `${dm.dmPerSec.toFixed(2)} DM/s`);
  if (dm.rate > 6e4 && dm.rate < 9e4) ok('④ 单位 DM 的 EP 成本 ≈7.2 万（原 1.4 万）', Math.round(dm.rate));
  else bad('④ EP/DM 汇率', Math.round(dm.rate));

  // ===== ⑤ 深空探测 → 星图解锁 =====
  const star = await page.evaluate(async () => {
    window.S.expeditions = []; window.S.expeditionsDone = 0; window.S.tech = window.S.tech || {};
    delete window.S.tech.deep_space;
    await sleep(1300);
    const btn = document.getElementById('btn-expedition');
    const before = { locked: btn.dataset.locked, text: btn.textContent };
    window.S.tech.deep_space = 1;
    await sleep(1500);
    const after = { locked: btn.dataset.locked, text: btn.textContent };
    btn.click();
    await sleep(500);
    const panel = document.getElementById('expedition-panel');
    return { before, after, panelVisible: !!panel && getComputedStyle(panel).display !== 'none', panelTxt: (panel?.innerText || '').replace(/\s+/g, ' ').slice(0, 60) };
  });
  if (star.before.locked === '1' && star.before.text === '???') ok('⑤ 未研究深空探测时星图仍为 ???', star.before.text);
  else bad('⑤ 前置锁定态', JSON.stringify(star.before));
  if (star.after.locked !== '1' && star.after.text === '星图' && star.panelVisible) ok('⑤ 购入「深空探测」后星图解锁并可打开', star.panelTxt);
  else bad('⑤ 深空探测未解锁星图', JSON.stringify(star));

  if (errs.length === 0) ok('全程无 JS 报错');
  else bad('页面异常', errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  console.log(`\n===== v3.4.0 反馈回归：${pass}/${pass + fail} 通过 =====`);
  if (fail) process.exit(1);
}
