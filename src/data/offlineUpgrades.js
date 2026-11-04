// 离线专属升级
// v2.7.5 ⑥：离线升级 = RP 主消耗 + EP 门槛（离线收益远低于在线，升级需 EP+RP 双投入，门槛随级递增）
// v3.4.6 反馈⑧：离线上限硬封顶 10 小时（economy.offlineCap min(h,10)）——删除 off_cap2（+12h 已无意义），
//   旧档已购 off_cap2 保留字段兼容（上限同样被钳到 10h）；离线效率 III 维持不变
export const OFF_UPGRADES = [
  {id:'off_eff1',name:'离线效率 I',desc:'离线效率 +20%',cost:10,rp:1,epCost:1e5},
  {id:'off_eff2',name:'离线效率 II',desc:'离线效率 +30%',cost:25,rp:1,req:'off_eff1',epCost:5e5},
  {id:'off_eff3',name:'离线效率 III',desc:'离线效率 +20%（配合 I/II 达 110%）',cost:45,rp:1,req:'off_eff2',epCost:3e6},
  {id:'off_cap1',name:'离线上限 I',desc:'离线上限 +4h（上限 10h）',cost:15,rp:1,epCost:2e5},
  {id:'off_proj',name:'离线项目',desc:'离线项目额外奖励',cost:30,rp:1,epCost:1e6},
];
