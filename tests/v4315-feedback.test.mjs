// v4.3.15 第七轮玩家反馈批次（源码级锁）：
// ① 蒸馏悬浮改 DOM 气泡（原生 title ~1s 延迟 → 即时显示）
// ② 班组岗位容量钳制：手动下拉 / 智能分配都不超「设施数量」（超线程除外）
// ③ 已有领导时其他线程不显示晋升按钮（卸任后恢复）
// ④ 裂隙 tab 移到研究点右侧（解锁早）
// ⑤ 顶栏不显示本局累计 EP（晋升面板同口径承载）
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ============ 反馈① 蒸馏悬浮即时气泡 ============

test('R1a 蒸馏按钮悬浮载体换源：title → data-distill-tip', () => {
  const src = stripComments(read('src/modules/shop.js'));
  const m = src.match(/id="rp-distill-btn"[\s\S]{0,400}?<\/button>/);
  assert.ok(m, '蒸馏按钮模板缺失');
  assert.ok(/data-distill-tip=/.test(m[0]), '按钮缺 data-distill-tip');
  assert.ok(!/\stitle="/.test(m[0]), '按钮仍残留原生 title（~1s 延迟源头）');
});

test('R1b main.js 气泡绑定：委托稳定宿主 #rp-panel + wage-tip-pop 范式', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(/function bindDistillTipPop/.test(main), 'bindDistillTipPop 缺失');
  assert.ok(/getElementById\('rp-panel'\)/.test(main), '委托宿主应为 #rp-panel（按钮重建不丢监听）');
  assert.ok(/distill-tip-pop/.test(main), '气泡节点 id 缺失');
  assert.ok(/bindDistillTipPop\(\);/.test(main), 'bindDistillTipPop 未接线');
});

// ============ 反馈② 岗位容量钳制（手动 + 自动） ============

test('R2a bindThread 容量钳制：满员拒绝、超线程豁免、原地重选放行', () => {
  const tb = stripComments(read('src/modules/threadBinding.js'));
  assert.match(tb, /if \(type !== HYPER_CONVERTER_ID && c\.boundTo !== type/, '容量判定缺超线程豁免/原地重选豁免');
  assert.match(tb, /&& converterLoad\(type\) >= converterCapacity\(type\)\) return false;/, '满员拒绝缺失');
});

test('R2b crew.js 满员提示 + 回显旧值 + 下拉源头移除满员岗位（v4.3.19 反转：标注改移除）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  assert.match(crew, /分配失败：.*已满员（容量 = 设施数量）/, '满员 crewPush 提示缺失');
  assert.match(crew, /sel\.value = c\.boundTo \|\| '';/, '拒绝后未回显旧值');
  // v4.3.19 反馈②：满员岗位不再标「（已满）」而是直接从下拉 opts 移除（超线程/自身岗位豁免）
  assert.match(crew, /converterLoad\(t\) < converterCapacity\(t\)/, '下拉缺满员岗位源头过滤');
  assert.doesNotMatch(crew, /（已满）/, '旧「（已满）」标注残留');
  assert.ok(/converterLoad, converterCapacity/.test(crew), 'converterLoad/Capacity 未导入');
});

// ============ 反馈③ 领导在任隐藏晋升按钮 ============

test('R3 有领导时其他线程不渲染晋升按钮（卸任后恢复）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // hasLeader 定义与 leaderBtn 消费分两行——分两段断言
  assert.match(crew, /const hasLeader = \(S\.cultists \|\| \[\]\)\.some\(x => isLeader\(x\) && x !== c\)/, '缺「已有其他领导」判定');
  // v4.3.23 反转：升级按钮下线，leaderBtn 语句以 `</button>`; 结尾
  const m = crew.match(/const leaderBtn = [\s\S]{0,600}?<\/button>`;/);
  assert.ok(m, 'leaderBtn 渲染缺失');
  assert.match(m[0], /!isLead && hasLeader/, '非领导线程在有领导时应隐藏按钮');
  assert.ok(!/data-lead-up/.test(crew), '手动升级按钮 data-lead-up 应已下线（v4.3.23）');
});

// ============ 反馈④ 裂隙 tab 移到研究点右侧 ============

test('R4 裂隙按钮 DOM 顺序在研究点之后、集市之前', () => {
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  const rp = html.indexOf('id="btn-rp"');
  const rift = html.indexOf('id="btn-rift-tab"');
  const bazaar = html.indexOf('id="btn-bazaar"');
  assert.ok(rp >= 0 && rift > rp && rift < bazaar, `裂隙应在研究点后、集市前（rp=${rp} rift=${rift} bazaar=${bazaar}）`);
});

// ============ 反馈⑤ 顶栏隐藏本局累计 EP ============

test('R5 顶栏 h-run stat 删除 + main.js 引用清理', () => {
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/id="h-run"/.test(html), 'index.html 仍有 h-run stat');
  const main = stripComments(read('src/main.js'));
  assert.ok(!/getElementById\('h-run'\)/.test(main), 'main.js 仍引用 h-run');
  assert.ok(!/hRun\b/.test(main), 'main.js 仍有 hRun 残留');
});
