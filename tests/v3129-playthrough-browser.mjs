// v3.12.9 真实浏览器「推进到终章」通关回放 + 可玩性 / 数值 / UI / 转生准确性验收
//
// 与 30 天推演的分工：
//   - tests/v3110-30day-browser.mjs = 自然开局 30 天节奏（不注入后期资产）；
//   - 本脚本 = 长线种子存档 + 真实 DOM 操作 + 虚拟墙钟逐帧回放，覆盖「章节链 → 终章」
//     这条自然开局短期内到不了的长线路径，并在终点做晋升 / 轮回准确性验收。
//
// 真实性边界（与 docs/QA_FUNCTIONAL_REPORT_V3.md 口径一致）：
//   种子存档模拟「已玩很久的档」；此后所有推进都经产品真实入口（点击 / 购买 / 领任务 /
//   #prestige-btn + 天赋弹窗 / #reincarn-btn + 确认框）与 window.__tick 逐帧驱动，
//   不直接写 S 伪造章节进度。章节驻留天数由 mock 的 Date.now() 逐 10s 推进，与 tick 同步。
//
// 用法：
//   DAYS=3 REPORT=/tmp/gray.json node tests/v3129-playthrough-browser.mjs      # 灰度
//   DAYS=95 REPORT=/tmp/v3129.json node tests/v3129-playthrough-browser.mjs    # 全量到终章
//   STOP_AT=18 可改目标章节；CHROME_PATH 由 tests/_chrome.mjs 统一解析。
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'node:fs';
import { chromePath } from './_chrome.mjs';
import { BALANCE } from '../src/data/balance.js';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const DAYS = Number(process.env.DAYS || 95);
const STOP_AT = Number(process.env.STOP_AT || 18);
const REPORT = process.env.REPORT || '/tmp/v3129-playthrough.json';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const TICKS_PER_DAY = 8640; // 86400s / 10s
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };
const fx = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d });

// 种子存档用真实建筑 id，避免造出「计数够但不存在的建筑」这种假可达。
const BUILDING_IDS = [
  ...Object.keys(BALANCE.buildings || {}),
  ...Object.keys(BALANCE.buildingsV21 || {}),
  ...Object.keys(BALANCE.crossroadBuildings || {}),
];
const TECH_IDS = ['offline1', 'focus_opt', 'entropy_reduce', 'deep_space', 'ai_core', 'chaos_shield'];

function mkSave() {
  const now = Date.now();
  const unlockedBuildings = {};
  for (const id of BUILDING_IDS) unlockedBuildings[id] = true;
  const tech = {};
  for (const id of TECH_IDS) tech[id] = true;
  return JSON.stringify({
    _version: 6,
    // 默认线：provider 章节表只有主线 46 章，专测「主线 → 终章(18)」这条链；
    // 非默认线的变体分支另由 tests/v3129-chapter-chain.test.mjs 覆盖。
    chapter: '1', chapterEnteredAt: now, storyline: 'default',
    ep: 2e6, rp: 1200, es: 3000, dm: 5e4, pt: 5000, faith: 600,
    prestige: 320, prestigePoints: 600, runEarned: 1e20, allTimeEp: 1e21,
    expeditionsDone: 40, projectsDone: 420, riftsSealed: 24, riftEmber: 6e4,
    upgrades: { scribble: 12, cpu: 8, storage: 4 },
    buildings: { end_shrine: 1 }, unlockedBuildings, tech,
    religion: { branch: 'order', level: 3 },
    moduleUnlocks: { reincarn: true, bazaar: true },
    bazaar: { unlocked: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, es: true, rank: true, faith: true, pt: true, dm: true },
    achievements: {}, achievementsSeen: {},
    projects: [], cultists: [], pets: {}, activePets: [], colonies: {},
    resonance: { layers: 24, focus: 'rp' },
    galaxyDone: {}, wageState: { state: 'ok' },
    lastSeen: now, startTime: now - 30 * 86400000,
  });
}

const report = { version: VERSION, days: DAYS, stopAt: STOP_AT, seedBuildingIds: BUILDING_IDS.length,
  chapters: [], checks: {}, telemetry: {}, pass: 0, fail: 0 };

const browser = await puppeteer.launch({
  executablePath: chromePath(), headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
page.setDefaultTimeout(600000);
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 200)); });

await page.evaluateOnNewDocument((save) => {
  localStorage.setItem('abyss_idle_v2', save);
  window.__vt = 0;
  const origNow = Date.now.bind(Date);
  Date.now = () => origNow() + window.__vt;
  window.__timerIds = [];
  const origSI = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...a) => { const id = origSI(fn, ms, ...a); window.__timerIds.push(id); return id; };
}, mkSave());

console.log(`\n=== v${VERSION} 真实浏览器终章回放：目标第 ${STOP_AT} 章 / 最多 ${DAYS} 天 / 种子建筑 ${BUILDING_IDS.length} 栋 ===`);

try {
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  // ---------- A. 启动健全性 ----------
  console.log('\n[A] 启动健全性');
  const boot = await page.evaluate(() => {
    (window.__timerIds || []).forEach(id => clearInterval(id));
    window.__simT = performance.now() + 1000;
    const q = window.__qa;
    window.__prodCands = q ? q.UPGRADES.filter(u => u.cps > 0 && /^基础产出\+/.test(u.desc || '')) : [];
    window.__chapterLog = [];
    window.__lastCh = String(window.S.chapter || '1');
    window.__stats = { clicks: 0, buys: 0, claims: 0, buyFails: 0, errors: [], maxEpRatio: 0, minCps: Infinity, maxCps: 0 };
    // 逐帧批跑：虚拟墙钟与 tick 同步推进 10s，绝不一次性跳天（否则离线结算会失真）
    window.__runBatch = (ticks) => {
      const S = window.S, q = window.__qa, st = window.__stats;
      for (let i = 0; i < ticks; i++) {
        window.__vt += 10000;
        window.__simT += 10000;
        window.__tick(window.__simT);
        const cap = q.epStorageCap();
        const cps = q.computeCps();
        if (Number.isFinite(cps)) { st.minCps = Math.min(st.minCps, cps); st.maxCps = Math.max(st.maxCps, cps); }
        if (cap > 0) st.maxEpRatio = Math.max(st.maxEpRatio, S.ep / cap);
        const ch = String(S.chapter || '1');
        if (ch !== window.__lastCh) {
          window.__chapterLog.push({ chapter: ch, day: window.__vt / 86400000, tick: i });
          window.__lastCh = ch;
        }
        // 每 600 tick（=100 游戏分钟）做一次真实玩家决策，降低长跑开销
        if (i % 600 !== 0) continue;
        try { q.sim.doClick(); st.clicks++; } catch (e) { if (st.errors.length < 10) st.errors.push('click:' + e.message); }
        try {
          for (const p of (S.projects || [])) if (p.status === 'pending' && q.sim.claimProject(p)?.ok) st.claims++;
        } catch (e) { if (st.errors.length < 10) st.errors.push('claim:' + e.message); }
        try {
          let pick = null, best = Infinity;
          for (const u of window.__prodCands) {
            if ((S.upgrades[u.id] || 0) >= (u.maxLevel || Infinity)) continue;
            const c = q.bulkCostCalc(u, 1);
            if (!Number.isFinite(c) || c > S.ep * 0.8) continue;
            const score = c / Math.max(u.cps, 1e-9);
            if (score < best) { best = score; pick = u; }
          }
          // 真实 DOM 点击优先（验证事件委托链路），失败才回退到产品入口
          if (pick) {
            const el = document.querySelector(`#shop-list [data-buy="${pick.id}"]`);
            const before = S.upgrades[pick.id] || 0;
            if (el && !el.classList.contains('disabled')) el.click();
            else q.sim.buyUpgrade(pick);
            if ((S.upgrades[pick.id] || 0) > before) st.buys++; else st.buyFails++;
          }
        } catch (e) { if (st.errors.length < 10) st.errors.push('buy:' + e.message); }
      }
      return window.__chapterLog.length;
    };
    return {
      hasS: !!window.S, hasQa: !!window.__qa, chapter: String(window.S.chapter || '1'),
      cps: window.__qa ? window.__qa.computeCps() : NaN,
      techCount: Object.keys(window.S.tech || {}).length + Object.keys(window.S.unlockedBuildings || {}).length,
      panels: window.__qa ? window.__qa.allPanels().length : 0,
      flows: window.__qa ? Object.keys(window.__qa.flowStats()).length : 0,
    };
  });
  if (boot.hasS && boot.hasQa) ok('游戏状态与 QA 句柄就绪', `chapter=${boot.chapter} cps=${fx(boot.cps)}`);
  else bad('启动句柄缺失', JSON.stringify(boot));
  if (boot.techCount >= 45) ok('种子档科技+建筑计数满足第 10 章门槛', `techCount=${boot.techCount}`);
  else bad('种子档 techCount 不足，章节链会断在第 10 章', `${boot.techCount} < 45`);

  // ---------- B. 逐日推进到终章 ----------
  console.log('\n[B] 章节链推进（逐帧虚拟墙钟）');
  let reached = null;
  const started = Date.now();
  for (let day = 1; day <= DAYS; day++) {
    const n = await page.evaluate((t) => window.__runBatch(t), TICKS_PER_DAY);
    if (day % 10 === 0 || day === 1) {
      const st = await page.evaluate(() => ({ ch: String(window.S.chapter), day: window.__vt / 86400000,
        ep: window.S.ep, cps: window.__qa.computeCps(), log: window.__chapterLog.length }));
      console.log(`    D${String(day).padStart(3)} → 第 ${st.ch} 章 / 已推进 ${st.log} 次 / EP ${fx(st.ep)} / CPS ${fx(st.cps)}`);
    }
    const cur = await page.evaluate(() => parseInt(String(window.S.chapter || '1'), 10));
    if (cur >= STOP_AT) { reached = { day, chapter: cur }; break; }
  }
  const elapsedSec = Math.round((Date.now() - started) / 1000);
  const chapterLog = await page.evaluate(() => window.__chapterLog);
  report.chapters = chapterLog;
  report.telemetry.elapsedSec = elapsedSec;
  report.telemetry.virtualDays = await page.evaluate(() => window.__vt / 86400000);

  if (reached) ok(`到达终章（第 ${STOP_AT} 章）`, `虚拟第 ${reached.day} 天 / 实跑 ${elapsedSec}s / 推进 ${chapterLog.length} 次`);
  else bad('未到达终章', `最终章节 ${await page.evaluate(() => String(window.S.chapter))}，日志 ${JSON.stringify(chapterLog.slice(-6))}`);

  // 章节序列必须严格 +1、不回退、不跳章
  // 既有设计：一次 currentChapter 调用可连跳多个 minDays 已满足的章节（v360 断言锁死），
  // 因此只断言单调递增、无回退，不要求严格 +1。
  const nums = chapterLog.map(x => parseInt(x.chapter, 10)).filter(Number.isFinite);
  const seqOk = nums.length > 0 && nums.every((v, i) => i === 0 ? v >= 2 : v > nums[i - 1]);
  if (seqOk) ok('章节序列单调递增、无回退（连跳属既有 minDays 设计）', nums.join('→'));
  else bad('章节序列回退或异常', nums.join('→'));

  // 每章驻留天数不低于 minDays（容差 0.02 天 = 约 3 tick）
  const { CHAPTERS } = await import('../src/data/chapters.js');
  const dwellBad = [];
  let prevDay = 0;
  for (const rec of chapterLog) {
    const id = parseInt(rec.chapter, 10);
    const need = CHAPTERS.find(c => c.id === id)?.minDays ?? 0;
    const dwell = rec.day - prevDay;
    if (dwell + 0.02 < need) dwellBad.push(`第${id}章 实驻 ${dwell.toFixed(2)}d < ${need}d`);
    prevDay = rec.day;
  }
  if (!dwellBad.length) ok('每章驻留天数均满足 minDays 门控', `累计 ${prevDay.toFixed(2)} 天到第 ${nums.at(-1)} 章`);
  else bad('存在章节未达驻留门槛就推进', dwellBad.join(' / '));

  // 终章文案
  const endUi = await page.evaluate(() => {
    const el = document.getElementById('ch-name');
    const bar = document.getElementById('chapter-bar');
    return { name: el ? el.textContent : '', bar: bar ? bar.textContent.slice(0, 120) : '' };
  });
  // 灰度（STOP_AT<18）时只要求剧情栏按当前章节渲染；全量到终章才要求「终章」文案。
  const showEnd = await page.evaluate(() => parseInt(String(window.S.chapter || '1'), 10)) >= 18;
  if (endUi.name.trim().length > 0 && (!showEnd || /终章/.test(endUi.name + endUi.bar)))
    ok(showEnd ? '终章文案在剧情栏真实渲染' : '剧情栏按当前章节真实渲染（灰度）', endUi.name.trim());
  else bad(showEnd ? '终章文案未渲染' : '剧情栏未渲染章节名', JSON.stringify(endUi));

  // ---------- C. 数值准确性 ----------
  console.log('\n[C] 数值准确性');
  const stats = await page.evaluate(() => window.__stats);
  const num = await page.evaluate(() => {
    const q = window.__qa, S = window.S;
    const u = q.UPGRADES.find(x => x.cps > 0 && /^基础产出\+/.test(x.desc || ''));
    const c1 = u ? q.bulkCostCalc(u, 1) : NaN;
    const owned = u ? (S.upgrades[u.id] || 0) : 0;
    const c2 = u ? q.bulkCostCalc(u, 2) - c1 : NaN;
    return { cps: q.computeCps(), cap: q.epStorageCap(), ep: S.ep, rp: S.rp, rpCap: q.rpCap(),
      c1, c2, owned, flowErrors: q.flowErrors().length, panelErrors: q.panelErrors().length,
      systemErrors: q.systemErrors().length };
  });
  if (Number.isFinite(num.cps) && num.cps > 0 && Number.isFinite(num.cap) && num.cap > 0)
    ok('CPS / EP 上限全程有限且为正', `CPS ${fx(num.cps)} / 上限 ${fx(num.cap)}`);
  else bad('CPS 或 EP 上限出现非法值', JSON.stringify(num));
  if (stats.maxEpRatio <= 1.001) ok('EP 全程未突破存储上限', `峰值占比 ${(stats.maxEpRatio * 100).toFixed(1)}%`);
  else bad('EP 突破存储上限', `${(stats.maxEpRatio * 100).toFixed(1)}%`);
  if (num.rp <= num.rpCap + 1) ok('RP 余额未超上限（钳制生效）', `${fx(num.rp)} / ${fx(num.rpCap)}`);
  else bad('RP 余额超上限', `${fx(num.rp)} / ${fx(num.rpCap)}`);
  if (Number.isFinite(num.c2) && num.c2 > num.c1) ok('同一升级下一档成本严格递增', `${fx(num.c1)} → ${fx(num.c2)}`);
  else bad('成本曲线倒挂或非有限', JSON.stringify({ c1: num.c1, c2: num.c2 }));
  if (num.flowErrors === 0 && num.panelErrors === 0 && num.systemErrors === 0)
    ok('资源流 / 面板 / 帧系统错误队列全空');
  else bad('运行时错误队列非空', JSON.stringify({ flow: num.flowErrors, panel: num.panelErrors, system: num.systemErrors }));
  if (!stats.errors.length) ok('自动玩家动作零异常', `点击 ${stats.clicks} / 购买 ${stats.buys} / 领任务 ${stats.claims}`);
  else bad('自动玩家动作抛异常', stats.errors.join(' | '));

  // ---------- D. UI 准确性 ----------
  console.log('\n[D] 各功能 UI 准确性');
  const ui = await page.evaluate(() => {
    const texts = [];
    document.querySelectorAll('.panel, .card, .stat, .item, .off-stat, .btn').forEach(el => {
      const t = el.textContent || '';
      if (/undefined|NaN|Infinity/.test(t)) texts.push((el.id || el.className).toString().slice(0, 40) + ':' + t.slice(0, 60));
    });
    const small = [];
    document.querySelectorAll('button, .btn').forEach(b => {
      if (b.offsetParent === null) return;
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24)) small.push(`${(b.id || b.className).toString().slice(0, 28)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    });
    // 孤字换行：只对单个 inline 文本元素做 getClientRects
    const orphans = [];
    document.querySelectorAll('.item .desc, .off-stat span, .off-stat b').forEach(el => {
      if (el.children.length) return;
      const rects = el.getClientRects();
      if (rects.length > 1 && (el.textContent || '').trim().length <= 3) orphans.push((el.textContent || '').trim());
    });
    return { badTexts: texts.slice(0, 8), badCount: texts.length, small: small.slice(0, 8), smallCount: small.length,
      orphans: orphans.slice(0, 8), orphanCount: orphans.length,
      topbar: document.getElementById('topbar')?.textContent?.slice(0, 160) || '' };
  });
  if (ui.badCount === 0) ok('全部面板文本无 undefined / NaN / Infinity');
  else bad('面板文本含非法数值', ui.badTexts.join(' | '));
  if (ui.smallCount === 0) ok('可见按钮点击目标均 ≥24×24');
  else bad('存在过小点击目标', ui.small.join(' | '));
  if (ui.orphanCount === 0) ok('窄卡无孤字换行（getClientRects）');
  else bad('窄卡出现孤字换行', ui.orphans.join(' | '));

  // ---------- E. 晋升准确性（真实 DOM 弹窗链路） ----------
  console.log('\n[E] 晋升准确性');
  const preBefore = await page.evaluate(() => {
    const S = window.S;
    return { prestige: S.prestige, pp: S.prestigePoints, es: S.es, faith: S.faith,
      chapter: String(S.chapter), ach: Object.keys(S.achievements || {}).length,
      upgrades: Object.keys(S.upgrades || {}).length, tech: Object.keys(S.tech || {}).length, rp: S.rp };
  });
  const pReady = await page.evaluate(() => { const q = window.__qa; return { can: q.canPrestige(), gain: q.prestigeGain(), need: q.prestigeNeed() }; });
  await page.evaluate(() => document.getElementById('prestige-btn')?.click());
  await sleep(400);
  const modalShown = await page.evaluate(() => !!document.querySelector('#talent-modal .talent-option'));
  await page.evaluate(() => document.querySelector('#talent-modal .talent-option')?.click());
  await sleep(500);
  const preAfter = await page.evaluate(() => {
    const S = window.S;
    return { prestige: S.prestige, pp: S.prestigePoints, es: S.es, faith: S.faith,
      chapter: String(S.chapter), ach: Object.keys(S.achievements || {}).length,
      upgrades: Object.keys(S.upgrades || {}).length, tech: Object.keys(S.tech || {}).length,
      rp: S.rp, rpCap: window.__qa.rpCap() };
  });
  if (pReady.can && pReady.gain >= 1) ok('晋升前置达标且增益 ≥1 PP', `gain=${pReady.gain} need=${fx(pReady.need)}`);
  else bad('晋升前置未达标（种子档应可晋升）', JSON.stringify(pReady));
  if (modalShown) ok('晋升弹出天赋选择弹窗（真实 DOM）');
  else bad('天赋弹窗未出现');
  if (preAfter.prestige === preBefore.prestige + 1 && preAfter.pp > preBefore.pp)
    ok('职级 +1 且职级点增加', `${preBefore.prestige}→${preAfter.prestige} / PP ${preBefore.pp}→${preAfter.pp}`);
  else bad('晋升计数或职级点异常', JSON.stringify({ before: preBefore, after: preAfter }));
  // ES 在晋升时会按本局累计发放（esGain），因此只要求「不减少」；其余跨局资产要求完全不变。
  if (preAfter.es >= preBefore.es && preAfter.faith === preBefore.faith && preAfter.chapter === preBefore.chapter
      && preAfter.ach === preBefore.ach)
    ok('跨局资产（ES / 信仰 / 章节 / 成就）完整保留', `ES ${fx(preBefore.es)} → ${fx(preAfter.es)}（含本局发放）`);
  else bad('跨局资产在晋升后丢失', JSON.stringify({ before: preBefore, after: preAfter }));
  if (preAfter.upgrades === 0 && preAfter.tech === 0) ok('本局升级 / 科技按清单清零');
  else bad('本局资产未清零', JSON.stringify({ upgrades: preAfter.upgrades, tech: preAfter.tech }));
  if (preAfter.rp <= preAfter.rpCap + 1) ok('晋升后 RP 余额受新上限钳制', `${fx(preAfter.rp)} / ${fx(preAfter.rpCap)}`);
  else bad('晋升后 RP 超上限', `${fx(preAfter.rp)} / ${fx(preAfter.rpCap)}`);

  // ---------- F. 轮回准确性（真实 DOM 二次确认链路） ----------
  console.log('\n[F] 轮回准确性');
  const reReady = await page.evaluate(() => window.__qa.reincarnReady());
  // 晋升会清空 runEarned（本局制），因此此刻轮回门槛回落到「需重新累计」是正确口径；
  // 补足本局累计后由 reReady2 断言真正可达。
  if (!reReady.ok && /本局累计/.test(reReady.reason))
    ok('晋升后本局累计清零，轮回门槛回落（本局制口径）', reReady.reason);
  else if (reReady.ok) ok('轮回前置在晋升后仍达标', `echo=${reReady.echo}`);
  else bad('轮回前置异常', JSON.stringify(reReady));
  const reBefore = await page.evaluate(() => {
    const S = window.S;
    return { reincarned: S.reincarned || 0, echo: S.abyssEcho || 0, es: S.es, faith: S.faith,
      chapter: String(S.chapter), prestige: S.prestige, moduleUnlocks: JSON.stringify(S.moduleUnlocks || {}) };
  });
  await page.evaluate(() => { window.S.runEarned = Math.max(window.S.runEarned || 0, 2e9); }); // 只补足门槛，不伪造章节/资产
  const reReady2 = await page.evaluate(() => window.__qa.reincarnReady());
  await page.evaluate(() => document.getElementById('reincarn-btn')?.click());
  await sleep(400);
  const confirmShown = await page.evaluate(() => !!document.getElementById('confirm-ok'));
  await page.evaluate(() => document.getElementById('confirm-ok')?.click());
  await sleep(600);
  const reAfter = await page.evaluate(() => {
    const S = window.S;
    return { reincarned: S.reincarned || 0, echo: S.abyssEcho || 0, es: S.es, faith: S.faith,
      chapter: String(S.chapter), prestige: S.prestige, moduleUnlocks: JSON.stringify(S.moduleUnlocks || {}),
      rp: S.rp, rpCap: window.__qa.rpCap() };
  });
  if (confirmShown) ok('轮回二次确认弹窗出现（真实 DOM）');
  else bad('轮回确认弹窗未出现');
  const echoDelta = reAfter.echo - reBefore.echo;
  if (reReady2.ok && reAfter.reincarned === reBefore.reincarned + 1 && echoDelta > 0 && echoDelta <= 100)
    ok('轮回计数 +1 且回响增益受单次上限约束', `${reBefore.reincarned}→${reAfter.reincarned} / +${echoDelta}`);
  else bad('轮回结算异常', JSON.stringify({ ready: reReady2, before: reBefore, after: reAfter }));
  if (reAfter.es === reBefore.es && reAfter.faith === reBefore.faith && reAfter.chapter === reBefore.chapter
      && reAfter.moduleUnlocks === reBefore.moduleUnlocks)
    ok('跨轮回资产（ES / 信仰 / 章节 / 已买断模块）完整保留');
  else bad('跨轮回资产丢失', JSON.stringify({ before: reBefore, after: reAfter }));
  if (reAfter.rp <= reAfter.rpCap + 1) ok('轮回后 RP 余额受新上限钳制');
  else bad('轮回后 RP 超上限', `${fx(reAfter.rp)} / ${fx(reAfter.rpCap)}`);

  // ---------- G. 可玩性与收尾 ----------
  console.log('\n[G] 可玩性 / 运行时健康');
  // 转生后本局升级清零 → CPS 归零属预期；判定「是否存在恢复路径」而非「当前是否有产出」。
  const final = await page.evaluate(() => {
    const q = window.__qa, S = window.S;
    const ep0 = S.ep;
    for (let i = 0; i < 5; i++) q.sim.doClick();
    const clickGain = S.ep - ep0;
    let cheapest = Infinity;
    for (const u of q.UPGRADES.filter(x => x.cps > 0)) {
      const c = q.bulkCostCalc(u, 1);
      if (Number.isFinite(c) && c > 0) cheapest = Math.min(cheapest, c);
    }
    return { chapter: String(S.chapter), cps: q.computeCps(), ep: S.ep, cap: q.epStorageCap(),
      clickGain, cheapest, panelErrors: q.panelErrors().length };
  });
  if (Number.isFinite(final.cps) && final.cps >= 0) ok('转生后 CPS 有限（本局资产清零属预期）', `CPS ${fx(final.cps)}`);
  else bad('转生后 CPS 非法', JSON.stringify(final));
  if (final.clickGain > 0 && Number.isFinite(final.cheapest))
    ok('转生后无永久软锁：点击可产 EP、商店存在可购升级', `点击 +${fx(final.clickGain)} EP / 最便宜 ${fx(final.cheapest)} EP`);
  else bad('转生后无恢复路径', JSON.stringify(final));
  if (errs.length === 0) ok('全程 0 个 pageerror / console.error');
  else bad('浏览器运行时错误', errs.slice(0, 5).join(' | '));
  report.telemetry.final = final;
  report.telemetry.stats = stats;
  report.telemetry.prestige = { before: preBefore, after: preAfter, ready: pReady };
  report.telemetry.reincarn = { before: reBefore, after: reAfter, ready: reReady2 };
  report.checks.ui = ui;
  if (errs.length) report.pageErrors = errs;
} finally {
  await page.close();
  await browser.close();
}

report.pass = pass; report.fail = fail;
writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 / 虚拟 ${Number(report.telemetry.virtualDays || 0).toFixed(1)} 天 / 报告 ${REPORT} ===`);
process.exit(fail > 0 ? 1 : 0);
