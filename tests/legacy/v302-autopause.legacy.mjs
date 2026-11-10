// v3.0.2 回归测试
// ① 圣所 EP 不足自动暂停（5s 缓冲期）+ 不自动恢复
// ② 探采 EP 不足缓冲期 + 不自动恢复（删除原自动恢复）
// ③ 缓冲期内 EP 恢复不暂停（防反复横跳）
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// localStorage 垫片
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};

const { S } = await import('../../src/state.js');
const { tickReligion, toggleTemple, setReligionToastFn } = await import('../../src/modules/religions.js');
const { tickVehicleCollect, setVehicleLogFn } = await import('../../src/modules/vehicles.js');
const { BALANCE } = await import('../../src/data/balance.js');

const logs = [];
setReligionToastFn(() => {});
setVehicleLogFn((m) => logs.push(m));

const reset = () => Object.assign(S, {
  ep: 1e8, faith: 0, devotion: 0,
  religion: { unlocked: true, branch: 'sun', temple: 5, templeOff: false, _templeAutoPaused: false },
  resDiscovered: { faith: true }, cultists: [{ name: 't1', output: 1, mood: '正常' }],
  _templeEpShortSec: 0, _probeEnabled: true, _probeAutoPaused: false, _probeEpShortSec: 0,
  vehCollectTimer: 0, upgrades: { scooter: 1 }, paused: false,
  rpTheories: {}, delve: { up: {} }, secretSanctums: {}, storyline: 'default',
});

// ===== ① 圣所：EP 不足不再自动关闭（v3.3.9 反馈⑦：不自动关闭、不产出不消耗）=====
test('① 圣所 EP 不足 → 不产出、不消耗、但不自动关闭', () => {
  reset();
  S.ep = 0; // EP 不足
  const faith0 = S.faith;
  for (let i = 0; i < 80; i++) tickReligion(0.1); // 跑 8s（超过旧 5s 缓冲）
  assert.equal(S.religion.templeOff, false, 'EP 不足也不再自动关闭圣所');
  assert.equal(S.faith, faith0, 'EP 不足 → 不产信仰');
  assert.equal(S.ep, 0, 'EP 不足 → 不扣 EP');
});

test('① 圣所 EP 恢复后自动恢复产出（开关一直开着）', () => {
  reset();
  S.ep = 0;
  for (let i = 0; i < 30; i++) tickReligion(0.1);
  const faith0 = S.faith;
  S.ep = 1e8;
  tickReligion(1);
  assert.equal(S.religion.templeOff, false, '保持开启');
  assert.ok(S.faith > faith0, 'EP 恢复 → 自动恢复产出（无需手动重启）');
  assert.ok(S.ep < 1e8, '恢复产出后正常扣 EP');
});

test('① 信仰满仓 → 不产出也不消耗 EP（满仓即停）', () => {
  reset();
  S.faith = 1e9; // 远超上限
  S.ep = 1e8;
  tickReligion(1);
  assert.equal(S.ep, 1e8, '满仓不扣 EP');
  assert.equal(S.faith, 1e9, '满仓不增产');
});

test('① 圣所手动重启清除自动暂停标记（无代价）', () => {
  reset();
  S.religion.templeOff = true; S.religion._templeAutoPaused = true;
  S.faith = 100; S.devotion = 100;
  const r = toggleTemple(); // 重启
  assert.equal(r.ok, true);
  assert.equal(S.religion.templeOff, false, '重启 → templeOff=false');
  assert.equal(S.religion._templeAutoPaused, false, '重启 → 清除 _templeAutoPaused');
  assert.equal(S.faith, 100, '重启无代价（信仰不变）');
  assert.equal(S.devotion, 100, '重启无代价（虔诚不变）');
});

// ===== ② 探采 EP 不足缓冲期 + 不自动恢复 =====
test('② 探采 EP 不足持续 5s → 自动暂停（_probeAutoPaused）', () => {
  reset();
  S.ep = 0; // EP 不足（周期成本 > 0）
  // 前 4.9s 不暂停
  for (let i = 0; i < 49; i++) tickVehicleCollect(0.1);
  assert.equal(S._probeAutoPaused, false, '缓冲期内（4.9s）不暂停');
  // 第 5s 触发
  tickVehicleCollect(0.2);
  assert.equal(S._probeAutoPaused, true, '持续 5s+ → _probeAutoPaused=true');
});

test('② 探采自动暂停后不自动恢复（EP 充足仍保持暂停）', () => {
  reset();
  S._probeAutoPaused = true;
  S.ep = 1e8; // EP 充足
  tickVehicleCollect(10);
  assert.equal(S._probeAutoPaused, true, 'EP 充足仍保持暂停（不自动恢复）');
});

test('② 探采缓冲期内 EP 恢复 → 不暂停（防反复横跳）', () => {
  reset();
  S.ep = 0;
  tickVehicleCollect(3); // 3s 不足
  assert.ok(S._probeEpShortSec > 0, '缓冲计时器累积');
  S.ep = 1e8; // EP 恢复
  tickVehicleCollect(0.1);
  assert.equal(S._probeEpShortSec, 0, 'EP 恢复 → 缓冲计时器重置');
  assert.equal(S._probeAutoPaused, false, '不暂停');
});

// ===== ③ 源码断言：缓冲期常量 + 自动恢复逻辑已删除 =====
test('③ vehicles.js：AUTO_PAUSE_GRACE=5 + 无自动恢复逻辑', () => {
  const src = readFileSync(new URL('../../src/modules/vehicles.js', import.meta.url), 'utf8');
  assert.ok(src.includes('AUTO_PAUSE_GRACE = 5'), '缓冲期 5s 常量');
  assert.ok(src.includes('_probeEpShortSec'), 'EP 不足缓冲计时器');
  assert.ok(src.includes('不自动恢复'), '注释声明不自动恢复');
  assert.ok(!src.includes('探采恢复：EP 已充足'), '删除了原自动恢复日志');
  assert.ok(src.includes('需手动点开关恢复'), '暂停日志含"需手动恢复"');
});

test('③ religions.js：圣所 EP 不足只停产停耗、不自动关闭（v3.3.9 反馈⑦）', () => {
  const src = readFileSync(new URL('../../src/modules/religions.js', import.meta.url), 'utf8');
  assert.ok(src.includes('_templeEpShortSec'), '圣所 EP 不足计时器（仅用于提示节流）');
  assert.ok(!/S\.religion\.templeOff = true;\s*\n\s*S\.religion\._templeAutoPaused = true;/.test(src), '不再自动置 templeOff');
  assert.ok(src.includes('EP 回升后自动恢复'), '注释/日志声明自动恢复');
  assert.ok(src.includes('faithCap() - 1e-9'), '满仓即停判定');
});

test('③ shop.js：探采开关手动恢复 + 文案"自动暂停·点击恢复"', () => {
  const src = readFileSync(new URL('../../src/modules/shop.js', import.meta.url), 'utf8');
  assert.ok(src.includes('自动暂停·点击恢复'), '按钮文案"自动暂停·点击恢复"');
  assert.ok(src.includes('需手动恢复'), '状态提示"需手动恢复"');
  assert.ok(/if \(S\._probeAutoPaused\)[\s\S]*?_probeAutoPaused = false/.test(src), '点击时清除 _probeAutoPaused（手动恢复）');
});
