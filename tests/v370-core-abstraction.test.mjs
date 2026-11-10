// v3.7.0 核心玩法抽象单测（纯 Node，无需浏览器）
//
// 覆盖本次重构要守住的几条红线：
//   A. 故事线规则表「声明 → 求值 → 消费」三段链完整，不再有无人调用的死规则；
//      且按 S.storyline 隔离、不依赖 loadStoryline() 的初始化顺序。
//   B. provider 变体内容（事件/异兽/章节）真正被规范化并可读，重复注册不叠加。
//   C. 章节 ID 的数字/字符串双形态统一口径，不撞号、不回退。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// ---- 最小 DOM / 存储垫片（与 smoke.test.mjs 同范式）----
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const ruleEngine = await import('../src/core/ruleEngine.js');
const { LINE_RULE_KEYS, LINE_RULE_LABELS, LINE_RULE_SOURCES, lineRule, lineFlag, currentLineRules, allLineRuleKeys } = await import('../src/core/lineRules.js');
const provider = await import('../src/core/provider.js');
const content = await import('../src/core/storylineContent.js');
const { CHAPTERS, currentChapter } = await import('../src/data/chapters.js');

const orderPkg = (await import('../src/storylines/line_order.js')).default;
const abyssPkg = (await import('../src/storylines/line_abyss.js')).default;
const faithPkg = (await import('../src/storylines/line_faith.js')).default;
const LINE_PKGS = [orderPkg, abyssPkg, faithPkg];

const S = (line = 'default') => ({ storyline: line, corruption: 0, faith: 0 });
const ECONOMY_SRC = readFileSync(new URL('../src/modules/economy.js', import.meta.url), 'utf8');

// ============ A. 规则表接线 ============
console.log('[A] 故事线规则：声明 → 求值 → 消费');

test('A1 每个规则键都有中文说明，且全部在故事线包中声明', () => {
  const declared = new Set(LINE_PKGS.flatMap(p => Object.keys(p.rules || {})));
  for (const key of allLineRuleKeys()) {
    assert.ok(LINE_RULE_LABELS[key], `${key} 缺中文说明`);
    assert.ok(declared.has(key), `${key} 未在任何故事线包声明`);
  }
  assert.equal(new Set(allLineRuleKeys()).size, allLineRuleKeys().length, '规则键不重复');
  assert.equal(LINE_RULE_SOURCES.length, 3, '三条分支线全部纳入静态注册');
});

test('A2 每个规则键在 economy.js 都有且仅有一个消费点', () => {
  const CONST_OF = {
    cost_mult_bonus: 'COST_MULT', corruption_penalty_reduce: 'CORRUPTION_PENALTY',
    corruption_cap: 'CORRUPTION_CAP', tide_negative_immune: 'TIDE_NEGATIVE',
    seal_dm_bonus: 'SEAL_DM', symbiosis_active: 'SYMBIOSIS',
    pet_mult_bonus: 'PET_MULT', faith_purify: 'FAITH_PURIFY',
    corrosion_slow: 'CORROSION_SLOW', global_mult: 'GLOBAL_MULT', ep_cap_mult: 'EP_CAP',
  };
  for (const [ruleKey, constName] of Object.entries(CONST_OF)) {
    const hits = (ECONOMY_SRC.match(new RegExp(`K\\.${constName}\\b`, 'g')) || []).length;
    assert.ok(hits >= 1, `规则 ${ruleKey} 在 economy.js 无消费点（死规则）`);
  }
});

test('A3 静态注册：Node 单测无需 loadStoryline 也能取到线专属规则', () => {
  assert.ok(currentLineRules(LINE_RULE_KEYS.EP_CAP, 'line_abyss').length > 0, 'abyss 应有 ep_cap_mult 规则');
  assert.ok(currentLineRules(LINE_RULE_KEYS.GLOBAL_MULT, 'line_faith').length > 0, 'faith 应有 global_mult 规则');
});

test('A4 lineRule 按 S.storyline 隔离，默认线不吃任何线专属加成', () => {
  assert.equal(lineRule(LINE_RULE_KEYS.EP_CAP, 1, S('default')), 1);
  assert.ok(Math.abs(lineRule(LINE_RULE_KEYS.EP_CAP, 1, S('line_abyss')) - 1.15) < 1e-9);
  assert.ok(Math.abs(lineRule(LINE_RULE_KEYS.EP_CAP, 1, S('line_order')) - 1.10) < 1e-9);
  assert.equal(lineRule(LINE_RULE_KEYS.GLOBAL_MULT, 1, S('line_faith')), 3);
  assert.equal(lineRule(LINE_RULE_KEYS.GLOBAL_MULT, 1, S('line_abyss')), 1, '不能串线');
  assert.ok(Math.abs(lineRule(LINE_RULE_KEYS.COST_MULT, 1, S('line_order')) - 0.97) < 1e-9);
});

test('A5 布尔规则：共生需腐化 > 50，信仰中和需 FP > 0', () => {
  assert.equal(lineFlag(LINE_RULE_KEYS.SYMBIOSIS, { storyline: 'line_abyss', corruption: 10 }), false);
  assert.equal(lineFlag(LINE_RULE_KEYS.SYMBIOSIS, { storyline: 'line_abyss', corruption: 80 }), true);
  assert.equal(lineFlag(LINE_RULE_KEYS.SYMBIOSIS, { storyline: 'line_order', corruption: 80 }), false, '共生不应串到秩序线');
  assert.equal(lineFlag(LINE_RULE_KEYS.FAITH_PURIFY, { storyline: 'line_faith', faith: 0 }), false);
  assert.equal(lineFlag(LINE_RULE_KEYS.FAITH_PURIFY, { storyline: 'line_faith', faith: 3 }), true);
});

test('A6 腐化上限 / 惩罚链：深渊线抬高上限，秩序与信仰线分别减轻惩罚', () => {
  assert.equal(lineRule(LINE_RULE_KEYS.CORRUPTION_CAP, 100, S('line_abyss')), 120);
  assert.equal(lineRule(LINE_RULE_KEYS.CORRUPTION_CAP, 100, S('default')), 100);
  const raw = 0.7; // 惩罚乘数
  const order = lineRule(LINE_RULE_KEYS.CORRUPTION_PENALTY, raw, S('line_order'));
  assert.ok(order > raw && order < 1, '熵减护盾应把惩罚向 1 收敛');
  assert.ok(Math.abs(lineRule(LINE_RULE_KEYS.CORROSION_SLOW, 1, S('line_faith')) - 0.75) < 1e-9);
});

test('A7 evaluate 按故事线过滤（修复旧版恒真 || true）', () => {
  ruleEngine.registerRule('v370_probe', b => b * 7, 10, 'line_faith');
  assert.equal(ruleEngine.evaluate('v370_probe', 2, { storyline: 'line_faith' }), 14);
  assert.equal(ruleEngine.evaluate('v370_probe', 2, { storyline: 'line_order' }), 2);
  assert.equal(ruleEngine.evaluate('v370_probe', 2, { storyline: 'default' }), 2);
  ruleEngine.unregisterRules('line_faith');
});

test('A8 优先级排序不改写注册表，重复求值结果稳定', () => {
  ruleEngine.registerRule('v370_order', b => b + 1, 1, 'default');
  ruleEngine.registerRule('v370_order', b => b * 2, 10, 'default');
  const before = ruleEngine.getRules('v370_order').map(r => r.priority);
  const a = ruleEngine.evaluate('v370_order', 3, { storyline: 'default' });
  const b = ruleEngine.evaluate('v370_order', 3, { storyline: 'default' });
  assert.equal(a, b, '重复求值应一致');
  assert.equal(a, 7, '高优先级先 ×2 再 +1 = 7');
  assert.deepEqual(ruleEngine.getRules('v370_order').map(r => r.priority), before, '注册表顺序不得被就地 sort 改写');
  ruleEngine.unregisterRules('default');
});

test('A9 单条规则异常被隔离，且 clearDynamicRules 保留声明式规则', () => {
  ruleEngine.registerRule('v370_throw', () => { throw new Error('bad rule'); }, 10, 'default');
  assert.doesNotThrow(() => ruleEngine.evaluate('v370_throw', 5, { storyline: 'default' }));
  assert.equal(ruleEngine.evaluate('v370_throw', 5, { storyline: 'default' }), 5);
  ruleEngine.unregisterRules('default');
  ruleEngine.clearDynamicRules();
  assert.ok(currentLineRules(LINE_RULE_KEYS.EP_CAP, 'line_abyss').length > 0, '静态规则不应被清场');
});

// ============ B. provider / 变体内容 ============
console.log('[B] provider 变体与内容规范化');

function withLine(id, fn) {
  provider._resetProvider();
  provider.setStoryline(id);
  const pkg = LINE_PKGS.find(p => p.id === id);
  if (pkg) provider.registerVariants(pkg.data);
  try { return fn(); } finally { provider._resetProvider(); }
}

test('B1 provider 注册 pets 表，默认 6 只异兽', () => {
  withLine('default', () => assert.equal(provider.getPets().length, 6));
});

test('B2 同一故事线重复注册同一张表不叠加（A→B→A 切换防回归）', () => {
  provider._resetProvider();
  provider.setStoryline('line_order');
  provider.registerVariants(orderPkg.data);
  const once = provider.getChapters().length;
  provider.setStoryline('line_abyss'); provider.registerVariants(abyssPkg.data);
  provider.setStoryline('line_order'); provider.registerVariants(orderPkg.data);
  provider.registerVariants(orderPkg.data); // 再注册一次同线
  assert.equal(provider.getChapters().length, once, '章节表不应翻倍');
  assert.equal(provider.getEvents().filter(e => e.id === 'protocol_bug').length, 1, '线专属事件不应重复');
  provider._resetProvider();
});

test('B3 事件池 = 主表 74 + 当前线 14（另一线的事件不串入）', () => {
  for (const pkg of LINE_PKGS) {
    withLine(pkg.id, () => {
      const evs = content.getStorylineEvents();
      assert.equal(evs.length, 88, `${pkg.id} 事件池应为 74+14`);
      assert.equal(new Set(evs.map(e => e.id)).size, evs.length, '事件 id 不重复');
      const lineIds = pkg.data.events.append.map(e => e.id);
      for (const id of lineIds) assert.ok(evs.some(e => e.id === id), `${pkg.id} 缺 ${id}`);
    });
  }
  withLine('line_order', () => {
    assert.ok(!content.getStorylineEvents().some(e => e.id === 'void_gift'), '深渊线事件不应出现在秩序线');
  });
});

test('B4 默认线事件池 74 项且全部通过 validateEvent', () => {
  withLine('default', () => {
    const evs = content.getStorylineEvents();
    assert.equal(evs.length, 74);
    for (const e of evs) assert.deepEqual(content.validateEvent(e), [], `${e.id} 非法：${content.validateEvent(e)}`);
  });
});

test('B5 三条线的全部事件合法（含线专属），无不支持的 type', () => {
  for (const pkg of LINE_PKGS) {
    withLine(pkg.id, () => {
      for (const e of content.getStorylineEvents()) {
        assert.ok(content.SUPPORTED_EVENT_TYPES.has(e.type), `${e.id} 的 type=${e.type} 无 applyEvent 分支`);
        assert.deepEqual(content.validateEvent(e), [], `${e.id} 字段不完整`);
      }
    });
  }
});

test('B6 normalizeVariantEvent 兼容旧声明形态', () => {
  const ev = content.normalizeVariantEvent({ id: 'old', name: '旧', desc: '旧事件', type: 'buff', buffMult: 2, dur: 60, weight: 0.3 });
  assert.equal(ev.mult, 2, 'buffMult 应归一为 mult');
  assert.equal(ev.minCps, 0, '缺 minCps 应补 0（不再恒 false）');
  assert.equal(ev.rare, true, 'weight<=0.5 应转为 rare');
  assert.deepEqual(content.validateEvent(ev), []);
  assert.equal(content.normalizeVariantEvent({ id: 'old2', name: '旧', desc: 'x', type: 'tech' }).type, 'freelevel');
});

test('B7 线专属异兽在数据完整的前提下按线可见', () => {
  withLine('default', () => assert.equal(content.getStorylinePets().length, 6));
  for (const [pkg, id] of [[orderPkg, 'logic_dove'], [abyssPkg, 'little_chaos'], [faithPkg, 'holy_moth']]) {
    withLine(pkg.id, () => {
      const pets = content.getStorylinePets();
      assert.equal(pets.length, 7, `${pkg.id} 应多 1 只线专属异兽`);
      const p = pets.find(x => x.id === id);
      assert.ok(p, `缺 ${id}`);
      for (const f of ['name', 'icon', 'price', 'tier', 'anim', 'spark', 'desc']) {
        assert.ok(p[f] !== undefined && p[f] !== null, `${id} 缺字段 ${f} → UI 会显示 undefined`);
      }
    });
  }
});

test('B8 章节变体表按线合并，主线 46 章 + 该线 18 章', () => {
  withLine('default', () => assert.equal(provider.getChapters().length, 46));
  for (const pkg of LINE_PKGS) {
    withLine(pkg.id, () => {
      const chs = provider.getChapters();
      assert.equal(chs.length, 64, `${pkg.id} 章节表应为 46+18`);
      const ids = chs.map(c => String(c.id));
      assert.equal(new Set(ids).size, ids.length, `${pkg.id} 章节 id 不重复`);
    });
  }
});

// ============ C. 章节 ID 统一口径 ============
console.log('[C] 章节 ID 口径');

test('C1 chapterRank / chapterCode / chapterSeq', () => {
  assert.deepEqual(content.chapterRank('12'), [12, '']);
  assert.deepEqual(content.chapterRank('5A'), [5, 'A']);
  assert.deepEqual(content.chapterRank('14C'), [14, 'C']);
  assert.equal(content.chapterSeq('12B'), 12);
  assert.notEqual(content.chapterCode('5A'), content.chapterCode(5), '变体与同序号主线不得撞号');
  assert.equal(content.chapterCode(5), 5, '主线数字章保持旧编码，旧档兼容');
});

test('C2 chapterProgress 让变体玩家也能达成终章成就', () => {
  assert.equal(content.chapterProgress('1'), 1);
  assert.equal(content.chapterProgress('18'), 18);
  assert.ok(content.chapterProgress('5A') >= 9, '立誓章应计入 chapter9');
  assert.ok(content.chapterProgress('14B') >= 18, '变体终章应计入 chapter18');
  assert.ok(content.chapterProgress('22') >= 22, '主线番外应计入 chapter22');
});

test('C3 currentChapter 绝不回退到低于 S.chapter', () => {
  const base = { chapter: '12', chapterEnteredAt: Date.now(), prestige: 999, es: 99999, faith: 99999, tech: {}, unlockedBuildings: {}, riftsSealed: 99, expeditionsDone: 99, upgrades: {}, buildings: {} };
  const ch = currentChapter(base, CHAPTERS);
  assert.ok(parseInt(String(ch.id), 10) >= 12, `不应回退，实际 ${ch.id}`);
});

test('C4 主线 46 章 id 唯一且每章都有 minDays 与文案', () => {
  assert.equal(CHAPTERS.length, 46);
  assert.equal(new Set(CHAPTERS.map(c => c.id)).size, 46);
  for (const c of CHAPTERS) {
    assert.equal(typeof c.minDays, 'number', `第 ${c.id} 章缺 minDays`);
    assert.ok(c.name && c.desc, `第 ${c.id} 章缺文案`);
  }
});
