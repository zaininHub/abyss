// v4.2.0：「一章一个新模块」门禁 + 数据清洗 + 注册表 专项单测
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S } from '../src/state.js';
import { chapterNumOf, gateOpen, CHAPTER_GATES, runUpgrades, UPGRADE_VER } from '../src/core/chapterGates.js';
import { CHAPTER_UNLOCKS, unlocksAtChapter, allUnlockedUpTo } from '../src/data/chapterUnlocks.js';
import { canUnlockReligion } from '../src/modules/religions.js';
import { policyOpenGroups, hasPendingPolicy, policyMult } from '../src/data/policies.js';
import { resonanceUnlocked } from '../src/core/resonance.js';
import { relicsUnlocked } from '../src/data/relics.js';
import { starColoniesUnlocked } from '../src/modules/expedition.js';
import { canUnlockDelve } from '../src/modules/delve.js';
import { moduleVisible, moduleBuyState, MODULE_UNLOCKS } from '../src/modules/moduleUnlocks.js';
import { MODULE_PP_BY_CHAPTER } from '../src/core/devCheat.js';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------- A 门禁单一真源 ----------
test('A1 chapterNumOf 读 S.chapter 数字部分；变体章取数字', () => {
  assert.equal(chapterNumOf({ chapter: '1' }), 1);
  assert.equal(chapterNumOf({ chapter: '12' }), 12);
  assert.equal(chapterNumOf({ chapter: '6A' }), 6);
  assert.equal(chapterNumOf({}), 1);
});
test('A2 十一处章节门禁映射（v4.3.36 重排；v2.3.0 收进 starchart/pets 两个原硬编码章号）', () => {
  assert.deepEqual({ ...CHAPTER_GATES }, {
    religion: 3, transcend: 6, policy: 3, eternals: 8, relics: 1,
    resonance: 10, delve: 11, expedition: 12, bazaar: 7,
    starchart: 3, pets: 2,
  });
});
test('A3 老玩家零回退：chapter 已过线恒放行；未知 id 恒拒绝（v2.3.0 fail-closed）', () => {
  assert.equal(gateOpen('religion', { chapter: '3' }), true);
  assert.equal(gateOpen('religion', { chapter: '18' }), true);
  assert.equal(gateOpen('relics', { chapter: '1' }), true, '遗物第 1 章起放行');
  assert.equal(gateOpen('bazaar', { chapter: '6' }), false);
  assert.equal(gateOpen('bazaar', { chapter: '7' }), true);
  // v2.3.0：未知 gate id 由「恒放行」改为 fail-closed——拼错/已删 id 不再静默放行。
  assert.equal(gateOpen('unknown', { chapter: '18' }), false);
});
test('A4 集市：第 2 章不出现入口（用户反馈），第 7 章买得起；已买断的老档不回退', () => {
  const keep = { chapter: S.chapter, prestige: S.prestige, prestigePoints: S.prestigePoints, bazaar: S.bazaar };
  Object.assign(S, { chapter: '2', prestige: 3, prestigePoints: 2, bazaar: { unlocked: false } });
  assert.equal(moduleVisible('bazaar'), false, '第 2 章不再出现集市 tab');
  assert.equal(moduleBuyState('bazaar').ok, false);
  assert.match(moduleBuyState('bazaar').reason, /第 7 章/, '章节未到的原因要说清是哪一章');
  Object.assign(S, { chapter: '7', prestige: 16, prestigePoints: 7 });
  assert.equal(moduleVisible('bazaar'), true, '第 7 章入口出现');
  assert.equal(moduleBuyState('bazaar').ok, true, '第 7 章 7 PP ≥ 5 PP 可买断');
  Object.assign(S, { chapter: '2', bazaar: { unlocked: true } });
  assert.equal(moduleVisible('bazaar'), true, '已付费买断的模块不能被章节门禁重新锁死');
  Object.assign(S, keep);
});
test('A5 console 推章：第 7 章补齐的职级点 ≥ 集市买断价（价格两处不漂移）', () => {
  const cost = MODULE_UNLOCKS.find(m => m.key === 'bazaar').cost;
  assert.equal(MODULE_PP_BY_CHAPTER[CHAPTER_GATES.bazaar], cost + 1, 'MODULE_PP_BY_CHAPTER 必须 = 真实价格 + 1 余量');
});

// ---------- B 数据清洗（用户反馈①）----------
test('B1 runUpgrades 首跑清 _religionHintSeen 并打标记', () => {
  const d = { _religionHintSeen: true, chapter: '1' };
  runUpgrades(d);
  assert.equal(d._religionHintSeen, undefined);
  assert.equal(d._upgradeVer, UPGRADE_VER);
});
test('B2 幂等：二次跑不再动玩家后续产生的标记', () => {
  const d = { _upgradeVer: UPGRADE_VER, _religionHintSeen: true };
  runUpgrades(d);
  assert.equal(d._religionHintSeen, true, '已升级过的存档不重复清洗');
});
test('B3 load() 接线：state.js 调用 runUpgrades', () => {
  const st = src('src/state.js');
  assert.ok(st.includes('runUpgrades(out)'), 'load 读取侧调用版本清洗');
  assert.ok(st.includes("from './core/chapterGates.js'"), '引入清洗入口');
});

// ---------- C 各模块门禁真实生效（老档 chapter=1 全关）----------
test('C1 宗教：第 1~2 章不满足（即便粮仓≥3+RP），第 3 章才放行', () => {
  Object.assign(S, { chapter: '1', upgrades: { reserve_bin: 3 }, resDiscovered: { rp: true } });
  assert.equal(canUnlockReligion(), false);
  S.chapter = '2';
  assert.equal(canUnlockReligion(), false, '第二章不给宗教');
  S.chapter = '3';
  assert.equal(canUnlockReligion(), true);
});
test('C2 政策：第 1~2 章无开放组；第 3 章按资产开放；待选提示存在', () => {
  Object.assign(S, { chapter: '1', prestige: 2, religion: { unlocked: true }, bazaar: { unlocked: true } });
  assert.equal(policyOpenGroups().length, 0);
  assert.equal(hasPendingPolicy(), false);
  S.chapter = '2';
  assert.equal(policyOpenGroups().length, 0, '第二章不给政策');
  S.chapter = '3';
  assert.ok(policyOpenGroups().length >= 1);
  assert.equal(hasPendingPolicy(), true);
  S.policies = { route: { id: 'order_route', lv: 1 } };
  // 仍有其它未选组（信仰/集市），提示保留
  assert.equal(hasPendingPolicy(), true);
});
test('C3 共鸣/深潜/殖民：章节未到恒 false；遗物第 1 章起只看裂隙+DM 资产', () => {
  Object.assign(S, { chapter: '1', projectsDone: 50, prestige: 5, es: 10,
    resDiscovered: { dm: true, rp: true }, _riftSeen: true, religion: { unlocked: true },
    delve: { unlocked: false }, tech: { deep_space: true }, galaxyDone: {}, colonies: {} });
  assert.equal(resonanceUnlocked(S), false);
  assert.equal(canUnlockDelve(), false);
  assert.equal(starColoniesUnlocked(), false);
  assert.equal(relicsUnlocked(), true, 'v4.3.36：遗物与裂隙同属第 1 章，资产满足即开放');
  S.resDiscovered = { rp: true }; // DM 未发现
  assert.equal(relicsUnlocked(), false, 'DM 未发现时遗物仍锁（不白送）');
  S.resDiscovered = { dm: true, rp: true };
  S._riftSeen = false; // 裂隙未触发
  assert.equal(relicsUnlocked(), false, '裂隙未触发时遗物仍锁');
});

// ---------- D 政策加成资源门禁（反馈②）----------
test('D1 未解锁资源不吃政策加成（policyMult 恒 1），已解锁才生效', () => {
  const locked = { policies: { faith: { id: 'ascetic', lv: 1 } }, religion: { unlocked: false }, resDiscovered: {}, faith: 0 };
  assert.equal(policyMult('faith', locked), 1, 'FP 未解锁：苦行 +30% 不生效');
  const open = { ...locked, religion: { unlocked: true } };
  assert.ok(policyMult('faith', open) > 1, 'FP 已解锁：政策生效');
});
test('D2 基础产出键恒生效（不受资源门禁误伤）', () => {
  const s = { policies: { route: { id: 'order_route', lv: 1 } }, religion: { unlocked: false } };
  assert.ok(policyMult('ep', s) > 1);
});

// ---------- E 注册表与公告 ----------
test('E1 注册表：第 1/3 章各三条，第 9 章为远征积累章；13~17 未实装不登记；id 全局唯一', () => {
  const chapters = [...new Set(CHAPTER_UNLOCKS.map(x => x.chapter))];
  assert.deepEqual(chapters, [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 18]);
  assert.deepEqual(unlocksAtChapter(1).map(x => x.id), ['workbench', 'rift', 'relics'], '第一章：工作台 + 裂隙 + 遗物');
  assert.deepEqual(unlocksAtChapter(3).map(x => x.id), ['starchart', 'religion', 'policy'], '第三章：星图 + 宗教 + 政策');
  assert.deepEqual(unlocksAtChapter(2).map(x => x.id), ['pets'], '第二章只登记异兽（集市已移出）');
  assert.equal(unlocksAtChapter(7).map(x => x.id).includes('bazaar'), true, '集市登记在第 7 章');
  for (const n of [9, 13, 14, 15, 16, 17]) assert.equal(unlocksAtChapter(n).length, 0, `第 ${n} 章不发虚假公告`);
  const ids = CHAPTER_UNLOCKS.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, '解锁 id 全局唯一（allUnlockedUpTo 不可重复）');
});
test('E2 allUnlockedUpTo 单调累积', () => {
  assert.ok(allUnlockedUpTo(1).length < allUnlockedUpTo(12).length);
  const up12 = allUnlockedUpTo(12);
  for (const id of ['religion', 'policy', 'relics', 'bazaar', 'eternals']) assert.ok(up12.includes(id), `≤12 章应含 ${id}`);
  assert.ok(!allUnlockedUpTo(6).includes('bazaar'), '集市不在第 6 章前');
  assert.ok(allUnlockedUpTo(1).includes('relics'), '遗物第 1 章即登记');
});
test('E3 章节推进帧接线（v4.3.19 反馈⑧反转：解锁改日志悬念句，不再 toast）', () => {
  const fs = src('src/systems/frameSystems.js');
  assert.ok(fs.includes('unlocksAtChapter(nNow)'), '帧系统调用解锁公告');
  assert.ok(fs.includes('深渊里透出一道光...'), '日志悬念句接线');
  assert.ok(!fs.includes('🔓'), '解锁 toast 弹窗已移除');
});
