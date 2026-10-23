// 资源定义（参考 Kittens Game 多层资源链）
// EP = 效能点（基础资源，线程产出）
// RP = 研究点（科技树消耗）
// ES = 永恒碎片（转生后获得）
// FA = 信仰（宗教系统）
// PT = 异兽饼干（异兽系统）
// DM = 深渊物质（后期稀有资源）

export const RESOURCES = {
  ep: { name: '效能点', icon: '⚡', desc: '基础资源，线程自动产出' },
  rp: { name: '研究点', icon: '🔬', desc: '用于科技树研究' },
  es: { name: '永恒碎片', icon: '💎', desc: '转生后获得，永久加成' },
  fa: { name: '信仰', icon: '🙏', desc: '深渊宗教产出' },
  pt: { name: '异兽饼干', icon: '🍪', desc: '购买异兽' },
  dm: { name: '深渊物质', icon: '🌀', desc: '最稀有资源，解锁深渊科技' },
};
