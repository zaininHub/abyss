// 分章节测试体系 · 章节预算表（v4.2.6 反馈②，方案文档步骤 2；v4.2.6 校准版）
//
// 每章声明「跑完本章（第 N 章开局 → 第 N+1 章内完成晋升）后的预期携带」：
//   - minPrestige：章内至少完成的晋升次数增量
//   - es / rp / pp：跨局资源「增量区间」（±50% 宽度，只拦数量级错误——硬编码精确值会随
//     数值调参频繁碎裂；精确校验由单测护栏重算公式兜底）
//   - maxDays：单章模拟天上限（超时判「预算不可达」FAIL，输出瓶颈资源曲线）
//   - carry：本章「预计晋升携带到下一章的输入」校准起点（用户口径：把预计晋升携带到下个
//     章节的资源作为输入）。链式跑用真实快照；独立跑（--from N）时若真实快照低于 carry
//     下限则垫高到 carry（模拟「上一章已按预算完成晋升」），高于则用真实值。垫高只是
//     起点补齐——驻留天数与晋升节奏照常真实跑，时间门控不绕过。
//
// carry 推导（economy.js 单一真源）：
//   prestigeNeed(p) = floor(3e9 · (p+1)^1.5)；esGain = floor(sqrt(runEarned/2e7))；
//   canPrestige 即升时 runEarned≈1.0~1.3×need → 单次晋升 ES≈floor(sqrt(need·1.15/2e7))。
//   第 N 章开局 prestige ≈ 前 N-1 章 minPrestige 累计（保底链，单测护栏 C1 锁死）。
//
// 校准依据（v4.2.6 实测，--from 1 --to 1 两轮真实试玩）：
//   - ch1 零起点：首升实际发生在 D36（外推 35 天准确）；晋升重置后 CPS 回落 214/s，
//     D40 推进第 2 章（prestige>=2 条件由 pp>=1 满足——minPrestige=2 过严，实测 1 升即推进）
//   - D66 终态：晋升 1 次 / ES 12 / 第 2 章；二升 need 8.49e9 未达成（D36 重置后攒速骤降）
//   - 结论①：ch2 进章条件是 prestige>=2 || pp>=1——1 次晋升（pp≥1）即推进，minPrestige 应为 1
//   - 结论②：晋升后 CPS 重置让「章内连续二升」极慢，maxDays 需按「每章一升 + 驻留」标定
export const BUDGET = {
  // 第 1 章：0 晋升起步 → 首升 D36 → pp>=1 推进第 2 章（D40）→ 章内二升收尾。
  //   80 天实测二升差 1 天（runEarned 8.41e9 / need 8.49e9，D80 CPS 8.2e3/s）→ 90 天足量
  //   esDelta 口径 = 晋升奖励累计（esGain 瞬时和），不扣永恒消费（v4.2.6 校准①）
  1: { minPrestige: 1, es: [8, 40], pp: [1, 6], rp: [1, 20], maxDays: 92,
    carry: { prestige: 0, es: 0, prestigePoints: 0 } },
  // 第 2 章：进入时 prestige≈1（carry 链保底 2）。憋晋升冲 techCount>=8（v4.2.8：5 科技
  //   （deep_space 需 1000 DM 属 ch4+ 载具内容不入门槛）+ 3 栋 m0 无门槛建筑（v21RealList
  //   全部 base<6e5 项恰为 warmup_node/eff_tower/double_workshop——首版「4 栋」把 via:'upgrade'
  //   的 rp_distill 误计入，它走 RP 组升级商店不进 unlockedBuildings）。
  //   原 25（cps 1e7/m6）v4.2.6 校准 5 轮实测 ch2 经济阶段永不可达——晋升重置清空 tech/线程，
  //   CPS 每晋升周期仅 ~3× 复利，130 天峰值 2~4e4。v4.2.8 校准：D24 cps 1e4（m3）、D31 RP 517 够全科技。
  2: { minPrestige: 1, es: [15, 200], pp: [1, 12], rp: [2, 80], maxDays: 130,
    carry: { prestige: 2, es: 32, prestigePoints: 2 } },
  // 第 3 章：prestige 6→8（carry 垫底 6）。同 ch2 卡 techCount>=8（5 科技 + 3 栋 m0 建筑），
  //   carry ES 210 消费成永恒等级 → CPS 基数更高，过门快于 ch2；章内二升收尾
  3: { minPrestige: 2, es: [40, 400], pp: [2, 24], rp: [3, 150], maxDays: 130,
    carry: { prestige: 8, es: 320, prestigePoints: 8 } },
  // 第 4 章：prestige 10→12（minPrestige 2）。第 5 章条件 expeditionsDone>=8——ch4 起自动玩家
  //   开启远征点击（expeditionsDone 随推演累计）。
  // v4.3.4 整章重标定（基于 v4.3.3 链路修复后的真实曲线）：
  //   - 真实 CPS 轨迹：D1 460（晋升重置起点）→ D10 1.4e3 → D28 2.5e4 → D40 2.9e4 趋平；
  //     平台期产速 ≈ 2.5e9 runEarned/天。runEarned@D40 = 3.5e10。
  //   - 晋升周期模型：每周期 ≈ 爬升 22~28 天（跨局永恒复利加速）+ 平台攒 need 6~32 天；
  //     120 天窗口稳完成 2~3 次晋升 → minPrestige 5→2（原 5 需 ~140 天不可达）。
  //   - 输入 carry prestige 12→10（对齐 v426 C1 保底链：ch1..3 minPrestige 累计 4 +
  //     carryChainIntegrity 下界 9；need(10)=1.09e11 与真实链 ch3 输出 ~8~9 量级一致）。
  //   - es [220,800]→[80,260]：esAt(need(8..10))=63..73，hold 5 天攒量 ×1.3~2 → 单次 63~95，
  //     章内 2 次 ≈ 130~180，区间 [80,260] 覆盖。
  //   - 缺口承接：minPrestige 5→2 的 -3 由 ch8 9→12 承接（ch8 是远征门槛章、晋升纯预算语义，
  //     ch9 无晋升类门槛），下游 carry 链按保底链下界重排（ch9~18 +2~+10，属未校准章的
  //     手工估计值，后续批次逐章校准时按实测重写）。
  4: { minPrestige: 2, es: [80, 260], pp: [2, 20], rp: [3, 180], maxDays: 120,
    carry: { prestige: 10, es: 120, prestigePoints: 10 } },
  // 第 5 章：prestige 17→22 口径推导 need≈2.32e11..3.28e11 → 单次 ES≈116..138
  // v4.3.5 整章重标定（宗教补丁后 D1~D14 实测）：旧 maxDays=16 是「5 天/章」旧节奏口径
  //   （ch4 实测晋升周期 22~50 天/次，16 天连一次晋升都攒不完）；旧 minPrestige=5 / es
  //   [260,900] 假设「晋升堆积中慢推进」——宗教补丁让 faith 门槛即时满足（唤醒+圣所 8 级
  //   当段达成 faith 100），实际 D9 推进 ch6 + D12 章内晋升收尾（carry 900 ES 复利永恒，
  //   CPS D9 1.7e4 → D12 3.3e10 爆发，晋升周期 ≈3 天被 gap 5 游戏天主宰）。
  //   与 ch1 校准结论①同型：「1 升即推进」→ minPrestige 5→1、es [260,900]→[80,300]
  //   （实测 145 居中）。carry {17,900,17} 维持（输入锚点，链式只垫底不封顶）。
  5: { minPrestige: 1, es: [80, 300], pp: [1, 20], rp: [3, 200], maxDays: 120,
    carry: { prestige: 17, es: 900, prestigePoints: 17 } },
  // 第 6 章：prestige 22→26 口径推导 need≈3.28e11..3.90e11 → 单次 ES≈137..140
  // v4.3.5 同 ch5 口径重标定：宗教已立 → ch6 条件 faith>=5 || 宗教恒满足（minDays 5 天驻留
  //   后即时推进）；章内晋升 ≈ D7（need 3.1e11，CPS 平台 3e10+，gap 5 游戏天）。Δ=1、
  //   esGain≈132 → minPrestige 4→1、es [300,1000]→[80,350]、maxDays 16→120。
  //   carry {22,1300,22} 维持（carryChainIntegrity：ch5 后 acc=18，22≥17 ✓）。
  6: { minPrestige: 1, es: [80, 350], pp: [1, 12], rp: [3, 220], maxDays: 120,
    carry: { prestige: 22, es: 1300, prestigePoints: 22 } },
  // 第 7 章：第 8 章条件 prestige>=40——rush 章（budget.rush=true → run-range 传 gap 2880
  //   快速晋升；v4.3.5 C1 口径改为「carry 锚点可达性」，mp 语义 = 章内预期晋升增量）。
  //   进章锚点 26 → 冲线 40 需 14 次 + 完成晋升 1 = Δ≈15；晋升重置清 upgrades 但
  //   unlockedBuildings 跨局保留 → 重建随永恒复利逐次加快（ch5 实测 D9 1.7e4→D12 3.3e10）。
  //   es：15 × esAt(need(26..40))≈140..184 ≈ 2100..2760
  7: { minPrestige: 12, es: [800, 6000], pp: [10, 40], rp: [5, 400], maxDays: 150, rush: true,
    carry: { prestige: 26, es: 1800, prestigePoints: 26 } },
  // 第 8 章：第 9 章条件 expeditionsDone>=20（无晋升门槛）。远征随推演累计（ch4 实测 8 次章末），
  //   20 次需额外 ~12 次远征；晋升 gap 43200 下 Δ 6~15
  8: { minPrestige: 5, es: [600, 8000], pp: [4, 30], rp: [6, 450], maxDays: 120,
    carry: { prestige: 41, es: 3200, prestigePoints: 41 } },
  // 第 9 章：第 10 章条件 techCount>=38——unlockedBuildings 跨局保留，重建靠 m7(cps 1e8)
  //   档位补高档建筑；CPS 平台随永恒复利可达。Δ 6~15
  9: { minPrestige: 5, es: [600, 8000], pp: [4, 30], rp: [6, 480], maxDays: 120,
    carry: { prestige: 52, es: 4600, prestigePoints: 52 } },
  // 第 10 章：第 11 章条件 es>=150——余额口径（自动玩家永恒消费留 10%，永恒成本 1.6^lv
  //   超过单次 esGain 后余额开始累积）。Δ 6~15
  10: { minPrestige: 5, es: [600, 9000], pp: [4, 30], rp: [6, 500], maxDays: 120,
    carry: { prestige: 58, es: 5700, prestigePoints: 58 } },
  // 第 11 章：第 12 章条件 es>=800——余额累积同上，进章余额往往已达标。Δ 6~15
  11: { minPrestige: 5, es: [600, 9000], pp: [4, 30], rp: [6, 520], maxDays: 120,
    carry: { prestige: 64, es: 6900, prestigePoints: 64 } },
  // 第 12 章：第 13 章条件 prestige>=70——进章锚点 64~77 贴线，最多补 6 次即冲线。Δ 6~15
  12: { minPrestige: 5, es: [600, 10000], pp: [4, 30], rp: [6, 540], maxDays: 120,
    carry: { prestige: 70, es: 8100, prestigePoints: 70 } },
  // 第 13 章：第 14 章条件 prestige>=130——rush 章。进章锚点 76 → 冲线需 ~55 次；
  //   重建随解锁保留加快（估 1~3 天/次）→ maxDays 放宽到 200。es：55 × 304..390 ≈ 1.7e4..2.1e4
  13: { minPrestige: 40, es: [8000, 45000], pp: [30, 90], rp: [6, 600], maxDays: 200, rush: true,
    carry: { prestige: 76, es: 9500, prestigePoints: 76 } },
  // 第 14 章：第 15 章条件 prestige>=260——rush 章。进章锚点 130 → 冲线需 ~130 次；
  //   后期重建 <1 天/次，130 次 ≈ 130~200 天 → maxDays 300 兜底。es：130 × 390..505 ≈ 5.1e4..6.6e4
  14: { minPrestige: 100, es: [20000, 120000], pp: [80, 220], rp: [8, 1500], maxDays: 300, rush: true,
    carry: { prestige: 130, es: 11500, prestigePoints: 130 } },
  // 第 15 章：第 16 章条件 faith>=60——faith 已满仓 100 随快照携带（圣所 v4.3.5 补丁产出到 cap），
  //   即时推进；章内 1 次晋升即完成。carry 锚点 = ch14 冲线后的 260
  15: { minPrestige: 1, es: [400, 8000], pp: [1, 15], rp: [30, 9000], maxDays: 120,
    carry: { prestige: 260, es: 20000, prestigePoints: 260 } },
  // 第 16 章：第 17 章条件 faith>=90——faith 100 随快照携带，即时推进。Δ 6~15
  16: { minPrestige: 5, es: [2000, 25000], pp: [4, 30], rp: [10, 900], maxDays: 120,
    carry: { prestige: 270, es: 100000, prestigePoints: 270 } },
  // 第 17 章：第 18 章条件 end_shrine 建筑或 true_end 科技——自动玩家买高档建筑满足。
  //   Δ 6~15
  17: { minPrestige: 5, es: [2000, 25000], pp: [4, 30], rp: [10, 900], maxDays: 120,
    carry: { prestige: 290, es: 112000, prestigePoints: 290 } },
  // 第 18 章：终章后收尾（章内晋升链继续滚动验证；riftsSealed 番外门槛不入预算）
  18: { minPrestige: 5, es: [2000, 30000], pp: [4, 40], rp: [8, 800], maxDays: 120,
    carry: { prestige: 310, es: 124000, prestigePoints: 310 } },
};

/** 主线章节数（1~18），番外不入体系。 */
export const MAIN_CHAPTERS = 18;

/** 预算表条目完整性自检（单测护栏也调用）。 */
export function budgetIntegrity() {
  const missing = [];
  for (let n = 1; n <= MAIN_CHAPTERS; n++) {
    const b = BUDGET[n];
    if (!b) { missing.push(n); continue; }
    if (!(b.minPrestige >= 1)) missing.push(n);
    if (!Array.isArray(b.es) || b.es.length !== 2 || !(b.es[0] <= b.es[1])) missing.push(n);
    if (!(b.maxDays >= 1)) missing.push(n);
    if (!b.carry || !(b.carry.prestige >= 0)) missing.push(n);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * carry 链自洽：第 N+1 章的输入起点 = 第 N 章输入起点 + minPrestige（保底链）。
 * 独立跑第 N 章时，垫高目标读 BUDGET[N].carry；链式跑时 carry.prestige 仅作下界参考。
 */
export function carryChainIntegrity() {
  const bad = [];
  let acc = 0;
  for (let n = 1; n <= MAIN_CHAPTERS; n++) {
    const c = BUDGET[n] && BUDGET[n].carry;
    if (!c) continue;
    if (c.prestige < acc - 1) bad.push(`ch${n}.carry.prestige=${c.prestige} < 保底链 ${acc}`);
    acc = Math.max(acc, c.prestige) + (BUDGET[n] ? BUDGET[n].minPrestige : 0);
  }
  return { ok: bad.length === 0, bad };
}
