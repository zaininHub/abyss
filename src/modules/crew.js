// v3.1.0 反馈③：线程拟人化「班组面板」——个人档案卡（状态灯/心情/个人产出/累计贡献）+ 班组事件流水
// 设计边界：薪资四态仍是全局状态机（wages.js），个人卡片的状态灯派生自全局态；
// 个体差异通过「个人产出基数（招募时随机）/ 心情（正交叠加）/ 累计贡献（按实际入账份额分摊）」表达。
// v3.7.2 反馈③：卡面不再展示共事时长（信息噪音，且与岗位调度无关）。
// 流水 S.crewFeed 持久化（cap 40，随存档落盘），跨刷新保留——流失的线程不会被遗忘。
import { S } from '../state.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：倍率 → 带符号百分比
import { fmt, isLazy, staffSalaryPerSec, threadOutMult } from './economy.js'; // v4.2.7：个人消耗显示复用薪资真源（函数提升使 crew↔economy 循环 import 安全）；v4.3.18 反馈②：产线乘数补齐卡面产出口径；v4.3.23 反馈①：领导津贴下线
import { MOOD_MULT, CONVERTERS, HYPER_CONVERTER_ID } from '../data/threads.js';
import { BALANCE } from '../data/balance.js';
import {
  threadProfession, isLeader, isLazyProfession, threadLevel,
  autoAssignThreads, bindThread, unbindThread, releaseAllThreads, threadLevelMult, threadBindOutputFactor,
  unlockedConverterIds, converterLoad, converterCapacity, converterEnabled,
  leaderLvOf, leaderGlobalMult, leaderGlobalPercent,
} from './threadBinding.js'; // v3.3.0 线程绑定系统 // v3.3.2 反馈②：班组不再展示转化器开关（统一在快捷开关/研究点/异兽页） // v4.3.20 反馈②：未开启岗位灰显 // v4.3.23 反馈①：领导等级走普通 XP 路径（levelUpLeader/canLevelUpLeader 下线）
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
let crewPage = 1; // v4.3.6b：语义 = 已展示 chunk 数（累积加载，非翻页替换，1 起步）——已展示 = crewPage * PAGE_SIZE 条
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
  // v4.3.6b：累积加载 chunk 钳制——chunk 语义 = 已展示组数（1 起步），不超过总页数
  const pageCount = Math.max(1, Math.ceil(n / PAGE_SIZE));
  if (!Number.isFinite(crewPage) || crewPage < 1) crewPage = 1; // 初始至少展示第一组
  if (crewPage > pageCount) crewPage = pageCount;
  const start = 0, end = Math.min(crewPage * PAGE_SIZE, n); // v4.3.6b：累积渲染 0..end（旧卡保留）
  const pageCultists = filtered.slice(start, end);
  const detail = pageCultists.map(c => `${c.name}:${c.mood}:${c.profession}:${c.level}:${c.xp ? Math.floor(c.xp) : 0}:${c.boundTo || ''}:${c.leader ? 1 : 0}`).join(',');
  // v3.6.3 ③：可见岗位列表必须进签名——否则模块解锁后线程数据没变，面板会走增量刷新而不重建下拉
  // v4.0.0 反馈④：状态行已下线，签名不再因全局状态变化触发整卡重建；
  //   crewStateMeta() 仍保留导出（供其它模块/QA 读取），但面板不再渲染其文案与颜色。
  // v4.2.7 反馈③：fold 态入签名——否则点击标题时数据未变走增量刷新，折叠标题/内容体不重建（点了没反应）
  // v4.3.18 反馈①：有领导态入签名——智能分配按钮 disabled 随领导存在性切换，不入签名则
  //   晋升/卸任后 detail 未变走增量刷新，灰显不解除
  // v4.3.23 反馈①：领导等级 = 普通等级（c.level 已入 detail），独立 leadlv 段下线
  const hasLeaderNow = (S.cultists || []).some(c => isLeader(c));
  const sig = `${n}|${crewPage}|${detail}|${crewFilter}|${visibleTypes.join(',')}|fold:${container.dataset.crewFold || '0'}|lead:${hasLeaderNow ? 1 : 0}`;
  if (container._lastSig === sig) { refreshCrewDyn(container, start, pageCultists); return; } // 增量：内容未变只刷新动态数值
  container._lastSig = sig;
  // v4.3.14 反馈①：卡片 HTML 生成提取为局部函数——主循环与「自动填充」共用（消除两份拷贝漂移）。
  const crewCardHtml = (c) => {
    const p = threadProfession(c);
    // v4.3.19 反馈①：擅长岗位图标悬浮说明增强——原 title 只写岗位名（懒散者写 desc 长句），且原生
    //   title 有 ~1s 显示延迟被玩家感知为「问号没有任何悬浮窗」。改 DOM 即时气泡（data-aff-tip 锚点，
    //   bindAffTipPop 委托 #crew-panel），文案三段式：职业身份 + 擅长岗位 + 机制说明。
    const affTip = p
      ? (p.affinity === 'command'
        ? `🎖️ ${p.name}：可晋升为领导者（★，全局产出 +1%），不占用生产岗位`
        : p.affinity
          ? `${p.icon} ${p.name} · 擅长「${CONVERTERS[p.affinity] ? CONVERTERS[p.affinity].name : p.affinity}」岗位——绑定该岗位无产出/消耗惩罚；绑定其他岗位：产出 ×0.6、消耗 ×1.5`
          : `😪 ${p.name}：天生怠惰——绑定任何岗位产出 ×0.4、消耗 ×2.25（惩罚更重，建议保持空闲）`)
      : '该线程暂无职业（擅长岗位图标问号光标）——绑定任何岗位都按普通惩罚计（产出 ×0.6、消耗 ×1.5）';
    const affinityName = p && p.affinity && CONVERTERS[p.affinity] ? CONVERTERS[p.affinity].name : (p ? p.desc : '无擅长岗位');
    const affinityIcon = p
      ? `<span class="crew-affinity" data-aff-tip="${escAttr(affTip)}" style="font-size:13px;cursor:help" aria-label="${escAttr(affTip)}">${p.icon}</span>`
      : `<span class="crew-affinity" data-aff-tip="${escAttr(affTip)}" style="font-size:13px;cursor:help" aria-label="${escAttr(affTip)}">·</span>`;
    const lvl = threadLevel(c);
    // v4.3.23 反馈①：领导等级 = 普通线程等级（c.level 真源，XP 自动升级）——卡面统一 Lv 显示
    const isLead = isLeader(c);
    const lvHtml = ` <span class="crew-lv">Lv.${lvl}</span>`;
    // v4.3.13 反馈⑥：领导徽章去「领导」字样只留星标——双字徽章把身份行挤出两列栅格导致错位；
    //   领导身份完整语义仍在悬浮（stateTip「 · 领导」）。
    // v4.3.25 反馈③：全局加成线性口径——Lv1 +1.00%，每级 +0.01 个百分点，无津贴
    const leaderBadge = isLead ? ` <span style="color:var(--good,#3fb950)" title="领导（全局产出 +1% 起、每级 +0.01%；等级按普通线程在岗经验自动提升）">★</span>` : '';
    // v4.0.0 反馈④：成员卡不再展示「😪怠惰」等状态文字（心情倍率仍有数值意义，保留）。
    // 下拉：空闲 + 已解锁岗位；旧档绑定到已隐藏岗位时仅为该线程保留一项，避免状态显示错乱
    // v4.3.19 反馈②：满员岗位从下拉源头移除（不止标「已满」）——用户口径「岗位满了，下拉框就
    //   应该没这个岗位」（超线程恒无上限除外）。容量 = 设施数量（灵感工坊 2 座 → 2 坑）；
    //   自身在岗岗位保留（原地重选不占新坑，bindThread 放行）；旧档隐藏岗位绑定项同保留。
    //   智能分配 / 招募增量安置本就容量感知，此处补齐手动路径的最后缺口（v4.3.15 只做了标注+拒绝）。
    // v4.3.20 反馈②：未开启转化的岗位不进 opts（灰显口径反转）——用户 v4.3.20 口径「转化开启
    //   才可以分配线程到岗，没开启转化下拉框该岗位灰显」：满员=移除，未开启=灰显 disabled，
    //   玩家仍能看见该岗位存在（知道开了开关就能分）。超线程恒可选（无转化开关）。
    const opts = visibleTypes.filter(t =>
      t === HYPER_CONVERTER_ID
      || t === c.boundTo
      || converterLoad(t) < converterCapacity(t));
    if (c.boundTo && !opts.includes(c.boundTo)) opts.push(c.boundTo);
    const bindOpts = ['<option value="">空闲</option>'].concat(
      opts.map(t => {
        const off = t !== HYPER_CONVERTER_ID && t !== c.boundTo && !converterEnabled(t);
        return `<option value="${t}" ${c.boundTo === t ? 'selected' : ''}${off ? ' disabled' : ''}>${CONVERTERS[t] ? CONVERTERS[t].name : t}${visibleTypes.includes(t) ? '' : '（未解锁）'}${off ? '（未开启）' : ''}</option>`;
      })).join('');
    // v3.7.1 反馈①：领导者是全局加成位，不给岗位下拉；v3.7.3 反馈③：卡面不再写领导岗位说明文字
    const bindCtrl = isLead
      ? ''
      : `<select data-bind="${c.id}" style="font-size:11px;max-width:110px">${bindOpts}</select>`;
    // v4.3.15 反馈③：已有领导时其他线程不显示晋升按钮（领导唯一），卸任后恢复——
    //   「换领导」入口统一收敛到现任领导的「卸任★」，避免玩家误点直接顶替。
    // v4.3.23 反馈①：手动「升级★」按钮下线——领导等级走普通 XP 自动升级。
    const hasLeader = (S.cultists || []).some(x => isLeader(x) && x !== c);
    const leaderBtn = isLazyProfession(c) || (!isLead && hasLeader) ? '' :
      `<button class="btn" data-leader="${c.id}" style="font-size:11px;padding:2px 6px;margin-left:6px">${isLead ? '卸任★' : '晋升★'}</button>`; // v4.3.13 反馈⑥：去「领导」字样防错位
    // v4.2.8 反馈①②③：卡片三行紧凑栅格——
    //   ① 身份行：⚡心情图标（悬浮显示 岗位/超线程/心情/领导 完整状态）+ 线程名 + Lv + 擅长岗位图标（去文字，悬浮读名）；
    //   ② 数值行：+X EP/s -Y EP/s（带符号同式）；
    //   ③ 操作行：岗位下拉 + 晋升领导按钮 同排。
    //   保留 data-bind / data-leader / .c-out / .crew-avatar / .crew-affinity 全部既有钩子。
    const stateTip = `${c.name} · Lv.${lvl} · ${escAttr(c.boundTo ? (CONVERTERS[c.boundTo] ? CONVERTERS[c.boundTo].name : c.boundTo) : '空闲')}${c.mood ? ' · ' + c.mood : ''}${isLead ? ` · 领导（全局产出 +${leaderGlobalPercent().toFixed(2)}%）` : ''} · 擅长：${escAttr(affinityName)}`;
    return `<div class="crew-card">
      <div class="crew-line crew-line-id">
        <span class="crew-avatar" title="${stateTip}" aria-label="${stateTip}">${MOOD_ICON[c.mood] || '🙂'}</span>
        <span class="crew-name">${c.name}</span>${lvHtml}
        <span class="crew-aff-wrap">${affinityIcon}</span>${leaderBadge}
      </div>
      <div class="crew-line crew-line-num">
        ${isLead
          ? `<span class="crew-num">全局产出 +<b class="c-out">${leaderGlobalPercent().toFixed(2)}%</b></span>
        <span class="crew-num">-<b class="c-sal">0</b> EP/s</span>`
          : `<span class="crew-num">+<b class="c-out">0</b> EP/s</span>
        <span class="crew-num">-<b class="c-sal">0</b> EP/s</span>`}
      </div>
      <div class="crew-line crew-line-act">${bindCtrl}${leaderBtn}</div>
    </div>`;
  };
  let cards = '';
  for (const c of pageCultists) cards += crewCardHtml(c);
  if (!cards) cards = `<div class="crew-card more">${crewFilter ? '当前岗位暂无线程' : '暂无线程——去商店招募第一条线程'}</div>`;
  // v4.3.12 反馈①：进度文案删除——旧「已展示 N / M 条线程 · 下滑加载更多」常驻行在容器
  //   不可滚动时是死文案；改为仅列表真实可滚时显示「下滑加载更多」，否则不渲染 pager 行。
  //   可滚判定用近似（卡数 × 卡高 ~76px），渲染后由 crew-pager-maybe 二次校正（真实口径）。
  const approxH = end * 76 + 60; // 卡高 + 筛选行/标题
  const pager = end < n
    ? (approxH > container.clientHeight ? `<div class="crew-pager crew-pager-maybe"><span>下滑加载更多</span></div>` : '')
    : (pageCount > 1 ? `<div class="crew-pager"><span>已全部展示 ${n} 条线程${crewFilter && n !== nTotal ? `（筛选自全班组 ${nTotal}）` : ''}</span></div>` : '');
  // v3.3.1 反馈⑦：班组面板不再展示事件流水（日志区已承担记录；班组只保留人员与调度）
  // v4.2.7 反馈③：产出/薪资行删除（顶栏已有同口径），改为与效能编排同构的可折叠类目标题「班组 ▼」。
  //   产出/薪资仍是真实玩法数值，只是不在班组卡头重复；数字仍在顶栏 h-ep/h-salary 实时显示。
  const foldArrow = container.dataset.crewFold === '1' ? '▶' : '▼';
  container.innerHTML = `
    <div class="orch-block-title crew-block-title" data-crew-fold role="button" tabindex="0" aria-expanded="${container.dataset.crewFold === '1' ? 'false' : 'true'}"><span class="rp-fold-arrow">${foldArrow}</span> 班组</div>
    <div class="crew-fold-body" style="${container.dataset.crewFold === '1' ? 'display:none' : ''}">
    <div class="crew-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn" data-autobind="1" ${(S.cultists || []).some(c => isLeader(c)) ? '' : 'disabled'} title="${(S.cultists || []).some(c => isLeader(c)) ? '按设施容量分配：先把所有已解锁且开启的资源岗位按容量填满，放不下的才转入超线程；优先安排空闲线程，再纠正错位岗位；原本手动设定的超线程也会被拉回来优先补资源岗位' : '需先晋升一名领导（★）——领导是全局加成位、恒空闲，没有领导时全班组都在岗位上，没有可调配的全局位'}">智能分配</button>
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
  // v4.3.12 反馈①：pager 可滚判定二次校正——渲染后按真实 scrollHeight 口径，
  //   「不可滚但 pager 在」则移除（同步执行，无闪烁）。
  // v4.3.14 反馈①：滚动展开 bug 修复——班组卡是两列 grid（一行两个），首组 6 卡只占
  //   3 行，在宽视口下远不满容器（探针实测 ch=sh=600 不可滚）→ 玩家无法触底 →
  //   无法展开更多。参考成就口径补「自动填充」：渲染后若还有更多且内容不可滚，
  //   自动追加下一组（复用 crewCardHtml），循环直到可滚或全部展示（上限 pageCount 防失控）。
  {
    let guard = 0;
    while (crewPage < pageCount && container.scrollHeight <= container.clientHeight + 4 && guard++ < 50) {
      crewPage++;
      const end2 = Math.min(crewPage * PAGE_SIZE, n);
      const more = filtered.slice(pageCultists.length, end2).map(crewCardHtml).join('');
      if (!more) break;
      const grid = container.querySelector('.crew-grid');
      if (!grid) break;
      grid.insertAdjacentHTML('beforeend', more);
      pageCultists.push(...filtered.slice(pageCultists.length, end2)); // 后续 pager 文案口径
    }
    // 填充后按真实口径修正 pager（v4.3.14 反馈①：自动填充范式取代 crew-pager-maybe 二次校正——
    //   不可滚即自动追加下一组，pager 文案在填充后按真实组数回写）
    const pagerEl = container.querySelector('.crew-pager');
    if (pagerEl && crewPage >= pageCount) {
      const sp = pagerEl.querySelector('span');
      if (sp) sp.textContent = `已全部展示 ${n} 条线程${crewFilter && n !== nTotal ? `（筛选自全班组 ${nTotal}）` : ''}`;
    } else if (!pagerEl) {
      // 填充后仍不可滚且还有更多（罕见：卡高异常）→ 兜底补 pager
      const body = container.querySelector('.crew-fold-body');
      if (body && crewPage < pageCount) body.insertAdjacentHTML('beforeend', '<div class="crew-pager crew-pager-maybe"><span>下滑加载更多</span></div>');
    }
  }
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
            if (prev) {
              prev.leader = false;
              // v4.3.23 反馈①：卸任/任命都不动 level/xp——等级是线程自身属性，跨任命保留
              crewPush(`【${prev.name}】卸任领导者（Lv.${threadLevel(prev)} 经验保留，回归普通线程）`);
            }
            c.leader = true;
            // v4.3.23 反馈①：任命不再重置 worker 等级——领导等级 = 普通线程等级，
            //   在岗持续积 XP 自动升级（tickThreads），晋升高等级线程当领导加成更高。
            // v3.7.1 反馈①：领导者只提供全局加成，不能同时占用岗位
            if (c.boundTo) { unbindThread(c); crewPush(`【${c.name}】撤离原岗位`); }
            const pct = (leaderGlobalMult() - 1) * 100;
            crewPush(`【${c.name}】就任领导（Lv.${threadLevel(c)}，全局产出 +${pct.toFixed(2)}%，随等级提升）`, 'good');
          } else {
            // v4.3.23 反馈①：卸任保留等级（等级是线程自身属性）
            c.leader = false;
            crewPush(`【${c.name}】卸任领导者（Lv.${threadLevel(c)} 经验保留，回归普通线程）`);
          }
          renderCrewPanel(container);
        }
        return;
      }
      // v4.3.23 反馈①：手动「升级★」按钮下线——领导等级走普通 XP 自动升级，data-lead-up 处理段删除
      const ab = ev.target.closest ? ev.target.closest('[data-autobind]') : null;
      if (ab) {
        // v4.3.13 反馈⑥：智能分配前置要求已设置领导——领导是全局加成位、恒空闲，
        //   无领导时全班组都在岗位上，玩家没有可调配的全局位；先晋升一名领导再分配。
        if (!(S.cultists || []).some(c => isLeader(c))) {
          crewPush('请先晋升一名领导（★），再使用智能分配', 'bad');
          renderCrewPanel(container);
          return;
        }
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
        crewPage = 1; // v4.3.6b：筛选变更重置为初始一组（累积语义下 1 = 首组已展示）
        renderCrewPanel(container);
        return;
      }
      const sel = ev.target.closest ? ev.target.closest('[data-bind]') : null;
      if (!sel) return;
      const c = S.cultists.find(x => String(x.id) === String(sel.dataset.bind));
      if (!c) return;
      const v = sel.value;
      if (v) {
        // v4.3.15 反馈②：bindThread 容量钳制拒绝（岗位满员）→ 回显旧值 + 提示玩家
        if (!bindThread(c, v)) {
          crewPush(`【${c.name}】分配失败：${CONVERTERS[v] ? CONVERTERS[v].name : v} 已满员（容量 = 设施数量），请先升级设施或换岗`, 'bad');
          sel.value = c.boundTo || '';
          return;
        }
        const match = threadProfession(c) && threadProfession(c).affinity === v;
        crewPush(`【${c.name}】分配至${CONVERTERS[v].name}${match ? '（擅长岗位，无 EP/消耗惩罚）' : ''}`, 'good');
      } else { unbindThread(c); crewPush(`【${c.name}】从岗位撤离（消耗恢复）`, ''); }
      renderCrewPanel(container);
    });
    // v4.3.3 反馈②：滚动触底自动翻页。判定用当前筛选后的总条数。
    // v4.3.6b：累积式加载——触底「追加」下一组（旧卡保留），重建后恢复滚动位置（不跳顶）。
    // v4.3.12 反馈②：10s 无操作回缩——与成就面板同款（累积组 10s 无滚动收起回第一页）。
    container.addEventListener('scroll', () => {
      if (container._crewScrollLock || container.dataset.crewFold === '1') return;
      // 任何滚动都算「操作」：刷新回缩计时（crewPage=1 时不挂计时器）
      clearTimeout(container._crewIdleTimer);
      if (crewPage > 1) {
        container._crewIdleTimer = setTimeout(() => {
          crewPage = 1; // 收起回第一页
          container._keepScroll = null;
          renderCrewPanel(container);
        }, 10000);
      }
      const total = container._crewTotal || 0;
      if (crewPage * PAGE_SIZE >= total) return; // 已全部展示
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 20) {
        container._crewScrollLock = true;
        crewPage++; // 追加下一组
        container._keepScroll = container.scrollTop; // 保持视口（累积追加不跳顶）
        renderCrewPanel(container);
        requestAnimationFrame(() => { container._crewScrollLock = false; });
      }
    }, { passive: true });
  }
  container._crewTotal = n; // v4.3.3 反馈②：滚动翻页判定总条数（筛选后）；v4.3.14：含自动填充后的 crewPage 口径
  // v4.3.6b：重建后恢复滚动位置（累积追加时视口不跳）
  // v4.3.7 反馈⑥：fallback 实时捕获——与成就面板同根因（dirty-periodic 周期重建重置 scrollTop，
  // _keepScroll 只在触底追加时写入且读后即清，第二次周期重建即跳顶）。常规重建也捕获实时位置，
  // 周期刷新不再打断浏览；scrollTop=0 时不空耗 rAF。
  const keep = container._keepScroll != null ? container._keepScroll : container.scrollTop;
  container._keepScroll = null;
  if (keep != null && keep > 0) {
    requestAnimationFrame(() => { container.scrollTop = keep; });
  }
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
  // v4.3.18 反馈②：产线放大（专注/建筑/研究/CPU/GPU）真源——消耗侧 salPer 已含该放大
  //（salaryBase 按 outMult 后口径计薪），产出行不吃就会在产线成型后倒挂（10 级超线程
  // 「+8.9/-14」观感根因）。补齐后产出/消耗同口径可比；纯显示层，EP 生产速度不变。
  const outLine = threadOutMult();
  for (let i = 0; i < outEls.length && i < pageCultists.length; i++) {
    const c = pageCultists[i];
    // v4.3.21 反馈⑥：领导卡产出行由 crewCardHtml 模板直出（+X% 全局），
    //   动态刷新只跳产出行；普通线程产出行照刷（同 staffOutputParts 口径）。
    if (c.leader !== true) {
      // v4.3.18 反馈②：与 staffOutputParts 的 one×factor 同式（outMult 口径对齐），显示=实扣
      const out = (c.output || 3) * 0.8 * (MOOD_MULT[c.mood] || 1) * outLine * threadLevelMult(threadLevel(c)) * threadBindOutputFactor(c);
      outEls[i].textContent = fmt(out);
    }
    // v4.2.7 反馈①：个人消耗 = 平均薪资 × 岗位系数（与 staffSalaryPerSec 的 bindAvg 口径同源）
    // v4.3.23 反馈①：领导津贴下线——领导消耗回归普通平均摊派口径（卡面显示与实扣一致）
    if (salEls[i]) salEls[i].textContent = fmt(salPer * salaryFactorOf(c));
  }
}

// v4.2.7 反馈①：单人薪资系数（与 economy.staffSalaryPerSec 的 bindAvg 同口径）
function salaryFactorOf(c) {
  if (!c.boundTo) return 1;
  if (c.boundTo === HYPER_CONVERTER_ID) return 1.1;
  return 1; // 其它岗位的差异已由 economy 的 bindAvg 全局摊平，卡内展示取平均口径
}
