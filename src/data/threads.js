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
