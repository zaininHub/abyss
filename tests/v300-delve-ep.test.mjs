// 深潜结算制回归测试
// v3.12.6 反馈①~④：深潜从「每秒结算 + 一次性 EP/DM 下潜」改为「每 10 分钟结算一次」，
// 等级（层深）改为「注入虚空碎片（VS）填经验条」提升。
// 原缺陷：每秒产出叠加终局乘区后半天刷出 2K+ VS，而升级树单价只有 10~800，
//        下潜成本（EP+DM）相对每秒产出几乎可忽略（用户实报「消耗过少、VS 过多」）。
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const delve = await import('../src/modules/delve.js');
const { DELVE, levelNeed, vsPerCycle, epPerCycle, corruptPerCycle, milestoneVs } = await import('../src/data/delve.js');
const { epStorageCap } = await import('../src/modules/economy.js');

function setup(extra = {}) {
  Object.assign(S, {
    ep: 1e12, rp: 0, es: 3, dm: 1e6, vs: 0, faith: 0, pt: 0, riftEmber: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: { unlocked: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, es: true, faith: true, pt: true, dm: true },
    delve: { unlocked: true, active: false, depth: 0, up: {}, mileDone: {}, xp: 0, cycleT: 0 },
    corruption: 0, policies: {}, policyRerolls: {}, vowPolicyBoost: false,
  }, extra);
}

test('③ 一个周期 = 10 分钟：未到点不结算，到点才扣 EP / 给 VS', () => {
  setup();
  assert.equal(delve.startDelve().ok, true);
  const ep0 = S.ep, vs0 = S.vs;
  delve.tickDelve(DELVE.cycleSec - 1);
  assert.equal(S.ep, ep0, '周期未走完不扣 EP');
  assert.equal(S.vs, vs0, '周期未走完不产 VS');
  delve.tickDelve(1);
  assert.ok(S.ep < ep0, '走完一个周期扣 EP');
  assert.ok(S.vs > vs0, '走完一个周期产 VS');
  assert.ok(Math.abs(S.ep - ep0) < ep0 * 0.5, '单周期消耗不会一次抽干');
});

test('② 消耗按「10 分钟 EP 产出 × 比例」计价，层深越高占比越大', () => {
  const cap = 1e6;
  const cps = 1000;                       // 10 分钟产出 = 600,000 EP
  const c1 = epPerCycle(1, cps, cap, 0);
  const c10 = epPerCycle(10, cps, cap, 0);
  assert.ok(c10 > c1, '层深越高每周期消耗越大');
  assert.ok(c1 > cps * DELVE.cycleSec * 0.1, '比例下限 10% 起（不是象征性扣费）');
  assert.ok(c10 > cps * DELVE.cycleSec * 0.3, '层深 10 时吃掉三成以上 10 分钟产出');
  // 零产出时有存储上限兜底，避免「不产 EP 就免费下潜」
  assert.equal(epPerCycle(1, 0, cap, 0), Math.round(cap * DELVE.epDrainFloorRatio));
  // 耐压舱减免
  assert.ok(epPerCycle(10, cps, cap, 3) < epPerCycle(10, cps, cap, 0), '耐压舱降低每周期消耗');
});

test('① VS 产出回落到「每个周期个位数」——不再是半天 2K', () => {
  const perCycle = vsPerCycle(2, 0);
  assert.ok(perCycle < 2, `层深 2 单周期产出应 < 2（实际 ${perCycle.toFixed(2)}）`);
  const perDay = perCycle * (24 * 60) / (DELVE.cycleSec / 60) * 2.5; // ×2.5 常见终局乘区
  assert.ok(perDay < 500, `满乘区一天也不该超过 500 VS（实际 ${perDay.toFixed(0)}）`);
  assert.ok(vsPerCycle(10, 0) > vsPerCycle(2, 0), '层深越高产出越高');
  assert.ok(vsPerCycle(10, 3) > vsPerCycle(10, 0), '深潜器提升产出');
});

test('④ 等级靠注入 VS：部分注入→填满→升级，扣费与经验条一致', () => {
  setup({ vs: 1000 });
  const need = levelNeed(0);
  const r = delve.injectVs();
  assert.equal(r.ok, true);
  assert.equal(delve.delveDepth(), 1, '一次点击至少升 1 级');
  assert.equal(S.vs, 1000 - need, '按需求扣 VS');
  assert.equal(delve.delveXp(), 0, '升级后经验条归零');
  assert.ok(levelNeed(1) > levelNeed(0), '下一级需求更高');
});

test('④ 余额不足时只注入差额，不吞光余额也不越级', () => {
  setup({ vs: 2, delve: { unlocked: true, active: false, depth: 0, up: {}, mileDone: {}, xp: 0, cycleT: 0 } });
  const need = levelNeed(0);
  const r = delve.injectVs();
  assert.equal(r.ok, true);
  assert.equal(r.leveled, 0, '没填满不升级');
  assert.equal(S.vs, 0, '余额全部注入');
  assert.equal(delve.delveXp(), Math.min(2, need), '经验条等于注入量');
  assert.equal(delve.delveDepth(), 0);
});

test('④ VS 为 0 时注入被拒绝（不会出现负余额）', () => {
  setup({ vs: 0 });
  const r = delve.injectVs();
  assert.equal(r.ok, false);
  assert.equal(S.vs, 0);
});

test('② 层深抬高产出、消耗与腐化（三处同源）', () => {
  assert.ok(vsPerCycle(5, 0) > vsPerCycle(1, 0));
  assert.ok(epPerCycle(5, 1000, 1e6, 0) > epPerCycle(1, 1000, 1e6, 0));
  assert.ok(corruptPerCycle(5, 0) > corruptPerCycle(1, 0));
  assert.equal(corruptPerCycle(0, 0), 0, '未下潜不累积腐化');
  assert.ok(corruptPerCycle(5, 2) < corruptPerCycle(5, 0), '净化核心降低腐化');
});

test('② EP 见底：按可用比例结算，归零则强制上浮（不吞等级）', () => {
  setup();
  delve.startDelve();
  const c = epPerCycle(1, 0, epStorageCap(), 0);
  S.ep = c / 2;
  delve.tickDelve(DELVE.cycleSec);
  assert.equal(delve.delveActive(), true, '部分结算不强制上浮');
  assert.ok(S.vs > 0, '按比例给了一部分 VS');
  S.ep = 0;
  delve.tickDelve(DELVE.cycleSec);
  assert.equal(delve.delveActive(), false, 'EP 归零 → 强制上浮');
  assert.equal(delve.delveDepth(), 0, '层深/等级不受影响');
});

test('上浮后不再结算（不产不耗）', () => {
  setup();
  delve.startDelve();
  delve.stopDelve();
  const ep0 = S.ep, vs0 = S.vs;
  delve.tickDelve(DELVE.cycleSec * 3);
  assert.equal(S.ep, ep0, '上浮后不烧 EP');
  assert.equal(S.vs, vs0, '上浮后不产 VS');
});

test('里程碑 6 档 + 回声定位加成', () => {
  assert.equal(DELVE.milestones.length, 6);
  const m = DELVE.milestones.find(x => x.depth === 10);
  assert.equal(milestoneVs(m, 0), m.vs, '无回声定位 = 原值');
  assert.ok(milestoneVs(m, 5) > m.vs, '回声定位提升里程碑奖励');
});

test('升级树 8 项：耐压舱（降消耗）与回声定位（升里程碑）', () => {
  assert.equal(Object.keys(DELVE.upgrades).length, 8);
  assert.ok(DELVE.upgrades.hull && DELVE.upgrades.sonar);
  // 树价与产出同量级：首级深潜器不该贵过一个周期产出的 100 倍
  assert.ok(DELVE.upgrades.diver.base >= 20, '深潜器首价随 VS 产出下调后重新标定');
});
