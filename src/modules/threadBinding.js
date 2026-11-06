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
// v3.7.1 反馈①：领导者只提供全局加成（leaderGlobalMult），不占用任何岗位。
// 这是「能否占岗位」的唯一判定源——绑定 / 智能分配 / 晋升 / 班组 UI 四处共用，
// 避免又出现同一玩法两套口径（项目历史上的同名双实现陷阱）。
export function canBind(c) { return !isLeader(c); }
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

// ---- v3.6.5 反馈①~③：岗位容量 = 对应设施数量 ----
// 智能分配 / 新线程自动安置都不会让某岗位的线程数超过该值；手动下拉仍可自由调整。
//   vehicles：探采平台所有载具升级数量之和（scooter/convoy/orbital/submersible）
//   atrium  ：灵感工坊数量（升级级数）
//   hatch   ：异兽孵化工坊数量（孵化升级级数，未解锁时为 0）
//   temple  ：信仰圣所数量（建造等级）
//   hyper   ：无上限（满员后的兜底岗位）
export function converterCapacity(type, S0 = S) {
  if (type === HYPER_CONVERTER_ID) return Infinity;
  const up = (S0 && S0.upgrades) || {};
  switch (type) {
    case 'vehicles': return (BALANCE.vehicles.ids || []).reduce((a, id) => a + (up[id] || 0), 0);
    case 'atrium':   return up.atrium || 0;
    case 'hatch':    return S0.ptAutoHatch === true ? (S0.ptHatchLv || 1) : 0;
    case 'temple':   return (S0.religion && S0.religion.temple) || 0;
    default: return 0;
  }
}

// 某岗位当前在岗线程数（含手动超额绑定，用于面板展示）
export function converterLoad(type) {
  return (S.cultists || []).filter(c => c.boundTo === type).length;
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
  // v3.7.1：领导者恒不在岗，此分支仅为旧档残留绑定的兼容兜底（正常路径不可达）
  if (isLeader(c)) return true;
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
    // v3.7.1：领导者恒不在岗，此加成仅为旧档残留绑定的兼容兜底（正常路径不可达）
    const lead = isLeader(c) ? B().leaderBonus : 0;
    mult *= (1 + lvlBonus + profBonus + lead);
  }
  return mult;
}

// ---- 绑定 / 解绑 / 晋升 ----
export function bindThread(c, type) {
  // v3.7.1 反馈①：领导者是全局加成位，任何岗位都不收；顺手纠正旧档残留绑定
  if (!canBind(c)) { c.boundTo = null; return false; }
  if (!CONVERTERS[type]) return false;
  c.boundTo = type;
  c.assignSince = Date.now();
  return true;
}
export function unbindThread(c) { c.boundTo = null; }

// v3.7.2 反馈②：一键收回全部线程岗位 → 空闲（消耗恢复）。
// 与 autoAssignThreads 同属「岗位编排」单一真源；领导者恒不占岗位，本就空闲，不受影响。
export function releaseAllThreads() {
  let changed = 0;
  for (const c of (S.cultists || [])) {
    if (!c.boundTo) continue;
    c.boundTo = null;
    c.assignSince = null;
    changed++;
  }
  return changed;
}

// ---- 方向③：智能分配（容量感知 · v3.7.2 重写）----
// 规则：
//   0) 领导者是全局加成位，恒不占岗位（v3.7.1 反馈①）；全量重排顺带纠正旧档残留
//   1) 每个资源岗位容量 = 对应设施数量（converterCapacity），分配结果不会超容量
//   2) 全量重排：所有可绑定线程（含原本手动设定的超线程）统一进入重排池，
//      先按容量把资源岗位填满，实在放不下的才转入超线程（v3.7.2 反馈④）
//      ——废弃 v3.6.5「手动超线程保留」：该语义会让资源岗位空着、线程却滞留超线程
//   3) 阶段 A1：擅长职业先归位（每模块至多 1 条匹配者），避免被「补空缺」抢走
//   4) 阶段 A2：保证每个已开启模块至少 1 条
//   5) 阶段 B：按剩余槽位均衡填满（擅长岗位优先，其次剩余槽位最多的岗位）
//   6) 阶段 C：仅「资源岗位分配完」之后的剩余线程转入超线程；覆盖「模块满员 /
//      未解锁 / 开关全关 / 容量为 0」四种情况，超线程恒解锁、无容量上限（v3.7.1 反馈②）
//   7) 「优先空闲」：先安排空闲（未绑定）线程，再重排已在岗/超线程线程以纠正错位
//   only：传入单条线程时做「增量安置」（招募新线程用），其余线程一律视为固定不动；
//         其余线程在超线程不占资源岗位坑，新线程仍优先补资源岗位空缺。
export function autoAssignThreads(only = null) {
  const cultists = (S.cultists || []);
  const before = new Map(cultists.map(c => [c, c.boundTo || null]));
  // 资源岗位：已解锁 + 开关开启 + 容量 > 0；超线程恒解锁，作为阶段 C 的统一兜底
  const types = RESOURCE_CONVERTER_IDS.filter(t =>
    converterUnlocked(t) && converterEnabled(t) && converterCapacity(t) > 0);
  const movable = only ? [only] : cultists;
  const movableSet = new Set(movable);

  // v3.7.1 反馈①：全局加成位不占岗位——任何一次分配都把旧档残留的领导绑定清空。
  for (const c of cultists) {
    if (isLeader(c) && c.boundTo) c.boundTo = null;
  }

  const cap = {}, load = {};
  for (const t of types) { cap[t] = converterCapacity(t); load[t] = 0; }
  // 统一重排池：原本在超线程的线程也先释放，与其它线程一起竞争资源岗位
  const pool = [];
  for (const c of cultists) {
    if (isLeader(c)) continue;           // 恒跳过：不参与重排、不占容量、不进超线程
    const b = c.boundTo;
    if (!movableSet.has(c)) {
      if (b && types.includes(b)) load[b] += 1; // 增量安置时：其余线程固定占坑
      continue;
    }
    const wasBound = !!b;
    c.boundTo = null; // 含未解锁/已关闭的旧岗位与超线程：一律释放后重排
    pool.push({ c, wasBound });
  }
  // 「优先空闲」：未绑定线程先落位，已在岗线程随后重排（纠正错位）
  pool.sort((a, b) => (a.wasBound ? 1 : 0) - (b.wasBound ? 1 : 0));
  const idle = pool.map(x => x.c);
  const place = (c, t) => { c.boundTo = t; c.assignSince = Date.now(); load[t] += 1; };

  // 阶段 A1：擅长职业先归位（每模块至多 1 条匹配者）
  for (const t of types) {
    if (load[t] >= cap[t]) continue;
    const i = idle.findIndex(c => affinityMatches(c, t));
    if (i < 0) continue;
    place(idle.splice(i, 1)[0], t);
  }
  // 阶段 A2：优先保证每个模块都有人
  for (const t of types) {
    if (load[t] > 0 || load[t] >= cap[t] || !idle.length) continue;
    const i = idle.findIndex(c => affinityMatches(c, t));
    place(idle.splice(i < 0 ? 0 : i, 1)[0], t);
  }
  // 阶段 B：剩余线程填满槽位（擅长岗位优先，其次剩余槽位最多的岗位）
  for (const c of idle.slice()) {
    const aff = threadProfession(c) && threadProfession(c).affinity;
    let t = (aff && types.includes(aff) && load[aff] < cap[aff]) ? aff : null;
    if (!t) {
      for (const x of types) {
        if (load[x] >= cap[x]) continue;
        if (!t || (cap[x] - load[x]) > (cap[t] - load[t])) t = x;
      }
    }
    if (!t) break;
    idle.splice(idle.indexOf(c), 1);
    place(c, t);
  }
  // 阶段 C：资源岗位分配完，剩下的才进超线程
  for (const c of idle) { c.boundTo = HYPER_CONVERTER_ID; c.assignSince = Date.now(); }
  let changed = 0;
  for (const c of cultists) if ((c.boundTo || null) !== before.get(c)) changed++;
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
  // v3.6.5 ⑤：按「剩余空位」而非「在岗人数」排序——满载模块不再建议，新线程优先补空缺岗位
  const types = RESOURCE_CONVERTER_IDS.filter(t => converterUnlocked(t) && converterEnabled(t));
  let best = 'prospector', bestSlack = -Infinity;
  for (const t of types) {
    const cap = converterCapacity(t);
    if (!(cap > 0)) continue;
    const n = (S.cultists || []).filter(c => c.boundTo === t && bindingActive(c)).length;
    const slack = cap - n;
    if (slack > bestSlack) { bestSlack = slack; best = profByAffinity(t); }
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
