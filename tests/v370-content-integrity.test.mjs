// v3.7.0 内容完整性与数值准确性单测（纯 Node）
//
// 守住项目历史上反复踩的四类坑：
//   ① 「配置数组 + 渲染分组表」两头改（研究项 / 章节 / 事件）；
//   ② 卡面 desc 与真实 cps 漂移（v2.8.3 起 23 项 ×2 错误，本版修正）；
//   ③ 新增效果键无人消费（死升级 / 死政策）；
//   ④ 本次 review 修掉的真 bug（项目平行台、政策历史、研究读侧口径）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const { EVENTS } = await import('../src/data/events.js');
const { CHAPTERS } = await import('../src/data/chapters.js');
const { POLICY_GROUPS, recordPolicyRun, policyMult } = await import('../src/data/policies.js');
const { RP_GROUPS } = await import('../src/modules/shop.js');
const { maxProjects } = await import('../src/modules/projects.js');
const { unitCost, bulkCostCalc, CAP_EXPANSION_IDS } = await import('../src/modules/economy.js');
const { researchMult } = await import('../src/core/research.js');
const orderPkg = (await import('../src/storylines/line_order.js')).default;
const abyssPkg = (await import('../src/storylines/line_abyss.js')).default;
const faithPkg = (await import('../src/storylines/line_faith.js')).default;
const LINE_PKGS = [orderPkg, abyssPkg, faithPkg];

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
function allSource() {
  let out = '';
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out += readFileSync(p, 'utf8') + '\n';
    }
  };
  walk(srcRoot);
  return out;
}
const SRC = allSource();

// 与 core/format.js 同一套缩写表；用于重算「基础产出 +X/s」卡面文案
const U = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];
function compact(n) {
  let u = 0;
  while (n >= 1000 && u < U.length - 1) { n /= 1000; u++; }
  return n.toFixed(3).replace(/\.?0+$/, '') + U[u];
}

console.log('[D] 内容完整性与卡面数值');

test('D1 研究项 22 项，全部归属 RP_GROUPS 且无幽灵 id', () => {
  assert.equal(BALANCE.researchUpgs.length, 22); // v3.12.11 反馈②：68→21；v3.12.12 ⑧：+rp_ai_unit → 22
  const grouped = RP_GROUPS.flatMap(g => g.ids);
  const defined = BALANCE.researchUpgs.map(u => u.id);
  assert.equal(new Set(grouped).size, grouped.length, '分组内 id 不重复');
  assert.equal(grouped.length, defined.length, '分组数与研究项数不一致');
  for (const id of defined) assert.ok(grouped.includes(id), `${id} 未进分组 → 面板不可见/买不到`);
  for (const id of grouped) assert.ok(defined.includes(id), `分组引用了幽灵 id ${id}`);
  assert.equal(RP_GROUPS.length, 5); // v3.12.12 ⑧：prod/res/abyss/ai/star
});

test('D2 所有研究项 fx.key 都有 researchMult 消费点（无死升级）', () => {
  const consumed = new Set([...SRC.matchAll(/researchMult\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)].map(m => m[1]));
  for (const u of BALANCE.researchUpgs) {
    if (!u.fx) continue; // v3.12.12 ⑧：fx=null 为授予型研究（rp_ai_unit 购买即 +1 助手）
    assert.ok(consumed.has(u.fx.key), `${u.id} 的 fx.key=${u.fx.key} 无消费点`);
  }
  assert.ok(consumed.has('policy'), 'rp_policy 必须走标准研究读侧');
});

test('D3 所有政策 effect key 都有 policyMult 消费点（无死政策）', () => {
  const consumed = new Set([...SRC.matchAll(/policyMult\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)].map(m => m[1]));
  const ids = [];
  for (const g of POLICY_GROUPS) {
    assert.ok(g.name && typeof g.unlock === 'function', `政策组 ${g.id} 结构不完整`);
    for (const p of g.policies) {
      ids.push(p.id);
      assert.ok(p.desc, `${p.id} 缺描述`);
      for (const k of Object.keys(p.effect)) assert.ok(consumed.has(k), `${p.id} 的 effect.${k} 无消费点`);
    }
  }
  assert.equal(new Set(ids).size, ids.length, '政策 id 不重复');
  assert.equal(POLICY_GROUPS.length, 13);
  assert.equal(ids.length, 39);
});

test('D4 policyMult 与 researchMult(policy) 同口径（去掉内联第二实现）', () => {
  S.policies = {}; S.rpTheories = {}; S.vowPolicyBoost = false;
  assert.equal(policyMult('ep'), 1);
  S.rpTheories = { rp_policy: 2 };
  assert.ok(Math.abs(policyMult('ep') - researchMult('policy')) < 1e-9, '无政策时应等于研究加成');
  S.policies = { route: { id: 'order_route', lv: 1 } };
  assert.ok(Math.abs(policyMult('ep') - (1 + 0.20) * researchMult('policy')) < 1e-9);
  S.policies = {}; S.rpTheories = {};
});

test('D5 升级卡面「基础产出 +X/s」与真实 cps 完全一致', () => {
  let checked = 0;
  for (const u of UPGRADES) {
    if (!u.cps || !/^基础产出\+/.test(u.desc || '')) continue;
    const want = `基础产出+${compact(u.cps)}/s`;
    assert.equal(u.desc, want, `${u.id} 卡面 ${u.desc} 与 cps=${u.cps} 不符（应为 ${want}）`);
    checked++;
  }
  // 42 项 = 前 3 项模板字符串（直读 B.*.cps，本就准确）+ 39 项字面量（其中 23 项在 v3.7.0 修正了 ×2 漂移）
  assert.equal(checked, 42, '应覆盖 42 项基础产出升级');
});

test('D6 事件数值在既有天花板内，不破坏平衡', () => {
  const all = [...EVENTS, ...LINE_PKGS.flatMap(p => p.data.events.append)];
  for (const e of all) {
    if (e.type === 'buff' || e.type === 'clickbuff') {
      assert.ok(e.mult <= 20, `${e.id} buff 倍率 ${e.mult} 超过主表天花板 ×20`);
      assert.ok(e.dur <= 3600, `${e.id} 时长 ${e.dur}s 超过主表天花板`);
    }
    if (e.type === 'ep') assert.ok((e.amount || 0) <= 14400, `${e.id} 产出秒数超天花板`);
    if (e.type === 'debuff') assert.ok(e.mult >= 0.3 && e.mult < 1, `${e.id} debuff 倍率异常`);
  }
});

test('D7 章节 id 全局唯一（主线 + 三线变体，按数据表派生）', () => {
  const all = [...CHAPTERS.map(c => String(c.id)), ...LINE_PKGS.flatMap(p => p.data.chapters.append.map(c => String(c.id)))];
  const expected = CHAPTERS.length + LINE_PKGS.reduce((n, p) => n + p.data.chapters.append.length, 0);
  assert.equal(all.length, expected);
  assert.equal(new Set(all).size, all.length, '章节 id 撞号');
});

test('D8 事件 id 全局唯一（主表 + 三线专属，按数据表派生）', () => {
  const all = [...EVENTS.map(e => e.id), ...LINE_PKGS.flatMap(p => p.data.events.append.map(e => e.id))];
  const expected = EVENTS.length + LINE_PKGS.reduce((n, p) => n + p.data.events.append.length, 0);
  assert.equal(all.length, expected);
  assert.equal(new Set(all).size, all.length, '事件 id 撞号');
});

test('D9 Wiki 不再引用不存在的 BALANCE 键，且新章节已注册', () => {
  const wiki = readFileSync(join(srcRoot, 'data', 'wiki.js'), 'utf8');
  assert.ok(!wiki.includes('delveCorruptPerLevel'), '旧键会渲染成 undefined');
  assert.ok(wiki.includes('delveCorruptPerRun'), '应改读真实键');
  assert.ok(wiki.includes("id: 'line'"), '应新增「故事线特色」章节');
  assert.ok(!wiki.includes('分三批次'), '研究分组描述已过时（现为 4 组）');
});

console.log('[E] review bugfix 回归');

test('E1 项目平行台真正增加并行上限（原 Math.max 恒等于基础 3）', () => {
  const saved = S.buildings;
  S.buildings = {};
  assert.equal(maxProjects(), 3);
  S.buildings = { proj_parallel: 1 };
  assert.equal(maxProjects(), 5, '基础 3 + 建筑 2 = 5');
  S.buildings = saved || {};
});

test('E2 recordPolicyRun 适配 {id,lv} 对象格式，政策历史可累积', () => {
  S.policies = {
    route: { id: 'order_route', lv: 1 },
    star: { id: 'star_trade', lv: 2 },
  };
  S.policyRuns = [];
  recordPolicyRun();
  assert.equal(S.policyRuns.length, 1, '政策历史应记入一轮');
  assert.equal(S.policyRuns[0].picks.length, 2, '应识别出 2 项已选政策');
  assert.ok(S.policyRuns[0].picks.some(x => x.includes('秩序指令')));
  S.policies = {}; S.policyRuns = [];
});

test('E3 两条购买路径同口径：bulkCostCalc(u,1) === unitCost(u,0)', () => {
  const saved = S.upgrades;
  S.upgrades = {};
  // unitCost 的 n 是「价格档位偏移」（geomCostBase 的 qty），n=0 才是当前这一件；
  // bulkCostCalc 的 n 是「购买件数」。项目纪律：两条路径必须同价。
  for (const u of UPGRADES.slice(0, 12)) {
    assert.equal(bulkCostCalc(u, 1), unitCost(u, 0), `${u.id} 批量首购价与单价不一致`);
  }
  // 非防死锁钳制项：买 n 件的总价必须等于逐件单价累加
  for (const u of UPGRADES.slice(0, 12).filter(x => !CAP_EXPANSION_IDS.includes(x.id))) {
    const sum = [0, 1, 2, 3].reduce((a, i) => a + unitCost(u, i), 0);
    assert.equal(bulkCostCalc(u, 4), sum, `${u.id} 批量 4 件与逐单累加不一致`);
  }
  S.upgrades = saved || {};
});

test('E3b AI 自动购买全部走 unitCost(u,0)（不再多扣 growth 倍）', () => {
  const ai = readFileSync(join(srcRoot, 'modules', 'ai.js'), 'utf8');
  assert.ok(!/unitCost\([^,]+,\s*1\s*\)/.test(ai), 'AI 实扣路径不应再出现 unitCost(u,1)');
  const hits = [...ai.matchAll(/unitCost\([^,]+,\s*0\s*\)/g)].length;
  // v3.10.5：助手由「编队按类型自动购买」改为消耗品，AI 实扣调用点收敛到 3 处（回本/混沌直觉），阈值同步下调
  assert.ok(hits >= 3, `AI 自动购买应有 ≥3 处 unitCost(...,0)，实际 ${hits}`);
});

test('E4 信仰线 ×3 已移入软上限之前（源码位置断言）', () => {
  const eco = readFileSync(join(srcRoot, 'modules', 'economy.js'), 'utf8');
  const gm = eco.slice(eco.indexOf('export function globalMult()'), eco.indexOf('export function echoMult()'));
  const capAt = gm.indexOf('softCapThreshold');
  const lineAt = gm.indexOf('K.GLOBAL_MULT');
  assert.ok(lineAt >= 0 && capAt >= 0 && lineAt < capAt, '线专属全局乘区必须在软上限压缩之前');
  assert.ok(!/S\.storyline === 'line_faith'/.test(gm), '不应再有硬编码线判断');
});

test('E5 研究读侧 core 化后与 economy 再导出同源', async () => {
  const eco = await import('../src/modules/economy.js');
  assert.equal(eco.researchMult, researchMult, 'economy.js 应再导出同一个函数，避免第二实现');
});

test('E6 异兽乘区单一真源：休战生效 + 等级里程碑真正进入产出', async () => {
  const eco = await import('../src/modules/economy.js');
  const petsMod = await import('../src/modules/pets.js');
  const { petLevelMilestoneMult } = await import('../src/data/pets.js');
  const saved = { pets: S.pets, activePets: S.activePets, pt: S.pt, religion: S.religion, runTalent: S.runTalent };
  try {
    S.pets = { hamster: { icon: '🐀', name: '庭鼠', level: 100, exp: 0, gen: 1, tier: 1 } };
    S.activePets = ['hamster'];
    S.pt = 100; S.religion = null; S.runTalent = null;
    const withPet = eco.petMult('global');
    const mile = petLevelMilestoneMult(100);
    assert.ok(Math.abs(mile - 1.25 * 1.5 * 1.8 * 2.2) < 1e-9, '100 级应累积 4 档里程碑');
    assert.ok(withPet > 1.05 * mile * 0.99, `里程碑必须进入真实乘区，实际 ${withPet}`);
    S.pt = 0;
    assert.equal(eco.petMult('global'), 1, 'PT 耗尽休战时出战加成必须失效');
    assert.equal(petsMod.petStarving(), true, 'UI 休战判定应与真实乘数同口径');
    assert.equal(petsMod.petMult, undefined, 'pets.js 不应再存在第二个 petMult（同名双实现）');
  } finally {
    Object.assign(S, saved);
  }
});
