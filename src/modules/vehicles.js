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

// 每 60s 触发一次确定性采集到账；返回 false（无变化）/ true（到账）/ 'transition'（自动暂停↔恢复切换）
// v2.9.0 Bug④修复：
//   · 自动暂停后 EP 充足即自动恢复（带 3 周期缓冲迟滞，避免临界点反复横跳）；
//   · 暂停/恢复只在状态切换瞬间各打一条日志（此前每个采集周期都刷「探采暂停」→ 日志刷屏）；
//   · 暂停不再以「净流 > 0」为硬门槛——净流长期为负时探采永无恢复之日（用户反馈「暂停后不会自动恢复」根因），
//     改为只看 EP 存量是否够付本周期（玩家可用手动开关长期关停）。
export function tickVehicleCollect(dt) {
  // v2.8.30：探采开关——关闭后 EP 扣减与 DM 获取全部暂停
  if (S._probeEnabled === false) { S.vehCollectTimer = 0; return false; }
  if (vehicleDmPerMin() <= 0) { S.vehCollectTimer = 0; return false; } // 无载具不计时
  S.vehCollectTimer = (S.vehCollectTimer || 0) + dt;
  if (S.vehCollectTimer < BALANCE.vehicles.collectInterval) return false;
  S.vehCollectTimer -= BALANCE.vehicles.collectInterval;
  const dm = collectVehicleDm();
  if (dm <= 0) return false;
  const epCost = (vehicleDmEpCostPerMin() / 60) * BALANCE.vehicles.collectInterval;
  // 恢复门槛（迟滞）：暂停中需 EP ≥ 3 个周期成本才恢复；正常采集只需付得起本周期
  const need = S._probeAutoPaused ? epCost * 3 : epCost;
  if ((S.ep || 0) >= need) {
    const resumed = !!S._probeAutoPaused;
    if (resumed) {
      S._probeAutoPaused = false;
      if (logFn) logFn('探采恢复：EP 已充足，载具重新启程', 'good');
    }
    S.ep -= epCost;
    addDm(dm); // v2.8.27 ②：DM 存储上限（星尘金库扩容）
    // v2.8.20 ②：采集到账不再打印日志（用户多轮要求「不要打印了」；保留暂停/恢复边缘提示）
    return resumed ? 'transition' : true;
  }
  if (!S._probeAutoPaused) {
    S._probeAutoPaused = true;
    if (logFn) logFn(`探采暂停：EP 不足以支付本周期采集（需 ${fmt(epCost)} EP）——EP 充足后自动恢复`, 'bad');
    return 'transition';
  }
  return false;
}
