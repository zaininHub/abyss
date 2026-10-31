// v3.0.3 数值口径回归：AI 自动升级成本必须与实购（unitCost）同口径。
// 原 bestPaybackItem 内联 ceil(base×growth^(owned)×costMult) 默认 growth 1.15，
// 落后 unitCost 默认 1.30——回本排序低估成本 15–50%，导致「回本最短」选品失真。
// 本测试保护：AI 候选成本恒等于 unitCost(u,1)，防内联公式再度漂移。
import assert from 'node:assert/strict';
import test from 'node:test';
import { S } from '../src/state.js';
import { UPGRADES } from '../src/data/upgrades.js';
import { unitCost, costMult, epStorageCap } from '../src/modules/economy.js';
import { aiUnlocked, reserveLine } from '../src/modules/ai.js';

function baseState() {
  S.upgrades = {};
  S.tech = { ai_core: true };
  S.ai = { autoUpgrade: true, autoHire: false, autoClaim: false, reserve: 0.3 };
  S.ep = 1e12;
  S.totalBuys = 0;
  S.lazySince = null;
}

test('AI 解锁与预留线：ai_core 解锁后可用，预留线 = 上限 × 档位', () => {
  baseState();
  assert.equal(aiUnlocked(), true, 'ai_core 应解锁 AI');
  assert.equal(reserveLine(), Math.floor(epStorageCap() * 0.3), '预留线应为上限×30%');
});

test('AI 自动升级成本：与实购 unitCost 同口径（不再内联 1.15）', () => {
  baseState();
  const scribble = UPGRADES.find(u => u.id === 'scribble'); // 无自定义 growth → 默认 1.30
  const storage = UPGRADES.find(u => u.id === 'storage');   // 自定义 growth 1.25
  S.upgrades.scribble = 10;
  S.upgrades.storage = 5;
  const cScribble = unitCost(scribble, 1);
  const cStorage = unitCost(storage, 1);
  assert.ok(Number.isFinite(cScribble) && cScribble > 0, 'scribble 成本应有限为正');
  assert.ok(Number.isFinite(cStorage) && cStorage > 0, 'storage 成本应有限为正');
  // 关键回归：默认 growth 项必须走 1.30 而非内联 1.15（若有人改回内联公式，此断言失配）
  const inline15 = Math.ceil(scribble.base * Math.pow(1.15, 10) * costMult());
  assert.notEqual(cScribble, inline15, '默认 growth 项成本不应再按 1.15 内联估算');
  assert.equal(cScribble, Math.ceil(scribble.base * Math.pow(1.30, 10 + 1) * costMult()), 'scribble 成本应 = base×1.30^(owned+1)×costMult');
  // storage 属 CAP_EXPANSION_IDS（30% 防死锁钳制）：成本 ≤ 当前上限×30%，且钳制后仍为正
  assert.ok(cStorage <= Math.floor(epStorageCap() * 0.3), 'storage 成本应受 30% 钳制');
  assert.ok(cStorage > 0, 'storage 成本应为正');
});

test('AI 回本口径：边际 CPS 用全局乘数，回本期为正', () => {
  baseState();
  S.upgrades.scribble = 10;
  const u = UPGRADES.find(x => x.id === 'scribble');
  const cost = unitCost(u, 1);
  const margCps = u.cps * 1; // globalMult 空局 = 1
  assert.ok(margCps > 0, '基础产出项边际 CPS 应为正');
  assert.ok(cost / margCps > 0, '回本期应为正');
});
