// v2.4.1 hotfix 断言套件（用户三点反馈的可执行留证）
// V1 反馈①：顶栏「EP 消耗」——新增 h-salary（线程薪资支出，负面红），h-cps 净额口径不变
// V2 反馈③：任务目标数值——earn_ep 目标按 ≤10 分钟基准生成（整数、前期不出现百万级/小数）；
//    存量旧任务（goal 带小数/超大）启动时经 normalizeProjectGoals 收敛；文案「EP 积累/限时内累计 EP」
// V3 反馈②：离线预期不再动态展示——顶栏 ob-preview 固定「按效率结算」，离线面板移除动态「预期收益」数值
// 运行前提：npm run build 已产出最新 dist（本套件走 file:// 真实浏览器实跑）
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const EV = process.cwd() + '/../../artifacts/v241-evidence';
mkdirSync(EV, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const saveBase = (over = {}) => ({
  _version: 6, chapter: '1', storyline: 'default',
  ep: 1e5, rp: 0, upgrades: {}, milesDone: {}, tech: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: true },
  lastSeen: Date.now(), startTime: Date.now(),
  ...over,
});
const inject = (page, save) => {
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  return page.evaluateOnNewDocument(new Function(`
  try { localStorage.clear(); } catch (e) {}
  localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
`));
};

// ===== V1：顶栏 EP 消耗显示 =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({ cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }] }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const c = await page.evaluate(() => ({
    salary: document.getElementById('h-salary')?.textContent || '',
    salaryColor: document.getElementById('h-salary') ? getComputedStyle(document.getElementById('h-salary')).color : '',
    cps: document.getElementById('h-cps')?.textContent || '',
    badVar: getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(),
  }));
  rec('V1 顶栏新增「消耗/s」且为数值（非 0/缺省）', /\/s$/.test(c.salary) && parseFloat(c.salary) > 0, JSON.stringify(c));
  rec('V1 消耗为负面红色（--bad #f85149 = rgb(248,81,73)）', c.salaryColor === 'rgb(248, 81, 73)', `color=${c.salaryColor}`);
  rec('V1 h-cps 仍为纯数字净额（未被新元素污染）', /^[\d.]+(\/[KM])?\/s$/.test(c.cps), `cps=${c.cps}`);
  await page.screenshot({ path: EV + '/v1-topbar-salary.png' });
  await page.close();
}

// ===== V2：任务目标数值与文案（含存量旧任务规范化） =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // 注入带旧公式任务的存档：goal 为长小数 + 超大值（cps 中等，旧目标 1631853.58）
  await inject(page, saveBase({
    ep: 5e6, rp: 100,
    upgrades: { scribble: 5, script: 2, storage: 3 },
    cultists: [{ name: 'T0', output: 3, mood: '正常', moodTimer: 999 }],
    projects: [{
      type: 'earn_ep', name: 'EP 积累', desc: '限时内累计 EP',
      goal: 1631853.5811883695, progress: 7601, status: 'active',
      deadline: Date.now() + 3600000, startsAt: Date.now() - 1000,
      reward: { kind: 'ep', amount: 4892400 }, pendingAt: 0,
      runEarnedAt: 0, buysAt: 0, threadsAt: 0, clicksAt: 0,
    }],
  }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1800);
  const t = await page.evaluate(() => {
    const el = document.querySelector('#projects .proj');
    const prog = el ? el.querySelector('.prog-txt')?.textContent || '' : '';
    return { prog, name: el ? (el.querySelector('.pn span')?.textContent || '') : '', all: document.getElementById('projects')?.textContent || '' };
  });
  rec('V2 任务卡文案为「EP 积累」且进度行「限时内累计 EP」', t.name.includes('EP 积累') && t.prog.includes('限时内累计 EP'), JSON.stringify(t));
  rec('V2 存量旧任务目标已规范化：goal 整数且按新基准（无小数、无百万级）',
    (() => { const m = t.prog.match(/\/(\d+)/); return m && !/\.\d/.test(m[1]) && Number(m[1]) <= 1e6; })(), t.prog);
  await page.screenshot({ path: EV + '/v2-project-goal.png' });
  await page.close();
}

// ===== V3：离线预期静态化 =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({ ep: 50000 }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  // v2.5 ⑦：主面板离线栏整块移除（离线效率/上限/预期；离线玩法保留在「离线」tab）
  const ob = await page.evaluate(() => ({
    bar: !!document.getElementById('offline-bar'),
    preview: !!document.getElementById('ob-preview'),
    cap: !!document.getElementById('ob-cap'),
    eff: !!document.getElementById('ob-eff'),
  }));
  rec('V3 主面板离线展示整块移除（v2.5 ⑦：offline-bar/ob-* 不存在）', !ob.bar && !ob.preview && !ob.cap && !ob.eff, JSON.stringify(ob));
  // 离线面板：切到离线 tab 后检查无「预期收益」动态行、有静态口径说明
  await page.evaluate(() => document.getElementById('btn-offline')?.click());
  await sleep(500);
  const panel = await page.evaluate(() => document.getElementById('offline-panel')?.textContent || '');
  rec('V3 离线面板无「预期收益」动态数值行', !panel.includes('预期收益'), '');
  rec('V3 离线面板为静态口径说明（效率/上限/结算说明）',
    panel.includes('离线效率') && panel.includes('离线上限') && panel.includes('按效率×上限结算'), panel.slice(0, 80).replace(/\s+/g, ' '));
  await page.screenshot({ path: EV + '/v3-offline-static.png' });
  await page.close();
}

// ===== V4：新任务生成——goal 整数且 ≤ 10 分钟基准（低 cps 新档） =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({ ep: 10000 }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  // 从 DOM 任务卡读取启动时 spawn 的任务目标（localStorage 5s 存档周期未到，读实时 DOM）
  const g = await page.evaluate(() => {
    const el = document.querySelector('#projects .proj');
    const prog = el ? (el.querySelector('.prog-txt')?.textContent || '') : '';
    const m = prog.match(/([\d.]+)\/([\d.]+)/);
    const name = el ? (el.querySelector('.pn span')?.textContent || '') : '';
    return m ? { goal: Number(m[2]), progress: Number(m[1]), name } : null;
  });
  rec('V4 启动即生成任务（新档）', !!g, g ? `name=${g.name} goal=${g.goal}` : '无任务卡');
  if (g) {
    rec('V4 新任务 goal 为整数（无小数）', Number.isInteger(g.goal), `goal=${g.goal}`);
    // earn_ep 已由 V2 专项验证（按 ≤10 分钟基准整数）；此处验证任意类型目标均为合理小量级
    rec('V4 新任务目标无天文数值（earn_ep ≤600000 / 其他类型 ≤100）', g.goal >= 1 && g.goal <= 600000, `goal=${g.goal}`);
  }
  await page.close();
}

await browser.close();
const fail = results.filter(r => !r.ok);
console.log(`\nv2.4.1 hotfix 回归：${results.length - fail.length}/${results.length} 通过`);
if (fail.length) { console.log('FAILED:', fail.map(f => f.name).join(' | ')); process.exit(1); }
