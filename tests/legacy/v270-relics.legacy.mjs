// v2.7.0 深渊遗物套件：
// ① 解锁：裂隙触发（_riftSeen / _v25Legacy / riftsSealed）∧ DM 已发现 才开放入口
// ② 购买：DM 消费、费用 ×1.8^级、cap 5 级、gate 进度门控（RP/ES/AI）
// ③ 乘区：古卷=全局产出 +8%/级、虚眼=离线效率 +12%/级、罗盘=RP 转换 +10%/级、
//   祷文=信仰产出 +15%/级、触须=AI 决策间隔 -10%/级（下限 50%）、刻印=深潜产出 +20%/级
// ④ 跨转生保留：doPrestige 后 relics 不随轮清空（crossRun 含 relics）
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const stateMod = await import('../../src/state.js');
const { S } = stateMod;
const relMod = await import('../../src/modules/relics.js');
const relData = await import('../../src/data/relics.js');
const { RELICS, relicLevel, relicCost, relicMult, relicsUnlocked } = relData;
const econ = await import('../../src/modules/economy.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: {}, faith: 0,
    relics: {}, // v2.7.0
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  });
}
function mkState(extra = {}) {
  global.localStorage = { getItem: () => mkRaw(extra), setItem() {}, removeItem() {} };
  Object.assign(S, stateMod.load());
  return S;
}

// ========== ① 解锁门控 ==========
{
  const s = mkState({ dm: 5, _v25Legacy: false, resDiscovered: { ...S.resDiscovered, dm: true } });
  rec('①a 裂隙未触发（新档）+ DM 已发现 → 不开放', relicsUnlocked() === false);
}
{
  const s = mkState({ dm: 5, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true } });
  rec('①b 裂隙已触发 + DM 已发现 → 开放', relicsUnlocked() === true);
}
{
  const s = mkState({ dm: 5, riftsSealed: 2, resDiscovered: { ...S.resDiscovered, dm: true } });
  rec('①c 裂隙已封印（riftsSealed>0）→ 开放', relicsUnlocked() === true);
}
{
  const s = mkState({ dm: 0, _riftSeen: true });
  rec('①d 裂隙已触发但 DM 未发现 → 不开放', relicsUnlocked() === false);
}

// ========== ② 购买与费用 ==========
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true } });
  const r = relMod.buyRelic('tome');
  rec('②a 购买深渊古卷成功（DM 充足）', r.ok === true && S.relics.tome === 1 && S.dm === 5000 - 50, `dm=${S.dm}`);
}
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, relics: { tome: 4 } });
  const r = relMod.buyRelic('tome');
  rec('②b 第 5 级购买成功（cap 上限 5）', r.ok === true && S.relics.tome === 5);
  const r2 = relMod.buyRelic('tome');
  rec('②c 满级后不可再购', r2.ok === false && r2.reason.includes('上限'));
}
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true, rp: true } });
  const c0 = relicCost('compass');
  const r = relMod.buyRelic('compass');
  const c1 = relicCost('compass');
  rec('②d 费用 ×1.8^级递增（150 → 270）', c0 === 150 && c1 === 270 && r.ok === true, `${c0}→${c1}`);
}
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: true } });
  const r = relMod.buyRelic('compass');
  rec('②e gate 未达标（RP 未发现）→ 不可购', r.ok === false && r.reason.includes('进度'));
}
{
  const s = mkState({ dm: 5, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true } });
  const r = relMod.buyRelic('tome');
  rec('②f DM 不足 → 不可购', r.ok === false && r.reason.includes('深渊物质'));
}

// ========== ③ 乘区 ==========
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, relics: { tome: 5 } });
  const m = econ.globalMult();
  rec('③a 深渊古卷 Lv5：全局产出 ×1.40', Math.abs(m - 1.40) < 1e-9, `m=${m.toFixed(4)}`);
}
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, relics: { eye: 3 } });
  const off = econ.offlineRate();
  rec('③b 虚空之眼 Lv3：离线效率 ×1.36（0.25×1.36=0.34）', Math.abs(off - 0.34) < 0.001, `off=${off.toFixed(4)}`);
}
{
  const s1 = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, relics: { prayer: 2 } });
  const faithMod = await import('../../src/data/religions.js');
  const fps = faithMod.templeFaithPerSec();
  // 圣所 0 级时 r=0；用 temple=3 验证 ×1.30
  const s2 = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, relics: { prayer: 2 }, religion: { unlocked: true, temple: 3 } });
  const fps2 = faithMod.templeFaithPerSec();
  rec('③c 永暗祷文 Lv2：信仰产出 ×1.30（圣所 3 级 0.05×3=0.15 → 0.195）', Math.abs(fps2 - 0.05 * 3 * 1.30) < 1e-9, `fps2=${fps2.toFixed(4)}`);
}
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true, rp: true }, relics: { compass: 2 } });
  // v2.8.2：溢出自动转 RP 已移除（改蒸馏主动转化）——罗盘接线为蒸馏效率 ×1.10/级
  // 基础 30000（v2.8.24 蒸馏消耗 ×2）/ 1.12^2 / 1.20（罗盘 2 级）= 19891.2
  S.upgrades = { ...(S.upgrades || {}), rp_distill: 2 };
  const rate = econ.rpDistillRate();
  rec('③d 星渊罗盘 Lv2：研究点转换效率 ×1.20（蒸馏 2 级 30000/1.12²/1.20）', Math.abs(rate - 30000 / Math.pow(1.12, 2) / 1.20) < 1e-6, `rate=${rate.toFixed(2)}`);
}
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, tech: { ai_core: true }, ai: { autoUpgrade: true, autoHire: true }, relics: { tentacle: 5 } });
  const aiMod = await import('../../src/modules/ai.js');
  // 混沌触须 Lv5 → -50%，与拟态矩阵下限取更严：5s 基础 ×0.5 = 2.5s
  aiMod.tickAI(3.0); // 3s > 2.5s 间隔 → 应触发决策并消耗 timer
  const timerLeft = S.ai.timer;
  rec('③e 混沌触须 Lv5：AI 决策间隔 -50%（3s 触发，timer 消耗至 0.5s）', Math.abs(timerLeft - 0.5) < 1e-9, `timer=${timerLeft}`);
  mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, tech: { ai_core: true }, ai: { autoUpgrade: true, autoHire: true }, relics: {} });
  aiMod.tickAI(2.0); // 无触须：间隔 5s，2s 不触发，timer 残留 2.0
  const timerLeft2 = S.ai.timer;
  rec('③f 无触须：2s 不触发决策（间隔 5s）', Math.abs(timerLeft2 - 2.0) < 1e-9, `timer=${timerLeft2}`);
}

// ========== ④ 跨转生保留 ==========
{
  const s = mkState({ dm: 5000, _riftSeen: true, resDiscovered: { ...S.resDiscovered, dm: true }, relics: { tome: 3 }, runEarned: 4e7 });
  const prestigeMod = await import('../../src/modules/prestige.js');
  prestigeMod.doPrestige('none');
  rec('④a 转生后遗物跨转生保留（tome=3）', S.relics && S.relics.tome === 3, JSON.stringify(S.relics));
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.7.0 深渊遗物封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join('; ')); process.exit(1); }
