// 纯数值/时间格式化（无 S / 无 DOM 依赖）
// 原定义在 economy.js，v3.6.1 抽出为公共内核：所有模块与 UI 构件统一引用，避免各面板自造格式化。

export function fmt(n) {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 ? (Math.round(n * 10) / 10).toString() : Math.floor(n).toString();
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return n.toFixed(2) + units[u];
}

// 资源数值统一口径——低于 1000 保 2 位小数、≥1000 走 k/M 缩写（避免「2000.00 / 2.00k」混排）。
export function fmtRes(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 1000) return v.toFixed(2);
  return fmt(v);
}

export function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

// v3.10.2：天/小时级可读时长（原在 expedition.js，下沉为公共内核，供顶栏「EP 耗尽预估」复用）。
// fmtTime 只输出 H:MM:SS，24 小时会被写成 24:00:00，长时段需按天/小时表达。
export function fmtLongDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec >= 86400) { const d = sec / 86400; return `${Number.isInteger(d) ? d : d.toFixed(1)} 天`; }
  if (sec >= 3600) { const h = sec / 3600; return `${Number.isInteger(h) ? h : h.toFixed(1)} 小时`; }
  return fmtTime(sec);
}

// 顶栏净流为负时的「预期 EP 耗尽时间」：0 / 负数 / 非法值显式兜底，其余复用长时段口径。
// 命名刻意避开 rift.js 的 fmtEta（那是分钟级裂隙倒计时），本函数可输出天 / 小时级。
export function fmtDepletionEta(sec) {
  if (!Number.isFinite(sec)) return '—';
  if (sec <= 0) return '已耗尽';
  return fmtLongDuration(sec);
}

// 顶栏净流为负时的耗尽秒数：EP 余额 / 每秒净亏空。非有限或已耗尽返回 0（文案由 fmtEta 兜底）。
export function epDepletionSec(ep, outputPerSec, drainPerSec) {
  const net = (Number(drainPerSec) || 0) - (Number(outputPerSec) || 0);
  if (!(net > 0) || !(Number(ep) > 0)) return 0;
  return (Number(ep) || 0) / net;
}
