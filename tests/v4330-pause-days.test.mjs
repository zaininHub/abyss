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
  const group = seg.indexOf('margin-left:auto;display:flex;align-items:center;gap:8px');
  const distill = seg.indexOf('${distillBtn()}');
  const sw = seg.indexOf('data-atrium-switch');
  assert.ok(group >= 0, '缺少右靠操作组');
  assert.ok(distill > group, '蒸馏按钮必须与自动开关同组（右靠）');
  assert.ok(distill < sw, '蒸馏按钮必须在自动开关左侧');
  assert.match(seg, /\$\{on \? '自动开' : '自动关'\}/, '开关文案应为「自动开 / 自动关」');
});

test('P4 自动开关样式对齐孵化：红/绿按钮而非滑块', () => {
  const block = CSS.match(/\.atrium-auto-switch \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(block, '缺少 .atrium-auto-switch 样式');
  assert.match(block, /border-radius: 4px/, '孵化开关是 4px 圆角按钮（不是 999px 胶囊滑块）');
  assert.match(block, /padding: 6px 16px/, '与孵化开关同尺寸内边距');
  assert.match(block, /background: var\(--red, #f85149\)/, '关闭态为红底');
  const onBlock = CSS.match(/\.atrium-auto-switch\.on \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(onBlock, /background: var\(--good, #3fb950\)/, '开启态为绿底');
  assert.doesNotMatch(CSS, /\.atrium-auto-switch i::after/, '不应再使用滑块伪元素（样式已改按钮）');
});

test('P5 暂停期间顶栏天数按暂停起点计算（暂停中也不涨）', () => {
  const tide = MAIN.slice(MAIN.indexOf('function renderTide()'));
  const body = tide.slice(0, tide.indexOf('\n}', 1));
  assert.match(body, /daysSince\(S\.startedAt, S\.paused \? \(S\.pausedAt \|\| Date\.now\(\)\) : Date\.now\(\)\)/,
    '暂停中天数必须以 pausedAt 为「现在」，否则跨日暂停的瞬间会多显示一天');
});
