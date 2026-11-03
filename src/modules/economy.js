import { S } from '../state.js';
import { UPGRADES } from '../data/upgrades.js';
import { ETERNALS, esCost as _esCost } from '../data/eternals.js';
import { PETS, petBaseMult } from '../data/pets.js';
import { MOOD_MULT } from '../data/threads.js';
import { crewPush } from './crew.js'; // v3.1.0 反馈③：班组流水（吞噬吞没线程）
import { BALANCE } from '../data/balance.js';
import { policyMult } from '../data/policies.js';
import { devotionMult } from '../data/religions.js';
import { faithDrainPerSec } from './religions.js'; // v2.8.30 ③：信仰生产 EP 消耗（悬浮/禁购）
import { fxValue, fxBest } from '../core/effectEngine.js';
import { V21_BUILDINGS, buildingCostV21 } from '../data/buildings.js';
import { relicMult } from '../data/relics.js'; // v2.7.0：深渊遗物乘区（古卷/虚眼/罗盘）
import {
  threadBindOutputFactor, threadBindSalaryFactor, converterThreadBoost,
  leaderGlobalMult, threadLevel, threadLevelMult, converterEnabled,
} from './threadBinding.js'; // v3.3.0 线程绑定系统 // v3.3.2 反馈③：工坊消耗与开关同口径

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
  // v2.8.21 ⑥：EP 达到上限后不再产生腐化（溢出只记入溢出池 5% 转 RP；腐化仅来自深入裂隙与负面政策）
  // v2.8.20 ①：深入裂隙期间净化豁免——净化不可盖过深入腐化速率（否则腐化被清到 0、深入进度条消失且「净化>腐化」失衡）
  // v2.9.0：吞噬倒计时期间净化节点同样被深渊压制（被动净化不得偷偷解除倒计时——倒计时一旦启动即锁定，
  // 唯二解除路径：主动净化（消耗 EP）将腐化压至满额以下，或倒计时终结后的命运抉择）
  const clean = (S.riftExpedition || S._collapseAt || S._collapseChoicePending ? 0 : purifierCleanRate()) * dt;
  if (clean > 0) S.corruption = Math.max(0, (S.corruption || 0) - clean);
  if (overflow > 0) {
    // v2.2 缺陷B修复：超 cap 存量 EP 不再直接丢弃，走与 addEp 相同的溢出池口径
    S.ep = cap;
    accountEpOverflow(overflow);
  }
  tickCollapse(dt); // v2.8.3：深渊吞噬判定（腐化满额 + EP 触顶 → 线程出逃 → 崩溃）
}

// ===== v2.8.3 深渊吞噬（轮回失败机制）=====
// v2.9.0 重做：腐化满额（≥100%）→ 60s 崩溃倒计时（稳定协议科技 180s），倒计时一旦启动即锁定——
// 倒计时期间被动净化被深渊压制（此前净化节点同帧把腐化清到 100 以下 → 倒计时秒取消 → 实际永不触发，Bug 根因）；
// 唯二解除：① 主动净化（消耗 EP）压至满额以下；② 倒计时终结 → 命运抉择（贿赂深渊 / 同归于尽）。
// 倒计时/抉择/崩溃期间，晋升与轮回均被深渊锁定（转生不可脱离深渊）。
let collapseLogFn = null, collapseToastFn = null, collapseChoiceFn = null;
// v2.8.4：深渊吞噬倒计时基准 5 分钟（稳定协议科技 +2 分钟）
export function setCollapseHooks(logFn, toastFn, choiceFn) { collapseLogFn = logFn; collapseToastFn = toastFn; collapseChoiceFn = choiceFn || null; }
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
// v2.8.22 ⑦：深渊吞噬倒计时 60 秒基准（稳定协议 +2 分钟 → 180s）；tickCollapse 同源
// 旧 v2.8.4 语义（300s/420s）已废弃，数值同步 60s 口径
// v2.8.4：稳定协议——深渊吞噬倒计时 +2 分钟（60s → 180s）
export function collapseMs() { return hasTech('stable_protocol') ? 180000 : 60000; }

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
  if (S._collapseChoicePending) return; // 抉择弹框打开中（计时已被模态暂停冻结）
  // v2.9.0：倒计时一旦启动即锁定——腐化回落不再取消（被动净化在倒计时期间已被压制）；
  // 仅主动净化（cancelCollapse）或终结抉择可解除
  if (!S._collapseAt) {
    if ((S.corruption || 0) < (BALANCE.corruption.max || 100)) return;
    S._collapseAt = Date.now() + collapseMs(); // 60 秒倒计时（稳定协议 180s）
    S._collapseTimer = 0;
    if (collapseLogFn) collapseLogFn('⚠️ 深渊吞噬倒计时启动：已被深渊腐化，崩溃临近——主动净化（消耗 EP）可自救，转生无法脱离', 'bad');
    if (collapseToastFn) collapseToastFn('⚠️ 深渊吞噬倒计时：已被深渊腐化——主动净化自救，或直面终结');
    return;
  }
  // 每 20s 吞没 1 线程（倒计时中的氛围压迫；不再因出逃殆尽提前崩溃——终结只由倒计时触发）
  S._collapseTimer = (S._collapseTimer || 0) + dt;
  if (S._collapseTimer >= 20 && (S.cultists || []).length > 0) {
    S._collapseTimer = 0;
    const lost = S.cultists.pop();
    if (collapseLogFn) collapseLogFn(`[深渊吞噬] 线程【${lost.name}】被深渊吞没（倒计时中）`, 'bad');
    crewPush(`【${lost.name}】被深渊吞没${lost.earned ? `（累计贡献 ${fmt(lost.earned)} EP）` : ''}`, 'bad'); // v3.1.0 反馈③：班组流水
    if (collapseToastFn) collapseToastFn(`🌊 线程【${lost.name}】被深渊吞没！`);
  }
  // 倒计时终结 → 命运抉择（贿赂深渊 / 同归于尽；弹框由 main.js 接管，期间一切计时暂停）
  if (Date.now() >= S._collapseAt) {
    S._collapseAt = null;
    S._collapseTimer = 0;
    S._collapseChoicePending = true;
    if (collapseLogFn) collapseLogFn('深渊吞噬倒计时终结：深渊将你拖入矩阵之底——做出你的抉择', 'bad');
    if (collapseChoiceFn) collapseChoiceFn();
  }
}

// 主动净化自救：倒计时中将腐化压至满额以下 → 解除吞噬倒计时（唯一的倒计时自救路径）
export function cancelCollapse() {
  if (!S._collapseAt) return false;
  S._collapseAt = null;
  S._collapseTimer = 0;
  if (collapseLogFn) collapseLogFn('深渊吞噬倒计时已解除：腐化被主动净化压至满额以下，深渊暂时退去', 'good');
  return true;
}

// ===== v2.9.0 优化①：主动净化经济——消耗 EP 净化腐化，腐化越严重析出 DM 越多（平方曲线） =====
export function purgeCostFor(cutPct) { // EP 成本 = 存储上限 × 0.6% × 净化百分点（净化 50% ≈ 30% 上限）
  return Math.ceil(epStorageCap() * (BALANCE.corruption.purge?.epCostPerPct || 0.006) * cutPct);
}
export function purgeDmFor(cutPct) { // DM 析出 = cut² × 0.02（50% → 50 DM；10% → 2 DM——越严重越丰厚）
  return Math.round(cutPct * cutPct * (BALANCE.corruption.purge?.dmPerPctSq || 0.02) * 100) / 100;
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
  m *= leaderGlobalMult(); // v3.3.0：领导者线程全局加成（每个 +5%，封顶 +25%）
  if (m > B.softCapThreshold) {
    m = B.softCapThreshold + Math.sqrt(m - B.softCapThreshold) * B.softCapFactor;
  }
  if (S.storyline === 'line_faith') m *= 3; // v2.8.30 ③：神权协议——全局 ×3（信仰传播者线）
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
// v3.3.3 反馈③：RP 转化效率随 RP 生产量递增——EP/RP 基准价 ×rpEffScale()（√(1+RP产出/0.15)），
// 压制中期 RP 泛滥：1 座工坊 ×1.41、5 座 ×2.45、10 座 ×3.3，产出越高换 1 RP 越贵（蒸馏/溢出同步生效）
export function rpProdPerSec() {
  const n = (S.upgrades && S.upgrades.atrium) || 0;
  if (n < 1 || !converterEnabled('atrium')) return 0;
  return (BALANCE.atrium.rate || 0.15) * n * converterThreadBoost('atrium');
}
export function rpEffScale() {
  const p = rpProdPerSec();
  if (!(p > 0)) return 1;
  return Math.sqrt(1 + p / 0.15);
}
export function rpDistillRate() {
  const lv = S.upgrades['rp_distill'] || 0;
  // v2.8.6：星渊罗盘「研究点转换效率 +10%/级」接线（v2.8.2 改 desc 后漏接，效率提升 = 所需 EP 减少）
  const compass = (S.relics && S.relics.compass) || 0;
  const eff = 1 + compass * 0.10;
  return (30000 / Math.pow(1.12, lv) / eff) * rpEffScale(); // v2.8.24 ③：蒸馏 EP 消耗 ×2 // v3.3.3 反馈③：×效率递增
}
export function echoLv(id) {
  return (S.echoUpgrades && S.echoUpgrades[id]) || 0;
}
// v2.9.0 大项②：回响·仓储共鸣（EP 上限 ×1.25/级）/ 回响·薪酬共鸣（线程消耗 ×0.94/级）——跨轮回长线
export function echoStorageMult() { return Math.pow(1.25, echoLv('echo_storage')); }
export function echoWageMult() { return Math.pow(0.94, echoLv('echo_wage')); }

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
  // v2.1 建筑驱动：专注心核（1 级 ×0.75）；v2.8.30：focus_opt 科技直接生效（解锁后成本 -25%，与建筑叠加）
  return fxValue('focusCost') * (S.tech && S.tech.focus_opt ? 0.75 : 1);
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

// v3.2.4 反馈⑤：离线效率统一口径 = 基础率（信号塔/天赋/离线升级/遗物等）× 离线协议研究（+12%/级）——
// 原面板展示/暂停预览/暂停结算漏乘 researchMult('offline')，「离线协议」升级后当前离线效率不涨
export function offlineEffRate() {
  return offlineRate() * researchMult('offline');
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
// v3.3.6：把乘区抽成 vehicleRateMult()，供页头/卡片显示与探采结算共用同一口径
export function vehicleBaseDmPerMin() {
  let sum = 0;
  BALANCE.vehicles.ids.forEach((id, i) => { sum += (S.upgrades[id] || 0) * BALANCE.vehicles.dmRates[i]; });
  return sum;
}
export function vehicleRateMult() {
  if (!converterEnabled('vehicles')) return 1;
  let m = 1 + fxValue('dmRateAdd') + 0.2 * abyssFishbowlLevel();
  if (hasAbyssMarket()) m *= 1.5;          // 深渊集市 ×1.5
  m *= researchMult('dm');                 // 星尘精炼（研究点）+8%/级
  // v3.3.8 反馈①：探采不吃班组乘区——线程加成曾让 27 辆×18 条线程把产出放大到 6600×（274 DM/s），
  // 与「消耗 100K 级 / 产出 10 DM 级」的目标口径差两个数量级，且超出 DM 容量后收益归零
  return m;
}
export function vehicleDmPerMin() {
  // v3.3.4 反馈①：探采开关统一口径——原来这里只读 converterOn.vehicles，而页头开关只写 _probeEnabled，
  // 两轨不同步 → 页头显示「探采中」但 rate=0（永不采集）、关掉也不影响消耗
  if (!converterEnabled('vehicles')) return 0;
  return vehicleBaseDmPerMin() * vehicleRateMult();
}
// 单次采集到账（确定性按速率计算，60s 节拍由 vehicles.tickVehicleCollect 承担；小数累加进 S.dm）
export function collectVehicleDm() {
  return vehicleDmPerMin();
}
// v2.8.12：探采平台改为消耗 EP 采集——每 1 DM 消耗 epPerDm EP（ep/min 口径，tick 内折算）
// v3.1.1 反馈⑤：汇率随总载具数逐辆 ×1.15 递增——单纯堆载具不再摊薄 EP→DM 成本
export function vehicleEpPerDm() {
  let total = 0;
  BALANCE.vehicles.ids.forEach(id => { total += (S.upgrades[id] || 0); });
  return BALANCE.vehicles.epPerDm * Math.pow(BALANCE.vehicles.epPerDmGrowth || 1, total);
}
export function vehicleDmEpCostPerMin() {
  return vehicleDmPerMin() * vehicleEpPerDm();
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
  const n = S.cultists.length;
  const base = BALANCE.thread.firstCost * Math.pow(1.25, n);
  // v2.9.1：前 3 级线程降价（新手期加速起步）——招募第 1/2/3 个（n=0/1/2）分别 ×0.5/0.65/0.8
  // 第 4 个起恢复全额曲线，与既有薪资/成本断言兼容（n≥3 时系数 = 1）
  const earlyDiscount = n < 3 ? [0.5, 0.65, 0.8][n] : 1;
  return base * earlyDiscount;
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
  m *= researchMult('wage'); // v2.8.25 ②：薪酬协商（研究点）线程消耗 -4%/级
  m *= echoWageMult(); // v2.9.0：回响·薪酬共鸣 ×0.94/级（跨轮回）
  const base = BALANCE.thread.salaryBase;
  const perCap = BALANCE.thread.salaryPerThreadCap || Infinity;
  let total = 0;
  for (let i = 0; i < S.cultists.length; i++) {
    let s = Math.min(0.5 * Math.pow(base, i), perCap);
    s *= threadBindSalaryFactor(S.cultists[i]); // v3.3.0：绑定到转化器后该线程消耗增多
    total += s;
  }
  total *= tideMult('salary'); // 潮汐：涨潮薪资 +50% / 退潮 -20% / 乱流 +30%
  // v3.0.3 反馈②：薪资跟随线程产出保底 10%（消除 100:1 产出比，收敛 ≤10:1）
  const out = staffOutputPerSec();
  return Math.max(total * m, out * 0.10 * m) * lazyCostMult(); // v2.7.1：懒惰态消耗 ×1.8（消耗 > 产出）
}

// v2.8.30：专注每级加成曲线——低等级加成少、逐段递增至上限 20%/级（达到上限后固定不变）
export function focusPerLevel(lv) {
  if (lv <= 5) return 0.08;
  if (lv <= 10) return 0.12;
  return 0.20;
}
export function focusTotalBonus(lv) {
  let t = 0;
  for (let i = 1; i <= lv; i++) t += focusPerLevel(i);
  return t;
}

export function staffOutputPerSec() {
  // v2.1 R1 修复：这里只应用线程专属乘数（团队协作/CPU/GPU）。
  // globalMult / corruptionPenalty / tideMult 全部由 computeCps 对所有产出源统一单次应用，
  // 消除旧版 globalMult² 双重计数（「一个线程瞬间满 1K」的根因）。
  let outMult = 1;
  // v2.8.30：专注每级加成从少到多（8%/12%/20% 分段递增），达到上限后固定 20%/级
  outMult *= (1 + focusTotalBonus(S.focusLevel));
  outMult *= (1 + fxValue('threadAdd')) * fxValue('threadMul') * researchMult('thread'); // v2.1 建筑驱动 + v2.8.4 研究点·矩阵意识
  if (S.upgrades.cpu) outMult *= 1.5;
  if (S.upgrades.gpu) outMult *= 2;
  let total = 0;
  for (const c of S.cultists) {
    const mood = MOOD_MULT[c.mood] || 1;
    // v3.3.0：线程等级加成（高等级加成高）+ 绑定到转化器后自由 EP 产出可能下降（产出被抽调）
    total += (c.output || 3) * 0.8 * mood * outMult * threadLevelMult(threadLevel(c)) * threadBindOutputFactor(c);
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
  // v3.0.3 第六批①：NaN 防御——base 缺失/非法时返回 Infinity（成本检查必然拦截），杜绝 NaN 成本穿透（EP 无限升级）
  if (!Number.isFinite(cost)) return Infinity;
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
// v2.8.27 ②：全资源存储上限（建筑扩容，EP 购买）——基础上限 + 建筑每级增量
export function rpCap() { return 2500 + ((S.upgrades && S.upgrades.rp_vault) || 0) * 400; } // v2.8.30 ⑤：RP 上限首给减少（5000→2500）
export function dmCap() { return 1000 + ((S.upgrades && S.upgrades.dm_vault) || 0) * 100; }
export function ptCap() { return 1000 + ((S.upgrades && S.upgrades.pt_vault) || 0) * 200; }
export function addRp(n) { const c = rpCap(); S.rp = Math.max(0, Math.min(c, (S.rp || 0) + (n || 0))); return S.rp; }
export function addDm(n) { const c = dmCap(); S.dm = Math.max(0, Math.min(c, (S.dm || 0) + (n || 0))); return S.dm; }
export function addPt(n) { const c = ptCap(); S.pt = Math.max(0, Math.min(c, (S.pt || 0) + (n || 0))); return S.pt; }

export function prestigeNeed() {
  return Math.floor(3e9 * Math.pow(S.prestige + 1, 1.5)); // v2.8.27：首升 1.5e8→3e9、增长指数 3.2→1.5——首轮 7-10 天转生、后续 3-5 天（模拟：cps×0.5+cost×3 下 13.5 模拟天）
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
  return Math.max(1, Math.round(Math.pow(x, 0.45) * rpMult())); // v2.8.30 ⑤：首次晋升后节奏放缓（sqrt→x^0.45）
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
// v2.8.22 ④：全局加成明细（与 globalMult 同口径，悬浮气泡展示）——只列实际生效项
export function multBreakdown() {
  const parts = [];
  if (S.prestigePoints > 0) parts.push(`职级 ×${(1 + S.prestigePoints * 0.10).toFixed(2)}`);
  const ga = fxValue('globalAdd');
  if (ga > 0.001) parts.push(`全局加成 +${(ga * 100).toFixed(0)}%`);
  const pol = policyMult('collab');
  if (pol !== 1) parts.push(`协作政策 ×${pol.toFixed(2)}`);
  const gm = fxValue('globalMul');
  if (Math.abs(gm - 1) > 0.001) parts.push(`全局倍率 ×${gm.toFixed(2)}`);
  if (S.runTalent === 'sharp') parts.push('天赋·敏锐 ×1.5');
  const eff = elv('eff');
  if (eff > 0) parts.push(`效能 +${(eff * 5).toFixed(0)}%`);
  const pet = petMult('global');
  if (pet !== 1) parts.push(`宠物 ×${pet.toFixed(2)}`);
  const bond = bondMult();
  if (bond !== 1) parts.push(`羁绊 ×${bond.toFixed(2)}`);
  if (S.upgrades.dmsight) parts.push('深渊视界 ×1.25');
  if (S.religion && S.religion.sun) parts.push('宗教·日 ×2');
  if (S.religion && S.religion.omnipot) parts.push('宗教·全能 ×10');
  const seal = S.religion && S.religion.seal ? S.religion.seal : 0;
  if (seal > 0) parts.push(`圣印 ×${(1 + 0.08 * seal).toFixed(2)}`);
  if (S.delve && S.delve.up && S.delve.up.void > 0) parts.push(`虚空 ×${Math.pow(1.10, S.delve.up.void).toFixed(2)}`);
  if (S.religion && S.religion.crusade > 0) parts.push(`圣战军 ×${Math.pow(1.12, S.religion.crusade).toFixed(2)}`);
  const tome = relicMult('tome');
  if (tome !== 1) parts.push(`遗物·古卷 ×${tome.toFixed(2)}`);
  return parts;
}

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
  const sal = salaryDrainPerSec();
  if (sal > 0.005) parts.push(`线程薪资 -${fmt(sal)}/s`);
  const probe = probeDrainPerSec();
  if (probe > 0.005) parts.push(`载具探采 -${fmt(probe)}/s`);
  const faith = faithDrainNow(); // v2.8.30 ③：信仰生产消耗（圣所产出时）
  if (faith > 0.005) parts.push(`信仰生产 -${fmt(faith)}/s`);
  const hatch = hatchDrainPerSec(); // v3.2.1 反馈⑥：异兽孵化 EP 扣减计入消耗值
  if (hatch > 0.005) parts.push(`异兽孵化 -${fmt(hatch)}/s`);
  const atrium = atriumDrainPerSec(); // v3.3.2 反馈③：灵感工坊蒸馏 EP 扣减计入消耗值
  if (atrium > 0.005) parts.push(`灵感工坊 -${fmt(atrium)}/s`);
  return parts;
}
// v3.3.1 反馈⑪：消耗口径与实际扣减对齐——
// 原实现直接累加名义薪资/探采/圣所/孵化，休眠期实际只扣保命成本、探采 EP 不足整轮跳过、
// 圣所关闭不扣、EP 为 0 时孵化不扣，导致「消耗/s 远大于产出/s 但 EP 仍在涨」的观感矛盾。
export function salaryDrainPerSec() {
  if ((S.ep || 0) <= 0) return 0; // EP 已空：扣费被钳到 0（与 tickWages 的 min(S.ep, 薪资) 同口径）
  const sal = staffSalaryPerSec();
  const st = (S.wageState || {}).state;
  if (st === 'dormant' || st === 'losing') return sal * wageKeepCostMult(); // 休眠/流失预警只扣保命成本
  return sal;
}
// v3.3.6 反馈①：探采「实际结算」口径——按 DM 剩余容量钳制，只买装得下的部分。
// v3.3.8 反馈①：改连续口径（无「周期」）——EP 一路扣到 0，产出按 DM/s 连续入账；
// EP 余量不足时按剩余 EP 折算，绝不出现「本周期跳过」的中断。
export function probeFlowPerSec() {
  const zero = { epPerSec: 0, dmPerSec: 0, nominalDmPerSec: 0, room: 0, limited: false, epPerDm: 0, wantPerCycle: 0 };
  if (!converterEnabled('vehicles')) return zero;
  const wantMin = vehicleDmPerMin();
  if (wantMin <= 0) return zero;
  const wantDmPerSec = wantMin / 60;
  const room = Math.max(0, dmCap() - (S.dm || 0));
  const epPerDm = vehicleEpPerDm();
  const budgetDm = epPerDm > 0 ? (S.ep || 0) / epPerDm : Infinity; // 剩余 EP 还能换多少 DM
  const dmPerSec = room > 1e-9 ? Math.min(wantDmPerSec, budgetDm) : 0;
  return {
    epPerSec: dmPerSec * epPerDm,
    dmPerSec,
    nominalDmPerSec: wantDmPerSec,
    room,
    limited: wantDmPerSec > dmPerSec + 1e-12,
    epPerDm,
    wantPerCycle: wantDmPerSec * 60,
    affordable: dmPerSec > 1e-12,
    epEmpty: (S.ep || 0) <= 1e-9,
    dmFull: room <= 1e-9,
  };
}
export function probeDrainPerSec() {
  return probeFlowPerSec().epPerSec; // v3.3.6：与 tick 实扣同口径（含容量钳制/EP 不足跳过）
}
export function faithDrainNow() {
  if ((S.ep || 0) <= 0) return 0; // EP 已空：圣所本轮不扣费
  if (S.religion && S.religion.templeOff) return 0; // 圣所关闭/自动暂停 → 不产出不扣费
  return faithDrainPerSec();
}
export function hatchDrainPerSec() {
  const h = ptHatchEpPerSec();
  return (S.ep || 0) > 0 ? h : 0; // EP 为 0 时孵化取不到 EP，不产生消耗
}
// v3.3.2 反馈③：灵感工坊 EP 消耗计入总消耗——原 totalDrainPerSec/drainBreakdown 遗漏工坊
// （150×级数 EP/s），升级后顶栏「消耗」不变多的观感根因。口径与 main.js tick 一致：
// 已购 × 蒸馏开启 × EP 可扣才计。
export function atriumDrainPerSec() {
  const n = (S.upgrades && S.upgrades.atrium) || 0;
  if (n < 1) return 0;
  if (!converterEnabled('atrium')) return 0; // 工坊关闭：不蒸馏不消耗（与 tick 同口径）
  if ((S.ep || 0) <= 0) return 0; // EP 已空：扣费被钳到 0
  return (BALANCE.atrium.epRate || 150) * n;
}
export function totalDrainPerSec() {
  return salaryDrainPerSec() + probeDrainPerSec() + faithDrainNow() + hatchDrainPerSec() + atriumDrainPerSec();
}
// v3.2.1 反馈⑥：异兽孵化 EP 消耗（与 main.js tick 同口径：5000×级数 EP/s，解锁自动孵化且开关开启时生效）
export function ptHatchEpPerSec() {
  if (S.ptAutoHatch !== true || S.ptDistillOn !== true) return 0;
  return 5000 * (S.ptHatchLv || 1);
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
  cap += (S.upgrades['reserve_bin'] || 0) * 12000; // v2.8.30 ⑤：储存量随涨价增多（8000→12000） // v2.8.2：3000→8000
  cap += (S.upgrades['deep_bin'] || 0) * 8e5; // v2.8.30 ⑤：储存量随涨价增多（500K→800K）
  cap *= researchMult('storage'); // v2.8.25 ②：存储协议（研究点）EP 上限 +8%/级
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
  cap *= echoStorageMult(); // v2.9.0：回响·仓储共鸣 ×1.25/级（跨轮回）
  return Math.round(cap);
}

// ========== v3.0.8：存储类文案统一口径 ==========
// 「存储节点」卡面口径（只留一行「EP 存储上限 +{购买后总量}」）推广到所有扩容项。
// 实现走「临时 +1 级 → 重算 → 还原」，乘区（研究协议/里程碑/遗存/回响/故事线）与
// 各建筑 capAdd 增量自动生效，无需为每个扩容项单独维护增量表，显示值与实购值同源。
// kind: 'upgrade'（S.upgrades 直读项：storage/cache/reserve_bin/deep_bin）
//       'building'（S.buildings 建筑：量子缓存池/维度压缩仓/超限储存器/深渊蓄能池/共鸣回廊/深渊凝析塔/数据中心）
export function epCapAfterBuy(id, kind = 'upgrade') {
  const bucketKey = kind === 'building' ? 'buildings' : 'upgrades';
  if (!S[bucketKey]) S[bucketKey] = {};
  const bucket = S[bucketKey];
  const had = Object.prototype.hasOwnProperty.call(bucket, id);
  const cur = bucket[id] || 0;
  bucket[id] = cur + 1;
  let cap;
  try { cap = epStorageCap(); } finally { if (had) bucket[id] = cur; else delete bucket[id]; } // 还原：原不存在的键直接删除，不往存档里写 0
  return cap;
}

// ========== v2.2 缺陷B修复：溢出池公共记账（addEp 与 tickCorruption 同口径） ==========
// 累计入 epOverflowTotal 页头统计；其中 5% 就地转化为 RP（换算 1/10000，满 1 转出、尾数滞留）
function accountEpOverflow(overflow) {
  S.epOverflowTotal = (S.epOverflowTotal || 0) + overflow;
  // v2.5 ④：EP 首次溢出 = 「矩阵存储库」购买入口开放（持久标记，随存档落盘）
  // v3.0.9 反馈②：溢出仅开放仓库入口，不再直接解锁研究点（RP 解锁唯一 = 购入仓库，见 disclosure.anchorDone('rp')）
  if (overflow > 0 && !S._rpOverflowSeen) {
    S._rpOverflowSeen = true;
  }
  // v2.8.22 ⑤：EP 达到上限后的溢出转化 RP，效率与蒸馏一致（1 RP = 蒸馏率 EP，蒸馏塔升级/星渊罗盘效率同步生效），
  // 满 1 RP 转出、尾数滞留池中（与蒸馏同口径，避免溢出自然产 RP 绕过蒸馏塔投入）
  // v3.0.9 反馈②：RP 未解锁（未购矩阵存储库）前溢出不转化 RP——杜绝绕过仓库白得研究点
  if (overflow > 0 && ((S.upgrades && (S.upgrades.rp_vault || 0) >= 1) || (S.upgrades && (S.upgrades.atrium || 0) >= 1))) {
    const rate = rpDistillRate();
    S._overflowRpPool = (S._overflowRpPool || 0) + overflow;
    const gained = Math.floor(S._overflowRpPool / rate);
    if (gained > 0) {
      S._overflowRpPool -= gained * rate;
      addRp(gained); // v2.8.27 ②：RP 存储上限（矩阵存储库扩容）
    }
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

// v3.4.1 反馈④：资源数值统一口径——两侧同函数，低于 1000 保 2 位小数、≥1000 走 k/M 缩写。
// 旧实现 DM 用 toFixed(2)、上限用 fmt → 顶部出现「2000.00 / 2.00k」的混排。
export function fmtRes(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 1000) return v.toFixed(2);
  return fmt(v);
}

export function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}
