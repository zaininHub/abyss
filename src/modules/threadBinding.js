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
import { PROFESSION_BY_ID, LEADER_PROFESSION_ID, LAZY_PROFESSION_ID, CONVERTER_IDS, RESOURCE_CONVERTER_IDS, CONVERTERS, HYPER_CONVERTER_ID } from '../data/threads.js';

const B = () => BALANCE.thread.binding;

export function threadProfession(c) { return c && c.profession ? PROFESSION_BY_ID[c.profession] : null; }
export function isLazyProfession(c) { return !!(c && c.profession === LAZY_PROFESSION_ID); }
export function isLeader(c) { return !!(c && c.leader); }
export function threadLevel(c) { return Math.max(1, Math.min(B().levelCap, c && c.level ? c.level : 1)); }

// ---- 绑定生效性（转化器开启且已分配）----
// v3.3.1 反馈④：转化器开关统一口径——班组「转化器开关」/「自动转化」快捷开关/研究点蒸馏开关
// 读写同一组状态（converterOn + atriumOn/_probeEnabled 镜像），避免两处开关互相打架
// v3.6.3 反馈③：「岗位解锁」唯一判定源——班组下拉/筛选按钮与快捷开关灰显共用此处，
//   避免同名双实现导致「班组看得到、开关却锁着」。口径与 v3.3.1 快捷开关一致。
//   超线程恒解锁（反馈②：未解锁其它模块时也能分配）。
export function converterUnlocked(type, S0 = S) {
  if (type === HYPER_CONVERTER_ID) return true;
  const up = (S0 && S0.upgrades) || {};
  switch (type) {
    case 'atrium':   return (up.atrium || 0) >= 1;
    case 'vehicles': return (BALANCE.vehicles.ids || []).reduce((a, id) => a + (up[id] || 0), 0) > 0;
    case 'hatch':    return S0.ptAutoHatch === true;
    case 'temple':   return ((S0.religion && S0.religion.temple) || 0) >= 1;
    default: return true;
  }
}

// 当前可展示 / 可分配的岗位（含恒解锁的超线程）
export function unlockedConverterIds() {
  return CONVERTER_IDS.filter(t => converterUnlocked(t));
}

export function converterEnabled(type) {
  if (type === HYPER_CONVERTER_ID) return true; // 超线程无开关，恒生效
  if (S.converterOn && S.converterOn[type] === false) return false;
  if (type === 'atrium') return S.atriumOn !== false;
  if (type === 'vehicles') return S._probeEnabled !== false;
  if (type === 'hatch') return S.ptDistillOn !== false; // v3.3.3 反馈⑦：孵化开关统一口径
  if (type === 'temple') return !(S.religion && S.religion.templeOff); // v3.3.3 反馈⑦：圣所开关统一口径
  return true;
}
export function setConverterEnabled(type, on) {
  S.converterOn = S.converterOn || {};
  S.converterOn[type] = !!on;
  if (type === 'atrium') S.atriumOn = !!on;
  if (type === 'vehicles') S._probeEnabled = !!on;
  if (type === 'hatch') S.ptDistillOn = !!on;
  if (type === 'temple') {
    S.religion = S.religion || {};
    S.religion.templeOff = !on;
    if (on) { S.religion._templeAutoPaused = false; S._templeEpShortSec = 0; }
  }
}
export function bindingActive(c) {
  if (!c || !c.boundTo) return false;
  return converterEnabled(c.boundTo);
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
  if (c.boundTo === HYPER_CONVERTER_ID) return B().hyperOutputMult; // v3.6.3 ②：超线程产出 +10%
  if (affinityMatches(c, c.boundTo)) return 1;          // 擅长岗位：不减少 EP
  if (isLazyProfession(c)) return B().lazyOutputFactor;
  return B().outputFactor;
}
// ---- 方向①：绑定对「线程消耗」的影响（×）----
export function threadBindSalaryFactor(c) {
  if (!bindingActive(c)) return 1;
  if (c.boundTo === HYPER_CONVERTER_ID) return B().hyperSalaryMult; // v3.6.3 ②：超线程消耗 +10%
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
  if (type === HYPER_CONVERTER_ID) return 1; // 超线程不产出转化资源，无转化加成
  if (!converterEnabled(type)) return 1;
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
// v3.3.5 反馈①：改为「每次点击做一次全局重排」——已绑定线程同样参与计算，
// 新开/关闭转化器或职业变动后再点一次即可收敛到当前最优；无变化时返回 0（不动任何线程）。
// 分配规则：
//   1) 职业与某个「已开启」转化器匹配 → 优先归位（匹配岗位零惩罚 + 更高加成，恒优于错配）
//   2) 其余线程（含领导/懒散/职业岗位未开启）→ 均衡填充，人少的岗位优先
//      （转化加成是乘区，多一人即多一乘区，均衡即最优）
//   3) 没有任何开启的转化器 → 全部释放绑定（消耗恢复）
export function autoAssignThreads() {
  // v3.6.3 ③：只分配「已解锁」的资源岗位；超线程是玩家手动兜底岗位，不参与自动重排。
  const types = RESOURCE_CONVERTER_IDS.filter(t => converterUnlocked(t) && converterEnabled(t));
  const cultists = (S.cultists || []);
  const hyperBound = cultists.filter(c => c.boundTo === HYPER_CONVERTER_ID);
  const movable = cultists.filter(c => c.boundTo !== HYPER_CONVERTER_ID);
  if (!types.length) {
    let released = 0;
    for (const c of movable) if (c.boundTo) { c.boundTo = null; released++; }
    return released; // 手动超线程保留，不被智能分配清空
  }
  const plan = new Map();
  for (const c of hyperBound) plan.set(c, HYPER_CONVERTER_ID);
  const rest = [];
  for (const c of movable) {
    const p = threadProfession(c);
    if (p && p.affinity && CONVERTERS[p.affinity] && types.includes(p.affinity)) plan.set(c, p.affinity);
    else rest.push(c);
  }
  const load = {};
  for (const t of types) load[t] = 0;
  for (const t of plan.values()) load[t] += 1;
  // 领导者优先落位（除全局加成外，还能再给该岗位 +8%）
  rest.sort((a, b) => (isLeader(b) ? 1 : 0) - (isLeader(a) ? 1 : 0));
  for (const c of rest) {
    let best = types[0];
    for (const t of types) if (load[t] < load[best]) best = t;
    plan.set(c, best);
    load[best] += 1;
  }
  let changed = 0;
  for (const c of cultists) {
    const target = plan.get(c) || null;
    if ((c.boundTo || null) === target) continue;
    if (target) { c.boundTo = target; c.assignSince = Date.now(); }
    else c.boundTo = null;
    changed++;
  }
  return changed;
}
export function leastLoadedConverter(types) {
  let best = null, bestN = Infinity;
  for (const t of types) {
    const n = (S.cultists || []).filter(c => c.boundTo === t && bindingActive(c)).length;
    if (n < bestN) { bestN = n; best = t; }
  }
  return best;
}

// ---- 方向⑤：AI 与线程职业联动 —— 招募时按需求建议职业 ----
export function aiSuggestedProfession() {
  // v3.6.3 ③：招募建议只按已解锁的资源岗位，避免建议一个玩家拿不到的职业
  const types = RESOURCE_CONVERTER_IDS.filter(t => converterUnlocked(t) && converterEnabled(t));
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
