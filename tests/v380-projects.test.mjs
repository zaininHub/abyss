// v3.8.0 review bugfix 回归单测：任务领取 → 累计完成数 → 内容可达性
//
// 背景：v3.8.0 之前的 claimProject() 只发奖励、不增加 S.projectsDone，
//   唯一写入点在 settlePause()（暂停回程）。在线正常游玩时累计完成数恒为 0，
//   使 章节 25 / 政策 observe·orchestration / 成就 projects50 / 秩序线 15A
//   以及「效能编排」解锁的任务路径全部永久不可达。
// 本文件用真实模块调用（不是源码字符串猜测）锁死这条链路。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// 与 v380-content.test.mjs 同款最小 DOM shim（state.save 会碰 localStorage）
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  body: { classList: { add() {}, remove() {} } },
  addEventListener() {},
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { claimProject } = await import('../src/modules/projects.js');
const orch = await import('../src/core/orchestration.js');
const { CHAPTERS } = await import('../src/data/chapters.js');
const { POLICY_GROUPS } = await import('../src/data/policies.js');
const MAIN_SRC = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const PROJECTS_SRC = readFileSync(new URL('../src/modules/projects.js', import.meta.url), 'utf8');
const DAY30_SRC = readFileSync(new URL('./v380-30day-browser.mjs', import.meta.url), 'utf8');

const pending = (id) => ({ id, name: '测试任务', type: 'earn_ep', status: 'pending',
  reward: { kind: 'ep', amount: 100 }, progress: 1, goal: 1 });

// 每个用例前把状态复位，避免用例间互相污染（node:test 同文件串行执行）
function reset() {
  S.projectsDone = 0;
  S.prestige = 0;
  S.projects = [];
  S.ep = 0;
  S.orchestration = { mode: 'balanced', autoTide: false };
}

test('P1 源码守卫：领取计数收敛到 finishProject，暂停回程不得绕过它', () => {
  const body = PROJECTS_SRC.slice(PROJECTS_SRC.indexOf('export function claimProject'));
  assert.match(body, /finishProject\(p\)/, 'claimProject 必须走共享终结入口');
  // v3.10.2 ①：负面任务达标后由 tickProjects 自动调用同一入口，两条路径不得各记一套口径
  const shared = PROJECTS_SRC.slice(PROJECTS_SRC.indexOf('function finishProject'),
    PROJECTS_SRC.indexOf('// v2.0 P1 修复'));
  assert.match(shared, /S\.projectsDone\s*=\s*\(S\.projectsDone\s*\|\|\s*0\)\s*\+\s*1/,
    '累计完成数唯一真源在 finishProject');
  assert.match(PROJECTS_SRC, /autoDone = true/, '负面任务自动结束复用同一入口');
  // v3.10.0 设计变更：暂停回程不再自行发奖 / 自行计数，改为冻结任务时钟，
  // 与 applyOffline()「离线期间任务冻结」严格同口径；计数唯一真源收敛到 claimProject()。
  const settle = MAIN_SRC.slice(MAIN_SRC.indexOf('function settlePause()'));
  const settleBody = settle.slice(0, settle.indexOf('\nfunction ', 1));
  assert.doesNotMatch(settleBody, /projectsDone/, '暂停回程不得再碰累计完成数');
  assert.doesNotMatch(settleBody, /addEp\(p\.reward|addRp\(p\.reward/, '暂停回程不得绕过领取入口发奖');
  assert.match(settleBody, /shiftProjectClocks\(S,/, '暂停期间任务时钟必须整体顺延');
  assert.match(MAIN_SRC, /shiftProjectClocks/, 'main.js 必须消费状态层的任务时钟顺延');
});

test('P2 真实调用：领取成功 +1，重复领取幂等不重复计数', () => {
  reset();
  const p = pending('p2');
  const before = S.projectsDone;
  const r1 = claimProject(p);
  assert.equal(r1.ok, true, 'pending 任务应可领取');
  assert.equal(S.projectsDone, before + 1, '领取一次只计一次');
  const r2 = claimProject(p);
  assert.equal(r2.ok, false, '已领取任务不可再次领取');
  assert.equal(S.projectsDone, before + 1, '幂等：重复领取不再累加');
  assert.equal(p.status, 'claimed');
});

test('P3 读侧联动：累计 3 个任务后效能编排解锁且倍率真实生效', () => {
  reset();
  assert.equal(orch.orchestrationUnlocked(S), false, '0 任务 / 0 晋升时不应解锁');
  assert.equal(orch.orchestrationMult('ep', S), 1, '未解锁不得放大数值');
  for (let i = 0; i < 3; i++) {
    S.projects = [pending('p3-' + i)];
    claimProject(S.projects[0]);
  }
  assert.equal(S.projectsDone, 3);
  assert.equal(orch.orchestrationUnlocked(S), true, '3 个任务应解锁编排');
  assert.equal(orch.setOrchestrationMode(S, 'output'), true);
  assert.equal(orch.orchestrationMult('ep', S), 1.25, '产能优先应放大 EP');
  assert.equal(orch.orchestrationMult('rp', S), 0.8, '产能优先应压低 RP（有增益必有代价）');
  assert.equal(orch.setOrchestrationMode(S, '__invalid__'), false, '非法策略不可写入');
  assert.equal(orch.effectiveModeId(S), 'output');
});

test('P4 内容可达性：章节 25 / 两条政策在累计完成数达门槛时为真', async () => {
  const ch25 = CHAPTERS.find(c => String(c.id) === '25');
  assert.ok(ch25, '章节 25 应存在');
  const observe = POLICY_GROUPS.find(g => g.id === 'observe');
  const orchestration = POLICY_GROUPS.find(g => g.id === 'orchestration');
  assert.ok(observe && orchestration, '两条任务门控政策组应存在');

  const probe = (n) => ({ projectsDone: n, delve: { unlocked: false }, prestige: 0 });
  assert.equal(ch25.cond(probe(40)), true, '40 任务应解锁番外章节');
  assert.equal(ch25.cond(probe(39)), false, '39 任务不应提前解锁');
  assert.equal(observe.unlock(probe(20)), true);
  assert.equal(orchestration.unlock(probe(10)), true);
  assert.equal(orchestration.unlock({ ...probe(0), prestige: 3 }), true, '晋升路径同样可达');
  // 成就 projects50 的门槛必须保持（防止被误改成不可达常量）；v3.10.0 表已下沉到数据层
  const ACH_SRC = readFileSync(new URL('../src/data/achievements.js', import.meta.url), 'utf8');
  assert.match(ACH_SRC, /projects50[\s\S]{0,160}projectsDone\s*\|\|\s*0\)\s*>=\s*50/);
  const orderPkg = (await import('../src/storylines/line_order.js')).default;
  const line15A = orderPkg.data.chapters.append.find(c => c.id === '15A');
  assert.ok(line15A && line15A.cond({ ...probe(30), storyline: 'line_order' }), '秩序线 15A 在 30 任务时可达');
});

test('P5 30 天推演夹具：自动玩家经产品真实入口领取，且不再伪造解锁进度', () => {
  assert.match(DAY30_SRC, /sim\.claimProject\(p\)/, '自动玩家必须调用真实领取入口');
  assert.match(MAIN_SRC, /sim:\s*\{[\s\S]{0,400}?claimProject/, '__qa.sim 应暴露领取入口');
  assert.doesNotMatch(DAY30_SRC, /S\.projectsDone\s*=\s*Math\.max/, '推演中不得直接篡改进度伪造解锁');
  assert.match(DAY30_SRC, /projectsDone:\s*S2\.projectsDone/, '逐日快照应记录累计完成数');
});
