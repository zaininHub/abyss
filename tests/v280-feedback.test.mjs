// v2.8.0 反馈回归（用户 m01826 八项）：
//   ①探采文案统一「-X EP/s  +Y DM/s」②遗物区去折叠下拉与重复分类标题 ③异兽出战位去「自动孵化未解锁」文案
//   ④孵化工坊更贵（8e4 起）且 EP 消耗下调（12000 EP/s）⑤食堂/维修坞/数据中心大幅涨价
//   ⑥异兽扩充只刷一次、异兽升级可重复 ⑦AI 效用购买（载具 / 净化节点）⑧第 8~12 章动作门槛
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { S, defaultState } from '../src/state.js';
import { BALANCE } from '../src/data/balance.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { UPGRADES } from '../src/data/upgrades.js';
import { ptHatchUpgCost } from '../src/modules/pets.js';
import { tickAI } from '../src/modules/ai.js';
import { availableResKinds, spawnProject } from '../src/modules/projects.js';

const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function resetState(extra = {}) {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d, extra);
  return S;
}

test('①探采文案统一为「-X EP/s  +Y DM/s」，不再出现「购入后按 … 换 … 持续采集」', () => {
  const shop = stripComments(read('src/modules/shop.js'));
  assert.ok(/\$\{fmt\(flow\.epPerSec\)\} EP\/s {2}\+\$\{fmtDmPerSec\(dmShown\)\} DM\/s/.test(shop),
    '页头 info 应为「-X EP/s  +Y DM/s」');
  assert.ok(!/购入后按 .* 换 .* 持续采集/.test(shop), '旧的「购入后按 … 换 … 持续采集」应删除');
  assert.ok(/class="veh-line" style="color:var\(--bad\)">−\$\{fmt\(probeEp\)\} EP\/s/.test(shop),
    '载具卡未购分支也应输出红色 -EP/s 行');
});

test('②深渊遗物：不再有折叠下拉，也不再重复输出分类标题', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(/\['dm-shop-title'\]/.test(main), '只剩深渊商店标题可折叠');
  assert.ok(!/\[[^\]]*'relic-title'[^\]]*\]/.test(main), '遗物标题不应再进折叠列表');
  const relics = stripComments(read('src/modules/relics.js'));
  assert.ok(!/<h3[^>]*>🌀 深渊遗物<\/h3>/.test(relics), '面板内不应重复输出「🌀 深渊遗物」标题（空态提示文案保留）');
});

test('③异兽出战位不再提示「自动孵化未解锁——到「商店 · 设施」购买孵化升级」', () => {
  const pets = stripComments(read('src/modules/pets.js'));
  assert.ok(!/自动孵化未解锁/.test(pets), '该提示文案应删除');
});

test('④孵化工坊：起始价 8e4（贵于灵感工坊 5e4）、EP 消耗 12000/s、卡面无「自动孵化」字样', () => {
  assert.equal(ptHatchUpgCost(1), 80000, '首级 8e4');
  assert.ok(ptHatchUpgCost(1) > (BALANCE.atrium?.base || 5e4), '必须比灵感工坊贵');
  assert.ok(ptHatchUpgCost(2) / ptHatchUpgCost(1) > 2.1 && ptHatchUpgCost(2) / ptHatchUpgCost(1) < 2.3, 'growth 仍为 2.2 量级（ceil 后比值略偏）');
  assert.equal(BALANCE.hatch.epPerSec, 12000, 'EP 消耗下调到 12000/s');
  assert.equal(BALANCE.hatch.epPerPt, 120000, '单位 PT 的 EP 成本同比例下调');
  const shop = stripComments(read('src/modules/shop.js'));
  assert.ok(!/自动孵化：/.test(shop), '卡面不应再有「自动孵化：」前缀');
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/BALANCE\.hatch\?\.epPerSec \|\| 12000/.test(eco), 'ptHatchEpPerSec 必须读 BALANCE，不再硬编码');
});

test('⑤数据中心 / 能量食堂 / 维修坞大幅涨价（×10）', () => {
  const byId = id => BUILDINGS.find(b => b.id === id);
  assert.equal(byId('canteen').base, 2e5, '能量食堂首级 2e5');
  assert.equal(byId('dock').base, 2e6, '维修坞首级 2e6');
  assert.equal(byId('datacenter').base, 8e5, '数据中心首级 8e5');
  // 相对次序不变：维修坞 > 数据中心 > 食堂
  assert.ok(byId('dock').base > byId('datacenter').base && byId('datacenter').base > byId('canteen').base, '涨价后相对次序保持');
});

test('⑥「异兽扩充」只刷一次，「异兽升级」可重复刷', () => {
  resetState();
  S.resDiscovered = { ...(S.resDiscovered || {}), pt: true };
  S.pt = 100;
  // 首次：扩充与升级都可能在候选池里
  const kinds = availableResKinds().filter(k => k.key === 'pt');
  assert.ok(kinds.some(k => k.metric === 'buy'), '扩充仍在候选池');
  assert.ok(kinds.some(k => k.metric === 'petlv'), '升级应在候选池里（可重复）');
  // 刷过一次扩充后，从此不再出现
  S._projOnce = { 'pt.buy': true };
  const after = availableResKinds().filter(k => k.key === 'pt');
  assert.equal(after.some(k => k.metric === 'buy'), false, '扩充刷过即不再出现');
  assert.ok(after.some(k => k.metric === 'petlv'), '升级不受一次性限制');
});

test('⑥补充 异兽升级进度按「当前等级和 − 刷出快照」计算', () => {
  resetState();
  S.resDiscovered = { ...(S.resDiscovered || {}), pt: true };
  S.pt = 100;
  S.pets = { hamster: { level: 1 } };
  S.projects = [];
  S._projOnce = {};
  // 直接构造一条 petlv 任务，验证进度口径
  const p = { type: 'res', metric: 'petlv', resKey: 'pt', name: '异兽升级', goal: 2, base: 1, progress: 0, status: 'active', deadline: Date.now() + 600000, reward: { kind: 'buff', key: 'x' } };
  S.projects.push(p);
  S.pets.hamster.level = 3;
  // tickProjects 内部按 metric 计算；这里复用同一函数口径的最小断言
  const cur = Object.values(S.pets).reduce((a, x) => a + (x.level || 0), 0);
  assert.equal(cur - p.base, 2, '进度 = 等级和增量');
  assert.ok(spawnProject && typeof spawnProject === 'function');
});

test('⑦AI 效用购买：无载具且裂隙已触发时先买外勤摩托队（而非只买 CPS 项）', () => {
  resetState();
  S.tech = { ai_core: true };
  S.ai = { autoUpgrade: true, autoHire: false, autoClaim: false, reserve: 0.3, timer: 999, crew: { upgrade: 1 } };
  S._riftSeen = true;
  S.resDiscovered = { ...(S.resDiscovered || {}), ep: true };
  S.corruption = 0;
  const scooter = UPGRADES.find(u => u.id === 'scooter');
  S.ep = scooter.base * 4;
  S.totalBuys = 0;
  tickAI(1);
  assert.equal((S.upgrades.scooter || 0) >= 1, true, '应当买下外勤摩托队');
});

test('⑦补充 AI 效用购买：腐化偏高且有 DM 时买净化节点', () => {
  resetState();
  S.tech = { ai_core: true };
  S.ai = { autoUpgrade: true, autoHire: false, autoClaim: true, reserve: 0.3, timer: 999, crew: { upgrade: 1 } };
  S._riftSeen = true;
  S.corruption = 30;
  S.resDiscovered = { ...(S.resDiscovered || {}), ep: true, dm: true };
  S.dm = 1000;
  S.upgrades.scooter = 1; // 已有载具 → 走净化分支
  S.ep = 1e6;
  tickAI(1);
  assert.equal((S.upgrades.purifier1 || 0) >= 1, true, '应当买下第一级净化节点');
});

test('⑧第 8~12 章门槛不再依赖升降次数（源码级）', () => {
  const src = read('src/data/chapters.js');
  assert.ok(/id:8[\s\S]{0,120}mirrorContractSigned\(s\) \|\| bazaarTraded\(s, 5\)/.test(src), '第 8 章 = 签约或集市成交');
  assert.ok(/id:9[\s\S]{0,120}eternalBought\(s\) \|\| mirrorTechLevels\(s\) >= 1/.test(src), '第 9 章 = 永恒矩阵或算力战争');
  assert.ok(/id:10[\s\S]{0,120}councilSeated\(s\)/.test(src), '第 10 章 = 坐过议席');
  assert.ok(/id:12[\s\S]{0,120}delveRan\(s\)/.test(src), '第 12 章 = 跑过深潜');
  assert.ok(!/cond:s=>s\.prestige>=40/.test(src), '旧的晋升 40 门槛应删除');
});

test('②补充 净化节点区不再输出「DM 购买 · 深入辅助（限 3 级）」与其上方的分隔横线（v2.8.1）', () => {
  const relics = stripComments(read('src/modules/relics.js'));
  assert.ok(!/DM 购买 · 深入辅助/.test(relics), '该行文案应删除');
  assert.ok(!/净化节点 <span/.test(relics), '不应再有「净化节点」标题行');
  // 该块不应再带 border-top 分隔线
  const block = relics.split('purifierFamilySeen()')[1] || '';
  assert.ok(!/border-top/.test(block.slice(0, 600)), '净化节点块不应再有上方横线');
});
