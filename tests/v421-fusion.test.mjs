// v4.2.X 专项：晋升软递减 + 轮回移除/回响融合 + 政策链解锁
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
globalThis.window = { addEventListener() {} };

import { S } from '../src/state.js';
import { prestigeBoost } from '../src/modules/economy.js';
import { BALANCE } from '../src/data/balance.js';
import { doPrestige } from '../src/modules/prestige.js';
import { echoUpgradeCost, buyEchoUpgrade } from '../src/modules/echoShop.js';
import { MODULE_UNLOCKS } from '../src/modules/moduleUnlocks.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { PANEL_KEYS } from '../src/core/panelKeys.js';
import { policyOpenGroups } from '../src/data/policies.js';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('F1 职级点加速软递减：前 30 点 +10%/点不变，超出按 sqrt 减速', () => {
  const c = BALANCE.prestigeBoost;
  assert.equal(c.softCap, 30);
  S.prestigePoints = 0; assert.equal(prestigeBoost(), 1);
  S.prestigePoints = 10; assert.ok(Math.abs(prestigeBoost() - 2) < 1e-9, '10 点 = ×2（原口径）');
  S.prestigePoints = 30; assert.ok(Math.abs(prestigeBoost() - 4) < 1e-9, '30 点 = ×4（原口径）');
  S.prestigePoints = 3007;
  const reduced = prestigeBoost();
  assert.ok(reduced > 4 && reduced < 30, `3007 点软递减后应在 4~30 之间（实得 ${reduced.toFixed(2)}）`);
  assert.ok(reduced < 1 + 3007 * 0.1, '必须低于旧线性公式的 301×');
});

test('F2 轮回完全移除：模块/面板/成就/源码符号均清空', () => {
  assert.deepEqual(MODULE_UNLOCKS.map(m => m.key), ['bazaar'], '模块买断只剩集市');
  assert.ok(!PANEL_KEYS.includes('reincarn'), '面板键无轮回');
  assert.ok(!ACHIEVEMENTS.some(a => a.desc && a.desc.includes('轮回')), '成就文案无轮回');
  const html = src('index.html').replace(/\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!html.includes('btn-reincarn') && !html.includes('tab-reincarn'), 'HTML 无轮回入口');
  for (const p of ['src/main.js', 'src/modules/prestige.js']) {
    assert.ok(!src(p).includes('doReincarn'), `${p} 无 doReincarn`);
  }
});

test('F3 回响/遗物传承并入晋升：doPrestige 返回 echo 且清零后发放', () => {
  Object.assign(S, {
    chapter: '8', chapterEnteredAt: Date.now() - 10 * 86400000,
    prestige: 2, prestigePoints: 5, prestigeNeed: undefined,
    runEarned: 1e14, es: 10, faith: 20, abyssEcho: 0,
    upgrades: {}, tech: {}, projects: [], cultists: [],
    religion: { unlocked: true }, resDiscovered: { ep: true },
    _collapseAt: 0, collapsed: false, _collapseChoicePending: false,
  });
  const r = doPrestige(null);
  assert.ok(r.echo > 0, '晋升结算回响');
  assert.ok(r.echo <= BALANCE.reincarn.echoCap, '回响单次受上限');
  assert.ok(S.abyssEcho > 0, '回响已入账');
  assert.equal(S.prestige, 3, '职级 +1');
  assert.ok(S.chapterEnteredAt > 0);
});

test('F4 回响商店可用：成本/购买/等级一致', () => {
  const id = BALANCE.reincarn.upgs[0].id;
  S.abyssEcho = 1000; S.echoUpgrades = {};
  const cost = echoUpgradeCost(id);
  assert.ok(cost > 0);
  const r = buyEchoUpgrade(id);
  assert.equal(r.ok, true);
  assert.equal(S.echoUpgrades[id], 1);
  assert.ok(S.abyssEcho < 1000, '回响被消费');
});

test('F5 政策链解锁：选完路线不立即整组解锁深化（旧链已断）', () => {
  Object.assign(S, { chapter: '7', prestige: 1, projectsDone: 0, policies: {} });
  const ids = () => policyOpenGroups().map(g => g.id);
  assert.ok(!ids().includes('deepen'));
  S.policies.route = { id: 'order_route', lv: 1 };
  assert.ok(!ids().includes('deepen'), '选完 A 不解锁 B/C');
  S.prestige = 3;
  assert.ok(ids().includes('deepen'), '资产达标才开放');
});
