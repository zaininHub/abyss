// v4.2.8 反馈专项（单测）：研究点门控收紧——「未解锁资源的升级被提前解锁」根治验证
//
// 覆盖（用户反馈⑤，参考星尘精炼）：
//   ① rp_dm（星尘精炼）：v4.3.9 换源 converterUnlocked('vehicles')——加成只作用于载具采集，
//     旧 anchorDone('dm') 有金库旁路（买金库≠采集解锁，用户实测「采集未解锁星尘精炼就解锁了」）
//   ② rp_starres（星蕴提纯）：首支远征返航（expeditionsDone>0）才显示——星图开启只代表「能去」
//   ③ rp_colony2 / rp_cosmos2：已拥有殖民地才显示——未殖民时 +N% 无处生效
//   ④ 签名接线：modSig 消费 RESEARCH_MODULE_GATES（门控位变化当帧重建）
//   ⑤ 渲染/购买/分组标题多处消费同一谓词（v3102 C4 范式沿用）
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
const mkEl = () => ({
  style: {}, classList: { add() {}, remove() {} }, className: '', dataset: {},
  innerHTML: '', title: '', children: [],
  appendChild(c) { this.children.push(c); return c; },
  addEventListener() {}, contains: () => true, closest: () => null,
  setAttribute() {}, getAttribute: () => null,
});
globalThis.document = {
  getElementById: () => null, createElement: mkEl, createDocumentFragment: mkEl,
  body: { classList: { add() {}, remove() {} } }, addEventListener() {},
  querySelectorAll: () => [],
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOP_SRC = readFileSync(join(ROOT, 'src', 'modules', 'shop.js'), 'utf8');

const state = await import('../src/state.js');
const shop = await import('../src/modules/shop.js');
const { BALANCE } = await import('../src/data/balance.js');
const { S, defaultState } = state;

const u = id => BALANCE.researchUpgs.find(x => x.id === id);

function fresh() {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  return S;
}
function fakeContainer() {
  const c = mkEl();
  c._lastSig = undefined;
  return c;
}
function collectResearchIds(node, out = []) {
  if (node.dataset && node.dataset.research) out.push(node.dataset.research);
  for (const c of (node.children || [])) collectResearchIds(c, out);
  return out;
}

test('G1 星尘精炼：载具门（converterUnlocked vehicles）未完成不显示，载具入队后放行', () => {
  // 旧口径场景（_riftSeen=true 但从未购载具/金库）：不得放行——用户实测的提前解锁场景
  const riftSeenNoDm = { ...S, _riftSeen: true, riftsSealed: 1, upgrades: {} };
  assert.equal(shop.researchResourceUnlocked(u('rp_dm'), riftSeenNoDm), false, '_riftSeen 但无载具 → 不显示');
  // v4.3.9 反馈：门控换源 converterUnlocked('vehicles')——加成只作用于载具采集，
  // 旧 anchorDone('dm') 有金库旁路（v3.0.3 反馈⑪ 显示锚点语义），买金库不该点亮研究项
  const dmIn = { ...S, _riftSeen: true, riftsSealed: 1, upgrades: { scooter: 1 } };
  assert.equal(shop.researchResourceUnlocked(u('rp_dm'), dmIn), true, '购入载具 → 显示');
  // 反转 v4.3.8 旧行为：购金库（无载具）不再放行——采集未解锁时研究项不提前摆出
  assert.equal(shop.researchResourceUnlocked(u('rp_dm'), { ...S, upgrades: { dm_vault: 1 } }), false, '仅购金库无载具 → 不显示（v4.3.9 换源）');
  // 跨局旁路场景：resDiscovered.dm 跨转生保留 + 新局金库可见可买 → 仍须由载具放行
  assert.equal(shop.researchResourceUnlocked(u('rp_dm'), { ...S, resDiscovered: { dm: true }, upgrades: { dm_vault: 3 } }), false, '跨局 dm 标记+金库已购 → 仍由载具门放行');
  // 非首辆载具（convoy 等 vehicles.ids 任一）同样放行
  assert.equal(shop.researchResourceUnlocked(u('rp_dm'), { ...S, upgrades: { convoy: 1 } }), true, '购入任意载具 → 显示');
});

test('G2 星蕴提纯：未派远征不显示，首支远征返航后放行', () => {
  const chartOn = { ...S, tech: { deep_space: true }, chapter: '3', upgrades: { atrium: 1 }, pt: 5, expeditionsDone: 0 };
  assert.equal(shop.researchResourceUnlocked(u('rp_starres'), chartOn), false, '星图开启但零远征 → 不显示');
  assert.equal(shop.researchResourceUnlocked(u('rp_starres'), { ...chartOn, expeditionsDone: 1 }), true, 'expeditionsDone>=1 → 显示');
});

test('G3 星殖民拓/宇宙工程：无殖民地不显示，殖民地到位放行', () => {
  const chartOn = { ...S, tech: { deep_space: true }, chapter: '3', upgrades: { atrium: 1 }, pt: 5, expeditionsDone: 1 };
  assert.equal(shop.researchResourceUnlocked(u('rp_colony2'), chartOn), false, '零殖民地 → 不显示');
  assert.equal(shop.researchResourceUnlocked(u('rp_cosmos2'), chartOn), false, '零殖民地 → 不显示');
  const colonized = { ...chartOn, colonies: { moon: true } };
  assert.equal(shop.researchResourceUnlocked(u('rp_colony2'), colonized), true, '有殖民地 → 显示');
  assert.equal(shop.researchResourceUnlocked(u('rp_cosmos2'), colonized), true, '有殖民地 → 显示');
});

test('G4 渲染/购买/签名/分组标题多处消费同一谓词（沿用 v3102 C4 范式）', () => {
  assert.ok(SHOP_SRC.includes('if (!researchResourceUnlocked(u)) continue;'), '渲染过滤');
  assert.ok(SHOP_SRC.includes("if (!researchResourceUnlocked(u)) return { ok: false, reason: '对应资源尚未解锁' }"), '购买拦截');
  assert.ok(SHOP_SRC.includes('const gateSig = Object.keys(RESEARCH_RES_ANCHORS)'), '重建签名含资源门控位');
  assert.ok(SHOP_SRC.includes('const modSig = Object.keys(RESEARCH_MODULE_GATES)'), '重建签名含模块门控位');
  assert.ok(SHOP_SRC.includes('.filter(u => u && researchResourceUnlocked(u))'), '分组标题不列隐藏项');
});

test('G5 行为：门控状态变化当帧重建研究面板（远征返航后 rp_starres 出现）', () => {
  fresh();
  S.tech = { deep_space: true }; // 星图开启（starChartUnlocked 真实口径）
  S.chapter = '3';
  S.upgrades = { atrium: 1 }; // RP 锚点
  S.pt = 5;                   // 宠物模块解锁
  S.rp = 1e9;
  // 组链解锁：prod 累计 4 级→res 显形；res 累计 4 级→star 显形（star 另需星图开启）
  S.rpTheories = { rp_entropy: 4, rp_wage: 4, rp_jump: 4 };
  const c = fakeContainer();
  shop.renderResearchUpgrades(c);
  const before = collectResearchIds(c);
  assert.ok(before.includes('rp_jump'), '同组 rp_jump 正常渲染（夹具有效）');
  assert.ok(!before.includes('rp_starres'), '零远征时星际资源研究不渲染');
  S.expeditionsDone = 1;
  shop.renderResearchUpgrades(c);
  const after = collectResearchIds(c);
  assert.ok(after.includes('rp_starres'), '远征返航当帧重建并出现');
});

test('G6 行为：载具未购时 rp_dm 不渲染，载具购入后出现（金库旁路封堵）', () => {
  fresh();
  S.rp = 1e9;
  S.rpTheories = { rp_entropy: 4, rp_wage: 2 }; // 组链：prod 4 级让「深渊协议」组显形
  S.upgrades = { dm_vault: 1 };                 // v4.3.9 反馈场景：金库已买但零载具——采集未解锁
  const c = fakeContainer();
  shop.renderResearchUpgrades(c);
  const before = collectResearchIds(c);
  assert.ok(before.includes('rp_wage'), '同组 rp_wage 正常渲染（夹具有效）');
  assert.ok(!before.includes('rp_dm'), '仅金库无载具时 rp_dm 不渲染');
  S.upgrades = { scooter: 1 }; // 载具门放行（converterUnlocked('vehicles') 同源判定）
  shop.renderResearchUpgrades(c);
  assert.ok(collectResearchIds(c).includes('rp_dm'), '载具购入当帧渲染');
});

test('G7 行为：buyResearchUpgrade 对载具门未完成资源拦截', () => {
  fresh();
  S.rp = 1e9;
  const denied = shop.buyResearchUpgrade('rp_dm');
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /尚未解锁/);
  assert.equal((S.rpTheories || {}).rp_dm, undefined, '拦截不得写入研究等级');
  S.upgrades = { dm_vault: 1 }; // 金库旁路同样拦截（v4.3.9 换源）
  const deniedVault = shop.buyResearchUpgrade('rp_dm');
  assert.equal(deniedVault.ok, false, '仅金库无载具 → 购买仍拦截');
  S.upgrades = { scooter: 1 };
  const allowed = shop.buyResearchUpgrade('rp_dm');
  assert.equal(allowed.ok, true, '载具购入后可购买');
});
