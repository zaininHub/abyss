// 离线专属升级 4 个
// v2.7.5 ⑥：离线升级 = RP 主消耗 + EP 门槛（离线收益远低于在线，升级需 EP+RP 双投入，门槛随级递增）
export const OFF_UPGRADES = [
  {id:'off_eff1',name:'离线效率 I',desc:'离线效率 +20%',cost:10,rp:1,epCost:1e5},
  {id:'off_eff2',name:'离线效率 II',desc:'离线效率 +30%',cost:25,rp:1,req:'off_eff1',epCost:5e5},
  {id:'off_cap1',name:'离线上限 I',desc:'离线上限 +4h',cost:15,rp:1,epCost:2e5},
  {id:'off_proj',name:'离线项目',desc:'离线项目额外奖励',cost:30,rp:1,epCost:1e6},
];
