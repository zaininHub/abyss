// v4.3.25 第十五轮反馈专项（v4.3.24 四项反馈的收口验收）：
// ①馆藏认证徽章按「当前工位条件」实时佩戴 + 移到标题右侧 + 去问号手
// ②裂隙等级悬浮拆分（v4324 已覆盖，本文件只锁联动不重复）
// ③领导全局产出改线性：Lv1=+1.00%，每级 +0.01 个百分点；领导卡补回 -EP/s 消耗行
// ④领导加成全局化（EP/RP/PT/FP/DM 持续产出）+ 产出悬浮窗去「（全局 EP 产出）」括号
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 馆藏认证：实时条件佩戴 + 标题右侧 + 无问号手 ============

test('F1a 工位进度真源：3 种 / 等级和 ≥50，字符串旧档按数字计', async () => {
  const mod = await import(pathToFileURL(join(ROOT, 'src/modules/progression.js')).href);
  const ids = mod.MUSEUM_STATION_IDS;
  assert.ok(Array.isArray(ids) && ids.length >= 3, 'MUSEUM_STATION_IDS 应至少 3 个工位');
  const state = { upgrades: { [ids[0]]: 1, [ids[1]]: 1, [ids[2]]: '48' } };
  const p = mod.museumStationProgress(state);
  assert.equal(p.kinds, 3, '3 种工位应计 kinds=3');
  assert.equal(p.sum, 50, '字符串等级应转数字累计（1+1+48=50）');
  // 不足 50：条件不成立
  const p2 = mod.museumStationProgress({ upgrades: { [ids[0]]: 1, [ids[1]]: 1, [ids[2]]: 47 } });
  assert.ok(!(p2.kinds >= 3 && p2.sum >= 50), '等级和 49 不应判达标');
  // 不足 3 种
  const p3 = mod.museumStationProgress({ upgrades: { [ids[0]]: 50 } });
  assert.ok(!(p3.kinds >= 3 && p3.sum >= 50), '只 1 种工位不应判达标');
});

test('F1b 徽章显示实时复核当前条件（晋升后工位归零即隐藏）', () => {
  const shop = strip(read('src/modules/shop.js'));
  assert.match(shop, /museumStationProgress\(S\)/, 'shop 应调用 museumStationProgress 实时取进度');
  assert.match(shop, /museumCertified\s*=\s*museumDone\s*&&\s*museumNow\.kinds\s*>=\s*3\s*&&\s*museumNow\.sum\s*>=\s*50/,
    '徽章 = 历史完成标记 && 当前 3 种 && 当前等级和 ≥50');
  // 达标态翻转 → 商店重渲染（购买工位/晋升后徽章即时出现或隐藏）
  const prog = strip(read('src/modules/progression.js'));
  assert.match(prog, /_museumQualified/, 'checkSpecialTasks 应有达标态 watcher');
  assert.match(prog, /dirty\.shop\s*=\s*true/, '达标态翻转应触发商店重渲染');
});

test('F1c 徽章在标题右侧（先文字后徽章）+ 无问号手', () => {
  const disc = read('src/modules/disclosure.js');
  const order = disc.match(/appendChild\(document\.createTextNode\(g\.title\)\)[\s\S]{0,200}?appendChild\(b\)/);
  assert.ok(order, '组标题应先 append 标题文字、再 append 徽章（右侧）');
  const css = read('src/style.css');
  const block = css.match(/\.group-title-badge\s*\{[\s\S]*?\}/)?.[0] || '';
  assert.ok(block, '.group-title-badge 样式缺失');
  assert.match(block, /margin-left:\s*4px/, '徽章应 margin-left 贴标题右侧');
  assert.match(block, /cursor:\s*default/, '徽章应去掉问号手 cursor:help');
  assert.ok(!/cursor:\s*help/.test(block), '徽章不应保留 cursor:help');
});

// ============ 反馈③ 领导线性加成 + 消耗行 ============

function resetState(S) {
  S.cultists = [];
  S.upgrades = {};
  S.buildings = {};
  S.tech = {};
  S.converterOn = { vehicles: true, atrium: true };
  S.ep = 1e9;
  S.runEarned = 0;
  S.storyline = 'default';
  S.wageState = { state: 'ok' };
}
const mkLeader = (level) => ({
  id: Math.random(), name: 'L', profession: 'leader', level, xp: 0, leader: true,
  boundTo: null, output: 3, mood: '正常', moodTimer: 0, hiredAt: Date.now(), earned: 0,
});

test('F3a 领导全局加成线性：Lv1=1.00%，每级 +0.01 个百分点，Lv10=1.09%', async () => {
  const { S } = await import(pathToFileURL(join(ROOT, 'src/state.js')).href);
  const tb = await import(pathToFileURL(join(ROOT, 'src/modules/threadBinding.js')).href);
  const B = await import(pathToFileURL(join(ROOT, 'src/data/balance.js')).href);
  resetState(S);
  assert.equal(tb.leaderGlobalMult(), 1, '无领导时倍率应为 1');
  S.cultists.push(mkLeader(1));
  assert.equal(tb.leaderGlobalMult(), 1 + B.BALANCE.thread.binding.leaderGlobalPerLeader);
  assert.equal(Math.round(tb.leaderGlobalPercent() * 100) / 100, 1.00);
  S.cultists[0].level = 2;
  assert.equal(Math.round(tb.leaderGlobalPercent() * 100) / 100, 1.01);
  S.cultists[0].level = 10;
  assert.equal(Math.round(tb.leaderGlobalPercent() * 100) / 100, 1.09);
  // 不再是 ×threadLevelMult 复利口径（Lv10 旧口径会到 1.72%）
  assert.ok(tb.leaderGlobalPercent() < 1.1, 'Lv10 不应再出现 1.72% 复利口径');
});

test('F3b 领导卡补回「-X EP/s」消耗行，文案去 EP 限定', () => {
  const crew = strip(read('src/modules/crew.js'));
  // 领导分支有消耗行（与普通线程同构，refreshCrewDyn 自动刷新）
  const leadBranch = crew.match(/crew-line-num[\s\S]{0,260}?isLead\s*\?\s*`([\s\S]*?)`/)?.[1] || '';
  assert.ok(leadBranch, '领导卡模板分支未匹配');
  assert.match(leadBranch, /class="c-sal"/, '领导卡缺 c-sal 消耗行（用户反馈「-x EP/s 消失」）');
  assert.match(leadBranch, /全局产出\s*\+/, '领导卡应显示「全局产出 +X%」');
  assert.ok(!/全局 EP 产出/.test(crew), '卡面/悬浮/日志不应再写「全局 EP 产出」');
  // refreshCrewDyn 照刷所有 c-sal（含领导）
  const refresh = crew.match(/for\s*\(let i = 0; i < salEls\.length[\s\S]*?\n\s*\}/)?.[0] || crew;
  assert.match(refresh, /salEls\[i\]\.textContent\s*=\s*fmt\(salPer \* salaryFactorOf\(c\)\)/, '消耗行应统一动态刷新');
});

// ============ 反馈④ 全局化 + 去括号 ============

test('F4a 产出悬浮窗领导行去括号（不再限定 EP）', () => {
  const eco = strip(read('src/modules/economy.js'));
  assert.match(eco, /领导 \+\$\{\(\(lead - 1\) \* 100\)\.toFixed\(2\)\}%/, 'multBreakdown 领导行应为「领导 +X%」');
  assert.ok(!/（全局 EP 产出）/.test(eco), 'multBreakdown 不应再带「（全局 EP 产出）」后缀');
});

test('F4b 持续产出全接领导乘区：RP/PT 流 + FP 圣所 + DM 探采/深入', () => {
  const flows = strip(read('src/systems/resourceFlows.js'));
  assert.match(flows, /registerModifier\('rp',\s*\(mult\)\s*=>\s*mult \* leaderGlobalMult\(\)\)/, 'rp 流应挂领导乘区');
  assert.match(flows, /registerModifier\('pt',\s*\(mult\)\s*=>\s*mult \* leaderGlobalMult\(\)\)/, 'pt 流应挂领导乘区');
  const rel = strip(read('src/modules/religions.js'));
  assert.match(rel, /mult \*= leaderGlobalMult\(\)/, '圣所 FP 产出应挂领导乘区');
  const eco = strip(read('src/modules/economy.js'));
  const rate = eco.match(/export function vehicleRateMult\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(rate, /m \*= leaderGlobalMult\(\)/, '载具 DM 探采乘区应挂领导');
  const rift = strip(read('src/modules/rift.js'));
  assert.match(rift, /delveDmPerLevel \* rewardMul \* leaderGlobalMult\(\)/, '裂隙深入 DM 持续产出应挂领导');
  // 一次性奖励不乘（避免「产出加成」变「奖励加成」）
  assert.ok(!/sealDmReward\([^)]*\) \* leaderGlobalMult/.test(rift), '封印一次性奖励不应乘领导');
});

test('F4c 行为：RP/PT 流修饰器与 DM 探采随领导等级线性放大', async () => {
  const { S } = await import(pathToFileURL(join(ROOT, 'src/state.js')).href);
  resetState(S);
  await import(pathToFileURL(join(ROOT, 'src/systems/resourceFlows.js')).href);
  const { flowMultiplier } = await import(pathToFileURL(join(ROOT, 'src/core/flowEngine.js')).href);
  const eco = await import(pathToFileURL(join(ROOT, 'src/modules/economy.js')).href);
  const baseRp = flowMultiplier('rp', { S });
  const basePt = flowMultiplier('pt', { S });
  S.cultists.push(mkLeader(2)); // Lv2 → ×1.0101
  const rp2 = flowMultiplier('rp', { S });
  const pt2 = flowMultiplier('pt', { S });
  assert.ok(Math.abs(rp2 / baseRp - 1.0101) < 1e-9, `rp 流应 ×1.0101（实际 ${(rp2 / baseRp).toFixed(6)}）`);
  assert.ok(Math.abs(pt2 / basePt - 1.0101) < 1e-9, `pt 流应 ×1.0101（实际 ${(pt2 / basePt).toFixed(6)}）`);
  // DM 探采：载具基础 × 领导（先清空领导取基准）
  S.cultists = [];
  S.upgrades.scooter = 1;
  const dmNoLead = eco.vehicleDmPerMin();
  S.cultists = [mkLeader(10)]; // Lv10 → ×1.0109
  const dmLead = eco.vehicleDmPerMin();
  assert.ok(Math.abs(dmLead / dmNoLead - 1.0109) < 1e-9, `DM 探采应 ×1.0109（实际 ${(dmLead / dmNoLead).toFixed(6)}）`);
});
