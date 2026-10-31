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
  // v3.0.3 第三批⑤：一次只出现一个未选政策组（候选全显示）；已选组顶部收起查看；去除等级概念（无 Lv）
  let html = `<div class="religion-desc">周期政策：每轮（晋升/轮回）后重选；一次只开放一个政策组，选定后自动解锁下一组。<span style="color:var(--text-2)">${S.vowPolicyBoost ? '已立誓：政策正向幅度 +5%' : '中立'}</span></div>`;
  // 已选政策收起区（点击展开查看）
  const chosenList = groups.filter(g => groupPolicyId(g.id));
  if (chosenList.length > 0) {
    html += `<div style="margin:8px 0 2px;font-size:11px;color:var(--accent);font-weight:600">已选政策（点击展开查看）</div>`;
    for (const g of chosenList) {
      const chosen = groupPolicyId(g.id);
      const chosenName = g.policies.find(x => x.id === chosen);
      html += `<div class="item policy-on" data-policy-fold="${g.id}" style="cursor:pointer;border-color:var(--green,#2ea043);opacity:1">
        <div class="name"><span>✓ ${g.name}：${chosenName ? chosenName.name : chosen}</span><span class="count">${chosenName ? chosenName.desc : ''}</span></div>
        <div style="font-size:10.5px;color:var(--text-3)">点击展开查看</div></div>
      <div data-fold-body="${g.id}" style="display:none">`;
      for (const p of g.policies) {
        const isCur = chosen === p.id;
        html += `<div class="item ${isCur ? 'policy-on' : 'cant'}" data-policy-group="${g.id}" data-policy="${p.id}" style="cursor:pointer;${isCur ? 'border-color:var(--green,#2ea043);opacity:1' : ''}">
          <div class="name"><span>${isCur ? '✓ ' : ''}${p.name}</span><span class="count">${p.desc}</span></div>
        </div>`;
      }
      html += `</div>`;
    }
  }
  // 当前组：第一个未选且开放的组（一次只出现一个）
  const curGroup = groups.find(g => !groupPolicyId(g.id));
  if (curGroup) {
    html += `<div style="margin:10px 0 4px;font-size:11px;color:var(--accent);font-weight:600">${curGroup.name}${curGroup.hint ? ` <span style="color:var(--text-3)">（${curGroup.hint}）</span>` : ''}</div>`;
    const chosen = null;
    for (const p of curGroup.policies) {
      const gate = p.unlock ? p.unlock() : true;
      html += `<div class="item ${!gate ? 'cant' : ''}" data-policy-group="${curGroup.id}" data-policy="${p.id}" style="cursor:pointer;">
        <div class="name"><span>${p.name}</span><span class="count">${p.desc}</span></div>
        <div style="font-size:10.5px;color:var(--text-3)">${!gate ? (curGroup.id === 'deepen' ? '需先选定对应路线（深渊/秩序）' : '未满足前置') : '点击选定（选定后解锁下一组）'}</div>
      </div>`;
    }
  } else {
    html += `<div style="color:var(--good,#3fb950);font-size:11.5px;margin-top:8px">本周期政策已全部选定 ✓</div>`;
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
