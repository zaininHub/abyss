import { S } from '../state.js';
import { UPGRADES } from '../data/upgrades.js';
import { ETERNALS, esCost as _esCost } from '../data/eternals.js';
import { PETS, petBaseMult } from '../data/pets.js';
import { MOOD_MULT } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import { fxValue, fxBest } from '../core/effectEngine.js';
import { V21_BUILDINGS, buildingCostV21 } from '../data/buildings.js';
import { relicMult } from '../data/relics.js'; // v2.7.0：深渊遗物乘区（古卷/虚眼/罗盘）

const B = BALANCE;

// ========== 基础查询 ==========
export function totalOwned() { return Object.values(S.upgrades).reduce((a, b) => a + b, 0); }
export function techCount() { return Object.keys(S.tech).length; }
export function hasTech(id) { return !!S.tech[id]; }
export function elv(id) { return S.eternal[id] || 0; }
export function esCost(e) { return _esCost(e, S.eternal); }
export function petCount() { return Object.keys(S.pets).length; }
export function hasGen(g) { return Object.values(S.pets).some(p => p.gen >= g); }

// ========== 异兽乘数 ==========
export function activePetIds() {
  return S.activePets.filter(id => S.pets[id]);
}

export function petMult(key) {
  let m = 1;
  for (const id of activePetIds()) {
    const p = S.pets[id];
    if (!p) continue;
    const base = petBaseMult(id, key);
    if (base === 1 && !p.mixed) continue;
    const levelMult = 1 + p.level * 0.02;
    const genMult = 1 + (p.gen - 1) * 0.5 * (1 + elv('fuse') * 0.1);
    let pm = (p.mixed ? (p.mixed[key] || 1) : base) * levelMult * genMult;
    if (S.runTalent === 'pet_master' && key === 'global') pm *= 2;
    pm *= (1 + elv('pet') * 0.08);
    if (S.religion && S.religion.nature) pm *= 2;
    m *= pm;
  }
  return m;
}

export function bondMult() {
  return 1 + petCount() * 0.01;
}

// ========== 深渊潮汐（v2.0 §2） ==========
export function tidePhaseInfo(idx) {
  const phases = BALANCE.tide.phases;
  return phases[idx % phases.length];
}

export function tideMult(key) {
  const ph = tidePhaseInfo(S.tidePhase);
  if (key === 'ep') return ph.epMult;
  if (key === 'salary') return ph.salaryMult;
  if (key === 'techCost') return ph.techCostMult;
  if (key === 'eventBad') return ph.eventBadWeight;
  if (key === 'eventGoodDur') return ph.eventGoodDur;
  return 1;
}

// ========== 矩阵腐化（v2.0 §3） ==========
export function corruptionPenalty() {
  const c = Math.max(0, Math.min(BALANCE.corruption.max, S.corruption || 0));
  if (c === 0) return 1;
  const per = hasTech('entropy_reduce') ? BALANCE.corruption.penaltyPerPercent / 1.5 : BALANCE.corruption.penaltyPerPercent;
  return Math.max(BALANCE.corruption.penaltyFloor, 1 - c * per);
}

export function purifierCleanRate() {
  let total = 0;
  for (const p of BALANCE.corruption.purifiers) {
    const n = S.upgrades[p.id] || 0;
    if (n === 0) continue;
    total += p.rate * n;
  }
  return total;
}

// ========== v2.1.1 P1-B：腐化 tick（自 main.js 迁出，便于数值自测） ==========
// 口径（质检 10.4 并存方案，v2.2 缺陷B修订）：挂机 tick 产出在 main.js 走「先加后截」——
// 先全额入账，溢出部分在此按比例累积腐化（恢复 v2.0 设计本意），最后截断到存储上限；
// 一次性入口（点击/任务/事件/远征/离线）仍走 addEp() 直接截断，不产腐化。
// v2.2 缺陷B修复：两条路径的溢出 EP 均不再丢弃，统一经 accountEpOverflow 记入溢出池（5% 转 RP）。
export function tickCorruption(dt) {
  const cap = epStorageCap();
  const overflow = Math.max(0, S.ep - cap);
  if (overflow > 0) {
    // EP 溢出按比例累积腐化：rate 0.1/s × (溢出/容量) × dt，换算为百分比
    const add = BALANCE.corruption.accumulateRate * (overflow / cap) * dt;
    S.corruption = Math.min(BALANCE.corruption.max, (S.corruption || 0) + add * 100);
  }
  const clean = purifierCleanRate() * dt;
  if (clean > 0) S.corruption = Math.max(0, (S.corruption || 0) - clean);
  if (overflow > 0) {
    // v2.2 缺陷B修复：超 cap 存量 EP 不再直接丢弃，走与 addEp 相同的溢出池口径
    S.ep = cap;
    accountEpOverflow(overflow);
  }
}

// ========== 全局乘数 ==========
export function globalMult() {
  let m = 1 + S.prestigePoints * 0.10;
  // v2.1 建筑驱动：全局加法（预热节点/效能尖塔/调度中枢 Σ +2%~+50%/级）
  // 与全局乘算（双倍工坊 ×1.25^级、锚链 ×1.5~1.8^级）全部来自效果引擎；科技=解锁钥匙，不再参与乘数计算
  m *= (1 + fxValue('globalAdd'));
  m *= fxValue('globalMul');
  if (S.runTalent === 'sharp') m *= 1.5;
  m *= (1 + elv('eff') * 0.05);
  m *= petMult('global');
  m *= bondMult();
  if (S.upgrades.dmsight) m *= 1.25;
  if (S.religion && S.religion.sun) m *= 2;
  if (S.religion && S.religion.omnipot) m *= 10;
  // v2.5.7 宗教：圣印等级全局加成（+8%/级，线性；软上限前生效）
  const rlSeal = S.religion && S.religion.seal ? S.religion.seal : 0;
  if (rlSeal > 0) m *= (1 + 0.08 * rlSeal);
  // v2.6.0 深潜：虚空强化——全局 EP ×1.10/级（终局乘区，软上限前生效）
  if (S.delve && S.delve.up && S.delve.up.void > 0) m *= Math.pow(1.10, S.delve.up.void);
  // v2.6.4 ⑤：圣战军——全局产出 ×1.12/级（信仰驱动的终局军势）
  if (S.religion && S.religion.crusade > 0) m *= Math.pow(1 + 0.12, S.religion.crusade);
  // v2.7.0 遗物：深渊古卷——全局产出 +8%/级（DM 超长线消费）
  m *= relicMult('tome');
  if (!isFinite(m)) m = 1;
  // v2.0 §1.3 软上限：m > 5000 → 5000 + sqrt(m - 5000) * 70
  if (m > B.softCapThreshold) {
    m = B.softCapThreshold + Math.sqrt(m - B.softCapThreshold) * B.softCapFactor;
  }
  return m;
}

export function costMult() {
  let m = 1;
  // v2.1 建筑驱动：成本折扣族（议价坊 ×0.98^级 ~ 采购总署·极 ×0.88）
  m *= fxValue('costMul');
  if (S.runTalent === 'thrift') m *= 0.8;
  m *= Math.max(0.1, 1 - elv('cost') * 0.02);
  if (S.religion && S.religion.genesis) m *= 0.8;
  return m;
}

export function focusCostMult() {
  // v2.1 建筑驱动：专注心核（1 级 ×0.75）；focus_opt 科技改钥匙，效果迁移建筑
  return fxValue('focusCost');
}

export function clickMult() {
  let m = 1 + S.focusLevel * 0.5;
  // v2.1 建筑驱动：指尖力场族（初/中/深/极，×1.5~×5 每级乘算）；click_up 改钥匙
  m *= fxValue('clickMul');
  m *= (1 + S.prestigePoints * 0.1);
  if (S.runTalent === 'foc') m *= 5;
  m *= (1 + elv('click') * 0.1);
  m *= petMult('click');
  if (Date.now() < S.clickBuffUntil) m *= S.clickBuffMult;
  return m;
}

export function offlineRate() {
  // v2.6.6 ①：离线收益整体下调——默认 25%（远低于在线），信号塔最高仅 100%（见 balance.js）
  let m = 0.25;
  if (hasTech('offline1')) m = 0.4; // 钥匙科技自带 40% 档（PM §1.1 保留为前置）
  m = Math.max(m, fxValue('offlineRate')); // v2.1 建筑驱动：三档信号塔 60%/100%/200% 取最大不叠加
  if (S.runTalent === 'longlife') m *= 1.5;
  if (S.runTalent === 'off_exp') m *= 2;
  m += elv('off') * 0.05;
  if (S.offUpgrades.off_eff1) m += 0.2;
  if (S.offUpgrades.off_eff2) m += 0.3;
  m *= petMult('offline');
  if (S.religion && S.religion.moon) m *= 1.5;
  // v2.7.0 遗物：虚空之眼——离线效率 +12%/级（DM 超长线消费）
  m *= relicMult('eye');
  // v2.6.0 深潜：星辰余烬——离线上限 ×(1+20%/级)（终局突破 3.0 上限）
  const ember = (S.delve && S.delve.up && S.delve.up.ember) || 0;
  return Math.min(m, 3.0 * (1 + 0.2 * ember));
}

export function offlineCap() {
  let h = 8;
  h = Math.max(h, fxValue('offlineCap')); // v2.1 建筑驱动：延时缓存站 16h/24h 取最大
  if (S.offUpgrades.off_cap1) h += 4;
  h += elv('off2') * 4;
  return h * 3600;
}

export function rpMult() {
  // v2.1 建筑驱动：初探实验台/RP蒸馏塔/理论突破台（加法）+ 深度实验室/传奇研究所（乘算）
  return (1 + fxValue('rpAdd')) * fxValue('rpMul');
}

export function ppMult() {
  // v2.1 建筑驱动：轮回圣殿 ×√2/级（满 2 级 ×2）+ 传奇职级殿 ×3 = 满级 ×6
  return fxValue('ppMul');
}

export function projRewardMult() {
  let m = 1;
  m *= (1 + fxValue('projRewardAdd')); // v2.1 建筑驱动：项目督导室 +50%/级
  if (S.runTalent === 'proj') m *= 2;
  m *= (1 + elv('proj') * 0.1);
  return m;
}

export function eventFreqMult() {
  let m = 1;
  m *= (1 + fxValue('eventFreqAdd')) * fxValue('eventFreqMul'); // v2.1 建筑驱动：机会感知器/幸运星云/事件潮汐所
  if (S.runTalent === 'agile') m *= 2;
  m *= (1 + elv('event') * 0.05);
  m *= petMult('event');
  if (S.religion && S.religion.reveal) m *= 2;
  return m;
}

export function critRate() {
  // v2.1 建筑驱动：暴击反应堆 1% / ·锐 5%（取最高档）；期望乘算见 critExpectedMult()
  let r = (fxBest('autoCrit') || { chance: 0 }).chance;
  if (S.runTalent === 'crit') r *= 3;
  r += elv('crit') * 0.005;
  return r;
}

// v2.1：自动暴击期望乘算（独立掷骰期望值连乘：+9% 与 +45% 同时持有 = ×1.585），进 computeCps
export function critExpectedMult() {
  // 无暴击建筑时 fxValue('crit') 返回 null（聚合 def），乘算侧必须兜底为中性值 1
  // —— 否则 m *= null 把 computeCps 整体清零（browser-v21 线程产出归零的根因）
  return fxValue('autoCrit') ?? 1;
}

export function esGain() {
  // v2.5.1：ES 门槛 1e10→2e7（累计 2000 万起获得 ES；原门槛前期恒 0，「可获得 ES 0」观感不合理）
  let g = Math.floor(Math.sqrt(S.runEarned / 2e7) * (1 + elv('shard') * 0.05));
  if (S.religion && S.religion.immortal) g *= 2;
  return g;
}

// ========== v1.3 模块 C/B：线程薪资四态状态机 读侧 ==========
// 四态：ok 满薪 / debt 欠薪降效 / dormant 强制休眠 / losing 流失预警
// 个体 mood 乘数照常正交叠加（欠薪×死锁 = wageOutputMult × MOOD_MULT）
function bld(id) { return (S.buildings && S.buildings[id]) || 0; }

// 欠薪产出系数（能量食堂 3 级逐级缓解，3 级免疫）
export function wageDebtMult() {
  return [BALANCE.thread.wages.debtMult, 0.8, 0.9, 1][Math.min(3, bld('canteen'))];
}
// 休眠期保命成本系数（休眠舱 → 0.15）
export function wageKeepCostMult() {
  return bld('dorm') >= 1 ? 0.15 : BALANCE.thread.wages.keepCostMult;
}
// 流失预警期流失概率/分钟（维修坞 → 0）
// v2.7.1：线程懒惰态（EP 满上限惩罚）——持续满上限 afterSec 后进入；
// 懒惰中消耗 > 产出，EP 跌到 0 或任意升级/线程购买/招募解除
export function isLazy() {
  return !!S.lazySince && Date.now() - S.lazySince >= (B.lazy?.afterSec || 60) * 1000;
}
export function lazyProdMult() {
  return isLazy() ? (B.lazy?.prodMult || 1) : 1;
}
export function lazyCostMult() {
  return isLazy() ? (B.lazy?.costMult || 1) : 1;
}

export function wageLoseChance() {
  return bld('dock') >= 1 ? 0 : BALANCE.thread.wages.loseChancePerMin;
}
// 数据中心：每 10 线程全局产出加成（独立乘数，1/2/3 级 +5%/10%/15%）
export function datacenterMult() {
  const lv = bld('datacenter');
  if (lv <= 0) return 1;
  const bonus = [0, 0.05, 0.10, 0.15][Math.min(3, lv)];
  return 1 + Math.floor(S.cultists.length / 10) * bonus;
}
// 四态产出系数（computeCps 用；dormant/losing 产出 ×0）
export function wageOutputMult() {
  const w = S.wageState;
  if (!w || w.state === 'ok') return 1;
  if (w.state === 'debt') return wageDebtMult();
  // v2.5.3：休眠不是死亡——休眠期保留 30% 温和产出（原 ×0，纯惩罚难触发也无转机）；
  // 流失预警（losing）仍 ×0（线程随时可能流失）
  if (w.state === 'dormant') return 0.3;
  return 0;
}

// ========== v1.3 模块 D：探采平台联动（纯读侧） ==========
// 载具最高档位：拥有 ≥1 辆即算解锁该档（0~4）
export function vehicleTier() {
  let tier = 0;
  BALANCE.vehicles.ids.forEach((id, i) => { if ((S.upgrades[id] || 0) > 0) tier = i + 1; });
  return tier;
}
// 封印裂隙 DM 加成（档位 → [0,0,1,1,2]）
export function vehicleTierDmBonus() {
  return (BALANCE.vehicles.tierDmBonus[vehicleTier()] || 0);
}
// v2.5.1：深渊鱼缸 3 级额外奖励（裂隙封印 +5 DM）；深渊集市 ×2
export function abyssFishbowlLevel() {
  return Math.min((S.buildings && S.buildings.abyss_fishbowl) || 0, 3);
}
export function hasAbyssMarket() {
  return !!(S.tech && S.tech.abyss_market === true);
}
// 封印裂隙实际 DM 到账（rift.js 调用）
export function sealDmReward(rift) {
  let r = (rift.dmReward || 0) + vehicleTierDmBonus();
  if (abyssFishbowlLevel() >= 3) r += 5;
  if (hasAbyssMarket()) r *= 2;
  return r;
}
// 拥抱裂隙爆发时长（毫秒，基准 60s + 档位×5s）
export function embraceDurMs() {
  return 60000 + vehicleTier() * BALANCE.vehicles.embraceBonusSec * 1000;
}
// 载具采集产出（DM/min）
// v2.4：显示与到账统一为确定性数值口径 = Σ(载具数×档位速率)×(1+dmRateAdd 建筑加成)；
// 不再掷骰（原概率投掷方差导致「显示 55/s 实际 1.1/min」类感知偏差，v2.3.2 定性与本版修复依据）
export function vehicleDmPerMin() {
  let sum = 0;
  BALANCE.vehicles.ids.forEach((id, i) => { sum += (S.upgrades[id] || 0) * BALANCE.vehicles.dmRates[i]; });
  // v2.5.1：深渊鱼缸（DM 采集 +20%/级，深渊行者线专属建筑）+ 深渊集市（×1.5，叠乘）
  let m = 1 + fxValue('dmRateAdd') + 0.2 * abyssFishbowlLevel();
  if (hasAbyssMarket()) m *= 1.5;
  return sum * m;
}
// 单次采集到账（确定性按速率计算，60s 节拍由 vehicles.tickVehicleCollect 承担；小数累加进 S.dm）
export function collectVehicleDm() {
  return vehicleDmPerMin();
}

// ========== v1.3 L1：科技成本潮汐乘数 ==========
export function techCostOf(t) {
  return Math.ceil(t.cost * tideMult('techCost'));
}

// ========== 线程相关（v2.0 §1.4：成本/产出/薪资基数由 balance.js 配置） ==========
export function staffCost() {
  return Math.ceil(BALANCE.thread.firstCost * Math.pow(1.25, S.cultists.length));
}

export function staffSalaryPerSec() {
  let m = 1;
  if (S.upgrades.subsist1) m *= (1 - B.subsist1);
  if (S.upgrades.subsist2) m *= (1 - B.subsist2);
  if (S.upgrades.subsist3) m *= 0.5;
  if (S.upgrades.mem) m *= 0.85;
  if (S.upgrades.cache) m *= 0.75;
  if (S.upgrades.dmmind) m *= 0.6;
  m *= fxValue('fuelMul'); // v2.1 建筑驱动：节能电池 ×0.90^级 / ·II ×0.85^级
  const base = BALANCE.thread.salaryBase;
  let total = 0;
  for (let i = 0; i < S.cultists.length; i++) total += 0.5 * Math.pow(base, i);
  total *= tideMult('salary'); // 潮汐：涨潮薪资 +50% / 退潮 -20% / 乱流 +30%
  return total * m * lazyCostMult(); // v2.7.1：懒惰态消耗 ×1.8（消耗 > 产出）
}

export function staffOutputPerSec() {
  // v2.1 R1 修复：这里只应用线程专属乘数（团队协作/CPU/GPU）。
  // globalMult / corruptionPenalty / tideMult 全部由 computeCps 对所有产出源统一单次应用，
  // 消除旧版 globalMult² 双重计数（「一个线程瞬间满 1K」的根因）。
  let outMult = 1;
  outMult *= (1 + fxValue('threadAdd')) * fxValue('threadMul'); // v2.1 建筑驱动：协作大厅(+10%/级)+团队圣堂/超级团队殿(乘算)
  if (S.upgrades.cpu) outMult *= 1.5;
  if (S.upgrades.gpu) outMult *= 2;
  let total = 0;
  for (const c of S.cultists) {
    const mood = MOOD_MULT[c.mood] || 1;
    total += (c.output || 3) * mood * outMult;
  }
  return total;
}

export function staffNetPerSec() {
  // v2.1 R1：净收益 = 线程产出 × 全局乘数（单次） − 薪资
  // v1.3：纳入薪资状态机产出系数与数据中心加成（AI 自动招募判定同口径）
  return staffOutputPerSec() * globalMult() * corruptionPenalty() * tideMult('ep')
    * wageOutputMult() * lazyProdMult() * datacenterMult() - staffSalaryPerSec(); // v2.7.1：懒惰态产出/消耗同口径
}

// ========== 升级成本 ==========
// v2.0.2 防死锁硬约束：扩容项（storage/cache）价格 ≤ 当前 EP 上限 ×30%
// （KG 谷仓模式：扩容永远只是存量的一小部分；非扩容项不受此约束）
const CAP_EXPANSION_IDS = ['storage', 'cache'];  // v2.0.2 复验 P0 修复：导出供线程区接线
export { CAP_EXPANSION_IDS };
export function unitCost(u, n) {
  const owned = S.upgrades[u.id] || 0;
  // v2.1 R3-A：支持单项自定义增长率（存储节点 ×1.25，其余默认 1.15）
  const growth = u.growth || 1.15;
  let cost = Math.ceil(u.base * Math.pow(growth, owned + n) * costMult());
  if (CAP_EXPANSION_IDS.includes(u.id)) {
    cost = Math.min(cost, Math.floor(epStorageCap() * (B.storageAntiDeadlockRatio || 0.3)));
  }
  return cost;
}

// v2.1 建筑级价（含组D 三梯 30% 防死锁钳制）：购买入口、商店显示、灰态判断统一走本函数
export function v21BuildingCost(b) {
  let cost = buildingCostV21(b, S, costMult());
  if (B.v21CapClampIds.includes(b.id)) {
    cost = Math.min(cost, Math.floor(epStorageCap() * (B.storageAntiDeadlockRatio || 0.3)));
  }
  return cost;
}

export function bulkCostCalc(u, n) {
  let t = 0;
  for (let i = 0; i < n; i++) t += unitCost(u, i);
  return t;
}

// ========== 专注成本 ==========
export function focusCost() {
  // v2.1 D5 拍板：30 × 1.6^n（配置进 BALANCE.focus 统一管理）
  return Math.ceil(B.focus.base * Math.pow(B.focus.growth, S.focusLevel) * focusCostMult());
}

// ========== 晋升需求 ==========
export function prestigeNeed() {
  return Math.floor(1e7 * Math.pow(S.prestige + 1, 3.2));
}

export function prestigeGain() {
  // v2.5.1：奖励合理化——round 而非 floor（27.68M/需求 10M → 2 PP，原 1 PP）；未达标仍为 0
  const x = S.runEarned / prestigeNeed();
  if (x < 1) return 0;
  return Math.max(1, Math.round(Math.sqrt(x))) * ppMult();
}

export function prestigeRpGain() {
  // v2.5.1：与职级点同口径（round）；未达标不保底（晋升门槛由 prestigeGain 承担）
  const x = S.runEarned / prestigeNeed();
  if (x < 1) return 0;
  return Math.max(1, Math.round(Math.sqrt(x) * rpMult()));
}

// ========== CPS 计算 ==========
export function computeCps() {
  let base = 0;
  for (const u of UPGRADES) {
    if (!u.cps) continue;
    let c = u.cps * (S.upgrades[u.id] || 0);
    // v1.3 模块 D 第 3 层：载具协议——全载具 CPS ×1.5
    if (S.upgrades.dmprotocol && BALANCE.vehicles.ids.includes(u.id)) c *= BALANCE.vehicles.protocolMult;
    base += c;
  }
  base += staffOutputPerSec();
  let m = globalMult();
  // v1.3 模块 C：四态薪资状态机产出系数（替代隐藏 staffUnhappy 计数器，旧字段保留读兼容）
  m *= wageOutputMult();
  m *= lazyProdMult(); // v2.7.1：懒惰态线程产出 ×0.4
  // v1.3 模块 B：数据中心（每 10 线程全局产出加成）
  m *= datacenterMult();
  if (Date.now() < S.buffUntil) m *= S.buffMult;
  // v2.5.2 反馈①：休眠补偿 buff（休眠 ≥60s 恢复后 ×1.5 持续 60s）
  if (S.restBonusUntil && Date.now() < S.restBonusUntil) m *= S.restBonusMult || 1.5;
  m *= critExpectedMult();  // v2.1：暴击反应堆期望乘算（死代码真实接线）
  m *= corruptionPenalty(); // v2.0：矩阵腐化惩罚
  m *= tideMult('ep');      // v2.0：深渊潮汐相位乘数
  let r = base * m;
  if (!isFinite(r)) r = 0;
  return r;
}

// ========== EP 存储上限 ==========
// v2.4 KG 模式改造：基础上限 2000 + 存储节点无限升级（第 i 级 +capPer×capGrowth^(i-1)，无封顶）
// + 缓存优化 +5000/个（无限）+ 数据中心每级上限加成 [0,10K,25K,50K]
// + 组D 扩容梯与新增多效果上限建筑 capAdd（无限）+ 里程碑乘算基座 + 故事线变体加成
export function epStorageCap() {
  let cap = 2000;
  // v2.4：cache 无限购买（原 v2.0.2 20 级封顶解除，旧档超 20 级数量仍全额计入）
  const cacheCount = S.upgrades['cache'] || 0;
  cap += cacheCount * 5000;
  // v2.4：存储节点无限升级（原 maxLevel 截断移除；级增量 +2,000 起步、逐级 ×1.12 持续递增）
  const storageLv = S.upgrades['storage'] || 0;
  for (let i = 1; i <= storageLv; i++) cap += B.storage.capPer * Math.pow(B.storage.capGrowth, i - 1);
  // v2.0.2：数据中心每级额外加上限（映射现有 1/2/3 级制建筑）
  const dcBonus = B.datacenterCapBonus || [0, 10000, 25000, 50000];
  cap += dcBonus[Math.min(3, (S.buildings && S.buildings.datacenter) || 0)];
  // v2.1 建筑驱动：组D 扩容梯（量子缓存池 +50K/级、维度压缩仓 +5e6/级、超限储存器 +5e9/级）
  // 位置口径经终章锚点校验：m=6 期 1,814,427 / 终局 374,128,594,192
  cap += fxValue('capAdd');
  // 里程碑乘算基座：每个已达成里程碑 +25%（v2.0.2 由 50% 压缩）
  const milesDone = Object.keys(S.milesDone || {}).length;
  cap *= (1 + B.storageMileBonus * milesDone);
  // v2.0.2：故事线变体上限加成
  if (S.storyline === 'line_abyss') cap *= 1.15;
  else if (S.storyline === 'line_order') cap *= 1.10;
  // 级制累计带小数尾差，按设计口径四舍五入（20 级满级 146,105）
  return Math.round(cap);
}

// ========== v2.2 缺陷B修复：溢出池公共记账（addEp 与 tickCorruption 同口径） ==========
// 累计入 epOverflowTotal 页头统计；其中 5% 就地转化为 RP（换算 1/10000，满 1 转出、尾数滞留）
function accountEpOverflow(overflow) {
  S.epOverflowTotal = (S.epOverflowTotal || 0) + overflow;
  // v2.5 ④：EP 首次溢出 = 研究点 RP 解锁（持久标记，随存档落盘；新档需首次溢出才开启 RP 栏目）
  if (overflow > 0 && !S._rpOverflowSeen) {
    S._rpOverflowSeen = true;
  }
  // v2.5.2 反馈②：转换效率基础 1 RP = 20,000 溢出 EP（原 0.05/10000 = 200,000 EP/RP 过低，
  // 18.79K 溢出显示 5% 却转不出 1 RP）；每转生所需溢出 -500（下限 5,000）——后期获取速率加快
  const need = Math.max(5000, 20000 - 500 * (S.prestige || 0));
  // v2.7.0 遗物：星渊罗盘——研究点转换效率 +10%/级（溢出 → RP 更快）
  S._overflowRpAcc = (S._overflowRpAcc || 0) + overflow * relicMult('compass') / need;
  if (S._overflowRpAcc >= 1) {
    const rp = Math.floor(S._overflowRpAcc);
    S.rp += rp;
    S._overflowRpAcc -= rp;
  }
}

// ========== v2.1 D1：EP 唯一加成入口（受上限约束 + 统一记账） ==========
export function addEp(amount) {
  if (!isFinite(amount) || amount <= 0) return 0;
  const cap = epStorageCap();
  const before = S.ep;
  S.ep = Math.min(cap, S.ep + amount);
  const gained = S.ep - before;
  if (gained > 0) {
    S.runEarned += gained;
    S.allTimeEp += gained;
  }
  // v2.5.1：任务进度口径改全量——earnedFull 累计含被上限钳制部分（不随显示口径冻结）
  S.earnedFull = (S.earnedFull || 0) + amount;
  // v2.1 溢出池承接 + v2.2 缺陷B修复：上限打满后被丢弃的 EP 经公共函数记账（与 tickCorruption 同口径）
  const overflow = amount - gained;
  if (overflow > 0) accountEpOverflow(overflow);
  return gained;
}

// ========== 格式化 ==========
export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return n.toFixed(2) + units[u];
}

export function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}
