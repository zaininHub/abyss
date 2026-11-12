// v3.4.8 反馈回归（8 项，只覆盖受影响面）
// ① 裂隙等级「深入消耗」指数陡增（原线性 ×lv）
// ② 圣所升级/消耗曲线变陡（growth 1.35→1.70、单位 EP 增速 0.2→0.35）
// ③ 顶部常显星图 CPS
// ④ 删除「满仓涓流」日志（机制保留）
// ⑤ 星图出发消耗（EP ×100 保持；v3.4.9 ⑥ 起 RP/PT 抬到 EP 量级）
// ⑥ 班组产出:薪资 ≈ 1.5:1
// ⑦ 删除升级商店「消耗优化」整组（subsist1/2/3、mem、cache）
// ⑧ 圣所 EP 不足时暂停产出（v3.4.9 已回退 v3.4.8 的折算口径）
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const { BALANCE } = await import('../../src/data/balance.js');
const { UPGRADES } = await import('../../src/data/upgrades.js');
const { S } = await import('../../src/state.js');
const { TEMPLE, templeCost } = await import('../../src/data/religions.js');
const { templeEpPerUnit, templeFaithPerSec, tickReligion } = await import('../../src/modules/religions.js');
const { riftDelveEpPerSec, riftDelveTotalEp } = await import('../../src/modules/rift.js');
const { GALAXIES } = await import('../../src/modules/expedition.js');
const { staffOutputPerSec, staffSalaryPerSec } = await import('../../src/modules/economy.js');
import { chromePath } from '../_chrome.mjs';
const CHROME = chromePath(); // v3.12.12：Chrome 路径单一真源
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

// ===== ① 裂隙深入消耗指数陡增 =====
{
  const d1 = riftDelveEpPerSec(1), d5 = riftDelveEpPerSec(5), d10 = riftDelveEpPerSec(10);
  if (Math.abs(d1 - 3) < 1e-9) ok('① Lv.1 深入消耗 = 3 EP/s（基座不变）', `${d1.toFixed(2)}`);
  else bad('① Lv.1 基座被误改', `${d1}`);
  const ratio = d10 / d1;
  if (ratio > 50) ok('① Lv.10/Lv.1 消耗比 > 50×（线性口径只有 10×）', `×${ratio.toFixed(1)}（Lv5 ${d5.toFixed(1)} / Lv10 ${d10.toFixed(1)} EP/s）`);
  else bad('① 消耗不够陡', `×${ratio.toFixed(1)}`);
  if (Math.abs(riftDelveTotalEp(5) - d5 * 60) < 1e-9) ok('① 60s 总消耗口径一致', `${riftDelveTotalEp(5).toFixed(0)} EP`);
  else bad('① 总消耗口径不一致', `${riftDelveTotalEp(5)}`);
  const src = readFileSync('src/modules/rift.js', 'utf8');
  if (src.includes('riftDelveEpPerSec(lv) * dt') && !/delveEpPerSec \* lv \* dt/.test(src)) ok('① tick 结算走指数函数（旧线性已移除）', '');
  else bad('① tick 仍在用线性消耗', '');
  if (/深入消耗 \$\{fmt\(riftDelveEpPerSec\(nextLv\)\)\}/.test(src)) ok('① 等级卡文案与消耗函数同源', '');
  else bad('① 等级卡仍是硬编码', '');
}

// ===== ② 圣所曲线变陡 =====
{
  if (TEMPLE.growth === 1.70) ok('② 圣所价格 growth 1.35 → 1.70', '');
  else bad('② growth 未更新', `${TEMPLE.growth}`);
  const costAt = (lv) => Math.round(TEMPLE.base * Math.pow(TEMPLE.growth, lv)); // templeCost() 只读当前档，这里按级算
  const c1 = costAt(1), c5 = costAt(5), c10 = costAt(10);
  const S0 = { ...S.religion };
  S.religion = { temple: 1 }; const c1b = templeCost();
  S.religion = { temple: 5 }; const c5b = templeCost();
  S.religion = S0;
  if (c1b === 850000 && c5b === 7099285) ok('② 代价锚点：Lv1 850K / Lv5 7.10M', `Lv10 ≈ ${(c10 / 1e8).toFixed(2)} 亿`);
  else bad('② 代价锚点不符', `${c1b}/${c5b}`);
  S.religion = { temple: 1 }; const u1 = templeEpPerUnit();
  S.religion = { temple: 5 }; const u5 = templeEpPerUnit();
  if (u1 === 2000 && Math.abs(u5 - 4800) < 1e-9) ok('② 单位 FP 的 EP 消耗随级递增（+35%/级）', `Lv1 ${u1} → Lv5 ${u5}`);
  else bad('② 单位消耗曲线不符', `${u1}/${u5}`);
  if (c10 / c1 > 100) ok('② 十级累计涨幅足够陡（避免连点堆级）', `Lv10/Lv1 = ×${(c10 / c1).toFixed(0)}`);
  else bad('② 涨价不够陡', `×${(c10 / c1).toFixed(1)}`);
}

// ===== ⑤ 星图出发消耗 ×100 =====
{
  const g = (id) => GALAXIES.find(x => x.id === id);
  // v3.6.0 方向⑤：EP 消耗起步 M 量级、按数量级递增（1e6 → 1e11），RP/PT 抬到 EP 同一数量级（EP/10、EP/12.5）
  const expect = [
    ['moon', 1e6, 1e5, 8e4], ['mars', 1e7, 1e6, 8e5], ['jupiter', 1e8, 1e7, 8e6],
    ['centauri', 1e9, 1e8, 8e7], ['edge', 1e10, 1e9, 8e8], ['andromeda', 1e11, 1e10, 8e9],
  ];
  const wrong = expect.filter(([id, ep, rp, pt]) => {
    const x = g(id);
    return !x || x.cost.ep !== ep || x.cost.rp !== rp || x.cost.pt !== pt;
  });
  if (wrong.length === 0) ok('⑤ 6 个星系 EP 消耗维持 ×100、RP/PT 抬到 EP 量级', `月球 5e5 EP → 仙女座 1e10 EP + 1e9 RP`);
  else bad('⑤ 星系消耗不符', wrong.map(w => w[0]).join('，'));
  const orderOk = GALAXIES.every(x => {
    const r = x.cost.rp / x.cost.ep, p = x.cost.pt / x.cost.ep;
    return r > 0.05 && r < 0.2 && p > 0.05 && p < 0.2;
  });
  if (orderOk) ok('⑤ RP/PT 与 EP 同量级（各为 EP 的 8%~12%）', '');
  else bad('⑤ RP/PT 与 EP 仍差量级', GALAXIES.map(x => `${x.id}:${x.cost.rp / x.cost.ep}`).join(' '));
  if (g('moon').cps === 2 && g('andromeda').cps === 3000) ok('⑤ CPS 奖励未同步上调（只放大消耗）', '');
  else bad('⑤ CPS 奖励被误改', '');
}

// ===== ⑥ 班组产出:薪资 ≈ 1.5:1 =====
{
  S.cultists = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: 'T' + i, output: 3, mood: '正常', moodTimer: 60, level: 1, xp: 0, profession: null, boundTo: null, leader: false, hiredAt: Date.now() }));
  S.upgrades = {}; S.tidePhase = 1; S.tideTimer = 150; S.ep = 1e9;
  const out = staffOutputPerSec(), sal = staffSalaryPerSec();
  const r = out / sal;
  if (r > 1.4 && r < 1.6) ok('⑥ 班组 产出:薪资 ≈ 1.5:1', `${out.toFixed(1)} : ${sal.toFixed(1)}（×${r.toFixed(2)}）`);
  else bad('⑥ 薪资比例不符', `${out.toFixed(1)} : ${sal.toFixed(1)}（×${r.toFixed(2)}）`);
  S.cultists = [];
}

// ===== ⑦ 消耗优化整组删除 =====
{
  const gone = ['subsist1', 'subsist2', 'subsist3', 'mem', 'cache'].filter(id => UPGRADES.find(u => u.id === id));
  if (gone.length === 0) ok('⑦ 消耗优化 5 项全部从 UPGRADES 删除', '');
  else bad('⑦ 仍有残留条目', gone.join('，'));
  if (UPGRADES.find(u => u.id === 'cpu') && UPGRADES.find(u => u.id === 'gpu')) ok('⑦ 产出强化（CPU/GPU）保留', '');
  else bad('⑦ 产出强化被误删', '');
  const shopSrc = readFileSync('src/modules/shop.js', 'utf8');
  if (!shopSrc.includes("title: '消耗优化'")) ok('⑦ 商店不再渲染「消耗优化」分组', '');
  else bad('⑦ 商店仍在渲染消耗优化组', '');
}

// ===== ④ 涓流日志已删除（源码断言） =====
{
  const mainSrc = readFileSync('src/main.js', 'utf8');
  if (!mainSrc.includes('满仓涓流蒸馏') && !mainSrc.includes('满仓涓流孵化')) ok('④ 满仓涓流不再写日志', '');
  else bad('④ 仍在写涓流日志', '');
  if (mainSrc.includes('S._atriumTrickle') && mainSrc.includes('S._ptTrickle')) ok('④ 涓流机制保留（只删日志）', '');
  else bad('④ 涓流机制被误删', '');
}

// ===== 浏览器侧 =====
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const save = {
    _version: 5, ep: 5e6, rp: 500, pt: 5000, dm: 50, chapter: '8', storyline: 'default',
    starCps: 3000, expeditionsDone: 1,
    buildings: {}, upgrades: { atrium: 2, reserve_bin: 10, storage: 10 }, tech: {}, milesDone: {}, offUpgrades: {},
    religion: { unlocked: true, branch: 'sun', sun: true, temple: 2, seal: 1, templeOff: false },
    faith: 10, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now(),
  };
  await page.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), JSON.stringify(save));
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  // ③ 顶部 CPS
  const hud = await page.evaluate(() => {
    const el = document.getElementById('h-starcps');
    const stat = document.getElementById('starcps-stat');
    return { exists: !!el, text: el ? el.textContent.trim() : '', visible: stat ? stat.style.display !== 'none' : false };
  });
  if (hud.exists && hud.visible && /3\.00K|3000/.test(hud.text)) ok('③ 顶部显示星图 CPS', `${hud.text}`);
  else bad('③ 顶部 CPS 未显示', JSON.stringify(hud));
  // 清空后隐藏
  const hudHidden = await page.evaluate(async () => {
    window.S.starCps = 0; window.S.expeditionsDone = 0; window.S.tech = {}; window.S.expeditions = [];
    await new Promise(r => setTimeout(r, 400));
    const stat = document.getElementById('starcps-stat');
    return stat ? stat.style.display === 'none' : false;
  });
  if (hudHidden) ok('③ 未解锁星图时顶部 CPS 隐藏', '');
  else bad('③ 顶栏 CPS 常驻（应门控）', '');
  await page.evaluate(() => { window.S.starCps = 3000; });

  // ⑧ 圣所 EP 不足仍产出 FP（折算），EP 充足时满产
  const fp = await page.evaluate(async () => {
    window.S.religion = { unlocked: true, branch: 'sun', sun: true, temple: 3, seal: 1, templeOff: false };
    window.S.cultists = [];
    window.S.faith = 0;
    window.S.ep = 40; // 远不够满产（Lv3：0.15 FP/s × 3400 EP ≈ 510 EP/s）
    await new Promise(r => setTimeout(r, 2500));
    const low = { faith: window.S.faith, ep: window.S.ep };
    window.S.ep = 5e6;
    const f0 = window.S.faith;
    await new Promise(r => setTimeout(r, 2000));
    const high = { faith: window.S.faith - f0 };
    return { low, high };
  });
  // v3.4.9 ⑧：折算产出已回退——EP 不足 = 暂停（不消耗也不产出），EP 回升自动满产
  // 只断言「圣所停摆」——EP 本身会被薪资/转化器继续消耗，不能拿 EP 残值当圣所扣费依据
  if (fp.low.faith === 0 && fp.low.ep >= 0) ok('⑧ EP 不足时圣所暂停产出（不扣 EP 也不产 FP）', `faith ${fp.low.faith} / ep ${fp.low.ep}`);
  else bad('⑧ EP 不足口径异常（应停摆）', JSON.stringify(fp.low));
  if (fp.high.faith > 0.15) ok('⑧ EP 充足时恢复满产', `2s +${fp.high.faith.toFixed(3)} FP`);
  else bad('⑧ EP 充足产出偏低', JSON.stringify(fp.high));

  // ⑧ 面板状态标签
  const tag = await page.evaluate(async () => {
    document.getElementById('btn-religion')?.click();
    await new Promise(r => setTimeout(r, 500));
    const txt = document.querySelector('#religion-panel')?.textContent || document.body.textContent;
    return { hasUnlimited: /无上限/.test(txt), hasUnit: /单位 FP/.test(txt) };
  });
  if (tag.hasUnlimited && tag.hasUnit) ok('② 圣所面板显示「无上限」+「单位 FP 成本」', '');
  else bad('② 圣所面板信息缺失', JSON.stringify(tag));

  // ⑥ 班组面板比例
  const crew = await page.evaluate(async () => {
    window.S.tidePhase = 1; window.S.tideTimer = 150;
    window.S.cultists = Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, name: 'T' + i, output: 3, mood: '正常', moodTimer: 60, level: 1, xp: 0, profession: null, boundTo: null, leader: false, hiredAt: Date.now() }));
    window.S.upgrades = { ...(window.S.upgrades || {}) };
    // 非懒惰态：EP 置 0 + 清 lazySince（怠工标记会 ×2.5 薪资，比例失真）
    window.S.ep = 0; window.S.lazySince = 0;
    const out = window.__qa.staffOutputPerSec(), sal = window.__qa.staffSalaryPerSec();
    await new Promise(r => setTimeout(r, 1200));
    const sum = document.querySelector('.crew-sum')?.textContent || '';
    return { out, sal, ratio: out / Math.max(1e-9, sal), sum };
  });
  if (crew.ratio > 1.4 && crew.ratio < 1.6) ok('⑥ 班组面板 产出:薪资 ≈ 1.5:1', `${crew.out.toFixed(1)} : ${crew.sal.toFixed(1)}`);
  else bad('⑥ 班组比例异常', JSON.stringify({ out: crew.out, sal: crew.sal, ratio: crew.ratio }));
  if (/班组产出/.test(crew.sum) && /薪资/.test(crew.sum) && /\d/.test(crew.sum)) ok('⑥ 班组概览行正常渲染', crew.sum.replace(/\s+/g, ' ').trim().slice(0, 60));
  else bad('⑥ 班组概览缺失', crew.sum.slice(0, 60));

  // ④ 日志区不再出现涓流
  const logs = await page.evaluate(async () => {
    window.S.rp = 1e12; window.S.ep = 5e6;
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 2 };
    window.S.atriumOn = true;
    await new Promise(r => setTimeout(r, 6200));
    return document.getElementById('log-content')?.textContent || '';
  });
  if (!/涓流/.test(logs)) ok('④ 日志区无「满仓涓流」条目', '');
  else bad('④ 日志仍在刷涓流', logs.slice(0, 80));

  if (errs.length === 0) ok('页面无 JS 报错');
  else bad('页面报错', errs.join(' | ').slice(0, 160));
} finally {
  await browser.close();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
