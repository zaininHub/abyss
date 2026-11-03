// v3.3.8 反馈回归（三项）
// ① 探采平台：无「EP 不足，本周期跳过」文案；开启后连续扣 EP 到 0；不吃班组加成；数值重标定（≈100K EP/s、≈10 DM/s）
// ② 余烬购买裂隙科技：判定与显示同口径（浮点余烬不再出现「显示够、判定不够」）；可用时一次点击成功；文案去括号
// ③ 深入裂隙状态 + 矩阵腐化条移入左列「深渊裂隙」卡（hero 面板不再包含）
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
  await sleep(1300);

  // ===== ① 探采：连续扣费 + 无跳过文案 + 不吃班组 =====
  const p1 = await page.evaluate(async () => {
    window.S._riftSeen = true; window.S.dm = 0;
    window.S.upgrades = { ...(window.S.upgrades || {}), scooter: 10, convoy: 15, orbital: 2, deep_bin: 4000 };
    window.S.ep = 1e7;
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), dm: true };
    window.S.converterOn = { ...(window.S.converterOn || {}), vehicles: true };
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
    await new Promise(r => setTimeout(r, 900));
    const el = document.getElementById('vehicle-collect');
    const txt0 = el?.querySelector('.probe-info')?.textContent || '';
    const flow = window.__qa.probeFlowPerSec();
    const before = { mult: window.__qa.vehicleRateMult(), dm: window.__qa.vehicleDmPerMin() };
    window.S.cultists = Array.from({ length: 18 }, (_, i) => ({
      id: 'c' + i, name: 'T' + i, profession: 'prospector', level: 10,
      boundTo: 'vehicles', mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false,
    }));
    await new Promise(r => setTimeout(r, 800));
    const after = { mult: window.__qa.vehicleRateMult(), dm: window.__qa.vehicleDmPerMin() };
    // 连续扣到 0
    window.S.cultists = [];
    window.S.ep = 200; window.S.dm = 0;
    await new Promise(r => setTimeout(r, 1500));
    const drained = { ep: window.S.ep, dm: window.S.dm };
    await new Promise(r => setTimeout(r, 900));
    return {
      txt0, flow, before, after, drained, epAfter: window.S.ep, dmAfter: window.S.dm,
      txtEnd: document.getElementById('vehicle-collect')?.querySelector('.probe-info')?.textContent || '',
      title: document.getElementById('vehicle-collect')?.title || '',
    };
  });
  if (!/本周期跳过/.test(p1.txt0 + p1.title + p1.txtEnd)) ok('① 探采无「EP 不足，本周期跳过」文案');
  else bad('① 仍出现旧文案', p1.txt0.slice(0, 80));
  if (p1.flow.epPerSec > 1.5e4 && p1.flow.epPerSec < 1e5) ok('① 消耗量级 ≈24K EP/s（10/15/2 辆构成）', `-${Math.round(p1.flow.epPerSec)} EP/s`);
  else bad('① 消耗量级', String(Math.round(p1.flow.epPerSec)));
  if (p1.flow.dmPerSec > 0.2 && p1.flow.dmPerSec < 1.5) ok('① 产出量级 ≈0.33 DM/s（v3.4.0 再降）', `+${p1.flow.dmPerSec.toFixed(2)} DM/s`);
  else bad('① 产出量级', String(p1.flow.dmPerSec));
  if (Math.abs(p1.after.dm - p1.before.dm) < 1e-9) ok('① 探采不吃班组加成', `mult ${p1.before.mult.toFixed(2)}→${p1.after.mult.toFixed(2)}`);
  else bad('① 班组影响了探采', JSON.stringify({ before: p1.before, after: p1.after }));
  if (p1.epAfter <= 1) ok('① EP 一路扣到 0（无周期中断）', `ep=${p1.epAfter}, dm=${p1.dmAfter.toFixed(2)}`);
  else bad('① EP 未扣到 0', JSON.stringify({ epAfter: p1.epAfter, dm: p1.dmAfter }));
  if (/EP 已耗尽/.test(p1.txtEnd)) ok('① EP 归零显示「EP 已耗尽，停止采集」', p1.txtEnd.slice(0, 50));
  else bad('① 归零态文案缺失', p1.txtEnd.slice(0, 60));

  // ===== ② 余烬：显示/判定同口径 + 可购买 + 文案去括号 =====
  const p2 = await page.evaluate(async () => {
    window.S._riftSeen = true; window.S.riftsSealed = 1;
    window.S.riftUpgrades = {}; window.S.riftEmber = 19.98; // 旧档浮点 → 曾显示 20 但买不了
    document.getElementById('btn-rift-tab')?.click();
    window.__gameDirty.riftTab = true;
    await new Promise(r => setTimeout(r, 800));
    const rowA = document.querySelector('[data-rift-upg="sentinel"]');
    const shownEmber = document.getElementById('h-ember')?.textContent || '';
    const stateA = { disabled: rowA?.querySelector('button')?.disabled, shownEmber };
    window.S.riftEmber = 100;
    await new Promise(r => setTimeout(r, 800));
    const rowB = document.querySelector('[data-rift-upg="sentinel"]');
    const stateB = { disabled: rowB?.querySelector('button')?.disabled, same: rowA === rowB };
    rowB?.querySelector('button')?.click();
    await new Promise(r => setTimeout(r, 500));
    const panelTxt = document.getElementById('rift-tab-panel')?.innerText || '';
    return {
      stateA, stateB, lv: window.S.riftUpgrades.sentinel, ember: window.S.riftEmber,
      hasParen: /裂隙科技（/.test(panelTxt) || /（每级 -25%/.test(panelTxt),
      panelTxt: panelTxt.slice(0, 160),
    };
  });
  if (p2.stateA.disabled && p2.stateA.shownEmber === '19') ok('② 浮点余烬 19.98 → 显示 19、判定 19（同口径，不再假可购）', `显示 ${p2.stateA.shownEmber}`);
  else bad('② 余烬显示/判定口径', JSON.stringify(p2.stateA));
  if (!p2.stateB.disabled && p2.stateB.same) ok('② 余烬充足时原地转可购（不重建节点）');
  else bad('② 可购态切换', JSON.stringify(p2.stateB));
  if (p2.lv === 1 && p2.ember === 80) ok('② 一次点击购买成功（-20 余烬，整数扣减）', `lv=${p2.lv} ember=${p2.ember}`);
  else bad('② 购买失败', JSON.stringify({ lv: p2.lv, ember: p2.ember }));
  if (!p2.hasParen) ok('② 裂隙科技文案已去括号');
  else bad('② 仍有括号文案', p2.panelTxt);

  // ===== ③ HUD 移到左列深渊裂隙卡 =====
  const p3 = await page.evaluate(async () => {
    const card = document.getElementById('rift-card');
    const hero = document.getElementById('hero')?.closest('.panel');
    window.S.corruption = 10.5;
    window.S.riftExpedition = { level: 1, until: Date.now() + 26000, gainedDm: 17.3, gainedVs: 0 };
    window.__gameDirty.rift = true; window.__gameDirty.hero = true;
    await new Promise(r => setTimeout(r, 900));
    const inCard = {
      exp: !!card?.querySelector('#rift-exp-status'),
      bar: !!card?.querySelector('#corruption-bar'),
      purge: !!card?.querySelector('#corruption-purge'),
      abort: !!card?.querySelector('#abort-rift-ex'),
      visible: getComputedStyle(card).display !== 'none',
      txt: document.getElementById('rift-exp-status')?.textContent || '',
    };
    const inHero = { exp: !!hero?.querySelector('#rift-exp-status'), bar: !!hero?.querySelector('#corruption-bar') };
    window.S.riftExpedition = null; window.S.corruption = 0;
    return { inCard, inHero };
  });
  if (p3.inCard.exp && p3.inCard.bar && p3.inCard.purge && p3.inCard.abort) ok('③ 深入状态 + 腐化条（含按钮）已移入深渊裂隙卡');
  else bad('③ HUD 不在裂隙卡内', JSON.stringify(p3.inCard));
  if (!p3.inHero.exp && !p3.inHero.bar) ok('③ hero 面板不再包含该内容');
  else bad('③ hero 仍残留 HUD', JSON.stringify(p3.inHero));
  if (p3.inCard.visible && /深入裂隙 Lv\.1/.test(p3.inCard.txt)) ok('③ 深入时裂隙卡可见并显示状态行', p3.inCard.txt.slice(0, 60));
  else bad('③ 深入时卡片不可见', JSON.stringify(p3.inCard));

  if (errs.length === 0) ok('全程无 JS 报错');
  else bad('页面异常', errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
