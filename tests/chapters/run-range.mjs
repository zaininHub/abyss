// 分章节真实试玩测试体系 · 入口（v4.2.6 反馈②，方案文档步骤 3）
//
// 职责：顺序执行「第 M 章 → 第 N 章」的逐章推演（每章 = 一次晋升周期），
//   章间不重启浏览器（省 boot 开销），把每章晋升结算后的跨局资产快照作为下一章输入种子；
//   逐章比对「预算表预期携带」vs「真实携带」，超差即该章 FAIL 并输出偏差明细。
//
// 用法（按用户测试纪律：默认不跑；数值测试跑目标章；全量测试跑 1~18）：
//   node tests/chapters/run-range.mjs --from 1 --to 3      # 试跑前三章（校准）
//   node tests/chapters/run-range.mjs --from 5 --to 5      # 单章数值测试
//   node tests/chapters/run-range.mjs --from 1 --to 18     # 全量（所有章节真实试玩）
//
// 章节测试单元语义（方案 §2.1）：
//   输入  = 第 N 章开局的跨局资产快照（种子化：本局资源归零、chapterEnteredAt 重置）
//   过程  = 真实浏览器 + 自动玩家（产品真实入口）从第 N 章开局游玩
//           → 帧系统真实推进到第 N+1 章（cond + minDays 驻留，测试不代写推进）
//           → 继续游玩直至章内 canPrestige → 真实 doPrestige
//   输出  = 晋升结算后的跨局快照（= 第 N+1 章开局输入）+ 差值校验报告
//
// 报告：tests/chapters/reports/ch{N}-report.json（gitignore，不进仓库）+ 控制台汇总表。
import { writeFileSync, mkdirSync } from 'node:fs';
import { launchBrowser, prepPage, gotoAndSettle, sleep, TICKS_PER_DAY } from './_boot.mjs';
import { playerInit } from './_player.mjs';
import { snapshotFromState, seedFromSnapshot, compareBudget } from './_snapshot.mjs';
import { BUDGET, MAIN_CHAPTERS } from './budget.mjs';

// ---- CLI 参数 ----
const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};
const FROM = argOf('--from', 1);
const TO = argOf('--to', FROM);

const fx = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d });
const fmtN = n => !Number.isFinite(n) ? String(n)
  : Math.abs(n) >= 1e6 ? n.toExponential(2) : String(Math.round(n * 100) / 100);

/** 页面快照 + 章节终态读取（一次 evaluate 拿全，减少往返）。 */
async function readChapterState(page) {
  return page.evaluate(() => {
    const S = window.S, q = window.__qa;
    const snap = {};
    // Node 侧 SNAPSHOT_KEYS 经 playerInit 时写入 window.__playerCfg 不合适；
    // 这里直接内联全集（与 _snapshot.mjs SNAPSHOT_KEYS 同步，由 v426 单测锁死一致性）
    const KEYS = ['es','prestigePoints','eternal','achievements','religion','faith','offHistory',
      'allTimeEp','storylinesCompleted','storyline','crossroad','crossroadLockedBy',
      'familyUpgrades','resDiscovered','delve','vs','riftEmber','riftUpgrades',
      'riftLevelTech','_religionHintSeen','relics','bazaar','abyssGazeUnlocked',
      'moduleUnlocks','_purifierSeen',
      'prestige','chapter','chapterEnteredAt','expeditions','expeditionsDone',
      'milesDone','projectsDone','totalBuys','totalClicks'];
    for (const k of KEYS) {
      if (S[k] === undefined) continue;
      const v = S[k];
      snap[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
    }
    return { snap, runEarned: S.runEarned || 0, need: q.prestigeNeed(), canPrestige: !!q.canPrestige() };
  });
}

/**
 * 单章执行：第 N 章开局 → 第 N+1 章条件达成并真实推进 → 章内完成晋升 → 快照。
 * 返回逐日曲线（供超时诊断与报告）。
 */
async function runChapter(page, { n, maxDays }) {
  const daily = [];
  let advanced = false, prestigesAtEntry = null, advancedDay = null;
  for (let d = 1; d <= maxDays; d++) {
    const snap = await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
    snap.day = d;
    daily.push({ day: d, ep: snap.ep, cps: snap.cps, chapter: snap.chapter,
      prestige: snap.prestige, es: snap.es, rp: snap.rp, projectsDone: snap.projectsDone,
      buys: snap.totalBuys, errors: snap.stats.errors.length });
    // 章节推进检测：S.chapter 真实变为 N+1（帧系统 chapter 系统驱动）
    if (!advanced && parseInt(String(snap.chapter), 10) >= n + 1) {
      advanced = true;
      advancedDay = d;
      prestigesAtEntry = snap.prestige;
    }
    // 完成判据：已推进到 N+1 且章内至少完成一次晋升（晋升计数超过进入 N+1 时的值）
    if (advanced && prestigesAtEntry != null && snap.prestige > prestigesAtEntry) {
      return { done: true, daily, advancedDay, daysUsed: d, final: snap };
    }
    // 「章内晋升完成」兜底：第 N+1 章本身条件含晋升（如第 2 章条件 prestige>=2）时，
    // 推进动作与晋升几乎同时发生——进入 N+1 后需要至少再晋升一次才算「章内晋升」完成。
  }
  return { done: false, daily, advancedDay, daysUsed: maxDays, final: daily[daily.length - 1] || null };
}

// ---- 主流程 ----
console.log(`\n=== 分章节真实试玩：第 ${FROM}~${TO} 章（预算表 v4.2.6） ===`);
const results = [];
const browser = await launchBrowser();
let page = null, errs = [];
try {
  let carry = null; // 上一章晋升结算快照 → 本章输入
  for (let n = FROM; n <= TO; n++) {
    const budget = BUDGET[n];
    if (!budget) { console.log(`  ✗ 第 ${n} 章无预算条目，跳过`); continue; }
    const t0 = Date.now();
    // carry 垫底：链式跑用真实快照；独立跑（无 carry）从预算 carry 起步。
    // 真实快照低于 carry 的键补到 carry（模拟「上一章至少完成保底晋升」），高于则保留真实值。
    const boost = budget.carry || null;
    // 链式跑章号由真实快照携带；独立跑（无 carry）传 n 从第 N 章开局（防重爬 1~N-1 章）
    const seed = carry ? seedFromSnapshot(carry, { boost })
      : seedFromSnapshot(boost || {}, { boost, chapter: n });
    if (page) { await page.close(); page = null; }
    const { page: p, errs: e2 } = await prepPage(browser, { save: seed });
    page = p; errs = errs.concat(e2);
    await gotoAndSettle(page);
    await page.evaluate(playerInit, { prestigeGapTicks: 2880, goalChapter: n + 1, maxDays: budget.maxDays,
      holdPrestigeUntilAdvanced: true, label: 'ch' + n }); // v4.2.6 校准③：未推进前憋晋升（真人冲章节策略）
    const inputSnap = await readChapterState(page);
    if (carry) {
      // 链式输入校验（下界语义）：种子恢复的晋升/ES 不得低于上一章输出（快照失真检测）
      const prIn = inputSnap.snap.prestige || 0, prOut = carry.prestige || 0;
      const esIn = inputSnap.snap.es || 0, esOut = carry.es || 0;
      if (prIn < prOut || esIn < esOut) {
        results.push({ n, verdict: 'FAIL', reason: `链式种子失真：prestige ${prIn}<${prOut} 或 es ${esIn}<${esOut}`, elapsedSec: 0 });
        continue;
      }
    }
    console.log(`\n--- 第 ${n} 章（预算 maxDays=${budget.maxDays}，输入 prestige=${inputSnap.snap.prestige || 0} / es=${fx(inputSnap.snap.es || 0)}） ---`);
    const run = await runChapter(page, { n, maxDays: budget.maxDays });
    const elapsedSec = +((Date.now() - t0) / 1000).toFixed(1);
    // 终态快照（晋升结算后）
    const endState = await readChapterState(page);
    const actual = endState.snap;
    // 校验
    const deviations = [];
    if (!run.done) deviations.push(`超时：${budget.maxDays} 模拟天内未完成「推进到第 ${n + 1} 章 + 章内晋升」（末章 ${run.final ? run.final.chapter : '?'}，晋升 ${run.final ? run.final.prestige : '?'}）`);
    else if (parseInt(String(actual.chapter), 10) < n + 1) {
      deviations.push(`章节未真实推进：S.chapter=${actual.chapter} < ${n + 1}`);
    }
    const cmp = compareBudget(budget, carry || zeroInput(), actual,
      { extra: { prestigeEsGain: run.final ? (run.final.prestigeEsGain || 0) : 0 } });
    deviations.push(...cmp.deviations);
    const inputSnapshot = inputSnap.snap; // 每章输入快照都落盘（用户口径：比对预期输入 vs 真实输入）
    // 链式一致性：本章输出快照成为下一章输入
    carry = actual;
    const verdict = deviations.length === 0 ? 'PASS' : 'FAIL';
    const report = {
      chapter: n, verdict, deviations,
      inputSnapshot,
      expectedCarry: budget.carry || null,
      expected: { minPrestige: budget.minPrestige, es: budget.es, pp: budget.pp, rp: budget.rp, maxDays: budget.maxDays },
      actual: { ...cmp.actual, es: actual.es, rp: actual.rp, prestige: actual.prestige, runEarnedAtEnd: endState.runEarned, needAtEnd: endState.need },
      daily: run.daily, advancedDay: run.advancedDay, daysUsed: run.daysUsed,
      pageErrors: errs.slice(), elapsedSec,
    };
    mkdirSync('tests/chapters/reports', { recursive: true });
    writeFileSync(`tests/chapters/reports/ch${n}-report.json`, JSON.stringify(report, null, 2));
    results.push({ n, verdict, reason: verdict === 'PASS'
      ? `D${run.advancedDay} 推进 / ${run.daysUsed} 天 / 晋升Δ${cmp.actual.prestigeDelta} / ESΔ${fmtN(cmp.actual.esDelta)}`
      : deviations[0], elapsedSec, deviations });
    console.log(`  ${verdict === 'PASS' ? '✓' : '✗'} 第 ${n} 章 ${verdict} — ${results[results.length - 1].reason}（${elapsedSec}s）`);
    if (verdict === 'FAIL' && deviations.length > 1) {
      for (const d of deviations.slice(1, 5)) console.log(`      · ${d}`);
    }
  }
} finally {
  if (page) await page.close();
  await browser.close();
}

// ---- 汇总表 ----
console.log(`\n=== 汇总（第 ${FROM}~${TO} 章） ===`);
const fails = results.filter(r => r.verdict === 'FAIL');
for (const r of results) {
  console.log(`  ${r.verdict === 'PASS' ? '✓' : '✗'} ch${String(r.n).padStart(2)}  ${r.reason}  [${r.elapsedSec}s]`);
}
console.log(`\n结果：${results.length - fails.length} PASS / ${fails.length} FAIL；报告 tests/chapters/reports/`);
if (errs.length) console.log(`pageerror ${errs.length} 条：${errs.slice(0, 2).join(' | ')}`);
process.exit(fails.length > 0 ? 1 : 0);

// ---- 局部工具 ----
function zeroInput() {
  return { prestige: 0, es: 0, rp: 0, prestigePoints: 0, resDiscovered: {} };
}
