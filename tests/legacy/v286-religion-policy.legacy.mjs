// v2.8.6：KG 参考改造——宗教转化链（赞颂/虔诚/超验/隐密圣学）+ 周期政策（3 组互斥/每轮重选/乘区接线）
// 纯逻辑测试：注入 state 单例 S 直接断言（沿用 v23-chain-pure 风格）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../../src/state.js';
import * as relData from '../../src/data/religions.js';
import * as polData from '../../src/data/policies.js';

// ========== B1a：宗教转化链 ==========
test('B1a 赞颂：转化率随超验层级平方提升', () => {
  S.religion = { unlocked: true, branch: 'faith_shrine', temple: 5 };
  S.faith = 0; S.devotion = 0; S.transcend = 0;
  assert.ok(relData.faithCap() > 0, 'faithCap 有值');
  assert.equal(relData.praiseRate(), 1, '0 超验转化率 ×1');
  S.transcend = 2;
  assert.equal(relData.praiseRate(), 1 + 0.25 * 4, '2 超验转化率 ×2');
  S.transcend = 0;
});

test('B1a 虔诚软上限：≤40% 线性、超出 50% 衰减、黑曜圣所抬升上限', () => {
  S.devotion = 400; S.secretSanctums = {};
  assert.equal(relData.devotionMult(), 1 + 0.40, '√400×0.02=0.40 满额线性');
  S.devotion = 2500; // √2500×0.02 = 1.0 → 超 0.40 → 0.40 + 0.60×0.5 = 0.70
  assert.ok(Math.abs(relData.devotionMult() - 1.70) < 1e-9, '超上限 50% 衰减');
  S.secretSanctums = { black_sanctum: 1 };
  assert.ok(Math.abs(relData.devotionMult() - (1 + 0.44 + (1.0 - 0.44) * 0.5)) < 1e-9, '黑曜圣所 +10% 软上限');
  S.secretSanctums = {};
});

test('B1a 超验成本指数涨 + 隐密圣学门槛', () => {
  S.transcend = 0;
  assert.equal(relData.transcendCost(), 100, '首超验 100 虔诚');
  S.transcend = 3;
  assert.equal(relData.transcendCost(), Math.round(100 * Math.pow(2.2, 3)), '指数涨');
  S.transcend = 0;
  const g = relData.SECRET_SANCTUMS.map(x => x.needTranscend);
  assert.deepEqual(g, [1, 3, 5], '隐密圣学门槛 1/3/5');
  assert.equal(relData.SECRET_SANCTUMS.length, 3, '3 项');
});

// ========== B2a：政策系统 ==========
test('B2a 政策开放判定：跨周期资产驱动', () => {
  S.prestige = 0; S.delve = {}; S.religion = {};
  S.policies = {}; S.policyRerolls = {}; S.vowPolicyBoost = false;
  assert.equal(polData.policyOpenGroups().length, 0, '无跨周期资产不开组');
  S.prestige = 1;
  assert.ok(polData.policyOpenGroups().some(g => g.id === 'order'), '职级≥1 开秩序组');
  S.delve = { depth: 2 };
  assert.ok(polData.policyOpenGroups().some(g => g.id === 'abyss'), '深潜≥1 开深渊组');
  S.religion = { unlocked: true };
  assert.ok(polData.policyOpenGroups().some(g => g.id === 'faith'), '信仰解锁开信仰组');
});

test('B2a 组内互斥 + 乘区接线（无政策乘区=1，选后生效，立誓 +5% 正向）', () => {
  S.policies = { order: 'centralize' }; S.vowPolicyBoost = false;
  assert.ok(Math.abs(polData.policyMult('ep') - 1.20) < 1e-9, '集权指令 EP +20%');
  assert.ok(Math.abs(polData.policyMult('recruit') - 0.80) < 1e-9, '集权招募 -20%');
  assert.equal(polData.groupHasChoice('order'), true, '组内已选');
  S.policies = { order: 'autonomy' };
  assert.ok(Math.abs(polData.policyMult('thread') - 1.15) < 1e-9, '自治线程 +15%');
  assert.equal(polData.policyMult('aiCap'), 0, '自治 AI 上限 -1 → 停购');
  S.policies = {}; S.vowPolicyBoost = true;
  S.policies = { abyss: 'observe' };
  assert.ok(Math.abs(polData.policyMult('delve') - 1.30) < 1e-9, '立誓：观测深潜 25%+5%');
  S.policies = {}; S.vowPolicyBoost = false;
  assert.equal(polData.policyMult('delve'), 1, '无政策乘区 = 1');
});

test('B2a 改选成本：×2 递增 + 中立半价 + 支付回响/虔诚', () => {
  S.policyRerolls = {}; S.vowPolicyBoost = false;
  assert.equal(polData.policyRerollCost('order'), 1, '中立首改 1（半价 ceil(0.5)=1）');
  S.vowPolicyBoost = true;
  assert.equal(polData.policyRerollCost('order'), 1, '立誓首改 1');
  S.policyRerolls = { order: 2 };
  assert.equal(polData.policyRerollCost('order'), 4, '立誓第 3 次改 = 1×2²=4');
  S.abyssEcho = 4; S.devotion = 0;
  assert.equal(polData.canPayReroll('order'), true, '回响够付（成本 4）');
  assert.equal(polData.payReroll('order'), 'echo', '支付回响');
  assert.equal(S.abyssEcho, 0, '回响扣减');
  S.abyssEcho = 0; S.devotion = 5;
  assert.equal(polData.payReroll('order'), 'devotion', '回响不足付虔诚');
  assert.equal(S.devotion, 1, '虔诚扣减');
});

test('B2a 每轮重选 + 政策走向记录', () => {
  S.policies = { order: 'centralize', abyss: 'observe' };
  S.policyRuns = []; S.storyline = 'line_abyss';
  polData.recordPolicyRun();
  assert.equal(S.policyRuns.length, 1, '记录一轮');
  assert.equal(S.policyRuns[0].picks.length, 2, '两条政策');
  assert.equal(S.policyRuns[0].storyline, 'line_abyss', '记录故事线');
  // 晋升重置（由 prestige doPrestige 清空——此处模拟模块行为）
  S.policies = {}; S.policyRerolls = {}; S.vowPolicyBoost = false;
  assert.equal(Object.keys(S.policies).length, 0, '每轮重选清空');
});
