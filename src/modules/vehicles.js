// v1.3 模块 D 第 2 层：载具持续采集 DM（每 60s 确定性到账）
// v2.4：不再概率掷骰——每 60s 按 collectVehicleDm() 确定性数值到账（小数累加，页头显示与到账同口径）
// 数值与档位表在 BALANCE.vehicles；产出 vehicleDmPerMin()/collectVehicleDm() 在 economy.js（纯读侧）
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { collectVehicleDm, vehicleDmPerMin, vehicleDmEpCostPerMin } from './economy.js';
import { computeCps, staffSalaryPerSec } from './economy.js'; // v2.8.12：净流限制（产出一薪资-探采消耗 > 0 才采集）

let logFn = null;
export function setVehicleLogFn(fn) { logFn = fn; }

export { vehicleDmPerMin };

// 每 60s 触发一次确定性采集到账；返回本帧是否到账（供脏标记）
export function tickVehicleCollect(dt) {
  if (vehicleDmPerMin() <= 0) { S.vehCollectTimer = 0; return false; } // 无载具不计时
  S.vehCollectTimer = (S.vehCollectTimer || 0) + dt;
  if (S.vehCollectTimer < BALANCE.vehicles.collectInterval) return false;
  S.vehCollectTimer -= BALANCE.vehicles.collectInterval;
  const dm = collectVehicleDm();
  if (dm > 0) {
    // v2.8.12：探采消耗 EP——净流（产出一薪资-探采消耗）> 0 且余额可支付本周期才采集，否则暂停（DM 不产）
    const epPerSec = vehicleDmEpCostPerMin() / 60;
    const epCost = epPerSec * BALANCE.vehicles.collectInterval;
    const net = computeCps() - staffSalaryPerSec() - epPerSec;
    if (net > 0 && S.ep >= epCost) {
      S.ep -= epCost;
      S.dm = (S.dm || 0) + dm;
      if (logFn) logFn(`[采集] 载具采集：-${Math.round(epCost)} EP → +${Number(dm.toFixed(3))} DM`, 'good');
      return true;
    }
    if (logFn) logFn(`[采集] 探采暂停：EP 净产出不足（净流 ${Number(net.toFixed(2))}/s 需 > 0）`, 'bad');
  }
  return false;
}
