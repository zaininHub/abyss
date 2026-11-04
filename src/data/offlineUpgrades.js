// 离线专属升级 4 个
// v2.7.5 ⑥：离线升级 = RP 主消耗 + EP 门槛（离线收益远低于在线，升级需 EP+RP 双投入，门槛随级递增）
export const OFF_UPGRADES = [
  {id:'off_eff1',name:'离线效率 I',desc:'离线效率 +20%',cost:10,rp:1,epCost:1e5},
  {id:'off_eff2',name:'离线效率 II',desc:'离线效率 +30%',cost:25,rp:1,req:'off_eff1',epCost:5e5},
  // v3.4.5 反馈③：效能建筑删除「存储与续航」组（原断线信号塔/延时缓存站）后，
  // 离线效率 100% 与离线 24h 上限改由离线升级承担（全程可达成，不再依赖建筑卡）
  {id:'off_eff3',name:'离线效率 III',desc:'离线效率 +20%（配合 I/II 达 110%）',cost:45,rp:1,req:'off_eff2',epCost:3e6},
  {id:'off_cap1',name:'离线上限 I',desc:'离线上限 +4h',cost:15,rp:1,epCost:2e5},
  {id:'off_cap2',name:'离线上限 II',desc:'离线上限 +12h（配合 I 达 24h）',cost:40,rp:1,req:'off_cap1',epCost:2e6},
  {id:'off_proj',name:'离线项目',desc:'离线项目额外奖励',cost:30,rp:1,epCost:1e6},
];
