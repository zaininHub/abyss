// v4.2.X：轮回已移除——原「深度轮回」的回响商店与深渊遗存展示迁移至此。
// 回响现在由每次晋升结算获得（见 prestige.js 的 prestigeEchoGain），遗物传承同样并入晋升。
// 本模块只负责「消费回响的永久升级」和「遗存图鉴展示」，不再有任何轮回流程。
import { S, save } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { toast, dirty } from '../core/runtime.js';

export function echoUpgradeCost(id) {
  const u = (BALANCE.reincarn.upgs || []).find(x => x.id === id);
  if (!u) return 0;
  const lv = (S.echoUpgrades && S.echoUpgrades[id]) || 0;
  return Math.ceil(BALANCE.reincarn.upgBase * Math.pow(BALANCE.reincarn.upgGrowth, lv));
}
export function buyEchoUpgrade(id) {
  const u = (BALANCE.reincarn.upgs || []).find(x => x.id === id);
  if (!u) return { ok: false, reason: '未知升级' };
  const lv = (S.echoUpgrades && S.echoUpgrades[id]) || 0;
  if (lv >= u.cap) return { ok: false, reason: '已满级' };
  const cost = echoUpgradeCost(id);
  if ((S.abyssEcho || 0) < cost) return { ok: false, reason: `回响不足（需 ${cost}）` };
  S.abyssEcho -= cost;
  S.echoUpgrades = S.echoUpgrades || {};
  S.echoUpgrades[id] = lv + 1;
  save(S);
  return { ok: true, level: lv + 1 };
}

// 遗存图鉴（只读展示，传承发放在 prestige.js）
function legacyHtml() {
  return (BALANCE.reincarn.legacy || []).map(L => {
    const lv = (S.relicLegacy && S.relicLegacy[L.id]) || 0;
    const needHint = lv > 0 ? '' : (L.needKey === 'delve' ? ` · 需深潜 ≥ ${L.need} 层`
      : L.needKey === 'colony' ? ` · 需异兽 ≥ ${L.need} 只`
      : L.needKey === 'rift' ? ` · 需裂隙余烬 ≥ ${L.need}` : '');
    return `<div style="display:flex;justify-content:space-between;font-size:11px;color:${lv > 0 ? 'var(--good,#3fb950)' : 'var(--text-3)'}">
      <span>${L.name} ${lv > 0 ? '×' + lv : ''}<span style="opacity:.75"> · ${L.desc}</span><span style="opacity:.7;color:var(--text-2)">${needHint}</span></span>
      <span class="mono">${lv}/${BALANCE.reincarn.legacyCap}</span></div>`;
  }).join('');
}

// 回响商店（晋升面板内嵌区块）——内容签名去重，避免 hover 期间节点被重建。
export function renderEchoShop(container) {
  if (!container) return;
  let html = `<div class="echo-shop-block" style="margin-top:14px;border-top:1px dashed var(--border);padding-top:10px">
    <div style="font-size:11px;color:var(--text-2);margin-bottom:4px">深渊回响 <b style="color:var(--accent)">${S.abyssEcho || 0}</b> · 每点全局 +${(BALANCE.reincarn.echoPerPoint * 100).toFixed(0)}%（晋升时结算，跨晋升保留）</div>
    <div style="font-size:11px;color:var(--text-2)">深渊遗存（晋升时按本局最强维度传承 +1 座）</div>
    <div id="echo-legacy-list" style="display:flex;flex-direction:column;gap:6px;margin:6px 0 12px">${legacyHtml()}</div>
    <div style="font-size:11px;color:var(--text-2)">回响商店（永久升级，跨晋升保留）</div>
    <div id="echo-upg-list" style="display:flex;flex-direction:column;gap:6px;margin-top:6px">`;
  for (const u of (BALANCE.reincarn.upgs || [])) {
    const lv = (S.echoUpgrades && S.echoUpgrades[u.id]) || 0;
    const cost = echoUpgradeCost(u.id);
    const maxed = lv >= u.cap;
    const afford = (S.abyssEcho || 0) >= cost;
    html += `<div class="echo-upg ${maxed ? 'maxed' : ''}" data-echo-upg="${u.id}" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border:1px solid ${maxed ? 'var(--border)' : afford ? 'var(--good)' : 'var(--border)'};border-radius:8px;background:rgba(255,255,255,.03);cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text-1)">${u.name} <span style="color:var(--text-3);font-size:10px">Lv.${lv}/${u.cap}</span></div>
        <div style="font-size:10px;color:var(--text-2);margin-top:2px">${u.desc}</div>
      </div>
      <div style="flex-shrink:0;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:${maxed ? 'rgba(139,148,158,.15)' : afford ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.12)'};color:${maxed ? 'var(--text-3)' : afford ? 'var(--good,#3fb950)' : 'var(--bad,#f85149)'}">${maxed ? '已满级' : cost + ' 回响'}</div>
    </div>`;
  }
  html += '</div></div>';
  if (container._lastHtml === html) return;
  container._lastHtml = html;
  container.innerHTML = html;
  container.querySelectorAll('[data-echo-upg]').forEach(el => {
    el.addEventListener('click', () => {
      const r = buyEchoUpgrade(el.dataset.echoUpg);
      if (r.ok) { if (toast) toast('回响升级成功'); dirty.top = true; renderEchoShop(container); }
      else if (toast) toast(r.reason);
    });
  });
}
