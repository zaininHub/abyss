// v3.11.1：历史封板测试归档后的「当前设计不变量」回归
//
// 取代 v290 / v302 / v257 / v284 / v286 / v300 等归档脚本里三类失效断言：
//   ① 依赖源码注释字符串的静态扫描（源码重构即误报）；
//   ② 依赖已变更的内部字段（如 _probeEpShortSec）；
//   ③ 编码已废止的旧设计（探采自动暂停、研究 10 项、政策 4 组、6 个宗教分支）。
// 纪律：只断言「产品行为」与「归档结构」，不锁死实现细节与易过期的数量。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LEGACY = join(__dirname, 'legacy');
const SELF = 'v3111-legacy-invariants.test.mjs';

// ---- 最小 DOM / 存储垫片（与顶层现代单测同口径）----
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
const mkEl = () => ({
  style: {}, classList: { add() {}, remove() {} }, className: '', dataset: {},
  innerHTML: '', title: '', children: [],
  appendChild(c) { this.children.push(c); return c; },
  addEventListener() {}, contains: () => true, closest: () => null,
  setAttribute() {}, getAttribute: () => null,
});
globalThis.document = {
  getElementById: () => null, createElement: mkEl, createDocumentFragment: mkEl,
  body: { classList: { add() {}, remove() {} } }, addEventListener() {},
  querySelectorAll: () => [],
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const { S, defaultState } = await import('../src/state.js');
const { tickVehicleCollect, setVehicleLogFn } = await import('../src/modules/vehicles.js');
const { tickReligion, setReligionToastFn, setReligionLogFn } = await import('../src/modules/religions.js');
const { faithCap } = await import('../src/data/religions.js');
const { chromePath, CHROME_CANDIDATES } = await import('./_chrome.mjs');

const vehicleLogs = [];
setVehicleLogFn((m) => vehicleLogs.push(m));
setReligionToastFn(() => {});
setReligionLogFn(() => {});

/** 每个用例都从 defaultState() 重建，避免用例间状态串扰。 */
function fresh() {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  vehicleLogs.length = 0;
  return S;
}

function probeFixture() {
  fresh();
  S._probeEnabled = true;
  S.upgrades = { scooter: 1 };
  S.ep = 0; S.dm = 0; S.paused = false;
  S.collapsed = false; S.riftExpedition = null;
  S._probeAutoPaused = false;
  S.vehCollectTimer = 0;
  return S;
}

function faithFixture() {
  fresh();
  S.ep = 1e8; S.faith = 0; S.devotion = 0; S.paused = false;
  S.religion = { unlocked: true, branch: 'sun', temple: 5, templeOff: false };
  S.resDiscovered = { faith: true };
  S._templeEpShortSec = 0;
  S.storyline = 'default';
  return S;
}

// ============ A. 归档边界（结构性，不随版本过期）============
const legacyFiles = readdirSync(LEGACY).filter((f) => f !== 'README.md');
const topTests = readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.mjs') && f !== SELF);

test('A1 归档目录内全部脚本统一为 *.legacy.mjs，不再被常规单测通配命中', () => {
  assert.ok(legacyFiles.length >= 60, `归档数量异常：${legacyFiles.length}`);
  const bad = legacyFiles.filter((f) => !f.endsWith('.legacy.mjs'));
  assert.deepEqual(bad, [], '归档目录内不得残留 *.test.mjs');
});

test('A2 顶层常规单测不再出现 .legacy.mjs，也不启动浏览器', () => {
  assert.equal(readdirSync(__dirname).filter((f) => f.endsWith('.legacy.mjs')).length, 0);
  const launches = topTests.filter((f) => {
    const src = readFileSync(join(__dirname, f), 'utf8');
    return src.includes('puppeteer.launch') || src.includes("from 'puppeteer-core'");
  });
  assert.deepEqual(launches, [], '常规单测必须是纯 Node，浏览器验收到 legacy/ 或 *-browser.mjs');
});

test('A3 跨平台 Chrome 单一真源存在', () => {
  assert.ok(existsSync(join(__dirname, '_chrome.mjs')));
});

// ============ B. Chrome 路径可移植性 ============
test('B1 chromePath() 返回当前机器上真实存在的可执行文件', () => {
  const p = chromePath();
  assert.equal(typeof p, 'string');
  assert.ok(existsSync(p), `探测到的路径不存在：${p}`);
});

test('B2 候选清单同时覆盖 Linux CI / Windows / macOS，保证归档脚本可移植', () => {
  assert.ok(CHROME_CANDIDATES.some((p) => p.includes('/usr/local/bin/chromium')), '缺 Linux CI 回退');
  assert.ok(CHROME_CANDIDATES.some((p) => p.includes('Google/Chrome/Application/chrome.exe')), '缺 Windows 候选');
  assert.ok(CHROME_CANDIDATES.some((p) => p.includes('Google Chrome.app')), '缺 macOS 候选');
});

test('B3 归档的浏览器脚本统一走 helper，不再硬编码 Linux 可执行路径', () => {
  const browserScripts = legacyFiles.filter((f) =>
    readFileSync(join(LEGACY, f), 'utf8').includes('puppeteer.launch'));
  assert.ok(browserScripts.length >= 40, `浏览器归档脚本数量异常：${browserScripts.length}`);
  const stale = browserScripts.filter((f) => {
    const src = readFileSync(join(LEGACY, f), 'utf8');
    return src.includes("executablePath: '/usr/local/bin/chromium'") || !src.includes('_chrome.mjs');
  });
  assert.deepEqual(stale, [], '仍有脚本硬编码 chromium 路径或未接 helper');
});

// ============ C. 探采：无自动暂停，EP 不足跳过、回升自动恢复 ============
test('C1 旧档 _probeAutoPaused 标记在 tick 中被清理（自动暂停机制已废除）', () => {
  probeFixture();
  S._probeAutoPaused = true;
  S.ep = 1e8;
  tickVehicleCollect(0.1);
  assert.equal(S._probeAutoPaused, false);
  assert.equal(vehicleLogs.filter((m) => m.includes('自动暂停')).length, 0, '不得产生暂停日志');
});

test('C2 EP 不足 → 本轮跳过：不产 DM、不扣 EP、不进入暂停态', () => {
  probeFixture();
  S.ep = 0;
  for (let i = 0; i < 60; i++) tickVehicleCollect(0.5);
  assert.equal(S.dm, 0, 'EP 为 0 时不得产出 DM');
  assert.equal(S.ep, 0, 'EP 为 0 时不得扣成负数');
  assert.equal(S._probeAutoPaused, false, '不得进入自动暂停');
});

test('C3 EP 回升 → 无需手动恢复，下一周期自动继续采集', () => {
  probeFixture();
  S.ep = 0;
  tickVehicleCollect(1);
  S.ep = 1e8;
  const ep0 = S.ep;
  tickVehicleCollect(10);
  assert.ok(S.dm > 0, 'EP 回升后应恢复 DM 产出');
  assert.ok(S.ep < ep0, '采集应消耗 EP');
  assert.equal(S._probeAutoPaused, false);
});

test('C4 DM 满仓 → 停止采集且不扣 EP', () => {
  probeFixture();
  S.ep = 1e8;
  S.dm = 1e12; // 远超上限，触发 room <= 0 分支
  const ep0 = S.ep;
  tickVehicleCollect(10);
  assert.equal(S.ep, ep0, '满仓不扣 EP');
  assert.equal(S._dmFull, true);
});

// ============ D. 信仰：余额钳回 / 满仓即停 / EP 不足不自动关闭 ============
test('D1 FP 余额越界时先钳回上限（取代旧档「保持 1e9」断言）', () => {
  faithFixture();
  const cap = faithCap();
  S.faith = cap + 500;
  tickReligion(1);
  assert.ok(S.faith <= cap + 1e-9, `FP 必须 ≤ 上限：${S.faith} / ${cap}`);
});

test('D2 FP 满仓 → 不产出也不消耗 EP（开关保持开启）', () => {
  faithFixture();
  S.faith = faithCap();
  const ep0 = S.ep;
  tickReligion(1);
  assert.equal(S.ep, ep0, '满仓不扣 EP');
  assert.equal(S.faith, faithCap(), '满仓不增产');
  assert.equal(S.religion.templeOff, false, '满仓不得自动关闭圣所');
});

test('D3 圣所 EP 不足 → 不产出、不消耗、不自动关闭；EP 恢复后自动继续', () => {
  faithFixture();
  S.ep = 0;
  for (let i = 0; i < 80; i++) tickReligion(0.1);
  assert.equal(S.faith, 0, 'EP 不足不产信仰');
  assert.equal(S.ep, 0, 'EP 不足不扣 EP');
  assert.equal(S.religion.templeOff, false, 'EP 不足不自动关闭圣所');

  S.ep = 1e8;
  tickReligion(1);
  assert.ok(S.faith > 0, 'EP 恢复后自动继续产出（无需手动重启）');
  assert.ok(S.ep < 1e8, '恢复产出后正常扣 EP');
});
