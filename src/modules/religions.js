// v2.5.7：宗教系统模块——解锁（仓库有库存）/ 分支选择 / 圣印升级 / 圣所产出 / 面板渲染
import { S, save } from '../state.js';
import { epStorageCap, fmt, echoLv, faithTechMult } from './economy.js';
import {
  RELIGIONS, sealMaxLevel, sealUpgradeCost, TEMPLE, templeCost, templeFaithPerSec,
  religionUnlocked, branchOf, sealLevel, visibleReligions,
  ORACLE, CRUSADE, oracleLevel, crusadeLevel, oracleCost, crusadeCost,
  PRAISE, SECRET_SANCTUMS, devotion, transcendLevel, secretSanctumLv, secretSanctumCost,
  praiseRate, faithCap, devotionMult, transcendCost,
} from '../data/religions.js';
import { policyMult } from '../data/policies.js';

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
  const storageLv = S.upgrades.storage || 0;
  if (storageLv < 3) return false;
  if (!(S.resDiscovered && S.resDiscovered.rp)) return false;
  return true; // v2.8.19：去除 EP 库存 ≥ 存储上限 80% 限制（解锁仅需存储节点≥3 + RP 觉醒；唤醒仍需消耗 EP）
}

export function religionWakeCost() {
  return 200000; // v2.8.30：唤醒价格大幅上涨（50K→200K，固定值）
}

export function unlockReligion() {
  if (religionUnlocked()) return { ok: false, reason: '已解锁' };
  if (!canUnlockReligion()) return { ok: false, reason: '需存储节点 ≥3 级且 RP 已觉醒' };
  // v2.8.30 ⑦：唤醒消耗大量 EP（存储上限 50%）
  const cost = religionWakeCost();
  if ((S.ep || 0) < cost) return { ok: false, reason: `EP 不足：唤醒需 ${fmt(cost)} EP（存储上限的 50%）` };
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
  if ((S.faith || 0) < cost) return { ok: false, reason: `信仰不足（需 ${fmt(cost)}，当前 ${fmt(S.faith || 0)}）` };
  S.faith -= cost;
  S.religion.seal = lv + 1;
  save(S);
  rlog(`圣印升至 Lv.${lv + 1}（-${fmt(cost)} 信仰）——全局产出 +${8 * (lv + 1)}%`, 'good');
  return { ok: true, level: lv + 1 };
}

// 圣所购买（EP 建筑，信仰产出）
export function buyTemple() {
  if (!religionUnlocked()) return { ok: false, reason: '未解锁' };
  const lv = (S.religion && S.religion.temple) || 0;
  if (lv >= TEMPLE.cap) return { ok: false, reason: '圣所已满级' };
  const cost = templeCost();
  if (S.ep < cost) return { ok: false, reason: `EP 不足（需 ${fmt(cost)}）` };
  S.ep -= cost;
  S.religion.temple = lv + 1;
  save(S);
  rlog(`信仰圣所升至 Lv.${lv + 1}（-${fmt(cost)} EP）：信仰产出 +${TEMPLE.faithPerSec.toFixed(2)}/s（当前合计 ${templeFaithPerSec().toFixed(2)}/s）`, 'good');
  return { ok: true };
}

// v2.6.4 ⑤：神谕塔升级（消耗信仰，后期信仰深耕）
export function buyOracle() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const lv = oracleLevel();
  if (lv >= ORACLE.cap) return { ok: false, reason: '神谕塔已满级' };
  if (sealLevel() < 3) return { ok: false, reason: '神谕塔需圣印 ≥3 级（信仰深耕前置）' };
  const cost = oracleCost();
  if ((S.faith || 0) < cost) return { ok: false, reason: `信仰不足（需 ${fmt(cost)}，当前 ${(S.faith || 0).toFixed(2)}）` };
  S.faith -= cost;
  S.religion.oracle = lv + 1;
  save(S);
  rlog(`神谕塔升至 Lv.${lv + 1}（-${cost} 信仰）：信仰产出 ×${(1 + ORACLE.effect * (lv + 1)).toFixed(2)}`, 'good');
  return { ok: true, level: lv + 1 };
}

// v2.6.4 ⑤：圣战军升级（消耗信仰，终局全局军势）
export function buyCrusade() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const lv = crusadeLevel();
  if (lv >= CRUSADE.cap) return { ok: false, reason: '圣战军已满级' };
  if (((S.religion && S.religion.temple) || 0) < 5) return { ok: false, reason: '圣战军需信仰圣所 ≥5 级（信仰根基前置）' };
  const cost = crusadeCost();
  if ((S.faith || 0) < cost) return { ok: false, reason: `信仰不足（需 ${fmt(cost)}，当前 ${(S.faith || 0).toFixed(2)}）` };
  S.faith -= cost;
  S.religion.crusade = lv + 1;
  save(S);
  rlog(`圣战军升至 Lv.${lv + 1}（-${cost} 信仰）：全局产出 ×${(1 + CRUSADE.effect * (lv + 1)).toFixed(2)}`, 'good');
  return { ok: true, level: lv + 1 };
}

// ===== v2.8.6 B1a：赞颂 / 超验 / 隐密圣学（KG 四层转化链） =====
// 赞颂：信仰 ≥ 容量 80% → 消耗全部信仰 → 虔诚 += ⌊信仰 × 转化率⌋（永久跨周期）
export function praiseSun() {
  if (!religionUnlocked() || !branchOf()) return { ok: false, reason: '需先信奉一个分支' };
  const f = S.faith || 0;
  if (f < faithCap() * PRAISE.thresholdRatio) return { ok: false, reason: `信仰未满 ${Math.round(PRAISE.thresholdRatio * 100)}%（当前 ${f.toFixed(2)} / 需 ${Math.round(faithCap() * PRAISE.thresholdRatio)}）` };
  const gain = Math.floor(f * praiseRate() * policyMult('devotion')); // v2.8.6 B2a：牺牲——虔诚获取 ×1.5
  S.devotion = (S.devotion || 0) + gain;
  S.faith = 0;
  save(S);
  rlog(`赞颂：消耗 ${f.toFixed(2)} 信仰 → +${gain} 虔诚（转化率 ×${praiseRate().toFixed(2)}，超验 ${transcendLevel()} 层）`, 'good');
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
export function faithDrainPerSec() {
  if (!religionUnlocked()) return 0;
  const r = templeFaithPerSec();
  if (r <= 0) return 0;
  let mult = faithTechMult() * (1 + 0.5 * (echoLv('echo_faith') || 0));
  mult *= policyMult('faith');
  mult *= (1 + 0.10 * secretSanctumLv('star_hall'));
  if (S.storyline === 'line_faith') mult *= 2; // v2.8.30 ③：神权协议——信仰 ×2（消耗同步）
  return r * mult * TEMPLE.faithEpPerUnit;
}
export function tickReligion(dt) {
  if (S.paused) return; // v2.6.5 ④：暂停（模拟离线）期间信仰不产出，恢复结算时按同口径离线结算
  if (!religionUnlocked()) return;
  const r = templeFaithPerSec();
  if (r > 0) {
    let mult = faithTechMult() * (1 + 0.5 * (echoLv('echo_faith') || 0)); // v2.7.3 ⑤：回响·信仰共鸣 + v2.8.4 神启之光
    mult *= policyMult('faith'); // v2.8.6 B2a：信仰政策（苦行/虚无/实证/富足）
    mult *= (1 + 0.10 * secretSanctumLv('star_hall')); // v2.8.6 B1a：星辰回廊——信仰产出 +10%/座
    if (S.storyline === 'line_faith') mult *= 2; // v2.8.30 ③：神权协议——信仰 ×2（产出与消耗同步）
    // v2.8.30 ②：信仰生产消耗 EP（参考 DM 采集）——EP 不足则停止产出（与 faithDrainPerSec 同口径）
    const epUse = r * dt * mult * TEMPLE.faithEpPerUnit;
    if ((S.ep || 0) >= epUse) {
      S.ep -= epUse;
      S.faith = (S.faith || 0) + r * dt * mult;
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
  const tCost = templeLv >= TEMPLE.cap ? null : templeCost();
  const b2 = document.querySelector('[data-religion-temple]');
  if (b2) setD(b2, tCost === null || S.ep < tCost);
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

export function renderReligionPanel(container) {
  if (!container) return;
  if (!religionUnlocked()) {
    const ok = canUnlockReligion();
    container.innerHTML = `
      <div class="religion-desc">矩阵底层潜伏着更古老的信仰……存储节点 ≥3 级且 RP 已觉醒后，需消耗大量 EP 唤醒。</div>
      <div style="font-size:12px;line-height:1.9;color:var(--text-2)">
        存储节点：${S.upgrades.storage || 0}/3 级 ${(S.upgrades.storage || 0) >= 3 ? '✓' : '（未达标）'}<br>
        RP 觉醒：${(S.resDiscovered && S.resDiscovered.rp) ? '✓' : '（未觉醒）'}<br>
        唤醒消耗：${fmt(religionWakeCost())} EP
      </div>
      <button class="btn ${ok && (S.ep || 0) >= religionWakeCost() ? '' : 'disabled'}" data-religion-unlock="1" ${ok && (S.ep || 0) >= religionWakeCost() ? '' : 'disabled'} title="${ok ? (S.ep || 0) >= religionWakeCost() ? '唤醒信仰（消耗大量 EP）' : 'EP 不足' : '前置未达标'}">唤醒信仰</button>
      <div style="font-size:11px;color:var(--text-2);margin-top:6px">唤醒前提：存储节点 ≥3 级、RP 已觉醒、EP ≥ 唤醒消耗。条件未达成时入口保持可见。</div>`;
    return;
  }
  const branch = branchOf();
  if (!branch) {
    const list = visibleReligions().map(r => `
      <div class="item religion-opt" data-religion-branch="${r.id}">
        <div class="name"><span>${r.icon} ${r.name}</span><span class="count">${r.effect}</span></div>
        <div class="desc">${r.desc}</div>
      </div>`).join('');
    container.innerHTML = `
      <div class="religion-desc">选择你的信仰（选一锁定，跨转生保留）。随游戏进度解锁更多分支。</div>
      ${list || '<div style="color:var(--text-3);font-size:12px">暂无可用分支</div>'}
      <div style="font-size:11px;color:var(--text-2);margin-top:6px">已解锁分支：${visibleReligions().length}/${RELIGIONS.length}（进度解锁：RP→中期分支，DM→转生分支，ES≥1→终局分支）</div>`;
    return;
  }
  const r = RELIGIONS.find(x => x.id === branch);
  const seal = sealLevel();
  const sealMax = sealMaxLevel();
  const cost = seal >= sealMax ? null : sealUpgradeCost(seal);
  const templeLv = (S.religion && S.religion.temple) || 0;
  const tCost = templeLv >= TEMPLE.cap ? null : templeCost();
  container.innerHTML = `
    <div class="religion-desc">${r.icon} 已信奉 <b>${r.name}</b>：${r.effect}（+圣印全局产出）</div>
    <div class="off-stat"><span>信仰余额</span><b>${(S.faith || 0).toFixed(2)}</b></div>
    <div class="off-stat"><span>信仰产出</span><b>+${templeFaithPerSec().toFixed(2)}/s（圣所）</b></div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">升级点 · 圣印（全局产出 +8%/级）</div>
    <div class="religion-seal-row">
      <span>Lv.${seal}/${sealMax}</span>
      <button class="btn ${cost === null || (S.faith || 0) < cost ? 'disabled' : ''}" data-religion-seal="1"
        title="消耗信仰升级；等级上限随资源点解锁提升">${cost === null ? `已达上限（解锁更多资源点）` : `升级（${fmt(cost)} 信仰）`}</button>
    </div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">信仰圣所（每级 +${TEMPLE.faithPerSec.toFixed(2)} 信仰/s，当前合计 ${templeFaithPerSec().toFixed(2)}/s，每 1 信仰消耗 ${TEMPLE.faithEpPerUnit} EP/s）</div>
    <div class="religion-seal-row">
      <span>Lv.${templeLv}/${TEMPLE.cap}</span>
      <button class="btn ${tCost === null || S.ep < tCost ? 'disabled' : ''}" data-religion-temple="1"
        title="EP 购买，持续产出信仰">${tCost === null ? '已满级' : `建造 / 升级（${fmt(tCost)} EP）`}</button>
    </div>
    ${seal >= 1 ? `
    <div style="margin:12px 0 6px;font-size:11px;color:var(--accent);font-weight:600">赞颂与超验</div>
    <div class="off-stat"><span>虔诚（永久）</span><b style="color:var(--purple)">${S.devotion || 0}</b></div>
    <div class="off-stat"><span>超验层级</span><b style="color:var(--purple)">Lv.${transcendLevel()}（赞颂转化率 ×${praiseRate().toFixed(2)}）</b></div>
    <div class="off-stat"><span>信仰容量</span><b>${Math.round(faithCap())}（赞颂需 ≥ ${Math.round(faithCap() * PRAISE.thresholdRatio)}）</b></div>
    <div class="religion-seal-row">
      <span>赞颂：消耗全部信仰 → 虔诚（虔诚加成全局 ${(devotionMult() - 1 >= 0 ? '+' : '')}${((devotionMult() - 1) * 100).toFixed(1)}%）</span>
      <button class="btn ${(S.faith || 0) < faithCap() * PRAISE.thresholdRatio ? 'disabled' : ''}" data-religion-praise="1"
        title="需信仰 ≥ 容量 80%；消耗全部信仰转化虔诚（永久保留）">赞颂（${fmt(Math.floor((S.faith || 0) * praiseRate()))} 虔诚）</button>
    </div>
    ${(S.devotion || 0) > 0 ? `
    <div class="religion-seal-row">
      <span>超验：Lv.${transcendLevel()} → ${transcendLevel() + 1}（成本 ${transcendCost()} 虔诚）</span>
      <button class="btn ${(S.devotion || 0) < transcendCost() ? 'disabled' : ''}" data-religion-transcend="1"
        title="消耗虔诚提升超验层级——赞颂转化率提升、解锁隐密圣学门槛">超验</button>
    </div>` : '<div style="font-size:11px;color:var(--text-2);margin-top:4px">赞颂一次（虔诚 &gt; 0）后解锁「超验」。</div>'}
    ` : '<div style="font-size:11px;color:var(--text-2);margin-top:6px">赞颂与超验将在圣印首次升级后解锁。</div>'}
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
    ` : '<div style="font-size:11px;color:var(--text-2);margin-top:6px">隐密圣学将在首次超验（虔诚转化）后解锁。</div>'}
    ${sealLevel() >= 3 || ((S.religion && S.religion.temple) || 0) >= 5 ? `
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">升级点 · 神谕塔与圣战军</div>
    ${sealLevel() >= 3 ? `
    <div class="religion-seal-row">
      <span>神谕塔 Lv.${oracleLevel()}/${ORACLE.cap}（信仰产出 ×${(1 + ORACLE.effect * oracleLevel()).toFixed(2)}）</span>
      <button class="btn ${oracleLevel() >= ORACLE.cap || (S.faith || 0) < oracleCost() ? 'disabled' : ''}" data-religion-oracle="1"
        title="需圣印 ≥3 级；${ORACLE.desc}">${oracleLevel() >= ORACLE.cap ? '满级' : `升级（${oracleCost()} 信仰）`}</button>
    </div>` : '<div style="font-size:11px;color:var(--text-2)">神谕塔将在圣印 ≥3 级后解锁。</div>'}
    ${((S.religion && S.religion.temple) || 0) >= 5 ? `
    <div class="religion-seal-row">
      <span>圣战军 Lv.${crusadeLevel()}/${CRUSADE.cap}（全局 ×${(1 + CRUSADE.effect * crusadeLevel()).toFixed(2)}）</span>
      <button class="btn ${crusadeLevel() >= CRUSADE.cap || (S.faith || 0) < crusadeCost() ? 'disabled' : ''}" data-religion-crusade="1"
        title="需信仰圣所 ≥5 级；${CRUSADE.desc}">${crusadeLevel() >= CRUSADE.cap ? '满级' : `升级（${crusadeCost()} 信仰）`}</button>
    </div>` : '<div style="font-size:11px;color:var(--text-2)">圣战军将在信仰圣所 ≥5 级后解锁。</div>'}
    ` : '<div style="font-size:11px;color:var(--text-2);margin-top:6px">神谕塔（圣印 ≥3）与圣战军（圣所 ≥5）将随深耕逐步解锁。</div>'}
    <div style="font-size:11px;color:var(--text-2);margin-top:8px">全流程：仓库解锁 → 分支选择（RP/DM/ES 逐级开放）→ 圣印/圣所 → 神谕塔（圣印≥3）与圣战军（圣所≥5）深耕 → 章节「神格」与终局共振。</div>`;
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
