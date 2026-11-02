// v3.1.0 反馈③：线程拟人化「班组面板」——个人档案卡（状态灯/心情/个人产出/累计贡献/工龄）+ 班组事件流水
// 设计边界：薪资四态仍是全局状态机（wages.js），个人卡片的状态灯派生自全局态；
// 个体差异通过「个人产出基数（招募时随机）/ 心情（正交叠加）/ 累计贡献（按实际入账份额分摊）/ 工龄」表达。
// 流水 S.crewFeed 持久化（cap 40，随存档落盘），跨刷新保留——流失的线程不会被遗忘。
import { S } from '../state.js';
import { fmt, isLazy } from './economy.js';
import { MOOD_MULT } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';

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
  const names = pageCultists.map(c => `${c.name}:${c.mood}`).join(',');
  const sig = `${n}|${crewPage}|${meta.label}|${names}|${feed.map(f => f.msg).join('|')}`;
  if (container._lastSig === sig) { refreshCrewDyn(container, start, pageCultists); return; } // 增量：内容未变只刷新动态数值
  container._lastSig = sig;
  let cards = '';
  for (const c of pageCultists) {
    cards += `<div class="crew-card" style="border-left:3px solid ${meta.color}">
      <span class="crew-avatar">${MOOD_ICON[c.mood] || '🙂'}</span>
      <div class="crew-info">
        <div class="crew-name">${c.name} <span class="crew-mood">${c.mood}${MOOD_MULT[c.mood] ? ' ×' + MOOD_MULT[c.mood] : ''}</span></div>
        <div class="crew-stat">产出 <b class="c-out">0</b>/s · 贡献 <b class="c-earned">—</b> EP</div>
        <div class="crew-stat dim"><span class="c-tenure"></span></div>
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
    <div class="crew-grid">${cards}</div>
    ${pager}
    <div class="crew-feed">${feedHtml}</div>`;
  // v3.2.3 反馈①：分页按钮事件委托（容器级，重建不丢）
  if (!container._crewDelegated) {
    container._crewDelegated = true;
    container.addEventListener('click', (ev) => {
      const btn = ev.target.closest ? ev.target.closest('[data-crew-page]') : null;
      if (!btn || btn.disabled) return;
      crewPage += btn.dataset.crewPage === 'prev' ? -1 : 1;
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
    outEls[i].textContent = fmt((c.output || 3) * 0.8 * (MOOD_MULT[c.mood] || 1));
    earnEls[i].textContent = c.earned ? fmt(c.earned) : '—';
    if (tenEls[i]) tenEls[i].textContent = `已共事 ${c.hiredAt ? tenure(c) : '—'}`;
  }
}
