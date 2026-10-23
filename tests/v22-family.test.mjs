// v2.4 族升级数据层断言（v2.2 框架延续 + KG 模式改造）
// L1 静态基线（61 栋、非扩容级制红线 ≤20 恒真、扩容类 unlimited 豁免） / L2 动态硬顶（扩容类=Infinity、产出族≤16、其余===静态） /
// L3 数值红线「任一建筑任一级价格 ≤ 该级实际可达时刻 epStorageCap()」（PM §3.4 状态感知口径）
// v2.4：扩容族（组D）随 KG 无限化移除——familyUpgradeTiers 仅保留产出族；组D 建筑 capOf 恒为 Infinity
// 白名单终稿：产出族 = 组E 非锚点 3 座（coop_hall/eco_battery/eco_battery_2）；组B 整组不开放（crit 楼期望连乘实证）
// RP 消耗：产出族两档 v22-rp-recalb.py 反解（350k/900k，两档合计 ≤ 60%×终态结余 2.13M）
import assert from 'node:assert';

// ---- 最小 DOM stub（与 v21-buildings.test.mjs 同模式） ----
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { getAllBuildings, V21_BUILDINGS, capOf, familyOfBuilding, OUTPUT_FAMILY_IDS } = await import('../src/data/buildings.js');
const { epStorageCap, v21BuildingCost } = await import('../src/modules/economy.js');

let pass = 0, fail = 0, red = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; red.push(name); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function setCapState(cache, storage, dc, pool, dim, over, miles, storyline, familyUpgrades) {
  S.upgrades = { cache, storage };
  S.buildings = { datacenter: dc, quantum_pool: pool, dim_compressor: dim, overlimit_store: over };
  S.milesDone = {};
  for (let i = 0; i < miles; i++) S.milesDone['m' + i] = true;
  S.storyline = storyline || 'default';
  S.familyUpgrades = familyUpgrades || {};
}

console.log('[L1] 静态基线');
t('getAllBuildings() 恰好 58 栋且 ID 唯一（v2.7.5 新增 3 仓库后）', () => {
  const all = getAllBuildings();
  assert.equal(all.length, 58, `实际 ${all.length} 栋`);
  assert.equal(new Set(all.map(b => b.id)).size, 58, 'ID 必须唯一');
});
t('级制红线恒真：非扩容类静态 cap ≤ 20；unlimited 扩容类豁免（v2.4 KG 无限化）', () => {
  for (const b of getAllBuildings()) {
    if (b.unlimited) continue;
    const cap = b.cap ?? b.levels;
    assert.ok(cap >= 1 && cap <= 20, `${b.id} 静态 cap=${cap} 违反 ≤20 红线`);
  }
});
t('familyUpgradeTiers 配置完整：仅产出族（v2.4 扩容族移除）', () => {
  const F = BALANCE.familyUpgradeTiers;
  assert.ok(F && !F.D && F.output, 'v2.4 应只有 output 族（D 族随扩容类无限化移除）');
  assert.deepEqual(F.output.cats, ['B', 'E'], '产出族按架构口径 cats B+E（产出族范围歧义已回传组长裁定）');
  assert.equal(F.output.tiers.length, 2);
  for (const tr of F.output.tiers) {
    assert.ok(tr.rp > 0 && tr.addCap > 0 && tr.milestone >= 5 && tr.milestone <= 9, '档位字段非法');
  }
  assert.equal(F.output.hardCap, 16, '产出族硬顶 16');
});
t('校准回填值（反解脚本）：产出族 350k/900k（PM 终稿方向 350k/900k，白名单口径）', () => {
  const F = BALANCE.familyUpgradeTiers;
  assert.deepEqual(F.output.tiers.map(x => x.rp), [350000, 900000]);
  assert.deepEqual(F.output.tiers.map(x => x.milestone), [9, 9]);
});
t('产出族满档 +7（+3→+4）；扩容族档位随 v2.4 移除', () => {
  const F = BALANCE.familyUpgradeTiers;
  assert.equal(F.output.tiers.reduce((a, x) => a + x.addCap, 0), 7);
});
t('不做清单交集空：族升级仅产出白名单(3)；扩容类（组D 全族 8 栋含新增）经 unlimited 豁免不入族档', () => {
  const all = getAllBuildings();
  const inFam = all.filter(b => familyOfBuilding(b) !== null).map(b => b.id);
  const crossIds = ['order_pillar', 'abyss_anchor', 'faith_shrine'];
  for (const id of crossIds) assert.ok(!inFam.includes(id), `定向建筑 ${id} 不得入族`);
  // 组D 建筑仍被 familyOfBuilding 映射为 'D'（capOf 对 unlimited 恒返回 Infinity，族档对其无钳制）
  assert.equal(inFam.length, 13, `组D(8 含新增 3)+白名单(3) 应共 13 栋，实际 ${inFam.length}`);
  for (const cat of ['A', 'B', 'C', 'F', 'G', 'H', 'I']) {
    assert.ok(!all.some(b => b.cat === cat && familyOfBuilding(b)), `组${cat} 不得入族（组B 整组不开放为 PM 终稿）`);
  }
});

console.log('[L2] capOf 动态上限');
t('familyOfBuilding 映射：D 全族→D、白名单 3 楼→output、排除集 7 id 与其余组无映射', () => {
  const find = id => getAllBuildings().find(x => x.id === id);
  for (const id of ['quantum_pool', 'dim_compressor', 'overlimit_store', 'storage', 'cache']) {
    assert.equal(familyOfBuilding(find(id)), 'D', `${id} 应属组D 族`);
  }
  for (const id of OUTPUT_FAMILY_IDS) {
    assert.equal(familyOfBuilding(find(id)), 'output', `${id} 应属产出族白名单`);
  }
  assert.deepEqual([...OUTPUT_FAMILY_IDS].sort(), ['coop_hall', 'eco_battery', 'eco_battery_2'], '白名单终稿应恰为组E 非锚点 3 座');
  // 排除集（PM 终稿 + 组长批准）：乘算锚点 + 产出白名单外其余（B 分区 7 栋 v2.6.3 已删）
  for (const id of ['team_temple', 'super_team', 'order_pillar', 'abyss_anchor', 'faith_shrine', 'warmup_node', 'end_shrine', 'cycle_temple', 'canteen']) {
    assert.equal(familyOfBuilding(find(id)), null, `排除集 ${id} 不得入产出族`);
  }
  for (const id of ['warmup_node', 'end_shrine', 'cycle_temple', 'order_pillar', 'canteen']) {
    assert.equal(familyOfBuilding(find(id)), null, `${id} 不得入族`);
  }
});
t('无族升级态：非扩容建筑 capOf === 静态 cap；unlimited 扩容类 capOf = Infinity（v2.4）', () => {
  S.familyUpgrades = {}; S.buildings = {};
  for (const b of getAllBuildings()) {
    if (b.unlimited) { assert.equal(capOf(b, S), Infinity, `${b.id} unlimited 应返回 Infinity`); continue; }
    assert.equal(capOf(b, S), b.cap ?? b.levels, `${b.id} 默认 capOf 应等于静态 cap`);
  }
});
t('unlimited 扩容类 capOf = Infinity：组D 全族（三梯+storage/cache+新增 3 座）不受任何族档影响（v2.4）', () => {
  const ids = ['quantum_pool', 'dim_compressor', 'overlimit_store', 'storage', 'cache', 'abyss_reservoir', 'resonance_chamber', 'dm_condenser'];
  for (const id of ids) {
    const b = getAllBuildings().find(x => x.id === id);
    assert.equal(capOf(b, { familyUpgrades: {} }), Infinity, `${id} 基线应 Infinity`);
    assert.equal(capOf(b, { familyUpgrades: { D: 3 } }), Infinity, `${id} 旧档 D 族档不得钳制`);
  }
});
t('产出族 T1/T2：cap+3 → cap+7（以 coop_hall 5→8→12 为锚）', () => {
  const find = id => getAllBuildings().find(x => x.id === id);
  assert.equal(capOf(find('coop_hall'), { familyUpgrades: { output: 1 } }), 8);
  assert.equal(capOf(find('coop_hall'), { familyUpgrades: { output: 2 } }), 12);
  assert.equal(capOf(find('eco_battery'), { familyUpgrades: { output: 2 } }), 12);
});
t('产出族硬顶 16 恒真：白名单任意档数 capOf ≤ 16；超购档数封顶不额外加成', () => {
  const find = id => getAllBuildings().find(x => x.id === id);
  for (const id of OUTPUT_FAMILY_IDS) {
    const b = find(id);
    for (const n of [0, 1, 2, 3, 99]) {
      const c = capOf(b, { familyUpgrades: { output: n } });
      assert.ok(c <= 16, `${id} 档数 ${n} 时 capOf=${c} > 硬顶 16`);
    }
  }
  assert.equal(capOf(find('coop_hall'), { familyUpgrades: { output: 99 } }), 12, '超购档数应封在满档 +7');
});
t('乘数与概率堆叠保护（PM 终稿 + 组长批准，测试化）：排除集 9 id 任意档数 capOf 恒为静态 cap，不受族升级影响', () => {
  const find = id => getAllBuildings().find(x => x.id === id);
  // PM 终稿排除集（乘算锚点 + 组B/暴击楼 v2.6.3 已删）：任意档数 capOf 恒为静态 cap
  const anchors = [
    { id: 'team_temple' }, { id: 'super_team' },
    { id: 'order_pillar' }, { id: 'abyss_anchor' }, { id: 'faith_shrine' },
    { id: 'warmup_node' }, { id: 'end_shrine' }, { id: 'cycle_temple' }, { id: 'canteen' },
  ];
  for (const a of anchors) {
    const b = find(a.id);
    const cap = b.cap ?? b.levels;
    assert.ok(cap >= 1, `排除集 ${a.id} 静态 cap 应有效（基线前提）`);
    for (const n of [0, 1, 2, 3, 99]) {
      assert.equal(capOf(b, { familyUpgrades: { output: n, D: n } }), cap, `排除集 ${a.id} 档数 ${n} 时上限漂移`);
    }
  }
});
t('fuelMul 全来源乘积下界保险丝（PM 终稿断言 a）：满级全来源乘积 ≥ ×0.05（薪资不归零）', () => {
  // 全来源 = 所有 fx.key==='fuelMul' 的建筑，按各自 capOf 满档级数连乘（含产出族 T1+T2 扩展级）
  const fams = [{ familyUpgrades: {} }, { familyUpgrades: { output: 2 } }];
  for (const fam of fams) {
    let prod = 1;
    const sources = [];
    for (const b of getAllBuildings()) {
      if (!b.fx || b.fx.key !== 'fuelMul') continue;
      const lv = capOf(b, fam); // 满级态
      prod *= Math.pow(b.fx.value, lv);
      sources.push(`${b.id}^${lv}`);
    }
    assert.ok(prod >= 0.05, `fuelMul 乘积 ${prod.toExponential(3)}（${sources.join('×')}）< 0.05 保险丝`);
  }
  // PM 终稿锚点值：白名单两楼满档 ×0.90^12 × ×0.85^10 ≈ ×0.0556
  const expect = Math.pow(0.90, 12) * Math.pow(0.85, 10);
  assert.ok(Math.abs(expect - 0.0556) < 0.001, `锚点值漂移：×0.90^12×0.85^10 = ${expect.toExponential(3)}`);
});
t('unlimited 扩容类无硬顶：任意档数 capOf = Infinity（v2.4 替代原 35 硬顶）', () => {
  const find = id => getAllBuildings().find(x => x.id === id);
  for (const n of [0, 1, 2, 3, 99]) {
    assert.equal(capOf(find('quantum_pool'), { familyUpgrades: { D: n } }), Infinity, `档数 ${n} 时 quantum_pool 应为 Infinity`);
  }
});
t('非族建筑（A/C/F/G/H/I/X、基础 4 栋与 B/E 乘算锚点）任意档数 capOf === 静态 cap（不被族升级抬升）', () => {
  for (const b of getAllBuildings()) {
    if (familyOfBuilding(b)) continue;
    if (b.unlimited) continue; // unlimited 恒 Infinity，与下一条断言口径一致（非族抬升断言仅覆盖静态 cap 建筑）
    assert.equal(capOf(b, { familyUpgrades: { D: 3, output: 2 } }), b.cap ?? b.levels, `${b.id}(${b.cat}) 不得被族升级抬升`);
  }
});
t('familyUpgrades 缺省/空对象兼容（旧档未购族升级；unlimited 恒 Infinity）', () => {
  const b = getAllBuildings().find(x => x.id === 'quantum_pool');
  assert.equal(capOf(b, {}), Infinity);
  assert.equal(capOf(b, undefined), Infinity);
  assert.equal(capOf(b, { familyUpgrades: undefined }), Infinity);
});

console.log('[L3] 数值红线延续（族升级后「任一建筑任一级价格 ≤ epStorageCap()」）');
t('组D 三梯满档 35 级态：v21BuildingCost 仍受 30% 防死锁钳制（价格 ≤ 30%×cap ≤ cap）', () => {
  for (const [cache, storage, dc, pool, dim, over, miles, fam] of [
    [20, 20, 3, 20, 10, 5, 9, { D: 1 }],
    [20, 20, 3, 25, 15, 10, 9, { D: 2 }],
    [20, 20, 3, 35, 35, 35, 9, { D: 3 }],
  ]) {
    setCapState(cache, storage, dc, pool, dim, over, miles, 'default', fam);
    const cap = epStorageCap();
    for (const id of BALANCE.v21CapClampIds) {
      const b = V21_BUILDINGS.find(x => x.id === id);
      const cost = v21BuildingCost(b);
      assert.ok(cost <= Math.floor(cap * 0.3) + 1e-9, `${id}（族档 ${JSON.stringify(fam)}）价格 ${cost} > 30%×cap=${Math.floor(cap * 0.3)}`);
      assert.ok(cost <= cap, `${id} 价格 ${cost} > cap ${cap}（红线）`);
    }
  }
});
t('组D 35 级满配 capAdd 贡献生效（capOf 经 effectiveLevel 读侧贯通，epStorageCap 单调上升）', () => {
  setCapState(20, 20, 3, 20, 20, 20, 9, 'default', {});
  const cap20 = epStorageCap();
  setCapState(20, 20, 3, 25, 25, 25, 9, 'default', { D: 1 });
  const cap25 = epStorageCap();
  setCapState(20, 20, 3, 35, 35, 35, 9, 'default', { D: 3 });
  const cap35 = epStorageCap();
  assert.ok(cap25 > cap20, `T1 后上限应上升（${cap20} → ${cap25}）`);
  assert.ok(cap35 > cap25, `T3 后上限应上升（${cap25} → ${cap35}）`);
});
t('产出族扩展级价格红线（PM §3.4 状态感知口径）：按该级实际可达时刻的上限判，全部 ≤ m=9 期上限', () => {
  // 产出族档位门控 m=9 → 扩展级存在前提是 9 里程碑已达成；PM 终稿重算锚点（base×growth^(L-1)）：
  //   协作大厅 L8/L12 = 4,778/9,264；节能电池 L8/L12 = 6,371/12,352；节能电池·II L8/L10 = 403,352/640,361
  // 全部 ≤ m=9 期上限 4.0e7（PM 终稿口径，非终局快照单点判）
  const M9_CAP = 4.0e7;
  const anchors = [
    { id: 'coop_hall', lv: 8, price: 4778 }, { id: 'coop_hall', lv: 12, price: 9264 },
    { id: 'eco_battery', lv: 8, price: 6371 }, { id: 'eco_battery', lv: 12, price: 12352 },
    { id: 'eco_battery_2', lv: 8, price: 403352 }, { id: 'eco_battery_2', lv: 10, price: 640361 },
  ];
  for (const a of anchors) {
    const b = V21_BUILDINGS.find(x => x.id === a.id);
    const price = b.base * Math.pow(b.growth, a.lv - 1);
    assert.ok(Math.abs(price - a.price) / a.price < 0.01, `${a.id} L${a.lv} 价 ${Math.round(price)} 与 PM 锚点 ${a.price} 偏差 >1%`);
    assert.ok(price <= M9_CAP, `${a.id} L${a.lv} 价 ${price} > m=9 期上限 ${M9_CAP}`);
  }
  // 满档全级逐级复核（含中间级）：均 ≤ m=9 期上限
  for (const id of OUTPUT_FAMILY_IDS) {
    const b = V21_BUILDINGS.find(x => x.id === id);
    const dynCap = capOf(b, { familyUpgrades: { output: 2 } });
    for (let n = 0; n < dynCap; n++) {
      const price = b.base * Math.pow(b.growth, n);
      assert.ok(price <= M9_CAP, `${id} 第 ${n + 1} 级价 ${price.toExponential(3)} > m=9 期上限 ${M9_CAP}`);
    }
  }
});
t('产出族满档 12 级：白名单楼全级价 ≤ 终局 epStorageCap（3.74e11 口径量级，延续既有红线）', () => {
  setCapState(20, 20, 3, 20, 20, 20, 9, 'line_abyss', {});
  const cap = epStorageCap();
  for (const id of OUTPUT_FAMILY_IDS) {
    const b = V21_BUILDINGS.find(x => x.id === id);
    const dynCap = capOf(b, { familyUpgrades: { output: 2 } });
    for (let n = 0; n < dynCap; n++) {
      const price = b.base * Math.pow(b.growth, n);
      assert.ok(price <= cap, `${id} 第 ${n + 1} 级价 ${price.toExponential(3)} > 终局上限 ${cap}`);
    }
  }
});

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) { console.log('失败项:', red.join(' | ')); process.exit(1); }
