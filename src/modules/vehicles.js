// v1.3 模块 D 第 2 层：载具持续采集 DM（每 60s 确定性到账）
// v2.4：不再概率掷骰——每 60s 按 collectVehicleDm() 确定性数值到账（小数累加，页头显示与到账同口径）
// 数值与档位表在 BALANCE.vehicles；产出 vehicleDmPerMin()/collectVehicleDm() 在 economy.js（纯读侧）
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { collectVehicleDm, vehicleDmPerMin, vehicleDmEpCostPerMin } from './economy.js';
import { addDm, fmt } from './economy.js'; // v2.8.27 ②：DM 上限

let logFn = null;
export function setVehicleLogFn(fn) { logFn = fn; }

export { vehicleDmPerMin };

// v3.0.2：自动暂停统一口径——EP 不足持续 AUTO_PAUSE_GRACE 秒才暂停（缓冲期防反复横跳）；
// 暂停后不自动恢复（需手动点开关恢复），避免 EP 在阈值附近波动导致暂停-恢复抖动
const AUTO_PAUSE_GRACE = 5; // 秒

// 每 60s 触发一次确定性采集到账；返回 false（无变化）/ true（到账）/ 'transition'（自动暂停切换）
// v3.0.2 改动：
//   · EP 不足每帧累积缓冲计时器，持续 5s 才自动暂停（此前 60s 周期到才判定，EP 短暂 dips 不触发）；
//   · 自动暂停后不自动恢复（删除原"EP 充足自动恢复"逻辑）——需手动点探采开关恢复；
//   · 缓冲期内 EP 恢复则重置计时器（不暂停）。
export function tickVehicleCollect(dt) {
  // v2.8.30：探采开关——关闭后 EP 扣减与 DM 获取全部暂停
  if (S._probeEnabled === false) { S.vehCollectTimer = 0; S._probeEpShortSec = 0; return false; }
  if (vehicleDmPerMin() <= 0) { S.vehCollectTimer = 0; S._probeEpShortSec = 0; return false; } // 无载具不计时
  // v3.0.2：已自动暂停——不自动恢复（需手动点开关恢复）
  if (S._probeAutoPaused) { S.vehCollectTimer = 0; return false; }

  const epCostPerCycle = (vehicleDmEpCostPerMin() / 60) * BALANCE.vehicles.collectInterval;
  // v3.0.2：EP 不足缓冲判定（每帧累积，持续 5s 才暂停）
  if ((S.ep || 0) < epCostPerCycle) {
    S._probeEpShortSec = (S._probeEpShortSec || 0) + dt;
    if (S._probeEpShortSec >= AUTO_PAUSE_GRACE) {
      S._probeAutoPaused = true;
      S._probeEpShortSec = 0;
      S.vehCollectTimer = 0;
      if (logFn) logFn(`探采自动暂停：EP 持续不足 ${AUTO_PAUSE_GRACE}s（需 ${fmt(epCostPerCycle)} EP/周期）——需手动点开关恢复`, 'bad');
      return 'transition';
    }
    return false; // 缓冲期内不扣费（EP 不足）
  }
  // EP 充足：重置缓冲计时器
  S._probeEpShortSec = 0;

  // 正常 60s 周期采集
  S.vehCollectTimer = (S.vehCollectTimer || 0) + dt;
  if (S.vehCollectTimer < BALANCE.vehicles.collectInterval) return false;
  S.vehCollectTimer -= BALANCE.vehicles.collectInterval;
  const dm = collectVehicleDm();
  if (dm <= 0) return false;
  S.ep -= epCostPerCycle;
  addDm(dm); // v2.8.27 ②：DM 存储上限（星尘金库扩容）
  return true;
}

// v3.0.2：手动恢复自动暂停（探采开关点击时调用——清除 _probeAutoPaused，不切换 _probeEnabled）
export function manualResumeProbe() {
  if (!S._probeAutoPaused) return false;
  S._probeAutoPaused = false;
  S._probeEpShortSec = 0;
  S.vehCollectTimer = 0;
  if (logFn) logFn('探采手动恢复：已清除自动暂停标记，载具重新启程', 'good');
  return true;
}
