// v3.0.0 配置与轻量公式单测：资源 / 线程 / 离线升级。
// 这些模块虽以静态配置为主，也固定 ID、成本曲线与前置关系，避免后续迭代静默破坏依赖。
import assert from 'node:assert/strict';
import test from 'node:test';
import { RESOURCES } from '../src/data/resources.js';
import { THREAD_TYPES, MOOD_MULT, threadCost } from '../src/data/threads.js';
import { OFF_UPGRADES } from '../src/data/offlineUpgrades.js';

test('资源配置：六类核心资源 ID 唯一且展示字段完整', () => {
  assert.deepEqual(Object.keys(RESOURCES).sort(), ['dm', 'ep', 'es', 'fa', 'pt', 'rp']);
  for (const [id, r] of Object.entries(RESOURCES)) {
    assert.ok(id && r.name && r.icon && r.desc, `${id} 展示字段不完整`);
  }
});

test('线程配置：四档 ID 唯一，成本与产出逐档递增', () => {
  assert.equal(THREAD_TYPES.length, 4);
  assert.equal(new Set(THREAD_TYPES.map(t => t.id)).size, THREAD_TYPES.length);
  for (let i = 1; i < THREAD_TYPES.length; i++) {
    assert.ok(THREAD_TYPES[i].baseCost > THREAD_TYPES[i - 1].baseCost);
    assert.ok(THREAD_TYPES[i].output > THREAD_TYPES[i - 1].output);
  }
});

test('线程情绪倍率：正常为 1，高情绪增益、异常状态惩罚', () => {
  assert.equal(MOOD_MULT['正常'], 1);
  assert.ok(MOOD_MULT['超频'] > MOOD_MULT['优化'] && MOOD_MULT['优化'] > MOOD_MULT['高效']);
  assert.ok(MOOD_MULT['阻塞'] < 1 && MOOD_MULT['死锁'] < MOOD_MULT['阻塞']);
});

test('threadCost：首购 15 EP，成本随已有数量严格递增且保持整数', () => {
  assert.equal(threadCost(0), 15);
  assert.equal(threadCost(1), 22);
  for (let n = 1; n < 20; n++) {
    assert.ok(Number.isInteger(threadCost(n)));
    assert.ok(threadCost(n) > threadCost(n - 1));
  }
});

test('离线升级：ID 唯一、EP+RP 双成本为正、前置引用有效', () => {
  const ids = new Set(OFF_UPGRADES.map(u => u.id));
  assert.equal(ids.size, OFF_UPGRADES.length);
  for (const u of OFF_UPGRADES) {
    assert.ok(u.cost > 0 && u.epCost > 0, `${u.id} 必须同时具有正 RP/EP 成本`);
    if (u.req) assert.ok(ids.has(u.req), `${u.id} 的前置 ${u.req} 不存在`);
  }
});
