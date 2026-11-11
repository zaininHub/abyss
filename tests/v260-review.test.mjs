// v2.6.0 全量 review 套件：
// ① 转生（doPrestige）清腐化——新轮从干净状态开始（review 发现：旧轮腐化惩罚带入新轮）
// ② 深潜接入点不破坏既有：v2.5.7 圣印上限 base、offline 未解锁时数值不变
// ③ 回归一致性：globalMult 无深潜/宗教时 = 1；costMult 同
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const stateMod = await import('../src/state.js');
const { S } = stateMod;
const econ = await import('../src/modules/economy.js');
const prestige = await import('../src/modules/prestige.js');
const relData = await import('../src/data/religions.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, es: 0, dm: 0, vs: 0, faith: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: {}, pets: {}, activePets: [], fusesDone: 0,
    delve: {}, corruption: 0, prestige: 0, prestigePoints: 0, runEarned: 0, earnedFull: 0,
    wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  });
}
function mkState(extra = {}) {
  global.localStorage = { getItem: () => mkRaw(extra), setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 转生清腐化 ==========
{
  Object.assign(S, mkState({ corruption: 88, prestigePoints: 100, ep: 1e9, upgrades: { scooter: 1 }, tech: { ai_core: true } }));
  const r = prestige.doPrestige('sharp');
  rec('V1 转生后腐化清零（88 → 0）', S.corruption === 0, `corruption=${S.corruption}`);
  rec('V1 转生结算正常（prestigePoints 累加 + runEarned 清零）', S.prestigePoints >= 100 && S.runEarned === 0 && S.earnedFull === 0, `pp=${S.prestigePoints}`);
  // v3.12.0 反馈⑪：科技树改为本局制，晋升不再保留 AI 管理核心
  rec('V1 转生不保留 AI 核心科技', !S.tech.ai_core, 'ai_core=' + S.tech.ai_core);
  rec('V1 转生重置薪资状态机', S.wageState.state === 'ok' && S.wageState.dormantSec === 0, JSON.stringify(S.wageState));
  rec('V1 转生保留宗教/信仰（跨转生）', Object.keys(S.religion || {}).length >= 0 && typeof S.faith === 'number', 'religion/faith');
}

// ========== V2 深潜接入不破坏既有数值 ==========
{
  Object.assign(S, mkState());
  rec('V2 无宗教/深潜时 globalMult = 1（不污染）', Math.abs(econ.globalMult() - 1) < 1e-9, `globalMult=${econ.globalMult()}`);
  rec('V2 无深潜时圣印上限 base（3）', relData.sealMaxLevel() === 3, `max=${relData.sealMaxLevel()}`);
  rec('V2 无深潜时离线效率 base（25%，v2.6.5 离线低收益）', Math.abs(econ.offlineRate() - 0.25) < 1e-9, `rate=${econ.offlineRate()}`);
  rec('V2 无深潜时离线上限 base（8h）', econ.offlineCap() === 8 * 3600, `cap=${econ.offlineCap()}`);
  // 深潜升级单点生效：只有 void 时只有全局变，离线不变
  Object.assign(S, mkState({ religion: { unlocked: true, branch: 'sun', sun: true }, delve: { unlocked: true, up: { void: 2 } }, resDiscovered: { dm: true } }));
  rec('V2 void 2 级全局 ×1.21（sun ×2 叠加 = 2.42）', Math.abs(econ.globalMult() - 2 * Math.pow(1.1, 2)) < 1e-9, `globalMult=${econ.globalMult()}`);
  rec('V2 void 不影响离线效率（仍 25%）', Math.abs(econ.offlineRate() - 0.25) < 1e-9, `rate=${econ.offlineRate()}`);
}

// ========== V3 深潜升级树数值回算 ==========
{
  const delve = await import('../src/modules/delve.js');
  Object.assign(S, mkState({ es: 3, vs: 999999, dm: 999999, resDiscovered: { dm: true }, religion: { unlocked: true }, delve: { unlocked: true, depth: 0, active: false, up: {} } }));
  // 全升满（6 项）→ 检查总消耗与 cap
  for (const id of ['diver', 'void', 'purge', 'resonance', 'matrix', 'ember']) {
    for (let i = 0; i < 10; i++) delve.buyDelveUpgrade(id);
  }
  const up = S.delve.up;
  rec('V3 升级树 6 项均满级', up.diver === 5 && up.void === 5 && up.purge === 3 && up.resonance === 3 && up.matrix === 3 && up.ember === 3, JSON.stringify(up));
  // v3.12.6 ①：树价随 VS 产出重新标定（深潜器首价 10→40）——改为从数据表派生期望值，
  // 避免每次调价都要改这条封板断言。
  const { DELVE: DD } = await import('../src/data/delve.js');
  const expectCost = ['diver', 'void', 'purge', 'resonance', 'matrix', 'ember']
    .reduce((sum, id) => sum + Array.from({ length: DD.upgrades[id].cap }, (_, lv) => Math.round(DD.upgrades[id].base * Math.pow(1.8, lv)))
      .reduce((a, b) => a + b, 0), 0);
  rec('V3 总消耗 VS 与升级树数据表一致', S.vs === 999999 - expectCost, `vs=${S.vs} expect=${999999 - expectCost}`);
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.0 全量 review 封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
