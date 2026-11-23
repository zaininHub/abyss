// v4.3.17 反馈：班组岗位下拉框过宽，出现晋升领导时会产生不必要的扩大
// 根因：.crew-line-act select[data-bind] { flex: 1 1 auto; max-width: 110px } ——
//   无晋升按钮时被挤压 ~78px，晋升领导后其他卡按钮消失、下拉弹到 110px 顶满 → 两态跳变 + 过宽。
// 修复：固定 width: 78px + flex: 0 0 auto（78 + gap6 + 晋升按钮 50.9 ≈ 卡内可用 135.6；
//   取 88 会把按钮压到 41.6 触发「晋升★」换行、按钮撑高 32px 连锁卡高 +13，v4314 回归实测）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'src/style.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '') // 剥块注释
  .replace(/\/\/[^\n]*/g, '');      // 剥行注释

test('R1 岗位下拉固定窄宽（width:78px，非弹性伸缩）+ 按钮 nowrap', () => {
  const m = css.match(/\.crew-line-act select\[data-bind]\s*\{([^}]+)\}/);
  assert.ok(m, '缺少 .crew-line-act select[data-bind] 规则');
  assert.ok(/width:\s*78px/.test(m[1]), `应为固定 width:78px（实际「${m[1].trim()}」）`);
  assert.ok(/flex:\s*0\s*0\s*auto/.test(m[1]), '应为 flex:0 0 auto（不参与伸缩）');
  assert.ok(!/flex:\s*1\s*1\s*auto/.test(m[1]), '不应保留 flex:1 1 auto（两态跳变根因）');
  assert.ok(!/max-width/.test(m[1]), '不应再用 max-width 弹性上限');
  const b = css.match(/\.crew-line-act \.btn\s*\{([^}]+)\}/);
  assert.ok(b && /white-space:\s*nowrap/.test(b[1]), '晋升按钮应 white-space:nowrap（防★换行撑高卡片）');
});
