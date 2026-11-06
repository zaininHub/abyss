// 游戏状态 + 存档兼容迁移（v3：新增故事线/渐进开放/特殊任务/彩蛋字段）
import { BALANCE } from './data/balance.js';
import { PROFESSION_BY_ID, LAZY_PROFESSION_ID, LEADER_PROFESSION_ID } from './data/threads.js';

export const SAVE_KEY = 'abyss_idle_v2';
export const SAVE_VERSION = 6;

export function defaultState() {
  return {
    // 基础资源
    ep: BALANCE.initialEp, rp: 0, es: 0, fa: 0, pt: 0, dm: 0,
    startedAt: Date.now(), // v3.6.0 方向⑦：模块解锁按游玩天数推进的基准
    // 统计
    totalClicks: 0, totalBuys: 0,
    runEarned: 0, allTimeEp: 0,
    // 线程
    cultists: [], staffUnhappy: 0,
    // 升级/建筑
    upgrades: {},
    // 科技
    tech: {},
    // 异兽
    pets: {}, activePets: [], fusesDone: 0,
    delve: { up: {} }, vs: 0, // v3.0.3 后续反馈①：up 显式初始化（原缺省致首次 VS 升级 TypeError）
    petXpMult: 1, petXpUntil: 0, fuseLuckUntil: 0,
    // 晋升/永恒
    prestige: 0, prestigePoints: 0, runTalent: null,
    eternal: {},
    // v2.8.4：湮灭残片（崩溃转生 +1，暂无消费用途，仅保留）+ 深渊遗存（轮回携带）+ RP 研究升级
    abyssSplinter: 0, relicLegacy: {}, rpTheories: {},
    // 离线
    offUpgrades: {}, offHistory: [],
    gotOffline: false, lastOfflineSec: 0, lastOfflineGain: 0,
    // 任务版
    projects: [], projectsDone: 0,
    // 探索/宗教
    expeditions: [], expeditionsDone: 0, starMiles: {}, // v2.8.5：星际里程碑已领取记录
    cosmos: { lv: {} }, // v3.0.3 后续反馈④：宇宙探索工程等级（本局制，晋升/轮回重置）
    chaptersUnlocked: {}, // v2.8.5 A3：故事线章节解锁持久化（图鉴）
    devotion: 0, transcend: 0, secretSanctums: {}, // v2.8.6 B1a：虔诚/超验/隐密圣学（跨周期）
    policies: {}, policyRerolls: {}, vowPolicyBoost: false, policyRuns: [], // v2.8.6 B2a：周期政策（每轮重选）+ 政策走向历史
    bazaar: { unlocked: false, trades: 0, refreshCount: 0, shuffleTimer: 0, regenTimer: 0, rates: {}, stock: {} }, // v3.0.0：深渊集市（成交笔数跨周期，库存/汇率每轮重置）
    religion: {}, faith: 0,
    // 事件
    eventsSeen: 0, nextEventAt: Date.now() + 45000,
    // buff/debuff
    buffMult: 1, buffUntil: 0,
    clickBuffMult: 1, clickBuffUntil: 0,
    // 专注
    focusLevel: 0,
    // 里程碑
    milesDone: {},
    // v2.3 资源发现：顶栏首次持有才显示（开局四常显项直接 true，归零不回隐藏）
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
    relics: {}, // v2.7.0：深渊遗物（DM 消费，跨转生保留）
    // 成就
    achievements: {},
    // 剧情
    chapter: '1',
    chapterEnteredAt: Date.now(), // v3.6.0 方向⑥：章节最短驻留天数计时基准
    // 深渊
    abyssLevel: 0, abyssUnlocked: false,
    activeRift: null, riftsSealed: 0,
    riftEmber: 0, riftUpgrades: {}, riftExpedition: null,
    riftLevelTech: 0, // v3.3.9 反馈⑤：裂隙等级科技（EP+DM，科技树无限升级；跨转生保留）
    starCps: 0, fuelMode: false, // v3.4.6 反馈③：星际燃料 CPS（星图探索产出 · 宇宙探索/殖民升级货币 · 燃料模式持续燃烧加速全局）
    starRes: {}, // v3.6.0 方向⑧：按星系分组的星际专属资源（stardust/voidmite/dmite/plasma/exo）
    colonies: {}, // v3.6.0 方向⑤⑧：已建立的星系殖民地（键=星系 id，值=true → 该星系探索消耗 ×0.1、时间 ÷24）
    jumpUses: 0, // v3.6.0 方向⑧：跃迁累计次数（跃迁燃料成本随次数递增）
    _religionHintSeen: false,
    // v2.0 深渊潮汐
    tidePhase: 0,
    tideTimer: BALANCE.tide.phaseDuration,
    // v2.0 矩阵腐化
    corruption: 0,
    // v1.3 模块 C：线程薪资四态状态机（替代 staffUnhappy；旧字段保留读兼容）
    wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 },
    // v1.3 模块 B：功能建筑持有等级
    buildings: {},
    // v3.3.0 线程绑定系统：转化器开关（关闭→释放绑定→线程消耗恢复、EP 产出恢复）
    converterOn: { vehicles: true, atrium: true },
    // v2.1 建筑驱动：已解锁建筑标记 + 旧档超封溢出记账 + 溢出池统计
    unlockedBuildings: {},
    buildingOverflow: {},
    epOverflowTotal: 0, _overflowRpAcc: 0,
    // v1.3 模块 D：载具采集计时器
    vehCollectTimer: 0,
    // v1.3 模块 A：AI 助手（解锁后生效；默认全关，预留线默认 30%）
    ai: { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: BALANCE.ai.defaultReserve, timer: 0,
        autoBuild: false, autoBuildUnlocked: false, autoBuildRate: BALANCE.ai.aiAutoBuild.defaultRate, autoBuildTimer: 0,
        autoTech: false, alloc: {} }, // v2.8.21 ③：自动研究开关默认字段；v3.6.0 增加 alloc（AI 助手按类型分配）
    // v1.3 模块 E：一次性条目购入顺序（已升级区按此倒序展示）
    boughtOrder: [],
    // v2.0 故事线
    storyline: 'default',          // 当前故事线 ID
    storylinesCompleted: [],       // 已完成的故事线（多周目解锁用）
    earnedFull: 0,                // v2.5.1：本局 EP 产出全量（含被存储上限钳制部分；任务进度口径，晋升清零）
    _forkTriggered: false,         // [v2.2 废弃] 弹窗触发标记——读取不再写入，保留一个版本周期，v2.3 清除
    // v2.2 岔路口重设计：三栋互斥定向建筑状态机（inactive → open → locked 单向）+ 族升级档位
    crossroad: 'inactive',         // 'inactive'（ch<5 不可见）/ 'open'（三栋可购，中立路径合法）/ 'locked'（已立誓）
    crossroadLockedBy: null,       // 立誓定向建筑 id（order_pillar / abyss_anchor / faith_shrine）
    familyUpgrades: {},            // 已购族升级档数 { D: 0..3, output: 0..2 }（跨转生保留）
    _specialTasksDone: {},         // 已完成的特殊任务
    _easterEggsFound: {},          // 已发现的彩蛋
    _pauseCycles: 0,               // 暂停/恢复循环次数
    _farewellBought: false,        // v2.9.2：sp3_farewell「离职礼盒」购买标记（每局可触发一次，转生重置）
    // v2.0 线A 秩序重构者
    orderRewrites: {},             // 协议编辑器重写记录 {upgradeId: count}
    orderCompileProgress: 0,       // 编译进度
    orderLogicGates: [],           // 激活的逻辑门数组
    // v2.0 线B 深渊行者
    abyssGazeCount: 0,             // 深渊凝视次数
    chaosIntuitionEnabled: false,  // 混沌直觉开关
    chaosLogEnabled: true,         // 混沌日志开关
    // v2.0 线C 信仰传播者
    faithTemples: 0,               // 圣殿数量
    miraclesTriggered: [],         // 已触发的神迹阈值
    prophecyNext: null,            // 当前预言内容
    // v2.0 彩蛋辅助字段
    _prestigeSkips: 0,             // 连续不选天赋次数
    _idleSec: 0,                   // 连续不操作秒数
    _catClicks: 0,                 // 影猫点击次数
    abyssGazeUnlocked: false,      // v3.4.2：凝视深渊彩蛋——已购裂隙「深渊凝视」升级（跨局保留）
    // v2.3.2 反馈②：_vehicleNames（载具命名记录）随命名彩蛋移除一并废除；旧档残留键无害随行
    _lastActionAt: Date.now(),     // 上次操作时间
    // 系统
    paused: false, pausedAt: 0,
    lastSeen: Date.now(), startTime: Date.now(),
    // 版本
    _version: SAVE_VERSION,
  };
}

function migrateSave(raw) {
  const data = JSON.parse(raw);
  const fromVer = data._version || 1;

  // v1 -> v2 迁移
  if (fromVer < 2) {
    if (data.prestigeCount !== undefined) {
      data.prestige = data.prestigeCount;
      delete data.prestigeCount;
    }
    delete data.prestigeBonus;
    if (Array.isArray(data.pets)) {
      const obj = {};
      for (const p of data.pets) {
        if (p && p.id) obj[p.id] = { ...p, level: p.level || 1, exp: p.exp || 0, gen: p.gen || 1 };
      }
      data.pets = obj;
    }
    if (data.lastSave !== undefined) {
      data.lastSeen = data.lastSave;
      delete data.lastSave;
    }
    if (data.owned !== undefined) {
      data.upgrades = data.owned;
      delete data.owned;
    }
    if (data.pet && !data.activePets) {
      data.activePets = [data.pet];
    }
  }

  // v2 -> v3 迁移：添加故事线/特殊任务/彩蛋字段（14个新增字段兜底）
  if (fromVer < 3) {
    if (!data.storyline) data.storyline = 'default';
    if (!data.storylinesCompleted) data.storylinesCompleted = [];
    if (data._forkTriggered === undefined) data._forkTriggered = false;
    if (!data._specialTasksDone) data._specialTasksDone = {};
    if (!data._easterEggsFound) data._easterEggsFound = {};
    if (data._pauseCycles === undefined) data._pauseCycles = 0;
    // 线A
    if (!data.orderRewrites) data.orderRewrites = {};
    if (data.orderCompileProgress === undefined) data.orderCompileProgress = 0;
    if (!data.orderLogicGates) data.orderLogicGates = [];
    // 线B
    if (data.abyssGazeCount === undefined) data.abyssGazeCount = 0;
    if (data.chaosIntuitionEnabled === undefined) data.chaosIntuitionEnabled = false;
    if (data.chaosLogEnabled === undefined) data.chaosLogEnabled = true;
    // 线C
    if (data.faithTemples === undefined) data.faithTemples = 0;
    if (!data.miraclesTriggered) data.miraclesTriggered = [];
    if (data.prophecyNext === undefined) data.prophecyNext = null;
    // 彩蛋辅助
    if (data._prestigeSkips === undefined) data._prestigeSkips = 0;
    if (data._idleSec === undefined) data._idleSec = 0;
    if (data._catClicks === undefined) data._catClicks = 0;
    // v2.3.2 反馈②：_vehicleNames 迁移补齐随命名彩蛋移除一并废除
    if (data._lastActionAt === undefined) data._lastActionAt = Date.now();
  }


  // v3 -> v4 迁移：v2.1 建筑驱动转向（旧科技效果 -> 等效建筑等级，PM 设计文档 4.1 公式）
  if (fromVer < 4) {
    data.unlockedBuildings = data.unlockedBuildings || {};
    data.buildingOverflow = data.buildingOverflow || {};
    data.buildings = data.buildings || {};
    data.epOverflowTotal = 0; data._overflowRpAcc = 0;
    const caps = {};
    for (const b of BALANCE.buildingsV21) caps[b.id] = b.cap;
    // 逐科技 -> 目标建筑等级（同建筑多来源取 max；加法类 ceil(比值)，乘算类 ceil(log(M)/log(v))）
    const TECH_MIGRATE_V21 = {
      warmup:      { warmup_node: 5 },
      lean:        { warmup_node: 5, eff_tower: 2 },
      eff2:        { eff_tower: 3 },
      auto2:       { dispatch_hub: 1 },
      speed2:      { double_workshop: 4 },
      quantum2:    { quantum_stacker: 3 },
      singular:    { singularity_core: 4 },
      transcend:   { transcend_temple: 7 },
      ascend:      { ascend_spire: 8 },
      eternity:    { eternity_hall: 8 },
      true_end:    { end_shrine: 8 },
      click_up:    { field_1: 4 },
      extra_click: { field_1: 2 },
      click10:     { field_2: 4 },
      mega_click:  { field_3: 4 },
      grand_click: { field_4: 3 },
      crit_click:  { crit_furnace: 1 },
      cps_crit:    { crit_reactor: 1 },
      crit2:       { crit_reactor_2: 1 },
      cheap_start: { bargain_shop: 3 },
      cost_opt:    { negotiate_seat: 3 },
      cheap2:      { purchase_office: 3 },
      cost3:       { purchase_office_2: 2 },
      grand_cost:  { purchase_office_3: 3 },
      focus_opt:   { focus_core: 1 },
      teamwork:    { coop_hall: 3 },
      team2:       { team_temple: 2 },
      team3:       { super_team: 2 },
      fuel_eff:    { eco_battery: 3 },
      fuel2:       { eco_battery_2: 2 },
      rp_first:    { exp_bench: 1 },
      rp_boost:    { rp_distiller: 1 },
      rp2:         { deep_lab: 1 },
      rp3:         { theory_desk: 1 },
      grand_rp:    { legend_institute: 2 },
      // v3.4.5：offline_s/offline1/remote/grand_off/offline16/offline24 不再迁移——信号塔与延时缓存站已从效能建筑删除，
      // 离线效率/上限改由离线升级（off_eff1~3 / off_cap1~2）提供
      patience:    { chance_sensor: 1 },
      event_boost: { chance_sensor_2: 1 },
      luck:        { lucky_nebula: 1 },
      event3:      { event_tide_lab: 1 },
      morale2:     { proj_supervisor: 1 },
      project2:    { proj_parallel: 1 },
      prestige2:   { cycle_temple: 2 },
      grand_pp:    { legend_rank_hall: 1 },
    };
    const target = {};
    for (const [tid, map] of Object.entries(TECH_MIGRATE_V21)) {
      if (!data.tech || !data.tech[tid]) continue;
      for (const [bid, lv] of Object.entries(map)) {
        target[bid] = Math.max(target[bid] || 0, lv);
      }
    }
    for (const [bid, lv] of Object.entries(target)) {
      const cap = caps[bid] || 0;
      const cur = data.buildings[bid] || 0;
      const want = Math.max(cur, lv);
      const final = Math.min(want, cap);
      if (want > cap) data.buildingOverflow[bid] = (data.buildingOverflow[bid] || 0) + (want - cap);
      data.buildings[bid] = final;
      data.unlockedBuildings[bid] = true; // 迁移获得的建筑视为已解锁（免二次 RP 解锁）
    }
    data._v21Migrated = true; // main.js 启动时一次性 toast
  }

  // v4 -> v5 迁移：岔路口升级项驱动重设计（PM §4.1 七类矩阵，架构方案 2.3 节）
  // 判定只依赖 storyline 与 chapter 两个跨版本语义不变的字段；段内全状态基幂等（||默认 / Math.max 合成 / 条件赋值），
  // 同一存档跑两次结果一致；写集合与 v3→v4 段零交集（v21 段只写 buildingsV21 表内 55 个 id，定向建筑 id 为 v2.2 新增）。
  // 迁移合成本身不调 loadStoryline——线运行态注册统一由启动幂等链 ensureStorylineRuntime 完成（main.js）。
  if (fromVer < 5) {
    data.crossroad = data.crossroad || 'inactive';
    data.crossroadLockedBy = data.crossroadLockedBy || null;
    data.familyUpgrades = data.familyUpgrades || {};
    data.buildings = data.buildings || {};
    const chNum = parseInt(String(data.chapter || '1'), 10) || 1;
    const sl = data.storyline || 'default';
    if (sl !== 'default') {
      // 已选线档：locked + 合成对应定向建筑 1 级（幂等：已存在则不动）
      data.crossroad = 'locked';
      data.crossroadLockedBy = BALANCE.lineToCrossroad[sl] || null;
      const bid = data.crossroadLockedBy;
      if (bid) data.buildings[bid] = Math.max(data.buildings[bid] || 0, 1);
    } else if (chNum >= 5) {
      // 未选线已过第5章：open（中立路径合法）
      data.crossroad = 'open';
    }
    // else：default + ch<5 → inactive（默认值即结论）
    data._v22Migrated = true;
  }

  // v5 -> v6 迁移：v2.3 资源发现标记（顶栏渐进显示）。按存量值直写，幂等 0 弹窗；
  // 开局四常显项恒 true；其余按「曾持有过」语义以存量 >0 回填（rerun 加载即恒可见，含已花光的旧资源）。
  if (fromVer < 6) {
    const D = data.resDiscovered = data.resDiscovered || {};
    D.ep = D.cps = D.run = D.tide = true;
    if ((data.rp || 0) > 0) D.rp = true;
    if ((data.prestigePoints || 0) > 0) D.rank = true;
    if ((data.prestigePoints || 0) > 0 || (data.es || 0) > 0) D.es = true;
    if ((data.faith || 0) > 0) D.faith = true;
    if ((data.pt || 0) > 0) D.pt = true;
    if ((data.dm || 0) > 0) D.dm = true;
  }

  data._version = SAVE_VERSION;
  return data;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const migrated = migrateSave(raw);
    const defs = defaultState();
    // 保留跨局数据
    const crossRun = ['es', 'prestigePoints', 'eternal', 'achievements', 'religion', 'faith', 'offHistory', 'allTimeEp', 'storylinesCompleted', 'storyline', 'crossroad', 'crossroadLockedBy', 'familyUpgrades', 'resDiscovered', 'delve', 'vs', 'riftEmber', 'riftUpgrades', 'riftLevelTech', '_religionHintSeen', 'relics', 'bazaar', 'abyssGazeUnlocked']; // v2.7.0 遗物跨转生保留；v3.0.0 集市（成交笔数/等级跨周期）
    for (const k of crossRun) {
      if (migrated[k] !== undefined) defs[k] = migrated[k];
    }
    // 存档兼容：缺失字段用默认值补齐
    const newFields = ['tidePhase', 'tideTimer', 'corruption', 'wageState', 'buildings', 'vehCollectTimer', 'ai', 'boughtOrder', 'unlockedBuildings', 'buildingOverflow', 'epOverflowTotal', '_overflowRpAcc', 'delve', 'vs',
                       'storyline', 'storylinesCompleted', '_forkTriggered', '_specialTasksDone', '_easterEggsFound', '_pauseCycles', 'crossroad', 'crossroadLockedBy', 'familyUpgrades', '_farewellBought',
                       'orderRewrites', 'orderCompileProgress', 'orderLogicGates',
                       'abyssGazeCount', 'chaosIntuitionEnabled', 'chaosLogEnabled', 'bazaar',
                       'cosmos',
                       'faithTemples', 'miraclesTriggered', 'prophecyNext',
                       '_prestigeSkips', '_idleSec', '_catClicks', '_lastActionAt', 'resDiscovered', 'abyssGazeUnlocked']; // v2.3.2 反馈②：_vehicleNames 移除
    for (const k of newFields) {
      if (migrated[k] === undefined) migrated[k] = defs[k];
    }
    // 深兜底：嵌套对象字段部分缺失时补齐
    const wDef = defs.wageState, w = migrated.wageState;
    if (w && typeof w === 'object') {
      for (const k of Object.keys(wDef)) if (w[k] === undefined) w[k] = wDef[k];
    }
    const aiDef = defs.ai, ai = migrated.ai;
    if (ai && typeof ai === 'object') {
      for (const k of Object.keys(aiDef)) if (ai[k] === undefined) ai[k] = aiDef[k];
    }
    // v2.3 深兜底：resDiscovered 部分键缺失时补默认（不覆盖已写 true）
    const rdDef = defs.resDiscovered, rd = migrated.resDiscovered;
    if (rd && typeof rd === 'object') {
      for (const k of Object.keys(rdDef)) if (rd[k] === undefined) rd[k] = rdDef[k];
    }
    // v2.5 ①：裂隙门控旧档兼容标记——v2.4 及以前已有 DM/RP 锚点进度（已购载具/灵感工坊
    // 或对应 resDiscovered 已写）的旧档视为已解锁探采平台/深渊商店，不回退；
    // v2.5 起新档不再因「购入载具」解锁（解锁前提改为触发深渊裂隙）。
    if (!migrated._riftSeen && migrated._v25Legacy === undefined) {
      const up = migrated.upgrades || {};
      if ((up.scooter || 0) >= 1 || rd.dm === true || (up.atrium || 0) >= 1 || rd.rp === true) {
        migrated._v25Legacy = true;
      }
    }
    return { ...defs, ...normalizeCrew(migrated), _version: SAVE_VERSION };
  } catch { return defaultState(); }
}

export function save(S) {
  S.lastSeen = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(S));
}

export function reset() {
  localStorage.removeItem(SAVE_KEY);
  return defaultState();
}

export let S = load();

// v3.3.0 线程绑定系统：旧档兼容——补全线程职业/等级/绑定字段，确保转化器开关存在
function normalizeCrew(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.converterOn === undefined) raw.converterOn = { vehicles: true, atrium: true };
  if (!Array.isArray(raw.cultists)) return raw;
  const normals = Object.values(PROFESSION_BY_ID).filter(p => p.id !== LAZY_PROFESSION_ID && p.id !== LEADER_PROFESSION_ID);
  for (const c of raw.cultists) {
    if (c.profession === undefined) c.profession = normals[Math.floor(Math.random() * normals.length)].id;
    if (c.level === undefined) c.level = 1;
    if (c.xp === undefined) c.xp = 0;
    if (c.leader === undefined) c.leader = false;
    if (c.boundTo !== undefined && c.boundTo !== null && raw.converterOn && raw.converterOn[c.boundTo] === false) c.boundTo = null;
  }
  // v3.3.1 反馈⑤：领导者唯一——旧档若存在多位领导者，只保留第一位
  // v3.7.1 反馈①：领导者是全局加成位（与 threadBinding.canBind 同口径），
  //   旧档残留的岗位绑定在加载时一并清除，避免旧档继续占用岗位吃转化加成
  let seenLeader = false;
  for (const c of raw.cultists) {
    if (!c.leader) continue;
    c.boundTo = null;
    if (seenLeader) c.leader = false; else seenLeader = true;
  }
  return raw;
}
