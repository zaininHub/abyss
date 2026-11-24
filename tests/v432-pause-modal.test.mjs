// 暂停弹框回归：暂停后 modal 必须压过全屏代码雨，并由 togglePause 打开。
// 这是源文件级契约测试；不构建 dist，避免定向修复期间覆盖共享产物。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('togglePause 打开可见且可访问的暂停 modal', async () => {
  const [main, html] = await Promise.all([read('src/main.js'), read('index.html')]);
  assert.match(html, /<div id="pause-modal" class="modal"[^>]*aria-hidden="true"/,
    'pause modal starts hidden to assistive technology');
  assert.match(main, /function togglePause\(\)[\s\S]*?showPauseModal\(\)/,
    'pausing invokes the modal opener');
  assert.match(main, /function showPauseModal\(\)[\s\S]*?modal\.style\.display = 'flex';[\s\S]*?modal\.setAttribute\('aria-hidden', 'false'\)/,
    'opener makes the modal visible and exposed');
  assert.match(main, /function hidePauseModal\(\)[\s\S]*?modal\.style\.display = 'none';[\s\S]*?modal\.setAttribute\('aria-hidden', 'true'\)/,
    'closer restores the hidden state');
});

test('暂停 modal 位于代码雨和悬浮气泡之上', async () => {
  const css = await read('src/style.css');
  const rainZ = Number(css.match(/#code-rain\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
  const pauseZ = Number(css.match(/#pause-modal\s*\{[^}]*z-index:\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(rainZ), 'code-rain stacking level is declared');
  assert.ok(Number.isFinite(pauseZ), 'pause modal stacking level is declared');
  assert.ok(pauseZ > rainZ, `pause modal z-index ${pauseZ} must exceed code-rain ${rainZ}`);
});
