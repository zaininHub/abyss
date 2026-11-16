// v4.0.6 反馈①：效能编排面板「五个互斥选项」的读侧契约。
//
// 旧行为：四条策略 + 一个可开关的「潮汐排班」按钮（点第二次 = 关闭）。
// 新行为：潮汐排班只是第五个选项——选中它即轮转，选中任一具体策略即退出并固定该策略；
//        不存在「再点一次关闭」这种无法预判的动作（对应 chooseOrchestration* 两个入口）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as orch from '../src/core/orchestration.js';

const root = path.resolve(import.meta.dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const SYS_SRC = read('src/systems/frameSystems.js');

const mk = (extra = {}) => ({
  projectsDone: 20, prestige: 3, tidePhase: 1,
  orchestration: { mode: 'balanced', autoTide: false, schedule: ['output', 'balanced', 'research', 'abyss'] },
  ...extra,
});

test('A1 选中潮汐排班：只写 autoTide=true，重复选中不会翻转', () => {
  const S = mk();
  assert.equal(orch.chooseOrchestrationAutoTide(S), true);
  assert.equal(orch.orchestrationState(S).autoTide, true);
  // 「再点一次」= 再次调用同一入口：仍是 true，不再 toggle（旧 toggleOrchestrationAutoTide 会关掉）
  orch.chooseOrchestrationAutoTide(S);
  assert.equal(orch.orchestrationState(S).autoTide, true, '潮汐排班是选项，不是开关');
  assert.equal(orch.effectiveModeId(S), 'balanced', '相位 1（平潮）默认排班为均衡');
});

test('A2 选中具体策略：自动退出潮汐排班并固定该策略', () => {
  const S = mk();
  orch.chooseOrchestrationAutoTide(S);
  assert.equal(orch.chooseOrchestrationMode(S, 'research'), true);
  const st = orch.orchestrationState(S);
  assert.equal(st.autoTide, false, '选具体策略即退出轮转');
  assert.equal(st.mode, 'research');
  assert.equal(orch.effectiveModeId(S), 'research', '相位变化不再改写生效策略');
  S.tidePhase = 3;
  assert.equal(orch.effectiveModeId(S), 'research');
});

test('A3 退出后保留自定义排班表与上次手动策略（不丢配置）', () => {
  const S = mk();
  S.orchestration.schedule = ['abyss', 'abyss', 'output', 'research'];
  orch.chooseOrchestrationAutoTide(S);
  orch.chooseOrchestrationMode(S, 'output');
  assert.deepEqual(orch.orchestrationSchedule(S), ['abyss', 'abyss', 'output', 'research']);
  orch.chooseOrchestrationAutoTide(S);
  assert.deepEqual(orch.orchestrationSchedule(S), ['abyss', 'abyss', 'output', 'research']);
  orch.chooseOrchestrationMode(S, 'abyss');
  assert.equal(orch.orchestrationState(S).mode, 'abyss', '手动策略不被自动排班覆盖');
  assert.equal(orch.orchestrationSchedule(S)[0], 'abyss');
});

test('A4 非法输入不写状态（防存档污染 / 越权放大）', () => {
  const S = mk();
  const before = JSON.stringify(S.orchestration);
  assert.equal(orch.chooseOrchestrationMode(S, 'vigil'), false, '已删除的策略 id 不得写入');
  assert.equal(orch.chooseOrchestrationMode(S, ''), false);
  assert.equal(orch.chooseOrchestrationMode(null, 'output'), false);
  assert.equal(JSON.stringify(S.orchestration), before);
  assert.equal(orch.orchestrationMult('ep', S), 1, '均衡编排倍率为 1');
});

test('A5 未解锁时选策略不改数值（读侧仍返回 1）', () => {
  const S = { projectsDone: 0, prestige: 0, tidePhase: 0,
    orchestration: { mode: 'output', autoTide: true } };
  assert.equal(orch.orchestrationMult('ep', S), 1);
  assert.equal(orch.effectiveModeId(S), 'output', '读侧照常反映存档，不放大数值');
});

test('A6 面板：潮汐排班与四条策略同为选项，不再置灰策略按钮', () => {
  // 策略按钮在自动排班期间必须可点（它们就是退出方式）；旧实现会输出 disabled
  assert.match(SYS_SRC, /class="btn-mini" data-orch-mode="\$\{m\.id\}" aria-pressed="\$\{on\}"/,
    '策略按钮应带 aria-pressed 表达选中态');
  assert.doesNotMatch(SYS_SRC, /data-orch-mode="\$\{m\.id\}".{0,160}disabled/,
    '策略按钮不得再置灰（置灰后无法从潮汐排班退出）');
  assert.match(SYS_SRC, /data-orch-auto="1" aria-pressed="\$\{auto\}"/,
    '潮汐排班同样用 aria-pressed 表达选中态');
});
