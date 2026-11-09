// v3.7.5 反馈 · AI 助手「购买」价格不足未灰显（纯 Node 单测）
// v3.10.5：助手由「编队/8 槽」改为「一次性消耗品」——无上限，价格逐次递增（baseCost × costGrowth^n）。
//   assistantBuyState() 单一真源 + refreshAssistantAffordability() 挂 300ms 快刷链的机制保留，
//   断言改为新模型（无满编，disabled 仅取决于 aiUnlocked 与 EP 是否够）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
  body: { classList: { add() {}, remove() {} } },
  addEventListener() {},
};
globalThis.window = { addEventListener() {} };

const { S } = await import('../src/state.js');
const { assistantCount, assistantCost, assistantBuyState, refreshAssistantAffordability } = await import('../src/modules/ai.js');

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const AI = read('src/modules/ai.js');
const MAIN = read('src/main.js');
const CSS = read('src/style.css');

const reset = (n = 0) => {
  S.ai = { ...(S.ai || {}), assistants: n };
  S.tech = { ...(S.tech || {}), ai_core: true };
  S.ep = 0;
};

test('① 助手成本随数量递增（baseCost × costGrowth^n），无上限', () => {
  reset();
  const c0 = assistantCost();
  reset(1);
  const c1 = assistantCost();
  reset(3);
  const c3 = assistantCost();
  assert.ok(c1 > c0, '第 2 名应更贵');
  assert.ok(c3 > c1, '第 4 名应更贵');
  assert.equal(assistantCount(), 3, '数量可无上限增长（不再 8 槽封顶）');
});

test('② EP 不足 → disabled=true 且提示缺口；卡面仍展示价格', () => {
  reset();
  const cost = assistantBuyState().cost;
  S.ep = Math.max(0, cost - 1);
  const st = assistantBuyState();
  assert.equal(st.afford, false);
  assert.equal(st.disabled, true, '买不起必须禁用（灰显）');
  assert.match(st.label, /^购买助手（.+ EP）$/);
  assert.match(st.title, /EP 不足/);
  assert.match(st.title, /还需/);
  assert.ok(st.sig.includes('true'), '状态签名体现禁用态');
});

test('③ EP 恰好够 → 可购买（边界不误灰）', () => {
  reset();
  S.ep = assistantBuyState().cost;
  const st = assistantBuyState();
  assert.equal(st.afford, true);
  assert.equal(st.disabled, false);
  assert.match(st.title, /消耗/);
});

test('④ 未解锁 ai_core → 禁用', () => {
  reset();
  S.tech = {};
  S.ep = Number.MAX_SAFE_INTEGER;
  const st = assistantBuyState();
  assert.equal(st.disabled, true, '未研究 AI 管理核心不得购买');
  assert.match(st.title, /AI 管理核心/);
});

test('⑤ 300ms 快刷原地维护按钮：不足→充足，sig 去重不重复写 DOM', () => {
  reset();
  const btn = {
    dataset: {}, disabled: undefined, textContent: '', title: '',
    classList: {
      _s: new Set(),
      toggle(c, on) { if (on) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
  globalThis.document.querySelector = (sel) => sel === '#ai-panel [data-assist-buy]' ? btn : null;

  S.ep = 0;
  refreshAssistantAffordability();
  assert.equal(btn.disabled, true, '不足态禁用');
  assert.equal(btn.classList.contains('disabled'), true, '不足态灰显 class');
  assert.match(btn.textContent, /购买助手/);
  assert.match(btn.title, /EP 不足/);
  const sig1 = btn.dataset.affordSig;
  assert.ok(sig1, '写入状态签名');

  // 签名相同 → 提前返回（用篡改 textContent 探测是否重写）
  btn.textContent = 'SENTINEL';
  refreshAssistantAffordability();
  assert.equal(btn.textContent, 'SENTINEL', '状态未变不得重写 DOM（零闪烁）');

  S.ep = assistantBuyState().cost * 2;
  refreshAssistantAffordability();
  assert.equal(btn.disabled, false, '攒够 EP 后原地解禁');
  assert.equal(btn.classList.contains('disabled'), false);
  assert.notEqual(btn.dataset.affordSig, sig1, '状态翻转后签名更新');
  assert.match(btn.title, /消耗/);

  globalThis.document.querySelector = () => null;
  assert.doesNotThrow(() => refreshAssistantAffordability(), '面板未渲染/未解锁时安全跳过');
});

test('⑥ 接线：渲染、点击、快刷共用单一真源，且挂在 300ms 快刷链', () => {
  assert.ok(/export function assistantBuyState\(\)/.test(AI));
  assert.ok(/export function refreshAssistantAffordability\(\)/.test(AI));
  assert.ok(/data-assist-buy data-afford-sig="\$\{st\.sig\}"/.test(AI));
  assert.ok(/\$\{st\.disabled \? 'disabled' : ''\}/.test(AI));
  // 点击兜底与快刷同一函数
  assert.ok(/const st = assistantBuyState\(\);/.test(AI));
  assert.ok(/if \(!st\.disabled\)/.test(AI));
  assert.ok(/S\.ep -= st\.cost/.test(AI));
  // v3.9.0：快刷链由 affordability 帧系统声明（300ms 节流），主循环只消费 FRAME 阶段
  const FRAME_SYS = read('src/systems/frameSystems.js');
  assert.match(FRAME_SYS, /refreshAssistantAffordability\(\);/, 'AI 助手灰显必须挂在统一快刷系统内');
  assert.match(FRAME_SYS, /id: 'affordability'[\s\S]{0,200}intervalMs: 300/, '快刷系统必须声明 300ms 节流');
  assert.match(MAIN, /runSystems\(frameCtx, FRAME_PHASES\.FRAME\);/, '主循环应消费 FRAME 阶段快刷系统');
  // CSS 灰显
  assert.match(CSS, /#ai-panel \[data-assist-buy\]:disabled \{[^}]*opacity: \.45/);
});
