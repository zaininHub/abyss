// v4.3.24 反馈①：裂隙等级升级需求改悬浮窗——行内常驻价格胶囊与「深入消耗」副标题移除。
// v4.3.25 反馈②（本文件同步）：悬浮再拆分——等级名块只讲「下一级效果」，升级按钮只讲
//   「升级需求/可支付态」；行内固定副标题「裂隙等级 +1 · 悬浮查看升级需求」删除。
// 源码锁 + 纯 Node 行为验证。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ===== F1 rift.js 源码：常驻需求/副标题移除 + 双悬浮锚点 =====
test('F1 riftLevelRowHtml 行内无常驻价格胶囊、无「悬浮查看升级需求」副标题', () => {
  const rift = read('src/modules/rift.js');
  const rowFn = rift.match(/export function riftLevelRowHtml\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(rowFn, 'riftLevelRowHtml 函数体未匹配到');
  // 等级行内价格胶囊已删除（余烬升级树 pricePill 是合法消费点，不在本断言范围）
  assert.ok(!/pricePill/.test(rowFn), 'riftLevelRowHtml 行内仍残留 pricePill 价格胶囊模板');
  // 副标题「深入消耗 X EP/s）」内联模板已删除（气泡文案 riftLevelTipText 内的「深入消耗」是合法消费点）
  assert.ok(!/深入消耗 \$\{fmt\(riftDelveEpPerSec/.test(rowFn), 'riftLevelRowHtml 行内仍内联「深入消耗 X EP/s」副标题');
  // v4.3.25 反馈②：固定副标题「裂隙等级 +1 · 悬浮查看升级需求」删除
  assert.ok(!/悬浮查看升级需求/.test(rowFn), 'riftLevelRowHtml 仍残留「悬浮查看升级需求」副标题');
  // 升级按钮 + 两个悬浮锚点保留
  assert.ok(/data-rift-level-buy/.test(rowFn), '升级按钮 data-rift-level-buy 缺失');
  assert.ok(/data-rift-level-tip=/.test(rowFn), '等级名块缺 data-rift-level-tip 锚点');
  assert.ok(/data-rift-buy-tip=/.test(rowFn), '升级按钮缺 data-rift-buy-tip 锚点');
});

test('F2 双文案函数：等级=下一级效果；按钮=升级需求 + 可支付态', () => {
  const rift = stripComments(read('src/modules/rift.js'));
  assert.ok(/export function riftLevelTipText\(\)/.test(rift), 'riftLevelTipText 导出缺失');
  assert.ok(/export function riftLevelCostTipText\(\)/.test(rift), 'riftLevelCostTipText 导出缺失');
  const effectFn = rift.match(/export function riftLevelTipText\(\)[\s\S]*?\n\}/)?.[0] || '';
  const costFn = rift.match(/export function riftLevelCostTipText\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(effectFn.includes('下一级效果：'), '等级气泡缺下一级效果段');
  assert.ok(!effectFn.includes('升级需求：'), '等级气泡不应再包含升级需求（应移到按钮气泡）');
  assert.ok(costFn.includes('升级需求：'), '按钮气泡缺升级需求段');
  assert.ok(/可支付|余额不足/.test(costFn), '按钮气泡缺可支付态文案');
  assert.ok(!costFn.includes('下一级效果：'), '按钮气泡不应包含下一级效果');
  // 旧 riftTechTip 原生 title 文案函数已下线（无死数据红线）
  assert.ok(!/function riftTechTip/.test(rift), 'riftTechTip 死函数残留');
});

test('F3 行 DOM：等级/按钮各挂 data 锚点 + 原生 title 移除', () => {
  const rift = read('src/modules/rift.js');
  const rowFn = rift.match(/export function riftLevelRowHtml\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(rowFn, 'riftLevelRowHtml 函数体未匹配到');
  // 锚点在子元素上：外层行只留 data-rift-level（购买逻辑/可购态同步用）
  assert.ok(/<div[^>]*data-rift-level-tip=/.test(rowFn), '等级名块未挂 data-rift-level-tip');
  assert.ok(/<button[^>]*data-rift-buy-tip=/.test(rowFn), '升级按钮未挂 data-rift-buy-tip');
  assert.ok(!/data-rift-level data-rift-level-tip/.test(rowFn), '外层行仍挂整行 data-rift-level-tip');
  assert.ok(!/title=/.test(rowFn), 'riftLevelRowHtml 仍写原生 title（~1s 延迟纪律）');
});

// ===== F4 main.js 源码：气泡委托 + 绑定调用 =====
test('F4 main.js bindRiftLevelTipPop 支持双锚点', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(/function bindRiftLevelTipPop\(\)/.test(main), 'bindRiftLevelTipPop 函数缺失');
  assert.ok(/bindRiftLevelTipPop\(\);/.test(main), 'bindRiftLevelTipPop 未被调用');
  // 委托宿主 #rift-tab-panel（面板重建不丢监听）
  const fnBody = main.match(/function bindRiftLevelTipPop\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(fnBody.includes("getElementById('rift-tab-panel')"), '气泡委托未挂 #rift-tab-panel');
  assert.ok(fnBody.includes('data-rift-level-tip'), '委托锚选择器缺 data-rift-level-tip');
  assert.ok(fnBody.includes('data-rift-buy-tip'), '委托锚选择器缺 data-rift-buy-tip');
  assert.ok(fnBody.includes('dataset.riftBuyTip'), '按钮气泡未读取 dataset.riftBuyTip');
  assert.ok(fnBody.includes("getElementById('rift-level-tip-pop')"), '气泡节点 id 缺失');
  // wage-tip-pop 基类（fixed 定位 + 浅色主题语义色继承）
  assert.ok(/wage-tip-pop rift-level-tip-pop/.test(main), '气泡未挂 wage-tip-pop 基类');
  // 四事件 + scroll 隐藏（与 distill/aff 同口径）
  assert.ok(fnBody.includes('mouseover') && fnBody.includes('mouseout') && fnBody.includes('focusin') && fnBody.includes('focusout'), '气泡四事件缺失');
  assert.ok(fnBody.includes("addEventListener('scroll'"), 'scroll 隐藏缺失');
});

// ===== F5 行为验证（纯 Node 导入真源） =====
test('F5 双文案行为：效果/需求实时正确且互不混入', async () => {
  const mod = await import(pathToFileURL(join(ROOT, 'src/modules/rift.js')).href);
  const { S } = await import(pathToFileURL(join(ROOT, 'src/state.js')).href);
  // 种一个可支付态：Lv0（riftLevelTech=0）+ 足额 EP/DM
  S.riftLevelTech = 0;
  S.ep = 1e7; S.dm = 1000;
  S._riftSeen = true;
  const effect = mod.riftLevelTipText();
  const cost = mod.riftLevelCostTipText();
  assert.ok(effect.includes('下一级效果：'), `等级气泡缺「下一级效果：」（实际「${effect.slice(0, 60)}」）`);
  assert.ok(!effect.includes('升级需求：'), '等级气泡混入了升级需求');
  assert.ok(effect.includes('深入消耗'), '等级气泡缺深入消耗数值');
  assert.ok(cost.includes('升级需求：'), '按钮气泡缺「升级需求：」');
  assert.ok(cost.includes('✓ 可支付'), '足额资源时按钮气泡缺「✓ 可支付」');
  assert.ok(!cost.includes('下一级效果：'), '按钮气泡混入了下一级效果');
  // 不足额 → 余额不足
  S.ep = 0; S.dm = 0;
  assert.ok(mod.riftLevelCostTipText().includes('✗ 余额不足'), '零资源时缺「✗ 余额不足」');
  // 行内 html：两个锚点 + 无固定副标题
  const row = mod.riftLevelRowHtml();
  assert.ok(/data-rift-level-tip="/.test(row), '行 html 缺 data-rift-level-tip');
  assert.ok(/data-rift-buy-tip="/.test(row), '行 html 缺 data-rift-buy-tip');
  assert.ok(/data-rift-level-buy/.test(row), '行 html 缺升级按钮');
  assert.ok(!/悬浮查看升级需求/.test(row), '行 html 仍含固定副标题');
});