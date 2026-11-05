// 纯价格算法内核（无 S / 无 DOM 依赖）
// 设计目标：所有「首价便宜、后期指数上涨、加成复利」的定价都从同一组原语派生，
// 避免 unitCost / focusCost / staffCostBase / vehicleEpPerDm / researchMult / vaultCap
// 各自重复几何公式（旧版散落多处、口径漂移是反复出 bug 的根因）。
//
// 本模块可在 Node 单测中直接 import（不需要 localStorage / 浏览器），
// 因此可对「游戏推进」做纯数值 mock 与预期天数反推（见 simulateProgression / deriveGeomGrowth）。

// 几何单价：base · growth^(owned+qty) · mult，向上取整（单资源口径）。
// qty=1 即「下一级」单价；owned 为已持有级数。
export function geomCostBase({ base, growth = 1.3, owned = 0, qty = 1, mult = 1 }) {
  const raw = geomCostRaw({ base, growth, owned, qty, mult });
  return Number.isFinite(raw) ? Math.ceil(raw) : Infinity;
}

// 几何单价原始值（不取整）——供 staffCostBase / vehicleEpPerDm 等在外部统一取整的口径复用，
// 避免在内层多一次 ceil 改变既有数值结果。
export function geomCostRaw({ base, growth = 1.3, owned = 0, qty = 1, mult = 1 }) {
  return base * Math.pow(growth, owned + qty) * mult;
}

// 几何级批量成本：逐单 ceil 求和，与 unitCost 循环口径一致。
// 不使用闭合式 Σ，避免省去逐单 ceil 造成数值偏差（旧 bulkCostCalc 即此循环）。
export function bulkGeomCost({ base, growth = 1.3, owned = 0, qty = 1, mult = 1 }) {
  let t = 0;
  for (let i = 0; i < qty; i++) t += geomCostBase({ base, growth, owned: owned + i, qty: 0, mult });
  return t;
}

// 幂律规模：base · (index+1)^exponent（转生需求、阶进门槛等）。
export function powerScale({ base, exponent, index }) {
  return base * Math.pow(index + 1, exponent);
}

// 复利加成：线性 (1 + perLevel·levels) / 乘算 (1+perLevel)^levels。
// 研究点、遗物、回响、种族升级等「每级 +x%」统一走这里。
export function compoundBuff({ base = 1, perLevel, levels = 0, mode = 'linear' }) {
  if (mode === 'multiplicative') return base * Math.pow(1 + perLevel, levels);
  return base * (1 + perLevel * levels);
}

// 等比级数前 n 项和（首项 first，公比 growth）：first·(growth^n − 1)/(growth − 1)。
// vaultCap / 仓库扩容等「逐级递增增量」统一走这里。
export function geomSeriesSum({ first, growth, n }) {
  const lv = Math.max(0, Math.floor(n));
  if (lv <= 0) return 0;
  if (growth === 1) return first * lv;
  return (first * (Math.pow(growth, lv) - 1)) / (growth - 1);
}

// 由目标反推增长率：欲使第 (owned+purchases) 次购买成本 = targetCost，返回 growth。
// 这是「按预期天数推算定价」的核心原语：
//   先定里程碑天数 → 估该天可用资源 → 求该级增长系数（见 simulateProgression）。
export function deriveGeomGrowth({ base, targetCost, owned = 0, purchases = 1 }) {
  const exp = owned + purchases;
  if (exp <= 0 || !(base > 0) || !(targetCost > 0)) return 1;
  return Math.pow(targetCost / base, 1 / exp);
}

// 推进模拟器（纯函数，无 S/DOM）：按「贪心买最便宜可负担项」推进 days 天，
// 输出每个升级的购入日与成本曲线，供数值验收与「预期天数」反推。
//
// 模型：
//   - 每升级 id 贡献 (u.cps || 0) 产出；epPerSec = (startCps + Σu.cps·owned) · buff
//   - 每日产出自带复利 dailyMul（dailyMul 每过一天 ×一次），模拟「产出随时间指数上涨」
//   - 逐 dt 小时步进累加 EP，每步贪心购买当前可负担的最便宜项
//
// 返回 { buys:[{id,day,cost}], owned, finalCps, daysToMilestone }
export function simulateProgression({
  upgrades, startCps = 0, dailyMul = 1, days = 30, dtHours = 0.5,
  buffPerLevel = 0, buffLevels = 0, milestoneId = null,
}) {
  const owned = {};
  let ep = 0;
  const buff = compoundBuff({ base: 1, perLevel: buffPerLevel, levels: buffLevels, mode: 'linear' });
  const outputOf = () => {
    let base = startCps;
    for (const u of upgrades) base += (u.cps || 0) * (owned[u.id] || 0);
    return base * buff;
  };
  const buys = [];
  const dt = dtHours / 24; // 天
  let day = 0;
  const steps = Math.ceil(days / dt);
  for (let step = 0; step < steps; step++) {
    const newDay = Math.floor((step + 1) * dt);
    if (newDay > day) day = newDay;
    const epPerSec = outputOf() * Math.pow(dailyMul, day);
    ep += epPerSec * dt * 86400;
    // 贪心：反复购买当前可负担的最便宜项（同一天可买多个）
    let bought = true;
    while (bought) {
      bought = false;
      let best = null, bestCost = Infinity;
      for (const u of upgrades) {
        const cost = geomCostBase({ base: u.base, growth: u.growth || 1.3, owned: owned[u.id] || 0, qty: 1, mult: u.mult || 1 });
        if (cost <= ep && cost < bestCost) { best = u; bestCost = cost; }
      }
      if (best) {
        ep -= bestCost;
        owned[best.id] = (owned[best.id] || 0) + 1;
        buys.push({ id: best.id, day, cost: bestCost });
        bought = true;
      }
    }
  }
  const daysToMilestone = milestoneId != null ? (buys.find(b => b.id === milestoneId)?.day ?? null) : null;
  return { buys, owned, finalCps: outputOf() * Math.pow(dailyMul, day) * buff, daysToMilestone };
}
