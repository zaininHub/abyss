// v4.3.23 第十三轮反馈专项：①领导升级改革（津贴/手动按钮下线，等级走普通 XP 路径）
// ②智能分配擅长优先（A2 阶段无匹配者不硬塞占坑）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 领导升级改革 ============

test('F1 津贴全链下线：economy 真源删除 + wages 实扣段删除 + drainBreakdown 行删除', () => {
  const eco = strip(read('src/modules/economy.js'));
  assert.ok(!/export function leaderSalaryPerSec/.test(eco), 'leaderSalaryPerSec 真源应删除');
  assert.ok(!/leaderSalaryPerSec/.test(eco), 'economy 内不应有任何津贴调用残留');
  const wages = strip(read('src/modules/wages.js'));
  assert.ok(!/leaderSalaryPerSec/.test(wages), 'tickWages 独立实扣段应删除');
  const crew = strip(read('src/modules/crew.js'));
  assert.ok(!/leaderSalaryPerSec/.test(crew), 'crew 卡面津贴显示应删除');
  const main = strip(read('src/main.js'));
  assert.ok(!/leaderSalaryPerSec/.test(main), 'main.js QA 钩子津贴应删除');
});

test('F2 手动升级全链下线：balance 三键删除 + threadBinding 函数删除 + 按钮删除', () => {
  const bal = strip(read('src/data/balance.js'));
  assert.ok(!/leaderLevelBonusPerLv|leaderEpPerSecPerLv|leaderLevelCap/.test(bal), 'balance 领导三键应删除');
  const tb = strip(read('src/modules/threadBinding.js'));
  assert.ok(!/levelUpLeader|canLevelUpLeader|leaderUpgradeCost/.test(tb), '手动升级函数应删除');
  const crew = strip(read('src/modules/crew.js'));
  assert.ok(!/data-lead-up/.test(crew), '升级按钮应删除');
  assert.ok(!/已满级/.test(crew), '满级文案应删除');
});

test('F3 等级走普通 XP 路径：tickThreads 不跳领导 + threadXpGainPerSec 领导特判 + leaderLvOf 门面', () => {
  const tb = strip(read('src/modules/threadBinding.js'));
  const tt = tb.match(/export function tickThreads\(dt\)\s*\{[\s\S]{0,600}?\n\}/);
  assert.ok(tt, 'tickThreads 函数缺失');
  assert.ok(!/isLeader/.test(tt[0]), 'tickThreads 不应有领导特判（普通 XP 路径）');
  assert.ok(/isLeader\(c\)\)\s*return\s*B\(\)\.xpPerSec\s*\*\s*B\(\)\.xpSuitableMult/.test(tb), 'threadXpGainPerSec 领导恒按合适口径积 XP');
  assert.match(tb, /export function leaderLvOf\(c\)\s*\{\s*return threadLevel\(c\);\s*\}/, 'leaderLvOf 应委托 threadLevel');
  assert.match(tb, /1 \+ B\(\)\.leaderGlobalPerLeader \* threadLevelMult/, 'leaderGlobalMult = 1 + 1% × 等级乘数');
});

test('F4 任命/卸任不动等级：crew.js 无重置 + 日志「经验保留」+ state.js leaderLv 迁移', () => {
  const crew = strip(read('src/modules/crew.js'));
  assert.ok(!/c\.level = 1; c\.xp = 0/.test(crew), '任命不应重置等级');
  assert.ok(!/c\.leaderLv\s*=/.test(crew), '不应写 leaderLv');
  assert.match(crew, /就任领导（Lv\.\$\{threadLevel\(c\)\}，全局 EP 产出 \+/, '就任日志口径');
  assert.ok((crew.match(/经验保留，回归普通线程/g) || []).length >= 2, '卸任/替换日志写「经验保留」');
  const state = read('src/state.js');
  assert.match(state, /delete c\.leaderLv;/, 'normalizeCrew 应删除旧档 leaderLv 字段');
  assert.match(state, /Math\.min\(9,/, '迁移钳 9 级（levelCap 10 内保加成不倒退）');
});

test('F5 staffOutputParts 等级统一：one/oneSal 统一吃 lvMult + wiki 领导段重写', () => {
  const eco = strip(read('src/modules/economy.js'));
  assert.match(eco, /const\s+lvMult\s*=\s*threadLevelMult\(threadLevel\(c\)\);/, 'lvMult 统一提取');
  assert.match(eco, /const\s+one\s*=\s*\(c\.output \|\| 3\) \* 0\.8 \* mood \* outMult \* lvMult;/, 'one 统一吃 lvMult');
  assert.match(eco, /const\s+oneSal\s*=\s*\(c\.output \|\| 3\) \* 0\.8 \* mood \* salaryOutMult \* lvMult;/, 'oneSal 统一吃 lvMult');
  const wiki = read('src/data/wiki.js');
  assert.match(wiki, /等级乘数/, 'wiki 领导段写等级乘数口径');
  assert.ok(!/领导津贴/.test(wiki), 'wiki 不应再有「领导津贴」');
});

// ============ 反馈② 智能分配擅长优先 ============

test('F6 A2 阶段无匹配者不硬塞：threadBinding autoAssignThreads 改 if (i < 0) continue', () => {
  const tb = strip(read('src/modules/threadBinding.js'));
  // 旧式应删除：place(idle.splice(i < 0 ? 0 : i, 1)[0], t)
  assert.ok(!/splice\(i < 0 \? 0 : i/.test(tb), 'A2 硬塞旧式应删除');
  // A2 阶段应有无匹配跳过（阶段 A1 与 A2 均有 if (i < 0) continue;——至少 2 处）
  const skips = (tb.match(/if \(i < 0\) continue;/g) || []).length;
  assert.ok(skips >= 2, `A1/A2 应各有无匹配跳过（实际 ${skips} 处）`);
});

test('F7 智能分配行为验证：无匹配者不占擅长岗位坑位', async () => {
  const { pathToFileURL } = await import('node:url');
  const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
  const { S } = await imp('src/state.js');
  const tb = await imp('src/modules/threadBinding.js');
  S.cultists.length = 0;
  S._crewUnlocked = true;
  const mk = (name, prof) => ({ id: name, name, profession: prof, level: 1, xp: 0, leader: false, boundTo: null, output: 3, mood: '正常', moodTimer: 60 });
  // hatch 容量 0（未解锁）：keeper 无可用擅长岗位；atrium 容量 1 留给 distiller
  S.upgrades.atrium = 1; S.upgrades.scooter = 0; S.religion = { temple: 0 };
  S.cultists.push(mk('k', 'keeper'));
  S.cultists.push(mk('d', 'distiller'));
  tb.autoAssignThreads();
  const d = S.cultists.find(c => c.name === 'd');
  const k = S.cultists.find(c => c.name === 'k');
  assert.equal(d.boundTo, 'atrium', 'distiller 应进擅长岗位 atrium（不被 keeper 占坑挤走）');
  assert.notEqual(k.boundTo, 'atrium', 'keeper（无匹配容量）不应占 atrium 坑');
});

// ============ 反馈③ 博物馆访客重做 ============

test('F8 博物馆条件改工位口径：condition 读 MUSEUM_STATION_IDS + desc 白话', () => {
  const prog = strip(read('src/modules/progression.js'));
  assert.match(prog, /export const MUSEUM_STATION_IDS/, 'MUSEUM_STATION_IDS 导出存在');
  assert.match(prog, /UPGRADES\.filter\(u => u\.cps > 0 && !u\.produces && !u\.cat\)/, '工位谓词与 shop.js 同口径');
  assert.match(prog, /kinds >= 3 && sum >= 50/, '条件 = 3 种工位 + 等级之和 ≥50');
  assert.match(prog, /同时拥有 3 种工位，且工位等级之和达到 50 级/, 'desc 白话新口径');
  assert.ok(!/S\.buildings/.test(prog.match(/id: 'sp1_museum'[\s\S]{0,900}?line: 'any'/)?.[0] || ''), '旧 buildings 条件应移除');
  assert.match(prog, /hintEverySec: 60/, '触发后周期提醒字段');
});

test('F9 触发后未完成周期日志：checkSpecialTasks 有进度提醒分支 + 完成徽章日志', () => {
  const prog = read('src/modules/progression.js');
  assert.match(prog, /博物馆的访客仍在参观（工位 \$\{kinds\}\/3 种，等级和 \$\{sum\}\/50）/, '进度提醒日志');
  assert.match(prog, /馆藏认证已颁发/, '完成徽章提示日志');
  assert.match(prog, /_lastMuseumHint/, '提醒节流时间戳');
});

test('F10 工位标题徽章：shop.js badge 字段 + disclosure.js group-title-badge + CSS', () => {
  const shop = strip(read('src/modules/shop.js'));
  assert.match(shop, /museumCertified/, 'shop.js 读完成态');
  assert.match(shop, /badge: museumCertified \? '馆藏认证' : ''/, '工位组挂「馆藏认证」徽章');
  const disc = strip(read('src/modules/disclosure.js'));
  assert.match(disc, /group-title-badge/, '组标题徽章 DOM 渲染');
  assert.match(disc, /g\.badge/, 'renderChainedGroups 支持 badge 字段');
  const css = read('src/style.css');
  assert.match(css, /\.group-title-badge \{/, '徽章样式存在');
  assert.match(css, /html\.theme-light \.group-title-badge/, '浅色主题变体存在');
});

test('F11 wiki 博物馆行更新：新条件 + 徽章奖励', () => {
  const wiki = read('src/data/wiki.js');
  assert.match(wiki, /同时拥有 3 种工位（主商店「工位」分类下的升级），且工位等级之和 ≥50/, 'wiki 新条件');
  assert.match(wiki, /永久佩戴「馆藏认证」徽章/, 'wiki 徽章奖励');
  assert.ok(!/名下建筑买够 2 种/.test(wiki), 'wiki 旧条件应移除');
});
