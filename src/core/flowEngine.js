// v3.8.0 核心玩法抽象：资源流引擎（Resource Flow Engine）
//
// 背景（本次重构要消除的问题）：
//   放置类玩法的核心 = 「资源随时间流动」。但此前 EP 主产出、RP/PT 蒸馏、涓流、燃料燃烧、
//   异兽维持等结算全部以硬编码 if 块内联在 main.js 的 400 行 tick() 里，带来四个结构性问题：
//     ① 新增一条资源管道必须改主循环（违反开闭原则），且极易插错执行顺序造成静默数值偏差；
//     ② 每条管道的「dt 缩放 / 上限钳制 / 余额不足 / 溢出」各写一遍，口径必然漂移；
//     ③ 单条管道抛错会击垮整帧 tick，且无观测数据，30 天推演里难以定位是哪条流出错；
//     ④ 纯 Node 无法单测资源结算（逻辑与 DOM、闭包变量缠死）。
//
// 现在的三层链（与 v3.7.0 故事线「声明 → 求值 → 消费」同构）：
//   声明层  systems/resourceFlows.js   registerFlow({ id, phase, order, modKey, run })
//   求值层  core/flowEngine.js         分阶段调度 + 修饰器求值 + 异常隔离 + 守恒台账
//   消费层  main.js tick()             只在原执行点调 runFlows(ctx, PHASE)，不再写任何结算公式
//
// 新增玩法（如「效能编排」）只需注册修饰器，不必改主循环、也不必改任何既有流。
//
// 性能纪律：tick 每 100ms 调用、30 天推演约 26 万帧 × 4 阶段。
//   - 阶段分组在注册时预排序缓存，运行期零 sort / 零 filter 分配；
//   - 耗时统计默认关闭（setFlowProfiling(true) 仅供单测/QA 开启）；
//   - runFlows 不返回新数组，帧内结果按需通过 ctx.collectResults 收集。

export const FLOW_PHASES = Object.freeze({
  EP_PRODUCE: 'ep:produce',   // EP 主产出（必须最先，后续流都吃这一帧的余额）
  EP_AUX:     'ep:aux',       // 触手自动点击 / 懒惰态 / 灵感工坊蒸馏
  PRODUCERS:  'producers',    // 升级卡被动产出（RP / PT / FP）
  CONVERTERS: 'converters',   // PT 孵化 / 燃料燃烧 / 异兽维持
});
export const FLOW_PHASE_ORDER = Object.freeze(Object.values(FLOW_PHASES));

const _flows = [];                 // 全部已注册流（含 seq，保证同 order 稳定）
const _byPhase = new Map();        // phase -> 排序后的流数组（注册时重建）
const _modifiers = new Map();      // modKey -> [{ fn, seq }]
const _stats = new Map();          // flowId -> 运行统计
const _ledger = Object.create(null); // resource -> { in, out, gross }（守恒台账）
let _seq = 0;
let _profiling = false;
let _errors = [];                  // 最近 N 条流异常（QA 可读，不写日志刷屏）

function _rebuild() {
  _byPhase.clear();
  for (const p of FLOW_PHASE_ORDER) {
    _byPhase.set(p, _flows.filter(f => f.phase === p)
      .slice()
      .sort((a, b) => (a.order - b.order) || (a.seq - b.seq)));
  }
}

function _statOf(id) {
  let s = _stats.get(id);
  if (!s) { s = { id, ticks: 0, errors: 0, lastError: '', in: 0, out: 0, gross: 0, totalMs: 0 }; _stats.set(id, s); }
  return s;
}

function _book(resource, field, amount) {
  if (!resource || !Number.isFinite(amount) || amount === 0) return;
  const row = _ledger[resource] || (_ledger[resource] = { in: 0, out: 0, gross: 0 });
  row[field] += amount;
}

/** 注册一条资源流。同 id 重复注册会替换（便于测试重载，也防热更新叠加）。 */
export function registerFlow(flow) {
  if (!flow || !flow.id || typeof flow.run !== 'function') {
    throw new Error('flowEngine: 流必须包含 id 与 run(ctx)');
  }
  if (!FLOW_PHASE_ORDER.includes(flow.phase)) {
    throw new Error(`flowEngine: 未知阶段 ${flow.phase}`);
  }
  const at = _flows.findIndex(f => f.id === flow.id);
  const entry = {
    id: flow.id,
    phase: flow.phase,
    order: Number.isFinite(flow.order) ? flow.order : 10,
    modKey: flow.modKey || null,
    resource: flow.resource || null,
    enabled: flow.enabled || null,
    run: flow.run,
    seq: _seq++,
  };
  if (at >= 0) _flows[at] = entry; else _flows.push(entry);
  _rebuild();
  return entry;
}

/** 注销一条流（热更新 / 单测隔离用）；返回是否命中。 */
export function unregisterFlow(id) {
  const at = _flows.findIndex(f => f.id === id);
  if (at < 0) return false;
  _flows.splice(at, 1);
  _rebuild();
  return true;
}

/**
 * 注册流修饰器：新玩法影响既有资源的唯一入口。
 * fn(mult, ctx) => nextMult；只作用于声明了对应 modKey 的流。
 */
export function registerModifier(key, fn) {
  if (!key || typeof fn !== 'function') throw new Error('flowEngine: 修饰器需要 key 与 fn');
  if (!_modifiers.has(key)) _modifiers.set(key, []);
  _modifiers.get(key).push({ fn, seq: _seq++ });
}

/** 注销某键的全部修饰器（热更新 / 单测隔离用）；返回移除条数。 */
export function unregisterModifiers(key) {
  const list = _modifiers.get(key);
  if (!list) return 0;
  _modifiers.delete(key);
  return list.length;
}

/** 求某类资源流当前的总修饰倍率；单条修饰器异常被隔离，不拖垮整帧。 */
export function flowMultiplier(key, ctx) {
  if (!key) return 1;
  const list = _modifiers.get(key);
  if (!list || list.length === 0) return 1;
  let m = 1;
  for (const { fn } of list) {
    try {
      const out = fn(m, ctx);
      if (Number.isFinite(out)) m = out;
    } catch { /* 隔离：坏修饰器不改数值 */ }
  }
  return m;
}

/**
 * 执行一个阶段的全部流。严格按注册 order 顺序，单流异常隔离后继续。
 * 流返回值约定（可选）：{ produced, consumed, gross, resource }
 *   produced  = 实际入账量（钳后），consumed = 实际扣除量，gross = 钳前理论量
 */
export function runFlows(ctx, phase) {
  const list = _byPhase.get(phase);
  if (!list || list.length === 0) return;
  for (const f of list) {
    if (f.enabled) {
      let on = true;
      try { on = !!f.enabled(ctx); } catch { on = false; }
      if (!on) continue;
    }
    const st = _statOf(f.id);
    const t0 = _profiling ? performance.now() : 0;
    try {
      const r = f.run(ctx);
      st.ticks++;
      if (r && typeof r === 'object') {
        const res = r.resource || f.resource;
        if (Number.isFinite(r.produced)) { _book(res, 'in', r.produced); st.in += r.produced; }
        if (Number.isFinite(r.consumed)) { _book(res, 'out', r.consumed); st.out += r.consumed; }
        if (Number.isFinite(r.gross)) { _book(res, 'gross', r.gross); st.gross += r.gross; }
        if (ctx && ctx.collectResults) (ctx.results || (ctx.results = [])).push({ id: f.id, ...r });
      }
    } catch (err) {
      st.errors++;
      st.lastError = String((err && err.message) || err);
      _errors.push({ id: f.id, phase, error: st.lastError, at: ctx && ctx.now });
      if (_errors.length > 50) _errors.shift();
      if (ctx && typeof ctx.onFlowError === 'function') {
        try { ctx.onFlowError(f.id, err); } catch { /* 钩子自身异常也隔离 */ }
      }
    }
    if (_profiling) st.totalMs += performance.now() - t0;
  }
}

/** 全部流的声明（只读快照，供单测与 QA 断言接线完整） */
export function allFlows() {
  return _flows.slice().sort((a, b) => (a.order - b.order) || (a.seq - b.seq))
    .map(f => ({ id: f.id, phase: f.phase, order: f.order, modKey: f.modKey, resource: f.resource }));
}
export function flowsOfPhase(phase) { return (_byPhase.get(phase) || []).slice(); }
export function modifierKeys() { return [..._modifiers.keys()]; }

/** 运行统计 / 守恒台账（30 天推演据此核对数值准确性） */
export function flowStats() {
  return Object.fromEntries([..._stats.entries()].map(([id, s]) => [id, { ...s }]));
}
export function flowLedger() {
  return Object.fromEntries(Object.entries(_ledger).map(([k, v]) => [k, { ...v }]));
}
export function flowErrors() { return _errors.slice(); }
/** 供「一条流同时产出多种资源」时补记台账（如升级卡同时产 RP/PT/FP）。 */
export function bookFlow(resource, field, amount) {
  if (field !== 'in' && field !== 'out' && field !== 'gross') return;
  _book(resource, field, amount);
}
export function setFlowProfiling(on) { _profiling = !!on; }
export function resetFlowStats() {
  _stats.clear();
  for (const k of Object.keys(_ledger)) delete _ledger[k];
  _errors = [];
}

/** 仅测试用：清空全部注册（修饰器一并清空，调用方需重新声明） */
export function _resetFlows() {
  _flows.length = 0; _byPhase.clear(); _modifiers.clear(); _stats.clear();
  _errors = []; _seq = 0;
  for (const k of Object.keys(_ledger)) delete _ledger[k];
}
