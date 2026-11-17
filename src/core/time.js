// v4.2.X：时间常数单一真源——「一天」在所有章节驻留/进度判定里必须是同一个数。
// 旧实现在 progressive.js / chapters.js / prestige.js 各写一份 86400000，改一处漏两处。
export const MS_PER_SEC = 1000;
export const SEC_PER_DAY = 86400;
export const MS_PER_DAY = MS_PER_SEC * SEC_PER_DAY; // 86400000

/** 从绝对时间戳距今过了多少天（非法/未来时间按 0）。 */
export function daysSince(ts, now = Date.now()) {
  if (!(ts > 0)) return 0;
  return Math.max(0, (now - ts) / MS_PER_DAY);
}
