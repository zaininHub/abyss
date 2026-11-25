// v2.6.0 反馈（用户口径）：解锁三态——「本章可解锁但前置未达」显示 ??? 并灰显，
//   「本章不可能解锁」直接不显示。判定真源 = core/access.js 的 accessStage()。
//
// 为什么单独锁一层：本章之前这些内容一律以 ??? 常驻（可发现性），玩家在第一章就能看到
//   深渊商店/星图/集市等一整排占位，误以为「现在就能弄」。三态把「有盼头」和「还没到」
//   分开：有章节门禁且没走到 → 不显示；走到了但缺前置 → ??? 灰显。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { S } from '../src/state.js';
import { accessStage, accessReason } from '../src/core/access.js';
import { CHAPTER_GATES } from '../src/core/chapterGates.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = (p) => readFileSync(ROOT + p, 'utf8');

const BASE = JSON.parse(JSON.stringify(S));
const accessReasonOf = (id) => accessReason(id, S);
function reset(over) {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, JSON.parse(JSON.stringify(BASE)), over || {});
}

test('A1 章节门禁没走到 → hidden（不是 ???）', () => {
  reset({ chapter: '1', prestige: 0, prestigePoints: 0 });
  assert.equal(accessStage('dm.shop', S), 'hidden', '第 1 章不可能解锁深渊商店');
  assert.equal(accessStage('vehicle.advanced', S), 'hidden');
  assert.equal(accessStage('pets.buy', S), 'hidden', '第 1 章没有异兽');
  assert.equal(accessStage('bazaar.unlock', S), 'hidden');
  assert.equal(accessStage('mirror.open', S), 'hidden');
  assert.equal(accessStage('delve.unlock', S), 'hidden');
  reset({ chapter: '6', prestige: 5, prestigePoints: 5 });
  assert.equal(accessStage('bazaar.unlock', S), 'hidden', '第 6 章仍看不到集市（第 7 章才到）');
  assert.equal(accessStage('mirror.open', S), 'hidden');
  assert.equal(accessStage('dm.shop', S), 'gated', '第 6 章星图已过章节门禁，缺的是星图本身');
});

test('A2 章节到了但前置未达 → gated（??? 灰显）', () => {
  reset({ chapter: String(CHAPTER_GATES.starchart), tech: {}, upgrades: {}, resDiscovered: {}, pt: 0 });
  assert.equal(accessStage('dm.shop', S), 'gated', '第 4 章能解锁，但星图还没开');
  assert.equal(accessStage('vehicle.advanced', S), 'gated');
  reset({ chapter: String(CHAPTER_GATES.pets), upgrades: {}, pt: 0 });
  assert.equal(accessStage('pets.buy', S), 'gated', '第 2 章能解锁，但还没买饵料仓库');
  reset({ chapter: String(CHAPTER_GATES.bazaar), prestige: 0 });
  assert.equal(accessStage('bazaar.unlock', S), 'gated', '第 7 章能解锁，但还没晋升过');
});

test('A3 条件满足 → open', () => {
  reset({
    chapter: String(CHAPTER_GATES.starchart), tech: { deep_space: true }, _riftSeen: true,
    upgrades: { rp_vault: 1, pt_vault: 1 }, resDiscovered: { rp: true, pt: true, dm: true }, pt: 3,
  });
  assert.equal(accessStage('dm.shop', S), 'open');
  assert.equal(accessStage('vehicle.advanced', S), 'open');
  reset({ chapter: String(CHAPTER_GATES.pets), pt: 5 });
  assert.equal(accessStage('pets.buy', S), 'open');
  reset({ chapter: String(CHAPTER_GATES.bazaar), prestige: 15, prestigePoints: 8 });
  assert.equal(accessStage('bazaar.unlock', S), 'open');
});

test('A4 无章节门禁的动作永远只有 open / gated（不会因为章数不够而消失）', () => {
  reset({ chapter: '1', prestige: 0, _riftSeen: false, resDiscovered: {} });
  assert.equal(accessStage('echo.buy', S), 'gated', '回响只要求晋升，第 1 章也该灰显而不是消失');
  assert.equal(accessStage('rift.tech', S), 'gated', '裂隙靠触发，不靠章节');
  assert.equal(accessStage('relic.tab', S), 'gated', '第 1 章遗物能解锁，缺的是裂隙');
  reset({ chapter: '1', _riftSeen: true });
  assert.equal(accessStage('relic.tab', S), 'open');
  assert.equal(accessStage('rift.tech', S), 'open');
});

test('A7 章节到了、前置也过了，但计价资源还没到手 → 仍 gated（不是 open）', () => {
  // 星图开了、裂隙触发过，但 DM 一次没见过 → 深渊商店里没有任何东西买得起，不该装成 open
  reset({
    chapter: String(CHAPTER_GATES.starchart), tech: { deep_space: true }, _riftSeen: true,
    upgrades: { rp_vault: 1, pt_vault: 1 }, resDiscovered: { rp: true, pt: true }, pt: 3, dm: 0,
  });
  assert.equal(accessStage('dm.shop', S), 'gated', 'DM 未发现 → 深渊商店只能灰显');
  assert.match(accessReasonOf('dm.shop'), /深渊物质|DM/, 'reason 要说清缺的是 DM');
  S.resDiscovered.dm = true;
  assert.equal(accessStage('dm.shop', S), 'open', 'DM 到手后同一套条件即 open');
});

test('A5 未注册动作 → hidden（fail-closed，不摆假占位）', () => {
  reset({ chapter: '1' });
  assert.equal(accessStage('nope.not-registered', S), 'hidden');
});

test('A6 接线：顶栏 tab 三态 + 深渊商店/探采高级按三态收放', () => {
  const main = src('src/main.js');
  assert.match(main, /function setTabStage\(btn, stage\)/, '三态入口存在');
  assert.match(main, /if \(stage === 'hidden'\) \{ btn\.style\.display = 'none'; return; \}/, 'hidden = 不显示');
  assert.match(main, /function tabStage\(unlocked, policyId\)/, 'open 优先，其余问 accessStage');
  const TABS = [
    ['btn-expedition', 'expedition.launch'],
    ['btn-relics', 'relic.tab'],
    ['btn-pets', 'pets.buy'],
    ['btn-religion', 'religion.unlock'],
    ['btn-policy', 'policy.open'],
    ['btn-bazaar', 'bazaar.unlock'],
    ['btn-delve', 'delve.unlock'],
    ['btn-mirror', 'mirror.open'],
  ];
  for (const [id, policy] of TABS) {
    // 每个 tab 都必须经 setTabStage + tabStage(<自己的解锁判定>, '<策略 id>')
    assert.ok(
      main.includes(`setTabStage(document.getElementById('${id}'), tabStage(`)
      || main.includes(`setTabStage(petsBtnV26, tabStage(`),
      `${id} 走三态入口`,
    );
    assert.ok(main.includes(`'${policy}'`), `${id} 的章节策略 ${policy} 已登记`);
  }
  const shop = src('src/modules/shop.js');
  assert.match(shop, /const dmStage = accessStage\('dm\.shop', S\);/, '深渊商店先问三态');
  assert.match(shop, /if \(dmStage === 'hidden'\) \{[\s\S]{0,200}?container\.style\.display = 'none';/, '本章不可能解锁 → 整块不显示');
  assert.match(shop, /accessStage\('vehicle\.advanced', S\) !== 'hidden'/, '探采高级：不可能解锁时不摆 ??? 卡');
});
