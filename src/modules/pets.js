import { S } from '../state.js';
import { PETS, petBaseMult } from '../data/pets.js';
import { elv, computeCps, fmt } from './economy.js';
import { checkEasterEggs } from './progression.js';

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

export function gainPetExp(dt) {
  const ids = activePetIds();
  if (ids.length === 0) return;
  let mult = 1;
  if (Date.now() < S.petXpUntil) mult *= 2;
  for (const id of ids) {
    const p = S.pets[id];
    if (!p || p.level >= 100) continue;
    p.exp += computeCps() * dt * 0.4 * mult; // v2.7.3 ⑦：获取速率 0.5→0.4（升级整体放缓）
    while (p.exp >= petExpNeed(p.level) && p.level < 100) {
      p.exp -= petExpNeed(p.level);
      p.level++;
    }
  }
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

let _gridHtml = '';
let _floatHtml = '';
export function renderPetGrid(container) {
  if (!container) return;
  const actives = activePetIds();
  let html = '';
  html += `<div style="grid-column:1/-1;font-size:11px;color:var(--text-2);margin-bottom:4px">出战位 ${actives.length}/3：出战异兽获得经验并生效</div>`;
  for (const [id, p] of Object.entries(S.pets)) {
    const isActive = actives.includes(id);
    const xpNeed = petExpNeed(p.level);
    const def = PETS.find(x => x.id === id);
    const genTag = p.gen > 1 ? `<div class="gen">G${p.gen}</div>` : '';
    html += `<div class="pet-card${isActive ? ' on' : ''}" data-pet-card="${id}">${genTag}
      <div class="icon">${def ? def.icon : p.icon}</div>
      <div class="n">${p.name}</div>
      <div class="lv">Lv.${p.level}${isActive ? ' · 出战' : ''}</div>
      <div class="lv" style="color:var(--green);font-size:10px">${def ? def.desc : ''}</div>
      <div class="pet-xp"><div style="width:${Math.min(100, p.exp / xpNeed * 100)}%"></div></div></div>`; // v2.8.17：已拥有卡直接显示效果（不靠悬浮）
  }
  const ownedIds = Object.keys(S.pets);
  const buyable = PETS.filter(p => !ownedIds.includes(p.id));
  if (buyable.length > 0) {
    html += `<div style="grid-column:1/-1;font-size:11px;color:var(--text-2);margin:8px 0 2px">异兽商店（异兽饼干：${Math.floor(S.pt || 0)}）</div>`; // v2.8.17：去「来源/解锁」研发说明
    for (const p of buyable) {
      const afford = (S.pt || 0) >= p.price;
      html += `<div class="pet-card${!afford ? ' cant' : ''}" data-pet-buy="${p.id}">
        <div class="icon">${p.icon}</div><div class="n">${p.name}</div>
        <div class="lv" style="color:var(--pink)">${p.price} PT</div>
        <div class="lv" style="color:var(--text-3);font-size:10px">${p.desc}</div></div>`;
    }
  }
  // v2.5.7 检查修复：HTML 未变化不重建（挂机经验/等级刷新复用同段标记，避免重建中断交互）
  if (html === _gridHtml) return;
  _gridHtml = html;
  container.innerHTML = html;
  container.querySelectorAll('[data-pet-card]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.petCard;
      // v2.0：影猫点击彩蛋计数
      if (id === 'cat') {
        S._catClicks = (S._catClicks || 0) + 1;
        checkEasterEggs('pet_click', S);
      }
      togglePetActive(id);
      renderPetGrid(container);
      // v2.5.8 检查修复：出战切换即时刷新浮标（原实现依赖 dirty.pets，延迟最多 5s / 需切 tab）
      const floatEl = document.getElementById('pet-float');
      if (floatEl) renderPetFloat(floatEl);
    });
  });
  container.querySelectorAll('[data-pet-buy]').forEach(el => {
    el.addEventListener('click', () => {
      const p = PETS.find(x => x.id === el.dataset.petBuy);
      if (p && buyPet(p)) {
        renderPetGrid(container);
        const floatEl = document.getElementById('pet-float');
        if (floatEl) renderPetFloat(floatEl);
      }
    });
  });
}

export function renderPetFloat(container) {
  if (!container) return;
  const ids = activePetIds();
  let html = '';
  if (ids.length > 0) {
    for (const id of ids) {
      const def = PETS.find(x => x.id === id);
      const p = S.pets[id];
      const mile = p.level >= 100 ? '神临' : p.level >= 80 ? '异化' : p.level >= 50 ? '觉醒' : p.level >= 25 ? '成长' : '';
      const anim = def && def.anim ? def.anim : 'a';
      html += `<div class="pet-item pet-anim-${anim}" data-pet-anim="${anim}" title="${p.name} Lv.${p.level}${mile ? ` · ${mile}` : ''}">${def ? def.icon : p.icon}</div>`; // v2.8.17 ③：idle 动画差异化（a/b/c/d）；去「里程碑×」研发性悬浮
    }
  }
  // v2.5.7 检查修复：相同内容不重建——否则每帧重设 innerHTML 会不断重启浮动动画
  if (html === _floatHtml) return;
  _floatHtml = html;
  container.innerHTML = html;
}
