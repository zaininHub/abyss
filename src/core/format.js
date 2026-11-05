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
