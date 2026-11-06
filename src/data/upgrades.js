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
  // v2.7.4 ⑥：新增阶段仓库（via upgrade 直读并入上限；链序披露天然分阶段——前期备用粮仓、后期深井仓储）
  // v3.4.6 反馈⑫：曲线整体对调——前期备用粮仓（12K 首购 +4,000/级 ×1.18、20 级封顶、先解锁），
  //   后期存储节点（45K 首购 +12,000/级恒定、无限级）
  //   单位价口径：粮仓 L1 3.00 EP/点（×1.229/级上探）→ 存储节点 L1 3.75 EP/点（×1.20/级）
  {id:'reserve_bin',name:'备用粮仓',base:B.reserveBin.base,growth:B.reserveBin.growth,maxLevel:B.reserveBin.maxLevel,cps:0,cat:'D',desc:'EP 存储上限 +4,000/级（逐级 ×1.18，前期防死锁关键件，20 级封顶）'},
  {id:'storage',name:'存储节点',base:B.storage.base,growth:B.storage.growth,cps:0,desc:'EP 存储上限 +12,000/级（逐级 ×1.15，无限级）'},
  // v2.8.27 ②：全资源存储上限建筑（EP 购买，主商店「存储与资源建筑」统一入口）
  // v3.4.4 反馈①：上限改「逐级扩容」——首级 +400 起、逐级 ×1.15（economy.VAULT_CAP_GROWTH），买得越深单级增量越大
  {id:'rp_vault',name:'矩阵存储库',cat:'D',unlimited:true,base:1.5e5,growth:1.5,cps:0,fx:{key:'rpCapAdd',value:400},desc:'RP 上限逐级扩容（首级 +400，逐级 ×1.15）'},
  {id:'dm_vault',name:'星尘金库',cat:'D',unlimited:true,base:6e5,growth:1.5,cps:0,fx:{key:'dmCapAdd',value:100},desc:'EP 购买 · DM 上限逐级扩容（首级 +100，逐级 ×1.15）'},
  {id:'pt_vault',name:'饵料仓库',cat:'D',unlimited:true,base:3e5,growth:1.5,cps:0,fx:{key:'ptCapAdd',value:200},desc:'EP 购买 · PT 上限逐级扩容（首级 +200，逐级 ×1.15）'},
  // v3.5.0 反馈②：FP 上限独立成建筑（原挂在圣所等级上，圣所既产 FP 又给上限，语义混乱）。
  //   圣所改为「只产信仰」；上限入口统一到这里，价格高于星尘金库（6e5）与饵料仓库（3e5）。
  {id:'faith_vault',name:'誓约圣龛',cat:'D',unlimited:true,base:1.2e6,growth:1.5,cps:0,fx:{key:'faithCapAdd',value:50},desc:'EP 购买 · FP 上限逐级扩容（首级 +50，逐级 ×1.15）'},
  {id:'intern',name:'实习生',base:600000.0,cps:20,growth:1.55,desc:'基础产出+20/s'}, // v2.8.3：base×4/cps 降
  {id:'team',name:'小组协作',base:6000000.0,cps:110,growth:1.55,desc:'基础产出+110/s'}, // v2.8.3：base×4/cps 降
  {id:'ai',name:'AI 助手',base:60000000.0,cps:600,growth:1.55,desc:'基础产出+600/s'}, // v2.8.3：base×4/cps 降
  {id:'ai_assist',name:'AI 助手编队',base:5e6,growth:6,maxLevel:8,desc:'解锁 1 个 AI 助手槽（最多 8，于 AI 面板分配至各系统自动购买）'}, // v3.6.0 方向⑨
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
  {id:'holographic',name:'全息投影',base:3.6e+22,cps:1.25e+14,growth:1.55,desc:'基础产出+125T/s'}, // v2.8.3
  {id:'observer',name:'观察者效应',base:3.6e+23,cps:8.5e+14,growth:1.55,desc:'基础产出+850T/s'}, // v2.8.3
  {id:'simulation',name:'模拟舱',base:3.6000000000000004e+24,cps:6.3e+15,growth:1.55,desc:'基础产出+6.3Qa/s'}, // v2.8.3
  {id:'creator',name:'造物主',base:3.5999999999999997e+25,cps:4.2e+16,growth:1.55,desc:'基础产出+42Qa/s'}, // v2.8.3
  {id:'recursion',name:'递归',base:3.6e+26,cps:2.95e+17,growth:1.55,desc:'基础产出+295Qa/s'}, // v2.8.3
  {id:'paradox',name:'自指悖论',base:3.6e+27,cps:2.1e+18,growth:1.55,desc:'基础产出+2.1Qi/s'}, // v2.8.3
  {id:'final',name:'终极奇点',base:3.6e+28,cps:1.25e+19,growth:1.55,desc:'基础产出+12.5Qi/s'}, // v2.8.3
  {id:'omega',name:'欧米茄点',base:3.6000000000000005e+29,cps:8.5e+19,growth:1.55,desc:'基础产出+85Qi/s'}, // v2.8.3
  {id:'zero',name:'无',base:3.6e+30,cps:6.3e+20,growth:1.55,desc:'基础产出+630Qi/s'}, // v2.8.3
  {id:'origin',name:'起源',base:3.5999999999999995e+31,cps:4.2e+21,growth:1.55,desc:'基础产出+4.2Sx/s'}, // v2.8.3
  {id:'essence',name:'本质',base:3.6e+32,cps:2.95e+22,growth:1.55,desc:'基础产出+29.5Sx/s'}, // v2.8.3
  {id:'one',name:'太一',base:3.6e+33,cps:2.1e+23,growth:1.55,desc:'基础产出+210Sx/s'}, // v2.8.3
  {id:'tao',name:'道',base:3.6e+34,cps:1.25e+24,growth:1.55,desc:'基础产出+1.25Sp/s'}, // v2.8.3
  {id:'void',name:'虚空',base:3.6e+35,cps:8.5e+24,growth:1.55,desc:'基础产出+8.5Sp/s'}, // v2.8.3
  {id:'dream',name:'大梦',base:3.6e+36,cps:6.3e+25,growth:1.55,desc:'基础产出+63Sp/s'}, // v2.8.3
  {id:'thought',name:'一念',base:3.6e+37,cps:4.2e+26,growth:1.55,desc:'基础产出+420Sp/s'}, // v2.8.3
  {id:'unknown',name:'不可名状',base:3.6000000000000004e+38,cps:2.95e+27,growth:1.55,desc:'基础产出+2.95Oc/s'}, // v2.8.3
  {id:'god',name:'神之领域',base:3.6000000000000004e+39,cps:2.1e+28,growth:1.55,desc:'基础产出+21Oc/s'}, // v2.8.3
  {id:'universe',name:'宇宙之心',base:3.6e+40,cps:1.7e+29,growth:1.55,desc:'基础产出+170Oc/s'}, // v2.8.3
  {id:'creation',name:'创世',base:3.6e+41,cps:1.25e+30,growth:1.55,desc:'基础产出+1.25No/s'}, // v2.8.3
  {id:'infinity',name:'无限',base:3.6e+42,cps:8.5e+30,growth:1.55,desc:'基础产出+8.5No/s'}, // v2.8.3
  {id:'absolute',name:'绝对',base:3.6000000000000006e+43,cps:6.3e+31,growth:1.55,desc:'基础产出+63No/s'}, // v2.8.3
  {id:'beyond',name:'超越',base:3.6e+44,cps:4.2e+32,growth:1.55,desc:'基础产出+420No/s'}, // v2.8.3
  // 资源型模块（v2.0：灵感工坊/神谕所/数据熔炉由 balance.js 配置）
  {id:'atrium',name:'灵感工坊',base:B.atrium.base,growth:2.2,cps:0,desc:`自动蒸馏：每秒消耗 ${B.atrium.epRate} EP 转化 ${B.atrium.rate} RP，升级在蒸馏开关处`}, // v3.0.3 第四批③：升级入口移至开关处
  // v3.4.6 反馈⑩：删除「路边神龛」——v3.0.3 起已无任何产出（信仰解锁入口 = 宗教面板「唤醒信仰」，
  // 信仰锚点同步改判：宗教解锁 / 持有 FP / 旧档已购神龛均算完成）
  {id:'garden',name:'伊甸花园',base:30000000000.0,cps:0.0,produces:{type:'pt',rate:0.15},desc:'每秒 +0.15 PT'}, // v3.4.0 反馈③：0.5→0.15 PT/s（PT 供给过快，孵化即满仓）
  {id:'oracle',name:'神谕所',base:B.oracle.base,cps:0,produces:{type:'rp',rate:B.oracle.rate},desc:`每秒 +${B.oracle.rate} RP`},
  {id:'temple',name:'万神殿',base:300000000000000.0,cps:0.0,produces:{type:'fa_chance',rate:0.005},desc:'每秒 0.5% 概率 +1 信仰'},
  // 线程强化（v2.0：补贴比例由 balance.js 配置）
  // v3.4.8 反馈⑦：整组「消耗优化」删除（能量合剂 / 循环供氧 / 生物打印餐 / 内存扩容 / 缓存优化）——
  //   与「班组消耗 ≈ 产出的 2/3」新口径冲突（减成本项会让消耗重新掉下去），且该组 5 项全部限购后
  //   只剩一列无效按钮。旧档已购的减耗效果仍按字段生效（见 economy.staffSalaryPerSec 的兼容分支）。
  // 保留「产出强化」两项：CPU 超频 / GPU 加速（限购，加成随级乘算）
  {id:'cpu',name:'CPU 超频',base:30000000.0,cps:0.0,maxLevel:3,cat:'thread',desc:'所有线程产出 +50%/级'}, // v3.4.7 ①：限购 3 级；④：6e7 → 3e7
  {id:'gpu',name:'GPU 加速',base:60000000.0,cps:0.0,maxLevel:2,cat:'thread',desc:'所有线程产出 ×2/级'}, // v3.4.7 ①：限购 2 级；④：6e9 → 6e7
  // v2.7.4 ⑥：新增阶段仓库（via upgrade 直读并入上限；链序披露天然分阶段——前期备用粮仓、后期深井仓储）
  // v3.4.4 反馈②：按价格重排「前期存储节点 → 后期备用粮仓」
  //   存储节点 3.00 EP/点（L1）· 每级单价 ×1.229（增量也涨）→ L20 150 EP/点
  //   备用粮仓 3.75 EP/点（L1）· 每级单价 ×1.20（增量恒定 12K）→ L11 起反超、L20 只要 120 EP/点
  //   深井仓储 2.25 EP/点（L1）· 每级单价 ×1.22 → 后期大宗扩容（原 5e4 换 +80 万 = 0.06 EP/点，比存储节点便宜 48 倍，本次一并纠正）
  // v3.4.6 反馈⑫：备用粮仓定义上移至存储节点之前（链序：粮仓先解锁先显示）；深井仓储仍为终局大宗
  {id:'deep_bin',name:'深井仓储',base:B.deepBin.base,growth:B.deepBin.growth,cps:0,cat:'D',desc:'EP 存储上限 +800,000/级（逐级 ×1.15）'},
  // 探采平台：v3.7.3 反馈⑥——载具只消耗 EP 换取 DM，不再提供 EP 基础产出（cps 恒 0）。
  // 载具协议（dmprotocol）改为提升 DM 采集速率（见 economy.vehicleRateMult），不再乘 CPS。
  {id:'scooter',name:'外勤摩托队',base:1500.0,cps:0,desc:'地面快速采集'},
  {id:'convoy',name:'装甲车队',base:150000.0,cps:0,desc:'重装地面采集'},
  {id:'orbital',name:'轨道飞行器',base:15000000.0,cps:0,desc:'近地轨道采集'},
  {id:'submersible',name:'深渊潜航器',base:1500000000.0,cps:0,desc:'深海/深空潜航'},
  // 深渊科技
  {id:'dmsight',name:'深渊视觉',base:0.0,cps:0.0,dmCost:5,desc:'全局 +25%',cat:'dm'},
  {id:'dmfeed',name:'深渊供能',base:0.0,cps:0.0,dmCost:20,desc:'事件奖励 ×2',cat:'dm'},
  {id:'dmmind',name:'深渊心智',base:0.0,cps:0.0,dmCost:50,desc:'线程消耗 -40%',cat:'dm'},
  // v1.3 模块 D 第 3 层：载具协议（20 DM 一次性，DM 采集速率 +50%）
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
