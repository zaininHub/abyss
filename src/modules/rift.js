// v2.6.1：深渊裂隙玩法扩展
// 原版：单事件二选一（封印/拥抱），奖励单一 DM。
// 扩展：① 裂隙按 cps 分 5 级（浅层/中层/深层/深渊/虚空之隙），等级越高奖励越好；
//       ② 奖励多元化——DM（既有）+ RP（RP 锚点后）+ VS（深潜解锁后概率）+ 信仰（宗教解锁后概率）；
//       ③ 裂隙余烬（跨转生保留）：封印/拥抱/深入积累，用于裂隙专属升级树（哨站/透镜/护符/余烬共振）；
//       ④ 第三选项「深入裂隙」：持续 60s 探索（产出递增 + 腐化累积），结算时腐化超阈值损失 EP，可提前脱出。
// 既有 sealDmReward / embraceDurMs / 封印与拥抱行为保持（v2.1/v2.4 断言依赖）。
import { S, save } from '../state.js';
import { computeCps, fmt, epStorageCap, sealDmReward, embraceDurMs, vehicleTier, echoLv, corruptionCap } from './economy.js';
// v2.7.3 ⑤：回响·裂隙共鸣（余烬 ×2/级）
function emberMul() { return (1 + (echoLv('echo_rift') || 0)) * policyMult('ember') * researchMult('rift') * (1 + 0.12 * riftUpgradeLevel('wellspring')) * ((S.religion && S.religion.abyss) ? 2 : 1); } // v3.6.0：余烬井喷 + 深渊崇拜分支 // v2.8.6 B2a：虚无主义 + v2.8.25 ②：裂隙数学（此前未接线）
import { BALANCE } from '../data/balance.js';
import { policyMult } from '../data/policies.js';
import { progressBar } from '../ui/widgets.js'; // v3.6.1 抽出共性 UI 构件（进度条）
import { researchMult, addDm, addRp, spendRes, gainRes } from './economy.js'; // v3.0.8：RP 上限统一入口
import { log, toast, dirty } from '../core/runtime.js'; // v3.0.0 测试性解耦
import { showAbyssGaze } from './abyssGaze.js'; // v3.4.2：凝视深渊彩蛋视觉层（独立模块，避免环形引用）
import { leaderGlobalMult } from './threadBinding.js'; // v4.3.25 反馈④：领导全局加成接入裂隙 DM 产出

// v2.8.3：首次获得 DM 即点亮发现锚点（消除「有 DM 却未解锁」歧义）
export function discoverDm() {
  if (!S.resDiscovered) S.resDiscovered = {};
  S.resDiscovered.dm = true;
}

let riftSig = null;      // v2.1 R2：当前已渲染裂隙签名，避免 100ms 全量重建
let delegateBound = false; // v2.1 R2：容器级事件委托只绑一次

// ---- v2.6.1 裂隙等级 ----
// v3.6.4 反馈①：等级不再随 cps 自动成长，恒 = 初始 1 级 + 科技树「裂隙等级」级数（EP+DM，可无限叠加）。
// 余烬探测井的等级上限职能移除；玩家不做购买决策，等级不会自己涨。
export function riftLevelTech() {
  return (S.riftLevelTech | 0);
}
export function riftLevelTechCost() {
  const c = BALANCE.rift.levelTech || {};
  const lv = riftLevelTech();
  return {
    ep: Math.ceil((c.baseEp || 2e5) * Math.pow(c.epGrowth || 1.9, lv)),
    dm: Math.ceil((c.baseDm || 10) * Math.pow(c.dmGrowth || 1.7, lv)),
  };
}
export function riftMaxLevel() {
  // v3.6.4 反馈①：等级不再随 cps 自动成长 → 上限 = 初始 1 级 + 玩家主动购买的科技级数
  return 1 + riftLevelTech();
}
export function riftLevelOf(_cps) {
  // v3.6.4 反馈①：裂隙「不可自行升级」——旧口径 1 + floor(log10(cps))（1~5 级）会随产能
  //   自动跳级，玩家没做任何决策等级就涨了。现在只认科技树「裂隙等级」（buyRiftLevelTech）。
  //   保留 cps 形参只为兼容既有调用点（生成裂隙/科技卡/奖励倍率），不再参与计算。
  return 1 + riftLevelTech();
}
export function riftLevelName(lv) {
  // v3.4.6 反馈①：超 5 级只返回「虚空之隙」纯名——调用方各自追加 Lv.N，
  // 修复裂隙卡「虚空之隙 Lv.10 Lv.10」重复显示（旧版本函数内嵌 Lv.N 与调用方叠加）
  if (lv > 5) return '虚空之隙';
  return (BALANCE.rift.levelNames[lv - 1]) || `Lv.${lv}`;
}
// v3.3.9 反馈⑤：科技树购买裂隙等级（EP + DM 双消耗，无限升级）
export function buyRiftLevelTech() {
  const cost = riftLevelTechCost();
  if ((S.ep || 0) < cost.ep) return { ok: false, reason: `EP 不足（需 ${fmt(cost.ep)}）` };
  if ((S.dm || 0) < cost.dm) return { ok: false, reason: `DM 不足（需 ${fmt(cost.dm)}）` };
  S.ep -= cost.ep;
  S.dm -= cost.dm;
  spendRes('dm', cost.dm);
  S.riftLevelTech = riftLevelTech() + 1;
  // 已存在的裂隙不追加强度（下一次裂隙按新等级生成）
  save(S);
  return { ok: true, level: S.riftLevelTech };
}
// v4.3.14 反馈③：裂隙等级升级从科技树独立分类迁入裂隙模块——渲染为「裂隙科技」上方的
//   rift-upg-row 风格行（EP + DM 双消耗、无限升级），与余烬升级同面板同视觉语言。
function riftTechAfford(cost) {
  return (S.ep || 0) >= cost.ep && (S.dm || 0) >= cost.dm;
}
// v4.3.24 反馈①：原 riftTechTip（原生 title 悬浮文案）下线——升级需求/效果改 DOM 气泡。
// v4.3.25 反馈②：需求与效果拆成两个气泡源——等级名块悬浮只讲「下一级效果」，
//   「升级」按钮悬浮只讲升级消耗；行内副标题「悬浮查看升级需求」同步删除。
function escTip(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
/** 裂隙等级名块悬浮：只讲下一级效果（v4.3.25 反馈②）。 */
export function riftLevelTipText() {
  const cur = Math.min(riftMaxLevel(), riftLevelOf(computeCps()));
  const next = Math.min(riftMaxLevel(), cur + 1);
  return `下一级效果：深入消耗 ${fmt(riftDelveEpPerSec(next))} EP/s（60s ≈ ${fmt(riftDelveTotalEp(next))} EP）\n深入产出 +${fmt((BALANCE.rift.delveDmPerLevel || 0.5) * next)} DM/s · 封印奖励 +${cur} DM`;
}
/** 升级按钮悬浮：只讲升级需求；不可购买已由灰显按钮表达（v4.3.25 反馈①）。 */
export function riftLevelCostTipText() {
  const cost = riftLevelTechCost();
  return `升级需求：${fmt(cost.ep)} EP + ${fmt(cost.dm)} DM`;
}
/**
 * 裂隙等级行（v4.3.14 反馈③）：由 renderRiftPanel 在「裂隙科技」标题上方调用。
 * 门控：_riftSeen / riftsSealed 任一粘性标记（与旧科技树挂载点同口径）。
 * 返回 html 片段；空串 = 未见过裂隙（整行不渲染）。
 */
export function riftLevelRowHtml() {
  const shown = !!S._riftSeen || (S.riftsSealed || 0) > 0;
  if (!shown) return '';
  const lv = riftLevelTech();
  const cost = riftLevelTechCost();
  const afford = riftTechAfford(cost);
  return `
      <div class="rift-upg-row rift-level-row" data-rift-level>
        <div style="flex:1;cursor:help" data-rift-level-tip="${escTip(riftLevelTipText())}">
          <div style="font-size:13px;color:var(--text-1)">裂隙等级 <span style="color:var(--text-3);font-size:11px">Lv.${lv}</span></div>
        </div>
        <button class="btn ${afford ? '' : 'disabled'}" data-rift-level-buy data-rift-buy-tip="${escTip(riftLevelCostTipText())}" ${afford ? '' : 'disabled'}>升级</button>
      </div>`;
}
// ---- v3.4.8 反馈①：深入消耗陡增（原线性 ×lv → 指数） ----
// 消耗 = delveEpPerSec × delveEpGrowth^(Lv-1)；Lv1 3/s、Lv5 28/s、Lv10 232/s、Lv15 1.9K/s
// tick 结算、卡片文案、悬浮提示三处统一走本函数（避免三份硬编码再次漂移）
export function riftDelveEpPerSec(lv) {
  const base = BALANCE.rift.delveEpPerSec || 3;
  const g = BALANCE.rift.delveEpGrowth || 1.75;
  return base * Math.pow(g, Math.max(0, (lv || 1) - 1));
}
export function riftDelveTotalEp(lv, sec) {
  return riftDelveEpPerSec(lv) * (sec || BALANCE.rift.delveDurSec || 60);
}

// ---- v3.4.9 反馈④：裂隙等级「奖励只略微提升，代价落在净化」 ----
// 奖励倍率 = 1 + 0.15×(Lv-1)：Lv1 ×1、Lv5 ×1.6、Lv10 ×2.35（原 ×lv：Lv10 是 10 倍，产出过快）
export function riftRewardMult(lv) {
  const g = BALANCE.rift.delveRewardGrowth != null ? BALANCE.rift.delveRewardGrowth : 0.15;
  return 1 + g * Math.max(0, (lv || 1) - 1);
}
// ---- v3.5.0 反馈①：单次深入的腐化量（按次定义，不再按秒 ×等级） ----
// Lv1 33.3%（3 次填满）→ 每级 +10% → 单次封顶 50%（2 次填满）。
export function riftDelveCorruptPerRun(lv) {
  const base = BALANCE.rift.delveCorruptPerRun != null ? BALANCE.rift.delveCorruptPerRun : 33.3;
  const g = BALANCE.rift.delveCorruptGrowth != null ? BALANCE.rift.delveCorruptGrowth : 0.10;
  const cap = BALANCE.rift.delveCorruptRunCap != null ? BALANCE.rift.delveCorruptRunCap : 50;
  return Math.min(cap, base * (1 + g * Math.max(0, (lv || 1) - 1)));
}
export function riftDelveCorruptPerSec(lv) {
  return riftDelveCorruptPerRun(lv) / (BALANCE.rift.delveDurSec || 60);
}
// 主动净化 EP 成本倍率 = 1 + 0.30×(当前裂隙 Lv-1)：等级越高净化越贵（Lv10 ×3.7）
export function riftPurgeCostMult() {
  const lv = Math.max(1, Math.min(riftMaxLevel(), riftLevelOf(computeCps())));
  const g = BALANCE.rift.purgeCostPerLevel != null ? BALANCE.rift.purgeCostPerLevel : 0.30;
  return 1 + g * (lv - 1);
}

// ---- v2.6.1 余烬升级树 ----
export function riftUpgradeLevel(id) {
  return (S.riftUpgrades && S.riftUpgrades[id]) || 0;
}
export function riftUpgradeCost(id) {
  const u = BALANCE.rift.upgrades[id];
  // v2.8.30：自动动作升级消耗大量余烬（基础 ×10）
  // v3.4.9 反馈②：自动净化仪为「昂贵」档——单独 emberBase（1200 起），高于自动动作
  const base = u && u.emberBase
    ? u.emberBase
    : (id === 'auto_seal' || id === 'auto_embrace' || id === 'auto_descent')
      ? BALANCE.rift.upgBase * 10 : BALANCE.rift.upgBase;
  return Math.round(base * Math.pow(BALANCE.rift.upgGrowth, riftUpgradeLevel(id)));
}
export function riftSpawnSecAt(lv) {
  // v4.3.3 反馈⑨：哨站下限 240s(4min)→600s(10min)——避免高频裂隙冲掉节奏；首裂仍走 firstSpawnSec 不受影响
  return Math.max(600, BALANCE.rift.spawnSec * Math.pow(0.75, lv));
}
export function riftSpawnSec() {
  return riftSpawnSecAt(riftUpgradeLevel('sentinel'));
}
// v3.6.2 反馈②：裂隙解锁门槛——班组 ≥15 条线程后才可能出现。
//   达标即置持久标记（跨转生保留，与 _riftSeen 同风格）：线程后来流失也不收回裂隙。
//   旧档兼容：v3.6.1 及以前已触发过裂隙（_riftSeen）的存档直接视为已达标。
export function riftThreadsReady() {
  if (S._riftThreadUnlocked) return true;
  if (S._riftSeen) { S._riftThreadUnlocked = true; return true; } // 旧档迁移
  if ((S.cultists || []).length >= (BALANCE.rift.threadUnlock || 15)) { S._riftThreadUnlocked = true; return true; }
  return false;
}
// v3.3.5 反馈③：裂隙改「确定性计时 + 随机抖动」——
// 旧实现每帧掷骰（p = dt/spawnSec），理论上均值 = 间隔，但方差大、后台 rAF 挂起时几乎不推进，
// 玩家长期看不到裂隙（反馈两次「裂隙不会触发」）。现改为计时器到点必出（±5% 抖动）。
// v3.6.2 反馈②：删除「首次 90 秒必出」的新手加速——解锁节奏改由线程数门槛控制，首次同样 1 小时。
// v4.3.0 深渊提前：恢复首现加速但改 10 分钟（firstSpawnSec）——15→8 线程让门槛早达，
//   首现也提前，第 1 章末就能拿到第一口深渊内容；_riftSeen 置位后自然回落 1 小时常规节奏
//   （S._riftNextSec 在裂隙出现时清零，下次重掷时已走 spawnSec 分支，无需额外标记）。
export function riftNextSec() {
  if (!(S._riftNextSec > 0)) {
    const jitter = 0.95 + Math.random() * 0.1; // ±5%：体感随机但不偏离标称间隔
    const base = S._riftSeen ? BALANCE.rift.spawnSec : (BALANCE.rift.firstSpawnSec || BALANCE.rift.spawnSec);
    S._riftNextSec = base * jitter;
  }
  return S._riftNextSec;
}
// 距离下一次裂隙的秒数（0 = 已出现/探索中）
export function riftEtaSec() {
  if (S.activeRift || S.riftExpedition) return 0;
  return Math.max(0, Math.ceil(riftNextSec() - (S._riftT || 0)));
}
export function fmtEta(sec) {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`;
}
// v3.3.4 反馈⑤：间隔文案统一「X 分钟」格式（非整分保留一位小数），显示值即实际生效值
function fmtSpawnMin(sec) {
  const m = sec / 60;
  return `${Number.isInteger(m) ? m : Number(m.toFixed(1))} 分钟`;
}
export function riftDmMult() {
  return 1 + 0.2 * riftUpgradeLevel('lens');
}
export function riftSealCostMult() {
  return Math.max(0.5, 1 - 0.1 * riftUpgradeLevel('charm'));
}
export function riftVsMult() {
  return 1 + 0.5 * riftUpgradeLevel('echo') + 0.3 * riftUpgradeLevel('voidheart'); // v3.6.0：虚空之心
}
export function buyRiftUpgrade(id) {
  const u = BALANCE.rift.upgrades[id];
  if (!u) return { ok: false, reason: '未知升级' };
  const lv = riftUpgradeLevel(id);
  if (lv >= u.cap) return { ok: false, reason: `「${u.name}」已满级` };
  // v3.4.9 反馈②：自动净化仪的前置——必须先购入「无限深入」（只有持续深入才需要自动净化）
  if (id === 'auto_purify' && riftUpgradeLevel('auto_descent') < 1) {
    return { ok: false, reason: '需先购入「无限深入」（本树）' };
  }
  const cost = riftUpgradeCost(id);
  if (Math.floor(S.riftEmber || 0) < cost) return { ok: false, reason: `裂隙余烬不足（需 ${cost}，当前 ${Math.floor(S.riftEmber || 0)}）` };
  S.riftEmber -= cost;
  S.riftUpgrades[id] = lv + 1;
  if (id === 'sentinel') S._riftNextSec = 0; // v3.3.5 反馈③：升级后立即按新间隔重算倒计时
  if (id === 'gaze') { S.abyssGazeUnlocked = true; showAbyssGaze(); } // v3.4.2：凝视深渊彩蛋——首购常驻 + 触发裂开动画
  save(S);
  return { ok: true, level: lv + 1 };
}

// ---- v2.6.1 深入裂隙（第三选项） ----
export function delveRift() {
  if (!S.activeRift) return { ok: false, reason: '裂隙已闭合' };
  if (S.riftExpedition) return { ok: false, reason: '已在深入探索中' };
  if (!S.resDiscovered || !S.resDiscovered.dm) return { ok: false, reason: '需先发现深渊之力（DM）——购入首辆载具后经探采获得' }; // v4.3.13 反馈④：首裂不再送 DM，提示同步去掉「裂隙封印获得」路径
  const r = S.activeRift;
  const epCost = Math.ceil(r.sealCost * 0.5); // v2.8.30 ⑤：深入只消耗 EP（去 DM 门槛）
  if (S.ep < epCost) return { ok: false, reason: `EP 不足（需 ${fmt(epCost)}）` };
  S.ep -= epCost;
  spendRes('ep', epCost);
  S.riftExpedition = {
    until: Date.now() + BALANCE.rift.delveDurSec * 1000,
    level: r.level,
    sealCost: r.sealCost,
    gainedDm: 0, gainedVs: 0,
  };
  S.activeRift = null;
  dirty.rift = true;
  save(S);
  // 主动开始探索只用界面状态/提示反馈，不写入日志。
  return { ok: true };
}

// 深入状态会同时出现在主卡和裂隙页；所有退出路径必须使两处都重渲染，不能只依赖下一帧。
function clearRiftExpedition() {
  S.riftExpedition = null;
  save(S);
  dirty.rift = true;
  dirty.riftTab = true;
  dirty.hero = true;
}

export function abortRiftExpedition() {
  if (!S.riftExpedition) return { ok: false, reason: '未在深入' };
  // v2.8.12：紧急脱出不结算任何奖励（已消耗的 EP/DM 不退，已获产出丢弃）——提前退出 = 白费，鼓励完整探索
  clearRiftExpedition();
  return { ok: true };
}

function finishRiftExpedition(ex) {
  const lv = ex.level;
  const rewardMul = riftRewardMult(lv);
  // 终局：腐化 > 阈值 → 损失；否则结算奖励
  const fail = S.corruption > BALANCE.rift.delveFailCorrupt;
  if (fail) {
    const loss = Math.ceil(ex.sealCost * BALANCE.rift.delveFailLoss);
    S.ep = Math.max(0, S.ep - loss);
    log(`[裂隙] 深入终局：腐化 ${S.corruption.toFixed(0)}% 吞噬了探索——损失 ${fmt(loss)} EP`, 'bad');
    if (toast) toast('🌊 腐化吞噬：深入探索失败，损失 EP');
  } else {
    const dmTotal = ex.gainedDm + BALANCE.rift.delveBonusDm * rewardMul;
    addDm(dmTotal); // v2.8.27 ②：DM 上限
    if (dmTotal > 0) discoverDm();
    if (ex.gainedVs > 0) S.vs = (S.vs || 0) + ex.gainedVs;
    const emberGain = Math.round(BALANCE.rift.emberDelve * rewardMul * emberMul()); // v3.3.8 反馈②：整数化
    S.riftEmber = Math.round((S.riftEmber || 0) + emberGain);
    log(`[裂隙] 深入完成（${riftLevelName(lv)}）：+${dmTotal.toFixed(1)} DM${ex.gainedVs > 0 ? `、${ex.gainedVs.toFixed(1)} VS` : ''}、+${emberGain} 余烬`, 'good');
    if (toast) toast('🌌 深入完成：裂隙深处之物已带回');
  }
  clearRiftExpedition();
}

// 深入探索逐帧结算：产出 + 腐化；到时终局（腐化超阈值损失）
function settleRiftExpedition(dt) {
  const ex = S.riftExpedition;
  if (!ex) return;
  // 终局取绝对截止时间为准：面板即使已显示 0s，也不能再因没有资源流帧而永久卡在深入态。
  if (Date.now() >= Number(ex.until)) { finishRiftExpedition(ex); return; }
  const lv = ex.level;
  // v2.8.12：深入期间消耗 EP 换取 DM——EP 耗尽则探索立即失败（无奖励）
  // v3.4.8 反馈①：深入消耗随裂隙等级指数陡增（原线性 ×lv）
  const epUse = riftDelveEpPerSec(lv) * dt;
  const actualEp = Math.min(S.ep, epUse);
  S.ep -= actualEp;
  spendRes('ep', actualEp);
  if (actualEp < epUse - 1e-9) {
    log(`[裂隙] 深入失败：EP 耗尽（探索中止，无奖励）`, 'bad');
    if (toast) toast('⚠️ EP 耗尽：深入探索失败，无奖励');
    clearRiftExpedition();
    return;
  }
  // 产出（DM 恒定 + VS 深潜解锁后）——v3.4.9 反馈④：奖励随等级只 +15%/级（原 ×lv 过快）
  // v4.3.25 反馈④：领导全局加成只作用于深入探索的**持续 DM 产出**；VS 与结算奖励不乘
  const rewardMul = riftRewardMult(lv);
  ex.gainedDm += BALANCE.rift.delveDmPerLevel * rewardMul * leaderGlobalMult() * dt;
  if (S.delve && S.delve.unlocked) ex.gainedVs += BALANCE.rift.delveVsPerLevel * rewardMul * dt;
  // v3.5.0 反馈①：腐化按「单次深入 = 33%~50%」摊到每秒，等级越高单次腐化越多（净化成本同步抬升）
  S.corruption = Math.min(corruptionCap(), (S.corruption || 0) + riftDelveCorruptPerSec(lv) * dt);
  if (Date.now() >= ex.until) finishRiftExpedition(ex);
  dirty.hero = true; // v2.6.4 ②：探索中顶部状态实时刷新
}

// ---- 主 tick ----
export function tickRift(dt) {
  // v4.3.0 深渊提前②：第 1 章氛围低语（两条一次性叙事日志，无机制效果）——
  //   深渊是核心玩法，但裂隙首见前玩家对「深渊」零感知；用两条低语在裂隙出现前铺垫氛围：
  //   ① 开局 120s「细微低语」——第 1 章前几分钟就能听到深渊的第一声；
  //   ② 线程门槛达标「低语逼近」——裂隙倒计时开始的预告（此刻距首裂 ≤10 分钟）。
  //   判定只用即时字段（startedAt / riftThreadsReady），标记跨转生保留（与 _riftSeen 同风格）；
  //   旧档两标记缺省补发一次不重复（标记写入即幂等）。置于深入结算 return 之前，保证任何状态都可触发。
  if (!S._whisperSeen1 && (S.startedAt || 0) > 0 && (Date.now() - S.startedAt) >= 120000) {
    S._whisperSeen1 = true;
    log('工作台深处传来细微的低语……听不清内容，但它一直在。');
  }
  if (!S._whisperSeen2 && riftThreadsReady()) {
    S._whisperSeen2 = true;
    // 若 ① 尚未触发（旧档/快速档 startedAt 差值已超 120s）先补 ① 再发 ②，保持叙事顺序
    if (!S._whisperSeen1) {
      S._whisperSeen1 = true;
      log('工作台深处传来细微的低语……听不清内容，但它一直在。');
    }
    log('低语逼近——代码底层有什么东西在苏醒。');
  }
  // v2.6.1：深入探索结算优先（裂隙事件不并行出现）
  if (S.riftExpedition) {
    settleRiftExpedition(dt);
    return;
  }
  const cps = computeCps();
  const spawnSec = riftSpawnSec();
  // v2.9.0 Bug⑤：腐化满额（100%）时不触发新裂隙——此时走深渊吞噬/崩溃路径，
  // 裂隙若照常出现会与吞噬倒计时叠加（一边吞噬一边领裂隙奖励，机制互相抵消）；吞噬倒计时/抉择/崩溃期间同样封锁
  const abyssDevouring = S.collapsed || S._collapseAt || S._collapseChoicePending
    || (S.corruption || 0) >= (BALANCE.corruption.max || 100);
  // 深渊裂隙：计时必出（间隔受哨站升级缩短）+ 随机提前
  // v3.3.5 反馈③：不再只靠每帧掷骰——计时器到点必出，后台限流/挂起的时间由 _riftCatchup 补偿，
  // 保证「挂机也会出现」；随机项仅让裂隙有概率提前到来。
  const sdt = dt + (S._riftCatchup || 0);
  S._riftCatchup = 0;
  if (!S.activeRift && !abyssDevouring) {
    // v3.6.2 反馈②：班组 <15 条线程时裂隙不出现（计时也不推进）——解锁后从 0 开始按 1 小时节奏计数
    if (!riftThreadsReady()) { S._riftT = 0; }
    else {
    S._riftT = (S._riftT || 0) + sdt;
    const need = riftNextSec();
    const lucky = Math.random() < Math.min(1, sdt / spawnSec);
    if (S._riftT >= need || lucky) {
      S._riftT = 0;
      S._riftNextSec = 0; // 下一轮重新掷抖动
      // v3.6.4 反馈①：首次与后续裂隙都只按「初始 1 级 + 玩家购入的科技级数」生成，不读 cps
      const level = S._riftSeen ? riftLevelOf(cps) : 1;
      // v2.1 R3-D：封印成本 = 当前 EP 存储上限 × 30%~50% × 护符折扣
      const cap = epStorageCap();
      const ratio = BALANCE.rift.sealRatioMin +
        Math.random() * (BALANCE.rift.sealRatioMax - BALANCE.rift.sealRatioMin);
      S.activeRift = {
        power: level,
        level: level,
        sealCost: Math.ceil(cap * ratio * riftSealCostMult()),
        // v4.3.13 反馈④：首裂不发 DM——首裂出现时 DM 全链未开放（载具未购、深入未开、
        //   升级未解锁），封印/拥抱附带的 1 DM 是玩家眼中的「凭空赠送」（悬空货币）。
        //   firstRift 标记的裂隙结算时 dmReward 视作 0（见 grantRiftRewards 调用处），
        //   从第二只裂隙起 DM 奖励恢复正常——此时玩家已进入 DM 语义链。
        firstRift: !S._riftSeen,
        dmReward: Math.ceil(1 * level),
        expiresAt: Date.now() + (BALANCE.rift.staySec || 600) * 1000, // v3.6.2 反馈②：在场 10 分钟（原 2 分钟）
      };
      if (S.activeRift && S.riftAuto) {
        // v2.8.30：裂隙自动动作（互斥单开——开关值即升级 id）
        if (S.riftAuto === 'auto_seal') sealRift();
        else if (S.riftAuto === 'auto_embrace') embraceRift();
        else if (S.riftAuto === 'auto_descent') delveRift();
      }
      // v2.5 ①：首次触发深渊裂隙 = 探采平台/深渊商店入口开放（持久标记，跨转生保留）
      // v4.3.13 反馈④：日志文案改「入口已开放」——旧文案「已解锁」与真实解锁顺序不符：
      //   探采平台/深渊商店的功能解锁 = 购入载具（converterUnlocked），首裂只是开放入口可见性。
      if (!S._riftSeen) {
        S._riftSeen = true;
        dirty.shop = true;
        log('裂隙开启：探采平台与深渊商店入口已开放', 'good');
      }
      log(`深渊裂隙在代码底层裂开：${riftLevelName(level)}（Lv.${level}）`, 'bad');
    }
    }
  }
  if (S.activeRift && Date.now() > S.activeRift.expiresAt) {
    // 放任裂隙：短期爆发但损失 EP
    S.activeRift = null;
    S.buffMult = 3;
    S.buffUntil = Date.now() + 30000;
    S.ep = S.ep * 0.9;
    log('裂隙自行闭合，但留下了残渣和 10% EP 损耗', 'bad');
  }
}

// ---- v2.6.1 奖励结算（封印/拥抱共用：DM + RP + VS + 信仰 + 余烬） ----
function grantRiftRewards(r, emberGain, embrace) {
  // v4.3.13 反馈④：首裂不发 DM——首裂（firstRift 标记）结算时 dmReward 视作 0，
  //   不点亮 resDiscovered.dm（发现锚点只能由载具链/后续裂隙点亮）。
  const dmGain = r.firstRift ? 0 : sealDmReward(r) * riftDmMult();
  if (dmGain > 0) { addDm(dmGain); discoverDm(); } // v2.8.27 ②：DM 上限
  // RP：锚点解锁后 + level × 0.5（透镜同加成）
  if (S.resDiscovered && S.resDiscovered.rp) {
    const rpGain = BALANCE.rift.rpPerLevel * r.level * riftDmMult();
    addRp(rpGain); // v3.0.8：受 RP 上限约束
    log(`裂隙回响：+${rpGain.toFixed(1)} RP`, 'good');
  }
  // VS：深潜解锁后概率
  if (S.delve && S.delve.unlocked && Math.random() < BALANCE.rift.vsChance) {
    const vsGain = r.level * riftVsMult();
    S.vs = (S.vs || 0) + vsGain;
    log(`裂隙深处共鸣：+${vsGain} 虚空碎片`, 'good');
  }
  // 信仰：宗教解锁后概率
  if (S.religion && S.religion.unlocked && Math.random() < BALANCE.rift.faithChance) {
    S.faith = (S.faith || 0) + 1;
    gainRes('fp', 1);
    log(`裂隙神谕：+1 FP`, 'good');
  }
  S.riftEmber = Math.round((S.riftEmber || 0) + emberGain * emberMul()); // v3.3.8 反馈②：余烬整数化（浮点四舍五入显示与判定不一致）
  return dmGain;
}

export function sealRift() {
  if (!S.activeRift) return;
  const r = S.activeRift;
  if (S.ep < r.sealCost) { toast('EP 不足'); return; }
  S.ep -= r.sealCost;
  spendRes('ep', r.sealCost);
  const dmGain = grantRiftRewards(r, BALANCE.rift.emberSeal, false);
  S.riftsSealed++;
  // v4.3.14 反馈⑦：首裂不发 DM，日志不再打印「+0.0 DM」——dmGain>0 才带 DM 段
  log(dmGain > 0
    ? `裂隙封印成功（${riftLevelName(r.level)}）：+${dmGain.toFixed(1)} DM（深渊物质）`
    : `裂隙封印成功（${riftLevelName(r.level)}）`, 'good');
  S.activeRift = null;
  save(S);
  dirty.rift = true; // v2.1.1 P1-A：置空后立即触发裂隙区重渲染，消除卡片残留
  dirty.shop = true; // v2.7.1：封印到账 DM 后探采页头即时同步（updateVehicleCollectHeader 走 dirty.shop 渲染链路）
}

export function embraceRift() {
  if (!S.activeRift) return;
  const r = S.activeRift;
  S.buffMult = 5;
  // v1.3 模块 D 第 1 层：拥抱爆发时长 + 载具档位 ×5s（无载具 = 60s，与 v2.1.x 完全一致）
  const durMs = embraceDurMs();
  S.buffUntil = Date.now() + durMs;
  S.ep = S.ep * 0.8;
  grantRiftRewards(r, BALANCE.rift.emberEmbrace, true);
  log(`你拥抱了裂隙（${riftLevelName(r.level)}）：${Math.round(durMs / 1000)} 秒 ×5，但损失 20% EP`, 'good');
  S.activeRift = null;
  save(S);
  dirty.rift = true; // v2.1.1 P1-A：置空后立即触发裂隙区重渲染，消除卡片残留
}

// ---- 渲染：裂隙事件卡（主界面浮卡） ----
// v2.8.26 ④：裂隙余烬升级/深入按钮可购判定每秒同步（余烬/DM 变化即时灰显）——此前仅渲染时判定
export function refreshRiftAffordability() {
  if (S.riftExpedition) return; // 深入中不刷升级按钮
  for (const row of document.querySelectorAll('[data-rift-upg]')) {
    // v3.4.0 反馈②：此前用 u.id 取键——BALANCE.rift.upgrades 的条目没有 id 字段，
    // riftUpgradeLevel/Cost 拿到 undefined 恒返回 Lv.0 + 基础价（20），于是每秒快刷把
    // 渲染时正确置灰的按钮又全部「点亮」（余烬 84 也能买 200 的项）。改用 dataset 里的真实 id。
    const id = row.dataset.riftUpg;
    const u = BALANCE.rift.upgrades[id];
    if (!u) continue;
    const lv = riftUpgradeLevel(id);
    const cost = lv >= u.cap ? null : riftUpgradeCost(id);
    // v3.4.1 反馈⑥：只动「购买」按钮——此前 row.querySelector('button') 会命中自动动作的
    // 「开启/已开启」互斥开关，余烬不足时把开关一起置灰（点不动、也不报错，看起来像功能坏了）
    const btn = row.querySelector('button[data-rift-buy]');
    const ember = Math.floor(S.riftEmber || 0); // v3.3.8 反馈②：与显示/扣费同口径（旧档浮点余烬不再出现「显示够、判定不够」）
    if (btn) { btn.disabled = cost === null || ember < cost; btn.classList.toggle('disabled', cost !== null && ember < cost); }
    row.classList.toggle('cant', cost !== null && ember < cost);
  }
  const delve = document.getElementById('delve-rift');
  if (delve) {
    // v3.1.1 反馈④：DM 未解锁时深入按钮灰显（v2.8.30 曾误移除灰显——delveRift 内仍要求 DM，
    // 按钮却恒亮可点，点了才报「需先发现深渊之力」）
    const dmUnlock = !!(S.resDiscovered && S.resDiscovered.dm);
    delve.disabled = !dmUnlock;
    delve.classList.toggle('disabled', !dmUnlock);
  }
  // v4.3.14 反馈③：裂隙等级行可购态每秒同步（EP/DM 变化即时灰显/点亮——
  //   自科技树迁入后原 refreshRiftLevelTechAfford 下线，能力并入本函数）
  // v4.3.25 反馈②：等级名块 data-rift-level-tip（效果）与升级按钮 data-rift-buy-tip（需求）
  //   分开刷新——纯属性写，不动 DOM 结构，与 300ms affordability 帧纪律一致
  const lvRow = document.querySelector('[data-rift-level]');
  if (lvRow) {
    const cost = riftLevelTechCost();
    const afford = riftTechAfford(cost);
    const btn = lvRow.querySelector('button[data-rift-level-buy]');
    if (btn) {
      btn.disabled = !afford;
      btn.classList.toggle('disabled', !afford);
      btn.setAttribute('data-rift-buy-tip', riftLevelCostTipText());
    }
    lvRow.classList.toggle('cant', !afford);
    const lvName = lvRow.querySelector('[data-rift-level-tip]');
    if (lvName) lvName.setAttribute('data-rift-level-tip', riftLevelTipText());
  }
}

export function renderRift(container) {
  if (!container) return;
  const card = document.getElementById('rift-card');
  // v3.3.8 反馈③：深入裂隙状态与矩阵腐化条已移入本卡——只要在深入或有腐化，卡片就必须可见
  const hudDirty = !!S.riftExpedition || (S.corruption || 0) > 0.01;
  if (!S.activeRift) {
    // v3.3.5 反馈③：首次见过裂隙后卡片常驻，显示「下一次裂隙倒计时」——
    // 原先无裂隙时整卡隐藏，玩家无法判断裂隙机制是否生效（误以为不会触发）
    if (!S._riftSeen && !hudDirty) {
      if (card) card.style.display = 'none';
      if (container.firstChild) container.innerHTML = '';
      riftSig = null;
      return;
    }
    if (card) card.style.display = '';
    if (!S._riftSeen) { // 只承载 HUD（腐化/深入），不显示裂隙倒计时
      if (riftSig !== 'hud') { riftSig = 'hud'; container.innerHTML = ''; }
      return;
    }
    // v3.12.3：深入裂隙进行中（riftExpedition 真值）= 裂隙当前就在眼前，不显示「下一次裂隙」倒计时，
    // 否则会出现「下一次裂隙 0 秒后出现」的自相矛盾文案（已有裂隙在深入，无需再等下一道）
    if (S.riftExpedition) {
      if (riftSig !== 'delving') { riftSig = 'delving'; container.innerHTML = ''; }
      return;
    }
    if (riftSig !== 'eta') {
      // v3.4.9 反馈⑦：深渊吞噬期（倒计时/抉择/崩溃/腐化满额）裂隙不再刷新——挂卡不显示倒计时，
      // 否则会出现「下一次裂隙 0 秒后出现」这种自相矛盾的文案
      const abyssLocked = !!(S.collapsed || S._collapseAt || S._collapseChoicePending
        || (S.corruption || 0) >= (BALANCE.corruption.max || 100));
      riftSig = abyssLocked ? 'abyss' : 'eta';
      // v4.3.3 反馈⑥：删「基础间隔 N 分钟 · 升级「裂隙哨站」可缩短」整行——
      //   该值随哨站升级漂移（基础 60min、Lv1 显示 45min），与实际触发频率口径不符，只留倒计时。
      container.innerHTML = abyssLocked ? ''
        : `<div style="font-size:13px;color:var(--text-1)">下一次裂隙 <b id="rift-eta" style="color:var(--purple)">--</b> 后出现</div>`;
    }
    const etaEl = container.querySelector('#rift-eta');
    if (etaEl) etaEl.textContent = fmtEta(riftEtaSec());
    return;
  }
  if (card) card.style.display = '';
  const r = S.activeRift;
  const sig = `${r.power}|${r.expiresAt}|${r.sealCost}|${r.level}`;
  // v2.1 R2：裂隙卡片只在「新裂隙出现」时重建一次 DOM；此后每帧只更新倒计时文本节点。
  if (sig !== riftSig || !container.querySelector('#seal-rift')) {
    riftSig = sig;
    const left = Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000));
    const dmUnlock = !!(S.resDiscovered && S.resDiscovered.dm);
    container.innerHTML = `<div style="font-size:12px;color:var(--text-2);margin-bottom:8px">
      ${riftLevelName(r.level)} <b style="color:var(--purple)">Lv.${r.power}</b> · 剩余 <span id="rift-left">${left}</span>s<br>
      当前 DM: <b id="rift-dm-balance">${(S.dm || 0).toFixed(2)}</b> → 奖励 <b style="color:var(--purple)">+<span id="rift-dm">${sealDmReward(r)}</span> DM</b><br>
      封印消耗 <b>${fmt(r.sealCost)} EP</b><br>
      拥抱 → <span id="rift-dur">${Math.round(embraceDurMs() / 1000)}</span> 秒 ×5 爆发，但损失 20% EP<br>
      60 秒探索（约 <b>${fmt(riftDelveTotalEp(r.level))} EP</b> · 腐化 <b>+${riftDelveCorruptPerRun(r.level).toFixed(0)}%</b> · 超 ${BALANCE.rift.delveFailCorrupt}% 结算损失）</div>
      <div style="display:flex;gap:6px">
        <button class="btn" id="seal-rift" style="flex:1;font-size:12px">封印</button>
        <button class="btn" id="embrace-rift" style="flex:1;font-size:12px;background:rgba(163,113,247,.15);border-color:var(--purple)">拥抱</button>
        <button class="btn" id="delve-rift" ${dmUnlock ? '' : 'disabled'} title="${dmUnlock ? `深入裂隙：60 秒探索 · 消耗 启动 ${fmt(Math.ceil(r.sealCost * 0.5))} EP + 探索期约 ${fmt(riftDelveTotalEp(r.level))} EP` : '需先发现深渊之力（DM）——购入首辆载具或封印裂隙获得'}" style="flex:1;font-size:12px;background:rgba(248,81,73,.12);border-color:var(--red, #f85149)">深入</button>
      </div>`;
    if (!delegateBound) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'seal-rift') sealRift();
        else if (btn.id === 'embrace-rift') embraceRift();
        else if (btn.id === 'delve-rift') { const r = delveRift(); if (!r.ok && toast) toast(r.reason); }
      });
      delegateBound = true;
    }
  }
  const leftEl = container.querySelector('#rift-left');
  if (leftEl) leftEl.textContent = Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000));
  const dmBalEl = container.querySelector('#rift-dm-balance');
  if (dmBalEl) dmBalEl.textContent = (S.dm || 0).toFixed(2); // v2.4.2：DM 精确到小数
  const dmEl = container.querySelector('#rift-dm');
  if (dmEl) dmEl.textContent = (sealDmReward(r) * riftDmMult()).toFixed(1);
  const durEl = container.querySelector('#rift-dur');
  if (durEl) durEl.textContent = Math.round(embraceDurMs() / 1000);
}

// ---- 渲染：裂隙栏目（余烬 + 升级树 + 历史 + 深入探索状态） ----
export function renderRiftPanel(container) {
  if (!container) return;
  if (S.riftExpedition) {
    const ex = S.riftExpedition;
    const total = BALANCE.rift.delveDurSec;
    const left = Math.max(0, Math.ceil((ex.until - Date.now()) / 1000));
    const pct = Math.max(0, Math.min(100, (1 - (ex.until - Date.now()) / (total * 1000)) * 100));
    container.innerHTML = `
      <div style="margin:6px 0"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-2);margin-bottom:2px"><span>探索进度</span><span>剩余 ${left}s</span></div>
      ${progressBar(pct, 'linear-gradient(90deg,var(--cyan,#22d3ee),var(--accent,#a855f7))')}</div>
      <div class="off-stat"><span>已获 DM</span><b style="color:var(--green)">+${ex.gainedDm.toFixed(1)}</b></div>
      <div class="off-stat"><span>已获 VS（深潜联动）</span><b style="color:var(--cyan)">+${ex.gainedVs.toFixed(2)}</b></div>
      <div class="off-stat"><span>当前腐化</span><b style="color:${S.corruption > BALANCE.rift.delveFailCorrupt ? 'var(--red,#f85149)' : 'var(--text-2)'}">${S.corruption.toFixed(1)}% ${S.corruption > BALANCE.rift.delveFailCorrupt ? '⚠ 超阈值将损失' : '安全'}</b></div>
      <div style="font-size:11px;color:var(--text-3);margin:6px 0">腐化超 ${BALANCE.rift.delveFailCorrupt}% 结算时将损失 ${Math.round(BALANCE.rift.delveFailLoss * 100)}% 封印成本 EP；紧急脱出会放弃所有未结算产出。</div>`;
    return;
  }
  // v3.4.0 反馈①：裂隙已在场时不展示「下次裂隙 X 后出现」——此时 riftEtaSec() 恒为 0，
  // 显示「0 秒后出现」既无意义又误导（裂隙就在主界面浮卡上等你处理）；
  // 改为同一行的两种语义（标签+数值均由 1s 快刷原地更新，不重建面板）
  // v3.4.9 反馈⑦：进入深渊（倒计时/抉择/崩溃/腐化满额）后裂隙停止刷新，整行隐藏——
  // 此前仍显示「下一次裂隙 0 秒后出现」，与「不会再出裂隙」的事实矛盾
  const abyssLocked = !!(S.collapsed || S._collapseAt || S._collapseChoicePending
    || (S.corruption || 0) >= (BALANCE.corruption.max || 100) || S.riftExpedition);
  const etaLabel = S.activeRift ? '当前裂隙' : '下次裂隙';
  const etaText = S.activeRift
    ? `进行中 · 剩余 ${fmtEta(Math.max(0, Math.ceil((S.activeRift.expiresAt - Date.now()) / 1000)))}`
    : fmtEta(riftEtaSec());
  let html = `<div class="off-stat"><span>封印次数</span><b>${S.riftsSealed || 0}</b></div>
    <div class="off-stat"><span>裂隙间隔</span><b>${fmtSpawnMin(riftSpawnSec())}</b></div>
    ${abyssLocked ? '' : `<div class="off-stat"><span id="rift-eta-label">${etaLabel}</span><b id="rift-eta-tab" style="color:var(--purple)">${etaText}</b></div>`}`;
  // v4.3.13 反馈②：裂隙科技树在首次获取余烬前整块不渲染——没见过余烬的玩家看到
  //   「余烬购买」树只会困惑（买不起也看不懂余烬是什么）；拿到第一枚余烬后整树亮出。
  const emberSeen = (S.riftEmber || 0) > 0;
  // v4.3.13 反馈②：VS 相关升级（余烬共振/虚空之心）在首次获取 VS 前隐藏——
  //   玩家还没见过虚空碎片（VS 来自深潜/裂隙深入），提前亮出只会增加理解成本。
  const vsSeen = (S.vs || 0) > 0;
  // v4.3.14 反馈③：裂隙等级行——移自科技树独立分类，置于「裂隙科技」上方；
  //   门控只看「见过裂隙」（不必先有余烬），余烬科技树仍按 emberSeen 单独门控。
  html += riftLevelRowHtml();
  if (emberSeen) {
    html += `<div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">裂隙科技</div>`;
    for (const [id, u] of Object.entries(BALANCE.rift.upgrades)) {
      // v4.3.13 反馈②：VS 升级门——vs 为 0 时两张 VS 卡不渲染
      if (!vsSeen && (id === 'echo' || id === 'voidheart')) continue;
      const lv = riftUpgradeLevel(id);
      const cost = lv >= u.cap ? null : riftUpgradeCost(id);
      // v2.6.4 ⑦ → v3.3.4 反馈⑤：哨站文案改「当前 → 下一级」，且下一级与 riftSpawnSec 同口径
      // v4.3.3 反馈⑨：删「· 每级 -25%，下限 4 分钟」尾巴（下限已改 10 分钟，百分比与实际漂移不符）
      let desc = u.desc;
      if (id === 'sentinel') {
        const cur = riftSpawnSec();
        if (lv >= u.cap) {
          desc = `裂隙出现间隔 ${fmtSpawnMin(cur)} · 已满级`;
        } else {
          const next = riftSpawnSecAt(lv + 1);
          desc = next < cur - 1
            ? `裂隙出现间隔 ${fmtSpawnMin(cur)} → ${fmtSpawnMin(next)}`
            : `裂隙出现间隔 ${fmtSpawnMin(cur)} · 已到最短，继续升级不再缩短`;
        }
      }
      // v2.8.30：自动动作升级项（已购）显示互斥开关——最多开一个
      // v4.3.3 反馈⑧：三项（含无限深入）统一在本树显示互斥开关，删左侧「自动转化」里的深入开关
      //   （v3.4.9 曾为防双开关不同步把它移走，现在把三处合一，单一入口）。
      const isAuto = (id === 'auto_seal' || id === 'auto_embrace' || id === 'auto_descent');
      const autoOn = S.riftAuto === id;
      const autoToggle = isAuto && lv > 0
        ? `<button class="btn-mini rift-auto-toggle" data-rift-auto="${id}" aria-pressed="${autoOn ? 'true' : 'false'}" style="${autoOn ? 'color:var(--good);border-color:var(--good)' : 'color:var(--text-3)'}">${autoOn ? '已开启' : '开启'}</button>`
        : '';
      // v3.12.6 ⑥：未购入「无限深入」时整张卡不出现（原来是一张带「需先购入…」的锁定卡，
      //   玩家嫌这是把解锁条件写在面板上）。买入无限深入后自动解锁，无需任何提示文案。
      if (id === 'auto_purify' && lv === 0 && riftUpgradeLevel('auto_descent') < 1) continue;
      const maxed = cost === null;
      const afford = !maxed && (S.riftEmber || 0) >= cost;
      // v2.8.30 review：余烬升级价格 pill 化（灰满级/绿可购/红不足）——与回响商店卡统一
      const pricePill = `<span style="flex-shrink:0;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:${maxed ? 'rgba(139,148,158,.15)' : afford ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.12)'};color:${maxed ? 'var(--text-3)' : afford ? 'var(--green,#3fb950)' : 'var(--red,#f85149)'}">${maxed ? '已满级' : cost + ' 余烬'}</span>`;
      html += `
      <div class="rift-upg-row" data-rift-upg="${id}">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-1)">${u.name}${isAuto ? '' : ` <span style="color:var(--text-3);font-size:11px">Lv.${lv}/${u.cap}</span>`}</div>
          <div style="font-size:11px;color:var(--text-3)">${desc}</div>
        </div>
        ${autoToggle}
        ${maxed ? pricePill : `<button class="btn ${afford ? '' : 'disabled'}" data-rift-buy="${id}" ${afford ? '' : 'disabled'}>${cost} 余烬</button>`}
      </div>`;
    }
  }
  container.innerHTML = html;
}
