// v3.4.9 反馈回归（9 项，只覆盖受影响面）
// ① 无限深入开关移到左侧「自动转化」
// ② 新增昂贵余烬升级「自动净化仪」（需先买无限深入；开关同在自动转化）
// ③ 数量受限项统一「当前/上限」文案（轮回圣殿等，与设施其他建筑一致）
// ④ 裂隙升级主要抬净化 EP 成本，深入速度只略微提升
// ⑤ EP 上限与线程解耦（v3.6.3 起：结构性溢出 ×4，旧 2 小时时间基座已移除）
// ⑥ 星图 RP/TP 与 EP 同量级（RP/PT 仓容跟随 EP 上限）
// ⑦ 进入深渊后不再显示「下一次裂隙 … 后出现」
// ⑧ FP 显示「当前 / 上限」，圣所注明上限来源
// ⑨ 贿赂深渊后吞噬横幅清除
import puppeteer from 'puppeteer-core';
// Node 侧购买路径会走 state.save()（写 localStorage）——先注入最小桩，再动态载入业务模块
globalThis.localStorage = globalThis.localStorage || {
  _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};
const { BALANCE } = await import('../src/data/balance.js');
const { S } = await import('../src/state.js');
const { epStorageCap, computeCps, rpCap, ptCap } = await import('../src/modules/economy.js');
const { riftRewardMult, riftPurgeCostMult, riftUpgradeCost, buyRiftUpgrade } = await import('../src/modules/rift.js');
const { GALAXIES } = await import('../src/modules/expedition.js');
const { faithCap } = await import('../src/data/religions.js');

const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

// ===== ① / ② 数据与购买前置（Node 侧，纯函数）=====
{
  const u = BALANCE.rift.upgrades;
  if (u.auto_descent && u.auto_purify) ok('① ② 科技树保留「无限深入」「自动净化仪」两件', Object.keys(u).join(','));
  else bad('① ② 升级项缺失', Object.keys(u).join(','));
  if (u.auto_purify.emberBase === 1200) ok('② 自动净化仪定价昂贵（1200 余烬起）', `cap ${u.auto_purify.cap}`);
  else bad('② 自动净化仪未定价', JSON.stringify(u.auto_purify));
  if (/自动转化/.test(u.auto_descent.desc) && /自动转化/.test(u.auto_purify.desc)) ok('① ② 两件都注明「开关在左侧自动转化」', '');
  else bad('① ② 卡面未指引开关位置', `${u.auto_descent.desc} | ${u.auto_purify.desc}`);

  // 购买前置：没有无限深入时不能买自动净化
  S.riftUpgrades = {}; S.riftEmber = 1e6;
  const r1 = buyRiftUpgrade('auto_purify');
  if (r1.ok === false && /无限深入/.test(r1.reason || '')) ok('② 未购无限深入时自动净化仪被拦截', r1.reason);
  else bad('② 前置校验缺失', JSON.stringify(r1));
  const c1 = riftUpgradeCost('auto_purify');
  if (c1 === 1200) ok('② 首级价 = 1200 余烬', `${c1}`);
  else bad('② 首级价异常', `${c1}`);
  buyRiftUpgrade('auto_descent');
  const r2 = buyRiftUpgrade('auto_purify');
  if (r2.ok === true) ok('② 买到无限深入后可购自动净化仪', `余烬余 ${S.riftEmber}`);
  else bad('② 前置满足后仍买不到', JSON.stringify(r2));
  S.riftUpgrades = {}; S.riftEmber = 0;
}

// ===== ④ 裂隙升级：奖励只略升，净化成本大幅抬升 =====
{
  if (BALANCE.rift.delveRewardGrowth === 0.15) ok('④ 深入奖励 +15%/级（原 ×lv）', '');
  else bad('④ 奖励增速未调整', `${BALANCE.rift.delveRewardGrowth}`);
  const r1 = riftRewardMult(1), r10 = riftRewardMult(10);
  if (Math.abs(r1 - 1) < 1e-9 && Math.abs(r10 - 2.35) < 1e-9) ok('④ 奖励倍率 Lv1 ×1 → Lv10 ×2.35', `${r10}`);
  else bad('④ 奖励倍率异常', `${r1}/${r10}`);
  S.riftUpgrades = {}; S.upgrades = { ...(S.upgrades || {}) };
  S.cultists = [];
  const m1 = riftPurgeCostMult();
  if (Math.abs(m1 - 1) < 1e-9) ok('④ Lv1 净化成本倍率 = 1（不额外加价）', `${m1}`);
  else bad('④ Lv1 净化倍率异常', `${m1}`);
  if (BALANCE.rift.purgeCostPerLevel === 0.30) ok('④ 净化成本 +30%/裂隙级（Lv10 ×3.7）', '');
  else bad('④ 净化成本曲线未定义', `${BALANCE.rift.purgeCostPerLevel}`);
}

// ===== ⑤ EP 上限：与线程数量/状态彻底解耦 =====
// v3.6.3 ①：旧「cps × 2 小时」时间基座已移除——cps 内含线程派生项，会让上限随
//   线程流失/心情/薪资状态抖动。现改为「首次溢出后按结构性上限 ×4」，只认结构性投入。
{
  S._rpOverflowSeen = true;
  S.upgrades = { ...(S.upgrades || {}), storage: 0, reserve_bin: 0, deep_bin: 0, cache: 0 };
  S.buildings = {};
  S.milesDone = {};
  S.storyline = 'default';
  S.religion = null;
  S.prestigePoints = 0;
  S.collapsed = false;
  const oneThread = [{ id: 1, name: 'T', output: 1000, mood: '正常', moodTimer: 60 }];
  S.cultists = oneThread.slice();
  const cap = epStorageCap();
  if (BALANCE.capOverflowMult === 3) ok('⑤ 结构性溢出倍数 = ×4（1 + capOverflowMult）', '');
  else bad('⑤ 溢出倍数未定义', `${BALANCE.capOverflowMult}`);
  S.cultists = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, name: 'X' + i, output: 9999, mood: '超频', moodTimer: 60 }));
  const capMany = epStorageCap();
  S.lazySince = Date.now() - 1e6;
  S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 120, bufferSec: 0, loseTimer: 0, transition: 0 };
  const capDormant = epStorageCap();
  S.collapsed = true;
  const capCollapsed = epStorageCap();
  if (cap === capMany && cap === capDormant && cap === capCollapsed) ok('⑤ 线程数/懒惰/休眠/吞噬均不改上限', `cap=${cap}`);
  else bad('⑤ 上限仍受线程影响', JSON.stringify({ cap, capMany, capDormant, capCollapsed }));
  S._rpOverflowSeen = false;
  const early = epStorageCap();
  if (Math.abs(cap / early - 4) < 0.02) ok('⑤ 首次溢出前不启用倍数（前期仍由扩容件决定）', `${early} → ${cap}`);
  else bad('⑤ 溢出倍数异常', `${early} → ${cap}`);
  // 还原状态，避免污染后续 ⑥
  S._rpOverflowSeen = true;
  S.collapsed = false; S.lazySince = null;
  S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0, transition: 0 };
  S.cultists = oneThread.slice();
}

// ===== ⑥ 星图 RP/TP 与 EP 同量级 =====
{
  const orderOk = GALAXIES.every(g => {
    const r = g.cost.rp / g.cost.ep, p = g.cost.pt / g.cost.ep;
    return r >= 0.08 && r <= 0.12 && p >= 0.08 && p <= 0.12;
  });
  if (orderOk) ok('⑥ 六个星系 RP/PT 均为 EP 的 1/10 左右（同量级）', `月球 ${GALAXIES[0].cost.ep} EP / ${GALAXIES[0].cost.rp} RP`);
  else bad('⑥ RP/PT 与 EP 仍差量级', GALAXIES.map(g => `${g.id}:${(g.cost.rp / g.cost.ep).toFixed(3)}`).join(' '));
  S.upgrades = { ...(S.upgrades || {}), rp_vault: 0, pt_vault: 0 };
  const capR = rpCap(), capP = ptCap(), capEp = epStorageCap();
  if (capR >= capEp * 0.24 && capP >= capEp * 0.17) ok('⑥ RP/PT 仓容跟随 EP 上限（≥25% / 18%）', `RP ${capR} · PT ${capP} vs EP ${capEp}`);
  else bad('⑥ 仓容未跟随 EP 上限', `RP ${capR} · PT ${capP} vs EP ${capEp}`);
  // 关键不等式：EP 付得起的星系，RP/PT 一定也付得起（RP 报价 = EP/10 < 仓容 = EP 上限/4）
  const payable = GALAXIES.filter(g => g.cost.ep <= capEp);
  const unpayable = payable.filter(g => g.cost.rp > capR || g.cost.pt > capP);
  if (unpayable.length === 0) ok('⑥ EP 可付的星系 RP/PT 同样可付（仓容 ≥ 报价）', `可付 ${payable.length}/${GALAXIES.length} 个星系`);
  else bad('⑥ 存在 EP 够但 RP/PT 装不下的星系', unpayable.map(g => g.id).join('，'));
}

// ===== 浏览器侧（UI 行为）=====
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

await page.evaluateOnNewDocument(() => {
  localStorage.setItem('abyss_idle_v2', JSON.stringify({
    _version: 6, chapter: '6', ep: 2e6, rp: 4000, pt: 2000, dm: 50,
    upgrades: { storage: 20, reserve_bin: 10, atrium: 1, rp_vault: 3, pt_vault: 3 },
    buildings: { cycle_temple: 2, datacenter: 1 }, tech: { prestige2: true },
    cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 60 }],
    religion: { unlocked: true, branch: 'sun', sun: true, temple: 2, seal: 1 },
    corruption: 0, achievements: {}, milesDone: { m1: true }, resDiscovered: { rp: true, dm: true },
    storyline: 'line_abyss',
    riftUpgrades: { auto_descent: 1, auto_purify: 1 }, riftEmber: 5000,
    _riftSeen: true, riftsSealed: 5,
  }));
});
await page.goto(URL, { waitUntil: 'load' });
await sleep(1800);

// ① 左侧自动转化出现「深入」开关，可切换
{
  const sw = await page.evaluate(async () => {
    const btn = document.querySelector('#quick-switches [data-qs="descent"]');
    if (!btn) return { found: false };
    const before = window.S.riftAuto;
    btn.click();
    await new Promise(r => setTimeout(r, 300));
    const afterOn = window.S.riftAuto;
    document.querySelector('#quick-switches [data-qs="descent"]')?.click();
    await new Promise(r => setTimeout(r, 300));
    return { found: true, before, afterOn, afterOff: window.S.riftAuto };
  });
  if (sw.found && sw.afterOn === 'auto_descent' && !sw.afterOff) ok('① 自动转化面板「深入」开关可开关', `${sw.before} → ${sw.afterOn} → ${sw.afterOff}`);
  else bad('① 深入开关异常', JSON.stringify(sw));
}

// ② 自动净化开关 + 实际自动净化行为
{
  const sw = await page.evaluate(async () => {
    const btn = document.querySelector('#quick-switches [data-qs="purify"]');
    if (!btn) return { found: false };
    if (!window.S.autoPurify) btn.click();
    await new Promise(r => setTimeout(r, 300));
    const on = window.S.autoPurify;
    // 腐化涨 5% 即应自动净化 5%（EP 充足）
    window.S.ep = Math.min(window.__qa.epStorageCap() * 0.6, 2e9); // 避开钳回陷阱 + 备足净化费
    window.S.corruption = 0;
    window.S._autoPurifyMark = 0;
    window.S.corruption = 6;
    const epBefore = window.S.ep;
    await new Promise(r => setTimeout(r, 900));
    return { found: true, on, corrupt: window.S.corruption, spent: epBefore - window.S.ep };
  });
  if (sw.found && sw.on === true) ok('② 自动转化面板「净化」开关注入状态', '');
  else bad('② 净化开关缺失', JSON.stringify(sw));
  if (sw.corrupt <= 1.5 && sw.spent > 0) ok('② 腐化每涨 5% 自动净化（消耗 EP）', `腐化 6% → ${sw.corrupt}% · 花费 ${Math.round(sw.spent)} EP`);
  else bad('② 自动净化未生效', JSON.stringify(sw));
}

// ③ 数量受限项「当前/上限」文案统一
{
  const cards = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#v21-building-list .item, #building-list .item').forEach(e => {
      out.push({ name: e.querySelector('.name span')?.textContent || '', count: e.querySelector('.count')?.textContent || '' });
    });
    return out;
  });
  const cycle = cards.find(c => /轮回圣殿/.test(c.name));
  if (cycle && /^Lv\.\d+\/\d+/.test(cycle.count.trim())) ok('③ 轮回圣殿（满级）显示「当前/上限」', `${cycle.name} → ${cycle.count}`);
  else bad('③ 轮回圣殿仍未显示数量', JSON.stringify(cycle || cards.slice(0, 3)));
  const allCounted = cards.filter(c => /Lv\.\d+\//.test(c.count)).length;
  if (allCounted > 0) ok('③ 设施卡统一走 Lv.x/y 口径', `${allCounted}/${cards.length} 张卡带分母`);
  else bad('③ 设施卡无分母', JSON.stringify(cards.slice(0, 3)));
}

// ⑦ 进入深渊后不出现「下一次裂隙 … 后出现」
{
  const res = await page.evaluate(async () => {
    window.S.corruption = 100;
    window.S._collapseAt = Date.now() + 60000;
    await new Promise(r => setTimeout(r, 1200));
    const body = document.body.innerText;
    return {
      hasEtaText: /下一次裂隙/.test(body),
      hasZeroSec: /下一次裂隙\s*0\s*秒后出现/.test(body),
      banner: document.getElementById('abyss-collapse')?.textContent?.trim().slice(0, 20),
    };
  });
  if (!res.hasZeroSec) ok('⑦ 深渊期不再出现「下一次裂隙 0 秒后出现」', `横幅：${res.banner}`);
  else bad('⑦ 深渊期仍显示 0 秒裂隙', JSON.stringify(res));
  if (/深渊吞噬倒计时/.test(res.banner || '')) ok('⑦ 倒计时横幅正常接管', res.banner);
  else bad('⑦ 倒计时横幅缺失', JSON.stringify(res));
}

// ⑨ 贿赂深渊后横幅清除
{
  const res = await page.evaluate(async () => {
    window.S.corruption = 100;
    window.S._collapseAt = Date.now() - 1000;
    window.S._collapseChoicePending = true;
    await new Promise(r => setTimeout(r, 1200));
    const before = document.getElementById('abyss-collapse')?.textContent || '';
    document.getElementById('collapse-bribe')?.click();
    await new Promise(r => setTimeout(r, 1200));
    const bn = document.getElementById('abyss-collapse');
    return { before, after: (bn?.textContent || '').trim(), display: bn?.style.display, corruption: window.S.corruption };
  });
  if (/命运抉择/.test(res.before)) ok('⑨ 抉择期横幅文案存在', res.before);
  else bad('⑨ 抉择横幅缺失', JSON.stringify(res));
  if (res.after === '' && res.display === 'none') ok('⑨ 贿赂后横幅立即清除（不再残留命运抉择）', `腐化 ${res.corruption}`);
  else bad('⑨ 贿赂后横幅残留', JSON.stringify(res));
}

// ⑧ FP 上限展示（顶栏 + 圣所卡）
{
  const res = await page.evaluate(async () => {
    window.S.faith = 12.5;
    document.getElementById('btn-religion')?.click();
    await new Promise(r => setTimeout(r, 700));
    const top = document.getElementById('h-faith')?.textContent || '';
    const panel = document.querySelector('#religion-panel')?.textContent || '';
    const rel = window.S.religion || {};
    // v3.5.0 ②：FP 上限改由「誓约圣龛」提供，圣所不再叠加——上限 = 100 + 圣印×20 + 圣龛增量
    const fvLv = (window.S.upgrades && window.S.upgrades.faith_vault) || 0;
    let bonus = 0;
    for (let i = 1; i <= fvLv; i++) bonus += 50 * Math.pow(1.15, i - 1);
    const expectCap = Math.round(100 + bonus + (rel.seal || 0) * 20);
    return { top: top.trim(), expectCap, hasShopPointer: /升级商店|誓约圣龛|由.+提升/.test(panel), panelTop: panel.slice(0, 120) };
  });
  const cap = res.expectCap;
  if (res.top.includes('/') && res.top.includes(String(cap))) ok('⑧ 顶栏 FP 显示「当前 / 上限」', res.top);
  else bad('⑧ 顶栏 FP 上限缺失', JSON.stringify({ top: res.top, cap }));
  if (!res.hasShopPointer) ok('⑧ 面板不写「由升级商店…提升」这类指引', '');
  else bad('⑧ 面板出现跨面板指引文案', res.panelTop);
}

if (errs.length === 0) ok('页面无 JS 报错');
else bad('页面报错', errs.join(' | ').slice(0, 160));
await browser.close();

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
