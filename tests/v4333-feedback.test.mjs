// v4.3.32 反馈（m02441 三项）：
//   ① ⚡转化弹层：点击目标只在滑块（行本身不再可点）
//      v4.3.33 追加：行不再套 .btn 外观——纯文本 + 右侧滑块 + 发丝分隔线（用户「还是一整块」）
//   ② 馆藏认证日志改成「馆长来信」三段式（详见 tests/v4332-feedback.test.mjs ②）
//   ③ 馆藏认证徽章 = 图形 + 文字（内联 SVG 星章）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MAIN = read('src/main.js');
const DISC = read('src/modules/disclosure.js');
const CSS = read('src/style.css');
const STATE = read('src/state.js');
const SCHEMA = read('src/core/stateSchema.js');

// ---------- ① 转化弹层：只有滑块可点 ----------

test('①-1 行退化为 <div>，真正的点击目标是滑块按钮（不再是整行 <button>）', () => {
  const fn = MAIN.slice(MAIN.indexOf('function qsOption'), MAIN.indexOf('function renderQuickSwitches'));
  assert.ok(fn, 'qsOption 必须存在');
  assert.match(fn, /<div class="qs-opt/, '外层行必须是 div（不能是 button）');
  assert.doesNotMatch(fn, /class="btn qs-opt/, '行不再复用 .btn 外观（否则看着仍像一整块按钮）');
  assert.doesNotMatch(fn, /<button[^>]*class="btn qs-opt/, '旧口径「整行是按钮」必须移除');
  assert.match(fn, /switchHtml\(\{ on, attrs: `data-qs="\$\{key\}"`/, '滑块自身承载 data-qs（点击委托命中滑块）');
  assert.doesNotMatch(fn, /switchInline\(/, '行内装饰滑块不再适用——滑块要能独立点击');
});

test('①-2 事件委托仍按 [data-qs] 命中，且只在滑块上', () => {
  const bind = MAIN.slice(MAIN.indexOf('function bindQuickSwitches'), MAIN.indexOf('function bindQuickSwitches') + 1800);
  assert.match(bind, /e\.target\.closest\('\[data-qs\]'\)/, '委托选择器保持 [data-qs]');
  // data-qs 只出现在 switchHtml 的 attrs 里（行上没有），所以点标签文字不会命中
  const fn = MAIN.slice(MAIN.indexOf('function qsOption'), MAIN.indexOf('function renderQuickSwitches'));
  assert.equal((fn.match(/data-qs/g) || []).length, 1, 'data-qs 只应出现在滑块属性中');
});

test('①-3 光标语义：行默认光标、滑块 pointer；标签不接收指针事件', () => {
  const row = CSS.match(/#quick-switches \.qs-opt \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(row, '缺少快捷开关行样式');
  assert.match(row, /cursor: default;/, '行默认光标（不给可点的错觉）');
  assert.match(CSS, /#quick-switches \.qs-opt \.qs-name \{ pointer-events: none;[^}]*\}/, '标签文字不接收指针事件');
  assert.match(CSS, /#quick-switches \.qs-opt \.ui-switch \{ cursor: pointer; \}/, '滑块保留 pointer');
});

test('①-4 行没有卡片外观：无边框/无底色/无 hover 高亮，只用发丝线分隔', () => {
  const row = CSS.match(/#quick-switches \.qs-opt \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(row, '缺少快捷开关行样式');
  assert.match(row, /border: 0;/, '行无边框');
  assert.match(row, /background: transparent;/, '行无底色');
  assert.doesNotMatch(CSS, /#quick-switches \.qs-opt:hover/, '行不再给 hover 高亮（避免「整行可点」的暗示）');
  assert.match(CSS, /#quick-switches \.qs-opt \+ \.qs-opt \{ box-shadow: inset 0 1px 0/, '相邻行用发丝线分隔');
});

test('①-5 弹层标题给出操作提示（行不可点，写清点哪里）', () => {
  const html = read('index.html');
  assert.match(html, /class="save-list-label qs-head">自动转化<span class="qs-hint">点右侧滑块切换<\/span>/, '标题右侧提示点滑块切换');
  assert.match(CSS, /\.qs-hint \{[^}]*font-size: 10px/, '提示为次级小字');
});

// ---------- ③ 徽章图形 ----------

test('③-1 徽章 = 内联 SVG 星章 + 文字（不引外部资源）', () => {
  assert.match(DISC, /export const BADGE_ICON = '<svg class="g-badge-ico"/, '徽章图形以内联 SVG 常量产出');
  assert.match(DISC, /class="g-badge-ico"[^>]*aria-hidden="true"/, '图形对读屏隐藏（语义由文字承担）');
  assert.match(DISC, /fill="currentColor"/, '图形跟随文字色，主题自动换色');
  assert.match(DISC, /b\.innerHTML = BADGE_ICON \+ g\.badge;/, '徽章 = 图形 + 文字');
  assert.doesNotMatch(DISC, /<img|\.png|\.svg['"]/, '不引外部图片');
});

test('③-2 徽章样式：图形与文字同排、11px、仍贴标题右侧且无问号手', () => {
  const block = CSS.match(/\.group-title-badge \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(block, '.group-title-badge 样式缺失');
  assert.match(block, /display: inline-flex; align-items: center; gap: 3px;/, '图形与文字同一行排布');
  assert.match(block, /margin-left: 4px/, '仍贴标题右侧');
  assert.match(block, /cursor: default/, '仍无问号手');
  assert.match(CSS, /\.group-title-badge \.g-badge-ico \{ width: 11px; height: 11px;/, '图形 11px 小徽章');
});

test('③-3 徽章文字仍是「馆藏认证」（textContent 不带图形噪点）', () => {
  // 形如 <svg …>…</svg>馆藏认证 —— SVG 无文本节点，textContent 仍是纯文字
  const icons = DISC.match(/BADGE_ICON = '([\s\S]*?)';/);
  assert.ok(icons, 'BADGE_ICON 定义缺失');
  assert.doesNotMatch(icons[1], />[^<>]*[\u4e00-\u9fa5]/, '图形内不得夹中文文字（否则 textContent 会脏）');
  const shopCss = read('src/modules/shop.js');
  assert.match(shopCss, /badge: museumCertified \? '馆藏认证' : ''/, '商店仍传纯文字徽章名');
});

// ---------- ② 剧情日志节奏落档 ----------

test('②-4 邀请/关注时间戳落档且跨晋升保留（不在 RUN_RESET_KEYS）', () => {
  assert.match(STATE, /_museumInvited: false,/, 'defaultState 必须有 _museumInvited');
  assert.match(STATE, /_museumHintAt: 0,/, 'defaultState 必须有 _museumHintAt');
  assert.match(SCHEMA, /'_museumInvited', '_museumHintAt',/, 'COMPAT_KEYS 需补齐旧档');
  const reset = SCHEMA.match(/export const RUN_RESET_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.ok(!/_museumInvited|_museumHintAt/.test(reset), '晋升/轮回不应重置剧情节奏（否则会长重复来信）');
});
