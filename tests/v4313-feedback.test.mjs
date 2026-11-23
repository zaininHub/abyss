// v4.3.13 玩家反馈专项（源码级锁，7 项）：
// ① sp3 特殊任务完成才打日志（购买即结算 + 残留态静默补结算）
// ② 裂隙科技树余烬获取后才显示 + VS 升级 VS 获取后才显示 + 文案「裂隙科技」
// ③ 锁定 tab hover 不高亮（两条 .btn:hover 都排除 tab-locked）
// ④ 裂隙开启日志改「入口已开放」+ 首裂不发 DM
// ⑤ EP 上限提示 RP 未解锁时不再提溢出转 RP
// ⑥ 领导徽章/按钮去「领导」字样 + 智能分配需领导
// ⑦ 蒸馏按钮精简「蒸馏」二字 + 悬浮含消耗产出 + 蒸馏左自动右
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ============ ① sp3 日志时机 ============

test('R1a 购买即同步结算（结算移出 setTimeout）', () => {
  const src = stripComments(read('src/modules/wishDock.js'));
  // checkSpecialTasks 调用不再位于 setTimeout 回调内：购买函数体内直接调用
  assert.ok(/checkSpecialTasks\(S, log, toast\)/.test(src), 'wishDock 缺同步结算调用');
  // setTimeout 回调内不得再有结算调用（只剩动画清理）
  const m = src.match(/setTimeout\(\(\)\s*=>\s*\{[\s\S]*?\},\s*800\)/);
  assert.ok(m, '800ms 动画清理回调缺失');
  assert.ok(!/checkSpecialTasks/.test(m[0]), '结算仍在 setTimeout 内（关页丢结算风险）');
});

test('R1b sp3 残留补结算静默（帧扫描不打日志）', () => {
  const src = stripComments(read('src/modules/progression.js'));
  assert.ok(/silentBackfill\s*=\s*task\.id\s*===\s*'sp3_farewell'/.test(src), '残留态判定缺失');
  assert.ok(/if\s*\(!silentBackfill\)\s*\{/.test(src), '静默分支缺失');
  // 完成日志须位于静默分支内
  const m = src.match(/if\s*\(!silentBackfill\)\s*\{([\s\S]{0,600}?)\}/);
  assert.ok(m && /特殊任务：/.test(m[1]), '完成日志未包进非静默分支');
});

// ============ ② 裂隙科技门控 + 文案 ============

test('R2a 裂隙科技树在余烬获取前不渲染 + 文案改「裂隙科技」', () => {
  const src = stripComments(read('src/modules/rift.js'));
  assert.ok(/emberSeen\s*=\s*\(S\.riftEmber\s*\|\|\s*0\)\s*>\s*0/.test(src), '余烬获取判定缺失');
  assert.ok(/if\s*\(emberSeen\)\s*\{/.test(src), '科技树未按余烬门控');
  assert.ok(/「裂隙科技」|>裂隙科技</.test(src) || />裂隙科技<\//.test(src), '标题非「裂隙科技」');
  assert.ok(!/>裂隙科技 · 余烬购买</.test(src), '旧标题「裂隙科技 · 余烬购买」残留');
});

test('R2b VS 升级（echo/voidheart）在 VS 获取前隐藏', () => {
  const src = stripComments(read('src/modules/rift.js'));
  assert.ok(/vsSeen\s*=\s*\(S\.vs\s*\|\|\s*0\)\s*>\s*0/.test(src), 'VS 获取判定缺失');
  assert.ok(/!vsSeen\s*&&\s*\(id\s*===\s*'echo'\s*\|\|\s*id\s*===\s*'voidheart'\)/.test(src), 'VS 卡隐藏门缺失');
});

// ============ ③ 锁定 tab hover 统一不高亮 ============

test('R3 两条 .btn:hover 规则都排除 tab-locked', () => {
  const css = read('src/style.css');
  // L310 背景高亮（v4.3.13 补排除）与 v2.7.0 发光高亮（既有排除）口径一致
  assert.ok(/\.btn:not\(:disabled\):not\(\.tab-locked\):hover\s*\{\s*background:\s*#30363d/.test(css), '背景 hover 未排除 tab-locked');
  assert.ok(/\.btn:not\(:disabled\):not\(\.tab-locked\):hover\s*\{[^}]*border-color:\s*var\(--purple\)/.test(css), '发光 hover 排除丢失');
});

// ============ ④ 裂隙开启日志 + 首裂不发 DM ============

test('R4a 裂隙开启日志改「入口已开放」', () => {
  const src = stripComments(read('src/modules/rift.js'));
  assert.ok(/探采平台与深渊商店入口已开放/.test(src), '日志未改入口语义');
  assert.ok(!/探采平台与深渊商店已解锁/.test(src), '旧「已解锁」文案残留');
});

test('R4b 首裂不发 DM（firstRift 标记 + 结算分流）', () => {
  const src = stripComments(read('src/modules/rift.js'));
  assert.ok(/firstRift:\s*!S\._riftSeen/.test(src), '首裂标记缺失');
  assert.ok(/r\.firstRift\s*\?\s*0\s*:\s*sealDmReward/.test(src), '结算未按首裂分流');
  // 深入按钮提示不再引导「裂隙封印获得 DM」
  assert.ok(!/购入首辆载具或通过裂隙封印获得/.test(src), '旧 DM 获取提示残留');
  assert.ok(/购入首辆载具后经探采获得/.test(src), '新 DM 获取提示缺失');
});

// ============ ⑤ EP 上限提示按 RP 解锁态分流 ============

test('R5 EP 上限提示在 RP 未解锁时不提溢出转 RP', () => {
  const src = stripComments(read('src/main.js'));
  assert.ok(/const\s+rpOn\s*=\s*!!\(S\.resDiscovered\s*&&\s*S\.resDiscovered\.rp\)/.test(src), 'rpOn 判定缺失');
  // ep-cap-hint 分流
  const m = src.match(/if\s*\(S\.ep\s*>=\s*cap\s*\*\s*0\.95\)\s*\{[\s\S]{0,500}?hint\.style\.color\s*=\s*'var\(--bad\)'/);
  assert.ok(m === null || /rpOn/.test(m[0]), 'ep-cap-hint 未按 rpOn 分流');
});

// ============ ⑥ 领导星标 + 智能分配门 ============

test('R6a 领导徽章与按钮去「领导」字样', () => {
  const crew = read('src/modules/crew.js');
  const src = stripComments(crew);
  assert.ok(!/★领导/.test(src), '徽章仍有「★领导」');
  assert.ok(!/晋升领导|取消领导/.test(src), '按钮仍有「领导」字样');
  assert.ok(/卸任★|晋升★/.test(src), '星标按钮文案缺失');
});

test('R6b 智能分配需先设领导', () => {
  const src = stripComments(read('src/modules/crew.js'));
  assert.ok(/some\(c\s*=>\s*isLeader\(c\)\)/.test(src), '领导存在性判定缺失');
  assert.ok(/请先晋升一名领导/.test(src), '无领导提示缺失');
});

// ============ ⑦ 蒸馏按钮精简 + 布局 ============

test('R7a 蒸馏按钮只写「蒸馏」，消耗产出入悬浮', () => {
  const src = stripComments(read('src/modules/shop.js'));
  const m = src.match(/id="rp-distill-btn"[\s\S]{0,400}?<\/button>/);
  assert.ok(m, '蒸馏按钮模板缺失');
  assert.ok(/>蒸馏<\/button>$/.test(m[0].trim()), '按钮文字非纯「蒸馏」');
  // v4.3.15 反馈①：悬浮载体从原生 title 属性改为 data-distill-tip（DOM 气泡即时显示，
  //   消除浏览器 title ~1s 延迟）——文案移到 distillTip 变量，断言分两段：模板引用变量 + 变量含文案。
  assert.ok(/data-distill-tip=/.test(m[0]), '悬浮应走 data-distill-tip（DOM 气泡）');
  const tip = src.match(/const distillTip = `([^`]+)`/);
  assert.ok(tip, 'distillTip 变量缺失');
  assert.ok(/单次蒸馏：-/.test(tip[1]), '悬浮缺「单次蒸馏：-X EP」');
  assert.ok(new RegExp('\\+\\$\\{fmt\\(distillRp\\)\\}\\s*RP').test(tip[1]), '悬浮缺「+Y RP」');
});

test('R7b 蒸馏在左、自动在右', () => {
  const src = stripComments(read('src/modules/shop.js'));
  // 已购分支：distillBtn() 无 margin-left:auto（不再推到行尾），自动开关带 margin-left:auto
  const m = src.match(/灵感工坊 ×\$\{n\}[\s\S]{0,600}?<\/div>`/);
  assert.ok(m, '开关行模板缺失');
  const seg = m[0];
  const distillPos = seg.indexOf('${distillBtn()}');
  const autoPos = seg.indexOf('data-atrium-switch');
  assert.ok(distillPos >= 0 && autoPos > distillPos, '蒸馏未排在自动开关之前');
  assert.ok(/margin-left:auto;cursor:pointer/.test(seg), '自动开关未靠右');
});
