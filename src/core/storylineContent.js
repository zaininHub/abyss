// v3.7.0：故事线变体内容的「规范化 + 单一读取入口」。
//
// 背景（本次修掉的死数据）：
//   line_*.js 的 events.append 使用 buffMult / weight / dm / tech 等字段，
//   而 modules/events.js 只认 mult / minCps / rare，且 applyEvent 没有 dm / tech 分支；
//   变体事件全部缺 minCps → `cps >= undefined` 恒 false → 18 个线专属事件从未触发过。
//   pets.append 也因 provider 未注册 pets 表而完全不可见。
//
// 本模块把「声明形态」翻译成「运行形态」并做完整性校验，消费侧不再各自兼容。
// 新增事件类型必须同时登记 SUPPORTED_EVENT_TYPES 与 modules/events.js 的分支（v370 单测断言）。
import { getEvents, getPets } from './provider.js';

// 与 modules/events.js applyEvent 的分支一一对应
export const SUPPORTED_EVENT_TYPES = new Set([
  'ep', 'buff', 'debuff', 'clickbuff', 'rp', 'focus', 'freelevel',
  'petxp', 'offrush', 'fuse_luck', 'lose_ep', 'purify', 'dm',
]);

// 需要数值字段的类型（缺字段会让事件「触发了但什么也没发生」）
const NUMERIC_FIELDS = {
  ep: ['amount'], buff: ['mult', 'dur'], debuff: ['mult', 'dur'],
  clickbuff: ['mult', 'dur'], rp: ['amount'], focus: ['amount'],
  lose_ep: ['amount'], dm: ['amount'],
};

// ===== 章节序号统一口径 =====
// 主线用数字 id（1..21+），变体用字符串（'5A'/'13B'）。旧代码各处 parseInt 比较，
// 导致 '12A' 与主线 12 撞号、图鉴去重误判、chapter9 成就对变体玩家不可达。
// chapterSeq 只用于「进度比较」；chapterKey 只用于「图鉴去重/持久化」。
export function chapterSeq(id) {
  const n = parseInt(String(id ?? '1'), 10);
  return Number.isFinite(n) ? n : 0;
}
export function chapterKey(id) { return String(id ?? '1'); }

// 返回 [序号, 后缀]：数字章为 [n, '']，变体章为 [n, 'A'|'B'|'C'...]。
// 用于「是否向前推进」的比较——旧实现只比 parseInt，'12A' 与主线 12 相等导致跳不过去。
export function chapterRank(id) {
  const s = String(id ?? '1');
  const m = s.match(/^(\d+)([A-Z]?)$/);
  if (!m) return [chapterSeq(s), ''];
  return [parseInt(m[1], 10), m[2]];
}

// 图鉴持久化编码：变体章与同序号主线章不再撞号（'5A' 旧编码 5 会误判为已进入主线第 5 章）。
// 旧档里存的数字仍由消费点用 chapterSeq 兜底识别，迁移无感。
export function chapterCode(id) {
  const [n, suffix] = chapterRank(id);
  return suffix ? n + 100 : n;
}

// 成就/进度评估：变体章按「主线 +4」折算，使立誓玩家也能走完 chapter9 / chapter18 成就
// （变体只到 14X，若直接比序号则 chapter18 永远不可达）。
export function chapterProgress(id) {
  const [n, suffix] = chapterRank(id);
  return n + (suffix ? 4 : 0);
}

// ===== 变体事件规范化 =====
export function normalizeVariantEvent(raw) {
  if (!raw || !raw.id) return null;
  const ev = { ...raw };
  // 旧声明用 buffMult，运行侧只认 mult
  if (ev.mult == null && ev.buffMult != null) ev.mult = ev.buffMult;
  // 旧声明没有 minCps：默认 0 表示任何产能都可触发（由 rare/权重控制频率）
  if (ev.minCps == null) ev.minCps = 0;
  // 旧声明用 weight（0.1~1）表达稀有度：≤0.5 视为稀有事件
  if (ev.rare == null) ev.rare = typeof ev.weight === 'number' ? ev.weight <= 0.5 : false;
  // 旧声明 type:'tech' 无对应分支，归一为 freelevel（随机升级 +1），语义接近且不破坏科技门控
  if (ev.type === 'tech') ev.type = 'freelevel';
  return ev;
}

// 返回问题列表（空数组 = 合法）；供单测与开发期自检
export function validateEvent(ev) {
  const errs = [];
  if (!ev || !ev.id) return ['missing id'];
  if (!ev.name) errs.push('missing name');
  if (!ev.desc) errs.push('missing desc');
  if (!SUPPORTED_EVENT_TYPES.has(ev.type)) errs.push(`unsupported type: ${ev.type}`);
  if (!Number.isFinite(ev.minCps)) errs.push('minCps not finite');
  for (const f of (NUMERIC_FIELDS[ev.type] || [])) {
    if (!Number.isFinite(ev[f])) errs.push(`missing ${f}`);
  }
  if ((ev.type === 'buff' || ev.type === 'clickbuff') && ev.mult < 1) errs.push('positive buff mult < 1');
  if (ev.type === 'debuff' && ev.mult > 1) errs.push('debuff mult > 1');
  return errs;
}

// 事件池唯一入口：主表 + 当前线变体，去重 + 规范化 + 校验
export function getStorylineEvents({ includeInvalid = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of getEvents()) {
    const ev = normalizeVariantEvent(raw);
    if (!ev || seen.has(ev.id)) continue;
    if (!includeInvalid && validateEvent(ev).length > 0) continue;
    seen.add(ev.id);
    out.push(ev);
  }
  return out;
}

// 线专属异兽：主表 + 当前线变体（只保留具备可渲染字段的条目）
export function getStorylinePets() {
  const out = [], seen = new Set();
  for (const p of getPets()) {
    if (!p || !p.id || seen.has(p.id)) continue;
    if (!p.name) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// 仅返回当前线声明的变体事件（供故事线面板展示「本线专属事件」）
export function currentLineEvents() {
  return getStorylineEvents().filter(e => e.weight != null || e.buffMult != null || e.lineOnly === true);
}
