// v3.4.5 反馈回归（4 项，只覆盖受影响面）
// ① 全部「降低成本的升级」（效能建筑组 C）大幅涨价 + 加成削弱
// ② 深渊凝视：动画改为屏幕底部中央一只左右打量你的眼睛，文案改「???」
// ③ 删除「数据熔炉」升级项；删除效能建筑「存储与续航」整组（上限扩容 + 离线续航）
// ④ 大幅提高高级异兽的购入价格 / 升级饼干 / 维持消耗
import puppeteer from 'puppeteer-core';
const { BALANCE } = await import('../src/data/balance.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const { PETS } = await import('../src/data/pets.js');
const { OFF_UPGRADES } = await import('../src/data/offlineUpgrades.js');
const { S } = await import('../src/state.js');
const { offlineRate, offlineCap } = await import('../src/modules/economy.js');
const petsMod = await import('../src/modules/pets.js');
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };
const B = (id) => BALANCE.buildingsV21.find(x => x.id === id) || {};
const T = (id) => { const b = B(id); let t = 0; for (let i = 0; i < (b.cap || 1); i++) t += b.base * Math.pow(b.growth, i); return t; };
const U = (id) => UPGRADES.find(x => x.id === id) || {};

// ===== ① 组 C 降本类：大幅涨价 + 加成削弱 =====
const NEW_C = [
  ['议价坊', 'bargain_shop', 2.5e6, 1.45, 0.99, 5],
  ['谈判席', 'negotiate_seat', 1.2e7, 1.48, 0.98, 3],
  ['采购总署', 'purchase_office', 5e7, 1.50, 0.975, 3],
  ['采购总署·聚', 'purchase_office_2', 8e7, 1.50, 0.97, 2],
  ['采购总署·极', 'purchase_office_3', 2e8, 1.30, 0.95, 1],
];
const OLD_BASE = { bargain_shop: 2.5e5, negotiate_seat: 1.6e6, purchase_office: 4.2e6, purchase_office_2: 1.4e7, purchase_office_3: 3e7 };
const wrong = NEW_C.filter(([, id, base, growth, mul, cap]) => {
  const b = B(id);
  return b.base !== base || b.growth !== growth || b.fx.value !== mul || b.cap !== cap;
});
if (wrong.length === 0) ok('① 5 座成本折扣建筑 base/growth/折价幅度/cap 全量重标', `议价坊 ${B('bargain_shop').base.toExponential(0)} / 采购总署·极 ${B('purchase_office_3').base.toExponential(0)}`);
else bad('① 成本折扣数值不符', wrong.map(([n]) => n).join('，'));

const ratio = NEW_C.map(([, id, base]) => base / OLD_BASE[id]);
if (ratio.every(r => r >= 5)) ok('① 单座首购价至少 ×5（大幅涨价）', `×${Math.min(...ratio).toFixed(1)} ~ ×${Math.max(...ratio).toFixed(1)}`);
else bad('① 涨幅不足', ratio.map(r => r.toFixed(1)).join('/'));

// 每级折价幅度收窄：旧 0.98/0.96/0.95/0.92/0.88 → 新 0.99/0.98/0.975/0.97/0.95
const cumulative = NEW_C.reduce((a, [, , , , mul, cap]) => a * Math.pow(mul, cap), 1);
if (cumulative > 0.72 && cumulative < 0.76) ok('① 满档累计折扣由 ×0.511 收窄到 ×0.742（约 26% 折扣）', `×${cumulative.toFixed(3)}`);
else bad('① 满档累计折扣异常', `×${cumulative.toFixed(3)}`);

const focus = B('focus_core');
if (focus.base === 3e6 && focus.fx.value === 0.88 && focus.cap === 1) ok('① 专注心核 5.5e5→3e6、专注成本 ×0.75→×0.88', '');
else bad('① 专注心核未重标', `${focus.base} / ×${focus.fx.value}`);

const totalC = NEW_C.reduce((a, [, id]) => a + T(id), 0) + T('focus_core');
if (totalC >= 5e8) ok('① 组 C 满档总投入 ≈6 亿 EP（原 ≈5,000 万）', `${(totalC / 1e8).toFixed(2)} 亿`);
else bad('① 组 C 总投入不足', totalC.toExponential(2));

// 门槛显式保留（涨价后不被价位映射顶到 m7）
if (B('bargain_shop').minMile === 5 && B('focus_core').minMile === 5 && B('purchase_office_3').minMile === 7) ok('① 降本类门槛显式保留（minMile 5/6/7，不随涨价漂移）', '');
else bad('① 门槛被价位映射带偏', JSON.stringify([B('bargain_shop').minMile, B('focus_core').minMile]));

// ===== ② 深渊凝视：文案 ??? =====
if (BALANCE.rift.upgrades.gaze.desc === '???') ok('② 深渊凝视文案改为「???」', '');
else bad('② 文案未改', BALANCE.rift.upgrades.gaze.desc);

// ===== ③ 删除数据熔炉 + 存储与续航整组 =====
if (!U('dataforge').id && !BALANCE.dataForge) ok('③ 数据熔炉升级项已删除（upgrades + balance 均无残留）', '');
else bad('③ 数据熔炉仍有残留', `${U('dataforge').id || ''}/${!!BALANCE.dataForge}`);

const leftover = BALANCE.buildingsV21.filter(b => b.cat === 'D' || b.cat === 'G').map(b => b.id);
if (leftover.length === 0) ok('③ 效能建筑不再有 cat D / G（存储与续航整组 15 项删除）', `现 ${BALANCE.buildingsV21.length} 栋`);
else bad('③ 存储与续航仍有残留', leftover.join(','));

if (BALANCE.v21CapClampIds.length === 0) ok('③ 30% 钳制名单随组 D 清空', '');
else bad('③ 钳制名单未清', BALANCE.v21CapClampIds.join(','));

// 离线续航由离线升级接管：III 级效率（v3.4.6 ⑧：off_cap2 删除、上限 10h 封顶，此处仅查效率）
const offIds = OFF_UPGRADES.map(o => o.id);
if (offIds.includes('off_eff3')) ok('③ 离线升级新增 III（补齐 110% 效率）', `共 ${OFF_UPGRADES.length} 项`);
else bad('③ 离线升级未补齐', offIds.join(','));
S.buildings = {}; S.upgrades = {}; S.milesDone = {}; S.tech = { offline1: true }; S.runTalent = null; S.storyline = 'default';
S.religion = {}; S.delve = { up: {} }; S.prestigePoints = 0; S.offHistory = []; S.offUpgrades = {};
const r0 = offlineRate(); const c0 = offlineCap();
S.offUpgrades = { off_eff1: true, off_eff2: true, off_eff3: true, off_cap1: true };
const r1 = offlineRate(); const c1 = offlineCap();
if (r1 > 1 && Math.abs(r1 - 1.1) < 0.02) ok('③ 离线效率可到 110%（不再依赖建筑）', `${(r0 * 100).toFixed(0)}%→${(r1 * 100).toFixed(0)}%，上限 ${c0 / 3600}h`);
else bad('③ 离线续航口径异常', `${r1} / ${c1}`);
S.offUpgrades = {};

// ===== ④ 高级异兽：购入价 / 升级饼干 / 维持消耗 =====
const P = (id) => PETS.find(p => p.id === id) || {};
if (P('dragon').price === 12000 && P('pixel').price === 36000 && P('ghost').price === 2500) ok('④ 高级异兽购入价大幅上调（龙 3K→12K、深潜者 10K→36K、窥视者 800→2.5K）', '');
else bad('④ 购入价未上调', `${P('dragon').price}/${P('pixel').price}/${P('ghost').price}`);
if (P('hamster').price === 10 && P('cat').price === 50) ok('④ 基础异兽价格不动（庭鼠 10 / 影猫 50）', '');
else bad('④ 基础异兽被误改', `${P('hamster').price}/${P('cat').price}`);

const up1 = petsMod.petPtNeed(10, 1);
const up4 = petsMod.petPtNeed(10, 4);
const up6 = petsMod.petPtNeed(10, 6);
if (up4 > up1 * 1.3 && up6 > up4) ok('④ 升级饼干按档位递增（L10：tier1 < tier4 < tier6）', `${up1} / ${up4} / ${up6} PT`);
else bad('④ 档位加成未生效', `${up1}/${up4}/${up6}`);
if (petsMod.petPtNeed(10, 1) > 20 * Math.pow(1.55, 10)) ok('④ 基础升级成本也上抬（20×1.55 → 30×1.60）', `L10 ${up1} PT（旧 ${Math.floor(20 * Math.pow(1.55, 10))}）`);
else bad('④ 基础升级成本未动', up1);

const upkOld = (lv) => 0.02 * lv; // 旧口径：0.02×等级
const upkNew = (lv, id, gen = 1) => petsMod.petUpkeepPerSec({ level: lv, gen, tier: P(id).tier || 6 }, id);
const d10 = upkNew(10, 'dragon'), d30 = upkNew(30, 'dragon');
if (d10 > upkOld(10) * 2.5 && d30 > upkOld(30) * 2.5) ok('④ 维持消耗大幅上调（深渊龙 L10/L30 均 > 旧口径 ×2.5）', `L10 ${d10.toFixed(2)} vs 旧 ${upkOld(10)} PT/s`);
else bad('④ 维持消耗幅度不足', `${d10.toFixed(2)} / ${d30.toFixed(2)}`);
if (upkNew(20, 'dragon') > upkNew(20, 'hamster') * 1.4) ok('④ 高级异兽维持更贵（龙 L20 > 庭鼠 L20 ×1.4）', `龙 ${upkNew(20, 'dragon').toFixed(2)} vs 庭鼠 ${upkNew(20, 'hamster').toFixed(2)} PT/s`);
else bad('④ 档位维持差不足', `${upkNew(20, 'dragon').toFixed(2)} / ${upkNew(20, 'hamster').toFixed(2)}`);
if (upkNew(20, 'dragon', 3) > upkNew(20, 'dragon', 1) * 1.5) ok('④ 世代越高维持越贵（G3 > G1 ×1.5）', `${upkNew(20, 'dragon', 3).toFixed(2)} vs ${upkNew(20, 'dragon').toFixed(2)}`);
else bad('④ 世代加成异常', '');

// ===== 浏览器实测：底部中央的眼睛 + 异兽卡维持文案 =====
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]); // 否则 headless 默认 reduce 会关掉扫描动画
  const save = {
    _version: 5, ep: 0, rp: 0, pt: 5000, dm: 0, chapter: '8', storyline: 'default',
    abyssGazeUnlocked: true, riftUpgrades: { gaze: 1 }, achievements: {},
    pets: { dragon: { icon: '🐲', name: '深渊龙', level: 20, exp: 0, gen: 1, tier: 4 } },
    activePets: ['dragon'], buildings: {}, upgrades: { storage: 40 }, tech: {}, milesDone: {}, offUpgrades: {},
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now(),
  };
  await page.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), JSON.stringify(save));
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1200);

  const gaze = await page.evaluate(() => {
    const el = document.getElementById('abyss-gaze-crack');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const iris = el.querySelector('.ag-iris');
    const cs = iris ? getComputedStyle(iris) : null;
    return {
      cx: r.left + r.width / 2, w: innerWidth, bottom: r.bottom, h: innerHeight,
      opacity: el.style.opacity,
      anim: cs ? cs.animationName : '',
      hasEye: !!el.querySelector('.ag-eye'),
      hasTentacle: !!el.querySelector('.ag-t'),
    };
  });
  if (gaze && Math.abs(gaze.cx - gaze.w / 2) < 3) ok('② 眼睛水平居中（底部中间，不再在左下角）', `center ${gaze.cx.toFixed(0)} / 视口 ${gaze.w}`);
  else bad('② 眼睛未居中', JSON.stringify(gaze));
  if (gaze && gaze.bottom <= gaze.h && gaze.bottom > gaze.h * 0.85) ok('② 眼睛贴着屏幕底部（不遮挡主内容）', `bottom ${gaze.bottom.toFixed(0)} / ${gaze.h}`);
  else bad('② 眼睛垂直位置异常', gaze ? `${gaze.bottom}/${gaze.h}` : 'null');
  if (gaze && gaze.anim === 'ag-scan' && gaze.hasEye && !gaze.hasTentacle) ok('② 只保留一只眼睛 + 左右打量动画（触手/裂隙已移除）', `animation=${gaze.anim}`);
  else bad('② 动画/结构不符', JSON.stringify({ a: gaze && gaze.anim, eye: gaze && gaze.hasEye, t: gaze && gaze.hasTentacle }));

  // 深渊凝视卡面文案
  const gazeDesc = await page.evaluate(() => {
    const s = window.S;
    s.riftEmber = 999; window.__gameDirty.rift = true;
    return new Promise(res => setTimeout(() => {
      const row = document.querySelector('[data-rift-upg="gaze"]');
      res(row ? row.textContent : '');
    }, 900));
  });
  if (gazeDesc.includes('???') && !gazeDesc.includes('回望你')) ok('② 裂隙升级卡文案显示「???」（不再剧透）', gazeDesc.replace(/\s+/g, ' ').slice(0, 60));
  else bad('② 卡面文案未替换', gazeDesc.slice(0, 80));

  // 异兽卡：高级异兽维持消耗显示
  await page.evaluate(() => document.getElementById('btn-pets')?.click());
  await sleep(700);
  const petInfo = await page.evaluate(() => {
    const grid = document.getElementById('pet-grid');
    return { txt: grid ? grid.innerText.replace(/\n/g, ' | ') : '', cards: grid ? grid.querySelectorAll('[data-pet-up]').length : 0 };
  });
  const m = petInfo.txt.match(/维持 -([\d.]+) PT\/s/);
  if (m && parseFloat(m[1]) > 0.8) ok('④ 异兽卡显示新的维持消耗（深渊龙 L20）', `维持 -${m[1]} PT/s`);
  else bad('④ 维持文案异常', petInfo.txt.slice(0, 120));

  if (errs.length === 0) ok('页面无 JS 报错');
  else bad('页面报错', errs.join(' | ').slice(0, 160));
} finally {
  await browser.close();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
