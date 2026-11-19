// v3.1.0 反馈③：线程拟人化「班组面板」——个人档案卡（状态灯/心情/个人产出/累计贡献）+ 班组事件流水
// 设计边界：薪资四态仍是全局状态机（wages.js），个人卡片的状态灯派生自全局态；
// 个体差异通过「个人产出基数（招募时随机）/ 心情（正交叠加）/ 累计贡献（按实际入账份额分摊）」表达。
// v3.7.2 反馈③：卡面不再展示共事时长（信息噪音，且与岗位调度无关）。
// 流水 S.crewFeed 持久化（cap 40，随存档落盘），跨刷新保留——流失的线程不会被遗忘。
import { S } from '../state.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：倍率 → 带符号百分比
import { fmt, isLazy, staffSalaryPerSec } from './economy.js'; // v4.2.7：个人消耗显示复用薪资真源（函数提升使 crew↔economy 循环 import 安全）
import { MOOD_MULT, CONVERTERS, HYPER_CONVERTER_ID } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import {
  threadProfession, isLeader, isLazyProfession, threadLevel,
  autoAssignThreads, bindThread, unbindThread, releaseAllThreads, threadLevelMult, threadBindOutputFactor,
  unlockedConverterIds,
} from './threadBinding.js'; // v3.3.0 线程绑定系统 // v3.3.2 反馈②：班组不再展示转化器开关（统一在快捷开关/研究点/异兽页）
// v3.7.3 反馈①：班组下拉与筛选按钮只列岗位名，不再附「在岗/容量」数字。

const MOOD_ICON = { '超频': '⚡', '优化': '🔧', '高效': '✨', '正常': '🙂', '阻塞': '⏸️', '死锁': '💀', '虔诚': '🙏', '传奇': '🌟' };
const escAttr = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE_META = {
  ok:      { label: '满薪运行', color: 'var(--good,#3fb950)' },
  debt:    { label: '欠薪降效', color: 'var(--warn,#c8a24a)' },
  dormant: { label: '强制休眠', color: '#ff9800' },
  losing:  { label: '流失预警', color: 'var(--bad,#f85149)' },
};
const PAGE_SIZE = 6; // v3.2.3 反馈①：班组档案卡分页浏览；v3.12.13 反馈#172：一页 5 条；v4.0.1 反馈③：一页 6 条
let crewPage = 0; // 会话级页码（不落盘）
let crewFilter = ''; // v3.4.6 反馈⑥：岗位筛选（'' = 全部；'free' = 空闲；其余 = converter id）——会话级，不落盘

// 班组流水：cap 40 滚动窗口，随存档持久化
export function crewPush(msg, cls = '') {
  if (!Array.isArray(S.crewFeed)) S.crewFeed = [];
  S.crewFeed.push({ t: Date.now(), msg, cls });
  if (S.crewFeed.length > 40) S.crewFeed.splice(0, S.crewFeed.length - 40);
}

// v3.6.2 反馈①：班组面板 ≥10 条线程后解锁。
//   达标即置持久标记（跨转生保留）：线程后来流失也不收回面板；旧档（已有 ≥10 线程）加载即自动达标。
export function crewShown() {
  if (S._crewUnlocked) return true;
  if ((S.cultists || []).length >= (BALANCE.thread.crewUnlockThreads || 10)) { S._crewUnlocked = true; return true; }
  return false;
}

// 全局态元信息（状态灯颜色/文案）：待招募 → 懒惰 → 四态
// v4.0.0 反馈④：面板不再渲染此状态行，但四态薪资机制仍是真实玩法，
//   此函数作为状态真源由 main.js 注册到 __qa 只读钩子（避免留下无消费的死导出）。
export function crewStateMeta() {
  if (!S.cultists.length) return { label: '待招募', color: 'var(--text-3,#6e7681)' };
  if (isLazy()) return { label: `懒惰怠工 · 产出 ${fmtMultDelta(BALANCE.lazy.prodMult)} 消耗 ${fmtMultDelta(BALANCE.lazy.costMult)}`, color: 'var(--warn,#c8a24a)' };
  return STATE_META[(S.wageState || {}).state] || STATE_META.ok;
}

export function renderCrewPanel(container) {
  if (!container) return;
  // v3.6.3 反馈③：只展示已解锁岗位（超线程恒解锁）；筛选目标若是已隐藏的旧岗位则回到「全部」
  const visibleTypes = unlockedConverterIds();
  if (crewFilter && crewFilter !== 'free' && !visibleTypes.includes(crewFilter)) crewFilter = '';
  // v3.4.6 反馈⑥：岗位筛选——先过滤再分页（'' 全部 / 'free' 空闲 / converter id）
  const all = S.cultists;
  const filtered = !crewFilter ? all : all.filter(c => crewFilter === 'free' ? !c.boundTo : c.boundTo === crewFilter);
  const n = filtered.length;
  const nTotal = all.length;
  // v3.2.3 反馈①：分页——一页 10 条；线程数变化后钳制页码
  const pageCount = Math.max(1, Math.ceil(n / PAGE_SIZE));
  if (!Number.isFinite(crewPage) || crewPage < 0) crewPage = 0;
  if (crewPage >= pageCount) crewPage = pageCount - 1;
  const start = crewPage * PAGE_SIZE;
  const pageCultists = filtered.slice(start, start + PAGE_SIZE);
  const detail = pageCultists.map(c => `${c.name}:${c.mood}:${c.profession}:${c.level}:${c.boundTo || ''}:${c.leader ? 1 : 0}`).join(',');
  // v3.6.3 ③：可见岗位列表必须进签名——否则模块解锁后线程数据没变，面板会走增量刷新而不重建下拉
  // v4.0.0 反馈④：状态行已下线，签名不再因全局状态变化触发整卡重建；
  //   crewStateMeta() 仍保留导出（供其它模块/QA 读取），但面板不再渲染其文案与颜色。
  // v4.2.7 反馈③：fold 态入签名——否则点击标题时数据未变走增量刷新，折叠标题/内容体不重建（点了没反应）
  const sig = `${n}|${crewPage}|${detail}|${crewFilter}|${visibleTypes.join(',')}|fold:${container.dataset.crewFold || '0'}`;
  if (container._lastSig === sig) { refreshCrewDyn(container, start, pageCultists); return; } // 增量：内容未变只刷新动态数值
  container._lastSig = sig;
  let cards = '';
  for (const c of pageCultists) {
    const p = threadProfession(c);
    // v3.6.3 反馈④：卡内只留「擅长岗位图标」（悬浮可读名称），不写职业名、不写所处岗位、不写贡献累计
    const affinityName = p && p.affinity && CONVERTERS[p.affinity] ? CONVERTERS[p.affinity].name : (p ? p.desc : '无擅长岗位');
    const affinityIcon = p
      ? `<span class="crew-affinity" title="${affinityName}" style="font-size:13px;cursor:help">${p.icon}</span>`
      : '<span class="crew-affinity" title="无擅长岗位" style="font-size:13px">·</span>';
    const lvl = threadLevel(c);
    const leaderBadge = isLeader(c) ? ' <span style="color:var(--good,#3fb950)">★领导</span>' : '';
    // v4.0.0 反馈④：成员卡不再展示「😪怠惰」等状态文字（心情倍率仍有数值意义，保留）。
    // 下拉：空闲 + 已解锁岗位；旧档绑定到已隐藏岗位时仅为该线程保留一项，避免状态显示错乱
    const opts = visibleTypes.slice();
    if (c.boundTo && !opts.includes(c.boundTo)) opts.push(c.boundTo);
    const bindOpts = ['<option value="">空闲</option>'].concat(
      opts.map(t => `<option value="${t}" ${c.boundTo === t ? 'selected' : ''}>${CONVERTERS[t] ? CONVERTERS[t].name : t}${visibleTypes.includes(t) ? '' : '（未解锁）'}</option>`)).join('');
    // v3.7.1 反馈①：领导者是全局加成位，不给岗位下拉；v3.7.3 反馈③：卡面不再写领导岗位说明文字
    const bindCtrl = isLeader(c)
      ? ''
      : `<select data-bind="${c.id}" style="font-size:11px;max-width:110px">${bindOpts}</select>`;
    const leaderBtn = isLazyProfession(c) ? '' :
      `<button class="btn" data-leader="${c.id}" style="font-size:11px;padding:2px 6px;margin-left:6px">${isLeader(c) ? '取消领导' : '晋升领导'}</button>`;
    // v4.2.8 反馈①②③：卡片三行紧凑栅格——
    //   ① 身份行：⚡心情图标（悬浮显示 岗位/超线程/心情/领导 完整状态）+ 线程名 + Lv + 擅长岗位图标（去文字，悬浮读名）；
    //   ② 数值行：+X EP/s -Y EP/s（带符号同式）；
    //   ③ 操作行：岗位下拉 + 晋升领导按钮 同排。
    //   保留 data-bind / data-leader / .c-out / .crew-avatar / .crew-affinity 全部既有钩子。
    const stateTip = `${c.name} · Lv.${lvl} · ${escAttr(c.boundTo ? (CONVERTERS[c.boundTo] ? CONVERTERS[c.boundTo].name : c.boundTo) : '空闲')}${c.mood ? ' · ' + c.mood : ''}${isLeader(c) ? ' · 领导' : ''} · 擅长：${escAttr(affinityName)}`;
    cards += `<div class="crew-card">
      <div class="crew-line crew-line-id">
        <span class="crew-avatar" title="${stateTip}" aria-label="${stateTip}">${MOOD_ICON[c.mood] || '🙂'}</span>
        <span class="crew-name">${c.name}</span>
        <span class="crew-lv">Lv.${lvl}</span>
        <span class="crew-aff-wrap">${affinityIcon}</span>${leaderBadge}
      </div>
      <div class="crew-line crew-line-num">
        <span class="crew-num">+<b class="c-out">0</b> EP/s</span>
        <span class="crew-num">-<b class="c-sal">0</b> EP/s</span>
      </div>
      <div class="crew-line crew-line-act">${bindCtrl}${leaderBtn}</div>
    </div>`;
  }
  if (!cards) cards = `<div class="crew-card more">${crewFilter ? '当前岗位暂无线程' : '暂无线程——去商店招募第一条线程'}</div>`;
  const pager = pageCount > 1
    ? `<div class="crew-pager"><span>已展示 ${Math.min((crewPage + 1) * PAGE_SIZE, n)} / ${n} 条线程 · 下滑加载更多${crewFilter && n !== nTotal ? `（筛选自全班组 ${nTotal}）` : ''}</span></div>`
    : '';
  // v3.3.1 反馈⑦：班组面板不再展示事件流水（日志区已承担记录；班组只保留人员与调度）
  // v4.2.7 反馈③：产出/薪资行删除（顶栏已有同口径），改为与效能编排同构的可折叠类目标题「班组 ▼」。
  //   产出/薪资仍是真实玩法数值，只是不在班组卡头重复；数字仍在顶栏 h-ep/h-salary 实时显示。
  const foldArrow = container.dataset.crewFold === '1' ? '▶' : '▼';
  container.innerHTML = `
    <div class="orch-block-title crew-block-title" data-crew-fold role="button" tabindex="0" aria-expanded="${container.dataset.crewFold === '1' ? 'false' : 'true'}"><span class="rp-fold-arrow">${foldArrow}</span> 班组</div>
    <div class="crew-fold-body" style="${container.dataset.crewFold === '1' ? 'display:none' : ''}">
    <div class="crew-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn" data-autobind="1" title="按设施容量分配：先把所有已解锁且开启的资源岗位按容量填满，放不下的才转入超线程；优先安排空闲线程，再纠正错位岗位；原本手动设定的超线程也会被拉回来优先补资源岗位">智能分配</button>
      <button class="btn" data-release-all="1" title="把所有线程从岗位撤离，全部置为空闲（消耗恢复）">一键收回</button>
      <select data-crew-filter-select title="按线程类型（在岗岗位）筛选" style="font-size:12px;padding:3px 8px;margin-left:4px;max-width:180px">
        <option value="" ${crewFilter === '' ? 'selected' : ''}>全部</option>
        <option value="free" ${crewFilter === 'free' ? 'selected' : ''}>空闲</option>
        ${visibleTypes.map(t => `<option value="${t}" ${crewFilter === t ? 'selected' : ''}>${CONVERTERS[t].name}</option>`).join('')}
      </select>
    </div>
    <div class="crew-grid">${cards}</div>
    ${pager}
    </div>`;
  // v3.2.3 反馈①：分页按钮事件委托（容器级，重建不丢）
  if (!container._crewDelegated) {
    container._crewDelegated = true;
    container.addEventListener('click', (ev) => {
      // v4.2.7 反馈③：「班组」类目标题折叠（与效能编排同构，箭头切换 + 内容体显隐）
      const fold = ev.target.closest ? ev.target.closest('[data-crew-fold]') : null;
      if (fold) {
        container.dataset.crewFold = container.dataset.crewFold === '1' ? '0' : '1';
        renderCrewPanel(container);
        return;
      }
      // v4.3.5 反馈③：移除 data-crew-page 按钮点击委托——按钮已删，滚动是唯一翻页入口
      //   （自动化脚本兼容：列表 scrollTop = scrollHeight 触发滚动翻页）
      const lb = ev.target.closest ? ev.target.closest('[data-leader]') : null;
      if (lb) {
        const c = S.cultists.find(x => String(x.id) === String(lb.dataset.leader));
        if (c) {
          // v3.3.1 反馈⑤：领导者同一时间只能有一位——晋升新人即自动卸任上一位
          if (!c.leader) {
            const prev = S.cultists.find(x => x.leader && x !== c);
            if (prev) { prev.leader = false; crewPush(`【${prev.name}】卸任领导者（领导者只能存在一位）`); }
            c.leader = true;
            // v3.7.1 反馈①：领导者只提供全局加成，不能同时占用岗位
            if (c.boundTo) { unbindThread(c); crewPush(`【${c.name}】撤离原岗位`); }
            crewPush(`【${c.name}】晋升为领导者，全局产出提升`, 'good');
          } else {
            c.leader = false;
            crewPush(`【${c.name}】卸任领导者，恢复为可分配线程`);
          }
          renderCrewPanel(container);
        }
        return;
      }
      const ab = ev.target.closest ? ev.target.closest('[data-autobind]') : null;
      if (ab) {
        // v3.3.5 反馈①：每次点击都对当前线程做一次完整重排（不再只填空闲线程）
        const k = autoAssignThreads();
        crewPush(k > 0 ? `智能分配：调整 ${k} 条线程（先填满资源岗位，其余转入超线程）` : '智能分配：当前分配已是最优，无需调整', k > 0 ? 'good' : '');
        renderCrewPanel(container);
        return;
      }
      // v3.7.2 反馈②：一键收回——所有线程撤离岗位，全部置于空闲
      const ra = ev.target.closest ? ev.target.closest('[data-release-all]') : null;
      if (ra) {
        const k = releaseAllThreads();
        crewPush(k > 0 ? `一键收回：${k} 条线程撤离岗位，全部置为空闲（消耗恢复）` : '一键收回：当前没有在岗线程', k > 0 ? 'good' : '');
        renderCrewPanel(container);
        return;
      }
    });
    container.addEventListener('change', (ev) => {
      // v3.12.13 反馈#172：线程类型筛选下拉框
      const fsel = ev.target.closest ? ev.target.closest('[data-crew-filter-select]') : null;
      if (fsel) {
        crewFilter = fsel.value || '';
        crewPage = 0;
        renderCrewPanel(container);
        return;
      }
      const sel = ev.target.closest ? ev.target.closest('[data-bind]') : null;
      if (!sel) return;
      const c = S.cultists.find(x => String(x.id) === String(sel.dataset.bind));
      if (!c) return;
      const v = sel.value;
      if (v) {
        bindThread(c, v);
        const match = threadProfession(c) && threadProfession(c).affinity === v;
        crewPush(`【${c.name}】分配至${CONVERTERS[v].name}${match ? '（擅长岗位，无 EP/消耗惩罚）' : ''}`, 'good');
      } else { unbindThread(c); crewPush(`【${c.name}】从岗位撤离（消耗恢复）`, ''); }
      renderCrewPanel(container);
    });
    // v4.3.3 反馈②：滚动触底自动翻页（按钮保留兼容历史脚本）。判定用当前筛选后的总条数。
    container.addEventListener('scroll', () => {
      if (container._crewScrollLock || container.dataset.crewFold === '1') return;
      const pc = Math.max(1, Math.ceil((container._crewTotal || 0) / PAGE_SIZE));
      if (crewPage >= pc - 1) return;
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 20) {
        container._crewScrollLock = true;
        crewPage++;
        renderCrewPanel(container);
        requestAnimationFrame(() => { container._crewScrollLock = false; });
      }
    }, { passive: true });
  }
  container._crewTotal = n; // v4.3.3 反馈②：滚动翻页判定总条数（筛选后）
  refreshCrewDyn(container, start, pageCultists);
}

// 每秒原地更新动态数值（个人产出），不重建 DOM（v2.6.7 防闪烁纪律）
// v3.2.3 反馈①：索引跟随当前分页切片（原全量前 24 条直读）
// v3.6.3 反馈④：累计贡献已从卡面移除，动态刷新不再维护 c-earned
function refreshCrewDyn(container, start = 0, pageCultists = S.cultists.slice(0, PAGE_SIZE)) {
  // v4.2.7 反馈③：班组产出/薪资行已删除（顶栏同口径），此处不再刷新 .crew-sum
  const outEls = container.querySelectorAll('.c-out');
  const salEls = container.querySelectorAll('.c-sal');
  const n = S.cultists.length || 1;
  const salPer = staffSalaryPerSec() / n; // 全局平均薪资 ÷ 人数 = 单人消耗基数
  for (let i = 0; i < outEls.length && i < pageCultists.length; i++) {
    const c = pageCultists[i];
    const out = (c.output || 3) * 0.8 * (MOOD_MULT[c.mood] || 1) * threadLevelMult(threadLevel(c)) * threadBindOutputFactor(c);
    outEls[i].textContent = fmt(out);
    // v4.2.7 反馈①：个人消耗 = 平均薪资 × 岗位系数（与 staffSalaryPerSec 的 bindAvg 口径同源）
    if (salEls[i]) salEls[i].textContent = fmt(salPer * salaryFactorOf(c));
  }
}

// v4.2.7 反馈①：单人薪资系数（与 economy.staffSalaryPerSec 的 bindAvg 同口径）
function salaryFactorOf(c) {
  if (!c.boundTo) return 1;
  if (c.boundTo === HYPER_CONVERTER_ID) return 1.1;
  return 1; // 其它岗位的差异已由 economy 的 bindAvg 全局摊平，卡内展示取平均口径
}
