// v2.8.4 回归：崩溃倒计时 / 强制转生+湮灭残片 / ES 门控 / 研究升级 / 长线科技 / 免疫→减缓 / 深渊遗存
import test from 'node:test';
import assert from 'node:assert';
import { S } from '../src/state.js';
import { BALANCE } from '../src/data/balance.js';
import {
  tickCorruption, collapseRemainMs, collapseMs, esDiscovered, discoverEs,
  researchMult, legacyGlobalMult, legacyCapMult, legacyRiftMult,
  techGlobalMult, delveTechMult, faithTechMult, computeCps,
  wageDebtMult, tideMult, corruptionPenalty, epStorageCap,
} from '../src/modules/economy.js';
import { canPrestige, doPrestige } from '../src/modules/prestige.js';

const cap = () => epStorageCap();
const reset = () => Object.assign(S, {
  ep: 0, corruption: 0, cultists: [{ name: 't1', mood: 'ok' }], rp: 0, es: 0,
  prestige: 0, prestigePoints: 0, runEarned: 0, collapsed: false, _collapseAt: null,
  resDiscovered: {}, tech: {}, rpTheories: {}, relicLegacy: {},
  upgrades: {}, buildings: {}, delveDepth: 0, riftsSealed: 0, colonies: [],
  storyline: 'default', storylinesCompleted: [],
});

test('v2.8.4 ① 崩溃倒计时：腐化满额+EP触顶 → 5 分钟倒计时启动', () => {
  reset();
  S.corruption = 100;
  S.ep = cap();
  tickCorruption(1);
  assert.ok(S._collapseAt && collapseRemainMs() > 0, '倒计时已启动');
  assert.equal(collapseMs(), 300000, '基准 5 分钟');
  assert.equal(collapseRemainMs() <= 300000 && collapseRemainMs() > 299000, true, '剩余 ≈ 5 分钟');
});

test('v2.8.4 ① 稳定协议科技：倒计时延长至 7 分钟', () => {
  reset();
  S.tech.stable_protocol = true;
  assert.equal(collapseMs(), 420000, '稳定协议 → 7 分钟');
});

test('v2.8.4 ① 倒计时结束 → 强制崩溃；EP 降至 50% 以下自救取消', () => {
  reset();
  S.corruption = 100;
  S.ep = cap();
  tickCorruption(1);
  S._collapseAt = Date.now() - 1; // 倒计时耗尽
  tickCorruption(1);
  assert.equal(S.collapsed, true, '倒计时结束强制崩溃');
  assert.equal(collapseRemainMs(), 0, '崩溃后剩余 0');
  // 自救：未崩溃前 EP 消耗到 <50% 取消
  reset();
  S.corruption = 100;
  S.ep = cap();
  tickCorruption(1);
  S.ep = Math.floor(cap() * 0.4);
  tickCorruption(1);
  assert.equal(S.collapsed, false, '未崩溃');
  assert.equal(S._collapseAt, null, '自救取消倒计时');
});

test('v2.8.4 ① 崩溃后 computeCps 归零（所有系统停止产出）', () => {
  reset();
  S.collapsed = true;
  assert.equal(computeCps(), 0, '崩溃后无产出');
});

test('v2.8.4 ② 崩溃后必须转生：豁免门槛 + 湮灭残片 +1', () => {
  reset();
  S.collapsed = true;
  assert.equal(canPrestige(), true, '崩溃豁免晋升门槛');
  doPrestige(null);
  assert.equal(S.abyssSplinter, 1, '湮灭残片 +1');
  assert.equal(S.collapsed, false, '转生后脱离崩溃态');
  assert.equal(S.prestige, 1, '转生计数 +1');
});

test('v2.8.4 ③ ES 门控：首次晋升获得 ES → discoverEs 点亮', () => {
  reset();
  assert.equal(esDiscovered(), false, '默认未解锁');
  discoverEs();
  assert.equal(esDiscovered(), true, '首次晋升后点亮');
  // 正常晋升（esGain>0）点亮
  reset();
  S.es = 0;
  S.runEarned = 2e7 * 4; // esGain = sqrt(4) = 2 > 0
  doPrestige(null);
  assert.equal(esDiscovered(), true, '正常晋升点亮 ES');
});

test('v2.8.4 ④ 研究升级：5 项、成本递增、乘区生效', () => {
  reset();
  assert.equal(BALANCE.researchUpgs.length, 5, '研究升级 5 项');
  // 数据层：成本随等级递增（growth>1）且上限合理（长线）
  for (const u of BALANCE.researchUpgs) {
    assert.ok(u.growth > 1, `${u.id} 成本递增`);
    assert.ok(u.cap >= 8, `${u.id} 等级上限（长线）`);
  }
  // 乘区：加乘（ep/thread）与叠乘（global）
  S.rpTheories = { rp_entropy: 1 };
  assert.equal(researchMult('ep'), 1.05, '熵减研究 基础 EP +5%');
  S.rpTheories = { rp_matrix: 1 };
  assert.equal(researchMult('thread'), 1.05, '矩阵意识 线程 +5%');
  S.rpTheories = { rp_singularity: 1 };
  assert.ok(Math.abs(researchMult('global') - 1.04) < 1e-9, '奇点推演 全局 ×1.04');
  S.rpTheories = { rp_entropy: 3, rp_matrix: 2 };
  assert.equal(researchMult('ep'), 1.15, '熵减 3 级 +15%');
});

test('v2.8.4 ⑩ 长线科技：6 项新增、全局/深潜/信仰乘区', () => {
  reset();
  assert.equal(techGlobalMult(), 1, '无科技 = 1');
  assert.equal(delveTechMult(), 1);
  assert.equal(faithTechMult(), 1);
  S.tech.axiom_shift = true; S.tech.abyss_will = true; S.tech.sacred_tech = true;
  assert.ok(Math.abs(techGlobalMult() - 1.331) < 1e-9, '三线终局 ×1.1³');
  S.tech = {};
  S.tech.void_sight = true;
  assert.equal(delveTechMult(), 1.25, '虚空视界 深潜 +25%');
  S.tech = {};
  S.tech.divine_light = true;
  assert.equal(faithTechMult(), 1.25, '神启之光 信仰 +25%');
});

test('v2.8.4 ⑦ 免疫→减缓：零熵协议潮汐负面减半 + 腐化 -25%；食堂 3 级 0.95', () => {
  reset();
  S.tidePhase = 2; // 退潮负相位（epMult 0.7）
  const before = tideMult('ep');
  S.tech.zero_entropy = true;
  const after = tideMult('ep');
  assert.ok(before < 1 && after > before && after < 1, `退潮负效应减半（${before} → ${after}）`);
  assert.ok(Math.abs(before - 0.7) < 1e-9 && Math.abs(after - 0.85) < 1e-9, '0.7 → 0.85（减半收敛）');
  S.buildings = { canteen: 3 };
  assert.equal(wageDebtMult(), 0.95, '能量食堂 3 级不再免疫（0.95）');
  S.buildings = {}; S.cultists = [];
  // 腐化惩罚降档
  reset();
  S.corruption = 50;
  const p1 = corruptionPenalty();
  S.tech.zero_entropy = true;
  const p2 = corruptionPenalty();
  assert.ok(p2 > p1, '零熵协议腐化惩罚减弱（不再免疫）');
});

test('v2.8.4 ⑫ 深渊遗存：数据定义 + 乘区生效（结算路径见浏览器套件 v284-browser）', () => {
  reset();
  assert.equal(BALANCE.reincarn.legacy.length, 3, '遗存 3 项');
  assert.equal(BALANCE.reincarn.legacyCap, 3, '同种 cap 3');
  const ids = BALANCE.reincarn.legacy.map(L => L.id);
  assert.deepEqual(ids.sort(), ['relic_anchor', 'relic_core', 'relic_vault'], '湮灭核心/记忆库/虚空锚');
  // 乘区
  S.relicLegacy = { relic_core: 1 };
  assert.equal(legacyGlobalMult(), 1.25, '湮灭核心 全局 ×1.25/座');
  S.relicLegacy = { relic_core: 3 };
  assert.equal(legacyGlobalMult(), 1.75, 'cap 3 = ×1.75');
  reset();
  const baseCap = cap(); // 无遗存
  S.relicLegacy = { relic_vault: 1 };
  S.upgrades = {};
  assert.equal(epStorageCap() / baseCap, 3, '记忆库 存储上限 ×2/座（1+2=3 倍）');
  S.relicLegacy = { relic_anchor: 1 };
  assert.equal(legacyRiftMult(), 1.25, '虚空锚 裂隙余烬 +25%/座');
});
