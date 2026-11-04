// v3.4.4 反馈回归（3 项，只覆盖受影响面）
// ① 矩阵存储库 / 饵料仓库 / 星尘金库：上限改「逐级扩容」——首级 +400/+200/+100，之后逐级 ×1.15
//    （原为恒定线性：买多少级都是同一口增量，仓库深买毫无递增收益）
// ② EP 存储单位价重排：前期「存储节点」更便宜，L11 起「备用粮仓」反超更划算；
//    顺带纠正「深井仓储」5e4 换 +80 万（0.06 EP/点，比存储节点便宜 48 倍）的异常单位价
// ③ v3.4.2 新增的 10 项研究升级大幅涨价（base ×4、growth +0.10）——效果本就强于同轴老项
import puppeteer from 'puppeteer-core';
const { BALANCE } = await import('../src/data/balance.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };
const U = (id) => UPGRADES.find(x => x.id === id) || {};
const R = (id) => BALANCE.researchUpgs.find(x => x.id === id) || {};

// ===== ① 三仓库上限：逐级扩容（配置 + 运行时同口径）=====
// 增量 = capPer × 1.15^(lv-1)：L1 +400 / L2 +460 / L3 +529 → 累计 1,389（旧口径恒 400×3=1,200）
// 注意：分母必须写成 (1.15 - 1) 与 economy.vaultCap 同序，否则 1.15-1=0.1499999… 的浮点差会让 round 差 1
const VG = 1.15;
const expCap = (base, per, lv) => Math.round(base + per * (Math.pow(VG, lv) - 1) / (VG - 1));

// ===== ② 存储单位价阶梯（EP/点）=====
const ST = BALANCE.storage;
const epPerPt = (base, growth, gain, n) => base * Math.pow(growth, n - 1) / gain;
const stPt = (n) => epPerPt(ST.base, ST.growth, ST.capPer * Math.pow(ST.capGrowth, n - 1), n);
const rb = U('reserve_bin');
const db = U('deep_bin');
const rbPt = (n) => epPerPt(rb.base, rb.growth, 12000, n);
const dbPt = (n) => epPerPt(db.base, db.growth, 8e5, n);

if (rb.base > ST.base) ok('② 粮仓首购价高于存储节点（按价格先买存储节点）', `粮仓 ${rb.base} vs 存储 ${ST.base} EP`);
else bad('② 首购价倒挂', `粮仓 ${rb.base} vs 存储 ${ST.base}`);
if (stPt(1) < rbPt(1)) ok('② L1 存储节点单价更低（前期存储节点）', `存储 ${stPt(1).toFixed(2)} vs 粮仓 ${rbPt(1).toFixed(2)} EP/点`);
else bad('② L1 单价倒挂', `存储 ${stPt(1).toFixed(2)} vs 粮仓 ${rbPt(1).toFixed(2)}`);
if (rbPt(11) < stPt(11)) ok('② L11 粮仓单价反超（后期粮仓）', `粮仓 ${rbPt(11).toFixed(2)} vs 存储 ${stPt(11).toFixed(2)} EP/点`);
else bad('② L11 粮仓未反超', `粮仓 ${rbPt(11).toFixed(2)} vs 存储 ${stPt(11).toFixed(2)}`);
if (stPt(6) > stPt(1) && rbPt(6) > rbPt(1)) ok('② 两条曲线单价均单调递增（无买得越多越便宜）', `存储 ${stPt(1).toFixed(1)}→${stPt(6).toFixed(1)} / 粮仓 ${rbPt(1).toFixed(1)}→${rbPt(6).toFixed(1)}`);
else bad('② 单价非单调', `存储 ${stPt(1).toFixed(1)}→${stPt(6).toFixed(1)} / 粮仓 ${rbPt(1).toFixed(1)}→${rbPt(6).toFixed(1)}`);
// 深井仓储（科技 storage3 门控的后期大宗扩容）：单位价必须回到合理区间（原 0.06 EP/点）
if (dbPt(1) > 1 && dbPt(20) < rbPt(20)) ok('② 深井仓储纠正异常单位价（L1 不再 0.06 EP/点）', `深井 L1 ${dbPt(1).toFixed(2)} / L20 ${dbPt(20).toFixed(1)} EP/点`);
else bad('② 深井仓储单位价异常', `深井 L1 ${dbPt(1).toFixed(2)} / L20 ${dbPt(20).toFixed(1)}`);

// ===== ③ 新增研究项涨价 =====
const NEW = ['rp_quantum', 'rp_swarm', 'rp_harmony', 'rp_frugal', 'rp_vault', 'rp_immerse', 'rp_relay', 'rp_void', 'rp_observe', 'rp_disciple'];
const lowBase = NEW.filter(id => R(id).base < 280);
const lowGrow = NEW.filter(id => R(id).growth < 1.70);
if (lowBase.length === 0) ok('③ 新增 10 项研究首级价 ≥280 RP（原 70~220）', `量子推演 ${R('rp_quantum').base} / 信徒训导 ${R('rp_disciple').base} RP`);
else bad('③ 仍有首级价过低项', lowBase.map(id => `${id}:${R(id).base}`).join('，'));
if (lowGrow.length === 0) ok('③ 新增 10 项研究增长指数 ≥1.70（原 1.60~1.80）', `量子推演 ×${R('rp_quantum').growth} / 信徒训导 ×${R('rp_disciple').growth}`);
else bad('③ 仍有增长指数过低项', lowGrow.map(id => `${id}:${R(id).growth}`).join('，'));
const totalNew = NEW.reduce((s, id) => { const u = R(id); let t = 0; for (let i = 0; i < u.cap; i++) t += u.base * Math.pow(u.growth, i); return s + t; }, 0);
if (totalNew >= 3e5) ok('③ 新增 10 项满级总投入 ≥30 万 RP', `≈${Math.round(totalNew / 1000)}K RP`);
else bad('③ 满级总投入不足', `${Math.round(totalNew)} RP`);
// 老项价格不动（对照：熵减研究 50 / 奇点推演 80 / 裂隙数学 120）
const oldSame = R('rp_entropy').base === 50 && R('rp_singularity').base === 80 && R('rp_rift').base === 120;
if (oldSame) ok('③ 原有 10 项研究价格不变（只涨近期新增）', '熵减 50 / 奇点 80 / 裂隙 120 RP');
else bad('③ 老项价格被误改', `${R('rp_entropy').base}/${R('rp_singularity').base}/${R('rp_rift').base}`);

// ===== 浏览器：上限逐级扩容实跑 + 研究卡价格链路 =====
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  const cap = await page.evaluate(() => {
    const S = window.S, qa = window.__qa;
    S.upgrades = S.upgrades || {};
    const read = (id, fn) => [0, 1, 2, 3].map(lv => { S.upgrades[id] = lv; return fn(); });
    const out = {
      rp: read('rp_vault', qa.rpCap),
      dm: read('dm_vault', qa.dmCap),
      pt: read('pt_vault', qa.ptCap),
    };
    S.upgrades.rp_vault = 0; S.upgrades.dm_vault = 0; S.upgrades.pt_vault = 0;
    return out;
  });
  for (const [key, label, base, per] of [['rp', 'RP', 2500, 400], ['dm', 'DM', 1000, 100], ['pt', 'PT', 1000, 200]]) {
    const got = cap[key];
    const want = [0, 1, 2, 3].map(lv => expCap(base, per, lv));
    const d1 = got[1] - got[0], d2 = got[2] - got[1], d3 = got[3] - got[2];
    if (JSON.stringify(got) === JSON.stringify(want)) ok(`① ${label} 上限逐级扩容（+${d1}/+${d2}/+${d3}）`, `${got.join(' → ')}`);
    else bad(`① ${label} 上限口径`, `实得 ${got.join('/')} 期望 ${want.join('/')}`);
    if (d3 > d1) ok(`① ${label} 单级增量随级数递增（不是恒定 +${per}）`, `${d1} → ${d3}`);
    else bad(`① ${label} 增量未递增`, `${d1} → ${d3}`);
  }
  if (cap.rp[3] !== 2500 + 3 * 400) ok('① 3 级总量高于旧线性口径（旧 3,700 → 新 ' + cap.rp[3] + '）');
  else bad('① 与旧线性口径无差异', String(cap.rp[3]));

  // 研究卡：新增项首级 280 RP、老项仍 50 RP；买一级后次价 = ceil(280×1.7)=476
  const res = await page.evaluate(async () => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { rp_vault: 6, atrium: 1 });
    S._rpOverflowSeen = true; S.resDiscovered = Object.assign({}, S.resDiscovered, { rp: true });
    S.rpTheories = {};
    S.rp = 5000;
    window.__gameDirty.shop = true;
    document.getElementById('btn-rp')?.click();
    await new Promise(r => setTimeout(r, 800));
    const card = (id) => document.querySelector(`[data-research="${id}"]`);
    const cq = card('rp_quantum')?.querySelector('.cost')?.textContent || '';
    const ce = card('rp_entropy')?.querySelector('.cost')?.textContent || '';
    card('rp_quantum')?.click();
    await new Promise(r => setTimeout(r, 800));
    const after = card('rp_quantum')?.querySelector('.cost')?.textContent || '';
    return { cq, ce, after, lv: S.rpTheories?.rp_quantum || 0, rp: S.rp };
  });
  if (/280/.test(res.cq)) ok('③ 研究卡显示新价（量子推演 280 RP）', res.cq.trim());
  else bad('③ 量子推演卡价', JSON.stringify(res.cq));
  if (/^50\s*RP/.test(res.ce.trim())) ok('③ 老项卡价不变（熵减研究 50 RP）', res.ce.trim());
  else bad('③ 熵减研究卡价', JSON.stringify(res.ce));
  if (res.lv === 1 && /476/.test(res.after)) ok('③ 购入一级后次价 476 RP（×1.70 增长）', res.after.trim());
  else bad('③ 购买链路', `lv=${res.lv} cost=${JSON.stringify(res.after)}`);

  if (errs.length === 0) ok('无 JS 运行时报错');
  else bad('页面报错', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n===== v3.4.4 反馈回归：${pass}/${pass + fail} 通过 =====`);
process.exit(fail ? 1 : 0);
