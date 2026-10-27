// v2.8.19：①宗教解锁去除 EP 库存限制 ②维修坞「线程维护」效果实装（流失概率 -50%，不免疫）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../src/state.js';
import { wageLoseChance } from '../src/modules/economy.js';
import { canUnlockReligion } from '../src/modules/religions.js';

function fresh() {
  S.ep = 0; S.upgrades = {}; S.tech = {}; S.resDiscovered = { rp: true };
  S.upgrades.storage = 3;
}
test('R1 宗教解锁不再要求 EP 库存（存储3级+RP觉醒即可，EP 为 0 也达标）', () => {
  fresh(); S.ep = 0;
  assert.equal(canUnlockReligion(), true);
});
test('R2 存储节点 <3 级仍不解锁', () => {
  fresh(); S.upgrades.storage = 2; S.ep = 5e6;
  assert.equal(canUnlockReligion(), false);
});
test('R3 维修坞持有：流失概率 -50%（10% → 5%，负面减缓不免疫）', () => {
  fresh(); S.upgrades.dock = 1;
  assert.equal(wageLoseChance(), 0.05);
});
test('R4 无维修坞无科技：流失概率保持 10%', () => {
  fresh();
  assert.equal(wageLoseChance(), 0.1);
});
test('R5 维修坞 + 混沌护盾：流失概率 2.5%（可叠加减缓）', () => {
  fresh(); S.upgrades.dock = 1; S.tech.chaos_shield = true;
  assert.equal(wageLoseChance(), 0.025);
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
test('T-T1 财神/幸运天赋 desc 无歧义（明确「仅本轮生效」与具体数值）', () => {
  const src = readFileSync(join(process.cwd(), 'src/data/talents.js'), 'utf-8');
  assert.ok(src.includes("rich2',name:'财神',desc:'转生后开局赠予 1,500 EP（仅本轮生效）'"));
  assert.ok(src.includes("fortunate',name:'幸运',desc:'里程碑达成时 RP 奖励 ×2（仅本轮生效）'"));
});
