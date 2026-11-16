// v4.0.2 内容审计（挂起项 #189–#193：数值 / wiki / 文案 / 分类 / 故事线 是否符合游戏核心）
//
// 与既有 v370(内容完整性) / v380(扩充完整性) / v400(章节可达性) 不重复：
//   - v400 已锁死「faith 默认容量 vs 章节阈值」这一最致命不变量（v3.12.10 终章不可达真 BUG）；
//   - 本文件补其余四维的纵深审计，并新增「cond/test 引用的状态键真实存在」这一无死数据红线校验。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 与 v370/v380 同源的 DOM 桩，使纯 Node 可 import 数据/模块层
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { BALANCE, FP_BALANCE } = await import('../src/data/balance.js');
const { CHAPTERS } = await import('../src/data/chapters.js');
const { ACHIEVEMENTS } = await import('../src/data/achievements.js');
const { WIKI_SECTIONS, WIKI_GROUPS } = await import('../src/data/wiki.js');
const { POLICY_GROUPS } = await import('../src/data/policies.js');
const { RP_GROUPS } = await import('../src/modules/shop.js');
const orderPkg = (await import('../src/storylines/line_order.js')).default;
const abyssPkg = (await import('../src/storylines/line_abyss.js')).default;
const faithPkg = (await import('../src/storylines/line_faith.js')).default;
const LINE_PKGS = [orderPkg, abyssPkg, faithPkg];

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const WIKI_SRC = readFileSync(join(SRC_ROOT, 'data', 'wiki.js'), 'utf8');

// S 顶层键 + 已知动态字段白名单（防止把合法但默认未声明的字段误报为「不存在的键」）
const STATE_KEYS = new Set([
  ...Object.keys(S),
  'cultists', 'policies', 'projects', 'pets', 'activePets', 'colonies',
  'cosmos', 'orchestration', 'resonance', 'religion', 'bazaar', 'ai', 'delve',
  'upgrades', 'buildings', 'tech', 'unlockedBuildings', 'prestigePoints',
  'reincarned', 'allTimeEp', 'totalClicks', 'gotOffline', 'abyssGazeUnlocked',
  'storyline', '_easterEggsFound', 'wishCoins', 'wishWon', 'collapsed',
  'starCps', 'faith', 'dm', 'es', 'prestige', 'riftsSealed', 'expeditionsDone',
  'riftEmber', 'projectsDone',
]);

// 从 cond/test 源码抽取所有 `s.<id>` / `s['id']` / `s["id"]` 访问的状态键
function stateKeysIn(src) {
  const out = new Set();
  const re = /(?:\bs\.|\bs\[\s*['"])([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return [...out];
}

console.log('[① 数值] 数据完整性与状态键真实存在');

test('N1 BALANCE 全树无 NaN（Infinity 容量合法），已知数值数组有限且为正', () => {
  let nanHit = [];
  const walk = (v, path) => {
    if (typeof v === 'number') { if (Number.isNaN(v)) nanHit.push(path); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(BALANCE, 'BALANCE');
  assert.equal(nanHit.length, 0, `BALANCE 存在 NaN：${nanHit.slice(0, 5).join(', ')}`);
  // 已知数值数组：严格有限且为正（researchUpgs / miles / vehicles / rift / delve / bazaar / ai）
  for (const u of BALANCE.researchUpgs) {
    assert.ok(Number.isFinite(u.base) && u.base > 0, `${u.id} base 非法`);
    assert.ok(Number.isFinite(u.growth) && u.growth > 1, `${u.id} growth 非法`);
    assert.ok(Number.isFinite(u.cap) && u.cap > 0, `${u.id} cap 非法`);
  }
  for (const m of BALANCE.miles) assert.ok(Number.isFinite(m.cps) && m.cps > 0, `里程碑 cps 非法`);
  assert.ok(Number.isFinite(BALANCE.vehicles.epPerDm) && BALANCE.vehicles.epPerDm > 0);
  assert.ok(Number.isFinite(BALANCE.ai.assistants.baseCost) && BALANCE.ai.assistants.baseCost > 0);
  assert.ok(Number.isFinite(FP_BALANCE.capBase) && FP_BALANCE.capBase > 0, '信仰基础容量非法');
});

test('N2 章节/成就的条件只引用真实存在的状态键（无死数据/拼写错位）', () => {
  const offenders = [];
  for (const ch of CHAPTERS) {
    if (typeof ch.cond !== 'function') { offenders.push(`章节${ch.id} 无 cond`); continue; }
    for (const k of stateKeysIn(ch.cond.toString())) if (!STATE_KEYS.has(k)) offenders.push(`章节${ch.id}.cond 引用未知键 s.${k}`);
  }
  for (const a of ACHIEVEMENTS) {
    if (typeof a.test !== 'function') continue; // 部分成就仅由事件手动点亮（如 demon_friend）
    for (const k of stateKeysIn(a.test.toString())) if (!STATE_KEYS.has(k)) offenders.push(`成就${a.id}.test 引用未知键 s.${k}`);
  }
  assert.equal(offenders.length, 0, `发现引用了不存在的状态键：\n${offenders.join('\n')}`);
});

console.log('[② wiki] 渲染无非法值 / 解锁章节号合法 / 组数声明一致');

test('W1 每个百科章节 body() 可渲染且不含 undefined/NaN/Infinity', () => {
  for (const sec of WIKI_SECTIONS) {
    assert.equal(typeof sec.body, 'function', `${sec.id} 缺 body`);
    const html = sec.body();
    assert.ok(typeof html === 'string' && html.length > 30, `${sec.id} 渲染过短`);
    assert.ok(!/undefined|NaN|Infinity/.test(html), `${sec.id} 渲染出非法数值：${html.slice(0, 80)}`);
  }
});

test('W2 wiki 解锁表中所有「第 N 章」引用均为真实章节号（1..51），无过期章节', () => {
  const bad = [];
  const re = /第\s*(\d+)\s*章/g;
  let m;
  while ((m = re.exec(WIKI_SRC))) {
    const n = parseInt(m[1], 10);
    if (!(n >= 1 && n <= 51)) bad.push(m[0]);
  }
  assert.equal(bad.length, 0, `wiki 引用了不存在的章节号：${bad.join(', ')}`);
});

test('W3 wiki「六组研究 / 13 组政策」声明与真实分组数一致', () => {
  assert.equal(RP_GROUPS.length, 6, 'wiki 声称研究分六组，实际 RP_GROUPS 数量不符');
  assert.equal(POLICY_GROUPS.length, 13, 'wiki 提及政策组数，实际 POLICY_GROUPS 数量不符');
  assert.ok(WIKI_SRC.includes('分六组') || WIKI_SRC.includes('六组'), 'wiki 研究分组描述未体现「六组」');
});

console.log('[③ 文案] 成就 / 章节 / 百科 完整性');

test('C1 全部成就：id 唯一、名称/描述/图标非空、无占位符、test 为函数或省略', () => {
  const ids = new Set();
  const PLACE = /TODO|FIXME|XXX|占位|待补|placeholder/i;
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id && typeof a.id === 'string', '成就缺 id');
    assert.ok(!ids.has(a.id), `成就 id 重复：${a.id}`);
    ids.add(a.id);
    assert.ok(a.name && a.name.trim().length > 0, `${a.id} 缺名称`);
    assert.ok(a.desc && a.desc.trim().length > 0, `${a.id} 缺描述`);
    assert.ok(a.icon && a.icon.trim().length > 0, `${a.id} 缺图标`);
    assert.ok(!PLACE.test(a.name + a.desc), `${a.id} 含占位符`);
    assert.ok(a.test === undefined || typeof a.test === 'function', `${a.id} test 非法`);
  }
});

test('C2 全部章节：id 唯一、名称/描述非空', () => {
  const ids = new Set();
  for (const ch of CHAPTERS) {
    assert.ok(!ids.has(String(ch.id)), `章节 id 重复：${ch.id}`);
    ids.add(String(ch.id));
    assert.ok(ch.name && ch.name.trim().length > 0, `第 ${ch.id} 章缺名称`);
    assert.ok(ch.desc && ch.desc.trim().length > 0, `第 ${ch.id} 章缺描述`);
  }
});

test('C3 全部百科章节：id 唯一、名称非空', () => {
  const ids = new Set();
  for (const sec of WIKI_SECTIONS) {
    assert.ok(!ids.has(sec.id), `百科 id 重复：${sec.id}`);
    ids.add(sec.id);
    assert.ok(sec.name && sec.name.trim().length > 0, `${sec.id} 缺标题`);
  }
});

console.log('[④ 分类] 研究/政策分组互斥无幽灵 / 百科分组可解析');

test('K1 研究项恰好归属一个 RP 分组，无幽灵 id，覆盖全部', () => {
  const defined = BALANCE.researchUpgs.map(u => u.id);
  const seen = new Set();
  const grouped = [];
  for (const g of RP_GROUPS) for (const id of g.ids) {
    grouped.push(id);
    assert.ok(!seen.has(id), `研究项 ${id} 被多个分组重复引用`);
    seen.add(id);
  }
  for (const id of defined) assert.ok(seen.has(id), `研究项 ${id} 未进任何分组 → 面板不可见/买不到`);
  for (const id of grouped) assert.ok(defined.includes(id), `分组引用了幽灵研究 id ${id}`);
  assert.equal(grouped.length, defined.length, '分组数与研究项数不一致');
});

test('K2 政策项 13 组 / 39 项，id 唯一、无幽灵、effect 键有消费点', () => {
  let allSrc = '';
  const w = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) w(p); else if (e.name.endsWith('.js')) allSrc += readFileSync(p, 'utf8') + '\n'; } };
  w(SRC_ROOT);
  const consumed = new Set([...allSrc.matchAll(/policyMult\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)].map(m => m[1]));
  const ids = [];
  for (const g of POLICY_GROUPS) {
    assert.ok(g.name && typeof g.unlock === 'function' && g.hint, `政策组 ${g.id} 结构不完整`);
    for (const p of g.policies) {
      ids.push(p.id);
      assert.ok(p.desc, `${p.id} 缺描述`);
      for (const k of Object.keys(p.effect)) assert.ok(consumed.has(k), `${p.id} 的 effect.${k} 无消费点（死政策）`);
    }
  }
  assert.equal(new Set(ids).size, ids.length, '政策 id 重复');
  assert.equal(POLICY_GROUPS.length, 13);
  assert.equal(ids.length, 39);
});

test('K3 百科分组（WIKI_GROUPS.ids）全部可解析到真实章节，且每个章节至多归属一组', () => {
  const byId = new Set(WIKI_SECTIONS.map(s => s.id));
  const owner = new Map();
  for (const g of WIKI_GROUPS) for (const id of g.ids) {
    assert.ok(byId.has(id), `分组 ${g.key} 引用了不存在的百科章节 ${id}`);
    assert.ok(!owner.has(id), `百科章节 ${id} 被多个分组重复引用`);
    owner.set(id, g.key);
  }
});

console.log('[⑤ 故事线] 章节链连续唯一 / cond 在空·富状态可安全求值');

test('S1 主线章节 id 连续 1..51 且唯一', () => {
  assert.equal(CHAPTERS.length, 51, '主线章节数应为 51');
  assert.deepEqual(CHAPTERS.map(c => c.id), Array.from({ length: 51 }, (_, i) => i + 1),
    '章节 id 必须连续无缺号');
});

test('S2 每个章节 cond 在「空状态」与「富状态」下都能安全求值并返回布尔', () => {
  const empty = {};
  const rich = {
    chapter: '1', chapterEnteredAt: Date.now() - 1e9,
    prestige: 999, prestigePoints: 999, es: 1e9, faith: 1e6, expeditionsDone: 999,
    riftsSealed: 999, dm: 1e9, projectsDone: 999, allTimeEp: 1e21, runEarned: 1e21,
    riftEmber: 1e9, tech: { true_end: true }, buildings: { end_shrine: 1 },
    upgrades: { dmmind: 1, abyss_fishbowl: 1 }, religion: { temple: 9, branch: 'sun', oracle: 9, seal: 9 },
    resonance: { layers: 24, focus: 'rp' }, unlockedBuildings: { b: 1 },
    policies: { route: { id: 'order_route', lv: 1 } }, colonies: { a: true },
    cosmos: { lv: { asteroid: 1 } }, cultists: [1, 2, 3], bazaar: { trades: 999 },
    ai: { assistants: 9, autoBuildUnlocked: true }, delve: { depth: 999, up: { resonance: 3 } },
    policyRuns: [{}, {}], starCps: 1e6, totalClicks: 99, gotOffline: true,
    abyssGazeUnlocked: true, storyline: 'line_abyss', _easterEggsFound: { idle_start: true },
    wishCoins: 9, wishWon: true, collapsed: false, reincarned: 9,
  };
  const ctxStub = { totalOwned: () => 0, techCount: () => 0, petCount: () => 0, chapterProgress: () => 0 };
  for (const ch of CHAPTERS) {
    assert.equal(typeof ch.cond, 'function', `第 ${ch.id} 章缺 cond`);
    assert.doesNotThrow(() => ch.cond(empty), `第 ${ch.id} 章在空状态下抛错`);
    assert.doesNotThrow(() => ch.cond(rich), `第 ${ch.id} 章在富状态下抛错`);
    assert.equal(typeof ch.cond(rich), 'boolean', `第 ${ch.id} 章 cond 未返回布尔`);
  }
  // 成就 test 同样在空/富状态安全求值（手动成就无 test，跳过）。
  // 注：成就惯用法大量使用 `s.x >= N` 返回数字，故允许 boolean | number（皆可安全转布尔）；
  // 章节 cond 应统一返回布尔（已修复第 21 章原始值返回）。
  for (const a of ACHIEVEMENTS) {
    if (typeof a.test !== 'function') continue;
    assert.doesNotThrow(() => a.test(empty, ctxStub), `成就 ${a.id} 在空状态下抛错`);
    const t = typeof a.test(rich, ctxStub);
    assert.ok(t === 'boolean' || t === 'number', `成就 ${a.id} test 返回非布尔/数字（${t}）`);
  }
});

test('S3 三线变体章节 id 为字符串、组间唯一、不与主线数字 id 冲突', () => {
  const mainIds = new Set(CHAPTERS.map(c => String(c.id)));
  const seen = new Set();
  for (const pkg of LINE_PKGS) {
    for (const c of pkg.data.chapters.append) {
      assert.ok(typeof c.id === 'string', `${pkg.id} 变体章节 ${c.id} 应为字符串 id`);
      assert.ok(!mainIds.has(String(c.id)), `${pkg.id} 变体章节 ${c.id} 与主线数字 id 冲突`);
      assert.ok(!seen.has(c.id), `变体章节 id 重复：${c.id}`);
      seen.add(c.id);
      assert.ok(c.name && c.desc, `${pkg.id} 变体章节 ${c.id} 缺文案`);
      assert.equal(typeof c.cond, 'function', `${pkg.id} 变体章节 ${c.id} 缺 cond`);
    }
  }
});

test('S4 终章(18)条件在「已建终焉圣殿」下真实成立，且 16/17 章信仰阈值 ≤ 默认容量', () => {
  const ch18 = CHAPTERS.find(c => c.id === 18);
  assert.ok(ch18.cond({ buildings: { end_shrine: 1 } }), '终章条件在 end_shrine>=1 下应成立');
  const baseCap = FP_BALANCE.capBase;
  for (const id of [16, 17]) {
    const ch = CHAPTERS.find(c => c.id === id);
    assert.equal(ch.cond({ faith: baseCap }), true, `第 ${id} 章在默认信仰容量 ${baseCap} 下必须可达`);
  }
});
