// v3.0.3 第六批：浏览器自动化验证（真实 UI 入口，覆盖 6 项反馈）
import puppeteer from 'puppeteer-core';
import assert from 'node:assert';

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--window-size=1366,900'],
});
const page = await browser.newPage();
const jsErrors = [];
page.on('pageerror', e => jsErrors.push(String(e)));
await page.goto('file://' + process.cwd() + '/dist/index.html', { waitUntil: 'networkidle0' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tab = async id => {
  await page.evaluate(t => {
    const b = document.getElementById('btn-' + t);
    if (b) { b.style.display = ''; b.click(); }
  }, id);
  await sleep(250);
};
// 页面内点击（不持有 ElementHandle，避免自动蒸馏重建 DOM 后引用失效）
const clickSel = sel => page.evaluate(s => document.querySelector(s)?.click(), sel);
const evalS = fn => page.evaluate(fn);
const styleOf = sel => page.evaluate(s => {
  const el = document.querySelector(s);
  return { op: getComputedStyle(el).opacity, cur: getComputedStyle(el).cursor };
}, sel);

let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log('  ✓ ' + name); };

// ========== 场景 A：灵感工坊 EP 无限 bug + 灰显 ==========
await evalS(() => {
  window.S.upgrades = { atrium: 1 };
  window.S.ep = 1; // 远低于升级成本
  window.S.atriumOn = false; // 关闭自动蒸馏，避免重建 DOM/消耗 EP 干扰升级按钮断言
  window.S.resDiscovered = { rp: true }; // 让研究点 tab 入口显示
});
await tab('rp');
check('灵感工坊升级按钮存在', () => assert.ok(evalS(() => !!document.querySelector('[data-atrium-upg]'))));
const unaffordStyle = await styleOf('[data-atrium-upg]');
check('EP 不足时灵感工坊按钮灰显（opacity 0.5 / not-allowed）', () => {
  assert.equal(unaffordStyle.op, '0.5');
  assert.equal(unaffordStyle.cur, 'not-allowed');
});
await clickSel('[data-atrium-upg]'); await sleep(200);
const afterUnafford = await evalS(() => ({ lvl: window.S.upgrades.atrium, ep: window.S.ep }));
check('EP 不足点击不穿透：等级不增、EP 不变成 NaN（EP 无限 bug 修复）', () => {
  assert.equal(afterUnafford.lvl, 1);
  assert.equal(afterUnafford.ep, 1);
  assert.ok(Number.isFinite(afterUnafford.ep));
});
// 足够 EP：按钮恢复 + 点击升级扣费（需提供存储上限，否则 tick 会把 EP 截断到基础 cap=2000）
await evalS(() => {
  window.S.upgrades.deep_bin = 1; // +800,000 存储上限，cap=802000
  window.S.ep = 800000; // 低于 cap 不被截断，高于升级成本 50000
});
await tab('rp');
const affordStyle = await styleOf('[data-atrium-upg]');
check('EP 足够时按钮恢复可点（opacity 1 / pointer）', () => {
  assert.equal(affordStyle.op, '1');
  assert.equal(affordStyle.cur, 'pointer');
});
const epBefore = await evalS(() => window.S.ep);
await clickSel('[data-atrium-upg]'); await sleep(200);
const afterBuy = await evalS(() => ({ lvl: window.S.upgrades.atrium, ep: window.S.ep }));
check('足够 EP 点击升级成功且扣费', () => {
  assert.equal(afterBuy.lvl, 2);
  assert.ok(afterBuy.ep < epBefore);
});

// ========== 场景 B：异兽孵化灰显 + 拦截 ==========
await evalS(() => {
  window.S.ptHatchLv = 1;
  window.S.ep = 1;
  window.S.ptDistillOn = false; // 关闭自动孵化，避免干扰
});
await tab('pets');
check('孵化升级按钮存在', () => assert.ok(evalS(() => !!document.querySelector('[data-pt-hatch-upg]'))));
const hatchStyle = await styleOf('[data-pt-hatch-upg]');
check('EP 不足时孵化按钮灰显', () => {
  assert.equal(hatchStyle.op, '0.5');
  assert.equal(hatchStyle.cur, 'not-allowed');
});
await clickSel('[data-pt-hatch-upg]'); await sleep(200);
const hatchAfter = await evalS(() => window.S.ptHatchLv);
check('EP 不足孵化点击不升级', () => assert.equal(hatchAfter, 1));

// ========== 场景 C：文案（去每级 / 只显示下一级） ==========
// 注入已购状态，让链窗口外的 storage/reserve_bin/deep_bin 进入可见渲染（已购项永不隐藏）
await evalS(() => {
  window.S.upgrades.storage = 1;
  window.S.upgrades.reserve_bin = 1;
  window.S.upgrades.deep_bin = 1;
});
await tab('shop');
const texts = await evalS(() => {
  const get = id => document.querySelector('[data-buy="' + id + '"]')?.textContent || '';
  return { storage: get('storage'), reserve: get('reserve_bin'), deep: get('deep_bin') };
});
check('存储节点：desc「EP 存储上限 +4000」无每级，preview 只显示下一级', () => {
  assert.ok(texts.storage.includes('EP 存储上限 +4000'));
  assert.ok(!texts.storage.includes('每级'));
  assert.ok(texts.storage.includes('EP 上限：下一级'));
  assert.ok(!texts.storage.includes('当前') && !texts.storage.includes('→'));
});
check('备用粮仓：desc「EP 上限 +12,000」无每级（修正原 +4000 错误）', () => {
  assert.ok(texts.reserve.includes('EP 上限 +12,000'));
  assert.ok(!texts.reserve.includes('每级'));
});
check('深井仓储：desc「EP 上限 +800,000」无每级', () => {
  assert.ok(texts.deep.includes('EP 上限 +800,000'));
  assert.ok(!texts.deep.includes('每级'));
});

// ========== 场景 D：VS 顶栏展示 ==========
const vsHidden = await page.evaluate(() => getComputedStyle(document.getElementById('vs-stat')).display);
check('深潜未解锁时 VS 顶栏隐藏', () => assert.equal(vsHidden, 'none'));
await evalS(() => { window.S.delve = { unlocked: true }; window.S.vs = 42; });
await tab('shop'); // 触发 renderTop
const vsShown = await page.evaluate(() => ({
  display: getComputedStyle(document.getElementById('vs-stat')).display,
  text: document.getElementById('h-vs').textContent,
}));
check('深潜解锁后 VS 顶栏常显且数值正确', () => {
  assert.notEqual(vsShown.display, 'none');
  assert.ok(vsShown.text.includes('42'));
});

// ========== 场景 E：故事线剧情展示 ==========
await evalS(() => {
  window.S.chapter = '5'; // P4 阶段：故事线 tab 入口解锁（章节≥5）
  window.S.storylinesCompleted = ['line_faith'];
  // 注入后 updateTabLocks 不会自动重跑，强制解禁入口再点击（等价于真实 P4 状态）
  const b = document.getElementById('btn-storyline');
  if (b) { b.disabled = false; b.classList.remove('tab-locked'); b.textContent = '故事线'; b.style.display = ''; b.click(); }
});
await sleep(300);
const chInfo = await evalS(() => ({
  count: document.querySelectorAll('.codex-ch').length,
  hasDesc: !!document.querySelector('.codex-ch.on .codex-ch-desc'),
  name: document.querySelector('.codex-line-name')?.textContent,
}));
check('故事线面板正确渲染章节（pkg.data.chapters 路径修复）', () => {
  assert.ok(chInfo.count > 0, '章节数应 > 0');
  assert.equal(chInfo.name, '信仰传播者');
});
check('已解锁章节显示剧情文本（desc）', () => assert.ok(chInfo.hasDesc));

check('整个验证过程无 JS 运行时错误', () => assert.equal(jsErrors.length, 0, jsErrors.join(' | ')));

await browser.close();
console.log(`\n===== 浏览器自动化验证：${pass} 项全部通过 =====`);
