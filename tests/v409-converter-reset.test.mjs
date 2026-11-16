// v4.0.9 反馈⑫专项：晋升/轮回后自动转化开关全部初始化
//
// 用户反馈原文：「晋升以后自动转化应该全部初始化，目前晋升后还存在并且生效」。
// 根因：8 个自动转化开关/能力字段是「未声明字段」（不在 defaultState、不在任何生命周期清单），
// resetRunState 只重置清单内字段 → 晋升后 converterOn.vehicles=false / ptAutoHatch=true /
// riftAuto='auto_descent' / autoPurify=true 等全部残留并继续生效。
// 修复：defaultState 显式声明默认值 + RUN_RESET_KEYS 收编八键（本局制）。
//
// 语义裁定（测试锁死，防止将来无意识回退）：
//   玩家开关（converterOn/atriumOn/_probeEnabled/ptDistillOn）→ 回默认「开」；
//   能力/级数（ptAutoHatch/ptHatchLv，EP 购买的本局投入）→ 回「未解锁/1 级」；
//   本局决策（riftAuto 裂隙自动动作 / autoPurify 净化开关，依赖的 riftUpgrades 跨局保留）→ 回「关」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, SAVE_VERSION } from '../src/state.js';
import {
  RUN_RESET_KEYS, COMPAT_KEYS, CROSS_RUN_KEYS,
  orphanFieldNames, resetRunState,
} from '../src/core/stateSchema.js';

const SWITCH_KEYS = ['converterOn', 'atriumOn', '_probeEnabled', 'ptDistillOn', 'ptAutoHatch', 'ptHatchLv', 'riftAuto', 'autoPurify'];

test('F12 ① 八键全部显式声明于 defaultState（不再有未声明字段）', () => {
  const d = defaultState();
  for (const k of SWITCH_KEYS) {
    assert.ok(k in d, `${k} 必须在 defaultState 显式声明（读侧 !== false / || 1 兜底掩盖不了重置缺口）`);
  }
  assert.deepEqual(orphanFieldNames(Object.keys(d)), [], '无孤儿键');
  assert.equal(SAVE_VERSION, 6, 'SAVE_VERSION 不 bump');
});

test('F12 ② 八键全部进入 RUN_RESET_KEYS，且不与跨局清单冲突', () => {
  for (const k of SWITCH_KEYS) {
    assert.ok(RUN_RESET_KEYS.includes(k), `${k} 必须随晋升/轮回重置`);
    assert.ok(!CROSS_RUN_KEYS.includes(k), `${k} 不允许跨局保留`);
  }
  // 镜像键走 COMPAT 兜底没有意义（声明即有默认值），不应出现在 COMPAT_KEYS 里
  for (const k of SWITCH_KEYS) assert.ok(!COMPAT_KEYS.includes(k), `${k} 已声明默认值，无需 COMPAT 兜底`);
});

test('F12 ③ resetRunState 后全部回到默认（用户反馈场景直接复现）', () => {
  const defs = defaultState();
  const S = { ...defs };
  // 上一局末态：玩家关掉了蒸馏/探采、买了解锁、选了自动深入、开了自动净化
  S.converterOn = { vehicles: false, atrium: false };
  S.atriumOn = false; S._probeEnabled = false; S.ptDistillOn = false;
  S.ptAutoHatch = true; S.ptHatchLv = 7;
  S.riftAuto = 'auto_descent'; S.autoPurify = true;
  resetRunState(S, defs, {});
  assert.deepEqual(S.converterOn, { vehicles: true, atrium: true }, '转化器开关回默认全开');
  assert.equal(S.atriumOn, true, '灵感工坊蒸馏回默认开');
  assert.equal(S._probeEnabled, true, '载具探采回默认开');
  assert.equal(S.ptDistillOn, true, '孵化开关回默认开');
  assert.equal(S.ptAutoHatch, false, '自动孵化能力随本局 EP 投入重置');
  assert.equal(S.ptHatchLv, 1, '孵化工坊级数回 1');
  assert.equal(S.riftAuto, null, '裂隙自动动作选择回空');
  assert.equal(S.autoPurify, false, '自动净化回关');
});

test('F12 ④ 语义自洽：converterEnabled 读侧与重置后默认一致', () => {
  // threadBinding.converterEnabled 的兜底口径是「!== false 即开」——重置后默认值 true 与之天然一致；
  // 此处锁默认值方向，防止有人把默认改成 false 造成「新局转化器全静默」的暗坑。
  const d = defaultState();
  assert.equal(d.atriumOn, true);
  assert.equal(d._probeEnabled, true);
  assert.equal(d.ptDistillOn, true);
  assert.equal(d.converterOn.vehicles, true);
  assert.equal(d.converterOn.atrium, true);
});
