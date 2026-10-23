// v2.1 建筑驱动转向：科技 = 解锁钥匙（52 项乘数科技的效果已全部迁移至建筑体系，见 balance.js buildingsV21）
// 本列表仅保留 6 把钥匙科技；旧档 S.tech 中的已研究科技 ID 保留为只读标记，不参与任何乘数计算
export const TECHS = [
  // v2.6.3 反馈①：click_up / click10 / mega_click / grand_click / crit_click / cps_crit / crit2 七把点击暴击钥匙随 B 分区一并移除
  {id:'offline1',col:1,cost:8,name:'远程协作',desc:'钥匙：解锁「断线信号塔」族与「延时缓存站」（离线效率建筑），自带离线效率 80% 基线',req:[],unlocks:{buildings:['beacon_1','beacon_2','delay_cache']}},
  // v2.5.3：req 由 ['click_up'] 改为 []（价格自成门槛，同 chaos_born 先例）——
  // 此前 RP 已解锁（≥8 RP）但未研究「点击强化」时专注优化灰置，玩家「10 RP 不能升级」困惑
  {id:'focus_opt',col:1,cost:8,name:'专注优化',desc:'钥匙：解锁「专注心核」（专注成本 -25%）',req:[],unlocks:{buildings:['focus_core']}},
  {id:'entropy_reduce',col:3,cost:75,name:'熵减协议',desc:'钥匙：解锁「净化节点」族（矩阵腐化对策）',req:[],unlocks:{buildings:[],purifiers:true}},
  {id:'deep_space',col:4,cost:180,name:'深空探测',desc:'钥匙：解锁第二路星际探索',req:[],unlocks:{buildings:[],system:'expedition2'}},
  {id:'ai_core',col:4,cost:50,name:'AI 管理核心',desc:'钥匙：解锁 AI 助手（自动升级/招募/领取）',req:[],unlocks:{buildings:[],system:'ai'}},
];
