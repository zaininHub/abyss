import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { computeCps, fmt, fmtTime, hasTech, addEp, addRp, addDm, addPt, unitCost, researchMult } from './economy.js';
import { log, toast, dirty } from '../core/runtime.js'; // v3.0.0 测试性解耦：侧效工具下沉到 DOM 无关的 core
import { renderCosmosHtml, buyCosmos, COSMOS, cosmosCost, cosmosLv } from './cosmos.js'; // v3.0.3 后续反馈④：宇宙探索大模块
import { progressBar, panelShell } from '../ui/widgets.js'; // v3.6.1 抽出共性 UI 构件（进度条/面板壳）
import { fmtLongDuration, fmtMultDelta } from '../core/format.js';
import { starChartUnlocked } from './disclosure.js'; // v3.12.9：深空殖民与星图 tab 同源（宠物在前） // v3.12.0 反馈⑮：倍率 → 带符号百分比
export { fmtLongDuration }; // 保留原有导出路径，外部模块无需改动

// v3.6.0 方向⑤⑧：星际探索重构——
//   出发消耗 EP 起步 M 量级、按数量级递增（1e6 → 1e11），时间按「天」计（1/2/4/7/14/30 天）；
//   每个星系可单独「建立殖民地」：殖民后该星系探索消耗 ×0.1（降一数量级）、时间 ÷24（天→小时）；
//   跃迁（相对论）：researchMult('jump') 提供跃迁效率，缩短航行时间（c 为光速硬约束，见 BALANCE.jump）；
//   按星球区分探索，每个星系归属一个星系群（BALANCE.starRes.groups），返回该群专属星际资源
//   （stardust/voidmite/dmite/plasma/exo），researchMult('starres') 提升专属资源产出。
export const GALAXIES = [
  { id: 'moon',      name: '月球基地',   icon: '🌙', group: 'g6', durDays: 1,  cpsReq: 0,    cost: { ep: 1e6,  rp: 1e5,  pt: 8e4 },   cps: 2,    res: ['stardust', 'exo'],     resBase: 20,   colonyCps: 200,   colonyRp: 0.1,  desc: '近地深空前哨' },
  { id: 'mars',      name: '火星前哨',   icon: '🔴', group: 'g1', durDays: 2,  cpsReq: 100,  cost: { ep: 1e7,  rp: 1e6,  pt: 8e5 },   cps: 10,   res: ['stardust', 'voidmite'], resBase: 60, colonyCps: 1500,  colonyRp: 0.5,  desc: '红色行星采样' },
  { id: 'jupiter',   name: '木星轨道',   icon: '🪐', group: 'g4', durDays: 4,  cpsReq: 1e3,  cost: { ep: 1e8,  rp: 1e7,  pt: 8e6 },   cps: 40,   res: ['voidmite', 'dmite'],  resBase: 200, colonyCps: 1.2e4, colonyRp: 2,    desc: '气态巨行星勘探' },
  { id: 'centauri',  name: '半人马座',   icon: '⭐', group: 'g2', durDays: 7,  cpsReq: 1e5,  cost: { ep: 1e9,  rp: 1e8,  pt: 8e7 },   cps: 200,  res: ['dmite', 'plasma'],   resBase: 600, colonyCps: 1e5,   colonyRp: 10,   desc: '恒星际远航' },
  { id: 'edge',      name: '银河边缘',   icon: '🌌', group: 'g3', durDays: 14, cpsReq: 1e6,  cost: { ep: 1e10, rp: 1e9,  pt: 8e8 },   cps: 800,  es: 2,  res: ['exo', 'stardust'], resBase: 2000, colonyCps: 8e5, colonyRp: 50, desc: '银河边缘 · 额外 ES' },
  { id: 'andromeda', name: '仙女座',     icon: '🌠', group: 'g5', durDays: 30, cpsReq: 1e8,  cost: { ep: 1e11, rp: 1e10, pt: 8e9 },   cps: 3000, es: 10, res: ['plasma', 'exo'],  resBase: 8000, colonyCps: 6e6, colonyRp: 300, desc: '河外远征 · 丰厚 ES' },
];

export const FUEL_BURN_PER_SEC = 2;   // 燃料模式：每秒燃烧 CPS
export const FUEL_GLOBAL_MULT = 1.5;  // 燃料模式：全局产出 ×1.5（globalMult 接线）

// v3.6.0 方向⑤⑧：跃迁（相对论）效率——researchMult('jump') 由研究点「跃迁理论」提供（+6%/级），缩短航行时间
export function jumpMult() { return researchMult('jump'); }
// v3.6.0 方向⑧：星际专属资源产出倍率——researchMult('starres') 由研究点「星蕴提纯」提供（+6%/级）
export function starResMult() { return researchMult('starres'); }
export function isColonized(gid) { return !!(S.colonies && S.colonies[gid]); }

// 殖民后探索消耗 ×colonizeDiscount（降一数量级），未殖民则原价
export function galaxyCost(g) {
  const disc = isColonized(g.id) ? (BALANCE.jump.colonizeDiscount) : 1;
  return {
    ep: Math.round((g.cost.ep || 0) * disc),
    rp: Math.round((g.cost.rp || 0) * disc),
    pt: Math.round((g.cost.pt || 0) * disc),
  };
}
// 航行时间（秒）：durDays(天) × 86400 ÷ 跃迁效率；殖民后 ÷colonizeTimeDiv（天→小时）
// 注意：面板/日志面向玩家用秒；S.expeditions[].duration 内部必须 ×1000 转毫秒（Date.now() 同口径）。
export function galaxyDur(g) {
  const div = isColonized(g.id) ? (BALANCE.jump.colonizeTimeDiv) : 1;
  return (g.durDays * 86400) / (jumpMult() * div);
}
// v3.10.2：fmtLongDuration 已下沉 core/format.js，本文件顶部 import 后 re-export。

export function petCpsBonus() {
  // 出战异兽随队加成：每只 +10%（出战位上限 3）
  const n = Math.min(3, (S.activePets || []).filter(id => S.pets && S.pets[id]).length);
  return 1 + 0.10 * n;
}
export function expeditionCpsReward(g) {
  const colonyBonus = 1 + (BALANCE.colonyExploreBonus || 0) * starColonyLevel();
  return Math.round(g.cps * petCpsBonus() * colonyBonus * researchMult('expedition')); // v3.12.0 反馈⑩：远征后勤
}
// v3.6.0 方向⑧：专属星际资源奖励——每个星系按其群产出 2 种专属资源，受星蕴提纯加成与随队加成
export function expeditionResReward(g) {
  const m = starResMult() * petCpsBonus() * researchMult('expedition'); // v3.12.0 反馈⑩：远征后勤
  return g.res.map(key => ({ key, n: Math.round(g.resBase * m) }));
}
export function starResLabel(key) { return (BALANCE.starRes && BALANCE.starRes.labels && BALANCE.starRes.labels[key]) || key; }
export function starResAmount(key) { return (S.starRes && S.starRes[key]) || 0; }
export function addStarRes(key, n) { S.starRes = S.starRes || {}; S.starRes[key] = (S.starRes[key] || 0) + n; }

// ===== v3.6.0 方向⑧：跃迁引擎（狭义相对论） =====
// β = v/c：基础 0.6c，研究「跃迁理论」每级 +5%c，硬顶 0.99c（光速不可超越）。
// γ = 1/√(1-β²) 洛伦兹因子：高速飞船自身固有时变慢，玩家等待的剩余航行时间按 1/γ 压缩。
// 跃迁以该星系所属星系群的专属资源为燃料——专属资源至此形成「探索产出 → 跃迁加速」闭环。
export function jumpBeta() {
  const J = BALANCE.jump;
  const lv = (S.rpTheories && S.rpTheories.rp_jump) || 0;
  return Math.min(0.99, (J.baseSpeed || 0.6) + (J.speedPerLevel || 0.05) * lv);
}
export function jumpGamma() { const b = jumpBeta(); return 1 / Math.sqrt(1 - b * b); }
export function jumpSpeedKmS() { return Math.round(jumpBeta() * (BALANCE.jump.c || 299792.458)); }
export function warpCost(g) {
  const uses = S.jumpUses || 0;
  return Math.ceil((g.resBase || 20) * 0.5 * Math.pow(1.35, uses));
}
export function warpExpedition(idx) {
  const ex = S.expeditions[idx];
  if (!ex) return { ok: false, reason: '该探索任务已不存在' };
  const g = GALAXIES.find(x => x.id === ex.galaxyId);
  if (!g) return { ok: false, reason: '未知星系' };
  const key = g.res[0];
  const cost = warpCost(g);
  if (starResAmount(key) < cost) return { ok: false, reason: `${starResLabel(key)}不足（需 ${fmt(cost)}）` };
  const gamma = jumpGamma();
  const now = Date.now();
  const left = Math.max(0, ex.duration - (now - ex.startsAt));
  if (left <= 1000) return { ok: false, reason: '即将返航，无需跃迁' };
  const newLeft = Math.max(1000, left / gamma);
  S.starRes[key] -= cost;
  S.jumpUses = (S.jumpUses || 0) + 1;
  ex.startsAt = now - (ex.duration - newLeft); // 等效提前出发 → 剩余等待缩短
  save(S);
  dirty.expedition = true;
  log(`⚡ 跃迁引擎启动：${g.name} β=${jumpBeta().toFixed(2)}c / γ=${gamma.toFixed(2)}，剩余航程 ${fmtLongDuration(left / 1000)} → ${fmtLongDuration(newLeft / 1000)}（-${fmt(cost)} ${starResLabel(key)}）`, 'good');
  toast(`⚡ 跃迁完成：${g.name} 剩余时间压缩至 ${Math.round(100 / gamma)}%`);
  return { ok: true };
}

export function maxExpeditions() { return hasTech('deep_space') ? 2 : 1; }

// v3.12.7 ⑦：深空殖民按星系逐级开放——必须「该星系探索回来过」才出现殖民项。
//   计数落 S.galaxyDone（跨本局保留，与 S.colonies 同寿命），旧档缺失按 0 处理。
export function galaxyDone(id) { return (S.galaxyDone && S.galaxyDone[id]) || 0; }
function markGalaxyDone(id) {
  S.galaxyDone = S.galaxyDone || {};
  S.galaxyDone[id] = (S.galaxyDone[id] || 0) + 1;
}

// ===== v3.6.0 方向⑤⑧：深空殖民改为「按星系建立殖民地」 =====
export function starColonyLevel() {
  // 殖民总级数 = 已建立殖民地数量（驱动探索收益加成与星际里程碑）
  return Object.values(S.colonies || {}).filter(Boolean).length;
}
export function starColoniesUnlocked() { return starChartUnlocked(S) && hasTech('deep_space'); }
export function colonyRpPerSec() {
  let rp = 0;
  for (const g of GALAXIES) if (isColonized(g.id)) rp += g.colonyRp * researchMult('colony'); // v3.6.0 方向⑤：rp_colony2（星殖民拓）提升殖民 RP 产出 +8%/级
  return rp;
}
export function tickColonies(dt) {
  const rp = colonyRpPerSec();
  if (rp > 0) addRp(rp * dt); // v2.8.27 ②：RP 上限
}
function colonize(g) {
  if (!starColoniesUnlocked()) { toast('深空殖民未解锁（需科技「深空探测」）'); return; }
  if (isColonized(g.id)) return;
  const cost = g.colonyCps;
  if ((S.starCps || 0) < cost) { toast(`星际燃料 CPS 不足（需 ${fmt(cost)}）`); return; }
  S.starCps -= cost;
  S.colonies = S.colonies || {};
  S.colonies[g.id] = true;
  save(S);
  dirty.expedition = true;
  log(`建立殖民地：${g.name}（-${fmt(cost)} CPS → 探索消耗 ×${BALANCE.jump.colonizeDiscount}、时间 ÷${BALANCE.jump.colonizeTimeDiv}、+${g.colonyRp} RP/s）`, 'good');
  toast(`🛸 ${g.name} 殖民地已建立`);
}

// v3.6.0 方向⑨：供 AI 助手自动殖民调用——建立当前最便宜可负担的未殖民星系
export function aiBuyCheapestColony() {
  if (!starColoniesUnlocked()) return false;
  // v3.12.7 ⑦：只买「已探索过」的星系（与面板可见口径同源），避免 AI 抢先殖民玩家还没去过的星
  const avail = GALAXIES.filter(g => !isColonized(g.id) && galaxyDone(g.id) > 0);
  if (!avail.length) return false;
  const best = avail.slice().sort((a, b) => a.colonyCps - b.colonyCps)[0];
  if ((S.starCps || 0) >= best.colonyCps) { colonize(best); return true; }
  return false;
}

// v3.0.5 反馈②：星图面板（深空殖民 / 宇宙探索）可购态快刷——只切 cant，不重建 DOM
export function refreshExpeditionAffordability() {
  const panel = document.getElementById('expedition-panel');
  if (!panel) return;
  // v3.12.7 ⑥：目的地行同样只切 cant（已解锁但 EP/RP/PT 不够 → 灰显）
  for (const el of panel.querySelectorAll('[data-galaxy]')) {
    const g = GALAXIES.find(x => x.id === el.dataset.galaxy);
    if (!g) continue;
    const c = galaxyCost(g);
    const ok = (S.ep || 0) >= c.ep && (S.rp || 0) >= c.rp && (S.pt || 0) >= c.pt;
    el.classList.toggle('cant', !ok);
    el.style.cursor = ok ? 'pointer' : 'not-allowed';
  }
  for (const el of panel.querySelectorAll('[data-colonize]')) {
    const g = GALAXIES.find(x => x.id === el.dataset.colonize);
    if (!g || isColonized(g.id)) continue;
    el.classList.toggle('cant', (S.starCps || 0) < g.colonyCps);
  }
  for (const el of panel.querySelectorAll('[data-cosmos]')) {
    const p = COSMOS[el.dataset.cosmos];
    if (!p) continue;
    const lv = cosmosLv(p.id);
    if (lv >= p.cap) continue;
    el.classList.toggle('cant', (S.starCps || 0) < cosmosCost(p, lv));
  }
}
function renderColoniesHtml() {
  // v3.12.7 ⑦：未购「深空探测」时整块不渲染（不再输出锁定说明）；解锁后也只列
  //   「已经探索回来过」的星系——没探索过的星系连殖民入口都不出现。
  if (!starColoniesUnlocked()) return '';
  const rows = GALAXIES.filter(g => isColonized(g.id) || galaxyDone(g.id) > 0);
  if (!rows.length) return '';
  const bonus = (BALANCE.colonyExploreBonus || 0) * starColonyLevel();
  let html = `<div style="margin-top:14px;border-top:1px solid var(--line, rgba(255,255,255,.08));padding-top:10px">
    <div style="color:var(--purple);font-size:12px;font-weight:600;margin-bottom:4px">🛸 深空殖民 <span style="color:var(--text-2);font-weight:400;font-size:11px">（已殖民 ${starColonyLevel()} 个星系 · 探索收益 +${Math.round(bonus * 100)}% · 消耗星际燃料 CPS）</span></div>`;
  for (const g of rows) {
    const colonized = isColonized(g.id);
    const cost = g.colonyCps;
    html += `<div class="off-upg${!colonized && (S.starCps || 0) < cost ? ' cant' : ''}" data-colonize="${g.id}" style="${colonized ? 'opacity:.55' : ''}">
      <span>${g.icon} ${g.name} 殖民地<br><span style="color:var(--text-3);font-size:10.5px">${
        colonized
          ? `已殖民 · +${g.colonyRp} RP/s · 探索消耗 ×${BALANCE.jump.colonizeDiscount} / 时间 ÷${BALANCE.jump.colonizeTimeDiv}`
          : `建立消耗 ${fmt(cost)} CPS · 解锁后探索消耗 ×${BALANCE.jump.colonizeDiscount}、时间 ÷${BALANCE.jump.colonizeTimeDiv}`
      }</span></span>
      <span style="color:var(--cyan)">${colonized ? '✓' : '建立'}</span></div>`;
  }
  return html + `</div>`;
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
      <span style="font-size:11px;color:var(--text-2)">${fuelOn ? `每秒 -${FUEL_BURN_PER_SEC} CPS · 全局产出 ${fmtMultDelta(FUEL_GLOBAL_MULT)}（CPS 耗尽自动熄火）` : `开启后每秒 -${FUEL_BURN_PER_SEC} CPS，全局产出 ${fmtMultDelta(FUEL_GLOBAL_MULT)}`}</span>
    </div>
    <div style="font-size:11px;color:var(--text-3);margin-top:4px;line-height:1.7">探索消耗 EP/RP/PT，携带出战异兽进行深空探索（每只 +10% CPS 与专属资源收益）；CPS 用于升级深空殖民与宇宙探索的所有升级，也可开启燃料模式持续燃烧、作为加速发展的燃料。</div>
  </div>`;
  html += `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">
    派遣探测队探索星系，自动返回奖励。最多 ${maxExpeditions()} 路并行。</div>`;
  // v3.6.0 方向⑧：跃迁引擎状态（狭义相对论）+ 星系分组 / 专属资源库存
  const beta = jumpBeta(), gamma = jumpGamma();
  html += `<div style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:10px;background:var(--bg-2,#141821)">
    <div style="font-size:12.5px;color:var(--cyan);font-weight:600">⚡ 跃迁引擎 · 相对论航法</div>
    <div style="font-size:11px;color:var(--text-2);line-height:1.8;margin-top:4px">
      巡航速度 <b class="mono">${beta.toFixed(2)}c</b>（约 ${fmt(jumpSpeedKmS())} km/s，光速硬上限 ${fmt(BALANCE.jump.c)} km/s） · 洛伦兹因子 γ = <b class="mono">${gamma.toFixed(2)}</b> · 跃迁将在途剩余时间压缩至 <b class="mono">${Math.round(100 / gamma)}%</b><br>
      研究「跃迁理论」每级 +${Math.round((BALANCE.jump.speedPerLevel || 0.05) * 100)}%c（β 硬顶 0.99c，光速不可超越）；跃迁以目标星系群的专属资源为燃料，次数越多越贵。
    </div></div>`;
  html += panelShell({
    // v3.12.7 ⑨：标题只留「星系分组」——「专属资源库存」这个说法既拗口又和下面每张卡的
    //   数值重复，去掉后卡片自解释（群名 / 归属星球 / 该群资源余额）。
    title: '🌌 星系分组', cls: 'star-res',
    body: (() => {
      let rows = '';
      for (const grp of (BALANCE.starRes.groups || [])) {
        const worlds = GALAXIES.filter(x => x.group === grp.id).map(x => x.icon + x.name).join('、') || '—';
        const inv = grp.res.map(k => `${starResLabel(k)} ${fmt(starResAmount(k))}`).join(' / ');
        rows += `<div style="border:1px solid var(--border);border-radius:5px;padding:5px 8px;font-size:10.5px;min-width:150px">
      <b style="color:var(--purple)">${grp.name}</b><br><span style="color:var(--text-3)">${worlds}</span><br><span style="color:var(--cyan)">${inv}</span></div>`;
      }
      return `<div style="display:flex;flex-wrap:wrap;gap:6px">${rows}</div>`;
    })(),
  });
  // 当前进行中
  html += `<div style="font-size:11px;color:var(--text-2);margin:8px 0 4px">进行中（${S.expeditions.length}/${maxExpeditions()}）</div>`;
  if (S.expeditions.length === 0) {
    html += `<div style="color:var(--text-3);font-size:11.5px;padding:4px 0">暂无探索任务</div>`;
  } else {
    for (let idx = 0; idx < S.expeditions.length; idx++) {
      const ex = S.expeditions[idx];
      const g = GALAXIES.find(x => x.id === ex.galaxyId) || GALAXIES[0];
      const pct = Math.min(100, (now - ex.startsAt) / ex.duration * 100);
      const left = Math.max(0, (ex.duration - (now - ex.startsAt)) / 1000);
      const wc = warpCost(g), wkey = g.res[0];
      const canWarp = starResAmount(wkey) >= wc && left > 1;
      html += `<div class="proj">
        <div class="pn"><span>${g.icon || '🛰'} ${g.name}</span><span class="mono" style="color:var(--cyan)">${fmtLongDuration(left)}后返回</span></div>
        ${progressBar(pct, 'var(--cyan)')}
        <div style="margin-top:5px"><button class="btn-mini" data-warp="${idx}" style="cursor:pointer;border:1px solid var(--border);border-radius:4px;padding:3px 10px;font-size:10.5px;${canWarp ? 'color:var(--cyan)' : 'opacity:.45;color:var(--text-3)'}">⚡ 跃迁加速（${fmt(wc)} ${starResLabel(wkey)} · 剩余 ×${Math.round(100 / gamma)}%）</button></div>
      </div>`;
    }
  }
  // 可选星系列表（按星球区分；殖民后消耗/时间优化）
  // v3.12.7 ⑥：未达 CPS 门槛的星系整行不渲染（原来排成一片「??? 需 cps X」），
  //   已解锁但资源不够的保留行 + cant 灰显，让玩家知道「差在哪」而不是「看不见」。
  html += `<div style="font-size:11px;color:var(--text-2);margin:12px 0 4px">选择目的地</div>`;
  for (const g of GALAXIES) {
    if (cps < g.cpsReq) continue;
    const busy = S.expeditions.length >= maxExpeditions();
    const c = galaxyCost(g);
    const dur = galaxyDur(g);
    const costParts = [];
    if (c.ep) costParts.push(`${fmt(c.ep)} EP`);
    if (c.rp) costParts.push(`${fmt(c.rp)} RP`);
    if (c.pt) costParts.push(`${fmt(c.pt)} PT`);
    const colonized = isColonized(g.id);
    const resStr = g.res.map(k => `${starResLabel(k)}×${fmt(Math.round(g.resBase * starResMult() * petCpsBonus()))}`).join(' / ');
    const rewardStr = `+${fmt(expeditionCpsReward(g))} CPS${g.es ? ` + ${g.es} ES` : ''}<br><span style="font-size:10.5px;color:var(--purple)">专属：${resStr}</span>`;
    const canAfford = (S.ep || 0) >= c.ep && (S.rp || 0) >= c.rp && (S.pt || 0) >= c.pt;
    html += `<div class="off-upg${!canAfford ? ' cant' : ''}" data-galaxy="${g.id}" style="cursor:${busy || !canAfford ? 'not-allowed' : 'pointer'}">
      <span>${g.icon} ${g.name}${colonized ? ' · 🏴 已殖民' : ''}${galaxyDone(g.id) > 0 ? ` · 已探索 ${galaxyDone(g.id)} 次` : ''}<br><span style="color:var(--text-3)">${g.desc} · ${fmtLongDuration(dur)} · 出发消耗 ${costParts.join(' + ')}</span></span>
      <span style="color:var(--cyan);text-align:right">${rewardStr}</span></div>`;
  }
  html += renderColoniesHtml();
  html += renderCosmosHtml(); // v3.0.3 后续反馈④：宇宙探索（深空探测解锁）
  container.innerHTML = html;
  container.querySelectorAll('[data-warp]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = warpExpedition(parseInt(btn.dataset.warp, 10));
      if (!r.ok) toast(r.reason);
      renderExpeditions(container);
    });
  });
  container.querySelectorAll('[data-cosmos]').forEach(div => {
    div.addEventListener('click', () => {
      const r = buyCosmos(div.dataset.cosmos);
      if (!r.ok) toast(r.reason);
      renderExpeditions(container);
    });
  });
  container.querySelectorAll('[data-colonize]').forEach(div => {
    div.addEventListener('click', () => { colonize(GALAXIES.find(x => x.id === div.dataset.colonize)); renderExpeditions(container); });
  });
  container.querySelectorAll('[data-galaxy]').forEach(div => {
    div.addEventListener('click', () => {
      if (S.expeditions.length >= maxExpeditions()) { toast('探索队列已满'); return; }
      const g = GALAXIES.find(x => x.id === div.dataset.galaxy);
      const c = galaxyCost(g);
      if ((S.ep || 0) < c.ep) { toast(`EP 不足（需 ${fmt(c.ep)}）`); return; }
      if ((S.rp || 0) < c.rp) { toast(`RP 不足（需 ${fmt(c.rp)}）`); return; }
      if ((S.pt || 0) < c.pt) { toast(`PT 不足（需 ${fmt(c.pt)}）`); return; }
      S.ep -= c.ep; S.rp -= c.rp; S.pt -= c.pt;
      const pets = Math.min(3, (S.activePets || []).filter(id => S.pets && S.pets[id]).length);
      S.expeditions.push({ galaxyId: g.id, startsAt: Date.now(), duration: galaxyDur(g) * 1000, pets });
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
      log(S.fuelMode ? `燃料模式开启：每秒 -${FUEL_BURN_PER_SEC} CPS，全局产出 ${fmtMultDelta(FUEL_GLOBAL_MULT)}` : '燃料模式关闭：CPS 停止燃烧，全局加成失效', S.fuelMode ? 'good' : '');
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
    // v3.6.0 方向⑧：按星系群返回专属星际资源
    const res = expeditionResReward(g);
    for (const r of res) {
      addStarRes(r.key, r.n);
      msg += `、+${fmt(r.n)} ${starResLabel(r.key)}`;
    }
    log(msg, 'good');
    S.expeditionsDone++;
    markGalaxyDone(g.id); // v3.12.7 ⑦：该星系探索过 → 深空殖民入口解锁
    // 深空探索有概率获得信仰
    if ((ex.galaxyId === 'edge' || ex.galaxyId === 'andromeda') && Math.random() < 0.15) {
      S.faith = (S.faith || 0) + 1;
      log('探索中感受到神意：+1 FP', 'good');
    }
    toast(`探索完成：${g.name}（+${fmt(gain)} CPS）`);
  }
}
