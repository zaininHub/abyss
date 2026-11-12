// v2.5.7：宗教系统模块——解锁（仓库有库存）/ 分支选择 / 圣印升级 / 圣所产出 / 面板渲染
import { S, save } from '../state.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：倍率 → 带符号百分比
import { epStorageCap, fmt, echoLv, faithTechMult, researchMult } from './economy.js';
import { converterEnabled, converterThreadBoost } from './threadBinding.js'; // v3.3.3 反馈⑦：圣所接入线程绑定（统一开关口径）
import {
  RELIGIONS, sealMaxLevel, sealUpgradeCost, TEMPLE, templeCost, templeFaithPerSec,
  religionUnlocked, branchOf, sealLevel, visibleReligions,
  ORACLE, CRUSADE, oracleLevel, crusadeLevel, oracleCost, crusadeCost,
  PRAISE, SECRET_SANCTUMS, devotion, transcendLevel, secretSanctumLv, secretSanctumCost,
  praiseRate, faithCap, devotionMult, transcendCost, fpCapFillSec,
} from '../data/religions.js';
import { policyMult } from '../data/policies.js';
import { dirty } from '../core/runtime.js'; // v3.5.0：FP 越界钳回后需要立刻重渲染面板

let logFn = null;
let toastFn = null;
export function setReligionLogFn(fn) { logFn = fn; }
export function setReligionToastFn(fn) { toastFn = fn; }
function rlog(msg, cls) { if (logFn) logFn(`[宗教] ${msg}`, cls); }

// v2.8.2 解锁前提（反馈：宗教解锁过于简单——超长线功能，需中后期资源积累）：
//   ① 存储节点 ≥3 级（仓库扩建三阶，前期无法达成）
//   ② EP 库存 ≥ 存储上限 80%（深度囤积，不能只囤半仓）
//   ③ RP 已觉醒（首次溢出过——已触及效能外溢，进入研究阶段）
// v2.8.7：解锁前置条件保留（存储≥3 + RP 觉醒），但「唤醒信仰」需消耗 EP（当前上限的 20%），而非达标自动解锁
export function canUnlockReligion() {
  // v3.4.6 反馈⑫：存储节点曲线对调后改「备用粮仓 ≥3 级」（前期防死锁关键件，节奏不变）；
  // 旧档按存储节点 ≥3 兼容
  const granaryLv = S.upgrades.reserve_bin || 0;
  const storageLv = S.upgrades.storage || 0;
  if (granaryLv < 3 && storageLv < 3) return false;
  if (!(S.resDiscovered && S.resDiscovered.rp)) return false;
  return true; // v2.8.19：去除 EP 库存 ≥ 存储上限 80% 限制（解锁仅需粮仓≥3 + RP 觉醒；唤醒仍需消耗 EP）
}

export function religionWakeCost() {
  return 200000; // v2.8.30：唤醒价格大幅上涨（50K→200K，固定值）
}

export function unlockReligion() {
  if (religionUnlocked()) return { ok: false, reason: '已解锁' };
  if (!canUnlockReligion()) return { ok: false, reason: '需存储节点 ≥3 级且 RP 已觉醒' };
  // v2.8.30 ⑦：唤醒消耗大量 EP（v3.4.9 起为固定 20 万，与 cap 脱钩——旧注释「存储上限 50%」已不成立）
  const cost = religionWakeCost();
  if ((S.ep || 0) < cost) return { ok: false, reason: `EP 不足：唤醒需 ${fmt(cost)} EP` };
  S.ep -= cost;
  S.religion = S.religion || {};
  S.religion.unlocked = true;
  if (S.resDiscovered) S.resDiscovered.faith = true;
  save(S);
  rlog(`信仰觉醒：消耗 ${fmt(cost)} EP 唤醒宗教系统（存储节点 ≥3 级 + RP 已觉醒）`, 'good');
  if (toastFn) toastFn('🙏 信仰觉醒：宗教系统已解锁');
  return { ok: true };
}

// 选择分支（选一锁定；跨转生保留）
export function selectBranch(id) {
  if (!religionUnlocked()) return { ok: false, reason: '未解锁' };
  const r = RELIGIONS.find(x => x.id === id);
  if (!r || !r.gate()) return { ok: false, reason: '该分支尚未解锁（进度不足）' };
  if (branchOf() && branchOf() !== id) return { ok: false, reason: '已信奉其他分支（改宗不可用）' };
  S.religion.branch = id;
  S.religion[id] = true;
  save(S);
  rlog(`信奉「${r.name}」：${r.effect}`, 'good');
  if (toastFn) toastFn(`${r.icon} 已信奉 ${r.name}：${r.effect}`);
  return { ok: true };
}

// 圣印升级（消耗信仰；等级上限随进度解锁）
export function upgradeSeal() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const lv = sealLevel();
  if (lv >= sealMaxLevel()) return { ok: false, reason: `圣印已达当前进度上限（Lv.${sealMaxLevel()}，解锁更多资源点可提升）` };
  const cost = sealUpgradeCost(lv);
  if ((S.faith || 0) < cost) return { ok: false, reason: `FP 不足（需 ${fmt(cost)}，当前 ${fmt(S.faith || 0)}）` };
  S.faith -= cost;
  S.religion.seal = lv + 1;
  save(S);
  rlog(`圣印升至 Lv.${lv + 1}（-${fmt(cost)} FP）——全局产出 +${8 * (lv + 1)}%`, 'good');
  return { ok: true, level: lv + 1 };
}

// 圣所购买（EP 建筑，信仰产出）
export function buyTemple() {
  if (!religionUnlocked()) return { ok: false, reason: '未解锁' };
  const lv = (S.religion && S.religion.temple) || 0;
  // v3.4.7 反馈③：圣所不设等级上限（cost ×1.35/级 + 单位 EP 消耗随级递增，天然限速）
  const cost = templeCost();
  if (S.ep < cost) return { ok: false, reason: `EP 不足（需 ${fmt(cost)}）` };
  S.ep -= cost;
  S.religion.temple = lv + 1;
  save(S);
  rlog(`信仰圣所升至 Lv.${lv + 1}（-${fmt(cost)} EP）：FP 产出 +${TEMPLE.faithPerSec.toFixed(3)}/s（当前合计 ${templeFaithPerSec().toFixed(3)}/s）`, 'good');
  return { ok: true };
}

// v3.0.1：信仰圣所关闭/重启开关——关闭时停止信仰产出（不消耗 EP），但每次关闭损失信仰 30% + 虔诚 15%（冷启动代价）
// 重启无代价（仅恢复产出）。设计目的：圣所产信仰时持续烧 EP，玩家可临时关闭省 EP，但关闭有代价防滥用
export function toggleTemple() {
  if (!religionUnlocked()) return { ok: false, reason: '未解锁' };
  const lv = (S.religion && S.religion.temple) || 0;
  if (lv < 1) return { ok: false, reason: '需先建造信仰圣所' };
  const off = !!(S.religion && S.religion.templeOff);
  if (!off) {
    // 关闭：损失信仰 30%（至少 1 若有信仰）+ 虔诚 15%（至少 1 若有虔诚）
    const faithLoss = Math.max(0, Math.floor((S.faith || 0) * 0.30));
    const devLoss = Math.max(0, Math.floor((S.devotion || 0) * 0.15));
    S.faith = Math.max(0, (S.faith || 0) - faithLoss);
    S.devotion = Math.max(0, (S.devotion || 0) - devLoss);
    S.religion.templeOff = true;
    save(S);
    const parts = [];
    if (faithLoss > 0) parts.push(`-${faithLoss.toFixed(2)} FP`);
    if (devLoss > 0) parts.push(`-${devLoss} 虔诚`);
    rlog(`信仰圣所已关闭：停止信仰产出与 EP 消耗${parts.length ? '（冷启动代价：' + parts.join('，') + '）' : '（无信仰/虔诚可损失）'}`, 'bad');
    if (toastFn) toastFn(`信仰圣所已关闭${parts.length ? '（损失 ' + parts.join('，') + '）' : ''}`);
  } else {
    // 重启：无代价，恢复产出；v3.0.2：清除自动暂停标记
    S.religion.templeOff = false;
    S.religion._templeAutoPaused = false;
    S._templeEpShortSec = 0;
    save(S);
    rlog(`信仰圣所已重启：恢复 FP 产出（+${templeFaithPerSec().toFixed(3)} FP/s，消耗 -${fmt(faithDrainPerSec())} EP/s）`, 'good');
    if (toastFn) toastFn('信仰圣所已重启');
  }
  return { ok: true };
}

// v2.6.4 ⑤：神谕塔升级（消耗信仰，后期信仰深耕）
export function buyOracle() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const lv = oracleLevel();
  if (lv >= ORACLE.cap) return { ok: false, reason: '神谕塔已满级' };
  if (sealLevel() < 3) return { ok: false, reason: '神谕塔需圣印 ≥3 级（信仰深耕前置）' };
  const cost = oracleCost();
  if ((S.faith || 0) < cost) return { ok: false, reason: `FP 不足（需 ${fmt(cost)}，当前 ${(S.faith || 0).toFixed(2)}）` };
  S.faith -= cost;
  S.religion.oracle = lv + 1;
  save(S);
  rlog(`神谕塔升至 Lv.${lv + 1}（-${cost} FP）：FP 产出 ×${(1 + ORACLE.effect * (lv + 1)).toFixed(2)}`, 'good');
  return { ok: true, level: lv + 1 };
}

// v2.6.4 ⑤：圣战军升级（消耗信仰，终局全局军势）
export function buyCrusade() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const lv = crusadeLevel();
  if (lv >= CRUSADE.cap) return { ok: false, reason: '圣战军已满级' };
  if (((S.religion && S.religion.temple) || 0) < 5) return { ok: false, reason: '圣战军需信仰圣所 ≥5 级（信仰根基前置）' };
  const cost = crusadeCost();
  if ((S.faith || 0) < cost) return { ok: false, reason: `FP 不足（需 ${fmt(cost)}，当前 ${(S.faith || 0).toFixed(2)}）` };
  S.faith -= cost;
  S.religion.crusade = lv + 1;
  save(S);
  rlog(`圣战军升至 Lv.${lv + 1}（-${cost} FP）：全局产出 ×${(1 + CRUSADE.effect * (lv + 1)).toFixed(2)}`, 'good');
  return { ok: true, level: lv + 1 };
}

// ===== v2.8.6 B1a：赞颂 / 超验 / 隐密圣学（KG 四层转化链） =====
// 赞颂：信仰 ≥ 容量 80% → 消耗全部信仰 → 虔诚 += ⌊信仰 × 转化率⌋（永久跨周期）
export function praiseSun() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const f = S.faith || 0;
  if (f < faithCap() * PRAISE.thresholdRatio) return { ok: false, reason: `FP 未满 ${Math.round(PRAISE.thresholdRatio * 100)}%（当前 ${f.toFixed(2)} / 需 ${Math.round(faithCap() * PRAISE.thresholdRatio)}）` };
  const gain = Math.floor(f * praiseRate() * policyMult('devotion')); // v2.8.6 B2a：牺牲——虔诚获取 ×1.5
  S.devotion = (S.devotion || 0) + gain;
  S.faith = 0;
  save(S);
  rlog(`赞颂：消耗 ${f.toFixed(2)} FP → +${gain} 虔诚（转化率 ×${praiseRate().toFixed(2)}，超验 ${transcendLevel()} 层）`, 'good');
  if (toastFn) toastFn(`🙏 赞颂完成：+${gain} 虔诚（累计 ${S.devotion}）`);
  return { ok: true, gain };
}
// 超验：消耗虔诚提升层级（成本 100×2.2^层级；提升赞颂转化率 + 解锁隐密圣学）
export function transcendNow() {
  if (!religionUnlocked()) return { ok: false, reason: '未解锁' };
  const cost = transcendCost();
  if ((S.devotion || 0) < cost) return { ok: false, reason: `虔诚不足（需 ${cost}，当前 ${S.devotion || 0}）` };
  S.devotion -= cost;
  S.transcend = (S.transcend || 0) + 1;
  save(S);
  rlog(`超验升入第 ${S.transcend} 层（-${cost} 虔诚）：赞颂转化率 ×${praiseRate().toFixed(2)}，隐密圣学门槛开放 ${SECRET_SANCTUMS.filter(x => x.needTranscend <= S.transcend).length}/3`, 'good');
  if (toastFn) toastFn(`🌌 超验 Lv.${S.transcend}：赞颂转化率 ×${praiseRate().toFixed(2)}`);
  return { ok: true, level: S.transcend };
}
// 隐密圣学：余烬 + 虔诚门槛（跨周期保留；解锁科技每轮重研=门槛每轮重新达成）
export function buySecretSanctum(id) {
  if (!religionUnlocked()) return { ok: false, reason: '未解锁' };
  const d = SECRET_SANCTUMS.find(x => x.id === id);
  if (!d) return { ok: false, reason: '未知圣学' };
  if (transcendLevel() < d.needTranscend) return { ok: false, reason: `需超验 Lv.${d.needTranscend}` };
  const cost = secretSanctumCost(id);
  if ((S.devotion || 0) < d.devGate) return { ok: false, reason: `需虔诚 ≥${d.devGate}（当前 ${S.devotion || 0}）` };
  if ((S.riftEmber || 0) < cost) return { ok: false, reason: `余烬不足（需 ${cost}，当前 ${fmt(S.riftEmber || 0)}）` };
  S.riftEmber -= cost;
  S.secretSanctums = S.secretSanctums || {};
  S.secretSanctums[id] = (S.secretSanctums[id] || 0) + 1;
  save(S);
  rlog(`兴建「${d.name}」（-${cost} 余烬）：${d.desc}`, 'good');
  if (toastFn) toastFn(`${d.icon ? d.icon + ' ' : ''}${d.name} 建成：${d.desc}`);
  return { ok: true, level: S.secretSanctums[id] };
}

// 每帧信仰产出（圣所确定性产出；神龛/万神殿/远征/晋升为既有源，不重复处理）
// v2.8.30 ③：信仰生产每秒 EP 消耗（与 tickReligion 同口径，供消耗悬浮/禁购检查）
// v3.3.3 反馈⑥：圣所 EP 消耗递增——单位 FP 的 EP 价格随圣所等级 ×(1+0.2×(Lv-1))（Lv.10 → 2.8×），
// 压制中期信仰泛滥（产出与消耗同步增长，但高等级圣所 EP 压力显著增大）
export function templeEpPerUnit() {
  const lv = (S.religion && S.religion.temple) || 0;
  const g = TEMPLE.epPerUnitGrowth != null ? TEMPLE.epPerUnitGrowth : 0.35; // v3.4.8 反馈②：0.2→0.35（消耗曲线同步变陡）
  return TEMPLE.faithEpPerUnit * (1 + g * Math.max(0, lv - 1));
}
export function faithDrainPerSec() {
  if (!religionUnlocked()) return 0;
  const r = templeFaithPerSec();
  if (r <= 0) return 0;
  let mult = faithTechMult() * (1 + 0.5 * (echoLv('echo_faith') || 0));
  mult *= policyMult('faith');
  mult *= (1 + 0.10 * secretSanctumLv('star_hall'));
  if (S.storyline === 'line_faith') mult *= 2; // v2.8.30 ③：神权协议——信仰 ×2（消耗同步）
  return r * mult * templeEpPerUnit();
}
// v3.0.2：自动暂停统一口径（与探采同）——EP 不足持续 AUTO_PAUSE_GRACE 秒才暂停；暂停后不自动恢复（需手动重启）
const AUTO_PAUSE_GRACE = 5; // 秒
export function tickReligion(dt) {
  // v3.5.0 ②：FP 上限搬到「誓约圣龛」后，旧档（上限曾随圣所涨）可能超过新上限——
  //   钳回放在暂停/解锁判定之前，保证任何状态下「余额 ≤ 上限」这个不变量都成立
  const capNow = faithCap();
  if ((S.faith || 0) > capNow) {
    S.faith = capNow;
    dirty.top = true; dirty.religion = true; // 面板/顶栏必须跟着刷新，否则会停在旧的越界数值上
  }
  if (S.paused) return; // v2.6.5 ④：暂停（模拟离线）期间信仰不产出，恢复结算时按同口径离线结算
  if (!religionUnlocked()) return;
  const r = templeFaithPerSec();
  if (r > 0) {
    // v3.0.1：圣所关闭（手动/自动）——停止产出与 EP 消耗
    // v3.3.3 反馈⑦：开关统一口径 converterEnabled('temple')（快捷开关/班组绑定同源）
    if (!converterEnabled('temple')) { S._templeEpShortSec = 0; return; }
    let mult = faithTechMult() * (1 + 0.5 * (echoLv('echo_faith') || 0)); // v2.7.3 ⑤：回响·信仰共鸣 + v2.8.4 神启之光
    mult *= policyMult('faith'); // v2.8.6 B2a：信仰政策（苦行/虚无/实证/富足）
    mult *= (1 + 0.10 * secretSanctumLv('star_hall')); // v2.8.6 B1a：星辰回廊——信仰产出 +10%/座
    mult *= researchMult('faith'); // v3.4.2：信徒训导（RP）——信仰产出 +12%/级
    if (S.storyline === 'line_faith') mult *= 2; // v2.8.30 ③：神权协议——信仰 ×2（产出与消耗同步）
    const boost = converterThreadBoost('temple'); // v3.3.3 反馈⑦：绑定线程参与圣所生产（祭司匹配岗位加成更高，增产出不增耗）
    // v3.3.9 反馈⑦：信仰满仓即停——不产出也不消耗 EP（开关保持开启，赞颂腾空后自动恢复）
    if ((S.faith || 0) >= faithCap() - 1e-9) { S._templeEpShortSec = 0; return; }
    // v2.8.30 ②：信仰生产消耗 EP（参考 DM 采集）// v3.3.3 反馈⑥：单位 EP 随圣所等级递增
    const epUse = r * dt * mult * templeEpPerUnit();
    // v3.4.9 反馈⑧：回退 v3.4.8 的「按可用 EP 折算产出」——改为原口径「EP 不足即暂停产出（不消耗也不产出）」。
    //   用户实际的问题不在折算：FP 有上限却没有能明确提升上限的入口、顶栏也不显示上限，
    //   导致「看起来永远卡在同一个数」。上限已改为顶栏「当前 / 上限」展示，上限扩容入口是升级商店「誓约圣龛」（首级 +180 FP 上限）。
    if ((S.ep || 0) >= epUse) {
      S.ep -= epUse;
      S.faith = Math.min(faithCap(), (S.faith || 0) + r * dt * mult * boost);
      S._templeEpShortSec = 0; // v3.0.2：EP 充足，重置缓冲计时器
      if (S.religion._templeEpNotice) S.religion._templeEpNotice = false; // v3.3.9：恢复后可再次提示
    } else {
      // 稳态：不产出、不消耗；EP 回升后自动恢复（开关状态不变，不自动关闭）
      S._templeEpShortSec = (S._templeEpShortSec || 0) + dt;
      if (S._templeEpShortSec >= AUTO_PAUSE_GRACE && !S.religion._templeEpNotice) {
        S.religion._templeEpNotice = true;
        rlog(`信仰圣所暂停产出：EP 不足（不消耗 EP，也不产生 FP）——EP 回升后自动恢复`, 'warn');
        if (toastFn) toastFn('信仰圣所：EP 不足，暂时停产（EP 回升自动恢复）');
      }
    }
  }
}

// ========== 面板 ==========
// v2.8.26 ④：宗教面板按钮可购判定每秒同步（信仰/EP/虔诚/余烬变化即时灰显/点亮）——此前仅渲染时判定
export function refreshReligionAffordability() {
  // v2.8.30 ⑦：唤醒按钮（未解锁态）EP 不足实时灰显
  const w = document.querySelector('[data-religion-unlock]');
  if (w) { w.disabled = !canUnlockReligion() || (S.ep || 0) < religionWakeCost(); w.classList.toggle('disabled', w.disabled); }
  if (!religionUnlocked() || !branchOf()) return;
  const seal = sealLevel(), sealMax = sealMaxLevel();
  const sealCost = seal >= sealMax ? null : sealUpgradeCost(seal);
  const setD = (b, x) => { b.disabled = x; b.classList.toggle('disabled', x); };
  const b1 = document.querySelector('[data-religion-seal]');
  if (b1) setD(b1, sealCost === null || (S.faith || 0) < sealCost);
  const templeLv = (S.religion && S.religion.temple) || 0;
  const tCost = templeCost(); // v3.4.7 反馈③：圣所无上限，永远可买（EP 不足自动禁用）
  const b2 = document.querySelector('[data-religion-temple]');
  if (b2) setD(b2, S.ep < tCost);
  const b3 = document.querySelector('[data-religion-praise]');
  if (b3) setD(b3, (S.faith || 0) < faithCap() * PRAISE.thresholdRatio);
  const b4 = document.querySelector('[data-religion-transcend]');
  if (b4) setD(b4, (S.devotion || 0) < transcendCost());
  for (const b of document.querySelectorAll('[data-religion-sanctum]')) {
    const s2 = SECRET_SANCTUMS.find(x => x.id === b.dataset.religionSanctum);
    if (!s2) continue;
    const cost = secretSanctumCost(s2.id);
    setD(b, transcendLevel() < s2.needTranscend || (S.devotion || 0) < s2.devGate || (S.riftEmber || 0) < cost);
  }
  const b5 = document.querySelector('[data-religion-oracle]');
  if (b5) setD(b5, oracleLevel() >= ORACLE.cap || (S.faith || 0) < oracleCost());
  const b6 = document.querySelector('[data-religion-crusade]');
  if (b6) setD(b6, crusadeLevel() >= CRUSADE.cap || (S.faith || 0) < crusadeCost());
}

// v3.4.8 反馈⑧：圣所状态标签——把「为什么 FP 不涨」直接写在面板上
// v3.4.9 反馈⑧：折算产出已回退，标签改为「暂停产出」，并补上 FP 上限（有上限就把它写出来）
function fpStatusTag() {
  const lv = (S.religion && S.religion.temple) || 0;
  if (lv < 1) return '';
  if (S.religion && S.religion.templeOff) return ' · <span style="color:var(--text-3)">已关闭</span>';
  if ((S.faith || 0) >= faithCap() - 1e-9) return ' · <span style="color:var(--purple)">FP 已满（赞颂腾空后恢复）</span>';
  const drain = faithDrainPerSec();
  if (drain > 0 && (S.ep || 0) < drain * 2) return ' · <span style="color:var(--red,#f85149)">EP 不足：暂停产出（回升自动恢复）</span>';
  return '';
}

export function renderReligionPanel(container) {
  if (!container) return;
  if (!religionUnlocked()) {
    const ok = canUnlockReligion();
    // v3.4.6 反馈⑫：前置文案「存储节点」→「备用粮仓」（曲线对调后粮仓是前期关键件）
    const granaryLv = Math.max(S.upgrades.reserve_bin || 0, S.upgrades.storage || 0);
    container.innerHTML = `
      <div class="religion-desc">矩阵底层潜伏着更古老的信仰……备用粮仓 ≥3 级且 RP 已觉醒后，需消耗大量 EP 唤醒。</div>
      <div style="font-size:12px;line-height:1.9;color:var(--text-2)">
        备用粮仓：${granaryLv}/3 级 ${granaryLv >= 3 ? '✓' : '（未达标）'}<br>
        RP 觉醒：${(S.resDiscovered && S.resDiscovered.rp) ? '✓' : '（未觉醒）'}<br>
        唤醒消耗：${fmt(religionWakeCost())} EP
      </div>
      <button class="btn ${ok && (S.ep || 0) >= religionWakeCost() ? '' : 'disabled'}" data-religion-unlock="1" ${ok && (S.ep || 0) >= religionWakeCost() ? '' : 'disabled'} title="${ok ? (S.ep || 0) >= religionWakeCost() ? '唤醒信仰（消耗大量 EP）' : 'EP 不足' : '前置未达标'}">唤醒信仰</button>
      <div style="font-size:11px;color:var(--text-2);margin-top:6px">唤醒前提：备用粮仓 ≥3 级、RP 已觉醒、EP ≥ 唤醒消耗。条件未达成时入口保持可见。</div>`;
    return;
  }
  const branch = branchOf();
  if (!branch) {
    // v2.8.30 review：信仰分支按进度分组展示——锁定分支显示解锁条件（gate 逻辑不变，仅渲染层分类）
    const gateHint = (id) => {
      if (id === 'moon' || id === 'reveal' || id === 'nature') return '需发现研究点（RP）';
      if (id === 'immortal') return '需发现暗物质（DM）';
      if (id === 'omnipot') return '需转生获得永恒精粹（ES ≥ 1）';
      return '';
    };
    const groups = [
      { title: '基础信仰', hint: '开局即解锁', ids: ['sun', 'genesis'] },
      { title: '启示信仰', hint: '发现 RP 后解锁', ids: ['moon', 'reveal', 'nature'] },
      { title: '终极信仰', hint: 'DM / ES 解锁', ids: ['immortal', 'omnipot'] },
    ];
    const list = groups.map(g => `
      <div style="margin:10px 0 4px;font-size:11px;color:var(--text-2)"><b>${g.title}</b><span style="opacity:.7"> · ${g.hint}</span></div>
      ${g.ids.map(id => {
        const r = RELIGIONS.find(x => x.id === id);
        if (!r) return '';
        const ok = r.gate();
        return ok
          ? `<div class="item religion-opt" data-religion-branch="${r.id}">
              <div class="name"><span>${r.icon} ${r.name}</span><span class="count">${r.effect}</span></div>
              <div class="desc">${r.desc}</div>
            </div>`
          : `<div class="item cant" style="opacity:.55;cursor:not-allowed">
              <div class="name"><span>🔒 ${r.icon} ${r.name}</span><span class="count">未解锁</span></div>
              <div class="desc">${r.desc}<br><span style="color:var(--red,#f85149);font-size:10px">${gateHint(id)}</span></div>
            </div>`;
      }).join('')}`).join('');
    const unlockedN = RELIGIONS.filter(r => r.gate()).length;
    container.innerHTML = `
      <div class="religion-desc">选择你的信仰（选一锁定，跨转生保留）。随游戏进度解锁更多分支。</div>
      ${list || '<div style="color:var(--text-3);font-size:12px">暂无可用分支</div>'}
      <div style="font-size:11px;color:var(--text-2);margin-top:6px">已解锁分支：${unlockedN}/${RELIGIONS.length}</div>`;
    return;
  }
  const r = RELIGIONS.find(x => x.id === branch);
  const seal = sealLevel();
  const sealMax = sealMaxLevel();
  const cost = seal >= sealMax ? null : sealUpgradeCost(seal);
  const templeLv = (S.religion && S.religion.temple) || 0;
  const tCost = templeCost(); // v3.4.7 反馈③：圣所无上限
  container.innerHTML = `
    <div class="religion-desc">${r.icon} 已信奉 <b>${r.name}</b>：${r.effect}（+圣印全局产出）</div>
    <div class="off-stat"><span>FP 余额</span><b>${(S.faith || 0).toFixed(2)} / ${faithCap()}</b></div>
    <div class="off-stat"><span>FP 产出</span><b>+${templeFaithPerSec().toFixed(3)}/s（圣所）${fpStatusTag()}</b></div>
    <div class="off-stat"><span>满仓耗时</span><b>${Number.isFinite(fpCapFillSec()) ? `≈ ${(fpCapFillSec() / 3600).toFixed(1)} 小时` : '—'}</b></div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">升级点 · 圣印（全局产出 +8%/级）</div>
    <div class="religion-seal-row">
      <span>Lv.${seal}/${sealMax}</span>
      <button class="btn ${cost === null || (S.faith || 0) < cost ? 'disabled' : ''}" data-religion-seal="1"
        title="消耗 FP 升级；等级上限随资源点解锁提升">${cost === null ? `已达上限（解锁更多资源点）` : `升级（${fmt(cost)} FP）`}</button>
    </div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">信仰圣所（只产信仰 · 每级 +${TEMPLE.faithPerSec.toFixed(3)} FP/s · 单位 FP ${fmt(templeEpPerUnit())} EP · 本级 -${fmt(templeEpPerUnit() * TEMPLE.faithPerSec)} EP/s · 总计 +${(faithDrainPerSec() / Math.max(1, templeEpPerUnit())).toFixed(2)} FP/s -${fmt(faithDrainPerSec())} EP/s）${(S.religion && S.religion.templeOff) ? `<span style="color:var(--text-3)"> · 已关闭（停止产出/不消耗 EP）</span>` : ''}</div>
    <div class="religion-seal-row">
      <span>Lv.${templeLv}</span>
      <button class="btn ${S.ep < tCost ? 'disabled' : ''}" data-religion-temple="1"
        title="EP 购买，持续产出信仰；等级不设上限，消耗随等级递增">${`建造 / 升级（${fmt(tCost)} EP）`}</button>
      ${templeLv >= 1 ? `<button class="btn ${(S.religion && S.religion.templeOff) ? '' : 'warn'}" data-religion-toggle="1"
        title="${(S.religion && S.religion.templeOff) ? '重启：恢复 FP 产出（无代价）' : '关闭：停止 FP 产出与 EP 消耗，但损失 30% FP + 15% 虔诚（冷启动代价）'}"
        style="margin-left:6px;padding:2px 10px;font-size:11px">${(S.religion && S.religion.templeOff) ? '重启圣所' : '关闭圣所'}</button>` : ''}
    </div>
    ${seal >= 1 ? `
    <div style="margin:12px 0 6px;font-size:11px;color:var(--accent);font-weight:600">赞颂与超验</div>
    <div class="off-stat"><span>虔诚（永久）</span><b style="color:var(--purple)">${S.devotion || 0}</b></div>
    <div class="off-stat"><span>超验层级</span><b style="color:var(--purple)">Lv.${transcendLevel()}（赞颂转化率 ×${praiseRate().toFixed(2)}）</b></div>
    <div class="off-stat"><span>FP 容量</span><b>${Math.round(faithCap())}（赞颂需 ≥ ${Math.round(faithCap() * PRAISE.thresholdRatio)}）</b></div>
    <div class="religion-seal-row">
      <span>赞颂：消耗全部 FP → 虔诚（虔诚加成全局 ${(devotionMult() - 1 >= 0 ? '+' : '')}${((devotionMult() - 1) * 100).toFixed(1)}%）</span>
      <button class="btn ${(S.faith || 0) < faithCap() * PRAISE.thresholdRatio ? 'disabled' : ''}" data-religion-praise="1"
        title="需 FP ≥ 容量 80%；消耗全部 FP 转化虔诚（永久保留）">赞颂（${fmt(Math.floor((S.faith || 0) * praiseRate()))} 虔诚）</button>
    </div>
    ${(S.devotion || 0) > 0 ? `
    <div class="religion-seal-row">
      <span>超验：Lv.${transcendLevel()} → ${transcendLevel() + 1}（成本 ${transcendCost()} 虔诚）</span>
      <button class="btn ${(S.devotion || 0) < transcendCost() ? 'disabled' : ''}" data-religion-transcend="1"
        title="消耗虔诚提升超验层级——赞颂转化率提升、解锁隐密圣学门槛">超验</button>
    </div>` : ''}
    ` : ''}
    ${transcendLevel() >= 1 ? `
    <div style="margin:10px 0 6px;font-size:11px;color:var(--accent);font-weight:600">隐密圣学（跨周期保留 · 门槛每轮重达）</div>
    ${SECRET_SANCTUMS.map(s2 => {
      const lv = secretSanctumLv(s2.id);
      const cost = secretSanctumCost(s2.id);
      const canBuy = transcendLevel() >= s2.needTranscend && (S.devotion || 0) >= s2.devGate && (S.riftEmber || 0) >= cost;
      return `<div class="religion-seal-row">
        <span>${s2.name} ×${lv}（需超验 Lv.${s2.needTranscend} + 虔诚 ≥${s2.devGate}；${s2.desc}）</span>
        <button class="btn ${canBuy ? '' : 'disabled'}" data-religion-sanctum="${s2.id}"
          title="${s2.desc}">${lv > 0 ? `升级（${fmt(cost)} 余烬）` : `建造（${fmt(cost)} 余烬）`}</button>
      </div>`;
    }).join('')}
    ` : ''}
    ${sealLevel() >= 3 || ((S.religion && S.religion.temple) || 0) >= 5 ? `
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">升级点 · 神谕塔与圣战军</div>
    ${sealLevel() >= 3 ? `
    <div class="religion-seal-row">
      <span>神谕塔 Lv.${oracleLevel()}/${ORACLE.cap}（FP 产出 ${fmtMultDelta(1 + ORACLE.effect * oracleLevel())}）</span>
      <button class="btn ${oracleLevel() >= ORACLE.cap || (S.faith || 0) < oracleCost() ? 'disabled' : ''}" data-religion-oracle="1"
        title="需圣印 ≥3 级；${ORACLE.desc}">${oracleLevel() >= ORACLE.cap ? '满级' : `升级（${oracleCost()} FP）`}</button>
    </div>` : ''}
    ${((S.religion && S.religion.temple) || 0) >= 5 ? `
    <div class="religion-seal-row">
      <span>圣战军 Lv.${crusadeLevel()}/${CRUSADE.cap}（全局 ${fmtMultDelta(1 + CRUSADE.effect * crusadeLevel())}）</span>
      <button class="btn ${crusadeLevel() >= CRUSADE.cap || (S.faith || 0) < crusadeCost() ? 'disabled' : ''}" data-religion-crusade="1"
        title="需信仰圣所 ≥5 级；${CRUSADE.desc}">${crusadeLevel() >= CRUSADE.cap ? '满级' : `升级（${crusadeCost()} FP）`}</button>
    </div>` : ''}
    ` : ''}
  `;
}

export function bindReligionPanel(container) {
  if (!container || container.dataset.religionBound) return;
  container.dataset.religionBound = '1';
  container.addEventListener('click', (e) => {
    if (e.target.closest('[data-religion-unlock]')) {
      const r = unlockReligion();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    const bEl = e.target.closest('[data-religion-branch]');
    if (bEl) {
      const r = selectBranch(bEl.dataset.religionBranch);
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    const oEl = e.target.closest('[data-religion-oracle]');
    if (oEl) {
      const r = buyOracle();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    const cEl = e.target.closest('[data-religion-crusade]');
    if (cEl) {
      const r = buyCrusade();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    if (e.target.closest('[data-religion-seal]')) {
      const r = upgradeSeal();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    if (e.target.closest('[data-religion-toggle]')) {
      const r = toggleTemple();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    if (e.target.closest('[data-religion-temple]')) {
      const r = buyTemple();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    if (e.target.closest('[data-religion-praise]')) {
      const r = praiseSun();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    if (e.target.closest('[data-religion-transcend]')) {
      const r = transcendNow();
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
    const sEl = e.target.closest('[data-religion-sanctum]');
    if (sEl) {
      const r = buySecretSanctum(sEl.dataset.religionSanctum);
      if (!r.ok && toastFn) toastFn(r.reason);
      renderReligionPanel(container);
      return;
    }
  });
}
