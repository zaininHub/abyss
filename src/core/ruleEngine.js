// v2.0 核心：规则引擎（Rule Engine）
// v3.7.0 接线重构：此前 evaluate() 全库零调用，过滤条件 `r.storyline === 'default' || true` 恒真，
//   且 active.sort() 就地改写注册表数组 —— 三条故事线声明的 rules 因此从未影响过任何数值。
//   现改为「按当前故事线过滤 + 副本排序 + 单条异常隔离」的求值器；
//   由 core/lineRules.js 统一代理消费，economy.js 各乘数不再硬编码 S.storyline 分支。
import { getStorylineId } from './provider.js';

const _rules = new Map(); // key -> [{ priority, fn, storyline, seq }]
let _seq = 0;

// options.static：由 core/lineRules.js 在模块加载时注册的「声明式规则」，
// 不随 loadStoryline() 的清场被移除 —— 数值不应依赖故事线运行时初始化顺序。
export function registerRule(keyPrefix, fn, priority = 10, storyline = 'default', options = {}) {
  if (!_rules.has(keyPrefix)) _rules.set(keyPrefix, []);
  _rules.get(keyPrefix).push({ priority, fn, storyline, seq: _seq++, static: !!options.static });
}

// 只注销动态注册的规则；声明式（static）规则是数值基础设施，清理时保留。
export function unregisterRules(storyline) {
  for (const [key, rules] of _rules.entries()) {
    _rules.set(key, rules.filter(r => r.storyline !== storyline || r.static));
  }
}

// 切换故事线时只清「动态扩展规则」，保留声明式规则（避免切回来后规则永久丢失）
export function clearDynamicRules() {
  for (const [key, rules] of _rules.entries()) {
    _rules.set(key, rules.filter(r => r.static));
  }
}

// 当前生效规则：default 常驻 + 当前故事线专属。
// 返回排序后的副本，绝不改写注册表（旧实现的就地 sort 会让重复求值顺序漂移）。
export function activeRules(key, storyline = null) {
  const line = storyline || getStorylineId();
  return (_rules.get(key) || [])
    .filter(r => r.storyline === 'default' || r.storyline === line)
    .slice()
    .sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
}

// 逐条把 baseValue 交给规则链，规则返回 null/undefined 视为「不修改」。
// context 约定：{ S, storyline? }；单条规则抛错只跳过该条，不中断全局数值计算。
export function evaluate(key, baseValue, context = {}) {
  let result = baseValue;
  for (const rule of activeRules(key, context.storyline)) {
    try {
      const out = rule.fn(result, context);
      if (out !== undefined && out !== null) result = out;
    } catch { /* 隔离：坏规则不应击垮整个 tick */ }
  }
  return result;
}

// 返回副本，避免调用方就地修改注册表
export function getRules(keyPrefix) { return (_rules.get(keyPrefix) || []).slice(); }

// 测试/重置入口：只清动态规则。声明式规则（core/lineRules.js 静态注册）属于数值基础设施，
// 清掉它们会让后续任何 tick 的线专属效果凭空消失（smoke 5.4 曾因此失败）。
export function _clearRules() { clearDynamicRules(); }
