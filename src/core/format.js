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

// ========== v3.12.0 反馈⑮：资源增减文案的正负号单一真源 ==========
// 模块卡面凡「增加产出 / 减少产出」都必须带显式 + / -，不允许只写「×1.3」「0.85」这类无符号倍率。
// 这里只提供纯字符串/数值口径（零 DOM、零状态依赖），数据表文案与动态描述共用。
export function deltaSign(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '±';
  return n > 0 ? '+' : '-';
}

// 百分比增量 → "+30%" / "-12%"；digits 用于 2.5% 这类非整数。
export function fmtDelta(v, { unit = '%', digits = 0 } = {}) {
  const n = Number(v) || 0;
  let body = Math.abs(n).toFixed(digits);
  // 只在「有小数部分」时去掉尾部零：直接套 /\.?0+$/ 会把整数末尾的 0 也吃掉
  // （30 → 3、-10 → -1），汇率 ×0.90 / 燃料 ×1.50 都会显示错误百分比。
  if (body.includes('.')) body = body.replace(/\.?0+$/, '');
  if (body === '' || body === '-') body = '0';
  return `${n < 0 ? '-' : '+'}${body}${unit}`;
}

// 倍率（×1.3 / ×0.88）→ 带符号百分比（+30% / -12%）。
export function fmtMultDelta(m, opts) {
  return fmtDelta(((Number(m) || 0) - 1) * 100, opts);
}

// 防御性归一：把数据表里漏写的「×N」补成「+X%（×N）」/「-X%（×N）」。
// 已有 + / - 的文案原样返回，避免重复标注。
export function signedDesc(desc) {
  const s = String(desc || '');
  if (/[+\-−]/.test(s)) return s;
  const m = s.match(/×\s*(\d+(?:\.\d+)?)/);
  if (!m) return s;
  return s.replace(m[0], `${fmtMultDelta(m[1])}（${m[0]}）`);
}

// 卡面角标：从任意数据对象的效果字段推出 + / - / ±，供 .delta-badge 渲染。
// 判定序与数据表书写习惯一致：fx.value / fx.v → cps / produces.rate → desc 内首个带符号数 → ×N 倍率。
export function effectSignOf(u) {
  if (!u || typeof u !== 'object') return '';
  const fx = u.fx && typeof u.fx === 'object' ? u.fx : null;
  if (fx) {
    const raw = fx.v != null ? fx.v : fx.value;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      // 只有字段名明确是乘区（*Mul / *Mult / costMul）才按「相对 1」判定；
      // 不能用 raw<1 反推——加区字段常见 0.1 表示 +10%，会被误判成 -90%。
      const isMul = /mul|mult/i.test(String(fx.key || ''));
      return deltaSign(isMul ? raw - 1 : raw);
    }
  }
  for (const v of [u.cps, u.produces && u.produces.rate, u.rpRate]) {
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return deltaSign(v);
  }
  const desc = String(u.desc || '');
  const signed = desc.match(/([+\-−])\s*\d/);
  if (signed) return signed[1] === '−' ? '-' : signed[1];
  const mult = desc.match(/×\s*(\d+(?:\.\d+)?)/);
  if (mult) return deltaSign(Number(mult[1]) - 1);
  return '';
}
