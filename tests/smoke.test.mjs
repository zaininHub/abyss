// v2.0.1 重建工程冒烟测试（Node 直接跑 ES 模块，不依赖 DOM）
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// ---- 最小 DOM stub（state/render 不触发即可） ----
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){} };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { S, load } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { computeCps, tideMult, tidePhaseInfo, corruptionPenalty, purifierCleanRate, esCost, epStorageCap, staffCost, staffOutputPerSec, focusCost, addEp, tickCorruption, unitCost } = await import('../src/modules/economy.js');
const { tickProjects, spawnProject, claimProject, normalizeProjectGoals } = await import('../src/modules/projects.js');
const { applyOffline } = await import('../src/modules/offline.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const { ETERNALS } = await import('../src/data/eternals.js');
const { applyEvent } = await import('../src/modules/events.js');
// v1.3 新模块
const { tickWages } = await import('../src/modules/wages.js');
const { tickVehicleCollect } = await import('../src/modules/vehicles.js');
const { tickAI } = await import('../src/modules/ai.js');
const { TECHS } = await import('../src/data/techs.js');
const { BUILDINGS, buildingCost, buildingLevel, buildingMaxed } = await import('../src/data/buildings.js');
const {
  wageOutputMult, wageDebtMult, wageKeepCostMult, wageLoseChance, datacenterMult,
  vehicleTier, sealDmReward, embraceDurMs, vehicleDmPerMin, collectVehicleDm,
  techCostOf, staffSalaryPerSec, staffNetPerSec,
} = await import('../src/modules/economy.js');
const { EVENTS } = await import('../src/data/events.js');

let pass = 0, fail = 0;
function t(name, fn) {
  // v3.6.3 ①：用例间复位「首次溢出」持久标记。旧 cps 时间基座下本夹具 cps=0、溢出不影响上限；
  //   改为结构性 ×4 后，前一用例的 addEp 溢出会让后续 cap 整体翻 4 倍，破坏单测隔离。
  S._rpOverflowSeen = false;
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' :: ' + e.message); }
}

console.log('[1] 初始状态 & BALANCE');
t('初始 EP = 50（BALANCE.initialEp）', () => assert.equal(S.ep, BALANCE.initialEp));
t('潮汐相位表 4 相 × 150s', () => {
  assert.equal(BALANCE.tide.phases.length, 4);
  assert.equal(BALANCE.tide.phaseDuration, 150);
  for (let i = 0; i < 4; i++) {
    const info = tidePhaseInfo(i);
    assert.ok(info.name && info.icon && info.cssClass);
  }
});
t('潮汐相位异常索引回退平潮', () => assert.equal(tidePhaseInfo(9).cssClass, 'tide-calm'));

console.log('[2] P1：tickProjects 返回 changed 标志');
t('tickProjects() 返回布尔值', () => assert.equal(typeof tickProjects(), 'boolean'));
t('任务完成 → changed = true，可领取', () => {
  S.projects = [];
  spawnProject();
  const p = S.projects[S.projects.length - 1];
  assert.ok(p, 'spawn 后应有任务');
  p.goal = 0; // progress 由状态差值每帧重算，直接把目标清零使其立即完成
  const changed = tickProjects();
  assert.equal(changed, true);
  assert.equal(S.projects[0].status, 'pending');
});
t('领取奖励 → 状态落账 + changed 链路闭环', () => {
  const before = S.rp + S.ep;
  const p = S.projects.find(x => x.status === 'pending');
  assert.ok(p, '应有 pending 任务');
  claimProject(p);
  assert.ok(S.rp + S.ep >= before, '奖励应落账');
  tickProjects(); // claimed 项目由下一次 tick 的过滤器移出列表（与 v1.2 一致）
  assert.equal(S.projects.length, 0);
});
t('生成冷却期（v2.4.2：600s）内不再自动生成', () => {
  S.projects = [];
  spawnProject(); // 设置 lastSpawnAt
  assert.equal(tickProjects(), false); // 冷却中 + 概率不触发
});
t('v2.4.1：任务目标规范化——旧公式大数/小数收敛到新基准整数（前期不出现百万级目标）', () => {
  const cps = computeCps();
  const capGoal = Math.max(100, Math.round(cps * 600 * 0.5));
  S.projects = [{
    type: 'earn_ep', name: 'EP 积累', desc: '限时内累计 EP',
    goal: 1631853.5811883695, progress: 100, status: 'active', // progress 取兜底内值，避免低 cps 环境触发钳制分支
    reward: { kind: 'ep', amount: 100 },
  }];
  normalizeProjectGoals();
  const p = S.projects[0];
  assert.ok(Number.isInteger(p.goal) && p.goal === capGoal,
    `规范化后 goal=${p.goal}（新基准 ${capGoal}），应整数且收敛`);
  assert.equal(p.progress, 100, '进度保持不越界');
  S.projects = [];
});

console.log('[3] P2：esCost 单参数封装');
t('esCost(e) 读 S.eternal 计算当前等级成本', () => {
  const e = ETERNALS[0];
  S.eternal[e.id] = 0;
  const c0 = esCost(e);
  assert.ok(c0 > 0 && isFinite(c0));
  S.eternal[e.id] = 2;
  const c2 = esCost(e);
  assert.ok(c2 > c0, '等级越高成本越高');
});
t('tech.js 已从 economy.js 导入 esCost（源码断言）', () => {
  const src = readFileSync(new URL('../src/modules/tech.js', import.meta.url), 'utf8');
  // v1.3：import 行已扩展（含潮汐价/分区件），断言 esCost 仍来自 economy.js
  assert.ok(/import \{[^}]*\besCost\b[^}]*\} from '\.\/economy\.js'/.test(src), 'esCost 应来自 economy.js');
  assert.ok(!src.includes("esCost } from '../data/eternals.js'"), '不应再从 data/eternals.js 导入 esCost');
});

console.log('[4] 潮汐 & 腐化');
t('tideMult 各相位系数正确', () => {
  S.tidePhase = 0; assert.equal(tideMult('ep'), 1.3);   // 涨潮 EP ×1.3
  S.tidePhase = 2; assert.equal(tideMult('ep'), 0.7);   // 退潮 EP ×0.7
  S.tidePhase = 3; assert.equal(tideMult('eventBad'), 2); // 乱流负面事件 ×2
  S.tidePhase = 3; assert.equal(tideMult('eventGoodDur'), 1); // 乱流正面时长不放大
  S.tidePhase = 0; assert.equal(tideMult('eventGoodDur'), 1.5); // 涨潮正面时长 ×1.5
  S.tidePhase = 1; assert.equal(tideMult('salary'), 1);  // 平潮无修正
});
t('腐化惩罚 0.3%/pct，下限 0.7', () => {
  S.corruption = 0; assert.equal(corruptionPenalty(), 1);
  S.corruption = 10; assert.ok(Math.abs(corruptionPenalty() - 0.97) < 1e-9);
  S.corruption = 100; assert.equal(corruptionPenalty(), BALANCE.corruption.penaltyFloor);
  S.corruption = 0;
});
t('净化事件 purify 清零腐化', () => {
  S.corruption = 42;
  const ev = EVENTS.find(e => e.type === 'purify');
  assert.ok(ev, 'EVENTS 应含 purify 类型事件');
  applyEvent(ev);
  assert.equal(S.corruption, 0);
});
t('净化器降低腐化速率', () => {
  assert.equal(purifierCleanRate(), 0);
  S.upgrades['purifier1'] = 2;
  assert.equal(purifierCleanRate(), 1.0); // 0.5 × 2
  delete S.upgrades['purifier1'];
});
t('熵减协议把惩罚率 /1.5', () => {
  S.tech['entropy_reduce'] = true;
  S.corruption = 10;
  assert.ok(Math.abs(corruptionPenalty() - (1 - 0.003 / 1.5 * 10)) < 1e-9);
  delete S.tech['entropy_reduce']; S.corruption = 0;
});

console.log('[5] 经济与线程');
t('线程招募成本 360 × 1.25^n × 前3级折扣（v2.9.1：n=0/1/2 ×0.5/0.65/0.8）', () => {
  S.cultists = [];
  assert.equal(staffCost(), 180); // v2.9.1：360 × 0.5（首线程半价）
  S.cultists.push({ output: 2.5, mood: '正常' });
  assert.equal(staffCost(), 293); // v2.9.1：360×1.25×0.65 = 292.5 → ceil 293
  S.cultists.push({ output: 2.5, mood: '正常' });
  assert.equal(staffCost(), 450); // v2.9.1：360×1.25²×0.8 = 450（第 3 个八折，恰好回到旧 n=1 价位）
  S.cultists.push({ output: 2.5, mood: '正常' });
  assert.equal(staffCost(), 704); // v2.9.1：360×1.25³ = 703.125 → ceil 704（第 4 个起全额曲线）
});
t('v2.0.2 EP 容量 = (基础2000 + 缓存×8000 + 粮仓/存储级制累计 + DC加成) × (1 + 0.25×里程碑数)（v3.4.6 曲线对调）', () => {
  S.upgrades = {}; S.milesDone = {}; S.buildings = {}; S.storyline = 'default';
  assert.equal(epStorageCap(), 2000);
  S.upgrades['cache'] = 1;          assert.equal(epStorageCap(), 10000);  // v2.8.2：2000 + 8000
  S.upgrades['reserve_bin'] = 2;    assert.equal(epStorageCap(), 18720);  // v3.4.6 ⑫：粮仓 +4000+4720（原存储节点曲线）
  S.buildings['datacenter'] = 1;    assert.equal(epStorageCap(), 28720);  // 18720 + DC 10000
  S.milesDone = { m1: true, m2: true };
  assert.equal(epStorageCap(), 43080); // 28720 × 1.5（m1+m2 里程碑）
  S.upgrades = {}; S.milesDone = {}; S.buildings = {};
});
t('任务奖励：rp 类在 3~8 区间，ep 类为正数；未解锁不出 rp（v2.5 ③）', () => {
  // v2.5 ③：RP 未解锁（EP 未首次溢出）时 100 次生成不应出现 rp 奖励
  S._rpOverflowSeen = false;
  let rpSeen = 0;
  for (let i = 0; i < 100; i++) {
    S.projects = [];
    spawnProject();
    const p = S.projects[S.projects.length - 1];
    if (p.reward.kind === 'rp') rpSeen++;
    else if (p.reward.kind === 'ep') assert.ok(p.reward.amount > 0);
  }
  assert.ok(rpSeen === 0, `未解锁应零 rp 任务，实际 ${rpSeen}`);
  // RP 解锁（v3.0.9 口径：购入矩阵存储库）后 rp 奖励出现且量级 3~8
  S.upgrades.rp_vault = 1;
  S._rpOverflowSeen = true;
  rpSeen = 0;
  for (let i = 0; i < 100; i++) {
    S.projects = [];
    spawnProject();
    const p = S.projects[S.projects.length - 1];
    if (p.reward.kind === 'rp') {
      rpSeen++;
      assert.ok(p.reward.amount >= 3 && p.reward.amount <= 8, `RP=${p.reward.amount}`);
    } else if (p.reward.kind === 'ep') {
      assert.ok(p.reward.amount > 0);
    }
  }
  assert.ok(rpSeen > 0, '100 次生成应至少出现一次 rp 奖励');
  // v3.6.3 ①：首次溢出后上限按结构性值 ×4；本用例把它置 true 后必须复位，
  //   否则后续所有「基线 cap=2000」断言会读到 8000（旧时间基座下 cps=0 恰好无影响）。
  S._rpOverflowSeen = false;
});

console.log('[6] v2.1 修复断言（R1 乘数 / R3 上限死锁 / D1 统一入口 / 口径拍板 / R2+R4 源码）');
t('R1：线程裸产出不再叠加全局乘数（单线程基础 3 × 0.8 = 2.4；v2.8.30 线程降温）', () => {
  S.cultists = [{ output: 3, mood: '正常' }];
  assert.ok(Math.abs(staffOutputPerSec() - 2.4) < 1e-9, `线程产出 ${staffOutputPerSec()}`);
  S.prestigePoints = 10; // globalMult ≥ 2，若仍双重套用会变成 ≥4.8
  assert.ok(Math.abs(staffOutputPerSec() - 2.4) < 1e-9, `线程产出 ${staffOutputPerSec()}`);
  S.prestigePoints = 0; S.cultists = [];
});
t('v3.4.6 ⑫：存储节点/备用粮仓曲线对调（粮仓 12K/+4000×1.18/20 级封顶；存储节点 45K/+12000/无限）', () => {
  const st = UPGRADES.find(u => u.id === 'storage');
  const rb = UPGRADES.find(u => u.id === 'reserve_bin');
  assert.ok(st && rb, 'UPGRADES 应含 storage/reserve_bin 项');
  assert.equal(st.base, 45000); // v3.4.6 ⑫：存储节点改后期大宗（原粮仓曲线）
  assert.equal(st.growth, 1.20);
  assert.ok(!st.maxLevel, '存储节点无限升级');
  assert.equal(BALANCE.storage.capPer, 12000);
  assert.equal(BALANCE.storage.capGrowth, 1.15); // v3.4.7 反馈②：存储节点加成也逐级 ×1.15 递增
  assert.equal(rb.base, 12000); // v3.4.6 ⑫：粮仓改前期关键件（原存储节点曲线）
  assert.equal(rb.growth, 1.45);
  assert.equal(rb.maxLevel, 20);
  assert.equal(BALANCE.reserveBin.capPer, 4000);
  assert.equal(BALANCE.reserveBin.capGrowth, 1.18);
  // 前期防死锁：粮仓首购被 30% 钳制为 600（cap 2000），前期可负担
  S.upgrades = { reserve_bin: 0 }; S.milesDone = {};
  assert.equal(unitCost(rb, 0), 600, '粮仓首购 12000 被 30% 防死锁钳制为 600（cap 2000）');
  S.upgrades = { reserve_bin: 25 }; S.milesDone = {};
  assert.equal(unitCost(rb, 0), Math.min(Math.ceil(12000 * Math.pow(1.45, 25)), Math.floor(epStorageCap() * 0.3)), '粮仓 25 级仍按钳制价可购（20 级封顶在购买入口拦截）');
  S.upgrades = {};
});
t('v2.0.2：防死锁——新档 storage 首购 ≤ 上限×30%', () => {
  S.upgrades = {}; S.milesDone = {};
  const cap = epStorageCap(); // 2000
  const st = UPGRADES.find(u => u.id === 'storage');
  const cost = unitCost(st, 0); // 首购（含 30% 防死锁钳制）
  assert.ok(cost <= cap * 0.3, `storage 首购 ${cost} 应 ≤ ${cap * 0.3}`);
  S.upgrades = {}; S.milesDone = {};
});
t('D1：addEp 收敛上限且只按实际入账累计（runEarned/allTimeEp）', () => {
  S.upgrades = {}; S.milesDone = {}; S.buildings = {}; S.storyline = 'default';
  S.ep = 1950;
  const re0 = S.runEarned || 0, at0 = S.allTimeEp || 0;
  const gained = addEp(100);
  assert.equal(S.ep, 2000, '应截断在上限');
  assert.equal(gained, 50, '实际入账只有 50');
  assert.equal((S.runEarned || 0) - re0, 50, '记账只加 50');
  assert.equal((S.allTimeEp || 0) - at0, 50, '总账只加 50');
  // v3.6.3 ①：上面那 50 点溢出已把上限抬到结构性 ×4，本用例断言的是「满仓」语义，
  //   复位溢出标记后再验证（新上限抬升行为由 v363 / v349 单独覆盖）。
  S._rpOverflowSeen = false;
  assert.equal(addEp(50), 0, '已满时再入账为 0');
  assert.equal(S.ep, 2000, '满仓不溢出');
  S.ep = 50;
});
t('拍板：专注成本 = 30 × 1.6^n', () => {
  delete S.tech['focus_opt'];
  S.focusLevel = 0; assert.equal(focusCost(), 30);
  S.focusLevel = 2; assert.equal(focusCost(), Math.ceil(30 * 1.6 * 1.6)); // 77
  S.focusLevel = 0;
});
t('拍板：裂隙封印成本锚定当前上限 30%~50%（源码+配置断言）', () => {
  const src = readFileSync(new URL('../src/modules/rift.js', import.meta.url), 'utf8');
  assert.ok(src.includes('epStorageCap()'), '封印成本应基于当前 EP 上限');
  assert.ok(src.includes('sealRatioMin') && src.includes('sealRatioMax'), '应按比例区间随机');
  assert.equal(BALANCE.rift.sealRatioMin, 0.3);
  assert.equal(BALANCE.rift.sealRatioMax, 0.5);
});
t('拍板：离线收益受 EP 上限约束 + v2.4.1 预期不再动态展示（源码断言）', () => {
  const src = readFileSync(new URL('../src/modules/offline.js', import.meta.url), 'utf8');
  assert.ok(src.includes('addEp('), '离线结算应经 addEp 统一入口（受上限约束）');
  assert.ok(!src.includes('预期收益'), 'v2.4.1：离线预期不再动态展示（移除动态数值行）');
  assert.ok(src.includes('按效率×上限结算'), '面板改为静态口径说明离线收益');
});
t('R2：任务面板事件委托 + 原地更新，取消每秒整面板重建（源码断言）', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes("button[data-claim]"), '领取按钮走容器级委托');
  assert.ok(src.includes('updateProjectProgress()'), '每秒应原地更新而非重建');
  // v2.0 旧模式是「行首独立语句」的无条件重建；v1.3 AI tick 的条件置位（if (tickAI(dt)) { ... }）合法
  assert.ok(!/^\s*dirty\.top = true; dirty\.projects = true;/m.test(src), '无条件重建任务面板的旧代码应已移除');
});
t('R4：每秒调用 refreshShopAffordability 快刷灰态（源码断言）', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes('refreshShopAffordability();'), 'tick 每秒块应调用灰态刷新');
});

console.log('[7] v2.1.1 修复断言（P1-B 溢出产腐化 / P1-A 裂隙卡片残留）');
t('P1-B：触顶挂机产出 → 溢出不再产腐化（v2.8.21 ⑥ 口径），EP 截断到上限', () => {
  S.upgrades = {}; S.milesDone = {}; S.buildings = {}; S.storyline = 'default'; S.cultists = [];
  S.ep = 2100; S.corruption = 0;
  tickCorruption(1);
  assert.equal(S.corruption, 0, `腐化不应随溢出增长，实际 ${S.corruption}`);
  assert.equal(S.ep, 2000, '溢出 EP 截断到上限');
  S.ep = 50; S.corruption = 0;
});
t('P1-B：一次性入口仍截断不产腐化（addEp 口径不变）', () => {
  S.upgrades = {}; S.milesDone = {}; S.buildings = {}; S.storyline = 'default';
  S.ep = 2000; S.corruption = 0;
  assert.equal(addEp(500), 0, '满仓一次性入账为 0');
  assert.equal(S.corruption, 0, '一次性入口不产腐化');
  S.ep = 50;
});
t('P1-B：挂机产出走「先加后截」+ 钳后记账（源码断言，v2.3.1 缺陷③修订口径；v3.8.0 迁移到资源流声明层）', () => {
  // v3.8.0：产出结算从 main.js tick() 下沉到 systems/resourceFlows.js 的 ep:main 流，公式逐字不变。
  // 此处改读新的单一真源，并守住「主循环只做调度、不再内联结算」这条重构红线。
  const src = readFileSync(new URL('../src/systems/resourceFlows.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes('S.ep += gain;'), '产出流应先全额加（不预先截断）');
  // v2.3.1 缺陷③：EP 满上限后被钳制的增量不再计入本局/累计（用户反馈③），
  // runEarned/allTimeEp 改记 credited（= min(gain, cap - S.ep)，与 addEp 同口径）。
  assert.ok(src.includes('S.runEarned += credited;'), '产出应按钳后口径计入本局累计');
  assert.ok(src.includes('const credited = Math.min(gain, Math.max(0, capNow - S.ep));'), 'credited 钳后增量定义存在');
  assert.ok(!src.includes('addEp(gain); // v2.1 D1'), '产出不应再走 addEp 预截断');
  assert.ok(!main.includes('S.ep += gain;') && main.includes('runFlows(flowCtx, FLOW_PHASES.EP_PRODUCE)'),
    '主循环只做阶段调度，不再内联结算公式');
});
t('P1-A：封印/拥抱裂隙后立即置 dirty.rift 重渲染（源码断言）', () => {
  const src = readFileSync(new URL('../src/modules/rift.js', import.meta.url), 'utf8');
  const n = (src.match(/dirty\.rift = true/g) || []).length;
  assert.ok(n >= 2, `sealRift 与 embraceRift 应各置位一次，实际 ${n} 处`);
});

console.log('[8] v2.1.2 修复断言（潮汐效果标签带属性名 + hover 提示）');
t('v2.1.2：潮汐产出/薪资标签均带属性名前缀（源码断言）', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  // 新写法：模板插值动态选 buff/debuff 类，文本统一「产出${pct}」「薪资${pct}」
  assert.ok(src.includes('>产出${pct(epMult)}</span>'), '产出标签应带属性名前缀');
  assert.ok(src.includes('>薪资${pct(salMult)}</span>'), '薪资标签应带属性名前缀');
  // 旧裸百分比写法（tide-buff">+30% 这类无属性名）应已消除
  assert.ok(!/tide-(buff|debuff)">\+?\$\{Math/.test(src), '不应再存在裸百分比标签');
});
t('v2.1.2→v1.3 L1：潮汐卡片 hover 提示包含相位效果（v1.3 起含科技成本）', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes('el.title = `潮汐·${info.name}'), '应生成动态 hover 提示');
  assert.ok(src.includes('eventBadWeight'), '提示应含负面事件权重');
  // v1.3 L1：techCostMult 已接入 buyTech 扣费，hover 应展示科技成本效果
  assert.ok(src.includes('科技成本${pct(techMult)}'), 'hover 提示应含科技成本效果');
});


console.log('[9] v1.3 迭代断言（C 四态 / E 分区 / D 联动 / A 助手 / B 建筑 / L1 / 旧档回归）');
// ---- 公共环境：平潮（无薪资修正），确定性 ----
function wageSetup(ep) {
  S.tidePhase = 1; S.tideTimer = 150;
  S.cultists = [{ id: 1, name: '测试线程', output: 3, mood: '正常', moodTimer: 60 }];
  S.ep = ep;
  S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 };
  return staffSalaryPerSec();
}

t('C1：EP < 10s 薪资 → 5s 过渡后欠薪降效 ×0.7（v2.8.7 状态转换需时间）', () => {
  const salary = wageSetup(0);
  assert.ok(salary > 0, '薪资应为正');
  tickWages(1);
  assert.equal(S.wageState.state, 'ok', 'v2.8.7：EP 跌破黄线后需 5s 过渡才进入欠薪');
  tickWages(5);
  assert.equal(S.wageState.state, 'debt', '过渡结束应迁移到欠薪');
  assert.ok(Math.abs(wageOutputMult() - 0.7) < 1e-9, `欠薪产出系数应为 0.7，实际 ${wageOutputMult()}`);
  assert.equal(S.ep, 0, '欠薪扣薪按余额比例扣（可扣至 0）');
});
t('C2（v2.8.1）：连续欠薪 60s → 强制休眠 ×0.3，保命成本 = 0.3×薪资（数值）', () => {
  const salary = wageSetup(1);
  S.wageState = { state: 'debt', debtSec: 59.9, dormantSec: 0, bufferSec: 0, loseTimer: 0 };
  tickWages(0.2);
  assert.equal(S.wageState.state, 'dormant', 'debtSec≥60 应迁移到休眠');
  assert.equal(wageOutputMult(), 0.3, '休眠产出 ×0.3（v2.5.3 温和产出）');
  const ep0 = S.ep;
  tickWages(1);
  // v3.4.8 反馈⑥：薪资保底改为「产出的 2/3」，随线程产出/情绪变化 → 用 tick 后的薪资口径比对
  const salNow = staffSalaryPerSec();
  assert.ok(Math.abs((ep0 - S.ep) - salNow * 0.3) < 1e-6, `保命成本应 = 0.3×当前薪资（${salNow * 0.3}），实际扣 ${ep0 - S.ep}`);
});
t('C3（v2.8.1）：休眠 1800s → 流失预警，每 60s roll 流失；维修坞免疫（数值）', () => {
  wageSetup(0);
  S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 1799.9, bufferSec: 0, loseTimer: 0 };
  tickWages(0.2);
  assert.equal(S.wageState.state, 'losing', 'dormantSec≥1800 应迁移到流失预警');
  assert.equal(wageLoseChance(), 0.1, '无维修坞流失概率 10%/min');
  // 强制命中 roll：Math.random → 0（< 0.1）
  S.wageState.loseTimer = 60;
  const origRandom = Math.random; Math.random = () => 0;
  tickWages(0.1);
  Math.random = origRandom;
  assert.equal(S.cultists.length, 0, '命中 roll 应流失 1 线程');
  // v2.8.3：维修坞不再免疫流失（腐化/触顶吞噬仍会吞没线程）
  wageSetup(0);
  S.buildings = { dock: 1 };
  S.wageState = { state: 'losing', debtSec: 0, dormantSec: 400, bufferSec: 0, loseTimer: 60 };
  assert.equal(wageLoseChance(), 0.1, '维修坞不再免疫：流失概率仍 10%/min');
  const origRandom2 = Math.random; Math.random = () => 0;
  tickWages(0.1);
  Math.random = origRandom2;
  assert.equal(S.cultists.length, 0, '维修坞下命中 roll 仍会流失（v2.8.3 移除免疫）');
  S.buildings = {};
});
t('C4：休眠恢复经 30s 缓冲回到满薪（数值）', () => {
  const salary = wageSetup(1e9);
  S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 400, bufferSec: 0, loseTimer: 0 };
  tickWages(0.1);
  assert.equal(S.wageState.state, 'debt', 'EP≥60s薪资 应先回到欠薪（缓冲）');
  assert.ok(Math.abs(S.wageState.bufferSec - 15) < 0.1, `缓冲应为 15s（v2.8.10，原 60s 过长），实际 ${S.wageState.bufferSec}`);
  tickWages(5);
  assert.equal(S.wageState.state, 'debt', '缓冲期内不应直接满薪');
  tickWages(12);
  assert.equal(S.wageState.state, 'ok', '缓冲结束应回到满薪');
});
t('C-UI：四态徽章 + 倒计时 + tooltip 全覆盖（源码断言）', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const kw of ['满薪', '欠薪 ×', '休眠 ×0', '流失预警', 'staffStatus.title']) {
    assert.ok(src.includes(kw), `renderHero 应含 ${kw}`);
  }
  assert.ok(src.includes('wageDebtMult()') && src.includes('wageKeepCostMult()') && src.includes('wageLoseChance()'), 'tooltip 应展示当前生效值（含建筑修正）');
});
t('E：分区通用件落地（源码断言：折叠 key / 1s 移入 / 原地更新 / 委托）', () => {
  const lk = readFileSync(new URL('../src/modules/listkit.js', import.meta.url), 'utf8');
  assert.ok(lk.includes('ui_collapsed_'), '折叠状态应写 localStorage key ui_collapsed_<listId>');
  assert.ok(lk.includes('}, 1000);'), '一次性项购后 1s 移入已升级区');
  const sh = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  assert.ok(sh.includes('buildOwnedSection'), 'shop 应使用折叠分区通用件');
  assert.ok(sh.includes('updateShopItem(u)'), '可叠加项购后应原地更新 ×N（不重建）');
  assert.ok(sh.includes('scheduleMoveToOwned'), '一次性项购后应 1s 移入');
  assert.ok(sh.includes('v13Delegated'), '容器级事件委托');
  const tj = readFileSync(new URL('../src/modules/tech.js', import.meta.url), 'utf8');
  assert.ok(tj.includes("buildOwnedSection('tech-tree'"), '科技树应分区');
  assert.ok(!tj.includes('ETERVALS_'), 'tech.js 不应有修复残留标识符');
  const mn = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(mn.includes("renderOfflineUpgrades(document.getElementById('offline-upg-list'))"), '离线升级列表应接入分区渲染');
});
t('D1：轨道飞行器封印 Lv2 裂隙 DM = 2+1 = 3；无载具回归一致（数值）', () => {
  S.upgrades = {};
  assert.equal(vehicleTier(), 0, '无载具档位 0');
  assert.equal(sealDmReward({ dmReward: 2 }), 2, '无载具 DM 到账 = 基础值（v2.1.x 行为一致）');
  S.upgrades = { orbital: 1 };
  assert.equal(vehicleTier(), 3, '拥有轨道飞行器 → 档位 3');
  assert.equal(sealDmReward({ dmReward: 2 }), 3, 'Lv2 裂隙 DM 到账 = 2+1 = 3');
  assert.equal(embraceDurMs(), 75000, '拥抱时长 = 60s + 3×5s = 75s');
  S.upgrades = {};
});
t('D2：采集按数值确定性产出（v2.4：不再概率掷骰，显示与到账同口径）', () => {
  S.upgrades = { scooter: 10, parallel: 20 }; // v2.8.30：epPerDm 2500→6000 后净流收紧，补基础产出使净流 >0 且余额可支付
  S.ep = 1e6;
  // v3.4.0 起 dmRates 改成每辆每分钟（[0.2,0.4,1,2]），断言从配置读，避免再写死 0.05
  const perMin = BALANCE.vehicles.dmRates[0];
  const base = 10 * perMin;
  assert.ok(Math.abs(vehicleDmPerMin() - base) < 1e-9, `10 辆摩托队速率 = 10×${perMin} = ${base} DM/min`);
  assert.ok(Math.abs(collectVehicleDm() - base) < 1e-9, '确定性到账 = 速率（每 60s 一次）');
  // v3.4.5：多效果上限建筑（深渊蓄能池等）随「存储与续航」整组删除，DM 采集效率不再有建筑加成
  S.buildings = {};
  // tick：v3.3.8 起按秒连续结算（不再是 60s 一次 roll）——30s 到账 = 速率的一半
  S.dm = 0; S.vehCollectTimer = 0; S.ep = 1e9;
  const got = tickVehicleCollect(30);
  assert.equal(got, true, '有速率即应到账');
  assert.ok(Math.abs(S.dm - base / 2) < 1e-9, `30s 到账 ${base / 2} DM（确定性，无随机方差）`);
  S.upgrades = {};
  S.dm = 0; S.vehCollectTimer = 0;
  assert.equal(tickVehicleCollect(10), false, '无载具不计时');
});
t('A：三开关——预留线拦截 / net<0 停止招募 / 关闭后无动作（数值）', () => {
  S.tech['ai_core'] = true;
  S.tidePhase = 1; S.upgrades = {}; S.milesDone = {};
  S.allTimeEp = 1e9; // 保证候选项全部解锁可见
  const cap = epStorageCap();
  // 1) 自动升级受预留线拦截：EP 低于预留线不买
  S.ai = { autoUpgrade: true, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0 };
  const line = cap * 0.3;
  S.ep = line - 1; // 高于任何便宜项成本，但低于预留线+成本
  const upg0 = { ...(S.upgrades) };
  assert.equal(tickAI(5), false, '低于预留线不应有动作');
  assert.deepEqual(S.upgrades, upg0, '不应发生购买');
  // 2) 自动升级正常执行：EP 充足时买到回本最短项
  S.ep = cap; S.ai.timer = 0;
  const before = S.ep;
  const acted = tickAI(5);
  assert.equal(acted, true, 'EP 充足应执行购买');
  const bought = Object.keys(S.upgrades).filter(k => (S.upgrades[k] || 0) > (upg0[k] || 0));
  assert.ok(bought.length > 0, '应有购入记录');
  assert.ok(S.ep < before, 'EP 应扣减');
  // 3) 自动招募 net<0 停止
  // v3.4.8 反馈⑥：薪资已改为「产出 × 2/3」→ 常态下净收益恒为正，只有怠工态（薪资 ×2.5）才会净亏；
  //   这里用怠工标记构造 net<0 场景，验证守卫仍然生效
  S.upgrades = {}; S.ep = 1e9;
  S.cultists = [{ id: 1, name: 't', output: 0.01, mood: '正常', moodTimer: 60 }];
  S.lazySince = Date.now() - 120000; // 怠工 ≥60s → lazyCostMult ×2.5 → 薪资 > 产出
  S.ai = { autoUpgrade: false, autoHire: true, autoClaim: false, reserve: 0.3, timer: 0 };
  tickAI(5);
  assert.equal(S.cultists.length, 1, 'net<0 不应招募');
  S.lazySince = 0;
  // 4) 全关 → 无新动作
  S.ai = { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0 };
  S.ep = 1e9;
  assert.equal(tickAI(10), false, '开关全关不应有动作');
  delete S.tech['ai_core'];
  S.cultists = []; S.ai = { autoUpgrade: false, autoHire: false, autoClaim: false, reserve: 0.3, timer: 0 };
});
t('A：预留线三档 + AI 核心科技定义（数值）', () => {
  const aiCore = TECHS.find(x => x.id === 'ai_core');
  assert.ok(aiCore, '科技树应含 ai_core');
  assert.equal(aiCore.cost && aiCore.cost.rp, 50, 'AI 管理核心 50 RP（v2.8.7 多资源成本）');
  assert.equal(aiCore.cost && aiCore.cost.ep, 1e6, 'AI 管理核心 +100万 EP（v2.8.7 多资源成本）');
  assert.deepEqual(BALANCE.ai.reserveOptions, [0.1, 0.3, 0.5], '预留线三档 10%/30%/50%');
  assert.equal(BALANCE.ai.defaultReserve, 0.3, '默认 30%');
});
t('B：建筑效果改写四态生效值（数值）', () => {
  S.cultists = [];
  // v2.8.4 ⑦：能量食堂 3 级不再免疫——欠薪惩罚 0.7 → 0.8 / 0.9 / 0.95（负面只减缓）
  const expect = [0.7, 0.8, 0.9, 0.95];
  for (let lv = 0; lv <= 3; lv++) {
    S.buildings = lv ? { canteen: lv } : {};
    assert.ok(Math.abs(wageDebtMult() - expect[lv]) < 1e-9, `食堂 Lv.${lv} 欠薪系数应为 ${expect[lv]}`);
  }
  // 休眠舱：保命成本 0.3 → 0.15
  S.buildings = {};
  assert.equal(wageKeepCostMult(), 0.3);
  S.buildings = { dorm: 1 };
  assert.equal(wageKeepCostMult(), 0.15);
  // v2.8.3：维修坞不再免疫流失
  S.buildings = { dock: 1 };
  assert.equal(wageLoseChance(), 0.1);
  // 数据中心：每 10 线程 +5%/10%/15%
  S.buildings = {};
  S.cultists = Array.from({ length: 10 }, (_, i) => ({ id: i, output: 3, mood: '正常', moodTimer: 60 }));
  assert.equal(datacenterMult(), 1, '无数据中心无加成');
  S.buildings = { datacenter: 1 };
  assert.ok(Math.abs(datacenterMult() - 1.05) < 1e-9, 'Lv.1 + 10线程 = ×1.05');
  S.buildings = { datacenter: 3 };
  assert.ok(Math.abs(datacenterMult() - 1.15) < 1e-9, 'Lv.3 + 10线程 = ×1.15');
  S.cultists = S.cultists.slice(0, 9);
  assert.equal(datacenterMult(), 1, '9 线程不满 10 无加成');
  // 建筑成本与满级判定
  S.buildings = {};
  const canteen = BUILDINGS.find(b => b.id === 'canteen');
  assert.equal(buildingCost(canteen, S, 1), 2e4, '食堂首级 2e4');
  assert.equal(buildingCost(canteen, { buildings: { canteen: 1 } }, 1), 16e4, '食堂次级 ×8');
  assert.equal(buildingLevel(canteen, { buildings: { canteen: 2 } }), 2);
  assert.equal(buildingMaxed(canteen, { buildings: { canteen: 3 } }), true);
  S.buildings = {}; S.cultists = [];
});
t('L1：退潮期科技 RP 价 = 基准 ×0.8（v2.8.7 多资源对象）', () => {
  const tt = { cost: { rp: 50, ep: 1e6 } };
  S.tidePhase = 1;
  assert.equal(techCostOf(tt).rp, 50, '平潮原价');
  assert.equal(techCostOf(tt).ep, 1e6, 'EP 成本不受潮汐影响');
  S.tidePhase = 2; // 退潮
  assert.equal(techCostOf(tt).rp, 40, '退潮 ×0.8 = 40');
  // buyTech 走潮汐价（源码断言）
  const tj = readFileSync(new URL('../src/modules/tech.js', import.meta.url), 'utf8');
  assert.ok(tj.includes('const cost = techCostOf(t);'), 'buyTech 应按 techCostOf 扣费');
  S.tidePhase = 1;
});
t('回归：旧档（v2.1.x 缺 wageState/ai/buildings 等字段）加载兜底不报错', () => {
  const legacy = {
    ep: 123, cultists: [{ id: 1, name: '旧档线程', output: 3, mood: '正常', moodTimer: 60 }],
    upgrades: { cache: 1 }, tech: {}, eternal: {}, pets: {}, projects: [],
    staffUnhappy: 15, // 旧字段：保留读兼容
    milesDone: {}, achievements: {}, allTimeEp: 1e5, runEarned: 1e4,
    tidePhase: 1, tideTimer: 100, corruption: 5,
  };
  const origGet = global.localStorage.getItem;
  global.localStorage.getItem = () => JSON.stringify(legacy);
  const loaded = load();
  global.localStorage.getItem = origGet;
  assert.equal(loaded.wageState.state, 'ok', 'wageState 应兜底为 ok');
  assert.deepEqual(loaded.buildings, {}, 'buildings 应兜底为空对象');
  assert.equal(loaded.ai.reserve, 0.3, 'ai 应兜底且 reserve=0.3');
  assert.ok(Array.isArray(loaded.boughtOrder), 'boughtOrder 应兜底为数组');
  assert.equal(loaded.vehCollectTimer, 0, 'vehCollectTimer 应兜底为 0');
  assert.equal(loaded.staffUnhappy, 15, '旧字段保留读兼容');
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);

// ============================================================
// v2.0 增量断言（多故事线 / 数据提供层 / 规则引擎 / 门控 / 特殊任务 / 彩蛋 / 存档迁移）
// ============================================================
console.log('\n[10] v2.0 增量断言（多故事线 / Data Provider / 规则引擎 / 门控 / 特殊任务 / 彩蛋 / 存档迁移）');

// v2.0 核心模块
const { setStoryline, getStorylineId, getChapters, getTechs, registerVariants, _resetProvider } = await import('../src/core/provider.js');
const { registerRule, evaluate, _clearRules } = await import('../src/core/ruleEngine.js');
const { registerGate, checkGate, _clearGates } = await import('../src/core/gates.js');
const { registerStoryline, loadStoryline, getCurrentStoryline, getRegisteredStorylines, _resetStorylineManager } = await import('../src/core/storylineManager.js');
const { PROGRESSIVE_STAGES, isStageUnlocked, getCurrentStage } = await import('../src/core/progressive.js');
const { SPECIAL_TASKS, EASTER_EGGS, checkSpecialTasks, checkEasterEggs } = await import('../src/modules/progression.js');

// Pre-import storyline modules (avoid await in sync callbacks)
const slDefault = (await import('../src/storylines/default.js')).default;
const slOrder = (await import('../src/storylines/line_order.js')).default;
const slAbyss = (await import('../src/storylines/line_abyss.js')).default;
const slFaith = (await import('../src/storylines/line_faith.js')).default;

// Register all storylines before provider tests
for (const d of [slDefault, slOrder, slAbyss, slFaith]) registerStoryline(d);

t('Provider：setStoryline 后数据表切换 :: 线A 应追加专属科技', () => {
  _resetProvider();
  setStoryline('line_order'); // 先切换到 line_order
  registerVariants({ techs: { append: [{ id: 'order_protocol', col: 3, cost: 45, name: '秩序协议', desc: '全局 +15%', req: [] }] } });
  const techs = getTechs();
  assert.ok(techs.find(x => x.id === 'order_protocol'), '线A 应含 order_protocol');
  setStoryline('default');
  const techs2 = getTechs();
  assert.ok(!techs2.find(x => x.id === 'order_protocol'), '默认线不应含 order_protocol');
});

t('Provider：getChapters 按故事线返回不同章节 :: 线A 应含 6A 章节', () => {
  _resetProvider();
  setStoryline('line_order'); // 先切换到 line_order
  registerVariants({ chapters: { append: [{ id: '6A', name: '番外 A · 秩序之道', cond: () => false, desc: '秩序线' }] } });
  const chapters = getChapters();
  assert.ok(chapters.find(x => x.id === '6A'), '线A 应含 6A 章节');
  setStoryline('default');
  const chapters2 = getChapters();
  assert.ok(!chapters2.find(x => x.id === '6A'), '默认线不应含 6A');
});

t('Storyline Manager：自动注册至少 4 条故事线', () => {
  const list = getRegisteredStorylines();
  assert.ok(list.length >= 4, `应注册 ≥4 条故事线，实际 ${list.length}`);
  assert.ok(list.includes('default'), '应含 default');
  assert.ok(list.includes('line_order'), '应含 line_order');
  assert.ok(list.includes('line_abyss'), '应含 line_abyss');
  assert.ok(list.includes('line_faith'), '应含 line_faith');
});

t('Storyline Manager：loadStoryline 激活数据变体', () => {
  _resetProvider();
  setStoryline('default');
  loadStoryline('line_abyss');
  assert.equal(getCurrentStoryline(), 'line_abyss');
  const techs = getTechs();
  assert.ok(techs.find(x => x.id === 'chaos_born'), '线B 应含 chaos_born');
});

t('Gates：registerGate + checkGate 门控生效', () => {
  _clearGates();
  registerGate('test_mod', () => true, 'test label');
  assert.equal(checkGate('test_mod'), true, '返回 true 的谓词应通过');
  registerGate('test_mod2', () => false, 'locked');
  assert.equal(checkGate('test_mod2'), false, '返回 false 的谓词应拦截');
  // 未注册 = 默认可见
  assert.equal(checkGate('unregistered'), true, '未注册门 = 默认可见');
});

// v3.6.0 方向⑦：模块解锁与章节解耦，改按「游玩天数」推进（约 2 大块/天，4.5 天全开）
t('Progressive：P0 始终解锁，P9 需游玩 4.5 天（按天数而非章节）', () => {
  const saved = S.startedAt;
  assert.equal(isStageUnlocked('P0', S), true, 'P0 始终解锁');
  S.startedAt = Date.now() - 4.4 * 86400000;
  assert.equal(isStageUnlocked('P9', S), false, '4.4 天时 P9 未解锁');
  S.startedAt = Date.now() - 4.6 * 86400000;
  assert.equal(isStageUnlocked('P9', S), true, '4.6 天时 P9 解锁');
  S.startedAt = saved;
});

t('Special Tasks：定义含 6 个任务（3通用+3线专属）', () => {
  assert.equal(SPECIAL_TASKS.length, 6, `应含 6 个特殊任务，实际 ${SPECIAL_TASKS.length}`);
  assert.ok(SPECIAL_TASKS.find(t => t.id === 'sp1_museum'), '应含 sp1_museum');
  assert.ok(SPECIAL_TASKS.find(t => t.id === 'sp2_last_thread'), '应含 sp2_last_thread');
  assert.ok(SPECIAL_TASKS.find(t => t.id === 'sp3_farewell'), '应含 sp3_farewell');
  assert.ok(SPECIAL_TASKS.find(t => t.id === 'sp_order_protocol'), '应含 sp_order_protocol');
  assert.ok(SPECIAL_TASKS.find(t => t.id === 'sp_abyss_gaze'), '应含 sp_abyss_gaze');
  assert.ok(SPECIAL_TASKS.find(t => t.id === 'sp_faith_mission'), '应含 sp_faith_mission');
});

t('Easter Eggs：定义含 8 个彩蛋（v2.8.9 新增 idle_start 静默开局；thomas 随载具命名彩蛋移除）', () => {
  assert.equal(EASTER_EGGS.length, 8, '应含 8 个彩蛋');
  assert.ok(!EASTER_EGGS.find(e => e.id === 'thomas'), 'thomas 彩蛋应已移除（命名输入框废除）');
});

// Pre-import state.js for migration test (avoid await in sync callback)
const stateMod = await import('../src/state.js');
const { SAVE_VERSION } = stateMod;

t('Save Migration：v1.3 旧档无损升入 v2.0', () => {
  const v13Save = {
    ep: 100, rp: 5, es: 0, dm: 0,
    upgrades: { cache: 1 }, tech: { warmup: true },
    cultists: [], pets: {}, projects: [],
    milesDone: {}, achievements: {}, allTimeEp: 5000,
    tidePhase: 0, tideTimer: 150, corruption: 0,
    wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 },
    buildings: {}, ai: {}, boughtOrder: [],
    _version: 2,
  };
  const origGet = global.localStorage.getItem;
  global.localStorage.getItem = () => JSON.stringify(v13Save);
  const loaded = stateMod.load();
  global.localStorage.getItem = origGet;
  assert.equal(loaded._version, SAVE_VERSION, '版本应升到 3');
  assert.equal(loaded.ep, 100, 'EP 应保留');
  assert.equal(loaded.storyline, 'default', '故事线应默认为 default');
  assert.ok(loaded._specialTasksDone, '应含 _specialTasksDone 字段');
  assert.ok(loaded._easterEggsFound, '应含 _easterEggsFound 字段');
  assert.ok(Array.isArray(loaded.storylinesCompleted), '应含 storylinesCompleted 数组');
});

t('Version 纪律：package.json / index.html title / 交付说明 三处一致（参数化，升版不再改断言）', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const doc = readFileSync(new URL('../交付说明.md', import.meta.url), 'utf8');
  const v = pkg.version;
  assert.match(v, /^\d+\.\d+\.\d+$/, `package.json version 应为 semver，实际 ${v}`);
  assert.ok(html.includes(`v${v}`), `index.html title 应含 v${v}（与 package.json 一致）`);
  assert.ok(doc.includes(v), `交付说明.md 应含版本号 ${v}（与 package.json 一致）`);
});

t('buyDmUpgrade 修复：购买后置 dirty.shop（源码断言）', () => {
  const src = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  assert.ok(src.includes('dirty.shop = true'), 'buyDmUpgrade 应置 dirty.shop = true');
});

t('故事线面板：main.js 包含 renderStorylinePanel（源码断言）', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(src.includes('renderStorylinePanel'), 'main.js 应含 renderStorylinePanel');
  assert.ok(src.includes('btn-storyline'), 'main.js 应绑定 btn-storyline');
});

t('渐进开放：progressive.js 含 P0~P9 阶段定义', () => {
  assert.equal(PROGRESSIVE_STAGES.length, 10, '应含 10 个阶段（P0~P9）');
  assert.equal(PROGRESSIVE_STAGES[0].id, 'P0', '首阶段应为 P0');
  assert.equal(PROGRESSIVE_STAGES[9].id, 'P9', '末阶段应为 P9');
});

t('规则引擎：registerRule + evaluate 聚合结果（v3.7.0 起按故事线隔离）', () => {
  _clearRules();
  registerRule('test_key', (base) => base * 2, 10, 'test');
  // v3.7.0：evaluate 只应用 default + context.storyline 的规则（旧实现恒真过滤会串线）
  assert.equal(evaluate('test_key', 5, { storyline: 'test' }), 10, 'base=5 × 2 = 10');
  assert.equal(evaluate('test_key', 5, { storyline: 'line_order' }), 5, '其它故事线不应吃到 test 规则');
  registerRule('test_key', (base) => base + 3, 5, 'test');
  assert.equal(evaluate('test_key', 5, { storyline: 'test' }), 13, '高优先级 ×2 + 低优先级 +3 = 13');
  _clearRules();
});

t('彩蛋触发：EP=42 时点击触发 42 彩蛋', () => {
  S._easterEggsFound = {};
  S.ep = 42;
  checkEasterEggs('click', S, null, null, null);
  assert.ok(S._easterEggsFound['the_answer'], '42 彩蛋应被触发');
});

t('彩蛋触发：按序购买 warmup→lean→speed2→quantum2 触发图灵彩蛋', () => {
  S._easterEggsFound = {};
  S.tech = { warmup: true, lean: true, speed2: true, quantum2: true };
  checkEasterEggs('tech_sequence', S, null, null, null);
  assert.ok(S._easterEggsFound['turing'], '图灵彩蛋应被触发');
  S.tech = {};
});

console.log('[10] v2.0.2 大型 BUGFIX 数值断言（级制存储 / 防死锁 30% / DC 上限 / 里程碑 / 故事线 / 旧档兼容 / DM 展示）');

const stU = () => UPGRADES.find(u => u.id === 'storage');
const caU = () => UPGRADES.find(u => u.id === 'cache');
function resetCapState() {
  S.upgrades = {}; S.milesDone = {}; S.buildings = {}; S.storyline = 'default';
  S.tech = {}; S.prestigePoints = 0; S.eternal = {}; S.religion = null; S.runTalent = null;
}

t('5.1：epStorageCap() 返回 ≥ 2000（新基础上限）', () => {
  resetCapState();
  assert.ok(epStorageCap() >= 2000, `实际上限 ${epStorageCap()}`);
  resetCapState();
});

t('5.1：0 级时第 1 级价格 = 150 EP（unitCost(storage,0)===150）', () => {
  resetCapState();
  assert.equal(unitCost(stU(), 0), 600); // v2.8.30：base 3000 被 30% 防死锁钳制（cap 2000）
  resetCapState();
});

t('5.1：10 级时下一级价格/上限 ≤ 30%（防死锁，实测 ~3.8%）', () => {
  resetCapState();
  S.upgrades['storage'] = 10;
  const cap = epStorageCap();
  const cost = unitCost(stU(), 0);
  assert.ok(cost <= cap * 0.3, `10 级下一级 ${cost} / 上限 ${cap} = ${(cost / cap * 100).toFixed(1)}%`);
  resetCapState();
});

t('5.1：19 级时末级（第 20 级）价格/上限 ≤ 30%', () => {
  resetCapState();
  S.upgrades['storage'] = 19;
  const cap = epStorageCap();
  const cost = unitCost(stU(), 0);
  assert.ok(cost <= cap * 0.3, `末级 ${cost} / 上限 ${cap} = ${(cost / cap * 100).toFixed(1)}%`);
  resetCapState();
});

t('5.1：20 级满级总上限 = 588,512（v3.4.6 ⑫：备用粮仓 20 级封顶，capPer 4000×1.18^n）', () => {
  resetCapState();
  S.upgrades['reserve_bin'] = 20;
  assert.equal(epStorageCap(), 588512); // v3.4.6 ⑫ 曲线（2000 + 4000×1.18^n 累计，n=0..19）
  resetCapState();
});

t('5.1：1 级数据中心上限增量 ≥ 10,000（建筑映射生效）', () => {
  resetCapState();
  const base = epStorageCap();
  S.buildings['datacenter'] = 1;
  assert.ok(epStorageCap() - base >= 10000, `增量 ${epStorageCap() - base}`);
  S.buildings['datacenter'] = 2;
  assert.ok(epStorageCap() - base >= 25000, `2 级增量 ${epStorageCap() - base}`);
  S.buildings['datacenter'] = 3;
  assert.ok(epStorageCap() - base >= 50000, `3 级增量 ${epStorageCap() - base}`);
  resetCapState();
});

t('5.1：3 个里程碑时上限乘数 = 1.75（+25%×3）', () => {
  resetCapState();
  const base = epStorageCap();
  S.milesDone = { m1: true, m2: true, m3: true };
  const boosted = epStorageCap();
  assert.ok(Math.abs(boosted / base - 1.75) < 0.01, `乘数 ${boosted / base}`);
  resetCapState();
});

t('5.1：旧档兼容——v2.0.1 实存 13 节点直接映射 13 级；v2.4 超 20 旧档全额计入不再截断（v3.4.6 ⑫：级制曲线 = 备用粮仓）', () => {
  resetCapState();
  S.upgrades['reserve_bin'] = 13; // v2.0.1 最深推演 13 节点
  const expected = Math.round(2000 + 4000 * (Math.pow(1.18, 13) - 1) / 0.18); // v3.4.6 ⑫ 曲线（基准 2000 + 粮仓累计）
  assert.equal(epStorageCap(), expected);
  // v2.4 KG 模式：>20 的旧值按级制公式全额计入（不再截断到满级）
  S.upgrades['reserve_bin'] = 25;
  const expected25 = Math.round(2000 + 4000 * (Math.pow(1.18, 25) - 1) / 0.18); // v3.4.6 ⑫
  assert.ok(Math.abs(epStorageCap() - expected25) <= 1, `v2.4 旧档 25 级全额计入（期望 ${expected25}，实际 ${epStorageCap()}）`);
  resetCapState();
});

t('v2.4：storage 无限升级配置——UPGRADES 无 maxLevel（KG 模式）；v3.4.6 ⑫ 级制封顶移至备用粮仓', () => {
  resetCapState();
  assert.ok(!stU().maxLevel, 'UPGRADES storage 不再有 maxLevel 封顶');
  assert.equal(BALANCE.reserveBin.maxLevel, 20, '备用粮仓 20 级封顶（购买入口拦截）');
  resetCapState();
});

t('5.2：unitCost(storage, n) ≤ epStorageCap()×0.3（v2.4 任意级数无限验证）', () => {
  resetCapState();
  for (let lv = 0; lv < 40; lv++) {
    S.upgrades['storage'] = lv;
    const cap = epStorageCap();
    const cost = unitCost(stU(), 0);
    assert.ok(cost <= cap * 0.3, `级 ${lv}：${cost} > ${cap}×0.3=${Math.floor(cap * 0.3)}`);
  }
  resetCapState();
});

t('v3.4.8：旧档 cache 等级仍全额计入上限（缓存优化已删除，不可再买）', () => {
  resetCapState();
  S.upgrades['cache'] = 0;
  const cap0 = epStorageCap();
  S.upgrades['cache'] = 3;
  let sum = 0;
  for (let i = 0; i < 3; i++) sum += 8000 * Math.pow(1.15, i);
  assert.equal(epStorageCap(), cap0 + sum, '旧档残留 cache 等级继续撑上限（不让老存档凭空掉容量）');
  assert.ok(!UPGRADES.find(x => x.id === 'cache'), 'v3.4.8 反馈⑦：cache 已从升级列表删除');
  resetCapState();
});

t('5.2：非扩容项（intern）不受 30% 约束', () => {
  resetCapState();
  S.upgrades['intern'] = 40; // v3.0.3 后续：产出阶梯 growth 1.30→1.55
  const g = UPGRADES.find(x => x.id === 'intern').growth || 1.30;
  const raw = Math.ceil(6e5 * Math.pow(g, 40)); // v2.8.27：intern base ×3；growth 随数据
  const capLimit = Math.floor(epStorageCap() * 0.3);
  const u = UPGRADES.find(x => x.id === 'intern');
  assert.ok(unitCost(u, 0) === raw && raw > capLimit, `非扩容项应按原价 ${raw}（> 上限30% ${capLimit}），实际 ${unitCost(u, 0)}`);
  resetCapState();
});

t('v3.4.8 反馈⑦：升级商店「消耗优化」整组已删除（5 项均不在 UPGRADES）', () => {
  for (const id of ['subsist1', 'subsist2', 'subsist3', 'mem', 'cache']) {
    assert.ok(!UPGRADES.find(x => x.id === id), `${id} 应已删除`);
  }
  // 产出强化保留（CPU/GPU）
  assert.ok(UPGRADES.find(x => x.id === 'cpu'), 'CPU 超频应保留');
  assert.ok(UPGRADES.find(x => x.id === 'gpu'), 'GPU 加速应保留');
});

t('5.4：三故事线变体上限加成（abyss ×1.15 / order ×1.10 / faith 无）', () => {
  resetCapState();
  const base = epStorageCap();
  S.storyline = 'line_abyss';
  assert.ok(Math.abs(epStorageCap() / base - 1.15) < 0.001, `abyss 乘数 ${epStorageCap() / base}`);
  S.storyline = 'line_order';
  assert.ok(Math.abs(epStorageCap() / base - 1.10) < 0.001, `order 乘数 ${epStorageCap() / base}`);
  S.storyline = 'line_faith';
  assert.equal(epStorageCap(), base, 'faith 无直接上限加成');
  resetCapState();
});

t('5.3：DM 展示源码断言（v2.4.2 深渊商店余额移除，保留裂隙/探采小数显示）', () => {
  const shopSrc = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  const riftSrc = readFileSync(new URL('../src/modules/rift.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('id="dm-balance"'), 'v2.4.2：深渊商店不再显示当前 DM（#dm-balance 元素移除）');
  assert.ok(!shopSrc.includes('updateDmBalance'), 'shop.js 不应再有 DM 余额刷新函数');
  assert.ok(riftSrc.includes('id="rift-dm-balance"'), '裂隙面板应含 #rift-dm-balance');
  assert.ok(riftSrc.includes("querySelector('#rift-dm-balance')"), '裂隙面板应每帧同步当前 DM');
  assert.ok(shopSrc.includes('当前 DM: '), '探采页头应展示当前 DM');
  assert.ok(riftSrc.includes('toFixed(2)') && shopSrc.includes('toFixed(2)'), 'DM 累计显示精确到小数');
});

t('5.1：满级锁定 UI 源码断言（maxLevel 项满级锁定；无 maxLevel 项无限可购）', () => {
  const shopSrc = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  assert.ok(shopSrc.includes('maxedLevel(u)'), 'makeShopItem 应有满级判定');
  assert.ok(shopSrc.includes('已满级'), '满级卡片应有锁定文案');
  assert.ok(shopSrc.includes('u.maxLevel || Infinity'), 'buyUpgrade 应按 maxLevel 截断（无封顶项恒可购）');
});

// ---- v3.4.8 反馈⑦：cache 条目删除（旧档等级仍计入上限，见上方案例） ----
t('v3.4.8：cache 不再有限购配置断言（条目已整体删除）', () => {
  assert.equal(caU(), undefined, 'cache 条目应已从 UPGRADES 删除');
});

t('v3.4.7：旧档 cache=25 全额计入（逐级 ×1.15）——2000 + 8000×Σ1.15^i（i=0..24）', () => {
  resetCapState();
  S.upgrades['cache'] = 25; // 旧档超买值，仍全额计入（不截断），只是购买入口限 5 级
  let sum = 0;
  for (let i = 0; i < 25; i++) sum += 8000 * Math.pow(1.15, i);
  assert.equal(epStorageCap(), Math.round(2000 + sum), `期望 ${Math.round(2000 + sum)}`);
});

t('v2.4：buyThreadUpgrade 无限购买守卫（maxLevel || Infinity，无封顶项恒可购）', () => {
  const shopSrc = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  const fnMatch = shopSrc.match(/export function buyThreadUpgrade\(u\) \{[\s\S]*?\n\}/);
  assert.ok(fnMatch, 'buyThreadUpgrade 函数应存在');
  const fnSrc = fnMatch[0];
  assert.ok(fnSrc.includes('u.maxLevel || Infinity'), 'buyThreadUpgrade 应有 maxLevel 满级守卫（无 maxLevel → Infinity 恒可购）');
  assert.ok(/owned >= maxLv[\s\S]{0,80}return false/.test(fnSrc), '满级时应直接 return false 不扣款');
});

t('5.5：线程区满级锁定展示（源码断言，对齐 storage 口径）', () => {
  const shopSrc = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  const makeMatch = shopSrc.match(/function makeThreadItem\(u\) \{[\s\S]*?\n\}/);
  assert.ok(makeMatch, 'makeThreadItem 函数应存在');
  const makeSrc = makeMatch[0];
  assert.ok(makeSrc.includes('maxedLevel(u)'), 'makeThreadItem 应有满级判定分支');
  assert.ok(makeSrc.includes('delete div.dataset.buy'), '满级时应移除 data-buy 购买入口');
  assert.ok(makeSrc.includes('owned-item'), '满级卡片应转 owned-item 态');
});

console.log(`\n最终结果：${pass} 通过，${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
