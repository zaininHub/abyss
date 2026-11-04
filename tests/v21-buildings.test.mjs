// v2.1 P0/P1 数据层 + 效果引擎断言集（PM 设计文档 §5.1-5.4 Checklist + 终章 RESCALE 数值基准）
import assert from 'node:assert';

// ---- 最小 DOM stub（与 smoke.test.mjs 同模式） ----
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { getAllBuildings, V21_BUILDINGS, buildingCostV21, unlockRpV21, unlockMilestoneV21, buildingUnlockedV21, v21Level, v21Maxed } = await import('../src/data/buildings.js');
const { fxValue, fxBest, effectiveLevel, FX_KEYS } = await import('../src/core/effectEngine.js');
const { epStorageCap, v21BuildingCost, globalMult, offlineRate, offlineCap } = await import('../src/modules/economy.js');
const offMod = await import('../src/data/offlineUpgrades.js');

let pass = 0, fail = 0, red = [];
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; red.push(name); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

console.log('[1] 61 栋注册表 & 级制红线（组长硬性要求：非扩容类静态 cap ≤ 20；v2.4 扩容类 unlimited 豁免）');
t('getAllBuildings() 恰好 44 栋且 ID 唯一（v3.4.5 删除存储与续航整组 15 项）', () => {
  const all = getAllBuildings();
  assert.equal(all.length, 44, `实际 ${all.length} 栋`);
  assert.equal(new Set(all.map(b => b.id)).size, 44, 'ID 必须唯一');
});
t('既有 6 座 + v2.1 表 35 项 + 定向 3 栋 = 44（v3.4.5：组D 6 + 镜像 4 + 组G 5 共 15 项删除）', () => {
  assert.equal(V21_BUILDINGS.length, 35);
});
t('级制红线：非扩容类静态 cap/levels ≤ 20 且 ≥ 1；unlimited 扩容类豁免（禁止无限堆叠仅限非扩容）', () => {
  for (const b of getAllBuildings()) {
    if (b.unlimited) continue; // v2.4 KG 模式：扩容类无限升级
    const cap = b.cap ?? b.levels;
    assert.ok(cap >= 1, `${b.id} cap 必须 ≥1`);
    assert.ok(cap <= 20, `${b.id} cap=${cap} 超过 20 级红线`);
  }
});
t('级制红线：效果类 ≤9 级 / 乘算锚点(单级 ≥×1.5) ≤3 级 / 扩容类 unlimited 豁免', () => {
  for (const b of V21_BUILDINGS) {
    if (b.via === 'upgrade' || b.unlimited) continue; // 镜像走升级体系；v2.4 扩容类无限
    const fxs = Array.isArray(b.fx) ? b.fx : [b.fx];
    const k = fxs[0].key;
    if (k === 'capAdd') assert.ok(b.cap <= 20, `${b.id} 扩容类应 ≤20`);
    else if (typeof fxs[0].value === 'number' && fxs[0].value >= 1.5 && ['globalMul', 'clickMul', 'threadMul', 'rpMul', 'ppMul'].includes(k))
      assert.ok(b.cap <= 3, `${b.id} 乘算锚点应 ≤3`);
    else assert.ok(b.cap <= 9, `${b.id} 效果类应 ≤9`);
  }
});

console.log('[2] v2.1 数据完整性（PM §5.2）');
t('每栋 v2.1 建筑 fx 键均在效果引擎注册（v2.4 支持多键数组）', () => {
  for (const b of V21_BUILDINGS) {
    if (b.via === 'upgrade') continue;
    const fxs = Array.isArray(b.fx) ? b.fx : [b.fx];
    for (const f of fxs) {
      assert.ok(FX_KEYS.includes(f.key), `${b.id} 的 fx.key=${f.key} 未注册`);
      assert.ok('value' in f, `${b.id} 缺 fx.value`);
    }
  }
});
t('价格曲线字段完整：base ≥1、growth ∈ [1.15, 1.5]（PM「价格曲线温和」）', () => {
  for (const b of V21_BUILDINGS) {
    assert.ok(b.base >= 1, `${b.id} base 非法`);
    assert.ok(b.growth >= 1.15 && b.growth <= 1.5, `${b.id} growth=${b.growth} 越界`);
  }
});
t('unlockRp 定价 = 原科技 RP × 1.5（向上取整）', () => {
  for (const b of V21_BUILDINGS) {
    if (!b.unlockTech) continue;
    if (!BALANCE.legacyTechRp[b.unlockTech]) continue; // v2.7.4 阶段仓库解锁条件（storage3 等）非钥匙科技，无原 RP 定价
    const expect = Math.ceil((BALANCE.legacyTechRp[b.unlockTech] || 0) * BALANCE.buildingUnlockRatio);
    assert.equal(unlockRpV21(b), expect, `${b.id} 解锁 RP 定价不符`);
    assert.ok(expect > 0, `${b.id} 的 unlockTech=${b.unlockTech} 无原 RP 记录`);
  }
});
t('legacyTechRp 覆盖全部 46 个删除科技 + 6 钥匙', () => {
  const allTechRp = Object.keys(BALANCE.legacyTechRp);
  assert.equal(allTechRp.length, 52);
  for (const k of BALANCE.v21KeyTechs) assert.ok(allTechRp.includes(k), `钥匙 ${k} 缺原 RP`);
  // 每个建筑的 unlockTech 都有原 RP 记录（上面已断言 >0），此处校验钥匙族建筑存在
  const keyGated = V21_BUILDINGS.filter(b => b.unlockTech && BALANCE.v21KeyTechs.includes(b.unlockTech));
  assert.ok(keyGated.length >= 1, '钥匙科技应至少门控 1 座建筑（v3.4.5：offline1 族的信号塔删除后仅剩 focus_opt 族）');
});

console.log('[3] RESCALE 价梯（终章 §7 唯一数值基准）');
t('组A 锚链 6 栋：基价 2e6~5.5e6、growth ×1.45~1.50、3 级封顶（v3.4.2 反馈① 效能建筑涨价）', () => {
  const anchor = ['quantum_stacker', 'singularity_core', 'transcend_temple', 'ascend_spire', 'eternity_hall', 'end_shrine'];
  for (const id of anchor) {
    const b = V21_BUILDINGS.find(x => x.id === id);
    assert.ok(b.base >= 2e6 && b.base <= 5.5e6, `${id} 基价 ${b.base} 越界`);
    assert.ok(b.growth >= 1.45 && b.growth <= 1.50, `${id} growth 越界`);
    assert.equal(b.cap, 3);
  }
});
t('锚链末级价 ≤ 1.5e7（≤ 终局档上限量级，v3.4.2 反馈① 后重标）', () => {
  const anchor = ['quantum_stacker', 'singularity_core', 'transcend_temple', 'ascend_spire', 'eternity_hall', 'end_shrine'];
  for (const id of anchor) {
    const b = V21_BUILDINGS.find(x => x.id === id);
    const last = b.base * Math.pow(b.growth, b.cap - 1);
    assert.ok(last <= 1.5e7, `${id} 末级价 ${last} > 1.5e7`);
  }
});
t('调度中枢：1.2e6 × 1.40、9 级封顶、末级 ≈ 1.77e7（v3.4.2 反馈① 重标）', () => {
  const b = V21_BUILDINGS.find(x => x.id === 'dispatch_hub');
  assert.equal(b.base, 1.2e6); assert.equal(b.growth, 1.40); assert.equal(b.cap, 9);
  assert.ok(Math.abs(b.base * Math.pow(b.growth, 8) - 1.2e6 * Math.pow(1.4, 8)) < 1, '末级应 ≈1.77e7');
});
// v3.4.5 反馈③：「存储与续航」整组删除（组D 扩容梯 6 座 + 镜像 4 条 + 组G 离线 5 座）——原组D 断言一并移除
t('组I 晋升双楼：轮回圣殿 9e5×1.45（2 级 ×√2/级）、传奇职级殿 1.5e6×1.45（1 级 ×3），满级 ppMult=×6（v3.4.2 反馈① 重标）', () => {
  const c = V21_BUILDINGS.find(x => x.id === 'cycle_temple');
  const l = V21_BUILDINGS.find(x => x.id === 'legend_rank_hall');
  assert.deepEqual([c.base, c.growth, c.cap], [9e5, 1.45, 2]);
  assert.ok(Math.abs(c.fx.value - Math.SQRT2) < 1e-12);
  assert.deepEqual([l.base, l.growth, l.cap, l.fx.value], [1.5e6, 1.45, 1, 3]);
  // fxValue 满级验证
  S.buildings = { cycle_temple: 2, legend_rank_hall: 1 };
  assert.ok(Math.abs(fxValue('ppMul') - 6) < 1e-9, `满级 ppMul 应 ×6，实际 ${fxValue('ppMul')}`);
  S.buildings = {};
});
t('各组高端楼（C/E/F/H）基价 ≤3e8、growth ×1.28~1.50、末级 ≤3.6e8（v3.4.5 降本类大幅涨价后）', () => {
  const high = ['purchase_office_3', 'super_team', 'legend_institute', 'event_tide_lab', 'proj_parallel'];
  for (const id of high) {
    const b = V21_BUILDINGS.find(x => x.id === id);
    if (b.rpCost) continue; // RP 加成组按 RP 计价，不受 EP 阶梯约束
    assert.ok(b.base <= 3e8, `${id} 基价 ${b.base} > 3e8`);
    assert.ok(b.growth >= 1.28 && b.growth <= 1.50, `${id} growth=${b.growth} 越界`);
    const last = b.base * Math.pow(b.growth, b.cap - 1);
    assert.ok(last <= 3.6e8, `${id} 末级价 ${last} > 3.6e8`);
  }
});
t('非钳制建筑全量：任一级价格 ≤ 4e8（终局档 base 2e8 允许；v3.4.5 采购总署·极）', () => {
  for (const b of V21_BUILDINGS) {
    for (let n = 0; n < b.cap; n++) {
      const price = b.base * Math.pow(b.growth, n);
      assert.ok(price <= 4e8, `${b.id} 第 ${n + 1} 级价 ${price} > 4e8（终局档 base 2e8 允许）`);
    }
  }
});
t('解锁门控档位：minMile 显式优先，其余按 6e5→m5、1.5e6→m6、4e6→m7 价位映射', () => {
  for (const b of V21_BUILDINGS) {
    const g = unlockMilestoneV21(b);
    if (typeof b.minMile === 'number') { assert.equal(g, b.minMile); continue; }
    if (b.base >= 4e6) assert.equal(g, 7);
    else if (b.base >= 1.5e6) assert.equal(g, 6);
    else if (b.base >= 6e5) assert.equal(g, 5);
    else assert.equal(g, 0);
  }
  // v3.4.5：降本类涨价后仍按原档位开放（base 2.5e6 按价位映射会被顶到 m6，显式锁 m5）
  const bs = V21_BUILDINGS.find(x => x.id === 'bargain_shop');
  assert.equal(unlockMilestoneV21(bs), 5);
});
t('DC 重标定：base 8e4、growth 4、3 档 = 8e4 / 3.2e5 / 1.28e6（≤ 各期上限）', () => {
  const dc = BALANCE.buildings.datacenter;
  assert.equal(dc.base, 8e4); assert.equal(dc.growth, 4); assert.equal(dc.levels, 3);
  assert.equal(Math.ceil(dc.base * Math.pow(dc.growth, 0)), 8e4);
  assert.equal(Math.ceil(dc.base * Math.pow(dc.growth, 1)), 3.2e5);
  assert.equal(Math.ceil(dc.base * Math.pow(dc.growth, 2)), 1.28e6);
});

console.log('[4] 效果引擎聚合语义');
t('空注册表：加法键默认 0、乘算键默认 1、档位键默认 0', () => {
  S.buildings = {};
  assert.equal(fxValue('globalAdd'), 0);
  assert.equal(fxValue('globalMul'), 1);
  assert.equal(fxValue('offlineRate'), 0);
  assert.equal(fxValue('capAdd'), 0);
});
t('加法效果：warmup_node 5 级 = +10% 全局', () => {
  S.buildings = { warmup_node: 5 };
  assert.ok(Math.abs(fxValue('globalAdd') - 0.10) < 1e-12);
  S.buildings = {};
});
t('乘算效果：double_workshop 9 级 = ×1.12^9 ≈ ×2.66（v2.8.3 收敛）', () => {
  S.buildings = { double_workshop: 9 };
  assert.ok(Math.abs(fxValue('globalMul') - Math.pow(1.12, 9)) < 1e-9);
  S.buildings = {};
});
t('多建筑叠加：加法求和、乘算连乘', () => {
  S.buildings = { warmup_node: 5, eff_tower: 9 };
  assert.ok(Math.abs(fxValue('globalAdd') - (0.10 + 0.90)) < 1e-9);
  S.buildings = { quantum_stacker: 3, singularity_core: 3 };
  assert.ok(Math.abs(fxValue('globalMul') - Math.pow(1.20, 3) * Math.pow(1.25, 3)) < 1e-9); // v2.8.3 收敛
  S.buildings = {};
});
t('离线续航改由离线升级承担（v3.4.5 off_eff1~3 接力；v3.4.6 ⑧ 上限硬封顶 10h，off_cap2 已删）', () => {
  const { OFF_UPGRADES } = offMod;
  const ids = OFF_UPGRADES.map(o => o.id);
  for (const id of ['off_eff1', 'off_eff2', 'off_eff3', 'off_cap1']) assert.ok(ids.includes(id), `离线升级应含 ${id}`);
  assert.ok(!ids.includes('off_cap2'), 'v3.4.6 ⑧：off_cap2 已删除（上限 10h 封顶后无意义）');
  S.buildings = {}; S.upgrades = {}; S.milesDone = {}; S.tech = {}; S.offUpgrades = {}; S.runTalent = null;
  S.storyline = 'default'; S.religion = {}; S.delve = { up: {} }; S.prestigePoints = 0; S.offHistory = [];
  const base = offlineRate();
  S.offUpgrades = { off_eff1: true }; const r1 = offlineRate();
  S.offUpgrades = { off_eff1: true, off_eff2: true }; const r2 = offlineRate();
  S.offUpgrades = { off_eff1: true, off_eff2: true, off_eff3: true }; const r3 = offlineRate();
  assert.ok(r1 > base && r2 > r1 && r3 > r2, `离线效率应逐级提升：${base}→${r1}→${r2}→${r3}`);
  S.offUpgrades = { off_cap1: true };
  assert.equal(offlineCap(), 10 * 3600, 'v3.4.6 ⑧：离线上限硬封顶 10h（基础 8 + I 的 4 = 12 → 钳制 10）');
  S.offUpgrades = { off_cap1: true, off_cap2: true };
  assert.equal(offlineCap(), 10 * 3600, '旧档 off_cap2 存量同样被钳到 10h');
  S.offUpgrades = {};
});
t('v2.6.3 反馈①：B「点击与暴击」分区移除——暴击/点击乘数建筑不再存在于数据表', () => {
  const ids = ['field_1', 'field_2', 'field_3', 'field_4', 'crit_furnace', 'crit_reactor', 'crit_reactor_2'];
  for (const id of ids) {
    assert.ok(!V21_BUILDINGS.some(x => x.id === id), `${id} 应已移除`);
  }
  assert.equal(fxBest('clickCrit'), null, '点击暴击应恒为 null');
  assert.equal(fxBest('autoCrit'), null, '自动暴击应恒为 null');
});
t('级制红线读侧：非扩容超封等级截断到 cap（v3.4.5：组D unlimited 建筑删除，扩容不再走建筑 fx）', () => {
  S.buildings = { warmup_node: 99 };
  assert.equal(effectiveLevel('warmup_node'), 5);
  assert.ok(Math.abs(fxValue('globalAdd') - 0.10) < 1e-12, '超封等级不得贡献效果');
  assert.equal(fxValue('capAdd'), 0, '建筑侧不再提供 capAdd（EP 上限走升级商店 + 三仓库）');
  S.buildings = {};
});
t('镜像建筑（storage/cache）不参与 fx 聚合（由 epStorageCap 直读 upgrades）', () => {
  S.buildings = {}; S.upgrades = { storage: 20, cache: 20 };
  assert.equal(fxValue('capAdd'), 0);
  S.upgrades = {};
});

console.log('[5] 上限公式集成（终章 §1 锚点，capAdd 加法基座位置：DC 之后、里程碑乘算之前）');
function setCapState(cache, storage, dc, pool, dim, over, miles, storyline) {
  S.upgrades = { cache, storage };
  S.buildings = { datacenter: dc, quantum_pool: pool, dim_compressor: dim, overlimit_store: over };
  S.milesDone = {};
  for (let i = 0; i < miles; i++) S.milesDone['m' + i] = true;
  S.storyline = storyline || 'line_abyss';
}
t('m=6 期锚点：cache12/storage20/DC2 → epStorageCap = 1,043,625（v3.4.6 ⑫：存储节点改 +12,000/级恒定）', () => {
  setCapState(12, 20, 2, 0, 0, 0, 6);
  assert.equal(epStorageCap(), 1043625, `实际 ${epStorageCap()}`);
});
t('storage/cache/DC3 满配 m=9 → epStorageCap = 1,689,350（v3.4.6 ⑫ 曲线重算）', () => {
  setCapState(20, 20, 3, 0, 0, 0, 9);
  assert.equal(epStorageCap(), 1689350, `实际 ${epStorageCap()}`);
});
t('开局锚点：storage1/其余 0 → 16,100（v3.4.6 ⑫：存储节点首级 +12,000，line_abyss ×1.15）', () => {
  setCapState(0, 1, 0, 0, 0, 0, 0);
  assert.equal(epStorageCap(), 16100); // (2000 + 12000) × 1.15
});
t('开局锚点：reserve_bin1/其余 0 → 6,900（v3.4.6 ⑫：粮仓首级 +4,000；钳制价 600 前期可负担）', () => {
  setCapState(0, 0, 0, 0, 0, 0, 0);
  S.upgrades.reserve_bin = 1;
  assert.equal(epStorageCap(), 6900); // (2000 + 4000) × 1.15
  S.upgrades.reserve_bin = 0;
});

console.log('[6] 防死锁 30% 钳制（组长硬性要求：组D 三梯任意阶段买得起）');
t('v3.4.5：v21CapClampIds 随组D 清空（30% 钳制仅剩升级商店 storage/cache 的 CAP_EXPANSION_IDS 路径）', () => {
  assert.deepEqual(BALANCE.v21CapClampIds, [], '效能建筑侧不再有需要 30% 钳制的扩容梯');
});
t('钳制只作用于组D 三梯 + storage/cache，非扩容建筑不受 30% 约束（§5.4）', () => {
  setCapState(0, 1, 0, 0, 0, 0, 0);
  const b = V21_BUILDINGS.find(x => x.id === 'end_shrine');
  // 首级价 5.4e6 远超开局 30%×4600，但非扩容项不钳制——按原价
  const cost = v21BuildingCost(b);
  assert.equal(cost, Math.ceil(5.4e6 * Math.pow(1.5, 0)), '非扩容建筑价格不得被 30% 钳制');
});

console.log('[7] 解锁链路');
t('buildingUnlockedV21：RP 标记 + 里程碑门控 + 钥匙科技门控三重判定', () => {
  S.upgrades = {}; S.buildings = {}; S.milesDone = {}; S.unlockedBuildings = {}; S.tech = {};
  const b = V21_BUILDINGS.find(x => x.id === 'quantum_stacker'); // base 2e6 → m6 门控（v3.4.2 价位映射）
  assert.equal(buildingUnlockedV21(b, S), false, '未解锁 + 里程碑不足');
  S.unlockedBuildings = { quantum_stacker: true };
  assert.equal(buildingUnlockedV21(b, S), false, 'RP 已解锁但 m<6 不可购');
  for (let i = 0; i < 6; i++) S.milesDone['m' + i] = true;
  assert.equal(buildingUnlockedV21(b, S), true, 'm≥6 + RP 解锁 → 可购');
  // 钥匙科技门控：focus_core（focus_opt 族，v2.6.3 后以非点击系钥匙为样本）
  const fc = V21_BUILDINGS.find(x => x.id === 'focus_core');
  S.unlockedBuildings = { focus_core: true };
  assert.equal(buildingUnlockedV21(fc, S), false, 'focus_opt 未购 → 不可购');
  S.tech = { focus_opt: true };
  assert.equal(buildingUnlockedV21(fc, S), true, 'focus_opt 已购 → 可购');
  S.tech = {}; S.unlockedBuildings = {};
});
t('v21Level / v21Maxed / buildingCostV21 基础读侧', () => {
  S.buildings = { warmup_node: 3 };
  const b = V21_BUILDINGS.find(x => x.id === 'warmup_node');
  assert.equal(v21Level('warmup_node', S), 3);
  assert.equal(v21Maxed(b, S), false);
  assert.equal(buildingCostV21(b, S, 1), Math.ceil(2.5e5 * Math.pow(1.35, 3))); // v3.4.2 反馈① warmup base 2.5e5/growth 1.35
  S.buildings = { warmup_node: 5 };
  assert.equal(v21Maxed(b, S), true);
  S.buildings = {};
});

console.log('[8] globalMult 建筑驱动迁移（P3 前置语义断言）');
t('科技乘数全部退场：仅剩科技满购时 globalMult 基线 = 无科技贡献', () => {
  setCapState(0, 0, 0, 0, 0, 0, 0, 'default');
  S.tech = { warmup: 1, lean: 1, eff2: 1, speed2: 1, quantum2: 1, singular: 1, transcend: 1, ascend: 1, eternity: 1, true_end: 1, auto2: 1 };
  S.prestigePoints = 0; S.runTalent = null; S.eternal = {}; S.pets = {}; S.activePets = [];
  S.upgrades = {}; S.religion = {}; S.cultists = [];
  const m = globalMult();
  assert.ok(Math.abs(m - 1) < 1e-9, `旧乘数科技满购后 globalMult 应为 1（科技=钥匙不参与计算），实际 ${m}`);
  S.tech = {};
});

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) { console.log('失败项:', red.join(' | ')); process.exit(1); }
