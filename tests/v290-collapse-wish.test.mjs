// v2.9.0 回归测试：深渊吞噬重做（倒计时锁定/命运抉择/转生锁定）+ 许愿池入组 + 探采自动恢复 + 深潜层深修复 + 净化经济
import test from 'node:test';
import assert from 'node:assert/strict';

// ---- 最小 DOM stub ----
global.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }), body: { classList: { add(){}, remove(){} } }, addEventListener(){}, querySelectorAll: () => [] };
global.window = { addEventListener(){} };
global.performance = { now: () => Date.now() };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { tickCollapse, cancelCollapse, purgeCostFor, purgeDmFor, setCollapseHooks, tickCorruption, epStorageCap } = await import('../src/modules/economy.js');
const { canPrestige } = await import('../src/modules/prestige.js');
const { delveDepth, startDelve } = await import('../src/modules/delve.js');
const { tickVehicleCollect, setVehicleLogFn } = await import('../src/modules/vehicles.js');
const vehMod = { setVehicleLogFn };
import { readFileSync } from 'node:fs';

const shopSrc = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const riftSrc = readFileSync(new URL('../src/modules/rift.js', import.meta.url), 'utf8');
const vehiclesSrc = readFileSync(new URL('../src/modules/vehicles.js', import.meta.url), 'utf8');
const htmlSrc = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v3.0.3 Bug1/2：许愿池在通用设施（非研究点），设施可购买 → 解锁后浮动井可出现', () => {
  // v3.0.3：wish_well 从研究升级移入通用设施 BALANCE.buildings（避免与研究点重复）
  const wish = BALANCE.buildings.wish_well;
  assert.ok(wish, '许愿池在 BALANCE.buildings.wish_well');
  assert.equal(wish.name, '许愿池');
  assert.equal(wish.levels, 1, '许愿池 1 级（单次购买）');
  // 研究升级不再含 wish_well
  assert.equal(BALANCE.researchUpgs.find(x => x.id === 'wish_well'), undefined, '研究升级不含 wish_well');
  // 研究点 prod 分组不含 wish_well
  assert.ok(!shopSrc.includes("'wish_well'], unlock: null"), 'prod 分组不再含 wish_well');
  assert.ok(mainSrc.includes('WISH_COST = 100, WISH_CHANCE = 0.0001, WISH_REWARD = 100000'), '投币：100 EP / 0.01% / +100K EP');
  assert.ok(mainSrc.includes('wish-coin'), '许愿池 SVG/动画结构存在');
  // ensureWishWell 检查设施（兼容旧档 rpTheories）
  assert.ok(mainSrc.includes('S.buildings && S.buildings.wish_well'), 'ensureWishWell 检查 S.buildings.wish_well');
});

test('Bug3：倒计时一旦启动即锁定——腐化被动回落不再取消；唯主动净化（cancelCollapse）可解除', () => {
  S.collapsed = false; S._collapseAt = null; S._collapseTimer = 0; S._collapseChoicePending = false;
  S.corruption = 100; S.cultists = [{ name: 'A' }];
  tickCollapse(0.1);
  assert.ok(S._collapseAt, '腐化满额 → 启动倒计时');
  // 模拟被动净化把腐化清到 100 以下（v2.9.0 前此处会静默取消倒计时 → 崩溃永不触发）
  S.corruption = 40;
  tickCollapse(0.1);
  assert.ok(S._collapseAt, '倒计时锁定：腐化回落不取消');
  // 主动净化自救
  assert.equal(cancelCollapse(), true);
  assert.equal(S._collapseAt, null);
  assert.equal(cancelCollapse(), false); // 无倒计时时幂等 false
});

test('Bug3：倒计时终结 → 命运抉择标记（不直接崩溃），choice 钩子被调用', () => {
  S.collapsed = false; S._collapseAt = Date.now() - 1; S._collapseTimer = 0; S._collapseChoicePending = false;
  S.corruption = 100; S.cultists = [{ name: 'A' }];
  let called = 0;
  setCollapseHooks(() => {}, () => {}, () => { called++; });
  tickCollapse(0.1);
  assert.ok(S._collapseChoicePending, '进入抉择待决状态');
  assert.equal(S._collapseAt, null, '倒计时清零');
  assert.equal(S.collapsed, false, '不再直接崩溃（由抉择结算）');
  assert.equal(called, 1, 'choice 钩子恰好调用一次');
  tickCollapse(0.1); // 抉择期间不推进
  assert.equal(called, 1);
});

test('Bug3：倒计时期间被动净化被压制（tickCorruption 不清腐化）', () => {
  S.upgrades = { purifier3: 1 }; // 5%/s 净化节点
  S.corruption = 100; S.riftExpedition = null; S.collapsed = false;
  S._collapseAt = Date.now() + 50000; S._collapseChoicePending = false;
  tickCorruption(1);
  assert.equal(S.corruption, 100, '吞噬期间净化节点被压制');
  S._collapseAt = null;
  tickCorruption(1);
  assert.ok(S.corruption < 100, '倒计时解除后净化恢复生效');
  S.upgrades = {};
});

test('优化③：吞噬期间晋升/轮回均被锁定（转生不可脱离深渊）', () => {
  S.runEarned = 1e12; // 远超晋升门槛
  S.collapsed = false; S._collapseChoicePending = false;
  S._collapseAt = Date.now() + 30000;
  assert.equal(canPrestige(), false, '倒计时期间 canPrestige=false');
  S._collapseAt = null; S._collapseChoicePending = true;
  assert.equal(canPrestige(), false, '抉择期间 canPrestige=false');
  S._collapseChoicePending = false;
  assert.equal(canPrestige(), true, '解除后恢复正常晋升');
});

test('优化①：主动净化经济——成本/DM 析出公式（腐化越严重 DM 越多，平方曲线）', () => {
  const c50 = purgeCostFor(50), c10 = purgeCostFor(10);
  assert.ok(c50 === Math.ceil(epStorageCap() * 0.006 * 50), '50% 净化成本 = 上限 × 0.6% × 50');
  assert.ok(c10 === Math.ceil(epStorageCap() * 0.006 * 10), '10% 净化成本 = 上限 × 0.6% × 10');
  assert.equal(purgeDmFor(50), 50, '50% 腐化 → 50 DM');
  assert.equal(purgeDmFor(10), 2, '10% 腐化 → 2 DM');
  assert.ok(purgeDmFor(50) / purgeDmFor(25) > 3.9, '平方曲线：50% 的 DM 收益 ≈ 25% 的 4 倍');
});

test('Bug④（v3.2.2 同步）：探采 EP 不足 → 本轮跳过（无暂停机制）；EP 回升自动恢复采集', () => {
  const logs = [];
  vehMod.setVehicleLogFn((m) => logs.push(m));
  S.upgrades = { scooter: 1 }; // 0.05 DM/min → 周期成本 > 0
  S._probeEnabled = true; S.vehCollectTimer = 0; S._probeAutoPaused = false; S._probeEpShortSec = 0;
  S.ep = 0; S.collapsed = false; S.riftExpedition = null;
  // EP 不足：持续跳过，不暂停、不扣费、无日志
  for (let i = 0; i < 60; i++) assert.equal(tickVehicleCollect(0.5), false, 'EP 不足跳过本轮回');
  assert.equal(S._probeAutoPaused, false, 'v3.2.2：不再自动暂停');
  assert.equal(logs.filter(m => m.includes('自动暂停')).length, 0, '无暂停日志');
  assert.ok(S._probeEpShortSec > 0, 'EP 不足计时器累积');
  // EP 回升：自动恢复（计时器重置、周期正常推进）
  S.ep = 1e8;
  assert.equal(tickVehicleCollect(10), false, 'EP 充足恢复推进（未满 60s 不到账）');
  assert.equal(S._probeEpShortSec, 0, 'EP 回升计时器重置');
  // 旧档暂停标记被清理
  S._probeAutoPaused = true;
  tickVehicleCollect(0.1);
  assert.equal(S._probeAutoPaused, false, '旧档 _probeAutoPaused 标记 tick 清理');
  S.upgrades = {}; S._probeAutoPaused = false; S._probeEpShortSec = 0;
});

test('Bug④（源码 v3.2.2）：暂停机制废除——无缓冲暂停常量语义，EP 回升自动继续', () => {
  assert.ok(vehiclesSrc.includes('去除「EP 不足自动暂停、需手动恢复」'), 'v3.2.2 机制废除注释在位');
  assert.ok(vehiclesSrc.includes('EP 回升后下一周期自动恢复采集'), 'EP 回升自动恢复语义');
  assert.ok(vehiclesSrc.includes('S._probeAutoPaused = false'), '旧档暂停标记 tick 清理');
});

test('Bug⑤：腐化满额/吞噬期间不触发新裂隙', () => {
  assert.ok(riftSrc.includes('abyssDevouring'), 'tickRift 有深渊吞噬封锁守卫');
  assert.ok(riftSrc.includes('S.corruption || 0) >= (BALANCE.corruption.max || 100)'), '守卫覆盖腐化 100% 分支');
});

test('大项②：深潜层深在下潜时递增（此前恒 0 → 里程碑/政策组/轮回遗存维度全部失效）', () => {
  S.delve = { unlocked: true, depth: 0, up: {} };
  S.dm = 1e9; S.ep = 1e9; S.collapsed = false; S.riftExpedition = null; // v3.0.0：深潜 EP 化，需 EP+DM 双成本
  S.resDiscovered = { dm: true };
  const r = startDelve();
  assert.equal(r.ok, true);
  assert.equal(delveDepth(), 1, '下潜一次 → 层深 1');
  S.delve.active = false;
  const r2 = startDelve();
  assert.equal(r2.ok, true);
  assert.equal(delveDepth(), 2, '再下潜 → 层深 2（成本随层深涨）');
});

test('大项②：轮回评分/遗存改读 S.delve.depth（原 S.delveDepth 键不存在）', () => {
  const src = readFileSync(new URL('../src/modules/reincarn.js', import.meta.url), 'utf8');
  assert.ok(src.includes('(S.delve && S.delve.depth) || 0'), 'echoScore/vals 均读 S.delve.depth');
  assert.ok(!src.includes('S.delveDepth ||'), '不再读不存在的 S.delveDepth 键');
});

test('优化③（源码）：晋升/轮回不再清除 collapsed（吞噬仅由抉择结算）', () => {
  const pr = readFileSync(new URL('../src/modules/prestige.js', import.meta.url), 'utf8');
  const rc = readFileSync(new URL('../src/modules/reincarn.js', import.meta.url), 'utf8');
  assert.ok(!pr.includes('S.collapsed = false'), 'doPrestige 不清除 collapsed');
  assert.ok(!rc.includes('S.collapsed = false'), 'doReincarn 不清除 collapsed');
});

test('抉择弹框与成就：index.html 含两个抉择按钮，成就 defs 含恶魔的朋友/凝视深渊', () => {
  assert.ok(htmlSrc.includes('collapse-bribe') && htmlSrc.includes('collapse-mutual'), '贿赂深渊/同归于尽按钮存在');
  assert.ok(htmlSrc.includes('恶魔的朋友') && htmlSrc.includes('凝视深渊'), '成就文案存在');
  assert.ok(mainSrc.includes("resolveCollapseChoice('bribe')") && mainSrc.includes("resolveCollapseChoice('mutual')"), '抉择处理器接线');
  assert.ok(mainSrc.includes('S.ep * 0.9') || mainSrc.includes('* 0.9'), '贿赂上缴 90% EP');
  assert.ok(mainSrc.includes('abyssSplinter'), '同归于尽结算湮灭残片');
});

test('优化②（源码）：紧急脱出走 askConfirm + 模态暂停（tick 冻结 + 绝对时间戳顺延）', () => {
  assert.ok(mainSrc.includes('紧急脱出确认'), '紧急脱出二次确认');
  assert.ok(mainSrc.includes('pauseGameClock()'), '模态暂停入口');
  assert.ok(mainSrc.includes('resumeGameClock()'), '模态暂停恢复');
  assert.ok(mainSrc.includes('shiftAbsoluteTimers') === false && mainSrc.includes('modalPauseAt'), '暂停状态字段');
  // v3.10.0：顺延字段清单收敛到 core/stateSchema.js，main.js 只保留一次调用
  const clockSrc = readFileSync(new URL('../src/core/stateSchema.js', import.meta.url), 'utf8');
  assert.ok(mainSrc.includes('shiftAbsoluteClocks(S, shift)') && clockSrc.includes("'riftExpedition.until'"), '探索倒计时恢复时顺延');
  assert.ok(clockSrc.includes("'_collapseAt'"), '吞噬倒计时恢复时顺延');
});

test('吞噬横幅文案定稿（用户口径）', () => {
  assert.ok(mainSrc.includes('已被深渊腐化，崩溃倒计时'), '⚠️ 深渊吞噬倒计时：已被深渊腐化，崩溃倒计时 00:59');
  assert.ok(!mainSrc.includes('距本局崩溃'), '旧文案已移除');
});

test('轮回文本：转生不可脱离深渊提示', () => {
  assert.ok(readFileSync(new URL('../src/modules/reincarn.js', import.meta.url), 'utf8').includes('轮回不可脱离'), '轮回锁定提示');
});

test('大项②：KG 风格轮回扩充——仓储/薪酬双回响升级 + 乘区接线', () => {
  const upgs = BALANCE.reincarn.upgs;
  assert.ok(upgs.find(u => u.id === 'echo_storage'), '回响·仓储共鸣存在');
  assert.ok(upgs.find(u => u.id === 'echo_wage'), '回响·薪酬共鸣存在');
  const eco = readFileSync(new URL('../src/modules/economy.js', import.meta.url), 'utf8');
  assert.ok(eco.includes('echoStorageMult()'), 'epStorageCap 接入仓储共鸣乘区');
  assert.ok(eco.includes('echoWageMult()'), 'staffSalaryPerSec 接入薪酬共鸣乘区');
  assert.ok(eco.includes("Math.pow(1.25, echoLv('echo_storage'))"), '仓储 ×1.25/级（KG 风格叠乘）');
  assert.ok(eco.includes("Math.pow(0.94, echoLv('echo_wage'))"), '薪酬 ×0.94/级（克制递减）');
});

test('大项①：Wiki 重构为 KG 风格体系化百科（侧栏分章 + 渐进解锁 + 数值附录）', () => {
  assert.ok(readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('wiki-nav') && readFileSync(new URL('../index.html', import.meta.url), 'utf8').includes('wiki-body'), 'Wiki 弹框含侧栏+内容区结构');
  const wikiSrc = readFileSync(new URL('../src/data/wiki.js', import.meta.url), 'utf8');
  assert.ok(wikiSrc.includes('WIKI_SECTIONS'), 'Wiki 数据驱动（WIKI_SECTIONS）');
  assert.ok(wikiSrc.includes('入门指南') && wikiSrc.includes('数值公式附录'), '含入门/附录章节（KG 体系化）');
  assert.ok(wikiSrc.includes('unlocked') && wikiSrc.includes('wikiUnlocked'), '渐进解锁判定（锁定章节灰显）');
  assert.ok(readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').includes('.wiki-nav-btn'), 'Wiki 侧栏样式');
});

test('优化⑤（性能）：代码雨标签页隐藏时跳过绘制', () => {
  assert.ok(mainSrc.includes('if (document.hidden) return;'), 'code-rain 隐藏跳过');
});
