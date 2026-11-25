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
  8: { prestige: 40 },
  9: { expeditionsDone: 20 },
  10: { techCount: 38 },
  11: { es: 150 },
  12: { es: 800 },
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
 * 把 S 的资源一次性抬到「满足第 targetChapter 章条件」的水平，并回拨驻留计时。
 * 不抛异常；非法 S 原样返回（fields 为空）。返回值：
 *   { chapter, days, fields } —— fields 只含真正被改写的字段及其最终值。
 */
export function fillChapterResources(S, targetChapter) {
  const chapter = clampChapter(targetChapter);
  const fields = {};
  if (!S || typeof S !== 'object') return { chapter, days: 0, fields };

  const now = Date.now();
  const need = Object.create(null);
  let needTech = 0;
  let needEndShrine = false;
  let needDmmind = false;
  let needFocus = false;

  for (const ch of CHAPTERS) {
    if (!ch || typeof ch.id !== 'number' || ch.id > chapter) continue;
    const req = CHAPTER_REQS[ch.id];
    if (!req) continue;
    for (const [key, value] of Object.entries(req)) {
      switch (key) {
        case 'techCount': needTech = Math.max(needTech, value); break;
        case 'endShrine': needEndShrine = true; break;
        case 'dmmind': needDmmind = true; break;
        case 'resonanceFocus': needFocus = true; break;
        case 'resonanceLayers': need.resonanceLayers = Math.max(need.resonanceLayers || 0, value); break;
        default: need[key] = Math.max(need[key] || 0, value);
      }
    }
  }

  // 1) 顶层数值字段（只抬不降，天然兼容已有进度）
  for (const key of NUMERIC_FIELDS) {
    if (!(key in need)) continue;
    const target = bump(need[key]);
    const current = Number(S[key]) || 0;
    if (target > current) {
      S[key] = target;
      fields[key] = target;
    }
  }

  // 2) 共鸣层数（与 resonance.js 的 maxLayers 同源；ch37 的 20 层已到上限）
  if (need.resonanceLayers) {
    const resonance = ensureObj(S, 'resonance');
    const target = Math.min(RESONANCE_TUNING.maxLayers, bump(need.resonanceLayers));
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

  // 7) 信仰 / 深渊物质的上限支撑（否则下一帧 faithCap()/dmCap() 会把数值钳回门槛以下）
  const faithTarget = need.faith ? bump(need.faith) : 0;
  if (faithTarget > 0) {
    const level = vaultLevelFor(FP_BALANCE.capBase, FP_BALANCE.capPerVaultLv, FP_BALANCE.capVaultGrowth, faithTarget);
    const upgrades = ensureObj(S, 'upgrades');
    const current = Number(upgrades.faith_vault) || 0;
    if (level > current) {
      upgrades.faith_vault = level;
      fields['upgrades.faith_vault'] = level;
    }
  }
  const dmTarget = need.dm ? bump(need.dm) : 0;
  if (dmTarget > 0) {
    const level = vaultLevelFor(DM_VAULT.base, DM_VAULT.per, DM_VAULT.growth, dmTarget);
    const upgrades = ensureObj(S, 'upgrades');
    const current = Number(upgrades.dm_vault) || 0;
    if (level > current) {
      upgrades.dm_vault = level;
      fields['upgrades.dm_vault'] = level;
    }
  }

  // 8) 驻留天数：按「目标章节的 minDays」回拨，且必须用游戏日 MS_PER_DAY（10 分钟/日）。
  //    目标定义按 CHAPTERS[targetChapter-1] 取；取不到时按任务约定用 7 天兜底。
  const targetDef = CHAPTERS[chapter - 1];
  const days = targetDef && Number.isFinite(targetDef.minDays) ? targetDef.minDays : 7;
  if (days > 0) S.chapterEnteredAt = now - days * MS_PER_DAY;

  return { chapter, days, fields };
}
