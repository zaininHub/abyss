// v3.12.1 三项 UI 反馈专项浏览器验收（真实 DOM / computed style / 几何 / 键盘可达 / 拖拽持久化）
//   ① 存档：hover 即展开、6px 断档可穿越、点击不再常驻、键盘 Tab 可进入菜单
//   ② 凝视：脱离底部触手条带、上移为顶部 HUD 徽记、视觉结构重做、pointer-events:none
//   ③ 许愿池：可收起到屏幕边缘、可自由拖动、顶层悬浮、页面四列铺满、投币逻辑不回归
//
// 用法：node tests/v3121-ui-browser.mjs   （Chrome 路径统一走 tests/_chrome.mjs）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 存档种子只给「产品可达的解锁态」，不伪造本轮要验收的 UI 结果
const mkSave = () => JSON.stringify({
  _version: 6, chapter: '2', storyline: 'line_order',
  ep: 1e10, rp: 0, es: 0, dm: 0, pt: 0,
  upgrades: {}, buildings: { abyss_fishbowl: 2, wish_well: 1 },
  tech: { ai_core: true }, cultists: [], faith: 0, religion: null,
  prestige: 1, prestigePoints: 8,
  moduleUnlocks: { reincarn: true, bazaar: true },
  bazaar: { unlocked: true, trades: 0, refreshCount: 0, shuffleTimer: 0, regenTimer: 0, rates: {}, stock: {} },
  abyssGazeUnlocked: true,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, fp: true, pt: true, dm: true, vs: true },
  _rpOverflowSeen: false,
  lastSeen: Date.now(), startTime: Date.now(),
});

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

async function boot(save, width = 1600, height = 1000, dockPref = null) {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width, height });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(({ s, d }) => {
    localStorage.setItem('abyss_idle_v2', s);
    if (d === null) localStorage.removeItem('abyss_wish_dock_v1');
    else localStorage.setItem('abyss_wish_dock_v1', d);
  }, { s: save, d: dockPref });
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);
  await page.evaluate(() => {
    (window.__timerIds || []).forEach(id => clearInterval(id));
    const D = window.__gameDirty;
    for (const k of Object.keys(D || {})) D[k] = true;
    window.__qa.sim.render();
  });
  await sleep(350);
  return { page, errs };
}

const rect = (page, sel) => page.evaluate(s => {
  const el = document.getElementById(s) || document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
           display: cs.display, pointer: cs.pointerEvents, z: Number(cs.zIndex) || 0, pos: cs.position };
}, sel);
const popDisplay = page => page.evaluate(() => getComputedStyle(document.querySelector('#save-pop')).display);

// ==================== ① 存档：纯 hover 展开 ====================
{
  const { page, errs } = await boot(mkSave());
  const btn = await rect(page, '#save-menu-btn');
  const cx = btn.x + btn.w / 2, cy = btn.y + btn.h / 2;

  await page.mouse.move(cx, cy); await sleep(180);
  if (await popDisplay(page) === 'flex') ok('① 鼠标移到「存档」即展开（无需点击）');
  else bad('① hover 未展开', await popDisplay(page));

  // 6px 断档：按钮底 → 菜单顶之间的中点
  await page.mouse.move(cx, btn.bottom + 3); await sleep(180);
  if (await popDisplay(page) === 'flex') ok('① 穿过按钮与菜单间 6px 断档不闪收');
  else bad('① hover 断档仍导致闪收', await popDisplay(page));

  // 横向桥接：菜单宽 280 右对齐，按钮仅 67px；移到菜单左端仍要展开
  const pop = await rect(page, '#save-pop'); // v3.12.12 ⑥：皮肤菜单同样用 .save-menu-pop，查询必须锚定存档下拉自身
  await page.mouse.move(pop.x + 12, pop.y + 16); await sleep(180);
  if (await popDisplay(page) === 'flex') ok('① 横向移到菜单左端仍保持展开（桥接覆盖整宽）');
  else bad('① 横向移动掉出 hover 区', await popDisplay(page));

  // 点击后鼠标移开：不得常驻
  await page.mouse.move(cx, cy);
  await page.mouse.click(cx, cy); await sleep(120);
  await page.mouse.move(700, 500); await sleep(280);
  if (await popDisplay(page) === 'none') ok('① 点击后鼠标移开即收起（不再常驻页面）');
  else bad('① 菜单仍常驻', await popDisplay(page));
  const aria = await page.evaluate(() => document.getElementById('save-menu-btn').getAttribute('aria-expanded'));
  if (aria === 'false') ok('① aria-expanded 与视觉同步为 false');
  else bad('① aria-expanded 不同步', String(aria));

  // 键盘可达性：Tab 到按钮 → 再 Tab 进入菜单内按钮，菜单全程保持展开
  await page.evaluate(() => document.activeElement?.blur?.());
  let hitBtn = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.id) === 'save-menu-btn') { hitBtn = true; break; }
  }
  const kbd1 = await popDisplay(page);
  await page.keyboard.press('Tab'); await sleep(120);
  const inPop = await page.evaluate(() => ({
    id: document.activeElement?.id,
    inside: !!document.activeElement?.closest?.('#save-pop'),
  }));
  const kbd2 = await popDisplay(page);
  if (hitBtn && kbd1 === 'flex' && inPop.inside && kbd2 === 'flex') ok('① 键盘 Tab 可进入下拉菜单且菜单不收起（a11y 不降级）', `焦点=${inPop.id}`);
  else bad('① 键盘路径异常', JSON.stringify({ hitBtn, kbd1, inPop, kbd2 }));

  if (!errs.length) ok('① 存档交互无页面异常');
  else bad('① 页面异常', errs.join(' | '));
  await page.close();
}

// ==================== ② 凝视：上移 + 不重叠 + UI 重做 ====================
{
  const { page, errs } = await boot(mkSave());
  const gaze = await rect(page, '#abyss-gaze-crack');
  const tent = await rect(page, '#tentacle-deco');
  const vh = await page.evaluate(() => innerHeight);

  if (gaze) ok('② 深渊凝视仍常驻（解锁态）', `${Math.round(gaze.w)}×${Math.round(gaze.h)} @ y=${Math.round(gaze.y)}`);
  else bad('② 凝视元素缺失');
  if (gaze && gaze.y < 100) ok('② 凝视已移到页面上方（系统按钮行）', `y=${Math.round(gaze.y)}`);
  else bad('② 凝视仍在底部', JSON.stringify(gaze));
  if (gaze && tent && gaze.bottom <= tent.y + 0.5) ok('② 凝视与触手不再重叠', `凝视底 ${Math.round(gaze.bottom)} ≤ 触手顶 ${Math.round(tent.y)}`);
  else bad('② 仍与触手重叠', JSON.stringify({ gaze, tent }));
  if (tent && tent.y >= vh - 40 && Math.abs(tent.h - 32) < 0.5 && tent.pointer === 'none') ok('② 触手条带压缩到 32px、全宽、不接指针', `y=${Math.round(tent.y)} h=${Math.round(tent.h)}`);
  else bad('② 触手被改动', JSON.stringify(tent));
  if (gaze && gaze.pointer === 'auto' && gaze.z === 0) ok('② 凝视已支持点击交互（pointer-events:auto、无额外层级）');
  else bad('② 凝视点击交互异常', JSON.stringify(gaze));
  const gazeClick = await page.evaluate(() => {
    const el = document.getElementById('abyss-gaze-crack');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return el.classList.contains('gazing');
  });
  if (gazeClick) ok('② 点击凝视触发交互反馈（.gazing）');
  else bad('② 凝视点击无反馈', '');

  const eye = await page.evaluate(() => {
    const el = document.getElementById('abyss-gaze-crack');
    const svg = el?.querySelector('#abyss-gaze-svg');
    return {
      inSysBtns: !!el?.closest('.sys-btns'),
      viewBox: svg?.getAttribute('viewBox') || '',
      hasFrame: !!el?.querySelector('rect[rx]'),
      hasPupil: !!el?.querySelector('.ag-pupil'),
      hasIris: !!el?.querySelector('.ag-iris'),
      hasBeacon: el?.querySelectorAll('.ag-beacon').length || 0,
      hasClip: !!el?.querySelector('clipPath'),
    };
  });
  if (eye.inSysBtns && eye.viewBox === '0 0 220 56' && !eye.hasFrame && !eye.hasBeacon && eye.hasPupil && eye.hasIris && eye.hasClip) ok('② 凝视 UI：无胶囊外框/状态点，只留眼裂裁切 + 竖瞳扫视', JSON.stringify(eye));
  else bad('② 凝视视觉结构不符合 v3.12.3 设计（去边框、眼睛单体）', JSON.stringify(eye));

  // v3.12.4 ④：按钮行是 fixed 覆盖层，顶栏必须让出等宽空白——任何资源项都不得落在按钮底下
  const noOverlap = await page.evaluate(() => {
    const sys = document.querySelector('.sys-btns').getBoundingClientRect();
    const bad = [...document.querySelector('.topbar').children].filter(e => {
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) return false;
      return b.right > sys.x + 0.5 && b.left < sys.right - 0.5 && b.bottom > sys.top + 0.5 && b.top < sys.bottom - 0.5;
    }).map(e => e.id || e.className);
    return { n: bad.length, bad, gap: Math.round(sys.x - Math.max(...[...document.querySelector('.topbar').children].filter(e => { const b = e.getBoundingClientRect(); return b.height && b.top < sys.bottom; }).map(e => e.getBoundingClientRect().right))) };
  });
  if (!noOverlap.n) ok('④ 顶栏资源项不被按钮行压住', `最小间距 ${noOverlap.gap}px`);
  else bad('④ 顶栏资源项被按钮行覆盖', JSON.stringify(noOverlap));
  if (!errs.length) ok('② 凝视无页面异常');
  else bad('② 页面异常', errs.join(' | '));
  await page.close();

  // 窄屏：徽记不溢出视口
  const narrow = await boot(mkSave(), 820, 900);
  const ng = await rect(narrow.page, '#abyss-gaze-crack');
  const sysR = await rect(narrow.page, '.sys-btns');
  if (ng && ng.x >= 0 && ng.right <= 820 && sysR && sysR.x >= 0 && sysR.right <= 820) ok('② 窄屏 820px 下凝视与系统按钮组均不溢出视口', `gaze ${Math.round(ng.x)}~${Math.round(ng.right)}`);
  else bad('② 窄屏溢出视口', JSON.stringify({ ng, sysR }));
  await narrow.page.close();
}

// ==================== ③ 许愿池：收起 / 拖动 / 顶层 / 平铺满 ====================
{
  const { page, errs } = await boot(mkSave());
  const dock = await rect(page, '#wish-dock');
  const well = await rect(page, '#wish-well');
  const appPadR = await page.evaluate(() => getComputedStyle(document.getElementById('app')).paddingRight);
  const gridRight = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.grid > *')].map(e => e.getBoundingClientRect().right)));
  const vw = await page.evaluate(() => innerWidth);

  if (dock && well) ok('③ 许愿池为带标题栏的顶层浮窗', `dock ${Math.round(dock.w)}×${Math.round(dock.h)} @ ${Math.round(dock.x)},${Math.round(dock.y)}`);
  else bad('③ 浮窗结构缺失', JSON.stringify({ dock, well }));
  if (dock && dock.z > 50 && dock.z < 200) ok('③ 悬浮层级高于页面内容/顶栏、低于模态框', `z=${dock.z}`);
  else bad('③ 层级不合适', JSON.stringify(dock));
  if (appPadR === '8px' && gridRight >= vw - 24) ok('③ 右侧 112px 留白回收，四列平铺满视口', `padding-right=${appPadR}, 列右=${Math.round(gridRight)}/${vw}`);
  else bad('③ 页面未铺满', JSON.stringify({ appPadR, gridRight, vw }));

  // 收起
  await page.click('.wish-toggle'); await sleep(360);
  const col = await rect(page, '#wish-dock');
  const toggle = await rect(page, '.wish-toggle');
  const wellHidden = (await rect(page, '#wish-well')).display;
  const visibleW = vw - col.x;
  if (col && col.x > dock.x + 80 && visibleW <= 40 && wellHidden === 'none') ok('③ 一键收起到屏幕边缘（仅露折叠把手）', `可见 ${Math.round(visibleW)}px`);
  else bad('③ 收起异常', JSON.stringify({ col, visibleW, wellHidden }));
  if (toggle && toggle.w >= 24 && toggle.h >= 24 && toggle.x >= 0 && toggle.right <= vw) ok('③ 折叠按钮命中区 ≥24×24 且始终在视口内可点', `${Math.round(toggle.w)}×${Math.round(toggle.h)}`);
  else bad('③ 折叠按钮命中区/可见性异常', JSON.stringify(toggle));

  // 展开
  await page.click('.wish-toggle'); await sleep(360);
  const exp = await rect(page, '#wish-dock');
  if (Math.abs(exp.x - dock.x) < 1 && (await rect(page, '#wish-well')).display !== 'none') ok('③ 再点展开回到原位');
  else bad('③ 展开异常', JSON.stringify(exp));

  // 自由拖动 + 持久化
  const bar = await rect(page, '.wish-dock-bar');
  await page.mouse.move(bar.x + 70, bar.y + 14);
  await page.mouse.down();
  await page.mouse.move(bar.x - 280, bar.y + 150, { steps: 8 });
  await page.mouse.up(); await sleep(220);
  const dragged = await rect(page, '#wish-dock');
  const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_wish_dock_v1') || 'null'));
  if (dragged.x < exp.x - 150 && dragged.y > exp.y + 80) ok('③ 标题栏可自由拖动', `Δ=(${Math.round(dragged.x - exp.x)}, ${Math.round(dragged.y - exp.y)})`);
  else bad('③ 拖动未生效', JSON.stringify({ exp, dragged }));
  if (pref && Math.abs(pref.x - dragged.x) < 2 && Math.abs(pref.y - dragged.y) < 2) ok('③ 拖动位置持久化到独立 UI 偏好（不写入游戏存档）', JSON.stringify(pref));
  else bad('③ 位置未持久化', JSON.stringify(pref));

  // 收起态刷新后保持
  await page.click('.wish-toggle'); await sleep(300);
  const savedPref = await page.evaluate(() => localStorage.getItem('abyss_wish_dock_v1'));
  await page.close();
  const reload = await boot(mkSave(), 1600, 1000, savedPref);
  const reDock = await rect(reload.page, '#wish-dock');
  const reState = await reload.page.evaluate(() => document.getElementById('wish-dock').dataset.collapsed);
  if (reState === 'true' && reDock.x > vw - 60) ok('③ 收起态与自定义位置跨刷新保持', `x=${Math.round(reDock.x)}`);
  else bad('③ 刷新后状态丢失', JSON.stringify({ reState, reDock }));
  await reload.page.close();
  void dock; void errs;
}
{
  // 投币逻辑不回归（独立页面，避免冷却/偏好污染）
  const { page, errs } = await boot(mkSave());
  const r = await page.evaluate(() => {
    const before = window.S.wishCoins || 0;
    document.getElementById('wish-well').click();
    const w = document.getElementById('wish-well');
    return { before, after: window.S.wishCoins || 0, tossing: w.classList.contains('tossing'), disabled: w.disabled };
  });
  if (r.after === r.before + 1 && (r.tossing || r.disabled)) ok('③ 投币核心逻辑未回归（wishCoins +1、投币动画接管）', JSON.stringify(r));
  else bad('③ 投币失效', JSON.stringify(r));
  if (!errs.length) ok('③ 许愿池交互无页面异常');
  else bad('③ 页面异常', errs.join(' | '));
  await page.close();
}

// 窄屏不溢出
{
  const { page } = await boot(mkSave(), 820, 900);
  const d = await rect(page, '#wish-dock');
  const vw = await page.evaluate(() => innerWidth);
  if (d && d.x >= 0 && d.right <= vw + 1) ok('③ 窄屏 820px 下浮窗仍完整在视口内（位置自动钳制）', `x=${Math.round(d.x)}~${Math.round(d.right)}`);
  else bad('③ 窄屏浮窗溢出', JSON.stringify(d));
  await page.close();
}

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
