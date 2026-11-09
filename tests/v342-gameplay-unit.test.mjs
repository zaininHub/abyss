// v3.4.2 玩法扩充单测（纯 Node 可跑，无需浏览器）：
// ① 研究升级数据完整性（新增 10 项 + fx.key 全部被 researchMult 消费）
// ② researchMult 公式正确性（含新增 faith 键——此前为「死升级」，已修复接入 religions.js）
// ③ 裂隙「凝视深渊」彩蛋升级购买链路（abyssGazeUnlocked 流转 + 成本/上限）
// ④ abyssGaze 视觉层（无 document 守卫 + 注入轻量 DOM 后确实生成 #abyss-gaze-crack 并淡入）
// ⑤ 统一成就表 ACHIEVEMENTS 完整性（id 唯一、abyss_gaze_egg 含 test、手动点亮项无 test）
import assert from 'node:assert';
import test from 'node:test';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ---- 浏览器无关的垫片（与既有 *-unit.test.mjs 同范式）----
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const { ACHIEVEMENTS } = await import('../src/data/achievements.js'); // v3.10.0：成就表已下沉到数据层
const { BALANCE } = await import('../src/data/balance.js');
const { researchMult } = await import('../src/modules/economy.js');
const { buyRiftUpgrade, riftUpgradeCost, riftUpgradeLevel } = await import('../src/modules/rift.js');
const abyssGaze = await import('../src/modules/abyssGaze.js');

// 轻量 document 垫片，用于验证 abyssGaze 真实创建 DOM
function makeEl() {
  return {
    id: '', style: {}, _attrs: {}, _html: '',
    setAttribute(k, v) { this._attrs[k] = v; },
    appendChild() {},
    querySelectorAll() { return []; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
  };
}
let registry = {};
global.document = {
  documentElement: { classList: { contains: () => false } }, // 暗色主题
  body: { appendChild(el) { registry[el.id] = el; } },
  getElementById(id) { return registry[id] || null; },
  createElement() { return makeEl(); },
};
global.requestAnimationFrame = (fn) => fn();

// ============ ① 研究升级数据完整性 ============
const NEW_RESEARCH = ['rp_quantum', 'rp_swarm', 'rp_harmony', 'rp_frugal', 'rp_vault',
  'rp_immerse', 'rp_relay', 'rp_void', 'rp_observe', 'rp_disciple'];

test('研究升级：10 个新增项齐备且 cap>0、fx.key 合法', () => {
  for (const id of NEW_RESEARCH) {
    const u = BALANCE.researchUpgs.find(x => x.id === id);
    assert.ok(u, `缺失研究升级 ${id}`);
    assert.ok(u.cap > 0, `${id} 应有上限`);
    assert.ok(u.fx && typeof u.fx.key === 'string' && u.fx.v !== undefined, `${id} 应有 fx 配置`);
  }
});

// v3.7.0：改为从源码动态提取 researchMult('key') 调用键，避免每次扩充研究项都要手改白名单
// （旧的 10 键硬编码集合把 v3.6.0 的 jump / starres / policy / ai / colony / cosmos 误判成「死升级」）。
const CONSUMED = (() => {
  const keys = new Set();
  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/researchMult\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)) keys.add(m[1]);
      }
    }
  };
  walk(srcRoot);
  return keys;
})();
test('研究升级：所有 fx.key 均被 researchMult 消费（无「死升级」）', () => {
  for (const u of BALANCE.researchUpgs) {
    assert.ok(u.fx, `研究升级 ${u.id} 缺 fx`);
    assert.ok(CONSUMED.has(u.fx.key), `研究升级 ${u.id} 的 fx.key=${u.fx.key} 未被任何生产/加成链路消费`);
  }
});

test('研究升级：新增 rift/delve/faith 键定向正确', () => {
  assert.equal(BALANCE.researchUpgs.find(u => u.id === 'rp_void').fx.key, 'rift');
  assert.equal(BALANCE.researchUpgs.find(u => u.id === 'rp_observe').fx.key, 'delve');
  assert.equal(BALANCE.researchUpgs.find(u => u.id === 'rp_disciple').fx.key, 'faith');
});

// ============ ② researchMult 公式正确性 ============
test('researchMult：faith 键（信徒训导）线性生效（此前为死升级，v3.4.2 接入 religions.js）', () => {
  S.rpTheories = {};
  assert.equal(researchMult('faith'), 1, '未购应为 1');
  S.rpTheories.rp_disciple = 1;
  assert.ok(Math.abs(researchMult('faith') - 1.12) < 1e-9, 'Lv.1 应为 1.12');
  S.rpTheories.rp_disciple = 5;
  assert.ok(Math.abs(researchMult('faith') - (1 + 0.12 * 5)) < 1e-9, 'Lv.5 应为 1.6');
});

test('researchMult：ep 线性 + global 复利', () => {
  S.rpTheories = {};
  S.rpTheories.rp_quantum = 1; // v=0.06
  assert.ok(Math.abs(researchMult('ep') - 1.06) < 1e-9);
  S.rpTheories = {};
  S.rpTheories.rp_harmony = 2; // v=0.05，global 复利
  assert.ok(Math.abs(researchMult('global') - Math.pow(1.05, 2)) < 1e-9);
});

// ============ ③ 裂隙凝视深渊升级购买链路 ============
test('裂隙凝视升级：购买置位 abyssGazeUnlocked、扣 20 余烬、达 cap 后拦截', () => {
  S.riftEmber = 100; S.riftUpgrades = {}; S.abyssGazeUnlocked = false;
  assert.equal(riftUpgradeCost('gaze'), 20, '凝视升级成本应为 20（取全局 upgBase）');
  const r = buyRiftUpgrade('gaze');
  assert.equal(r.ok, true, `购买应成功，实际 ${JSON.stringify(r)}`);
  assert.equal(S.abyssGazeUnlocked, true, '应置位 abyssGazeUnlocked');
  assert.equal(S.riftEmber, 80, '应扣 20 余烬');
  assert.equal(S.riftUpgrades.gaze, 1, 'riftUpgrades.gaze 应为 1');
  const r2 = buyRiftUpgrade('gaze');
  assert.equal(r2.ok, false, 'cap=1 满级后应拦截');
});

test('裂隙凝视升级：余烬不足时拦截且不改变状态', () => {
  S.riftEmber = 5; S.riftUpgrades = {}; S.abyssGazeUnlocked = false;
  const r = buyRiftUpgrade('gaze');
  assert.equal(r.ok, false, '余烬不足应失败');
  assert.equal(S.abyssGazeUnlocked, false, '不应置位');
  assert.equal(S.riftUpgrades.gaze || 0, 0, '不应写入升级');
});

// ============ ④ abyssGaze 视觉层 ============
test('abyssGaze：无 document 环境下守卫早返回（不抛错）', () => {
  const saved = global.document; delete global.document; delete global.requestAnimationFrame;
  assert.doesNotThrow(() => { abyssGaze.showAbyssGaze(); abyssGaze.ensureAbyssGaze(true); abyssGaze.ensureAbyssGaze(false); });
  global.document = saved; global.requestAnimationFrame = (fn) => fn();
});

test('abyssGaze：注入轻量 DOM 后生成 #abyss-gaze-crack 并淡入', () => {
  registry = {};
  abyssGaze.showAbyssGaze();
  const el = registry['abyss-gaze-crack'];
  assert.ok(el, '应创建 #abyss-gaze-crack 覆盖层');
  assert.equal(el.style.opacity, '1', '应触发淡入（opacity=1）');
  assert.ok(el.innerHTML.includes('abyss-gaze-svg'), '应包含裂隙 SVG');
  abyssGaze.hideAbyssGaze();
  assert.equal(el.style.opacity, '0', 'hide 应置 opacity=0');
});

test('abyssGaze：ensureAbyssGaze(true) 重载后裂开常驻', () => {
  registry = {};
  abyssGaze.ensureAbyssGaze(true);
  assert.ok(registry['abyss-gaze-crack'], '已解锁时应常驻生成');
  registry = {};
  abyssGaze.ensureAbyssGaze(false);
  assert.equal(registry['abyss-gaze-crack'], undefined, '未解锁时不应生成');
});

// ============ ⑤ 统一成就表完整性 ============
test('成就表 ACHIEVEMENTS：id 唯一、abyss_gaze_egg 含 test、手动项无 test', () => {
  // v3.10.0：表已下沉到 src/data/achievements.js，不再从 main.js 源码 eval 切片
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, '成就 id 必须唯一');
  const egg = ACHIEVEMENTS.find(a => a.id === 'abyss_gaze_egg');
  assert.ok(egg, '应存在 abyss_gaze_egg（凝视深渊）');
  assert.equal(typeof egg.test, 'function', 'abyss_gaze_egg 应由注册表自动判定');
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && a.name && a.icon && a.desc, '成就字段不全: ' + a.id);
    const manual = (a.id === 'demon_friend' || a.id === 'gaze_abyss');
    if (manual) assert.notEqual(typeof a.test, 'function', '手动点亮项不应含 test: ' + a.id);
  }
});
