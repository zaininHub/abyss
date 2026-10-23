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
    const genMult = 1 + (p.gen - 1) * 0.5 * (1 + elv('fuse') * 0.1);
    let pm = (p.mixed ? (p.mixed[key] || 1) : base) * levelMult * genMult;
    if (S.runTalent === 'pet_master' && key === 'global') pm *= 2;
    pm *= (1 + elv('pet') * 0.08);
    if (S.religion && S.religion.nature) pm *= 2;
    m *= pm;
  }
  return m;
}

export function petExpNeed(level) {
  return Math.floor(1000 * Math.pow(level, 2.5));
}

export function gainPetExp(dt) {
  const ids = activePetIds();
  if (ids.length === 0) return;
  let mult = 1;
  if (Date.now() < S.petXpUntil) mult *= 2;
  for (const id of ids) {
    const p = S.pets[id];
    if (!p || p.level >= 100) continue;
    p.exp += computeCps() * dt * 0.5 * mult;
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
      <div class="pet-xp"><div style="width:${Math.min(100, p.exp / xpNeed * 100)}%"></div></div></div>`;
  }
  const ownedIds = Object.keys(S.pets);
  const buyable = PETS.filter(p => !ownedIds.includes(p.id));
  if (buyable.length > 0) {
    html += `<div style="grid-column:1/-1;font-size:11px;color:var(--text-2);margin:8px 0 2px">异兽商店（异兽饼干：${Math.floor(S.pt || 0)}）——来源：宠物乐园 / 伊甸花园 产出；解锁：商店购入「宠物乐园」</div>`;
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
      html += `<div class="pet-item" title="${p.name} Lv.${p.level}">${def ? def.icon : p.icon}</div>`;
    }
  }
  // v2.5.7 检查修复：相同内容不重建——否则每帧重设 innerHTML 会不断重启浮动动画
  if (html === _floatHtml) return;
  _floatHtml = html;
  container.innerHTML = html;
}
