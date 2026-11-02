// v3.3.0 线程绑定系统（核心逻辑，纯函数，无 DOM / 无 economy 依赖，避免循环引用）
// 设计对应新玩法 5 条方向：
//   ① 所有 ep 转化需绑定线程：绑定后该线程自由 EP 产出↓、消耗↑；转化器关闭→绑定释放→消耗恢复
//   ② 线程有天赋（职业）：匹配岗位无 EP/消耗惩罚且加成高；懒惰负面线程少
//   ③ 领导者线程可分配线程到合适岗位，且拥有全局加成
//   ④ 线程有等级：按在岗时间累积 XP（合适岗位更快），高等级加成高
//   ⑤ AI 助手与线程职业联动：招募按需求建议职业；领导者可触发智能分配
// 经济影响经 economy.js 的 staffOutputPerSec / staffSalaryPerSec / globalMult / vehicleDmPerMin 接入。
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { PROFESSION_BY_ID, LEADER_PROFESSION_ID, LAZY_PROFESSION_ID, CONVERTER_IDS, CONVERTERS } from '../data/threads.js';

const B = () => BALANCE.thread.binding;

export function threadProfession(c) { return c && c.profession ? PROFESSION_BY_ID[c.profession] : null; }
export function isLazyProfession(c) { return !!(c && c.profession === LAZY_PROFESSION_ID); }
export function isLeader(c) { return !!(c && c.leader); }
export function threadLevel(c) { return Math.max(1, Math.min(B().levelCap, c && c.level ? c.level : 1)); }

// ---- 绑定生效性（转化器开启且已分配）----
export function bindingActive(c) {
  if (!c || !c.boundTo) return false;
  const on = S.converterOn ? S.converterOn[c.boundTo] : true;
  return on !== false;
}
export function affinityMatches(c, type) {
  const p = threadProfession(c);
  return !!(p && p.affinity && p.affinity === type);
}
export function isSuitable(c) {
  if (!bindingActive(c)) return false;
  if (isLeader(c)) return true;            // 领导者在岗即视为合适（指挥）
  return affinityMatches(c, c.boundTo);
}

// ---- 方向①：绑定对「线程自由 EP 产出」的影响（×）----
export function threadBindOutputFactor(c) {
  if (!bindingActive(c)) return 1;
  if (affinityMatches(c, c.boundTo)) return 1;          // 擅长岗位：不减少 EP
  if (isLazyProfession(c)) return B().lazyOutputFactor;
  return B().outputFactor;
}
// ---- 方向①：绑定对「线程消耗」的影响（×）----
export function threadBindSalaryFactor(c) {
  if (!bindingActive(c)) return 1;
  if (affinityMatches(c, c.boundTo)) return 1;          // 擅长岗位：不增加消耗
  if (isLazyProfession(c)) return B().lazySalaryFactor;
  return B().salaryFactor;
}

// ---- 方向④：等级 ----
// 达到某等级所需累计 XP（指数曲线，封顶 levelCap）
export function xpThreshold(level) {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level, 1.8));
}
export function threadLevelFromXp(xp) {
  const cap = B().levelCap;
  let lv = 1;
  while (lv < cap && (xp || 0) >= xpThreshold(lv + 1)) lv++;
  return lv;
}
export function threadLevelMult(level) {
  return 1 + (Math.max(1, level) - 1) * B().levelMultPerLevel;
}
// 在岗每秒 XP 获取（合适岗位更快）—— 方向④「合适岗位增加的多」
export function threadXpGainPerSec(c) {
  if (!bindingActive(c)) return 0;
  let g = B().xpPerSec;
  if (isSuitable(c)) g *= B().xpSuitableMult;
  return g;
}

// ---- 方向③：领导者全局加成 ----
export function leaderCount() { return (S.cultists || []).filter(isLeader).length; }
export function leaderGlobalMult() {
  const n = leaderCount();
  return 1 + Math.min(B().leaderGlobalCap, n * B().leaderGlobalPerLeader);
}

// ---- 方向①/②：绑定对「转化器产出」的加成（乘区，≥1）----
// 每个生效绑定的线程按等级/职业/领导叠加；转化器关闭或无绑定 → 1
export function converterThreadBoost(type) {
  if (S.converterOn && S.converterOn[type] === false) return 1;
  let mult = 1;
  for (const c of (S.cultists || [])) {
    if (!bindingActive(c) || c.boundTo !== type) continue;
    const lvl = threadLevel(c);
    const match = affinityMatches(c, type);
    const lvlBonus = (lvl - 1) * (match ? B().matchLevelBonus : B().mismatchLevelBonus);
    const profBonus = match ? B().matchProfBonus : B().mismatchProfBonus;
    const lead = isLeader(c) ? B().leaderBonus : 0;
    mult *= (1 + lvlBonus + profBonus + lead);
  }
  return mult;
}

// ---- 绑定 / 解绑 / 晋升 ----
export function bindThread(c, type) {
  if (!CONVERTERS[type]) return false;
  c.boundTo = type;
  c.assignSince = Date.now();
  return true;
}
export function unbindThread(c) { c.boundTo = null; }

// ---- 方向③：智能分配（领导者决策选项）----
// 把空闲线程分配到合适岗位：优先匹配职业，否则均衡负载；返回分配数量
export function autoAssignThreads() {
  const types = CONVERTER_IDS.filter(t => !(S.converterOn && S.converterOn[t] === false));
  if (!types.length) return 0;
  let assigned = 0;
  for (const c of (S.cultists || [])) {
    if (bindingActive(c)) continue;        // 已分配跳过
    const p = threadProfession(c);
    let target = null;
    if (p && p.affinity && CONVERTERS[p.affinity] && !(S.converterOn && S.converterOn[p.affinity] === false)) {
      target = p.affinity;                 // 优先匹配职业
    } else {
      target = leastLoadedConverter(types); // 否则均衡负载
    }
    if (target) { bindThread(c, target); assigned++; }
  }
  return assigned;
}
function leastLoadedConverter(types) {
  let best = null, bestN = Infinity;
  for (const t of types) {
    const n = (S.cultists || []).filter(c => c.boundTo === t && bindingActive(c)).length;
    if (n < bestN) { bestN = n; best = t; }
  }
  return best;
}

// ---- 方向⑤：AI 与线程职业联动 —— 招募时按需求建议职业 ----
export function aiSuggestedProfession() {
  const types = CONVERTER_IDS.filter(t => !(S.converterOn && S.converterOn[t] === false));
  let best = 'prospector', bestN = Infinity;
  for (const t of types) {
    const n = (S.cultists || []).filter(c => c.boundTo === t && bindingActive(c)).length;
    if (n < bestN) { bestN = n; best = profByAffinity(t); }
  }
  return best;
}
function profByAffinity(t) {
  const p = Object.values(PROFESSION_BY_ID).find(p => p.affinity === t);
  return p ? p.id : 'prospector';
}
// 招募掷职业：70% 采纳建议（与需求联动），12% 懒惰负面，其余均匀正常职业
export function rollProfession(suggested) {
  if (suggested && Math.random() < B().autoAssignShare) return suggested;
  if (Math.random() < B().lazySpawnChance) return LAZY_PROFESSION_ID;
  const pool = Object.values(PROFESSION_BY_ID).filter(p => p.id !== LAZY_PROFESSION_ID && p.id !== LEADER_PROFESSION_ID);
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// ---- 每帧推进：累积 XP → 刷新等级（返回升过级的线程名列表，供 main.js 弹提示）----
export function tickThreads(dt) {
  const leveled = [];
  for (const c of (S.cultists || [])) {
    const g = threadXpGainPerSec(c);
    if (g <= 0) continue;
    c.xp = (c.xp || 0) + g * dt;
    const newLv = threadLevelFromXp(c.xp);
    if (newLv > threadLevel(c)) { c.level = newLv; leveled.push(c.name); }
  }
  return leveled;
}
