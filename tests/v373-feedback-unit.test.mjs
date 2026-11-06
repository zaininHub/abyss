// v3.7.3 六项反馈单测（纯 Node，无需浏览器）
//
// ① 班组下拉/筛选按钮不再展示「在岗/容量」x/x。
// ② 未解锁的自动转化快捷开关不展示（含整块面板隐藏），解锁后才出现。
// ③ 班组内不再展示领导者「不占岗位」文案。
// ④ 任务面板高度固定为刚好 3 张任务卡（246px）。
// ⑤ 晋升模块与 P3 渐进开放节点同源，未到达时整块隐藏。
// ⑥ 载具 cps 恒 0（只消耗 EP 换 DM，不增加 EP 产出）；载具协议改作用于 DM 采集速率。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S } = await import('../src/state.js');
const { BALANCE } = await import('../src/data/balance.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const ECO = await import('../src/modules/economy.js');
const { computeCps, cpsBreakdown, vehicleDmPerMin, vehicleRateMult, probeFlowPerSec } = ECO;
const { tickVehicleCollect } = await import('../src/modules/vehicles.js');
const { isStageUnlocked } = await import('../src/core/progressive.js');

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const CREW = read('src/modules/crew.js');
const MAIN = read('src/main.js');
const CSS = read('src/style.css');
const SHOP = read('src/modules/shop.js');
const ECON = read('src/modules/economy.js');
const WIKI = read('src/data/wiki.js');
const UPG = read('src/data/upgrades.js');

function reset(over = {}) {
  S.upgrades = {}; S.buildings = {}; S.tech = {}; S.religion = {}; S.policies = {};
  S.cultists = []; S.pets = {}; S.activePets = [];
  S.converterOn = {}; S._probeEnabled = true; S.atriumOn = true; S.ptDistillOn = true;
  S.wageState = { state: 'ok' }; S.ep = 1e12; S.dm = 0; S.rp = 0; S.pt = 0; S.faith = 0;
  S.runEarned = 0; S.prestigePoints = 0; S.prestige = 0; S.es = 0;
  S.buffUntil = 0; S.buffMult = 1; S.restBonusUntil = 0; S.restBonusMult = 1;
  S.corruption = 0; S.collapsed = false; S._collapseAt = 0; S._collapseChoicePending = false;
  S.vehCollectTimer = 0; S._dmFull = false;
  S.resDiscovered = { ep: true, cps: true, run: true, tide: true };
  S.startedAt = Date.now(); S.storyline = 'default'; S.runTalent = null;
  Object.assign(S, over);
}

// ============ A. 反馈① 班组不再展示岗位 x/x ============
console.log('[A] 班组面板不再展示「在岗/容量」');

test('A1 crew.js 不再计算或拼接容量数字', () => {
  assert.ok(!CREW.includes('slotText'), '不应再有 slotText 辅助函数');
  assert.ok(!/converterLoad\(|converterCapacity\(/.test(CREW), '不应再从 threadBinding 读容量用于展示');
  assert.ok(!CREW.includes('在岗/可容纳'), '说明行不应再写「在岗/可容纳」');
});

test('A2 下拉选项与筛选按钮只拼岗位名', () => {
  assert.match(CREW, /\$\{CONVERTERS\[t\] \? CONVERTERS\[t\]\.name : t\}\$\{visibleTypes\.includes\(t\) \? '' : '（未解锁）'\}/, '下拉只保留岗位名 + 旧档未解锁标记');
  assert.ok(!CREW.includes('${CONVERTERS[t].name}${slotText(t)}'), '筛选按钮不再附容量');
});

test('A3 Wiki 岗位容量段不再写「面板显示 在岗/可容纳」', () => {
  assert.ok(!WIKI.includes('面板显示「在岗/可容纳」'), 'Wiki 与面板同口径');
  assert.match(WIKI, /智能分配先把所有已解锁且开启的资源岗位按容量填满/, '容量规则仍保留说明');
});

// ============ B. 反馈② 未解锁自动转化不展示 ============
console.log('[B] 自动转化快捷开关：解锁后才出现');

test('B1 灰显占位按钮与锁定样式已移除', () => {
  assert.ok(!MAIN.includes('QS_STYLE_LOCK'), '不再有灰显样式');
  assert.ok(!MAIN.includes('data-qs-lock'), '不再生成锁定态按钮');
  assert.ok(!MAIN.includes("data-qs=\"-1\""), '不再有占位按钮');
  assert.ok(!MAIN.includes('未解锁：在'), '不再有未解锁 title');
});

test('B2 六枚开关各自按解锁判定 push，全未解锁时整块面板隐藏', () => {
  assert.match(MAIN, /panel\.style\.display = items\.length \? '' : 'none'/, '空列表隐藏整块面板');
  const pushCount = (MAIN.match(/items\.push\(/g) || []).length;
  assert.equal(pushCount, 6, '蒸馏/探采/孵化/圣所/深入/净化共 6 枚');
  assert.match(MAIN, /if \(converterUnlocked\('vehicles'\)\)/, '探采按唯一解锁源判定');
  assert.match(MAIN, /if \(riftUpgradeLevel\('auto_purify'\) >= 1\)/, '净化按科技等级判定');
});

test('B3 Wiki 仍与实现同源（各系统解锁后出现）', () => {
  assert.match(WIKI, /各系统解锁后出现/, 'Wiki 描述与解锁后展示一致');
});

// ============ C. 反馈③ 班组领导文案 ============
console.log('[C] 班组不再展示领导「不占岗位」文案');

test('C1 班组面板不含「不占岗位」字样', () => {
  assert.ok(!CREW.includes('不占岗位'), 'crew.js 不应再写该文案');
  assert.ok(!CREW.includes('全局加成 ·'), '卡面文案已移除');
  assert.ok(!CREW.includes('全局加成位：不占任何岗位'), 'title 已移除');
});

test('C2 领导卡仍不给岗位下拉（v3.7.1 不变量不回退）', () => {
  assert.match(CREW, /const bindCtrl = isLeader\(c\)\s*\? ''/, '领导分支为空字符串');
  assert.match(CREW, /<select data-bind="\$\{c\.id\}"/, '普通线程仍有下拉');
});

test('C3 Wiki 规则说明保留玩法事实（非班组面板）', () => {
  assert.match(WIKI, /不占任何岗位、不计入岗位容量/, 'Wiki 仍解释领导全局位规则');
});

// ============ D. 反馈④ 任务面板高度 ============
console.log('[D] 任务面板高度刚好 3 张任务卡');

test('D1 CSS 固定高度 246px（Chrome 实测 76px 卡 + 6px 间距）', () => {
  assert.match(CSS, /#projects \{\s*height: 246px;\s*overflow-y: auto;/, '高度 246px 且内部滚动');
  assert.ok(!/#projects \{[^}]*height: 360px/.test(CSS), '旧的 360px 已移除');
});

// ============ E. 反馈⑤ 晋升模块 P3 门控 ============
console.log('[E] 晋升模块与 P3 渐进开放节点同源');

test('E1 唯一判定源 = isStageUnlocked(P3)', () => {
  assert.match(MAIN, /function prestigePanelVisible\(\) \{ return isStageUnlocked\('P3', S\); \}/, '判定源与 btn-prestige 同口径');
  const calls = (MAIN.match(/syncPrestigePanelVisibility\(\)/g) || []).length;
  assert.ok(calls >= 3, '定义 + 首屏 updateTabLocks + 周期 dirty.prestige 均接线');
});

test('E2 P3 天数门控：0 天隐藏 / 1.1 天出现 / 旧档无 startedAt 迁移安全', () => {
  assert.equal(isStageUnlocked('P3', { startedAt: Date.now() }), false, '新档 <1 天未到节点');
  assert.equal(isStageUnlocked('P3', { startedAt: Date.now() - 1.1 * 86400000 }), true, '1.1 天已到节点');
  assert.equal(isStageUnlocked('P3', {}), true, '旧档无 startedAt 不误隐藏');
});

// ============ F. 反馈⑥ 载具不增加 EP ============
console.log('[F] 载具只消耗 EP 换 DM，不提供 EP 产出');

const VEHICLE_IDS = BALANCE.vehicles.ids;

test('F1 四辆载具 cps 恒 0，且数据层无残留 CPS 注释', () => {
  for (const id of VEHICLE_IDS) {
    const u = UPGRADES.find(x => x.id === id);
    assert.ok(u, `缺少载具 ${id}`);
    assert.equal(u.cps, 0, `${u.name} 不应提供 EP 基础产出`);
  }
  assert.ok(!UPG.includes('全载具 CPS +50%'), '旧注释已同步');
});

test('F2 买载具不改变 computeCps，也不进 CPS 来源明细', () => {
  reset({ upgrades: { scribble: 10 } });
  const before = computeCps();
  const partsBefore = cpsBreakdown().join('|');
  S.upgrades.scooter = 5;
  S.upgrades.convoy = 2;
  const after = computeCps();
  assert.ok(Math.abs(after - before) < 1e-9, `购买 7 辆载具不应改变 CPS（${before} → ${after}）`);
  assert.equal(cpsBreakdown().join('|'), partsBefore, '来源明细不因载具变化');
  assert.ok(!cpsBreakdown().some(s => s.includes('载具产出')), '明细不再列出「载具产出」');
  assert.ok(!ECON.includes('${fmt(vehicle)}'), '读侧已删除载具明细分支');
});

test('F3 载具协议 ×1.5 作用于 DM 采集速率（不再乘 CPS）', () => {
  reset({ upgrades: { scooter: 3 } });
  const m0 = vehicleRateMult();
  const dm0 = vehicleDmPerMin();
  const cps0 = computeCps();
  S.upgrades.dmprotocol = 1;
  const m1 = vehicleRateMult();
  assert.ok(Math.abs(m1 / m0 - BALANCE.vehicles.protocolMult) < 1e-9, `速率乘区 ×${BALANCE.vehicles.protocolMult}`);
  assert.ok(Math.abs(vehicleDmPerMin() / dm0 - BALANCE.vehicles.protocolMult) < 1e-9, 'DM/min 同比例提升');
  assert.ok(Math.abs(computeCps() - cps0) < 1e-9, '协议不再抬高 EP 产出');
  assert.match(ECON, /if \(S\.upgrades\.dmprotocol\) m \*= BALANCE\.vehicles\.protocolMult/, '乘区落在 vehicleRateMult');
  assert.ok(!ECON.includes('全载具 CPS ×1.5'), 'CPS 侧旧乘区已删');
});

test('F4 探采消耗与产出同倍率缩放（连续结算口径不破坏）', () => {
  reset({ upgrades: { scooter: 1 }, ep: 1e12, dm: 0 });
  const a = probeFlowPerSec();
  S.upgrades.dmprotocol = 1;
  const b = probeFlowPerSec();
  assert.ok(a.dmPerSec > 0 && a.epPerSec > 0, '基础态有探采流');
  assert.ok(Math.abs(b.dmPerSec / a.dmPerSec - 1.5) < 1e-9, 'DM/s ×1.5');
  assert.ok(Math.abs(b.epPerSec / a.epPerSec - 1.5) < 1e-9, 'EP 消耗 ×1.5（对称）');
  assert.ok(Math.abs(b.epPerDm - a.epPerDm) < 1e-9, '汇率不因协议改变');
});

test('F5 载具仍然真实扣 EP、入账 DM（核心玩法不回归）', () => {
  reset({ upgrades: { scooter: 1 }, ep: 1e6, dm: 0 });
  const epBefore = S.ep;
  const cps = computeCps();
  const ran = tickVehicleCollect(1);
  assert.equal(ran, true, '有载具即结算');
  assert.ok(S.ep < epBefore, 'EP 被消耗');
  assert.ok(S.dm > 0, 'DM 入账');
  assert.ok(Math.abs(computeCps() - cps) < 1e-9, '结算不改变 CPS');
});

test('F6 商店载具卡不再出现「+X EP/s」', () => {
  assert.ok(!SHOP.includes('cpsEach'), '不再计算载具 EP 产出');
  assert.ok(!SHOP.includes('<div class="veh-line">${fmt(cpsEach)} EP/s</div>'), '兜底 EP 行已删');
  assert.match(SHOP, /−\$\{fmt\(probeEp\)\} EP\/s/, '仍展示消耗');
  assert.match(SHOP, /DM\/s/, '仍展示 DM 产出');
});

test('F7 Wiki / 配置注释同步', () => {
  assert.match(WIKI, /载具只消耗 EP 换取 DM、不提供 EP 产出/, 'Wiki 说明新口径');
  assert.match(WIKI, /载具 cps = 0/, '公式附录同步');
  assert.match(read('src/data/balance.js'), /载具协议 → 全载具 DM 采集速率 ×1\.5/, '配置注释同步');
});
