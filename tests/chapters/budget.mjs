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
  // 第 5 章：prestige 17→22。need≈2.32e11..3.28e11 → 单次 ES≈116..138
  5: { minPrestige: 5, es: [260, 900], pp: [3, 70], rp: [3, 200], maxDays: 16,
    carry: { prestige: 17, es: 900, prestigePoints: 17 } },
  // 第 6 章：prestige 22→26（第 6 章条件 faith>=5 由远征深空概率信仰/宗教线满足，不入预算）。
  //   need≈3.28e11..3.90e11 → 单次 ES≈137..140
  6: { minPrestige: 4, es: [300, 1000], pp: [3, 80], rp: [3, 220], maxDays: 16,
    carry: { prestige: 22, es: 1300, prestigePoints: 22 } },
  // 第 7 章：prestige 26→41（第 8 章条件 prestige>=40）。need≈3.90e11..6.75e11 → 单次 ES≈140..184
  7: { minPrestige: 15, es: [900, 2600], pp: [8, 200], rp: [5, 400], maxDays: 20,
    carry: { prestige: 26, es: 1800, prestigePoints: 26 } },
  // 第 8 章：prestige 41→53（第 9 章条件 expeditionsDone>=20 随远征累计；无晋升类门槛，
  //   minPrestige 纯预算语义）。v4.3.4：9→12 承接 ch4 5→2 的 C1 保底链缺口（-3）。
  //   need≈6.75e11..1.02e12 → 单次 ES≈184..226
  8: { minPrestige: 12, es: [1100, 3200], pp: [10, 250], rp: [6, 450], maxDays: 20,
    carry: { prestige: 41, es: 3200, prestigePoints: 41 } },
  // 第 9 章：prestige 53→59。need≈1.02e12..1.22e12 → 单次 ES≈226..247
  // v4.3.4：carry 50→52 起按 ch8 minPrestige+3 重排的保底链下界（未校准章，后续按实测重写）
  9: { minPrestige: 6, es: [800, 3400], pp: [8, 260], rp: [6, 480], maxDays: 20,
    carry: { prestige: 52, es: 4600, prestigePoints: 52 } },
  // 第 10 章：prestige 58→64（第 11 章条件 es>=150 此后恒满足）。need≈1.22e12..1.42e12
  10: { minPrestige: 6, es: [800, 3600], pp: [8, 280], rp: [6, 500], maxDays: 20,
    carry: { prestige: 58, es: 5700, prestigePoints: 58 } },
  // 第 11 章：prestige 64→70（es>=150 门槛输入已满足）。need≈1.42e12..1.63e12
  11: { minPrestige: 6, es: [800, 3800], pp: [8, 300], rp: [6, 520], maxDays: 20,
    carry: { prestige: 64, es: 6900, prestigePoints: 64 } },
  // 第 12 章：prestige 70→76（es>=800 门槛输入已满足）。need≈1.63e12..1.85e12
  12: { minPrestige: 6, es: [800, 4000], pp: [8, 320], rp: [6, 540], maxDays: 20,
    carry: { prestige: 70, es: 8100, prestigePoints: 70 } },
  // 第 13 章：prestige 76→94（进入时累计 76；v4.2.6 校准④：ch2/ch3 minPrestige 改小后
  //   保底链缺口前移到这里补——累计需 ≥70 门槛 + ch14 的 130 门槛缺口 84+46=130 恰好贴线）。
  //   need≈1.85e12..3.0e12 → 单次 ES≈304..387
  13: { minPrestige: 18, es: [1300, 5200], pp: [12, 480], rp: [6, 600], maxDays: 24,
    carry: { prestige: 76, es: 9500, prestigePoints: 76 } },
  // 第 14 章：prestige 94→140（第 15 章条件 prestige>=260 → 第 15 章完成 140 次）。
  //   need(94..139)≈2.9e12..5.1e12 → 单次 ES≈380..505，46 次 ≈2.0e4
  14: { minPrestige: 46, es: [8000, 42000], pp: [30, 1300], rp: [8, 1500], maxDays: 28,
    carry: { prestige: 94, es: 11500, prestigePoints: 94 } },
  // 第 15 章：prestige 140→270（130 次晋升）。need(140..269)≈5.1e12..1.31e13 →
  //   单次 ES≈505..810，合计 ≈8.5e4
  15: { minPrestige: 130, es: [30000, 200000], pp: [100, 6500], rp: [30, 9000], maxDays: 40,
    carry: { prestige: 140, es: 20000, prestigePoints: 140 } },
  // 第 16 章：第 17 章条件 faith>=90——信仰线由自动玩家经产品入口推进，不入 ES 预算；
  //   晋升按 canPrestige 即升（271~290 次）
  16: { minPrestige: 20, es: [1500, 12000], pp: [20, 900], rp: [10, 900], maxDays: 28,
    carry: { prestige: 270, es: 100000, prestigePoints: 270 } },
  // 第 17 章：第 18 章条件 end_shrine 建筑或 true_end 科技——由自动玩家购买满足；
  //   晋升按 canPrestige 即升（291~310 次）
  17: { minPrestige: 20, es: [1500, 12000], pp: [20, 900], rp: [10, 900], maxDays: 28,
    carry: { prestige: 290, es: 112000, prestigePoints: 290 } },
  // 第 18 章：终章后收尾（章内晋升链继续滚动验证；riftsSealed 番外门槛不入预算）
  18: { minPrestige: 5, es: [800, 14000], pp: [10, 600], rp: [8, 800], maxDays: 24,
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
