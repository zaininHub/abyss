// v4.0.4 反馈①：任务进度记账完整性（纯 Node）
//
// 玩家反馈：任务版「产能冲刺 · 限时内累计获得 EP」进度恒为 0（截图 0 / 9.98K），
//   线程自然产出跑了一整窗也不涨，只能等过期——根因是任务进度读 S._gainRes，
//   而挂机主产出流 ep:main 直接写 S.ep，只记了 runEarned / allTimeEp / earnedFull，
//   没走 gainRes('ep'）。同类「自然结算」管道（EPS 蒸馏 / PT 孵化 / 异兽维持）
//   也只 bookFlow 不记任务累加器，导致对应「限时内消耗 X」任务同样卡死。
//
// 本文件守住四件事：
//   A. 挂机主产出一帧 = 任务累加器一帧增量（且与 earnedFull 同口径，溢出不算获得）；
//   B. 端到端：「限时内累计获得 EP」任务真的会涨、能达成 pending；
//   C. 自然结算的消耗侧（EP 蒸馏 / EP 孵化 / PT 维持）都记 spendRes；
//   D. 一次性入账不双记（addEp 已记 gain，流不得再记一次）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const flow = await import('../src/core/flowEngine.js');
await import('../src/systems/resourceFlows.js'); // 注册 8 条资源流（不导入 = 一条流都没有）
const { S } = await import('../src/state.js');
const eco = await import('../src/modules/economy.js');
const projects = await import('../src/modules/projects.js');

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = p => readFileSync(join(srcRoot, p), 'utf8');
const FLOWS_SRC = read('systems/resourceFlows.js');
const P = flow.FLOW_PHASES;

// 夹具：一条能产生稳定 CPS 的最小局面（与 v380 D1 同口径）
function withEcoFixture(fn) {
  const saved = {
    upgrades: S.upgrades, cultists: S.cultists, projectsDone: S.projectsDone,
    orchestration: S.orchestration, ep: S.ep, earnedFull: S.earnedFull, collapsed: S.collapsed,
    buffUntil: S.buffUntil, restBonusUntil: S.restBonusUntil, lazySince: S.lazySince,
    lazyLowSince: S.lazyLowSince, _gainRes: S._gainRes, _spentRes: S._spentRes,
    projects: S.projects, faith: S.faith, rp: S.rp, pt: S.pt,
    _atriumTrickle: S._atriumTrickle, _ptTrickle: S._ptTrickle,
    ptAutoHatch: S.ptAutoHatch, ptDistillOn: S.ptDistillOn, ptHatchLv: S.ptHatchLv,
    _petStarving: S._petStarving,
  };
  try {
    S.upgrades = { scribble: 1 };
    S.cultists = [];
    S.projectsDone = 3;
    S.collapsed = false;
    S.buffUntil = 0; S.restBonusUntil = 0;
    S.orchestration = { mode: 'balanced', autoTide: false };
    S.ep = 0; S.earnedFull = 0; S.faith = 0; S.rp = 0; S.pt = 0;
    S._gainRes = {}; S._spentRes = {};
    S.lazySince = null; S.lazyLowSince = null;
    S.projects = [];
    return fn();
  } finally {
    Object.assign(S, saved);
  }
}

console.log('[A] 挂机主产出必须进任务累加器');

test('A1 ep:main 一帧：_gainRes.ep 增量 == earnedFull 增量 == CPS × dt', () => withEcoFixture(() => {
  const cps = eco.computeCps();
  assert.ok(cps > 0, '夹具应产生非零 CPS');
  flow.runFlows({ S, dt: 10, now: 0 }, P.EP_PRODUCE);
  const gained = (S._gainRes && S._gainRes.ep) || 0;
  assert.ok(Math.abs(gained - cps * 10) < 1e-6, `任务累加器 ${gained} 应与挂机入账 ${cps * 10} 同口径`);
  assert.ok(Math.abs(gained - S.earnedFull) < 1e-6, '任务累加器与 earnedFull 必须同口径（都取钳后 credited）');
}));

test('A2 溢出部分不算「获得」：满仓时累加器不再增长', () => withEcoFixture(() => {
  const cap = eco.epStorageCap();
  S.ep = cap; // 已满仓：本帧全是溢出
  flow.runFlows({ S, dt: 10, now: 0 }, P.EP_PRODUCE);
  const gained = (S._gainRes && S._gainRes.ep) || 0;
  assert.equal(gained, 0, '满仓溢出的 EP 不应计入任务进度');
}));

test('A3 端到端：「限时内累计获得 EP」任务真的会涨，达目标后 pending', () => withEcoFixture(() => {
  const base = (S._gainRes && S._gainRes.ep) || 0;
  const now = Date.now();
  // 与 spawnProject 生成的 res/gain/ep 任务同结构
  S.projects = [{
    type: 'res', resKey: 'ep', metric: 'gain', name: '产能冲刺', desc: '限时内累计获得 EP',
    goal: 500, progress: 0, startsAt: now, deadline: now + 30 * 60000,
    reward: { kind: 'ep', amount: 100 }, status: 'active', pendingAt: 0, base,
  }];
  const cps = eco.computeCps();
  const dt = 10;
  const frames = Math.ceil(500 / (cps * dt)) + 1;
  let grew = false;
  for (let i = 0; i < frames && S.projects[0].status === 'active'; i++) {
    flow.runFlows({ S, dt, now }, P.EP_PRODUCE);
    projects.tickProjects();
    if (S.projects[0] && S.projects[0].progress > 0) grew = true;
  }
  assert.ok(grew, '任务进度必须随挂机产出增长（此前恒为 0 → 卡死到过期）');
  assert.equal(S.projects[0].status, 'pending', '达到目标后应转为待领取');
  assert.ok(S.projects[0].progress >= 500, `进度应达目标，实际 ${S.projects[0].progress}`);
}));

console.log('[B] 自然结算的消耗侧也要记 spendRes');

test('B1 灵感工坊蒸馏扣掉的 EP 记入「限时内消耗 EP」', () => withEcoFixture(() => {
  S.upgrades = { scribble: 1, atrium: 1 };
  S.ep = 1e6; S.rp = 0;
  flow.runFlows({ S, dt: 1, now: 0 }, P.EP_AUX);
  const spent = (S._spentRes && S._spentRes.ep) || 0;
  assert.ok(spent > 0, '蒸馏消耗 EP 必须计入任务累加器');
}));

test('B2 PT 孵化扣掉的 EP 记入「限时内消耗 EP」', () => withEcoFixture(() => {
  S.ep = 1e7; S.pt = 0;
  S.ptAutoHatch = true; S.ptDistillOn = true; S.ptHatchLv = 1;
  flow.runFlows({ S, dt: 1, now: 0 }, P.CONVERTERS);
  const spent = (S._spentRes && S._spentRes.ep) || 0;
  assert.ok(spent > 0, '孵化消耗 EP 必须计入任务累加器');
}));

test('B3 异兽维持消耗 PT 记入「限时内消耗 PT」（源码级：维持量依赖宠物状态，接线即口径）', () => {
  const body = FLOWS_SRC.split("id: 'pt:upkeep'")[1].split('});')[0];
  assert.ok(body.includes("spendRes('pt'"), 'pt:upkeep 必须记 spendRes(pt)');
});

test('B4 所有 natural 消耗分支都带 spendRes：蒸馏 / 孵化 / 涓流', () => {
  for (const id of ["id: 'rp:atrium'", "id: 'pt:hatch'"]) {
    const body = FLOWS_SRC.split(id)[1].split('});')[0];
    const applies = (body.match(/bookFlow\('ep', 'out'/g) || []).length;
    const counted = (body.match(/spendRes\('ep'/g) || []).length;
    assert.equal(counted, applies, `${id} 里每次 bookFlow(ep,out) 都要有 spendRes(ep) 对账`);
  }
});

console.log('[C] 不双记：一次性入账仍只记一次');

test('C1 addEp 自身记账，触手流不得再记一次', () => withEcoFixture(() => {
  S.tech = { tentacle_protocol: true };
  S._tentacleTimer = 59.5;
  S.ep = 0;
  const before = (S._gainRes.ep) || 0;
  flow.runFlows({ S, dt: 1, now: 0 }, P.EP_AUX);
  const after = (S._gainRes.ep) || 0;
  assert.ok(after > before, '触手点击应计入获得');
  assert.ok(Math.abs(after - before - S.ep) < 1e-6, `一次入账只能记一次（记了 ${after - before}，余额 +${S.ep}）`);
  delete S.tech;
}));
