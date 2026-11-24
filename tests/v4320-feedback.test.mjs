// v4.3.20 第十轮反馈批次 3 项（源码级锁）
// ① 领导 +1% 是全局产出乘区——进产出弹窗 multBreakdown（非「EP +1%」）
// ② 关闭自动转化 → 岗位线程下岗（日志「N 条线程下岗了...」）+ 下拉未开启岗位灰显 + bindThread 钳制
// ③ 手动蒸馏基准 30000→10000（收敛与工坊自动蒸馏换汇悬殊）+ 孵化三套口径统一到实扣 15000×lv
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 领导 +1% 进产出弹窗 ============

test('R1 multBreakdown 补领导全局乘区（语义「全局产出」，非 EP）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  // leaderGlobalMult 进 multBreakdown（!==1 才列，无领导不占行）
  assert.ok(/const lead = leaderGlobalMult\(\);/.test(eco), 'multBreakdown 应取 leaderGlobalMult');
  // v4.3.21 反转：toFixed(0)→toFixed(2)（等级制 +0.01%/级 需两位小数）
  assert.ok(/领导 \+\$\{\(\(lead - 1\) \* 100\)\.toFixed\(2\)\}%（全局产出）/.test(eco), '应列「领导 +N%（全局产出）」');
  // 真源核对：globalMult 内确有 m *= leaderGlobalMult()（乘区真实性）
  assert.ok(/m \*= leaderGlobalMult\(\);/.test(eco), 'globalMult 内应含领导乘区');
  // v4.3.21 反馈③：消耗弹窗拆分——drainMultBreakdown 只列消耗减少类
  assert.ok(/export function drainMultBreakdown\(\)/.test(eco), '消耗侧减免明细 drainMultBreakdown 缺失');
  const main = stripComments(read('src/main.js'));
  assert.ok(/isOut \? multBreakdown\(\) : drainMultBreakdown\(\)/.test(main), 'flowTipHtml 应按产/消分流乘区明细');
});

// ============ 反馈② 关闭转化线程下岗 ============

test('R2a setConverterEnabled 关闭时下岗该岗位线程并返回数量', () => {
  const tb = stripComments(read('src/modules/threadBinding.js'));
  // 返回下岗数（调用侧打日志用）
  assert.ok(/const off = \(S\.cultists \|\| \[\]\)\.filter\(c => c\.boundTo === type && !isLeader\(c\)\);/.test(tb), '应筛该岗位非领导线程');
  assert.ok(/c\.boundTo = null; c\.assignSince = null;/.test(tb), '下岗应清绑定与计时');
  assert.ok(/return off\.length;/.test(tb), '应返回下岗数');
  // 超线程不参与（无转化开关）
  assert.ok(/!on && type !== HYPER_CONVERTER_ID/.test(tb), '仅关闭资源岗位触发下岗');
});

test('R2b 快捷开关类操作全部静默（v4.3.21 反转：删开关/下岗日志）+ 下岗功能保留', () => {
  const main = stripComments(read('src/main.js'));
  // v4.3.21 反馈⑤：快捷开关不再打任何日志（开关文案/下岗汇总均删）
  assert.ok(!/快捷开关：/.test(main), '快捷开关日志应删除（反馈⑤ 全部静默）');
  assert.ok(!/条线程下岗了/.test(main), '快捷开关下岗日志应删除');
  // 下岗功能本身保留：快捷开关仍走 setConverterEnabled（内部置闲）
  assert.ok(/setConverterEnabled\('atrium', !converterEnabled\('atrium'\)\)/.test(main), '快捷开关仍应触发下岗');
  const shop = stripComments(read('src/modules/shop.js'));
  assert.ok(!/条线程下岗了/.test(shop), '蒸馏/探采开关下岗日志应删除');
  assert.ok(/setConverterEnabled\('atrium', !converterEnabled\('atrium'\)\)/.test(shop), '蒸馏开关仍应触发下岗');
  assert.ok(/setConverterEnabled\('vehicles', !converterEnabled\('vehicles'\)\)/.test(shop), '探采开关仍应触发下岗');
  const pets = stripComments(read('src/modules/pets.js'));
  assert.ok(/setConverterEnabled\('hatch', false\)/.test(pets), '孵化开关应触发下岗');
  assert.ok(!/条线程下岗了/.test(pets), '孵化开关下岗日志应删除');
  const rel = stripComments(read('src/modules/religions.js'));
  assert.ok(/setConverterEnabled\('temple', false\)/.test(rel), '圣所关闭应触发下岗');
  assert.ok(!/条线程下岗了/.test(rel), '圣所下岗日志应删除');
});

test('R2c 班组下拉未开启岗位灰显（disabled）+ bindThread 入口钳制', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // 灰显：未开启岗位 option disabled + 「（未开启）」标注（自身在岗除外）
  assert.ok(/const off = t !== HYPER_CONVERTER_ID && t !== c\.boundTo && !converterEnabled\(t\);/.test(crew), '应判定未开启岗位');
  assert.ok(/\$\{off \? ' disabled' : ''\}/.test(crew), '未开启岗位 option 应 disabled');
  assert.ok(/\$\{off \? '（未开启）' : ''\}/.test(crew), '未开启岗位应带标注');
  assert.ok(/converterEnabled,/.test(read('src/modules/crew.js')), 'crew 应 import converterEnabled');
  // bindThread 钳制（直调兜底；自身在岗例外）
  const tb = stripComments(read('src/modules/threadBinding.js'));
  assert.ok(/type !== HYPER_CONVERTER_ID && c\.boundTo !== type && !converterEnabled\(type\)\) return false;/.test(tb), 'bindThread 应拒绝未开启岗位');
});

// ============ 反馈③ 蒸馏换汇收敛 + 孵化口径统一 ============

test('R3a 手动蒸馏基准 30000→10000（rp_distill/罗盘/效率三档口径不变）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  const m = eco.match(/return \(10000 \/ Math\.pow\(1\.12, lv\) \/ eff\) \* rpEffScale\(\);/);
  assert.ok(m, 'rpDistillRate 基准应为 10000');
  assert.ok(!/return \(30000/.test(eco), '旧基准 30000 应删除');
  // 三档修正口径保留
  assert.ok(/1 \+ compass \* 0\.10/.test(eco), '罗盘效率应保留');
  assert.ok(/Math\.pow\(1\.12, lv\)/.test(eco), '蒸馏塔级减免应保留');
});

test('R3b 孵化口径统一到实扣 15000×lv×绑定（顶栏+卡面+升级日志三处）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  const m = eco.match(/return 15000 \* \(S\.ptHatchLv \|\| 1\) \* converterThreadBoost\('hatch'\);/);
  assert.ok(m, 'ptHatchEpPerSec 应对齐实扣 15000×lv×绑定');
  assert.ok(!/5000 \* \(S\.ptHatchLv \|\| 1\) \* \(S\.ptHatchLv \|\| 1\)/.test(eco), '旧式 5000×lv² 应删除');
  const shop = stripComments(read('src/modules/shop.js'));
  // 注意：fmt(15000 * lv) 中「* lv」在右括号前（非「15000 * lv)」），正则直接锚定格式串
  assert.ok(/15000 \* lv\)\} EP\/s → \+\$\{fmt\(0\.1 \* lv\)\} PT\/s/.test(shop), '孵化工坊卡面应对齐 15000/0.1');
  assert.ok(!/5000 \* lv\)\} EP\/s → \+\$\{fmt\(0\.15 \* lv\)\} PT\/s/.test(shop), '旧卡面 5000×lv→0.15×lv 应删除');
  assert.ok(!/5000 \* S\.ptHatchLv \* S\.ptHatchLv/.test(shop), '升级日志旧式 5000×lv² 应删除');
  // 实扣真源不动（pt:hatch 流 15000×lv×boost 本来就是实扣）
  const rf = stripComments(read('src/systems/resourceFlows.js'));
  assert.ok(/hatchCfg\.epPerSec \* hatchLv \* boost \* dt/.test(rf), 'pt:hatch 实扣真源应保持不变');
});
