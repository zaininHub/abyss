// 纯字符串 UI 构件（无 DOM 依赖，可在 Node 单测中验证渲染口径）
// v3.6.1 抽出：消除各面板重复的内联模板（进度条、资源流、面板壳），
// 并统一「资源流」展示格式：- xx 单位/s + xx 单位/s（符号在前、数值、单位、/s 在后）。
import { fmt } from '../core/format.js';

// 进度条构件（替代各面板重复的 track+fill 内联模板：
//   <div style="height:10px;...track..."><div style="width:..%;background:.."></div></div>）
// 返回 track+fill 片段，调用方自行决定外层容器。
export function progressBar(pct, colorVar = 'linear-gradient(90deg,var(--cyan,#22d3ee),var(--accent,#a855f7))') {
  const p = Math.max(0, Math.min(100, pct));
  return `<div style="height:10px;background:rgba(255,255,255,.08);border-radius:5px;overflow:hidden"><div style="height:100%;width:${p.toFixed(1)}%;background:${colorVar}"></div></div>`;
}

// 单条资源流：sign>0 产出 / sign<0 消耗。统一格式「+ 1.2K EP/s」「- 450 EP/s」。
// label 可选（如「线程薪资 -450 EP/s」）。
export function flowItem({ sign, amount, unit, label }) {
  const s = sign > 0 ? '+' : '-';
  const body = `${s}${fmt(amount)} ${unit}/s`;
  return label ? `${label} ${body}` : body;
}

// 资源流聚合：produce/consume 数组 → 「+ A EP/s · - B EP/s」式统一行。
// 例：resourceFlow({ produce:[{amount:1200,unit:'EP'}], consume:[{amount:450,unit:'EP'}] })
//   → "+ 1.20K EP/s · - 450 EP/s"
export function resourceFlow({ produce = [], consume = [] }) {
  const parts = [];
  for (const p of produce) parts.push(flowItem({ sign: +1, ...p }));
  for (const c of consume) parts.push(flowItem({ sign: -1, ...c }));
  return parts.join(' · ');
}

// 面板壳（共性页面布局）：统一 <div class="panel"><h3>…</h3>body</div> 结构
export function panelShell({ title, icon = '', body = '', cls = '' }) {
  return `<div class="panel ${cls}"><h3>${icon ? icon + ' ' : ''}${title}</h3>${body}</div>`;
}
