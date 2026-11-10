// v2.8.6 B2a：周期政策系统（参考 KG Policies——组内互斥、前置/锁定、每轮重选、正负成对）
// 三组：秩序（职级≥1）/ 深渊（深潜≥1 层）/ 信仰（信仰解锁）
// 规则：每组三选一，选 A 锁 B/C；每轮（晋升/轮回）后清空重选；改选消耗跨周期资源 ×2^n；
//       立誓（岔路口买建筑）→ 本局政策幅度 +5%；中立 → 改选成本半价。
import { S } from '../state.js';
import { researchMult } from '../core/research.js'; // v3.7.0：律令演绎走标准研究读侧，不再内联第二份公式

export const POLICY_GROUPS = [
  {
    id: 'route', name: '路线抉择', unlock: (S) => (S.prestige || 0) >= 1, hint: '需职级 ≥1',
    policies: [
      { id: 'order_route', name: '秩序指令', effect: { ep: 0.20, thread: 0.10 }, desc: '基础产出 +20%，线程产出 +10%' },
      { id: 'abyss_route', name: '深渊誓约', effect: { delve: 0.25, ember: 0.15 }, desc: '深潜产出 +25%，余烬产出 +15%' },
    ],
  },
  {
    id: 'deepen', name: '路线深化', unlock: (S) => !!groupPolicyId('route'), hint: '需先选定路线',
    policies: [
      { id: 'order_deep', name: '秩序深化', unlock: () => groupPolicyId('route') === 'order_route', effect: { recruit: 0.30, collab: 0.20 }, desc: '线程招募 +30%，协作加成 ×1.2' },
      { id: 'abyss_deep', name: '深渊深化', unlock: () => groupPolicyId('route') === 'abyss_route', effect: { delve: 0.15, ember: 0.10 }, desc: '深潜产出 +15%，余烬产出 +10%' },
    ],
  },
  {
    id: 'faith', name: '信仰', unlock: (S) => !!(S.religion && S.religion.unlocked), hint: '需信仰已解锁',
    policies: [
      { id: 'ascetic',   name: '苦行',     effect: { faith: 0.30, ep: -0.15 },    desc: 'FP 产出 +30%，EP 产出 -15%' },
      { id: 'abundant',  name: '富足',     effect: { ep: 0.20, faith: -0.15 },    desc: 'EP 产出 +20%，FP -15%' },
      { id: 'sacrifice', name: '牺牲',     effect: { devotion: 1.5, global: -0.10 }, desc: '虔诚获取 ×1.5，全局 -10%' },
    ],
  },
  // v3.0.0 扩展：第 4 组「集市」——与深渊集市模块联动
  {
    id: 'market', name: '集市', unlock: (S) => !!(S.bazaar && S.bazaar.unlocked), hint: '需深渊集市已开张',
    policies: [
      { id: 'tariff',   name: '关税同盟', effect: { bazaarRate: 0.15, ep: -0.10 },      desc: '集市汇率 +15%，EP 产出 -10%' },
      { id: 'freetrade',name: '自由贸易', effect: { bazaarStock: 2, bazaarRefresh: 0.50 }, desc: '集市库存 +2/位，刷新成本 +50%' },
      { id: 'monopoly', name: '垄断协议', effect: { bazaarRefresh: -0.40, bazaarGain: -0.20 }, desc: '刷新成本 -40%，成交所得 -20%' },
    ],
  },
  // v3.6.0 方向④：新增两组周期政策（宗教/裂隙/星际联动），效果均落于已被消费的 policyMult 键
  {
    id: 'star', name: '星际律令', unlock: (S) => !!(S.tech && S.tech.deep_space), hint: '需科技「深空探测」',
    policies: [
      { id: 'star_trade',    name: '星际贸易',   effect: { ep: 0.15, global: 0.05 },              desc: 'EP 产出 +15%，全局 +5%' },
      { id: 'star_pioneer', name: '星海拓荒',   effect: { delve: 0.20, ember: 0.10 },             desc: '深潜产出 +20%，余烬产出 +10%' },
      { id: 'star_unity',   name: '星联邦',     effect: { collab: 0.20, recruit: 0.15 },          desc: '协作 +20%，招募 +15%' },
    ],
  },
  {
    id: 'rift_law', name: '裂隙律令', unlock: (S) => (S.riftsSealed || 0) >= 1, hint: '需封印至少 1 道裂隙',
    policies: [
      { id: 'rift_awe',    name: '余烬敬畏',   effect: { ember: 0.20, faith: 0.10 },             desc: '余烬产出 +20%，信仰 +10%' },
      { id: 'rift_devour', name: '深渊吞噬',   effect: { delve: 0.25, global: -0.08 },             desc: '深潜 +25%，全局 -8%' },
      { id: 'rift_seal',   name: '封印之誓',   effect: { global: 0.10, ep: -0.10 },                 desc: '全局 +10%，EP -10%' },
    ],
  },
  // v3.7.0 政策扩充（6 组 → 7 组、16 项 → 19 项）：效果键全部落在已有 policyMult 消费点上，
  // 不引入「选了但没效果」的死政策；解锁条件只依赖已持久化字段。
  {
    id: 'observe', name: '观测纪律', unlock: (S) => !!(S.delve && S.delve.unlocked) || (S.projectsDone || 0) >= 20,
    hint: '需深潜已解锁或完成 20 个任务',
    policies: [
      { id: 'observe_strict', name: '严格观测', effect: { delve: 0.18, ep: -0.08 },  desc: '深潜产出 +18%，EP 产出 -8%' },
      { id: 'observe_open',   name: '开放采样', effect: { ep: 0.12, thread: 0.08 },  desc: 'EP 产出 +12%，线程产出 +8%' },
      { id: 'observe_quiet',  name: '静默归档', effect: { ember: 0.12, global: -0.05 }, desc: '余烬产出 +12%，全局 -5%' },
    ],
  },
  // v3.8.0 政策扩充（7 组→8 组、19 项→23 项，+21%）：效果键全部落在既有 policyMult 消费点，
  // 不引入「选了但没效果」的死政策；解锁条件只依赖已持久化字段。
  {
    id: 'orchestration', name: '编排律令', unlock: (S) => (S.projectsDone || 0) >= 10 || (S.prestige || 0) >= 3,
    hint: '需完成 10 个任务或职级 ≥3',
    policies: [
      { id: 'orch_output',   name: '产能律令', effect: { ep: 0.10, delve: -0.08 },     desc: 'EP 产出 +10%，深潜产出 -8%' },
      { id: 'orch_research', name: '推演律令', effect: { ep: -0.06, collab: 0.18 },    desc: 'EP 产出 -6%，协作 +18%' },
      { id: 'orch_abyss',    name: '裂隙律令', effect: { ember: 0.18, faith: -0.08 },  desc: '余烬产出 +18%，信仰 -8%' },
      { id: 'orch_balance',  name: '均衡律令', effect: { thread: 0.10, recruit: 0.08 }, desc: '线程产出 +10%，招募 +8%' },
    ],
  },
  // v3.9.0 政策扩充（8→9 组、23→27 项，+12.5% / +17.4%）：
  // 效果键全部落在既有 policyMult 消费点，不引入「选了但没效果」的死政策。
  {
    id: 'watch', name: '值守纪律', unlock: (S) => (S.projectsDone || 0) >= 25 || (S.prestige || 0) >= 5,
    hint: '需完成 25 个任务或职级 ≥5',
    policies: [
      { id: 'watch_day',     name: '白班值守', effect: { ep: 0.14, faith: -0.08 },   desc: 'EP 产出 +14%，FP 产出 -8%' },
      { id: 'watch_night',   name: '夜班推演', effect: { collab: 0.22, ep: -0.06 },  desc: '协作 +22%，EP 产出 -6%' },
      { id: 'watch_rift',    name: '裂隙守夜', effect: { ember: 0.20, thread: -0.06 }, desc: '余烬产出 +20%，线程产出 -6%' },
      { id: 'watch_balance', name: '轮值均衡', effect: { global: 0.06, recruit: 0.12 }, desc: '全局 +6%，招募 +12%' },
    ],
  },
  // v3.10.0 政策扩充（9→11 组、27→33 项）：效果键全部落在既有 policyMult 消费点
  {
    id: 'resonance_law', name: '共鸣纪律', unlock: (S) => !!(S.resonance && S.resonance.enabled),
    hint: '需已开启相位共鸣',
    policies: [
      { id: 'reso_output',  name: '守相产出', effect: { ep: 0.16, faith: -0.08 },   desc: 'EP 产出 +16%，FP 产出 -8%' },
      { id: 'reso_research',name: '守相推演', effect: { collab: 0.20, ep: -0.06 },  desc: '协作 +20%，EP 产出 -6%' },
      { id: 'reso_balance', name: '守相均衡', effect: { global: 0.07, thread: 0.08 }, desc: '全局 +7%，线程产出 +8%' },
    ],
  },
  {
    id: 'longnight', name: '长夜纪律', unlock: (S) => (S.projectsDone || 0) >= 120 || (S.prestige || 0) >= 8,
    hint: '需完成 120 个任务或职级 ≥8',
    policies: [
      { id: 'night_ember', name: '余烬长夜', effect: { ember: 0.24, delve: -0.08 }, desc: '余烬产出 +24%，深潜产出 -8%' },
      { id: 'night_thread',name: '线程长夜', effect: { thread: 0.16, recruit: 0.10 }, desc: '线程产出 +16%，招募 +10%' },
      { id: 'night_quiet', name: '静默长夜', effect: { delve: 0.22, global: -0.06 }, desc: '深潜产出 +22%，全局 -6%' },
    ],
  },
  // v3.11.0 政策扩充（11→13 组、33→39 项，+18.18%）：效果键全部落在既有 policyMult 消费点，
  // 解锁条件只依赖已持久化字段（S.ai / projectsDone / prestige），不引入死政策。
  {
    id: 'assistant_duty', name: '助手勤务', unlock: (S) => !!(S.ai && (S.ai.assistants || 0) > 0),
    hint: '需至少拥有 1 名 AI 助手',
    policies: [
      { id: 'duty_output',  name: '代班产出', effect: { ep: 0.15, collab: 0.08 },    desc: 'EP 产出 +15%，协作 +8%' },
      { id: 'duty_recruit', name: '代班招募', effect: { recruit: 0.24, ep: -0.07 },  desc: '招募 +24%，EP 产出 -7%' },
      { id: 'duty_global',  name: '代班统筹', effect: { global: 0.08, thread: -0.06 }, desc: '全局 +8%，线程产出 -6%' },
    ],
  },
  {
    id: 'supply_law', name: '补给纪律', unlock: (S) => (S.projectsDone || 0) >= 180 || (S.prestige || 0) >= 10,
    hint: '需完成 180 个任务或职级 ≥10',
    policies: [
      { id: 'supply_ember',  name: '余烬补给', effect: { ember: 0.22, delve: -0.07 }, desc: '余烬产出 +22%，深潜产出 -7%' },
      { id: 'supply_thread', name: '线程补给', effect: { thread: 0.15, recruit: 0.10 }, desc: '线程产出 +15%，招募 +10%' },
      { id: 'supply_quiet',  name: '静默补给', effect: { collab: 0.20, ep: -0.06 },  desc: '协作 +20%，EP 产出 -6%' },
    ],
  },
];

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

// 读侧乘区：policyMult(key) → 1 + Σ(已选政策 effect[key])；立誓时正向项整体 +5% 幅度
export function policyMult(key) {
  if (!S.policies) return 1;
  let sum = 0;
  for (const g of POLICY_GROUPS) {
    const pid = groupPolicyId(g.id);
    if (!pid) continue;
    const p = g.policies.find(x => x.id === pid);
    if (p && p.effect[key] !== undefined) sum += p.effect[key];
  }
  let base = (1 + sum) * researchMult('policy'); // v3.6.0 律令演绎；v3.7.0 改走 core 标准读侧（数值不变）
  if (S.vowPolicyBoost && sum > 0) base += 0.05; // 立誓：本局政策幅度 +5%（仅正向）
  return base;
}

export function groupHasChoice(groupId) { return !!groupPolicyId(groupId); }

// v3.6.0 方向⑨：AI 助手自动采纳每组最优政策（仅当该组尚未选择时）
export function autoAdoptBestPolicy() {
  let acted = false;
  for (const g of policyOpenGroups()) {
    if (groupPolicyId(g.id)) continue;
    let best = null, bestSum = -Infinity;
    for (const p of g.policies) {
      const sum = Object.values(p.effect || {}).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      if (sum > bestSum) { bestSum = sum; best = p; }
    }
    if (best && selectPolicy(g.id, best.id).ok) acted = true;
  }
  return acted;
}
export function policyOpenGroups() {
  return POLICY_GROUPS.filter(g => { try { return !!g.unlock(S); } catch { return false; } });
}

// 改选成本：基础 1 回响/虔诚 × 2^次数；中立（未立誓）半价（ceil 取整）
export function policyRerollCost(groupId) {
  const n = (S.policyRerolls && S.policyRerolls[groupId]) || 0;
  let cost = 1 * Math.pow(2, n);
  if (!S.vowPolicyBoost) cost = Math.ceil(cost * 0.5);
  return cost;
}
export function canPayReroll(groupId) {
  const cost = policyRerollCost(groupId);
  return (S.abyssEcho || 0) >= cost || (S.devotion || 0) >= cost;
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
