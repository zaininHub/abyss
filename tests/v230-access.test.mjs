// v2.3.0：购买访问层（RBAC 式）的约定测试。
//
// 这组测试守护的是「抽象本身」，不是某次数值调整：
//   A. 表完整性 —— ACCESS 与 CHAPTER_GATES 之间的引用不能悬空，规则原子形状必须成立；
//   B. fail-closed —— 未注册的动作 / 未注册的章节门禁一律拒绝（旧实现是恒放行）；
//   C. 单一执行点 —— 每个门禁动作在它的购买函数里确实调用了 accessCheck('<id>')；
//   D. 行为一致 —— 模块谓词（relicsUnlocked / cosmosUnlocked / delvePrereqOk …）与访问层同判；
//   E. 章号单一真源 —— 原因文案里的章号来自 CHAPTER_GATES，不再手写「第 6 章」。
// 改门禁、加购买动作时先看这里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ACCESS, rules, accessCheck, accessReason, accessOk, accessChapter } from '../src/core/access.js';
import { CHAPTER_GATES, GATE_IDS, gateOpen, gateChapter, gateChapterText } from '../src/core/chapterGates.js';
import { S } from '../src/state.js';
import { moduleVisible, moduleBuyState, moduleUnlockDef } from '../src/modules/moduleUnlocks.js';
import { relicsUnlocked } from '../src/data/relics.js';
import { relicsTabOpen } from '../src/core/unlocks.js';
import { cosmosUnlocked } from '../src/modules/cosmos.js';
import { delvePrereqOk, delvePrereqReason } from '../src/modules/delve.js';
import { starColoniesUnlocked, launchExpedition } from '../src/modules/expedition.js';
import { canUnlockReligion } from '../src/modules/religions.js';
import { resonanceUnlocked } from '../src/core/resonance.js';
import { policyOpenGroups } from '../src/data/policies.js';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------- A 表完整性 ----------
test('A1 章节门禁表：14 项、GateIds 与表键一一对应（v2.5.0 增镜像三件套、永恒矩阵 8→6）', () => {
  assert.equal(GATE_IDS.length, 14);
  assert.deepEqual([...GATE_IDS].sort(), Object.keys(CHAPTER_GATES).sort());
  for (const id of GATE_IDS) {
    const n = gateChapter(id);
    assert.equal(typeof n, 'number', `${id} 应有章号`);
    assert.ok(n >= 1 && n <= 18, `${id} 章号应在主线范围`);
    assert.match(gateChapterText(id), new RegExp(`第 ${n} 章`), `${id} 提示应含章号`);
  }
});

test('A2 访问策略表：chapter 引用不悬空、规则原子形状正确、id 唯一', () => {
  const ids = Object.keys(ACCESS);
  assert.equal(new Set(ids).size, ids.length, '策略 id 不应重复');
  for (const [id, p] of Object.entries(ACCESS)) {
    assert.equal(typeof p.label, 'string', `${id} 应有 label`);
    assert.ok(p.chapter === null || Object.hasOwn(CHAPTER_GATES, p.chapter), `${id} 引用了未注册的门禁「${p.chapter}」`);
    assert.ok(Array.isArray(p.requires), `${id}.requires 应为数组`);
    for (const r of p.requires) {
      assert.equal(typeof r.test, 'function', `${id} 的规则 ${r.id} 缺 test`);
      assert.equal(typeof r.why, 'function', `${id} 的规则 ${r.id} 缺 why`);
    }
  }
  // 用户反馈的那条必须登记（章节 + 晋升），否则集市又会退回「只看职级」。
  assert.ok(ACCESS['bazaar.unlock']);
  assert.equal(ACCESS['bazaar.unlock'].chapter, 'bazaar');
});

test('A3 规则原子：章节规则引用表、资源规则读 resDiscovered、is 规则读字段', () => {
  const ch = rules.chapter('relics');
  assert.equal(ch.test({ chapter: '1' }), true);
  assert.equal(ch.test({ chapter: '18' }), true);
  const res = rules.resource('dm');
  assert.equal(res.test({ resDiscovered: { dm: true } }), true);
  assert.equal(res.test({}), false);
  const is = rules.is('crossroad', 'open');
  assert.equal(is.test({ crossroad: 'open' }), true);
  assert.equal(is.test({ crossroad: 'inactive' }), false);
});

// ---------- B fail-closed ----------
test('B1 未注册的动作 fail-closed（旧实现是静默放行）', () => {
  const r = accessCheck('definitely.not.registered', { chapter: '18' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /未注册/);
  assert.equal(accessOk('definitely.not.registered', { chapter: '18' }), false);
});

test('B2 未注册的章节门禁 fail-closed，且不影响已注册项', () => {
  assert.equal(gateOpen('unknown_gate', { chapter: '18' }), false);
  assert.equal(gateOpen('relics', { chapter: '1' }), true);
  assert.equal(gateOpen('bazaar', { chapter: '6' }), false);
});

test('B3 ctx 覆盖：可临时抬高章节 / 追加规则，不污染全局表', () => {
  const before = Object.keys(ACCESS).length;
  const ok = accessCheck('shop.upgrade', { chapter: '9' }, { chapter: 9, requires: [rules.prestige(99, '测试锁')] });
  assert.equal(ok.ok, false);
  assert.match(ok.reason, /测试锁/);
  // 裸章号按「至少第 N 章」判定；门禁 id 按表判定
  assert.equal(accessCheck('shop.upgrade', { chapter: '8' }, { chapter: 9 }).ok, false);
  assert.equal(accessCheck('shop.upgrade', { chapter: '9' }, { chapter: 9 }).ok, true);
  assert.equal(accessChapter('relic.buy'), 1);
  assert.equal(accessChapter('bazaar.unlock'), 7);
  assert.equal(Object.keys(ACCESS).length, before, 'ACCESS 不应被 ctx 改动');
});

// ---------- C 单一执行点（每个门禁动作在购买函数里真的调用了 accessCheck） ----------
test('C1 购买函数首行调用 accessCheck：门禁动作已接线', () => {
  const wired = {
    'src/data/relics.js': ['relic.buy'],
    'src/modules/relics.js': ['relic.buy', 'purifier.buy'],
    'src/modules/tech.js': ['tech.buy', 'eternal.buy'],
    'src/modules/delve.js': ['delve.unlock', 'delve.upgrade'],
    'src/modules/cosmos.js': ['cosmos.buy'],
    'src/modules/expedition.js': ['expedition.launch', 'colony.claim'],
    'src/modules/bazaar.js': ['bazaar.trade'],
    // moduleUnlocks 用动态 id（`${key}.unlock`）覆盖未来模块，故单独断言
    'src/modules/moduleUnlocks.js': [],
    'src/modules/pets.js': ['pets.buy'],
    'src/modules/ai.js': ['assistant.buy'],
    'src/modules/echoShop.js': ['echo.buy'],
    'src/modules/rift.js': ['rift.tech', 'rift.upgrade'],
    'src/modules/shop.js': ['shop.offline', 'shop.crossroad', 'vehicle.buy', 'vehicle.advanced', 'dm.shop'],
    'src/modules/religions.js': ['religion.unlock'],
    'src/data/policies.js': ['policy.open'],
    'src/core/resonance.js': ['resonance.open'],
  };
  const mu = src('src/modules/moduleUnlocks.js');
  assert.ok(mu.includes('accessCheck(id, S)') && mu.includes('`${key}.unlock`'), 'moduleUnlocks 应经 accessCheck 动态查策略');
  for (const [file, ids] of Object.entries(wired)) {
    const body = src(file);
    for (const id of ids) {
      assert.ok(body.includes(`accessCheck('${id}'`), `${file} 未调用 accessCheck('${id}')`);
      assert.ok(ACCESS[id], `${id} 未在 ACCESS 注册`);
    }
  }
});

test('C2 无权限门禁的动作显式登记（不是漏登记）', () => {
  // 核心循环购买刻意不设权限：登记为显式决策，防止「忘了写」与「故意不写」无法区分。
  for (const id of ['shop.upgrade', 'shop.thread', 'shop.vehicle', 'shop.dm', 'shop.building', 'shop.v21', 'shop.v21building', 'shop.family']) {
    assert.ok(ACCESS[id], `${id} 应显式登记（无门禁）`);
    assert.deepEqual(ACCESS[id].requires, [], `${id} 不应有额外门禁`);
    assert.equal(ACCESS[id].chapter, null);
  }
});

// ---------- D 行为一致 ----------
test('D1 遗物：章节 ∧ DM 已发现 ∧ 裂隙已触发，三条件缺一不可', () => {
  const keep = { chapter: S.chapter, resDiscovered: S.resDiscovered, _riftSeen: S._riftSeen };
  try {
    S.chapter = '1'; S.resDiscovered = { dm: true }; S._riftSeen = true;
    assert.equal(relicsUnlocked(), true, '第 1 章资产齐备即开');
    S._riftSeen = false;
    assert.equal(relicsUnlocked(), false, '缺裂隙应关闭');
    S._riftSeen = true; S.resDiscovered = {};
    assert.equal(relicsUnlocked(), false, '缺 DM 应关闭');
    S.resDiscovered = { dm: true };
    S.chapter = '18';
    assert.equal(relicsUnlocked(), true, '老档章节过线不回退');
  } finally {
    Object.assign(S, keep);
  }
});

test('D2 宇宙 / 深潜 / 殖民 / 宗教 / 共鸣 / 政策与访问层同判', () => {
  const keep = { chapter: S.chapter, tech: S.tech, resDiscovered: S.resDiscovered, religion: S.religion, es: S.es, projectsDone: S.projectsDone, prestige: S.prestige };
  try {
    Object.assign(S, { chapter: '1', tech: {}, resDiscovered: {}, religion: {}, es: 0, projectsDone: 0, prestige: 0 });
    assert.equal(cosmosUnlocked(), accessCheck('cosmos.buy', S).ok);
    assert.equal(delvePrereqOk(), accessCheck('delve.unlock', S).ok);
    assert.equal(starColoniesUnlocked(), accessCheck('colony.claim', S).ok);
    assert.equal(canUnlockReligion(), accessCheck('religion.unlock', S).ok);
    assert.equal(resonanceUnlocked(S), accessCheck('resonance.open', S).ok);
    assert.equal(policyOpenGroups().length, 0);
    // 第 3 章：宗教/政策开；第 11 章：深潜章节门过（资源仍不足 → 仍 false，文案指路）
    S.chapter = '3';
    assert.equal(policyOpenGroups().length, 0, '政策组需要组内条件，章节只是入口');
    S.chapter = '3';
    S.upgrades = { ...(S.upgrades || {}), reserve_bin: 3 };
    S.resDiscovered = { rp: true };
    assert.equal(canUnlockReligion(), true, '第 3 章 + 粮仓 3 + RP 即开');
    S.chapter = '2';
    assert.equal(canUnlockReligion(), false, '第 2 章仍未开（宗教不是第二章内容）');
  } finally {
    Object.assign(S, keep);
  }
});

test('D3 深潜原因文案：章号来自门禁表（第 11 章），不是手写', () => {
  assert.match(delvePrereqReason({ chapter: '1' }), new RegExp(`第 ${CHAPTER_GATES.delve} 章`));
  assert.equal(delvePrereqReason({ chapter: '11', es: 0 }), `需转生 ES ≥ 3`);
});

test('D4 集市：第 2 章不可见、第 7 章可见；买断后任意章节可见', () => {
  const keep = { chapter: S.chapter, prestige: S.prestige, prestigePoints: S.prestigePoints, bazaar: S.bazaar };
  try {
    Object.assign(S, { chapter: '2', prestige: 3, prestigePoints: 2, bazaar: { unlocked: false } });
    assert.equal(moduleVisible('bazaar'), false);
    assert.match(moduleBuyState('bazaar').reason, new RegExp(`第 ${CHAPTER_GATES.bazaar} 章`));
    Object.assign(S, { chapter: '7', prestige: 15, prestigePoints: 7 });
    assert.equal(moduleVisible('bazaar'), true);
    assert.equal(moduleBuyState('bazaar').ok, true);
    Object.assign(S, { chapter: '2', bazaar: { unlocked: true } });
    assert.equal(moduleVisible('bazaar'), true, '已买断不回退');
  } finally {
    Object.assign(S, keep);
  }
  assert.equal(moduleUnlockDef('bazaar').cost, 5);
});

// ---------- E 远征入口可复用 ----------
test('E1 launchExpedition 是导出函数（不再藏在 DOM 监听器里），且受星图门禁', () => {
  assert.equal(typeof launchExpedition, 'function');
  const keep = { chapter: S.chapter, tech: S.tech };
  try {
    Object.assign(S, { chapter: '1', tech: {} });
    const r = launchExpedition('moon');
    assert.equal(r.ok, false);
    assert.ok(r.reason, '失败必须给原因');
  } finally {
    Object.assign(S, keep);
  }
  assert.ok(!/container\.querySelectorAll\('\[data-galaxy\]'\)[\s\S]{0,600}?S\.expeditions\.push/.test(src('src/modules/expedition.js')),
    '出发逻辑不应再直接写在 DOM 监听器里');
});

// ---------- F 探采分级（v2.4.0：基础随裂隙、高级随星图） ----------
test('F1 探采：基础载具随裂隙（第 1 章即可），高级载具与深渊商店随星图（第 4 章）', () => {
  const keep = { chapter: S.chapter, _riftSeen: S._riftSeen, tech: S.tech, upgrades: S.upgrades, expeditionsDone: S.expeditionsDone, expeditions: S.expeditions, resDiscovered: S.resDiscovered };
  try {
    Object.assign(S, { chapter: '1', _riftSeen: false, tech: {}, upgrades: {}, expeditionsDone: 0, expeditions: [] });
    assert.equal(accessCheck('vehicle.buy', S).ok, false, '没裂隙时探采平台不该能买');
    Object.assign(S, { _riftSeen: true });
    assert.equal(accessCheck('vehicle.buy', S).ok, true, '裂隙一出现就能买基础载具（不再等 DM）');
    assert.equal(accessCheck('vehicle.advanced', S).ok, false);
    assert.match(accessCheck('vehicle.advanced', S).reason, /星图/, '高级载具的原因应指向星图');
    assert.equal(accessCheck('dm.shop', S).ok, false, '深渊商店属于探采高级');
    Object.assign(S, { chapter: '4', tech: { deep_space: true }, upgrades: { rp_vault: 1, pt_vault: 1 } });
    assert.equal(accessCheck('vehicle.advanced', S).ok, true);
    // v2.6.1：深渊商店还要「DM 已经到手」——星图开了但 DM 没见过时仍是灰显
    assert.equal(accessCheck('dm.shop', S).ok, false, 'DM 未发现时深渊商店不可用');
    S.resDiscovered = { ...(S.resDiscovered || {}), dm: true };
    assert.equal(accessCheck('dm.shop', S).ok, true);
  } finally {
    Object.assign(S, keep);
  }
});

test('F2 遗物 tab：章节 ∧ 裂隙即可进入（不再要求 DM）；遗物卡仍要求 DM 已发现', () => {
  const keep = { chapter: S.chapter, _riftSeen: S._riftSeen, resDiscovered: S.resDiscovered, upgrades: S.upgrades };
  try {
    Object.assign(S, { chapter: '1', _riftSeen: true, resDiscovered: {}, upgrades: {} });
    assert.equal(relicsTabOpen(S), true, '裂隙后 tab 就该进得去（探采平台住在里面）');
    assert.equal(relicsUnlocked(), false, '没有 DM 时遗物本身仍然锁着');
    assert.match(accessReason('relic.buy', S), /DM/);
    Object.assign(S, { resDiscovered: { dm: true } });
    assert.equal(relicsUnlocked(), true, '见过 DM 后遗物卡放开');
  } finally {
    Object.assign(S, keep);
  }
});
