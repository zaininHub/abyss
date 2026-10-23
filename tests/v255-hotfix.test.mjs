// v2.5.5：AI 自动购建——① 全部资源点解锁后可激活（一次性大量 EP 激活费）
// ② 可设置购买间隔（5/10/30/60s）③ 严格限速：硬下限 5s（改档不生效）、每周期至多 1 栋、
// 只 EP 升级已解锁建筑（不花 RP）、受预留线约束（与手动购买共享预算）
// 运行前提：npm run build 已产出最新 dist（浏览器段走 file:// 真实实跑）
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const stateMod = await import('../src/state.js');
const { S, SAVE_KEY } = stateMod;
const ai = await import('../src/modules/ai.js');
const { tickAI, allResDiscovered, autoBuildRate, autoBuildActivable, activateAutoBuild } = ai;
const econ = await import('../src/modules/economy.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '6', storyline: 'default', ep: 2502000, rp: 99,
    runEarned: 1e8, prestige: 0, upgrades: { cache: 500 }, buildings: {}, tech: { ai_core: true },
    milesDone: {}, unlockedBuildings: { bargain_shop: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  });
}
function mkState(extra = {}) {
  global.localStorage = { getItem: () => mkRaw(extra), setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 纯函数 ==========
{
  // 资源全解锁判定
  Object.assign(S, mkState({}));
  rec('V1 全部资源点解锁判定（10 锚点全 true）', allResDiscovered(S) === true, 'full');
  Object.assign(S, mkState({ resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
  rec('V1 未全部解锁 → 判定 false', allResDiscovered(S) === false, 'partial');

  // 速率硬下限：改档 1s 也强制 ≥5s
  Object.assign(S, mkState({ ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: false, autoBuildUnlocked: true, autoBuildRate: 1, autoBuildTimer: 0 } }));
  rec('V1 速率硬下限：设置 1s → 强制 5s（改档不生效）', autoBuildRate() === 5, `rate=${autoBuildRate()}`);
  S.ai.autoBuildRate = 120;
  rec('V1 高间隔正常接受（120s）', autoBuildRate() === 120, `rate=${autoBuildRate()}`);

  // 激活条件与扣费
  Object.assign(S, mkState({ ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: false, autoBuildUnlocked: false, autoBuildRate: 10, autoBuildTimer: 0 } }));
  rec('V1 激活条件：资源全解锁 + EP 充足 → 可激活', autoBuildActivable() === true, `ep=${S.ep}`);
  const r1 = activateAutoBuild();
  rec('V1 激活成功：一次性扣除 2e6 EP + 置 unlocked', r1.ok && r1.cost === 2e6 && S.ai.autoBuildUnlocked === true && S.ai.autoBuild === true, `cost=${r1.cost},ep=${S.ep}`);
  rec('V1 激活后不可重复激活', activateAutoBuild().ok === false, 'already');
  // EP 不足不可激活
  Object.assign(S, mkState({ ep: 100, ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: false, autoBuildUnlocked: false, autoBuildRate: 10, autoBuildTimer: 0 } }));
  rec('V1 EP 不足 → 不可激活', autoBuildActivable() === false && activateAutoBuild().ok === false, 'ep poor');
  // 资源未全解锁不可激活
  Object.assign(S, mkState({ resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } }));
  rec('V1 资源未全解锁 → 不可激活', autoBuildActivable() === false, 'res partial');
}

// ========== V2 tick 购买行为 ==========
{
  // 激活 + 开关开 + 间隔 10s：tick(10) 买 1 栋成本最低已解锁卡（bargain_shop Lv.0→1）
  Object.assign(S, mkState({ ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: true, autoBuildUnlocked: true, autoBuildRate: 10, autoBuildTimer: 0 } }));
  const lv0 = S.buildings.bargain_shop || 0;
  const acted = tickAI(10);
  rec('V2 到点购买：10s 间隔触发 1 次购买（已解锁建筑 EP 升级）', acted === true && (S.buildings.bargain_shop || 0) === lv0 + 1, `lv=${S.buildings.bargain_shop},acted=${acted}`);
  const epAfter = S.ep;
  const acted2 = tickAI(5);
  rec('V2 间隔未到（10s）不购买', acted2 === false && S.ep === epAfter, `acted2=${acted2}`);
  // perTickMax：间隔 5s + 一次 tick(10)（timer 10≥5 → 重置，只买 1 栋）
  Object.assign(S, mkState({ ep: 2502000, ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: true, autoBuildUnlocked: true, autoBuildRate: 5, autoBuildTimer: 0 }, unlockedBuildings: { bargain_shop: true, warmup_node: true } }));
  const tot = (ss) => Object.values(ss.buildings).reduce((a, c) => a + (c || 0), 0);
  const before = tot(S);
  tickAI(10); // timer 10 ≥ 5 → 买 1 栋（即便累计 10s 也只 1 栋）
  const after = tot(S);
  rec('V2 严格限速：每决策周期至多 1 栋（tick 10s 只买 1）', after === before + 1, `before=${before},after=${after}`);
  // 预留线约束：EP 紧（扣后 < 预留线）不买
  Object.assign(S, mkState({ ep: 5000, ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: true, autoBuildUnlocked: true, autoBuildRate: 5, autoBuildTimer: 0 } }));
  const epB = S.ep;
  const acted3 = tickAI(10);
  rec('V2 预留线约束：EP 扣后低于预留线不买（与手动共享预算）', acted3 === false && S.ep === epB, `acted3=${acted3}`);
  // 不花 RP：locked 卡（未解锁，需 RP）不被 AI 购买
  Object.assign(S, mkState({ rp: 99, unlockedBuildings: {}, ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: true, autoBuildUnlocked: true, autoBuildRate: 5, autoBuildTimer: 0 } }));
  const rpB = S.rp;
  const acted4 = tickAI(10);
  rec('V2 不花 RP：locked 卡（需 RP 解锁）不被 AI 购买', acted4 === false && S.rp === rpB, `acted4=${acted4}`);
  // 开关关 → 无动作
  Object.assign(S, mkState({ ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0, autoBuild: false, autoBuildUnlocked: true, autoBuildRate: 5, autoBuildTimer: 0 } }));
  const acted5 = tickAI(10);
  rec('V2 开关关闭 → 无购建动作', acted5 === false, `acted5=${acted5}`);
}

// ========== V3 浏览器实跑：AI 面板激活流程 ==========
{
  const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
  const page = await browser.newPage();
  const raw = JSON.stringify({
    _version: 6, chapter: '6', storyline: 'default', ep: 2502000, rp: 99,
    runEarned: 1e8, prestige: 0, upgrades: { cache: 500 }, buildings: {}, tech: { ai_core: true },
    milesDone: {}, unlockedBuildings: { bargain_shop: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
    lastSeen: Date.now(), startTime: Date.now(),
  }).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));`));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  // AI 面板
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent === '自动' || (x.id === 'btn-ai'));
    const tab = document.getElementById('btn-ai');
    if (tab) tab.click();
  });
  await sleep(400);
  const panel = await page.evaluate(() => {
    const el = document.getElementById('ai-panel');
    return el ? el.textContent : '';
  });
  rec('V3 AI 面板含自动购建区块（资源全解锁 + EP 充足 → 激活按钮可点）', panel.includes('自动购建') && panel.includes('激活自动购建'), panel.slice(0, 60));
  // 二次确认流程
  const actBtn = await page.evaluate(() => {
    const el = document.querySelector('[data-ai-build-activate]');
    return el ? { disabled: el.classList.contains('disabled'), txt: el.textContent } : null;
  });
  rec('V3 激活按钮可用（非 disabled）', actBtn && !actBtn.disabled, JSON.stringify(actBtn));
  await page.click('[data-ai-build-activate]');
  await sleep(200);
  const confirmTxt = await page.evaluate(() => document.querySelector('[data-ai-build-activate]').textContent);
  rec('V3 二次确认：首次点击变为「再次点击确认（消耗 2,000,000 EP）」', confirmTxt.includes('再次点击确认'), confirmTxt.slice(0, 30));
  await page.click('[data-ai-build-activate]');
  await sleep(400);
  const afterAct = await page.evaluate(() => {
    const el = document.getElementById('ai-panel');
    const s = el ? el.textContent : '';
    return { hasSwitch: s.includes('自动购建（已激活）') && s.includes('购买间隔'), rateBtns: (s.match(/\d+s/g) || []).length };
  });
  rec('V3 激活成功：面板切已激活态（开关 + 速率档 5/10/30/60s）', afterAct.hasSwitch && afterAct.rateBtns >= 4, JSON.stringify(afterAct));
  // 速率设置
  await page.click('[data-ai-build-rate="30"]');
  await sleep(300);
  const rateSet = await page.evaluate(() => {
    const s = document.getElementById('ai-panel').textContent;
    return s.includes('当前间隔 30s');
  });
  rec('V3 速率档可设置（30s）', rateSet, 'rate 30s');
  // 未全解锁场景：激活按钮 disabled（reload 前重新注册注入档——evaluateOnNewDocument 每次导航都执行）
  const rawPartial = JSON.stringify({
    _version: 6, chapter: '6', storyline: 'default', ep: 2502000, rp: 99,
    runEarned: 1e8, prestige: 0, upgrades: { cache: 500 }, buildings: {}, tech: { ai_core: true },
    milesDone: {}, unlockedBuildings: { bargain_shop: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(),
  }).replace(/</g, '\u003c');
  await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${rawPartial})));`));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await page.evaluate(() => { const t = document.getElementById('btn-ai'); if (t) t.click(); });
  await sleep(400);
  const lockedBtn = await page.evaluate(() => {
    const el = document.querySelector('[data-ai-build-activate]');
    return el ? { disabled: el.classList.contains('disabled'), txt: el.textContent } : null;
  });
  rec('V3 资源未全解锁 → 激活按钮 disabled（不可点）', lockedBtn && lockedBtn.disabled, JSON.stringify(lockedBtn));
  await page.close();
  await browser.close();
}

// ========== V4 源码 ==========
{
  const aiSrc = readFileSync('src/modules/ai.js', 'utf-8');
  const balSrc = readFileSync('src/data/balance.js', 'utf-8');
  rec('V4 硬限速落点：minRate 5s clamp 在公共函数 autoBuildRate()', aiSrc.includes('Math.max(BALANCE.ai.aiAutoBuild.minRate') && balSrc.includes('minRate: 5'), 'clamp');
  rec('V4 每周期至多 1 栋（break）', aiSrc.includes('break; // 每周期至多 1 栋'), 'perTick break');
  rec('V4 激活费配置 2e6 与速率档', balSrc.includes('activateCost: 2e6') && balSrc.includes('rateOptions: [5, 10, 30, 60]'), 'config');
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.5 封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
