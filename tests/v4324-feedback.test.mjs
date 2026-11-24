// v4.3.24 反馈①：裂隙等级升级需求改悬浮窗——行内常驻价格胶囊与「深入消耗」副标题移除，
// 需求（EP + DM）与下一级效果全量收进 data-rift-level-tip DOM 气泡（wage-tip-pop 范式）。
// 源码锁 + 纯 Node 行为验证。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ===== F1 rift.js 源码：常驻需求移除 + 悬浮文案数据源 =====
test('F1 riftLevelRowHtml 行内不再常驻价格胶囊与深入消耗副标题', () => {
  const rift = read('src/modules/rift.js');
  const rowFn = rift.match(/export function riftLevelRowHtml\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(rowFn, 'riftLevelRowHtml 函数体未匹配到');
  // 等级行内价格胶囊已删除（余烬升级树 pricePill 是合法消费点，不在本断言范围）
  assert.ok(!/pricePill/.test(rowFn), 'riftLevelRowHtml 行内仍残留 pricePill 价格胶囊模板');
  // 副标题「深入消耗 X EP/s）」内联模板已删除（气泡文案 riftLevelTipText 内的「深入消耗」是合法消费点）
  assert.ok(!/深入消耗 \$\{fmt\(riftDelveEpPerSec/.test(rowFn), 'riftLevelRowHtml 行内仍内联「深入消耗 X EP/s」副标题');
  // 升级按钮保留
  assert.ok(/data-rift-level-buy/.test(rowFn), '升级按钮 data-rift-level-buy 缺失');
});

test('F2 riftLevelTipText 导出：含升级需求 + 下一级效果 + 可支付态', () => {
  const rift = stripComments(read('src/modules/rift.js'));
  assert.ok(/export function riftLevelTipText\(\)/.test(rift), 'riftLevelTipText 导出缺失');
  assert.ok(/升级需求：\$\{fmt\(cost\.ep\)\} EP \+ \$\{fmt\(cost\.dm\)\} DM/.test(rift), '需求文案缺「X EP + Y DM」');
  assert.ok(/可支付|余额不足/.test(rift), '缺可支付态文案');
  assert.ok(/下一级效果：/.test(rift), '缺下一级效果段');
  // 旧 riftTechTip 原生 title 文案函数已下线（无死数据红线）
  assert.ok(!/function riftTechTip/.test(stripComments(read('src/modules/rift.js'))), 'riftTechTip 死函数残留');
});

test('F3 行 DOM：data-rift-level-tip 属性挂载 + 原生 title 移除', () => {
  const rift = read('src/modules/rift.js');
  assert.ok(/data-rift-level-tip=/.test(rift), '行 DOM 缺 data-rift-level-tip 属性');
  const rowFn = rift.match(/export function riftLevelRowHtml\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(rowFn && !/title=/.test(rowFn), 'riftLevelRowHtml 仍写原生 title（~1s 延迟纪律）');
});

// ===== F4 main.js 源码：气泡委托 + 绑定调用 =====
test('F4 main.js bindRiftLevelTipPop 范式完整', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(/function bindRiftLevelTipPop\(\)/.test(main), 'bindRiftLevelTipPop 函数缺失');
  assert.ok(/bindRiftLevelTipPop\(\);/.test(main), 'bindRiftLevelTipPop 未被调用');
  // 委托宿主 #rift-tab-panel（面板重建不丢监听）
  const fnBody = main.match(/function bindRiftLevelTipPop\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fnBody.includes("getElementById('rift-tab-panel')"), '气泡委托未挂 #rift-tab-panel');
  assert.ok(fnBody.includes('data-rift-level-tip'), '委托锚选择器缺 data-rift-level-tip');
  assert.ok(fnBody.includes("getElementById('rift-level-tip-pop')"), '气泡节点 id 缺失');
  // wage-tip-pop 基类（fixed 定位 + 浅色主题语义色继承）
  assert.ok(/wage-tip-pop rift-level-tip-pop/.test(main), '气泡未挂 wage-tip-pop 基类');
  // 四事件 + scroll 隐藏（与 distill/aff 同口径）
  assert.ok(fnBody.includes('mouseover') && fnBody.includes('mouseout') && fnBody.includes('focusin') && fnBody.includes('focusout'), '气泡四事件缺失');
  assert.ok(fnBody.includes("addEventListener('scroll'"), 'scroll 隐藏缺失');
});

// ===== F5 行为验证（纯 Node 导入真源） =====
test('F5 riftLevelTipText 行为：需求与下一级数值实时正确', async () => {
  const mod = await import(pathToFileURL(join(ROOT, 'src/modules/rift.js')).href);
  const { S } = await import(pathToFileURL(join(ROOT, 'src/state.js')).href);
  const { BALANCE } = await import(pathToFileURL(join(ROOT, 'src/data/balance.js')).href);
  // 种一个可支付态：Lv0（riftLevelTech=0）+ 足额 EP/DM
  S.riftLevelTech = 0;
  S.ep = 1e7; S.dm = 1000;
  S._riftSeen = true;
  const tip = mod.riftLevelTipText();
  const c = BALANCE.rift.levelTech || {};
  const ep = Math.ceil((c.baseEp || 2e5) * Math.pow(c.epGrowth || 1.9, 0));
  const dm = Math.ceil((c.baseDm || 10) * Math.pow(c.dmGrowth || 1.7, 0));
  assert.ok(tip.includes('升级需求：'), `缺「升级需求：」段（实际「${tip.slice(0, 60)}」）`);
  assert.ok(tip.includes('✓ 可支付'), '足额资源时缺「✓ 可支付」');
  assert.ok(tip.includes('下一级效果：'), '缺「下一级效果：」段');
  // 不足额 → 余额不足
  S.ep = 0; S.dm = 0;
  const tip2 = mod.riftLevelTipText();
  assert.ok(tip2.includes('✗ 余额不足'), '零资源时缺「✗ 余额不足」');
  // 行内 html：按钮 + 悬浮属性 + 无价格胶囊
  const row = mod.riftLevelRowHtml();
  assert.ok(/data-rift-level-tip="/.test(row), '行 html 缺 data-rift-level-tip');
  assert.ok(!/pricePill|EP \+ \d/.test(row.replace(/data-rift-level-tip="[^"]*"/g, '')), '行 html 悬浮属性外仍含价格文本');
  assert.ok(/data-rift-level-buy/.test(row), '行 html 缺升级按钮');
});
