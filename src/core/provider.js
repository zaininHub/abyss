// v2.0 核心：数据提供层（Data Provider）
// 运行时提供数据表，支持按故事线合并变体
// 合并策略：append（追加）/ override（覆盖）/ remove（移除）/ 顶层合并（balance 对象）
//
// v3.7.0 接线修复：
//   ① 注册 pets 表 —— 三条线声明的 pets.append 此前无任何 getter，线专属异兽是死数据；
//   ② 同一故事线重复注册同一张表改为「替换」—— 旧实现 A→B→A 切换会把 A 的章节/事件叠加两遍；
//   ③ getTable/getBalance/getUpgrades 等此前零调用，现由 core/storylineContent.js 统一消费。
import { TECHS as DEFAULT_TECHS } from '../data/techs.js';
import { UPGRADES as DEFAULT_UPGRADES } from '../data/upgrades.js';
import { CHAPTERS as DEFAULT_CHAPTERS } from '../data/chapters.js';
import { ETERNALS as DEFAULT_ETERNALS } from '../data/eternals.js';
import { BALANCE as DEFAULT_BALANCE } from '../data/balance.js';
import { BUILDINGS as DEFAULT_BUILDINGS } from '../data/buildings.js';
import { EVENTS as DEFAULT_EVENTS } from '../data/events.js';
import { PETS as DEFAULT_PETS } from '../data/pets.js';

const _baseTables = {
  techs: [...DEFAULT_TECHS],
  upgrades: [...DEFAULT_UPGRADES],
  chapters: [...DEFAULT_CHAPTERS],
  eternals: [...DEFAULT_ETERNALS],
  balance: { ...DEFAULT_BALANCE },
  buildings: [...DEFAULT_BUILDINGS],
  events: [...DEFAULT_EVENTS],
  pets: [...DEFAULT_PETS],
};

let _storylineId = 'default';
let _storylineVariants = {}; // { table: [{ storyline, ops }] }

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
    const list = _storylineVariants[table];
    const entry = { storyline: _storylineId, ops };
    const at = list.findIndex(v => v.storyline === _storylineId);
    if (at >= 0) list[at] = entry; else list.push(entry);
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
      // balance 是对象：按顶层键覆盖（不是递归深合并，保持 BALANCE 键语义可预测）
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
export function getPets() { return getTable('pets') || []; }

// 供单测/面板检查：当前线在指定表上声明的变体条目（append 部分）
export function variantEntries(name) {
  return (_storylineVariants[name] || [])
    .filter(v => v.storyline === _storylineId)
    .flatMap(v => (v.ops && Array.isArray(v.ops.append)) ? v.ops.append : []);
}

// Reset for testing
export function _resetProvider() {
  _storylineId = 'default';
  _storylineVariants = {};
}
