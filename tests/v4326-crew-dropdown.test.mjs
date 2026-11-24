// v4.3.26 回归：班组岗位原生 select 展开时，周期性 renderCrewPanel 不可 innerHTML 重建。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const crew = readFileSync(join(ROOT, 'src/modules/crew.js'), 'utf8');
const strip = (s) => s.replace(/\/\/[^\n]*/g, '');

test('职位下拉获得焦点期间冻结 crew panel DOM 重绘', () => {
  const src = strip(crew);
  assert.match(src, /if \(container\._crewSelectOpen\) \{ refreshCrewDyn\(container, start, pageCultists\); return; \}/,
    'renderCrewPanel 应在 _crewSelectOpen 时只更新动态数字，不能重建 DOM');
  assert.match(src, /const isBindSelect = \(target\) => target && target\.closest && target\.closest\('select\[data-bind\]'\)/,
    '应只对职位 select 启用冻结锁');
  assert.match(src, /container\.addEventListener\('focusin'[\s\S]*?_crewSelectOpen = true/,
    'focusin 应开启下拉冻结锁（键盘/触屏同样覆盖）');
  assert.match(src, /container\.addEventListener\('focusout'[\s\S]*?releaseBindSelectLock\(\)/,
    'focusout 应释放下拉冻结锁');
});

test('职位选择 change 延迟重绘到下拉失焦后，避免原生菜单立即收起', () => {
  const src = strip(crew);
  assert.match(src, /if \(container\._crewSelectOpen\) container\._crewSelectNeedsRender = true;[\s\S]*?else renderCrewPanel\(container\);/,
    'change 期间应标记延迟重绘，而非立即 innerHTML 重建');
  assert.match(src, /requestAnimationFrame\(\(\) => \{[\s\S]*?if \(container\._crewSelectNeedsRender\)[\s\S]*?renderCrewPanel\(container\);/,
    '释放锁后应在下一帧按需重绘');
  assert.match(src, /container\.addEventListener\('pointerdown'[\s\S]*?ev\.stopPropagation\(\)/,
    '保留 pointerdown 冒泡隔离，避免父级点击委托干扰');
});