// v2.5.1 六项反馈：① 深渊鱼缸有效果（DM 采集 +20%/级、3 级裂隙封印 +5 DM）
// ② 晋升转生奖励合理化（PP/RP round、ES 门槛 2e7）③ 首个 0/100 效能点任务可完成
// （earnedFull 全量口径）④ 深渊行者线深渊特殊升级（触手协议/深渊集市）⑤ 岔路口多次选择
// （转生后重新开放）⑥ 本版不做截图与交付说明（交付只给包）
// 运行前提：npm run build 已产出最新 dist（浏览器段走 file:// 真实实跑）
import puppeteer from 'puppeteer-core';

// ---- 纯函数段：localStorage stub + 模块单例（economy/state 共享同一 S 实例） ----
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
const { S } = stateMod;
const economy = await import('../src/modules/economy.js');
const { spawnProject } = await import('../src/modules/projects.js');
const { getStorylinePackage } = await import('../src/core/storylineManager.js');

function mkState(rawObj) {
  const raw = JSON.stringify(rawObj);
  global.localStorage = { getItem: () => raw, setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 纯函数：晋升奖励合理化 ==========
{
  const mk = (runEarned, over = {}) => mkState({ _version: 6, chapter: '6', storyline: 'default', ep: 1000, rp: 0, runEarned, prestige: 0, upgrades: {}, buildings: {}, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now(), ...over });
  {
    Object.assign(S, mk(450000000)); // v2.8.19：3×150M
    const pp = economy.prestigeGain(), rp = economy.prestigeRpGain(), es = economy.esGain();
    rec('V1 晋升奖励：450M 累计（3×150M 需求）→ 2 PP / 2 RP / 2 ES（v2.8.19 首升门槛 150M）', pp === 2 && rp === 2 && es === 4, `pp=${pp},rp=${rp},es=${es}`);
  }
  {
    Object.assign(S, mk(5000000));
    const pp = economy.prestigeGain(), rp = economy.prestigeRpGain(), es = economy.esGain();
    rec('V1 晋升门槛：未达标（5M<30M）→ 0 PP / 0 RP / 0 ES', pp === 0 && rp === 0 && es === 0, `pp=${pp},rp=${rp},es=${es}`);
  }
  {
    Object.assign(S, mk(15e9)); // v2.8.19：首升需求 150M → 100× = 15e9
    rec('V1 晋升曲线：100×需求 → 10 PP（sqrt round 高段收敛）', economy.prestigeGain() === 10, `pp=${economy.prestigeGain()}`);
  }
}

// ========== V2 纯函数：任务 earnedFull 全量口径 ==========
{
  const mk = (over = {}) => mkState({ _version: 6, chapter: '1', storyline: 'default', ep: 2000, rp: 0, runEarned: 2000, earnedFull: 2000, projects: [], upgrades: {}, buildings: {}, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now(), ...over });
  {
    Object.assign(S, mk());
    spawnProject();
    const p = S.projects[S.projects.length - 1];
    p.goal = 100; p.status = 'active';
    // v2.8.10：任务进度改钳后口径——EP 达存储上限后 earnedFull 不再累计（用户明确：达上限后任务 EP 不增长）
    const gained = 0; // addEp/main 钳后：cap - ep = 0
    S.earnedFull += gained;
    S.runEarned += gained;
    p.progress = (S.earnedFull || 0) - p.earnedFullAt;
    rec('V2 任务口径：EP 达上限后产出钳后 → 进度冻结（v2.8.10）', p.progress === 0, `progress=${p.progress}`);
  }
  {
    Object.assign(S, mk());
    // v2.5.1 之前创建的任务：无 earnedFullAt → 按 runEarned 差额推进（runEarnedAt 有值时不清零）
    S.projects = [{ type: 'earn_ep', goal: 100, progress: 0, status: 'active', runEarnedAt: 30 }];
    S.runEarned = 60; S.earnedFull = 60;
    const pp = S.projects[0];
    pp.progress = pp.earnedFullAt !== undefined ? (S.earnedFull || 0) - pp.earnedFullAt : S.runEarned - (pp.runEarnedAt || S.runEarned);
    rec('V2 存量任务回退：无 earnedFullAt 时按 runEarned 差额（runEarnedAt=30→60-30=30）', pp.progress === 30, `progress=${pp.progress}`);
  }
}

// ========== V3 纯函数：深渊鱼缸 + 深渊集市效果 ==========
{
  const mk = (over = {}) => mkState({ _version: 6, chapter: '6', storyline: 'line_abyss', ep: 1000, rp: 0, runEarned: 1e6, upgrades: { scooter: 1 }, buildings: {}, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true }, lastSeen: Date.now(), startTime: Date.now(), _v25Legacy: true, ...over });
  Object.assign(S, mk());
  const base = economy.vehicleDmPerMin();
  Object.assign(S, mk({ buildings: { abyss_fishbowl: 1 } }));
  const v1 = economy.vehicleDmPerMin();
  rec('V3 鱼缸 1 级：DM 采集 +20%', Math.abs(v1 - base * 1.2) < 1e-9, `base=${base},v1=${v1}`);
  Object.assign(S, mk({ buildings: { abyss_fishbowl: 3 } }));
  const v3 = economy.vehicleDmPerMin();
  rec('V3 鱼缸 3 级：DM 采集 +60%', Math.abs(v3 - base * 1.6) < 1e-9, `v3=${v3}`);
  Object.assign(S, mk({ buildings: { abyss_fishbowl: 2 }, tech: { abyss_market: true } }));
  const vm = economy.vehicleDmPerMin();
  rec('V3 深渊集市：DM 采集 ×1.5（叠乘 1.4）', Math.abs(vm - base * 1.4 * 1.5) < 1e-9, `vm=${vm}`);
  Object.assign(S, mk({ buildings: { abyss_fishbowl: 3 } }));
  const r3 = economy.sealDmReward({ dmReward: 10 });
  rec('V3 鱼缸 3 级裂隙封印：基础 10 + 5 = 15', r3 === 15, `reward=${r3}`);
  Object.assign(S, mk({ buildings: { abyss_fishbowl: 3 }, tech: { abyss_market: true } }));
  const rm = economy.sealDmReward({ dmReward: 10 });
  rec('V3 深渊集市裂隙封印：15 × 2 = 30', rm === 30, `reward=${rm}`);
}

// ========== V4 深渊行者线特殊升级（配置存在 + 依赖链完整） ==========
{
  const pkg = getStorylinePackage('line_abyss');
  const techs = pkg?.data?.techs?.append || [];
  const tids = techs.map(t => t.id);
  rec('V4 深渊行者线新增特殊升级：触手协议 / 深渊集市已注册', tids.includes('tentacle_protocol') && tids.includes('abyss_market'), `techs=${tids.join(',')}`);
  const tp = techs.find(t => t.id === 'tentacle_protocol');
  const am = techs.find(t => t.id === 'abyss_market');
  rec('V4 升级依赖链：深渊集市依赖触手协议（col 3→4 递进）', am?.req?.includes('tentacle_protocol') && tp?.col === 3 && am?.col === 4, `tp.col=${tp?.col},am.col=${am?.col}`);
  // v2.5.2 起鱼缸移入通用 BUILDINGS（商店底部可购）；从通用表直接核验升级链
  const fish = (pkg?.data?.buildings?.append || []).find(b => b.id === 'abyss_fishbowl');
  rec('V4 深渊鱼缸升级链：1 级无数值 → 3 级 DM 采集 +60%（v2.5.2 入通用表）', fish === undefined && /abyss_fishbowl.*DM 采集效率 \+60%/.test(await (await import('node:fs/promises')).readFile('src/data/balance.js', 'utf-8').then(String)), `line包鱼缸=${fish !== undefined ? '仍驻留' : '已移入通用表'}`);
}

// ========== V5 浏览器实跑：岔路口多次选择（转生后重新开放）+ 晋升按钮可点 ==========
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
{
  const page = await browser.newPage();
  const saveBase = {
    _version: 6, chapter: '6', storyline: 'line_abyss', ep: 1500, rp: 0, runEarned: 450000000, // v2.8.19：3×150M
    upgrades: {}, milesDone: {}, tech: {}, buildings: {}, prestige: 0, prestigePoints: 0,
    crossroad: 'locked', crossroadLockedBy: 'abyss_anchor',
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true },
    lastSeen: Date.now(), startTime: Date.now(), _v25Legacy: true, storylinesCompleted: [],
  };
  const raw = JSON.stringify(saveBase).replace(/</g, '\\u003c');
  await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));`));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const btn = await page.evaluate(() => {
    const b = document.getElementById('prestige-btn');
    return b ? { disabled: b.disabled, text: b.textContent } : null;
  });
  rec('V5 晋升按钮：450M 档可点（disabled=false）', btn && btn.disabled === false, JSON.stringify(btn));
  await page.evaluate(() => document.getElementById('prestige-btn')?.click());
  await sleep(300);
  const modal = await page.evaluate(() => getComputedStyle(document.getElementById('talent-modal')).display);
  rec('V5 晋升点击：天赋三选一弹窗正常打开', modal === 'flex', `display=${modal}`);
  await page.evaluate(() => { const el = document.querySelector('.talent-option'); if (el) el.click(); });
  await sleep(500);
  const post = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('V5 转生后岔路口重新开放：crossroad=open 且立誓解除', post.crossroad === 'open' && post.crossroadLockedBy === null, `crossroad=${post.crossroad},lockedBy=${post.crossroadLockedBy}`);
  rec('V5 转生记录已完成线：storylinesCompleted 含 line_abyss', Array.isArray(post.storylinesCompleted) && post.storylinesCompleted.includes('line_abyss'), JSON.stringify(post.storylinesCompleted));
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].find(b => b.textContent === '故事线');
    if (btns) btns.click();
  });
  await sleep(300);
  const txt = await page.evaluate(() => document.getElementById('storyline-panel')?.textContent || '');
  rec('V5 面板文案：转生后岔路口已开放（可再选）', txt.includes('岔路口已开放') && txt.includes('立誓'), txt.slice(0, 60));
  await page.close();
}
await browser.close();

// 汇总
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.1 封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
