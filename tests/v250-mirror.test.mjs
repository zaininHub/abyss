// v2.5.0：镜像协议（契约 / 算力战争 / 三方议会）专项单测
// 设计稿 P2 三件套由 13/14/15 章提前到 7/8/9 章，一个 tab、三块内容逐章解锁。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S } from '../src/state.js';
import { CHAPTER_GATES } from '../src/core/chapterGates.js';
import { accessCheck } from '../src/core/access.js';
import {
  mirrorVisible, warUnlocked, councilUnlocked,
  signContract, activeContract, contractMet,
  syncMirrorMerit, warLevel, buyWarTech, meritRateMult,
  chooseCouncil, councilAllSeen, mirrorGlobalMult, mirrorOfflineMult,
  ensureMirror, handleMirrorClick,
} from '../src/modules/mirror.js';
import { MIRROR_WAR_TECHS, MIRROR_COUNCIL, warTechCost } from '../src/data/mirror.js';

// 存档 / toast 需要的浏览器垫片（Node 下 save() 会写 localStorage）
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.document = {
  getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
  body: { classList: { add() {}, remove() {} } }, addEventListener() {}, querySelectorAll: () => [],
};

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** 干净的镜像状态：跨转生层清零，本局层重置。 */
function resetMirror() {
  S.mirror = { merit: 0, techs: {}, seen: {}, allSeen: false };
  S.mirrorRun = { contract: null, base: 0, council: null, meritBasis: 0 };
}

test('A1 tab 可见性与三块门禁：7 / 8 / 9 章各开一块', () => {
  const keep = { chapter: S.chapter, prestige: S.prestige };
  resetMirror();
  Object.assign(S, { chapter: '6', prestige: 5 });
  assert.equal(mirrorVisible(), false, '第 6 章没有镜像');
  assert.equal(mirrorVisible(), false);
  assert.equal(accessCheck('mirror.open', S).ok, false);
  assert.match(accessCheck('mirror.open', S).reason || '', /第 7 章/, '原因要说清是哪一章');

  S.chapter = '7';
  assert.equal(mirrorVisible(), true);
  assert.equal(warUnlocked(), false, '算力战争第 8 章才开');
  assert.equal(councilUnlocked(), false);
  assert.equal(accessCheck('mirror.tech', S).ok, false);

  S.chapter = '8';
  assert.equal(warUnlocked(), true);
  assert.equal(councilUnlocked(), false);

  S.chapter = '9';
  assert.equal(councilUnlocked(), true);
  assert.equal(CHAPTER_GATES.mirror, 7);
  assert.equal(CHAPTER_GATES.mirrorwar, 8);
  assert.equal(CHAPTER_GATES.mirrorcouncil, 9);
  Object.assign(S, keep);
});

test('A2 契约：每局一份、条件持续判定、达成即进全局乘区', () => {
  resetMirror();
  S.chapter = '7'; S.prestige = 5; S.runEarned = 1000;
  const r = signContract('conqueror');
  assert.equal(r.ok, true);
  assert.equal(activeContract().id, 'conqueror');
  assert.equal(contractMet(), false, '产出还没翻倍');
  const baseMult = mirrorGlobalMult();
  S.runEarned = 2500;
  assert.equal(contractMet(), true);
  assert.ok(mirrorGlobalMult() > baseMult, '达成后全局乘区变大');
  assert.ok(Math.abs(mirrorGlobalMult() - 1.30) < 1e-9, '征服者 +30%');
  // 本局不可改签
  assert.equal(signContract('ascetic').ok, false);
  // 晋升后 mirrorRun 被重置 → 可以重新签
  resetMirror();
  assert.equal(activeContract(), null);
});

test('A3 苦行者：不碰载具与深渊商店才成立；学者：研究项 ≥3', () => {
  resetMirror();
  S.chapter = '7'; S.prestige = 5;
  S.upgrades = {};
  S.rpTheories = {};
  S.runEarned = 1;
  signContract('ascetic');
  assert.equal(contractMet(), true, '一件载具都没买');
  S.upgrades = { scooter: 1 };
  assert.equal(contractMet(), false, '买了外勤摩托队就违约');
  S.upgrades = { dmsight: 1 };
  assert.equal(contractMet(), false, '买了深渊商店项也违约');
  resetMirror();
  S.upgrades = {};
  S.rpTheories = { a: 1, b: 1 };
  signContract('scholar');
  assert.equal(contractMet(), false, '才 2 项研究');
  S.rpTheories = { a: 1, b: 1, c: 1 };
  assert.equal(contractMet(), true);
});

test('A4 算力战争：战功按本局产出增量入账，价格逐级递增，扣款后等级 +1', () => {
  resetMirror();
  S.chapter = '8'; S.prestige = 5;
  S.runEarned = 0;
  syncMirrorMerit();
  assert.equal(S.mirror.merit, 0, '基准同步进不出战功');
  S.runEarned = 2e11; // 2e11 * 1e-10 = 20 战功（算力回收首级 12）
  syncMirrorMerit();
  assert.ok(Math.abs(S.mirror.merit - 20) < 1e-6, `战功应为 20，实际 ${S.mirror.merit}`);
  // 重复同步幂等（不会因为原地刷新而重复入账）
  syncMirrorMerit();
  assert.ok(Math.abs(S.mirror.merit - 20) < 1e-6);

  const t = MIRROR_WAR_TECHS.find(x => x.id === 'recycle');
  assert.equal(warTechCost(t, 0), t.base);
  const before = S.mirror.merit;
  const buy = buyWarTech('recycle');
  assert.equal(buy.ok, true);
  assert.equal(warLevel('recycle'), 1);
  assert.ok(S.mirror.merit < before, '战功被扣');
  assert.ok(warTechCost(t, 1) > warTechCost(t, 0), '第二级更贵');
  assert.ok(mirrorGlobalMult() > 1, '算力回收进全局乘区');
  assert.equal(mirrorOfflineMult(), 1, '冷存储未买时离线乘区为 1');
  // 战功不够时不允许购买
  S.mirror.merit = 0;
  assert.equal(buyWarTech('recycle').ok, false);
});

test('A5 三方议会：每局一席生效；三席都坐过 → 永久 +5% 全局', () => {
  resetMirror();
  S.chapter = '9'; S.prestige = 5;
  const base = mirrorGlobalMult();
  assert.equal(chooseCouncil('output').ok, true);
  assert.ok(mirrorGlobalMult() > base, '产出议席立即生效');
  assert.equal(councilAllSeen(), false, '只坐过一席');
  // 换一局：本局议席清零，但 mirror.seen 必须累积（三席齐才是永久加成）
  S.mirrorRun.council = null;
  assert.equal(chooseCouncil('merit').ok, true);
  assert.ok(Math.abs(meritRateMult() - 1.30) < 1e-9, '军功议席 +30% 战功');
  S.mirrorRun.council = null;
  assert.equal(chooseCouncil('offline').ok, true);
  assert.ok(mirrorOfflineMult() > 1, '静谧议席进离线乘区');
  assert.equal(councilAllSeen(), true, '三席各坐过一次');
  assert.ok(MIRROR_COUNCIL.length === 3);
  assert.ok(Math.abs(mirrorGlobalMult() - (1 + 0.05)) < 1e-9, '三席齐 → 永久 +5% 全局');
});

test('A6 接线：乘区 / 帧结算 / 面板 / tab 四处都真的接上了', () => {
  const econ = src('src/modules/economy.js');
  assert.ok(econ.includes('mirrorGlobalMult()'), '全局乘区已接');
  assert.ok(econ.includes('mirrorOfflineMult()'), '离线乘区已接');
  const fs = src('src/systems/frameSystems.js');
  assert.ok(fs.includes("id: 'mirror'") && fs.includes('syncMirrorMerit()'), '战功每帧结算');
  assert.ok(fs.includes("'mirror',"), 'FRAME_SYSTEM_IDS 已登记');
  const main = src('src/main.js');
  assert.ok(main.includes("registerPanel({ key: 'mirror'"), '面板已注册');
  assert.ok(/setTabLocked\(document\.getElementById\('btn-mirror'\)/.test(main), 'tab 锁定读 mirrorVisible');
  const html = src('index.html');
  assert.ok(html.includes('id="btn-mirror"') && html.includes('id="mirror-panel"'), 'DOM 挂载点存在');
  // 购买 / 选择入口统一走 accessCheck 策略表（与 v2.3.0 访问层同源）
  const mod = src('src/modules/mirror.js');
  for (const id of ["'mirror.open'", "'mirror.tech'", "'mirror.council'"]) {
    assert.ok(mod.includes(id), `缺少 ${id} 的权限检查`);
  }
});

test('A7 旧档兼容：缺 mirror / mirrorRun 时 ensureMirror 补默认值且不炸', () => {
  S.mirror = undefined;
  S.mirrorRun = undefined;
  const m = ensureMirror();
  assert.deepEqual(m, { merit: 0, techs: {}, seen: {}, allSeen: false });
  assert.equal(S.mirrorRun.contract, null);
  assert.equal(typeof S.mirrorRun.meritBasis, 'number');
});

test('A8 点击穿透：按钮内部 <span> 被点时回溯到带 data-* 的按钮（否则点文字无反应）', () => {
  resetMirror();
  S.chapter = '7'; S.prestige = 5; S.runEarned = 0;
  const btn = { dataset: { mirrorContract: 'conqueror' } };
  const container = { innerHTML: '' };
  const target = { dataset: {}, closest: () => btn }; // 点在文字上：target 是 span，dataset 为空
  assert.equal(handleMirrorClick({ target, currentTarget: container }, container), true);
  assert.equal(S.mirrorRun.contract, 'conqueror', '契约必须真的签上');
  assert.ok(container.innerHTML.includes('征服者契约'), '处理后原地重绘');
});
