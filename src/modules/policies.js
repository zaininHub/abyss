// v2.8.6 B2a：政策模块——开放判定/选择/改选/渲染（每轮重选，组内互斥，正负成对）
import { S, save } from '../state.js';
import { fmt, computeCps } from './economy.js';
import {
  POLICY_GROUPS, groupByName, groupPolicyId, selectedPolicy,
  policyOpenGroups, policyRerollCost, canPayReroll, payReroll,
} from '../data/policies.js';

let logFn = null; let toastFn = null;
export function setPolicyLogFn(fn) { logFn = fn; }
export function setPolicyToastFn(fn) { toastFn = fn; }
function plog(msg, cls) { if (logFn) logFn(`[政策] ${msg}`, cls); }

// 选择政策（组内互斥：已选组需先改选）
export function selectPolicy(groupId, policyId) {
  const g = groupByName(groupId);
  if (!g) return { ok: false, reason: '未知政策组' };
  const p = g.policies.find(x => x.id === policyId);
  if (!p) return { ok: false, reason: '未知政策' };
  const open = policyOpenGroups().find(x => x.id === groupId);
  if (!open) return { ok: false, reason: `政策组未开放（${g.hint}）` };
  const cur = groupPolicyId(groupId);
  if (cur === policyId) return { ok: false, reason: '已是当前政策' };
  if (cur) return { ok: false, reason: '该组已选定政策——需改选（消耗回响/虔诚）' };
  S.policies = S.policies || {};
  S.policies[groupId] = policyId;
  save(S);
  plog(`本轮政策：${g.name}·${p.name}——${p.desc}`, 'good');
  if (toastFn) toastFn(`🏛 ${g.name}·${p.name}：${p.desc}`);
  return { ok: true };
}

// 改选（消耗跨周期资源 ×2^n；中立半价）
export function changePolicy(groupId, policyId) {
  const g = groupByName(groupId);
  const p = g && g.policies.find(x => x.id === policyId);
  if (!g || !p) return { ok: false, reason: '未知政策' };
  if (!groupPolicyId(groupId)) return { ok: false, reason: '该组未选定——直接选择即可' };
  if (groupPolicyId(groupId) === policyId) return { ok: false, reason: '已是当前政策' };
  if (!canPayReroll(groupId)) return { ok: false, reason: '改选需 1 回响或 1 虔诚（可多次，成本 ×2 递增）' };
  const paid = payReroll(groupId);
  S.policyRerolls = S.policyRerolls || {};
  S.policyRerolls[groupId] = (S.policyRerolls[groupId] || 0) + 1;
  S.policies[groupId] = policyId;
  save(S);
  plog(`政策改选：${g.name}·${p.name}（-1 ${paid}）`, 'good');
  if (toastFn) toastFn(`🔄 ${g.name} 政策改为 ${p.name}（-1 ${paid === 'echo' ? '回响' : '虔诚'}）`);
  return { ok: true, paid };
}

// 渲染：政策面板（组开放状态 + 组内互斥单选 + 改选）
export function renderPolicyPanel(container) {
  if (!container) return;
  const groups = policyOpenGroups();
  if (groups.length === 0) {
    container.innerHTML = `<div class="religion-desc">周期政策：每轮（晋升/轮回）后按跨周期资产开放政策槽位，组内互斥单选——让每次游戏周期走向不同。</div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.9">本轮暂无开放政策组：<br>· 秩序组（需职级 ≥1）<br>· 深渊组（需深潜 ≥1 层）<br>· 信仰组（需信仰解锁）</div>`;
    return;
  }
  let html = `<div class="religion-desc">周期政策：每轮可重选（转生/轮回后清空），组内互斥单选；正负成对——拿强项必吃弱项。<span style="color:var(--text-2)">${S.vowPolicyBoost ? '已立誓：政策正向幅度 +5%' : '中立'}</span></div>`;
  for (const g of groups) {
    const chosen = groupPolicyId(g.id);
    html += `<div style="margin:10px 0 4px;font-size:11px;color:var(--accent);font-weight:600">${g.name}（${chosen ? '已选定' : '未选定'}）</div>`;
    for (const p of g.policies) {
      const isCur = chosen === p.id;
      const locked = !!chosen && !isCur; // 组内互斥
      html += `<div class="item ${isCur ? 'policy-on' : locked ? 'cant' : ''}" data-policy-group="${g.id}" data-policy="${p.id}" style="cursor:pointer;${isCur ? 'border-color:var(--green,#2ea043);opacity:1' : ''}">
        <div class="name"><span>${isCur ? '✓ ' : ''}${p.name}</span><span class="count">${p.desc}</span></div>
        <div style="font-size:10.5px;color:var(--text-3)">${locked ? `改选为「${p.name}」：${policyRerollCost(g.id)} 回响/虔诚` : '点击选定'}</div>
      </div>`;
    }
  }
  container.innerHTML = html;
}

export function bindPolicyPanel(container) {
  if (!container || container.dataset.policyBound) return;
  container.dataset.policyBound = '1';
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-policy-group]');
    if (!el) return;
    const gid = el.dataset.policyGroup;
    const pid = el.dataset.policy;
    const cur = groupPolicyId(gid);
    let r;
    if (cur === pid) return;
    if (cur) r = changePolicy(gid, pid); // v2.8.30 ③：恢复每轮可改选（KG 路线多元化，转生/轮回后清空）
    else r = selectPolicy(gid, pid);
    if (!r.ok && toastFn) toastFn(r.reason);
    renderPolicyPanel(container);
  });
}
