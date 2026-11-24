// v4.3.16 第七轮反馈追加批次 2 项（源码级锁）
// ① 领导「全局 +1% 产出加成、消耗固定 EP、不显示等级」（v4.3.18 反转消耗口径后仍锁行为面）
// ② 删除任务领取「任务 EP 已达存储上限」toast（addEp 统一入口内部处理溢出，弹窗造成困惑）
// v4.3.18 反转说明：领导消耗从 v4.3.16 的「固定裸基数 bare」改为「Lv1 空闲线程同口径」
//   （吃 mood/outMult，不吃岗位/等级）——玩家反馈「固定消耗少了」+「卡面 +0 EP/s -3 EP/s
//   应为 +1% -3 EP/s」。源码锁同步反转到新口径，行为面断言（卡面 1%/无 Lv）保留。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 领导全局 +1% / 消耗 Lv1 空闲同口径 ============

test('R1a economy.staffOutputParts：领导产出 0、薪资同口径计入（v4.3.23 等级统一）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  // 领导判定保留
  assert.ok(/const\s+isLead\s*=\s*c\.leader\s*===\s*true/.test(eco), 'staffOutputParts 未判定领导');
  // v4.3.16 的 bare 固定裸基数应已移除（v4.3.18 反转为 Lv1 空闲同口径）
  //   精确锁旧式：economy 别处合法 bare 变量（产出悬浮窗 thread-focusPart）不受影响
  assert.ok(!/bare\s*=\s*\(c\.output/.test(eco), 'bare 固定裸基数应已移除（v4.3.18 反转）');
  // v4.3.23 反转：one/oneSal 统一吃 lvMult（领导与普通线程同一等级口径）
  const m = eco.match(/const\s+lvMult\s*=\s*threadLevelMult\(threadLevel\(c\)\);[\s\S]{0,200}?const\s+one\s*=\s*\(c\.output\s*\|\|\s*3\)\s*\*\s*0\.8\s*\*\s*mood\s*\*\s*outMult\s*\*\s*lvMult;/);
  assert.ok(m, 'one 应为统一 lvMult 口径（v4.3.23 领导等级统一）');
  // 产出：领导 0（total 累加跳过）；薪资：领导按 oneSal 计入（factor 恒 1，boundTo 恒 null）
  assert.ok(/total\s*\+=\s*isLead\s*\?\s*0\s*:\s*one\s*\*\s*factor;/.test(eco), '领导个人产出应跳过');
  assert.ok(/salaryBase\s*\+=\s*oneSal\s*\*\s*\(c\.boundTo\s*===\s*HYPER_CONVERTER_ID\s*\?\s*1\s*:\s*factor\);/.test(eco), '薪资基数应计入领导份额');
});

test('R1b crew 卡面：产出行「+X%」直出 + 消耗平均摊派（v4.3.23 津贴下线）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // v4.3.23 反转：卡面统一 Lv 显示（领导等级 = 普通等级 c.level）
  assert.ok(/const\s+lvHtml\s*=\s*` <span class="crew-lv">Lv\.\$\{lvl\}<\/span>`;/.test(crew), '卡面应统一 Lv 显示（不分领导/普通）');
  // 产出行直出「全局产出 +X.XX%」；津贴消耗行已下线
  assert.ok(/isLead\s*\?\s*`<span class="crew-num">全局产出 \+<b class="c-out">\$\{leaderGlobalPercent\(\)\.toFixed\(2\)\}%<\/b>/.test(crew), '领导产出行应直出「全局产出 +等级实算百分比」');
  assert.ok(!/津贴 -</.test(crew), '领导津贴消耗行应已下线（v4.3.23）');
  assert.ok(/if\s*\(c\.leader !== true\)\s*\{/.test(crew), '动态刷新应只跳领导产出行');
  assert.ok(!/leaderSalaryPerSec/.test(crew), 'crew.js 不应再引用 leaderSalaryPerSec（v4.3.23）');
  assert.ok(/if \(salEls\[i\]\) salEls\[i\]\.textContent = fmt\(salPer \* salaryFactorOf\(c\)\);/.test(crew), '消耗行应统一走平均摊派口径');
});

// ============ v4.3.18 反馈② 卡面产出口径补齐 outMult ============

test('R3 crew 卡面产出行与 staffOutputParts 同口径（outMult 放大）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // refreshCrewDyn 产出行应乘 threadOutMult()（与 economy 真源同式）
  assert.ok(/threadOutMult\(\)/.test(crew), '卡面产出行应补产线乘数 threadOutMult');
  const m = crew.match(/const\s+out\s*=\s*\(c\.output\s*\|\|\s*3\)\s*\*\s*0\.8\s*\*\s*\(MOOD_MULT\[c\.mood\]\s*\|\|\s*1\)\s*\*\s*outLine\s*\*\s*threadLevelMult\(threadLevel\(c\)\)\s*\*\s*threadBindOutputFactor\(c\);/);
  assert.ok(m, '产出行应含 mood×outMult×等级×岗位全乘区');
  // economy 侧 threadOutMult 真源存在且 staffOutputParts 复用同一真源
  // v4.3.21 反转：staffOutputParts 改用 threadOutMultParts()（focus/rest 拆分），outMult = focus × rest
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/export function threadOutMult\(\)/.test(eco), 'economy 应导出 threadOutMult 真源');
  assert.ok(/const\s+\{\s*focus,\s*rest\s*\}\s*=\s*threadOutMultParts\(\);/.test(eco), 'staffOutputParts 应复用 threadOutMultParts 真源');
  assert.ok(/const\s+outMult\s*=\s*focus \* rest;/.test(eco), '产出侧 outMult = focus × rest');
});

// ============ 反馈② 任务领取「已达存储上限」toast 删除 ============

test('R2 main.js 任务领取不再弹「任务 EP 已达存储上限」toast', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(!/任务 EP 已达存储上限/.test(main), '「任务 EP 已达存储上限」toast 应删除');
  // claimProject 领取链保留（行为不变：addEp 统一入口内部处理溢出）
  assert.ok(/claimProject\(p\);/.test(main), '任务领取调用应保留');
  // projects.js claimProject 不动：EP 仍走 addEp 统一入口
  const proj = read('src/modules/projects.js');
  assert.ok(/epGained = addEp\(r\.amount\);/.test(proj), 'claimProject EP 奖励仍应走 addEp 统一入口');
});
