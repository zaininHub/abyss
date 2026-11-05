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
  { id: 'keeper',     name: '饲育师', icon: '🥚', affinity: 'hatch',    desc: '擅长异兽孵化（PT 孵化）' }, // v3.3.3 反馈⑦：孵化接入线程绑定
  { id: 'acolyte',    name: '祭司',   icon: '🕯️', affinity: 'temple',   desc: '擅长信仰圣所（FP 生产）' }, // v3.3.3 反馈⑦：圣所接入线程绑定
  { id: 'overseer',  name: '统御官', icon: '🎖️', affinity: 'command',  desc: '领导材料：可晋升领导者，提供全局加成' },
  { id: 'slacker',   name: '懒散者', icon: '😪', affinity: null, trait: 'lazy', desc: '天生怠惰：绑定惩罚更重、加成更弱（出现概率低）' },
];
export const PROFESSION_BY_ID = Object.fromEntries(PROFESSIONS.map(p => [p.id, p]));
export const LEADER_PROFESSION_ID = 'overseer';
export const LAZY_PROFESSION_ID = 'slacker';

// 可绑定线程的岗位（dirty 1 的「所有的 ep 转化都需要绑定线程」）。
// v3.3.3 反馈⑦：实装全部四类转化岗位——探采平台(vehicles)/灵感工坊(atrium)/异兽孵化(hatch)/信仰圣所(temple)。
// v3.6.3 反馈②：新增「超线程」——不依赖任何模块解锁，未解锁其它岗位时也能分配；
//   该线程产出 +10%、消耗 +10%（不产出转化资源，故不参与 converterThreadBoost / 自动分配）。
export const HYPER_CONVERTER_ID = 'hyper';
export const CONVERTERS = {
  hyper:    { id: 'hyper',    name: '超线程',   res: null, icon: '⚙️', alwaysUnlocked: true, desc: '无需解锁：该线程产出 +10%、消耗 +10%' },
  vehicles: { id: 'vehicles', name: '探采平台', res: 'DM', icon: '🔭' },
  atrium:   { id: 'atrium',   name: '灵感工坊', res: 'RP', icon: '⚗️' },
  hatch:    { id: 'hatch',    name: '异兽孵化', res: 'PT', icon: '🥚' },
  temple:   { id: 'temple',   name: '信仰圣所', res: 'FP', icon: '🕯️' },
};
export const CONVERTER_IDS = Object.keys(CONVERTERS);
// 真正产出转化资源的岗位（超线程不在此列）
export const RESOURCE_CONVERTER_IDS = CONVERTER_IDS.filter(t => t !== HYPER_CONVERTER_ID);
