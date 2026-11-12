// 永恒矩阵 14 个
export const ETERNALS = [
  {id:'eff',name:'永恒效能',desc:'每级全局 +5%',base:1,growth:1.6},
  {id:'cost',name:'永恒节俭',desc:'每级成本 -2%',base:1,growth:1.6},
  {id:'click',name:'永恒专注',desc:'每级点击 +10%',base:1,growth:1.6},
  {id:'off',name:'永恒离线',desc:'每级离线效率 +5%',base:1,growth:1.6},
  {id:'event',name:'永恒事件',desc:'每级事件频率 +5%',base:1,growth:1.6},
  {id:'proj',name:'永恒项目',desc:'每级项目奖励 +10%',base:1,growth:1.6},
  {id:'mile',name:'永恒里程碑',desc:'每级里程碑 RP +5%',base:1,growth:1.6},
  {id:'start',name:'永恒开局',desc:'每级开局 EP +50%',base:1,growth:1.6},
  // v3.12.12 反馈⑥：永恒矩阵重定位——主打「提升 AI 能力」与「前期过渡丝滑」两个方向
  {id:'ai',name:'永恒拟我',desc:'每级 AI 决策间隔 -8%（下限 40%）',base:2,growth:1.7},
  {id:'smooth',name:'永恒摇篮',desc:'每级开局额外 +12 RP（研究启动资金）',base:2,growth:1.6},
  {id:'crit',name:'永恒暴击',desc:'每级暴击率 +0.5%',base:1,growth:1.6},
  {id:'shard',name:'永恒碎片',desc:'每级晋升 ES +5%',base:1,growth:1.6},
  {id:'off2',name:'永恒离线II',desc:'每级离线上限 +4h',base:3,growth:1.8},
  {id:'pet',name:'永恒宠物',desc:'每级宠物效果 +8%',base:2,growth:1.7},
  {id:'fuse',name:'永恒融合',desc:'每级融合世代加成 +10%',base:5,growth:2},
  {id:'lucky',name:'永恒幸运',desc:'每级事件奖励 +5%',base:2,growth:1.7},
];

export function esCost(e, eternalLevels) {
  const lv = eternalLevels[e.id] || 0;
  return Math.ceil(e.base * Math.pow(e.growth, lv));
}
