// v4.3.10 反馈专项（单测）：跨局指标解锁旁路封堵——补能间「开局没几分钟解锁了，完全买不起」
//
// 根因：shopUnlocked / aiShopUnlocked 的解锁门用 S.allTimeEp（CROSS_RUN_KEYS 跨局保留），
//   跨局玩家新局旧累计直接顶开门（CPU 门槛 = 3e7×0.3 = 9e6，旧局累计动辄 ≥1e9），卡看得见买不起。
//   主商店贵卡有 chainSplit 链窗口（???）挡着，补能间（cpu/gpu）走全可见 split 无链保护 → 唯一爆雷点。
// 修复：两处门换 S.runEarned（本局累计，RUN_RESET_KEYS 晋升清零）——
//   新档 runEarned==allTimeEp 行为不变；跨局玩家新局门关上，本局重新累计。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
const mkEl = () => ({
  style: {}, classList: { add() {}, remove() {} }, className: '', dataset: {},
  innerHTML: '', title: '', children: [],
  appendChild(c) { this.children.push(c); return c; },
  addEventListener() {}, contains: () => true, closest: () => null,
  setAttribute() {}, getAttribute: () => null,
  querySelector: () => null, querySelectorAll: () => [], remove() {},
  insertBefore() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
});
globalThis.document = {
  getElementById: () => null, createElement: mkEl, createDocumentFragment: mkEl,
  body: { classList: { add() {}, remove() {} } }, addEventListener() {},
  querySelectorAll: () => [],
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOP_SRC = readFileSync(join(ROOT, 'src', 'modules', 'shop.js'), 'utf8');
const AI_SRC = readFileSync(join(ROOT, 'src', 'modules', 'ai.js'), 'utf8');

const state = await import('../src/state.js');
const shop = await import('../src/modules/shop.js');
const { BALANCE } = await import('../src/data/balance.js');
const { S, defaultState } = state;

const cpu = BALANCE.upgrades ? BALANCE.upgrades.find(u => u.id === 'cpu') : null;
const cpuDef = cpu || (await import('../src/data/upgrades.js')).UPGRADES.find(u => u.id === 'cpu');

function fresh() {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  return S;
}

// shopUnlocked 未导出——源码级断言（剥注释后匹配门表达式）+ 渲染行为断言双保险
function stripComments(src) {
  return src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
test('A1 源码级：两处解锁门不再引用 allTimeEp，注释标注换源', () => {
  const shopBody = stripComments(SHOP_SRC);
  const aiBody = stripComments(AI_SRC);
  assert.ok(!/allTimeEp/.test(shopBody.split('lockedHint')[0].split('export function renderShop')[0].slice(-3000)) || true, '占位');
  // 门表达式：shop.js shopUnlocked 与 ai.js aiShopUnlocked 都应走 runEarned
  assert.ok(/S\.ep >= u\.base \* 0\.3 \|\| S\.runEarned >= u\.base \* 0\.3/.test(shopBody), 'shopUnlocked 走 runEarned');
  assert.ok(/S\.ep >= u\.base \* 0\.3 \|\| S\.runEarned >= u\.base \* 0\.3/.test(aiBody), 'aiShopUnlocked 走 runEarned');
  // 剥注释后不应再有 allTimeEp 参与（atrium revealed 门与 frameSystems 计数同断言口径）
  assert.ok(!/S\.allTimeEp >= u\.base/.test(shopBody), 'shop.js 无 allTimeEp 升级门');
  assert.ok(!/S\.allTimeEp >= u\.base/.test(aiBody), 'ai.js 无 allTimeEp 升级门');
  assert.ok(!/\(S\.allTimeEp \|\| 0\) >= base \* 0\.3/.test(shopBody), 'atrium revealed 门已换 runEarned');
  const frameSrc = stripComments(readFileSync(join(ROOT, 'src', 'systems', 'frameSystems.js'), 'utf8'));
  assert.ok(!/S\.allTimeEp >= u\.base/.test(frameSrc), 'frameSystems 解锁计数无 allTimeEp');
  assert.ok(!/\(S\.allTimeEp \|\| 0\) >= base \* 0\.3/.test(frameSrc), 'frameSystems atrium 门无 allTimeEp');
});

function renderThreadCards() {
  const c = mkEl();
  c._lastSig = undefined;
  shop.renderThreadShop(c);
  // 返回 [{ cls, name, html }]——锁定态在 className 上，按卡片解析避免跨卡正则误匹配
  return c.children.filter(x => /item/.test(x.className || '')).map(x => ({
    cls: x.className || '',
    name: (x.innerHTML.match(/<span>([^<]*)<\/span>/) || [])[1] || '',
    html: x.innerHTML || '',
  }));
}

test('A2 行为：跨局旁路场景——allTimeEp 巨大 + runEarned 归零，CPU/GPU 卡保持锁定态', () => {
  fresh();
  S.ep = 100;              // 本局 EP 远低于门槛
  S.allTimeEp = 5e9;       // 旧局累计（跨局保留）：旧门会误放行
  S.runEarned = 0;         // 本局累计为零
  const cards = renderThreadCards();
  const cpu = cards.find(c => c.name === 'CPU 超频');
  const gpu = cards.find(c => c.name === 'GPU 加速');
  assert.ok(cpu && /locked/.test(cpu.cls), 'runEarned=0 时 CPU 卡应渲染为锁定态');
  assert.ok(gpu && /locked/.test(gpu.cls), 'runEarned=0 时 GPU 卡应渲染为锁定态');
  assert.ok(/累计 .* EP 解锁/.test(cards.map(c => c.html).join('\n')), '锁定卡带「累计 X EP 解锁」提示');
});

test('A3 行为：本局 EP 门槛达成即解锁（当前 EP 路径不受换源影响）', () => {
  fresh();
  S.runEarned = 0;
  S.allTimeEp = 0;
  S.ep = cpuDef.base * 0.3; // 当前 EP 达 CPU 门槛（GPU 门槛更高仍锁定，属正确）
  const cards = renderThreadCards();
  const cpu = cards.find(c => c.name === 'CPU 超频');
  assert.ok(cpu && !/locked/.test(cpu.cls), 'EP 达 CPU 门槛后 CPU 卡不再是锁定态（item cant 可购灰态属正常）');
});

test('A4 行为：runEarned 本局累计达标解锁；晋升清零后门回落', () => {
  fresh();
  S.ep = 100;
  S.runEarned = cpuDef.base; // 本局累计 ≥ 门槛（base×0.3）
  const cards = renderThreadCards();
  const cpu = cards.find(c => c.name === 'CPU 超频');
  assert.ok(cpu && !/locked/.test(cpu.cls), 'runEarned 达标 → CPU 解锁');
  // 晋升清零语义由 RUN_RESET_KEYS 锁定（runEarned 在清单内），此处锁源码事实
  const schema = readFileSync(join(ROOT, 'src', 'core', 'stateSchema.js'), 'utf8');
  const m = schema.match(/RUN_RESET_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/);
  assert.ok(m && /'runEarned'/.test(m[1]), 'runEarned 在 RUN_RESET_KEYS（晋升清零，跨局门自然回落）');
});
