// v2.0 数值配置中心：所有平衡常量集中于此（设计方案 §4.1）

// ===== v3.7.4 反馈①：组 A「产出与效率」价效统一口径 =====
// 旧问题：base 与 fx.value 各自手填 → 预热节点 +2% 要 2.5e5、效能尖塔 +10% 也是 2.5e5，
//   同价不同加成（截图 455.63K / 525.63K / 552.00K 对应 +2% / +10% / ×1.12）；
//   desc 又混用「+X%」（加算）与「×N」（乘算），玩家无法横向比较性价比。
// 新口径（三项不变量，由 tests/v374-value-price-unit.test.mjs 锁定）：
//   ① 文案唯一真源 aGain()：+X% 由 fx 派生（乘算按 value-1 折算成等效每级增量），全组同句式；
//   ② 入门三座 aBase()：Lv.0 基价 = 增量% × A_UNIT_PRICE，growth 统一 A_GROWTH
//      → 任意等级下「价格比 ≡ 加成比」（成本 growth^lv 对三者同比作用）；
//   ③ 后期七座单价档逐档抬高、单调递增以抑制速通，base 保持 v3.4.2 标定，
//      里程碑价位映射（<6e5 / 6e5 / 1.5e6 / 4e6）不因本轮改动跨档。
const A_UNIT_PRICE = 3e4;   // 入门档：每级 +1% 全局产出 = 3 万 EP（Lv.0 基价）
const A_GROWTH = 1.40;      // 入门三座统一成本递增，保证同等级下比例不漂移
const aPct = (key, value) => Math.round((key === 'globalMul' ? value - 1 : value) * 100);
const aGain = (key, value) => ({ fx: { key, value }, desc: `每级全局产出 +${aPct(key, value)}%` });
const aBase = (key, value) => aPct(key, value) * A_UNIT_PRICE;

export const BALANCE = {
  // 初始与前期
  initialEp: 0, // v2.8.1：EP 开局不送（新档从 0 开始，靠点击/线程产出起步）
  scribble: { base: 120, cps: 0.12 },  // v2.8.27：首轮 7-10 天节奏——基础成本 ×3、产出 ×0.5（原 v2.8.3 base 40/cps 0.25）
  script: { base: 960, cps: 0.85 },  // v2.8.27：×3 / ×0.5
  parallel: { base: 10800, cps: 3.5 }, // v2.8.27：×3 / ×0.5
  atrium: { base: 5e4, rate: 0.15, epRate: 150, growth: 2.2 }, // v3.0.3 第四批③：升级曲线陡化（消耗 EP 大幅增多）
  // v3.4.0 反馈③：异兽孵化（EP→PT）统一配置——此前 5000 EP/s 与 0.00003 PT/EP 硬编码在 main.js/pets.js 两处，
  // 产出与消耗口径易漂移（线程加成只乘产出、不乘消耗 → 线程越多单位 PT 越便宜）。
  // 新口径：15000 EP/s/级 ÷ 15 万 EP/PT = 0.10 PT/s/级（boost 1）；原 5000 EP/s → 0.15 PT/s（3.3 万 EP/PT）。
  // 即：PT 产出 -33%，单位 PT 的 EP 成本 ×4.5；线程加成同时乘「消耗」与「产出」，EP/PT 恒定。
  hatch: { epPerSec: 15000, epPerPt: 150000 },
  oracle: { base: 5e11, rate: 2 },
  thread: {
    firstCost: 360, baseOutput: 1.0, baseOutputJitter: 1.0, salaryBase: 1.12, salaryPerThreadCap: 1.8, // v2.8.27：线程成本 ×3、基础产出 ×0.5（首轮 7-10 天） // v2.8.24 ③：线程薪资大幅上调（1.04→1.12 指数增长、单线程封顶 0.9→1.8/s）——EP 一天爆仓根因是持续消耗占比过低（产出 329K/s 时消耗仅 200/s）
    crewUnlockThreads: 10, // v3.6.2 反馈①：班组面板 ≥10 条线程后解锁
    // v3.4.8 反馈⑥：薪资保底改「产出:薪资 ≈ 1.5:1」——原保底仅 10%（产出 20.97K/s 时薪资才 452/s，比例 46:1）。
    //   现在薪资下限 = 线程产出 × (1/1.5) ≈ 66.7%，班组面板恒为 1.5:1 左右（消耗成为主要 EP 去向）
    salaryOutputRatio: 1 / 1.5,
    // v1.3 模块 C：线程薪资四态状态机（设计文档 §2 数值框架）
    wages: {
      // v2.8.1：状态转换节奏放缓（放置游戏真实时间尺度）——黄线 30s 薪资 / 欠薪 60s 才休眠 / 休眠 30min 才流失预警 / 恢复线 3min 薪资 / 缓冲 60s
      warnSec: 30,          // 黄线：EP < 30s 薪资 → 欠薪
      debtMult: 0.7,        // 欠薪产出系数
      dormantAfterSec: 60,  // 连续欠薪 60s → 强制休眠
      keepCostMult: 0.3,    // 休眠期保命成本 = 薪资 ×0.3
      loseAfterSec: 1800,   // 休眠持续 30 分钟 → 流失预警
      loseChancePerMin: 0.1,// 流失预警期每 60s 10% 概率流失 1 线程
      recoverSec: 60,       // v2.8.10：恢复线降为 1min 薪资（原 3min 缓冲过长，EP 回升后迟迟不流转）
      bufferSec: 15,        // v2.8.10：休眠恢复缓冲 15s → 满薪（原 60s 过长）
      transitionSec: 5,     // v2.8.7：普通状态转换过渡（欠薪→恢复等需 5s 维持，不瞬间切换）
      restBonusMult: 1.5,   // 休眠/流失 ≥60s 恢复后补偿——产出 ×1.5 持续 120s
      restBonusSec: 120,
    },
    // v3.3.0 线程绑定系统数值（绑定到 EP 转化类生产建筑后的产出/消耗/加成/等级）
    binding: {
      outputFactor: 0.6,        // 绑定非擅长岗位：该线程自由 EP 产出 ×0.6（产出被抽调 → ep 产出减少）
      salaryFactor: 1.5,        // 绑定非擅长岗位：该线程消耗 ×1.5（线程消耗增多）
      lazyOutputFactor: 0.4,    // 懒惰线程绑定：自由产出 ×0.4
      lazySalaryFactor: 2.25,   // 懒惰线程绑定：消耗 ×2.25
      // v3.6.3 反馈②：超线程岗位（无需解锁任何模块即可分配）
      hyperOutputMult: 1.1,     // 该线程自由 EP 产出 ×1.1
      hyperSalaryMult: 1.1,     // 该线程消耗 ×1.1
      matchLevelBonus: 0.04,    // 每级：匹配岗位转化加成 +4%/级（v3.3.1 反馈⑩：转化加成略微下调）
      mismatchLevelBonus: 0.01, // 每级：非匹配岗位转化加成 +1%/级
      matchProfBonus: 0.15,     // 匹配岗位额外转化加成 +15%（v3.3.1 反馈⑩：25%→15%，消耗增多的收益略微减少）
      mismatchProfBonus: 0.03,  // 非匹配岗位额外转化加成 +3%
      leaderBonus: 0.08,        // 领导者绑定额外 +8%
      leaderGlobalPerLeader: 0.10, // 全局产出 +10%/领导者（v3.3.1 反馈⑤：领导唯一，单人加成上调）
      leaderGlobalCap: 0.10,    // 全局加成上限 +10%（领导只能存在一个）
      xpPerSec: 1,              // 在岗每秒 XP 基础
      xpSuitableMult: 2.5,      // 匹配/领导岗位 XP ×2.5（合适岗位等级涨得多）
      xpCap: 6000,              // XP 上限（封顶等级用）
      levelMultPerLevel: 0.08,  // 每级个人产出 +8%（高等级加成高）
      levelCap: 10,             // 等级上限
      lazySpawnChance: 0.12,    // 懒惰职业出现概率（负面线程少）
      autoAssignShare: 0.7,     // 招募时按需求建议职业的概率（AI/手动招募与职业联动）
    },
  },
  // v2.7.1：线程懒惰态（EP 满上限惩罚）——持续满上限后线程怠工：产出降、消耗升，
  // 使消耗 > 产出（鼓励玩家持续投入 EP 而非囤满挂机）；EP 跌到 0 或任意升级/购买解除
  lazy: { afterSec: 60, prodMult: 0.25, costMult: 2.5 }, // v2.7.1：怠工幅度保证任意阶段消耗>产出（单线程 3/s×0.25 < 薪资 0.5/s×2.5）
  // v1.3 模块 D：探采平台联动数值
  vehicles: {
    ids: ['scooter', 'convoy', 'orbital', 'submersible'],
    // v3.3.8 反馈①：整体重标定——探采不再吃班组乘区，改为「低兑换率 + 按秒连续结算」
    // v3.4.0 反馈④：DM 产出再降（27 辆 ≈ 15 DM/s → ≈1 DM/s），单位 DM 的 EP 成本 ×5（汇率随辆数递增照旧）
    epPerDm: 15000,                     // v3.4.0：3000→15000（DM 稀缺化后单 DM 该更贵；27 辆 ≈ ×4.8 → 约 72K EP/DM）
    epPerDmGrowth: 1.06,                // v3.3.8：1.15→1.06（逐辆递增保留，但不再呈指数爆炸；27 辆 ≈ ×4.8）
    dmRates: [0.2, 0.4, 1, 2],          // v3.4.0：每辆 DM/min（6/12/30/60 → ÷15；27 辆实测约 1 DM/s）
    collectInterval: 60,                     // 采集 roll 周期（秒）
    tierDmBonus: [0, 0, 1, 1, 2],           // 封印裂隙 DM 加成（按最高档 0~4）
    embraceBonusSec: 5,                     // 拥抱裂隙爆发时长加成（秒 × 档位）
    protocolMult: 1.5,                      // v3.7.3：载具协议 → 全载具 DM 采集速率 ×1.5（不再乘 CPS）
    protocolDmCost: 20,
  },
  // v1.3 模块 B：功能建筑（一次性多级，效果经读侧修饰 wages 生效值）
  // v2.1：数据中心随 RESCALE 重标定——原 base 1e6 growth 10 在终局上限（≈3.7e11）下远期失衡，
  // 重标为 base 8e4 growth 4（三档 8e4 / 3.2e5 / 1.28e6），并纳入 30% 防死锁钳制（组长硬性要求：DC 三档成本随 cap 曲线重标定）
  buildings: {
    canteen:    { id: 'canteen', name: '能量食堂', levels: 3, base: 2e4, growth: 8,  desc: ['欠薪产出系数 +0.10（0.7 → 0.8）', '欠薪产出系数 +0.10（0.8 → 0.9）', '欠薪产出系数 +0.05（0.9 → 0.95）'] },
    dorm:       { id: 'dorm', name: '休眠舱', levels: 1, base: 5e4, growth: 1,  desc: ['休眠期保命成本 -50%（0.3 → 0.15）'] },
    dock:       { id: 'dock', name: '维修坞', levels: 1, base: 2e5, growth: 1,  desc: ['线程维护：流失概率 -50%'] }, // v2.8.19：效果实装、描述明确
    datacenter: { id: 'datacenter', name: '数据中心', levels: 3, base: 8e4, growth: 4, desc: ['每 10 线程全局产出 +5%，EP 存储上限 +10,000', '每 10 线程全局产出 +10%，EP 存储上限 +25,000', '每 10 线程全局产出 +15%，EP 存储上限 +50,000'] },
    abyss_fishbowl: { id: 'abyss_fishbowl', name: '深渊鱼缸', levels: 3, base: 5e5, growth: 1, desc: ['DM 采集效率 +20%', 'DM 采集效率 +40%', 'DM 采集效率 +60%；裂隙封印奖励 +5 DM'] },
    wish_well: { id: 'wish_well', name: '许愿池', levels: 1, base: 1e5, growth: 1, desc: ['万一呢？'] }, // v3.2.3 反馈②：文案回归「万一呢？」（原长说明过详）；v3.0.3：从研究升级移入通用设施
  },
  // ===== v2.1 建筑驱动转向（PM 设计文档 §2.2 + 终章 RESCALE 价梯，唯一数值基准）=====
  // 级制红线：重复购买即升级（KG 工坊模式），effect = value × level；效果类 ≤9 级、乘算锚点 ≤3 级、扩容类 ≤20 级，禁止无限堆叠
  // 价格 = base × growth^当前级 × costMult()（沿用 v1.3 模块 B 公式）
  // unlockTech = 原 52 科技 ID（作 RP 解锁定价基准：原 RP × buildingUnlockRatio）；保留钥匙（click_up 等 6 项）另作族门控
  buildingsV21: [
    // ---- 组 A · 全局乘数（10 座）----
    // v3.4.2 反馈①「效能建筑还是太便宜了，提升多消耗又少」：全组重标价（满级总投入与收益同阶）。
    // v3.7.4 反馈①「加成和价格不成比例、显示文案不同」：入门三座按 aBase 重排，全组 desc 走 aGain。
    //   价效阶梯（Lv.0 每 +1% 的单价）：入门三座 3e4 → 调度中枢 6e4 → 锚链 1e5~2.16e5，单调递增。
    { id: 'warmup_node',    name: '预热节点',   cat: 'A', cap: 5, base: aBase('globalAdd', 0.02), growth: A_GROWTH, unlockTech: 'warmup',    ...aGain('globalAdd', 0.02) },
    { id: 'eff_tower',      name: '效能尖塔',   cat: 'A', cap: 9, base: aBase('globalAdd', 0.10), growth: A_GROWTH, unlockTech: 'eff2',      ...aGain('globalAdd', 0.10) },
    { id: 'double_workshop',name: '双倍工坊',   cat: 'A', cap: 9, base: aBase('globalMul', 1.12), growth: A_GROWTH, unlockTech: 'speed2',    ...aGain('globalMul', 1.12) },
    { id: 'dispatch_hub',   name: '调度中枢',   cat: 'A', cap: 9, base: 1.2e6, growth: 1.40, unlockTech: 'auto2',     ...aGain('globalAdd', 0.20) },
    { id: 'quantum_stacker',name: '量子叠加器', cat: 'A', cap: 3, base: 2e6,   growth: 1.45, unlockTech: 'quantum2',  ...aGain('globalMul', 1.20) },
    { id: 'singularity_core',name: '奇点反应堆',cat: 'A', cap: 3, base: 2.6e6, growth: 1.48, unlockTech: 'singular',  ...aGain('globalMul', 1.25) },
    { id: 'transcend_temple',name: '超越圣殿', cat: 'A', cap: 3, base: 3.2e6, growth: 1.48, unlockTech: 'transcend', ...aGain('globalMul', 1.20) },
    { id: 'ascend_spire',   name: '飞升尖塔',   cat: 'A', cap: 3, base: 3.8e6, growth: 1.50, unlockTech: 'ascend',    ...aGain('globalMul', 1.20) },
    { id: 'eternity_hall',  name: '永恒回廊',   cat: 'A', cap: 3, base: 4.6e6, growth: 1.50, unlockTech: 'eternity',  ...aGain('globalMul', 1.22) },
    { id: 'end_shrine',     name: '终焉圣殿',   cat: 'A', cap: 3, base: 5.4e6, growth: 1.50, unlockTech: 'true_end',  ...aGain('globalMul', 1.25) },
    // ---- 组 B · 点击乘数（7 座）----
    // v2.6.3 反馈①：移除「点击与暴击」B 分区（弱化主动点击宗旨；field_1~4 / crit_furnace / crit_reactor / crit_reactor_2 全删；已购旧档乘区随 fx 表缺失自然失效）
    // ---- 组 C · 成本折扣（6 座）----
    // v3.4.2 反馈①：折价类同样重标价（成本 ×0.98/级 的复利极强，原 3 万起、5 万即可买到永久降本）
    // v3.4.5 反馈①：降本类再大幅涨价 + 加成削弱——折价是「对所有后续消费永久生效」的复利，
    //   旧口径满档累计 ×0.511（全部成本几乎对半砍）而总投入不到 5,000 万，明显过强。
    //   新口径：单价 ×5~12、每级折价幅度收窄一档 → 满档累计 ×0.742（约 26% 折扣），总投入 ≈6.3 亿 EP。
    //   minMile：按原档位显式锁定，避免涨价后一律被 unlockMilestoneV21 顶到 m7。
    { id: 'bargain_shop',   name: '议价坊',     cat: 'C', cap: 5, base: 2.5e6, growth: 1.45, unlockTech: 'cheap_start',fx: { key: 'costMul', value: 0.99 },  minMile: 5, desc: '每级所有成本 -1%' },
    { id: 'negotiate_seat', name: '谈判席',     cat: 'C', cap: 3, base: 1.2e7, growth: 1.48, unlockTech: 'cost_opt',   fx: { key: 'costMul', value: 0.98 },  minMile: 6, desc: '每级所有成本 -2%' },
    { id: 'purchase_office',name: '采购总署',   cat: 'C', cap: 3, base: 5e7,   growth: 1.50, unlockTech: 'cheap2',     fx: { key: 'costMul', value: 0.975 }, minMile: 7, desc: '每级所有成本 -2.5%' },
    { id: 'purchase_office_2',name: '采购总署·聚',cat:'C',cap: 2, base: 8e7,   growth: 1.50, unlockTech: 'cost3',      fx: { key: 'costMul', value: 0.97 },  minMile: 7, desc: '每级所有成本 -3%' },
    { id: 'purchase_office_3',name: '采购总署·极',cat:'C',cap: 1, base: 2e8,   growth: 1.30, unlockTech: 'grand_cost', fx: { key: 'costMul', value: 0.95 },  minMile: 7, desc: '所有成本 -5%' },
    { id: 'focus_core',     name: '专注心核',   cat: 'C', cap: 1, base: 3e6,   growth: 1.25, unlockTech: 'focus_opt',  fx: { key: 'focusCost', value: 0.88 }, minMile: 5, desc: '专注成本 -12%' },
    // ---- 组 D · 上限扩容 / 组 G · 离线效率（v3.4.5 反馈③：整组从效能建筑删除）----
    // 删除原因：EP 上限已由升级商店的「存储节点 / 备用粮仓 / 深井仓储」+ 三仓库（矩阵存储库/饵料仓库/星尘金库）
    // 承担，离线效率/上限改由「远程协作」科技基线 + 离线升级（off_eff1~3 / off_cap1~2）+ 天赋/遗物/研究提供，
    // 效能建筑里这一组长期只剩「一组一卡」的碎标题与重复入口。旧档已购等级保留在存档中（不再产生效果）。
    // ---- 组 E · 线程产出（5 座）----
    // v3.3.9 反馈② / v3.4.1 反馈⑤ / v3.4.2 反馈①：三轮涨价；本轮 base 再抬 2.5~6 倍、growth 陡化。
    // 红线保留：产出族（coop_hall/eco_battery/eco_battery_2）满档扩展级 ≤ m=9 期上限 4.0e7。
    { id: 'coop_hall',      name: '协作大厅',   cat: 'E', cap: 5, base: 8e5,  growth: 1.38, unlockTech: 'teamwork',   fx: { key: 'threadAdd', value: 0.08 }, desc: '每级线程产出 +8%' },
    { id: 'team_temple',    name: '团队圣堂',   cat: 'E', cap: 3, base: 5e6,  growth: 1.42, unlockTech: 'team2',      fx: { key: 'threadMul', value: 1.3 },  desc: '每级线程产出 +30%' },
    { id: 'super_team',     name: '超级团队殿', cat: 'E', cap: 2, base: 1.15e7,growth: 1.45, unlockTech: 'team3',      fx: { key: 'threadMul', value: 1.8 },    desc: '每级线程产出 +80%' },
    { id: 'eco_battery',    name: '节能电池',   cat: 'E', cap: 5, base: 8e5,  growth: 1.38, unlockTech: 'fuel_eff',   fx: { key: 'fuelMul', value: 0.90 },   desc: '每级线程薪资 -10%' },
    { id: 'eco_battery_2',  name: '节能电池·II',cat: 'E', cap: 3, base: 1.1e6, growth: 1.40, unlockTech: 'fuel2',      fx: { key: 'fuelMul', value: 0.85 },   desc: '每级线程薪资 -15%' },
    // ---- 组 F · RP 加成（5 座）----
    { id: 'exp_bench',      name: '初探实验台', cat: 'F', cap: 3, base: 6.6e5, rpCost: 300, growth: 1.45, unlockTech: 'rp_first',  fx: { key: 'rpAdd', value: 0.30 },     desc: '每级晋升 RP +30%' },
    { id: 'rp_distiller',   name: 'RP 蒸馏塔', cat: 'F', cap: 3, base: 1.75e6,rpCost: 600, growth: 1.45, unlockTech: 'rp_boost',   fx: { key: 'rpAdd', value: 0.50 },     desc: '每级晋升 RP 获取效率 +50%' },
    { id: 'deep_lab',       name: '深度实验室', cat: 'F', cap: 2, base: 5.6e6, rpCost: 1000, growth: 1.50, unlockTech: 'rp2',        fx: { key: 'rpMul', value: 2 },        desc: '每级晋升 RP +100%' },
    { id: 'theory_desk',    name: '理论突破台', cat: 'F', cap: 2, base: 8e6,   rpCost: 1800, growth: 1.50, unlockTech: 'rp3',        fx: { key: 'rpAdd', value: 1.50 },     desc: '每级晋升 RP +150%' },
    { id: 'legend_institute',name: '传奇研究所',cat: 'F', cap: 2, base: 1.02e7, rpCost: 3000, growth: 1.50, unlockTech: 'grand_rp',   fx: { key: 'rpMul', value: 2 },        desc: '每级晋升 RP +100%' },
    // v2.7.4 ⑦：灵感蒸馏塔——主动消耗 EP 转化 RP（cat F via upgrade，主商店显示；RP 解锁后可用）
    { id: 'rp_distill',     name: '灵感蒸馏塔', cat: 'F', unlimited: true, cap: 20, base: 5e3, rpCost: 20, growth: 1.25, unlockTech: null, via: 'upgrade', fx: { key: 'rpDistill', value: 0.12 }, desc: 'RP 蒸馏效率每级 +12%' },
    // ---- 组 H · 事件/项目（6 座；v3.4.2 反馈①：base ×3、growth 陡化）----
    { id: 'chance_sensor',  name: '机会感知器', cat: 'H', cap: 3, base: 6e5,  growth: 1.45, unlockTech: 'patience',   fx: { key: 'eventFreqAdd', value: 0.30 }, desc: '每级事件触发频率 +30%' },
    { id: 'chance_sensor_2',name: '机会感知器·锐',cat:'H',cap: 2, base: 1.8e6, growth: 1.45, unlockTech: 'event_boost',fx: { key: 'eventRewardAdd', value: 0.50 }, desc: '每级事件奖励 +50%' },
    { id: 'lucky_nebula',   name: '幸运星云',   cat: 'H', cap: 2, base: 3.6e6,  growth: 1.45, unlockTech: 'luck',       fx: { key: 'eventFreqAdd', value: 0.50 }, desc: '每级事件触发频率 +50%' },
    { id: 'event_tide_lab', name: '事件潮汐所', cat: 'H', cap: 1, base: 4.8e6,  growth: 1.30, unlockTech: 'event3',     fx: { key: 'eventFreqMul', value: 2 },  desc: '事件触发频率 +100%' },
    { id: 'proj_supervisor',name: '项目督导室', cat: 'H', cap: 2, base: 1.4e6, growth: 1.45, unlockTech: 'morale2',    fx: { key: 'projRewardAdd', value: 0.50 }, desc: '每级项目奖励 +50%' },
    { id: 'proj_parallel',  name: '项目平行台', cat: 'H', cap: 1, base: 4.8e6,  growth: 1.30, unlockTech: 'project2',   fx: { key: 'maxProjects', value: 2 },   desc: '可并行任务 +2（同时进行 2 个）' },
    // ---- 组 I · 晋升/职级（2 座；满级 ppMult 合计 ×6，对齐终章口径；v3.4.2 反馈①：×3）----
    { id: 'cycle_temple',   name: '轮回圣殿',   cat: 'I', cap: 2, base: 9e5,  growth: 1.45, unlockTech: 'prestige2',  fx: { key: 'ppMul', value: Math.SQRT2 }, desc: '晋升职级点 +41%/级（满 2 级共 +100%）' }, // v3.5.0 反馈③：原「×√2」看不懂，改写为数值倍率
    { id: 'legend_rank_hall',name: '传奇职级殿',cat: 'I', cap: 1, base: 1.5e6,  growth: 1.45, unlockTech: 'grand_pp',   fx: { key: 'ppMul', value: 3 },        desc: '晋升职级点 +200%' },
    // v3.4.5 反馈③：原「既有升级体系镜像」四条（存储节点/缓存优化/备用粮仓/深井仓储，cat D via upgrade）
    // 一并移除——它们本就在升级商店售卖，在效能建筑里是重复入口，也是「存储与续航」整组删掉后残留的空组来源。
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
  // v3.4.5 反馈③：原组 D 扩容建筑（量子缓存池/维度压缩仓/超限储存器/深渊蓄能池/共鸣回廊/深渊凝析塔）随
  // 「存储与续航」整组删除，30% 防死锁钳制名单随之清空——现仅升级商店的 storage/cache 仍走 CAP_EXPANSION_IDS 钳制。
  v21CapClampIds: [],
  // v2.2 岔路口重设计：三栋互斥定向建筑（PM §2——资产持有即走向；纯走向声明，无数值效果，
  // 不混入 buildingsV21 表以便族升级断言圈定范围；先例 abyss_fishbowl / compiler_temple 风味建筑）
  crossroadBuildings: [
    { id: 'order_pillar', name: '秩序奠基塔', cat: 'X', cap: 1, base: 3e5, growth: 1, unlockTech: null, fx: null, desc: '立誓秩序：本局与转生均走向秩序重构者线' },
    { id: 'abyss_anchor', name: '裂隙共鸣锚', cat: 'X', cap: 1, base: 3e5, growth: 1, unlockTech: null, fx: null, desc: '立誓深渊：本局与转生均走向深渊行者线' },
    { id: 'faith_shrine', name: '信仰圣龛',   cat: 'X', cap: 1, base: 3e5, growth: 1, unlockTech: null, fx: null, desc: '立誓信仰：本局与转生均走向信仰传播者线' },
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
      { id: 'relic_core',   name: '湮灭核心', fx: 0.25, needKey: 'delve', need: 5,   desc: '全局产出 +25%/座' },
      { id: 'relic_vault',  name: '记忆库',   fx: 2.0,  needKey: 'colony', need: 5,  desc: 'EP 存储上限 +100%/座' },
      { id: 'relic_anchor', name: '虚空锚',   fx: 0.25, needKey: 'rift', need: 10,  desc: '裂隙余烬 +25%/座' },
    ],
    legacyCap: 3,
    upgBase: 50, upgGrowth: 1.6,
    upgs: [
      { id: 'echo_global', name: '回响增幅', cap: 5, desc: '回响全局倍率 +30%/级' },
      { id: 'echo_rift', name: '裂隙共鸣', cap: 3, desc: '裂隙余烬获取 +100%/级' },
      { id: 'echo_delve', name: '深潜共振', cap: 3, desc: '深潜产出 +50%/级' },
      { id: 'echo_faith', name: '信仰共鸣', cap: 3, desc: 'FP 产出 +50%/级' },
      { id: 'echo_pet', name: '异兽共鸣', cap: 3, desc: '宠物经验获取 +100%/级' },
      // v2.9.0 大项②（参考 KG 长线克制）：扩充 2 项回响升级——存储/薪资双维度
      { id: 'echo_storage', name: '仓储共鸣', cap: 3, desc: 'EP 存储上限 +25%/级（跨轮回）' },
      { id: 'echo_wage', name: '薪酬共鸣', cap: 3, desc: '线程消耗 -6%/级（跨轮回）' },
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
    interval: 5,
    // v3.11.2：AI 助手由「一次性消耗品（每次动作烧 1 名 + 自动补给流）」反转为「常驻班组」——
    // 助手是自动化工人池，自动分配到开启的动作岗位，每动作每周期执行次数 = 分配工人数（越多越强）。
    // 因此删除自动补给流，购买价仍温和递增（天然限购），购买 = 扩编。
    assistants: {
      baseCost: 8e6,          // v3.12.0 反馈⑥：首名 2e6 → 8e6（×4）。30 天实测 5e7 会把首购推到 D20、前 19 天 AI 全线停摆，故回调到中期可负担
      costGrowth: 1.28,       // v3.12.0 反馈⑥：1.12 → 1.28；第 10 名价由 6.2e6 抬到 9.4e7（×15），长期稀缺化才是涨价主体
      researchDiscountCap: 3, // v3.12.0：拟我系研究最多摊薄 ×3，避免满级把涨价整段抹平
    },
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
  // v3.6.0 星际探索：按星系分组的专属资源 + 跃迁（相对论）配置
  starRes: {
    labels: { stardust: '星尘', voidmite: '星髓', dmite: '暗物质晶', plasma: '等离子', exo: '异星遗物' },
    groups: [
      { id: 'g1', name: '猎户臂',       res: ['stardust', 'voidmite'] },
      { id: 'g2', name: '英仙臂',       res: ['dmite', 'plasma'] },
      { id: 'g3', name: '矩尺臂',       res: ['exo', 'stardust'] },
      { id: 'g4', name: '盾牌-半人马臂', res: ['voidmite', 'dmite'] },
      { id: 'g5', name: '船底-外缘臂',   res: ['plasma', 'exo'] },
      { id: 'g6', name: '本地泡',       res: ['stardust', 'exo'] },
    ],
  },
  jump: {
    c: 299792.458,          // 真空光速（km/s）——相对论跃迁硬约束
    baseSpeed: 0.6,         // 基础巡航速度 β = 0.6c
    speedPerLevel: 0.05,    // 每级「跃迁理论」+0.05c（β 硬顶 0.99c）
    colonizeDiscount: 0.1,   // 殖民后探索成本 ×0.1（降一数量级）
    colonizeTimeDiv: 24,     // 殖民后时间从「天」转「小时」：÷24
  },
  subsist1: 0.25,
  subsist2: 0.35,
  // v2.1 专注成本（评审 D5 拍板：30 × 1.6^n，进 balance 统一管理）
  focus: { base: 30, growth: 1.6 },
  // v2.0.2 数值重设计（有限级制，用户硬约束「建筑数量受控」）：
  // 存储节点级价 150×1.25^级（温和上涨），级增量 +2,000 起步、逐级 ×1.12 递增；
  // v2.4 KG 模式改造：maxLevel 封顶解除（无限升级），级价与级增量公式不变，成本递增自然形成后期性价比递减；
  // 20 级参考值总上限 ≈146K；maxLevel 字段保留仅供存档兼容截断与历史断言参考，不再作购买上限
  // v3.4.6 反馈⑫：存储节点与备用粮仓曲线对调——「按照目前的数值，解锁应该先备用粮仓」：
  //   备用粮仓 = 前期防死锁关键件（12K 首购、+4,000/级 ×1.18 递增、20 级封顶、门槛 3.6K EP 先解锁）
  //   存储节点 = 粮仓打基础后的大宗扩容（45K 首购、+12,000/级恒定 ×1.20、无限级、后期单位价更优）
  // v3.4.7 反馈②：存储与资源建筑的「加成」也必须随等级递增（成本一直递增、加成恒定会让后期性价比崩坏）
  //   存储节点：+12,000/级起、逐级 ×1.15 累计（无限级）
  //   深井仓储：+800,000/级起、逐级 ×1.15 累计（终局大宗）
  //   缓存优化：+8,000/级起、逐级 ×1.15 累计（v3.4.7 反馈①：限购 5 级）
  storage: { base: 45000, growth: 1.20, capPer: 12000, capGrowth: 1.15 },
  // v3.4.6：备用粮仓升级曲线（原存储节点曲线整体平移过来）
  reserveBin: { base: 12000, growth: 1.45, capPer: 4000, capGrowth: 1.18, maxLevel: 20 },
  // v3.4.7：深井仓储 / 缓存优化的逐级递增加成配置（economy.epStorageCap 同源读）
  deepBin: { base: 1.8e6, growth: 1.22, capPer: 8e5, capGrowth: 1.15 },
  cacheUpg: { capPer: 8000, capGrowth: 1.15, maxLevel: 5 },
  storageMileBonus: 0.15,                                // 每个已达成里程碑：上限 +15%（乘算基座；v3.10.5 ④ 由 25% 放缓，抑制早期上限过快增长）
  // v3.6.4 反馈②：恢复「首次溢出后 ≈ 1~3 小时存满」的节奏，同时保留 v3.6.3 ① 的
  //   「上限不随线程数量/状态抖动」。做法是时间基座不读「实时 cps」，改读
  //   「结构性投入快照产能」：只在玩家买了升级/建筑（签名变化）时刷新一次产能，
  //   且单调不回落；线程招募、心情、薪资四态、懒惰、吞噬都不触发刷新。
  capHoursFloor: 1,   // 时间基座 = 快照产能 × 1 小时（v3.10.5 ④ 由 2 小时放缓，抑制上限过快增长）
  capOverflowMult: 1.5, // 基座下限 = 结构性上限 ×1.5（v3.10.5 ④ 由 3 放缓）
  // v3.12.0 反馈③：时间基座的「相对硬顶」——过去 cap = cps×3600h + 结构性值，
  //   而 cps 快照单调不回落，后期产能 1e17 时上限被撑到 1e20 量级，备用粮仓 +4,000/级
  //   完全无感（玩家永不购买）。现在基座最多把结构性上限放大 capOverflowHardRatio 倍，
  //   且改用 max() 而非相加：买扩容会等比抬高最终上限，扩容件重新成为唯一成长来源。
  capOverflowHardRatio: 6,
  // v2.0.2：数据中心每级额外增加 EP 存储上限（映射现有建筑，不造新概念）
  datacenterCapBonus: [0, 10000, 25000, 50000],
  // v2.0.2：防死锁硬约束——扩容项价格 ≤ 当前 EP 上限 ×30%（KG 谷仓模式：扩容永远只是存量的一小部分）
  storageAntiDeadlockRatio: 0.3,
  // v2.1 R3-D 裂隙封印成本改为当前上限的 30%~50%（脱离 log10(cps) 曲线）
  rift: {
    sealRatioMin: 0.3, sealRatioMax: 0.5,
    // v3.6.2 反馈②：裂隙改「15 条线程解锁 + 1 小时一遇 + 在场 10 分钟」——
    //   旧口径 10 分钟一遇 + 首次 90 秒必出，前期裂隙太密；现按用户口径重定节奏（哨站仍逐级 -25%，下限不变）
    spawnSec: 3600,                 // 基础出现间隔 1 小时（哨站升级逐级 -25%，下限 240s）
    staySec: 600,                   // 裂隙在场停留时长（未操作 10 分钟后自行闭合）
    threadUnlock: 15,               // 解锁门槛：班组拥有 ≥15 条线程后才可能出现裂隙
    levelNames: ['浅层裂隙', '中层裂隙', '深层裂隙', '深渊裂隙', '虚空之隙'],
    rpPerLevel: 0.5,                // 封印 RP 奖励（/级；RP 锚点解锁后生效）
    vsChance: 0.25,                 // 封印/拥抱 VS 概率（深潜解锁后）
    faithChance: 0.20,              // 封印/拥抱信仰概率（宗教解锁后）
    // 深入裂隙（第三选项）：持续探索 60s，产出递增、腐化累积，超阈值结算损失
    delveDurSec: 60, delveDmPerLevel: 0.5, delveVsPerLevel: 0.2,
    // v3.4.9 反馈④：裂隙等级升级「主要提升净化消耗的 EP，速度只略微提升」——
    //   奖励改 +15%/级（原 ×lv，Lv10 是 Lv1 的 10 倍 → 产出过快）；腐化增速维持 ×lv（等级越高越依赖净化）；
    //   主动净化 EP 消耗改 ∫ 1+0.30×(Lv-1)（Lv10 ×3.7），让高裂隙等级的代价落在净化成本上
    delveRewardGrowth: 0.15, purgeCostPerLevel: 0.30,
    delveEpPerSec: 3.0,         // v2.8.14：深入探索期间消耗 EP（/秒/级，1 级 60s ≈ 180 EP）——EP 耗尽则停止获取奖励并失败
    // v3.4.8 反馈①：深入消耗改指数陡增（原线性 ×lv，高裂隙等级几乎免费）——
    //   消耗 = delveEpPerSec × delveEpGrowth^(Lv-1)：Lv1 3/s、Lv5 28/s、Lv10 232/s、Lv15 1.9K/s
    delveEpGrowth: 1.75,
    // v3.5.0 反馈①：腐化改「按次」定义——旧口径 0.83%/s ×Lv 在 Lv10 一次深入就爆到 100%，
    //   玩家完全没有操作空间。现在：Lv1 每次 33%（3 次填满 0→100%），裂隙等级每 +1 级多 10%，
    //   单次封顶 50%（升到高等级后 2 次填满）——节奏与「升级后 2 次」的口径一致。
    delveCorruptPerRun: 33.3,       // 单次深入（60s）累计腐化 %（Lv1）
    delveCorruptGrowth: 0.10,       // 裂隙每级 +10%（相对 Lv1）
    delveCorruptRunCap: 50,         // 单次深入腐化上限 %（2 次填满）
    delveFailCorrupt: 50,           // 结算时腐化阈值：>50% 触发损失
    delveFailLoss: 0.3,             // 损失 = 封印成本 ×0.3（EP）
    delveBonusDm: 3,                // 完成额外 DM ×级
    // 裂隙余烬（跨转生保留）
    emberSeal: 10, emberEmbrace: 8, emberDelve: 5,
    upgBase: 20, upgGrowth: 1.6,
    // v3.3.9 反馈⑤：裂隙等级改「科技树 · EP+DM 无限升级」——移除余烬探测井的等级上限职能，
    // 裂隙等级 = cps 潜力级（1~5）+ 科技等级（无限），每级提升奖励（DM/RP/余烬）
    levelTech: { baseEp: 2e5, epGrowth: 1.9, baseDm: 10, dmGrowth: 1.7 },
    upgrades: {
      sentinel: { name: '裂隙哨站', cap: 5, desc: '裂隙出现间隔 -25%/级（下限 4 分钟）' }, // v3.3.4 反馈⑤：文案与 riftSpawnSec 同口径
      lens:     { name: '裂隙透镜', cap: 5, desc: '裂隙 DM/RP 奖励 +20%/级' },
      charm:    { name: '裂隙护符', cap: 5, desc: '封印成本 -10%/级' },
      echo:     { name: '余烬共振', cap: 3, desc: '虚空碎片奖励 +50%/级' },
      // v2.8.30：裂隙自动动作（消耗大量余烬，单级；开关互斥最多开一个）
      auto_seal:    { name: '自动封印仪',   cap: 1, desc: '裂隙出现时自动封印' },
      auto_embrace: { name: '自动拥抱协议', cap: 1, desc: '裂隙出现时自动拥抱（-20% EP 换爆发）' },
      auto_descent: { name: '无限深入',     cap: 1, desc: '裂隙出现时自动深入探索（消耗 EP/DM）· 开关在左侧「自动转化」' },
      // v3.4.9 反馈②：昂贵的余烬升级——腐化每涨 5% 自动净化 5%（EP 充足时），需先买「无限深入」
      auto_purify:  { name: '自动净化仪',   cap: 1, emberBase: 1200, desc: '腐化每涨 +5% 自动净化 -5%（消耗 EP）· 开关在左侧「自动转化」' },
      // v3.4.5 反馈②：语音文案改为「???」，动画改为屏幕底部中央一只左右打量你的眼睛（见 modules/abyssGaze.js）
      gaze: { name: '深渊凝视', cap: 1, desc: '???', egg: true },
      // v3.6.0 方向④：裂隙余烬升级树扩充
      wellspring: { name: '余烬井喷', cap: 8, desc: '裂隙余烬产出 +12%/级' },
      voidheart:  { name: '虚空之心', cap: 5, desc: '虚空碎片(VS)奖励 +30%/级' },
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
    // v3.8.0 里程碑扩充（7→9）：只追加更高门槛，既有门槛与 milesDone 键（以 cps 为键）完全不变
    { cps: 1e9, rp: 60000 }, { cps: 1e10, rp: 200000 },
    // v3.9.0 里程碑扩充（9→11，+22.2%）：只追加更高门槛，既有 cps 键与奖励完全不变
    { cps: 1e11, rp: 600000 }, { cps: 1e12, rp: 2000000 },
    // v3.10.0 里程碑扩充（11→13，+18.18%）：只追加更高门槛，既有 cps 键与奖励完全不变
    { cps: 1e13, rp: 6e6 }, { cps: 1e14, rp: 2e7 },
    // v3.11.0 里程碑扩充（13→16，+23.08%）：继续只追加更高门槛，milesDone 的 cps 键不变
    { cps: 1e15, rp: 6e7 }, { cps: 1e16, rp: 2e8 }, { cps: 1e17, rp: 6e8 },
  ],
  // 科技乘数压缩（v2.0 §1.3）
  techMult: {
    speed2: 2, quantum2: 2.5, singular: 6, transcend: 12,
    ascend: 20, eternity: 40, true_end: 100,
  },
  // 全局乘数软上限（v2.0 §1.3：m > 5000 → 5000 + sqrt(m-5000)*70）
  softCapThreshold: 5e3,
  softCapFactor: 70,
  // 项目奖励（v3.12.0 反馈⑧：原 10 分钟满额产出、且可一次灌满整仓 → 奖励过高）
  projRpMin: 3, projRpMax: 8,
  projEpRatio: 0.35,      // 任务 EP 奖励 = 10 分钟基线产出 ×0.35
  projEpCapRatio: 0.25,   // 且不超过当前 EP 上限 ×25%（不再一次灌满整仓）
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
    { id: 'colony1', name: '近地殖民站', base: 2e6,  growth: 1.5, cap: 10, rpRate: 0.05, desc: '每级 +0.05 RP/s' },
    { id: 'colony2', name: '星港定居点', base: 2e8,  growth: 1.6, cap: 5,  rpRate: 0.3,  desc: '每级 +0.3 RP/s' },
    { id: 'colony3', name: '环恒星城',   base: 2e10, growth: 1.7, cap: 3,  rpRate: 2,    desc: '每级 +2 RP/s' },
  ],
  colonyExploreBonus: 0.10, // 每殖民等级 深空探索收益 +10%
  // v3.12.7 ⑧：星际里程碑整表移除——三个门槛改为成就（colony1/colony3/colony6），
  //   不再有独立「可领取」卡片与一次性 EP/RP 结算；殖民本身仍给 RP/s 与探索收益加成。

  // v2.8.4：研究点专属升级（RP 购买，研究点 tab 渲染；长线消耗 RP，克制——cap 8-10 + 成本指数涨）
  researchUpgs: [
    { id: 'rp_entropy',     name: '熵减研究',   cap: 10, base: 50, growth: 1.6,  fx: { key: 'ep',   v: 0.05 }, desc: '基础 EP 产出 +5%/级' },
    { id: 'rp_matrix',      name: '矩阵意识',   cap: 10, base: 60, growth: 1.6,  fx: { key: 'thread', v: 0.05 }, desc: '线程产出 +5%/级' },
    { id: 'rp_singularity', name: '奇点推演',   cap: 10, base: 80, growth: 1.65, fx: { key: 'global', v: 0.04 }, desc: '全局产出 +4%/级' },
    // v3.4.6 反馈②：深渊终局组整组大幅涨价（此前 100~640 RP 满级总投入仅 ≈1.6 万，远低于其永久乘区强度）
    { id: 'rp_delve',       name: '深渊观测',   cap: 8,  base: 650, growth: 1.8, fx: { key: 'delve', v: 0.10 }, desc: '深潜产出 +10%/级' },
    { id: 'rp_rift',        name: '裂隙数学',   cap: 8,  base: 800, growth: 1.8, fx: { key: 'rift', v: 0.15 }, desc: '裂隙余烬 +15%/级' },
    // v2.8.25 ②：研究点内容扩充（5→10 项）——消耗 RP、cap 5-10、成本指数涨；效果全接线
    { id: 'rp_wage',        name: '薪酬协商',   cap: 4,  base: 600,  growth: 1.85, fx: { key: 'wage', v: -0.04 }, desc: '线程消耗 -4%/s' },
    { id: 'rp_storage',     name: '存储协议',   cap: 8,  base: 90, growth: 1.65, fx: { key: 'storage', v: 0.08 }, desc: 'EP 存储上限 +8%/级' },
    { id: 'rp_dm',          name: '星尘精炼',   cap: 8,  base: 100, growth: 1.65, fx: { key: 'dm', v: 0.08 }, desc: '载具 DM 采集 +8%/级' },
    { id: 'rp_faith',       name: '圣颂研究',   cap: 5,  base: 200, growth: 1.8, fx: { key: 'faith', v: 0.10 }, desc: 'FP 产出 +10%/级' },
    { id: 'rp_offline',     name: '离线协议',   cap: 5,  base: 150, growth: 1.8, fx: { key: 'offline', v: 0.12 }, desc: '离线效率 +12%/级' },
    // v3.4.2：研究点菜单扩充（10→20 项）——覆盖产出/消耗/资源/深渊/星空多轴，成本指数涨、cap 6~8
    // v3.4.4 反馈③：本轮新增 10 项一律「基础价 ×4 + 增长指数 +0.10」——效果本就强于同轴老项（+6% vs +5% 等），
    // 原价几乎与老项同档，等于用同样的 RP 买到更强的永久乘区；涨价后成为「后期才买得起的高阶研究」
    { id: 'rp_quantum',  name: '量子推演',   cap: 8, base: 280, growth: 1.70, fx: { key: 'ep',      v: 0.06 }, desc: '基础 EP 产出 +6%/级' },
    { id: 'rp_swarm',    name: '蜂群协议',   cap: 8, base: 320, growth: 1.70, fx: { key: 'thread',  v: 0.06 }, desc: '线程产出 +6%/级' },
    { id: 'rp_harmony',  name: '万物调和',   cap: 8, base: 360, growth: 1.70, fx: { key: 'global',  v: 0.05 }, desc: '全局产出 +5%/级' },
    { id: 'rp_frugal',   name: '精益管理',   cap: 4, base: 2400, growth: 1.90, fx: { key: 'wage',    v: -0.05 }, desc: '线程消耗 -5%/级' },
    { id: 'rp_vault',    name: '量子仓储',   cap: 8, base: 2000, growth: 1.85, fx: { key: 'storage', v: 0.15 }, desc: 'EP 存储上限 +15%/级' }, // v3.4.6 反馈⑬：大幅涨价（380→2000）且存储额增多（10%→15%/级）
    { id: 'rp_immerse',  name: '深渊沉浸',   cap: 8, base: 440, growth: 1.75, fx: { key: 'dm',      v: 0.10 }, desc: '载具 DM 采集 +10%/级' },
    { id: 'rp_relay',    name: '信标中继',   cap: 6, base: 560, growth: 1.80, fx: { key: 'offline', v: 0.15 }, desc: '离线效率 +15%/级' },
    { id: 'rp_void',     name: '虚空凝视',   cap: 6, base: 4000, growth: 1.90, fx: { key: 'rift',    v: 0.20 }, desc: '裂隙余烬 +20%/级' }, // v3.4.6 反馈②：深渊终局组大幅涨价
    { id: 'rp_observe',  name: '深渊观测·改', cap: 8, base: 3200, growth: 1.90, fx: { key: 'delve',   v: 0.12 }, desc: '深潜产出 +12%/级' },
    { id: 'rp_disciple', name: '信徒训导',   cap: 6, base: 880, growth: 1.90, fx: { key: 'faith',   v: 0.12 }, desc: 'FP 产出 +12%/级' },
    // v3.6.0 研究点菜单再扩充（20→30 项）：覆盖星际/政策/AI/殖民/宇宙等长线轴；新键需在对应模块 researchMult 接线
    { id: 'rp_jump',     name: '跃迁理论',   cap: 8, base: 600,  growth: 1.70, fx: { key: 'jump',    v: 0.06 }, desc: '星际跃迁效率 +6%/级' },
    { id: 'rp_starres',  name: '星蕴提纯',   cap: 8, base: 700,  growth: 1.70, fx: { key: 'starres', v: 0.06 }, desc: '星际专属资源产出 +6%/级' },
    { id: 'rp_policy',   name: '律令演绎',   cap: 8, base: 520,  growth: 1.70, fx: { key: 'policy',  v: 0.06 }, desc: '政策效果 +6%/级' },
    { id: 'rp_religion2',name: '神性共振',   cap: 8, base: 1200, growth: 1.80, fx: { key: 'faith',   v: 0.10 }, desc: 'FP 产出 +10%/级（叠加信徒训导）' },
    { id: 'rp_ai',      name: '拟我协议',   cap: 8, base: 900,  growth: 1.75, fx: { key: 'ai',      v: 0.08 }, desc: 'AI 助手效率 +8%/级' },
    { id: 'rp_colony2', name: '星殖民拓',   cap: 8, base: 800,  growth: 1.75, fx: { key: 'colony',  v: 0.08 }, desc: '星殖民产出 +8%/级' },
    { id: 'rp_cosmos2', name: '宇宙工程',   cap: 8, base: 1100, growth: 1.80, fx: { key: 'cosmos',  v: 0.08 }, desc: '宇宙工程星力 +8%/级' },
    { id: 'rp_rift2',   name: '裂隙拓扑',   cap: 6, base: 5000, growth: 1.90, fx: { key: 'rift',    v: 0.18 }, desc: '裂隙余烬 +18%/级（叠加虚空凝视）' },
    { id: 'rp_delve2',  name: '深潜超算',   cap: 8, base: 3600, growth: 1.90, fx: { key: 'delve',   v: 0.12 }, desc: '深潜产出 +12%/级（叠加深渊观测·改）' },
    { id: 'rp_ep2',     name: '熵流增幅',   cap: 8, base: 400,  growth: 1.68, fx: { key: 'ep',      v: 0.08 }, desc: '基础 EP 产出 +8%/级（叠加量子推演）' },
    // v3.7.0 研究项扩充（30→35，+17%）：一律复用已接线的 fx.key，沿用 v3.4.4「高阶 ×4 + growth +0.10」口径，
    // 避免新增无人消费的效果键；五项按语义分入既有 4 组（RP_GROUPS 已同步）。
    { id: 'rp_ep3',     name: '熵流超频',   cap: 8, base: 900,  growth: 1.72, fx: { key: 'ep',      v: 0.09 }, desc: '基础 EP 产出 +9%/级' },
    { id: 'rp_thread2', name: '群体意识',   cap: 8, base: 980,  growth: 1.72, fx: { key: 'thread',  v: 0.07 }, desc: '线程产出 +7%/级' },
    { id: 'rp_project',  name: '项目统筹',   cap: 3, base: 2400, growth: 1.85, fx: { key: 'project',    v: 1    }, desc: '可并行任务 +1/级' },
    { id: 'rp_rift3',   name: '裂隙演算',   cap: 6, base: 6000, growth: 1.90, fx: { key: 'rift',    v: 0.10 }, desc: '裂隙余烬 +10%/级' },
    { id: 'rp_ai2',     name: '拟我演化',   cap: 8, base: 1400, growth: 1.80, fx: { key: 'ai',      v: 0.06 }, desc: 'AI 助手效率 +6%/级' },
    // v3.8.0 研究项扩充（35→40，+14.3%）：沿用「高阶 ×4 + growth +0.10」口径，全部复用已接线 fx.key
    { id: 'rp_ep4',      name: '熵流终式',   cap: 8, base: 1800, growth: 1.78, fx: { key: 'ep',     v: 0.10 }, desc: '基础 EP 产出 +10%/级' },
    { id: 'rp_thread3',  name: '群体共振',   cap: 8, base: 1900, growth: 1.78, fx: { key: 'thread', v: 0.08 }, desc: '线程产出 +8%/级' },
    { id: 'rp_ai3',      name: '拟我终局',   cap: 8, base: 2200, growth: 1.82, fx: { key: 'ai',     v: 0.07 }, desc: 'AI 助手效率 +7%/级' },
    { id: 'rp_rift4',    name: '裂隙终式',   cap: 6, base: 8000, growth: 1.92, fx: { key: 'rift',   v: 0.12 }, desc: '裂隙余烬 +12%/级' },
    { id: 'rp_dm2',      name: '星尘终炼',   cap: 8, base: 1600, growth: 1.78, fx: { key: 'dm',     v: 0.12 }, desc: '载具 DM 采集 +12%/级' },
    // v3.9.0 研究项扩充（40→46，+15%）：沿用「高阶 ×4 + growth +0.10」口径，全部复用已接线 fx.key
    { id: 'rp_ep5',      name: '熵流守夜',   cap: 8, base: 2600, growth: 1.80, fx: { key: 'ep',     v: 0.11 }, desc: '基础 EP 产出 +11%/级' },
    { id: 'rp_thread4',  name: '群体值守',   cap: 8, base: 2700, growth: 1.80, fx: { key: 'thread', v: 0.09 }, desc: '线程产出 +9%/级' },
    { id: 'rp_global2',  name: '全域编排',   cap: 8, base: 3000, growth: 1.82, fx: { key: 'global', v: 0.06 }, desc: '全局产出 +6%/级' },
    { id: 'rp_crew',     name: '班组扩编',   cap: 8, base: 3200, growth: 1.88, fx: { key: 'crew',       v: 0.10 }, desc: '班组全局加成 +10%/级' },
    { id: 'rp_ai4',      name: '拟我值守',   cap: 8, base: 2800, growth: 1.82, fx: { key: 'ai',     v: 0.09 }, desc: 'AI 助手效率 +9%/级' },
    { id: 'rp_dm3',      name: '星尘夜采',   cap: 8, base: 2600, growth: 1.80, fx: { key: 'dm',     v: 0.13 }, desc: '载具 DM 采集 +13%/级' },
    // v3.10.0 研究项扩充（46→55，+19.57%）：沿用「高阶 ×4 + growth +0.10」口径，全部复用已接线 fx.key
    { id: 'rp_ep6',      name: '熵流共鸣',   cap: 8, base: 3400, growth: 1.84, fx: { key: 'ep',     v: 0.12 }, desc: '基础 EP 产出 +12%/级' },
    { id: 'rp_thread5',  name: '群体合弦',   cap: 8, base: 3500, growth: 1.84, fx: { key: 'thread', v: 0.10 }, desc: '线程产出 +10%/级' },
    { id: 'rp_global3',  name: '全域共鸣',   cap: 8, base: 3800, growth: 1.86, fx: { key: 'global', v: 0.07 }, desc: '全局产出 +7%/级' },
    { id: 'rp_expedition',name:'远征后勤',   cap: 8, base: 4000, growth: 1.90, fx: { key: 'expedition', v: 0.12 }, desc: '远征收益 +12%/级' },
    { id: 'rp_policy3',  name: '律令统筹',   cap: 8, base: 4200, growth: 1.90, fx: { key: 'policy',    v: 0.10 }, desc: '政策效果 +10%/级' },
    { id: 'rp_rift5',    name: '裂隙共鸣',   cap: 6, base: 9800, growth: 1.94, fx: { key: 'rift',   v: 0.14 }, desc: '裂隙余烬 +14%/级' },
    { id: 'rp_delve3',   name: '深潜回响',   cap: 8, base: 5200, growth: 1.92, fx: { key: 'delve',  v: 0.14 }, desc: '深潜产出 +14%/级' },
    { id: 'rp_ai5',      name: '拟我合弦',   cap: 8, base: 3600, growth: 1.86, fx: { key: 'ai',     v: 0.10 }, desc: 'AI 助手效率 +10%/级' },
    { id: 'rp_cosmos3',  name: '星力共鸣',   cap: 8, base: 4200, growth: 1.88, fx: { key: 'cosmos', v: 0.10 }, desc: '宇宙工程星力 +10%/级' },
    // v3.10.5 ③：星图同调——星图远征（深空探测）开启后，购买此升级才启用 RP/PT 上限的 EP×比例「产出基座」联动；
    // 未购时 RP/PT 上限只靠各自仓库线性增长，解决「早期 RP/PT 上限就随 EP 涨到千万级」的问题。
    // fx.key='sync' 由 economy.syncUnlocked() 消费（researchMult('sync')>1 即已购），非死键。
    { id: 'rp_sync',     name: '星图同调',   cap: 1, base: 2000, growth: 1.5, fx: { key: 'sync', v: 1 }, requiresTech: 'deep_space', desc: '启用 RP/PT 上限随 EP 上限联动（产出基座）' },
    // v3.11.0 研究项扩充（56→68，+21.43%）：沿用「高阶 ×4 + growth +0.10」口径，
    // fx.key 全部复用既有 researchMult 消费点（无死升级），且不使用需资源门控的 faith 键。
    // 4 组各 3 项，RP_GROUPS 已同步（否则玩家看不到也买不到）。
    { id: 'rp_ep7',      name: '熵流补货',   cap: 8, base: 4200, growth: 1.88, fx: { key: 'ep',     v: 0.13 }, desc: '基础 EP 产出 +13%/级' },
    { id: 'rp_thread6',  name: '群体代班',   cap: 8, base: 4400, growth: 1.88, fx: { key: 'thread', v: 0.11 }, desc: '线程产出 +11%/级' },
    { id: 'rp_global4',  name: '全域台账',   cap: 8, base: 4800, growth: 1.90, fx: { key: 'global', v: 0.08 }, desc: '全局产出 +8%/级' },
    { id: 'rp_bazaar',   name: '集市协议',   cap: 8, base: 4800, growth: 1.92, fx: { key: 'bazaar',     v: 0.12 }, desc: '集市交易收益 +12%/级' },
    { id: 'rp_policy2',  name: '政策推演',   cap: 8, base: 4600, growth: 1.92, fx: { key: 'policy',    v: 0.08 }, desc: '政策效果 +8%/级' },
    { id: 'rp_storage2', name: '周转仓位',   cap: 8, base: 4100, growth: 1.88, fx: { key: 'storage', v: 0.10 }, desc: 'EP 存储上限 +10%/级' },
    { id: 'rp_rift6',    name: '裂隙值守',   cap: 6, base: 11200, growth: 1.96, fx: { key: 'rift',  v: 0.15 }, desc: '裂隙余烬 +15%/级' },
    { id: 'rp_delve4',   name: '深潜补货',   cap: 8, base: 6200, growth: 1.94, fx: { key: 'delve', v: 0.15 }, desc: '深潜产出 +15%/级' },
    { id: 'rp_rift7',    name: '裂隙台账',   cap: 6, base: 11800, growth: 1.96, fx: { key: 'rift',  v: 0.16 }, desc: '裂隙余烬 +16%/级' },
    { id: 'rp_ai6',      name: '拟我代班',   cap: 8, base: 4500, growth: 1.90, fx: { key: 'ai',     v: 0.11 }, desc: 'AI 助手效率 +11%/级（摊薄购买价 / 提升补给）' },
    { id: 'rp_ai7',      name: '拟我补给',   cap: 8, base: 4700, growth: 1.90, fx: { key: 'ai',     v: 0.12 }, desc: 'AI 助手效率 +12%/级' },
    { id: 'rp_cosmos4',  name: '星力代班',   cap: 8, base: 5200, growth: 1.92, fx: { key: 'cosmos', v: 0.11 }, desc: '宇宙工程星力 +11%/级' },
    // v3.0.3：wish_well（许愿池）从研究升级移入通用设施 BALANCE.buildings——避免与设施 tab 重复
  ],
  corruption: {
    accumulateRate: 0.1,       // 每秒按溢出比例累积
    penaltyPerPercent: 0.003,  // 每 1% 腐化 -0.3% 产出
    penaltyFloor: 0.7,         // 惩罚下限 30%
    max: 100,
    // v2.9.0 优化①：主动净化——消耗 EP 换净化，腐化越严重析出 DM 越多（平方曲线）
    // 净化 50% ≈ 消耗 30% 存储上限 EP、析出 50 DM；净化 10% ≈ 6% 上限 EP、2 DM
    purge: { maxCut: 50, epCostPerPct: 0.006, dmPerPctSq: 0.02 },
    purifiers: [
      { id: 'purifier1', name: '净化节点 I', base: 50, dmCost: true, rate: 0.5, desc: '每秒 -0.5% 腐化' },
      { id: 'purifier2', name: '净化节点 II', base: 500, dmCost: true, rate: 2, desc: '每秒 -2% 腐化' },
      { id: 'purifier3', name: '净化节点 III', base: 5000, dmCost: true, rate: 5, desc: '每秒 -5% 腐化' },
    ],
  },
};
