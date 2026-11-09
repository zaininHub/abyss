// v3.0.8 回归：存储文案口径（购买后总量）+ RP 解锁与上限完整性
// 纯 Node 单测：economy 的 epCapAfterBuy / rpCap / addRp、disclosure 的 rp 锚点
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const eco = await import('../src/modules/economy.js');
const { anchorDone } = await import('../src/modules/disclosure.js');

function baseState(extra = {}) {
  Object.assign(S, {
    ep: 0, allTimeEp: 0, runEarned: 0, rp: 0, es: 0, dm: 0, pt: 0, faith: 0,
    prestige: 0, prestigePoints: 0, abyssEcho: 0, reincarned: 0,
    upgrades: {}, tech: {}, buildings: {}, eternal: {}, religion: {}, milesDone: {},
    cultists: [], policies: {}, bazaar: { unlocked: false }, resDiscovered: {},
    storyline: 'default', _rpOverflowSeen: false,
  }, extra);
}

test('epCapAfterBuy：返回「购买后总量」且不污染存档等级（storage）', () => {
  baseState({ upgrades: { storage: 5 } });
  const before = eco.epStorageCap();
  const after = eco.epCapAfterBuy('storage');
  assert.ok(after > before, `购买后上限 ${after} 应大于当前 ${before}`);
  assert.equal(S.upgrades.storage, 5, '临时试算必须还原等级');
  assert.equal(eco.epStorageCap(), before, '试算不得改变真实上限');
});

test('epCapAfterBuy：备用粮仓/缓存/数据中心同样给出总量（乘区生效）', () => {
  baseState({ upgrades: { cache: 2 }, buildings: { datacenter: 1 } });
  const cap = eco.epStorageCap();
  assert.ok(eco.epCapAfterBuy('reserve_bin') > cap, '备用粮仓应抬升上限');
  assert.ok(eco.epCapAfterBuy('cache') > cap, '缓存优化应抬升上限');
  assert.ok(eco.epCapAfterBuy('datacenter', 'building') > cap, '数据中心应抬升上限');
  assert.equal(S.upgrades.reserve_bin, undefined, '试算不得写入存档');
  assert.equal(S.buildings.datacenter, 1, '建筑试算必须还原等级');
});

test('rpCap / addRp：基础 2,500、矩阵存储库逐级扩容（首级 +400，逐级 ×1.15），且超出即截断', () => {
  baseState({ upgrades: { rp_vault: 3 } });
  // v3.4.4 反馈①：上限增量不再是恒定 400 —— 各级增量 400/460/529，累计 +1,389
  // v3.10.5 ③：产出基座（EP 上限 ×25%）改由「星图同调」(rp_sync) 门控——未购时 RP 上限只靠仓库
  const vault = Math.round(400 * (Math.pow(1.15, 3) - 1) / 0.15);
  assert.equal(eco.rpCap(), 2500 + vault, '未购星图同调：RP 上限 = 2500 + 仓库逐级（无产出基座）');
  // 购买「星图同调」后启用产出基座联动
  S.rpTheories = { rp_sync: 1 };
  const floor = Math.round(eco.epStorageCap() * 0.25);
  assert.equal(eco.rpCap(), 2500 + vault + floor, '购星图同调后：RP 上限 = 2500 + 仓库逐级 + 产出基座');
  assert.ok(eco.rpCap() > 2500 + 3 * 400, '逐级扩容后 3 级总量必须高于旧线性口径');
  eco.addRp(1e9);
  assert.equal(S.rp, eco.rpCap(), 'addRp 必须钳到上限（原蒸馏直写 S.rp 会越界）');
});

test('RP 解锁锚点：未溢出未购仓库 → 锁定；购入矩阵存储库 → 解锁', () => {
  baseState();
  assert.equal(anchorDone('rp', S), false, '新档研究点应锁定');
  S._rpOverflowSeen = true; S._rpVaultIntroduced = true;
  assert.equal(anchorDone('rp', S), false, '仅溢出（已引入仓库）不解锁');
  S.upgrades.rp_vault = 1;
  assert.equal(anchorDone('rp', S), true, '购入矩阵存储库后解锁研究点');
});
