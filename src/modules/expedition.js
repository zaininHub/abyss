import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { computeCps, fmt, fmtTime, hasTech, addEp, addRp, addDm, addPt, unitCost } from './economy.js';
import { log, toast, dirty } from '../core/runtime.js'; // v3.0.0 测试性解耦：侧效工具下沉到 DOM 无关的 core
import { renderCosmosHtml, buyCosmos, COSMOS, cosmosCost, cosmosLv } from './cosmos.js'; // v3.0.3 后续反馈④：宇宙探索大模块；v3.0.5 反馈②：可购态快刷

// v3.4.6 反馈③：星图改造——探索消耗 EP/RP/PT、携带出战异兽进行深空探索，返回「星际燃料 CPS」：
//   CPS 用于升级星际探索的所有升级（深空殖民 / 宇宙探索工程），并可开启「燃料模式」持续燃烧加速全局产出。
//   出战异兽随队：每只 +10% CPS 收益（出战位 3 → 最多 +30%）；殖民等级收益加成沿用（+10%/级）。
export const GALAXIES = [
  // v3.4.8 反馈⑤：出发消耗全面 ×100（EP/RP/PT 三种资源同步扩大，CPS 奖励不变）——
  //   此前月球 5K EP 就能换 2 CPS，探索几乎零成本；现在星图是真正的资源出口
  { id: 'moon',     name: '月球基地',   dur: 30,    cpsReq: 0,    cost: { ep: 5e5,   rp: 0,     pt: 0     }, cps: 2,    desc: '短平快探索' },
  { id: 'mars',     name: '火星前哨',   dur: 120,   cpsReq: 100,  cost: { ep: 5e6,   rp: 200,   pt: 0     }, cps: 10,   desc: '稳定收益' },
  { id: 'jupiter',  name: '木星轨道',   dur: 600,   cpsReq: 1e3,  cost: { ep: 5e7,   rp: 800,   pt: 500   }, cps: 40,   desc: '外行星采样' },
  { id: 'centauri', name: '半人马座',   dur: 3600,  cpsReq: 1e5,  cost: { ep: 5e8,   rp: 2500,  pt: 2000  }, cps: 200,  desc: '恒星际远航' },
  { id: 'edge',     name: '银河边缘',   dur: 14400, cpsReq: 1e6,  cost: { ep: 3e9,   rp: 6000,  pt: 5000  }, cps: 800,  es: 2,  desc: '银河边缘 · 额外 ES' },  // v2.8.19：后期设施奖励保留
  { id: 'andromeda', name: '仙女座',    dur: 28800, cpsReq: 1e8,  cost: { ep: 1e10,  rp: 15000, pt: 12000 }, cps: 3000, es: 10, desc: '河外远征 · 丰厚 ES' },
];

export const FUEL_BURN_PER_SEC = 2;   // 燃料模式：每秒燃烧 CPS
export const FUEL_GLOBAL_MULT = 1.5;  // 燃料模式：全局产出 ×1.5（globalMult 接线）

export function petCpsBonus() {
  // 出战异兽随队加成：每只 +10%（出战位上限 3）
  const n = Math.min(3, (S.activePets || []).filter(id => S.pets && S.pets[id]).length);
  return 1 + 0.10 * n;
}
export function expeditionCpsReward(g) {
  const colonyBonus = 1 + (BALANCE.colonyExploreBonus || 0) * starColonyLevel();
  return Math.round(g.cps * petCpsBonus() * colonyBonus);
}

export function maxExpeditions() { return hasTech('deep_space') ? 2 : 1; }

// ===== v2.8.3 深空殖民（deep_space 解锁后单独模块） =====
export function starColonyLevel() {
  let n = 0;
  for (const c of BALANCE.starColonies || []) n += (S.upgrades && S.upgrades[c.id]) || 0;
  return n;
}
export function starColoniesUnlocked() { return hasTech('deep_space'); }
export function colonyRpPerSec() {
  let rp = 0;
  for (const c of BALANCE.starColonies || []) {
    const n = (S.upgrades && S.upgrades[c.id]) || 0;
    rp += c.rpRate * n;
  }
  return rp;
}
export function tickColonies(dt) {
  const rp = colonyRpPerSec();
  if (rp > 0) addRp(rp * dt); // v2.8.27 ②：RP 上限
}
function colonyCost(c) {
  // v3.4.6 反馈③：殖民站改消耗星际燃料 CPS（数值沿用 base/growth，货币从 EP 切换为 CPS）
  const owned = (S.upgrades && S.upgrades[c.id]) || 0;
  return Math.ceil(c.base * Math.pow(c.growth || 1.30, owned));
}

// v3.0.5 反馈②：星图面板（深空殖民 / 宇宙探索）可购态快刷——只切 cant，不重建 DOM
// （面板整建在 5s 低频通道，EP 随时变化时「能买却灰着」可达 5s；此处对齐 300ms 快刷车道）
export function refreshExpeditionAffordability() {
  const panel = document.getElementById('expedition-panel');
  if (!panel) return;
  for (const el of panel.querySelectorAll('[data-colony]')) {
    const c = (BALANCE.starColonies || []).find(x => x.id === el.dataset.colony);
    if (!c) continue;
    const owned = (S.upgrades && S.upgrades[c.id]) || 0;
    if (owned >= c.cap) continue;
    el.classList.toggle('cant', (S.starCps || 0) < colonyCost(c));
  }
  for (const el of panel.querySelectorAll('[data-cosmos]')) {
    const p = COSMOS[el.dataset.cosmos];
    if (!p) continue;
    const lv = cosmosLv(p.id);
    if (lv >= p.cap) continue;
    el.classList.toggle('cant', (S.starCps || 0) < cosmosCost(p, lv));
  }
}
function buyColony(id) {
  const c = (BALANCE.starColonies || []).find(x => x.id === id);
  if (!c) return;
  const owned = (S.upgrades && S.upgrades[c.id]) || 0;
  if (owned >= c.cap) { toast('殖民站已达上限'); return; }
  const cost = colonyCost(c);
  if ((S.starCps || 0) < cost) { toast(`星际燃料 CPS 不足（需 ${fmt(cost)}）`); return; }
  S.starCps -= cost;
  S.upgrades = S.upgrades || {};
  S.upgrades[c.id] = owned + 1;
  save(S);
  dirty.expedition = true;
  log(`深空殖民：${c.name} Lv.${owned + 1}（-${fmt(cost)} CPS，+${c.rpRate} RP/s）`, 'good');
}
function renderColoniesHtml() {
  // v2.8.7：未解锁时展示提示（深空探测后开放深空殖民），避免「解锁后没效果」的感知断层
  if (!starColoniesUnlocked()) {
    return `<div style="margin-top:12px;border-top:1px solid var(--line, rgba(255,255,255,.08));padding-top:10px;color:var(--text-3);font-size:11.5px">
      🛸 深空殖民未解锁——科技树研究「深空探测」后开放（殖民站长期产出 RP，并提升探索收益）。</div>`;
  }
  const bonus = (BALANCE.colonyExploreBonus || 0) * starColonyLevel();
  let html = `<div style="margin-top:14px;border-top:1px solid var(--line, rgba(255,255,255,.08));padding-top:10px">
    <div style="color:var(--purple);font-size:12px;font-weight:600;margin-bottom:4px">🛸 深空殖民 <span style="color:var(--text-2);font-weight:400;font-size:11px">（星际探索解锁 · 殖民站长期产出 RP，探索收益 +${Math.round(bonus * 100)}% · 消耗星际燃料 CPS）</span></div>`;
  for (const c of BALANCE.starColonies || []) {
    const owned = (S.upgrades && S.upgrades[c.id]) || 0;
    const cost = colonyCost(c);
    const full = owned >= c.cap;
    html += `<div class="off-upg${!full && (S.starCps || 0) < cost ? ' cant' : ''}" data-colony="${c.id}" style="${full ? 'opacity:.55' : ''}">
      <span>${c.name}<br><span style="color:var(--text-3);font-size:10.5px">${c.desc} · ${owned}/${c.cap} 级</span></span>
      <span style="color:var(--cyan)">${full ? '已满级' : fmt(cost) + ' CPS'}</span></div>`;
  }
  // v2.8.5：星际里程碑（殖民总级数门槛一次性奖励，长线）
  html += `<div style="margin-top:8px;color:var(--text-2);font-size:11px;font-weight:600">星际里程碑（殖民总级数 ${starColonyLevel()}，奖励一次性）</div>`;
  for (const ms of BALANCE.starMilestones || []) {
    const claimed = !!(S.starMiles && S.starMiles[ms.need]);
    const reach = starColonyLevel() >= ms.need;
    html += `<div class="off-upg${claimed ? '' : reach ? '' : ' cant'}" data-starmile="${ms.need}" style="${claimed ? 'opacity:.55' : ''}">
      <span>${ms.name} · ${ms.need} 级${claimed ? '（已领取）' : ''}<br><span style="color:var(--text-3);font-size:10.5px">${fmt(ms.rp)} RP + ${fmt(ms.ep)} EP</span></span>
      <span style="color:var(--cyan)">${claimed ? '✓' : reach ? '可领取' : '未达成'}</span></div>`;
  }
  return html + `</div>`;
}

// v2.8.5：领取星际里程碑奖励
function claimStarMilestone(need) {
  const ms = (BALANCE.starMilestones || []).find(x => x.need === need);
  if (!ms) return;
  if (S.starMiles && S.starMiles[need]) { toast('该里程碑已领取'); return; }
  if (starColonyLevel() < need) { toast(`殖民总级数未达标（需 ${need} 级，当前 ${starColonyLevel()}）`); return; }
  S.starMiles = S.starMiles || {};
  S.starMiles[need] = true;
  S.ep += ms.ep;
  addRp(ms.rp); // v2.8.27 ②
  save(S);
  dirty.expedition = true;
  log(`星际里程碑「${ms.name}」：+${fmt(ms.rp)} RP / +${fmt(ms.ep)} EP`, 'good');
  toast(`星际里程碑「${ms.name}」达成：+${fmt(ms.rp)} RP / +${fmt(ms.ep)} EP`);
}

export function renderExpeditions(container) {
  if (!container) return;
  const now = Date.now();
  const cps = computeCps();
  // v3.4.6 反馈③：星图头部说明星际燃料 CPS 的来源与用途 + 燃料模式开关
  const fuelOn = !!S.fuelMode;
  let html = `<div style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:10px;background:var(--bg-2,#141821)">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:var(--cyan)">🛰 星际燃料（CPS）：<b class="mono">${fmt(S.starCps || 0)}</b></span>
      <button class="btn-mini" data-fuel-toggle style="margin-left:auto;cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:4px 14px;font-size:12px;${fuelOn ? 'color:var(--good,#3fb950);border-color:var(--good,#3fb950)' : 'color:var(--text-3)'}">${fuelOn ? '🔥 燃料模式 开' : '燃料模式 关'}</button>
      <span style="font-size:11px;color:var(--text-2)">${fuelOn ? `每秒 -${FUEL_BURN_PER_SEC} CPS · 全局产出 ×${FUEL_GLOBAL_MULT}（CPS 耗尽自动熄火）` : `开启后每秒 -${FUEL_BURN_PER_SEC} CPS，全局产出 ×${FUEL_GLOBAL_MULT}`}</span>
    </div>
    <div style="font-size:11px;color:var(--text-3);margin-top:4px;line-height:1.7">探索消耗 EP/RP/PT，携带出战异兽进行深空探索（每只 +10% CPS 收益）；CPS 用于升级深空殖民与宇宙探索的所有升级，也可开启燃料模式持续燃烧、作为加速发展的燃料。</div>
  </div>`;
  html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">
    派遣探测队探索星系，自动返回奖励。最多 ${maxExpeditions()} 路并行。</div>`;
  // 当前进行中
  html += `<div style="font-size:11px;color:var(--text-2);margin:8px 0 4px">进行中（${S.expeditions.length}/${maxExpeditions()}）</div>`;
  if (S.expeditions.length === 0) {
    html += `<div style="color:var(--text-3);font-size:11.5px;padding:4px 0">暂无探索任务</div>`;
  } else {
    for (const ex of S.expeditions) {
      const g = GALAXIES.find(x => x.id === ex.galaxyId);
      const pct = Math.min(100, (now - ex.startsAt) / ex.duration * 100);
      const left = Math.max(0, (ex.duration - (now - ex.startsAt)) / 1000);
      html += `<div class="proj">
        <div class="pn"><span>${g.icon || '🛰'} ${g.name}</span><span class="mono" style="color:var(--cyan)">${fmtTime(left)}后返回</span></div>
        <div class="pt"><div style="width:${pct}%;background:var(--cyan)"></div></div>
      </div>`;
    }
  }
  // 可选星系列表
  html += `<div style="font-size:11px;color:var(--text-2);margin:12px 0 4px">选择目的地</div>`;
  for (const g of GALAXIES) {
    const unlocked = cps >= g.cpsReq;
    const busy = S.expeditions.length >= maxExpeditions();
    const c = g.cost;
    const costParts = [];
    if (c.ep) costParts.push(`${fmt(c.ep)} EP`);
    if (c.rp) costParts.push(`${fmt(c.rp)} RP`);
    if (c.pt) costParts.push(`${fmt(c.pt)} PT`);
    const rewardStr = `+${fmt(expeditionCpsReward(g))} CPS${g.es ? ` + ${g.es} ES` : ''}`;
    if (!unlocked) {
      // v3.3.4 反馈②：未解锁星系按渐进披露口径显示「???」（原直接露出「月球基地/火星前哨…」等名称）
      html += `<div class="off-upg" style="opacity:.5"><span>???<br><span style="color:var(--text-3)">需 cps ${fmt(g.cpsReq)}</span></span>
        <span style="color:var(--text-3)">—</span></div>`;
    } else {
      const canAfford = (S.ep || 0) >= c.ep && (S.rp || 0) >= c.rp && (S.pt || 0) >= c.pt;
      html += `<div class="off-upg${!canAfford ? ' cant' : ''}" data-galaxy="${g.id}" style="cursor:${busy ? 'not-allowed' : 'pointer'}">
        <span>${g.name}<br><span style="color:var(--text-3)">${g.desc} · ${fmtTime(g.dur)} · 出发消耗 ${costParts.join(' + ')}</span></span>
        <span style="color:var(--cyan);text-align:right">${rewardStr}</span></div>`;
    }
  }
  html += renderColoniesHtml();
  html += renderCosmosHtml(); // v3.0.3 后续反馈④：宇宙探索（深空探测解锁）
  container.innerHTML = html;
  container.querySelectorAll('[data-cosmos]').forEach(div => {
    div.addEventListener('click', () => {
      const r = buyCosmos(div.dataset.cosmos);
      if (!r.ok) toast(r.reason);
      renderExpeditions(container);
    });
  });
  container.querySelectorAll('[data-colony]').forEach(div => {
    div.addEventListener('click', () => buyColony(div.dataset.colony));
  });
  container.querySelectorAll('[data-starmile]').forEach(div => {
    div.addEventListener('click', () => claimStarMilestone(parseInt(div.dataset.starmile, 10)));
  });
  container.querySelectorAll('[data-galaxy]').forEach(div => {
    div.addEventListener('click', () => {
      if (S.expeditions.length >= maxExpeditions()) { toast('探索队列已满'); return; }
      const g = GALAXIES.find(x => x.id === div.dataset.galaxy);
      // v3.4.6 反馈③：出发消耗 EP/RP/PT（不足则拦截，卡面已灰显）
      const c = g.cost;
      if ((S.ep || 0) < c.ep) { toast(`EP 不足（需 ${fmt(c.ep)}）`); return; }
      if ((S.rp || 0) < c.rp) { toast(`RP 不足（需 ${fmt(c.rp)}）`); return; }
      if ((S.pt || 0) < c.pt) { toast(`PT 不足（需 ${fmt(c.pt)}）`); return; }
      S.ep -= c.ep; S.rp -= c.rp; S.pt -= c.pt;
      const pets = Math.min(3, (S.activePets || []).filter(id => S.pets && S.pets[id]).length);
      S.expeditions.push({ galaxyId: g.id, startsAt: Date.now(), duration: g.dur * 1000, pets });
      log(`探索出发：${g.name}${pets > 0 ? `（携带 ${pets} 只出战异兽）` : ''}（-${fmt(c.ep)} EP${c.rp ? ` / -${fmt(c.rp)} RP` : ''}${c.pt ? ` / -${fmt(c.pt)} PT` : ''}）`, 'good');
      save(S);
      renderExpeditions(container);
    });
  });
  if (!container._fuelDelegated) {
    container._fuelDelegated = true;
    container.addEventListener('click', (ev) => {
      const t = ev.target.closest ? ev.target.closest('[data-fuel-toggle]') : null;
      if (!t) return;
      if (!S.fuelMode && (S.starCps || 0) < FUEL_BURN_PER_SEC) { toast(`星际燃料不足（需 ≥ ${FUEL_BURN_PER_SEC} CPS）`); return; }
      S.fuelMode = !S.fuelMode;
      save(S);
      log(S.fuelMode ? `燃料模式开启：每秒 -${FUEL_BURN_PER_SEC} CPS，全局产出 ×${FUEL_GLOBAL_MULT}` : '燃料模式关闭：CPS 停止燃烧，全局加成失效', S.fuelMode ? 'good' : '');
      renderExpeditions(container);
    });
  }
}

export function tickExpeditions() {
  if (S.expeditions.length === 0) return;
  const now = Date.now();
  const done = [];
  S.expeditions = S.expeditions.filter(ex => {
    if (now - ex.startsAt >= ex.duration) { done.push(ex); return false; }
    return true;
  });
  // v2.8.3 深空殖民：每殖民等级 探索收益 +10%
  const colonyLv = starColonyLevel();
  const expBonus = 1 + (BALANCE.colonyExploreBonus || 0) * colonyLv;
  for (const ex of done) {
    const g = GALAXIES.find(x => x.id === ex.galaxyId);
    if (!g) continue;
    // v3.4.6 反馈③：奖励改星际燃料 CPS（出战异兽随队 +10%/只，出发时快照在 ex.pets；
    // 旧档在途任务无 pets 字段按当前出战数计）；银河边缘/仙女座额外保留 ES 奖励
    const petN = Number.isFinite(ex.pets) ? ex.pets : Math.min(3, (S.activePets || []).filter(id => S.pets && S.pets[id]).length);
    const gain = Math.round(g.cps * (1 + 0.10 * Math.min(3, petN)) * expBonus);
    S.starCps = (S.starCps || 0) + gain;
    let msg = `探索返回：${g.name}，+${fmt(gain)} 星际燃料 CPS`;
    if (g.es) {
      S.es += g.es;
      msg += `、+${g.es} ES`;
    }
    log(msg, 'good');
    S.expeditionsDone++;
    // 深空探索有概率获得信仰
    if ((ex.galaxyId === 'edge' || ex.galaxyId === 'andromeda') && Math.random() < 0.15) {
      S.faith = (S.faith || 0) + 1;
      log('探索中感受到神意：+1 FP', 'good');
    }
    toast(`探索完成：${g.name}（+${fmt(gain)} CPS）`);
  }
}
