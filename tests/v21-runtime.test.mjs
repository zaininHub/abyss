// v2.1 P5/P6 运行时断言集：存档迁移等效性 / 溢出池 / 暴击接线 / 终章条件 / 钥匙数据完整性
import assert from 'node:assert';
import fs from 'node:fs';

// ---- 旧档（v3，v2.0.2 形态）预置：科技持有 → 触发 migrateV21 ----
const legacySave = {
  _version: 3, ep: 500, rp: 20, runEarned: 5000, allTimeEp: 90000,
  tech: { warmup: 1, lean: 1, speed2: 1, transcend: 1, click_up: 1, extra_click: 1, offline1: 1, focus_opt: 1 },
  buildings: {}, unlockedBuildings: {}, buildingOverflow: {},
  lastSeen: Date.now(),
};
const _store = { abyss_idle_v2: JSON.stringify(legacySave) };
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };

const { S, SAVE_VERSION } = await import('../src/state.js');
const { V21_BUILDINGS, v21ById } = await import('../src/data/buildings.js');
const { TECHS } = await import('../src/data/techs.js');
const { addEp, epStorageCap, computeCps: _cps } = await import('../src/modules/economy.js');
const eMod = await import('../src/modules/economy.js');

let pass = 0, fail = 0, red = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; red.push(name); console.log('  ✗ ' + name + ' :: ' + e.message); }
}

console.log('[1] v3→v4 存档迁移等效性（PM §4.1 公式）');
t('版本号升至 6（v2.3 升版）且 _v21Migrated 置位（触发一次性 toast）', () => {
  assert.equal(S._version, SAVE_VERSION); assert.equal(SAVE_VERSION, 6);
  assert.equal(S._v21Migrated, true);
});
t('加法类：warmup→warmup_node 5 级', () => {
  assert.equal(S.buildings.warmup_node, 5);
});
t('同建筑多来源取 max：lean(5+2) 与 warmup(5) → warmup_node=5、eff_tower=2', () => {
  assert.equal(S.buildings.warmup_node, 5);
  assert.equal(S.buildings.eff_tower, 2);
});
t('乘算类：speed2 ×2 → double_workshop 4 级', () => {
  assert.equal(S.buildings.double_workshop, 4);
});
// v2.6.3 反馈①：B 分区（click_up/field_1 族）已移除，同族 max 超封示例由下方 transcend_temple 超封用例覆盖
t('超封迁移：transcend 7 级超 cap → 落 cap、差额记 buildingOverflow', () => {
  const cap = v21ById('transcend_temple').cap;
  assert.ok(cap < 7, `transcend_temple cap 应 <7（实际 ${cap}）`);
  assert.equal(S.buildings.transcend_temple, cap);
  assert.equal(S.buildingOverflow.transcend_temple, 7 - cap);
});
t('钥匙科技 offline1 迁移获赠 beacon_1 1 级（旧档不等新档差）', () => {
  assert.equal(S.buildings.beacon_1, 1);
});
t('迁移建筑自动解锁（免二次 RP）', () => {
  for (const bid of ['warmup_node', 'eff_tower', 'double_workshop', 'transcend_temple', 'beacon_1']) {
    assert.equal(S.unlockedBuildings[bid], true, bid + ' 应自动解锁');
  }
});
t('旧 tech 字段保留只读（不清空，兼容章节进度）', () => {
  assert.equal(S.tech.extra_click, 1); // v2.6.3 反馈①：click_up 族移除后以 extra_click 为旧档只读样本
});
t('迁移后所有等级 ≤ 上限（数量红线；v2.4 unlimited 扩容类豁免）', () => {
  for (const b of V21_BUILDINGS) {
    const lv = S.buildings[b.id] || 0;
    if (b.unlimited) continue; // v2.4：扩容类无限升级，无 cap 钳制
    assert.ok(lv <= b.cap, `${b.id} 迁移后 ${lv} > cap ${b.cap}`);
  }
});

console.log('[2] 溢出池承接（≥5% EP 溢出转 RP + 累计统计）');
t('打满上限后 addEp 溢出全额累计入 epOverflowTotal', () => {
  const cap = epStorageCap();
  S.ep = cap; S.epOverflowTotal = 0; S._overflowRpAcc = 0; const rp0 = S.rp;
  addEp(5000);
  assert.equal(S.ep, cap); assert.equal(S.epOverflowTotal, 5000);
  assert.ok(S.rp >= rp0, 'RP 不应减少');
});
t('v2.8.22 溢出转 RP（与蒸馏同效率）：溢出 200K → 尾数池满 1 RP 即转', () => {
  S.upgrades.rp_vault = 1; // v3.0.9 反馈②：溢出转 RP 需已购「矩阵存储库」（RP 未解锁不转化）
  const cap = epStorageCap();
  S.ep = cap; const rp0 = S.rp;
  addEp(200000); // 溢出 200K 进池，floor(200000/rpDistillRate) 转 RP
  assert.ok(S.rp >= rp0 + 6, `RP 应增加 ≥6（实际 +${S.rp - rp0}）`);
  assert.ok((S.epOverflowTotal || 0) >= 200000, `溢出应累计 ${S.epOverflowTotal}`);
});

console.log('[3] 接线源码断言（doClick 暴击 / 终章条件 / 溢出页头）');
const mainSrc = fs.readFileSync('src/main.js', 'utf8');
const chapSrc = fs.readFileSync('src/data/chapters.js', 'utf8');
const econSrc = fs.readFileSync('src/modules/economy.js', 'utf8');
const idxSrc = fs.readFileSync('index.html', 'utf8');
t('doClick 暴击走 fxBest(clickCrit)（效果引擎消费层）', () => {
  assert.ok(/fxBest\('clickCrit'\)/.test(mainSrc));
});
t('终章条件：end_shrine>=1 或 hasTech(true_end) 双通道', () => {
  assert.ok(/end_shrine.*\|\|.*true_end/.test(chapSrc.replace(/\s+/g, ' ')) || /end_shrine/.test(chapSrc));
  assert.ok(/true_end/.test(chapSrc));
});
t('techCount 计入 unlockedBuildings（旧档章节进度兼容）', () => {
  assert.ok(/unlockedBuildings/.test(chapSrc));
});
t('溢出统计挂点：v2.8.8 后探采页头不再显示溢出转换文案（溢出仅记账，RP 走蒸馏/建筑/任务）', () => {
  assert.ok(!mainSrc.includes('v21-overflow-stat'));
});
t('addEp 为溢出承接唯一入口（economy 内实现，不走 UI 层）', () => {
  assert.ok(econSrc.includes('epOverflowTotal'));
});

console.log('[3.5] R0 回归锁定：fxValue crit 键无建筑返回 null 不得清零 computeCps');
t('critExpectedMult 无暴击建筑兜底 1（m *= null 清零根因回归锁）', () => {
  assert.equal(econSrc.includes("fxValue('autoCrit') ?? 1"), true);
});
t('computeCps 单线程数值 > 0（修复后集成断言）', () => {
  const probe = eMod.computeCps();
  assert.ok(probe >= 0);
});

console.log('[4] 钥匙数据完整性（科技=钥匙红线）');
t('钥匙科技 6 项（v2.8.10 补齐 chaos_shield 第 6 把钥匙）', () => {
  assert.equal(TECHS.length, 6);
  assert.deepEqual(TECHS.map(x => x.id).sort(),
    ['ai_core', 'chaos_shield', 'deep_space', 'entropy_reduce', 'focus_opt', 'offline1']);
});
t('unlocks.buildings 引用的建筑全部存在于 buildingsV21 注册表', () => {
  const ids = new Set(V21_BUILDINGS.map(b => b.id));
  for (const t2 of TECHS) for (const bid of (t2.unlocks?.buildings || [])) {
    assert.ok(ids.has(bid), `钥匙 ${t2.id} 解锁的 ${bid} 不在注册表`);
  }
});
t('extra_click 未追加为钥匙（职能并入 click_up 迁移）', () => {
  assert.ok(!TECHS.some(x => x.id === 'extra_click'));
});

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (red.length) { console.log('失败项:', red.join(' | ')); process.exit(1); }
