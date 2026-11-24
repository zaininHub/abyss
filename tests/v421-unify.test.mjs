// v4.2.X 专项：单一真源 + 死代码清理 + 政策链解锁的回归锁
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S } from '../src/state.js';
import { MS_PER_DAY, daysSince } from '../src/core/time.js';
import { delvePrereqOk, delvePrereqReason } from '../src/modules/delve.js';
import { policyOpenGroups } from '../src/data/policies.js';
import { riftShown } from '../src/modules/disclosure.js';
import { echoMult, epStorageCap, computeCps } from '../src/modules/economy.js';
import { BALANCE } from '../src/data/balance.js';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('U1 时间常数单一真源：三处消费 MS_PER_DAY / daysSince，不再内联 86400000', () => {
  assert.equal(MS_PER_DAY, 86400000);
  // v4.3.24 修正：daysSince 内部重取 now=Date.now()，两次取时跨毫秒边界会得到
  //   1.0000000231…（约 1/43.2M 相对误差）——严格 equal 偶发失败（8 连跑 2 次）。
  //   改容差断言：结果应等于 1 天的毫秒差换算（±1ms 容忍时钟前跳）。
  const ts = Date.now() - MS_PER_DAY;
  const d = daysSince(ts);
  assert.ok(Math.abs(d - (Date.now() - ts) / MS_PER_DAY) < 1e-9, `daysSince 与毫秒差换算一致（d=${d}）`);
  assert.ok(Math.abs(d - 1) < 2 / MS_PER_DAY, `差值 ≈1 天（±1ms 容差；d=${d}）`);
  for (const p of ['src/core/progressive.js', 'src/data/chapters.js', 'src/modules/prestige.js']) {
    const s = src(p);
    if (p.includes('prestige')) assert.ok(s.includes('MS_PER_DAY'), `${p} 应走真源`);
    assert.ok(!s.includes('/ 86400000') && !s.includes('* 86400000'), `${p} 不应内联时间常数`);
  }
});

test('U2 深潜解锁两处同口径：dm_vault 兜底在 canUnlockDelve 与 unlockDelve 都生效', () => {
  const s = { es: 10, resDiscovered: {}, upgrades: { dm_vault: 1 }, religion: { unlocked: true }, chapter: '11' };
  assert.equal(delvePrereqOk(s), true, '买了星尘金库即视为 DM 已发现');
  assert.equal(delvePrereqReason(s), '');
  const noVault = { ...s, upgrades: {} };
  assert.equal(delvePrereqOk(noVault), false);
  assert.match(delvePrereqReason(noVault), /DM/);
  // 源码层：canUnlockDelve 与 unlockDelve 都走统一函数，不再各写一份
  const d = src('src/modules/delve.js');
  assert.ok(d.includes('return delvePrereqOk(S);'), 'canUnlockDelve 走统一真源');
  assert.ok(d.includes('const why = delvePrereqReason(S);'), 'unlockDelve 走统一真源');
});

test('U3 裂隙门控单一真源：riftShown 覆盖 _v25Legacy / riftsSealed，main 两处内联已消除', () => {
  assert.equal(riftShown({ _riftSeen: true }), true);
  assert.equal(riftShown({ _v25Legacy: true }), true);
  assert.equal(riftShown({ riftsSealed: 1 }), true);
  assert.equal(riftShown({}), false);
  const m = src('src/main.js');
  assert.ok(m.includes('riftShown(S)'), 'main 引入统一门控');
  assert.ok(!m.includes("setTabLocked(riftBtn, !(S._riftSeen"), 'tab 内联判定已删');
});

test('U4 回响倍率真源：BALANCE.reincarn.echoPerPoint 驱动 echoMult', () => {
  assert.equal(BALANCE.reincarn.echoPerPoint, 0.05);
  S.abyssEcho = 10; S.echoUpgrades = {};
  assert.ok(Math.abs(echoMult() - 1.5) < 1e-9, '10 点回响 = ×1.5');
  S.abyssEcho = 0;
});

test('U5 政策链：选完路线不立刻整组解锁深化（旧链已断）', () => {
  Object.assign(S, { chapter: '7', prestige: 1, projectsDone: 0, policies: {} });
  const ids = () => policyOpenGroups().map(g => g.id);
  assert.ok(!ids().includes('deepen'));
  S.policies.route = { id: 'order_route', lv: 1 };
  assert.ok(!ids().includes('deepen'), '选完 A 不解锁 B/C');
  S.prestige = 3;
  assert.ok(ids().includes('deepen'), '资产达标才开放');
});

test('U7 EP 时间基座剥离限时 buff：签名变化时的快照不含 buffMult（cap 不随 buff 起落）', () => {
  // 结构：给一笔结构性投入（升级），在有/无 buff 两种状态下刷新基座，cap 必须一致。
  Object.assign(S, { collapsed: false, upgrades: {}, buildings: {}, tech: {}, milesDone: {},
    storyline: 'default', prestigePoints: 0, buffUntil: 0, buffMult: 1, restBonusUntil: 0,
    cultists: [], corruption: 0, researchUpgrades: {}, riftUpgrades: {}, colonies: {},
    _rpOverflowSeen: true, _epCapBasisSig: '', _epCapBasisCps: 0, relicLegacy: {}, echoUpgrades: {} });
  S.upgrades = { scribble: 5 };
  const capNoBuff = (() => { S._epCapBasisSig = ''; return epStorageCap(); })();
  // 有 buff 时再次刷新基座——修复前 computeCps 被 ×3 放大进快照，cap 虚高
  S.buffMult = 3;
  S.buffUntil = Date.now() + 60000;
  const capBuff = (() => { S._epCapBasisSig = ''; return epStorageCap(); })();
  S.buffUntil = 0; S.buffMult = 1;
  // 时间基座 floor 只在 overflowSeen 且基座抬 cap 时生效；无 buff 与有 buff 两次快照应完全一致
  assert.equal(capBuff, capNoBuff, `cap 不得随 buff 变化：无 buff ${capNoBuff} / 有 buff ${capBuff}`);
  // 实时 cps 仍应含 buff（快照剥离不影响实时产出口径）
  const cpsNoBuff = computeCps();
  S.buffMult = 3; S.buffUntil = Date.now() + 60000;
  const cpsBuff = computeCps();
  S.buffUntil = 0; S.buffMult = 1;
  assert.ok(cpsBuff > cpsNoBuff, `实时 cps 应含 buff：${cpsBuff} vs ${cpsNoBuff}`);
});

test('U6 死代码已清理：关键死导出/废弃字段不再出现在源码', () => {
  const files = {
    'src/core/achievementRegistry.js': ['achievementById', 'achievementCount'],
    'src/core/progressive.js': ['MODULE_VISIBILITY', 'getUnlockedStages', 'getLockedStages'],
    'src/modules/economy.js': ['hasGen', 'critRate', 'vehicleDmEpCostPerMin'],
    'src/modules/expedition.js': ['aiBuyCheapestColony'],
    'src/data/policies.js': ['groupHasChoice', 'canPayReroll'],
  };
  // 耐久纪律：锁「某符号已删除」必须先剥注释行，否则删除时留的说明注释会误触断言。
  const stripComments = (s) => s.split('\n').filter(l => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
  for (const [p, names] of Object.entries(files)) {
    const s = stripComments(src(p));
    for (const n of names) assert.ok(!s.includes(n), `${p} 不应残留 ${n}`);
  }
  assert.ok(!stripComments(src('src/state.js')).includes('_forkTriggered'), 'v2.2 废弃字段已清除');
  assert.ok(!stripComments(src('src/core/stateSchema.js')).includes('_forkTriggered'));
});
