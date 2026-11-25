// v4.3.31 隐藏测试命令：一键补齐「推进到指定章节」所需的标准资源（仅开发者用，不在 UI 暴露）。
//
// 纯函数、无 DOM / 无 log / 无 save 依赖，可直接被 `node --test` import：
//   import { fillChapterResources } from '../src/core/devCheat.js';
//   const r = fillChapterResources(defaultState(), 10);
// 浏览器控制台入口由 src/main.js 暴露：__abyssCheat.fillChapter(5)
//
// 口径：
//   - 只按 src/data/chapters.js 的 CHAPTERS 条件抬字段，不写任何「假 id」：科技/建筑键全部取自
//     src/data/techs.js 与 src/data/buildings.js 的真实清单；
//   - 阈值留 1.01 余量；整数型门槛向上取整；
//   - 驻留天数用 src/core/time.js 的 MS_PER_DAY（10 分钟 = 1 游戏日）回拨，不能用 86400000；
//   - 信仰/深渊物质每帧会被 faithCap()/dmCap() 钳制，因此同步抬高对应仓库等级，否则下一帧
//     条件就会被钳回不达标（第 31/45 章尤其明显）。
import { CHAPTERS } from '../data/chapters.js';
import { MS_PER_DAY } from './time.js';
import { RESONANCE_TUNING } from './resonance.js';
import { TECHS } from '../data/techs.js';
import { V21_BUILDINGS } from '../data/buildings.js';
import { FP_BALANCE } from '../data/balance.js';
import { powerScale } from './pricing.js';

// 晋升门槛口径与 src/modules/economy.js 的 prestigeNeed() 同源：
//   floor(powerScale({ base: 3e9, exponent: 1.5, index: S.prestige }))
// 这里用纯函数复算而不是 import economy —— economy 直接 import 全局 state（会触发存档 load），
// devCheat 必须保持「纯函数、可被 node --test 直接 import」的性质。
// tests/v4337-cheat-promote.test.mjs 断言两侧数值一致，防止本表与 economy 漂移。
const PRESTIGE_NEED_SCALE = Object.freeze({ base: 3e9, exponent: 1.5 });

/** S.prestige 次晋升时的晋升需求（= 下一次「晋升」按钮的门槛）。 */
function prestigeNeedOf(S) {
  return Math.floor(powerScale({ ...PRESTIGE_NEED_SCALE, index: Number(S && S.prestige) || 0 }));
}

// 每章 cond 的数值门槛（与 src/data/chapters.js 的 cond 逐条对应）。
// 新增/修改章节条件时必须同步本表；tests/v4331-cheat-fill.test.mjs 会遍历 1..CHAPTERS.length
// 全量断言 cond 成立，避免本表与数据悄悄漂移。
const CHAPTER_REQS = Object.freeze({
  2: { prestige: 2, prestigePoints: 1 },
  3: { techCount: 8 },
  4: { es: 1 }, // cond 是 es>0，取 1 再按余量抬到 2
  5: { expeditionsDone: 8 },
  6: { faith: 5 }, // cond: faith>=5 || Object.keys(religion).length>0（补 faith 即可，不伪造宗教解锁态）
  7: { prestige: 15 },
  // v2.8.0 反馈⑧：第 8~12 章改为「上一章动作」门槛——补的是动作产物，不再是纯数值。
  8: { mirrorContract: true }, // cond: 签过镜像契约 || 集市成交 ≥5 笔
  9: { mirrorWarTech: 1 },     // cond: 买过永恒矩阵项 || 算力战争科技 ≥1 级
  10: { councilSeat: true },   // cond: 坐过一席三方议会
  11: { es: 150 },             // 第 10 章是纯积累章，保留 ES 沉淀口径
  12: { delveRun: 1 },         // cond: 跑过一轮深潜
  13: { prestige: 70 },
  14: { prestige: 130 },
  15: { prestige: 260 },
  16: { faith: 60 },
  17: { faith: 90 },
  18: { endShrine: true }, // cond: buildings.end_shrine>=1 || tech.true_end
  19: { riftsSealed: 8 },
  20: { dm: 100 },
  21: { dmmind: true }, // cond: upgrades.dmmind
  22: { es: 300, riftsSealed: 5 },
  23: { expeditionsDone: 30 },
  24: { prestige: 100 },
  25: { projectsDone: 40 },
  26: { riftEmber: 5000 },
  27: { expeditionsDone: 60 },
  28: { allTimeEp: 1e12 },
  29: { projectsDone: 80 },
  30: { riftsSealed: 15 },
  31: { dm: 1e4 },
  32: { allTimeEp: 1e15 },
  33: { resonanceLayers: 1 },
  34: { resonanceFocus: true }, // cond: resonance.focus && focus !== 'ep'
  35: { projectsDone: 160 },
  36: { riftEmber: 2e4 },
  37: { resonanceLayers: 20 },
  38: { allTimeEp: 1e18 },
  39: { projectsDone: 220 },
  40: { allTimeEp: 1e17 },
  41: { resonanceLayers: 12 },
  42: { riftEmber: 3e4 },
  43: { expeditionsDone: 60 },
  44: { es: 5e3 },
  45: { faith: 1e4 },
  46: { projectsDone: 320 },
  47: { projectsDone: 500 },
  48: { riftEmber: 1e5 },
  49: { es: 1e5 },
  50: { expeditionsDone: 120 },
  51: { resonanceLayers: 15 },
});

// 可直接写 S[field] 的数值字段（cond 里读的是 S 顶层字段）。
const NUMERIC_FIELDS = [
  'prestige', 'prestigePoints', 'expeditionsDone', 'projectsDone',
  'riftsSealed', 'riftEmber', 'allTimeEp', 'es', 'faith', 'dm',
];

// v4.3.36 反馈①：章节门禁模块的买断价 → 需要在目标章补足的职级点（真实价格 + 1 余量）。
//   旧实现只按章节 cond 抬字段，第 2 章补到 2 PP 而集市要 5 PP，购买卡永远灰
//   （用户反馈：console 进第二章，PP 不足无法解锁集市）。集市改第 7 章后，
//   console 推到第 7 章同样必须先拿得到 5 PP，否则「推到章却玩不了本章内容」。
//   价格真源仍是 src/modules/moduleUnlocks.js 的 MODULE_UNLOCKS[].cost；
//   tests/v420-chapter-modules.test.mjs 断言本表与之同步，防两处漂移。
export const MODULE_PP_BY_CHAPTER = Object.freeze({ 7: 6 }); // 第 7 章集市：5 PP + 1 余量

// 真实 id 清单（只读 data，不造假 id）：6 个科技 + 34 个可解锁建筑 = 40 个键位，够覆盖 ch10 的 38。
const TECH_IDS = TECHS.map(t => t && t.id).filter(Boolean);
const BUILDING_IDS = V21_BUILDINGS
  .filter(b => b && b.id && b.via !== 'upgrade') // rp_distill 走 upgrade，不进 unlockedBuildings
  .map(b => b.id);

// 深渊物质仓库参数与 economy.dmCap 同源（economy.js 内联 base 1000 / per 100 / growth 1.15）。
const DM_VAULT = Object.freeze({ base: 1000, per: 100, growth: 1.15 });

/** 门槛 → 目标值：留 1.01 余量，整数门槛向上取整（避免 prestige 等出现小数）。 */
function bump(v) {
  const n = Number(v) || 0;
  if (n <= 0) return n;
  return Number.isInteger(n) ? Math.ceil(n * 1.01) : n * 1.01;
}

/** 仓库等级 → 容量足够 cover need 的最小等级（base + 等比级数）。 */
function vaultLevelFor(base, per, growth, need) {
  let lv = 0;
  let cap = base;
  while (cap < need && lv < 500) {
    lv += 1;
    cap = base + (per * (Math.pow(growth, lv) - 1)) / (growth - 1);
  }
  return lv;
}

function ensureObj(S, key) {
  if (!S[key] || typeof S[key] !== 'object') S[key] = {};
  return S[key];
}

/** targetChapter 钳到 [1, CHAPTERS.length]；NaN/undefined 按 1 处理，±Infinity 钳到端点。 */
function clampChapter(targetChapter) {
  const raw = Number(targetChapter);
  if (Number.isNaN(raw)) return 1;
  const n = Math.trunc(raw);
  if (n < 1) return 1;
  if (n > CHAPTERS.length) return CHAPTERS.length;
  return n;
}

/**
 * 内部：把 S 的资源抬到「满足第 uptoChapter 章及其之前所有章节条件」的水平。
 *   opts.deferPrestige —— 晋升类条件（prestige / prestigePoints）只补到「差一次手动晋升」：
 *     prestige 次数补到 门槛-1，职级点补到 max(0, 门槛-1) 且不低于本章模块买断价；
 *     其余字段照旧直接抬足（含 1.01 余量）。
 * 返回 { fields, gate }：fields 只含真正被改写的字段及最终值；gate 是本次参与判定的门槛聚合。
 */
function applyChapterReqs(S, uptoChapter, opts = {}) {
  const deferPrestige = !!opts.deferPrestige;
  // onlyTarget：只按「第 uptoChapter 章自己的 cond」补（升降级测试用），不再把前面章节的门槛
  //   一起并进来 —— 否则第 3 章（科技 8）会因为第 2 章的 prestige 门槛而被判成「需要晋升」。
  const onlyTarget = !!opts.onlyTarget;
  const fields = {};
  const gate = Object.create(null);
  let needTech = 0;
  let needEndShrine = false;
  let needDmmind = false;
  let needFocus = false;
  let needContract = false;
  let needCouncil = false;
  let needWarTech = 0;
  let needDelveRun = 0;

  for (const ch of CHAPTERS) {
    if (!ch || typeof ch.id !== 'number' || ch.id > uptoChapter) continue;
    if (onlyTarget && ch.id !== uptoChapter) continue;
    const req = CHAPTER_REQS[ch.id];
    if (!req) continue;
    for (const [key, value] of Object.entries(req)) {
      switch (key) {
        case 'techCount': needTech = Math.max(needTech, value); break;
        case 'endShrine': needEndShrine = true; break;
        case 'dmmind': needDmmind = true; break;
        case 'resonanceFocus': needFocus = true; break;
        case 'mirrorContract': needContract = true; break;
        case 'councilSeat': needCouncil = true; break;
        case 'mirrorWarTech': needWarTech = Math.max(needWarTech, value); break;
        case 'delveRun': needDelveRun = Math.max(needDelveRun, value); break;
        case 'resonanceLayers': gate.resonanceLayers = Math.max(gate.resonanceLayers || 0, value); break;
        default: gate[key] = Math.max(gate[key] || 0, value);
      }
    }
  }

  // 本章才开放的模块买断价（集市 5 PP）：推进到该章必须买得起，否则「进了章却玩不了本章内容」。
  let modulePP = 0;
  for (const [ch, pp] of Object.entries(MODULE_PP_BY_CHAPTER)) {
    if (Number(ch) > uptoChapter) continue;
    modulePP = Math.max(modulePP, pp);
  }

  // 1) 顶层数值字段（只抬不降，天然兼容已有进度）
  for (const key of NUMERIC_FIELDS) {
    if (key === 'prestigePoints') continue; // 与「模块买断价」共用同一字段，见 1b
    if (!(key in gate)) continue;
    // deferPrestige 下晋升次数只补到「门槛 - 1」：最后 1 次由玩家自己点「晋升」（+1）达成。
    const target = (deferPrestige && key === 'prestige')
      ? Math.max(0, Math.floor(gate[key]) - 1)
      : bump(gate[key]);
    const current = Number(S[key]) || 0;
    if (target > current) {
      S[key] = target;
      fields[key] = target;
    }
  }

  // 1b) 职级点：章节门槛与「本章模块买断价」共用同一个字段，取大者。
  //     deferPrestige 下门槛同样只补到「门槛 - 1」（最后 1 个由玩家点晋升拿到），但买断价必须补足。
  const ppGate = Number(gate.prestigePoints) || 0;
  const ppTarget = deferPrestige
    ? Math.max(Math.max(0, Math.floor(ppGate) - 1), modulePP)
    : bump(Math.max(ppGate, modulePP));
  if (ppTarget > 0) {
    const current = Number(S.prestigePoints) || 0;
    if (ppTarget > current) {
      S.prestigePoints = ppTarget;
      fields.prestigePoints = ppTarget;
    }
  }

  // 2) 共鸣层数（与 resonance.js 的 maxLayers 同源；ch37 的 20 层已到上限）
  if (gate.resonanceLayers) {
    const resonance = ensureObj(S, 'resonance');
    const target = Math.min(RESONANCE_TUNING.maxLayers, bump(gate.resonanceLayers));
    const current = Number(resonance.layers) || 0;
    if (target > current) {
      resonance.layers = target;
      fields['resonance.layers'] = target;
    }
  }

  // 3) 共鸣焦点：ch34 要求 focus 存在且 !== 'ep'（合法值 ep/rp/pt/dm）
  if (needFocus) {
    const resonance = ensureObj(S, 'resonance');
    if (!resonance.focus || resonance.focus === 'ep') {
      resonance.focus = 'pt';
      fields['resonance.focus'] = 'pt';
    }
  }

  // 4) 科技/建筑计数：techCount = |S.tech| + |S.unlockedBuildings|（chapters.js 同口径）
  if (needTech > 0) {
    const desired = Math.ceil(needTech * 1.01); // 8 → 9；38 → 39
    const tech = ensureObj(S, 'tech');
    const buildings = ensureObj(S, 'unlockedBuildings');
    let count = Object.keys(tech).length + Object.keys(buildings).length;
    if (count < desired) {
      let techAdded = 0;
      let buildingsAdded = 0;
      for (const id of TECH_IDS) {
        if (count >= desired) break;
        if (!tech[id]) { tech[id] = 1; count += 1; techAdded += 1; }
      }
      for (const id of BUILDING_IDS) {
        if (count >= desired) break;
        if (!buildings[id]) { buildings[id] = 1; count += 1; buildingsAdded += 1; }
      }
      fields.techCount = count;
      if (techAdded) fields.techAdded = techAdded;
      if (buildingsAdded) fields.buildingsAdded = buildingsAdded;
      // 数据总量不足时如实注明（当前 6 科技 + 34 建筑 = 40，足以覆盖 ch10 的 38）
      if (count < desired) fields.techCountCapped = true;
    }
  }

  // 5) ch18：真实建筑 end_shrine（数据里存在）直接置 1
  if (needEndShrine) {
    const buildings = ensureObj(S, 'buildings');
    if (!(Number(buildings.end_shrine) >= 1)) {
      buildings.end_shrine = 1;
      fields['buildings.end_shrine'] = 1;
    }
  }

  // 6) ch21：真实升级项 dmmind（src/data/upgrades.js）
  if (needDmmind) {
    const upgrades = ensureObj(S, 'upgrades');
    if (!upgrades.dmmind) {
      upgrades.dmmind = 1;
      fields['upgrades.dmmind'] = 1;
    }
  }

  // 6b) v2.8.0 反馈⑧：第 8~12 章的动作产物（镜像契约 / 议席 / 算力战争 / 深潜轮次）
  if (needContract) {
    const run = ensureObj(S, 'mirrorRun');
    if (!run.contract) {
      run.contract = 'scholar'; // 学者：研究项 ≥3，不写死其它派生字段
      if (!Number.isFinite(run.base)) run.base = 0;
      fields['mirrorRun.contract'] = 'scholar';
    }
  }
  if (needCouncil) {
    const run = ensureObj(S, 'mirrorRun');
    if (!run.council) {
      run.council = 'output';
      fields['mirrorRun.council'] = 'output';
    }
    const mirror = ensureObj(S, 'mirror');
    if (!mirror.seen || typeof mirror.seen !== 'object') mirror.seen = {};
    if (!mirror.seen.output) { mirror.seen.output = true; mirror.allSeen = true; }
  }
  if (needWarTech > 0) {
    const mirror = ensureObj(S, 'mirror');
    if (!mirror.techs || typeof mirror.techs !== 'object') mirror.techs = {};
    const cur = Number(mirror.techs.recycle) || 0;
    if (cur < needWarTech) {
      mirror.techs.recycle = needWarTech;
      fields['mirror.techs.recycle'] = needWarTech;
    }
  }
  if (needDelveRun > 0) {
    const delve = ensureObj(S, 'delve');
    if (!(Number(delve.xp) > 0)) {
      delve.xp = needDelveRun;
      fields['delve.xp'] = needDelveRun;
    }
  }

  // 7) 信仰 / 深渊物质的上限支撑（否则下一帧 faithCap()/dmCap() 会把数值钳回门槛以下）
  const faithTarget = gate.faith ? bump(gate.faith) : 0;
  if (faithTarget > 0) {
    const level = vaultLevelFor(FP_BALANCE.capBase, FP_BALANCE.capPerVaultLv, FP_BALANCE.capVaultGrowth, faithTarget);
    const upgrades = ensureObj(S, 'upgrades');
    const current = Number(upgrades.faith_vault) || 0;
    if (level > current) {
      upgrades.faith_vault = level;
      fields['upgrades.faith_vault'] = level;
    }
  }
  const dmTarget = gate.dm ? bump(gate.dm) : 0;
  if (dmTarget > 0) {
    const level = vaultLevelFor(DM_VAULT.base, DM_VAULT.per, DM_VAULT.growth, dmTarget);
    const upgrades = ensureObj(S, 'upgrades');
    const current = Number(upgrades.dm_vault) || 0;
    if (level > current) {
      upgrades.dm_vault = level;
      fields['upgrades.dm_vault'] = level;
    }
  }

  return { fields, gate };
}

/**
 * 把 S 的资源一次性抬到「满足第 targetChapter 章条件」的水平，并回拨驻留计时。
 * 不抛异常；非法 S 原样返回（fields 为空）。返回值：
 *   { chapter, days, fields } —— fields 只含真正被改写的字段及其最终值。
 */
export function fillChapterResources(S, targetChapter) {
  const chapter = clampChapter(targetChapter);
  const fields = {};
  if (!S || typeof S !== 'object') return { chapter, days: 0, fields };

  const now = Date.now();
  const applied = applyChapterReqs(S, chapter);

  // 8) 驻留天数：按「目标章节的 minDays」回拨，且必须用游戏日 MS_PER_DAY（10 分钟/日）。
  //    目标定义按 CHAPTERS[targetChapter-1] 取；取不到时按任务约定用 7 天兜底。
  const targetDef = CHAPTERS[chapter - 1];
  const days = targetDef && Number.isFinite(targetDef.minDays) ? targetDef.minDays : 7;
  if (days > 0) S.chapterEnteredAt = now - days * MS_PER_DAY;

  return { chapter, days, fields: applied.fields };
}

/**
 * 只备「从第 sourceChapter 章晋升出去」的条件，章节号不代写（v4.3.37 测试口径）。
 *
 * 与 fillChapterResources 的区别：后者补「站到第 N 章」的资源并由调用方落章；本函数补「在第 n 章
 * 能晋升出去」的条件，S.chapter 一个字都不写，章节由游戏自己的 frameSystems 判定推进 ——
 * 需求方原话：补齐后自己手动点「晋升」更贴近真实流程，也就更适合测试。
 *
 *   - 静态条件（科技/建筑/数值/共鸣/信仰/深渊物质…）：直接抬到「下一章 cond 成立」；
 *   - 晋升类条件（prestige / prestigePoints）：补到「差一次」并把本局累计 EP 抬过晋升线，
 *     #prestige-btn 因此可点；最后一步由玩家自己在 UI 点，prestige++ 后 cond 自动成立；
 *   - 驻留天数：回拨到下一章 minDays。注意 doPrestige() 会把 chapterEnteredAt 回拨到「1 天前」
 *     （v4.1.0 F5），所以点完晋升若下一章 minDays > 1，再调一次本函数即可立刻推进；
 *   - 绝不写 S.chapter / S.chaptersUnlocked。
 *
 * 返回 { chapter, target, days, fields, manualPrestige }：
 *   chapter = 入参章节（你所在的章）；target = 要晋升进入的章（末章为 null）；
 *   manualPrestige = 本次是否真的留了「最后一次晋升」给玩家点（补完后下一章 cond 仍不成立才为 true）。
 */
export function fillChapterPromotion(S, sourceChapter) {
  const chapter = clampChapter(sourceChapter);
  if (!S || typeof S !== 'object') return { chapter, target: null, days: 0, fields: {}, manualPrestige: false };

  const now = Date.now();
  const next = CHAPTERS[chapter]; // 数组下标 = id - 1，所以 CHAPTERS[chapter] 就是「下一章」
  const target = next && typeof next.id === 'number' ? next.id : null;
  const applied = applyChapterReqs(S, target || chapter, { deferPrestige: true, onlyTarget: true });
  const fields = applied.fields;

  // 晋升门槛类条件：把「本局累计」抬过一档晋升线，让 #prestige-btn 可点
  //   （prestigeGain() 仍由 economy 按 runEarned / prestigeNeed() 自己算，本函数不伪造 PP 结算）。
  // 注意：只有当「补完之后下一章 cond 仍不成立」时，才真的还差一次晋升 —— 例如已经晋升到第 2 次
  //   的人再调 fillChapter(1)，cond 本就成立，这时不该再提示去点晋升，也不该白抬 runEarned。
  const gateHasPrestige = !!(applied.gate.prestige || applied.gate.prestigePoints);
  const nextReady = !!(next && typeof next.cond === 'function' && next.cond(S));
  const manualPrestige = !!next && gateHasPrestige && !nextReady;
  if (manualPrestige) {
    const want = Math.ceil(prestigeNeedOf(S) * 1.05);
    const current = Number(S.runEarned) || 0;
    if (current < want) {
      S.runEarned = want;
      fields.runEarned = want;
    }
  }

  const def = next || CHAPTERS[chapter - 1];
  const days = def && Number.isFinite(def.minDays) ? def.minDays : 0;
  if (days > 0) S.chapterEnteredAt = now - days * MS_PER_DAY;

  return { chapter, target, days, fields, manualPrestige };
}
