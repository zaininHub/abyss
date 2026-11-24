// 时间常数单一真源——「一天」在所有章节驻留/进度判定里必须是同一个数。
// 四个潮汐相位各 150 秒，完整轮转恰为 10 分钟（一个游戏日）。
export const MS_PER_SEC = 1000;
export const SEC_PER_DAY = 10 * 60;
export const MS_PER_DAY = MS_PER_SEC * SEC_PER_DAY; // 600000；1 小时 = 6 天，300 天 = 1 年

/** 从绝对时间戳距今过了多少天（非法/未来时间按 0）。 */
export function daysSince(ts, now = Date.now()) {
  if (!(ts > 0)) return 0;
  return Math.max(0, (now - ts) / MS_PER_DAY);
}
