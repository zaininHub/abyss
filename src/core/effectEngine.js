// v2.1 效果引擎（架构师三层管线的聚合读侧）：
//   数据层 balance.js buildingsV21（fx.key / fx.value / cap）
//   → 聚合层 本文件（fxValue / fxBest，按等级与聚合方式求值）
//   → 消费层 economy.js 各乘数函数（globalMult/clickMult/costMult/...）
// 级制红线：读侧一律 effectiveLevel = min(S.buildings[id], cap)，超封等级（旧档迁移截断）不参与计算。
import { BALANCE } from '../data/balance.js';
import { S } from '../state.js';
import { capOf } from '../data/buildings.js';

// 各 fx.key 的聚合方式与空注册表默认值：
//   add       Σ value × level          加法效果（如 globalAdd 每级 +2%）
//   mul       Π value ^ level          乘算效果（如 globalMul 每级 ×1.5）
//   max       max(value)               档位效果取最高档，不叠加（如 offlineRate 三段式）
//   expected  Π (1 + chance×(mult-1))  暴击期望乘算（如 autoCrit 1%×10 = +9% 期望）
const FX_SPEC = {
  globalAdd:      { agg: 'add', def: 0 },
  globalMul:      { agg: 'mul', def: 1 },
  clickMul:       { agg: 'mul', def: 1 },
  costMul:        { agg: 'mul', def: 1 },
  focusCost:      { agg: 'mul', def: 1 },
  capAdd:         { agg: 'add', def: 0 },
  dmRateAdd:      { agg: 'add', def: 0 }, // v2.4：DM 采集效率加算（每级 +15%/30% 等，作用于载具采集速率）
  threadAdd:      { agg: 'add', def: 0 },
  threadMul:      { agg: 'mul', def: 1 },
  fuelMul:        { agg: 'mul', def: 1 },
  rpAdd:          { agg: 'add', def: 0 },
  rpMul:          { agg: 'mul', def: 1 },
  ppMul:          { agg: 'mul', def: 1 },
  eventFreqAdd:   { agg: 'add', def: 0 },
  eventFreqMul:   { agg: 'mul', def: 1 },
  eventRewardAdd: { agg: 'add', def: 0 },
  projRewardAdd:  { agg: 'add', def: 0 },
  offlineRate:    { agg: 'max', def: 0 },
  offlineCap:     { agg: 'max', def: 0 },
  maxProjects:    { agg: 'max', def: 0 },
  clickCrit:      { agg: 'crit', def: null },
  autoCrit:       { agg: 'crit', def: null },
};

// 注册表里全部合法 fx.key（供数据完整性断言）
export const FX_KEYS = Object.keys(FX_SPEC);

export function v21BuildingById(id) {
  return BALANCE.buildingsV21.find(b => b.id === id) || null;
}

// 级制红线读侧：超封等级一律截断到 capOf（v2.2 动态上限；旧档迁移/超买兼容）
export function effectiveLevel(id, state = S) {
  const b = v21BuildingById(id);
  if (!b) return 0;
  return Math.min((state.buildings && state.buildings[id]) || 0, capOf(b, state));
}

// 单键效果聚合（读侧唯一入口）
// via:'upgrade' 镜像（storage/cache）无 fx.value，由 epStorageCap 直读 S.upgrades，不在此聚合。
// v2.4：b.fx 支持单键对象或多键数组（多效果上限建筑：capAdd + dmRateAdd / globalAdd），逐键独立聚合。
export function fxValue(key, state = S) {
  const spec = FX_SPEC[key];
  if (!spec) throw new Error(`effectEngine: 未注册的效果键 ${key}`);
  let v = spec.def;
  for (const b of BALANCE.buildingsV21) {
    if (!b.fx || b.via === 'upgrade') continue;
    const fxs = Array.isArray(b.fx) ? b.fx : [b.fx];
    const f = fxs.find(x => x.key === key);
    if (!f) continue;
    const lv = effectiveLevel(b.id, state);
    if (lv <= 0) continue;
    if (spec.agg === 'add') v += f.value * lv;
    else if (spec.agg === 'mul') v *= Math.pow(f.value, lv);
    else if (spec.agg === 'max') v = Math.max(v, f.value);
    else if (spec.agg === 'crit') v = (v === null ? 1 : v) * (1 + f.value.chance * (f.value.mult - 1));
  }
  return v;
}

// 暴击掷骰参数（doClick 用）：返回当前生效的最佳 { chance, mult }，无建筑返回 null
export function fxBest(key, state = S) {
  const spec = FX_SPEC[key];
  if (!spec || spec.agg !== 'crit') return null;
  let best = null;
  for (const b of BALANCE.buildingsV21) {
    if (!b.fx || b.via === 'upgrade') continue;
    if (effectiveLevel(b.id, state) <= 0) continue;
    const fxs = Array.isArray(b.fx) ? b.fx : [b.fx];
    const f = fxs.find(x => x.key === key);
    if (!f) continue;
    const v = f.value;
    if (!best || v.chance * v.mult > best.chance * best.mult) best = v;
  }
  return best;
}

// 便捷读侧（消费层语义化入口）
export const buildingGlobalAdd = (state = S) => fxValue('globalAdd', state);
export const buildingGlobalMul = (state = S) => fxValue('globalMul', state);
export const buildingCapAdd    = (state = S) => fxValue('capAdd', state);
