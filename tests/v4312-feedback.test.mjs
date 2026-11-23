// v4.3.12 玩家反馈专项（源码级锁）：
// ① 删除成就 pager 常驻进度文案「已展示 N / M 项 · 下滑加载更多」——不可滚时不渲染 pager 行，
//    仅列表真实可滚时显示简短「下滑加载更多」；渲染后按真实 scrollHeight 二次校正。
// ② 成就 / 班组滚动分页 10s 无操作回缩回第一页（累积组收起）。
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// 剥注释后匹配（防止注释里的旧文案/旧实现干扰源码断言）
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ============ 反馈① pager 常驻进度文案删除 ============

test('R1a 成就面板不再渲染「已展示 N / M 项」常驻进度文案', () => {
  const src = stripComments(read('src/main.js'));
  // 旧文案「已展示 ${...} / ${...} 项」必须不存在（剥注释后）
  assert.ok(!/已展示\s*\$/.test(src), '成就面板仍有「已展示 N / M 项」进度文案（模板串形式）');
  // 新口径：末组收尾文案是「已全部展示 N 项」（不同于被删的进度文案）
  assert.ok(/已全部展示\s*\$\{n\}\s*项/.test(src), '成就面板末组收尾文案「已全部展示 N 项」缺失');
});

test('R1b 成就 pager 可滚判定用近似 + 渲染后二次校正钩子', () => {
  const src = stripComments(read('src/main.js'));
  // 近似判定：卡片数 × 卡高 + 头部余量
  assert.ok(/approxH\s*=\s*end\s*\*\s*58\s*\+\s*16/.test(src), '成就 pager 近似可滚判定（end*58+16）缺失');
  // 可滚才渲染 pager（不可滚时 html 不追加 pager 行）
  assert.ok(/approxH\s*>\s*container\.clientHeight\)\s*html\s*\+=/.test(src), '成就 pager 未按可滚判定渲染');
  // 渲染后二次校正：不可滚但 pager 在 → remove
  assert.ok(/\.ach-pager-maybe/.test(src), '成就 pager 二次校正钩子（ach-pager-maybe）缺失');
  assert.ok(/scrollHeight\s*<=\s*container\.clientHeight\s*\+\s*4\)\s*maybe\.remove\(\)/.test(src), '成就 pager 不可滚移除逻辑缺失');
  // 简短提示文案（无进度数字）
  assert.ok(!/已展示.*\d+.*\/.*\d+/.test(src), '成就 pager 仍含 N / M 形式文案');
});

test('R1c 班组面板同款：进度文案删除 + 近似判定 + 自动填充（v4.3.14 反馈①反转）', () => {
  const src = stripComments(read('src/modules/crew.js'));
  assert.ok(!/已展示\s*\$/.test(src), '班组面板仍有「已展示 N / M 条线程」进度文案（模板串形式）');
  assert.ok(/approxH\s*=\s*end\s*\*\s*76\s*\+\s*60/.test(src), '班组 pager 近似可滚判定（end*76+60）缺失');
  // v4.3.14 反馈①：二次校正 remove 反转为「不可滚自动追加下一组」——
  //   两列 grid 下首组 6 卡远不满容器（探针实测 ch=sh=600 不可滚），remove 范式
  //   让玩家永远无法触底展开。新范式：渲染后 while 不可滚即追加，直到可滚或全部展示。
  assert.ok(/crewPage\s*<\s*pageCount\s*&&\s*container\.scrollHeight\s*<=\s*container\.clientHeight\s*\+\s*4/.test(src), '班组自动填充循环（不可滚即追加）缺失');
  assert.ok(/insertAdjacentHTML\('beforeend',\s*more\)/.test(src), '班组自动填充未追加卡片');
  assert.ok(/crewCardHtml/.test(src), '班组卡片生成函数 crewCardHtml 缺失（主循环与填充共用）');
  // 填充后 pager 文案按真实组数回写（全部展示时改「已全部展示 N 条线程」）
  assert.ok(/已全部展示\s*\$\{n\}\s*条线程/.test(src), '班组面板末组收尾文案「已全部展示 N 条线程」缺失');
});

// ============ 反馈② 10s 无操作回缩 ============

test('R2a 成就面板滚动 handler 挂 10s 回缩计时器（_achIdleTimer）', () => {
  const src = stripComments(read('src/main.js'));
  assert.ok(/_achIdleTimer/.test(src), '成就面板回缩计时器 _achIdleTimer 缺失');
  assert.ok(/clearTimeout\(container\._achIdleTimer\)/.test(src), '成就面板滚动未先清旧计时器（会重复挂表）');
  assert.ok(/if\s*\(achPage\s*>\s*1\)\s*\{[\s\S]{0,200}?_achIdleTimer\s*=\s*setTimeout/.test(src), '成就面板回缩未按 achPage>1 门控（首组不应挂表）');
  // 回缩行为：achPage 归 1 + 清 _keepScroll + 重渲染
  assert.ok(/_achIdleTimer\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,200}?achPage\s*=\s*1;[\s\S]{0,200}?_keepScroll\s*=\s*null;/.test(src), '成就面板回缩未归位 achPage=1 或未清 _keepScroll');
  assert.ok(/10000\)/.test(src), '成就面板回缩时长不是 10000ms');
});

test('R2b 班组面板同款：10s 回缩计时器（_crewIdleTimer）', () => {
  const src = stripComments(read('src/modules/crew.js'));
  assert.ok(/_crewIdleTimer/.test(src), '班组面板回缩计时器 _crewIdleTimer 缺失');
  assert.ok(/clearTimeout\(container\._crewIdleTimer\)/.test(src), '班组面板滚动未先清旧计时器');
  assert.ok(/if\s*\(crewPage\s*>\s*1\)\s*\{[\s\S]{0,200}?_crewIdleTimer\s*=\s*setTimeout/.test(src), '班组面板回缩未按 crewPage>1 门控');
  assert.ok(/_crewIdleTimer\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,200}?crewPage\s*=\s*1;[\s\S]{0,200}?_keepScroll\s*=\s*null;/.test(src), '班组面板回缩未归位 crewPage=1 或未清 _keepScroll');
  assert.ok(/10000\)/.test(src), '班组面板回缩时长不是 10000ms');
});

// ============ 旧机制残留清理 ============

test('R3 两个面板源码均无旧「已展示 X / Y」进度格式残留', () => {
  // 不剥注释也查一遍：注释里也不该再引用旧格式作为「当前实现」描述
  const main = read('src/main.js');
  const crew = read('src/modules/crew.js');
  // 运行时字符串（含模板串拼接）中不得出现「已展示 $」——注释中允许历史标注
  assert.ok(!/已展示\s*\$\{/.test(main), 'main.js 运行时字符串仍有「已展示 ${」');
  assert.ok(!/已展示\s*\$\{/.test(crew), 'crew.js 运行时字符串仍有「已展示 ${」');
});
