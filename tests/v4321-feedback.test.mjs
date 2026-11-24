// v4.3.21 第十一轮反馈批次 6 项（源码级锁）
// ① 裂隙透镜文案：深入不含（封印/拥抱的 DM·RP 奖励 +20%/级，深入不含）
// ② 升级专注不推高薪资：threadOutMultParts 拆分 focus/rest，薪资只吃 rest
// ③ 消耗悬浮窗不再显示产出侧全局乘区：drainMultBreakdown 只列消耗减少类
// ⑤ 快捷开关全部静默（快捷开关状态/descent/purify/下岗汇总/蒸馏/探采/孵化/圣所下岗）
// ⑥ 领导等级制：Lv1 起 +0.01%/级（Lv50 上限）、津贴 10×Lv EP/s、卸任保留等级、任命重置线程等级
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 透镜文案（深入不含） ============

test('R1 透镜文案「封印/拥抱的 DM·RP 奖励 +20%/级（深入不含）」——balance + wiki 同步', () => {
  const bal = read('src/data/balance.js');
  assert.ok(/lens:[\s\S]{0,200}深入不含/.test(bal), 'balance.lens.desc 应写「深入不含」');
  assert.ok(/深入不含/.test(read('src/data/wiki.js')), 'wiki 透镜行应写「深入不含」');
});

// ============ 反馈② 升级专注不推高薪资 ============

test('R2 threadOutMultParts 拆分 focus/rest；薪资口径只吃 rest（oneSal）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/function threadOutMultParts\(\)/.test(eco), 'economy 应有 threadOutMultParts');
  assert.ok(/const focus = 1 \+ focusTotalBonus\(S\.focusLevel\)/.test(eco), 'focus 段 = 1 + focusTotalBonus');
  assert.ok(/let rest = 1/.test(eco), 'rest 段柔性初始化');
  assert.ok(/return \{ focus, rest \}/.test(eco), 'parts 返回 {focus, rest}');
  assert.ok(/export function threadOutMult\(\)/.test(eco), 'threadOutMult 复用 parts');
  assert.ok(/salaryBase \+= oneSal \*/.test(eco), '薪资基数用 oneSal（只吃 rest）');
});

// ============ 反馈③ 消耗悬浮窗拆分 ============

test('R3 drainMultBreakdown 只列消耗减少类，悬浮窗按产出/消耗分流', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/export function drainMultBreakdown\(\)/.test(eco), 'economy 应导出 drainMultBreakdown');
  assert.ok(/dmmind/.test(eco), '应列 dmmind ×0.60 消耗减少');
  assert.ok(/researchMult\('wage'\)/.test(eco), '应列薪资科技减免');
  const main = stripComments(read('src/main.js'));
  assert.ok(/isOut \? multBreakdown\(\) : drainMultBreakdown\(\)/.test(main), '悬浮窗按产出/消耗分流');
});

// ============ 反馈⑤ 快捷开关静默 ============

test('R4 快捷开关全部静默——main/shop/pets/religions 原位置开关日志删除', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(!/log\(`快捷开关状态/.test(main), '快捷开关状态日志应删除');
  assert.ok(!/log\(`descent/.test(main) && !/log\(`purify/.test(main), 'descent/purify 开关日志应删除');
  const shop = stripComments(read('src/modules/shop.js'));
  assert.ok(!/log\(`自动蒸馏/.test(shop), '蒸馏开关日志应删除');
  assert.ok(!/log\(`载具探采/.test(shop), '探采开关日志应删除');
  const pets = stripComments(read('src/modules/pets.js'));
  assert.ok(!/log\(`异兽孵化/.test(pets), '孵化开关日志应删除');
  const rel = stripComments(read('src/modules/religions.js'));
  assert.ok(!/rlog\(`圣所.*下岗/.test(rel), '圣所下岗日志应删除');
});

// ============ 反馈⑥ 领导等级制 ============

test('R5 领导等级制真源：leaderLvOf 钳制 + leaderGlobalMult 公式 + 升级函数', () => {
  const tb = stripComments(read('src/modules/threadBinding.js'));
  assert.ok(/export function leaderLvOf/.test(tb), 'threadBinding 应导出 leaderLvOf');
  assert.ok(/leaderLevelCap/.test(tb), 'leaderLvOf 应按 leaderLevelCap 钳制');
  assert.ok(/export function leaderGlobalMult\(\)/.test(tb), 'threadBinding 应导出 leaderGlobalMult');
  assert.ok(/1 \+ B\(\)\.leaderGlobalPerLeader \+ \(lv - 1\) \* B\(\)\.leaderLevelBonusPerLv/.test(tb), '公式 1 + 1% + (Lv-1)×0.01%');
  assert.ok(/export function levelUpLeader/.test(tb), '应有升级函数');
  const bal = read('src/data/balance.js');
  assert.ok(/leaderLevelBonusPerLv: 0\.0001/.test(bal), 'balance 应有 leaderLevelBonusPerLv: 0.0001');
  assert.ok(/leaderEpPerSecPerLv: 10/.test(bal), 'balance 应有 leaderEpPerSecPerLv: 10');
  assert.ok(!/leaderGlobalCap/.test(stripComments(bal)), 'leaderGlobalCap 键应下线（无死数据红线，注释残留可忽略）');
});

test('R6 领导津贴真源与独立实扣：leaderSalaryPerSec + tickWages 独立扣 + 消耗弹窗行', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/export function leaderSalaryPerSec/.test(eco), 'economy 应导出 leaderSalaryPerSec');
  assert.ok(/return 10 \* leaderLvOf\(lead\)/.test(eco), '津贴 = 10×Lv');
  assert.ok(/totalDrainPerSec\(\) \{[\s\S]{0,400}leaderSalaryPerSec\(\)/.test(eco), 'totalDrainPerSec 挂领导津贴');
  const wages = stripComments(read('src/modules/wages.js'));
  assert.ok(/const leadSal = leaderSalaryPerSec\(\);[\s\S]{0,300}S\.ep/.test(wages), 'tickWages 独立实扣领导津贴');
  assert.ok(/领导津贴 -\$\{fmt\(lead\)\}\/s（10×Lv）/.test(eco), '消耗 breakdown 应有领导津贴行');
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(/leaderSalaryPerSec\(\)/.test(crew), '领导卡面显津贴消耗');
});

test('R7 任命重置线程等级 + 卸任保留 leaderLv（crew.js + state.js）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(/c\.level = 1; c\.xp = 0/.test(crew), '任命重置该线程等级 Lv1');
  assert.ok(/c\.leaderLv = Math\.max\(1,/.test(crew), '任命恢复保留的 leaderLv');
  assert.ok(/c\.leader = false/.test(crew), '卸任分支存在');
  assert.ok(/保留，再任命时恢复/.test(crew), '卸任日志写「保留」');
  const state = read('src/state.js');
  assert.ok(/c\.leaderLv === undefined/.test(state), 'normalizeCrew 补旧档 leaderLv 默认值');
});

test('R8 领导卡面升级按钮 + 消耗行 toFixed(2) + 渲染签名含 leadlv', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(/data-lead-up/.test(crew), '领导升级按钮存在');
  assert.ok(/升级★ Lv\.\$\{leadLv\}→\$\{leadLv \+ 1\}/.test(crew), '升级按钮文案 Lv.X→X+1');
  assert.ok(/已满级/.test(crew), '满级文案存在');
  assert.ok(/toFixed\(2\)/.test(crew), '领导全局加成显示 toFixed(2)');
  assert.ok(/leadlv:\$\{leadLvNow\}/.test(crew), '渲染签名含 leadlv 段');
});
