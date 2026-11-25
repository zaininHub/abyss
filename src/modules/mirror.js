// v2.5.0：镜像协议——「另一条时间线的你」。
//
// 三块内容按章节逐块解锁（同一个 tab，一章最多两个内容的约束下把第 7/8/9 章填满）：
//   第 7 章 镜像契约：每局签 1 份悬赏，达成条件本局全局 +20%~+30%
//   第 8 章 算力战争：本局产出的一部分被镜像截为「战功」，战功买三档永久科技
//   第 9 章 三方议会：每局选 1 席生效，三席都坐过 → 永久 +5% 全局
//
// 状态拆两层：S.mirror 跨转生（战功 / 科技 / 已试议席），S.mirrorRun 本局制（契约 / 议席 / 结算基准）。
// 本模块不 import economy.js（economy 要反向 import 本模块的乘区），格式化统一走 core/format.js。
import { S, save } from '../state.js';
import { fmt } from '../core/format.js';
import { toast } from '../core/runtime.js';
import { accessCheck } from '../core/access.js';
import { gateOpen, CHAPTER_GATES } from '../core/chapterGates.js';
import {
  MIRROR_CONTRACTS, MIRROR_WAR_TECHS, MIRROR_COUNCIL, MIRROR_COUNCIL_ALL_BONUS,
  MIRROR_MERIT_PER_EP, warTechCost,
} from '../data/mirror.js';

export function ensureMirror() {
  if (!S.mirror || typeof S.mirror !== 'object') S.mirror = { merit: 0, techs: {}, seen: {}, allSeen: false };
  if (!S.mirror.techs || typeof S.mirror.techs !== 'object') S.mirror.techs = {};
  if (!S.mirror.seen || typeof S.mirror.seen !== 'object') S.mirror.seen = {};
  if (typeof S.mirror.merit !== 'number') S.mirror.merit = 0;
  if (typeof S.mirror.allSeen !== 'boolean') S.mirror.allSeen = false;
  if (!S.mirrorRun || typeof S.mirrorRun !== 'object') {
    S.mirrorRun = { contract: null, base: 0, council: null, meritBasis: 0 };
  }
  if (typeof S.mirrorRun.meritBasis !== 'number') S.mirrorRun.meritBasis = S.runEarned || 0;
  return S.mirror;
}

/** tab 可见性：只要求章节（第 7 章）+ 已晋升，与购买权限分开。 */
export function mirrorVisible() {
  return gateOpen('mirror', S) && (S.prestige || 0) >= 1;
}
export function warUnlocked() { return gateOpen('mirrorwar', S); }
export function councilUnlocked() { return gateOpen('mirrorcouncil', S); }

export function contractDef(id) {
  return MIRROR_CONTRACTS.find((c) => c.id === id) || null;
}
/** 本局已签的契约（未签返回 null）。 */
export function activeContract() {
  ensureMirror();
  return contractDef(S.mirrorRun.contract);
}
/** 契约条件是否已达成。 */
export function contractMet() {
  const c = activeContract();
  return !!(c && c.test(S));
}
export function warLevel(id) {
  ensureMirror();
  return S.mirror.techs[id] || 0;
}
export function councilPick() {
  ensureMirror();
  return MIRROR_COUNCIL.find((c) => c.id === S.mirrorRun.council) || null;
}
export function councilAllSeen() {
  ensureMirror();
  return !!S.mirror.allSeen;
}

/** 战功获取倍率：数据虹吸 + 军功议席。 */
export function meritRateMult() {
  let m = 1;
  m *= 1 + warLevel('siphon') * 0.30;
  if (S.mirrorRun && S.mirrorRun.council === 'merit') m *= 1.30;
  return m;
}

/** 战功结算：本局产出增量按 MIRROR_MERIT_PER_EP 入账（每帧调用一次，幂等）。 */
export function syncMirrorMerit() {
  ensureMirror();
  if (!warUnlocked()) { S.mirrorRun.meritBasis = S.runEarned || 0; return; }
  const basis = typeof S.mirrorRun.meritBasis === 'number' ? S.mirrorRun.meritBasis : (S.runEarned || 0);
  const delta = (S.runEarned || 0) - basis;
  if (delta <= 0) return;
  S.mirror.merit += delta * MIRROR_MERIT_PER_EP * meritRateMult();
  S.mirrorRun.meritBasis = S.runEarned || 0;
}

/** 全局乘区（economy.globalMult 消费）。 */
export function mirrorGlobalMult() {
  ensureMirror();
  let pct = 0;
  const c = activeContract();
  if (c && c.test(S)) pct += c.pct;
  pct += warLevel('recycle') * 0.06;
  if (S.mirrorRun.council === 'output') pct += 0.10;
  if (S.mirror.allSeen) pct += MIRROR_COUNCIL_ALL_BONUS;
  return 1 + pct;
}

/** 离线效率乘区（economy.offlineEffRate 消费）。 */
export function mirrorOfflineMult() {
  ensureMirror();
  let pct = warLevel('cold') * 0.08;
  if (S.mirrorRun.council === 'offline') pct += 0.12;
  return 1 + pct;
}

/** 签契约（每局 1 份，签后不可更换；晋升清零）。 */
export function signContract(id) {
  if (!mirrorVisible()) return { ok: false, reason: '镜像尚未接入（第 7 章后）' };
  const gate = accessCheck('mirror.open', S);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  ensureMirror();
  if (S.mirrorRun.contract) return { ok: false, reason: '本局已签过契约，晋升后才会作废' };
  const def = contractDef(id);
  if (!def) return { ok: false, reason: '未知契约' };
  S.mirrorRun.contract = id;
  S.mirrorRun.base = Math.max(1, S.runEarned || 1);
  save(S);
  return { ok: true, name: def.name };
}

/** 买战争科技（战功计价，跨转生保留）。 */
export function buyWarTech(id) {
  const gate = accessCheck('mirror.tech', S);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  ensureMirror();
  const t = MIRROR_WAR_TECHS.find((x) => x.id === id);
  if (!t) return { ok: false, reason: '未知科技' };
  const lv = warLevel(id);
  if (lv >= t.cap) return { ok: false, reason: '已满级' };
  const cost = warTechCost(t, lv);
  const merit = Math.floor(S.mirror.merit || 0);
  if (merit < cost) return { ok: false, reason: `战功不足（需 ${cost}）` };
  S.mirror.merit -= cost;
  S.mirror.techs[id] = lv + 1;
  save(S);
  return { ok: true, level: lv + 1 };
}

/** 选议席（每局 1 席；三席各坐过一次 → 永久 +5%）。 */
export function chooseCouncil(id) {
  const gate = accessCheck('mirror.council', S);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  ensureMirror();
  const c = MIRROR_COUNCIL.find((x) => x.id === id);
  if (!c) return { ok: false, reason: '未知议席' };
  S.mirrorRun.council = id;
  S.mirror.seen[id] = true;
  if (!S.mirror.allSeen && MIRROR_COUNCIL.every((x) => S.mirror.seen[x.id])) {
    S.mirror.allSeen = true;
    toast('🪞 三方议会第一次坐到同一张桌子：永久 +5% 全局产出');
  }
  save(S);
  return { ok: true, name: c.name };
}

// ========== 渲染 ==========
function pctText(p) {
  return `${p >= 0 ? '+' : ''}${Math.round(p * 100)}%`;
}

function card(title, desc, body, accent) {
  return `<div class="panel" style="padding:12px;margin-bottom:10px">
    <div style="font-size:13px;color:${accent || 'var(--text)'};margin-bottom:4px">${title}</div>
    <div style="font-size:11.5px;color:var(--text-3);margin-bottom:8px">${desc}</div>
    ${body}</div>`;
}

export function renderMirror(container) {
  if (!container) return;
  ensureMirror();
  if (!mirrorVisible()) {
    container.innerHTML = `<div class="panel" style="padding:14px">
      <h3 style="margin-top:0;color:var(--dim)">🪞 镜像尚未接通</h3>
      <p style="font-size:13px;line-height:1.9;color:var(--text-2)">推进到第 ${CHAPTER_GATES.mirror} 章后，另一条时间线的你会发来第一次通讯。</p></div>`;
    return;
  }

  const merit = Math.floor(S.mirror.merit || 0);
  let html = `<div class="panel" style="padding:14px">
    <h3 style="margin-top:0;color:var(--purple)">🪞 镜像协议 <span style="font-size:12px;font-weight:400;color:var(--text-2)">战功 ${fmt(merit)} · 另一条时间线的你</span></h3>
    <p style="font-size:12px;line-height:1.8;color:var(--text-2);margin:4px 0 10px">镜像在平行线里跑着同样的深渊，只是快一步。它愿意和你做交易——用你的算力，换它那边的军备。</p>
  </div>`;

  // ① 镜像契约
  const c = activeContract();
  const met = c && c.test(S);
  let cbody;
  if (c) {
    cbody = `<div style="font-size:12.5px;color:${met ? 'var(--good,#3fb950)' : 'var(--text-2)'}">
      ${c.name} · ${c.desc} → 全局 ${pctText(c.pct)} ／ ${met ? '已达成' : '进行中'}</div>`;
  } else {
    cbody = MIRROR_CONTRACTS.map((x) => `<button class="btn" data-mirror-contract="${x.id}"
      style="display:block;width:100%;text-align:left;margin-bottom:6px;font-size:12px">
      ${x.name} <span style="color:var(--text-3)">· ${x.desc} → 全局 ${pctText(x.pct)}</span></button>`).join('');
  }
  html += card('① 镜像契约', '每局只能签一份，条件持续判定，达成即生效；晋升后作废。', cbody);

  // ② 算力战争
  if (!warUnlocked()) {
    html += card('② 算力战争', `第 ${CHAPTER_GATES.mirrorwar} 章解锁：镜像开始截取你的算力，战功可换永久军备。`, '');
  } else {
    const rows = MIRROR_WAR_TECHS.map((t) => {
      const lv = warLevel(t.id);
      const maxed = lv >= t.cap;
      const cost = warTechCost(t, lv);
      const afford = merit >= cost;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
        <span>${t.name} <span style="color:var(--text-3)">${t.desc}</span></span>
        <span class="mono" style="color:${maxed ? 'var(--text-3)' : afford ? 'var(--good,#3fb950)' : 'var(--text-2)'}">Lv ${lv}/${t.cap}</span>
        <button class="btn" data-mirror-war="${t.id}" ${maxed || !afford ? 'disabled' : ''} style="font-size:11px">
          ${maxed ? '已满级' : `-${cost} 战功`}</button>
      </div>`;
    }).join('');
    html += card('② 算力战争', '本局产出的一部分被镜像截为战功（跨转生保留）。', rows);
  }

  // ③ 三方议会
  if (!councilUnlocked()) {
    html += card('③ 三方议会', `第 ${CHAPTER_GATES.mirrorcouncil} 章解锁：三个你坐下来分算力。`, '');
  } else {
    const cur = councilPick();
    const seats = MIRROR_COUNCIL.map((x) => {
      const on = cur && cur.id === x.id;
      const seen = S.mirror.seen[x.id] ? '（已坐过）' : '';
      return `<button class="btn" data-mirror-council="${x.id}" ${on ? 'disabled' : ''}
        style="display:block;width:100%;text-align:left;margin-bottom:6px;font-size:12px">
        ${on ? '● ' : '○ '}${x.name} <span style="color:var(--text-3)">· ${x.desc}${seen}</span></button>`;
    }).join('');
    const allTip = S.mirror.allSeen
      ? `<div style="font-size:11.5px;color:var(--good,#3fb950)">三席已齐：永久 ${pctText(MIRROR_COUNCIL_ALL_BONUS)} 全局产出</div>`
      : `<div style="font-size:11.5px;color:var(--text-3)">三席各坐过一次后永久 ${pctText(MIRROR_COUNCIL_ALL_BONUS)} 全局产出</div>`;
    html += card('③ 三方议会', '每局选一席生效，晋升后可以换人。', seats + allTip);
  }

  container.innerHTML = html;
}

/** 面板事件委托入口（main.js 调用）：处理完原地重绘，不新增 dirty 键。 */
export function handleMirrorClick(e, container) {
  // 按钮内部有 <span> 子节点，点在文字上时 e.target 是 span——必须 closest 回溯到带 data-* 的按钮
  const el = e.target && e.target.closest
    ? e.target.closest('[data-mirror-contract],[data-mirror-war],[data-mirror-council]')
    : null;
  const d = (el && el.dataset) || {};
  let handled = false;
  if (d.mirrorContract) {
    const r = signContract(d.mirrorContract);
    if (!r.ok) toast(r.reason); else toast(`🪞 已签：${r.name}`);
    handled = true;
  } else if (d.mirrorWar) {
    const r = buyWarTech(d.mirrorWar);
    if (!r.ok) toast(r.reason); else toast(`算力战争科技 Lv${r.level}`);
    handled = true;
  } else if (d.mirrorCouncil) {
    const r = chooseCouncil(d.mirrorCouncil);
    if (!r.ok) toast(r.reason); else toast(`已入席：${r.name}`);
    handled = true;
  }
  if (handled) renderMirror(container || (e.currentTarget || null));
  return handled;
}
