// v4.3.16 第七轮反馈追加批次 2 项（源码级锁）
// ① 领导「消耗固定 EP」落地：staffOutputParts 薪资基数计入领导固定份额（v4.3.14 只做了
//    全局 +1% / 零产出 / 不升级，消耗「固定 EP」注释写了但实现是 0）+ 卡面不显示等级 + 产出显示 0
// ② 删除任务领取「任务 EP 已达存储上限」toast（addEp 统一入口内部处理溢出，弹窗造成困惑）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 领导消耗固定 EP ============

test('R1a economy.staffOutputParts：领导产出 0、薪资基数计入固定裸基数', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  // 领导判定保留
  assert.ok(/const\s+isLead\s*=\s*c\.leader\s*===\s*true/.test(eco), 'staffOutputParts 未判定领导');
  // 固定裸基数（不吃 mood/outMult/等级放大）
  assert.ok(/const\s+bare\s*=\s*\(c\.output\s*\|\|\s*3\)\s*\*\s*0\.8;/.test(eco), '缺领导固定裸基数 bare');
  // 产出：领导 0（total 累加跳过）；薪资：领导按 bare 计入（factor 恒 1，boundTo 恒 null）
  assert.ok(/total\s*\+=\s*isLead\s*\?\s*0\s*:\s*one\s*\*\s*factor;/.test(eco), '领导个人产出应跳过');
  assert.ok(/salaryBase\s*\+=\s*one\s*\*\s*\(c\.boundTo\s*===\s*HYPER_CONVERTER_ID\s*\?\s*1\s*:\s*factor\);/.test(eco), '薪资基数应计入领导份额');
  // one 定义：领导 = bare，普通线程 = 完整乘区
  const m = eco.match(/const\s+one\s*=\s*isLead\s*\?\s*bare\s*:[^;]+;/);
  assert.ok(m, 'one 应为 领导=bare / 普通线程=完整乘区');
  assert.ok(/threadLevelMult/.test(m[0]) && /outMult/.test(m[0]), '普通线程乘区应保留 mood/outMult/等级');
});

test('R1b crew 卡面：领导不显示 Lv + 产出显示 0 + 消耗按实扣份额', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // 领导隐藏 Lv（卡面 + stateTip）
  assert.ok(/const\s+lvHtml\s*=\s*leaderLv\s*\?\s*''\s*:/.test(crew), '领导卡面应隐藏 Lv');
  assert.ok(/\$\{c\.name\}\$\{leaderLv\s*\?\s*''\s*:\s*` · Lv\.\$\{lvl\}`\}/.test(crew), 'stateTip 领导应去 Lv');
  // refreshCrewDyn：领导产出 0
  assert.ok(/const\s+out\s*=\s*isLead\s*\?\s*0\s*:/.test(crew), '领导卡面产出应显示 0');
  // 领导消耗 = salTotal × 裸基数 / salBase（实扣份额，与 staffOutputParts 同口径）
  assert.ok(/salTotal\s*\*\s*\(\(c\.output\s*\|\|\s*3\)\s*\*\s*0\.8\)\s*\/\s*salBase/.test(crew), '领导消耗应按实扣份额（salTotal×裸基数/salBase）');
  // salBase 累计（同构 salaryBase）
  assert.ok(/let\s+salBase\s*=\s*0;/.test(crew), '缺 salBase 累计分母');
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
