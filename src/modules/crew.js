// v3.1.0 反馈③：线程拟人化「班组面板」——个人档案卡（状态灯/心情/个人产出/累计贡献/工龄）+ 班组事件流水
// 设计边界：薪资四态仍是全局状态机（wages.js），个人卡片的状态灯派生自全局态；
// 个体差异通过「个人产出基数（招募时随机）/ 心情（正交叠加）/ 累计贡献（按实际入账份额分摊）/ 工龄」表达。
// 流水 S.crewFeed 持久化（cap 40，随存档落盘），跨刷新保留——流失的线程不会被遗忘。
import { S } from '../state.js';
import { fmt, isLazy } from './economy.js';
import { MOOD_MULT, PROFESSION_BY_ID, CONVERTERS, CONVERTER_IDS, LAZY_PROFESSION_ID } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import {
  threadProfession, isLeader, isLazyProfession, threadLevel, leaderCount,
  autoAssignThreads, bindThread, unbindThread, threadLevelMult, threadBindOutputFactor,
} from './threadBinding.js'; // v3.3.0 线程绑定系统

const MOOD_ICON = { '超频': '⚡', '优化': '🔧', '高效': '✨', '正常': '🙂', '阻塞': '⏸️', '死锁': '💀', '虔诚': '🙏', '传奇': '🌟' };
const STATE_META = {
  ok:      { label: '满薪运行', color: 'var(--good,#3fb950)' },
  debt:    { label: '欠薪降效', color: 'var(--warn,#c8a24a)' },
  dormant: { label: '强制休眠', color: '#ff9800' },
  losing:  { label: '流失预警', color: 'var(--bad,#f85149)' },
};
const PAGE_SIZE = 10; // v3.2.3 反馈①：班组档案卡一页 10 条，分页浏览（原 24 条上限折叠，改分页后全量可达）
let crewPage = 0; // 会话级页码（不落盘）

// 班组流水：cap 40 滚动窗口，随存档持久化
export function crewPush(msg, cls = '') {
  if (!Array.isArray(S.crewFeed)) S.crewFeed = [];
  S.crewFeed.push({ t: Date.now(), msg, cls });
  if (S.crewFeed.length > 40) S.crewFeed.splice(0, S.crewFeed.length - 40);
}

// 全局态元信息（状态灯颜色/文案）：待招募 → 懒惰 → 四态
export function crewStateMeta() {
  if (!S.cultists.length) return { label: '待招募', color: 'var(--text-3,#6e7681)' };
  if (isLazy()) return { label: `懒惰怠工 · 产出 ×${BALANCE.lazy.prodMult} 消耗 ×${BALANCE.lazy.costMult}`, color: 'var(--warn,#c8a24a)' };
  return STATE_META[(S.wageState || {}).state] || STATE_META.ok;
}

function tenure(c) {
  const t0 = c.hiredAt || S.startTime || Date.now();
  const sec = Math.max(0, Math.floor((Date.now() - t0) / 1000));
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} 小时`;
  return `${(sec / 86400).toFixed(1)} 天`;
}

export function renderCrewPanel(container) {
  if (!container) return;
  const meta = crewStateMeta();
  const feed = (S.crewFeed || []).slice(-8).reverse();
  const n = S.cultists.length;
  // v3.2.3 反馈①：分页——一页 10 条；线程数变化后钳制页码
  const pageCount = Math.max(1, Math.ceil(n / PAGE_SIZE));
  if (!Number.isFinite(crewPage) || crewPage < 0) crewPage = 0;
  if (crewPage >= pageCount) crewPage = pageCount - 1;
  const start = crewPage * PAGE_SIZE;
  const pageCultists = S.cultists.slice(start, start + PAGE_SIZE);
  const detail = pageCultists.map(c => `${c.name}:${c.mood}:${c.profession}:${c.level}:${c.boundTo || ''}:${c.leader ? 1 : 0}`).join(',');
  const sig = `${n}|${crewPage}|${meta.label}|${detail}|${feed.map(f => f.msg).join('|')}`;
  if (container._lastSig === sig) { refreshCrewDyn(container, start, pageCultists); return; } // 增量：内容未变只刷新动态数值
  container._lastSig = sig;
  let cards = '';
  for (const c of pageCultists) {
    const p = threadProfession(c);
    const pTxt = p ? `${p.icon}${p.name}` : '无职业';
    const lvl = threadLevel(c);
    const boundTxt = c.boundTo ? (CONVERTERS[c.boundTo] ? CONVERTERS[c.boundTo].name : c.boundTo) : '空闲';
    const leaderBadge = isLeader(c) ? ' <span style="color:var(--good,#3fb950)">★领导</span>' : '';
    const lazyBadge = isLazyProfession(c) ? ' <span style="color:var(--warn,#c8a24a)">😪怠惰</span>' : '';
    const bindOpts = ['<option value="">空闲</option>'].concat(
      CONVERTER_IDS.map(t => `<option value="${t}" ${c.boundTo === t ? 'selected' : ''}>${CONVERTERS[t].name}</option>`)).join('');
    const leaderBtn = isLazyProfession(c) ? '' :
      `<button class="btn" data-leader="${c.id}" style="font-size:11px;padding:2px 6px;margin-left:6px">${isLeader(c) ? '取消领导' : '晋升领导'}</button>`;
    cards += `<div class="crew-card" style="border-left:3px solid ${meta.color}">
      <span class="crew-avatar">${MOOD_ICON[c.mood] || '🙂'}</span>
      <div class="crew-info">
        <div class="crew-name">${c.name} <span class="crew-mood">${c.mood}${MOOD_MULT[c.mood] ? ' ×' + MOOD_MULT[c.mood] : ''}</span>${leaderBadge}${lazyBadge}</div>
        <div class="crew-stat">${pTxt} · Lv.${lvl} · 岗位：${boundTxt}</div>
        <div class="crew-stat">产出 <b class="c-out">0</b>/s · 贡献 <b class="c-earned">—</b> EP</div>
        <div class="crew-stat dim"><span class="c-tenure"></span></div>
        <div class="crew-stat"><select data-bind="${c.id}" style="font-size:11px;max-width:110px">${bindOpts}</select>${leaderBtn}</div>
      </div>
    </div>`;
  }
  if (!cards) cards = '<div class="crew-card more">暂无线程——去商店招募第一条线程</div>';
  const pager = pageCount > 1
    ? `<div class="crew-pager">
        <button data-crew-page="prev" ${crewPage <= 0 ? 'disabled' : ''}>‹ 上一页</button>
        <span>第 ${crewPage + 1} / ${pageCount} 页 · 共 ${n} 条线程</span>
        <button data-crew-page="next" ${crewPage >= pageCount - 1 ? 'disabled' : ''}>下一页 ›</button>
      </div>`
    : '';
  const feedHtml = feed.length
    ? feed.map(f => `<div class="crew-feed-item ${f.cls || ''}"><span class="mono">${new Date(f.t).toTimeString().slice(0, 5)}</span> ${f.msg}</div>`).join('')
    : '<div class="crew-feed-item dim">暂无班组动态——招募、状态切换与流失都会记录在这里</div>';
  container.innerHTML = `
    <div class="crew-head">
      <span class="crew-state" style="color:${meta.color}">● ${meta.label}</span>
      <span class="crew-count">${n} 条线程在岗</span>
    </div>
    <div class="crew-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn" data-autobind="1" ${leaderCount() > 0 ? '' : 'disabled'} title="领导者决策：把空闲线程分配到最合适岗位">智能分配（领导者决策）</button>
      <span style="font-size:12px;color:var(--text-2)">转化器开关：</span>
      ${CONVERTER_IDS.map(t => {
        const on = !(S.converterOn && S.converterOn[t] === false);
        return `<button class="btn crew-conv-btn" data-conv-toggle="${t}" style="font-size:11px;padding:2px 8px;${on ? 'background:var(--good,#3fb950);color:#04210f' : 'background:#444;color:#ddd'}">${CONVERTERS[t].name} ${on ? '开' : '关'}</button>`;
      }).join('')}
    </div>
    <div class="crew-help" style="font-size:11px;color:var(--text-3,#6e7681);margin-bottom:6px;line-height:1.7">💡 <b>班组调度协议 v3.3</b>：把线程绑定到探采平台/灵感工坊——绑定后该线程自由 EP 产出略降、消耗增多（抽调去转化）。<b>匹配职业</b>（🔭勘探员→探采、⚗️蒸馏师→灵感工坊）无惩罚且加成更高；🎖️领导者提供全局加成并可「智能分配」；😪怠惰线程为负面（极少出现）。关闭转化器开关即可释放绑定、消耗恢复。</div>
    <div class="crew-grid">${cards}</div>
    ${pager}
    <div class="crew-feed">${feedHtml}</div>`;
  // v3.2.3 反馈①：分页按钮事件委托（容器级，重建不丢）
  if (!container._crewDelegated) {
    container._crewDelegated = true;
    container.addEventListener('click', (ev) => {
      const btn = ev.target.closest ? ev.target.closest('[data-crew-page]') : null;
      if (btn && !btn.disabled) { crewPage += btn.dataset.crewPage === 'prev' ? -1 : 1; renderCrewPanel(container); return; }
      const lb = ev.target.closest ? ev.target.closest('[data-leader]') : null;
      if (lb) {
        const c = S.cultists.find(x => String(x.id) === String(lb.dataset.leader));
        if (c) { c.leader = !c.leader; crewPush(c.leader ? `【${c.name}】晋升为领导者，全局产出提升` : `【${c.name}】卸任领导者`, c.leader ? 'good' : ''); renderCrewPanel(container); }
        return;
      }
      const ab = ev.target.closest ? ev.target.closest('[data-autobind]') : null;
      if (ab) {
        const k = autoAssignThreads();
        crewPush(k > 0 ? `领导者调度：分配 ${k} 条线程到合适岗位` : '领导者调度：暂无可分配线程', 'good');
        renderCrewPanel(container);
        return;
      }
      const ct = ev.target.closest ? ev.target.closest('[data-conv-toggle]') : null;
      if (ct) {
        const t = ct.dataset.convToggle;
        S.converterOn = S.converterOn || {};
        S.converterOn[t] = (S.converterOn[t] === false); // 切换：关→开、开→关
        crewPush(`${CONVERTERS[t].name}已${S.converterOn[t] === false ? '关闭（释放绑定、线程消耗恢复）' : '开启'}`, S.converterOn[t] === false ? 'bad' : 'good');
        renderCrewPanel(container);
        return;
      }
    });
    container.addEventListener('change', (ev) => {
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
  }
  refreshCrewDyn(container, start, pageCultists);
}

// 每秒原地更新动态数值（个人产出/累计贡献/工龄），不重建 DOM（v2.6.7 防闪烁纪律）
// v3.2.3 反馈①：索引跟随当前分页切片（原全量前 24 条直读）
function refreshCrewDyn(container, start = 0, pageCultists = S.cultists.slice(0, PAGE_SIZE)) {
  const outEls = container.querySelectorAll('.c-out');
  const earnEls = container.querySelectorAll('.c-earned');
  const tenEls = container.querySelectorAll('.c-tenure');
  for (let i = 0; i < outEls.length && i < pageCultists.length; i++) {
    const c = pageCultists[i];
    outEls[i].textContent = fmt((c.output || 3) * 0.8 * (MOOD_MULT[c.mood] || 1) * threadLevelMult(threadLevel(c)) * threadBindOutputFactor(c));
    earnEls[i].textContent = c.earned ? fmt(c.earned) : '—';
    if (tenEls[i]) tenEls[i].textContent = `已共事 ${c.hiredAt ? tenure(c) : '—'}`;
  }
}
