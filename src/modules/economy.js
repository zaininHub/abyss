import { S } from '../state.js';
import { UPGRADES } from '../data/upgrades.js';
import { ETERNALS, esCost as _esCost } from '../data/eternals.js';
import { PETS, petBaseMult } from '../data/pets.js';
import { MOOD_MULT } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import { policyMult } from '../data/policies.js';
import { devotionMult } from '../data/religions.js';
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
  // v2.8.4：零熵协议——潮汐负面效果减半（不再免疫，只减缓）
  const soften = hasTech('zero_entropy') ? 0.5 : 0;
  const halve = (m) => (soften > 0 && m !== 1) ? (m < 1 ? 1 - (1 - m) * soften : 1 + (m - 1) * soften) : m;
  if (key === 'ep') return halve(ph.epMult);
  if (key === 'salary') return halve(ph.salaryMult);
  if (key === 'techCost') return halve(ph.techCostMult);
  if (key === 'eventBad') return halve(ph.eventBadWeight);
  if (key === 'eventGoodDur') return halve(ph.eventGoodDur);
  return 1;
}

// ========== 矩阵腐化（v2.0 §3） ==========
export function corruptionPenalty() {
  const c = Math.max(0, Math.min(BALANCE.corruption.max, S.corruption || 0));
  if (c === 0) return 1;
  let per = BALANCE.corruption.penaltyPerPercent;
  if (hasTech('entropy_reduce')) per /= 1.5;
  if (hasTech('zero_entropy')) per /= 1.25; // v2.8.4：零熵协议（-25%，不再免疫级 -50%）
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
  tickCollapse(dt); // v2.8.3：深渊吞噬判定（腐化满额 + EP 触顶 → 线程出逃 → 崩溃）
}

// ===== v2.8.3 深渊吞噬（轮回失败机制）=====
// 腐化满额（≥100%）且 EP 达到上限时：线程每 60s 被深渊强制吞没 1 条（免疫无效），
// 出逃殆尽后本局崩溃：所有系统停止产出，给出成就；玩家只能晋升转生/轮回脱离。
let collapseLogFn = null, collapseToastFn = null;
// v2.8.4：深渊吞噬倒计时基准 5 分钟（稳定协议科技 +2 分钟）
export function setCollapseHooks(logFn, toastFn) { collapseLogFn = logFn; collapseToastFn = toastFn; }
export function collapseRemainMs() {
  if (S.collapsed) return 0;
  if (!S._collapseAt) return null;
  return Math.max(0, S._collapseAt - Date.now());
}

// v2.8.4：长线科技乘数（各故事线终局研究：公理偏移/深渊意志/圣物科技 → 全局 ×1.1）
export function techGlobalMult() {
  let m = 1;
  if (hasTech('axiom_shift')) m *= 1.1;
  if (hasTech('abyss_will')) m *= 1.1;
  if (hasTech('sacred_tech')) m *= 1.1;
  return m;
}
// v2.8.4：虚空视界——深潜产出 +25%
export function delveTechMult() { return hasTech('void_sight') ? 1.25 : 1; }
// v2.8.4：神启之光——信仰产出 +25%
export function faithTechMult() { return hasTech('divine_light') ? 1.25 : 1; }
// v2.8.4：稳定协议——深渊吞噬倒计时 +2 分钟（7 分钟）
export function collapseMs() { return hasTech('stable_protocol') ? 420000 : 300000; }

// v2.8.4：ES 发现锚点（首次晋升获得 ES 时点亮；未解锁前永恒矩阵区块不显示）
export function discoverEs() {
  if (!S.resDiscovered) S.resDiscovered = {};
  S.resDiscovered.es = true;
}
export function esDiscovered() {
  return !!(S.resDiscovered && S.resDiscovered.es);
}

// v2.8.4：研究点升级（RP 购买）读侧
export function researchMult(key) {
  const T = BALANCE.researchUpgs || [];
  let m = 1;
  for (const u of T) {
    const lv = (S.rpTheories && S.rpTheories[u.id]) || 0;
    if (lv <= 0 || !u.fx || u.fx.key !== key) continue;
    if (key === 'global') m *= Math.pow(1 + u.fx.v, lv);
    else m *= (1 + u.fx.v * lv);
  }
  return m;
}

// v2.8.4：深渊遗存（跨轮回携带建筑）读侧
export function legacyLv(id) { return (S.relicLegacy && S.relicLegacy[id]) || 0; }
export function legacyGlobalMult() { return 1 + legacyLv('relic_core') * 0.25; }
export function legacyCapMult() { return 1 + legacyLv('relic_vault') * 2.0; }
export function legacyRiftMult() { return 1 + legacyLv('relic_anchor') * 0.25; }
export function tickCollapse(dt) {
  if (S.collapsed) return;
  if ((S.corruption || 0) < (BALANCE.corruption.max || 100)) return;
  const cap = epStorageCap();
  if ((S.ep || 0) < cap - 1) {
    // 未触顶：若之前已进入倒计时，EP 快速消耗（买入/蒸馏）可自救取消
    if (S._collapseAt) S._collapseAt = null;
    S._collapseTimer = 0;
    return;
  }
  // v2.8.4：倒计时机制——腐化满额 + EP 触顶后进入 5 分钟「深渊吞噬」倒计时（单向，可自救取消）
  if (!S._collapseAt) {
    S._collapseAt = Date.now() + collapseMs();
    if (collapseLogFn) collapseLogFn('⚠️ 深渊吞噬倒计时启动：腐化满额且 EP 触顶，5 分钟后本局被深渊吞没（快速消耗 EP 至上限 50% 以下可自救）', 'bad');
    if (collapseToastFn) collapseToastFn('⚠️ 深渊吞噬倒计时：5 分钟后崩溃——消耗 EP 或立即转生可脱离');
  }
  // 自救：EP 消耗至上限 50% 以下 → 取消倒计时
  if ((S.ep || 0) < cap * 0.5) {
    S._collapseAt = null;
    S._collapseTimer = 0;
    if (collapseLogFn) collapseLogFn('深渊吞噬倒计时已取消：EP 跌至上限 50% 以下，深渊暂时退去', 'good');
    return;
  }
  // 每 60s 吞没 1 线程（叙事提示，出逃殆尽提前崩溃）
  S._collapseTimer = (S._collapseTimer || 0) + dt;
  if (S._collapseTimer >= 60 && (S.cultists || []).length > 0) {
    S._collapseTimer = 0;
    const lost = S.cultists.pop();
    if (collapseLogFn) collapseLogFn(`[深渊吞噬] 线程【${lost.name}】被深渊吞没（倒计时中）`, 'bad');
    if (collapseToastFn) collapseToastFn(`🌊 线程【${lost.name}】被深渊吞没！`);
  }
  // 倒计时结束 或 线程出逃殆尽 → 强制崩溃
  if (Date.now() >= S._collapseAt || (S.cultists || []).length === 0) {
    S.collapsed = true;
    S.cultists = [];
    if (collapseLogFn) collapseLogFn('深渊吞噬：本局宣告失败，所有系统停止产出——你被深渊吞噬了（必须转生）', 'bad');
    if (collapseToastFn) collapseToastFn('🌑 深渊吞噬：本局宣告失败，所有系统停止产出。必须转生以脱离');
  }
}

// ========== 全局乘数 ==========
export function globalMult() {
  let m = 1 + S.prestigePoints * 0.10;
  // v2.1 建筑驱动：全局加法（预热节点/效能尖塔/调度中枢 Σ +2%~+50%/级）
  // 与全局乘算（双倍工坊 ×1.25^级、锚链 ×1.5~1.8^级）全部来自效果引擎；科技=解锁钥匙，不再参与乘数计算
  m *= (1 + fxValue('globalAdd'));
  m *= policyMult('collab'); // v2.8.6 B2a：协作网络——协作加成 ×1.2
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
  // v2.7.4 ③：深渊之心实装——腐化峰值 >100% 后每 10% 转化 +5% 全局产出
  // （峰值驱动：净化节点清除当前腐化不影响峰值，压制路线与腐化收益路线互不抵消）
  if (hasTech('abyss_heart') && (S.corruptionPeak || 0) > 100) {
    m *= 1 + Math.floor(((S.corruptionPeak || 0) - 100) / 10) * 0.05;
  }
  // v2.7.3 ⑤：轮回回响全局乘区（每点 +5%，跨轮回保留；克制：来源有限、升级贵）
  m *= echoMult();
  // v2.8.6 B1a/B2a：虔诚全局加成（软上限）+ EP 政策（集权/苦行/富足）
  m *= devotionMult();
  m *= policyMult('ep');
  m *= policyMult('global'); // v2.8.6 B2a：牺牲——全局 -10%
  if (m > B.softCapThreshold) {
    m = B.softCapThreshold + Math.sqrt(m - B.softCapThreshold) * B.softCapFactor;
  }
  return m;
}

// v2.7.3 ⑤：轮回回响——全局倍率 = 1 + 0.05×回响 + 回响升级（echo_global，×1.3/级）
export function echoMult() {
  let m = 1 + (S.abyssEcho || 0) * 0.05;
  const glv = (S.echoUpgrades && S.echoUpgrades.echo_global) || 0;
  if (glv > 0) m *= Math.pow(1.3, glv);
  return m;
}
// v2.7.3 ⑤：回响特殊升级等级（细分系统加成用）
// v2.7.4 ⑦：RP 蒸馏效率——主动消耗 EP 转化 RP（主源）
// 基础 1 RP = 15,000 EP；灵感蒸馏塔每级 ÷1.12（效率提升）；低于 20,000 溢出转换 → 蒸馏为主源
export function rpDistillRate() {
  const lv = S.upgrades['rp_distill'] || 0;
  // v2.8.6：星渊罗盘「研究点转换效率 +10%/级」接线（v2.8.2 改 desc 后漏接，效率提升 = 所需 EP 减少）
  const compass = (S.relics && S.relics.compass) || 0;
  const eff = 1 + compass * 0.10;
  return 15000 / Math.pow(1.12, lv) / eff;
}
export function echoLv(id) {
  return (S.echoUpgrades && S.echoUpgrades[id]) || 0;
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
  let m = 1; // v2.8.17 ⑦：专注等级不再加成点击（效果迁移至线程产出）
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
  // v2.8.4：能量食堂 3 级不再免疫——0.95 仍减缓欠薪惩罚（负面效果只能减缓）
  return [BALANCE.thread.wages.debtMult, 0.8, 0.9, 0.95][Math.min(3, bld('canteen'))];
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
  // v2.8.19：维修坞实装「线程维护」——流失概率 -50%（负面减缓，不免疫；此前仅描述性定位，用户反馈效果未实装）
  // v2.8.10：混沌护盾科技——流失概率再减半（负面减缓，不免疫）
  const base = BALANCE.thread.wages.loseChancePerMin;
  let m = 1;
  if (S.upgrades && S.upgrades.dock >= 1) m *= 0.5;
  if (S.tech && S.tech.chaos_shield) m *= 0.5;
  return base * m;
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
// v2.8.12：探采平台改为消耗 EP 采集——每 1 DM 消耗 epPerDm EP（ep/min 口径，tick 内折算）
export function vehicleDmEpCostPerMin() {
  return vehicleDmPerMin() * BALANCE.vehicles.epPerDm;
}

// ========== v1.3 L1：科技成本潮汐乘数 ==========
// v2.8.7：科技树成本多资源（综合产物齐耗，量最大）——cost 为 {rp,ep,dm...} 对象；退潮乘数仅作用于 RP 部分
export function techCostOf(t) {
  if (typeof t.cost === 'number') return { rp: Math.ceil(t.cost * tideMult('techCost')) };
  const c = t.cost || {};
  return {
    rp: Math.ceil((c.rp || 0) * tideMult('techCost')),
    ep: c.ep || 0,
    dm: c.dm || 0,
    es: c.es || 0,
  };
}
export function techAfford(t) {
  const c = techCostOf(t);
  return S.rp >= (c.rp || 0) && S.ep >= (c.ep || 0) && (S.dm || 0) >= (c.dm || 0) && (S.es || 0) >= (c.es || 0);
}

// ========== 线程相关（v2.0 §1.4：成本/产出/薪资基数由 balance.js 配置） ==========
export function staffCost() {
  // v2.8.6 B2a：招募政策——集权指令 -20% / 协作网络 +30%（价格随政策浮动，下限 5）
  return Math.max(5, Math.ceil(staffCostBase() * policyMult('recruit')));
}
function staffCostBase() {
  return BALANCE.thread.firstCost * Math.pow(1.25, S.cultists.length);
}

export function staffSalaryPerSec() {
  let m = 1;
  if (S.upgrades.subsist1) m *= (1 - B.subsist1);
  if (S.upgrades.subsist2) m *= (1 - B.subsist2);
  if (S.upgrades.subsist3) m *= 0.5;
  if (S.upgrades.mem) m *= 0.85;
  // v2.7.4 ④：缓存优化消耗按级递减——Lv1 -25%，每级再 -3%（下限 -35%），升级持续生效
  if (S.upgrades.cache) m *= Math.max(0.65, 0.75 * Math.pow(0.97, (S.upgrades.cache || 0) - 1));
  if (S.upgrades.dmmind) m *= 0.6;
  m *= fxValue('fuelMul'); // v2.1 建筑驱动：节能电池 ×0.90^级 / ·II ×0.85^级
  const base = BALANCE.thread.salaryBase;
  const perCap = BALANCE.thread.salaryPerThreadCap || Infinity;
  let total = 0;
  for (let i = 0; i < S.cultists.length; i++) total += Math.min(0.5 * Math.pow(base, i), perCap);
  total *= tideMult('salary'); // 潮汐：涨潮薪资 +50% / 退潮 -20% / 乱流 +30%
  return total * m * lazyCostMult(); // v2.7.1：懒惰态消耗 ×1.8（消耗 > 产出）
}

export function staffOutputPerSec() {
  // v2.1 R1 修复：这里只应用线程专属乘数（团队协作/CPU/GPU）。
  // globalMult / corruptionPenalty / tideMult 全部由 computeCps 对所有产出源统一单次应用，
  // 消除旧版 globalMult² 双重计数（「一个线程瞬间满 1K」的根因）。
  let outMult = 1;
  outMult *= (1 + S.focusLevel * 0.2); // v2.8.17 ⑦：专注等级改为线程产出加成（每级 +20%；原点击加成移除——弱化主动点击宗旨）
  outMult *= (1 + fxValue('threadAdd')) * fxValue('threadMul') * researchMult('thread'); // v2.1 建筑驱动 + v2.8.4 研究点·矩阵意识
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
  return staffOutputPerSec() * policyMult('thread') * globalMult() * corruptionPenalty() * tideMult('ep')
    * wageOutputMult() * lazyProdMult() * datacenterMult() - staffSalaryPerSec(); // v2.7.1：懒惰态产出/消耗同口径
}

// ========== 升级成本 ==========
// v2.0.2 防死锁硬约束：扩容项（storage/cache）价格 ≤ 当前 EP 上限 ×30%
// （KG 谷仓模式：扩容永远只是存量的一小部分；非扩容项不受此约束）
const CAP_EXPANSION_IDS = ['storage', 'cache'];  // v2.0.2 复验 P0 修复：导出供线程区接线
export { CAP_EXPANSION_IDS };
export function unitCost(u, n) {
  const owned = S.upgrades[u.id] || 0;
  // v2.1 R3-A：支持单项自定义增长率（存储节点 ×1.25 等）
  // v2.8.2：默认增长率 1.15 → 1.30（成本曲线陡峭化——避免一个建筑买几十几百个，减缓前期发展）
  const growth = u.growth || 1.30;
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
  return Math.floor(1.5e8 * Math.pow(S.prestige + 1, 3.2)); // v2.8.19：首升需求 3e7→1.5e8（经济模拟：纯基础 8h 累计 7.4M，有乘数叠加约 5×；150M 使 1-3 天转生，半天不可达）
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
  if (S.collapsed) return 0; // v2.8.3：深渊吞噬——本局所有系统停止产出
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
  m *= researchMult('ep') * researchMult('global') * legacyGlobalMult() * techGlobalMult(); // v2.8.4：研究点 + 深渊遗存 + 长线科技
  let r = base * m;
  if (!isFinite(r)) r = 0;
  return r;
}

// ========== v2.8.14：顶部产出/消耗来源明细（按升级类目合并） ==========
export function cpsBreakdown() {
  // 与 computeCps 同口径拆分：载具 / 线程 / 其余升级（基础·建筑·家族等合并为「基础产出」）
  let vehicle = 0, other = 0;
  for (const u of UPGRADES) {
    if (!u.cps) continue;
    let c = u.cps * (S.upgrades[u.id] || 0);
    if (S.upgrades.dmprotocol && BALANCE.vehicles.ids.includes(u.id)) c *= BALANCE.vehicles.protocolMult;
    if (BALANCE.vehicles.ids.includes(u.id)) vehicle += c; else other += c;
  }
  const thread = staffOutputPerSec(); // 线程基础产出（心态/线程乘区），全局乘区在 computeCps 统一应用
  const parts = [];
  if (other > 0.005) parts.push(`基础产出 +${fmt(other)}/s`);
  if (thread > 0.005) parts.push(`线程 +${fmt(thread)}/s`);
  if (vehicle > 0.005) parts.push(`载具产出 +${fmt(vehicle)}/s`);
  return parts;
}
export function drainBreakdown() {
  const parts = [];
  const sal = staffSalaryPerSec();
  if (sal > 0.005) parts.push(`线程薪资 -${fmt(sal)}/s`);
  const probe = vehicleDmEpCostPerMin() / 60;
  if (probe > 0.005) parts.push(`载具探采 -${fmt(probe)}/s`);
  return parts;
}
export function totalDrainPerSec() {
  return staffSalaryPerSec() + vehicleDmEpCostPerMin() / 60;
}

// ========== EP 存储上限 ==========
// v2.4 KG 模式改造：基础上限 2000 + 存储节点无限升级（第 i 级 +capPer×capGrowth^(i-1)，无封顶）
// + 缓存优化 +5000/个（无限）+ 数据中心每级上限加成 [0,10K,25K,50K]
// + 组D 扩容梯与新增多效果上限建筑 capAdd（无限）+ 里程碑乘算基座 + 故事线变体加成
export function epStorageCap() {
  let cap = 2000;
  // v2.4：cache 无限购买（原 v2.0.2 20 级封顶解除，旧档超 20 级数量仍全额计入）
  const cacheCount = S.upgrades['cache'] || 0;
  cap += cacheCount * 8000; // v2.8.2：5000→8000（中期上限宽松，EP 不易触顶）
  // v2.7.4 ⑥：新增阶段仓库（via upgrade 直读，与 storage/cache 同口径——upgrade 类不进效果引擎）
  cap += (S.upgrades['reserve_bin'] || 0) * 8000; // v2.8.2：3000→8000
  cap += (S.upgrades['deep_bin'] || 0) * 5e5;
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
  cap *= legacyCapMult(); // v2.8.4：记忆库遗存（跨轮回 ×2/座；return 处 round）
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
  // v2.8.2：移除「溢出 → RP」自动转换——RP 主源改为灵感蒸馏塔主动消耗 EP 转化 +
  // 数据熔炉建筑产出 + 任务奖励（用户口径：解锁后通过大量 EP 转化 RP，而非靠溢出自然产生）；
  // 溢出仍累计统计（epOverflowTotal 页头展示），解锁标记 _rpOverflowSeen 保留（首次溢出解锁）。
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
  // v2.8.13：任务进度（earnedFull）仅统计挂机产出（main.js tick），一次性入账（点击/任务奖励/事件/远征/离线）不计入任务 EP 要求
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
