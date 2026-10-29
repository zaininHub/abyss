// v2.8.6 B2a：周期政策系统（参考 KG Policies——组内互斥、前置/锁定、每轮重选、正负成对）
// 三组：秩序（职级≥1）/ 深渊（深潜≥1 层）/ 信仰（信仰解锁）
// 规则：每组三选一，选 A 锁 B/C；每轮（晋升/轮回）后清空重选；改选消耗跨周期资源 ×2^n；
//       立誓（岔路口买建筑）→ 本局政策幅度 +5%；中立 → 改选成本半价。
import { S } from '../state.js';

export const POLICY_GROUPS = [
  {
    id: 'order', name: '秩序', unlock: (S) => (S.prestige || 0) >= 1, hint: '需职级 ≥1',
    policies: [
      { id: 'centralize', name: '集权指令', effect: { ep: 0.20, recruit: -0.20 }, desc: '基础产出 +20%，线程招募 -20%' },
      { id: 'autonomy',  name: '自治协议', effect: { thread: 0.15, aiCap: -1 },     desc: '线程产出 +15%，AI 自动购买上限 -1' },
      { id: 'collaborate', name: '协作网络', effect: { collab: 0.20, recruit: 0.30 }, desc: '协作加成 ×1.2，线程招募 +30%' },
    ],
  },
  {
    id: 'abyss', name: '深渊', unlock: (S) => (S.delve && S.delve.depth) >= 1, hint: '需深潜 ≥1 层',
    policies: [
      { id: 'observe',   name: '观测主义', effect: { delve: 0.25, corruption: 0.02 }, desc: '深潜产出 +25%，腐化 +0.02/s' },
      { id: 'nihilism',  name: '虚无主义', effect: { ember: 0.25, faith: -0.20 },     desc: '余烬产出 +25%，信仰 -20%' },
      { id: 'empiric',   name: '实证主义', effect: { faith: 0.20, delve: -0.10 },     desc: '信仰产出 +20%，深潜产出 -10%' },
    ],
  },
  {
    id: 'faith', name: '信仰', unlock: (S) => !!(S.religion && S.religion.unlocked), hint: '需信仰已解锁',
    policies: [
      { id: 'ascetic',   name: '苦行',     effect: { faith: 0.30, ep: -0.15 },    desc: '信仰产出 +30%，EP 产出 -15%' },
      { id: 'abundant',  name: '富足',     effect: { ep: 0.20, faith: -0.15 },    desc: 'EP 产出 +20%，信仰 -15%' },
      { id: 'sacrifice', name: '牺牲',     effect: { devotion: 1.5, global: -0.10 }, desc: '虔诚获取 ×1.5，全局 -10%' },
    ],
  },
  // v3.0.0 扩展：第 4 组「集市」——政策组 3 → 4（+33%），与深渊集市模块联动
  {
    id: 'market', name: '集市', unlock: (S) => !!(S.bazaar && S.bazaar.unlocked), hint: '需深渊集市已开张',
    policies: [
      { id: 'tariff',   name: '关税同盟', effect: { bazaarRate: 0.15, ep: -0.10 },      desc: '集市汇率 +15%，EP 产出 -10%' },
      { id: 'freetrade',name: '自由贸易', effect: { bazaarStock: 2, bazaarRefresh: 0.50 }, desc: '集市库存 +2/位，刷新成本 +50%' },
      { id: 'monopoly', name: '垄断协议', effect: { bazaarRefresh: -0.40, bazaarGain: -0.20 }, desc: '刷新成本 -40%，成交所得 -20%' },
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
  let base = 1 + sum;
  if (S.vowPolicyBoost && sum > 0) base += 0.05; // 立誓：本局政策幅度 +5%（仅正向）
  return base;
}

export function groupHasChoice(groupId) { return !!groupPolicyId(groupId); }
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
  const picks = Object.entries(S.policies || {}).map(([gid, pid]) => {
    const g = groupByName(gid);
    const p = g && g.policies.find(x => x.id === pid);
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
