// v4.0.7 两项反馈专项浏览器验收（真实 DOM / 真实拖拽 / computed style / 几何）
//
// 覆盖：
//   ① 线程行与专注行左右基线对齐：两行左边缘同 x、按钮右缘同 x、按钮同宽、专注行不再是内缩卡片。
//   ② 系统日志：永不横向滚动（长 URL 折行）；高度可上下拖动放大、有明确上限与下限、
//      双击复位、方向键微调、刷新后记忆，且拖大后不会把侧栏撑出视口。
//
// 用法：node tests/v407-log-layout-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v407-ui-report.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 4, ep: 5000, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  upgrades: { reserve_bin: 12 }, buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 10,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 9, prestigePoints: 3,
  lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const results = {};
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1400, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);

  // ============ ① 两行对齐 ============
  console.log('\n[①] 线程行 / 专注行的左右基线');
  const align = await page.evaluate(() => {
    const rr = n => { const r = n.getBoundingClientRect(); return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), cy: Math.round(r.y + r.height / 2) }; };
    const bar = document.getElementById('focus-bar');
    const cs = getComputedStyle(bar);
    return {
      staffLabel: rr(document.querySelector('#wage-help-zone .staff-label')),
      focusLabel: rr(document.querySelector('#focus-bar .staff-label')),
      hireBtn: rr(document.getElementById('hire-btn')),
      focusBtn: rr(document.getElementById('focus-buy')),
      bar: rr(bar),
      barPadLeft: cs.paddingLeft, barPadRight: cs.paddingRight, barBorder: cs.borderTopWidth,
      staffFont: getComputedStyle(document.querySelector('#wage-help-zone .staff-label')).fontSize,
      focusFont: getComputedStyle(document.querySelector('#focus-bar .staff-label')).fontSize,
    };
  });
  results.align = align;
  align.staffLabel.x === align.focusLabel.x
    ? ok('两行左边缘同一基线', `x=${align.staffLabel.x}`)
    : bad('两行左边缘错位', `线程 ${align.staffLabel.x} / 专注 ${align.focusLabel.x}`);
  align.hireBtn.right === align.focusBtn.right
    ? ok('两个按钮右缘对齐', `right=${align.hireBtn.right}`)
    : bad('按钮右缘错位', `招募 ${align.hireBtn.right} / 强化 ${align.focusBtn.right}`);
  Math.abs(align.hireBtn.w - align.focusBtn.w) <= 1
    ? ok('两个按钮同宽', `${align.hireBtn.w}px`)
    : bad('按钮宽度不一', `${align.hireBtn.w} vs ${align.focusBtn.w}`);
  align.hireBtn.x === align.focusBtn.x ? ok('两个按钮左缘也对齐', `x=${align.hireBtn.x}`) : bad('按钮左缘错位', `${align.hireBtn.x} vs ${align.focusBtn.x}`);
  align.barPadLeft === '0px' && align.barPadRight === '0px' && align.barBorder === '0px'
    ? ok('专注行不再是内缩卡片（padding/border 归零）', `padding ${align.barPadLeft} / border ${align.barBorder}`)
    : bad('专注行仍有内缩', JSON.stringify({ pl: align.barPadLeft, pr: align.barPadRight, b: align.barBorder }));
  align.staffFont === align.focusFont ? ok('两行字号一致', align.staffFont) : bad('两行字号不同', `${align.staffFont} vs ${align.focusFont}`);

  // ============ ② 日志：不横滚 + 可拖大 + 有上限 ============
  console.log('\n[②] 系统日志：横向不滚 / 高度可拖拽');
  const base = await page.evaluate(() => {
    const p = document.getElementById('log-panel');
    const c = document.getElementById('log-content');
    const h = document.getElementById('log-resize');
    // 造一条超长无空格日志（真实日志里最典型的横向溢出源：URL / 长串）
    const d = document.createElement('div');
    d.innerHTML = '<span class="t mono">12:00</span><span>' + 'http://example.com/' + 'a'.repeat(180) + '</span>';
    c.prepend(d);
    const rr = n => { const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    return {
      panel: rr(p), content: rr(c), handle: rr(h),
      scrollW: c.scrollWidth, clientW: c.clientWidth,
      overflowX: getComputedStyle(c).overflowX,
      padLeft: getComputedStyle(p).paddingLeft,
      role: h.getAttribute('role'), tab: h.getAttribute('tabindex'), aria: h.getAttribute('aria-label'),
      cssMax: parseFloat(getComputedStyle(p).getPropertyValue('--log-max-h')),
      vh: window.innerHeight,
    };
  });
  results.base = base;
  base.overflowX === 'hidden' ? ok('日志容器禁止横向滚动', `overflow-x: ${base.overflowX}`) : bad('仍可横向滚动', base.overflowX);
  base.scrollW <= base.clientW + 1
    ? ok('超长 URL 在行内折行（无横向溢出）', `scrollWidth ${base.scrollW} ≤ clientWidth ${base.clientW}`)
    : bad('存在横向溢出', `${base.scrollW} > ${base.clientW}`);
  base.role === 'separator' && base.tab === '0' && /调整日志高度/.test(base.aria || '')
    ? ok('拖拽手柄具备可访问语义', `${base.role} / tabindex=${base.tab}`)
    : bad('手柄语义缺失', JSON.stringify({ role: base.role, tab: base.tab, aria: base.aria }));

  const curH = () => page.evaluate(() => Math.round(document.getElementById('log-panel').getBoundingClientRect().height));
  const handleXY = () => page.evaluate(() => {
    const r = document.getElementById('log-resize').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });

  const h0 = await curH();
  // v4.1.0 反馈①：方向反转——手柄在面板底部，往下拖 = 变高（旧版是往上拖变高）
  let pt = await handleXY();
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(pt.x, pt.y + i * 10); await sleep(16); }
  const duringDrag = await page.evaluate(() => document.body.classList.contains('log-resizing'));
  await page.mouse.up();
  await sleep(180);
  const h1 = await curH();
  Math.abs(h1 - (h0 + 120)) <= 4 ? ok('向下拖动真的变高', `${h0} → ${h1}（+${h1 - h0}）`) : bad('向下拖动无效', `${h0} → ${h1}`);
  duringDrag ? ok('拖拽期间全页锁定光标/选中（body.log-resizing）', '') : bad('缺少拖拽态', 'body 无 log-resizing');

  // 拖到极限：必须停在上限（CSS 变量与视口比例取小）
  pt = await handleXY();
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(pt.x, pt.y + i * 40); await sleep(10); }
  await page.mouse.up();
  await sleep(180);
  const hMax = await curH();
  const capExpected = Math.max(120, Math.min(base.cssMax, Math.round(base.vh * 0.62)));
  Math.abs(hMax - capExpected) <= 2
    ? ok('拖到极限停在上限（不做无限放大）', `${hMax}px = min(${base.cssMax}, ${Math.round(base.vh * 0.62)})`)
    : bad('上限不符', `实际 ${hMax} / 期望 ${capExpected}`);
  hMax <= Math.round(base.vh * 0.62) + 2 ? ok('放大后不超出视口比例', `${hMax} ≤ ${Math.round(base.vh * 0.62)}`) : bad('超出版面', String(hMax));

  // 向上拖到底：最小高度兜底（新方向的反向）
  pt = await handleXY();
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(pt.x, pt.y - i * 40); await sleep(10); }
  await page.mouse.up();
  await sleep(180);
  const hMin = await curH();
  hMin === 120 ? ok('向上拖到底停在最小高度', `${hMin}px`) : bad('最小高度不符', String(hMin));

  // 双击复位 240（真实两次 down/up：产品侧是自己数 pointerdown 时间戳，不依赖合成 dblclick）
  pt = await handleXY();
  await page.mouse.click(pt.x, pt.y);
  await page.mouse.click(pt.x, pt.y);
  await sleep(220);
  const hDefault = await curH();
  hDefault === 240 ? ok('双击手柄恢复默认高度', `${hDefault}px`) : bad('双击复位无效', String(hDefault));

  // 键盘微调（↓ 一次 +12，v4.1.0 与拖拽方向一致）
  await page.focus('#log-resize');
  await page.keyboard.press('ArrowDown');
  await sleep(200);
  const hKey = await curH();
  hKey === hDefault + 12 ? ok('方向键微调高度（↓ +12）', `${hDefault} → ${hKey}`) : bad('键盘微调无效', `${hDefault} → ${hKey}`);

  // 刷新后记忆（同一浏览器上下文）
  await page.reload({ waitUntil: 'load' });
  await sleep(1300);
  const hReload = await curH();
  hReload === hKey ? ok('刷新后保留上次高度', `${hReload}px`) : bad('高度未持久化', `期望 ${hKey} / 实际 ${hReload}`);

  // 窄屏：不溢出、仍可拖
  await page.setViewport({ width: 380, height: 780 });
  await sleep(400);
  const narrow = await page.evaluate(() => {
    const p = document.getElementById('log-panel');
    const c = document.getElementById('log-content');
    const r = p.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), scrollW: c.scrollWidth, clientW: c.clientWidth,
      cssMax: parseFloat(getComputedStyle(p).getPropertyValue('--log-max-h')), vh: window.innerHeight };
  });
  results.narrow = narrow;
  narrow.h <= Math.min(narrow.cssMax, Math.round(narrow.vh * 0.62)) + 2
    ? ok('窄屏下高度被重新钳制', `${narrow.h}px ≤ min(${narrow.cssMax}, ${Math.round(narrow.vh * 0.62)})`)
    : bad('窄屏高度超限', JSON.stringify(narrow));
  narrow.scrollW <= narrow.clientW + 1 ? ok('窄屏下日志仍无横向溢出', `${narrow.scrollW} ≤ ${narrow.clientW}`) : bad('窄屏横向溢出', JSON.stringify(narrow));

  errs.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errs.join(' | '));
  results.errors = errs;

  await import('node:fs').then(fs => fs.writeFileSync(REPORT, JSON.stringify(results, null, 2)));
} finally {
  await browser.close();
}
console.log(`\n========== v4.0.7 UI 专项：${pass} / ${fail} ==========`);
if (fail) process.exitCode = 1;
