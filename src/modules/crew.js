// v3.1.0 反馈③：线程拟人化「班组面板」——个人档案卡（状态灯/心情/个人产出/累计贡献/工龄）+ 班组事件流水
// 设计边界：薪资四态仍是全局状态机（wages.js），个人卡片的状态灯派生自全局态；
// 个体差异通过「个人产出基数（招募时随机）/ 心情（正交叠加）/ 累计贡献（按实际入账份额分摊）/ 工龄」表达。
// 流水 S.crewFeed 持久化（cap 40，随存档落盘），跨刷新保留——流失的线程不会被遗忘。
import { S } from '../state.js';
import { fmt, isLazy, staffOutputPerSec, staffSalaryPerSec } from './economy.js';
import { MOOD_MULT, PROFESSION_BY_ID, CONVERTERS, CONVERTER_IDS, LAZY_PROFESSION_ID } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import {
  threadProfession, isLeader, isLazyProfession, threadLevel, leaderCount,
  autoAssignThreads, bindThread, unbindThread, threadLevelMult, threadBindOutputFactor,
} from './threadBinding.js'; // v3.3.0 线程绑定系统 // v3.3.2 反馈②：班组不再展示转化器开关（统一在快捷开关/研究点/异兽页）

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
  const n = S.cultists.length;
  // v3.2.3 反馈①：分页——一页 10 条；线程数变化后钳制页码
  const pageCount = Math.max(1, Math.ceil(n / PAGE_SIZE));
  if (!Number.isFinite(crewPage) || crewPage < 0) crewPage = 0;
  if (crewPage >= pageCount) crewPage = pageCount - 1;
  const start = crewPage * PAGE_SIZE;
  const pageCultists = S.cultists.slice(start, start + PAGE_SIZE);
  const detail = pageCultists.map(c => `${c.name}:${c.mood}:${c.profession}:${c.level}:${c.boundTo || ''}:${c.leader ? 1 : 0}`).join(',');
  const sig = `${n}|${crewPage}|${meta.label}|${detail}`;
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
  // v3.3.1 反馈⑦：班组面板不再展示事件流水（日志区已承担记录；班组只保留人员与调度）
  const totOut = staffOutputPerSec();
  const totSal = staffSalaryPerSec();
  container.innerHTML = `
    <div class="crew-head">
      <span class="crew-state" style="color:${meta.color}">● ${meta.label}</span>
      <span class="crew-count">${n} 条线程在岗</span>
    </div>
    <div class="crew-sum" style="font-size:11.5px;color:var(--text-2);margin:2px 0 8px">班组产出 <b class="mono">${fmt(totOut)}</b> EP/s · 薪资 <b class="mono" style="color:var(--bad)">${fmt(totSal)}</b> EP/s</div>
    <div class="crew-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn" data-autobind="1" ${leaderCount() > 0 ? '' : 'disabled'} title="领导者决策：对当前全部线程重新做一次岗位优化（已绑定的也会重排；无更优方案时不做改动）">智能分配（领导者决策）</button>
    </div>
    <div class="crew-help" style="font-size:11px;color:var(--text-3,#6e7681);margin-bottom:6px;line-height:1.7">绑定后该线程自由 EP 产出略降、消耗增多（抽调去转化）。匹配职业无惩罚且加成更高：🔭勘探员→探采、⚗️蒸馏师→灵感工坊、🥚饲育师→异兽孵化、🕯️祭司→信仰圣所；🎖️领导者提供全局加成并可「智能分配」；😪怠惰线程为负面（极少出现）</div>
    <div class="crew-grid">${cards}</div>
    ${pager}`;
  // v3.2.3 反馈①：分页按钮事件委托（容器级，重建不丢）
  if (!container._crewDelegated) {
    container._crewDelegated = true;
    container.addEventListener('click', (ev) => {
      const btn = ev.target.closest ? ev.target.closest('[data-crew-page]') : null;
      if (btn && !btn.disabled) { crewPage += btn.dataset.crewPage === 'prev' ? -1 : 1; renderCrewPanel(container); return; }
      const lb = ev.target.closest ? ev.target.closest('[data-leader]') : null;
      if (lb) {
        const c = S.cultists.find(x => String(x.id) === String(lb.dataset.leader));
        if (c) {
          // v3.3.1 反馈⑤：领导者同一时间只能有一位——晋升新人即自动卸任上一位
          if (!c.leader) {
            const prev = S.cultists.find(x => x.leader && x !== c);
            if (prev) { prev.leader = false; crewPush(`【${prev.name}】卸任领导者（领导者只能存在一位）`); }
            c.leader = true;
            crewPush(`【${c.name}】晋升为领导者，全局产出提升`, 'good');
          } else {
            c.leader = false;
            crewPush(`【${c.name}】卸任领导者`);
          }
          renderCrewPanel(container);
        }
        return;
      }
      const ab = ev.target.closest ? ev.target.closest('[data-autobind]') : null;
      if (ab) {
        // v3.3.5 反馈①：每次点击都对当前线程做一次完整重排（不再只填空闲线程）
        const k = autoAssignThreads();
        crewPush(k > 0 ? `领导者调度：重排 ${k} 条线程至更优岗位` : '领导者调度：当前分配已是最优，无需调整', k > 0 ? 'good' : '');
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
  // 班组概览（产出/薪资）每秒原地更新（不计入内容签名，避免每秒重建 DOM）
  const sumEls = container.querySelectorAll('.crew-sum b');
  if (sumEls.length >= 2) {
    sumEls[0].textContent = fmt(staffOutputPerSec());
    sumEls[1].textContent = fmt(staffSalaryPerSec());
  }
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
