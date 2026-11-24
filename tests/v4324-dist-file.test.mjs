// v4.3.24 缺陷回归：dist 产物必须在 file:// 下可加载（双击 index.html 场景）。
//
// 背景：vite.config.js 的 fileProtocolCompat 插件只在「产物为单 JS chunk 且不含模块语法」时
//   把 <script type="module" crossorigin> 降级为 <script defer>、并去掉 link 的 crossorigin。
//   v4.3.23 在 progression.js 里写入了动态 `import('../core/runtime.js')`，Rollup 会把它编译成
//   __vitePreload(..., import.meta.url) —— 产物因此残留 import.meta，插件判定「含模块语法」而
//   静默跳过降级，于是 file:// 打开时脚本与 style.css 同时被 CORS 拦截（表现即「CSS 失效」）。
//
// 本测试锁两件事：① 源码不得出现会污染产物的动态 import 写法；
//                ② 已构建的 dist/index.html 必须处于降级形态（经典 script + 无 crossorigin）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 递归收集 src 下所有 .js，剔除注释后扫描动态 import
function walkSrc(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('D1 源码无声明的动态 import（会注入 import.meta 破坏 file:// 降级）', () => {
  const files = walkSrc(join(ROOT, 'src'));
  const offenders = [];
  for (const f of files) {
    // 剥掉行注释与块注释，避免注释里提到 import( 造成误报
    const code = read(f.replace(ROOT + '\\', '').replace(ROOT + '/', ''))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/[^\n]*/gm, '');
    if (/\bimport\s*\(\s*['"`]/.test(code)) offenders.push(f.slice(ROOT.length + 1));
  }
  assert.deepEqual(offenders, [], `以下源码含动态 import()，会污染构建产物：${offenders.join(', ')}`);
  // 同时锁住 import.meta 字面量（同一类风险，编译产物会原样残留）
  const metaOffenders = files.filter((f) => {
    const code = read(f.slice(ROOT.length + 1)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
    return /import\.meta/.test(code);
  }).map((f) => f.slice(ROOT.length + 1));
  assert.deepEqual(metaOffenders, [], `以下源码含 import.meta，产物会残留：${metaOffenders.join(', ')}`);
});

test('D2 progression.js 用静态 dirty 驱动商店置脏，不再动态 import runtime', () => {
  const src = read('src/modules/progression.js');
  // 静态导入断言读原文（import 语句本身不会被注释掉）
  assert.ok(/import\s*\{\s*dirty\s*\}\s*from\s*'\.\.\/core\/runtime\.js'/.test(src),
    'progression.js 缺静态 `import { dirty } from ../core/runtime.js`');
  // 动态 import 的负向断言必须剥注释——修复说明里会引用旧写法
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.ok(!/import\(\s*'\.\.\/core\/runtime\.js'\s*\)/.test(code),
    'progression.js 仍在动态 import runtime（会重新触发 import.meta 污染）');
  assert.ok(/if \(task\.id === 'sp1_museum'\)\s*dirty\.shop = true/.test(code),
    'sp1_museum 完成置脏商店的逻辑缺失');
});

test('D3 dist/index.html 处于 file:// 可加载形态（经典 script / 无 crossorigin）', () => {
  const html = read('dist/index.html');
  assert.ok(!/<script[^>]*type="module"/.test(html),
    'dist/index.html 仍用 <script type="module">——file:// 下会被 CORS 拦截（CSS 随之失效）');
  assert.ok(/<script defer src="\.\/assets\/index-[\w-]+\.js"><\/script>/.test(html),
    'dist/index.html 未见 <script defer src="./assets/index-*.js"> 降级形态');
  assert.ok(!/crossorigin/.test(html), 'dist/index.html 仍残留 crossorigin 属性');
  // 引用的 js / css 必须真实存在
  const js = html.match(/src="\.\/assets\/(index-[\w-]+\.js)"/)?.[1];
  const css = html.match(/href="\.\/assets\/(index-[\w-]+\.css)"/)?.[1];
  assert.ok(js && existsSync(join(ROOT, 'dist/assets', js)), `index.html 引用的 js 不存在：${js}`);
  assert.ok(css && existsSync(join(ROOT, 'dist/assets', css)), `index.html 引用的 css 不存在：${css}`);
});

test('D4 产物 JS 不含 import.meta / 顶层 import 语句（否则降级插件会跳过且 file:// 失败）', () => {
  const html = read('dist/index.html');
  const js = html.match(/src="\.\/assets\/(index-[\w-]+\.js)"/)?.[1];
  assert.ok(js, 'dist/index.html 未引用 js');
  const code = read(`dist/assets/${js}`);
  assert.ok(!/import\.meta/.test(code), 'dist JS 残留 import.meta');
  assert.ok(!/(^|[\n;])\s*(import|export)\s/.test(code), 'dist JS 残留顶层 import/export 语句');
});
