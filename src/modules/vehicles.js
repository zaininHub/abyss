// v1.3 模块 D 第 2 层：载具持续采集 DM（每 60s 确定性到账）
// v2.4：不再概率掷骰——每 60s 按 collectVehicleDm() 确定性数值到账（小数累加，页头显示与到账同口径）
// 数值与档位表在 BALANCE.vehicles；产出 vehicleDmPerMin()/collectVehicleDm() 在 economy.js（纯读侧）
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { collectVehicleDm, vehicleDmPerMin, vehicleEpPerDm, dmCap } from './economy.js';
import { addDm, fmt } from './economy.js'; // v2.8.27 ②：DM 上限
import { converterEnabled } from './threadBinding.js'; // v3.3.4 反馈①：开关统一口径

let logFn = null;
export function setVehicleLogFn(fn) { logFn = fn; }

export { vehicleDmPerMin };

// 每 60s 触发一次确定性采集到账；返回 false（无变化）/ true（到账）
// v3.2.2 反馈①：去除「EP 不足自动暂停、需手动恢复」——开关只由玩家手动控制，
// EP 不足时本轮跳过（不扣费），EP 回升后下一周期自动恢复采集（提升挂机可玩性）
export function tickVehicleCollect(dt) {
  // v2.8.30：探采开关——关闭后 EP 扣减与 DM 获取全部暂停
  if (!converterEnabled('vehicles')) { S.vehCollectTimer = 0; S._probeEpShortSec = 0; return false; } // v3.3.4 反馈①：统一口径
  if (vehicleDmPerMin() <= 0) { S.vehCollectTimer = 0; S._probeEpShortSec = 0; return false; } // 无载具不计时
  // v3.2.2：旧档自动暂停标记清理（机制已废除）
  if (S._probeAutoPaused) S._probeAutoPaused = false;

  // v3.3.3 反馈⑧：DM 满仓跳过本轮（不扣 EP、计时冻结）——原实现 addDm 钳 0 但 EP 照扣，白烧资源
  if ((S.dm || 0) >= dmCap() - 1e-9) { S._dmFull = true; S._probeEpShortSec = 0; return false; }
  S._dmFull = false;
  // v3.3.6 反馈①：只买「装得下」的部分——原实现按理论产能全额扣 EP，DM 却按上限截断，
  // 高班组乘区下 94% 的 EP 白烧（名义 16499 DM/周期 → 实收 1000）
  const room = Math.max(0, dmCap() - (S.dm || 0));
  const wantDm = collectVehicleDm();
  const dm = Math.min(wantDm, room);
  const epCostPerCycle = dm * vehicleEpPerDm();
  // EP 不足：本轮跳过（不扣费、计时器冻结），EP 回升后自动继续
  if ((S.ep || 0) < epCostPerCycle) {
    S._probeEpShortSec = (S._probeEpShortSec || 0) + dt;
    return false;
  }
  // EP 充足：重置不足计时器
  S._probeEpShortSec = 0;

  // 正常 60s 周期采集
  S.vehCollectTimer = (S.vehCollectTimer || 0) + dt;
  if (S.vehCollectTimer < BALANCE.vehicles.collectInterval) return false;
  S.vehCollectTimer -= BALANCE.vehicles.collectInterval;
  if (dm <= 0) return false;
  S.ep -= epCostPerCycle;
  addDm(dm); // v2.8.27 ②：DM 存储上限（星尘金库扩容）
  return true;
}
