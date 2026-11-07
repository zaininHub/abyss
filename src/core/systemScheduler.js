// v3.9.0 核心玩法抽象（控制流层）：帧系统调度器 Frame System Scheduler
//
// 背景（本次重构要消除的问题）：
//   v3.7.0 抽象了「故事线/规则/效果/门控/定价」的数据层，v3.8.0 抽象了「资源流」的结算层，
//   但主循环 tick() 仍残留约 360 行的硬编码顺序调度：
//     ① 二十余个模块 tick 按手写顺序逐个调用，新增一个系统必须改主循环（违反开闭原则）；
//     ② 五种节流时钟各写一遍（S._religCheckTimer += dt / now - lastAffordCheck > 300 /
//        now - lastShopCheck > 1000 / frame % 20 / S._petUiTimer），口径分散且易漏复位；
//     ③ 「系统产出哪些面板需要重绘」散落在赋值语句里，无法静态审计某个 dirty 键是否有人消费；
//     ④ 任一模块 tick 抛错会击穿整帧（含最后的 render），且 30 天推演无法定位是哪个系统出错。
//
// 现在的三层链（与 v3.8.0 资源流「声明 → 求值 → 消费」同构）：
//   声明层  systems/frameSystems.js    registerSystem({ id, phase, order, interval*, run })
//   求值层  core/systemScheduler.js   分阶段 + 排序 + 节流 + 异常隔离 + 脏标记归一 + 统计台账
//   消费层  main.js tick()             只在四个原执行点调 runSystems(ctx, PHASE)，不再写任何调度顺序
//
// 新增玩法只需注册一个系统（可声明节流与脏标记），不必改主循环、也不必改任何既有系统。
//
// 性能纪律：tick 每 100ms 调用、30 天推演约 26 万帧。
//   - 阶段分组在注册时预排序缓存，运行期零 sort / 零 filter 分配；
//   - 耗时统计默认关闭；runSystems 不创建新数组，结果按需写入 ctx.results；
//   - 节流状态写在长生命周期的 ctx 上，不产生每帧闭包/对象分配。

export const FRAME_PHASES = Object.freeze({
  AFTER_EP_AUX:   'frame:after-ep-aux',    // EP_AUX 之后、PRODUCERS 之前：薪资 / 线程 / 贡献分摊
  AFTER_PRODUCERS:'frame:after-producers', // PRODUCERS 之后、CONVERTERS 之前：宗教 / 政策 / 深潜 / 集市
  FRAME:          'frame:main',            // CONVERTERS 之后：其余模块 tick + 节流检查 + UI 重绘
});
export const FRAME_PHASE_ORDER = Object.freeze(Object.values(FRAME_PHASES));

const _systems = [];              // 全部已注册系统（含 seq，保证同 order 稳定）
const _byPhase = new Map();       // phase -> 排序后的系统数组（注册时重建）
const _stats = new Map();         // systemId -> 运行统计
const _errors = [];               // 最近 N 条系统异常（QA 可读）
let _seq = 0;
let _profiling = false;

function _rebuild() {
  _byPhase.clear();
  for (const p of FRAME_PHASE_ORDER) {
    _byPhase.set(p, _systems.filter(s => s.phase === p)
      .slice()
      .sort((a, b) => (a.order - b.order) || (a.seq - b.seq)));
  }
}

function _statOf(id) {
  let s = _stats.get(id);
  if (!s) {
    s = { id, ticks: 0, skipped: 0, errors: 0, lastError: '', totalMs: 0 };
    _stats.set(id, s);
  }
  return s;
}

/**
 * 注册一个帧系统。同 id 重复注册会替换（便于测试重载 / 防热更新叠加）。
 * 声明字段：
 *   id        唯一标识
 *   phase     FRAME_PHASES 之一（必填）
 *   order     同阶段内执行顺序（默认 10）
 *   run(ctx)  系统主体；返回值可声明需要重绘的面板（见 _applyDirty）
 *   enabled(ctx) 可选：false 时跳过（异常按跳过处理）
 *   intervalSec   可选：按 dt 累加的节流周期（等价旧 S._xxxTimer += dt; if >= n）
 *   intervalMs    可选：按 ctx.now 的节流周期（等价旧 now - lastXxx > n）
 *   everyFrames   可选：每 N 帧执行一次（等价旧 frame % N === 0）
 */
export function registerSystem(sys) {
  if (!sys || !sys.id || typeof sys.run !== 'function') {
    throw new Error('systemScheduler: 系统必须包含 id 与 run(ctx)');
  }
  if (!FRAME_PHASE_ORDER.includes(sys.phase)) {
    throw new Error(`systemScheduler: 未知阶段 ${sys.phase}`);
  }
  const entry = {
    id: sys.id,
    phase: sys.phase,
    order: Number.isFinite(sys.order) ? sys.order : 10,
    enabled: typeof sys.enabled === 'function' ? sys.enabled : null,
    intervalSec: Number.isFinite(sys.intervalSec) && sys.intervalSec > 0 ? sys.intervalSec : 0,
    intervalMs: Number.isFinite(sys.intervalMs) && sys.intervalMs > 0 ? sys.intervalMs : 0,
    everyFrames: Number.isFinite(sys.everyFrames) && sys.everyFrames > 0 ? Math.floor(sys.everyFrames) : 0,
    run: sys.run,
    seq: _seq++,
  };
  const at = _systems.findIndex(s => s.id === sys.id);
  if (at >= 0) _systems[at] = entry; else _systems.push(entry);
  _rebuild();
  return entry;
}

/** 注销一个系统（热更新 / 单测隔离用）；返回是否命中。 */
export function unregisterSystem(id) {
  const at = _systems.findIndex(s => s.id === id);
  if (at < 0) return false;
  _systems.splice(at, 1);
  _rebuild();
  return true;
}

/**
 * 归一「系统需要重绘哪些面板」。约定 run(ctx) 返回值：
 *   string            → 单个 dirty 键
 *   string[]          → 多个 dirty 键
 *   { key: truthy }   → 按对象键批量置位
 *   undefined / false → 无
 * 系统内部仍可直接写 ctx.dirty（既有代码迁移成本为零），两种写法可共存。
 */
function _applyDirty(ctx, result) {
  const d = ctx && ctx.dirty;
  if (!d) return;
  if (typeof result === 'string') {
    if (result) d[result] = true;
  } else if (Array.isArray(result)) {
    for (const k of result) if (typeof k === 'string' && k) d[k] = true;
  } else if (result && typeof result === 'object') {
    for (const [k, v] of Object.entries(result)) if (v) d[k] = true;
  }
}

/** 统一的节流判定：enabled → everyFrames → intervalMs / intervalSec。 */
function _shouldRun(f, ctx) {
  if (f.enabled) {
    try { if (!f.enabled(ctx)) return false; } catch { return false; }
  }
  if (f.everyFrames > 0) {
    const n = Number.isFinite(ctx.frame) ? ctx.frame : 0;
    if (n % f.everyFrames !== 0) return false;
  }
  if (f.intervalMs > 0) {
    const now = Number.isFinite(ctx.now) ? ctx.now : 0;
    const key = '_sysLast_' + f.id;
    const last = ctx[key];
    if (Number.isFinite(last) && now - last < f.intervalMs) return false;
    ctx[key] = now;
  }
  if (f.intervalSec > 0) {
    const dt = Number.isFinite(ctx.dt) ? Math.max(0, ctx.dt) : 0;
    const key = '_sysAcc_' + f.id;
    const acc = (Number.isFinite(ctx[key]) ? ctx[key] : 0) + dt;
    if (acc < f.intervalSec) { ctx[key] = acc; return false; }
    // 与旧实现一致：触发后归零（不保留余量），保证 1s / 5s 节拍与原存档字段完全同频
    ctx[key] = 0;
  }
  return true;
}

/**
 * 执行一个阶段的全部系统。严格按注册 order，单系统异常隔离后继续。
 * 返回本阶段实际执行的系统数（供 QA 断言接线完整）。
 */
export function runSystems(ctx, phase) {
  const list = _byPhase.get(phase);
  if (!list || list.length === 0) return 0;
  let ran = 0;
  for (const f of list) {
    if (!_shouldRun(f, ctx)) {
      // 跳过不计入统计，避免 26 万帧 × 数十系统的无谓写入
      continue;
    }
    const st = _statOf(f.id);
    const t0 = _profiling ? performance.now() : 0;
    try {
      const r = f.run(ctx);
      _applyDirty(ctx, r);
      st.ticks++;
      ran++;
      if (ctx && ctx.collectResults) (ctx.results || (ctx.results = [])).push({ id: f.id, result: r });
    } catch (err) {
      st.errors++;
      st.lastError = String((err && err.message) || err);
      _errors.push({ id: f.id, phase, error: st.lastError, at: ctx && ctx.now });
      if (_errors.length > 50) _errors.shift();
      if (ctx && typeof ctx.onSystemError === 'function') {
        try { ctx.onSystemError(f.id, err); } catch { /* 钩子自身异常也隔离 */ }
      }
    }
    if (_profiling) st.totalMs += performance.now() - t0;
  }
  return ran;
}

/** 全部系统的声明（只读快照，供单测与 QA 断言接线完整 / 顺序稳定） */
export function allSystems() {
  return _systems.slice().sort((a, b) => (a.order - b.order) || (a.seq - b.seq))
    .map(s => ({ id: s.id, phase: s.phase, order: s.order, intervalSec: s.intervalSec,
      intervalMs: s.intervalMs, everyFrames: s.everyFrames }));
}
export function systemsOfPhase(phase) { return (_byPhase.get(phase) || []).slice(); }

/** 运行统计 / 异常队列（30 天推演据此核对「零异常、无漏帧」） */
export function systemStats() {
  return Object.fromEntries([..._stats.entries()].map(([id, s]) => [id, { ...s }]));
}
export function systemErrors() { return _errors.slice(); }
export function setSystemProfiling(on) { _profiling = !!on; }
export function resetSystemStats() { _stats.clear(); _errors.length = 0; }

/** 仅测试用：清空全部注册（调用方需重新声明） */
export function _resetSystems() {
  _systems.length = 0; _byPhase.clear(); _stats.clear();
  _errors.length = 0; _seq = 0;
}
