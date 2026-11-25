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
    // v2.9.0：政策第 3 章开门，但本文件主要验「各组资产门槛」，章节放到已过线（第 7 章）。
    chapter: '7',
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

// v4.2.X 反馈③：选完路线 A 不得立即整组解锁「路线深化」的 B/C 候选
test('v4.2.X 路线深化不再随选定路线立即解锁（v2.9.0：改由任务数 + 章节决定）', () => {
  setup({ chapter: '7', prestige: 1, projectsDone: 0, policies: {} });
  const openIds = () => pol.policyOpenGroups().map(g => g.id);
  assert.ok(openIds().includes('route'), '职级 1 开放路线抉择');
  assert.ok(!openIds().includes('deepen'), '低资产时深化组未开放');
  // 选完路线 A（旧实现此时 deepen 会因 groupPolicyId('route') 立刻开放）
  S.policies.route = { id: 'order_route', lv: 1 };
  assert.ok(!openIds().includes('deepen'), '选完路线 A 后深化组仍不立即解锁');
  // v2.9.0：职级不再是深化组门槛（晋升是高频计数器，第 3 章就可能 ≥8）
  S.prestige = 99;
  assert.ok(!openIds().includes('deepen'), '职级再高也不放行——门槛只看任务量与章节');
  // 达到独立资产门槛（10 个任务）且章节到位才开放
  S.projectsDone = 10;
  assert.ok(openIds().includes('deepen'), '完成 10 个任务后深化组开放');
  S.chapter = '3';
  assert.ok(!openIds().includes('deepen'), '章节未到第 4 章仍不开放（章节轴独立于资产轴）');
});

// ---------- v2.9.0：政策门槛按章节重排（政策第 3 章开门后的全线校准）----------

// 目标章节 + 全部资产都满足的富状态：用来验「章节轴」与「资产轴」互不干扰
function richState(chapter) {
  return {
    chapter: String(chapter), prestige: 9, projectsDone: 999,
    religion: { unlocked: true }, _riftSeen: true, riftsSealed: 1, riftEmber: 1,
    bazaar: { unlocked: true }, delve: { unlocked: true }, vs: 5,
    ai: { assistants: 1 }, tech: { deep_space: true }, resonance: { enabled: true },
    resDiscovered: { faith: true }, faith: 10, devotion: 10,
    policies: {}, policyRerolls: {}, vowPolicyBoost: false,
  };
}

test('v2.9.0 章节轴：第 3 章只开「路线 / 信仰」两组', () => {
  setup(richState(3));
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), ['route', 'faith'],
    '资产全满时，第 3 章仍只放前两组——其余组被章节下限挡住');
});

test('v2.9.0 章节轴：逐章累加，第 11 章 13 组全开', () => {
  const at = (ch) => { setup(richState(ch)); return pol.policyOpenGroups().length; };
  assert.equal(at(2), 0, '第 2 章政策门禁未过');
  assert.equal(at(3), 2);
  assert.equal(at(4), 4, '第 4 章 + 路线深化 / 裂隙律令');
  assert.equal(at(5), 7, '第 5 章 + 星际律令 / 编排律令 / 共鸣纪律');
  assert.equal(at(6), 8, '第 6 章 + 值守纪律');
  assert.equal(at(7), 10, '第 7 章 + 集市 / 助手勤务');
  assert.equal(at(8), 11, '第 8 章 + 长夜纪律');
  assert.equal(at(10), 12, '第 10 章 + 补给纪律');
  assert.equal(at(11), 13, '第 11 章 + 观测纪律（跟深潜同章）');
  assert.equal(at(18), 13, '章节再多也不会超过 13 组');
});

test('v2.9.0 资产轴：章节到位但资产不足时仍锁（且不靠 prestige 放行）', () => {
  setup({ ...richState(8), prestige: 0, projectsDone: 0, bazaar: { unlocked: false },
    delve: { unlocked: false }, ai: { assistants: 0 }, resonance: { enabled: false },
    tech: {}, riftsSealed: 0 });
  assert.deepEqual(pol.policyOpenGroups().map(g => g.id), ['faith'],
    '只有信仰（religion 解锁）能开；路线要职级但被重置为 0 → 也不开');
});

test('v2.9.0 组章节与 hint 文案同源（防止改章忘了改提示）', () => {
  for (const g of pol.POLICY_GROUPS) {
    assert.ok(Number.isInteger(g.chapter) && g.chapter >= 3, `${g.id} 缺 chapter 或小于政策开门章`);
    assert.match(g.hint, new RegExp(`^第 ${g.chapter} 章起`), `${g.id} 的 hint 与 chapter 不一致`);
  }
  const chapters = pol.POLICY_GROUPS.map(g => g.chapter);
  assert.deepEqual(chapters, [...chapters].sort((a, b) => a - b), 'POLICY_GROUPS 应按章节升序排列');
});

test('v2.9.0 第 11 章前不许出现 delve 效果键（深潜未开，policyMult 恒 1 = 死政策）', () => {
  for (const g of pol.POLICY_GROUPS) {
    if (g.chapter >= 11) continue;
    for (const p of g.policies) {
      assert.ok(!('delve' in p.effect), `${g.id}/${p.id} 在深潜解锁前就写 delve 加成`);
    }
  }
});

test('v2.9.0 每组在其章节下限时，全部效果键都真能生效（policyMult ≠ 1）', () => {
  for (const g of pol.POLICY_GROUPS) {
    for (const p of g.policies) {
      setup({ ...richState(g.chapter), policies: { [g.id]: { id: p.id, lv: 1 } } });
      for (const k of Object.keys(p.effect)) {
        const v = pol.policyMult(k);
        assert.notEqual(v, 1, `${p.id} 的 ${k} 在第 ${g.chapter} 章恒为 1（死效果）`);
        assert.ok(Math.abs(v - (1 + p.effect[k])) < 1e-9, `${p.id} 的 ${k} 幅度不符：${v}`);
      }
    }
  }
});

test('v2.9.0 牺牲的虔诚幅度与文案一致（×1.5 而非 ×2.5）', () => {
  setup({ ...richState(3), policies: { faith: { id: 'sacrifice', lv: 1 } } });
  assert.ok(Math.abs(pol.policyMult('devotion') - 1.5) < 1e-9,
    `「虔诚获取 +50%」应为 1.5，实际 ${pol.policyMult('devotion')}`);
  const p = pol.groupByName('faith').policies.find(x => x.id === 'sacrifice');
  assert.match(p.desc, /\+50%/);
});

test('v2.9.0 空态提示分「差资产 / 差章节」两批（不再硬编码路线/信仰/集市）', () => {
  setup({ chapter: '3', prestige: 1, religion: { unlocked: false } });
  const h = pol.policyLockedHint();
  assert.equal(h.chapter, 3);
  assert.deepEqual(h.nextChapter, 4, '下一章是第 4 章');
  assert.deepEqual(h.next.filter(g => g.chapter === 4).map(g => g.id), ['deepen', 'rift_law']);
  setup({ chapter: '3', prestige: 1, religion: { unlocked: true } });
  const h2 = pol.policyLockedHint();
  assert.deepEqual(h2.ready.map(g => g.id), [], '第 3 章两组都能开（资产满足）');
  assert.ok(h2.next.some(g => g.id === 'deepen'), '第 4 章两组仍在「还没到章」批次');
});

test('v2.9.0 未解锁资源的卡片标注：policyDeadKeys 指出具体键', () => {
  setup({ chapter: '3', prestige: 1, religion: { unlocked: false }, _riftSeen: false, riftsSealed: 0, riftEmber: 0 });
  const abyssRoute = pol.groupByName('route').policies.find(p => p.id === 'abyss_route');
  assert.deepEqual(pol.policyDeadKeys(abyssRoute), ['ember'], '未见过裂隙时余烬项应被标注');
  setup({ chapter: '3', _riftSeen: true });
  assert.deepEqual(pol.policyDeadKeys(abyssRoute), [], '见过裂隙后正常生效');
});
