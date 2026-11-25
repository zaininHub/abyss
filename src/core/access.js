// v2.3.0：购买访问层（RBAC 式）——「谁能买什么、为什么不能买」的唯一真源。
//
// 类比 RBAC：角色 = 章节阶段 + 已解锁模块，权限 = 购买动作，策略 = 本文件的 ACCESS 表，
// 执行点 = accessCheck()。UI（锁定卡文案）与购买路径（函数首行）共用同一个出口。
//
// 四条硬约束（tests/v230-access.test.mjs 强制）：
//   ① 章节号只引用 gate id，绝不写字面章号——真源是 core/chapterGates.js 的 CHAPTER_GATES；
//   ② 新增购买动作必须在 ACCESS 注册，并在购买函数首行调用 accessCheck('<id>', S)；
//   ③ 原因文案只在本文件写一次，模块不得另写一份（旧文案逐字保留，避免玩家观感回退）；
//   ④ 本文件不 import 任何 modules/ —— 只读已持久化字段（与 data/policies.js 同口径），避免成环。
//
// 不放进本表的两类门禁（各有单一真源，重复登记反而会漂移）：
//   · 科技逐项：data/techs.js 的 minChapter + req —— 由 accessCheck('tech.buy', S, { chapter, requires }) 传入；
//   · 研究项逐项：shop.js 的 RESEARCH_MODULE_GATES —— 已有的注册表 + researchResourceUnlocked 单一出口。
//
// 价格不在本表：价格真源在 data/*.js（upgrades/religions/eternals/relics/balance 等）与 core/pricing.js，
//   本表只回答「能不能买」和「为什么不能买」，避免同一数字写三份。
import { gateOpen, gateChapter, gateChapterText, chapterAtLeast } from './chapterGates.js';
import { hasAnchor, riftSeen, starChartOpen } from './unlocks.js';

const up = (s, id) => ((s && s.upgrades && s.upgrades[id]) || 0);
const read = (s, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);

// ============ 规则原子：{ id, test(state), why(state) } ============
export const rules = {
  /** 章节门禁（引用 CHAPTER_GATES 的 gate id）。why 可覆盖以保留旧文案。 */
  chapter(id, why) {
    return { id: `chapter:${id}`, test: (s) => gateOpen(id, s), why: () => why || (gateChapterText(id) ? `需推进到${gateChapterText(id)}` : '尚未开放') };
  },
  tech(id, label) {
    return { id: `tech:${id}`, test: (s) => !!(s && s.tech && s.tech[id]), why: () => label || `需先研究「${id}」` };
  },
  upgradeAtLeast(id, lv, label) {
    return { id: `upgrade:${id}@${lv}`, test: (s) => up(s, id) >= lv, why: () => label || `需「${id}」≥ ${lv} 级` };
  },
  anchor(key, why) {
    return { id: `anchor:${key}`, test: (s) => hasAnchor(key, s), why: () => why || `需先解锁资源 ${key.toUpperCase()}` };
  },
  rift(why) {
    return { id: 'rift', test: (s) => riftSeen(s), why: () => why || '需先触发裂隙' };
  },
  starChart(why) {
    return { id: 'starchart', test: (s) => starChartOpen(s), why: () => why || '星图尚未开启' };
  },
  resource(key, why) {
    return { id: `res:${key}`, test: (s) => !!(s && s.resDiscovered && s.resDiscovered[key]), why: () => why || `需先发现资源 ${key.toUpperCase()}` };
  },
  /** 读任意已持久化字段路径，如 'bazaar.unlocked' / 'religion.unlocked' / 'crossroad'。 */
  flag(path, why) {
    return { id: `flag:${path}`, test: (s) => !!read(s, path), why: () => why || '前置未满足' };
  },
  /** 字段等于某值，如 crossroad === 'open'。 */
  is(path, value, why) {
    return { id: `is:${path}`, test: (s) => read(s, path) === value, why: () => why || '前置未满足' };
  },
  prestige(n, why) {
    return { id: `prestige:${n}`, test: (s) => ((s && s.prestige) || 0) >= n, why: () => why || `需晋升 ≥ ${n} 次` };
  },
  es(n, why) {
    return { id: `es:${n}`, test: (s) => ((s && s.es) || 0) >= n, why: () => why || `需转生 ES ≥ ${n}` };
  },
  projects(n, why) {
    return { id: `projects:${n}`, test: (s) => ((s && s.projectsDone) || 0) >= n, why: () => why || `需完成 ${n} 个研究项目` };
  },
  /** 任一满足即可；全部失败时按顺序拼原因。 */
  any(...rs) {
    return {
      id: 'any',
      test: (s) => rs.some((r) => r.test(s)),
      why: (s) => rs.filter((r) => !r.test(s)).map((r) => r.why(s)).join(' 或 '),
    };
  },
  /** 临时谓词（逐项门禁由调用方传入，如科技 minChapter / 研究项宿主模块）。 */
  custom(id, test, why) {
    return { id: `custom:${id}`, test, why };
  },
};

// ============ 策略表：动作 id → { label, chapter, requires, note } ============
export const ACCESS = Object.freeze({
  // —— 核心循环（无权限门禁；渐进披露链是 UI 语义，不是权限）——
  'shop.upgrade': { label: '升级', chapter: null, requires: [], note: '渐进披露由 renderShop 的 chainSplit 负责' },
  'shop.thread': { label: '线程强化', chapter: null, requires: [] },
  'shop.vehicle': { label: '载具', chapter: null, requires: [] },
  'shop.dm': { label: '深渊升级', chapter: null, requires: [] },
  'shop.building': { label: '建筑', chapter: null, requires: [] },
  'shop.v21': { label: '编排钥匙', chapter: null, requires: [] },
  'shop.v21building': { label: '编排建筑', chapter: null, requires: [] },
  'shop.family': { label: '研究加成', chapter: null, requires: [] },
  'shop.crossroad': { label: '岔路口设施', chapter: null, requires: [rules.is('crossroad', 'open', '岔路口尚未开放')] },
  'shop.offline': { label: '离线升级', chapter: null, requires: [rules.tech('offline1', '需先研究「远程协作」')] },

  // —— 科技 / 遗物 / 裂隙 / 永恒矩阵 ——
  'tech.buy': { label: '科技', chapter: null, requires: [], note: '逐项 minChapter + req 由调用方经 ctx.chapter / ctx.requires 传入' },
  'eternal.buy': { label: '永恒矩阵', chapter: 'eternals', requires: [rules.anchor('es', '需完成首次晋升（ES 未发现）')] },
  // 注意用 resource('dm') 而非 anchor('dm')：遗物口径是「DM 已发现」（跨晋升持久的 resDiscovered 标记），
  //   不是「本局买了首辆载具」——两者在转生后不同步，混用会让老玩家丢遗物入口。
  'relic.buy': { label: '深渊遗物', chapter: 'relics', requires: [rules.resource('dm', '需先发现深渊之力（DM）'), rules.rift('需先触发裂隙')] },
  'purifier.buy': { label: '净化节点', chapter: 'relics', requires: [rules.resource('dm', '需先发现深渊之力（DM）'), rules.rift('需先触发裂隙')] },
  'rift.tech': { label: '裂隙科技', chapter: null, requires: [rules.rift('需先触发裂隙')] },
  'rift.upgrade': { label: '裂隙升级', chapter: null, requires: [rules.rift('需先触发裂隙')] },

  // —— 宗教 / 深潜 / 宇宙 ——
  'religion.unlock': {
    label: '宗教唤醒',
    chapter: 'religion',
    requires: [
      rules.any(rules.upgradeAtLeast('reserve_bin', 3, '需备用粮仓 ≥3 级'), rules.upgradeAtLeast('storage', 3, '需存储节点 ≥3 级')),
      rules.resource('rp', '需 RP 已觉醒'),
    ],
  },
  'delve.unlock': {
    label: '深潜',
    chapter: 'delve',
    chapterWhy: '深潜需推进至第 11 章「虚空」',
    requires: [rules.es(3, '需转生 ES ≥ 3'), rules.any(rules.resource('dm'), rules.upgradeAtLeast('dm_vault', 1)), rules.flag('religion.unlocked', '需先信奉一个宗教分支')],
  },
  'delve.upgrade': { label: '深潜升级', chapter: null, requires: [rules.flag('delve.unlocked', '深潜尚未解锁')] },
  'cosmos.buy': {
    label: '宇宙探索',
    chapter: null,
    requires: [rules.starChart('星图尚未开启'), rules.tech('deep_space', '需科技「深空探测」'), rules.resource('rp', '需 RP 已发现')],
  },

  // —— 远征 / 殖民 ——
  'expedition.launch': { label: '远征出发', chapter: null, requires: [rules.starChart('星图尚未开启')] },
  'colony.claim': {
    label: '深空殖民',
    chapter: 'expedition',
    chapterWhy: '深空殖民需推进至第 12 章「造物」',
    requires: [rules.starChart('星图尚未开启'), rules.tech('deep_space', '需科技「深空探测」')],
  },

  // —— 集市 / 异兽 / AI / 回响 ——
  'bazaar.unlock': { label: '深渊集市买断', chapter: 'bazaar', requires: [rules.prestige(1, '需先完成 1 次晋升')] },
  'bazaar.trade': { label: '集市交易', chapter: null, requires: [rules.flag('bazaar.unlocked', '集市尚未开张')] },
  'pets.buy': { label: '异兽', chapter: null, requires: [rules.anchor('pt', '需先获得 PT（饵料仓库）')] },
  'assistant.buy': { label: 'AI 助手', chapter: null, requires: [rules.tech('ai_core', '需先研究「AI 管理核心」')] },
  'echo.buy': { label: '回响升级', chapter: null, requires: [rules.prestige(1, '需完成首次晋升')] },

  // —— 政策 / 相位共鸣 ——
  'policy.open': { label: '周期政策', chapter: 'policy', requires: [] },
  'resonance.open': {
    label: '相位共鸣',
    chapter: 'resonance',
    requires: [rules.any(rules.projects(12, '需完成 12 个研究项目'), rules.prestige(2, '需晋升 ≥ 2 次'))],
  },
});

/**
 * 访问判定唯一出口。返回 { ok, reason, ruleId, policy }。
 * ctx（可选）：逐项门禁覆盖 { chapter, requires }——科技用 minChapter/req，研究项用宿主模块谓词。
 *   ctx.chapter === undefined 时沿用策略表；显式 null/0 表示「该项无章节门禁」。
 */
export function accessCheck(id, s, ctx) {
  const policy = ACCESS[id];
  if (!policy) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[access] 未注册的购买动作「${id}」——按不可购买处理（fail-closed）。请在 core/access.js 的 ACCESS 注册。`);
    }
    return { ok: false, reason: '（未注册的购买动作）', ruleId: 'unregistered' };
  }
  const hasOverride = !!(ctx && ctx.chapter !== undefined);
  const chapterId = hasOverride ? ctx.chapter : policy.chapter;
  // ctx.chapter 允许两种写法：门禁 id（'relics'）或裸章号（9，科技卡的 minChapter 用后者）。
  if (typeof chapterId === 'number') {
    if (!chapterAtLeast(chapterId, s)) return { ok: false, reason: `需推进到第 ${chapterId} 章`, ruleId: `chapter:${chapterId}`, policy };
  } else if (chapterId) {
    const rule = rules.chapter(chapterId, policy.chapterWhy);
    if (!rule.test(s)) return { ok: false, reason: rule.why(s), ruleId: rule.id, policy };
  }
  const requires = [...(policy.requires || []), ...((ctx && ctx.requires) || [])];
  for (const rule of requires) {
    if (!rule.test(s)) return { ok: false, reason: rule.why(s), ruleId: rule.id, policy };
  }
  return { ok: true, policy };
}

/** 只要原因（UI 锁定卡用）；可买时返回空串。 */
export function accessReason(id, s, ctx) {
  const r = accessCheck(id, s, ctx);
  return r.ok ? '' : r.reason;
}

/** 只要布尔（旧布尔契约的购买函数用，保持调用方零改动）。 */
export function accessOk(id, s, ctx) {
  return accessCheck(id, s, ctx).ok;
}

/** 调试/文档用：某动作的章节号（无章节门禁返回 null）。 */
export function accessChapter(id) {
  const p = ACCESS[id];
  if (!p) return null;
  return p.chapter ? gateChapter(p.chapter) : null;
}
