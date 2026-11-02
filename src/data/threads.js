// 线程（干员）数据
export const THREAD_TYPES = [
  { id: 't1', name: '信使', baseCost: 15, output: 2, mood: '正常' },
  { id: 't2', name: '执行者', baseCost: 100, output: 8, mood: '高效' },
  { id: 't3', name: '架构师', baseCost: 800, output: 35, mood: '优化' },
  { id: 't4', name: '深渊触须', baseCost: 5000, output: 150, mood: '超频' },
];

export const MOOD_MULT = {
  '超频': 3, '优化': 2, '高效': 1.5, '正常': 1, '阻塞': 0.7, '死锁': 0.4
};

export function threadCost(count) {
  return Math.floor(15 * Math.pow(1.5, count));
}

// ========== v3.3.0 线程绑定系统：职业（天赋）与转化器 ==========
// 职业（天赋）：招募时随机分配；affinity 为擅长转化的转化器类型。
// 匹配岗位绑定 → 无 EP/消耗惩罚且转化加成更高；不匹配 → 产出↓消耗↑；懒惰 → 更差。
// affinity === 'command' 表示领导材料（统御官），不绑定生产，可晋升为领导者。
export const PROFESSIONS = [
  { id: 'prospector', name: '勘探员', icon: '🔭', affinity: 'vehicles', desc: '擅长探采平台（载具 DM 采集）' },
  { id: 'distiller',  name: '蒸馏师', icon: '⚗️', affinity: 'atrium',   desc: '擅长灵感工坊（RP 蒸馏）' },
  { id: 'overseer',  name: '统御官', icon: '🎖️', affinity: 'command',  desc: '领导材料：可晋升领导者，提供全局加成' },
  { id: 'slacker',   name: '懒散者', icon: '😪', affinity: null, trait: 'lazy', desc: '天生怠惰：绑定惩罚更重、加成更弱（出现概率低）' },
];
export const PROFESSION_BY_ID = Object.fromEntries(PROFESSIONS.map(p => [p.id, p]));
export const LEADER_PROFESSION_ID = 'overseer';
export const LAZY_PROFESSION_ID = 'slacker';

// 可绑定线程的「EP 转化类」生产建筑（dirty 1 的「所有的 ep 转化都需要绑定线程」）。
// 本版实装探采平台(vehicles) 与 灵感工坊(atrium)，其余经同一 converterThreadBoost 钩子扩展。
export const CONVERTERS = {
  vehicles: { id: 'vehicles', name: '探采平台', res: 'DM' },
  atrium:   { id: 'atrium',   name: '灵感工坊', res: 'RP' },
};
export const CONVERTER_IDS = Object.keys(CONVERTERS);
