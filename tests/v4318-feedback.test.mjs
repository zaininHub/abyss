// v4.3.18 第八轮反馈批次 4 项（源码级锁）
// ① 领导卡面「+1% -3 EP/s」+ 消耗不「少了」（Lv1 空闲同口径）+ 无领导时智能分配灰显
// ② 超线程收支倒挂：卡面产出行补 outMult 口径（纯显示层，EP 生产速度不变）
// ③ 深入裂隙悬浮文案改「消耗」具体口径（启动 + 探索期）
// ④ 成就收起再展开后回到顶部第一卡（收起即重置浏览游标）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 领导卡面 +1% / 消耗同口径 / 智能分配灰显 ============

test('R1 crew：领导卡「+1%」直出 + refreshCrewDyn 跳产出行、消耗行照刷', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // v4.3.21 反转：领导等级制——产出行模板直出等级实算百分比「+X% 全局」+ 独立津贴消耗行
  assert.ok(/isLead\s*\?\s*`<span class="crew-num">\+<b class="c-out">\$\{\(\(leaderGlobalMult\(\) - 1\) \* 100\)\.toFixed\(2\)\}%<\/b> 全局/.test(crew), '领导产出行应直出等级实算百分比');
  // 领导只跳产出行（if c.leader !== true 包住 out 写入）；消耗行在 if 外（照刷，否则恒 -0 假象）
  assert.ok(/if\s*\(c\.leader !== true\)\s*\{/.test(crew), '动态刷新应只跳领导产出行');
  const loop = crew.match(/for\s*\(let i = 0; i < outEls\.length[\s\S]*?\n {2}\}/);
  assert.ok(loop, 'refreshCrewDyn 循环缺失');
  assert.ok(!/c\.leader === true\)\s*continue;/.test(loop[0]), '循环内不应整体 continue（消耗行会停 0）');
  // v4.3.21 反转：领导消耗行走津贴真源（10 EP/s×级），普通线程走平均摊派
  assert.ok(/salEls\[i\]\.textContent = c\.leader === true \? fmt\(leaderSalaryPerSec\(\)\) : fmt\(salPer \* salaryFactorOf\(c\)\);/.test(loop[0]), '消耗行应照刷（领导津贴真源/普通平均摊派）');
});

test('R1 economy：领导消耗 Lv1 空闲线程同口径（吃 mood/outMult，不吃等级）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  // v4.3.16 bare 裸基数应已移除（精确锁旧式；economy 别处合法 bare 变量如产出悬浮窗不受影响）
  assert.ok(!/bare\s*=\s*\(c\.output/.test(eco), 'bare 裸基数（output×0.8）应已移除');
  // one：普通线程吃等级，领导不吃（恒 Lv1 口径）
  const m = eco.match(/const\s+one\s*=\s*\(c\.output\s*\|\|\s*3\)\s*\*\s*0\.8\s*\*\s*mood\s*\*\s*outMult\s*\*\s*\(isLead\s*\?\s*1\s*:\s*threadLevelMult\(threadLevel\(c\)\)\);/);
  assert.ok(m, 'one 应为「领导不吃等级」口径');
  // v4.3.21 反馈⑥：领导津贴真源存在（10 EP/s×级，独立于薪资口径）
  assert.ok(/export function leaderSalaryPerSec\(\)/.test(eco), '领导津贴真源 leaderSalaryPerSec 缺失');
  assert.ok(/return 10 \* leaderLvOf\(lead\);/.test(eco), '津贴公式应为 10×领导等级');
});

test('R1c 无领导时智能分配灰显 + 提示文案 + 签名含领导态', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // 按钮 disabled 绑定领导存在性
  assert.ok(/data-autobind="1"\s*\$\{\(S\.cultists\s*\|\|\s*\[\]\)\.some\(c\s*=>\s*isLeader\(c\)\)\s*\?\s*''\s*:\s*'disabled'\}/.test(crew), '智能分配按钮应随领导存在性灰显');
  // 签名含 lead 字段（晋升/卸任后 disabled 态能解除）
  assert.ok(/lead:\$\{hasLeaderNow \? 1 : 0\}/.test(crew), '渲染签名应含领导存在性');
  // v4.3.21 反馈⑥：领导等级入签名（升级后卡面 Lv/产出/消耗行随重建刷新）
  assert.ok(/leadlv:\$\{leadLvNow\}/.test(crew), '渲染签名应含领导等级');
});

// ============ 反馈② 超线程卡面产出/消耗同口径 ============

test('R2 卡面产出行补 outMult（与消耗侧 salPer 同口径），EP 真值不动', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(/const\s+outLine\s*=\s*threadOutMult\(\);/.test(crew), 'refreshCrewDyn 应取产线乘数');
  const m = crew.match(/const\s+out\s*=[^;]*threadLevelMult\(threadLevel\(c\)\)\s*\*\s*threadBindOutputFactor\(c\);/);
  assert.ok(m, '产出行应保留等级×岗位乘区');
  assert.ok(/outLine/.test(m[0]), '产出行应乘 outLine（产线放大）');
  // economy 侧真源收敛（一处定义两处消费，杜绝口径漂移）
  // v4.3.21 反转：staffOutputParts 改用 threadOutMultParts()（focus/rest 拆分），outMult = focus × rest
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/export function threadOutMult\(\)/.test(eco), 'economy 应导出 threadOutMult');
  assert.ok(/const\s+\{\s*focus,\s*rest\s*\}\s*=\s*threadOutMultParts\(\);/.test(eco), 'staffOutputParts 应复用 threadOutMultParts 真源');
  // 显示层红线：threadOutMult 不写 S（纯读），EP 生产速度不变
  const fn = eco.match(/export function threadOutMult\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn && !/S\.\w+\s*=/.test(fn[0].replace(/S\.upgrades\.\w+/g, '')), 'threadOutMult 必须纯读不写状态');
});

// ============ 反馈③ 深入裂隙悬浮文案 ============

test('R3 深入裂隙 title 改「消耗」具体口径（启动 + 探索期）', () => {
  const rift = stripComments(read('src/modules/rift.js'));
  assert.ok(!/需消耗 EP 与 DM/.test(rift), '旧「需消耗 EP 与 DM」文案应删除');
  assert.ok(/深入裂隙：60 秒探索 · 消耗 启动/.test(rift), 'title 应写「消耗 启动 X EP + 探索期约 Y EP」');
  assert.ok(/消耗 启动 \$\{fmt\(Math\.ceil\(r\.sealCost \* 0\.5\)\)\} EP \+ 探索期约 \$\{fmt\(riftDelveTotalEp\(r\.level\)\)\} EP/.test(rift), '消耗两段应引用真源（sealCost×0.5 + riftDelveTotalEp）');
});

// ============ 反馈④ 成就收起复位 ============

test('R4 成就收起即重置浏览游标（achPage=1 + 清 _keepScroll + 隐藏态重建）', () => {
  const main = stripComments(read('src/main.js'));
  // 收起分支三件套
  assert.ok(/const\s+willCollapse\s*=\s*!achPanel\.classList\.contains\('sl-collapsed'\);/.test(main), '收起判定缺失');
  assert.ok(/if\s*\(willCollapse\)\s*\{/.test(main), '收起分支缺失');
  assert.ok(/achPage\s*=\s*1;/.test(main), '收起应重置 achPage');
  assert.ok(/list\._keepScroll\s*=\s*null;/.test(main), '收起应清 _keepScroll');
  assert.ok(/renderAchievementPanel\(list\);/.test(main), '收起应隐藏态重建列表');
  // 展开链不破坏（applyAch 保留）
  assert.ok(/const\s+applyAch\s*=/.test(main), 'applyAch 展开链应保留');
});
