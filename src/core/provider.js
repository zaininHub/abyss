// v2.0 核心：数据提供层（Data Provider）
// 运行时提供数据表（techs/upgrades/chapters/eternals/balance/buildings/events），支持按故事线合并变体
// 合并策略：append（追加）/ override（覆盖）/ remove（移除）/ deepMerge（深合并）
import { TECHS as DEFAULT_TECHS } from '../data/techs.js';
import { UPGRADES as DEFAULT_UPGRADES } from '../data/upgrades.js';
import { CHAPTERS as DEFAULT_CHAPTERS } from '../data/chapters.js';
import { ETERNALS as DEFAULT_ETERNALS } from '../data/eternals.js';
import { BALANCE as DEFAULT_BALANCE } from '../data/balance.js';
import { BUILDINGS as DEFAULT_BUILDINGS } from '../data/buildings.js';
import { EVENTS as DEFAULT_EVENTS } from '../data/events.js';

const _baseTables = {
  techs: [...DEFAULT_TECHS],
  upgrades: [...DEFAULT_UPGRADES],
  chapters: [...DEFAULT_CHAPTERS],
  eternals: [...DEFAULT_ETERNALS],
  balance: { ...DEFAULT_BALANCE },
  buildings: [...DEFAULT_BUILDINGS],
  events: [...DEFAULT_EVENTS],
};

let _storylineId = 'default';
let _storylineVariants = {}; // { techs: [], upgrades: [], chapters: [], ... }

export function setStoryline(id) {
  _storylineId = id || 'default';
}

export function getStorylineId() {
  return _storylineId;
}

export function registerVariants(variants) {
  if (!variants || typeof variants !== 'object') return;
  for (const [table, ops] of Object.entries(variants)) {
    if (!_storylineVariants[table]) _storylineVariants[table] = [];
    _storylineVariants[table].push({ storyline: _storylineId, ops });
  }
}

function _mergeTable(base, ops) {
  if (!ops) return base;
  let result = [...base];
  if (ops.append) result = result.concat(ops.append);
  if (ops.remove) {
    const removeIds = new Set(ops.remove);
    result = result.filter(item => !removeIds.has(item.id));
  }
  if (ops.override) {
    const overrideMap = new Map(ops.override.map(o => [o.id, o]));
    result = result.map(item => overrideMap.has(item.id) ? { ...item, ...overrideMap.get(item.id) } : item);
  }
  return result;
}

export function getTable(name) {
  const base = _baseTables[name];
  if (!base) return undefined;
  const variants = (_storylineVariants[name] || []).filter(v => v.storyline === _storylineId);
  let result = base;
  for (const v of variants) {
    if (Array.isArray(base)) {
      result = _mergeTable(result, v.ops);
    } else {
      // balance: deep merge
      result = { ...result, ...v.ops };
    }
  }
  return result;
}

export function getChapters() { return getTable('chapters') || []; }
export function getTechs() { return getTable('techs') || []; }
export function getUpgrades() { return getTable('upgrades') || []; }
export function getEternals() { return getTable('eternals') || []; }
export function getBalance() { return getTable('balance') || { ...DEFAULT_BALANCE }; }
export function getBuildings() { return getTable('buildings') || []; }
export function getEvents() { return getTable('events') || []; }

// Reset for testing
export function _resetProvider() {
  _storylineId = 'default';
  _storylineVariants = {};
}
