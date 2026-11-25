// v4.3.28 P0 回归：经典脚本产物不得把顶层声明泄漏到 window，从而覆盖缩短名后的运行时函数。
//
// 背景（真实浏览器复现）：fileProtocolCompat 把 <script type="module"> 降级为经典 <script defer>，
//   于是整个 bundle 的顶层声明都会挂到 window 上。压缩后 src/core/runtime.js 的 log 恰好被重命名为
//   `function S(...)`，而 src/main.js 顶层有 `window.S = S`（存档单例，浏览器测试/调试用）——
//   后者把 log 覆盖成状态对象。任何 import { log } 的核心模块调用 log 都会抛
//   `TypeError: S is not a function`，整帧后续逻辑中断：
//     · togglePause() 里 log() 先抛 → showPauseModal() 不执行 → 「暂停弹框消失」
//     · abortRiftExpedition/深入结算里 log() 先抛 → 状态不清 → 「0s 深渊不结束 / 紧急脱出无效」
//     · 购买/升级类里 log() 先抛 → 已扣费但状态未写入 → 「买了没反应」
//   刷新后因存档回滚而"看起来好了"，因此极易被误判成 UI 层问题。
//
// 本测试锁三件事：
//   ① vite.config.js 必须用 IIFE 产物（顶层声明函数作用域，window.S 只是属性，不会再覆盖内部绑定）；
//   ② dist 产物必须是 IIFE 包裹的经典脚本，且不再出现「顶层 function S」这种全局函数声明；
//   ③ 源码仍保留 window.S 调试钩子（浏览器测试依赖），且 log 仍从 runtime.js 导出。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('B1 构建配置使用 IIFE 包裹产物，避免顶层声明污染 window', () => {
  const cfg = read('vite.config.js');
  assert.match(cfg, /rollupOptions:\s*\{\s*output:\s*\{\s*format:\s*'iife'\s*\}\s*\}/,
    'vite.config.js 必须设置 rollupOptions.output.format = iife');
  assert.match(cfg, /cssCodeSplit:\s*false/,
    'iife 单 chunk 形态下需关闭 cssCodeSplit，否则 Vite 不产出 style.css');
});

test('B2 dist 产物是 IIFE 包裹的经典脚本（顶层不暴露 function S）', () => {
  const html = read('dist/index.html');
  const js = html.match(/src="\.\/assets\/(index-[\w-]+\.js)"/)?.[1];
  assert.ok(js, 'dist/index.html 未引用 js');
  const code = read(`dist/assets/${js}`);
  assert.ok(/^\(function\s*\(\)\s*\{\s*"use strict";/.test(code.trimStart()),
    'dist JS 必须以 (function(){"use strict"; 开头（IIFE），否则顶层声明会成为全局');
  assert.ok(/\}\)\(\);\s*(\/\/# sourceMappingURL=)?/.test(code.trimEnd()),
    'dist JS 必须以 })(); 收尾（IIFE）');
  // 经典脚本下 `function S(...)` 会成为 window.S；window.S 又被 main.js 赋成状态对象，
  // 于是内部 log 绑定被覆盖。IIFE 内允许出现 function S，但顶层不允许。
  const topLevelFnS = /(^|[;\n])\s*function S\s*\(/.test(code.split('(function(){')[0] || '');
  assert.equal(topLevelFnS, false, '产物顶层不得出现 function S（会与 window.S 冲突）');
});

test('B3 保留 window.S 调试钩子与 runtime 的 log 导出', () => {
  const main = read('src/main.js');
  const runtime = read('src/core/runtime.js');
  assert.match(main, /window\.S = S;/, 'main.js 需保留 window.S 存档钩子（浏览器测试与线上排查依赖）');
  assert.match(runtime, /export function log\(msg, cls\)/, 'runtime.js 必须继续导出 log');
});

test('B4 深渊吞噬抉择文案不写「达成成就」，但成就仍默认发放', () => {
  const html = read('index.html');
  const modal = html.match(/<div id="collapse-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || '';
  assert.ok(modal.length > 0, '未找到 #collapse-modal');
  assert.doesNotMatch(modal, /达成成就/, '抉择按钮文案不应再写「达成成就」（默认给成就即可）');
  assert.match(modal, /贿赂深渊/, '贿赂深渊选项缺失');
  assert.match(modal, /同归于尽/, '同归于尽选项缺失');
  const main = read('src/main.js');
  const resolve = main.match(/function resolveCollapseChoice\(kind\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(resolve, /unlockAchievement\(S, 'demon_friend'\)/, '贿赂深渊仍需默认解锁「恶魔的朋友」');
  assert.match(resolve, /unlockAchievement\(S, 'gaze_abyss'\)/, '同归于尽仍需默认解锁「凝视深渊」');
});

test('B5 产物 CSS 与 JS 都存在（iife 形态不得丢样式）', () => {
  const html = read('dist/index.html');
  const css = html.match(/href="\.\/assets\/(style-[\w-]+\.css)"/)?.[1];
  assert.ok(css, 'dist/index.html 缺少 stylesheet 引用');
  assert.ok(existsSync(join(ROOT, 'dist/assets', css)), `样式文件不存在：${css}`);
});
