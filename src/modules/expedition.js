import { S, save } from '../state.js';
import { computeCps, fmt, fmtTime, hasTech, addEp } from './economy.js';
import { log, toast } from '../main.js';

export const GALAXIES = [
  { id: 'moon',     name: '月球基地',   dur: 30,    cpsReq: 0,    reward: { type: 'ep', mult: 5 },   desc: '短平快探索' },
  { id: 'mars',     name: '火星前哨',   dur: 120,   cpsReq: 100,  reward: { type: 'ep', mult: 30 },  desc: '稳定收益' },
  { id: 'jupiter',  name: '木星轨道',   dur: 600,   cpsReq: 1e3,  reward: { type: 'rp', amount: 5 }, desc: 'RP 奖励' },
  { id: 'centauri', name: '半人马座',   dur: 3600,  cpsReq: 1e5,  reward: { type: 'rp', amount: 20 }, desc: '大量 RP' },
  { id: 'edge',     name: '银河边缘',   dur: 14400, cpsReq: 1e6,  reward: { type: 'es', amount: 1 }, desc: '永恒碎片' },
  { id: 'andromeda', name: '仙女座',    dur: 28800, cpsReq: 1e8,  reward: { type: 'es', amount: 5 }, desc: '丰厚 ES' },
];

export function maxExpeditions() { return hasTech('deep_space') ? 2 : 1; }

export function renderExpeditions(container) {
  if (!container) return;
  const now = Date.now();
  const cps = computeCps();
  let html = `<div style="color:var(--text-2);font-size:11.5px;margin-bottom:8px">
    派遣探测队探索星系，自动返回奖励。最多 ${maxExpeditions()} 路并行。</div>`;
  // 当前进行中
  html += `<div style="font-size:11px;color:var(--text-2);margin:8px 0 4px">进行中（${S.expeditions.length}/${maxExpeditions()}）</div>`;
  if (S.expeditions.length === 0) {
    html += `<div style="color:var(--text-3);font-size:11.5px;padding:4px 0">暂无探索任务</div>`;
  } else {
    for (const ex of S.expeditions) {
      const g = GALAXIES.find(x => x.id === ex.galaxyId);
      const pct = Math.min(100, (now - ex.startsAt) / ex.duration * 100);
      const left = Math.max(0, (ex.duration - (now - ex.startsAt)) / 1000);
      html += `<div class="proj">
        <div class="pn"><span>${g.icon || '🛰'} ${g.name}</span><span class="mono" style="color:var(--cyan)">${fmtTime(left)}后返回</span></div>
        <div class="pt"><div style="width:${pct}%;background:var(--cyan)"></div></div>
      </div>`;
    }
  }
  // 可选星系列表
  html += `<div style="font-size:11px;color:var(--text-2);margin:12px 0 4px">选择目的地</div>`;
  for (const g of GALAXIES) {
    const unlocked = cps >= g.cpsReq;
    const busy = S.expeditions.length >= maxExpeditions();
    const rewardStr = g.reward.type === 'ep' ? `cps × ${g.reward.mult} 倍时长EP`
      : g.reward.type === 'rp' ? `${g.reward.amount} RP`
      : `${g.reward.amount} ES`;
    if (!unlocked) {
      html += `<div class="off-upg" style="opacity:.5"><span>${g.name}<br><span style="color:var(--text-3)">需 cps ${fmt(g.cpsReq)}</span></span>
        <span style="color:var(--text-3)">—</span></div>`;
    } else {
      html += `<div class="off-upg" data-galaxy="${g.id}" style="cursor:${busy ? 'not-allowed' : 'pointer'}">
        <span>${g.name}<br><span style="color:var(--text-3)">${g.desc} · ${fmtTime(g.dur)}</span></span>
        <span style="color:${g.reward.type === 'es' ? 'var(--warn)' : 'var(--cyan)'}">${rewardStr}</span></div>`;
    }
  }
  container.innerHTML = html;
  container.querySelectorAll('[data-galaxy]').forEach(div => {
    div.addEventListener('click', () => {
      if (S.expeditions.length >= maxExpeditions()) { toast('探索队列已满'); return; }
      const g = GALAXIES.find(x => x.id === div.dataset.galaxy);
      S.expeditions.push({ galaxyId: g.id, startsAt: Date.now(), duration: g.dur * 1000 });
      log(`探索出发：${g.name}`, 'good');
      save(S);
      renderExpeditions(container);
    });
  });
}

export function tickExpeditions() {
  if (S.expeditions.length === 0) return;
  const now = Date.now();
  const done = [];
  S.expeditions = S.expeditions.filter(ex => {
    if (now - ex.startsAt >= ex.duration) { done.push(ex); return false; }
    return true;
  });
  for (const ex of done) {
    const g = GALAXIES.find(x => x.id === ex.galaxyId);
    if (g.reward.type === 'ep') {
      const gain = computeCps() * (ex.duration / 1000) * g.reward.mult;
      addEp(gain); // v2.1 D1：统一入口，受 EP 存储上限约束
      log(`探索返回：${g.name}，+${fmt(gain)} EP`, 'good');
    } else if (g.reward.type === 'rp') {
      S.rp += g.reward.amount;
      log(`探索返回：${g.name}，+${g.reward.amount} RP`, 'good');
    } else if (g.reward.type === 'es') {
      S.es += g.reward.amount;
      log(`探索返回：${g.name}，+${g.reward.amount} ES`, 'good');
    }
    S.expeditionsDone++;
    // 深空探索有概率获得信仰
    if ((ex.galaxyId === 'edge' || ex.galaxyId === 'andromeda') && Math.random() < 0.15) {
      S.faith = (S.faith || 0) + 1;
      log('探索中感受到神意：+1 信仰', 'good');
    }
    toast(`探索完成：${g.name}`);
  }
}
