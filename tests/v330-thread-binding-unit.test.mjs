// v3.3.0 线程绑定系统：纯逻辑 + 经济接线 单测
// 覆盖新玩法 5 条方向：
//   ① 绑定→自由 EP↓/消耗↑；转化器关闭→释放（消耗恢复）
//   ② 天赋（职业）：匹配无惩罚且加成高；懒惰负面
//   ③ 领导者：全局加成 + 智能分配
//   ④ 等级：在岗 XP（合适岗位更快）→ 高等级加成高
//   ⑤ AI 与职业联动：招募按需求建议职业
import assert from 'node:assert/strict';
import test from 'node:test';
import { S } from '../src/state.js';
import { BALANCE } from '../src/data/balance.js';
import { PROFESSIONS, PROFESSION_BY_ID, LAZY_PROFESSION_ID, CONVERTERS, CONVERTER_IDS } from '../src/data/threads.js';
import {
  threadProfession, isLazyProfession, isLeader, threadLevel, bindingActive, affinityMatches,
  threadBindOutputFactor, threadBindSalaryFactor, threadXpGainPerSec, xpThreshold, threadLevelFromXp,
  threadLevelMult, leaderCount, leaderGlobalMult, converterThreadBoost, bindThread, unbindThread,
  autoAssignThreads, aiSuggestedProfession, rollProfession, tickThreads,
} from '../src/modules/threadBinding.js';
import { staffOutputPerSec, staffSalaryPerSec, globalMult, vehicleDmPerMin } from '../src/modules/economy.js';

function resetState() {
  S.cultists = [];
  S.converterOn = { vehicles: true, atrium: true };
  S.upgrades = {};
  S.buildings = {};
  S.tech = {};
  S.wageState = { state: 'ok' };
  S.ep = 1e9;
  S.runEarned = 0;
  S.storyline = 'default';
  S.ai = { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3 };
}
function mkCultist(over = {}) {
  return {
    id: Math.random(), name: 'T', profession: 'prospector', level: 1, xp: 0, leader: false, boundTo: null,
    output: 3, mood: '正常', moodTimer: 0, hiredAt: Date.now(), earned: 0, ...over,
  };
}

test('职业与亲和力：勘探员亲和探采、蒸馏师亲和精神工坊', () => {
  resetState();
  const c = mkCultist({ profession: 'prospector' });
  assert.equal(threadProfession(c), PROFESSION_BY_ID.prospector);
  assert.equal(affinityMatches(c, 'vehicles'), true);
  assert.equal(affinityMatches(c, 'atrium'), false);
  assert.equal(isLazyProfession(mkCultist({ profession: LAZY_PROFESSION_ID })), true);
});

test('方向①：绑定非擅长岗位 → 自由 EP 产出↓、消耗↑；关闭转化器 → 释放（恢复为 1）', () => {
  resetState();
  const c = mkCultist({ profession: 'prospector', boundTo: 'atrium' }); // 勘探员绑到灵感工坊（不匹配）
  assert.equal(bindingActive(c), true);
  assert.equal(threadBindOutputFactor(c), BALANCE.thread.binding.outputFactor); // <1：产出减少
  assert.equal(threadBindSalaryFactor(c), BALANCE.thread.binding.salaryFactor); // >1：消耗增多
  // 关闭灵感工坊 → 绑定释放
  S.converterOn.atrium = false;
  assert.equal(bindingActive(c), false);
  assert.equal(threadBindOutputFactor(c), 1);
  assert.equal(threadBindSalaryFactor(c), 1);
});

test('方向②：匹配岗位绑定 → 无 EP/消耗惩罚（因子均为 1）', () => {
  resetState();
  const c = mkCultist({ profession: 'prospector', boundTo: 'vehicles' }); // 勘探员绑探采（匹配）
  assert.equal(threadBindOutputFactor(c), 1);   // 擅长：不减少 EP
  assert.equal(threadBindSalaryFactor(c), 1);   // 擅长：不增加消耗
  S.converterOn.vehicles = false;
  assert.equal(bindingActive(c), false);
});

test('方向②：懒惰负面线程绑定 → 产出更低、消耗更高', () => {
  resetState();
  const c = mkCultist({ profession: LAZY_PROFESSION_ID, boundTo: 'vehicles' });
  assert.equal(threadBindOutputFactor(c), BALANCE.thread.binding.lazyOutputFactor);
  assert.equal(threadBindSalaryFactor(c), BALANCE.thread.binding.lazySalaryFactor);
  assert.ok(BALANCE.thread.binding.lazyOutputFactor < BALANCE.thread.binding.outputFactor);
  assert.ok(BALANCE.thread.binding.lazySalaryFactor > BALANCE.thread.binding.salaryFactor);
});

test('方向④：等级曲线单调、封顶；高等级加成更高', () => {
  resetState();
  assert.equal(threadLevelFromXp(0), 1);
  assert.equal(xpThreshold(1), 0);
  assert.ok(xpThreshold(2) > 0);
  // 累积足够 XP 应升级
  let lv = 1;
  for (let xp = 0; xp <= BALANCE.thread.binding.xpCap; xp += 100) lv = Math.max(lv, threadLevelFromXp(xp));
  assert.ok(lv > 1);
  assert.equal(threadLevelFromXp(1e12), BALANCE.thread.binding.levelCap);
  assert.ok(threadLevelMult(10) > threadLevelMult(1));
  assert.equal(threadLevelMult(1), 1);
});

test('方向④：合适岗位 XP 获取更快（匹配/领导 vs 不匹配）', () => {
  resetState();
  const match = mkCultist({ profession: 'prospector', boundTo: 'vehicles' });
  const mismatch = mkCultist({ profession: 'prospector', boundTo: 'atrium' });
  assert.ok(threadXpGainPerSec(match) > threadXpGainPerSec(mismatch));
  const idle = mkCultist({ boundTo: null });
  assert.equal(threadXpGainPerSec(idle), 0); // 未绑定不获取 XP
});

test('方向③：领导者提供全局加成，且封顶', () => {
  resetState();
  assert.equal(leaderCount(), 0);
  assert.equal(leaderGlobalMult(), 1);
  S.cultists.push(mkCultist({ leader: true }));
  assert.equal(leaderCount(), 1);
  assert.equal(leaderGlobalMult(), 1 + BALANCE.thread.binding.leaderGlobalPerLeader);
  // 超过封顶数仍被钳制
  for (let i = 0; i < 20; i++) S.cultists.push(mkCultist({ leader: true }));
  assert.equal(leaderGlobalMult(), 1 + BALANCE.thread.binding.leaderGlobalCap);
});

test('方向①/②：绑定线程 boost 生效但探采不吃班组加成（v3.3.8 口径），关闭后归 0', () => {
  resetState();
  S.upgrades.scooter = 1; // 一辆探采载具，DM 基础 >0
  const base = vehicleDmPerMin();
  assert.ok(base > 0);
  // 绑定一个匹配勘探员 → boost >1（boost 本身仍计算，供其他转化器/展示用）
  S.cultists.push(mkCultist({ profession: 'prospector', boundTo: 'vehicles' }));
  assert.ok(converterThreadBoost('vehicles') > 1);
  // v3.3.8 反馈①：探采产出不再乘班组乘区——去掉 6600× 级的产出爆炸
  assert.equal(vehicleDmPerMin(), base);
  // 关闭探采 → boost 归 1 且 DM 产出为 0
  S.converterOn.vehicles = false;
  assert.equal(converterThreadBoost('vehicles'), 1);
  assert.equal(vehicleDmPerMin(), 0);
});

test('方向③：智能分配把空闲线程分配到合适岗位（优先匹配职业）', () => {
  resetState();
  // v3.6.4 ③：智能分配只认「已解锁」岗位，补上工坊/载具解锁（与 v335 浏览器夹具同口径）
  S.upgrades.atrium = 1; S.upgrades.scooter = 1;
  // 一个领导者 + 一个勘探员 + 一个蒸馏师，均空闲
  S.cultists.push(mkCultist({ leader: true, profession: 'overseer' }));
  const p = mkCultist({ profession: 'prospector' });
  const d = mkCultist({ profession: 'distiller' });
  S.cultists.push(p, d);
  const n = autoAssignThreads();
  assert.equal(n, 3); // 两条正常线程 + 领导者（均衡负载）均被分配
  assert.equal(p.boundTo, 'vehicles'); // 勘探员→探采
  assert.equal(d.boundTo, 'atrium');   // 蒸馏师→灵感工坊
});

test('方向⑤：招募建议职业偏向在岗最少的转化器', () => {
  resetState();
  S.upgrades.atrium = 1; S.upgrades.scooter = 1; // v3.6.4 ③：建议只在已解锁岗位中挑
  // 探采已有 2 条绑定，灵感工坊 0 → 建议蒸馏师（atrium）
  S.cultists.push(mkCultist({ profession: 'prospector', boundTo: 'vehicles' }));
  S.cultists.push(mkCultist({ profession: 'prospector', boundTo: 'vehicles' }));
  assert.equal(aiSuggestedProfession(), 'distiller');
});

test('方向⑤：rollProfession 始终返回合法职业，且懒惰占比低', () => {
  resetState();
  const valid = new Set(PROFESSIONS.map(p => p.id));
  let lazy = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const r = rollProfession('prospector');
    assert.ok(valid.has(r), '返回合法职业');
    if (r === LAZY_PROFESSION_ID) lazy++;
  }
  // 懒惰出现概率应明显低于 50%（负面线程少）
  assert.ok(lazy / N < 0.4, `懒惰占比 ${(lazy / N).toFixed(2)} 应较小`);
});

test('经济接线：绑定不匹配线程后 自由EP产出↓、消耗↑（与未绑定对比）', () => {
  resetState();
  const a = mkCultist({ profession: 'prospector' });
  const b = mkCultist({ profession: 'prospector', boundTo: 'atrium' }); // 不匹配
  S.cultists.push(a, b);
  const outBound = staffOutputPerSec();
  const salBound = staffSalaryPerSec();
  const bindAvg = (threadBindSalaryFactor(a) + threadBindSalaryFactor(b)) / 2; // 绑定态下的平均加耗系数
  b.boundTo = null; // 解绑对比
  const outFree = staffOutputPerSec();
  const salFree = staffSalaryPerSec();
  assert.ok(outBound < outFree, '绑定后自由产出应下降');
  // v3.4.8 反馈⑥：薪资 = 产出 × (1/1.5) × 绑定平均系数——未绑定 1.5:1；绑定（不匹配 ×1.5）后薪资变贵、比例下降
  assert.ok(Math.abs(salFree / outFree - 1 / 1.5) < 1e-6, `未绑定：薪资应为产出的 2/3（实际 ${(salFree / outFree).toFixed(3)}）`);
  assert.ok(salBound > salFree, '绑定后薪资上升（加成本）');
  assert.ok(Math.abs(salBound / outBound - (1 / 1.5) * bindAvg) < 1e-6, `绑定：薪资 = 产出 × 2/3 × 绑定系数(${bindAvg.toFixed(2)})`);
});

test('经济接线：tickThreads 累积 XP 并刷新等级', () => {
  resetState();
  const c = mkCultist({ profession: 'prospector', boundTo: 'vehicles' });
  S.cultists.push(c);
  // 跑足够长时间（匹配岗位 ×2.5 XP/s）
  for (let i = 0; i < 100; i++) tickThreads(10); // 1000s
  assert.ok(c.xp > 0, '应累积 XP');
  assert.ok(threadLevel(c) >= 1);
  // 解绑后不再累积
  c.boundTo = null;
  const before = c.xp;
  tickThreads(100);
  assert.equal(c.xp, before);
});

test('经济接线：globalMult 含领导者加成', () => {
  resetState();
  const g0 = globalMult();
  S.cultists.push(mkCultist({ leader: true }));
  const g1 = globalMult();
  assert.ok(g1 > g0, '有领导者全局乘数应更高');
});
