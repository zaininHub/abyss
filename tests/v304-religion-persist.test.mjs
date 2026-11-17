// v3.0.3 后续反馈⑥回归：晋升（doPrestige）后宗教完整保留
// （分支/解锁标记/圣印/圣所/神谕塔/圣战军/信仰/虔诚 均不清空）
// v4.2.X：轮回已移除并入晋升，原 doReincarn 用例删除（宗教跨周期保留统一由晋升验收）。
import assert from 'node:assert';
import test from 'node:test';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const pg = await import('../src/modules/prestige.js');

function setup() {
  Object.assign(S, {
    ep: 1e9, allTimeEp: 1e9, runEarned: 1e12, rp: 5000, es: 100, dm: 0, faith: 1e6, pt: 0,
    prestige: 1, prestigePoints: 1, abyssEcho: 0, reincarned: 0, achievements: { v_first: 1 },
    upgrades: { scribble: 3 }, tech: { ai_core: true }, focusLevel: 2, projects: [], cultists: [],
    wageState: { state: 'ok' }, corruption: 0,
    delve: { depth: 5, active: false, unlocked: true, up: { diver: 2 } },
    religion: { unlocked: true, branch: 'sun', sun: true, seal: 4, temple: 6, oracle: 2, crusade: 1, templeOff: false },
    devotion: 120, transcend: 2,
    riftEmber: 300, riftsSealed: 3, bazaar: { unlocked: true, trades: 12 }, resDiscovered: { ep: true, es: true, faith: true, rp: true },
    storylinesCompleted: [], storyline: 'line_order', collapsed: false, _collapseAt: 0, _collapseChoicePending: false,
    policies: {}, policyRuns: [], relicLegacy: {}, chapters: 9, expeditions: [], cosMoS: undefined,
    moduleUnlocks: { reincarn: true, bazaar: true }, // v3.12.0 反馈⑬：夹具模拟已买断模块
  });
}

function assertReligionIntact(tag) {
  const r = S.religion;
  assert.ok(r && r.unlocked === true, `${tag}: religion.unlocked 保留`);
  assert.equal(r.branch, 'sun', `${tag}: 分支保留`);
  assert.equal(r.seal, 4, `${tag}: 圣印等级保留`);
  assert.equal(r.temple, 6, `${tag}: 圣所等级保留`);
  assert.equal(r.oracle, 2, `${tag}: 神谕塔保留`);
  assert.equal(r.crusade, 1, `${tag}: 圣战军保留`);
  assert.ok((S.faith || 0) > 0, `${tag}: 信仰保留`);
  assert.equal(S.devotion, 120, `${tag}: 虔诚保留`);
  assert.equal(S.transcend, 2, `${tag}: 超验层级保留`);
}

test('doPrestige 后宗教完整保留', () => {
  setup();
  const r = pg.doPrestige('legacy');
  assert.ok(r.gain >= 1);
  assertReligionIntact('prestige');
});

// v4.2.X：轮回已移除——原「doReincarn 后宗教保留」用例并入上面的 doPrestige 用例。
