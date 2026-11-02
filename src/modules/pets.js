import { S, save } from '../state.js';
import { PETS, petBaseMult } from '../data/pets.js';
import { elv, computeCps, fmt } from './economy.js';
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
    p.exp += computeCps() * dt * 0.1 * mult; // v3.0.3 后续反馈③：升级速率 ÷4（0.4→0.1）——异兽升级过快（叠加饼干门槛与孵化产出线性化）
    while (p.exp >= petExpNeed(p.level) && p.level < 100) {
      // v3.0.3 第二批⑤：升级需消耗异兽饼干；饼干不足时本回合停止升级（资源门槛陡峭化）
      const ptNeed = petPtNeed(p.level);
      if ((S.pt || 0) < ptNeed) break;
      S.pt = Math.max(0, (S.pt || 0) - ptNeed);
      p.exp -= petExpNeed(p.level);
      p.level++;
    }
  }
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
  // v3.0.3 反馈⑫ + 第三批② + 第四批②③⑥：异兽孵化——去括号文案、按钮放大、升级按钮在开关旁
  // v3.2.1 反馈①：自动孵化需解锁（首次购买「孵化升级」解锁，不再直接开放）
  // v3.2.1 反馈⑥：文案改「总计 / 下级」双行口径；反馈⑨：出战维持消耗展示 + PT 不足休战提示
  const ptOn = S.ptDistillOn === true;
  const autoHatch = S.ptAutoHatch === true;
  const hatchLv = S.ptHatchLv || 1;
  const epPerS = 5000 * hatchLv; // v3.0.3 后续反馈②：孵化 EP 消耗 ×5（1000→5000），与 main.js tick 同口径
  const ptPerS = 0.15 * hatchLv;
  const epNext = 5000 * (hatchLv + 1);
  const ptNext = 0.15 * (hatchLv + 1);
  const hatchCost = ptHatchUpgCost(hatchLv);
  const hatchAfford = (S.ep || 0) >= hatchCost; // v3.0.3 第六批②：EP 不足灰显
  const upkeep = petUpkeepTotalPerSec();
  const starving = petStarving();
  let hatchCtl;
  if (!autoHatch) {
    hatchCtl = `<span style="font-size:11.5px;color:var(--text-3)">自动孵化未解锁</span>
      <button data-pt-hatch-upg style="margin-left:auto;cursor:${hatchAfford ? 'pointer' : 'not-allowed'};opacity:${hatchAfford ? 1 : 0.5};border:1px solid ${hatchAfford ? 'var(--accent)' : 'var(--border)'};border-radius:4px;padding:6px 16px;font-size:12.5px;background:var(--bg-2,#141821);color:${hatchAfford ? 'var(--accent)' : 'var(--text-3)'}" title="购买「孵化升级」即解锁自动孵化（EP → PT 持续转化），并提升孵化速率">解锁自动孵化 ${fmt(hatchCost)} EP</button>`;
  } else {
    hatchCtl = `<span style="font-size:12px;color:var(--text-2)">异兽孵化 ×${hatchLv}：总计 <b style="color:var(--bad)">-${fmt(epPerS)} EP/s</b> <b style="color:var(--pink)">+${fmt(ptPerS)} PT/s</b>　下级 <b style="color:var(--bad)">-${fmt(epNext)} EP/s</b> <b style="color:var(--pink)">+${fmt(ptNext)} PT/s</b></span>
      <button data-pt-distill-toggle style="margin-left:auto;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:6px 16px;font-size:12.5px;background:${ptOn ? 'var(--good,#3fb950)' : 'var(--red,#f85149)'};color:#fff">${ptOn ? '孵化开' : '孵化关'}</button>
      <button data-pt-hatch-upg style="cursor:${hatchAfford ? 'pointer' : 'not-allowed'};opacity:${hatchAfford ? 1 : 0.5};border:1px solid ${hatchAfford ? 'var(--accent)' : 'var(--border)'};border-radius:4px;padding:6px 16px;font-size:12.5px;background:var(--bg-2,#141821);color:${hatchAfford ? 'var(--accent)' : 'var(--text-3)'}">升级 ${fmt(hatchCost)} EP</button>`;
  }
  html += `<div style="grid-column:1/-1;display:flex;align-items:center;gap:10px;margin:4px 0;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-2,#141821)">${hatchCtl}</div>`;
  if (upkeep > 0) {
    html += `<div style="grid-column:1/-1;font-size:11px;color:${starving ? 'var(--bad)' : 'var(--text-3)'};margin:-2px 0 4px">出战维持：-${fmt(upkeep)} PT/s（随等级/世代增长）${starving ? ' · <b>PT 不足，异兽已全部休战（加成失效）——PT ≥ 1 自动恢复出战</b>' : ''}</div>`;
  }
  if (buyable.length > 0) {
    html += `<div style="grid-column:1/-1;font-size:11px;color:var(--text-2);margin:8px 0 2px">异兽商店（PT：${Math.floor(S.pt || 0)}）</div>`; // v2.8.17：去「来源/解锁」研发说明
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
  // v3.0.3 第四批⑥：改用事件委托——面板重建/HTML 复用后监听不丢失，点击一次即响应
  if (!container._ptDelegated) {
    container._ptDelegated = true;
    container.addEventListener('click', (ev) => {
      const t = ev.target.closest ? ev.target.closest('[data-pt-distill-toggle],[data-pt-hatch-upg]') : ev.target;
      if (t && t.hasAttribute('data-pt-distill-toggle')) {
        S.ptDistillOn = S.ptDistillOn === true ? false : true;
        save(S);
        renderPetGrid(container);
      } else if (t && t.hasAttribute('data-pt-hatch-upg')) {
        const cost = ptHatchUpgCost(S.ptHatchLv || 1);
        if ((S.ep || 0) < cost) return;
        S.ep -= cost;
        S.ptHatchLv = (S.ptHatchLv || 1) + 1;
        if (S.ptAutoHatch !== true) S.ptAutoHatch = true; // v3.2.1 反馈①：首次购买孵化升级即解锁自动孵化
        save(S);
        renderPetGrid(container);
      }
    });
  }
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

// v2.8.26：宠物商店 PT 可购判断每秒刷新（此前渲染时一次性——PT 花掉后卡仍亮）
export function refreshPetsAffordability() {
  const cards = document.querySelectorAll('#pet-grid [data-pet-buy]');
  for (const card of cards) {
    const p = PETS.find(x => x.id === card.dataset.petBuy);
    if (!p) continue;
    card.classList.toggle('cant', (S.pt || 0) < p.price);
  }
}

// v3.0.3 第四批③：异兽孵化升级成本——EP 指数曲线（参考其他升级项），消耗大幅增多
export function ptHatchUpgCost(lv) {
  return Math.ceil(20000 * Math.pow(2.2, lv - 1));
}
