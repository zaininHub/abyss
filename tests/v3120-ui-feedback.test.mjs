// v3.12.0 反馈①②④⑭⑮⑯：UI 反馈专项回归 + 资源增减文案审计。
// 纪律：文案完整性从「数据表真源」import 后断言（不读源码字符串拼内容）；
//       UI 结构只检查稳定标识（class / CSS 变量 / 函数名），不检查注释、不硬编码内容数量。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UPGRADES } from '../src/data/upgrades.js';
import { BALANCE } from '../src/data/balance.js';
import * as buildings from '../src/data/buildings.js';
import { OFF_UPGRADES } from '../src/data/offlineUpgrades.js';
import * as policies from '../src/data/policies.js';
import * as religions from '../src/data/religions.js';
import * as delve from '../src/data/delve.js';
import {
  fmtDelta, fmtMultDelta, signedDesc, deltaSign, effectSignOf,
} from '../src/core/format.js';
import {
  AI_ACTIONS, actionsByGroup, AI_CREW_REQUIRED_IDS,
} from '../src/core/aiActionRegistry.js';

const src = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

// 递归收集数据表 / 配置对象里所有字符串 desc（含分组内嵌的 policies、子升级等）。
function collectDescs(root, out = [], path = 'data') {
  if (!root || typeof root !== 'object') return out;
  if (Array.isArray(root)) { root.forEach((v, i) => collectDescs(v, out, `${path}[${i}]`)); return out; }
  for (const [k, v] of Object.entries(root)) {
    if (k === 'desc' && typeof v === 'string') out.push([path, v]);
    else if (v && typeof v === 'object') collectDescs(v, out, `${path}.${k}`);
  }
  return out;
}

const DESCS = [
  ...collectDescs(BALANCE, [], 'BALANCE'),
  ...collectDescs(UPGRADES, [], 'UPGRADES'),
  ...collectDescs(buildings, [], 'buildings'),
  ...collectDescs(OFF_UPGRADES, [], 'OFF_UPGRADES'),
  ...collectDescs(policies, [], 'policies'),
  ...collectDescs(religions, [], 'religions'),
  ...collectDescs(delve, [], 'delve'),
];

// ========== A 带符号格式化内核（行为断言） ==========
test('A1 deltaSign：正 / 负 / 零 / 非法值分别返回 + / - / ±', () => {
  assert.equal(deltaSign(0.3), '+');
  assert.equal(deltaSign(-0.3), '-');
  assert.equal(deltaSign(0), '±');
  assert.equal(deltaSign(NaN), '±');
});

test('A2 fmtDelta / fmtMultDelta 恒带显式正负号', () => {
  assert.equal(fmtDelta(30), '+30%');
  assert.equal(fmtDelta(-12), '-12%');
  assert.equal(fmtDelta(2.5, { digits: 1 }), '+2.5%');
  assert.equal(fmtMultDelta(1.3), '+30%');
  assert.equal(fmtMultDelta(0.88), '-12%');
  assert.equal(fmtMultDelta(0), '-100%');
  assert.equal(fmtMultDelta(1.15, { digits: 1 }), '+15%');
});

test('A3 signedDesc 把裸 ×N 补成带符号百分比，已有符号不重复标注', () => {
  assert.match(signedDesc('全局产出 ×1.3'), /\+30%/);
  assert.match(signedDesc('所有成本 ×0.8'), /-20%/);
  assert.equal(signedDesc('线程产出 +50%/级'), '线程产出 +50%/级');
  assert.equal(signedDesc('线程消耗 -10%'), '线程消耗 -10%');
  assert.equal(signedDesc('无数值说明'), '无数值说明');
});

test('A4 effectSignOf 从 fx / desc 正确推符号（加区小数不被误判成乘区）', () => {
  assert.equal(effectSignOf({ fx: { key: 'wage', v: -0.04 } }), '-');
  assert.equal(effectSignOf({ fx: { key: 'global', v: 0.1 } }), '+');
  assert.equal(effectSignOf({ fx: { key: 'costMul', v: 0.8 } }), '-');
  assert.equal(effectSignOf({ desc: '产出 +30%' }), '+');
  assert.equal(effectSignOf({ desc: '成本 ×0.8' }), '-');
});

// ========== B 反馈⑮：全数据表文案审计 ==========
test('B1 数据表效果文案不再出现裸 ×N 倍率', () => {
  assert.ok(DESCS.length > 0, '应能收集到数据表文案');
  const bad = DESCS.filter(([, d]) => /×\s*\d/.test(d));
  assert.deepEqual(bad, [], '残留裸倍率：' + bad.map(x => x.join(' | ')).join(' ; '));
});

test('B2 含百分比的增减文案一律带 + / -', () => {
  const EFFECT = /(产出|消耗|成本|上限|效率|奖励|加成|薪资|收益|倍率|清除|惩罚|获取|扩容)/;
  const bad = DESCS.filter(([, d]) => /%/.test(d) && EFFECT.test(d) && !/[+＋\-−±]/.test(d));
  assert.deepEqual(bad, [], '缺符号：' + bad.map(x => x.join(' | ')).join(' ; '));
});

test('B3 卡面渲染接入 signedDesc 兜底单一真源', () => {
  const shop = src('src/modules/shop.js');
  assert.ok(shop.includes("from '../core/format.js'"), '商店应引用格式化内核');
  assert.ok(shop.includes('signedDesc(storageDesc(u))'), '动态描述应过带符号兜底');
});

test('B4 各模块倍率文案统一消费 fmtMultDelta', () => {
  const files = [
    'src/modules/bazaar.js', 'src/modules/cosmos.js', 'src/modules/crew.js',
    'src/modules/relics.js', 'src/modules/expedition.js',
    'src/modules/religions.js', 'src/main.js',
  ];
  for (const f of files) assert.ok(src(f).includes('fmtMultDelta'), `${f} 应使用带符号倍率格式化`);
});

// ========== C 六个 UI 反馈项的结构不变量 ==========
test('C1 反馈①：线程强化全量常驻且显示 Lv.N/max', () => {
  const shop = src('src/modules/shop.js');
  assert.ok(shop.includes('visible: sorted'), '线程区应构造全可见 split（不再用 K=p+1 藏 GPU）');
  assert.ok(shop.includes('levelCountHtml(u)'), '线程卡应复用 Lv.N/max 角标');
  assert.ok(shop.includes('Lv.0/${u.maxLevel}'), '未解锁卡也应显示 Lv.0/N');
  const cpu = UPGRADES.find(u => u.id === 'cpu');
  const gpu = UPGRADES.find(u => u.id === 'gpu');
  assert.ok(cpu && gpu && cpu.maxLevel > 0 && gpu.maxLevel > 0, 'CPU / GPU 应有等级上限');
});

test('C2 反馈②：全部注册动作可见且统一占编步进器', () => {
  assert.ok(AI_ACTIONS.length > 0);
  for (const a of AI_ACTIONS) {
    assert.ok(a.id && a.switchKey && a.name && typeof a.crewSize === 'number', `动作字段完整：${a.id}`);
    assert.ok(AI_CREW_REQUIRED_IDS.includes(a.id), `动作需占编：${a.id}`);
  }
  assert.ok(actionsByGroup('basic').length > 0 && actionsByGroup('advanced').length > 0, '两组都有动作');
  const ai = src('src/modules/ai.js');
  for (const kw of [
    'lockedCard(', 'data-ai-crew-inc', 'data-ai-crew-dec', 'ai-action-locked',
    'ai-action-grid', "actionsByGroup('basic')", "AI_ACTION_GROUPS.find(g => g.key === 'advanced')",
  ]) assert.ok(ai.includes(kw), `AI 面板应含 ${kw}`);
});

test('C3 反馈④：政策 / 集市与升级商店共用 shop-grid 与状态角标', () => {
  const pol = src('src/modules/policies.js');
  const bz = src('src/modules/bazaar.js');
  const css = src('src/style.css');
  assert.ok(pol.includes('shop-grid') && bz.includes('shop-grid'), '两面板应使用升级商店同款网格');
  for (const kw of ['policy-state-on', 'policy-state-open', 'policy-state-lock']) {
    assert.ok(pol.includes(kw), `政策应含状态角标 ${kw}`);
  }
  for (const kw of ['dealer-state-ok', 'dealer-state-lock', 'dealer-state-bad']) {
    assert.ok(bz.includes(kw), `集市应含状态角标 ${kw}`);
  }
  assert.ok(css.includes('.policy-state') && css.includes('.dealer-state'), '角标样式应存在');
});

test('C4 反馈⑭：底部装饰条统一高度、不阻挡、页面加宽', () => {
  const css = src('src/style.css');
  const html = src('index.html');
  const gaze = src('src/modules/abyssGaze.js');
  assert.ok(css.includes('--bottom-deco-h: 56px'), '统一高度变量');
  assert.ok(css.includes('.tentacle-deco {') && css.includes('pointer-events: none'), '触手不阻挡');
  assert.ok(gaze.includes('var(--bottom-deco-h,56px)'), '凝视与触手同高');
  assert.ok(html.includes('viewBox="0 0 1200 56"'), '触手改横向低矮形态');
  assert.ok(html.includes('tentacle-tap-zone'), '点击彩蛋迁移到不遮挡的专用热区');
  assert.ok(css.includes('padding: 10px 112px 62px 8px'), '右侧浮动栏留白已回收给四列');
});

test('C5 反馈⑯：薪资四态说明整块触发', () => {
  const html = src('index.html');
  const css = src('src/style.css');
  const main = src('src/main.js');
  assert.ok(html.includes('id="wage-help-zone"') && html.includes('class="hero-row wage-help-zone"'), '整块触发区');
  assert.ok(html.includes('wage-help-mark'), '保留问号徽章');
  assert.ok(css.includes('.wage-help-zone[data-tip]:hover::after') && css.includes('white-space: pre-line'), '整块悬浮气泡可多行');
  assert.ok(main.includes('wageZone.dataset.tip'), '动态说明写入整块 data-tip（不再用窄 span 的原生 title）');
  assert.ok(main.includes("getElementById('wage-help-zone')?.addEventListener('click'"), '点击整块触发');
  assert.ok(main.includes("e.target.closest('#hire-btn')"), '招募按钮不误触说明');
});
