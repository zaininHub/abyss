// v3.8.0 快速浏览器烟测：重构后运行时接线 / 数值等价 / 新玩法面板可用性
// 用法：CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/v380-smoke-browser.mjs
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const mkSave = () => JSON.stringify({
  _version: 6, chapter: '1', storyline: 'line_order', ep: 0, rp: 0, es: 0, dm: 0, pt: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: [], faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(),
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'],
});
const page = await browser.newPage();
page.setDefaultTimeout(120000);
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await page.evaluateOnNewDocument((save) => {
  localStorage.setItem('abyss_idle_v2', save);
  window.__vt = 0;
  const origNow = Date.now.bind(Date);
  Date.now = () => origNow() + window.__vt;
  window.__timerIds = [];
  const origSI = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const id = origSI(fn, ms, ...a); window.__timerIds.push(id); return id; };
}, mkSave());
await page.goto(URL, { waitUntil: 'load' });
await sleep(1300);

await page.evaluate(() => {
  (window.__timerIds || []).forEach(id => clearInterval(id));
  window.__simT = performance.now() + 1000;
  // 定点夹具：给 1 级基础产出，避免 cps=0 让「倍率比值 / 台账」断言退化成 0/0
  window.S.upgrades.scribble = 1;
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      window.__vt += 10000; window.__simT += 10000;
      window.__tick(window.__simT);
      window.__qa.sim.doClick();
    }
    window.__qa.sim.render();
  };
});

console.log('\n=== v3.8.0 浏览器烟测 ===');

// [1] 无运行时异常
if (errs.length === 0) ok('页面加载与启动无 pageerror');
else bad('pageerror', errs.slice(0, 3).join(' | '));

// [2] 资源流引擎接线
const flow = await page.evaluate(() => {
  const q = window.__qa;
  window.__step(120);
  return { stats: q.flowStats(), ledger: q.flowLedger(), errs: q.flowErrors(), phases: q.FLOW_PHASES };
});
const ids = Object.keys(flow.stats);
if (ids.length === 8 && ids.every(id => flow.stats[id].ticks > 0)) {
  ok('8 条资源流全部真实执行', ids.join(', '));
} else bad('资源流未全部执行', JSON.stringify(flow.stats));
if (Object.values(flow.stats).every(s => s.errors === 0) && flow.errs.length === 0) ok('资源流全程零异常');
else bad('资源流抛错', JSON.stringify(flow.errs.slice(0, 2)));
if (flow.ledger.ep && flow.ledger.ep.gross > 0) ok('守恒台账记录 EP 理论产出', `gross=${flow.ledger.ep.gross.toFixed(2)}`);
else bad('台账无 EP 记录', JSON.stringify(flow.ledger));

// [3] 数值等价：单 tick 产出入账 = computeCps() × 10s
const probe = await page.evaluate(() => {
  const S = window.S, q = window.__qa;
  S.ep = Math.min(S.ep, q.epStorageCap() * 0.1);
  const before = S.earnedFull || 0, cps = q.computeCps();
  window.__vt += 10000; window.__simT += 10000; window.__tick(window.__simT);
  return { gross: (S.earnedFull || 0) - before, cps, dt: 10 };
});
const rel = probe.cps > 0 ? Math.abs(probe.gross - probe.cps * 10) / (probe.cps * 10) : 0;
if (rel < 0.05) ok('单 tick 入账 = computeCps() × 10s', `相对误差 ${(rel * 100).toFixed(4)}%`);
else bad('产出与 CPS 不符', JSON.stringify(probe));

// [4] 效能编排：未解锁 → 全 ×1；解锁 → 策略生效且 CPS 同步变化
const orch = await page.evaluate(() => {
  const S = window.S, q = window.__qa;
  const locked = { unlocked: q.orchestrationUnlocked(S), ep: q.orchestrationMult('ep', S) };
  S.projectsDone = 3; // 定点解锁（不伪造进度链，仅验证门控）
  const baseCps = q.computeCps();
  q.setOrchestrationMode(S, 'output');
  const out = { mult: q.orchestrationMult('ep', S), cps: q.computeCps(), rp: q.orchestrationMult('rp', S) };
  q.setOrchestrationMode(S, 'research');
  const res = { mult: q.orchestrationMult('ep', S), cps: q.computeCps(), rp: q.orchestrationMult('rp', S) };
  q.setOrchestrationAutoTide(S, true);
  S.tidePhase = 0;
  const auto0 = q.effectiveModeId(S);
  S.tidePhase = 2;
  const auto2 = q.effectiveModeId(S);
  q.setOrchestrationAutoTide(S, false);
  q.setOrchestrationMode(S, 'balanced');
  return { locked, baseCps, out, res, auto0, auto2 };
});
if (!orch.locked.unlocked && orch.locked.ep === 1) ok('未解锁时编排不放大任何数值');
else bad('未解锁门控失效', JSON.stringify(orch.locked));
if (Math.abs(orch.out.cps / orch.baseCps - 1.25) < 1e-6 && Math.abs(orch.res.cps / orch.baseCps - 0.92) < 1e-6) {
  ok('策略切换与 computeCps 同口径', `产能 ×${(orch.out.cps / orch.baseCps).toFixed(2)} / 研究 ×${(orch.res.cps / orch.baseCps).toFixed(2)}`);
} else bad('CPS 与编排倍率不同口径', JSON.stringify({ base: orch.baseCps, out: orch.out, res: orch.res }));
if (Math.abs(orch.out.rp - 0.8) < 1e-9 && Math.abs(orch.res.rp - 1.4) < 1e-9) ok('蒸馏/孵化修饰器读侧生效', `产能 rp ×${orch.out.rp} / 研究 rp ×${orch.res.rp}`);
else bad('修饰器读侧异常', JSON.stringify({ out: orch.out, res: orch.res }));
if (orch.auto0 === 'output' && orch.auto2 === 'research') ok('随潮汐排班按相位轮转', `涨潮→${orch.auto0} / 退潮→${orch.auto2}`);
else bad('潮汐排班失效', JSON.stringify({ auto0: orch.auto0, auto2: orch.auto2 }));

// [5] UI：编排卡渲染 + 点击切换 + 无占位符
const ui = await page.evaluate(() => {
  const S = window.S, q = window.__qa;
  S.projectsDone = 3;
  q.setOrchestrationMode(S, 'output');
  window.__step(1); // 推进真实帧，让 1s 快刷的解锁翻转检测与 render() 生效
  const card = document.getElementById('orchestration-card');
  const panel = document.getElementById('orchestration-panel');
  const before = { visible: card && card.style.display !== 'none', text: (panel && panel.innerText) || '' };
  const btn = panel && panel.querySelector('[data-orch-mode="abyss"]');
  if (btn) btn.click();
  q.sim.render();
  const after = { mode: q.orchestrationState(S).mode, text: (panel && panel.innerText) || '' };
  return { before, after, bodyHasBad: /undefined|NaN|Infinity/.test(document.body.innerText || '') };
});
if (ui.before.visible && ui.before.text.includes('产能优先')) ok('编排卡已渲染当前策略');
else bad('编排卡未渲染', JSON.stringify(ui.before).slice(0, 300));
if (ui.after.mode === 'abyss' && ui.after.text.includes('深渊优先')) ok('策略按钮点击真实切换并被面板消费');
else bad('按钮点击未生效', JSON.stringify(ui.after).slice(0, 300));
if (!ui.bodyHasBad) ok('页面文本无 undefined / NaN / Infinity');
else bad('页面出现非法数值文本');

if (errs.length === 0) ok('全流程结束仍无 pageerror');
else bad('流程结束出现 pageerror', errs.slice(0, 3).join(' | '));

await page.close();
await browser.close();
console.log(`\n=== 烟测结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);
