import test from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../src/state.js';
import { policyMult, groupPolicyId, policyLv, nextPolicyInGroup, POLICY_GROUPS } from '../src/data/policies.js';
import { globalMult } from '../src/modules/economy.js';
import { faithDrainPerSec } from '../src/modules/religions.js';
const { BALANCE } = await import('../src/data/balance.js');
const researchUpgs = BALANCE.researchUpgs;

test('v2.8.30 政策链：选定 Lv.1 → 推进下一级（效果切换）→ 组内锁定', () => {
  const g = POLICY_GROUPS.find(x => x.id === 'faith');
  S.policies = {};
  S.policies.faith = { id: 'ascetic', lv: 1 };
  assert.equal(groupPolicyId('faith'), 'ascetic');
  assert.equal(policyLv('faith'), 1);
  assert.equal(nextPolicyInGroup('faith', 'ascetic').id, 'abundant');
  // 推进下一级
  S.policies.faith = { id: 'abundant', lv: 2 };
  assert.equal(groupPolicyId('faith'), 'abundant');
  assert.equal(policyLv('faith'), 2);
  // 效果切换：ascetic faith+30% → abundant faith-15%
  assert.equal(policyMult('faith'), 0.85);
  // 旧存档兼容（字符串 → lv 1）
  S.policies.faith = 'ascetic';
  assert.equal(groupPolicyId('faith'), 'ascetic');
  assert.equal(policyLv('faith'), 1);
});

test('v2.8.30 神权协议（line_faith）：全局 ×3 且信仰生产消耗 ×2', () => {
  S.policies = {};
  S.storyline = 'line_faith';
  const g = globalMult();
  S.storyline = 'default';
  const d = globalMult();
  assert.ok(g >= d * 3 * 0.99 && g <= d * 3 * 1.01, `line_faith 全局应 ×3（${d} → ${g}）`);
  // 信仰 ×2（faithDrainPerSec 消耗同步翻倍，与 tick 同口径）
  S.religion = { unlocked: true, temple: 1, branch: 'sun', sun: true };
  S.faith = 100;
  const f1 = faithDrainPerSec();
  S.storyline = 'line_faith';
  const f2 = faithDrainPerSec();
  S.storyline = 'default';
  assert.ok(f2 >= f1 * 2 * 0.99 && f2 <= f1 * 2 * 1.01, `line_faith 信仰消耗应 ×2（${f1} → ${f2}）`);
});

test('v3.0.3 研究升级：许愿池已移入设施（非 researchUpgs）；薪酬 desc 已去除「当前」括号', () => {
  const wage = researchUpgs.find(x => x.id === 'rp_wage');
  assert.ok(wage.desc.includes('-4%/s'), '薪酬协商 desc 应为 /s（无（当前）括号）');
  // v3.0.3：wish_well 从 researchUpgs 移入 BALANCE.buildings（通用设施）
  const wish = researchUpgs.find(x => x.id === 'wish_well');
  assert.equal(wish, undefined, '许愿池不在 researchUpgs（已移入设施）');
  assert.ok(BALANCE.buildings.wish_well, '许愿池在 BALANCE.buildings.wish_well');
  assert.equal(BALANCE.buildings.wish_well.name, '许愿池');
});
