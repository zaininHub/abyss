// v2.6.1：深渊裂隙玩法扩展
// 原版：单事件二选一（封印/拥抱），奖励单一 DM。
// 扩展：① 裂隙按 cps 分 5 级（浅层/中层/深层/深渊/虚空之隙），等级越高奖励越好；
//       ② 奖励多元化——DM（既有）+ RP（RP 锚点后）+ VS（深潜解锁后概率）+ 信仰（宗教解锁后概率）；
//       ③ 裂隙余烬（跨转生保留）：封印/拥抱/深入积累，用于裂隙专属升级树（哨站/透镜/护符/余烬共振）；
//       ④ 第三选项「深入裂隙」：持续 60s 探索（产出递增 + 腐化累积），结算时腐化超阈值损失 EP，可提前脱出。
// 既有 sealDmReward / embraceDurMs / 封印与拥抱行为保持（v2.1/v2.4 断言依赖）。
import { S, save } from '../state.js';
import { computeCps, fmt, epStorageCap, sealDmReward, embraceDurMs, vehicleTier, echoLv } from './economy.js';
// v2.7.3 ⑤：回响·裂隙共鸣（余烬 ×2/级）
function emberMul() { return (1 + (echoLv('echo_rift') || 0)) * policyMult('ember') * researchMult('rift') * (1 + 0.12 * riftUpgradeLevel('wellspring')) * ((S.religion && S.religion.abyss) ? 2 : 1); } // v3.6.0：余烬井喷 + 深渊崇拜分支 // v2.8.6 B2a：虚无主义 + v2.8.25 ②：裂隙数学（此前未接线）
import { BALANCE } from '../data/balance.js';
import { policyMult } from '../data/policies.js';
import { progressBar } from '../ui/widgets.js'; // v3.6.1 抽出共性 UI 构件（进度条）
import { researchMult, addDm, addRp } from './economy.js'; // v3.0.8：RP 上限统一入口
import { log, toast, dirty } from '../core/runtime.js'; // v3.0.0 测试性解耦
import { showAbyssGaze } from './abyssGaze.js'; // v3.4.2：凝视深渊彩蛋视觉层（独立模块，避免环形引用）

// v2.8.3：首次获得 DM 即点亮发现锚点（消除「有 DM 却未解锁」歧义）
export function discoverDm() {
  if (!S.resDiscovered) S.resDiscovered = {};
  S.resDiscovered.dm = true;
}

let riftSig = null;      // v2.1 R2：当前已渲染裂隙签名，避免 100ms 全量重建
let delegateBound = false; // v2.1 R2：容器级事件委托只绑一次

// ---- v2.6.1 裂隙等级 ----
// v3.3.9 反馈⑤：等级 = cps 潜力级（1~5）+ 科技树「裂隙等级」无限升级（EP+DM）；
// 余烬探测井的等级上限职能移除（科技等级即上限，可无限叠加）
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
  return 5 + riftLevelTech();
}
export function riftLevelOf(cps) {
  const lv = 1 + Math.floor(Math.log10(Math.max(1, cps || 1)));
  return Math.max(1, Math.min(5, lv) + riftLevelTech());
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
  S.riftLevelTech = riftLevelTech() + 1;
  // 已存在的裂隙不追加强度（下一次裂隙按新等级生成）
  save(S);
  log(`[裂隙] 裂隙等级科技升至 Lv.${S.riftLevelTech}（-${fmt(cost.ep)} EP / -${fmt(cost.dm)} DM）：裂隙等级与奖励 +1 级`, 'good');
  return { ok: true, level: S.riftLevelTech };
}
// 科技树「裂隙等级」卡片：结构签名去重，可购态原地刷新
// v3.4.1 反馈②：与科技树其余卡片完全同构（.tech / .name / .desc / .cost + .locked 灰显），
// 不再用 .item v21（在 .tech-grid 里没有 .cant 规则 → 买不起也不灰，且 max-width:520px 破坏栅格）；
// 文案同步收紧为「每级…」句式（对齐「每级全局产出 +2%」）
let riftTechSig = '';
function riftTechAfford(cost) {
  return (S.ep || 0) >= cost.ep && (S.dm || 0) >= cost.dm;
}
function riftTechTip(lv, cur) {
  // v3.4.6 反馈④：悬浮提示同样展示下一级具体数值
  // v3.4.8 反馈①：深入消耗改指数曲线后，直接给「下一级裂隙」的每秒消耗与 60s 总消耗
  const next = Math.min(riftMaxLevel(), cur + 1);
  return `裂隙等级 Lv.${lv} → Lv.${next}（无限升级）\n下一级：深入消耗 ${fmt(riftDelveEpPerSec(next))} EP/s（60s ≈ ${fmt(riftDelveTotalEp(next))} EP） · 深入产出 +${fmt((BALANCE.rift.delveDmPerLevel || 0.5) * next)} DM/s · 封印奖励 +${cur} DM\n当前裂隙 Lv.${cur}`;
}
export function renderRiftLevelTech(container) {
  if (!container) return;
  const title = document.getElementById('rift-tech-title');
  const shown = !!S._riftSeen || (S.riftsSealed || 0) > 0;
  if (title) title.style.display = shown ? '' : 'none';
  container.style.display = shown ? '' : 'none';
  if (!shown) { container.innerHTML = ''; riftTechSig = ''; return; }
  const lv = riftLevelTech();
  const cost = riftLevelTechCost();
  const cur = Math.min(riftMaxLevel(), riftLevelOf(computeCps()));
  // v3.4.1 反馈②：与「研究升级」卡完全同构（name + count + desc + cost，两行内收口），
  // 不再自造 .name span[style] 双段行——此前描述换行 3 行、多一行「当前裂隙」，比同排 tech 卡高 40%
  const sig = `${lv}|${cur}`;
  if (sig !== riftTechSig) {
    riftTechSig = sig;
    // v3.4.8 反馈①：展示「下一级裂隙」的深入消耗（指数曲线，60s 总量更直观）
    const nextLv = Math.min(riftMaxLevel(), cur + 1);
    container.innerHTML = `<div class="tech" data-rift-level title="${riftTechTip(lv, cur)}">
      <div class="name"><span>裂隙等级</span><span class="count mono">Lv.${lv}</span></div>
      <div class="desc">裂隙等级 +1<br>深入消耗 ${fmt(riftDelveEpPerSec(nextLv))} EP/s</div>
      <div class="cost mono" data-rift-level-cost>${fmt(cost.ep)} EP + ${fmt(cost.dm)} DM</div>
    </div>`;
    const el = container.querySelector('[data-rift-level]');
    if (el && !el._bound) {
      el._bound = true;
      el.addEventListener('click', () => {
        if (!riftTechAfford(riftLevelTechCost())) return; // 灰态不可点，避免连点误买
        const r = buyRiftLevelTech();
        if (!r.ok && toast) toast(r.reason);
        dirty.tech = true;
        dirty.rift = true;
      });
    }
  }
  refreshRiftLevelTechAfford();
}

// v3.4.1 反馈②⑥：可购态每秒原地刷新（此前只在 dirty.tech 时重算，EP/DM 变化后卡片长期停在旧灰态）
export function refreshRiftLevelTechAfford() {
  const el = document.querySelector('[data-rift-level]');
  if (!el) return;
  const cost = riftLevelTechCost();
  const afford = riftTechAfford(cost);
  el.classList.toggle('locked', !afford);
  const c = el.querySelector('[data-rift-level-cost]');
  const txt = `${fmt(cost.ep)} EP + ${fmt(cost.dm)} DM`;
  if (c && c.textContent !== txt) c.textContent = txt;
  const lv = riftLevelTech();
  const cur = Math.min(riftMaxLevel(), riftLevelOf(computeCps()));
  const t = el.querySelector('.name .count');
  const wantLv = `Lv.${lv}`;
  if (t && t.textContent !== wantLv) t.textContent = wantLv;
  el.title = riftTechTip(lv, cur);
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
  return Math.max(240, BALANCE.rift.spawnSec * Math.pow(0.75, lv)); // v3.3.3 反馈⑤：下限 240s（原 600s）
}
export function riftSpawnSec() {
  return riftSpawnSecAt(riftUpgradeLevel('sentinel'));
}
// v3.3.5 反馈③：裂隙改「确定性计时 + 随机抖动」——
// 旧实现每帧掷骰（p = dt/spawnSec），理论上均值 10 分钟，但方差大、后台 rAF 挂起时几乎不推进，
// 玩家长期看不到裂隙（反馈两次「裂隙不会触发」）。现改为计时器到点必出（抖动 0.85~1.15），
// 随机提前只作为额外机会；首次发现前 90 秒内必出（新手首见）。
export function riftNextSec() {
  if (!(S._riftNextSec > 0)) {
    const jitter = 0.95 + Math.random() * 0.1; // ±5%：体感随机但不偏离标称间隔
    S._riftNextSec = S._riftSeen ? riftSpawnSec() * jitter : Math.min(90, riftSpawnSec() * jitter);
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
  log(`[裂隙] 「${u.name}」升至 Lv.${lv + 1}（-${cost} 余烬）：${u.desc}`, 'good');
  return { ok: true, level: lv + 1 };
}

// ---- v2.6.1 深入裂隙（第三选项） ----
export function delveRift() {
  if (!S.activeRift) return { ok: false, reason: '裂隙已闭合' };
  if (S.riftExpedition) return { ok: false, reason: '已在深入探索中' };
  if (!S.resDiscovered || !S.resDiscovered.dm) return { ok: false, reason: '需先发现深渊之力（DM）——购入首辆载具或通过裂隙封印获得 DM' };
  const r = S.activeRift;
  const epCost = Math.ceil(r.sealCost * 0.5); // v2.8.30 ⑤：深入只消耗 EP（去 DM 门槛）
  if (S.ep < epCost) return { ok: false, reason: `EP 不足（需 ${fmt(epCost)}）` };
  S.ep -= epCost;
  S.riftExpedition = {
    until: Date.now() + BALANCE.rift.delveDurSec * 1000,
    level: r.level,
    sealCost: r.sealCost,
    gainedDm: 0, gainedVs: 0,
  };
  S.activeRift = null;
  dirty.rift = true;
  save(S);
  log(`[裂隙] 你深入了${riftLevelName(r.level)}…… 60 秒探索开始（产出递增，腐化累积）`, 'bad');
  return { ok: true };
}

export function abortRiftExpedition() {
  if (!S.riftExpedition) return { ok: false, reason: '未在深入' };
  // v2.8.12：紧急脱出不结算任何奖励（已消耗的 EP/DM 不退，已获产出丢弃）——提前退出 = 白费，鼓励完整探索
  log(`[裂隙] 紧急脱出：探索中止，未获得任何奖励（提前退出无结算）`, 'bad');
  S.riftExpedition = null;
  save(S);
  dirty.rift = true;
  return { ok: true };
}

// 深入探索逐帧结算：产出 + 腐化；到时终局（腐化超阈值损失）
function settleRiftExpedition(dt) {
  const ex = S.riftExpedition;
  if (!ex) return;
  const lv = ex.level;
  // v2.8.12：深入期间消耗 EP 换取 DM——EP 耗尽则探索立即失败（无奖励）
  // v3.4.8 反馈①：深入消耗随裂隙等级指数陡增（原线性 ×lv）
  const epUse = riftDelveEpPerSec(lv) * dt;
  const actualEp = Math.min(S.ep, epUse);
  S.ep -= actualEp;
  if (actualEp < epUse - 1e-9) {
    log(`[裂隙] 深入失败：EP 耗尽（探索中止，无奖励）`, 'bad');
    if (toast) toast('⚠️ EP 耗尽：深入探索失败，无奖励');
    S.riftExpedition = null;
    dirty.rift = true;
    save(S);
    return;
  }
  // 产出（DM 恒定 + VS 深潜解锁后）——v3.4.9 反馈④：奖励随等级只 +15%/级（原 ×lv 过快）
  const rewardMul = riftRewardMult(lv);
  ex.gainedDm += BALANCE.rift.delveDmPerLevel * rewardMul * dt;
  if (S.delve && S.delve.unlocked) ex.gainedVs += BALANCE.rift.delveVsPerLevel * rewardMul * dt;
  // v3.5.0 反馈①：腐化按「单次深入 = 33%~50%」摊到每秒，等级越高单次腐化越多（净化成本同步抬升）
  S.corruption = Math.min(100, (S.corruption || 0) + riftDelveCorruptPerSec(lv) * dt);
  if (Date.now() >= ex.until) {
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
    S.riftExpedition = null;
    save(S);
    dirty.rift = true;
    dirty.hero = true; // v2.6.4 ②：顶部深入状态即时清除
  }
  dirty.hero = true; // v2.6.4 ②：探索中顶部状态实时刷新
}

// ---- 主 tick ----
export function tickRift(dt) {
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
    S._riftT = (S._riftT || 0) + sdt;
    const need = riftNextSec();
    const lucky = Math.random() < Math.min(1, sdt / spawnSec);
    if (S._riftT >= need || lucky) {
      S._riftT = 0;
      S._riftNextSec = 0; // 下一轮重新掷抖动
      const level = riftLevelOf(cps);
      // v2.1 R3-D：封印成本 = 当前 EP 存储上限 × 30%~50% × 护符折扣
      const cap = epStorageCap();
      const ratio = BALANCE.rift.sealRatioMin +
        Math.random() * (BALANCE.rift.sealRatioMax - BALANCE.rift.sealRatioMin);
      S.activeRift = {
        power: level,
        level: level,
        sealCost: Math.ceil(cap * ratio * riftSealCostMult()),
        dmReward: Math.ceil(1 * level),
        expiresAt: Date.now() + 120000,
      };
      if (S.activeRift && S.riftAuto) {
        // v2.8.30：裂隙自动动作（互斥单开——开关值即升级 id）
        if (S.riftAuto === 'auto_seal') sealRift();
        else if (S.riftAuto === 'auto_embrace') embraceRift();
        else if (S.riftAuto === 'auto_descent') delveRift();
      }
      // v2.5 ①：首次触发深渊裂隙 = 探采平台/深渊商店解锁（持久标记，跨转生保留）
      if (!S._riftSeen) {
        S._riftSeen = true;
        dirty.shop = true;
        log('裂隙开启：探采平台与深渊商店已解锁', 'good');
      }
      log(`深渊裂隙在代码底层裂开：${riftLevelName(level)}（Lv.${level}）`, 'bad');
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
  const dmGain = sealDmReward(r) * riftDmMult();
  addDm(dmGain); // v2.8.27 ②：DM 上限
  if (dmGain > 0) discoverDm();
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
  const dmGain = grantRiftRewards(r, BALANCE.rift.emberSeal, false);
  S.riftsSealed++;
  log(`裂隙封印成功（${riftLevelName(r.level)}）：+${dmGain.toFixed(1)} DM（深渊物质）`, 'good');
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
    if (riftSig !== 'eta') {
      // v3.4.9 反馈⑦：深渊吞噬期（倒计时/抉择/崩溃/腐化满额）裂隙不再刷新——挂卡不显示倒计时，
      // 否则会出现「下一次裂隙 0 秒后出现」这种自相矛盾的文案
      const abyssLocked = !!(S.collapsed || S._collapseAt || S._collapseChoicePending
        || (S.corruption || 0) >= (BALANCE.corruption.max || 100));
      riftSig = abyssLocked ? 'abyss' : 'eta';
      container.innerHTML = abyssLocked ? ''
        : `<div style="font-size:13px;color:var(--text-1)">下一次裂隙 <b id="rift-eta" style="color:var(--purple)">--</b> 后出现</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:2px">基础间隔 ${fmtSpawnMin(riftSpawnSec())} · 升级「裂隙哨站」可缩短</div>`;
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
      深入 → 60 秒探索（约 <b>${fmt(riftDelveTotalEp(r.level))} EP</b> · 腐化 <b>+${riftDelveCorruptPerRun(r.level).toFixed(0)}%</b> · 超 ${BALANCE.rift.delveFailCorrupt}% 结算损失）</div>
      <div style="display:flex;gap:6px">
        <button class="btn" id="seal-rift" style="flex:1;font-size:12px">封印</button>
        <button class="btn" id="embrace-rift" style="flex:1;font-size:12px;background:rgba(163,113,247,.15);border-color:var(--purple)">拥抱</button>
        <button class="btn" id="delve-rift" ${dmUnlock ? '' : 'disabled'} title="${dmUnlock ? '深入裂隙：60 秒探索（需消耗 EP 与 DM）' : '需先发现深渊之力（DM）——购入首辆载具或封印裂隙获得'}" style="flex:1;font-size:12px;background:rgba(248,81,73,.12);border-color:var(--red, #f85149)">深入</button>
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
      <div style="font-size:11px;color:var(--text-3);margin:6px 0">腐化超 ${BALANCE.rift.delveFailCorrupt}% 结算时将损失 ${Math.round(BALANCE.rift.delveFailLoss * 100)}% 封印成本 EP；可提前脱出保留已获产出。</div>`;
    container.querySelector('#abort-rift-ex')?.addEventListener('click', () => {
      abortRiftExpedition(); // 保留（若旧档渲染缓存仍含按钮则兜底）
      renderRiftPanel(container);
    });
    return;
  }
  // v3.4.0 反馈①：裂隙已在场时不展示「下次裂隙 X 后出现」——此时 riftEtaSec() 恒为 0，
  // 显示「0 秒后出现」既无意义又误导（裂隙就在主界面浮卡上等你处理）；
  // 改为同一行的两种语义（标签+数值均由 1s 快刷原地更新，不重建面板）
  // v3.4.9 反馈⑦：进入深渊（倒计时/抉择/崩溃/腐化满额）后裂隙停止刷新，整行隐藏——
  // 此前仍显示「下一次裂隙 0 秒后出现」，与「不会再出裂隙」的事实矛盾
  const abyssLocked = !!(S.collapsed || S._collapseAt || S._collapseChoicePending
    || (S.corruption || 0) >= (BALANCE.corruption.max || 100));
  const etaLabel = S.activeRift ? '当前裂隙' : '下次裂隙';
  const etaText = S.activeRift
    ? `进行中 · 剩余 ${fmtEta(Math.max(0, Math.ceil((S.activeRift.expiresAt - Date.now()) / 1000)))}`
    : fmtEta(riftEtaSec());
  let html = `<div class="off-stat"><span>封印次数</span><b>${S.riftsSealed || 0}</b></div>
    <div class="off-stat"><span>裂隙间隔</span><b>${fmtSpawnMin(riftSpawnSec())}</b></div>
    ${abyssLocked ? '' : `<div class="off-stat"><span id="rift-eta-label">${etaLabel}</span><b id="rift-eta-tab" style="color:var(--purple)">${etaText}</b></div>`}
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">裂隙科技 · 余烬购买</div>`;
  for (const [id, u] of Object.entries(BALANCE.rift.upgrades)) {
    const lv = riftUpgradeLevel(id);
    const cost = lv >= u.cap ? null : riftUpgradeCost(id);
    // v2.6.4 ⑦ → v3.3.4 反馈⑤：哨站文案改「当前 → 下一级」，且下一级与 riftSpawnSec 同口径
    // （原 next 用 Math.max(600, ...) 硬编码旧下限，Lv.0 时算出来也是 10 分钟 → 文案与实际生效不符）
    let desc = u.desc;
    if (id === 'sentinel') {
      const cur = riftSpawnSec();
      if (lv >= u.cap) {
        desc = `裂隙出现间隔 ${fmtSpawnMin(cur)} · 已满级，每级 -25%`;
      } else {
        const next = riftSpawnSecAt(lv + 1);
        desc = next < cur - 1
          ? `裂隙出现间隔 ${fmtSpawnMin(cur)} → ${fmtSpawnMin(next)} · 每级 -25%，下限 4 分钟`
          : `裂隙出现间隔 ${fmtSpawnMin(cur)} · 已到最短，继续升级不再缩短`;
      }
    }
    // v2.8.30：自动动作升级项（已购）显示互斥开关——最多开一个
    // v3.4.9 反馈①：无限深入的开关移到左侧「自动转化」面板（本树只保留购买，避免两处开关不同步）
    const isAuto = (id === 'auto_seal' || id === 'auto_embrace');
    const autoOn = S.riftAuto === id;
    const autoToggle = isAuto && lv > 0
      ? `<button class="btn-mini rift-auto-toggle" data-rift-auto="${id}" style="${autoOn ? 'color:var(--good);border-color:var(--good)' : 'color:var(--text-3)'}">${autoOn ? '已开启' : '开启'}</button>`
      : '';
    // v3.4.9 反馈②：自动净化仪未满足前置时给出明确指引（卡片不隐藏，先让玩家知道有这件东西）
    if (id === 'auto_purify' && lv === 0 && riftUpgradeLevel('auto_descent') < 1) {
      html += `
      <div class="rift-upg-row" data-rift-upg="${id}" style="opacity:.55">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-1)">${u.name} <span style="color:var(--text-3);font-size:11px">Lv.0/${u.cap}</span></div>
          <div style="font-size:11px;color:var(--text-3)">🔒 需先购入「无限深入」 · 腐化每涨 5% 自动净化 5%（消耗 EP）</div>
        </div>
        <span style="flex-shrink:0;font-size:11px;color:var(--text-3)">未解锁</span>
      </div>`;
      continue;
    }
    const maxed = cost === null;
    const afford = !maxed && (S.riftEmber || 0) >= cost;
    // v2.8.30 review：余烬升级价格 pill 化（灰满级/绿可购/红不足）——与回响商店卡统一
    const pricePill = `<span style="flex-shrink:0;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:${maxed ? 'rgba(139,148,158,.15)' : afford ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.12)'};color:${maxed ? 'var(--text-3)' : afford ? 'var(--green,#3fb950)' : 'var(--red,#f85149)'}">${maxed ? '已满级' : cost + ' 余烬'}</span>`;
    html += `
      <div class="rift-upg-row" data-rift-upg="${id}">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-1)">${u.name} <span style="color:var(--text-3);font-size:11px">Lv.${lv}/${u.cap}</span></div>
          <div style="font-size:11px;color:var(--text-3)">${desc}</div>
        </div>
        ${autoToggle}
        ${maxed ? pricePill : `<button class="btn ${afford ? '' : 'disabled'}" data-rift-buy="${id}" ${afford ? '' : 'disabled'}>${cost} 余烬</button>`}
      </div>`;
  }
  container.innerHTML = html;
}
