// v3.5.0 反馈回归：
// ① 裂隙腐化「按次」——Lv1 33%（3 次填满），高等级封顶 50%（2 次填满）
// ② FP 上限独立建筑「誓约圣龛」进升级商店，价格高于 DM/PT 仓库；圣所只产信仰
// ③ 轮回圣殿文案由「×√2」改为数值倍率
// ④ 仓库扩容叠在产出基座之上（增量恒 >0），卡面不再出现「已由产出基座接管」
import puppeteer from 'puppeteer-core';

// Node 侧购买路径会写 localStorage——先注入最小桩
globalThis.localStorage = globalThis.localStorage || {
  _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const { BALANCE } = await import('../../src/data/balance.js');
const { UPGRADES } = await import('../../src/data/upgrades.js');
const { S } = await import('../../src/state.js');
const { riftDelveCorruptPerRun, riftDelveCorruptPerSec } = await import('../../src/modules/rift.js');
const { faithCap, faithVaultBonus } = await import('../../src/data/religions.js');
const { rpCap, ptCap, epStorageCap } = await import('../../src/modules/economy.js');

import { chromePath } from '../_chrome.mjs';
const CHROME = chromePath(); // v3.12.12：Chrome 路径单一真源
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

// ===== ① 腐化节奏：3 次填满 → 升级后 2 次 =====
{
  const c1 = riftDelveCorruptPerRun(1);
  const c5 = riftDelveCorruptPerRun(5);
  const c10 = riftDelveCorruptPerRun(10);
  const c20 = riftDelveCorruptPerRun(20);
  if (Math.abs(c1 - 33.3) < 0.2) ok('① Lv1 单次深入腐化 33%（3 次填满 0→100%）', `${c1.toFixed(1)}%`);
  else bad('① Lv1 单次腐化异常', `${c1}`);
  if (c5 > c1 && c5 < 50) ok('① 裂隙升级后单次腐化递增（未达上限）', `Lv5 ${c5.toFixed(1)}%`);
  else bad('① Lv5 腐化未递增', `${c5}`);
  if (c10 === 50 && c20 === 50) ok('① 高等级封顶 50%（2 次填满）', `Lv10/Lv20 = ${c10}/${c20}`);
  else bad('① 单次腐化未封顶', `Lv10 ${c10} / Lv20 ${c20}`);
  if (Math.abs(riftDelveCorruptPerSec(1) * 60 - c1) < 1e-6) ok('① 每秒口径与单次口径同源（60s）', `${riftDelveCorruptPerSec(1).toFixed(3)}%/s`);
  else bad('① 每秒/单次口径不一致', '');
  if (BALANCE.rift.delveCorruptPerRun === 33.3 && BALANCE.rift.delveCorruptRunCap === 50) ok('① 参数落库（33.3 / 封顶 50）', '');
  else bad('① 参数缺失', JSON.stringify({ r: BALANCE.rift.delveCorruptPerRun, c: BALANCE.rift.delveCorruptRunCap }));
}

// ===== ② FP 上限建筑 =====
{
  const fv = UPGRADES.find(u => u.id === 'faith_vault');
  const dm = UPGRADES.find(u => u.id === 'dm_vault');
  const pt = UPGRADES.find(u => u.id === 'pt_vault');
  if (fv && fv.cat === 'D' && fv.unlimited) ok('② 「誓约圣龛」进升级商店（资源仓库组）', `${fv.name}`);
  else bad('② 誓约圣龛缺失或分组错', JSON.stringify(fv));
  if (fv && fv.base > dm.base && fv.base > pt.base) ok('② 价格高于星尘金库/饵料仓库', `${fv.base} > ${dm.base} / ${pt.base}`);
  else bad('② 定价未高于 DM/PT 仓库', `${fv && fv.base} vs ${dm.base}/${pt.base}`);

  S.upgrades = { ...(S.upgrades || {}), faith_vault: 0 };
  S.religion = { temple: 0, seal: 0 };
  S.prestige = 0; S.devotion = 0;
  const base = faithCap();
  S.religion.temple = 6; // 圣所等级不再影响上限
  const withTemple = faithCap();
  if (withTemple === base) ok('② 圣所等级不再提供 FP 上限（圣所只产信仰）', `${base} → ${withTemple}`);
  else bad('② 圣所仍在叠加 FP 上限', `${base} → ${withTemple}`);

  S.upgrades.faith_vault = 1;
  const lv1 = faithCap();
  S.upgrades.faith_vault = 5;
  const lv5 = faithCap();
  if (lv1 === base + 50 && lv5 > lv1) ok('② 圣龛逐级扩容（Lv1 +50，Lv5 递增）', `${base} → ${lv1} → ${lv5}`);
  else bad('② 圣龛未提供上限增量', `${base}/${lv1}/${lv5}`);
  if (Math.abs(faithVaultBonus() - (lv5 - base)) < 1) ok('② faithVaultBonus 与 faithCap 同源', ''); // 取整尾差 ≤1
  else bad('② faithVaultBonus 口径漂移', '');
  S.upgrades.faith_vault = 0;
}

// ===== ③ 轮回圣殿文案 =====
{
  const b = BALANCE.buildingsV21.find(x => x.id === 'cycle_temple'); // v2.2 效能建筑数组
  const desc = b && b.desc;
  if (desc && !/√/.test(desc) && /1\.41/.test(desc) && /2 级/.test(desc)) ok('③ 文案改为数值倍率（×1.41/级，满 2 级 ×2）', desc);
  else bad('③ 文案仍含 √2 或未说明满级', `${desc}`);
}

// ===== ④ 仓库扩容叠加在基座之上 =====
{
  S._rpOverflowSeen = true;
  S.upgrades = { ...(S.upgrades || {}), storage: 30, reserve_bin: 0, deep_bin: 0, cache: 0, rp_vault: 0, pt_vault: 0 };
  S.cultists = [{ id: 1, name: 'T', output: 1000, mood: '正常', moodTimer: 60 }];
  S.buildings = {}; S.milesDone = {}; S.storyline = 'default'; S.religion = null;
  const epCap = epStorageCap();
  const r0 = rpCap(), p0 = ptCap();
  S.upgrades.rp_vault = 1; S.upgrades.pt_vault = 1;
  const r1 = rpCap(), p1 = ptCap();
  if (r1 > r0 && p1 > p0) ok('④ 仓库升级在基座之上仍产生增量', `RP +${r1 - r0} · PT +${p1 - p0}`);
  else bad('④ 基座吞掉扩容增量', `RP ${r0}→${r1} · PT ${p0}→${p1}`);
  if (r0 >= epCap * 0.24 && p0 >= epCap * 0.17) ok('④ 基座仍按 EP 上限比例生效（RP 25% / PT 18%）', `EP ${epCap}`);
  else bad('④ 基座比例失效', `RP ${r0} · PT ${p0} · EP ${epCap}`);
  S.upgrades.rp_vault = 10; S.upgrades.pt_vault = 10;
  const deep = rpCap() - r0;
  if (deep > (r1 - r0)) ok('④ 越买越贵对应的增量更大（逐级 ×1.15）', `10 级共 +${deep}`);
  else bad('④ 深层扩容增量未放大', `${deep}`);
}

// ===== 浏览器：卡面文案与商店可见性 =====
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1100 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('abyss_idle_v2', JSON.stringify({
    _version: 6, chapter: '3', ep: 5e6, rp: 300, pt: 200, dm: 50, es: 0,
    upgrades: { storage: 30, rp_vault: 6, pt_vault: 6, faith_vault: 1 },
    buildings: { cycle_temple: 1 }, tech: { prestige2: true },
    cultists: [{ id: 1, name: 'T', output: 30, mood: '正常', moodTimer: 60 }],
    religion: { unlocked: true, branch: 'sun', sun: true, temple: 3, seal: 2 },
    faith: 20, prestige: 2, prestigePoints: 100,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, dm: true, pt: true, faith: true },
    lastSeen: Date.now(), startTime: Date.now(),
  }));
});
await page.goto(URL, { waitUntil: 'load' });
await sleep(1600);

// ② 旧档越界：上限从圣所搬到圣龛后，存档里的 FP 可能远高于新上限（曾经 300/140）
await page.evaluate(() => { window.S.faith = 99999; });
await sleep(500);
const clamp = await page.evaluate(() => ({ faith: window.S.faith, cap: window.__qa.faithCap() }));

const ui = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-buy]')].map(e => ({
    id: e.dataset.buy, text: (e.innerText || '').replace(/\n/g, ' | '),
  }));
  const pick = (id) => (rows.find(r => r.id === id) || {}).text || '';
  const body = document.body.innerText;
  document.getElementById('btn-religion')?.click();
  return { rp: pick('rp_vault'), pt: pick('pt_vault'), faith: pick('faith_vault'), bodyHasTempleDesc: body.includes('×1.41/级') };
});
await sleep(600);
const rel = await page.evaluate(() => (document.querySelector('#religion-panel')?.innerText || ''));

if (/誓约圣龛/.test(ui.faith) && /FP 上限 \+/.test(ui.faith)) ok('② 商店卡渲染「誓约圣龛 · FP 上限 +N」', ui.faith);
else bad('② 商店未渲染誓约圣龛', ui.faith || '(无)');
if (/RP 上限 \+/.test(ui.rp) && /当前/.test(ui.rp)) ok('④ 矩阵存储库文案「RP 上限 +增量（当前总量）」', ui.rp);
else bad('④ 矩阵存储库文案未改写', ui.rp || '(无)');
if (/PT 上限 \+/.test(ui.pt) && !/产出基座/.test(ui.pt)) ok('④ 文案不再出现「已由产出基座接管」', ui.pt);
else bad('④ 仍显示内部术语', ui.pt || '(无)');
if (!/产出基座/.test(ui.rp + ui.pt + ui.faith)) ok('④ 三张仓库卡均无内部术语', '');
else bad('④ 仓库卡仍含「产出基座」', `${ui.rp} / ${ui.pt}`);
// v3.5.0 补：面板只陈述自身数据，不写「由升级商店…提升」这类跨面板指引
if (/只产信仰/.test(rel) && !/誓约圣龛|升级商店|由.+提升/.test(rel) && !/FP 上限 \+50\/级/.test(rel)) ok('② 圣所卡只写「只产信仰」，无跨面板指引', '');
else bad('② 圣所卡文案未更新', rel.slice(0, 160));
if (clamp.faith === clamp.cap && !/99999/.test(rel)) ok('② 旧档 FP 越界自动钳回上限', `${clamp.faith} / ${clamp.cap}`);
else bad('② 旧档 FP 越界未钳回', JSON.stringify(clamp));

if (errs.length === 0) ok('页面无 JS 报错');
else bad('页面报错', errs.join(' | ').slice(0, 160));
await browser.close();

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
