// v2.0.0 反馈（单测）①：仓储区「囤囤鼠认证」——参考馆藏认证的第二枚分类徽章
//
// 口径：
//   · 条件 = 同时拥有 4 种仓储建筑，且等级之和 ≥30（HOARDER_STORAGE_IDS 7 项 curated，非 cat 派生）
//   · 徽章 = 已完成（_specialTasksDone.sp4_hoarder）**且当前仍达标**才佩戴（晋升清零 upgrades 自动隐藏）
//   · 来信 = 邀请一次（_hoarderInvited）/ 未完成每 2 小时一条（_hoarderHintAt）/ 完成钢印一条
//   · 图形 = BADGE_ICON_HOARD（粮罐），配色类 .hoard，与馆藏认证（星章、主题色）区分
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
});
globalThis.document = {
  getElementById: () => null, createElement: mkEl, createDocumentFragment: mkEl,
  body: { classList: { add() {}, remove() {} } }, addEventListener() {},
  querySelectorAll: () => [],
  createTextNode: (t) => ({ text: t }),
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PROG = read('src/modules/progression.js');
const SHOP = read('src/modules/shop.js');
const DISC = read('src/modules/disclosure.js');
const CSS = read('src/style.css');
const STATE_SRC = read('src/state.js');
const SCHEMA = read('src/core/stateSchema.js');

const state = await import('../src/state.js');
const prog = await import('../src/modules/progression.js');
const { S, defaultState } = state;

function fresh() {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  return S;
}

test('H1 仓储 id 集是 7 项 curated 仓储（不含转化器/采集器/宗教产出）', () => {
  assert.deepEqual([...prog.HOARDER_STORAGE_IDS].sort(), [
    'deep_bin', 'dm_vault', 'faith_vault', 'pt_vault', 'reserve_bin', 'rp_vault', 'storage',
  ].sort());
  for (const bad of ['atrium', 'garden', 'oracle', 'temple', 'cpu', 'gpu', 'scooter', 'convoy', 'dmmind']) {
    assert.ok(!prog.HOARDER_STORAGE_IDS.includes(bad), `${bad} 不属于囤货类仓储`);
  }
});

test('H2 hoarderStorageProgress 计数种数/等级和，容忍字符串等级', () => {
  fresh();
  S.upgrades = { reserve_bin: 10, storage: '5', rp_vault: 4, dm_vault: 0, scribble: 99 };
  const p = prog.hoarderStorageProgress(S);
  assert.equal(p.kinds, 3, '只有 3 种（dm_vault 为 0 不计）');
  assert.equal(p.sum, 19);
});

test('H3 条件阈值：4 种且等级和 ≥30（3 种或 29 级不成）', () => {
  const task = prog.SPECIAL_TASKS.find((t) => t.id === 'sp4_hoarder');
  assert.ok(task, 'sp4_hoarder 必须存在');
  fresh();
  S.upgrades = { reserve_bin: 19, storage: 10, rp_vault: 1 }; // 3 种 / 30
  assert.equal(task.condition(S), false, '3 种不够');
  S.upgrades = { reserve_bin: 15, storage: 10, rp_vault: 3, deep_bin: 1 }; // 4 种 / 29
  assert.equal(task.condition(S), false, '29 级不够');
  S.upgrades = { reserve_bin: 15, storage: 10, rp_vault: 3, deep_bin: 2 }; // 4 种 / 30
  assert.equal(task.condition(S), true);
});

test('H4 商店徽章：已完成 + 当前达标才佩戴，文案与进度提示同源', () => {
  assert.match(SHOP, /const hoarderDone = !!\(\(S\._specialTasksDone \|\| \{\}\)\.sp4_hoarder\);/);
  assert.match(SHOP, /const hoarderNow = hoarderStorageProgress\(S\);/);
  assert.match(SHOP, /const hoarderCertified = hoarderDone && hoarderNow\.kinds >= 4 && hoarderNow\.sum >= 30;/);
  assert.match(SHOP, /badge: hoarderCertified \? '囤囤鼠认证' : ''/);
  assert.match(SHOP, /当前仓储 \$\{hoarderNow\.kinds\} 种 \/ 等级和 \$\{hoarderNow\.sum\}/);
  // 馆藏认证不得被误改
  assert.match(SHOP, /badge: museumCertified \? '馆藏认证' : ''/);
});

test('H5 来信三段式：邀请落档一次 / 2 小时关注 / 完成钢印', () => {
  assert.match(PROG, /S\._hoarderInvited = true;/);
  assert.match(PROG, /S\._hoarderHintAt = now;/);
  assert.match(PROG, /now - \(Number\(S\._hoarderHintAt\) \|\| 0\) >= MUSEUM_HINT_INTERVAL_MS/);
  assert.match(PROG, /仓管员递来一张清单：为避免深渊侵袭带来的粮食危机，建造累计4种30座仓储/);
  assert.match(PROG, /仓管员又来看了一眼你的库房\.\.\./);
  assert.match(PROG, /仓管员盖下钢印：囤囤鼠认证——仓廪充实，一粒不落。/);
  // 新增键落档且跨晋升保留
  assert.match(STATE_SRC, /_hoarderInvited: false,/);
  assert.match(STATE_SRC, /_hoarderHintAt: 0,/);
  assert.match(SCHEMA, /'_hoarderInvited', '_hoarderHintAt'/);
  const compat = SCHEMA.slice(SCHEMA.indexOf('COMPAT_KEYS'), SCHEMA.indexOf('RUN_RESET_KEYS'));
  const reset = SCHEMA.slice(SCHEMA.indexOf('RUN_RESET_KEYS'));
  assert.ok(compat.includes('_hoarderInvited'), 'COMPAT_KEYS 必须声明');
  assert.ok(!reset.includes('_hoarderInvited'), '不在 RUN_RESET_KEYS（晋升不重播剧情）');
});

test('H6 行为：邀请只打一次，2 小时内不催，满 2 小时后催一次，完成只打钢印', () => {
  fresh();
  const logs = [];
  const log = (m) => logs.push(m);
  S.upgrades = { reserve_bin: 5, storage: 5, rp_vault: 5, deep_bin: 5 }; // 4 种 / 20（未达标，但已够邀请）
  prog.checkSpecialTasks(S, log, () => {});
  assert.equal(logs.filter((m) => m.startsWith('仓管员递来一张清单')).length, 1, '邀请一次');
  assert.equal(S._hoarderInvited, true);

  prog.checkSpecialTasks(S, log, () => {});
  assert.equal(logs.filter((m) => m.startsWith('仓管员递来一张清单')).length, 1, '多帧不重复邀请');
  assert.equal(logs.filter((m) => m.includes('又来看了一眼')).length, 0, '未满 2 小时不催');

  S._hoarderHintAt = Date.now() - 2 * 60 * 60 * 1000 - 1;
  prog.checkSpecialTasks(S, log, () => {});
  assert.equal(logs.filter((m) => m.includes('又来看了一眼')).length, 1, '满 2 小时催一次');

  S.upgrades = { reserve_bin: 10, storage: 10, rp_vault: 5, deep_bin: 5 }; // 4 种 / 30
  prog.checkSpecialTasks(S, log, () => {});
  assert.equal(S._specialTasksDone.sp4_hoarder, true);
  assert.equal(logs.filter((m) => m.startsWith('仓管员盖下钢印')).length, 1, '完成钢印一条');
  assert.ok(!logs.some((m) => m.includes('特殊任务：囤囤鼠')), '不走通用任务模板');
});

test('H7 徽章图形：组可指定图形（粮罐）与配色类，馆藏认证仍用默认星章', () => {
  assert.match(DISC, /export const BADGE_ICON_HOARD = '<svg class="g-badge-ico"/);
  assert.match(DISC, /b\.innerHTML = \(g\.badgeIcon \|\| BADGE_ICON\) \+ g\.badge;/);
  assert.match(DISC, /b\.className = 'group-title-badge' \+ \(g\.badgeClass \? ` \$\{g\.badgeClass\}` : ''\)/);
  assert.match(SHOP, /badgeIcon: BADGE_ICON_HOARD/);
  assert.match(SHOP, /badgeClass: 'hoard'/);
  assert.match(CSS, /\.group-title-badge\.hoard \{[^}]*color: #d29922/);
});
