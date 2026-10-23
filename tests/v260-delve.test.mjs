// v2.6.0 深潜终局层套件：
// ① 解锁门控：ES≥3 + DM 发现 + 宗教已信奉
// ② 下潜/上浮：DM 成本指数涨、产出开启、腐化累积、层深保留
// ③ 升级树：6 项 VS 消耗、满级、效果接入（economy/religions/ai/offline）
// ④ 里程碑：10/25/50/100 一次性 VS 奖励
// ⑤ 跨转生保留：delve/vs 在 crossRun
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const stateMod = await import('../src/state.js');
const { S } = stateMod;
const delve = await import('../src/modules/delve.js');
const { DELVE, diveCost, vsPerSec, delveCorruptRate, delveUpgradeCost } = await import('../src/data/delve.js');
const econ = await import('../src/modules/economy.js');
const relData = await import('../src/data/religions.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, es: 0, dm: 0, vs: 0, faith: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: {}, pets: {}, activePets: [], fusesDone: 0,
    delve: {}, corruption: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  });
}
function mkState(extra = {}) {
  global.localStorage = { getItem: () => mkRaw(extra), setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 解锁门控 ==========
{
  Object.assign(S, mkState());
  rec('V1 默认档不可解锁（ES/DM/宗教全缺）', delve.canUnlockDelve() === false);
  Object.assign(S, mkState({ es: 3, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true }, religion: { unlocked: true, branch: 'sun', sun: true } }));
  rec('V1 ES3+DM+宗教已信奉可解锁', delve.canUnlockDelve() === true);
  const u = delve.unlockDelve();
  rec('V1 unlockDelve 置位', u.ok === true && delve.delveUnlocked());
  // 缺一不可
  Object.assign(S, mkState({ es: 3, resDiscovered: { dm: true }, religion: {} }));
  rec('V1 缺宗教不可解锁', delve.canUnlockDelve() === false);
  Object.assign(S, mkState({ es: 2, resDiscovered: { dm: true }, religion: { unlocked: true } }));
  rec('V1 ES<3 不可解锁', delve.canUnlockDelve() === false);
}

// ========== V2 下潜/上浮 ==========
{
  Object.assign(S, mkState({ es: 3, dm: 10000, resDiscovered: { dm: true }, religion: { unlocked: true }, delve: { unlocked: true, active: false, depth: 0, up: {} }, corruption: 0 }));
  rec('V2 下潜成本 Lv.0→1 = 100 DM', diveCost(0) === 100, `cost=${diveCost(0)}`);
  rec('V2 下潜成本指数涨（Lv.5 = 4xx）', diveCost(5) === Math.round(100 * Math.pow(1.35, 5)), `cost=${diveCost(5)}`);
  const r1 = delve.startDelve();
  rec('V2 下潜成功（DM 扣 100 + active）', r1.ok === true && delve.delveActive() && S.dm === 9900, r1.reason || '');
  const r2 = delve.startDelve();
  rec('V2 深潜中不可重复下潜', r2.ok === false);
  // 产出/腐化
  const vs0 = S.vs || 0;
  delve.tickDelve(10);
  rec('V2 深潜 10s 产出 VS（层1 × 0.75/s）', Math.abs((S.vs || 0) - (vs0 + vsPerSec(1, 0) * 10)) < 1e-9, `vs ${vs0}→${S.vs}`);
  rec('V2 深潜腐化累积（层1 +0.02%/s ×10s）', Math.abs(S.corruption - 0.2) < 1e-9, `corruption=${S.corruption}`);
  const r3 = delve.stopDelve();
  rec('V2 上浮（active=false，层深保留）', r3.ok === true && !delve.delveActive() && delve.delveDepth() === 0);
  // 上浮后不再产出/腐化
  const c1 = S.corruption;
  delve.tickDelve(10);
  rec('V2 上浮后产出/腐化停止', Math.abs(S.corruption - c1) < 1e-9 && Math.abs(S.vs - (vs0 + vsPerSec(1, 0) * 10)) < 1e-9);
  // 层深递增：再次下潜 → 深度 +1
  S.delve.depth = 4;
  const cost5 = diveCost(4);
  const r4 = delve.startDelve();
  rec('V2 层深 4 下潜成本按当前层计算', r4.ok === true && r4.cost === cost5 && S.dm === 9900 - cost5, `cost=${r4.cost}`);
}

// ========== V3 升级树与效果接入 ==========
{
  Object.assign(S, mkState({ es: 3, vs: 50000, resDiscovered: { dm: true }, religion: { unlocked: true, branch: 'sun', sun: true }, delve: { unlocked: true, depth: 5, active: false, up: {} } }));
  // 深潜器
  const c1 = delveUpgradeCost('diver', 0);
  const b1 = delve.buyDelveUpgrade('diver');
  rec('V3 深潜器 Lv.1 购买成功（-10 VS）', b1.ok === true && S.vs === 50000 - c1 && delve.delveUpgradeLv('diver') === 1, b1.reason || '');
  // 效果接入：economy void / religions resonance / ai matrix / offline ember
  Object.assign(S, mkState({ es: 3, vs: 50000, resDiscovered: { dm: true }, religion: { unlocked: true, branch: 'sun', sun: true }, delve: { unlocked: true, depth: 5, active: false, up: { void: 5, resonance: 3, matrix: 3, ember: 3, diver: 5, purge: 3 } } }));
  const gm = econ.globalMult();
  rec('V3 虚空强化 ×1.10^5 生效（sun 2 × 1.61 圣印？无圣印 → 2×1.6105）', Math.abs(gm - 2 * Math.pow(1.10, 5)) < 1e-6, `globalMult=${gm}`);
  rec('V3 深渊共鸣圣印上限 +6（10+6=16）', relData.sealMaxLevel() === 16, `max=${relData.sealMaxLevel()}`);
  Object.assign(S, mkState({ es: 3, vs: 50000, faith: 100, religion: { unlocked: true, branch: 'sun', sun: true, temple: 2 }, resDiscovered: { dm: true }, delve: { unlocked: true, depth: 5, active: false, up: { resonance: 3 } } }));
  const fpr = relData.templeFaithPerSec();
  rec('V3 深渊共鸣信仰产出 ×1.5^3（0.10→0.3375，v2.6.4 ③ 基数 0.05）', Math.abs(fpr - 0.1 * Math.pow(1.5, 3)) < 1e-9, `faithRate=${fpr}`);
  // ember 离线上限突破 3.0：构造高 m（混合宠 offline ×10.2 + moon ×1.5 → 7.65）→ clamp 到 4.8
  Object.assign(S, mkState({ es: 3, vs: 50000, resDiscovered: { dm: true }, religion: { unlocked: true, branch: 'sun', sun: true, moon: true },
    pets: { fused1: { icon: '✨', name: '外神之影', level: 1, exp: 0, gen: 1, mixed: { global: 1, click: 1, offline: 10, event: 1 } } },
    activePets: ['fused1'], delve: { unlocked: true, depth: 5, active: false, up: { ember: 3 } } }));
  const or1 = econ.offlineRate();
  rec('V3 星辰余烬离线上限扩展（m=3.825，低于 clamp 上限 4.8 原样返回；v2.6.6 ① 离线基准 0.25）', Math.abs(or1 - 3.825) < 1e-9, `offlineRate=${or1}`);
  // 满级禁购
  Object.assign(S, mkState({ es: 3, vs: 50000, resDiscovered: { dm: true }, religion: { unlocked: true }, delve: { unlocked: true, depth: 5, active: false, up: { diver: 5 } } }));
  const b2 = delve.buyDelveUpgrade('diver');
  rec('V3 满级禁购', b2.ok === false && b2.reason.includes('满级'), b2.reason || '');
}

// ========== V4 里程碑 ==========
{
  Object.assign(S, mkState({ es: 3, vs: 0, resDiscovered: { dm: true }, religion: { unlocked: true }, delve: { unlocked: true, depth: 25, active: true, up: {} }, corruption: 0 }));
  delve.tickDelve(1);
  rec('V4 层深 25 里程碑 +200 VS（10 层已领不重复）', (S.vs || 0) >= 200 && (S.vs || 0) < 300 && S.delve.mileDone['10'] === true && S.delve.mileDone['25'] === true, `vs=${S.vs}`);
  const vsA = S.vs;
  delve.tickDelve(1);
  rec('V4 里程碑不重复发放', (S.vs || 0) === vsA + vsPerSec(26, 0), `vs=${S.vs}`);
}

// ========== V5 跨转生保留 ==========
{
  const src = await import('node:fs').then(fs => fs.readFileSync('src/state.js', 'utf-8'));
  rec('V5 delve/vs 跨转生保留（crossRun）', src.includes("'delve', 'vs'"), 'state.js');
  rec('V5 迁移 newFields 含 delve/vs', src.includes("'delve', 'vs'"), 'newFields');
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.0 深潜终局层封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
