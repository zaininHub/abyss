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

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------- A 门禁单一真源 ----------
test('A1 chapterNumOf 读 S.chapter 数字部分；变体章取数字', () => {
  assert.equal(chapterNumOf({ chapter: '1' }), 1);
  assert.equal(chapterNumOf({ chapter: '12' }), 12);
  assert.equal(chapterNumOf({ chapter: '6A' }), 6);
  assert.equal(chapterNumOf({}), 1);
});
test('A2 八处章节门禁映射（v2 修订：宗教4/超验6/政策7/矩阵8/遗物3[v4.3.1 提前]/共鸣10/深潜11/殖民12）', () => {
  assert.deepEqual({ ...CHAPTER_GATES }, {
    religion: 4, transcend: 6, policy: 7, eternals: 8, relics: 3, resonance: 10, delve: 11, expedition: 12,
  });
});
test('A3 老玩家零回退：chapter 已过线恒放行；未知 id 恒放行', () => {
  assert.equal(gateOpen('religion', { chapter: '4' }), true);
  assert.equal(gateOpen('religion', { chapter: '18' }), true);
  assert.equal(gateOpen('unknown', { chapter: '1' }), true);
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
test('C1 宗教：第 1 章不满足（即便粮仓≥3+RP），第 4 章才放行', () => {
  Object.assign(S, { chapter: '1', upgrades: { reserve_bin: 3 }, resDiscovered: { rp: true } });
  assert.equal(canUnlockReligion(), false);
  S.chapter = '4';
  assert.equal(canUnlockReligion(), true);
});
test('C2 政策：第 1 章无开放组；第 7 章按资产开放；待选提示存在', () => {
  Object.assign(S, { chapter: '1', prestige: 2, religion: { unlocked: true }, bazaar: { unlocked: true } });
  assert.equal(policyOpenGroups().length, 0);
  assert.equal(hasPendingPolicy(), false);
  S.chapter = '7';
  assert.ok(policyOpenGroups().length >= 1);
  assert.equal(hasPendingPolicy(), true);
  S.policies = { route: { id: 'order_route', lv: 1 } };
  // 仍有其它未选组（信仰/集市），提示保留
  assert.equal(hasPendingPolicy(), true);
});
test('C3 共鸣/遗物/深潜/殖民：章节未到恒 false', () => {
  Object.assign(S, { chapter: '1', projectsDone: 50, prestige: 5, es: 10,
    resDiscovered: { dm: true, rp: true }, _riftSeen: true, religion: { unlocked: true },
    delve: { unlocked: false }, tech: { deep_space: true }, galaxyDone: {}, colonies: {} });
  assert.equal(resonanceUnlocked(S), false);
  assert.equal(relicsUnlocked(), false);
  assert.equal(canUnlockDelve(), false);
  assert.equal(starColoniesUnlocked(), false);
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
test('E1 注册表覆盖 1~12 + 18 章（13~17 未实装不登记）；每章恰好一条', () => {
  const nums = CHAPTER_UNLOCKS.map(x => x.chapter);
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18]);
  for (const n of nums) assert.equal(unlocksAtChapter(n).length, 1);
  assert.equal(unlocksAtChapter(13).length, 0, '未实装章节不发虚假公告');
});
test('E2 allUnlockedUpTo 单调累积', () => {
  assert.ok(allUnlockedUpTo(1).length < allUnlockedUpTo(12).length);
  assert.ok(allUnlockedUpTo(12).includes('religion'));
});
test('E3 章节推进帧接线（v4.3.19 反馈⑧反转：解锁改日志悬念句，不再 toast）', () => {
  const fs = src('src/systems/frameSystems.js');
  assert.ok(fs.includes('unlocksAtChapter(nNow)'), '帧系统调用解锁公告');
  assert.ok(fs.includes('深渊里透出一道光...'), '日志悬念句接线');
  assert.ok(!fs.includes('🔓'), '解锁 toast 弹窗已移除');
});
