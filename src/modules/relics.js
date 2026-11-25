// v2.7.0：深渊遗物模块——科技树旁新长线栏目（DM 消费；跨转生保留；裂隙触发 + DM 发现后解锁）
import { S, save } from '../state.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：倍率 → 带符号百分比
import { fmt } from './economy.js';
import { RELICS, PURIFIER_DEFS, relicLevel, relicCost, relicMult, relicsUnlocked } from '../data/relics.js'; // v2.8.0：净化节点定义下沉 data 层（AI 也要读价）
import { accessCheck } from '../core/access.js';
import { relicsTabOpen } from '../core/unlocks.js'; // v2.4.0：tab 可见性（章节 ∧ 裂隙）与购买权限分离

let logFn = null;
let toastFn = null;
export function setRelicsLogFn(fn) { logFn = fn; }
export function setRelicsToastFn(fn) { toastFn = fn; }
function rlog(msg, cls) { if (logFn) logFn(`[遗物] ${msg}`, cls); }

// 购买遗物等级（DM 消费；gate 进度门控；cap 上限）
export function buyRelic(id) {
  const r = RELICS.find(x => x.id === id);
  if (!r) return { ok: false, reason: '未知遗物' };
  // v2.3.0：权限判定与 UI 锁定卡同源（core/access.js 的 'relic.buy'）。
  const gate = accessCheck('relic.buy', S);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!r.gate()) return { ok: false, reason: '该遗物尚未苏醒（进度不足）' };
  const lv = relicLevel(id);
  if (lv >= r.cap) return { ok: false, reason: '已达遗物上限' };
  const cost = relicCost(id);
  if ((S.dm || 0) < cost) return { ok: false, reason: `深渊物质不足（需 ${fmt(cost)} DM，当前 ${fmt(S.dm || 0)}）` };
  S.dm -= cost;
  S.relics = S.relics || {};
  S.relics[id] = lv + 1;
  save(S);
  if (toastFn) toastFn(`🌀 遗物「${r.name}」苏醒 Lv.${lv + 1}`);
  return { ok: true, level: lv + 1 };
}

// v2.8.22 ⑥：净化节点购买（DM，限 3 级）——定义已下沉 data 层（v2.8.0）
export function buyPurifier(id) {
  // v2.3.0 补齐缺口：净化节点此前只靠渲染层拦（遗物面板隐藏），console/AI 可直调绕过。
  const gate = accessCheck('purifier.buy', S);
  if (!gate.ok) return { ok: false, reason: gate.reason };
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

// v3.12.6 ⑤：净化节点族可见性——熵减协议研究过 / 已购过任一节点，都记为「见过」并跨局保留
function purifierFamilySeen() {
  if (S._purifierSeen) return true;
  const seen = !!((S.tech && S.tech.entropy_reduce) || (S.upgrades && S.upgrades.purifier1));
  if (seen) S._purifierSeen = true;
  return seen;
}

// 面板渲染
export function renderRelics(container) {
  if (!container) return;
  // v4.2.5 反馈①：index.html 新增静态「深渊遗物」h3 在本面板之前——它是「深渊商店」
  // 折叠的边界（foldSiblings 遇 h3 即停），也统一了遗物分区的类目标题观感；
  // 标题恒显示（未解锁时面板渲染引导卡，标题与卡片语义一致），本函数不触碰其 display。
  // v2.4.0 反馈②：入口与购买权限分层——
  //   tab 可见性 = 章节 ∧ 裂隙（探采平台住这里，必须早点进得来）；
  //   遗物卡 = 额外要求 DM 已发现（accessCheck('relic.buy')），没 DM 时给「去哪挣 DM」的引导，不整块消失。
  if (!relicsTabOpen(S)) {
    container.innerHTML = `<div class="panel" style="padding:14px">
      <h3 style="margin-top:0;color:var(--dim)">🌀 深渊遗物未苏醒</h3>
      <p style="font-size:13px;line-height:1.9;color:var(--text-2)">触发深渊裂隙后，尘封的遗物将在此苏醒。<br>
      遗物为跨转生长线强化：以 DM 购入，永久生效（转生保留）。</p></div>`;
    return;
  }
  if (!relicsUnlocked()) {
    container.innerHTML = `<div class="panel" style="padding:14px">
      <h3 style="margin-top:0;color:var(--dim)">🌀 深渊遗物 · 待冥合</h3>
      <p style="font-size:13px;line-height:1.9;color:var(--text-2)">遗物要吸收深渊物质（DM）才会醒来，而你还没有见过 DM。<br>
      去上面的<b>探采平台</b>买入「外勤摩托队」开始采集 DM，或封印一次裂隙即可获得首笔深渊物质。</p></div>`;
    return;
  }
  // v2.5.0 反馈②：去掉副标题与说明段——遗物卡本身写着等级/费用/效果，顶部两行复述只是噪音
  // v2.8.0 反馈②：去掉面板内重复的「🌀 深渊遗物」分类标题（页级 h3 已表达），也不再折叠
  let html = `<div class="panel" style="padding:14px">`;
  // v2.8.22 ⑥：净化节点移入遗物（DM 区）——熵减协议解锁后显示，DM 购买、限购 3 级
  // v3.12.6 ⑤：熵减协议是「本局科技」，晋升/轮回会重置，但净化节点是 DM 计价、跨转生保留的资产。
  //   原判定只看 tech → 一晋升整块消失（用户实报「遗物的净化节点等升级还是没有」）。
  //   现改为「见过一次就永久可见」：_purifierSeen 跨局保留，旧档靠 tech / 已购节点兜底。
  if (purifierFamilySeen()) {
    // v2.8.1 反馈：去掉「净化节点 DM 购买 · 深入辅助（限 3 级）」这一行文案与其上方的分隔横线。
    //   节点卡自己写着 Lv.x/3 与「每秒清除 n% 腐化」，顶部再复述一遍只是噪音。
    html += `<div style="margin-top:10px">`;
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
        <div style="font-size:12px;color:var(--text-2);margin-top:2px">${r.desc}（当前 ${fmtMultDelta(effNow)}${effNext ? ` → ${fmtMultDelta(effNext)}` : ''}）</div>
        ${gateOk ? '' : `<div style="font-size:11px;color:var(--text-3);margin-top:2px">未苏醒：需 ${r.gateHint || '更深层深渊进度'}</div>`}
      </div>
      <button class="btn ${canBuy ? '' : 'disabled'}" data-relic-buy="${r.id}" ${canBuy ? '' : 'disabled'} title="${canBuy ? `唤醒：-${fmt(cost)} DM` : maxed ? '已达上限' : !gateOk ? '进度不足' : `DM 不足（需 ${fmt(cost)}）`}">${maxed ? '已圆满' : `${fmt(cost)} DM`}</button>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// v2.8.26：遗物/净化节点 DM 可购判断每秒刷新（此前渲染时一次性——DM 花掉后卡仍亮可点）
export function refreshRelicAffordability() {
  const cards = document.querySelectorAll('#relics-panel [data-relic], #relics-panel [data-purifier]');
  for (const card of cards) {
    const id = card.dataset.relic || card.dataset.purifier;
    if (!id) continue;
    let canBuy = false;
    if (card.dataset.purifier) {
      const def = PURIFIER_DEFS.find(x => x[0] === id);
      if (!def) continue;
      const lv = (S.upgrades && S.upgrades[id]) || 0;
      // v3.3.7 反馈①：原 def[1] 取到的是名字字符串（'净化节点 I'）→ cost=NaN → canBuy 恒 false，
      // 每 300ms 原地刷新把刚渲染成可购的按钮又强制置灰——「68DM 对 50 却一直闪烁无法购买」的另一根因
      const cost = Math.ceil(def[2] * Math.pow(1.8, lv));
      const maxed = lv >= 3;
      canBuy = !maxed && (S.dm || 0) >= cost;
    } else {
      const r = RELICS.find(x => x.id === id);
      if (!r) continue;
      const lv = relicLevel(id);
      const gateOk = r.gate();
      const maxed = lv >= r.cap;
      const cost = relicCost(id);
      canBuy = gateOk && !maxed && (S.dm || 0) >= cost;
    }
    card.classList.toggle('relic-gated', !canBuy);
    const btn = card.querySelector('[data-purifier-buy], [data-relic-buy]');
    if (btn) { btn.classList.toggle('disabled', !canBuy); btn.disabled = !canBuy; }
  }
}
