// v2.0 核心：规则引擎（Rule Engine）
// 纯函数注册表：按 key 前缀和 priority 聚合计算结果
// 故事线可通过注册额外规则来改变数值公式（如 CPS 乘数来源类别）

const _rules = new Map(); // key prefix -> [{ priority, fn, storyline }]

export function registerRule(keyPrefix, fn, priority = 10, storyline = 'default') {
  if (!_rules.has(keyPrefix)) _rules.set(keyPrefix, []);
  _rules.get(keyPrefix).push({ priority, fn, storyline });
}

export function unregisterRules(storyline) {
  for (const [key, rules] of _rules.entries()) {
    _rules.set(key, rules.filter(r => r.storyline !== storyline));
  }
}

export function evaluate(key, baseValue, context) {
  const rules = _rules.get(key) || [];
  const active = rules.filter(r => r.storyline === 'default' || true);
  // Sort by priority (higher first)
  active.sort((a, b) => b.priority - a.priority);
  let result = baseValue;
  for (const rule of active) {
    const out = rule.fn(result, context);
    if (out !== undefined && out !== null) result = out;
  }
  return result;
}

export function getRules(keyPrefix) {
  return _rules.get(keyPrefix) || [];
}

export function _clearRules() {
  _rules.clear();
}
