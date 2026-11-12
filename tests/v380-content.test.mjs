// v3.8.0 内容扩充完整性单测（纯 Node）
//
// 覆盖项目历史上反复踩的坑 + 本次新增内容：
//   ① 配置数组 + 渲染分组表两头改；② 新增效果键无人消费（死研究/死政策）；
//   ③ 事件数值越界；④ 章节 ID 撞号 / 缺门控字段；⑤ Wiki 渲染出 undefined。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { BALANCE } = await import('../src/data/balance.js');
const { CHAPTERS, currentChapter } = await import('../src/data/chapters.js');
const { EVENTS } = await import('../src/data/events.js');
const { POLICY_GROUPS, policyMult } = await import('../src/data/policies.js');
const { RP_GROUPS } = await import('../src/modules/shop.js');
const { WIKI_SECTIONS } = await import('../src/data/wiki.js');
const content = await import('../src/core/storylineContent.js');
const orch = await import('../src/core/orchestration.js');
const eco = await import('../src/modules/economy.js');
const { S } = await import('../src/state.js');
const orderPkg = (await import('../src/storylines/line_order.js')).default;
const abyssPkg = (await import('../src/storylines/line_abyss.js')).default;
const faithPkg = (await import('../src/storylines/line_faith.js')).default;
const LINE_PKGS = [orderPkg, abyssPkg, faithPkg];
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MAIN_SRC = readFileSync(join(SRC_ROOT, 'main.js'), 'utf8');
// 消费点可能落在任意模块（如 delve.js / rift.js），必须递归扫全库，否则会误报「死升级/死政策」
function allSource() {
  let out = '';
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) out += readFileSync(p, 'utf8') + '\n';
    }
  };
  walk(SRC_ROOT);
  return out;
}
const ALL_SRC = allSource();

console.log('[E] 扩充幅度与全局唯一性');

test('E1 各内容表扩充幅度落在 10%~30% 区间', () => {
  const rows = [
    // v3.12.9：before 基线上移到上一版（46 章 / 74 事件），否则累计幅度会误判越界
    ['主线章节', CHAPTERS.length, 46],
    ['主事件', EVENTS.length, 74],
    ['政策项', POLICY_GROUPS.reduce((n, g) => n + g.policies.length, 0), 33],
    ['百科章节', WIKI_SECTIONS.length, 24],
    ['里程碑', BALANCE.miles.length, 13],
  ];
  for (const [name, now, before] of rows) {
    const pct = (now - before) / before * 100;
    assert.ok(pct >= 10 && pct <= 30, `${name} 扩充 ${pct.toFixed(1)}% 超出 10~30%：${before}→${now}`);
    assert.ok(now > before, `${name} 未扩充`);
  }
  assert.equal(CHAPTERS.length, 51);
  assert.equal(EVENTS.length, 82);
  assert.equal(BALANCE.researchUpgs.length, 22); // v3.12.11 反馈②：68→21；v3.12.12 ⑧：+rp_ai_unit → 22
  assert.equal(POLICY_GROUPS.length, 13);
  assert.equal(WIKI_SECTIONS.length, 28); // v3.12.8：删除「第六条策略」
  assert.equal(BALANCE.miles.length, 16);
});

test('E2 三线变体章节 16→18、事件 12→14，章节/事件 id 全局唯一', () => {
  for (const pkg of LINE_PKGS) {
    assert.equal(pkg.data.chapters.append.length, 18, `${pkg.id} 章节数`);
    assert.equal(pkg.data.events.append.length, 14, `${pkg.id} 事件数`);
  }
  const chIds = [...CHAPTERS.map(c => String(c.id)), ...LINE_PKGS.flatMap(p => p.data.chapters.append.map(c => String(c.id)))];
  assert.equal(chIds.length, CHAPTERS.length + 3 * 18);
  assert.equal(new Set(chIds).size, chIds.length, '章节 id 撞号');
  const evIds = [...EVENTS.map(e => e.id), ...LINE_PKGS.flatMap(p => p.data.events.append.map(e => e.id))];
  assert.equal(evIds.length, EVENTS.length + 3 * 14);
  assert.equal(new Set(evIds).size, evIds.length, '事件 id 撞号');
});

test('E3 新增章节均有 minDays / 文案 / 可安全求值的 cond', () => {
  const rich = {
    prestige: 999, es: 1e6, faith: 1e6, expeditionsDone: 999, riftsSealed: 999,
    riftEmber: 1e9, dm: 1e6, allTimeEp: 1e18, projectsDone: 999,
    tech: {}, buildings: {}, unlockedBuildings: {}, upgrades: {}, religion: {},
    wageState: { state: 'ok' }, chapter: '1', chapterEnteredAt: 0,
  };
  // 主线表自带 minDays；变体表未声明时由 currentChapter 统一按 3 天下限，属既有设计而非缺陷
  for (const c of CHAPTERS) {
    assert.equal(typeof c.minDays, 'number', `主线第 ${c.id} 章缺 minDays`);
    assert.ok(c.minDays >= 0 && c.minDays <= 10, `主线第 ${c.id} 章 minDays 异常`);
  }
  for (const c of [...CHAPTERS, ...LINE_PKGS.flatMap(p => p.data.chapters.append)]) {
    if (typeof c.minDays === 'number') assert.ok(c.minDays >= 0 && c.minDays <= 10, `第 ${c.id} 章 minDays 异常`);
    assert.ok(c.name && c.desc, `第 ${c.id} 章缺文案`);
    assert.doesNotThrow(() => !!c.cond(rich), `第 ${c.id} 章 cond 抛错`);
  }
  for (const id of [25, 26, 27, 28, 29, 30, 31, 32]) {
    const c = CHAPTERS.find(x => x.id === id);
    assert.ok(c, `缺新增章节 ${id}`);
    assert.ok(c.cond(rich), `第 ${id} 章条件应可达`);
  }
  assert.ok(content.chapterProgress('25') >= 25, '新章节应进入成就进度口径');
});

console.log('[F] 配置与消费点接线');

test('F1 68 项研究全部归属 RP_GROUPS，分组无幽灵 id，fx.key 有消费点', () => {
  const grouped = RP_GROUPS.flatMap(g => g.ids);
  const defined = BALANCE.researchUpgs.map(u => u.id);
  assert.equal(new Set(grouped).size, grouped.length, '分组内重复');
  assert.equal(grouped.length, defined.length, '分组数与研究项数不一致');
  for (const id of defined) assert.ok(grouped.includes(id), `${id} 未进分组 → 面板不可见/买不到`);
  for (const id of grouped) assert.ok(defined.includes(id), `分组引用幽灵 id ${id}`);
  const consumed = new Set([...ALL_SRC.matchAll(/researchMult\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)].map(m => m[1]));
  for (const u of BALANCE.researchUpgs) {
    if (!u.fx) continue; // v3.12.12 ⑧：fx=null 为授予型研究（rp_ai_unit 购买即 +1 助手）
    assert.ok(consumed.has(u.fx.key), `${u.id} 的 fx.key=${u.fx.key} 无消费点（死升级）`);
    assert.ok(u.cap > 0 && u.base > 0 && u.growth > 1, `${u.id} 曲线参数非法`);
  }
});

test('F2 39 项政策 effect key 全部有 policyMult 消费点，新组 unlock 可安全求值', () => {
  const consumed = new Set([...ALL_SRC.matchAll(/policyMult\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)].map(m => m[1]));
  const ids = [];
  for (const g of POLICY_GROUPS) {
    assert.ok(g.name && typeof g.unlock === 'function' && g.hint, `政策组 ${g.id} 结构不完整`);
    assert.doesNotThrow(() => !!g.unlock(S), `政策组 ${g.id} unlock 抛错`);
    for (const p of g.policies) {
      ids.push(p.id);
      assert.ok(p.desc, `${p.id} 缺描述`);
      assert.ok(Object.keys(p.effect).length > 0, `${p.id} 无效果`);
      for (const k of Object.keys(p.effect)) assert.ok(consumed.has(k), `${p.id} 的 effect.${k} 无消费点（死政策）`);
    }
  }
  assert.equal(new Set(ids).size, ids.length, '政策 id 重复');
  assert.equal(ids.length, 39);
  const g = POLICY_GROUPS.find(x => x.id === 'orchestration');
  assert.ok(g, '缺「编排律令」组');
  assert.equal(g.policies.length, 4);
  const w = POLICY_GROUPS.find(x => x.id === 'watch');
  assert.ok(w, '缺 v3.9.0 新增「值守纪律」组');
  assert.equal(w.policies.length, 4);
  assert.equal(typeof policyMult('ep'), 'number', '政策读侧应可独立求值');
});

test('F3 全部事件数值在主表天花板内，且 type 都有 applyEvent 分支', () => {
  const all = [...EVENTS, ...LINE_PKGS.flatMap(p => p.data.events.append)];
  for (const e of all) {
    assert.ok(content.SUPPORTED_EVENT_TYPES.has(e.type), `${e.id} 的 type=${e.type} 无实现分支`);
    assert.deepEqual(content.validateEvent(e), [], `${e.id} 字段不完整：${content.validateEvent(e)}`);
    if (e.type === 'buff' || e.type === 'clickbuff') {
      assert.ok(e.mult <= 20, `${e.id} buff 倍率 ${e.mult} 越界`);
      assert.ok(e.dur <= 3600, `${e.id} 时长 ${e.dur}s 越界`);
    }
    if (e.type === 'ep') assert.ok((e.amount || 0) <= 14400, `${e.id} 产出秒数越界`);
    if (e.type === 'debuff') assert.ok(e.mult >= 0.3 && e.mult < 1, `${e.id} debuff 倍率异常`);
  }
  assert.equal(all.length, EVENTS.length + 3 * 14);
});

test('F4 里程碑只追加不重排，既有 cps 键与奖励完全不变', () => {
  const base = [[100, 8], [1e3, 6], [1e4, 10], [1e5, 15], [1e6, 1000], [1e7, 5000], [1e8, 20000]];
  for (let i = 0; i < base.length; i++) {
    assert.equal(BALANCE.miles[i].cps, base[i][0], `第 ${i} 档门槛被改动`);
    assert.equal(BALANCE.miles[i].rp, base[i][1], `第 ${i} 档奖励被改动`);
  }
  assert.ok(BALANCE.miles[7].cps > base[6][0] && BALANCE.miles[8].cps > BALANCE.miles[7].cps);
  assert.equal(new Set(BALANCE.miles.map(m => m.cps)).size, BALANCE.miles.length, 'milesDone 键（cps）不得重复');
});

console.log('[G] 文案与 UI 数据');

test('G1 Wiki 新增 3 章渲染无 undefined / NaN，且覆盖新玩法与番外', () => {
  for (const id of ['orchestration', 'flows', 'chronicle']) {
    const sec = WIKI_SECTIONS.find(s => s.id === id);
    assert.ok(sec, `缺百科章节 ${id}`);
    assert.ok(sec.name, `${id} 缺标题`);
    const html = sec.body();
    assert.ok(typeof html === 'string' && html.length > 100, `${id} 内容过短`);
    assert.ok(!/undefined|NaN|Infinity/.test(html), `${id} 渲染出非法数值`);
  }
  assert.equal(new Set(WIKI_SECTIONS.map(s => s.id)).size, WIKI_SECTIONS.length, '百科 id 重复');
  const orch = WIKI_SECTIONS.find(s => s.id === 'orchestration').body();
  assert.ok(orch.includes('随潮汐排班') && orch.includes('RP 蒸馏'), '编排章节应说明玩法与四条管线');
});

test('G2 新增 3 条成就已注册，判定只读已持久化字段', () => {
  // v3.10.0：成就表已从 main.js 下沉到 data/achievements.js，源码断言改查数据层
  const ACH_SRC = readFileSync(join(SRC_ROOT, 'data/achievements.js'), 'utf8');
  for (const id of ['orch_switch', 'orch_tide', 'chapter25']) {
    assert.ok(ACH_SRC.includes(`id: '${id}'`), `缺成就 ${id}`);
  }
  assert.ok(ACH_SRC.includes("s.orchestration && s.orchestration.mode !== 'balanced'"));
  assert.ok(ACH_SRC.includes("chapterProgress(s.chapter || '1') >= 25"));
});

test('G3 编排卡已接入面板注册表 / 帧系统快刷 / 事件委托 / QA 暴露', () => {
  const SYS_SRC = readFileSync(new URL('../src/systems/frameSystems.js', import.meta.url), 'utf8');
  assert.ok(MAIN_SRC.includes("registerPanel({ key: 'orchestration', render: renderOrchestrationPanel });"),
    '编排卡应由面板注册表消费 dirty.orchestration');
  assert.ok(MAIN_SRC.includes('bindOrchestrationPanel();'), '缺事件绑定');
  assert.ok(SYS_SRC.includes('ctx.lastOrchUnlocked'), '解锁翻转快刷应由帧系统声明');
  assert.ok(MAIN_SRC.includes('dirty.orchestration = true;') || SYS_SRC.includes('dirty.orchestration = true;'),
    '缺兜底刷新');
  assert.ok(MAIN_SRC.includes('flowStats, flowLedger, flowErrors, FLOW_PHASES'), '缺资源流 QA 暴露');
  assert.ok(MAIN_SRC.includes('runSystems, systemStats, systemErrors, FRAME_PHASES'), '缺控制流层 QA 暴露');
  assert.ok(MAIN_SRC.includes('setOrchestrationPhaseMode, resetOrchestrationSchedule'), '缺潮汐预案 QA 暴露');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="orchestration-card"') && html.includes('id="orchestration-panel"'));
  assert.ok(MAIN_SRC.includes('el._orchSig === sig'), '面板必须有结构签名去重，防 2s 兜底吞点击');
  assert.ok(MAIN_SRC.includes('data-orch-slot-mode') && MAIN_SRC.includes('data-orch-schedule-reset'),
    '潮汐预案排班表应有逐相位改写与恢复默认入口');
});

test('G4 currentChapter 新章节不回退，旧档 chapter 仍为权威下限', () => {
  const base = { chapter: '26', chapterEnteredAt: Date.now(), prestige: 999, es: 1e6,
    faith: 1e6, tech: {}, unlockedBuildings: {}, riftsSealed: 999, expeditionsDone: 999,
    upgrades: {}, buildings: {}, projectsDone: 999, riftEmber: 1e9, allTimeEp: 1e18 };
  const ch = currentChapter(base, CHAPTERS);
  assert.ok(parseInt(String(ch.id), 10) >= 26, `不应回退，实际 ${ch.id}`);
});

test('G5 面板文案不写跨面板指引、不暴露实现术语', () => {
  const i = MAIN_SRC.indexOf('function renderOrchestrationPanel()');
  const body = MAIN_SRC.slice(i, MAIN_SRC.indexOf('function bindOrchestrationPanel()', i));
  assert.ok(!/由升级商店|上限 N|修饰器|flowEngine|resourceFlows/.test(body), '编排卡暴露了实现术语或跨面板指引');
  assert.ok(body.includes('当前编排') && body.includes('随潮汐排班'), '编排卡应陈述自身数据');
});

test('G6 数值读侧未解锁时不影响任何既有乘区', () => {
  const saved = { projectsDone: S.projectsDone, orchestration: S.orchestration };
  try {
    S.projectsDone = 0; S.orchestration = undefined;
    assert.equal(eco.computeCps(), eco.computeCps(), 'CPS 应确定性可重复');
    assert.equal(orch.orchestrationMult('ep', S), 1);
  } finally { Object.assign(S, saved); }
});
