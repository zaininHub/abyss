// 升级模块（v2.0：前期数值与资源建筑改由 balance.js 驱动；新增数据熔炉与净化节点）
import { BALANCE } from './balance.js';

const B = BALANCE;

export const UPGRADES = [
  // === 基础产出组（前期三档由 balance.js 配置） ===
  {id:'scribble',name:'草稿记录',base:B.scribble.base,cps:B.scribble.cps,desc:`基础产出+${B.scribble.cps}/s`},
  {id:'script',name:'自动化脚本',base:B.script.base,cps:B.script.cps,desc:`基础产出+${B.script.cps}/s`},
  {id:'parallel',name:'并行任务',base:B.parallel.base,cps:B.parallel.cps,desc:`基础产出+${B.parallel.cps}/s`},
  // v2.1 R3-A：早期 EP 存储扩容项（破解「上限 1000 死锁」的关键道具）
  // v2.0.2 存储节点：20 级封顶级制（用户硬约束「建筑数量受控」）——
  // 重复购买即升级：第 i 级增量 +2000×1.12^(i-1)，满 20 级购买入口锁定
  {id:'storage',name:'存储节点',base:B.storage.base,growth:B.storage.growth,cps:0,desc:'EP 存储上限递增（逐级 ×1.18）'},
  // v2.8.27 ②：全资源存储上限建筑（EP 购买，主商店「存储与资源建筑」统一入口）
  {id:'rp_vault',name:'矩阵存储库',cat:'D',unlimited:true,base:1.5e5,growth:1.5,cps:0,fx:{key:'rpCapAdd',value:400},desc:'每级 RP 上限 +400'},
  {id:'dm_vault',name:'星尘金库',cat:'D',unlimited:true,base:6e5,growth:1.5,cps:0,fx:{key:'dmCapAdd',value:100},desc:'EP 购买 · 每级 DM 上限 +100'},
  {id:'pt_vault',name:'饵料仓库',cat:'D',unlimited:true,base:3e5,growth:1.5,cps:0,fx:{key:'ptCapAdd',value:200},desc:'EP 购买 · 每级 PT 上限 +200'},
  {id:'intern',name:'实习生',base:600000.0,cps:20,growth:1.55,desc:'基础产出+20/s'}, // v2.8.3：base×4/cps 降
  {id:'team',name:'小组协作',base:6000000.0,cps:110,growth:1.55,desc:'基础产出+110/s'}, // v2.8.3：base×4/cps 降
  {id:'ai',name:'AI 助手',base:60000000.0,cps:600,growth:1.55,desc:'基础产出+600/s'}, // v2.8.3：base×4/cps 降
  {id:'cloud',name:'云集群',base:900000000.0,cps:3250,growth:1.55,desc:'基础产出+3.25K/s'}, // v2.8.3：base×4/cps 降
  {id:'global',name:'全球网络',base:3900000000.0,cps:18500,growth:1.55,desc:'基础产出+18.5K/s'}, // v2.8.3：base×4/cps 降
  {id:'quantum',name:'量子计算',base:60000000000.0,cps:105000,growth:1.55,desc:'基础产出+105K/s'}, // v2.8.3
  {id:'singularity',name:'奇点工程',base:960000000000.0,cps:630000,growth:1.55,desc:'基础产出+630K/s'}, // v2.8.3
  {id:'dyson',name:'戴森球',base:18000000000000.0,cps:4.2e+06,growth:1.55,desc:'基础产出+4.2M/s'}, // v2.8.3
  {id:'multiverse',name:'多重宇宙',base:360000000000000.0,cps:3.35e+07,growth:1.55,desc:'基础产出+33.5M/s'}, // v2.8.3
  {id:'galactic',name:'银河联邦',base:3600000000000000.0,cps:2.1e+08,growth:1.55,desc:'基础产出+210M/s'}, // v2.8.3
  {id:'supercluster',name:'超星系团',base:3.6e+16,cps:1.25e+09,growth:1.55,desc:'基础产出+1.25B/s'}, // v2.8.3
  {id:'cosmicweb',name:'宇宙网',base:3.6e+17,cps:8.5e+09,growth:1.55,desc:'基础产出+8.5B/s'}, // v2.8.3
  {id:'darkmatter',name:'暗物质网络',base:3.6e+18,cps:6.3e+10,growth:1.55,desc:'基础产出+63B/s'}, // v2.8.3
  {id:'vacuum',name:'真空能',base:3.6e+19,cps:4.2e+11,growth:1.55,desc:'基础产出+420B/s'}, // v2.8.3
  {id:'brane',name:'膜宇宙',base:3.6e+20,cps:2.95e+12,growth:1.55,desc:'基础产出+2.95T/s'}, // v2.8.3
  {id:'string',name:'弦织机',base:3.6e+21,cps:2.1e+13,growth:1.55,desc:'基础产出+21T/s'}, // v2.8.3
  {id:'holographic',name:'全息投影',base:3.6e+22,cps:1.25e+14,growth:1.55,desc:'基础产出+250T/s'}, // v2.8.3
  {id:'observer',name:'观察者效应',base:3.6e+23,cps:8.5e+14,growth:1.55,desc:'基础产出+1.7Qa/s'}, // v2.8.3
  {id:'simulation',name:'模拟舱',base:3.6000000000000004e+24,cps:6.3e+15,growth:1.55,desc:'基础产出+12.6Qa/s'}, // v2.8.3
  {id:'creator',name:'造物主',base:3.5999999999999997e+25,cps:4.2e+16,growth:1.55,desc:'基础产出+84Qa/s'}, // v2.8.3
  {id:'recursion',name:'递归',base:3.6e+26,cps:2.95e+17,growth:1.55,desc:'基础产出+590Qa/s'}, // v2.8.3
  {id:'paradox',name:'自指悖论',base:3.6e+27,cps:2.1e+18,growth:1.55,desc:'基础产出+4.2Qi/s'}, // v2.8.3
  {id:'final',name:'终极奇点',base:3.6e+28,cps:1.25e+19,growth:1.55,desc:'基础产出+25Qi/s'}, // v2.8.3
  {id:'omega',name:'欧米茄点',base:3.6000000000000005e+29,cps:8.5e+19,growth:1.55,desc:'基础产出+170Qi/s'}, // v2.8.3
  {id:'zero',name:'无',base:3.6e+30,cps:6.3e+20,growth:1.55,desc:'基础产出+1.26Sx/s'}, // v2.8.3
  {id:'origin',name:'起源',base:3.5999999999999995e+31,cps:4.2e+21,growth:1.55,desc:'基础产出+8.4Sx/s'}, // v2.8.3
  {id:'essence',name:'本质',base:3.6e+32,cps:2.95e+22,growth:1.55,desc:'基础产出+59Sx/s'}, // v2.8.3
  {id:'one',name:'太一',base:3.6e+33,cps:2.1e+23,growth:1.55,desc:'基础产出+420Sx/s'}, // v2.8.3
  {id:'tao',name:'道',base:3.6e+34,cps:1.25e+24,growth:1.55,desc:'基础产出+2.5Sp/s'}, // v2.8.3
  {id:'void',name:'虚空',base:3.6e+35,cps:8.5e+24,growth:1.55,desc:'基础产出+17Sp/s'}, // v2.8.3
  {id:'dream',name:'大梦',base:3.6e+36,cps:6.3e+25,growth:1.55,desc:'基础产出+126Sp/s'}, // v2.8.3
  {id:'thought',name:'一念',base:3.6e+37,cps:4.2e+26,growth:1.55,desc:'基础产出+840Sx/s'}, // v2.8.3
  {id:'unknown',name:'不可名状',base:3.6000000000000004e+38,cps:2.95e+27,growth:1.55,desc:'基础产出+5.9Oc/s'}, // v2.8.3
  {id:'god',name:'神之领域',base:3.6000000000000004e+39,cps:2.1e+28,growth:1.55,desc:'基础产出+42Oc/s'}, // v2.8.3
  {id:'universe',name:'宇宙之心',base:3.6e+40,cps:1.7e+29,growth:1.55,desc:'基础产出+340Oc/s'}, // v2.8.3
  {id:'creation',name:'创世',base:3.6e+41,cps:1.25e+30,growth:1.55,desc:'基础产出+2.5No/s'}, // v2.8.3
  {id:'infinity',name:'无限',base:3.6e+42,cps:8.5e+30,growth:1.55,desc:'基础产出+17No/s'}, // v2.8.3
  {id:'absolute',name:'绝对',base:3.6000000000000006e+43,cps:6.3e+31,growth:1.55,desc:'基础产出+126No/s'}, // v2.8.3
  {id:'beyond',name:'超越',base:3.6e+44,cps:4.2e+32,growth:1.55,desc:'基础产出+840No/s'}, // v2.8.3
  // 资源型模块（v2.0：灵感工坊/神谕所/数据熔炉由 balance.js 配置）
  {id:'atrium',name:'灵感工坊',base:B.atrium.base,growth:2.2,cps:0,desc:`自动蒸馏：每秒消耗 ${B.atrium.epRate} EP 转化 ${B.atrium.rate} RP，升级在蒸馏开关处`}, // v3.0.3 第四批③：升级入口移至开关处
  {id:'shrine',name:'路边神龛',base:300000000.0,cps:0.0,desc:'解锁信仰系统（信仰由此获得）'}, // v3.0.3 第三批④：移除直接资源产出
  {id:'dataforge',name:B.dataForge.name,base:B.dataForge.base,cps:B.dataForge.cps,desc:'研究点已改由灵感蒸馏塔与任务获取'}, // v3.0.3 第四批④：移除直产 RP
  {id:'garden',name:'伊甸花园',base:30000000000.0,cps:0.0,produces:{type:'pt',rate:0.15},desc:'每秒 +0.15 PT'}, // v3.4.0 反馈③：0.5→0.15 PT/s（PT 供给过快，孵化即满仓）
  {id:'oracle',name:'神谕所',base:B.oracle.base,cps:0,produces:{type:'rp',rate:B.oracle.rate},desc:`每秒 +${B.oracle.rate} RP`},
  {id:'temple',name:'万神殿',base:300000000000000.0,cps:0.0,produces:{type:'fa_chance',rate:0.005},desc:'每秒 0.5% 概率 +1 信仰'},
  // 线程强化（v2.0：补贴比例由 balance.js 配置）
  // v2.8.23 ①：base 阶梯重排（门槛 base×0.3 拉开 5~10× 间隔——此前 cpu/mem/gpu/cache 门槛 3e5~1.5e7 挤在同一段，EP 一到同时解锁一串；价格整体上调，杜绝「几万 EP 买 +50% 无限叠」）
  {id:'subsist1',name:'能量合剂',base:300000000.0,cps:0.0,maxLevel:1,cat:'thread',desc:`线程消耗 -${Math.round(B.subsist1*100)}%`}, // v2.8.23：门槛 3e7
  {id:'subsist2',name:'循环供氧',base:30000000000.0,cps:0.0,maxLevel:1,cat:'thread',desc:`线程消耗 -${Math.round(B.subsist2*100)}%`}, // v2.8.23：门槛 3e9
  {id:'subsist3',name:'生物打印餐',base:1500000000000.0,cps:0.0,maxLevel:1,cat:'thread',desc:'线程消耗 -50%'}, // v2.8.23：门槛 1.5e11
  {id:'cpu',name:'CPU 超频',base:60000000.0,cps:0.0,cat:'thread',desc:'所有线程产出 +50%'}, // v2.8.23：门槛 6e6
  {id:'mem',name:'内存扩容',base:1500000000.0,cps:0.0,maxLevel:1,cat:'thread',desc:'所有线程消耗 -15%'}, // v2.8.23：门槛 1.5e8
  {id:'gpu',name:'GPU 加速',base:6000000000.0,cps:0.0,cat:'thread',desc:'所有线程产出 ×2'}, // v2.8.23：门槛 6e8
  {id:'cache',name:'缓存优化',base:300000000000.0,cps:0.0,cat:'thread',desc:'线程消耗 -25% 起每级再 -3%，EP 存储上限 +8,000/级'}, // v2.8.23：门槛 3e10
  // v2.7.4 ⑥：新增阶段仓库（via upgrade 直读并入上限；链序披露天然分阶段——前期备用粮仓、后期深井仓储）
  {id:'reserve_bin',name:'备用粮仓',base:20000,growth:1.50,cps:0,cat:'D',desc:'EP 存储上限 +12,000/级'}, // v3.0.3 第五批：去「每级」；修正为与 economy.js 实际 12000/级一致（原 +4,000 文案错误）
  {id:'deep_bin',name:'深井仓储',base:5e4,growth:1.5,cps:0,cat:'D',desc:'EP 存储上限 +800,000/级'},
  // 探采平台
  {id:'scooter',name:'外勤摩托队',base:1500.0,cps:2.5,desc:'地面快速采集'},
  {id:'convoy',name:'装甲车队',base:150000.0,cps:25,desc:'重装地面采集'},
  {id:'orbital',name:'轨道飞行器',base:15000000.0,cps:250,desc:'近地轨道采集'},
  {id:'submersible',name:'深渊潜航器',base:1500000000.0,cps:2500,desc:'深海/深空潜航'},
  // 深渊科技
  {id:'dmsight',name:'深渊视觉',base:0.0,cps:0.0,dmCost:5,desc:'全局 +25%',cat:'dm'},
  {id:'dmfeed',name:'深渊供能',base:0.0,cps:0.0,dmCost:20,desc:'事件奖励 ×2',cat:'dm'},
  {id:'dmmind',name:'深渊心智',base:0.0,cps:0.0,dmCost:50,desc:'线程消耗 -40%',cat:'dm'},
  // v1.3 模块 D 第 3 层：载具协议（20 DM 一次性，全载具 CPS +50%）
  {id:'dmprotocol',name:'载具协议',base:0.0,cps:0.0,dmCost:B.vehicles.protocolDmCost,desc:'所有载具产出 +50%',cat:'dm'},
  // v2.0 净化节点（矩阵腐化对策，EP 购买、可叠加，速率由 balance.js 配置）
  ...B.corruption.purifiers.map(p => ({
    id: p.id, name: p.name, base: p.base, cps: 0, cat: 'purifier', maxLevel: 3, dmCost: p.dmCost || false, desc: p.desc, // v2.8.21 ⑥：净化节点限购 3 级、DM 消耗（不耗 EP）
  })),
];

export function upgradeCost(u, count, costMultFn) {
  const mult = costMultFn ? costMultFn() : 1;
  return Math.ceil(u.base * Math.pow(1.15, count) * mult);
}

export function bulkCost(u, n, costMultFn) {
  let t = 0;
  const owned = u.count || 0;
  for (let i = 0; i < n; i++) t += upgradeCost(u, owned + i, costMultFn);
  return t;
}

export function isUpgradeUnlocked(u, S) {
  if (u.cat === 'dm') return true; // DM 科技单独判断
  const owned = S.upgrades[u.id] || 0;
  return owned > 0 || S.ep >= u.base * 0.3 || S.allTimeEp >= u.base * 0.3;
}
