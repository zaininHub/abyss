// v3.6.0 扩充内容单元测试：研究点接线 / 剧情 3-7 天/章 / 星际缩放 / AI 按类型分配
import test from 'node:test';
import assert from 'node:assert';

// Node 环境无 localStorage，save() 需要 → 注入最小桩
globalThis.localStorage = {
  _d: {}, getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { currentChapter, CHAPTERS } = await import('../src/data/chapters.js');
const { researchMult } = await import('../src/modules/economy.js');
const E = await import('../src/modules/expedition.js');
const { tickAI } = await import('../src/modules/ai.js');
const { RP_GROUPS } = await import('../src/modules/shop.js');

// ===== T1 新研究项存在且键正确 =====
test('v3.6.0 ① 新研究项（10 项）齐全且 fx.key 正确', () => {
  const want = [
    ['rp_jump', 'jump'], ['rp_starres', 'starres'], ['rp_policy', 'policy'],
    ['rp_religion2', 'faith'], ['rp_ai', 'ai'], ['rp_colony2', 'colony'],
    ['rp_cosmos2', 'cosmos'], ['rp_rift2', 'rift'], ['rp_delve2', 'delve'], ['rp_ep2', 'ep'],
  ];
  for (const [id, key] of want) {
    const u = BALANCE.researchUpgs.find(x => x.id === id);
    assert.ok(u, `缺少研究项 ${id}`);
    assert.equal(u.fx.key, key, `${id} 的 fx.key 应为 ${key}`);
    assert.ok(u.cap >= 6 && u.cap <= 10, `${id} cap 在 6~10 区间`);
  }
  // v3.7.0：研究项扩充到 35 项，改为下界断言，允许后续继续扩充
  assert.ok(BALANCE.researchUpgs.length >= 30, `研究点至少 30 项，实际 ${BALANCE.researchUpgs.length}`);
});

// ===== T1b 防回归：每个研究项都必须在面板分组中可见、可购买 =====
test('v3.6.0 ① 研究菜单 4 组 30 项，无遗漏/重复/幽灵 id', () => {
  const all = RP_GROUPS.flatMap(g => g.ids);
  const defined = BALANCE.researchUpgs.map(u => u.id);
  assert.equal(RP_GROUPS.length, 4, '研究菜单扩到 4 组');
  assert.equal(new Set(all).size, all.length, '分组内 id 不重复');
  assert.equal(all.length, defined.length, '分组覆盖全部研究项（数量与实际表动态对齐）');
  for (const id of defined) assert.ok(all.includes(id), `研究项 ${id} 未进分组 → 面板不可见/不可购买`);
  for (const id of all) assert.ok(defined.includes(id), `分组引用了不存在的研究项 ${id}`);
  assert.ok(RP_GROUPS.some(g => g.key === 'star' && g.ids.includes('rp_jump')), '新增「星际与拟我」整组菜单');
});

// ===== T2 researchMult 对各新键生效 =====
test('v3.6.0 ② 新研究键经 researchMult 生效（lv8）', () => {
  const cases = [
    ['rp_jump', 'jump'], ['rp_starres', 'starres'], ['rp_policy', 'policy'],
    ['rp_religion2', 'faith'], ['rp_ai', 'ai'], ['rp_colony2', 'colony'],
    ['rp_cosmos2', 'cosmos'], ['rp_rift2', 'rift'], ['rp_delve2', 'delve'], ['rp_ep2', 'ep'],
  ];
  for (const [id, key] of cases) {
    S.rpTheories = { [id]: 8 };
    const m = researchMult(key);
    assert.ok(m > 1, `${key} 在 lv8 应 >1（实际 ${m}）`);
  }
  S.rpTheories = {};
  // 跃迁/星蕴提纯在星际模块读侧
  S.rpTheories = { rp_jump: 8 };
  assert.ok(Math.abs(E.jumpMult() - 1.48) < 1e-9, `jumpMult=1+0.06*8=1.48（实际 ${E.jumpMult()}）`);
  S.rpTheories = { rp_starres: 8 };
  assert.ok(Math.abs(E.starResMult() - 1.48) < 1e-9, `starResMult=1+0.06*8=1.48（实际 ${E.starResMult()}）`);
  S.rpTheories = {};
});

// ===== T3 剧情 3-7 天/章（minDays 门控）=====
function chS(chapter, daysAgo) {
  return {
    chapter: String(chapter), chapterEnteredAt: Date.now() - daysAgo * 86400000,
    tech: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['t' + i, true])),
    unlockedBuildings: {}, es: 100, expeditionsDone: 100, faith: 100, prestige: 100,
    religion: {}, riftsSealed: 10, dm: 1000, upgrades: {}, buildings: {},
  };
}
test('v3.6.0 ③ 剧情进度受最短驻留天数(minDays)约束——不超前', () => {
  // 第 2 章仅驻留 1 天：第 3 章需 3 天，绝不能跳到 3
  assert.equal(currentChapter(chS(2, 1)).id, 2, '第2章 1 天：停在 2（ch3 需 3 天）');
  // 第 2 章驻留 4 天：可推进至第 6 章，但第 7 章需 5 天，不能到 7
  assert.equal(currentChapter(chS(2, 4)).id, 6, '第2章 4 天：到 6（ch7 需 5 天）');
  // 第 1 章驻留 2 天：第 2 章需 3 天，不能到 2
  assert.equal(currentChapter(chS(1, 2)).id, 1, '第1章 2 天：停在 1（ch2 需 3 天）');
  // 第 1 章驻留 3 天：恰好解锁第 2、3 章（均 3 天门槛）
  assert.equal(currentChapter(chS(1, 3)).id, 3, '第1章 3 天：推进到第 3 章');
  // 不回退：已到第 5 章但时间不足 → 仍保持 5（权威下限）
  assert.equal(currentChapter(chS(5, 0)).id, 5, '已抵达章节不回退');
});
test('v3.6.0 ③ 章节 minDays 全表 ≥3（节奏 3-7 天/章）', () => {
  const mins = CHAPTERS.map(c => c.minDays);
  assert.ok(mins.slice(1).every(d => d >= 3), '所有推进章节最短驻留 ≥3 天');
  assert.ok(Math.max(...mins) <= 7, '最长驻留 ≤7 天');
});

// ===== T4 星际探索：M 量级消耗 + 殖民降一数量级/时间转小时 =====
test('v3.6.0 ④ 星系出发消耗起步 M 量级、按数量级递增', () => {
  const eps = E.GALAXIES.map(g => g.cost.ep);
  assert.deepEqual(eps, [1e6, 1e7, 1e8, 1e9, 1e10, 1e11], 'EP 消耗 1e6→1e11 按数量级');
  for (let i = 1; i < eps.length; i++) assert.equal(eps[i] / eps[i - 1], 10, `第 ${i + 1} 个星系为前一个 10 倍`);
});
test('v3.6.0 ④ 星系时间按天计；殖民后消耗 ×0.1、时间 ÷24（天→小时）', () => {
  const moon = E.GALAXIES[0];
  assert.ok(Math.abs(E.galaxyDur(moon) - 86400) < 1, '月球未殖民航行 = 1 天');
  // 模拟殖民
  S.colonies = { moon: true };
  assert.ok(Math.abs(E.galaxyCost(moon).ep - 1e5) < 1, '殖民后月球出发 EP 1e6×0.1=1e5（降一数量级）');
  assert.ok(Math.abs(E.galaxyDur(moon) - 3600) < 1, '殖民后月球航行 1 天÷24 = 1 小时');
  S.colonies = {};
});
test('v3.6.0 ④ 专属星际资源按星系群产出，星蕴提纯加成', () => {
  const moon = E.GALAXIES[0];
  S.rpTheories = {};
  const base = E.expeditionResReward(moon);
  assert.deepEqual(base.map(r => r.key), ['stardust', 'exo'], '月球归属 g6 群：星尘+异星遗物');
  const baseN = base[0].n;
  S.rpTheories = { rp_starres: 8 };
  const boosted = E.expeditionResReward(moon)[0].n;
  assert.ok(boosted > baseN && Math.abs(boosted - Math.round(baseN * 1.48)) < 2, `星蕴提纯 +48% 产出（${baseN}→${boosted}）`);
  S.rpTheories = {};
});

// ===== T4b 跃迁引擎：相对论 β/γ 硬顶 + 专属资源燃料闭环 =====
test('v3.6.0 ⑧ 跃迁 β 随研究提升但恒 <c（相对论硬约束）', () => {
  S.rpTheories = {};
  assert.ok(Math.abs(E.jumpBeta() - 0.6) < 1e-9, '基础巡航 0.6c');
  assert.ok(Math.abs(E.jumpGamma() - 1.25) < 1e-9, 'γ = 1/√(1-0.36) = 1.25');
  S.rpTheories = { rp_jump: 8 };
  assert.equal(E.jumpBeta(), 0.99, '0.6 + 8×0.05 = 1.0 → 硬顶 0.99c（不可超光速）');
  assert.ok(E.jumpGamma() > 7, 'β=0.99 时 γ≈7.09');
  assert.ok(E.jumpSpeedKmS() < 299792.458, '跃迁速度恒低于真空光速');
  S.rpTheories = {};
});
test('v3.6.0 ⑧ 跃迁消耗专属资源并压缩在途等待（γ 倍）', () => {
  const moon = E.GALAXIES[0];
  S.rpTheories = {};
  S.jumpUses = 0;
  S.starRes = { stardust: 1000 };
  const dur = E.galaxyDur(moon) * 1000; // 内部按毫秒存（Date.now() 同口径）
  S.expeditions = [{ galaxyId: 'moon', startsAt: Date.now(), duration: dur, pets: 0 }];
  const beforeRes = E.starResAmount('stardust');
  const cost = E.warpCost(moon);
  const r = E.warpExpedition(0);
  assert.equal(r.ok, true, '跃迁成功');
  assert.equal(E.starResAmount('stardust'), beforeRes - cost, '扣除该星系群专属资源');
  const left = dur - (Date.now() - S.expeditions[0].startsAt);
  assert.ok(left < dur / 1.2 && left > 0, `剩余等待由 γ=1.25 压缩（${Math.round(left / 1000)}s < ${Math.round(dur / 1000)}s）`);
  assert.ok(E.warpCost(moon) > cost, '跃迁次数递增使燃料成本上涨');
  S.starRes = { stardust: 0 };
  assert.equal(E.warpExpedition(0).ok, false, '专属资源不足时拒绝跃迁');
  S.expeditions = []; S.starRes = {}; S.jumpUses = 0;
});

// ===== T5 AI 助手（v3.10.5 改为一次性消耗品）=====
function seedAiBase() {
  Object.assign(S, {
    tech: { ai_core: true, deep_space: true }, ai: { autoUpgrade: false, autoHire: false, autoClaim: false, autoBuild: false, autoTech: false, assistants: 0 },
    starCps: 0, ep: 1e9, allTimeEp: 1e9, upgrades: {}, totalBuys: 0, colonies: {},
  });
}
test('v3.11.2 ④ AI：无助手时自动升级/招募/领取不执行（常驻班组，无编制则挂起）', () => {
  seedAiBase();
  S.ai.autoUpgrade = true;
  const before = S.totalBuys || 0;
  const acted = tickAI(10);
  assert.equal(acted, false, '无助手（无编制）时自动升级不应动作');
  assert.equal(S.totalBuys || 0, before, '无编制时不应购入任何升级');
});
test('v3.11.2 ④ AI：有助手时自动升级买入且不消耗助手', () => {
  seedAiBase();
  S.ai.autoUpgrade = true;
  S.ai.assistants = 3;
  S.ai.crew = { upgrade: 3 };
  const before = S.totalBuys || 0;
  const acted = tickAI(10);
  assert.equal(acted, true, '有助手（有编制）时 tickAI 返回 true');
  assert.ok((S.totalBuys || 0) > before, '至少自动购入 1 个升级项');
  assert.equal(S.ai.assistants || 0, 3, '自动升级不消耗助手（常驻班组）');
});
test('v3.10.5 ④ AI：无开关 → tickAI 返回 false（不动作）', () => {
  seedAiBase();
  S.ai.assistants = 5;
  assert.equal(tickAI(10), false, '无开关 → 不动作，助手不消耗');
});

