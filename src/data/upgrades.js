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
  {id:'storage',name:'存储节点',base:B.storage.base,growth:B.storage.growth,cps:0,desc:`EP 存储上限 +${B.storage.capPer}/级起步、逐级 +12%（v2.4 无限升级，成本递增）`},
  {id:'intern',name:'实习生',base:2e5,cps:40,desc:'基础产出+40/s'}, // v2.8.3：base×4/cps 降（首升 1-3 天）
  {id:'team',name:'小组协作',base:2e6,cps:220,desc:'基础产出+220/s'}, // v2.8.3：base×4/cps 降
  {id:'ai',name:'AI 助手',base:2e7,cps:1200,desc:'基础产出+1.2K/s'}, // v2.8.3：base×4/cps 降
  {id:'cloud',name:'云集群',base:3e8,cps:6500,desc:'基础产出+6.5K/s'}, // v2.8.3：base×4/cps 降
  {id:'global',name:'全球网络',base:1.3e9,cps:37000,desc:'基础产出+37K/s'}, // v2.8.3：base×4/cps 降
  {id:'quantum',name:'量子计算',base:2e10,cps:210000,desc:'基础产出+210K/s'}, // v2.8.3
  {id:'singularity',name:'奇点工程',base:3.2e11,cps:1.26e6,desc:'基础产出+1.26M/s'}, // v2.8.3
  {id:'dyson',name:'戴森球',base:6e12,cps:8.4e6,desc:'基础产出+8.4M/s'}, // v2.8.3
  {id:'multiverse',name:'多重宇宙',base:1.2e14,cps:6.7e7,desc:'基础产出+67M/s'}, // v2.8.3
  {id:'galactic',name:'银河联邦',base:1.2e15,cps:4.2e8,desc:'基础产出+420M/s'}, // v2.8.3
  {id:'supercluster',name:'超星系团',base:1.2e16,cps:2.5e9,desc:'基础产出+2.5B/s'}, // v2.8.3
  {id:'cosmicweb',name:'宇宙网',base:1.2e17,cps:1.7e10,desc:'基础产出+17B/s'}, // v2.8.3
  {id:'darkmatter',name:'暗物质网络',base:1.2e18,cps:1.26e11,desc:'基础产出+126B/s'}, // v2.8.3
  {id:'vacuum',name:'真空能',base:1.2e19,cps:8.4e11,desc:'基础产出+840B/s'}, // v2.8.3
  {id:'brane',name:'膜宇宙',base:1.2e20,cps:5.9e12,desc:'基础产出+5.9T/s'}, // v2.8.3
  {id:'string',name:'弦织机',base:1.2e21,cps:4.2e13,desc:'基础产出+42T/s'}, // v2.8.3
  {id:'holographic',name:'全息投影',base:1.2e22,cps:2.5e14,desc:'基础产出+250T/s'}, // v2.8.3
  {id:'observer',name:'观察者效应',base:1.2e23,cps:1.7e15,desc:'基础产出+1.7Qa/s'}, // v2.8.3
  {id:'simulation',name:'模拟舱',base:1.2e24,cps:1.26e16,desc:'基础产出+12.6Qa/s'}, // v2.8.3
  {id:'creator',name:'造物主',base:1.2e25,cps:8.4e16,desc:'基础产出+84Qa/s'}, // v2.8.3
  {id:'recursion',name:'递归',base:1.2e26,cps:5.9e17,desc:'基础产出+590Qa/s'}, // v2.8.3
  {id:'paradox',name:'自指悖论',base:1.2e27,cps:4.2e18,desc:'基础产出+4.2Qi/s'}, // v2.8.3
  {id:'final',name:'终极奇点',base:1.2e28,cps:2.5e19,desc:'基础产出+25Qi/s'}, // v2.8.3
  {id:'omega',name:'欧米茄点',base:1.2e29,cps:1.7e20,desc:'基础产出+170Qi/s'}, // v2.8.3
  {id:'zero',name:'无',base:1.2e30,cps:1.26e21,desc:'基础产出+1.26Sx/s'}, // v2.8.3
  {id:'origin',name:'起源',base:1.2e31,cps:8.4e21,desc:'基础产出+8.4Sx/s'}, // v2.8.3
  {id:'essence',name:'本质',base:1.2e32,cps:5.9e22,desc:'基础产出+59Sx/s'}, // v2.8.3
  {id:'one',name:'太一',base:1.2e33,cps:4.2e23,desc:'基础产出+420Sx/s'}, // v2.8.3
  {id:'tao',name:'道',base:1.2e34,cps:2.5e24,desc:'基础产出+2.5Sp/s'}, // v2.8.3
  {id:'void',name:'虚空',base:1.2e35,cps:1.7e25,desc:'基础产出+17Sp/s'}, // v2.8.3
  {id:'dream',name:'大梦',base:1.2e36,cps:1.26e26,desc:'基础产出+126Sp/s'}, // v2.8.3
  {id:'thought',name:'一念',base:1.2e37,cps:8.4e26,desc:'基础产出+840Sx/s'}, // v2.8.3
  {id:'unknown',name:'不可名状',base:1.2e38,cps:5.9e27,desc:'基础产出+5.9Oc/s'}, // v2.8.3
  {id:'god',name:'神之领域',base:1.2e39,cps:4.2e28,desc:'基础产出+42Oc/s'}, // v2.8.3
  {id:'universe',name:'宇宙之心',base:1.2e40,cps:3.4e29,desc:'基础产出+340Oc/s'}, // v2.8.3
  {id:'creation',name:'创世',base:1.2e41,cps:2.5e30,desc:'基础产出+2.5No/s'}, // v2.8.3
  {id:'infinity',name:'无限',base:1.2e42,cps:1.7e31,desc:'基础产出+17No/s'}, // v2.8.3
  {id:'absolute',name:'绝对',base:1.2e43,cps:1.26e32,desc:'基础产出+126No/s'}, // v2.8.3
  {id:'beyond',name:'超越',base:1.2e44,cps:8.4e32,desc:'基础产出+840No/s'}, // v2.8.3
  // 资源型模块（v2.0：灵感工坊/神谕所/数据熔炉由 balance.js 配置）
  {id:'atrium',name:'灵感工坊',base:B.atrium.base,cps:0,produces:{type:'rp',rate:B.atrium.rate},desc:`每秒 +${B.atrium.rate} RP`},
  {id:'petland',name:'宠物乐园',base:1e6,cps:0,produces:{type:'pt',rate:0.1},desc:'每秒 +0.1 异兽饼干（异兽资源超长线，缓慢累计）'},
  {id:'shrine',name:'路边神龛',base:1e8,cps:0,produces:{type:'fa_chance',rate:0.001},desc:'每秒 0.1% 概率 +1 信仰'},
  {id:'dataforge',name:B.dataForge.name,base:B.dataForge.base,cps:B.dataForge.cps,produces:B.dataForge.produces,desc:B.dataForge.desc},
  {id:'garden',name:'伊甸花园',base:1e10,cps:0,produces:{type:'pt',rate:0.5},desc:'每秒 +0.5 异兽饼干（后期主要来源）'},
  {id:'oracle',name:'神谕所',base:B.oracle.base,cps:0,produces:{type:'rp',rate:B.oracle.rate},desc:`每秒 +${B.oracle.rate} RP`},
  {id:'temple',name:'万神殿',base:1e14,cps:0,produces:{type:'fa_chance',rate:0.005},desc:'每秒 0.5% 概率 +1 信仰'},
  // 线程强化（v2.0：补贴比例由 balance.js 配置）
  {id:'subsist1',name:'能量合剂',base:1e6,cps:0,maxLevel:1,cat:'thread',desc:`线程消耗 -${Math.round(B.subsist1*100)}%`}, // v2.8.2：降低成本类 base ×10
  {id:'subsist2',name:'循环供氧',base:1e8,cps:0,maxLevel:1,cat:'thread',desc:`线程消耗 -${Math.round(B.subsist2*100)}%`}, // v2.8.2：×10
  {id:'subsist3',name:'生物打印餐',base:1e10,cps:0,maxLevel:1,cat:'thread',desc:'线程消耗 -50%'}, // v2.8.2：×10
  {id:'cpu',name:'CPU 超频',base:1e4,cps:0,cat:'thread',desc:'所有线程产出 +50%'},
  {id:'mem',name:'内存扩容',base:1e6,cps:0,maxLevel:1,cat:'thread',desc:'所有线程消耗 -15%'}, // v2.8.2：×10
  {id:'gpu',name:'GPU 加速',base:1e6,cps:0,cat:'thread',desc:'所有线程产出 ×2'},
  {id:'cache',name:'缓存优化',base:1e6,cps:0,cat:'thread',desc:'线程消耗 -25% 起，每级再 -3%（下限 -35%），EP 存储上限 +8000/级（v2.4 无限升级；v2.8.2 base ×10）'},
  // v2.7.4 ⑥：新增阶段仓库（via upgrade 直读并入上限；链序披露天然分阶段——前期备用粮仓、后期深井仓储）
  {id:'reserve_bin',name:'备用粮仓',base:1200,growth:1.50,cps:0,cat:'D',desc:'每级 EP 上限 +8,000（中前期扩容，无限升级；v2.8.2 成本/上限同步放宽）'},
  {id:'deep_bin',name:'深井仓储',base:5e4,growth:1.5,cps:0,cat:'D',desc:'每级 EP 上限 +500,000（后期扩容，无限升级）'},
  // 探采平台
  {id:'scooter',name:'外勤摩托队',base:500,cps:5,desc:'地面快速采集'},
  {id:'convoy',name:'装甲车队',base:5e4,cps:50,desc:'重装地面采集'},
  {id:'orbital',name:'轨道飞行器',base:5e6,cps:500,desc:'近地轨道采集'},
  {id:'submersible',name:'深渊潜航器',base:5e8,cps:5000,desc:'深海/深空潜航'},
  // 深渊科技
  {id:'dmsight',name:'深渊视觉',base:0,cps:0,dmCost:5,desc:'全局 +25%',cat:'dm'},
  {id:'dmfeed',name:'深渊供能',base:0,cps:0,dmCost:20,desc:'事件奖励 ×2',cat:'dm'},
  {id:'dmmind',name:'深渊心智',base:0,cps:0,dmCost:50,desc:'线程消耗 -40%',cat:'dm'},
  // v1.3 模块 D 第 3 层：载具协议（20 DM 一次性，全载具 CPS +50%）
  {id:'dmprotocol',name:'载具协议',base:0,cps:0,dmCost:B.vehicles.protocolDmCost,desc:'所有载具产出 +50%',cat:'dm'},
  // v2.0 净化节点（矩阵腐化对策，EP 购买、可叠加，速率由 balance.js 配置）
  ...B.corruption.purifiers.map(p => ({
    id: p.id, name: p.name, base: p.base, cps: 0, cat: 'purifier', desc: p.desc,
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
