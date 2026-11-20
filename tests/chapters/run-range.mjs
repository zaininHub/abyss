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
//   node tests/chapters/run-range.mjs --from 3 --to 3 --resume  # v4.2.9 反馈①：章间断点点续跑——
//     读 tests/chapters/reports/ch{N-1}-report.json 的 actual 终态快照作为本章输入种子
//     （= 上一章真实晋升结算输出），中途挂掉/改代码后不必从第 1 章重爬。
//     前置条件：ch{N-1} 曾完整跑完并落盘报告（每章 ~17 分钟，报告即检查点）。
//   node tests/chapters/run-range.mjs --from 4 --to 4 --day-start 1 --day-end 10    # v4.3.1 反馈①：
//     章内分段——每次只跑 10 模拟天（约 3~5 分钟，agent 不超时），每天落盘完整态 checkpoint；
//   node tests/chapters/run-range.mjs --from 4 --to 4 --day-start 11 --day-end 20 --resume-chapter
//     续跑——从 ch4-seg-checkpoint.json 恢复完整页面态（S 全量 + 玩家游标 + 虚拟时钟），接着第 11 天跑。
//     分段跑完最后一段（day-end >= maxDays 或提前完成晋升）才写正式 ch{N}-report.json。
//
// 章节测试单元语义（方案 §2.1）：
//   输入  = 第 N 章开局的跨局资产快照（种子化：本局资源归零、chapterEnteredAt 重置）
//   过程  = 真实浏览器 + 自动玩家（产品真实入口）从第 N 章开局游玩
//           → 帧系统真实推进到第 N+1 章（cond + minDays 驻留，测试不代写推进）
//           → 继续游玩直至章内 canPrestige → 真实 doPrestige
//   输出  = 晋升结算后的跨局快照（= 第 N+1 章开局输入）+ 差值校验报告
//
// 报告：tests/chapters/reports/ch{N}-report.json（gitignore，不进仓库）+ 控制台汇总表。
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { launchBrowser, prepPage, gotoAndSettle, sleep, TICKS_PER_DAY } from './_boot.mjs';
import { playerInit } from './_player.mjs';
import { snapshotFromState, seedFromSnapshot, compareBudget } from './_snapshot.mjs';
import { BUDGET, MAIN_CHAPTERS } from './budget.mjs';
import { CHAPTERS } from '../../src/data/chapters.js'; // v4.3.6：目标章 minDays 单一真源（防 _player 内联漂移）

// ---- CLI 参数 ----
const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};
const hasFlag = (name) => args.includes(name);
const FROM = argOf('--from', 1);
const TO = argOf('--to', FROM);
const RESUME = hasFlag('--resume'); // v4.2.9 反馈①：章间断点点续跑（输入 = 上一章报告快照）
// v4.3.1 反馈①：章内分段——单次调用只跑 [DAY_START, DAY_END]，段间落盘完整态 checkpoint。
const DAY_START = argOf('--day-start', 1);
const DAY_END = argOf('--day-end', 0); // 0 = 跑到预算 maxDays（不分段，旧行为）
const RESUME_CHAPTER = hasFlag('--resume-chapter'); // 从 checkpoint 恢复完整态接着跑
const SEG_PER = argOf('--seg-per', 0); // 每段天数（0 = 每天落盘；配合 --resume-chapter 用）

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

// ---- v4.3.1 反馈①：章内分段 checkpoint（完整可续跑态）----
// 与 readChapterState（只取跨局快照）不同——章内续跑要恢复本局全部进度（ep/upgrades/tech/cultists…
// 以及自动玩家游标与虚拟时钟），否则「从第 N 天接续」等于从头再来。
// 这些字段是测试基础设施记录「已真实发生的推演状态」，不是伪造玩家进度（自动玩家仍只走产品入口）。
const CHECKPOINT_PATH = n => `tests/chapters/reports/ch${n}-seg-checkpoint.json`;
const PLAYER_CURSORS = ['__tickCount', '__lastPrestigeTick', '__orchIdx', '__scheduleEdits',
  '__resFocusIdx', '__lastResLayers', '__lastResPhase', '__vt', '__simT'];
async function captureFullState(page, n, day, daily, advanced, advancedDay, prestigesAtEntry) {
  const payload = await page.evaluate(({ cursors }) => {
    const S = window.S;
    const cursorsOut = {};
    for (const k of cursors) if (window[k] !== undefined) cursorsOut[k] = window[k];
    return {
      save: JSON.parse(JSON.stringify(S)), // 完整存档态（含本局 ep/rp/upgrades/tech/cultists + 跨局）
      cursors: cursorsOut,
      stats: JSON.parse(JSON.stringify(window.__stats || {})),
      playerCfg: JSON.parse(JSON.stringify(window.__playerCfg || {})),
    };
  }, { cursors: PLAYER_CURSORS });
  return { chapter: n, day, daily, advanced, advancedDay, prestigesAtEntry, ...payload,
    savedAt: new Date().toISOString() };
}
function writeCheckpoint(cp) {
  mkdirSync('tests/chapters/reports', { recursive: true });
  writeFileSync(CHECKPOINT_PATH(cp.chapter), JSON.stringify(cp, null, 2));
}
function readCheckpoint(n) {
  const p = CHECKPOINT_PATH(n);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * 单章执行：第 N 章开局 → 第 N+1 章条件达成并真实推进 → 章内完成晋升 → 快照。
 * 返回逐日曲线（供超时诊断与报告）。v4.3.1：支持 [dayStart, dayEnd] 分段 + 每天落盘 checkpoint。
 */
async function runChapter(page, { n, maxDays, dayStart = 1, dayEnd = 0, checkpoint = null, segPer = 0 }) {
  const daily = checkpoint ? checkpoint.daily.slice() : [];
  let advanced = checkpoint ? !!checkpoint.advanced : false;
  let advancedDay = checkpoint ? checkpoint.advancedDay : null;
  let prestigesAtEntry = checkpoint ? checkpoint.prestigesAtEntry : null;
  const endDay = (dayEnd > 0 ? Math.min(dayEnd, maxDays) : maxDays);
  for (let d = dayStart; d <= endDay; d++) {
    const snap = await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
    snap.day = d;
    daily.push({ day: d, ep: snap.ep, cps: snap.cps, chapter: snap.chapter,
      prestige: snap.prestige, es: snap.es, rp: snap.rp, projectsDone: snap.projectsDone,
      buys: snap.totalBuys, errors: snap.stats.errors.length,
      prestigeEsGain: snap.prestigeEsGain || 0 }); // v4.2.8：超时路径 final=daily 末项也带 ES 奖励累计（修报告口径丢失）
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
    // v4.3.1 反馈①：每段末（或每天）落盘完整 checkpoint——挂掉后 --resume-chapter 从此处续跑，不整章重来。
    if (segPer > 0 ? d % segPer === 0 : true) {
      writeCheckpoint(await captureFullState(page, n, d, daily, advanced, advancedDay, prestigesAtEntry));
    }
  }
  // v4.3.4 修复：segPer 模式段末若 day 不在 segPer 整除点上（如 --seg-per 15 跑到 D55），
  //   循环内不落盘 → 段落进度随进程退出丢失，--resume-chapter 回退到上一个整除点重跑。
  //   段落正常结束（segmentEnd）时强制补落盘最终态，保证「段末即续跑点」。
  if (segPer > 0 && dayEnd > 0 && endDay < maxDays) {
    writeCheckpoint(await captureFullState(page, n, endDay, daily, advanced, advancedDay, prestigesAtEntry));
  }
  return { done: false, daily, advancedDay, daysUsed: endDay, final: daily[daily.length - 1] || null,
    segmentEnd: dayEnd > 0 && endDay < maxDays }; // 段落结束（非整章超时）——主流程据此写段报告不判 FAIL
}

// ---- 主流程 ----
console.log(`\n=== 分章节真实试玩：第 ${FROM}~${TO} 章（预算表 v4.2.6） ===`);
const results = [];
const browser = await launchBrowser();
let page = null, errs = [];
try {
  let carry = null; // 上一章晋升结算快照 → 本章输入
  // v4.2.9 反馈①：--resume 断点续跑——从 ch{FROM-1} 报告的 actual 快照恢复链式上下文，
  //   避免中途挂掉后从第 1 章重爬（每章 ~17 分钟 × N 章的浪费）。
  //   actual 即上一章晋升结算后的真实终态（= 本章输入），与链式跑语义完全一致。
  if (RESUME && FROM > 1) {
    const prevReport = `tests/chapters/reports/ch${FROM - 1}-report.json`;
    if (!existsSync(prevReport)) {
      console.error(`✗ --resume 找不到上一章报告：${prevReport}（先跑完 ch${FROM - 1} 再续跑）`);
      process.exit(2);
    }
    const prev = JSON.parse(readFileSync(prevReport, 'utf8'));
    carry = prev.actual && prev.actual.endSnapshot ? prev.actual.endSnapshot : prev.inputSnapshot;
    // 兼容：v4.2.8 及以前的报告只有 inputSnapshot（本章输入），用它近似本章输入即可
    //   ——inputSnapshot 与「上一章输出」在链式跑里同一来源（carry = actual），差异仅为
    //   本章运行期间的跨局资产增量（ES/PP/晋升数），对种子来说宁低勿高（下界语义安全）。
    if (!carry) { console.error(`✗ ${prevReport} 内无 endSnapshot/inputSnapshot 可恢复`); process.exit(2); }
    console.log(`↩ 断点续跑：从 ch${FROM - 1} 报告恢复输入（prestige=${carry.prestige || 0} / es=${carry.es || 0}）`);
  }
  for (let n = FROM; n <= TO; n++) {
    const budget = BUDGET[n];
    if (!budget) { console.log(`  ✗ 第 ${n} 章无预算条目，跳过`); continue; }
    const t0 = Date.now();
    // carry 垫底：链式跑用真实快照；独立跑（无 carry）从预算 carry 起步。
    // 真实快照低于 carry 的键补到 carry（模拟「上一章至少完成保底晋升」），高于则保留真实值。
    const boost = budget.carry || null;
    // v4.3.1 反馈①：章内分段续跑——从 checkpoint 恢复「完整存档态 + 玩家游标 + 虚拟时钟」，
    //   与章间断点点 --resume（只取跨局快照）语义不同：这里要连本局 ep/upgrades/tech 一起恢复。
    let cp = null, seed, vt = 0;
    if (RESUME_CHAPTER) {
      cp = readCheckpoint(n);
      if (!cp) {
        console.error(`✗ --resume-chapter 找不到 ch${n} checkpoint：${CHECKPOINT_PATH(n)}（先跑前一段）`);
        process.exit(2);
      }
      seed = JSON.stringify(cp.save);
      vt = (cp.cursors && cp.cursors.__vt) || 0;
      console.log(`↩ 章内续跑：ch${n} 从第 ${cp.day + 1} 天接续（已完成 ${cp.day} 天，vt=${vt}）`);
    } else {
      // 链式跑章号由真实快照携带；独立跑（无 carry）传 n 从第 N 章开局（防重爬 1~N-1 章）
      seed = carry ? seedFromSnapshot(carry, { boost })
        : seedFromSnapshot(boost || {}, { boost, chapter: n });
    }
    if (page) { await page.close(); page = null; }
    const { page: p, errs: e2 } = await prepPage(browser, { save: seed, vt });
    page = p; errs = errs.concat(e2);
    await gotoAndSettle(page);
    // v4.3.5：rush 章（晋升门槛章：ch7/13/14 冲 prestige 40/130/260）传 rushCfg=true，
    //   自动玩家保持 gap 2880（8 游戏小时）快速晋升——hold 策略的 5 游戏天 gap 会让
    //   130/260 级门槛数学不可达（重建随 unlockedBuildings 跨局保留加快，快节奏攒 need 才能冲线）。
    // v4.3.6：nextMinDays = 第 N+1 章进入门槛的 minDays（产品 chapters.js 单一真源）。
    //   hold gap 必须保证「晋升回拨 1 天后 daysIn 峰值 ≥ minDays」：回拨公式
    //   chapterEnteredAt=now-1d（prestige.js），daysIn 峰值 = gap/8640 + 1，旧固定 43200
    //   （5 天）下峰值 6 < ch16/17/18 的 minDays 7 → 章节永不推进（ch15~18 全章 120 天
    //   超时卡 chapter=15 的死锁根因）。gap = max(43200, minDays·8640 + 2880) 保证峰值
    //   = minDays + 1.33 天，必然跨线。
    const rush = !!budget.rush;
    const nextGate = (CHAPTERS.find(c => c.id === n + 1) || {});
    const nextMinDays = typeof nextGate.minDays === 'number' ? nextGate.minDays : 3;
    await page.evaluate(playerInit, { prestigeGapTicks: 2880, goalChapter: n + 1, maxDays: budget.maxDays,
      holdPrestigeUntilAdvanced: true, rushCfg: rush, nextMinDays, label: 'ch' + n }); // v4.2.6 校准③：未推进前憋晋升（真人冲章节策略）
    if (cp) {
      // 恢复玩家游标 / 统计器 / 配置——否则续跑后决策节拍重置，预算失真
      await page.evaluate(({ cursors, stats, playerCfg }) => {
        for (const [k, v] of Object.entries(cursors)) window[k] = v;
        window.__stats = stats;
        window.__playerCfg = playerCfg;
      }, { cursors: cp.cursors, stats: cp.stats, playerCfg: cp.playerCfg });
    }
    const inputSnap = await readChapterState(page);
    if (carry && !cp) {
      // 链式输入校验（下界语义）：种子恢复的晋升/ES 不得低于上一章输出（快照失真检测）
      const prIn = inputSnap.snap.prestige || 0, prOut = carry.prestige || 0;
      const esIn = inputSnap.snap.es || 0, esOut = carry.es || 0;
      if (prIn < prOut || esIn < esOut) {
        results.push({ n, verdict: 'FAIL', reason: `链式种子失真：prestige ${prIn}<${prOut} 或 es ${esIn}<${esOut}`, elapsedSec: 0 });
        continue;
      }
    }
    const runDayStart = cp ? cp.day + 1 : DAY_START;
    console.log(`\n--- 第 ${n} 章（预算 maxDays=${budget.maxDays}，段 [D${runDayStart}~D${DAY_END || budget.maxDays}]，输入 prestige=${inputSnap.snap.prestige || 0} / es=${fx(inputSnap.snap.es || 0)}） ---`);
    const run = await runChapter(page, { n, maxDays: budget.maxDays, dayStart: runDayStart,
      dayEnd: DAY_END, checkpoint: cp, segPer: SEG_PER });
    const elapsedSec = +((Date.now() - t0) / 1000).toFixed(1);
    // v4.3.1 反馈①：段落未结束（day-end < maxDays 且本段未达成晋升）→ 只记段进度，不写正式报告、不判 FAIL。
    //   checkpoint 已由 runChapter 每天落盘，下一次 --resume-chapter 从此处接续。
    if (run.segmentEnd) {
      const segDay = run.daily[run.daily.length - 1] ? run.daily[run.daily.length - 1].day : runDayStart - 1;
      results.push({ n, verdict: 'SEGMENT', reason: `第 ${runDayStart}~${segDay} 天段落完成 / 累计 ${run.daily.length} 天 / 章 ${run.final ? run.final.chapter : '?'}（checkpoint 已落盘，--resume-chapter 续跑）`, elapsedSec });
      console.log(`  → 第 ${n} 章段落完成（D${runDayStart}~D${segDay}）；用 --resume-chapter --day-start ${segDay + 1} 续跑`);
      continue;
    }
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
      actual: { ...cmp.actual, es: actual.es, rp: actual.rp, prestige: actual.prestige, runEarnedAtEnd: endState.runEarned, needAtEnd: endState.need,
        endSnapshot: actual }, // v4.2.9 反馈①：完整终态快照入报告——下一章 --resume 的检查点
      daily: run.daily, advancedDay: run.advancedDay, daysUsed: run.daysUsed,
      pageErrors: errs.slice(), elapsedSec,
    };
    mkdirSync('tests/chapters/reports', { recursive: true });
    writeFileSync(`tests/chapters/reports/ch${n}-report.json`, JSON.stringify(report, null, 2));
    // v4.3.1 反馈①：整章完成（PASS/FAIL 均已定稿）——清掉分段 checkpoint，避免下次从零跑误读陈旧续跑点
    if (existsSync(CHECKPOINT_PATH(n))) { try { unlinkSync(CHECKPOINT_PATH(n)); } catch { /* 忽略 */ } }
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
  const mark = r.verdict === 'PASS' ? '✓' : r.verdict === 'SEGMENT' ? '→' : '✗';
  console.log(`  ${mark} ch${String(r.n).padStart(2)}  ${r.reason}  [${r.elapsedSec}s]`);
}
console.log(`\n结果：${results.length - fails.length} PASS / ${fails.length} FAIL；报告 tests/chapters/reports/`);
if (errs.length) console.log(`pageerror ${errs.length} 条：${errs.slice(0, 2).join(' | ')}`);
process.exit(fails.length > 0 ? 1 : 0);

// ---- 局部工具 ----
function zeroInput() {
  return { prestige: 0, es: 0, rp: 0, prestigePoints: 0, resDiscovered: {} };
}
