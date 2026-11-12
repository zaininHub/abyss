// v3.4.6 反馈回归（13 项，只覆盖受影响面）
// ①  虚空之隙 Lv.10 Lv.10 重复显示修复
// ②  深渊终局研究组 4 项大幅涨价
// ③  星图 CPS（星际燃料）：探索消耗 EP/RP/PT + 出战异兽加成 → CPS；殖民/宇宙探索烧 CPS；燃料模式全局 ×1.5
// ④  裂隙等级卡文案：具体数值展示下一级
// ⑤  班组加成 RP 过速封顶 ×2 + 卡面「+0 RP/s」文案修复
// ⑥  班组面板岗位筛选
// ⑦  RP/PT 满仓涓流：每 5s -50K EP → +0.01
// ⑧  离线上限硬封顶 10h（off_cap2 删除）
// ⑨  深渊凝视/宠物动画压到最底层、缩小
// ⑩  删除路边神龛（信仰锚点改判）
// ⑪  高级异兽维持继续增长（tier≥3 十级起 ≥1 PT/s）
// ⑫  备用粮仓/存储节点曲线对调（粮仓先解锁）
// ⑬  量子仓储大幅涨价且存储额增多
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';
const { BALANCE } = await import('../src/data/balance.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const { OFF_UPGRADES } = await import('../src/data/offlineUpgrades.js');
const { S } = await import('../src/state.js');
const { offlineCap, epStorageCap, globalMult, rpProdPerSec, rpEffScale } = await import('../src/modules/economy.js');
const economy = await import('../src/modules/economy.js');
const riftMod = await import('../src/modules/rift.js');
const expeditionMod = await import('../src/modules/expedition.js');
const cosmosMod = await import('../src/modules/cosmos.js');
const petsMod = await import('../src/modules/pets.js');
const threadBinding = await import('../src/modules/threadBinding.js');
const CHROME = chromePath(); // 跨平台 Chrome 路径（优先 CHROME_PATH，其次按平台探测）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };
const U = (id) => UPGRADES.find(x => x.id === id) || {};

function resetEco() {
  S.buildings = {}; S.upgrades = {}; S.milesDone = {}; S.tech = {}; S.runTalent = null;
  S.storyline = 'default'; S.religion = {}; S.delve = { up: {} }; S.prestigePoints = 0;
  S.echoUpgrades = {}; S.cultists = []; S.converterOn = { vehicles: true, atrium: true };
}

// ===== ① 虚空之隙重复显示 =====
if (riftMod.riftLevelName(10) === '虚空之隙' && !riftMod.riftLevelName(10).includes('Lv.')) ok('① riftLevelName(>5) 不再内嵌 Lv.N', riftMod.riftLevelName(10));
else bad('① 仍有内嵌等级', riftMod.riftLevelName(10));
const riftSrc = (await import('fs')).readFileSync('src/modules/rift.js', 'utf8');
if (/riftLevelName\(r\.level\)\} <b/.test(riftSrc) && !/虚空之隙 Lv\.\$\{/.test(riftSrc)) ok('① 裂隙卡名称与 Lv 只显示一次', '');
else bad('① 裂隙卡拼接仍可能重复', '');

// ===== ② 深渊终局组大幅涨价 =====
const ABYSS = [
  ['rp_delve', 650, 1.8], ['rp_rift', 800, 1.8],
];
const wrongA = ABYSS.filter(([id, base, g]) => {
  const u = BALANCE.researchUpgs.find(x => x.id === id);
  return !u || u.base !== base || u.growth !== g;
});
if (wrongA.length === 0) ok('② 深渊终局组 base/growth 全量重标', `最低 ${ABYSS[0][1]} RP · 最高 ${ABYSS[ABYSS.length - 1][1]} RP`);
else bad('② 深渊终局数值不符', wrongA.map(([id]) => id).join('，'));
// v3.12.11 反馈②：RP 同质化削减——深渊终局组从 4 项缩为 2 锚点（rp_delve/rp_rift），
// 但二者保留 v3.4.6 高价定位。原「×5 vs 4 项旧口径」比较已随设计变更失效，
// 改为校验「2 锚点满级总投入仍是大型 RP 消耗口（≥15 万）」。
const newTotal = ABYSS.reduce((a, [id, base, g]) => {
  const u = BALANCE.researchUpgs.find(x => x.id === id);
  let t = 0; for (let i = 0; i < u.cap; i++) t += base * Math.pow(g, i); return a + t;
}, 0);
if (newTotal >= 150000) ok('② 深渊终局 2 锚点满级总投入仍为大型 RP 消耗口', `≈${Math.round(newTotal)} RP（保留 v3.4.6 高价定位）`);
else bad('② 深渊终局消耗口过小', `≈${Math.round(newTotal)} RP`);

// ===== ⑬ 存储协议（研究点锚点）存在且为 storage 轴唯一项 =====
const qv = BALANCE.researchUpgs.find(x => x.id === 'rp_storage');
if (qv && qv.base === 90 && qv.growth === 1.65 && qv.fx.v === 0.08 && qv.desc.includes('8%')) ok('⑬ 存储协议 = storage 轴锚点（EP 存储 +8%/级）', `${qv.desc}`);
else bad('⑬ 存储协议锚点异常', JSON.stringify(qv));

// ===== ⑫ 备用粮仓/存储节点曲线对调 =====
const st = U('storage'), rb = U('reserve_bin');
if (rb.base === 12000 && rb.growth === 1.45 && rb.maxLevel === 20 && st.base === 45000 && st.growth === 1.20 && !st.maxLevel) ok('⑫ 粮仓（12K/+4000×1.18/20 级）先于存储节点（45K/+12000/无限）', '');
else bad('⑫ 曲线对调未生效', `rb ${rb.base}/${rb.growth}/${rb.maxLevel || '-'} · st ${st.base}/${st.growth}/${st.maxLevel || '-'}`);
resetEco();
S.upgrades.reserve_bin = 0;
const cap0 = epStorageCap();
S.upgrades.reserve_bin = 1;
const cap1 = epStorageCap();
S.upgrades.reserve_bin = 0;
S.upgrades.storage = 1;
const capS1 = epStorageCap();
S.upgrades.storage = 0;
if (cap1 - cap0 === 4000 && capS1 - cap0 === 12000) ok('⑫ 上限增量对调（粮仓 +4,000/级 · 存储节点 +12,000/级）', `粮仓 +${cap1 - cap0} · 存储 +${capS1 - cap0}`);
else bad('⑫ 上限增量不符', `粮仓 +${cap1 - cap0} · 存储 +${capS1 - cap0}`);
if (UPGRADES.findIndex(u => u.id === 'reserve_bin') < UPGRADES.findIndex(u => u.id === 'storage')) ok('⑫ 链序：备用粮仓定义在存储节点之前（先解锁先显示）', '');
else bad('⑫ 链序未对调', '');
const shopSrc = (await import('fs')).readFileSync('src/modules/shop.js', 'utf8');
if (shopSrc.includes("u.id === 'reserve_bin') return true")) ok('⑫ 防死锁关键件钉死可见 = 备用粮仓', '');
else bad('⑫ 钉死可见项未切换', '');

// ===== ⑩ 路边神龛删除 =====
if (!U('shrine').id) ok('⑩ 路边神龛升级项已删除', '');
else bad('⑩ 神龛仍存在', U('shrine').name);
const discSrc = (await import('fs')).readFileSync('src/modules/disclosure.js', 'utf8');
if (discSrc.includes('S.religion && S.religion.unlocked) || (S.faith || 0) > 0')) ok('⑩ 信仰锚点改判（宗教解锁 / 持有 FP / 旧档神龛）', '');
else bad('⑩ 信仰锚点未改', '');

// ===== ④ 裂隙等级卡具体数值文案 =====
if (riftSrc.includes('深入消耗') && riftSrc.includes('delveEpPerSec') && !riftSrc.includes('DM/RP/余烬同步提升')) ok('④ 裂隙等级卡改「裂隙等级 +1 · 深入消耗 X EP/s」（具体数值展示下一级）', '');
else bad('④ 裂隙等级卡文案未改', '');

// ===== ⑧ 离线上限 10h =====
const offIds = OFF_UPGRADES.map(o => o.id);
resetEco();
if (!offIds.includes('off_cap2')) ok('⑧ off_cap2 已删除', `现 ${OFF_UPGRADES.length} 项`);
else bad('⑧ off_cap2 仍在', '');
S.offUpgrades = { off_cap1: true, off_cap2: true };
if (offlineCap() === 10 * 3600) ok('⑧ 离线上限硬封顶 10h（含旧档 off_cap2 存量）', `${offlineCap() / 3600}h`);
else bad('⑧ 上限未钳制', `${offlineCap() / 3600}h`);
S.offUpgrades = {};

// ===== ⑤ 班组加成封顶 ×2 + 文案 =====
resetEco();
S.upgrades.atrium = 14;
S.cultists = Array.from({ length: 6 }, (_, i) => ({ id: 't' + i, name: '线程' + i, mood: '正常', profession: 'distiller', level: 3, boundTo: 'atrium', leader: i === 0, hiredAt: Date.now() }));
const boostRaw = threadBinding.converterThreadBoost('atrium');
const prodCapped = rpProdPerSec();
const expected = 0.15 * 14 * Math.min(boostRaw, 2);
if (Math.abs(prodCapped - expected) < 1e-9) ok('⑤ 蒸馏班组加成封顶 ×2（rpProdPerSec 与 tick 同口径）', `raw boost ${boostRaw.toFixed(2)} → 生效 ${Math.min(boostRaw, 2)}`);
else bad('⑤ 封顶未生效', `${prodCapped} vs ${expected}`);
const rpPerSCard = 0.15 * 14 * Math.min(boostRaw, 2) / rpEffScale();
if (rpPerSCard > 0.1) ok('⑤ 卡面产出 >0（「+0 RP/s」文案根因修复）', `${rpPerSCard.toFixed(2)} RP/s`);
else bad('⑤ 卡面仍近 0', rpPerSCard);
S.upgrades.atrium = 0; S.cultists = [];

// ===== ⑪ 高级异兽维持：10 级起 ≥1 PT/s =====
const upk = (lv, tier) => petsMod.petUpkeepPerSec({ level: lv, gen: 1, tier }, 'x');
const t3lv10 = upk(10, 3), t4lv10 = upk(10, 4), t1lv10 = upk(10, 1);
if (t3lv10 >= 1 && t4lv10 >= 1 && t4lv10 > t3lv10) ok('⑪ tier≥3 十级维持 ≥1 PT/s 且档位递增', `t3 ${t3lv10.toFixed(2)} / t4 ${t4lv10.toFixed(2)} PT/s`);
else bad('⑪ 维持不足', `${t3lv10} / ${t4lv10}`);
if (t1lv10 < 1 && t1lv10 > 0.5) ok('⑪ 基础兽十级维持仍亲民（0.5~1 PT/s）', `${t1lv10.toFixed(2)} PT/s`);
else bad('⑪ 基础兽维持异常', t1lv10);

// ===== ③ 星图 CPS =====
const G = expeditionMod.GALAXIES;
const allCps = G.every(g => g.cps > 0 && g.cost && Number.isFinite(g.cost.ep) && !g.reward);
if (allCps) ok('③ 星图探索全部改为「消耗 EP/RP/PT → 产出 CPS」', `6 星系 · 月球 ${G[0].cost.ep} EP → +${G[0].cps} CPS`);
else bad('③ GALAXIES 未改造', JSON.stringify(G[0]));
const edge = G.find(g => g.id === 'andromeda');
if (edge.es === 10) ok('③ 仙女座保留 ES 奖励（+10 ES）', '');
else bad('③ ES 奖励丢失', edge && edge.es);
// 出战异兽随队加成
resetEco();
S.pets = { a: { icon: '🐱', name: '猫', level: 1, exp: 0, gen: 1, tier: 1 }, b: { icon: '🐲', name: '龙', level: 1, exp: 0, gen: 1, tier: 4 } };
S.activePets = ['a', 'b'];
const petBonus = expeditionMod.petCpsBonus();
if (Math.abs(petBonus - 1.2) < 1e-9) ok('③ 出战异兽随队：每只 +10%（2 只 ×1.2）', `×${petBonus}`);
else bad('③ 随队加成异常', petBonus);
// 殖民/宇宙探索烧 CPS
const colony = BALANCE.starColonies[0];
const colonyCost = Math.ceil(colony.base * Math.pow(colony.growth, 0));
S.starCps = colonyCost;
resetEco(); S.starCps = colonyCost;
const expSrc = (await import('fs')).readFileSync('src/modules/expedition.js', 'utf8');
if (expSrc.includes('CPS') && expSrc.includes('starCps -= cost')) ok('③ 深空殖民改烧 CPS', `近地殖民站首级 ${colonyCost} CPS`);
else bad('③ 殖民未改 CPS', '');
const cosmosCost = cosmosMod.cosmosCost(cosmosMod.COSMOS.asteroid, 0);
if (cosmosCost === 60 && cosmosMod.COSMOS.asteroid.baseCps === 60) ok('③ 宇宙探索工程改烧 CPS（小行星采矿首级 60 CPS）', '');
else bad('③ 宇宙探索未改', cosmosCost);
// 燃料模式全局 ×1.5
resetEco();
const g0 = globalMult();
S.fuelMode = true; S.starCps = 100;
const g1 = globalMult();
if (Math.abs(g1 / g0 - 1.5) < 1e-9) ok('③ 燃料模式：全局产出 ×1.5（每秒 -2 CPS）', `×${(g1 / g0).toFixed(2)}`);
else bad('③ 燃料乘区未接线', `${g0} → ${g1}`);
S.fuelMode = false; S.starCps = 0;

// ===== 浏览器实测 =====
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const save = {
    _version: 5, ep: 5e6, rp: 500, pt: 5000, dm: 50, chapter: '8', storyline: 'default',
    abyssGazeUnlocked: true, riftUpgrades: { gaze: 1 }, riftLevelTech: 9, riftsSealed: 3, _riftSeen: true, achievements: {},
    pets: { dragon: { icon: '🐲', name: '深渊龙', level: 20, exp: 0, gen: 1, tier: 4 } },
    activePets: ['dragon'], buildings: {}, upgrades: { atrium: 14, reserve_bin: 20, storage: 20, deep_bin: 5 }, tech: {}, milesDone: {}, offUpgrades: {},
    starCps: 3000,
    // v3.6.2：班组面板 ≥10 线程解锁——补足 12 条以满足门槛（本测试聚焦岗位筛选，门槛由 v362 覆盖）
    cultists: Array.from({ length: 12 }, (_, i) => ({ id: 't' + i, name: '线程' + i, profession: 'distiller', level: 3, mood: '正常', boundTo: 'atrium', leader: i === 0, hiredAt: Date.now() })),
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now(),
  };
  await page.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), JSON.stringify(save));
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);

  // ① 裂隙等级卡（Lv.9 → 名字不重复）
  const riftCard = await page.evaluate(() => {
    const el = document.querySelector('[data-rift-level]');
    return el ? { txt: el.textContent.replace(/\s+/g, ' '), desc: (el.querySelector('.desc') || {}).textContent || '' } : null;
  });
  if (riftCard && riftCard.desc.includes('深入消耗')) ok('④ 浏览器：裂隙等级卡展示下一级深入消耗具体数值', riftCard.desc.trim());
  else bad('④ 裂隙等级卡文案异常', riftCard && riftCard.txt.slice(0, 80));

  // ⑨ 眼睛压底层缩小
  const gaze = await page.evaluate(() => {
    const el = document.getElementById('abyss-gaze-crack');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, z: getComputedStyle(el).zIndex, pe: getComputedStyle(el).pointerEvents, cx: r.left + r.width / 2, bottom: r.bottom, h: innerHeight };
  });
  if (gaze && gaze.w <= 160 && gaze.z === '1' && gaze.pe === 'none') ok('⑨ 深渊凝视缩小至 ≤160px 且 z-index:1 最底层', `w ${Math.round(gaze.w)} · z ${gaze.z}`);
  else bad('⑨ 凝视尺寸/层级不符', JSON.stringify(gaze));

  // ⑨ 宠物浮标缩小 + 底层
  const pf = await page.evaluate(() => {
    const el = document.querySelector('.pet-float .pet-item');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cont = el.closest('.pet-float');
    return { w: r.width, z: getComputedStyle(cont).zIndex };
  });
  if (pf && pf.w <= 32 && parseInt(pf.z) <= 5) ok('⑨ 宠物浮标缩小 ≤32px 且压到最底层', `w ${Math.round(pf.w)} · z ${pf.z}`);
  else bad('⑨ 宠物浮标尺寸/层级不符', JSON.stringify(pf));

  // ⑩ 神龛不再出现在商店
  const shrineGone = await page.evaluate(() => {
    window.__gameDirty.shop = true;
    return new Promise(res => setTimeout(() => {
      const txt = document.body.innerText;
      res(!txt.includes('路边神龛'));
    }, 900));
  });
  if (shrineGone) ok('⑩ 页面不再出现「路边神龛」', '');
  else bad('⑩ 神龛仍在页面', '');

  // ③ 星图页：CPS 头部 + 燃料模式开关 + 目的地消耗列
  await page.evaluate(() => document.getElementById('btn-expedition')?.click());
  await sleep(900);
  const star = await page.evaluate(() => {
    const p = document.getElementById('expedition-panel');
    if (!p) return null;
    return {
      txt: p.innerText.replace(/\s+/g, ' '),
      fuelBtn: !!p.querySelector('[data-fuel-toggle]'),
    };
  });
  if (star && star.fuelBtn && star.txt.includes('星际燃料')) ok('③ 星图头部显示星际燃料 CPS + 燃料模式开关', star.txt.match(/星际燃料（CPS）：[\d,.]+/)?.[0] || '');
  else bad('③ 星图 CPS 头部缺失', star && star.txt.slice(0, 120));
  if (star && star.txt.includes('出发消耗') && star.txt.includes('EP')) ok('③ 目的地卡展示出发消耗（EP/RP/PT）与 CPS 奖励', '');
  else bad('③ 目的地消耗未展示', star && star.txt.slice(0, 160));
  // 燃料模式开启 → 全局加成
  await page.evaluate(() => document.querySelector('[data-fuel-toggle]')?.click());
  await sleep(400);
  const fuelOn = await page.evaluate(() => ({ on: window.S.fuelMode, cps: window.S.starCps }));
  if (fuelOn.on && fuelOn.cps < 3000) ok('③ 燃料模式可开启且 CPS 持续燃烧', `CPS ${Math.round(fuelOn.cps)}`);
  else bad('③ 燃料模式未生效', JSON.stringify(fuelOn));

  // ⑥ 班组岗位筛选
  await page.evaluate(() => document.getElementById('btn-shop')?.click());
  await sleep(500);
  const crew = await page.evaluate(() => {
    const host = document.getElementById('crew-panel');
    if (!host) return null;
    const filterRow = host.querySelector('[data-crew-filter]');
    const ids = window.__qa.threadBind.unlockedConverterIds();
    return { hasFilter: !!filterRow, btns: filterRow ? filterRow.querySelectorAll('[data-crew-filter-btn]').length : 0, ids };
  });
  // v3.6.3 ③：筛选按钮 = 全部/空闲 + 已解锁岗位（超线程恒解锁，未解锁模块对应岗位不展示）
  if (crew && crew.hasFilter && crew.btns === 2 + crew.ids.length) ok('⑥ 岗位筛选只列已解锁岗位（全部/空闲 + 可见岗位）', `${crew.btns} 项，岗位=${crew.ids.join(',')}`);
  else bad('⑥ 岗位筛选缺失或列出未解锁岗位', JSON.stringify(crew));

  // ⑤ 灵感工坊卡面产出非 0
  await page.evaluate(() => document.getElementById('btn-rp')?.click());
  await sleep(800);
  const atriumTxt = await page.evaluate(() => {
    const el = document.querySelector('.atrium-distill');
    return el ? el.textContent.replace(/\s+/g, ' ') : '';
  });
  const am = atriumTxt.match(/\+([\d.]+) RP\/s/);
  if (am && parseFloat(am[1]) > 0) ok('⑤ 灵感工坊卡面显示实际 RP/s（不再 +0）', `+${am[1]} RP/s`);
  else bad('⑤ 卡面产出仍为 0', atriumTxt.slice(0, 100));

  // ⑦ RP 满仓涓流：满仓后每 5s 一条 -50K EP → +0.01 RP（不再完全断流也不再满速烧 EP）
  const trickle = await page.evaluate(() => {
    window.S.rp = 1e12; // 必满仓（rpCap 远小于此）
    window.S.ep = 3e5;  // 迁移后 EP 被钳到上限，涓流门槛 50K 需要足额存量
    window.S.fuelMode = false;
    const epBefore = window.S.ep;
    return new Promise(res => setTimeout(() => {
      res({ epDelta: epBefore - window.S.ep, rp: window.S.rp });
    }, 6200));
  });
  if (trickle.epDelta > 40000 && trickle.epDelta < 70000) ok('⑦ RP 满仓涓流生效（约 5s 一条 -50K EP）', `-EP ${Math.round(trickle.epDelta)}`);
  else bad('⑦ 涓流消耗口径异常', JSON.stringify(trickle));

  if (errs.length === 0) ok('页面无 JS 报错');
  else bad('页面报错', errs.join(' | ').slice(0, 160));
} finally {
  await browser.close();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
