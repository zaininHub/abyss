// v2.7.0：深渊遗物模块——科技树旁新长线栏目（DM 消费；跨转生保留；裂隙触发 + DM 发现后解锁）
import { S, save } from '../state.js';
import { fmt } from './economy.js';
import { RELICS, relicLevel, relicCost, relicMult, relicsUnlocked } from '../data/relics.js';

let logFn = null;
let toastFn = null;
export function setRelicsLogFn(fn) { logFn = fn; }
export function setRelicsToastFn(fn) { toastFn = fn; }
function rlog(msg, cls) { if (logFn) logFn(`[遗物] ${msg}`, cls); }

// 购买遗物等级（DM 消费；gate 进度门控；cap 上限）
export function buyRelic(id) {
  const r = RELICS.find(x => x.id === id);
  if (!r) return { ok: false, reason: '未知遗物' };
  if (!relicsUnlocked()) return { ok: false, reason: '遗物未解锁（需触发深渊裂隙并发现 DM）' };
  if (!r.gate()) return { ok: false, reason: '该遗物尚未苏醒（进度不足）' };
  const lv = relicLevel(id);
  if (lv >= r.cap) return { ok: false, reason: '已达遗物上限' };
  const cost = relicCost(id);
  if ((S.dm || 0) < cost) return { ok: false, reason: `深渊物质不足（需 ${fmt(cost)} DM，当前 ${fmt(S.dm || 0)}）` };
  S.dm -= cost;
  S.relics = S.relics || {};
  S.relics[id] = lv + 1;
  save(S);
  rlog(`深渊遗物「${r.name}」升至 Lv.${lv + 1}/${r.cap}（-${fmt(cost)} DM）：${r.desc.replace('%','×' + (1 + (r.id === 'tentacle' ? -1 : 1) * r.effect * (lv + 1)).toFixed(2))}`, 'good');
  if (toastFn) toastFn(`🌀 遗物「${r.name}」苏醒 Lv.${lv + 1}`);
  return { ok: true, level: lv + 1 };
}

// v2.8.22 ⑥：净化节点购买（DM，限 3 级）——与遗物同曲线 ×1.8/级
const PURIFIER_DEFS = [
  ['purifier1', '净化节点 I', 50, 0.5],
  ['purifier2', '净化节点 II', 500, 2],
  ['purifier3', '净化节点 III', 5000, 5],
];
export function buyPurifier(id) {
  const def = PURIFIER_DEFS.find(x => x[0] === id);
  if (!def) return { ok: false, reason: '未知节点' };
  const [, nm, base, rate] = def;
  const lv = (S.upgrades && S.upgrades[id]) || 0;
  if (lv >= 3) return { ok: false, reason: `${nm} 已圆满（限 3 级）` };
  const cost = Math.ceil(base * Math.pow(1.8, lv));
  if ((S.dm || 0) < cost) return { ok: false, reason: `DM 不足（需 ${fmt(cost)}）` };
  S.dm -= cost;
  S.upgrades[id] = lv + 1;
  save(S);
  rlog(`${nm} 升至 Lv.${lv + 1}/3（-${fmt(cost)} DM）· 每秒清除 ${rate}% 腐化`, 'good');
  return { ok: true };
}

// 面板渲染
export function renderRelics(container) {
  if (!container) return;
  if (!relicsUnlocked()) {
    container.innerHTML = `<div class="panel" style="padding:14px">
      <h3 style="margin-top:0;color:var(--dim)">🌀 深渊遗物未苏醒</h3>
      <p style="font-size:13px;line-height:1.9;color:var(--text-2)">触发深渊裂隙并发现深渊物质（DM）后，尘封的遗物将在此苏醒。<br>
      遗物为跨转生长线强化：以 DM 购入，永久生效（转生保留）。</p></div>`;
    return;
  }
  let html = `<div class="panel" style="padding:14px">
    <h3 style="margin-top:0;color:var(--purple)">🌀 深渊遗物 <span style="font-size:12px;font-weight:400;color:var(--text-2)">DM 购买 · 跨转生保留 · 裂隙触发后苏醒</span></h3>
    <p style="font-size:12px;line-height:1.8;color:var(--text-2);margin:4px 0 10px">以深渊物质 DM 唤醒尘封遗物，每件 5 级，费用 ×1.8/级递增。深渊物质（DM）来自载具外勤与深潜，是超长线资产。</p>`;
  // v2.8.22 ⑥：净化节点移入遗物（DM 区）——熵减协议解锁后显示，DM 购买、限购 3 级
  if ((S.tech && S.tech.entropy_reduce) || (S.upgrades && S.upgrades.purifier1)) {
    html += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text-2);margin-bottom:4px">净化节点 <span style="color:var(--text-3)">DM 购买 · 深入辅助（限 3 级）</span></div>`;
    for (const [id, nm, base, rate] of PURIFIER_DEFS) {
      const lv = (S.upgrades && S.upgrades[id]) || 0;
      const cost = Math.ceil(base * Math.pow(1.8, lv));
      const maxed = lv >= 3;
      const dmEnough = (S.dm || 0) >= cost;
      const canBuy = !maxed && dmEnough;
      html += `<div class="relic-card ${canBuy ? '' : 'relic-gated'}" data-purifier="${id}" style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin:5px 0;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="flex:1">
          <div style="font-weight:600;color:${canBuy ? 'var(--purple)' : 'var(--text-3)'}">${nm} <span style="font-size:11px;color:var(--text-2)">Lv.${lv}/3</span></div>
          <div style="font-size:12px;color:var(--text-2);margin-top:2px">每秒清除 ${rate}% 腐化${maxed ? '（已圆满）' : ''}</div>
        </div>
        <button class="btn ${canBuy ? '' : 'disabled'}" data-purifier-buy="${id}" ${canBuy ? '' : 'disabled'} title="${maxed ? '已达上限' : dmEnough ? `购买：-${fmt(cost)} DM` : `DM 不足（需 ${fmt(cost)}）`}">${maxed ? '已圆满' : `${fmt(cost)} DM`}</button>
      </div>`;
    }
    html += '</div>';
  }
  for (const r of RELICS) {
    const lv = relicLevel(r.id);
    const gateOk = r.gate();
    const maxed = lv >= r.cap;
    const cost = relicCost(r.id);
    const dmEnough = (S.dm || 0) >= cost;
    const canBuy = gateOk && !maxed && dmEnough;
    // v2.8：负向效果（混沌触须 = AI 决策间隔缩短）按 ×(1-effect·lv) 展示，避免「-10% 却显示 ×1.10 增益」语义矛盾
    const dir = r.id === 'tentacle' ? -1 : 1;
    const effNow = (1 + dir * r.effect * lv).toFixed(2);
    const effNext = gateOk && !maxed ? (1 + dir * r.effect * (lv + 1)).toFixed(2) : null;
    html += `<div class="relic-card ${gateOk ? '' : 'relic-gated'}" data-relic="${r.id}" style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin:6px 0;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="flex:1">
        <div style="font-weight:600;color:${gateOk ? 'var(--purple)' : 'var(--text-3)'}">${r.name} <span style="font-size:11px;color:var(--text-2)">Lv.${lv}/${r.cap}</span></div>
        <div style="font-size:12px;color:var(--text-2);margin-top:2px">${r.desc}（当前 ×${effNow}${effNext ? ` → ×${effNext}` : ''}）</div>
        ${gateOk ? '' : `<div style="font-size:11px;color:var(--text-3);margin-top:2px">未苏醒：需 ${r.gateHint || '更深层深渊进度'}</div>`}
      </div>
      <button class="btn ${canBuy ? '' : 'disabled'}" data-relic-buy="${r.id}" ${canBuy ? '' : 'disabled'} title="${canBuy ? `唤醒：-${fmt(cost)} DM` : maxed ? '已达上限' : !gateOk ? '进度不足' : `DM 不足（需 ${fmt(cost)}）`}">${maxed ? '已圆满' : `${fmt(cost)} DM`}</button>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}
