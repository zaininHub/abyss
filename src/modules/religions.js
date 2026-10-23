// v2.5.7：宗教系统模块——解锁（仓库有库存）/ 分支选择 / 圣印升级 / 圣所产出 / 面板渲染
import { S, save } from '../state.js';
import { epStorageCap, fmt } from './economy.js';
import {
  RELIGIONS, sealMaxLevel, sealUpgradeCost, TEMPLE, templeCost, templeFaithPerSec,
  religionUnlocked, branchOf, sealLevel, visibleReligions,
} from '../data/religions.js';

let logFn = null;
let toastFn = null;
export function setReligionLogFn(fn) { logFn = fn; }
export function setReligionToastFn(fn) { toastFn = fn; }
function rlog(msg, cls) { if (logFn) logFn(`[宗教] ${msg}`, cls); }

// 解锁前提：仓库（存储节点）≥1 级，且 EP 库存 ≥ 存储上限 50%（仓库有库存）
export function canUnlockReligion() {
  const storageLv = S.upgrades.storage || 0;
  if (storageLv < 1) return false;
  return S.ep >= epStorageCap() * 0.5;
}

export function unlockReligion() {
  if (religionUnlocked()) return { ok: false, reason: '已解锁' };
  if (!canUnlockReligion()) return { ok: false, reason: '需仓库 ≥1 级且 EP 库存 ≥ 存储上限 50%' };
  S.religion = S.religion || {};
  S.religion.unlocked = true;
  if (S.resDiscovered) S.resDiscovered.faith = true;
  save(S);
  rlog('信仰觉醒：仓库囤积的效能触动了矩阵底层……宗教系统解锁', 'good');
  if (toastFn) toastFn('🙏 信仰觉醒：宗教系统已解锁（仓库 + 库存达标）');
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
  rlog(`信仰圣所升至 Lv.${lv + 1}（-${fmt(cost)} EP）：信仰产出 +${TEMPLE.faithPerSec}/s`, 'good');
  return { ok: true };
}

// 每帧信仰产出（圣所确定性产出；神龛/万神殿/远征/晋升为既有源，不重复处理）
export function tickReligion(dt) {
  if (!religionUnlocked()) return;
  const r = templeFaithPerSec();
  if (r > 0) S.faith = (S.faith || 0) + r * dt;
}

// ========== 面板 ==========
export function renderReligionPanel(container) {
  if (!container) return;
  if (!religionUnlocked()) {
    const ok = canUnlockReligion();
    container.innerHTML = `
      <div class="religion-desc">矩阵底层潜伏着更古老的信仰……当你的仓库（存储节点 ≥1 级）囤积了足够的效能（EP 库存 ≥ 存储上限 50%），信仰将觉醒。</div>
      <div style="font-size:12px;line-height:1.9;color:var(--text-2)">
        仓库：${S.upgrades.storage || 0}/1 级 ${(S.upgrades.storage || 0) >= 1 ? '✓' : '（未达标）'}<br>
        EP 库存：${fmt(S.ep)} / ${fmt(epStorageCap())}（需 ≥ ${Math.round(epStorageCap() * 0.5)}）${ok ? '✓' : '（未达标）'}
      </div>
      <button class="btn ${ok ? '' : 'disabled'}" data-religion-unlock="1" title="仓库有库存后解锁宗教系统">唤醒信仰</button>`;
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
    <div class="off-stat"><span>信仰余额</span><b>${fmt(S.faith || 0)}</b></div>
    <div class="off-stat"><span>信仰产出</span><b>+${templeFaithPerSec().toFixed(2)}/s（圣所）</b></div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">升级点 · 圣印（全局产出 +8%/级）</div>
    <div class="religion-seal-row">
      <span>Lv.${seal}/${sealMax}</span>
      <button class="btn ${cost === null || (S.faith || 0) < cost ? 'disabled' : ''}" data-religion-seal="1"
        title="消耗信仰升级；等级上限随资源点解锁提升">${cost === null ? `已达上限（解锁更多资源点）` : `升级（${fmt(cost)} 信仰）`}</button>
    </div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">信仰圣所（每级 +${TEMPLE.faithPerSec} 信仰/s）</div>
    <div class="religion-seal-row">
      <span>Lv.${templeLv}/${TEMPLE.cap}</span>
      <button class="btn ${tCost === null || S.ep < tCost ? 'disabled' : ''}" data-religion-temple="1"
        title="EP 购买，持续产出信仰">${tCost === null ? '已满级' : `建造 / 升级（${fmt(tCost)} EP）`}</button>
    </div>
    <div style="font-size:11px;color:var(--text-2);margin-top:8px">全流程：仓库解锁 → 分支选择（RP/DM/ES 逐级开放）→ 圣印与圣所升级 → 章节「神格」与终局共振。</div>`;
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
  });
}
