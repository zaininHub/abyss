import { S } from '../state.js';
import { computeCps, offlineRate, offlineCap, fmt, fmtTime, addEp } from './economy.js';

export function applyOffline() {
  const now = Date.now();
  const dt = (now - (S.lastSeen || now)) / 1000;
  if (dt < 60) return null;
  const eff = Math.min(dt, offlineCap());
  const cps = computeCps();
  let gain = 0;
  if (cps > 0) {
    const raw = cps * eff * offlineRate();
    // v2.1 拍板口径：离线收益受 EP 存储上限约束（防止离线一夜直接爆仓），
    // 统一走 addEp 入口，实发与预览同口径
    gain = addEp(raw);
    if (gain > 0) S.gotOffline = true;
  }
  // v2.6.6 ①：离线不增加任务进度——离线期间任务冻结（剩余时间不消耗、不到期结算、不补发新任务）
  const projDone = 0;
  const hours = eff / 3600;
  let bonusRp = 0;
  if (hours >= 1) {
    bonusRp = Math.floor(hours * 2 * (S.runTalent === 'fortunate' ? 2 : 1));
    if (bonusRp > 0) S.rp += bonusRp;
  }
  if (gain < 1 && bonusRp === 0) return null;
  S.lastOfflineSec = Math.floor(eff);
  S.lastOfflineGain = gain;
  S.offHistory.unshift({ t: now, sec: Math.floor(eff), ep: gain });
  if (S.offHistory.length > 10) S.offHistory.pop();
  return { gain, projDone, bonusRp, dt };
}

export function renderOfflinePanel(container) {
  if (!container) return;
  const hours = offlineCap() / 3600;
  const effRate = offlineRate();
  // v2.4.1：离线预期不再动态展示（原按当前 cps/EP 存量换算动态数字，数值跳动造成「没定数」观感）；
  // 改为静态口径说明，实际收益在回程离线结算时一次性落账（经 addEp，受 EP 存储上限约束）。
  let html = `<div class="off-stat"><span>当前离线效率</span><b>${Math.round(effRate * 100)}%</b></div>
    <div class="off-stat"><span>离线上限</span><b>${hours} 小时</b></div>
    <div class="off-stat"><span>离线收益</span><b>回程按效率×上限结算（受 EP 存储上限约束）</b></div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">离线升级（RP 购买）</div>
    <div id="offline-upg-list"></div>`;
  html += `<div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">最近离线记录</div>`;
  if (S.offHistory.length === 0) {
    html += `<div style="color:var(--text-3);font-size:11.5px">暂无记录</div>`;
  } else {
    for (const h of S.offHistory.slice(0, 5)) {
      const d = new Date(h.t);
      html += `<div class="off-stat"><span>${d.getMonth() + 1}/${d.getDate()} ${fmtTime(h.sec)}</span><b>+${fmt(h.ep)} EP</b></div>`;
    }
  }
  container.innerHTML = html;
}
