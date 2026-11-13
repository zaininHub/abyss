// v3.7.5 反馈 · AI 助手「购买」价格不足未灰显（纯 Node 单测）
// v3.11.2：助手是常驻班组（购买即扩编、不随动作消耗），本测试只覆盖「购买」侧的定价与灰显逻辑：
//   assistantCost() 价格随数量递增（baseCost × costGrowth^n）、assistantBuyState() 单一真源 +
//   refreshAssistantAffordability() 挂 300ms 快刷链的机制保留，disabled 仅取决于 aiUnlocked 与 EP 是否够。
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

test('⑥ 接线：EP 购买按钮已删除，预留线并入助手行，扩编走研究点 rp_ai_unit', () => {
  // v3.12.12 反馈⑧：购买按钮从 UI 删除——助手扩编唯一玩家入口是研究点「助手扩编协议」
  assert.ok(!/data-assist-buy data-afford-sig/.test(AI), 'EP 购买按钮应已从助手行移除');
  assert.ok(/data-ai-reserve-sel/.test(AI), '预留线下拉框应并入助手行（与助手数量同处一行）');
  // v3.12.13 ⑤：常驻「研究点扩编」提示已从助手行移除，扩编入口说明收敛到悬浮框 data-tip（含「助手扩编协议」）
  assert.ok(!/ai-assist-hint/.test(AI), '常驻「研究点扩编」提示已从助手行移除');
  assert.ok(/助手扩编协议/.test(AI), '悬浮框 data-tip 应携带助手获取说明（研究点「助手扩编协议」）');
  // 扩编协议：研究点购买 → 每级 +1 助手，需 ai_core 解锁（解锁仍在升级商店科技树）
  const SHOP = read('src/modules/shop.js');
  const BAL = read('src/data/balance.js');
  assert.match(BAL, /id: 'rp_ai_unit'[\s\S]{0,220}requiresTech: 'ai_core'/, '扩编协议需 ai_core（升级商店解锁）');
  assert.ok(SHOP.includes("'rp_ai_unit'") && SHOP.includes('assistants = (S.ai.assistants || 0) + 1'),
    '研究点购买 rp_ai_unit 应授予 +1 助手');
  assert.ok(SHOP.includes('dirty.ai = true'), '授予助手后应置 dirty.ai 即时刷新 AI 面板');
  // buyAssistant 保留为 30 天推演/QA 自动化入口（不再有 UI 按钮）
  assert.ok(/export function buyAssistant\(\)/.test(AI), 'buyAssistant 保留为推演自动化入口');
  // CSS：预留线下拉框并入标题行后命中目标仍 >=24x24
  assert.match(CSS, /\.ai-reserve-select \{[^}]*min-height: 24/);
});
