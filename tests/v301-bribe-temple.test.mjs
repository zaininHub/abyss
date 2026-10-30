// v3.0.1 回归测试
// 问题2+3：贿赂后腐化清零（原 50%——线程被吞殆尽时无法净化，腐化卡住/回满再次触发抉择）
// 问题4：信仰圣所允许关闭，每次关闭损失信仰 30% + 虔诚 15%
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// localStorage 垫片（toggleTemple 内部调 save → localStorage）
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
};

const { S } = await import('../src/state.js');
const { toggleTemple, buyTemple, selectBranch, unlockReligion } = await import('../src/modules/religions.js');
const { templeFaithPerSec } = await import('../src/data/religions.js');

const reset = () => Object.assign(S, {
  ep: 1e8, faith: 0, devotion: 0, religion: { unlocked: true, branch: 'gaia', temple: 0, templeOff: false },
  resDiscovered: { faith: true }, cultists: [{ name: 't1', output: 1, mood: '正常' }],
});

// ===== 问题2+3：贿赂后腐化清零（源码断言——resolveCollapseChoice 在 main.js，Node 无法直接执行）=====
test('问题2+3：贿赂后腐化清零（非 50）+ 清除所有吞噬标记', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  // 贿赂分支：S.corruption = 0（非 50）
  assert.ok(src.includes('S.corruption = 0;'), '贿赂后腐化清零（S.corruption = 0）');
  assert.ok(!src.includes('S.corruption = 50;'), '不再有腐化回落 50% 的旧逻辑');
  // 显式清除 collapsed（防刷新启动检查 main.js:if(S.collapsed||S._collapseChoicePending) showCollapseChoice()）
  assert.ok(/resolveCollapseChoice[\s\S]*?S\.collapsed = false/.test(src), 'resolveCollapseChoice 显式清除 S.collapsed');
  // 日志含"腐化已被深渊收回"
  assert.ok(src.includes('腐化已被深渊收回'), '贿赂日志含"腐化已被深渊收回"');
});

test('问题2：wiki.js 描述同步为"腐化清零"', () => {
  const wiki = readFileSync(new URL('../src/data/wiki.js', import.meta.url), 'utf8');
  assert.ok(wiki.includes('腐化清零'), 'wiki 贿赂描述含"腐化清零"');
  assert.ok(!wiki.includes('腐化回落 50%'), 'wiki 不再有"腐化回落 50%"旧描述');
});

// ===== 问题4：信仰圣所关闭开关 =====
test('问题4①：圣所关闭后 templeFaithPerSec 返回 0（停止产出）', () => {
  reset();
  S.religion.temple = 5; // 5 级圣所
  const r0 = templeFaithPerSec();
  assert.ok(r0 > 0, `圣所开启时产出 > 0（${r0}）`);
  S.religion.templeOff = true;
  assert.equal(templeFaithPerSec(), 0, '圣所关闭后产出 = 0');
  S.religion.templeOff = false;
  assert.ok(templeFaithPerSec() > 0, '重启后产出恢复 > 0');
});

test('问题4②：关闭圣所损失信仰 30% + 虔诚 15%（向下取整）', () => {
  reset();
  S.religion.temple = 3;
  S.faith = 100;
  S.devotion = 100;
  const r = toggleTemple(); // 关闭
  assert.equal(r.ok, true, '关闭返回 ok');
  assert.equal(S.religion.templeOff, true, 'templeOff 标记置 true');
  assert.equal(S.faith, 70, '信仰 -30%（100→70）');
  assert.equal(S.devotion, 85, '虔诚 -15%（100→85）');
});

test('问题4③：重启圣所无代价（恢复产出，不扣信仰/虔诚）', () => {
  reset();
  S.religion.temple = 3;
  S.religion.templeOff = true;
  S.faith = 50;
  S.devotion = 50;
  const r = toggleTemple(); // 重启
  assert.equal(r.ok, true, '重启返回 ok');
  assert.equal(S.religion.templeOff, false, 'templeOff 置 false');
  assert.equal(S.faith, 50, '重启不扣信仰');
  assert.equal(S.devotion, 50, '重启不扣虔诚');
});

test('问题4④：无信仰/虔诚时关闭不报错（损失 0）', () => {
  reset();
  S.religion.temple = 3;
  S.faith = 0;
  S.devotion = 0;
  const r = toggleTemple();
  assert.equal(r.ok, true, '无信仰/虔诚仍可关闭');
  assert.equal(S.faith, 0, '信仰不变');
  assert.equal(S.devotion, 0, '虔诚不变');
  assert.equal(S.religion.templeOff, true, '标记置 true');
});

test('问题4⑤：未建造圣所不可关闭', () => {
  reset();
  S.religion.temple = 0;
  const r = toggleTemple();
  assert.equal(r.ok, false, '未建造圣所返回 ok=false');
  assert.ok(r.reason.includes('需先建造'), `reason 含"需先建造"（${r.reason}）`);
});

test('问题4⑥：每次关闭都损失（可重复关闭-重启-再关闭）', () => {
  reset();
  S.religion.temple = 3;
  S.faith = 1000;
  S.devotion = 1000;
  toggleTemple(); // 关闭①：faith 1000→700, dev 1000→850
  assert.equal(S.faith, 700);
  assert.equal(S.devotion, 850);
  toggleTemple(); // 重启
  assert.equal(S.religion.templeOff, false);
  S.faith = 700; S.devotion = 850; // 重启不扣，重置确认
  toggleTemple(); // 关闭②：faith 700→490, dev 850→723（850×0.15=127.5→floor 127，850-127=723）
  assert.equal(S.faith, 490, '第二次关闭再损 30% 信仰');
  assert.equal(S.devotion, 723, '第二次关闭再损 15% 虔诚');
});

test('问题4⑦：圣所面板含关闭/重启按钮 + templeOff 状态展示', () => {
  const src = readFileSync(new URL('../src/modules/religions.js', import.meta.url), 'utf8');
  assert.ok(src.includes('data-religion-toggle'), '面板含 data-religion-toggle 按钮');
  assert.ok(src.includes('关闭圣所'), '按钮文案"关闭圣所"');
  assert.ok(src.includes('重启圣所'), '按钮文案"重启圣所"');
  assert.ok(src.includes('已关闭（停止产出'), 'templeOff 时显示"已关闭"状态');
  // bindReligionPanel 绑定 toggle
  assert.ok(/data-religion-toggle[\s\S]*?toggleTemple/.test(src), 'bindReligionPanel 绑定 toggle→toggleTemple');
});
