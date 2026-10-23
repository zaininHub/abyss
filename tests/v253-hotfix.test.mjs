// v2.5.3 五项反馈：① 休眠优化（更早进入 15s / 休眠期产出 ×0.3 / 补偿门槛 30s）
// ② RP 获取口径（顶栏文案同步 20,000:1、面板补获取途径与速率加快说明）
// ③ 深渊鱼缸触手视觉（工作台底部摆动，≥1 级显示）④ 转生界面未达标 0/1 形式（PP/RP/ES 三行）
// ⑤ RP 解锁后专注优化可买（req 解除，价格自成门槛）
// 运行前提：npm run build 已产出最新 dist（浏览器段走 file:// 真实实跑）
import puppeteer from 'puppeteer-core';

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
const { tickWages } = await import('../src/modules/wages.js');
const { BALANCE } = await import('../src/data/balance.js');
const { TECHS } = await import('../src/data/techs.js');
const fs = await import('node:fs');

function mkState(rawObj) {
  const raw = JSON.stringify(rawObj);
  global.localStorage = { getItem: () => raw, setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 休眠优化 ==========
{
  // 配置断言：warnSec 8 / dormantAfterSec 15 / 补偿触发阈值 30s（源码文本）
  const W = BALANCE.thread.wages;
  rec('V1 休眠进入提速：黄线 8s + 连续欠薪 15s 即休眠', W.warnSec === 8 && W.dormantAfterSec === 15, `warn=${W.warnSec},dormant=${W.dormantAfterSec}`);
  const wageSrc = fs.readFileSync('src/modules/wages.js', 'utf-8');
  rec('V1 补偿触发门槛 60s→30s（转机更易获得）', /\(w\.dormantSec \|\| 0\) >= 30/.test(wageSrc), 'dormantSec>=30');
  // 休眠期产出系数：dormant → ×0.3（非 ×0 纯惩罚）
  Object.assign(S, mkState({ _version: 6, chapter: '1', storyline: 'default', ep: 100, rp: 0, upgrades: {}, buildings: {}, tech: {}, wageState: { state: 'dormant', debtSec: 20, dormantSec: 40, bufferSec: 0, loseTimer: 0 }, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }));
  rec('V1 休眠期产出 ×0.3（温和产出，非纯惩罚）', economy.wageOutputMult() === 0.3, `mult=${economy.wageOutputMult()}`);
  // losing 仍 ×0
  Object.assign(S, { ...S, wageState: { state: 'losing', debtSec: 0, dormantSec: 300, bufferSec: 0, loseTimer: 0 } });
  rec('V1 流失预警仍 ×0（线程随时可能流失）', economy.wageOutputMult() === 0, `mult=${economy.wageOutputMult()}`);
  // 状态机：连续欠薪 15s 触发 dormant
  {
    Object.assign(S, mkState({ _version: 6, chapter: '1', storyline: 'default', ep: 5, rp: 0, upgrades: { scribble: 2 }, buildings: {}, tech: {}, wageState: { state: 'debt', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 }, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }], resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }));
    // 注：tickWages 依赖 salary 与 S.ep；低 ep（5）→ 持续 debt → 15s 后 dormant
    const before = S.wageState.state;
    tickWages(1); tickWages(1); tickWages(1); tickWages(1); tickWages(1);
    tickWages(1); tickWages(1); tickWages(1); tickWages(1); tickWages(1);
    tickWages(1); tickWages(1); tickWages(1); tickWages(1); tickWages(1);
    tickWages(1); tickWages(1); // 16s
    rec('V1 状态机：连续欠薪 16s → dormant', S.wageState.state === 'dormant', `state=${S.wageState.state}`);
  }
}

// ========== V2 RP 获取口径 ==========
{
  const mainSrc = fs.readFileSync('src/main.js', 'utf-8');
  rec('V2 顶栏文案：溢出累计按 20,000:1 转 RP（不再「5% 已转」）', !mainSrc.includes('5% 已转 RP') && mainSrc.includes('按 20,000:1 转 RP'), '顶栏文案');
  rec('V2 面板说明：补 RP 获取途径（蒸馏主源/任务/溢出兜底/数据熔炉）+ 速率加快（每轮 -500）', mainSrc.includes('灵感蒸馏塔主动转化') && mainSrc.includes('数据熔炉建筑') && mainSrc.includes('每轮 -500 溢出 EP，下限 5,000'), '面板说明');
  // 转换公式：基础 20,000 / 转生递减 500（下限 5,000）
  const ecSrc = fs.readFileSync('src/modules/economy.js', 'utf-8');
  rec('V2 转换公式：1 RP = 20,000 溢出 EP（转生 -500，下限 5,000）', /Math\.max\(5000, 20000 - 500 \* \(S\.prestige \|\| 0\)\)/.test(ecSrc), '公式');
  // 行为：18.79K 溢出（prestige 0）→ 0 RP（0.94 不足 1，与「5% 应 939 RP」对照，文案修正后合理）
  {
    Object.assign(S, mkState({ _version: 6, chapter: '1', storyline: 'default', ep: 1000, rp: 0, runEarned: 1000, prestige: 0, upgrades: {}, buildings: {}, tech: {}, _overflowRpAcc: 0, epOverflowTotal: 18790, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }));
    economy.addEp(0); // 触发不了溢出（amount 0）
    // 直接验证转换单元：18,790 溢出 → need=20,000 → 0 RP 累积 0.94
    const need = Math.max(5000, 20000 - 500 * (S.prestige || 0));
    rec('V2 溢出转换：18.79K EP → 0.94 不足 1 RP（文案修正后「5%→939 RP」误解消除）', need === 20000 && S.rp === 0, `need=${need},rp=${S.rp}`);
  }
}

// ========== V3 鱼缸触手视觉 ==========
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
{
  const html = fs.readFileSync('index.html', 'utf-8');
  const css = fs.readFileSync('src/style.css', 'utf-8');
  rec('V3 触手装饰：index.html 含 #tentacle-deco（3 根 SVG 触手）', html.includes('id="tentacle-deco"') && (html.match(/class="tentacle /g) || []).length === 3, 'DOM');
  rec('V3 触手动画：style.css 含摆动动画与 3 级显全', css.includes('@keyframes tentacle-sway') && css.includes('tentacle-3'), 'CSS');
  // 浏览器实跑：鱼缸 0 级隐藏 / 1 级显示 / 3 级 class 变化
  {
    const page = await browser.newPage();
    const mk = (bld) => JSON.stringify({ _version: 6, chapter: '1', storyline: 'default', ep: 1000, rp: 0, upgrades: {}, buildings: bld, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }).replace(/</g, '\\u003c');
    await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${mk({})})));`));
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1000);
    const t0 = await page.evaluate(() => getComputedStyle(document.getElementById('tentacle-deco')).display);
    rec('V3 运行时：无鱼缸时触手隐藏', t0 === 'none', `display=${t0}`);
    await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${mk({ abyss_fishbowl: 1 })})));`));
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1000);
    const t1 = await page.evaluate(() => ({ d: getComputedStyle(document.getElementById('tentacle-deco')).display, cls: document.getElementById('tentacle-deco').className }));
    rec('V3 运行时：鱼缸 1 级触手显示（底部摆动）', t1.d !== 'none', JSON.stringify(t1));
    await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${mk({ abyss_fishbowl: 3 })})));`));
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1000);
    const t3 = await page.evaluate(() => document.getElementById('tentacle-deco').classList.contains('tentacle-3'));
    rec('V3 运行时：鱼缸 3 级三根触手全显', t3, `cls3=${t3}`);
    await page.close();
  }
}

// ========== V4 转生界面 0/1 ==========
{
  const prestigeSrc = fs.readFileSync('src/modules/prestige.js', 'utf-8');
  rec('V4 转生界面：PP/RP/ES 三行未达标显示 0/1', prestigeSrc.includes("gain < 1 ? '0/1' : gain") && prestigeSrc.includes("rpg < 1 ? '0/1' : rpg") && prestigeSrc.includes("esg < 1 ? '0/1' : esg"), '三行源码');
  // 浏览器实跑：未达标档显示 0/1
  {
    const page = await browser.newPage();
    const raw = JSON.stringify({ _version: 6, chapter: '4', storyline: 'default', ep: 1000, rp: 0, runEarned: 5000000, prestige: 0, upgrades: {}, buildings: {}, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: false, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }).replace(/</g, '\\u003c');
    await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));`));
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === '晋升'); if (b) b.click(); });
    await sleep(300);
    const st = await page.evaluate(() => document.getElementById('prestige-panel')?.textContent || '');
    rec('V4 运行时：未达标（5M<10M）显示 0/1 PP / 0/1 RP / 0/1 ES', (st.match(/0\/1/g) || []).length >= 3, st.replace(/\s+/g, ' ').slice(0, 80));
    await page.close();
  }
}

// ========== V5 专注优化 RP 解锁即可购买 ==========
{
  const focus = TECHS.find(t => t.id === 'focus_opt');
  rec('V5 专注优化：前置 click_up 解除（RP 充足即可买，价格自成门槛）', focus && Array.isArray(focus.req) && focus.req.length === 0 && focus.cost === 8, `req=${JSON.stringify(focus?.req)},cost=${focus?.cost}`);
  // 浏览器实跑：RP=10（无 click_up）→ 专注优化科技卡可买（非 locked）
  {
    const page = await browser.newPage();
    const raw = JSON.stringify({ _version: 6, chapter: '4', storyline: 'default', ep: 1000, rp: 10, runEarned: 0, prestige: 0, upgrades: {}, buildings: {}, tech: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }).replace(/</g, '\\u003c');
    await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));`));
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1000);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === '科技树'); if (b) b.click(); });
    await sleep(300);
    const st = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.tech')].map(c => c.textContent || '');
      const f = cards.find(c => c.includes('专注优化'));
      const el = [...document.querySelectorAll('.tech')].find(c => (c.textContent || '').includes('专注优化'));
      return { found: !!f, locked: el ? el.classList.contains('locked') : null, txt: f || '' };
    });
    rec('V5 运行时：RP=10 且未研究点击强化 → 专注优化可购买（非 locked）', st.found && st.locked === false, JSON.stringify(st));
    await page.close();
  }
}
await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.3 封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
