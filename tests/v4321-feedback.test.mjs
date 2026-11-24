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

test('R5 领导等级走普通线程等级（v4.3.23 反转：独立制下线）', () => {
  const tb = stripComments(read('src/modules/threadBinding.js'));
  assert.ok(/export function leaderLvOf/.test(tb), 'threadBinding 应导出 leaderLvOf（兼容门面）');
  // v4.3.23 反转：leaderLvOf 委托 threadLevel（等级真源统一）
  assert.ok(/export function leaderLvOf\(c\)\s*\{\s*return threadLevel\(c\);\s*\}/.test(tb), 'leaderLvOf 应委托 threadLevel（v4.3.23）');
  assert.ok(/export function leaderGlobalMult\(\)/.test(tb), 'threadBinding 应导出 leaderGlobalMult');
  assert.ok(/1 \+ B\(\)\.leaderGlobalPerLeader \* threadLevelMult/.test(tb), '公式 1 + 1% × 等级乘数（v4.3.23）');
  // v4.3.23 反转：手动升级函数应删除（等级自动提升）
  assert.ok(!/export function levelUpLeader/.test(tb), 'levelUpLeader 应已删除（v4.3.23）');
  assert.ok(!/canLevelUpLeader/.test(tb), 'canLevelUpLeader 应已删除（v4.3.23）');
  const bal = stripComments(read('src/data/balance.js'));
  assert.ok(/leaderGlobalPerLeader: 0\.01/.test(bal), 'balance 保留 leaderGlobalPerLeader: 0.01');
  assert.ok(!/leaderLevelBonusPerLv/.test(bal), 'leaderLevelBonusPerLv 应下线（v4.3.23）');
  assert.ok(!/leaderEpPerSecPerLv/.test(bal), 'leaderEpPerSecPerLv 应下线（v4.3.23）');
  assert.ok(!/leaderLevelCap/.test(bal), 'leaderLevelCap 应下线（v4.3.23）');
  assert.ok(!/leaderGlobalCap/.test(bal), 'leaderGlobalCap 键应下线');
});

test('R6 领导津贴下线（v4.3.23 反转：消耗回归普通薪资口径）', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(!/export function leaderSalaryPerSec/.test(eco), 'leaderSalaryPerSec 应已删除（v4.3.23）');
  assert.ok(!/leaderSalaryPerSec\(\)/.test(eco.match(/export function totalDrainPerSec[\s\S]{0,300}/)?.[0] || ''), 'totalDrainPerSec 不再挂领导津贴');
  const wages = stripComments(read('src/modules/wages.js'));
  assert.ok(!/leaderSalaryPerSec/.test(wages), 'tickWages 不应再有独立实扣段（v4.3.23）');
  assert.ok(!/领导津贴/.test(eco), '消耗 breakdown 领导津贴行应删除');
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(!/leaderSalaryPerSec/.test(crew), '领导卡面不应再显津贴消耗');
});

test('R7 任命不重置等级 + state.js leaderLv 迁移（v4.3.23 反转）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(!/c\.level = 1; c\.xp = 0/.test(crew), '任命不应重置等级（v4.3.23）');
  assert.ok(!/c\.leaderLv\s*=/.test(crew), 'crew.js 不应再写 leaderLv');
  assert.ok(/c\.leader = false/.test(crew), '卸任分支存在');
  assert.ok(/经验保留，回归普通线程/.test(crew), '卸任日志写「经验保留」（v4.3.23）');
  const state = read('src/state.js');
  // v4.3.23 反转：旧档 leaderLv 合并进 c.level 后删除字段
  assert.ok(/delete c\.leaderLv;/.test(state), 'normalizeCrew 应迁移并删除旧档 leaderLv 字段');
  assert.ok(/Math\.min\(9, \(Math\.floor\(Number\(c\.leaderLv\)\) \|\| 1\) - 1\)/.test(state), '旧档 leaderLv 迁移口径（Lv-1 钳 9 级）');
});

test('R8 手动升级按钮下线 + 消耗行 toFixed(2) 保留（v4.3.23 反转）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  assert.ok(!/data-lead-up/.test(crew), '领导手动升级按钮应已删除（v4.3.23）');
  assert.ok(!/升级★ Lv\./.test(crew), '升级按钮文案应删除（v4.3.23）');
  assert.ok(!/已满级/.test(crew), '满级文案应删除（v4.3.23）');
  assert.ok(/toFixed\(2\)/.test(crew), '领导全局加成显示 toFixed(2)');
  assert.ok(!/leadlv:/.test(crew), '渲染签名 leadlv 段应删除（v4.3.23）');
});
