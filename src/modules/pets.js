import { S, save } from '../state.js';
import { PETS, petBaseMult } from '../data/pets.js';
import { elv, fmt, ptCap } from './economy.js'; // v3.3.9 反馈⑦：PT 上限（满仓即停）
import { converterThreadBoost } from './threadBinding.js'; // v3.3.3 反馈⑦：孵化产出随绑定线程加成（显示与 tick 同口径）
import { checkEasterEggs } from './progression.js';

export function activePetIds() {
  return S.activePets.filter(id => S.pets[id]);
}

export function petMult(key) {
  if (petStarving()) return 1; // v3.2.1 反馈⑨：PT 不足休战中——出战加成整体失效
  let m = 1;
  for (const id of activePetIds()) {
    const p = S.pets[id];
    if (!p) continue;
    const base = petBaseMult(id, key);
    if (base === 1 && !p.mixed) continue;
    const levelMult = 1 + p.level * 0.02;
    // v2.7.3 ⑦：等级里程碑——25/50/80/100 级各解锁一档额外加成（玩法深度）
    const MILESTONES = [[25, 1.25], [50, 1.5], [80, 1.8], [100, 2.2]];
    let mileMult = 1;
    for (const [lv, mv] of MILESTONES) if (p.level >= lv) mileMult *= mv;
    const genMult = 1 + (p.gen - 1) * 0.5 * (1 + elv('fuse') * 0.1);
    let pm = (p.mixed ? (p.mixed[key] || 1) : base) * levelMult * genMult * mileMult;
    if (S.runTalent === 'pet_master' && key === 'global') pm *= 2;
    pm *= (1 + elv('pet') * 0.08);
    if (S.religion && S.religion.nature) pm *= 2;
    m *= pm;
  }
  return m;
}

export function petExpNeed(level) {
  // v2.7.3 ⑦：升级减速——需求曲线抬高（1000×l^2.5 → 1200×l^2.8），防止后期产出爆炸导致宠物等级飞涨
  return Math.floor(1200 * Math.pow(level, 2.8));
}

// v3.0.3 第二批⑤：宠物升级消耗异兽饼干（PT）——成本陡峭（20 起步 ×1.55/级），升级依赖饼干
export function petPtNeed(level) {
  return Math.floor(20 * Math.pow(1.55, level));
}

export function gainPetExp(dt) {
  const ids = activePetIds();
  if (ids.length === 0) return;
  // v3.2.1 反馈⑨：PT 不足时异兽休战（不获得经验、加成失效）——恢复缓冲：PT ≥ 1
  if (petStarving()) return;
  let mult = 1;
  if (Date.now() < S.petXpUntil) mult *= 2;
  for (const id of ids) {
    const p = S.pets[id];
    if (!p || p.level >= 100) continue;
    // v3.3.9 反馈③：经验按「陪伴时间」累积（与实际产脱钩）——每级固定耗时，买入不会秒满级
    p.exp += petXpPerSec(p.level) * dt * mult;
    // v3.3.7 反馈④：异兽不再自动升级（不再自动扣 PT）——经验满即封顶，
    // 由玩家在卡面点「升级」按钮手动消耗异兽饼干（levelUpPet）
    if (p.exp > petExpNeed(p.level)) p.exp = petExpNeed(p.level);
  }
}

// v3.3.7 反馈④：手动升级——经验满 ∧ PT 足够时由玩家点击升级（原自动升级已移除）
export function levelUpPet(id) {
  const p = S.pets[id];
  if (!p || p.level >= 100) return { ok: false, reason: '已满级' };
  if (p.exp < petExpNeed(p.level)) return { ok: false, reason: '经验未满' };
  const ptNeed = petPtNeed(p.level);
  if ((S.pt || 0) < ptNeed) return { ok: false, reason: `PT 不足（需 ${fmt(ptNeed)}）` };
  S.pt = Math.max(0, (S.pt || 0) - ptNeed);
  p.exp = Math.max(0, p.exp - petExpNeed(p.level));
  p.level++;
  save(S);
  return { ok: true, level: p.level };
}

// v3.2.1 反馈⑨：异兽存活维持——出战异兽每秒消耗 PT（随等级增长），PT 不足自动休战，恢复缓冲 PT ≥ 1 后重新出战
const PET_UPKEEP_BASE = 0.02; // Lv.1 每只 0.02 PT/s
export function petUpkeepPerSec(p) {
  return PET_UPKEEP_BASE * (p ? p.level : 1) * (1 + ((p && p.gen ? p.gen : 1) - 1) * 0.25);
}
export function petUpkeepTotalPerSec() {
  let sum = 0;
  for (const id of activePetIds()) { const p = S.pets[id]; if (p) sum += petUpkeepPerSec(p); }
  return sum;
}
export function petStarving() {
  return (S.pt || 0) <= 0 && activePetIds().length > 0;
}

export function buyPet(petDef) {
  if ((S.pt || 0) < petDef.price) return false;
  S.pt -= petDef.price;
  S.pets[petDef.id] = { icon: petDef.icon, name: petDef.name, level: 1, exp: 0, gen: 1 };
  if (S.activePets.length < 3) S.activePets.push(petDef.id);
  return true;
}

export function togglePetActive(id) {
  const idx = S.activePets.indexOf(id);
  if (idx >= 0) {
    S.activePets.splice(idx, 1);
  } else {
    if (S.activePets.length >= 3) return false;
    S.activePets.push(id);
  }
  return true;
}

export function fusePets(aId, bId) {
  const a = S.pets[aId], b = S.pets[bId];
  if (!a || !b) return null;
  if (a.level < 50 || b.level < 50) return null;
  if (aId === bId) return null;
  const keys = ['global', 'click', 'offline', 'event'];
  const mixed = {};
  for (const k of keys) {
    const va = petBaseMult(aId, k) - 1;
    const vb = petBaseMult(bId, k) - 1;
    mixed[k] = 1 + (va + vb) * 0.5 * (1 + 0.3 * Math.random());
  }
  const newId = 'fused_' + Date.now();
  const gen = Math.max(a.gen, b.gen) + 1;
  const names = ['星噬', '暗裔', '深渊眷属', '虚空织者', '苍穹守望', '碧潭行者', '饕餮', '福瑞', '外神之影', '不可名状'];
  S.pets[newId] = {
    icon: '✨', name: names[Math.floor(Math.random() * names.length)] + ` G${gen}`,
    level: 1, exp: 0, gen, mixed, fused: true, parentA: aId, parentB: bId
  };
  delete S.pets[aId]; delete S.pets[bId];
  S.activePets = S.activePets.filter(x => x !== aId && x !== bId);
  if (S.activePets.length < 3) S.activePets.push(newId);
  S.fusesDone++;
  return S.pets[newId];
}

// v3.3.9 反馈③：异兽升级条件改为「陪伴时间」——每级需累积固定时长，购买/升级后必从头计时，
// 杜绝「高产出下买入即满经验、立即可升」。等级越高单级耗时越长（45s 起，每级 +6s）。
export function petLevelSeconds(level) {
  return 45 + Math.max(1, level) * 6;
}
export function petXpPerSec(level) {
  return petExpNeed(level) / petLevelSeconds(level);
}
export function petXpRemainSec(p) {
  if (!p || p.level >= 100) return 0;
  const rate = petXpPerSec(p.level);
  return Math.max(0, Math.ceil((petExpNeed(p.level) - p.exp) / Math.max(rate, 1e-9)));
}

// v3.3.9 反馈⑥：卡面展示异兽当前实际加成（等级/世代/里程碑/永恒宠物乘区都算进去）
const PET_EFFECT_KEYS = [['global', '全局'], ['click', '点击'], ['offline', '离线'], ['event', '事件']];
export function petEffectText(id, p) {
  if (!p) return '';
  const parts = [];
  for (const [k, label] of PET_EFFECT_KEYS) {
    const base = p.mixed ? (p.mixed[k] || 1) : petBaseMult(id, k);
    if (base <= 1.0001) continue;
    const levelMult = 1 + p.level * 0.02;
    const MILESTONES = [[25, 1.25], [50, 1.5], [80, 1.8], [100, 2.2]];
    let mileMult = 1;
    for (const [lv, mv] of MILESTONES) if (p.level >= lv) mileMult *= mv;
    const genMult = 1 + (p.gen - 1) * 0.5 * (1 + elv('fuse') * 0.1);
    const total = base * levelMult * genMult * mileMult * (1 + elv('pet') * 0.08);
    parts.push(`${label} +${Math.round((total - 1) * 100)}%`);
  }
  if (!parts.length) {
    const def = PETS.find(x => x.id === id);
    return def ? def.desc : '无加成';
  }
  return parts.join(' · ');
}

let _gridSig = '';
let _floatHtml = '';
const _petEls = new Map(); // id -> card el（原地刷新用）

function petCardHtml(id, p, actives, starving) {
  const isActive = actives.includes(id);
  const def = PETS.find(x => x.id === id);
  const genTag = p.gen > 1 ? `<div class="gen">G${p.gen}</div>` : '';
  const upk = petUpkeepPerSec(p);
  const upkLine = isActive
    ? `<div class="lv" style="color:${starving ? 'var(--text-3)' : 'var(--warn)'};font-size:10px">${starving ? '已回家 · 停扣' : `维持 -${upk.toFixed(2)} PT/s`}</div>`
    : `<div class="lv" style="color:var(--text-3);font-size:10px">未出战 · 不消耗</div>`;
  const xpNeed = petExpNeed(p.level);
  const xpReady = isActive && !starving && p.level < 100 && p.exp >= xpNeed;
  const xpTitle = p.level >= 100 ? '已满级'
    : `经验 ${Math.floor(Math.min(p.exp, xpNeed))} / ${Math.floor(xpNeed)} · 还需 ${petXpRemainSec(p)} 秒陪伴${xpReady ? ` · 点击「升级」消耗 ${fmt(petPtNeed(p.level))} PT` : ''}`;
  const upBtn = xpReady
    ? `<button class="btn pet-up-btn${(S.pt || 0) >= petPtNeed(p.level) ? '' : ' disabled'}" data-pet-up="${id}" style="margin-top:4px;padding:3px 10px;font-size:11px;width:100%">升级 -${fmt(petPtNeed(p.level))} PT</button>`
    : '';
  return `<div class="pet-card${isActive ? ' on' : ''}${isActive && starving ? ' starving' : ''}" data-pet-card="${id}">${genTag}
      <div class="icon">${def ? def.icon : p.icon}</div>
      <div class="n">${p.name}</div>
      <div class="lv">Lv.${p.level}${isActive ? (starving ? ' · <span style="color:var(--warn)">💤 休战中</span>' : ' · 出战') : ''}</div>
      <div class="pet-fx" title="当前实际加成（含等级/世代/里程碑乘区）">${petEffectText(id, p)}</div>
      ${upkLine}
      <div class="pet-xp" title="${xpTitle}"><div style="width:${Math.min(100, p.exp / xpNeed * 100)}%"></div></div>
      <div class="pet-eta mono" title="${xpTitle}">${p.level >= 100 ? '已满级' : p.exp >= xpNeed ? '可升级' : `升级 ${petXpRemainSec(p)}s`}</div>${upBtn}</div>`;
}

// 结构未变时只做原地数值刷新（经验条/倒计时/按钮灰态）——原实现每帧因经验条宽度变化整面重建，
// 升级按钮被反复销毁重建，视觉上一直闪
function refreshPetGridLive(container) {
  const actives = activePetIds();
  const starving = petStarving();
  for (const [id, el] of _petEls) {
    const p = S.pets[id];
    if (!p || !el.isConnected) continue;
    const xpNeed = petExpNeed(p.level);
    const fill = el.querySelector('.pet-xp > div');
    if (fill) fill.style.width = `${Math.min(100, p.exp / xpNeed * 100)}%`;
    const eta = el.querySelector('.pet-eta');
    if (eta) eta.textContent = p.level >= 100 ? '已满级' : p.exp >= xpNeed ? '可升级' : `升级 ${petXpRemainSec(p)}s`;
    const btn = el.querySelector('[data-pet-up]');
    if (btn) {
      const can = actives.includes(id) && !starving && (S.pt || 0) >= petPtNeed(p.level) && p.exp >= xpNeed;
      btn.classList.toggle('disabled', !can);
      btn.disabled = !can;
    }
  }
}

export function renderPetGrid(container) {
  if (!container) return;
  const actives = activePetIds();
  const starving = petStarving(); // v3.2.3 反馈⑥：休战状态在卡片/浮标可见（异兽「回家」）
  const ptOn = S.ptDistillOn === true;
  const autoHatch = S.ptAutoHatch === true;
  const hatchLv = S.ptHatchLv || 1;
  const ownedIds = Object.keys(S.pets);
  const buyable = PETS.filter(p => !ownedIds.includes(p.id));
  const ptFull = (S.pt || 0) >= ptCap() - 1e-9; // v3.3.9 反馈⑦：满仓停产提示（开关保持开启）

  // v3.3.9 反馈③⑥：结构签名——只在「等级/出战/可升级/孵化开关/可购买品种/休战」变化时重建，
  // 经验条与倒计时走原地刷新（杜绝按钮闪烁）
  const sig = [
    actives.length, starving ? 1 : 0,
    ...ownedIds.map(id => {
      const p = S.pets[id];
      const xpReady = actives.includes(id) && !starving && p.level < 100 && p.exp >= petExpNeed(p.level);
      return `${id}:${p.level}:${p.gen}:${actives.includes(id) ? 1 : 0}:${xpReady ? 1 : 0}`;
    }),
    `b:${buyable.map(p => p.id).join(',')}`,
    `h:${autoHatch ? 1 : 0}${ptOn ? 1 : 0}${hatchLv}${ptFull ? 'f' : ''}`,
  ].join('|');
  if (sig === _gridSig && container.childElementCount > 0) {
    refreshPetGridLive(container);
    return;
  }
  _gridSig = sig;

  let html = '';
  html += `<div style="grid-column:1/-1;font-size:11px;color:var(--text-2);margin-bottom:4px">出战位 ${actives.length}/3：出战异兽获得经验并生效${starving ? ' —— <b style="color:var(--bad)">PT 不足，全部休战中</b>' : ''}</div>`;
  for (const id of ownedIds) html += petCardHtml(id, S.pets[id], actives, starving);

  const hatchCtl = autoHatch
    ? `<span style="font-size:12px;color:var(--text-2)">异兽孵化 ×${hatchLv}：<b style="color:var(--pink)">+${fmt(0.15 * hatchLv * converterThreadBoost('hatch'))} PT/s</b>${ptFull ? ' <b style="color:var(--warn)">· PT 已满，暂停产出与消耗</b>' : ''}</span>
      <button data-pt-distill-toggle style="margin-left:auto;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:6px 16px;font-size:12.5px;background:${ptOn ? 'var(--good,#3fb950)' : 'var(--red,#f85149)'};color:#fff">${ptOn ? '孵化开' : '孵化关'}</button>`
    : `<span style="font-size:11.5px;color:var(--text-3)">自动孵化未解锁——到「升级商店 · 设施」购买孵化升级</span>`;
  html += `<div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;margin:4px 0;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-2,#141821)">${hatchCtl}</div>`;
  const upkeep = petUpkeepTotalPerSec();
  if (upkeep > 0) {
    html += `<div style="grid-column:1/-1;font-size:11px;color:${starving ? 'var(--bad)' : 'var(--text-3)'};margin:-2px 0 4px">出战维持：-${fmt(upkeep)} PT/s（随等级/世代增长）${starving ? ' · <b>PT 不足，异兽已回家休战（加成失效、不获经验、停扣维持）——PT 回升后自动重新出战</b>' : ''}</div>`;
  }
  if (buyable.length > 0) {
    html += `<div style="grid-column:1/-1;font-size:11px;color:var(--text-2);margin:8px 0 2px">异兽商店（PT：${Math.floor(S.pt || 0)} / ${fmt(ptCap())}）</div>`;
    for (const p of buyable) {
      const afford = (S.pt || 0) >= p.price;
      html += `<div class="pet-card${!afford ? ' cant' : ''}" data-pet-buy="${p.id}">
        <div class="icon">${p.icon}</div><div class="n">${p.name}</div>
        <div class="lv" style="color:var(--pink)">${p.price} PT</div>
        <div class="pet-fx">${p.desc}</div></div>`;
    }
  }
  container.innerHTML = html;
  _petEls.clear();
  container.querySelectorAll('[data-pet-card]').forEach(el => _petEls.set(el.dataset.petCard, el));
  if (!container._ptDelegated) {
    container._ptDelegated = true;
    container.addEventListener('click', (ev) => {
      const up = ev.target.closest ? ev.target.closest('[data-pet-up]') : null;
      if (up) {
        ev.stopPropagation();
        const r = levelUpPet(up.dataset.petUp);
        if (!r.ok && r.reason !== '经验未满') console.debug('[pet] levelUp:', r.reason);
        _gridSig = ''; // 等级变化 → 允许重建
        renderPetGrid(container);
        const fel = document.getElementById('pet-float');
        if (fel) renderPetFloat(fel);
        return;
      }
      const tog = ev.target.closest ? ev.target.closest('[data-pt-distill-toggle]') : null;
      if (tog) {
        S.ptDistillOn = S.ptDistillOn === true ? false : true;
        save(S);
        _gridSig = '';
        renderPetGrid(container);
        return;
      }
      const buy = ev.target.closest ? ev.target.closest('[data-pet-buy]') : null;
      if (buy) {
        const p = PETS.find(x => x.id === buy.dataset.petBuy);
        if (p && buyPet(p)) {
          _gridSig = '';
          renderPetGrid(container);
          const fel = document.getElementById('pet-float');
          if (fel) renderPetFloat(fel);
        }
        return;
      }
      const card = ev.target.closest ? ev.target.closest('[data-pet-card]') : null;
      if (card) {
        const id = card.dataset.petCard;
        if (id === 'cat') {
          S._catClicks = (S._catClicks || 0) + 1;
          checkEasterEggs('pet_click', S);
        }
        togglePetActive(id);
        _gridSig = '';
        renderPetGrid(container);
        const fel = document.getElementById('pet-float');
        if (fel) renderPetFloat(fel);
      }
    });
  }
}

export function renderPetFloat(container) {
  if (!container) return;
  const ids = activePetIds();
  const starving = petStarving(); // v3.2.3 反馈⑥：PT 不足时浮标异兽灰显回家
  let html = '';
  if (ids.length > 0) {
    for (const id of ids) {
      const def = PETS.find(x => x.id === id);
      const p = S.pets[id];
      const mile = p.level >= 100 ? '神临' : p.level >= 80 ? '异化' : p.level >= 50 ? '觉醒' : p.level >= 25 ? '成长' : '';
      const anim = def && def.anim ? def.anim : 'a';
      const tip = `${p.name} Lv.${p.level}${mile ? ` · ${mile}` : ''}${starving ? ' · 💤 休战中（PT 不足）' : ''}`;
      html += `<div class="pet-item pet-anim-${anim}${starving ? ' starving' : ''}" data-pet-anim="${anim}" title="${tip}">${def ? def.icon : p.icon}</div>`; // v2.8.17 ③：idle 动画差异化（a/b/c/d）；去「里程碑×」研发性悬浮
    }
  }
  // v2.5.7 检查修复：相同内容不重建——否则每帧重设 innerHTML 会不断重启浮动动画
  if (html === _floatHtml) return;
  _floatHtml = html;
  container.innerHTML = html;
}

// v2.8.26：宠物商店 PT 可购判断每秒刷新（此前渲染时一次性——PT 花掉后卡仍亮）
// v3.3.7 反馈④：升级按钮灰态同步原地刷新（PT 变动不整面重建）
export function refreshPetsAffordability() {
  const cards = document.querySelectorAll('#pet-grid [data-pet-buy]');
  for (const card of cards) {
    const p = PETS.find(x => x.id === card.dataset.petBuy);
    if (!p) continue;
    card.classList.toggle('cant', (S.pt || 0) < p.price);
  }
  const upBtns = document.querySelectorAll('#pet-grid [data-pet-up]');
  for (const btn of upBtns) {
    const p = S.pets[btn.dataset.petUp];
    if (!p) continue;
    const can = (S.pt || 0) >= petPtNeed(p.level) && p.exp >= petExpNeed(p.level);
    btn.classList.toggle('disabled', !can);
    btn.disabled = !can;
  }
}

// v3.0.3 第四批③：异兽孵化升级成本——EP 指数曲线（参考其他升级项），消耗大幅增多
export function ptHatchUpgCost(lv) {
  return Math.ceil(20000 * Math.pow(2.2, lv - 1));
}
