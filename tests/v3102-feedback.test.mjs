// v3.10.2 编号反馈清单专项单测：负面任务自动结束 / 顶栏净流告警 / FP 研究门控 / RP 上限重置
//
// 纪律：先做「行为断言」再补「源码接线断言」——只改源码字符串不算修好。
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
};
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = p => readFileSync(join(ROOT, 'src', p), 'utf8');
const readRoot = p => readFileSync(join(ROOT, p), 'utf8');

const state = await import('../src/state.js');
const schema = await import('../src/core/stateSchema.js');
const eco = await import('../src/modules/economy.js');
const fmt = await import('../src/core/format.js');
const projects = await import('../src/modules/projects.js');
const shop = await import('../src/modules/shop.js');
const { anchorDone } = await import('../src/modules/disclosure.js');
const { BALANCE } = await import('../src/data/balance.js');

const { S, defaultState } = state;
const MAIN = readSrc('main.js');
const INDEX = readRoot('index.html');
const PROJECTS = readSrc(join('modules', 'projects.js'));
const SHOP = readSrc(join('modules', 'shop.js'));
const FLOWS = readSrc(join('systems', 'resourceFlows.js'));
const WIKI = readSrc(join('data', 'wiki.js'));

function fresh() {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  return S;
}
function noSpawn(fn) {
  const rand = Math.random;
  Math.random = () => 0.99; // tickProjects 的 1% 任务生成，保持测试确定性
  try { return fn(); } finally { Math.random = rand; }
}
function debuffProject(overrides = {}) {
  const now = Date.now();
  return {
    type: 'earn_ep', name: '产能压制', desc: '累计 EP', goal: 10, progress: 0,
    startsAt: now, deadline: now + 3600000,
    reward: { kind: 'debuff', buffMult: 0.8, dur: 0 },
    status: 'active', pendingAt: 0, earnedFullAt: 0,
    ...overrides,
  };
}
function fakeContainer() {
  const c = mkEl();
  c._lastSig = undefined;
  return c;
}
function collectResearchIds(node, out = []) {
  if (node.dataset && node.dataset.research) out.push(node.dataset.research);
  for (const c of (node.children || [])) collectResearchIds(c, out);
  return out;
}

console.log('[A] 负面任务：达成即自动结束并解除 DEBUFF');

test('A1 行为：debuff 任务达标后自动消失、DEBUFF 清除、累计完成数 +1，无需领取', () => {
  fresh();
  const now = Date.now();
  S.projects = [debuffProject()];
  S.projectsDone = 7;
  S.buffMult = 0.8; S.buffUntil = now + 3600000;
  S.earnedFull = 100;
  noSpawn(() => projects.tickProjects());
  assert.equal(S.projects.length, 0, '负面任务不得停在 pending 等玩家点领取');
  assert.equal(S.buffMult, 1, 'DEBUFF 立即解除');
  assert.equal(S.buffUntil, 0, '增益槽归零');
  assert.equal(S.projectsDone, 8, '完成数按唯一真源自增一次');
});

test('A2 行为：过期 debuff 任务同样清 DEBUFF，且不计入完成数', () => {
  fresh();
  S.projects = [debuffProject({ deadline: Date.now() - 1000, startsAt: Date.now() - 7200000 })];
  S.projectsDone = 3;
  S.buffMult = 0.8; S.buffUntil = Date.now() + 1000;
  noSpawn(() => projects.tickProjects());
  assert.equal(S.projects.length, 0);
  assert.equal(S.buffMult, 1);
  assert.equal(S.projectsDone, 3, '过期奖励作废，不算任务完成');
});

test('A3 行为：普通奖励任务仍走 pending → 手动领取，不被自动结算', () => {
  fresh();
  S.projects = [debuffProject({ reward: { kind: 'ep', amount: 100 }, goal: 10 })];
  S.earnedFull = 100;
  noSpawn(() => projects.tickProjects());
  assert.equal(S.projects.length, 1);
  assert.equal(S.projects[0].status, 'pending');
  assert.equal(S.projectsDone, 0, '未领取不计入完成数');
  const r = projects.claimProject(S.projects[0]);
  assert.equal(r.ok, true);
  assert.equal(S.projectsDone, 1, '手动领取仍只计一次');
});

test('A4 行为：旧档遗留的 pending debuff 任务自动终结', () => {
  fresh();
  const now = Date.now();
  S.projects = [debuffProject({ status: 'pending', pendingAt: now, progress: 10 })];
  S.buffMult = 0.8; S.buffUntil = now + 1000;
  noSpawn(() => projects.tickProjects());
  assert.equal(S.projects.length, 0);
  assert.equal(S.buffMult, 1);
  assert.equal(S.projectsDone, 1);
});

test('A5 接线：计数 / 状态收敛到 finishProject，两条路径共用；UI 不再对 debuff 显示领取按钮', () => {
  assert.ok(PROJECTS.includes('function finishProject(p)'));
  assert.match(PROJECTS, /finishProject\(p\);[\s\S]{0,200}save\(S\)/, '手动领取走共享入口');
  assert.match(PROJECTS, /autoDone = true/, '自动结束有独立落盘标记');
  assert.ok(PROJECTS.includes("if (autoDone) save(S)"), '自动结束即落盘');
  assert.ok(MAIN.includes('data-claim='), '普通任务领取按钮仍在');
  assert.ok(MAIN.includes(`r.kind === 'debuff' ? 'var(--bad)'`), '任务面板仍标注负面奖励文案');
});

console.log('[B] 顶栏：产出/消耗最左 + 净流为负告警与 EP 耗尽预估');

test('B1 纯函数：epDepletionSec / fmtDepletionEta / fmtLongDuration', () => {
  assert.equal(fmt.epDepletionSec(1000, 5, 15), 100);
  assert.equal(fmt.epDepletionSec(1000, 20, 10), 0, '净流非负不报耗尽');
  assert.equal(fmt.epDepletionSec(0, 1, 10), 0);
  assert.equal(fmt.epDepletionSec(1000, 0, 0), 0);
  assert.equal(fmt.fmtDepletionEta(0), '已耗尽');
  assert.equal(fmt.fmtDepletionEta(Number.NaN), '—');
  assert.equal(fmt.fmtDepletionEta(100), '01:40');
  assert.equal(fmt.fmtDepletionEta(7200), '2 小时');
  assert.equal(fmt.fmtDepletionEta(172800), '2 天');
  assert.equal(fmt.fmtLongDuration(86400), '1 天', '长时段格式化已下沉公共内核');
});

test('B2 结构：产出/s 与 消耗/s 位于 topbar 最左，警告标志存在且不带原生 title', () => {
  const topbar = INDEX.slice(INDEX.indexOf('<div class="topbar">'));
  const iOut = topbar.indexOf('id="h-output-stat"');
  const iDrain = topbar.indexOf('id="h-drain-stat"');
  const iEp = topbar.indexOf('id="h-ep"');
  assert.ok(iOut >= 0 && iDrain >= 0 && iEp >= 0);
  assert.ok(iOut < iDrain && iDrain < iEp, '顺序必须是 产出 → 消耗 → EP');
  assert.ok(INDEX.includes('id="h-drain-warn" class="drain-warn"'), '警告标志存在');
  assert.doesNotMatch(INDEX.slice(iDrain, iDrain + 400), /<span id="h-drain-warn"[^>]*\stitle=/,
    '警告标志不得用原生 title（与 data-tip 气泡双弹窗）');
  assert.ok(readSrc('style.css').includes('.drain-warn'), '警告标志有样式');
});

test('B3 接线：renderTop 用同一组展示值算净流，ETA 进入两项气泡与 aria-label', () => {
  assert.ok(MAIN.includes('const drain = totalDrainPerSec();'));
  assert.ok(MAIN.includes('const drainWarn = drain > cps;'));
  assert.ok(MAIN.includes('const etaSec = epDepletionSec(S.ep, cps, drain);'));
  assert.ok(MAIN.includes('hSalary.textContent = fmt(drain) + \'/s\''), '消耗显示与告警同口径');
  assert.ok(MAIN.includes("hDrainWarn.style.display = drainWarn ? '' : 'none'"));
  assert.equal((MAIN.match(/\$\{etaTip\}/g) || []).length, 2, '产出/消耗两项悬浮都追加耗尽预估');
  assert.ok(MAIN.includes('EP 预计 ${fmtDepletionEta(etaSec)} 后耗尽'));
  assert.ok(MAIN.includes("setAttribute('aria-label'"), '警告标志有无障碍说明');
});

console.log('[C] FP 未解锁时 FP 研究项不出现、不可购买');

test('C1 门控单一真源：映射表 / 谓词 / 三项 FP 研究全覆盖', () => {
  const fp = BALANCE.researchUpgs.filter(u => u.fx && u.fx.key === 'faith');
  assert.deepEqual(fp.map(u => u.id).sort(), ['rp_disciple', 'rp_faith', 'rp_religion2']);
  assert.deepEqual(shop.RESEARCH_RES_ANCHORS, { faith: 'faith' });
  const locked = { upgrades: {}, faith: 0, religion: { unlocked: false } };
  assert.ok(fp.every(u => !shop.researchResourceUnlocked(u, locked)), '新档三项均不可显示');
  assert.ok(shop.researchResourceUnlocked(BALANCE.researchUpgs.find(u => u.id === 'rp_entropy'), locked),
    '非资源门控项不受影响');
  const open = { upgrades: {}, faith: 0, religion: { unlocked: true } };
  assert.ok(fp.every(u => shop.researchResourceUnlocked(u, open)), '宗教解锁后放行');
  assert.equal(anchorDone('faith', open), true, '与顶栏即时谓词同源');
});

test('C2 行为：FP 未解锁时 buyResearchUpgrade 被拦截，解锁后可购买', () => {
  fresh();
  S.rp = 1e9;
  S.religion = { unlocked: false }; S.faith = 0;
  const before = { ...(S.rpTheories || {}) };
  const denied = shop.buyResearchUpgrade('rp_faith');
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /尚未解锁/);
  assert.deepEqual(S.rpTheories || {}, before, '拦截不得写入研究等级');
  S.religion = { unlocked: true };
  const ok = shop.buyResearchUpgrade('rp_faith');
  assert.equal(ok.ok, true);
  assert.equal((S.rpTheories || {}).rp_faith, 1);
});

test('C3 行为：研究面板渲染过滤隐藏项，FP 解锁当帧重建', () => {
  fresh();
  S.rp = 1e9;
  S.rpTheories = { rp_entropy: 4 }; // 让「资源与消耗」组显形，否则整组隐藏使断言失真
  S.religion = { unlocked: false }; S.faith = 0;
  const c = fakeContainer();
  shop.renderResearchUpgrades(c);
  const idsLocked = collectResearchIds(c);
  assert.ok(idsLocked.includes('rp_wage'), '同组非 FP 项仍渲染');
  assert.ok(!idsLocked.some(id => ['rp_faith', 'rp_disciple', 'rp_religion2'].includes(id)),
    'FP 未解锁不得出现 FP 研究项');
  S.religion = { unlocked: true };
  shop.renderResearchUpgrades(c);
  const idsOpen = collectResearchIds(c);
  assert.ok(['rp_faith', 'rp_disciple', 'rp_religion2'].every(id => idsOpen.includes(id)),
    '解锁后当帧重建并出现三项');
});

test('C4 接线：渲染 / 购买 / 签名 / 分组标题四处消费同一谓词，顶栏 FP 同源', () => {
  assert.ok(SHOP.includes('if (!researchResourceUnlocked(u)) continue;'), '渲染过滤');
  assert.ok(SHOP.includes("if (!researchResourceUnlocked(u)) return { ok: false, reason: '对应资源尚未解锁' }"), '购买拦截');
  assert.ok(SHOP.includes('const gateSig = Object.keys(RESEARCH_RES_ANCHORS)'), '重建签名含门控位');
  assert.ok(SHOP.includes('.filter(u => u && researchResourceUnlocked(u))'), '分组标题不列隐藏项');
  assert.ok(MAIN.includes("discAnchorKeys[i] === 'faith'"), '顶栏 FP 改用 anchorDone');
  assert.ok(MAIN.includes('anchorDone(discAnchorKeys[i], S)'), '顶栏与研究门控同源');
});

console.log('[D] RP 上限：本局重置回到 3000、余额钳制、涓流不越界');

test('D1 清单：运行时快照字段在 defaultState / COMPAT / 审计 / 重置四处对齐', () => {
  const d = defaultState();
  for (const k of schema.RUN_RUNTIME_KEYS) {
    assert.ok(k in d, `${k} 必须有默认值`);
    assert.ok(schema.COMPAT_KEYS.includes(k), `${k} 旧档缺省可补齐`);
    assert.ok(schema.declaredFieldNames().includes(k), `${k} 纳入审计`);
  }
  assert.deepEqual(schema.orphanFieldNames(Object.keys(d)), [], '新增字段不产生孤儿键');
  assert.equal(state.SAVE_VERSION, 6, '旧档零迁移成本');
});

test('D2 行为：转生 / 轮回后上限回落 2500，隐式保留的余额同步钳制', () => {
  fresh();
  S.upgrades = { storage: 20, reserve_bin: 10, rp_vault: 4, pt_vault: 3, dm_vault: 3 };
  S._rpOverflowSeen = true; S._epCapBasisCps = 5e6; S._epCapBasisSig = 'old';
  S.rpTheories = { rp_sync: 1 }; // v3.10.5 ③：产出基座联动由「星图同调」门控，需已购才出现高上限
  S.rp = 9e9; S.pt = 5e9; S.dm = 1e6;
  const capBefore = eco.rpCap();
  assert.ok(capBefore > 1e5, '重置前上限显著高于新档（复现钳制场景）');
  // v3.12.0 反馈③：EP 上限改「相对硬顶 + 取 max」后，产能快照不再把上限撑到亿级，
  // 旧断言 > 1e8 编码的是已修复的缺陷本身，改为验证「不再复现」。
  assert.ok(capBefore < 1e8, '产能快照不得再把 RP 上限撑到亿级');
  schema.resetRunState(S, defaultState(), { clamp: eco.clampRunResourceBalances });
  assert.equal(S._rpOverflowSeen, false, '产出基座快照归零');
  assert.equal(S._epCapBasisCps, 0);
  assert.equal(eco.epStorageCap(), 2000, 'EP 上限回到新档值');
  // v3.12.0 反馈⑪：研究项清零后「星图同调」失效，RP 上限回到纯基础 2,500。
  assert.equal(eco.rpCap(), 2500, 'RP 上限回到新档 2,500');
  assert.equal(eco.ptCap(), 1000, 'PT 同构回落（研究项清零后无产出基座）');
  assert.equal(S.rp, 0, 'v3.12.0 反馈⑪：RP 余额本局制，重置后归零');
  assert.equal(S.pt, eco.ptCap());
  assert.equal(S.dm, eco.dmCap());
  assert.ok(eco.rpCap() < 3000 + 400 * 2, '之后靠买仓库升级缓慢增长');
});

test('D3 行为：启动兜底钳制旧档超限余额，且纯函数边界稳定', () => {
  fresh();
  S.rp = 1e9; S.pt = 1e9; S.dm = 1e9; S.faith = 999;
  const n = eco.clampRunResourceBalances();
  assert.equal(n, 3, '只钳 rp / pt / dm 三项');
  assert.equal(S.rp, eco.rpCap());
  assert.equal(S.pt, eco.ptCap());
  assert.equal(S.dm, eco.dmCap());
  assert.equal(S.faith, 999, '跨局资产 faith 不在本局钳制范围');
  assert.equal(schema.clampCappedResources({ a: 5 }, { a: 3, b: 2 }), 1);
  assert.equal(schema.clampCappedResources({}, { a: Number.NaN }), 0);
});

test('D4 行为：满仓涓流走统一入口，不再把 RP/PT 顶出上限', async () => {
  fresh();
  await import('../src/systems/resourceFlows.js');
  const eng = await import('../src/core/flowEngine.js');
  const flow = Object.values(eng.FLOW_PHASES)
    .flatMap(p => eng.flowsOfPhase(p)).find(f => f.id === 'rp:atrium');
  S.rp = eco.rpCap(); S.ep = 1e9; S._atriumTrickle = 4.9;
  S.atriumOn = true; S.converterOn = { vehicles: true, atrium: true, hatch: true };
  flow.run({ S, dt: 10 });
  assert.ok(S.rp <= eco.rpCap(), 'RP 涓流不得越界');
  assert.equal(FLOWS.includes('S.rp = before +'), false, '不得残留 RP 直写');
  assert.equal(FLOWS.includes('S.pt = before +'), false, '不得残留 PT 直写');
  assert.ok(FLOWS.includes('addRp(0.01 * mult)') && FLOWS.includes('addPt(0.01 * ptMult)'));
});

test('D5 接线：两条转生路径都注入 clamp，startApp 有旧档兜底', () => {
  assert.ok(readSrc(join('modules', 'prestige.js')).includes('clamp: clampRunResourceBalances'));
  assert.ok(readSrc(join('modules', 'reincarn.js')).includes('clamp: clampRunResourceBalances'));
  assert.ok(MAIN.includes('clampRunResourceBalances();'), '启动期兜底');
  assert.ok(MAIN.includes('fmtDepletionEta, epDepletionSec'), 'QA 钩子暴露');
});

console.log('[E] 文案与注释口径');

test('E1 Wiki / RP 说明弹框写出产出基座与转生回落，过期注释已修正', () => {
  assert.ok(WIKI.includes('产出基座「当前 EP 上限 ×25%」'));
  assert.ok(WIKI.includes('转生或轮回后，本局扩容与产出基座一起归零'));
  assert.ok(MAIN.includes('上限：基础 2,500 + 矩阵存储库逐级扩容'));
  // v3.12.0 项⑪：RP 本局制后新档上限为 2,500（不再含 500 产出基座），旧文案 3,000 已修正。
  assert.ok(MAIN.includes('回到 2,500 再逐次扩容'));
  const ecoSrc = readSrc(join('modules', 'economy.js'));
  assert.doesNotMatch(ecoSrc.slice(ecoSrc.indexOf('反馈⑥'), ecoSrc.indexOf('function prodCapFloor')),
    /取「仓库值」与「EP 上限 × 比例」中的较大者/);
  assert.ok(ecoSrc.includes('不再是早年的 max() 取较大者'), '注释与叠加实现一致');
});

test('E2 长时段格式化单一真源：expedition.js 不再自带实现', async () => {
  const exp = readSrc(join('modules', 'expedition.js'));
  // 结构断言只校验「从 core/format.js 导入」这一事实，不锁死花括号内的其它导入项
  // （v3.12.0 反馈⑮ 同文件新增 fmtMultDelta，旧断言精确匹配整条 import 会误伤）。
  assert.match(exp, /import\s*\{[^}]*fmtLongDuration[^}]*\}\s*from\s*'\.\.\/core\/format\.js'/);
  assert.ok(exp.includes('export { fmtLongDuration }'), '保留原有导出路径');
  assert.ok(!exp.includes('export function fmtLongDuration('), '不得残留第二份实现');
  assert.ok(readSrc(join('core', 'format.js')).includes('export function fmtLongDuration('));
  // 行为断言：再导出的就是 core 的同一函数，而非本文件另写一份
  const core = await import('../src/core/format.js');
  const ex = await import('../src/modules/expedition.js');
  assert.equal(ex.fmtLongDuration, core.fmtLongDuration, 'expedition 再导出应指向 core 单一实现');
});
