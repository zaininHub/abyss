// v3.0.0 单测：周期政策系统（policyOpenGroups 门控 / policyMult 叠加 / 改选成本）
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const pol = await import('../src/data/policies.js');

function setup(extra = {}) {
  Object.assign(S, {
    prestige: 0, delve: { depth: 0 }, religion: { unlocked: false }, bazaar: { unlocked: false },
    policies: {}, policyRerolls: {}, vowPolicyBoost: false, abyssEcho: 0, devotion: 0,
  }, extra);
}

test('policyOpenGroups：初始（无任何解锁）→ 空集', () => {
  setup();
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), [], '初始应无开放政策组');
});

test('policyOpenGroups：职级 ≥1 解锁「路线抉择」', () => {
  setup({ prestige: 1 });
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), ['route']);
});

test('policyOpenGroups：深潜 ≥1 不解锁政策组（无深潜组）', () => {
  setup({ delve: { depth: 1 } });
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), []);
});

test('policyOpenGroups：宗教解锁「信仰」、集市解锁「集市」', () => {
  setup({ religion: { unlocked: true } });
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), ['faith']);
  setup({ bazaar: { unlocked: true } });
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), ['market']);
});

test('policyOpenGroups：多条件叠加（职级+宗教+集市）→ 路线/信仰/集市全开', () => {
  setup({ prestige: 2, religion: { unlocked: true }, bazaar: { unlocked: true } });
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id).sort(), ['faith', 'market', 'route']);
});

test('policyMult：未选政策 → 1', () => {
  setup();
  assert.equal(pol.policyMult('ep'), 1);
});

test('policyMult：选「秩序指令」(ep +0.20) → 1.2', () => {
  setup({ policies: { route: { id: 'order_route', lv: 1 } } });
  assert.ok(Math.abs(pol.policyMult('ep') - 1.2) < 1e-9, `应为 1.2，实际 ${pol.policyMult('ep')}`);
});

test('policyRerollCost：未立誓半价（第 0 次 → ceil(1*0.5)=1）', () => {
  setup({ vowPolicyBoost: false });
  assert.equal(pol.policyRerollCost('route'), 1);
});

test('policyRerollCost：立誓全价（第 0 次 → 1）', () => {
  setup({ vowPolicyBoost: true });
  assert.equal(pol.policyRerollCost('route'), 1);
});

test('policyRerollCost：第 1 次改选 → 未立誓 1、立誓 2（×2^1）', () => {
  setup({ policyRerolls: { route: 1 }, vowPolicyBoost: false });
  assert.equal(pol.policyRerollCost('route'), 1, '未立誓：ceil(2*0.5)=1');
  setup({ policyRerolls: { route: 1 }, vowPolicyBoost: true });
  assert.equal(pol.policyRerollCost('route'), 2, '立誓：2');
});
