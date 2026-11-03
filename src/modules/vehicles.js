// v1.3 模块 D 第 2 层：载具持续采集 DM（每 60s 确定性到账）
// v2.4：不再概率掷骰——每 60s 按 collectVehicleDm() 确定性数值到账（小数累加，页头显示与到账同口径）
// 数值与档位表在 BALANCE.vehicles；产出 vehicleDmPerMin()/collectVehicleDm() 在 economy.js（纯读侧）
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { vehicleDmPerMin, vehicleEpPerDm, dmCap } from './economy.js';
import { addDm, fmt } from './economy.js'; // v2.8.27 ②：DM 上限
import { converterEnabled } from './threadBinding.js'; // v3.3.4 反馈①：开关统一口径

let logFn = null;
export function setVehicleLogFn(fn) { logFn = fn; }

export { vehicleDmPerMin };

// v3.3.8 反馈①：改为**连续结算**（每帧按 EP/s 扣、DM/s 入账）——不再有「周期」概念：
// 开启后一路扣 EP 直到扣到 0，EP 归零即停产（回升自动继续），不会再出现「EP 不足，本周期跳过」这类打断感文案。
// DM 按剩余容量钳制（装不下就不买），永不为溢出量付费。
export function tickVehicleCollect(dt) {
  if (!converterEnabled('vehicles')) { S.vehCollectTimer = 0; return false; } // v3.3.4 反馈①：统一口径
  const perMin = vehicleDmPerMin();
  if (perMin <= 0) { S.vehCollectTimer = 0; return false; } // 无载具不采集
  if (S._probeAutoPaused) S._probeAutoPaused = false; // v3.2.2：旧档自动暂停标记清理（机制已废除）
  S.vehCollectTimer = (S.vehCollectTimer || 0) + dt; // 兼容旧档字段（仅计时展示用）
  const room = Math.max(0, dmCap() - (S.dm || 0));
  if (room <= 1e-9) { S._dmFull = true; return false; } // DM 满仓：停止采集也不扣 EP
  S._dmFull = false;
  const epPerDm = vehicleEpPerDm();
  const budgetDm = epPerDm > 0 ? (S.ep || 0) / epPerDm : Infinity; // 当前 EP 还能买多少 DM
  const dm = Math.min((perMin / 60) * dt, room, budgetDm);
  if (dm <= 1e-12) return false;
  S.ep = Math.max(0, (S.ep || 0) - dm * epPerDm);
  addDm(dm); // v2.8.27 ②：DM 存储上限（星尘金库扩容）
  return true;
}
