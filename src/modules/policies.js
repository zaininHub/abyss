// v2.8.6 B2a：政策模块——开放判定/选择/改选/渲染（每轮重选，组内互斥，正负成对）
import { S, save } from '../state.js';
import { fmt, computeCps } from './economy.js';
import {
  POLICY_GROUPS, groupByName, groupPolicyId, selectedPolicy,
  policyOpenGroups, policyLv, nextPolicyInGroup,
} from '../data/policies.js';

let logFn = null; let toastFn = null;
export function setPolicyLogFn(fn) { logFn = fn; }
export function setPolicyToastFn(fn) { toastFn = fn; }
function plog(msg, cls) { if (logFn) logFn(`[政策] ${msg}`, cls); }

// 选择政策（v2.8.30 ③：KG 链式——选定后本局锁定，层层解锁下一级政策）
export function selectPolicy(groupId, policyId) {
  const g = groupByName(groupId);
  if (!g) return { ok: false, reason: '未知政策组' };
  const p = g.policies.find(x => x.id === policyId);
  if (!p) return { ok: false, reason: '未知政策' };
  const open = policyOpenGroups().find(x => x.id === groupId);
  if (!open) return { ok: false, reason: `政策组未开放（${g.hint}）` };
  const cur = groupPolicyId(groupId);
  if (cur === policyId) return { ok: false, reason: '已是当前政策' };
  if (cur) return { ok: false, reason: '该组已选定政策——不可改选' };
  S.policies = S.policies || {};
  S.policies[groupId] = { id: policyId, lv: 1 };
  save(S);
  plog(`本轮政策：${g.name}·${p.name}——${p.desc}`, 'good');
  if (toastFn) toastFn(`🏛 ${g.name}·${p.name}：${p.desc}`);
  return { ok: true };
}

// 层层解锁下一级政策（组内链推进：集权 → 自治 → 协作）
export function upgradePolicy(groupId) {
  const g = groupByName(groupId);
  if (!g) return { ok: false, reason: '未知政策组' };
  const pid = groupPolicyId(groupId);
  const nxt = nextPolicyInGroup(groupId, pid);
  if (!nxt) return { ok: false, reason: '已达政策链末端' };
  S.policies = S.policies || {};
  S.policies[groupId] = { id: nxt.id, lv: policyLv(groupId) + 1 };
  save(S);
  plog(`政策推进：${g.name} → ${nxt.name}（第 ${policyLv(groupId)} 级）——${nxt.desc}`, 'good');
  if (toastFn) toastFn(`🏛 ${g.name} 推进至 ${nxt.name}：${nxt.desc}`);
  return { ok: true };
}

// 渲染：政策面板（组开放状态 + 组内互斥单选 + 改选）
export function renderPolicyPanel(container) {
  if (!container) return;
  const groups = policyOpenGroups();
  if (groups.length === 0) {
    container.innerHTML = `<div class="religion-desc">周期政策：每轮（晋升/轮回）后按跨周期资产开放政策槽位，组内互斥单选——让每次游戏周期走向不同。</div>
      <div style="font-size:12px;color:var(--text-2);line-height:1.9">本轮暂无开放政策组：<br>· 路线抉择（需职级 ≥1）<br>· 信仰组（需信仰解锁）<br>· 集市组（需集市开张）</div>`;
    return;
  }
  const lv = (gid) => policyLv(gid);
  let html = `<div class="religion-desc">周期政策：每轮（晋升/轮回）后重选；选定后本局锁定，可沿政策链逐级解锁下一级（效果各不相同）。<span style="color:var(--text-2)">${S.vowPolicyBoost ? '已立誓：政策正向幅度 +5%' : '中立'}</span></div>`;
  for (const g of groups) {
    const chosen = groupPolicyId(g.id);
    const clv = lv(g.id);
    const nxt = chosen ? nextPolicyInGroup(g.id, chosen) : null;
    const chosenName = chosen ? g.policies.find(x => x.id === chosen) : null;
    // v3.0.3 反馈⑤：已选定组折叠收起（一行小结，点击展开组内改选/推进）
    html += `<div style="margin:10px 0 4px;font-size:11px;color:var(--accent);font-weight:600">${g.name}</div>`;
    if (chosen) {
      html += `<div class="item policy-on" data-policy-fold="${g.id}" style="cursor:pointer;border-color:var(--green,#2ea043);opacity:1">
        <div class="name"><span>✓ ${chosenName ? chosenName.name : chosen}</span><span class="count">Lv.${clv} · ${chosenName ? chosenName.desc : ''}</span></div>
        <div style="font-size:10.5px;color:var(--text-3)">${nxt ? `下一级：${nxt.name}（点击展开推进）` : '点击展开查看'}</div></div>
      <div data-fold-body="${g.id}" style="display:none">`;
    }
    for (const p of g.policies) {
      const isCur = chosen === p.id;
      const locked = !!chosen && !isCur; // 组内互斥（本局锁定）
      const canUp = isCur && !!nxt;
      const gate = p.unlock ? p.unlock() : true; // v3.0.3：政策级前置（深化组需先选对应路线）
      if (chosen && !isCur) continue; // 折叠收起后组内仅显示已选项（展开区仍可改选）
      html += `<div class="item ${isCur ? 'policy-on' : locked ? 'cant' : !gate ? 'cant' : ''}" data-policy-group="${g.id}" data-policy="${p.id}" data-up="${canUp ? '1' : ''}" style="cursor:pointer;${isCur ? 'border-color:var(--green,#2ea043);opacity:1' : ''}">
        <div class="name"><span>${isCur ? '✓ ' : ''}${p.name}</span><span class="count">${p.desc}</span></div>
        <div style="font-size:10.5px;color:var(--text-3)">${canUp ? `下一级：${nxt.name}（点击推进）` : locked ? '已选定其他政策' : !gate ? (g.id === 'deepen' ? '需先选定对应路线（深渊/秩序）' : '未满足前置') : '点击选定'}</div>
      </div>`;
    }
    if (chosen) html += `</div>`;
  }
  container.innerHTML = html;
}

export function bindPolicyPanel(container) {
  if (!container || container.dataset.policyBound) return;
  container.dataset.policyBound = '1';
  container.addEventListener('click', (e) => {
    // v3.0.3 反馈⑤：折叠条点击展开/收起已选组
    const fold = e.target.closest('[data-policy-fold]');
    if (fold) {
      const body = container.querySelector(`[data-fold-body="${fold.dataset.policyFold}"]`);
      if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
      return;
    }
    const el = e.target.closest('[data-policy-group]');
    if (!el) return;
    const gid = el.dataset.policyGroup;
    const pid = el.dataset.policy;
    const cur = groupPolicyId(gid);
    let r;
    if (el.dataset.up === '1') r = upgradePolicy(gid); // 层层解锁下一级政策
    else if (cur === pid) return;
    else if (cur) r = { ok: false, reason: '该组已选定政策——不可改选' };
    else r = selectPolicy(gid, pid);
    if (!r.ok && toastFn) toastFn(r.reason);
    renderPolicyPanel(container);
  });
}
