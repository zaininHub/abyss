// v4.3.35 反馈①（单测）：「政策未解锁，深渊协议就解锁了政策效果加强」根治验证
//
// 场景：深渊协议组由「产能研究累计 4 级」解锁（第 1~3 章即可），
//       而周期政策本体要第 7 章才开放（core/chapterGates.js 的 gateOpen('policy')），
//       此前「律令演绎（政策效果 +6%/级）」随组提前摆出，买了也无处生效。
// 口径：研究项门控统一走 RESEARCH_MODULE_GATES；渲染 / 购买 / 重建签名三处共用同一谓词。
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
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SHOP_SRC = read('src/modules/shop.js');
const FRAME_SRC = read('src/systems/frameSystems.js');

const state = await import('../src/state.js');
const shop = await import('../src/modules/shop.js');
const { BALANCE } = await import('../src/data/balance.js');
const { gateOpen } = await import('../src/core/chapterGates.js');
const { S, defaultState } = state;

const u = (id) => BALANCE.researchUpgs.find((x) => x.id === id);

function fresh(chapter) {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  S.chapter = String(chapter);
  return S;
}
function collectResearchIds(node, out = []) {
  if (node.dataset && node.dataset.research) out.push(node.dataset.research);
  for (const c of (node.children || [])) collectResearchIds(c, out);
  return out;
}

test('P1 律令演绎挂「周期政策」章节门禁（与 policies.js 同源 gateOpen）', () => {
  const gate = SHOP_SRC.match(/rp_policy:\s*\(s\)\s*=>\s*gateOpen\('policy',\s*s\)/);
  assert.ok(gate, 'RESEARCH_MODULE_GATES.rp_policy 必须读 gateOpen(\'policy\', s)');
  assert.match(SHOP_SRC, /import \{ gateOpen \} from '\.\.\/core\/chapterGates\.js'/, 'shop.js 需引入章节门禁');
});

test('P2 第 6 章不放行、第 7 章放行（政策本体解锁）', () => {
  fresh(6);
  assert.equal(gateOpen('policy', S), false);
  assert.equal(shop.researchResourceUnlocked(u('rp_policy')), false, '第 6 章不得摆出律令演绎');

  fresh(7);
  assert.equal(gateOpen('policy', S), true);
  assert.equal(shop.researchResourceUnlocked(u('rp_policy')), true, '第 7 章应放行');
});

test('P3 第 6 章即使 RP 充足也买不到（购买入口同谓词）', () => {
  fresh(6);
  S.rp = 1e9;
  S.rpTheories = { rp_entropy: 2, rp_matrix: 2 }; // 深渊协议组已显现（产能研究累计 4 级）
  const r = shop.buyResearchUpgrade('rp_policy');
  assert.equal(r.ok, false);
  assert.equal(r.reason, '对应资源尚未解锁');
  assert.equal((S.rpTheories.rp_policy || 0), 0, '不得写入等级');
});

test('P4 第 7 章可以正常买到，等级照常累加', () => {
  fresh(7);
  S.rp = 1e9;
  S.rpTheories = { rp_entropy: 2, rp_matrix: 2 };
  const r = shop.buyResearchUpgrade('rp_policy');
  assert.equal(r.ok, true);
  assert.equal(S.rpTheories.rp_policy, 1);
});

test('P5 渲染：第 6 章不出现 rp_policy 卡片，第 7 章出现', () => {
  const idsAt = (chapter) => {
    fresh(chapter);
    S.rp = 1e6;
    S.rpTheories = { rp_entropy: 2, rp_matrix: 2 }; // 让「深渊协议」组可见
    const c = mkEl();
    shop.renderResearchUpgrades(c);
    return collectResearchIds(c);
  };
  const six = idsAt(6);
  assert.ok(!six.includes('rp_policy'), '第 6 章渲染列表不得包含 rp_policy');
  assert.ok(six.includes('rp_wage'), '同组其它研究项（薪酬协商）应仍正常显示，避免整组被误伤');

  const seven = idsAt(7);
  assert.ok(seven.includes('rp_policy'), '第 7 章渲染列表应包含 rp_policy');
});

test('P6 章节推进当帧置 dirty.rp（门禁放行后研究面板立即重建）', () => {
  const block = FRAME_SRC.slice(FRAME_SRC.indexOf('章节推进'), FRAME_SRC.indexOf("id: 'gates'"));
  assert.match(block, /ctx\.dirty\.rp = true;/, '章节推进必须置 dirty.rp');
});

test('P7 老档已买等级不回收：等级落地后照常提供政策加成', () => {
  fresh(7);
  S.rpTheories = { rp_entropy: 2, rp_matrix: 2, rp_policy: 3 };
  // 研究读侧统一走 researchMult('policy')——等级存在即计入，不因门禁回收
  assert.equal(S.rpTheories.rp_policy, 3);
  assert.equal(shop.researchResourceUnlocked(u('rp_policy')), true);
});
