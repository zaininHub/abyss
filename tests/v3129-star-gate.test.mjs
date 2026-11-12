// v3.12.9：星图解锁 = 宠物（PT 锚点）之后的硬顺序。纯 Node 行为断言，不查源码注释。
import assert from 'node:assert/strict';
import test from 'node:test';
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { anchorDone, petsModuleUnlocked, starChartUnlocked } = await import('../src/modules/disclosure.js');
const { cosmosUnlocked } = await import('../src/modules/cosmos.js');
const { starColoniesUnlocked } = await import('../src/modules/expedition.js');

/** 用完整快照 + finally 恢复构造状态，避免测试之间互相污染。 */
function withState(patch, fn) {
  const saved = JSON.stringify(S);
  try {
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, JSON.parse(saved), patch);
    return fn();
  } finally {
    const back = JSON.parse(saved);
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, back);
  }
}

const rp = { upgrades: { rp_vault: 1 } };
const pt = { upgrades: { pt_vault: 1 } };
const merge = (...parts) => ({ upgrades: Object.assign({}, ...parts.map(p => p.upgrades || {})) });

test('① 星图在宠物之前恒不解锁：只有深空探测科技 / 远征记录都不够', () => {
  withState({ ...rp, tech: { deep_space: 1 }, expeditionsDone: 9, expeditions: [], resDiscovered: { rp: true } }, () => {
    assert.equal(petsModuleUnlocked(S), false, 'PT 锚点未完成');
    assert.equal(starChartUnlocked(S), false, '宠物未开时星图必须锁着');
  });
});

test('② 宠物开了但没点深空探测 / 没有远征记录，星图仍不开', () => {
  withState({ ...merge(rp, pt), tech: {}, expeditionsDone: 0, expeditions: [] }, () => {
    assert.equal(petsModuleUnlocked(S), true);
    assert.equal(starChartUnlocked(S), false);
  });
});

test('③ 宠物 + RP + 深空探测 → 星图开放（第 3 章）', () => {
  withState({ ...merge(rp, pt), tech: { deep_space: 1 }, expeditionsDone: 0, expeditions: [], chapter: '3' }, () => {
    assert.equal(starChartUnlocked(S), true);
  });
});

test('④ 宠物 + RP + 已有远征记录（完成数 / 在途队列）→ 星图开放（第 3 章）', () => {
  withState({ ...merge(rp, pt), tech: {}, expeditionsDone: 3, expeditions: [], chapter: '3' }, () => {
    assert.equal(starChartUnlocked(S), true, '完成过远征的旧档应可进入');
  });
  withState({ ...merge(rp, pt), tech: {}, expeditionsDone: 0, expeditions: [{ id: 'x' }], chapter: '3' }, () => {
    assert.equal(starChartUnlocked(S), true, '在途远征也应可进入');
  });
});

test('⑤ PT 是本局制：转生后旧远征记录 + 跨转生标记不得提前放行', () => {
  withState({
    upgrades: { rp_vault: 1 }, tech: { deep_space: 1 }, expeditionsDone: 12,
    expeditions: [], resDiscovered: { rp: true, pt: true }, chapter: '3',
  }, () => {
    assert.equal(anchorDone('pt', S), false, '本局未重购饵料仓库');
    assert.equal(starChartUnlocked(S), false, '旧档持久标记不能越过 PT 前置');
  });
});

test('⑥ 三种 PT 完成口径（仓库 / 宠物乐园 / 持有 PT）都能推进到星图（第 3 章）', () => {
  for (const patch of [
    { upgrades: { rp_vault: 1, pt_vault: 1 } },
    { upgrades: { rp_vault: 1, petland: 1 } },
    { upgrades: { rp_vault: 1 }, pt: 1 },
  ]) {
    withState({ ...patch, tech: { deep_space: 1 }, expeditionsDone: 0, expeditions: [], chapter: '3' }, () => {
      assert.equal(petsModuleUnlocked(S), true);
      assert.equal(starChartUnlocked(S), true);
    });
  }
});

test('⑦ 深空殖民 / 宇宙探索与星图 tab 同源，不能由自动化绕过（第 3 章）', () => {
  const full = { ...merge(rp, pt), tech: { deep_space: 1 }, expeditionsDone: 0,
    expeditions: [], resDiscovered: { rp: true }, chapter: '3' };
  withState({ ...full, upgrades: { rp_vault: 1 } }, () => {
    assert.equal(starChartUnlocked(S), false);
    assert.equal(starColoniesUnlocked(), false, '宠物未开时深空殖民不可购');
    assert.equal(cosmosUnlocked(), false, '宠物未开时宇宙探索不可购');
  });
  withState(full, () => {
    assert.equal(starChartUnlocked(S), true);
    assert.equal(starColoniesUnlocked(), true);
    assert.equal(cosmosUnlocked(), true);
  });
});
