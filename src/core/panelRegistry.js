// v3.9.0 核心玩法抽象（渲染分发层）：声明式面板注册表
//
// 背景：main.js render() 原本是 20 余段手写 `if (dirty.xxx) { renderXxx(); dirty.xxx = false; }`。
// 新增面板要改 render()，且「某个 dirty 键有没有消费者」只能靠人肉通读。
// 现在改为注册制：每个面板声明 key 与 render()，renderPanels() 按注册顺序统一消费脏标记。
//
// 与 systemScheduler 配套后形成闭环：
//   帧系统 run(ctx) 声明「我脏了哪些面板」 → panelRegistry 消费 → 面板渲染，
//   并可静态审计「dirty 键 ↔ 面板消费者」是否一一对应（见 v390 单测）。
//
// 纪律：
//   - 注册顺序即渲染顺序，必须与 v3.8.0 原 render() 的 if 链顺序一致（重构不引入 UI 漂移）；
//   - always:true 的条目每帧执行（用于开档即跑的挂载点 / 纯样式同步），不受脏标记控制；
//   - 单个面板渲染异常被隔离并记录，不阻断后续面板，也不击穿整帧。

const _panels = [];
const _errors = [];
let _seq = 0;

/** 注册一个面板。同 key 重复注册会替换（always 条目用唯一 key）。 */
export function registerPanel(panel) {
  if (!panel || !panel.key || typeof panel.render !== 'function') {
    throw new Error('panelRegistry: 面板必须包含 key 与 render()');
  }
  const entry = { key: panel.key, render: panel.render, always: !!panel.always, seq: _seq++ };
  const at = _panels.findIndex(p => p.key === entry.key);
  if (at >= 0) _panels[at] = entry; else _panels.push(entry);
  return entry;
}

/** 注销面板（热更新 / 单测隔离用）。 */
export function unregisterPanel(key) {
  const at = _panels.findIndex(p => p.key === key);
  if (at < 0) return false;
  _panels.splice(at, 1);
  return true;
}

/** 全部已注册面板（只读快照，供单测审计接线）。 */
export function allPanels() {
  return _panels.slice().map(p => ({ key: p.key, always: p.always }));
}

/** 消费一轮脏标记。返回本帧实际渲染的面板数。 */
export function renderPanels(dirty) {
  if (!dirty) return 0;
  let n = 0;
  for (const p of _panels) {
    if (!p.always && !dirty[p.key]) continue;
    try {
      p.render();
      n++;
    } catch (err) {
      _errors.push({ key: p.key, error: String((err && err.message) || err) });
      if (_errors.length > 50) _errors.shift();
    } finally {
      if (!p.always) dirty[p.key] = false;
    }
  }
  return n;
}

export function panelErrors() { return _errors.slice(); }
export function resetPanelErrors() { _errors.length = 0; }

/** 仅测试用：清空全部注册。 */
export function _resetPanels() { _panels.length = 0; _errors.length = 0; _seq = 0; }
