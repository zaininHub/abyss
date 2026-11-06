// v3.7.0 三条故事线差异化「真实浏览器」对照验收
//
// 与 v370-core-abstraction.test.mjs 的纯 Node 单测互补：这里在真实页面里验证
// 声明层(storylines/*.js rules) → 求值层(core/ruleEngine) → 消费层(economy.js 等)
// 整条链都接通，且变体事件/异兽/上限确实进入运行时，而非只停留在数据文件里。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const LINES = ['line_order', 'line_abyss', 'line_faith'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const mkSave = line => JSON.stringify({
  _version: 6, chapter: '1', storyline: line, ep: 0, rp: 0, es: 0, dm: 0, pt: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: [], faith: 0, religion: null,
  prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(),
});

async function collect(browser, line) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), mkSave(line));
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1300);
  const r = await page.evaluate(() => {
    const S = window.S, q = window.__qa;
    const lr = (k, base) => q.lineRule(k, base, S);
    const rule = {
      global: lr('global_mult', 1),
      cost: lr('cost_mult_bonus', 1),
      corrPenalty: lr('corruption_penalty_reduce', 0.5),
      corrCap: lr('corruption_cap', 100),
      tide: lr('tide_negative_immune', 0.5),
      seal: lr('seal_dm_bonus', 1),
      pet: lr('pet_mult_bonus', 1),
      corrosion: lr('corrosion_slow', 1),
      epCap: lr('ep_cap_mult', 1),
      symbiosis: q.lineFlag('symbiosis_active', S),
      purify: q.lineFlag('faith_purify', S),
    };
    // 归零到同一最小状态后比较真实乘区（证明 economy.js 真的消费了规则，而非只测纯函数）
    S.upgrades = { scribble: 1 }; S.buildings = {}; S.tech = {}; S.policies = {};
    S.rpTheories = {}; S.religion = null; S.cultists = []; S.pets = {}; S.activePets = [];
    S.corruption = 0; S.faith = 0; S.tideTimer = 99999;
    S.runTalent = null; S.focusLevel = 0; S.buffs = [];
    // 潮汐 soften 语义是「波动向 1 收敛」（正负都收敛），会干扰纯乘区比较：
    // 秩序线把涨潮 1.3 收敛到 1.045，信仰线保持 1.3 → 直接比会是 3×1.3/1.045≈3.73。
    // 因此用平潮（epMult=1）验纯全局乘区，另用退潮（0.7）验负面减弱是否真的生效。
    S.tidePhase = 1; const cps = q.computeCps(), cpsCalm = cps;
    S.tidePhase = 2; const cpsEbb = q.computeCps();
    S.tidePhase = 0; const cpsFlood = q.computeCps();
    S.tidePhase = 1;
    const cap = q.epStorageCap(), corrCap = q.corruptionCap();
    return {
      line: S.storyline, rule, cps, cpsCalm, cpsEbb, cpsFlood, cap, corrCap,
      events: q.getStorylineEvents().map(e => e.id),
      pets: q.getStorylinePets().map(p => p.id),
      ruleCount: q.allLineRuleKeys().length,
    };
  });
  r.pageErrors = errs;
  await page.close();
  return r;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});
const R = {};
console.log('\n=== v3.7.0 三线差异化浏览器对照 ===');
try {
  for (const l of LINES) { R[l] = await collect(browser, l); console.log(`  ${l.padEnd(12)} 平潮cps=${R[l].cpsCalm.toFixed(3)} 退潮=${R[l].cpsEbb.toFixed(3)} 涨潮=${R[l].cpsFlood.toFixed(3)} cap=${Math.round(R[l].cap)} corrCap=${R[l].corrCap} 事件=${R[l].events.length} 异兽=${R[l].pets.length}`); }
} finally { await browser.close(); }

const [O, A, F] = [R.line_order, R.line_abyss, R.line_faith];

console.log('\n[1] 声明 → 求值：规则值按线分化');
if (F.rule.global === 3 && O.rule.global === 1 && A.rule.global === 1) ok('神权协议 ×3 只作用于信仰线');
else bad('全局乘区规则未按线分化', JSON.stringify({ O: O.rule.global, A: A.rule.global, F: F.rule.global }));
if (O.rule.cost < 1 && A.rule.cost === 1 && F.rule.cost === 1) ok('协议折扣 -3% 只作用于秩序线', `cost=${O.rule.cost}`);
else bad('成本折扣未按线分化', JSON.stringify({ O: O.rule.cost, A: A.rule.cost, F: F.rule.cost }));
if (A.rule.seal > 1 && O.rule.seal === 1 && F.rule.seal === 1) ok('裂隙亲和 +25% 只作用于深渊线');
else bad('封印加成未按线分化');
if (F.rule.pet > 1 && O.rule.pet === 1 && A.rule.pet === 1) ok('圣宠庇佑 +10% 只作用于信仰线');
else bad('异兽加成未按线分化');
if (A.rule.epCap > O.rule.epCap && O.rule.epCap > F.rule.epCap) ok('线专属 EP 上限：深渊 1.15 > 秩序 1.10 > 信仰 1.00', `${A.rule.epCap}/${O.rule.epCap}/${F.rule.epCap}`);
else bad('EP 上限规则未按线分化', JSON.stringify({ A: A.rule.epCap, O: O.rule.epCap, F: F.rule.epCap }));
if (A.rule.corrCap === 120 && O.rule.corrCap !== 120) ok('混沌容器腐化上限 120 只作用于深渊线');
else bad('腐化上限规则未按线分化', JSON.stringify({ A: A.rule.corrCap, O: O.rule.corrCap }));
if (O.ruleCount === 11) ok('11 个线专属规则键全部注册'); else bad('规则键数量异常', `${O.ruleCount}`);

console.log('\n[2] 求值 → 消费：economy.js 真实乘区随之变化');
// 平潮相位所有乘数 = 1，可纯粹验算「神权协议 ×3」是否真的进入 computeCps
const ratio = F.cpsCalm / O.cpsCalm;
if (ratio > 2.95 && ratio < 3.05) ok('平潮 computeCps() 信仰线 = 秩序线 ×3（规则已进真实产出链）', `比值 ${ratio.toFixed(4)}`);
else bad('全局乘区未进入 computeCps', `比值 ${ratio.toFixed(4)} / O=${O.cpsCalm} F=${F.cpsCalm}`);
// 退潮（×0.7）下，秩序线「熵减稳流」应把负面收敛，跌幅显著小于信仰线
const oEbb = O.cpsEbb / O.cpsCalm, fEbb = F.cpsEbb / F.cpsCalm;
if (oEbb > fEbb + 0.1) ok('退潮负面被秩序线规则减弱（波动收敛生效）', `秩序 ${oEbb.toFixed(3)} vs 信仰 ${fEbb.toFixed(3)}`);
else bad('潮汐负面减弱规则未生效', `秩序 ${oEbb.toFixed(3)} vs 信仰 ${fEbb.toFixed(3)}`);
if (A.cap > O.cap && O.cap > F.cap) ok('epStorageCap() 按线分化', `${Math.round(F.cap)} < ${Math.round(O.cap)} < ${Math.round(A.cap)}`);
else bad('EP 上限未进入真实存储口径', `${F.cap}/${O.cap}/${A.cap}`);
if (A.corrCap > O.corrCap) ok('corruptionCap() 深渊线更高', `${A.corrCap} > ${O.corrCap}`);
else bad('腐化上限未进入真实口径', `${A.corrCap} vs ${O.corrCap}`);

console.log('\n[3] 变体内容注入运行时');
const onlyIn = (a, b) => a.filter(x => !b.includes(x));
for (const l of LINES) {
  const other = LINES.find(x => x !== l);
  const diff = onlyIn(R[l].events, R[other].events);
  if (R[l].events.length === 42 && diff.length === 6) ok(`${l} 事件池 = 主表 36 + 线专属 6`);
  else bad(`${l} 事件池接线异常`, `总数 ${R[l].events.length} / 线专属 ${diff.length}`);
}
const petIds = { line_order: 'logic_dove', line_abyss: 'little_chaos', line_faith: 'holy_moth' };
for (const l of LINES) {
  if (R[l].pets.includes(petIds[l])) ok(`${l} 线专属异兽可获取（${petIds[l]}）`);
  else bad(`${l} 线专属异兽未注入`, JSON.stringify(R[l].pets));
}
const pageErrs = LINES.flatMap(l => R[l].pageErrors);
if (pageErrs.length === 0) ok('三线加载全程无 pageerror'); else bad('页面异常', pageErrs.slice(0, 3).join(' | '));

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
