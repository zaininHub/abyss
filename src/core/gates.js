// v2.0 核心：可见性门控系统（Visibility Gate）
// 声明式谓词：控制 UI 模块的显示/隐藏
// 与 listkit 的折叠分区配合：未解锁的模块显示灰色占位

const _gates = new Map(); // moduleId -> { predicate, label, storyline }

export function registerGate(moduleId, predicate, label = '', storyline = 'default') {
  _gates.set(moduleId, { predicate, label, storyline });
}

export function checkGate(moduleId, context = {}) {
  const gate = _gates.get(moduleId);
  if (!gate) return true; // 未注册 = 默认可见
  try {
    return !!gate.predicate(context);
  } catch {
    return false;
  }
}

export function getGateLabel(moduleId) {
  const gate = _gates.get(moduleId);
  return gate ? gate.label : '';
}

export function getAllGates() {
  return Array.from(_gates.entries()).map(([id, g]) => ({ id, ...g }));
}

export function _clearGates() {
  _gates.clear();
}
