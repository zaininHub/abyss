// v4.0.4 两项反馈专项浏览器验收（真实 DOM / 真实鼠标点击 / 真实挂机帧 / computed style / 几何）
//
// 覆盖：
//   ① 任务版「限时内累计获得 EP」不再卡死：真实浏览器挂机 8s（线程自然产出跑帧），
//      任务进度真的增长（此前进度读到的是空累加器，恒为 0 → 只能等过期）。
//   ② 线程行重排：满薪不显示「满薪」字样、只留一颗同色小圆点；异常态（懒惰等）仍保留文字角标；
//      招募按钮 = 「招募 / 价格」两行；NEXT（只剩产出 / 消耗）位于按钮左侧同一行；
//      专注条不再显示「下一级价格」，价格与加成一起进悬浮说明。
//
// 用法：node tests/v404-task-progress-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v404-ui-report.json';
const SHOT = process.env.SHOT || '/tmp/v404-ui.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

// 种子存档：7 条线程（NEXT / 招募都有意义）、低余额（满薪态，不是懒惰态）、
// 带一条正在进行的「产能冲刺 · 限时内累计获得 EP」任务（与 spawnProject 生成的结构一致）
const NOW = Date.now();
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 4, ep: 900, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  upgrades: { reserve_bin: 12 }, buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 8,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  _gainRes: { ep: 0 }, _spentRes: {}, _buyRes: {},
  projects: [{
    type: 'res', resKey: 'ep', metric: 'gain', name: '产能冲刺', desc: '限时内累计获得 EP',
    goal: 1000, progress: 0, startsAt: NOW, deadline: NOW + 30 * 60000,
    reward: { kind: 'ep', amount: 200 }, status: 'active', pendingAt: 0, base: 0,
  }],
  prestige: 2, projectsDone: 1,
  // 旧档残留的小数职级点（v3.12.0 之前 ppMult 的 √2 / ×3 写出过这种值）
  prestigePoints: 3.732050807568877,
  lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const results = {};
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1600, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  // 种子只在首次导航写入：evaluateOnNewDocument 每次导航都会执行，若不加闸，
  // 刷新验收会被种子「重新覆盖」，看起来像进度回档（v4.0.5 排查记录）。
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  // ============ ① 任务进度：真实挂机产出必须计入「累计获得」 ============
  console.log('\n[①] 产能冲刺：挂机产出计入任务进度');
  const prog0 = await page.evaluate(() => {
    const p = window.S.projects.find(x => x.resKey === 'ep' && x.metric === 'gain');
    return { progress: p ? p.progress : null, goal: p ? p.goal : null, gainAcc: (window.S._gainRes || {}).ep || 0 };
  });
  await sleep(8000); // 真实挂机 8s ≈ 30+ EP（cps ≈ 4/s）
  const prog1 = await page.evaluate(() => {
    const p = window.S.projects.find(x => x.resKey === 'ep' && x.metric === 'gain');
    return {
      progress: p ? p.progress : null, goal: p ? p.goal : null, status: p ? p.status : null,
      gainAcc: (window.S._gainRes || {}).ep || 0,
      cardText: (() => {
        const cards = [...document.querySelectorAll('#projects .proj')];
        const c = cards.find(el => /产能冲刺/.test(el.textContent));
        return c ? c.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : '';
      })(),
    };
  });
  prog1.progress > prog0.progress && prog1.progress > 5
    ? ok('任务进度随挂机增长', `${Math.round(prog0.progress)} → ${Math.round(prog1.progress)} / ${prog1.goal}`)
    : bad('任务进度仍未增长', JSON.stringify({ prog0, prog1 }));
  prog1.gainAcc > prog0.gainAcc ? ok('_gainRes.ep 累加器同步增长', String(Math.round(prog1.gainAcc))) : bad('累加器无增长', String(prog1.gainAcc));
  prog1.status === 'active' ? ok('未达目标时保持进行中', prog1.status) : bad('任务状态异常', String(prog1.status));
  /[1-9]\d*/.test(prog1.cardText) ? ok('任务卡显示真实进度', prog1.cardText) : bad('任务卡进度仍为 0', prog1.cardText);
  results.progress = { prog0, prog1 };

  // ============ ② 线程行：满薪色点 / 招募两行 / NEXT 在左 / 专注无价格 ============
  console.log('\n[②] 线程行与专注条重排');
  const hero = await page.evaluate(() => {
    const st = document.getElementById('staff-status');
    const prev = document.getElementById('staff-preview');
    const btn = document.getElementById('hire-btn');
    const focus = document.getElementById('focus-bar');
    const rr = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const cs = getComputedStyle(st);
    return {
      state: st.textContent, isDot: st.classList.contains('is-dot'), fontSize: cs.fontSize,
      color: cs.color, aria: st.getAttribute('aria-label'), st: rr(st),
      prevText: prev.textContent, prev: rr(prev),
      btnText: btn.innerText.replace(/\n+/g, '|'), btn: rr(btn), btnChild: btn.children.length,
      btnDisabled: btn.disabled,
      focusText: focus.textContent.replace(/\s+/g, ' ').trim(), focusTip: focus.dataset.tip || '',
      hasFocusCost: !!document.getElementById('focus-cost'),
    };
  });
  hero.isDot && parseFloat(hero.fontSize) === 0
    ? ok('满薪只留色点不显示字样', `font-size ${hero.fontSize}`)
    : bad('满薪仍显示文字', `${hero.state} / ${hero.fontSize}`);
  hero.color === 'rgb(63, 185, 80)' ? ok('色点为满薪绿', hero.color) : bad('色点颜色异常', hero.color);
  hero.st.w <= 12 && hero.st.w >= 6 ? ok('色点尺寸紧凑', `${Math.round(hero.st.w)}×${Math.round(hero.st.h)}`) : bad('色点尺寸异常', JSON.stringify(hero.st));
  /满薪/.test(hero.aria || '') ? ok('色点保留无障碍标签', hero.aria) : bad('无色点语义标签', String(hero.aria));
  hero.btnChild === 2 && /^招募\|/.test(hero.btnText) ? ok('招募按钮为「招募 / 价格」两行', hero.btnText) : bad('招募按钮结构不符', hero.btnText);
  /\d/.test(hero.btnText.split('|')[1] || '') ? ok('按钮第二行显示价格', hero.btnText.split('|')[1]) : bad('按钮未显示价格', hero.btnText);
  !/需/.test(hero.prevText) && !/EP/.test(hero.prevText)
    ? ok('NEXT 行不再重复价签', hero.prevText)
    : bad('NEXT 仍带价格', hero.prevText);
  hero.prev.right <= hero.btn.x + 1 && Math.abs((hero.prev.y + hero.prev.h / 2) - (hero.btn.y + hero.btn.h / 2)) <= 12
    ? ok('NEXT 位于招募按钮左侧同一行', `prev.right=${Math.round(hero.prev.right)} ≤ btn.x=${Math.round(hero.btn.x)}`)
    : bad('NEXT 与按钮位置不对', JSON.stringify({ prev: hero.prev, btn: hero.btn }));
  !/1\.29K|1,29|K$/.test(hero.focusText) && !hero.hasFocusCost
    ? ok('专注条不再显示下一级价格', hero.focusText)
    : bad('专注条仍有价格', JSON.stringify({ t: hero.focusText, has: hero.hasFocusCost }));
  /需 \d|需 [\d.]+/.test(hero.focusTip) ? ok('专注价格进悬浮说明', hero.focusTip.split('\n').pop()) : bad('悬浮说明缺价格', hero.focusTip);
  results.hero = hero;

  // 悬浮确认（真实鼠标）：气泡出现且含价格
  await page.hover('#focus-bar');
  await sleep(300);
  const focusTip = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('focus-bar'), '::after');
    return { content: cs.content, position: cs.position, z: cs.zIndex };
  });
  /需/.test(focusTip.content) ? ok('专注悬浮气泡真实出现', focusTip.content.slice(0, 60)) : bad('专注气泡未出现', JSON.stringify(focusTip));

  // 新气泡沿用主题变量：三套浅色皮肤不得出现「深字压深底」
  const focusContrast = await page.evaluate(() => {
    const parse = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = rgb => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const out = {};
    for (const theme of ['abyss', 'light', 'mint', 'autumn']) {
      document.documentElement.classList.remove('theme-light', 'theme-mint', 'theme-autumn');
      if (theme !== 'abyss') document.documentElement.classList.add('theme-' + theme);
      const cs = getComputedStyle(document.getElementById('focus-bar'), '::after');
      out[theme] = Math.round(ratio(parse(cs.color), parse(cs.backgroundColor)) * 10) / 10;
    }
    document.documentElement.classList.remove('theme-light', 'theme-mint', 'theme-autumn');
    return out;
  });
  Object.values(focusContrast).every(v => v >= 4.5)
    ? ok('专注气泡四套皮肤对比度达标', Object.entries(focusContrast).map(([k, v]) => `${k} ${v}:1`).join(' · '))
    : bad('专注气泡对比度不足', JSON.stringify(focusContrast));

  // 异常态对照：懒惰仍有文字角标
  const lazy = await page.evaluate(() => {
    window.S.lazySince = Date.now() - 90000;
    const D = window.__gameDirty; for (const k of Object.keys(D || {})) D[k] = true;
    window.__qa.sim.render();
    const st = document.getElementById('staff-status');
    const r = st.getBoundingClientRect();
    return { text: st.textContent, isDot: st.classList.contains('is-dot'), w: Math.round(r.width), color: getComputedStyle(st).color };
  });
  lazy.text === '懒惰' && !lazy.isDot && lazy.w > 20
    ? ok('异常态仍显示文字角标', `「${lazy.text}」${lazy.w}px`)
    : bad('异常态角标退化', JSON.stringify(lazy));
  results.lazy = lazy;

  // 真实鼠标点击「招募」→ 线程数 +1（两行按钮的点击目标整体可用）
  const before = await page.evaluate(() => window.S.cultists.length);
  await page.evaluate(() => { window.S.lazySince = null; window.S.ep = 1e9; const D = window.__gameDirty; for (const k of Object.keys(D || {})) D[k] = true; window.__qa.sim.render(); });
  await sleep(200);
  const clickable = await page.evaluate(() => {
    const r = document.getElementById('hire-btn').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  clickable.w >= 24 && clickable.h >= 24 ? ok('招募按钮点击目标 ≥24×24', `${clickable.w}×${clickable.h}`) : bad('按钮过小', JSON.stringify(clickable));
  await page.mouse.click(clickable.cx, clickable.cy);
  await sleep(400);
  const after = await page.evaluate(() => window.S.cultists.length);
  after === before + 1 ? ok('真实点击招募成功', `${before} → ${after}`) : bad('点击招募无效', `${before} → ${after}`);

  // 窄列（≈360px 视口）不溢出、不被截断
  await page.setViewport({ width: 380, height: 880 });
  await sleep(600);
  const narrow = await page.evaluate(() => {
    const row = document.getElementById('wage-help-zone');
    const btn = document.getElementById('hire-btn');
    const prev = document.getElementById('staff-preview');
    const rr = n => { const r = n.getBoundingClientRect(); return { x: r.x, w: r.width, right: r.right, h: r.height }; };
    return {
      row: rr(row), btn: rr(btn), prev: rr(prev),
      prevClipped: prev.scrollWidth > prev.clientWidth + 1,
      overflow: row.scrollWidth > row.clientWidth + 1,
    };
  });
  !narrow.overflow ? ok('窄列整行无横向溢出', `${Math.round(narrow.row.w)}px`) : bad('窄列横向溢出', JSON.stringify(narrow));
  !narrow.prevClipped ? ok('窄列 NEXT 不被截断', `prev ${Math.round(narrow.prev.w)}px / ${Math.round(narrow.prev.h)}px`) : bad('NEXT 被截断', JSON.stringify(narrow.prev));
  narrow.btn.right <= narrow.row.right + 1 ? ok('窄列按钮仍在行内', `btn.right=${Math.round(narrow.btn.right)}`) : bad('按钮溢出', JSON.stringify(narrow));
  results.narrow = narrow;

  // ============ ③ 存档往返（进度不被默认值覆盖）+ 职级点整数 ============
  console.log('\n[③] 存档往返与职级点');
  const persistBefore = await page.evaluate(() => ({
    chapter: window.S.chapter, prestige: window.S.prestige, pp: window.S.prestigePoints,
    up: (window.S.upgrades || {}).reserve_bin, focus: window.S.focusLevel,
    prog: (window.S.projects.find(x => x.metric === 'gain') || {}).progress,
    base: (window.S.projects.find(x => x.metric === 'gain') || {}).base,
    rankText: (document.getElementById('h-rank') || {}).textContent,
    ppInt: Number.isInteger(window.S.prestigePoints),
  }));
  persistBefore.ppInt ? ok('加载后职级点已是整数', `旧档 3.732… → ${persistBefore.pp}`) : bad('职级点仍是小数', String(persistBefore.pp));
  /^\d+$/.test(persistBefore.rankText || '') ? ok('顶栏职级点只显示整数', persistBefore.rankText) : bad('顶栏职级点含小数', String(persistBefore.rankText));
  await page.reload({ waitUntil: 'load' });
  await sleep(1600);
  const persistAfter = await page.evaluate(() => ({
    chapter: window.S.chapter, prestige: window.S.prestige, pp: window.S.prestigePoints,
    up: (window.S.upgrades || {}).reserve_bin, focus: window.S.focusLevel,
    prog: (window.S.projects.find(x => x.metric === 'gain') || {}).progress,
    base: (window.S.projects.find(x => x.metric === 'gain') || {}).base,
  }));
  const kept = persistAfter.chapter === persistBefore.chapter && persistAfter.prestige === persistBefore.prestige
    && persistAfter.pp === persistBefore.pp && persistAfter.up === persistBefore.up && persistAfter.focus === persistBefore.focus
    && persistAfter.base === persistBefore.base;
  kept ? ok('刷新后章节/职级/升级/任务基准保持原值', `第 ${persistAfter.chapter} 章 · 职级 ${persistAfter.pp} · reserve_bin ${persistAfter.up}`)
    : bad('刷新后进度被覆盖', JSON.stringify({ persistBefore, persistAfter }));
  persistAfter.prog >= persistBefore.prog ? ok('刷新后任务进度只增不减', `${Math.round(persistBefore.prog)} → ${Math.round(persistAfter.prog)}`) : bad('任务进度被回退', `${persistBefore.prog} → ${persistAfter.prog}`);
  results.persist = { persistBefore, persistAfter };

  await page.setViewport({ width: 1600, height: 1000 });
  await sleep(300);
  await page.mouse.move(4, 4); // 移开鼠标，避免 hover 气泡压住截图里的专注条
  await sleep(200);
  const clip = await page.evaluate(() => { const r = document.getElementById('wage-help-zone').getBoundingClientRect(); return { x: r.x - 14, y: r.y - 12, width: r.width + 28, height: r.height + 110 }; });
  await page.screenshot({ path: SHOT, clip });

  errs.length === 0 ? ok('无 pageerror', '0') : bad('页面报错', errs.join(' | '));
  results.errors = errs;
} finally {
  await browser.close();
}
console.log(`\n[v404] ${pass} pass / ${fail} fail`);
if (REPORT) {
  try { const { writeFileSync } = await import('node:fs'); writeFileSync(REPORT, JSON.stringify(results, null, 2)); } catch { /* 报告落盘失败不影响结论 */ }
}
process.exit(fail ? 1 : 0);
