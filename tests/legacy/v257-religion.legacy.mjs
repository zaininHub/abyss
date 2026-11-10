// v2.5.7 宗教系统套件：
// ① v2.8.2 解锁：存储节点 ≥3 级 且 RP 已觉醒（首次溢出过） 且 EP 库存 ≥ 存储上限 80%（深度囤积）才可解锁
// ② 分支：随进度解锁（基础 2 / RP 后 5 / DM 后 6 / ES 后 7），选一锁定
// ③ 圣印升级点：消耗信仰，等级上限随进度解锁（3/5/8/10）；economy 全局加成 8%/级
// ④ 圣所：EP 购买，确定性信仰产出；信仰在 economy 各钩子链路生效
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const stateMod = await import('../../src/state.js');
const { S } = stateMod;
const relMod = await import('../../src/modules/religions.js');
const relData = await import('../../src/data/religions.js');
const { RELIGIONS, sealMaxLevel, sealUpgradeCost, TEMPLE, templeCost, templeFaithPerSec, religionUnlocked } = relData;
const econ = await import('../../src/modules/economy.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: {}, faith: 0,
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
  // 无仓库 → 不可解锁
  Object.assign(S, mkState({ ep: 1e6 }));
  rec('V1 无仓库（storage=0）不可解锁', relMod.canUnlockReligion() === false, `storage=0,ep=1e6`);
  // storage 1 级 + RP 未觉醒 → 不可解锁
  Object.assign(S, mkState({ ep: 100000, upgrades: { storage: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false } }));
  rec('V1 storage 1 级（不满足 ≥3）+ RP 未觉醒 → 不可解锁', relMod.canUnlockReligion() === false, `ep=100000,cap=${econ.epStorageCap()}`);
  // storage 3 级 + RP 觉醒 + 库存 < 80% → 不可解锁
  Object.assign(S, mkState({ ep: 1000, upgrades: { storage: 3 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: true, es: false, faith: false, pt: false, dm: false } }));
  rec('V1 storage 3 级 + RP 觉醒 → 可解锁（v2.8.20 移除 80% 库存限制）', relMod.canUnlockReligion() === true, `ep=1000,cap=${econ.epStorageCap()}`);
  // storage 3 级 + RP 觉醒 + 库存 ≥ 80% → 可解锁
  const cap = econ.epStorageCap();
  Object.assign(S, mkState({ ep: Math.ceil(cap * 0.8), upgrades: { storage: 3 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: true, es: false, faith: false, pt: false, dm: false } }));
  rec('V1 storage 3 级 + RP 觉醒 + 库存 ≥80% 上限可解锁', relMod.canUnlockReligion() === true, `ep=${Math.ceil(cap*0.8)}/cap=${cap}`);
  S.ep = 300000; // v2.8.30：唤醒固定 200K EP，补足执行额度
  const u = relMod.unlockReligion();
  rec('V1 unlockReligion 置位 + faith 锚点', u.ok === true && religionUnlocked() && S.resDiscovered.faith === true, JSON.stringify(S.religion));
}

// ========== V2 分支进度 ==========
{
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, religion: { unlocked: true } }));
  rec('V2 早期可见分支 = 2（sun/genesis）', RELIGIONS.filter(r => r.gate()).length === 2, `visible=${RELIGIONS.filter(r=>r.gate()).map(r=>r.id).join(',')}`);
  const r1 = relMod.selectBranch('sun');
  rec('V2 选择基础分支 sun 成功', r1.ok === true && S.religion.sun === true && S.religion.branch === 'sun', r1.reason || '');
  const r2 = relMod.selectBranch('moon');
  rec('V2 已信奉不可改宗（moon 拒绝）', r2.ok === false, r2.reason || '');
  // 中期：RP 解锁后可见 5 分支
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false }, religion: { unlocked: true } }));
  rec('V2 RP 解锁后可见 5 分支', RELIGIONS.filter(r => r.gate()).length === 5, `visible=${RELIGIONS.filter(r=>r.gate()).length}`);
  // 后期：DM 解锁 → 6；终局 es≥1 → 7
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true }, religion: { unlocked: true } }));
  rec('V2 DM 解锁后可见 6 分支', RELIGIONS.filter(r => r.gate()).length === 6, `visible=${RELIGIONS.filter(r=>r.gate()).length}`);
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, es: 1, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true }, religion: { unlocked: true } }));
  rec('V2 ES≥1 后可见全 7 分支（含 omnipot ×10）', RELIGIONS.filter(r => r.gate()).length === 7, `visible=${RELIGIONS.filter(r=>r.gate()).length}`);
  const r3 = relMod.selectBranch('omnipot');
  rec('V2 终局分支 omnipot 可选', r3.ok === true && S.religion.omnipot === true, r3.reason || '');
}

// ========== V3 圣印升级点（进度解锁上限） ==========
{
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, faith: 1000, religion: { unlocked: true, branch: 'sun', sun: true } }));
  rec('V3 早期圣印上限 3', sealMaxLevel() === 3, `max=${sealMaxLevel()}`);
  rec('V3 圣印升级费用 500/1450/4205（v3.0.3 后续涨价 500×2.9^n）', sealUpgradeCost(0) === 500 && sealUpgradeCost(1) === 1450 && sealUpgradeCost(2) === 4205, `cost0=${sealUpgradeCost(0)}`);
  const s1 = relMod.upgradeSeal();
  rec('V3 圣印升 1 级成功（-500 信仰）', s1.ok === true && S.religion.seal === 1 && S.faith === 500, s1.reason || '');
  rec('V3 圣印加成生效（×2 分支 × 1.08 圣印 = 2.16）', Math.abs(econ.globalMult() - 2.16) < 1e-9, `globalMult=${econ.globalMult()}`);
  // 纯圣印加成（无分支）：1.08
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, religion: { unlocked: true, seal: 1 } }));
  rec('V3 纯圣印（无分支）全局 ×1.08', Math.abs(econ.globalMult() - 1.08) < 1e-9, `globalMult=${econ.globalMult()}`);
  // 升到 3 级后早期不可再升（上限）
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, faith: 99999, religion: { unlocked: true, branch: 'sun', sun: true, seal: 3 } }));
  const s2 = relMod.upgradeSeal();
  rec('V3 早期圣印 3 级封顶（需解锁更多资源点）', s2.ok === false && s2.reason.includes('已达当前进度上限'), s2.reason || '');
  // RP 解锁 → 上限 5；DM → 8；ES → 10
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, resDiscovered: { rp: true }, religion: { unlocked: true } }));
  rec('V3 RP 后圣印上限 5', sealMaxLevel() === 5, `max=${sealMaxLevel()}`);
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, resDiscovered: { rp: true, dm: true }, religion: { unlocked: true } }));
  rec('V3 DM 后圣印上限 8', sealMaxLevel() === 8, `max=${sealMaxLevel()}`);
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, es: 1, resDiscovered: { rp: true, dm: true, es: true }, religion: { unlocked: true } }));
  rec('V3 ES 后圣印上限 10', sealMaxLevel() === 10, `max=${sealMaxLevel()}`);
}

// ========== V4 圣所产出 ==========
{
  Object.assign(S, mkState({ ep: 1e9, upgrades: { storage: 1 }, religion: { unlocked: true, branch: 'sun', sun: true, temple: 2 } }));
  rec('V4 圣所 Lv.2 信仰产出 0.10/s（v2.6.4 ③：0.05/级减缓）', Math.abs(templeFaithPerSec() - 0.10) < 1e-9, `rate=${templeFaithPerSec()}`);
  const f0 = S.faith;
  relMod.tickReligion(10);
  rec('V4 tickReligion(10s) 产出 +1 信仰（v2.6.4 ③ 减缓口径）', Math.abs(S.faith - (f0 + 1)) < 1e-9, `faith ${f0}→${S.faith}`);
  const cost1 = templeCost();
  const t1 = relMod.buyTemple();
  // v3.3.3 反馈⑥：圣所单位 EP 随等级递增；v3.4.8 反馈②：增速 0.2→0.35（Lv.2 单位 2700 EP）→ 10s 耗 2700
  rec('V4 圣所购买升 3 级（EP 扣减，含信仰生产 10s 耗 2700 EP）', t1.ok === true && S.religion.temple === 3 && S.ep === 1e9 - 2700 - cost1, t1.reason || '');
  // v3.4.7 反馈③：圣所无上限——原「满级禁购」改为高价仍可买
  Object.assign(S, mkState({ ep: 1e12, upgrades: { storage: 20 }, religion: { unlocked: true, branch: 'sun', sun: true, temple: 15 } }));
  const t2 = relMod.buyTemple();
  rec('V4 圣所无上限：Lv.15 仍可升 16 级', t2.ok === true && S.religion.temple === 16, t2.reason || '');
}

// ========== V5 既有钩子联动（economy 分支倍率生效） ==========
{
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, religion: { unlocked: true, branch: 'genesis', genesis: true } }));
  const c0 = econ.costMult();
  Object.assign(S, mkState({ ep: 1e6, upgrades: { storage: 1 }, religion: { unlocked: true, branch: 'sun', sun: true } }));
  const mSun = econ.globalMult();
  rec('V5 sun 分支全局 ×2 生效', Math.abs(mSun - 2) < 1e-9, `globalMult=${mSun}`);
  rec('V5 genesis 分支成本 ×0.8 生效', Math.abs(c0 - 0.8) < 1e-9, `costMult=${c0}`);
  // 未解锁宗教 → 无任何加成（回归：不污染既有数值）
  Object.assign(S, mkState({ ep: 1e6 }));
  rec('V5 未解锁宗教不改变 globalMult/cost', Math.abs(econ.globalMult() - 1) < 1e-9, `globalMult=${econ.globalMult()}`);
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.7 宗教系统封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
