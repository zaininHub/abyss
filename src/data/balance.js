// v2.0 数值配置中心：所有平衡常量集中于此（设计方案 §4.1）
export const BALANCE = {
  // 初始与前期
  initialEp: 0, // v2.8.1：EP 开局不送（新档从 0 开始，靠点击/线程产出起步）
  scribble: { base: 40, cps: 0.25 },   // v2.8.3：基础卡 base×4/cps×0.83（首升 1-3 天节奏）
  script: { base: 320, cps: 1.7 },   // v2.8.3
  parallel: { base: 3600, cps: 7 },   // v2.8.3
  atrium: { base: 5e4, rate: 0.15 },
  oracle: { base: 5e11, rate: 2 },
  dataForge: { name: '数据熔炉', base: 1e8, cps: 0, produces: { type: 'rp', rate: 0.5 }, desc: '每秒 +0.5 RP' },
  thread: {
    firstCost: 120, baseOutput: 2.5, baseOutputJitter: 2.5, salaryBase: 1.05, // v2.8.3：线程变慢（招募 120 起步，产出 2.5）
    // v1.3 模块 C：线程薪资四态状态机（设计文档 §2 数值框架）
    wages: {
      // v2.8.1：状态转换节奏放缓（放置游戏真实时间尺度）——黄线 30s 薪资 / 欠薪 60s 才休眠 / 休眠 30min 才流失预警 / 恢复线 3min 薪资 / 缓冲 60s
      warnSec: 30,          // 黄线：EP < 30s 薪资 → 欠薪
      debtMult: 0.7,        // 欠薪产出系数
      dormantAfterSec: 60,  // 连续欠薪 60s → 强制休眠
      keepCostMult: 0.3,    // 休眠期保命成本 = 薪资 ×0.3
      loseAfterSec: 1800,   // 休眠持续 30 分钟 → 流失预警
      loseChancePerMin: 0.1,// 流失预警期每 60s 10% 概率流失 1 线程
      recoverSec: 180,      // 恢复线：EP ≥ 3min 薪资
      bufferSec: 60,        // 休眠恢复缓冲 60s → 满薪
      transitionSec: 5,     // v2.8.7：普通状态转换过渡（欠薪→恢复等需 5s 维持，不瞬间切换）
      restBonusMult: 1.5,   // 休眠/流失 ≥60s 恢复后补偿——产出 ×1.5 持续 120s
      restBonusSec: 120,
    },
  },
  // v2.7.1：线程懒惰态（EP 满上限惩罚）——持续满上限后线程怠工：产出降、消耗升，
  // 使消耗 > 产出（鼓励玩家持续投入 EP 而非囤满挂机）；EP 跌到 0 或任意升级/购买解除
  lazy: { afterSec: 60, prodMult: 0.25, costMult: 2.5 }, // v2.7.1：怠工幅度保证任意阶段消耗>产出（单线程 3/s×0.25 < 薪资 0.5/s×2.5）
  // v1.3 模块 D：探采平台联动数值
  vehicles: {
    ids: ['scooter', 'convoy', 'orbital', 'submersible'],
    dmRates: [0.05, 0.1, 0.25, 0.5],       // 每辆载具 DM/min 采集率（按档位）
    collectInterval: 60,                     // 采集 roll 周期（秒）
    tierDmBonus: [0, 0, 1, 1, 2],           // 封印裂隙 DM 加成（按最高档 0~4）
    embraceBonusSec: 5,                     // 拥抱裂隙爆发时长加成（秒 × 档位）
    protocolMult: 1.5,                      // 载具协议：全载具 CPS ×1.5
    protocolDmCost: 20,
  },
  // v1.3 模块 B：功能建筑（一次性多级，效果经读侧修饰 wages 生效值）
  // v2.1：数据中心随 RESCALE 重标定——原 base 1e6 growth 10 在终局上限（≈3.7e11）下远期失衡，
  // 重标为 base 8e4 growth 4（三档 8e4 / 3.2e5 / 1.28e6），并纳入 30% 防死锁钳制（组长硬性要求：DC 三档成本随 cap 曲线重标定）
  buildings: {
    canteen:    { id: 'canteen', name: '能量食堂', levels: 3, base: 2e4, growth: 8,  desc: ['欠薪惩罚 0.7 → 0.8', '欠薪惩罚 0.8 → 0.9', '欠薪惩罚 0.9 → 0.95（v2.8.4：只减缓，不再免疫）'] },
    dorm:       { id: 'dorm', name: '休眠舱', levels: 1, base: 5e4, growth: 1,  desc: ['休眠期保命成本 0.3 → 0.15'] },
    dock:       { id: 'dock', name: '维修坞', levels: 1, base: 2e5, growth: 1,  desc: ['线程维护（v2.8.3：不再免疫流失；腐化满额且 EP 触顶时线程仍会被深渊吞没）'] },
    datacenter: { id: 'datacenter', name: '数据中心', levels: 3, base: 8e4, growth: 4, desc: ['每 10 线程全局产出 +5%，EP 上限 +10,000', '每 10 线程全局产出 +10%，EP 上限 +25,000', '每 10 线程全局产出 +15%，EP 上限 +50,000'] },
    abyss_fishbowl: { id: 'abyss_fishbowl', name: '深渊鱼缸', levels: 3, base: 5e5, growth: 1, desc: ['DM 采集效率 +20%（触手在缸中缓慢摆动）', 'DM 采集效率 +40%', 'DM 采集效率 +60%；裂隙封印奖励 +5 DM'] },
  },
  // ===== v2.1 建筑驱动转向（PM 设计文档 §2.2 + 终章 RESCALE 价梯，唯一数值基准）=====
  // 级制红线：重复购买即升级（KG 工坊模式），effect = value × level；效果类 ≤9 级、乘算锚点 ≤3 级、扩容类 ≤20 级，禁止无限堆叠
  // 价格 = base × growth^当前级 × costMult()（沿用 v1.3 模块 B 公式）
  // unlockTech = 原 52 科技 ID（作 RP 解锁定价基准：原 RP × buildingUnlockRatio）；保留钥匙（click_up 等 6 项）另作族门控
  buildingsV21: [
    // ---- 组 A · 全局乘数（10 座）----
    { id: 'warmup_node',    name: '预热节点',   cat: 'A', cap: 5, base: 2e4,  growth: 1.30, unlockTech: 'warmup',    fx: { key: 'globalAdd', value: 0.02 },  desc: '每级全局产出 +2%（满 5 级 +10%）' }, // v2.8.7：成本大幅提高
    { id: 'eff_tower',      name: '效能尖塔',   cat: 'A', cap: 9, base: 2000, growth: 1.18, unlockTech: 'eff2',      fx: { key: 'globalAdd', value: 0.10 },  desc: '每级全局产出 +10%（满 9 级 +90%）' },
    { id: 'double_workshop',name: '双倍工坊',   cat: 'A', cap: 9, base: 8000, growth: 1.22, unlockTech: 'speed2',    fx: { key: 'globalMul', value: 1.12 },  desc: '每级全局产出 ×1.12（乘算，满 9 级 ×2.66）' },
    { id: 'dispatch_hub',   name: '调度中枢',   cat: 'A', cap: 9, base: 1e5,  growth: 1.25, unlockTech: 'auto2',     fx: { key: 'globalAdd', value: 0.20 },  desc: '每级全局产出 +20%（满 9 级 +180%）' },
    { id: 'quantum_stacker',name: '量子叠加器', cat: 'A', cap: 3, base: 2e5,  growth: 1.30, unlockTech: 'quantum2',  fx: { key: 'globalMul', value: 1.20 }, desc: '每级全局产出 ×1.20（乘算锚点，满 3 级 ×1.73）' },
    { id: 'singularity_core',name: '奇点反应堆',cat: 'A', cap: 3, base: 2.5e5,growth: 1.35, unlockTech: 'singular',  fx: { key: 'globalMul', value: 1.25 }, desc: '每级全局产出 ×1.25（乘算锚点，满 3 级 ×1.95）' },
    { id: 'transcend_temple',name: '超越圣殿', cat: 'A', cap: 3, base: 3e5,  growth: 1.35, unlockTech: 'transcend', fx: { key: 'globalMul', value: 1.20 }, desc: '每级全局产出 ×1.20（乘算锚点）' },
    { id: 'ascend_spire',   name: '飞升尖塔',   cat: 'A', cap: 3, base: 4e5,  growth: 1.40, unlockTech: 'ascend',    fx: { key: 'globalMul', value: 1.20 }, desc: '每级全局产出 ×1.20（乘算锚点）' },
    { id: 'eternity_hall',  name: '永恒回廊',   cat: 'A', cap: 3, base: 4.5e5,growth: 1.45, unlockTech: 'eternity',  fx: { key: 'globalMul', value: 1.22 }, desc: '每级全局产出 ×1.22（乘算锚点）' },
    { id: 'end_shrine',     name: '终焉圣殿',   cat: 'A', cap: 3, base: 5e5,  growth: 1.50, unlockTech: 'true_end',  fx: { key: 'globalMul', value: 1.25 }, desc: '每级全局产出 ×1.25（终局顶配；1 级解锁终章条件）' },
    // ---- 组 B · 点击乘数（7 座）----
    // v2.6.3 反馈①：移除「点击与暴击」B 分区（弱化主动点击宗旨；field_1~4 / crit_furnace / crit_reactor / crit_reactor_2 全删；已购旧档乘区随 fx 表缺失自然失效）
    // ---- 组 C · 成本折扣（6 座）----
    { id: 'bargain_shop',   name: '议价坊',     cat: 'C', cap: 5, base: 3e4,  growth: 1.35, unlockTech: 'cheap_start',fx: { key: 'costMul', value: 0.98 },   desc: '每级所有成本 ×0.98（满 5 级 ×0.90）' }, // v2.8.7：成本大幅提高
    { id: 'negotiate_seat', name: '谈判席',     cat: 'C', cap: 3, base: 2e5,  growth: 1.40, unlockTech: 'cost_opt',   fx: { key: 'costMul', value: 0.96 },   desc: '每级所有成本 ×0.96（满 3 级 ×0.88）' }, // v2.8.7：成本大幅提高
    { id: 'purchase_office',name: '采购总署',   cat: 'C', cap: 3, base: 1e6,  growth: 1.45, unlockTech: 'cheap2',     fx: { key: 'costMul', value: 0.95 },   desc: '每级所有成本 ×0.95（满 3 级 ×0.86）' }, // v2.8.7：成本大幅提高
    { id: 'purchase_office_2',name: '采购总署·聚',cat:'C',cap: 2, base: 6e6,  growth: 1.50, unlockTech: 'cost3',      fx: { key: 'costMul', value: 0.92 },   desc: '每级所有成本 ×0.92（满 2 级 ×0.85）' }, // v2.8.7：成本大幅提高
    { id: 'purchase_office_3',name: '采购总署·极',cat:'C',cap: 1, base: 1.5e5,growth: 1.28, unlockTech: 'grand_cost', fx: { key: 'costMul', value: 0.88 },   desc: '所有成本 ×0.88（1 级即生效）' },
    { id: 'focus_core',     name: '专注心核',   cat: 'C', cap: 1, base: 5000, growth: 1.20, unlockTech: 'focus_opt',  fx: { key: 'focusCost', value: 0.75 },  desc: '专注成本 ×0.75（1 级即生效）' },
    // ---- 组 D · 上限扩容（均受 30% 防死锁钳制；storage/cache 为既有升级体系镜像）----
    // v2.4 KG 模式改造：扩容类全部无限升级（unlimited），成本指数递增 + 30% 钳制 → 后期性价比自然递减；
    // 新增 3 座「多效果上限建筑」（EP 上限 + DM 采集效率 / 全局产出），先开放者后期性价比递减（数据见 PM v2.4）
    { id: 'quantum_pool',   name: '量子缓存池', cat: 'D', unlimited: true, base: 8e4, growth: 1.25, unlockTech: 'quantum2',  fx: { key: 'capAdd', value: 50000 },   desc: '每级 EP 上限 +50,000' },
    { id: 'dim_compressor', name: '维度压缩仓', cat: 'D', unlimited: true, base: 2e5, growth: 1.30, unlockTech: 'transcend', fx: { key: 'capAdd', value: 5e6 },     desc: '每级 EP 上限 +5,000,000' },
    { id: 'overlimit_store',name: '超限储存器', cat: 'D', unlimited: true, base: 5e5, growth: 1.35, unlockTech: 'true_end',  fx: { key: 'capAdd', value: 5e9 },     desc: '每级 EP 上限 +5,000,000,000' },
    // v2.4 新增多效果上限建筑（unlimited；多键效果经 effectEngine fx 数组聚合，DM 采集效率加成作用于载具采集）
    { id: 'abyss_reservoir', name: '深渊蓄能池', cat: 'D', unlimited: true, base: 2e6, growth: 1.28, unlockTech: 'quantum2',  fx: [{ key: 'capAdd', value: 1e6 }, { key: 'dmRateAdd', value: 0.15 }], desc: '每级 EP 上限 +1,000,000，DM 采集效率 +15% 每级' },
    { id: 'resonance_chamber', name: '共鸣回廊', cat: 'D', unlimited: true, base: 1.2e7, growth: 1.30, unlockTech: 'singular', fx: [{ key: 'capAdd', value: 1e8 }, { key: 'globalAdd', value: 0.03 }], desc: '每级 EP 上限 +100,000,000，全局产出 +3% 每级' },
    { id: 'dm_condenser',  name: '深渊凝析塔', cat: 'D', unlimited: true, base: 8e7, growth: 1.32, unlockTech: 'true_end',  fx: [{ key: 'capAdd', value: 1e10 }, { key: 'dmRateAdd', value: 0.30 }], desc: '每级 EP 上限 +10,000,000,000，DM 采集效率 +30% 每级' },
    // ---- 组 E · 线程产出（5 座）----
    { id: 'coop_hall',      name: '协作大厅',   cat: 'E', cap: 5, base: 1500, growth: 1.18, unlockTech: 'teamwork',   fx: { key: 'threadAdd', value: 0.10 }, desc: '每级线程产出 +10%（满 5 级 +50%）' },
    { id: 'team_temple',    name: '团队圣堂',   cat: 'E', cap: 3, base: 1e5,  growth: 1.24, unlockTech: 'team2',      fx: { key: 'threadMul', value: 1.5 },  desc: '每级线程产出 ×1.5（满 3 级 ×3.375）' },
    { id: 'super_team',     name: '超级团队殿', cat: 'E', cap: 2, base: 1.5e5,growth: 1.28, unlockTech: 'team3',      fx: { key: 'threadMul', value: 2 },    desc: '每级线程产出 ×2（满 2 级 ×4）' },
    { id: 'eco_battery',    name: '节能电池',   cat: 'E', cap: 5, base: 2000, growth: 1.18, unlockTech: 'fuel_eff',   fx: { key: 'fuelMul', value: 0.90 },   desc: '每级线程薪资 ×0.90（满 5 级 ×0.59）' },
    { id: 'eco_battery_2',  name: '节能电池·II',cat: 'E', cap: 3, base: 8e4,  growth: 1.26, unlockTech: 'fuel2',      fx: { key: 'fuelMul', value: 0.85 },   desc: '每级线程薪资 ×0.85（满 3 级 ×0.61）' },
    // ---- 组 F · RP 加成（5 座）----
    { id: 'exp_bench',      name: '初探实验台', cat: 'F', cap: 3, base: 1200, rpCost: 8,  growth: 1.18, unlockTech: 'rp_first',  fx: { key: 'rpAdd', value: 0.30 },     desc: '每级晋升 RP +30%（满 3 级 +90%）' }, // v2.8.7：RP 加成组改 RP 购买
    { id: 'rp_distiller',   name: 'RP 蒸馏塔', cat: 'F', cap: 3, base: 6000, rpCost: 15, growth: 1.20, unlockTech: 'rp_boost',   fx: { key: 'rpAdd', value: 0.50 },     desc: '每级晋升 RP 获取效率 +50%（满 3 级 +150%）' },
    { id: 'deep_lab',       name: '深度实验室', cat: 'F', cap: 2, base: 6e4,  rpCost: 25, growth: 1.26, unlockTech: 'rp2',        fx: { key: 'rpMul', value: 2 },        desc: '每级晋升 RP ×2（满 2 级 ×4）' },
    { id: 'theory_desk',    name: '理论突破台', cat: 'F', cap: 2, base: 1e5,  rpCost: 40, growth: 1.27, unlockTech: 'rp3',        fx: { key: 'rpAdd', value: 1.50 },     desc: '每级晋升 RP +150%（满 2 级 +300%）' },
    { id: 'legend_institute',name: '传奇研究所',cat: 'F', cap: 2, base: 1.5e5,rpCost: 60, growth: 1.28, unlockTech: 'grand_rp',   fx: { key: 'rpMul', value: 2 },        desc: '每级晋升 RP ×2（满 2 级 ×4）' },
    // v2.7.4 ⑦：灵感蒸馏塔——主动消耗 EP 转化 RP（cat F via upgrade，主商店显示；RP 解锁后可用）
    { id: 'rp_distill',     name: '灵感蒸馏塔', cat: 'F', unlimited: true, cap: 20, base: 5e3, rpCost: 20, growth: 1.25, unlockTech: null, via: 'upgrade', fx: { key: 'rpDistill', value: 0.12 }, desc: 'RP 蒸馏效率每级 +12%（消耗 EP 主动转化 RP；RP 首次溢出解锁）' },
    // ---- 组 G · 离线效率（5 座，三段式取最大档，不叠加）----
    { id: 'beacon_1',       name: '断线信号塔·初',cat:'G', cap: 1, base: 1000,growth: 1.15, unlockTech: 'offline1',  fx: { key: 'offlineRate', value: 0.4 }, desc: '离线效率 → 40%（1 级即生效）' },
    { id: 'beacon_2',       name: '断线信号塔·中',cat:'G', cap: 1, base: 1e4, growth: 1.20, unlockTech: 'offline1',  fx: { key: 'offlineRate', value: 0.6 }, desc: '离线效率 → 60%（1 级即生效）' },
    { id: 'beacon_3',       name: '断线信号塔·永',cat:'G', cap: 1, base: 1.2e5,growth: 1.28, unlockTech: 'grand_off', fx: { key: 'offlineRate', value: 1.0 }, desc: '离线效率 → 100%（1 级即生效，离线最高不超过在线）' },
    { id: 'delay_cache',    name: '延时缓存站', cat: 'G', cap: 1, base: 1e5,  growth: 1.25, unlockTech: 'offline1',  fx: { key: 'offlineCap', value: 16 },   desc: '离线收益上限 → 16 小时（1 级即生效）' },
    { id: 'delay_cache_2',  name: '延时缓存站·折',cat:'G',cap: 1, base: 1.3e5,growth: 1.27, unlockTech: 'offline24',  fx: { key: 'offlineCap', value: 24 },   desc: '离线收益上限 → 24 小时（1 级即生效）' },
    // ---- 组 H · 事件/项目（6 座）----
    { id: 'chance_sensor',  name: '机会感知器', cat: 'H', cap: 3, base: 1500, growth: 1.18, unlockTech: 'patience',   fx: { key: 'eventFreqAdd', value: 0.30 }, desc: '每级事件触发频率 +30%（满 3 级 +90%）' },
    { id: 'chance_sensor_2',name: '机会感知器·锐',cat:'H',cap: 2, base: 8000, growth: 1.22, unlockTech: 'event_boost',fx: { key: 'eventRewardAdd', value: 0.50 }, desc: '每级事件奖励 +50%（满 2 级 +100%）' },
    { id: 'lucky_nebula',   name: '幸运星云',   cat: 'H', cap: 2, base: 1e5,  growth: 1.24, unlockTech: 'luck',       fx: { key: 'eventFreqAdd', value: 0.50 }, desc: '每级事件触发频率 +50%（满 2 级 +100%）' },
    { id: 'event_tide_lab', name: '事件潮汐所', cat: 'H', cap: 1, base: 1.5e5,growth: 1.28, unlockTech: 'event3',     fx: { key: 'eventFreqMul', value: 2 },  desc: '事件触发频率 ×2（1 级即生效）' },
    { id: 'proj_supervisor',name: '项目督导室', cat: 'H', cap: 2, base: 6000, growth: 1.20, unlockTech: 'morale2',    fx: { key: 'projRewardAdd', value: 0.50 }, desc: '每级项目奖励 +50%（满 2 级 +100%）' },
    { id: 'proj_parallel',  name: '项目平行台', cat: 'H', cap: 1, base: 1.4e5,growth: 1.28, unlockTech: 'project2',   fx: { key: 'maxProjects', value: 2 },   desc: '可同时进行 2 个项目（1 级即生效）' },
    // ---- 组 I · 晋升/职级（2 座；满级 ppMult 合计 ×6，对齐终章口径）----
    { id: 'cycle_temple',   name: '轮回圣殿',   cat: 'I', cap: 2, base: 3e5,  growth: 1.30, unlockTech: 'prestige2',  fx: { key: 'ppMul', value: Math.SQRT2 }, desc: '每级晋升职级点 ×√2（满 2 级 ×2）' },
    { id: 'legend_rank_hall',name: '传奇职级殿',cat: 'I', cap: 1, base: 5e5,  growth: 1.35, unlockTech: 'grand_pp',   fx: { key: 'ppMul', value: 3 },        desc: '晋升职级点 ×3（1 级即生效）' },
    // ---- 既有升级体系镜像（购买入口仍在升级商店，此处仅为 55 栋统一注册/断言）----
    { id: 'storage',        name: '存储节点',   cat: 'D', unlimited: true, cap: 20, base: 150, growth: 1.5, unlockTech: null, via: 'upgrade', fx: { key: 'capStorage' }, desc: '每级 EP 上限递增（+2,000 起，逐级 ×1.12，无限升级；成本曲线 v2.7.4 加陡）' },
    { id: 'cache',          name: '缓存优化',   cat: 'D', unlimited: true, cap: 20, base: 1e6, growth: 1.5, unlockTech: null, via: 'upgrade', fx: { key: 'capCache' },   desc: '每级 EP 上限 +8,000（线程强化区购买，无限升级；v2.8.2 成本大福上调）' },
    // v2.7.4 ⑥：新增阶段仓库——前期「备用粮仓」、后期「深井仓储」（cat D via upgrade，capAdd 并入上限，
    // 与组 D 扩容建筑同口径；成本曲线陡，上限增速按阶段拉开）
    { id: 'reserve_bin',    name: '备用粮仓',   cat: 'D', unlimited: true, cap: 20, base: 1200, growth: 1.50, unlockTech: null, via: 'upgrade', fx: { key: 'capAdd', value: 8000 }, desc: '每级 EP 上限 +8,000（中前期扩容，无限升级；v2.8.2 成本/上限同步放宽）' },
    { id: 'deep_bin',       name: '深井仓储',   cat: 'D', unlimited: true, cap: 20, base: 5e4, growth: 1.5, unlockTech: 'storage3', via: 'upgrade', fx: { key: 'capAdd', value: 5e5 }, desc: '每级 EP 上限 +500,000（后期扩容）' },
  ],
  // v2.1：删除科技的解锁 RP 定价（原 RP × 比例），供 buildingsV21 解锁定价与存档迁移使用
  buildingUnlockRatio: 1.5,
  legacyTechRp: {
    warmup: 5, cheap_start: 4, lean: 5, cost_opt: 5, click_up: 5, offline1: 8, offline_s: 6,
    focus_opt: 8, eff2: 10, crit_click: 10, patience: 10, extra_click: 6,
    speed2: 15, remote: 15, rp_boost: 15, click10: 20, cheap2: 20, offline16: 20, cps_crit: 25,
    morale2: 25, teamwork: 12, fuel_eff: 14, rp_first: 18, event_boost: 22,
    quantum2: 40, offline24: 40, prestige2: 50, singular: 80, mega_click: 60, cost3: 60, rp2: 70,
    luck: 50, auto2: 35, team2: 45, fuel2: 55, rp3: 65,
    transcend: 100, ascend: 150, eternity: 200, grand_cost: 150, grand_off: 120, deep_space: 180,
    grand_pp: 180, grand_rp: 180, project2: 100, crit2: 150, grand_click: 200, true_end: 500,
    event3: 110, team3: 160, entropy_reduce: 75, ai_core: 50,
  },
  // v2.1：保留科技（解锁钥匙）——仅 6 项，其余 46 项效果全部迁移到建筑
  v21KeyTechs: ['click_up', 'offline1', 'focus_opt', 'entropy_reduce', 'deep_space', 'ai_core'],
  // v2.1：组 D 扩容建筑防死锁钳制（与 storageAntiDeadlockRatio 同口径）
  // v2.4：新增多效果上限建筑（abyss_reservoir/resonance_chamber/dm_condenser）同步纳入 30% 钳制
  v21CapClampIds: ['quantum_pool', 'dim_compressor', 'overlimit_store', 'abyss_reservoir', 'resonance_chamber', 'dm_condenser'],
  // v2.2 岔路口重设计：三栋互斥定向建筑（PM §2——资产持有即走向；纯走向声明，无数值效果，
  // 不混入 buildingsV21 表以便族升级断言圈定范围；先例 abyss_fishbowl / compiler_temple 风味建筑）
  crossroadBuildings: [
    { id: 'order_pillar', name: '秩序奠基塔', cat: 'X', cap: 1, base: 3e5, growth: 1, unlockTech: null, fx: null, desc: '立誓秩序：本局与转生均走向秩序重构者线（购买后其余两栋封印）' },
    { id: 'abyss_anchor', name: '裂隙共鸣锚', cat: 'X', cap: 1, base: 3e5, growth: 1, unlockTech: null, fx: null, desc: '立誓深渊：本局与转生均走向深渊行者线（购买后其余两栋封印）' },
    { id: 'faith_shrine', name: '信仰圣龛',   cat: 'X', cap: 1, base: 3e5, growth: 1, unlockTech: null, fx: null, desc: '立誓信仰：本局与转生均走向信仰传播者线（购买后其余两栋封印）' },
  ],
  // v2.2：定向建筑 ↔ 故事线 双射
  // v2.7.3 ⑤：轮回（终极重置）——回响获取克制：8×√(本局成就评分)，单次上限 100；
  // 升级克制：基准 50 × 1.6^级，cap 3~5，回响池有限 → 自然克制增长
  reincarn: {
    echoBase: 8, echoCap: 100,
    scoreWeights: { prestige: 2, delve: 0.5, ember: 0.1, faith: 0.05 },
    needEp: 1e9, // 本局累计 EP ≥ 10 亿才可轮回（且本局 ≥ 1 次晋升）
    // v2.8.4：深渊遗存——每次轮回按本局最强维度自动携带 1 座（跨轮回保留，cap 3，克制）
    // 参考 KG：跨周期资源通过「建筑」承载而非直接继承数值
    legacy: [
      { id: 'relic_core',   name: '湮灭核心', fx: 0.25, needKey: 'delve', need: 5,   desc: '全局产出 ×1.25/座（本局深潜 ≥5 层时轮回携带）' },
      { id: 'relic_vault',  name: '记忆库',   fx: 2.0,  needKey: 'colony', need: 5,  desc: 'EP 存储上限 ×2/座（本局殖民总级 ≥5 时轮回携带）' },
      { id: 'relic_anchor', name: '虚空锚',   fx: 0.25, needKey: 'rift', need: 10,  desc: '裂隙余烬 +25%/座（本局裂隙封印 ≥10 次时轮回携带）' },
    ],
    legacyCap: 3,
    upgBase: 50, upgGrowth: 1.6,
    upgs: [
      { id: 'echo_global', name: '回响增幅', cap: 5, desc: '回响全局倍率 ×1.3/级（叠乘）' },
      { id: 'echo_rift', name: '裂隙共鸣', cap: 3, desc: '裂隙余烬获取 ×2/级' },
      { id: 'echo_delve', name: '深潜共振', cap: 3, desc: '深潜产出 ×1.5/级' },
      { id: 'echo_faith', name: '信仰共鸣', cap: 3, desc: '信仰产出 ×1.5/级' },
      { id: 'echo_pet', name: '异兽共鸣', cap: 3, desc: '宠物经验获取 ×2/级' },
    ],
  },
  crossroadToLine: { order_pillar: 'line_order', abyss_anchor: 'line_abyss', faith_shrine: 'line_faith' },
  lineToCrossroad: { line_order: 'order_pillar', line_abyss: 'abyss_anchor', line_faith: 'faith_shrine' },
  // v2.4：族升级仅保留产出族（组E 非锚点 3 座）。扩容族（组D）随 KG 模式改造整体移除——
  // 扩容类建筑已无限升级（unlimited），族升级的「等级上限扩展」失去钳制对象，档位删除（历史 v2.2 规划 20→25→30→35 废止）。
  familyUpgradeTiers: {
    output: {      // 产出族（PM 终稿 7698334831112899877 白名单口径：组E 非锚点 3 座，组B 整组不开放）
      cats: ['B', 'E'],
      tiers: [
        { rp: 350000,  milestone: 9, addCap: 3 },   // 9→12；反解见 artifacts/v22-rp-recalb.py（12.5h 可达，两档合计 1.25M ≤ 60%×终态结余 2.13M）
        { rp: 900000,  milestone: 9, addCap: 4 },   // 12→16（硬顶 16 钳制）；17.8h 可达
      ],
      hardCap: 16,
    },
  },

  // v1.3 模块 A：AI 助手
  ai: {
    interval: 5,                    // 决策周期（秒）
    reserveOptions: [0.1, 0.3, 0.5], // 预留线三档（EP 上限比例）
    defaultReserve: 0.3,
    // v2.5.5：AI 自动购建（全部资源点解锁后可激活）
    aiAutoBuild: {
      activateCost: 2e6,            // 激活消耗（大量 EP，一次性）
      rateOptions: [5, 10, 30, 60], // 购买间隔档位（秒）
      defaultRate: 10,              // 默认间隔
      minRate: 5,                   // 硬下限：即使改存档也不低于 5s（严格限速）
      perTickMax: 1,                // 每个决策周期至多购买 1 栋（严格防竞争）
    },
  },
  subsist1: 0.25,
  subsist2: 0.35,
  // v2.1 专注成本（评审 D5 拍板：30 × 1.6^n，进 balance 统一管理）
  focus: { base: 30, growth: 1.6 },
  // v2.0.2 数值重设计（有限级制，用户硬约束「建筑数量受控」）：
  // 存储节点级价 150×1.25^级（温和上涨），级增量 +2,000 起步、逐级 ×1.12 递增；
  // v2.4 KG 模式改造：maxLevel 封顶解除（无限升级），级价与级增量公式不变，成本递增自然形成后期性价比递减；
  // 20 级参考值总上限 ≈146K；maxLevel 字段保留仅供存档兼容截断与历史断言参考，不再作购买上限
  storage: { base: 150, growth: 1.25, capPer: 3000, capGrowth: 1.15, maxLevel: 20 }, // v2.8.2：capPer 2000→3000、capGrowth 1.12→1.15（中期上限宽松）
  storageMileBonus: 0.25,                                // 每个已达成里程碑：上限 +25%（乘算基座）
  // v2.0.2：数据中心每级额外增加 EP 存储上限（映射现有建筑，不造新概念）
  datacenterCapBonus: [0, 10000, 25000, 50000],
  // v2.0.2：防死锁硬约束——扩容项价格 ≤ 当前 EP 上限 ×30%（KG 谷仓模式：扩容永远只是存量的一小部分）
  storageAntiDeadlockRatio: 0.3,
  // v2.1 R3-D 裂隙封印成本改为当前上限的 30%~50%（脱离 log10(cps) 曲线）
  rift: {
    sealRatioMin: 0.3, sealRatioMax: 0.5,
    spawnSec: 1200,                 // 基础出现间隔（20 分钟；哨站升级逐级 -25%，下限 360s）
    levelNames: ['浅层裂隙', '中层裂隙', '深层裂隙', '深渊裂隙', '虚空之隙'],
    rpPerLevel: 0.5,                // 封印 RP 奖励（/级；RP 锚点解锁后生效）
    vsChance: 0.25,                 // 封印/拥抱 VS 概率（深潜解锁后）
    faithChance: 0.20,              // 封印/拥抱信仰概率（宗教解锁后）
    // 深入裂隙（第三选项）：持续探索 60s，产出递增、腐化累积，超阈值结算损失
    delveDurSec: 60, delveDmPerLevel: 0.5, delveVsPerLevel: 0.2,
    delveCorruptPerLevel: 1.0,      // 每秒腐化累积 %/级
    delveFailCorrupt: 50,           // 结算时腐化阈值：>50% 触发损失
    delveFailLoss: 0.3,             // 损失 = 封印成本 ×0.3（EP）
    delveBonusDm: 3,                // 完成额外 DM ×级
    // 裂隙余烬（跨转生保留）
    emberSeal: 10, emberEmbrace: 8, emberDelve: 5,
    upgBase: 20, upgGrowth: 1.6,
    upgrades: {
      sentinel: { name: '裂隙哨站', cap: 5, desc: '裂隙出现更快：间隔缩短 25%/级（20 分钟 → 15 分钟 → 11 分钟 → 8 分钟 → 6 分钟，下限 6 分钟）' },
      lens:     { name: '裂隙透镜', cap: 5, desc: '裂隙 DM/RP 奖励 +20%/级' },
      charm:    { name: '裂隙护符', cap: 5, desc: '封印成本 -10%/级（下限 50%）' },
      echo:     { name: '余烬共振', cap: 3, desc: '虚空碎片（VS）奖励 +50%/级（深潜联动）' },
    },
  },
  // 里程碑（v2.3 奖励校准，PM §5.1 两锚点）：
  // 前 3 档（cps 5/10/100→RP 1/2/4）合并为 1 档（cps 100→RP 8）——低档零散供给无感，合并提升单次获得感；
  // 中段 3 档维持；后 3 档锚定「钥匙科技 326 RP 达成曲线 / 族升级首档 260k 达成时点」大幅上调（25/40/60→1000/5000/20000），
  // 使里程碑成为中后期 RP 供给主力。锚点核验：ΣRP=26039 ≥ 326×60%≈196（钥匙总需求 60% 下限）；
  // 单档最大 20000 ≤ 终局结余 2.1M×5%=105k。milesDone 以 cps 值为键：旧档已领 {5,10} 保留不重发，已领 100 不补发 8。
  miles: [
    { cps: 100, rp: 8 }, { cps: 1e3, rp: 6 },
    { cps: 1e4, rp: 10 }, { cps: 1e5, rp: 15 }, { cps: 1e6, rp: 1000 }, { cps: 1e7, rp: 5000 },
    { cps: 1e8, rp: 20000 },
  ],
  // 科技乘数压缩（v2.0 §1.3）
  techMult: {
    speed2: 2, quantum2: 2.5, singular: 6, transcend: 12,
    ascend: 20, eternity: 40, true_end: 100,
  },
  // 全局乘数软上限（v2.0 §1.3：m > 5000 → 5000 + sqrt(m-5000)*70）
  softCapThreshold: 5e3,
  softCapFactor: 70,
  // 项目奖励
  projRpMin: 3, projRpMax: 8,
  // 事件奖励
  brainstormRp: 35, epiphanyRp: 80,
  // 线程补贴科技
  fuelEff: 0.2, fuel2: 0.25,
  // 深渊潮汐（v2.0 §2：4 相位 × 150s 循环）
  tide: {
    phaseDuration: 150,
    phases: [
      { id: 0, name: '涨潮', icon: '🌊', epMult: 1.3, salaryMult: 1.5, techCostMult: 1, eventBadWeight: 1, eventGoodDur: 1.5, cssClass: 'tide-flood' },
      { id: 1, name: '平潮', icon: '🌀', epMult: 1, salaryMult: 1, techCostMult: 1, eventBadWeight: 1, eventGoodDur: 1, cssClass: 'tide-calm' },
      { id: 2, name: '退潮', icon: '⛰️', epMult: 0.7, salaryMult: 0.8, techCostMult: 0.8, eventBadWeight: 1, eventGoodDur: 1, cssClass: 'tide-ebb' }, // techCostMult：科技树研究成本 ×0.8（退潮期研究 -20%，非升级/建筑成本）
      { id: 3, name: '乱流', icon: '⚡', epMult: 1, salaryMult: 1.3, techCostMult: 1, eventBadWeight: 2, eventGoodDur: 1, cssClass: 'tide-chaos' },
    ],
  },
  // 矩阵腐化（v2.0 §3）
  // v2.8.3 星际探索补模块：深空殖民（deep_space 解锁后，expedition tab 内单独渲染）
  starColonies: [
    { id: 'colony1', name: '近地殖民站', base: 2e6,  growth: 1.5, cap: 10, rpRate: 0.05, desc: '每级 +0.05 RP/s（深空殖民长期补充）' },
    { id: 'colony2', name: '星港定居点', base: 2e8,  growth: 1.6, cap: 5,  rpRate: 0.3,  desc: '每级 +0.3 RP/s' },
    { id: 'colony3', name: '环恒星城',   base: 2e10, growth: 1.7, cap: 3,  rpRate: 2,    desc: '每级 +2 RP/s（探索收益 +10%/级）' },
  ],
  colonyExploreBonus: 0.10, // 每殖民等级 深空探索收益 +10%
  // v2.8.5：星际里程碑——殖民总级数门槛一次性奖励（EP/RP），长线引导深空殖民
  starMilestones: [
    { need: 3,  rp: 10,  ep: 5e5,  name: '星系立足' },
    { need: 6,  rp: 40,  ep: 5e7,  name: '星海殖民' },
    { need: 10, rp: 150, ep: 5e9,  name: '星际联邦' },
  ],

  // v2.8.4：研究点专属升级（RP 购买，研究点 tab 渲染；长线消耗 RP，克制——cap 8-10 + 成本指数涨）
  researchUpgs: [
    { id: 'rp_entropy',     name: '熵减研究',   cap: 10, base: 50, growth: 1.6,  fx: { key: 'ep',   v: 0.05 }, desc: '基础 EP 产出 +5%/级' },
    { id: 'rp_matrix',      name: '矩阵意识',   cap: 10, base: 60, growth: 1.6,  fx: { key: 'thread', v: 0.05 }, desc: '线程产出 +5%/级' },
    { id: 'rp_singularity', name: '奇点推演',   cap: 10, base: 80, growth: 1.65, fx: { key: 'global', v: 0.04 }, desc: '全局产出 ×1.04/级（叠乘）' },
    { id: 'rp_delve',       name: '深渊观测',   cap: 8,  base: 100, growth: 1.7, fx: { key: 'delve', v: 0.10 }, desc: '深潜产出 +10%/级' },
    { id: 'rp_rift',        name: '裂隙数学',   cap: 8,  base: 120, growth: 1.7, fx: { key: 'rift', v: 0.15 }, desc: '裂隙余烬 +15%/级' },
  ],
  corruption: {
    accumulateRate: 0.1,       // 每秒按溢出比例累积
    penaltyPerPercent: 0.003,  // 每 1% 腐化 -0.3% 产出
    penaltyFloor: 0.7,         // 惩罚下限 30%
    max: 100,
    purifiers: [
      { id: 'purifier1', name: '净化节点 I', base: 5e4, rate: 0.5, desc: '每秒清除 0.5% 腐化（压制路线；深渊之心的腐化收益按峰值判定，不受净化抵消）' },
      { id: 'purifier2', name: '净化节点 II', base: 5e6, rate: 2, desc: '每秒清除 2% 腐化（压制路线；深渊之心的腐化收益按峰值判定，不受净化抵消）' },
      { id: 'purifier3', name: '净化节点 III', base: 5e8, rate: 5, desc: '每秒清除 5% 腐化（压制路线；深渊之心的腐化收益按峰值判定，不受净化抵消）' },
    ],
  },
};
