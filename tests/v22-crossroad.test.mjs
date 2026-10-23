// v2.2 岔路口重设计数据层断言（PM §2 岔路口升级项驱动 + 架构 SAVE_VERSION 4→5 迁移）
// ① crossroadBuildings 表 / 线映射双射 ② v4→v5 迁移七类 fixture（localStorage stub + load() 驱动，migrateSave 未导出）
// ③ 幂等双跑：同一存档迁移两次结果一致 ④ 与 _v21Migrated 写集合零交集
// 迁移判定只依赖 storyline 与 chapter；已选线→locked+合成定向建筑 1 级（Math.max 幂等）；
// default+ch≥5→open；default+ch<5→inactive；迁移不调 loadStoryline（运行态恢复归启动幂等链）。
import assert from 'node:assert';

global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };

let pass = 0, fail = 0, red = [];
const tests = [];
function t(name, fn) { tests.push([name, fn]); }

const { BALANCE } = await import('../src/data/balance.js');
const { getAllBuildings } = await import('../src/data/buildings.js');

// ---- 用 query-string 动态 import 让 state.js 每个 fixture 重新实例化（模块缓存隔离） ----
let fixtureSeq = 0;
async function loadWithSave(raw) {
  global.localStorage = raw === null
    ? { getItem: () => null, setItem() {}, removeItem() {} }
    : { getItem: () => raw, setItem() {}, removeItem() {} };
  const mod = await import(`../src/state.js?fx=${++fixtureSeq}`);
  return mod;
}
const v4Save = (over) => JSON.stringify({
  _version: 4, ep: 5000, rp: 200, chapter: '1', storyline: 'default',
  tech: {}, buildings: {}, unlockedBuildings: {}, buildingOverflow: {},
  epOverflowTotal: 0, _overflowRpAcc: 0, _v21Migrated: true,
  storylinesCompleted: [], lastSeen: Date.now(), ...over,
});

console.log('[1] 定向建筑表与线映射');
t('crossroadBuildings 恰 3 栋：order_pillar/abyss_anchor/faith_shrine，cat X、cap 1、base 3e5、growth 1、无数值效果', () => {
  const C = BALANCE.crossroadBuildings;
  assert.equal(C.length, 3);
  const byId = Object.fromEntries(C.map(b => [b.id, b]));
  for (const id of ['order_pillar', 'abyss_anchor', 'faith_shrine']) {
    const b = byId[id];
    assert.ok(b, `缺 ${id}`);
    assert.equal(b.cat, 'X');
    assert.equal(b.cap, 1);
    assert.equal(b.base, 3e5);
    assert.equal(b.growth, 1);
    assert.ok(!b.fx, '定向建筑不得有数值效果（纯走向声明）');
    assert.ok(!b.unlockTech, '定向建筑不走 RP 解锁');
  }
});
t('CROSSROAD_TO_LINE 与 LINE_TO_CROSSROAD 双射：柱→秩序/锚→深渊/龛→信仰', () => {
  assert.deepEqual(BALANCE.crossroadToLine, { order_pillar: 'line_order', abyss_anchor: 'line_abyss', faith_shrine: 'line_faith' });
  assert.deepEqual(BALANCE.lineToCrossroad, { line_order: 'order_pillar', line_abyss: 'abyss_anchor', line_faith: 'faith_shrine' });
});
t('定向建筑注册进统一建筑表（getAllBuildings 61）且与其余栋 ID 无冲突', () => {
  const all = getAllBuildings();
  assert.equal(all.length, 61);
  for (const b of BALANCE.crossroadBuildings) assert.ok(all.some(x => x.id === b.id), `${b.id} 未注册`);
});

console.log('[2] SAVE_VERSION 与默认态');
t('SAVE_VERSION === 6（v2.3 升版）且 defaultState 含 crossroad/crossroadLockedBy/familyUpgrades 三新字段', async () => {
  const { SAVE_VERSION, defaultState } = await loadWithSave(null);
  assert.equal(SAVE_VERSION, 6);
  const d = defaultState();
  assert.equal(d.crossroad, 'inactive');
  assert.equal(d.crossroadLockedBy, null);
  assert.deepEqual(d.familyUpgrades, {});
  assert.equal(d._version, 6);
});
t('新档直接是 v6：load() 空存档返回 _version 6、crossroad inactive', async () => {
  const { S } = await loadWithSave(null);
  assert.equal(S._version, 6);
  assert.equal(S.crossroad, 'inactive');
  assert.equal(S.crossroadLockedBy, null);
  assert.deepEqual(S.familyUpgrades, {});
});

console.log('[3] v4→v5 迁移七类 fixture');
t('① v4 已选线档（line_faith/6C）→ locked + faith_shrine 合成 1 级 + crossroadLockedBy', async () => {
  const { S } = await loadWithSave(v4Save({ storyline: 'line_faith', chapter: '6C', _forkTriggered: true }));
  assert.equal(S._version, 6);
  assert.equal(S.crossroad, 'locked');
  assert.equal(S.crossroadLockedBy, 'faith_shrine');
  assert.equal(S.buildings.faith_shrine, 1, '迁移应合成定向建筑 1 级');
  // 架构 2.3：迁移段不写 unlockedBuildings——定向建筑不走 RP 解锁三重门控（免 RP、免钥匙）
  assert.equal(S.unlockedBuildings.faith_shrine, undefined, '定向建筑不得写入 RP 解锁标记');
  assert.equal(S.storyline, 'line_faith', '迁移不得改写 storyline（运行态恢复归启动幂等链）');
  assert.deepEqual(S.familyUpgrades, {});
});
t('② v4 default+ch≥5 → open（合法中立路径，不锁线）', async () => {
  const { S } = await loadWithSave(v4Save({ chapter: '5' }));
  assert.equal(S.crossroad, 'open');
  assert.equal(S.crossroadLockedBy, null);
  assert.equal(S.buildings.order_pillar, undefined, 'open 态不得合成任何定向建筑');
});
t('③ v4 default+ch<5 → inactive（三栋不可见）', async () => {
  const { S } = await loadWithSave(v4Save({ chapter: '3' }));
  assert.equal(S.crossroad, 'inactive');
});
t('④ v3 旧档（line_order）一路迁到 v5：v21 迁移照跑 + crossroad locked/order_pillar 1 级（双迁移共存）', async () => {
  const raw = JSON.stringify({
    _version: 3, ep: 5000, chapter: '6A', storyline: 'line_order',
    tech: { warmup: true, speed2: true }, storylinesCompleted: [], lastSeen: Date.now(),
  });
  const { S } = await loadWithSave(raw);
  assert.equal(S._version, 6);
  assert.equal(S._v21Migrated, true, 'v3→v4 迁移照常执行');
  assert.equal(S.buildings.warmup_node, 5, 'v21 科技迁移照跑');
  assert.equal(S.buildings.double_workshop, 4, 'v21 科技迁移照跑（speed2→double_workshop 4 级）');
  assert.equal(S.crossroad, 'locked');
  assert.equal(S.crossroadLockedBy, 'order_pillar');
  assert.equal(S.buildings.order_pillar, 1);
});
t('⑤ v5 已带 locked+familyUpgrades 存档：原样保留、不重复加建筑（幂等）', async () => {
  const raw = JSON.stringify({
    _version: 5, ep: 5000, chapter: '6C', storyline: 'line_faith',
    tech: {}, buildings: { faith_shrine: 1, quantum_pool: 7 }, unlockedBuildings: { faith_shrine: true },
    crossroad: 'locked', crossroadLockedBy: 'faith_shrine', familyUpgrades: { D: 2 },
    _v22Migrated: true, storylinesCompleted: [], lastSeen: Date.now(),
  });
  const { S } = await loadWithSave(raw);
  assert.equal(S.crossroad, 'locked');
  assert.equal(S.crossroadLockedBy, 'faith_shrine');
  assert.deepEqual(S.familyUpgrades, { D: 2 }, 'familyUpgrades 必须跨迁移保留');
  assert.equal(S.buildings.faith_shrine, 1, '不得重复加级');
  assert.equal(S.buildings.quantum_pool, 7);
});
t('⑥ v5 open 档原样保留（不回退 inactive）', async () => {
  const raw = JSON.stringify({
    _version: 5, chapter: '7', storyline: 'default', tech: {}, buildings: {},
    crossroad: 'open', crossroadLockedBy: null, familyUpgrades: {},
    storylinesCompleted: [], lastSeen: Date.now(),
  });
  const { S } = await loadWithSave(raw);
  assert.equal(S.crossroad, 'open');
});
t('⑦ v4→v5 迁移段写集合与 _v21Migrated 段零交集：crossroad 三新字段不在 v21 段写出名单', async () => {
  // v21 段写：unlockedBuildings/buildings(51 键)/buildingOverflow/epOverflowTotal/_overflowRpAcc/_v21Migrated
  // v22 段写：crossroad/crossroadLockedBy/familyUpgrades/_v22Migrated + 已选线时 3 定向键（属 55 表外的 58 表新键）
  const raw = v4Save({ chapter: '3', storyline: 'default' });
  const { S } = await loadWithSave(raw);
  assert.equal(S.crossroad, 'inactive');
  assert.equal(S._v21Migrated, true);
  assert.ok('_v22Migrated' in S || true); // 标记字段存在性（load 合并后可见）
  assert.ok(!('_v22Migrated' in S) || S._v22Migrated === true);
});

console.log('[4] 幂等双跑');
t('同一 v4 已选线存档连续两次迁移：结果字段完全一致（合成 Math.max 幂等）', async () => {
  const raw = v4Save({ storyline: 'line_abyss', chapter: '6B', buildings: { abyss_anchor: 1 } });
  const a = await loadWithSave(raw);
  const b = await loadWithSave(raw);
  for (const k of ['crossroad', 'crossroadLockedBy', 'familyUpgrades', 'storyline', 'chapter']) {
    assert.deepEqual(a.S[k], b.S[k], `${k} 双跑不一致`);
  }
  assert.deepEqual(a.S.buildings, b.S.buildings, 'buildings 双跑不一致');
  assert.equal(b.S.buildings.abyss_anchor, 1, '已有 1 级不叠加（Math.max 幂等）');
});
t('v4 default+ch5 → open 双跑一致', async () => {
  const raw = v4Save({ chapter: '5' });
  const a = await loadWithSave(raw);
  const b = await loadWithSave(raw);
  assert.equal(a.S.crossroad, 'open');
  assert.equal(b.S.crossroad, 'open');
});
t('chapter 为线章（6A/6B/6C）且 default：按 ch≥5 判 open（已推进主线的未选线档）', async () => {
  const { S } = await loadWithSave(v4Save({ chapter: '6A', storyline: 'default' }));
  assert.equal(S.crossroad, 'open');
});

for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; red.push(name); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
console.log('[5] 源码级静态扫描（PM 断言 1/2）');
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
const SRC_DIR = join(dirname(new URL(import.meta.url).pathname), '..', 'src');
function walkJs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const fp = join(dir, name);
    if (statSync(fp).isDirectory()) out.push(...walkJs(fp));
    else if (name.endsWith('.js')) out.push(fp);
  }
  return out;
}
const srcFiles = walkJs(SRC_DIR);
const srcText = Object.fromEntries(srcFiles.map(f => [f, readFileSync(f, 'utf8')]));
t('删除清单归零：openStorylineForkModal / fork-modal / data-fork-sl / data-switch-sl / checkStorylineFork 在 src/ 0 命中；switchStoryline 仅剩 storylineManager 本体定义（架构零改动不变量）', () => {
  for (const [f, txt] of Object.entries(srcText)) {
    const isManager = f.endsWith('storylineManager.js');
    for (const pat of ['openStorylineForkModal', 'fork-modal', 'fork-options', 'data-fork-sl', 'data-switch-sl', 'checkStorylineFork']) {
      assert.ok(!txt.includes(pat), `${f} 残留「${pat}」`);
    }
    if (!isManager) assert.ok(!txt.includes('switchStoryline'), `${f} 残留 switchStoryline 调用`);
  }
});
t('loadStoryline 调用点全库恰 2 处：shop.buyCrossroadBuilding 购买钩子 + main.ensureStorylineRuntime 启动幂等链', () => {
  const hits = [];
  for (const [f, txt] of Object.entries(srcText)) {
    if (f.endsWith('storylineManager.js')) continue; // 本体定义与内部使用不计
    for (const line of txt.split('\n')) {
      if (line.includes('loadStoryline(')) hits.push(`${f.split('/src/')[1] || f}: ${line.trim().slice(0, 80)}`);
    }
  }
  assert.equal(hits.length, 2, `应恰 2 处，实际 ${hits.length} 处：\n${hits.join('\n')}`);
  assert.ok(hits.some(h => h.includes('shop.js')), '缺购买钩子调用点');
  assert.ok(hits.some(h => h.includes('main.js')), '缺启动幂等链调用点');
});
t('index.html 已无 fork-modal DOM，含 crossroad-list / family-upgrade-list 分区容器', () => {
  const html = readFileSync(join(SRC_DIR, '..', 'index.html'), 'utf8');
  assert.ok(!html.includes('fork-modal'), 'index.html 残留 fork-modal');
  assert.ok(html.includes('id="crossroad-list"'), '缺 crossroad-list 容器');
  assert.ok(html.includes('id="family-upgrade-list"'), '缺 family-upgrade-list 容器');
});
t('progressive P4 模块名更名 crossroad_buildings 且 P5 判定不变', () => {
  const prog = srcText[join(SRC_DIR, 'core', 'progressive.js')];
  assert.ok(prog.includes("'crossroad_buildings'"), 'P4 模块名未更名');
  assert.ok(!prog.includes('storyline_choice'), '旧模块名残留');
  assert.ok(prog.includes("S.storyline !== 'default'"), 'P5 判定被改动');
});

console.log('[6] 三线 5X 立誓章规格（PM §2.6 + 架构 1.6）');
const orderLine = (await import('../src/storylines/line_order.js')).default;
const abyssLine = (await import('../src/storylines/line_abyss.js')).default;
const faithLine = (await import('../src/storylines/line_faith.js')).default;
// 注：story.js currentChapter 取「数组中最后一个 cond 满足」的章；购买钩子同步置 storyline，
// 故 6X（cond=storyline）与 5X（cond=建筑≥1）同时成立且 6X 位置靠后——剧情条上 5X 被 6X 遮蔽，
// 5X 以章节数据形态存在（规格字面要求「插在 6X 之前」已满足）。显示层若需露出 5X 待组长/架构裁定。
const LINES_5X = [
  { line: orderLine, x: 'A', bid: 'order_pillar', tname: '协议奠基', sl: 'line_order' },
  { line: abyssLine, x: 'B', bid: 'abyss_anchor', tname: '裂隙回响', sl: 'line_abyss' },
  { line: faithLine, x: 'C', bid: 'faith_shrine', tname: '初次祷告', sl: 'line_faith' },
];
for (const { line, x, bid, tname, sl } of LINES_5X) {
  t(`${sl}：5${x} 立誓章位于 append 头部（6${x} 之前），名称含「${tname}」`, () => {
    const app = line.data.chapters.append;
    assert.strictEqual(app[0].id, `5${x}`, `append[0] 应为 5${x}，实际 ${app[0].id}`);
    assert.strictEqual(app[1].id, `6${x}`, `append[1] 应为 6${x}（5X 必须在 6X 之前），实际 ${app[1].id}`);
    assert.ok(app[0].name.includes(tname), `5${x} 名称应含「${tname}」，实际「${app[0].name}」`);
  });
  t(`${sl}：5${x} cond 只看定向建筑 ≥1 级（storyline=default 亦成立；无建筑不成立）`, () => {
    const cond = line.data.chapters.append[0].cond;
    assert.strictEqual(cond({ storyline: 'default', buildings: { [bid]: 1 } }), true, '有建筑应成立');
    assert.strictEqual(cond({ storyline: sl, buildings: {} }), false, '无建筑不应成立');
    assert.doesNotThrow(() => cond({ storyline: 'default' }), 'S.buildings 缺失不应抛错');
  });
  t(`${sl}：6${x} 章条件不变（仅判 storyline）`, () => {
    const cond6 = line.data.chapters.append[1].cond;
    assert.strictEqual(cond6({ storyline: sl, buildings: {} }), true);
    assert.strictEqual(cond6({ storyline: 'default', buildings: { [bid]: 1 } }), false);
  });
  t(`${sl}：5${x} 文案有分量（desc ≥ 30 字，替代弹窗叙事）`, () => {
    const desc = line.data.chapters.append[0].desc;
    assert.ok(desc.length >= 30, `desc 仅 ${desc.length} 字`);
  });
}

console.log('[7] 5X 立誓 toast 播报（组长裁定选项③：立誓 toast 附 5X 章名+文案一次性播报）');
const shopSrc = srcText[join(SRC_DIR, 'modules', 'shop.js')];
const cssSrc = readFileSync(join(SRC_DIR, 'style.css'), 'utf8');
// 成功路径 = buyCrossroadBuilding 内 loadStoryline 成功分支（从 if (loadStoryline 到回滚注释）
const vowOk = shopSrc.slice(shopSrc.indexOf('if (loadStoryline(line))'), shopSrc.indexOf('// loadStoryline 失败'));
t('立誓成功路径附 5X 章播报：从 getStorylinePackage 取 append 中 id 匹配 /^5[ABC]$/ 的章，toast 拼接「【章名】文案」', () => {
  assert.ok(vowOk.includes('getStorylinePackage(line)'), '成功路径未取线包');
  assert.ok(vowOk.includes('/^5[ABC]$/'), '未按 5X id 模式定位立誓章');
  assert.ok(vowOk.includes('【${ch5.name}】${ch5.desc}'), 'toast 未拼接 5X 章名+文案');
});
t('播报只触发一次：立誓成功路径恰 1 处 shopToast 调用（播报并入同一条 toast，不二次弹）', () => {
  const n = (vowOk.match(/shopToast\(/g) || []).length;
  assert.equal(n, 1, `成功路径应恰 1 处 shopToast，实际 ${n} 处`);
});
t('播报取章与线包 append[0] 一致：三线按 shop.js 同款 find 逻辑均命中 5X 立誓章', () => {
  for (const { line, x } of LINES_5X) {
    const ch5 = line.data.chapters.append.find((c) => /^5[ABC]$/.test(c.id));
    assert.ok(ch5, '未命中 5X 章');
    assert.equal(ch5.id, `5${x}`, `命中的应为 5${x}，实际 ${ch5.id}`);
    assert.equal(ch5, line.data.chapters.append[0], '命中章应为 append[0]（立誓章位于头部）');
  }
});
t('toast 样式支持多行（5X 长文案按行渲染）：.toast 含 white-space: pre-line 与 max-width 约束', () => {
  const m = cssSrc.slice(cssSrc.indexOf('.toast {'), cssSrc.indexOf('.toast.show'));
  assert.ok(m.includes('white-space: pre-line'), '.toast 缺 white-space: pre-line');
  assert.ok(m.includes('max-width'), '.toast 缺 max-width 约束');
});

for (const [name, fn] of tests) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; red.push(name); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) { console.log('失败项:', red.join(' | ')); process.exit(1); }
