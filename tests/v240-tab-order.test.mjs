// v2.4.1 反馈：大模块 tab 必须按解锁顺序从左往右排列。
//
// 守护的是一条不变量，而不是某次手工排序：
//   ① 顶栏 tab 的 DOM 顺序 = 各模块真实门禁章节的非降序（商店/科技树是开局设施，章号记 0）；
//   ② 新增模块 tab 必须登记章号——漏登记即失败，防止「新 tab 随手插在末尾」。
// 改门禁章号或增删 tab 时先看这里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHAPTER_GATES } from '../src/core/chapterGates.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// 顶栏 tab 的解锁章号：直接引用门禁表（不手抄章号），开局设施记 0。
const TAB_CHAPTER = {
  'btn-shop': 0,          // 开局
  'btn-tech': 0,          // 开局
  'btn-rp': 1,            // 矩阵存储库（第 1 章溢出后）
  'btn-rift-tab': 1,      // 首次裂隙（第 1 章）
  'btn-relics': CHAPTER_GATES.relics,
  'btn-pets': CHAPTER_GATES.pets,
  'btn-religion': CHAPTER_GATES.religion,
  'btn-policy': CHAPTER_GATES.policy,
  'btn-expedition': CHAPTER_GATES.starchart,
  'btn-bazaar': CHAPTER_GATES.bazaar,
  'btn-mirror': CHAPTER_GATES.mirror, // v2.5.0：镜像协议与集市同章（第 7 章）
  'btn-delve': CHAPTER_GATES.delve,
};
// 隐藏桩：switchTab 兼容用，display:none，不参与排序。
const HIDDEN = ['btn-prestige', 'btn-achievement', 'btn-offline', 'btn-storyline'];

const tabIds = () => {
  const bar = html.slice(html.indexOf('<div class="tabs">'), html.indexOf('<div class="tab-content">'));
  return [...bar.matchAll(/<button[^>]*id="(btn-[^"]+)"/g)].map(m => m[1]);
};

test('T1 顶栏 tab 全部登记解锁章号（新增 module 不许漏登记）', () => {
  const ids = tabIds().filter(id => !HIDDEN.includes(id));
  assert.ok(ids.length >= 11, `顶栏 tab 数量异常：${ids.length}`);
  for (const id of ids) {
    assert.equal(typeof TAB_CHAPTER[id], 'number', `${id} 未在 TAB_CHAPTER 登记解锁章号`);
  }
});

test('T2 DOM 顺序 = 解锁章序（非降序）', () => {
  const ids = tabIds().filter(id => !HIDDEN.includes(id));
  const chapters = ids.map(id => TAB_CHAPTER[id]);
  const sorted = [...chapters].sort((a, b) => a - b);
  assert.deepEqual(chapters, sorted,
    `tab 顺序与解锁章序不一致：${ids.map((id, i) => `${id.replace('btn-', '')}(ch${chapters[i]})`).join(' → ')}`);
});

test('T3 当前顺序快照（重排需同步本条）', () => {
  const ids = tabIds().filter(id => !HIDDEN.includes(id));
  assert.deepEqual(ids, [
    'btn-shop', 'btn-tech', 'btn-rp',
    'btn-rift-tab', 'btn-relics', 'btn-pets',
    'btn-religion', 'btn-policy',
    'btn-expedition', 'btn-bazaar', 'btn-mirror', 'btn-delve',
  ]);
});

test('T4 集市长在第 7 章、深潜之前；裂隙早于遗物（遗物 tab 依赖裂隙已触发）', () => {
  const ids = tabIds();
  const at = id => ids.indexOf(id);
  assert.ok(at('btn-bazaar') > at('btn-expedition'), '集市（第 7 章）应排在星图（第 4 章）之后');
  assert.ok(at('btn-bazaar') < at('btn-mirror'), '集市与镜像同章：集市在前（先有钱，再谈交易）');
  assert.ok(at('btn-mirror') < at('btn-delve'), '镜像（第 7 章）应排在深潜（第 11 章）之前');
  assert.ok(at('btn-rift-tab') < at('btn-relics'), '裂隙早于遗物（relicsTabOpen 依赖裂隙已触发）');
  assert.ok(at('btn-relics') < at('btn-pets'), '遗物（第 1 章）应排在异兽（第 2 章）之前');
});
