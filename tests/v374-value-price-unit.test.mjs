// v3.7.4 反馈单测（纯 Node，无需浏览器）
//
// ①「产出与效率」组加成和价格不成比例：截图 455.63K / 525.63K / 552.00K 对应 +2% / +10% / ×1.12。
// ② 同组卡面文案混用「+X%」与「×N」，玩家无法横向比较。
//
// 本测试把「文案唯一真源 / 入门三座价效成正比 / 全组单价单调阶梯」三项口径锁成不变量，
// 防止后续改数值时再次出现「改了 fx 忘了改 desc / 改了加成忘了改 base」的漂移。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { V21_BUILDINGS, buildingCostV21, unlockMilestoneV21 } = await import('../src/data/buildings.js');
const { fxValue } = await import('../src/core/effectEngine.js');
const { v21BuildingCost } = await import('../src/modules/economy.js');

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const BAL = read('src/data/balance.js');
const SHOP = read('src/modules/shop.js');
const WIKI = read('src/data/wiki.js');

const A = BALANCE.buildingsV21.filter(b => b.cat === 'A');
const byId = (id) => V21_BUILDINGS.find(b => b.id === id);
const ENTRY = ['warmup_node', 'eff_tower', 'double_workshop'];
const UNIT = 3e4;              // 入门档：每 +1% 的 Lv.0 基价
// 每级等效产出增量（%）：乘算按 value-1 折算，与 balance.js 的 aPct 同口径
const pctOf = (b) => Math.round((b.fx.key === 'globalMul' ? b.fx.value - 1 : b.fx.value) * 100);

function reset() {
  S.upgrades = {}; S.buildings = {}; S.tech = {}; S.religion = {}; S.policies = {};
  S.cultists = []; S.pets = {}; S.activePets = [];
  S.converterOn = {}; S._probeEnabled = true; S.atriumOn = true; S.ptDistillOn = true;
  S.wageState = { state: 'ok' }; S.ep = 1e12; S.dm = 0; S.rp = 0; S.pt = 0; S.faith = 0;
  S.runEarned = 0; S.prestigePoints = 0; S.prestige = 0; S.es = 0;
  S.milesDone = {}; S.unlockedBuildings = {}; S.resDiscovered = {};
  S.familyUpgrades = {}; S.riftAuto = 'none'; S.autoPurify = false;
}

test('① 组 A 恰好 10 座，入门三座 id 与顺序不变', () => {
  assert.equal(A.length, 10);
  assert.deepEqual(A.slice(0, 3).map(b => b.id), ENTRY);
  assert.ok(ENTRY.every(id => byId(id)));
});

test('② 全组卡面文案统一句式「每级全局产出 +X%」，不再出现 ×N 混写', () => {
  for (const b of A) {
    assert.match(b.desc, /^每级全局产出 \+\d+%$/, `${b.id} 文案：${b.desc}`);
    assert.ok(!b.desc.includes('×'), `${b.id} 仍用乘号写法`);
  }
  assert.equal(new Set(A.map(b => b.desc.replace(/\d+/, 'X'))).size, 1, '全组句式必须一致');
});

test('③ 文案数字由 fx 派生（改 fx 不改 desc 会被单测挡下）', () => {
  for (const b of A) {
    assert.equal(Number(b.desc.match(/\+(\d+)%/)[1]), pctOf(b), `${b.id} 文案与效果数值不符`);
  }
  assert.match(BAL, /const aGain = \(key, value\) => \(\{ fx: \{ key, value \}, desc: `每级全局产出 \+\$\{aPct\(key, value\)\}%` \}\)/);
  // 组 A 不再手写 desc 字面量
  assert.ok(!/desc: '每级全局产出 ×/.test(BAL), '仍有 ×N 手写文案');
  assert.ok(!/desc: '每级全局产出 \+/.test(BAL), '仍有 +X% 手写文案（应走 aGain）');
});

test('④ 入门三座 fx 语义未被文案改动波及', () => {
  assert.equal(byId('warmup_node').fx.key, 'globalAdd');
  assert.equal(byId('warmup_node').fx.value, 0.02);
  assert.equal(byId('eff_tower').fx.key, 'globalAdd');
  assert.equal(byId('eff_tower').fx.value, 0.10);
  assert.equal(byId('double_workshop').fx.key, 'globalMul');
  assert.equal(byId('double_workshop').fx.value, 1.12);
});

test('⑤ 入门三座 Lv.0 基价 = 增量% × 3e4（+2%/+10%/+12% → 6e4/3e5/3.6e5）', () => {
  assert.deepEqual(ENTRY.map(id => byId(id).base), [6e4, 3e5, 3.6e5]);
  for (const id of ENTRY) {
    const b = byId(id);
    assert.equal(b.base, pctOf(b) * UNIT, `${id} 基价与加成不成比例`);
  }
});

test('⑥ 入门三座 growth 统一 1.40（同等级下比例不漂移）', () => {
  for (const id of ENTRY) assert.equal(byId(id).growth, 1.40, `${id} growth 分叉`);
});

test('⑦ 任意等级 0~4：三座「单位加成价格」恒等（价格比 ≡ 加成比）', () => {
  reset();
  for (let lv = 0; lv <= 4; lv++) {
    const unit = ENTRY.map(id => {
      S.buildings = { [id]: lv };
      const b = byId(id);
      return buildingCostV21(b, S, 1) / (pctOf(b) * Math.pow(b.growth, lv));
    });
    const rel = Math.abs(unit[0] - unit[1]) / unit[0];
    const rel2 = Math.abs(unit[0] - unit[2]) / unit[0];
    assert.ok(rel < 1e-9 && rel2 < 1e-9, `Lv.${lv} 单位加成价格分叉：${unit.join(' / ')}`);
  }
  S.buildings = {};
});

test('⑧ 实际显示/实扣价（含 costMult）同样保持比例', () => {
  reset();
  S.buildings = { warmup_node: 2, eff_tower: 2, double_workshop: 1 }; // 截图等级场景
  const rows = ENTRY.map(id => {
    const b = byId(id);
    const lv = S.buildings[id];
    return { id, pct: pctOf(b), cost: v21BuildingCost(b), unit: v21BuildingCost(b) / (pctOf(b) * Math.pow(b.growth, lv)) };
  });
  const base = rows[0].unit;
  for (const r of rows) {
    assert.ok(Math.abs(r.unit - base) / base < 1e-9, `${r.id} 显示价与加成不成比例：${JSON.stringify(rows)}`);
  }
  // 修正后价带按加成拉开，不再挤在 455K~552K（原极差仅 1.21 倍）
  const costs = rows.map(r => r.cost);
  assert.ok(Math.max(...costs) / Math.min(...costs) > 3, `价带未拉开：${costs.join(' / ')}`);
  // 同等级下必须严格 +2% < +10% < +12%（截图里工坊是 Lv.1、另两座 Lv.2，等级差会自然反超）
  S.buildings = { warmup_node: 2, eff_tower: 2, double_workshop: 2 };
  const sameLv = ENTRY.map(id => v21BuildingCost(byId(id)));
  assert.ok(sameLv[0] < sameLv[1] && sameLv[1] < sameLv[2], `同等级价格未按加成递增：${sameLv.join(' / ')}`);
  S.buildings = {};
});

test('⑨ 全组 Lv.0 单价（每 +1%）单调不降，后期逐档抬高抑制速通', () => {
  const unit = A.map(b => b.base / pctOf(b));
  for (let i = 1; i < unit.length; i++) {
    // v3.12.13 反馈⑩：量子叠加器整体 ×1000（2e6→2e9）成为组A 溢价 outlier，跳过与其相邻的单调性比较
    if (A[i - 1].id === 'quantum_stacker') continue;
    assert.ok(unit[i] >= unit[i - 1] - 1e-9, `第 ${i} 座 ${A[i].id} 单价 ${unit[i]} 低于前一座 ${A[i - 1].id} ${unit[i - 1]}`);
  }
  assert.ok(unit[3] > unit[0] * 1.9, '中期档应显著高于入门档');
  assert.ok(unit[9] > unit[3], '终局档应高于中期档');
});

test('⑩ 改价不跨里程碑档位（三座仍为 m0，后期锚链档位不变）', () => {
  for (const id of ENTRY) assert.equal(unlockMilestoneV21(byId(id)), 0, `${id} 因改价被误锁里程碑`);
  assert.equal(unlockMilestoneV21(byId('dispatch_hub')), 5);  // 1.2e6 → m5
  assert.equal(unlockMilestoneV21(byId('quantum_stacker')), 6); // 2e6 → m6
  assert.equal(unlockMilestoneV21(byId('end_shrine')), 7);      // 5.4e6 → m7
});

test('⑪ 效果引擎读值不变（文案改版不动玩法）', () => {
  reset();
  S.buildings = { warmup_node: 5, eff_tower: 9, double_workshop: 9 };
  assert.ok(Math.abs(fxValue('globalAdd') - (0.02 * 5 + 0.10 * 9 + 0.20 * 0)) < 1e-12);
  assert.ok(Math.abs(fxValue('globalMul') - Math.pow(1.12, 9)) < 1e-12);
  S.buildings = {};
});

test('⑫ 卡面消费链未对组 A 文案做二次改写', () => {
  assert.match(SHOP, /function v21Desc\(b\) \{\s*\n\s*if \(!v21HasCapAdd\(b\)\) return b\.desc;/);
  assert.match(SHOP, /<div class="desc">\$\{v21Desc\(b\)\}<\/div>/);
});

test('⑬ Wiki 写明统一文案与加算/乘算口径', () => {
  assert.match(WIKI, /效能建筑 · 全局产出/);
  assert.match(WIKI, /卡面统一写「每级全局产出 \+X%」/);
  assert.match(WIKI, /同一等级下价格比恒等于加成比/);
});
