// v3.7.0 核心玩法抽象：故事线差异化的「单一真源」与统一求值入口。
//
// 背景（本次重构要消除的问题）：
//   线专属数值效果原先散落在 economy.js 的 `S.storyline === '...'` / `hasTech(...)` 硬编码里，
//   而 storylines/*.js 声明的 rules 从未被任何模块消费（死数据），
//   provider 的变体表也只被 chapters/techs 用到。同一玩法有两套互不相干的实现口径。
//
// 现在的三层链：
//   声明层  storylines/line_*.js  rules: { key: (base, ctx) => next }
//   求值层  core/ruleEngine.js    按当前故事线过滤 + 优先级排序
//   消费层  economy.js 等         只调 lineRule(key, base, S)，不判断 S.storyline
//
// 新增一条线专属效果 = 在故事线包注册规则 + 在对应乘数处调用 lineRule，
// 不需要再往经济模块里塞条件分支，也不会出现「声明了但没生效」的死数据。
import { evaluate, activeRules, registerRule } from './ruleEngine.js';
import { getStorylineId } from './provider.js';
import orderPkg from '../storylines/line_order.js';
import abyssPkg from '../storylines/line_abyss.js';
import faithPkg from '../storylines/line_faith.js';

// 声明式规则在模块加载时一次性静态注册。
// 这样 pure-Node 单测、浏览器启动前后、故事线切换前后，同一份 (S.storyline, key) 恒得同一结果，
// 不再依赖 loadStoryline() 是否先跑过（v3.7.0 首版曾因此让单测里 abyss 上限加成失效）。
export const LINE_RULE_SOURCES = [orderPkg, abyssPkg, faithPkg];
for (const pkg of LINE_RULE_SOURCES) {
  for (const [key, fn] of Object.entries(pkg.rules || {})) {
    registerRule(key, fn, 10, pkg.id, { static: true });
  }
}

// 全部合法规则键。每个键都必须有且仅有一个消费点（由 v370 单测断言覆盖）。
export const LINE_RULE_KEYS = Object.freeze({
  COST_MULT:           'cost_mult_bonus',
  CORRUPTION_PENALTY:  'corruption_penalty_reduce',
  CORRUPTION_CAP:      'corruption_cap',
  TIDE_NEGATIVE:       'tide_negative_immune',
  SEAL_DM:             'seal_dm_bonus',
  SYMBIOSIS:           'symbiosis_active',
  PET_MULT:            'pet_mult_bonus',
  FAITH_PURIFY:        'faith_purify',
  CORROSION_SLOW:      'corrosion_slow',
  GLOBAL_MULT:         'global_mult',
  EP_CAP:              'ep_cap_mult',
});

// 供故事线面板 / QA 展示的玩家可读名称（不暴露实现术语）
export const LINE_RULE_LABELS = Object.freeze({
  cost_mult_bonus:            '协议折扣：全局成本 -3%',
  corruption_penalty_reduce:  '熵减护盾：腐化惩罚减轻 25%',
  corruption_cap:             '混沌容器：腐化上限提升',
  tide_negative_immune:       '逻辑稳流：潮汐负面减弱',
  seal_dm_bonus:              '裂隙亲和：封印所得 +25%',
  symbiosis_active:           '共生：高腐化时产出 +5%',
  pet_mult_bonus:             '圣宠庇佑：异兽效果 +10%',
  faith_purify:               '信仰中和：净化效率 +20%',
  corrosion_slow:             '神迹之躯：腐化惩罚减轻 25%',
  global_mult:                '神权协议：全局产出 ×3',
  ep_cap_mult:                '线专属仓储：EP 上限提升',
});

// 数值型规则：把 base 依次交给当前线的规则链。
// 优先用 S.storyline（状态真源），其次用显式参数，最后才回退 provider 全局值。
export function lineRule(key, base, S, storyline = null) {
  const line = (S && S.storyline) || storyline || getStorylineId();
  return evaluate(key, base, { S, storyline: line });
}

// 布尔型规则：base 传 false，返回是否激活。
export function lineFlag(key, S, storyline = null) {
  return !!lineRule(key, false, S, storyline);
}

// 当前线在指定键上注册了哪些规则（供面板/单测检查接线完整性）
export function currentLineRules(key, storyline = null) { return activeRules(key, storyline); }

// 全部规则键（供单测与面板遍历）
export function allLineRuleKeys() { return Object.values(LINE_RULE_KEYS); }
