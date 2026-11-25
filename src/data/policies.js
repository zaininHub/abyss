// v2.9.0：周期政策·按章节重排门槛与效果（政策解锁章 7 → 3 之后的第一次全线校准）
// 设计（见 docs/方案-章节模块绑定-v4.2.md §6.3）：
//   ① 每组自带 `chapter` 下限：章节决定「什么时候出现」，组内 unlock 只判「跨周期资产」——
//      章节与资产两条轴分开，避免再写出「职级 ≥8」这类在目标章节恒真的假门槛。
//   ② 不再用 prestige 做组门槛：晋升是高频计数器（分章推演实测第 3 章 prestige 已 8、
//      第 5 章 17），prestige ≥5/8/10 在任何章节都是白给。改用「上一章留下的动作/资产」
//      （完成任务数 / 封印裂隙 / 深空探测 / 相位共鸣 / 集市开张 / AI 助手），与章节 cond 同源。
//   ③ 效果键必须在该组开放的章节真能生效：深潜在第 11 章才解锁，所以第 11 章前的组一律不写
//      `delve`（旧 route/deepen/star/rift_law/orchestration/longnight/supply 的 delve 项
//       在解锁前 policyMult('delve') 恒 1——卡片写着 +25%，实际永远是 0）。
//   ④ 组数/项数不变（13 组 / 39 项），幅度仍 ±5~30% 且正负成对。
// 规则：每组单选，选 A 锁同组其余项；每轮（晋升/轮回）后清空重选；改选消耗跨周期资源 ×2^n；
//       立誓（岔路口买建筑）→ 本局政策幅度 +5%；中立 → 改选成本半价。
import { S } from '../state.js';
import { researchMult } from '../core/research.js'; // v3.7.0：律令演绎走标准研究读侧，不再内联第二份公式
import { accessCheck } from '../core/access.js'; // v2.3.0：政策可见性走访问层（章节 policy）
import { chapterAtLeast, chapterNumOf } from '../core/chapterGates.js'; // v2.9.0：组章节下限走门禁单一真源

// 章节节奏表（ch = 组下限；与 hint 文案同源，测试逐项校验）：
//   第 3 章 route / faith（政策刚到手的两个方向选择）
//   第 4 章 deepen / rift_law（路线定完看深化；裂隙封印是第 1 章就有的动作）
//   第 5 章 star / orchestration / resonance_law（星图后移一档后，深空科技 + 相位共鸣同时到位）
//   第 6 章 watch（任务量进入两位数阶段）
//   第 7 章 market / assistant_duty（集市开张章 + AI 助手已成型）
//   第 8 章 longnight（长线任务量阶段）
//   第 10 章 supply_law（补给随主线后期）
//   第 11 章 observe（唯一直用深潜产出的组，跟着深潜同章）
export const POLICY_GROUPS = [
  {
    id: 'route', name: '路线抉择', chapter: 3,
    unlock: (S) => (S.prestige || 0) >= 1, hint: '第 3 章起 · 需职级 ≥1',
    policies: [
      { id: 'order_route', name: '秩序指令', effect: { ep: 0.20, thread: 0.10 }, desc: '基础产出 +20%，线程产出 +10%' },
      { id: 'abyss_route', name: '深渊誓约', effect: { ember: 0.25, ep: -0.10 }, desc: '余烬产出 +25%，EP 产出 -10%' },
    ],
  },
  {
    id: 'faith', name: '信仰', chapter: 3,
    unlock: (S) => !!(S.religion && S.religion.unlocked), hint: '第 3 章起 · 需信仰已唤醒',
    policies: [
      { id: 'ascetic',   name: '苦行', effect: { faith: 0.30, ep: -0.15 }, desc: 'FP 产出 +30%，EP 产出 -15%' },
      { id: 'abundant',  name: '富足', effect: { ep: 0.20, faith: -0.15 }, desc: 'EP 产出 +20%，FP 产出 -15%' },
      // v2.9.0 修正：effect 原为 1.5（policyMult = 2.5 → +150%），与 desc/religions.js 注释的「×1.5」不符。
      { id: 'sacrifice', name: '牺牲', effect: { devotion: 0.5, global: -0.10 }, desc: '虔诚获取 +50%，全局 -10%' },
    ],
  },
  {
    // v4.2.X 反馈③：旧实现 unlock = !!groupPolicyId('route')——玩家一选定路线 A，
    //   下一帧整组「路线深化」连 B/C 两个候选立刻弹出，形成「选完 A 立马解锁 BC」的连锁。
    //   改为独立资产门槛（与 route 选择解耦）：完成 10 个任务才开放；
    //   组内两个深化项仍按已选路线方向限制（那是对 A 的延续，不是自动解锁 BC）。
    id: 'deepen', name: '路线深化', chapter: 4,
    unlock: (S) => (S.projectsDone || 0) >= 10, hint: '第 4 章起 · 需完成 10 个任务',
    policies: [
      { id: 'order_deep', name: '秩序深化', unlock: () => groupPolicyId('route') === 'order_route', lockText: '需先选定「秩序指令」', effect: { recruit: 0.30, collab: 0.20 }, desc: '线程招募 +30%，协作加成 +20%' },
      { id: 'abyss_deep', name: '深渊深化', unlock: () => groupPolicyId('route') === 'abyss_route', lockText: '需先选定「深渊誓约」', effect: { ember: 0.20, global: -0.06 }, desc: '余烬产出 +20%，全局产出 -6%' },
    ],
  },
  {
    id: 'rift_law', name: '裂隙律令', chapter: 4,
    unlock: (S) => (S.riftsSealed || 0) >= 1, hint: '第 4 章起 · 需封印至少 1 道裂隙',
    policies: [
      { id: 'rift_awe',    name: '余烬敬畏',   effect: { ember: 0.20, faith: 0.10 },   desc: '余烬产出 +20%，FP 产出 +10%' },
      { id: 'rift_devour', name: '深渊吞噬',   effect: { ember: 0.25, global: -0.08 }, desc: '余烬产出 +25%，全局产出 -8%' },
      { id: 'rift_seal',   name: '封印之誓',   effect: { global: 0.10, ep: -0.10 },     desc: '全局产出 +10%，EP 产出 -10%' },
    ],
  },
  // v3.6.0 方向④：新增两组周期政策（宗教/裂隙/星际联动），效果均落于已被消费的 policyMult 键
  {
    id: 'star', name: '星际律令', chapter: 5,
    unlock: (S) => !!(S.tech && S.tech.deep_space), hint: '第 5 章起 · 需科技「深空探测」',
    policies: [
      { id: 'star_trade',   name: '星际贸易', effect: { ep: 0.15, global: 0.05 },   desc: 'EP 产出 +15%，全局产出 +5%' },
      { id: 'star_pioneer', name: '星海拓荒', effect: { ember: 0.20, thread: 0.10 }, desc: '余烬产出 +20%，线程产出 +10%' },
      { id: 'star_unity',   name: '星联邦',   effect: { collab: 0.20, recruit: 0.15 }, desc: '协作加成 +20%，线程招募 +15%' },
    ],
  },
  // v3.8.0 政策扩充（7 组→8 组、19 项→23 项）：效果键全部落在既有 policyMult 消费点
  {
    id: 'orchestration', name: '编排律令', chapter: 5,
    unlock: (S) => (S.projectsDone || 0) >= 20, hint: '第 5 章起 · 需完成 20 个任务',
    policies: [
      { id: 'orch_output',   name: '产能律令', effect: { ep: 0.10, collab: -0.08 },  desc: 'EP 产出 +10%，协作加成 -8%' },
      { id: 'orch_research', name: '推演律令', effect: { ep: -0.06, collab: 0.18 },  desc: 'EP 产出 -6%，协作加成 +18%' },
      { id: 'orch_abyss',    name: '裂隙律令', effect: { ember: 0.18, faith: -0.08 }, desc: '余烬产出 +18%，FP 产出 -8%' },
      { id: 'orch_balance',  name: '均衡律令', effect: { thread: 0.10, recruit: 0.08 }, desc: '线程产出 +10%，线程招募 +8%' },
    ],
  },
  // v3.10.0 政策扩充（9→11 组、27→33 项）
  {
    id: 'resonance_law', name: '共鸣纪律', chapter: 5,
    unlock: (S) => !!(S.resonance && S.resonance.enabled), hint: '第 5 章起 · 需已开启相位共鸣',
    policies: [
      { id: 'reso_output',  name: '守相产出', effect: { ep: 0.16, faith: -0.08 },   desc: 'EP 产出 +16%，FP 产出 -8%' },
      { id: 'reso_research',name: '守相推演', effect: { collab: 0.20, ep: -0.06 },  desc: '协作加成 +20%，EP 产出 -6%' },
      { id: 'reso_balance', name: '守相均衡', effect: { global: 0.07, thread: 0.08 }, desc: '全局产出 +7%，线程产出 +8%' },
    ],
  },
  // v3.9.0 政策扩充（8→9 组、23→27 项）
  {
    id: 'watch', name: '值守纪律', chapter: 6,
    unlock: (S) => (S.projectsDone || 0) >= 30, hint: '第 6 章起 · 需完成 30 个任务',
    policies: [
      { id: 'watch_day',     name: '白班值守', effect: { ep: 0.14, faith: -0.08 },   desc: 'EP 产出 +14%，FP 产出 -8%' },
      { id: 'watch_night',   name: '夜班推演', effect: { collab: 0.22, ep: -0.06 },  desc: '协作加成 +22%，EP 产出 -6%' },
      { id: 'watch_rift',    name: '裂隙守夜', effect: { ember: 0.20, thread: -0.06 }, desc: '余烬产出 +20%，线程产出 -6%' },
      { id: 'watch_balance', name: '轮值均衡', effect: { global: 0.06, recruit: 0.12 }, desc: '全局产出 +6%，线程招募 +12%' },
    ],
  },
  // v3.0.0 扩展：第 4 组「集市」——与深渊集市模块联动（集市第 7 章开张，政策组随其后）
  {
    id: 'market', name: '集市', chapter: 7,
    unlock: (S) => !!(S.bazaar && S.bazaar.unlocked), hint: '第 7 章起 · 需深渊集市已开张',
    policies: [
      { id: 'tariff',   name: '关税同盟', effect: { bazaarRate: 0.15, ep: -0.10 },      desc: '集市汇率 +15%，EP 产出 -10%' },
      { id: 'freetrade',name: '自由贸易', effect: { bazaarStock: 2, bazaarRefresh: 0.50 }, desc: '集市库存 +2/位，刷新成本 +50%' },
      { id: 'monopoly', name: '垄断协议', effect: { bazaarRefresh: -0.40, bazaarGain: -0.20 }, desc: '刷新成本 -40%，成交所得 -20%' },
    ],
  },
  // v3.11.0 政策扩充（11→13 组、33→39 项）
  {
    id: 'assistant_duty', name: '助手勤务', chapter: 7,
    unlock: (S) => !!(S.ai && (S.ai.assistants || 0) > 0), hint: '第 7 章起 · 需至少拥有 1 名 AI 助手',
    policies: [
      { id: 'duty_output',  name: '代班产出', effect: { ep: 0.15, collab: 0.08 },    desc: 'EP 产出 +15%，协作加成 +8%' },
      { id: 'duty_recruit', name: '代班招募', effect: { recruit: 0.24, ep: -0.07 },  desc: '线程招募 +24%，EP 产出 -7%' },
      { id: 'duty_global',  name: '代班统筹', effect: { global: 0.08, thread: -0.06 }, desc: '全局产出 +8%，线程产出 -6%' },
    ],
  },
  {
    id: 'longnight', name: '长夜纪律', chapter: 8,
    unlock: (S) => (S.projectsDone || 0) >= 50, hint: '第 8 章起 · 需完成 50 个任务',
    policies: [
      { id: 'night_ember', name: '余烬长夜', effect: { ember: 0.24, faith: -0.08 }, desc: '余烬产出 +24%，FP 产出 -8%' },
      { id: 'night_thread',name: '线程长夜', effect: { thread: 0.16, recruit: 0.10 }, desc: '线程产出 +16%，线程招募 +10%' },
      { id: 'night_quiet', name: '静默长夜', effect: { devotion: 0.6, global: -0.06 }, desc: '虔诚获取 +60%，全局产出 -6%' },
    ],
  },
  {
    id: 'supply_law', name: '补给纪律', chapter: 10,
    unlock: (S) => (S.projectsDone || 0) >= 80, hint: '第 10 章起 · 需完成 80 个任务',
    policies: [
      { id: 'supply_ember',  name: '余烬补给', effect: { ember: 0.22, collab: -0.07 }, desc: '余烬产出 +22%，协作加成 -7%' },
      { id: 'supply_thread', name: '线程补给', effect: { thread: 0.15, recruit: 0.10 }, desc: '线程产出 +15%，线程招募 +10%' },
      { id: 'supply_quiet',  name: '静默补给', effect: { collab: 0.20, ep: -0.06 },     desc: '协作加成 +20%，EP 产出 -6%' },
    ],
  },
  // v3.7.0 政策扩充（6 组 → 7 组、16 项 → 19 项）：唯一直接吃深潜产出的组，
  //   跟着深潜门禁（第 11 章）同章开放，避免「深潜未开先给深潜加成」。
  {
    id: 'observe', name: '观测纪律', chapter: 11,
    unlock: (S) => !!(S.delve && S.delve.unlocked), hint: '第 11 章起 · 需深潜已解锁',
    policies: [
      { id: 'observe_strict', name: '严格观测', effect: { delve: 0.18, ep: -0.08 },  desc: '深潜产出 +18%，EP 产出 -8%' },
      { id: 'observe_open',   name: '开放采样', effect: { ep: 0.12, thread: 0.08 },  desc: 'EP 产出 +12%，线程产出 +8%' },
      { id: 'observe_quiet',  name: '静默归档', effect: { ember: 0.12, global: -0.05 }, desc: '余烬产出 +12%，全局产出 -5%' },
    ],
  },
];

// effect 键 → 玩家可读的资源名（UI 用来标注「本局未解锁、暂不生效」）
export const POLICY_KEY_LABEL = Object.freeze({
  ep: 'EP', global: '全局产出', thread: '线程产出', recruit: '线程招募', collab: '协作加成',
  faith: 'FP', devotion: '虔诚', ember: '余烬', delve: '深潜',
  bazaarRate: '集市汇率', bazaarStock: '集市库存', bazaarRefresh: '集市刷新', bazaarGain: '集市成交',
});

export function groupByName(gid) { return POLICY_GROUPS.find(x => x.id === gid); }
export function groupPolicyId(groupId) { // v2.8.30 ③：政策链化——S.policies[gid] = { id, lv }（兼容旧字符串存档）
  const v = (S.policies && S.policies[groupId]) || null;
  return typeof v === 'string' ? v : (v && v.id) || null;
}
export function policyLv(groupId) { // 链位置（1 起）
  const v = (S.policies && S.policies[groupId]) || null;
  return typeof v === 'string' ? 1 : (v && v.lv) || 0;
}
export function nextPolicyInGroup(groupId, pid) { // 组内链下一项（层层解锁下一级政策）
  const g = groupByName(groupId);
  if (!g) return null;
  const idx = g.policies.findIndex(p => p.id === pid);
  if (idx < 0 || idx >= g.policies.length - 1) return null;
  return g.policies[idx + 1];
}
export function selectedPolicy(groupId) {
  const g = groupByName(groupId);
  if (!g) return null;
  const pid = groupPolicyId(groupId);
  return g.policies.find(p => p.id === pid) || null;
}

// v4.2.0 反馈②：政策效果只对「已解锁资源」生效（与 wiki「未解锁资源」口径一致）。
//   旧实现里 route/delve 等组的 delve/ember/faith 加成会落到尚未解锁的资源上——
//   玩家还没开深潜就吃到「深潜 +25%」的死加成，既无实际产出又误导数值面板。
//   这里在读侧按资源锚点过滤：未解锁资源 key 恒返回 1（基础产出 ep/global/thread/recruit/collab 恒解锁）。
//   只读 S 字段（不 import modules，避免 data ← modules 反向依赖），与 economy/delve 的锚点判定同源。
// v2.9.0：本函数导出给 UI/测试——卡片据此标注「本局未解锁（暂不生效）」，不再让死加成静默挂着。
export function policyEffectLive(key, state = S) {
  switch (key) {
    case 'faith': case 'devotion':
      return !!(state.religion && state.religion.unlocked) || !!(state.resDiscovered && state.resDiscovered.faith) || (state.faith || 0) > 0;
    case 'delve':
      return !!(state.delve && state.delve.unlocked) || (state.vs || 0) > 0;
    case 'ember':
      // v4.2.X：旧实现读 state.ember——该字段从不在 defaultState 声明（真实字段是 riftEmber），
      //   OR 分支恒 false。改为读真源 riftEmber，与 economy/rift 模块同口径。
      return !!state._riftSeen || (state.riftsSealed || 0) > 0 || (state.riftEmber || 0) > 0;
    case 'bazaarRate': case 'bazaarStock': case 'bazaarRefresh': case 'bazaarGain':
      return !!(state.bazaar && state.bazaar.unlocked);
    default:
      return true; // ep/global/thread/recruit/collab/corruption/aiCap 等基础或机制键恒生效
  }
}

// 本局未解锁、当前不会生效的 effect 键（UI 标注用）
export function policyDeadKeys(policy, state = S) {
  return Object.keys((policy && policy.effect) || {}).filter(k => !policyEffectLive(k, state));
}

// 读侧乘区：policyMult(key) → 1 + Σ(已选政策 effect[key])；立誓时正向项整体 +5% 幅度
export function policyMult(key, state = S) {
  if (!policyEffectLive(key, state)) return 1;
  if (!state.policies) return 1;
  let sum = 0;
  for (const g of POLICY_GROUPS) {
    const v = (state.policies && state.policies[g.id]) || null;
    const pid = typeof v === 'string' ? v : (v && v.id) || null;
    if (!pid) continue;
    const p = g.policies.find(x => x.id === pid);
    if (p && p.effect[key] !== undefined) sum += p.effect[key];
  }
  let base = (1 + sum) * researchMult('policy'); // v3.6.0 律令演绎；v3.7.0 改走 core 标准读侧（数值不变）
  if (state.vowPolicyBoost && sum > 0) base += 0.05; // 立誓：本局政策幅度 +5%（仅正向）
  return base;
}

// 组是否开放：章节下限（组自带）AND 组资产门槛。
// 章节门统一走 chapterGates 单一真源；资产门槛 g.unlock 只读已持久化字段。
export function policyGroupAvailable(g, state = S) {
  if (!g) return false;
  if (!chapterAtLeast(g.chapter || 3, state)) return false;
  try { return !!g.unlock(state); } catch { return false; }
}

// 「AI 自动采纳每组最优政策」入口此前定义在此处，但全库无调用点，且内部调用了只存在于
// modules/policies.js 的 selectPolicy —— data 层反向依赖 modules 层，一旦触发即抛 ReferenceError。
// 该功能从未生效，故移除；如需启用，应在 modules/policies.js 内实现并显式接线，避免破坏分层。
// v2.9.0：政策门禁在第 3 章（CHAPTER_GATES.policy）——这里仍统一 AND accessCheck，
//   各组再用自带 chapter 排序（2.9.0 之前所有组都是第 7 章开门，门槛里塞 prestige 阶梯，
//   现在改为「章 + 资产」两条轴）。
export function policyOpenGroups() {
  if (!accessCheck('policy.open', S).ok) return [];
  return POLICY_GROUPS.filter(g => policyGroupAvailable(g, S));
}

// v2.9.0：空态/锁定提示的单一数据源——把「章节已到、资产未满足」与「还没到章节」分开，
//   面板不再硬编码「路线/信仰/集市」三条（那份文案在第 3 章开门后就过期了）。
export function policyLockedHint(state = S) {
  const chapter = chapterNumOf(state);
  const ready = [];   // 章节已到，差资产
  const next = [];    // 章节还没到
  let nextChapter = null;
  for (const g of POLICY_GROUPS) {
    if (!chapterAtLeast(g.chapter, state)) {
      next.push(g);
      if (nextChapter === null || g.chapter < nextChapter) nextChapter = g.chapter;
    } else if (!policyGroupAvailable(g, state)) {
      ready.push(g);
    }
  }
  return { chapter, ready, next, nextChapter };
}

// v4.2.0 反馈②：有「开放但尚未选定」的政策组 → tab 上挂感叹号提示；全部选定后消失。
export function hasPendingPolicy() {
  return policyOpenGroups().some(g => !groupPolicyId(g.id));
}

// 改选成本：基础 1 回响/虔诚 × 2^次数；中立（未立誓）半价（ceil 取整）
export function policyRerollCost(groupId) {
  const n = (S.policyRerolls && S.policyRerolls[groupId]) || 0;
  let cost = 1 * Math.pow(2, n);
  if (!S.vowPolicyBoost) cost = Math.ceil(cost * 0.5);
  return cost;
}
// v2.8.6 B2a：本轮政策走向记入历史（跨周期保留；晋升/轮回时调用）
export function recordPolicyRun() {
  // v3.7.0 bugfix：S.policies[gid] 自 v2.8.30 起是 { id, lv } 对象（groupPolicyId 已适配），
  //   此处却仍把整个对象当字符串 id 去比对 → picks 恒空 → 政策历史永远不增长、
  //   成就 policyruns3 与 wiki「历史周期走向」均不可达。
  const picks = Object.entries(S.policies || {}).map(([gid]) => {
    const g = groupByName(gid);
    const pid = groupPolicyId(gid);
    const p = g && pid && g.policies.find(x => x.id === pid);
    return p ? `${g.name}·${p.name}` : null;
  }).filter(Boolean);
  if (picks.length === 0) return;
  S.policyRuns = S.policyRuns || [];
  S.policyRuns.push({ storyline: S.storyline || 'default', picks, at: Date.now() });
}
export function payReroll(groupId) {
  const cost = policyRerollCost(groupId);
  if ((S.abyssEcho || 0) >= cost) { S.abyssEcho -= cost; return 'echo'; }
  if ((S.devotion || 0) >= cost) { S.devotion -= cost; return 'devotion'; }
  return null;
}
