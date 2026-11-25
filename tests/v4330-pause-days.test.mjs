// v4.3.29 反馈：①暂停不增加游玩天数；②蒸馏按钮移到自动开关左侧、自动开关样式对齐「异兽孵化」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as schema from '../src/core/stateSchema.js';
import { MS_PER_DAY, daysSince } from '../src/core/time.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MAIN = read('src/main.js');
const SHOP = read('src/modules/shop.js');
const CSS = read('src/style.css');

test('P1 startedAt 纳入绝对时钟：暂停/弹框暂停期间游玩天数不推进', () => {
  assert.ok(schema.ABSOLUTE_CLOCK_PATHS.includes('startedAt'),
    'startedAt 必须在 ABSOLUTE_CLOCK_PATHS 中，否则暂停期间天数照走真实时间');
  const S = { startedAt: 1_700_000_000_000 };
  const before = daysSince(S.startedAt, S.startedAt + 10 * MS_PER_DAY);
  assert.ok(before > 9, `前置：10 天应有 10 天，实际 ${before}`);
  // 暂停 10 天后整体顺延 → 冻结的「游戏钟」仍停在暂停时刻，天数不涨
  schema.shiftAbsoluteClocks(S, 10 * MS_PER_DAY);
  const after = daysSince(S.startedAt, S.startedAt);
  assert.equal(after, 0, '顺延后从新基准计算，天数归零（暂停不推进天数）');
  assert.equal(daysSince(S.startedAt, S.startedAt + 0.5 * MS_PER_DAY), 0.5);
});

test('P2 暂停恢复走 shiftAbsoluteClocks（任务时钟 + 游玩天数一起冻结）', () => {
  const settle = MAIN.slice(MAIN.indexOf('function settlePause()'));
  const body = settle.slice(0, settle.indexOf('\nfunction ', 1));
  assert.match(body, /shiftAbsoluteClocks\(S, nowMs - pausedAtMs\)/,
    '暂停恢复必须整体顺延绝对时钟（内部已含 shiftProjectClocks）');
  assert.doesNotMatch(body, /shiftProjectClocks\(S, nowMs - pausedAtMs\)/,
    '不要只顺延任务时钟——那样 startedAt 会继续走真实时间');
  assert.doesNotMatch(MAIN, /import \{[^}]*shiftProjectClocks[^}]*\}/,
    'main.js 不再直接 import shiftProjectClocks（统一走 shiftAbsoluteClocks）');
});

test('P3 蒸馏按钮与自动开关同组右靠，蒸馏在开关左侧', () => {
  const seg = SHOP.match(/灵感工坊 ×\$\{n\}[\s\S]{0,700}?<\/div>`/)?.[0] || '';
  assert.ok(seg, '开关行模板缺失');
  const group = seg.indexOf('atrium-row-act'); // v4.3.30：右靠组改用类，不再内联样式
  const distill = seg.indexOf('${distillBtn()}');
  const sw = seg.indexOf('data-atrium-switch');
  assert.ok(group >= 0, '缺少右靠操作组');
  assert.ok(distill > group, '蒸馏按钮必须与自动开关同组（右靠）');
  assert.ok(distill < sw, '蒸馏按钮必须在自动开关左侧');
  assert.match(seg, /label: on \? '自动开' : '自动关'/, '开关文案应为「自动开 / 自动关」');
});

test('P4 自动开关统一为滑块（v4.3.30 反转：红绿按钮 → 全站滑块）', () => {
  // v4.3.29 曾把开关改成孵化同款红/绿实心按钮；v4.3.30 反馈①要求全站统一为滑块，此断言随之反转。
  assert.doesNotMatch(CSS, /\.atrium-auto-switch/, '旧的红绿按钮样式应已删除');
  const block = CSS.match(/\.ui-switch \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(block, '缺少全站统一 .ui-switch 样式');
  assert.match(CSS, /\.ui-switch-track \{[\s\S]*?width: 26px; height: 14px;[\s\S]*?border-radius: 999px/, '轨道应为 26×14 胶囊');
  assert.match(CSS, /\.ui-switch-thumb \{[\s\S]*?width: 10px; height: 10px;/, '圆点应为 10px');
  assert.match(CSS, /\.ui-switch\.on \.ui-switch-thumb \{ transform: translateX\(12px\)/, '开启态圆点须滑动 12px');
  assert.match(CSS, /\.ui-switch\.on \.ui-switch-track \{ background: rgba\(63,185,80,\.35\)/, '开启态轨道为绿');
  // 组件与站点接线
  const UI = read('src/core/uiSwitch.js');
  assert.match(UI, /export function switchHtml/, '缺少 switchHtml 组件');
  assert.match(UI, /role="switch"/, '独立滑块必须带 role=switch');
  const sites = ['src/main.js', 'src/modules/shop.js', 'src/modules/pets.js', 'src/modules/religions.js', 'src/modules/rift.js', 'src/modules/bazaar.js'];
  for (const f of sites) assert.match(read(f), /switch(Html|Inline)\(/, `${f} 未接入统一滑块`);
  // v4.3.30 回归：探采页头「未解锁」分支曾直接 return，滑块文案/aria 停在旧值，与真实 converterOn 脱节。
  //   同步动作必须抽成 syncProbeSwitch 且在早退之前调用。
  const shop = read('src/modules/shop.js');
  assert.match(shop, /const syncProbeSwitch = \(\) => \{/, '探采开关同步应抽成 syncProbeSwitch');
  const probeBody = shop.slice(shop.indexOf('const syncProbeSwitch'));
  const earlyReturn = probeBody.indexOf('if (!probeAllowed) {');
  const syncCall = probeBody.indexOf('syncProbeSwitch();');
  assert.ok(syncCall > 0 && syncCall < earlyReturn, '未解锁早退之前必须先同步滑块状态');
  assert.doesNotMatch(CSS, /\.bz-switch/, '集市私有的胶囊滑块样式应已删除（并入 .ui-switch）');
  assert.doesNotMatch(CSS, /\.ai-switch/, '无面板使用的 .ai-switch 残留样式应已删除');
});

test('P5 暂停期间顶栏天数按暂停起点计算（暂停中也不涨）', () => {
  const tide = MAIN.slice(MAIN.indexOf('function renderTide()'));
  const body = tide.slice(0, tide.indexOf('\n}', 1));
  assert.match(body, /daysSince\(S\.startedAt, S\.paused \? \(S\.pausedAt \|\| Date\.now\(\)\) : Date\.now\(\)\)/,
    '暂停中天数必须以 pausedAt 为「现在」，否则跨日暂停的瞬间会多显示一天');
});
