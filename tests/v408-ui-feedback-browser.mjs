// v4.0.8 五项反馈专项浏览器验收（真实 DOM / 真实指针 / computed style / 几何）
//
// 覆盖：
//   ① 第二列缩窄后班组一行放满、右两列一行收齐；「当前编排」行删除；
//      相位共鸣图标改三角形族、编排倍率标改圆形族、倍率行不换行。
//   ② 薪资悬浮说明改彩色 DOM 气泡（#wage-tip-pop），四态语义色 + 悬浮出现/离开消失。
//   ③ 专注行 NEXT 文案「线程产出+N%」，data-tip 悬浮窗删除。
//   ④ 「N 条线程在岗」行删除。
//   ⑤ 日志手柄在窄视口（1280×720）不被触手热区遮挡，elementFromPoint 命中手柄 + 真实拖拽生效。
//
// 用法：node tests/v408-ui-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v408-ui-report.json';
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
  await page.setViewport({ width: 1600, height: 960 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);

  // ============ ① 编排/班组布局与图标 ============
  console.log('\n[①] 编排卡：行删除 / 图标族 / 倍率不换行');
  const orch = await page.evaluate(() => {
    const el = document.getElementById('orchestration-panel');
    if (!el) return { visible: false };
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return { visible: false };
    const txt = el.textContent;
    const crew = document.getElementById('crew-panel');
    const rr = n => { if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
    // 倍率行孤字检测：文本节点换行（getClientRects 多段）即孤字
    const orphanCheck = el2 => [...el2.querySelectorAll('div')].filter(d => d.children.length === 0 && (d.textContent || '').length > 0)
      .map(d => ({ text: d.textContent.trim().slice(0, 24), rects: d.getClientRects().length, h: d.getBoundingClientRect().height }))
      .filter(x => x.h > 30);
    // 编排倍率 summary grid：v4.1.0 标签并入策略行后，用「圆形倍率标」特征定位——
    // 是 el 里最后一个 grid 容器（倍率 grid 始终是面板最后一个块）
    const grids = [...el.querySelectorAll('div')].filter(d => (getComputedStyle(d).display === 'grid'));
    const summaryGrid = grids[grids.length - 1] || null;
    const multMarks = summaryGrid ? [...summaryGrid.children].map(d => d.textContent.trim().slice(0, 12)) : [];
    // 共鸣开关状态（决定 ▲/△ 期望值）
    const toggleBtn = el.querySelector('[data-res-toggle]');
    return {
      visible: true,
      hasCurrentLine: /当前编排/.test(txt),
      hasMultLabel: /编排倍率/.test(txt) && !/策略与相位共鸣合并/.test(txt), // v4.1.0：标签并入策略行，旧文案删除
      hasOldLabelLine: /策略与相位共鸣合并/.test(txt),
      resUnlocked: !!toggleBtn,
      toggleState: toggleBtn?.getAttribute('aria-pressed') === 'true',
      toggleText: toggleBtn?.textContent.trim() || '',
      focusIcons: [...el.querySelectorAll('[data-res-focus]')].map(b => b.textContent.trim()),
      multMarks,
      resRowsNoWrap: [...el.querySelectorAll('div')].filter(d => /共鸣|×\d/.test(d.textContent) && d.children.length === 0).every(d => d.style.whiteSpace === 'nowrap'),
      crewCountLine: crew ? /条线程在岗/.test(crew.textContent) : null,
      crewHeadGone: crew ? !crew.querySelector('.crew-head') : null,
      crewGrid: rr(crew?.querySelector('.crew-grid')),
      crewSum: rr(crew?.querySelector('.crew-sum')),
      orphans: orphanCheck(el),
    };
  });
  results.orch = orch;
  orch.visible ? ok('编排卡已解锁渲染', '') : bad('编排卡未渲染', JSON.stringify(orch));
  !orch.hasCurrentLine ? ok('「当前编排」行已删除', '') : bad('「当前编排」行仍在', '');
  orch.hasMultLabel && !orch.hasOldLabelLine ? ok('「编排倍率」标签保留（已并入策略行）', '') : bad('编排倍率标签缺失或旧文案残留', JSON.stringify({ has: orch.hasMultLabel, old: orch.hasOldLabelLine }));
  // 共鸣开关联动图标：开态实心 ▲ / 关态空心 △（测试存档未开共鸣 → 期望 △）
  const toggleExpect = orch.toggleState ? '▲' : '△';
  orch.resUnlocked && orch.toggleText === toggleExpect ? ok(`共鸣开关三角随状态（${orch.toggleState ? '开▲' : '关△'}）`, orch.toggleText) : bad('共鸣开关图标不符', orch.toggleText);
  JSON.stringify(orch.focusIcons) === JSON.stringify(['▲', '△', '▼', '▽'])
    ? ok('四种共鸣焦点 = 四种三角形', orch.focusIcons.join(' '))
    : bad('共鸣焦点图标不符', JSON.stringify(orch.focusIcons));
  orch.multMarks.length === 4 ? ok('编排倍率四行全部带圆形标', orch.multMarks.join(' · ')) : bad('倍率圆标缺失', JSON.stringify(orch.multMarks));
  orch.multMarks.every(m => /^[●◐○]/.test(m)) ? ok('倍率标全部为圆形族', orch.multMarks.map(m => m[0]).join(' ')) : bad('倍率标混入非圆形', orch.multMarks.join(' '));
  orch.resRowsNoWrap ? ok('共鸣倍率行显式 nowrap', '') : bad('共鸣倍率行未 nowrap', '');
  orch.orphans.length === 0 ? ok('编排卡无孤字换行（行高均 <30px）', '') : bad('编排卡存在孤字换行', JSON.stringify(orch.orphans));
  orch.crewCountLine === false ? ok('「N 条线程在岗」已删除', '') : bad('「N 条线程在岗」仍在', String(orch.crewCountLine));
  orch.crewHeadGone ? ok('crew-head 整行已清退', '') : bad('crew-head 仍在', '');
  // 班组 2 列布局保持（每行 2 卡）：v4.0.8 缩窄第二列后断言卡宽/列宽的配比仍成立
  if (orch.crewGrid) {
    // 6 卡 3 行（每行 2 张）：grid 高 = 3 行 × 卡高 + 2 gap，卡内允许 crew-stat 折行
    // 关键断言改为「第二列确实缩窄」（fr 权重生效）+「班组卡两列排布未塌成单列」
    const twoPerRow = orch.crewGrid.w > 280; // 单列会 <250
    twoPerRow ? ok('班组两列布局保持', `grid w=${orch.crewGrid.w}px`) : bad('班组塌成单列', `grid w=${orch.crewGrid.w}px`);
  }
  // 第二列缩窄断言：0.90fr 下第二列 < 400px（v4.0.7 是 1.30fr ≈ 444px）
  // 注意 grid-template-columns 解析值可能返回 px 或 fr 混排，用四列 div 的实际 rect 宽度更稳
  const colW = await page.evaluate(() => {
    const lc = document.querySelector('.left-col');
    return { second: Math.round(lc.getBoundingClientRect().width), vw: innerWidth };
  });
  results.colW = colW;
  colW.second < 400 && colW.second >= 300 ? ok('第二列已缩窄（0.90fr 生效）', `${colW.second}px（原 444px）`) : bad('第二列宽度异常', JSON.stringify(colW));

  // 四种编排策略按钮（潮汐排班行）仍在
  const modes = await page.evaluate(() => [...document.querySelectorAll('#orchestration-panel [data-orch-mode]')].map(b => b.textContent.trim()));
  results.modes = modes;
  modes.length === 4 ? ok('四种编排策略按钮齐全', modes.join(' · ')) : bad('策略按钮缺失', JSON.stringify(modes));

  // ============ ② 薪资彩色气泡 ============
  console.log('\n[②] 薪资悬浮说明：彩色 DOM 气泡');
  await page.mouse.move(4, 4);
  await sleep(200);
  const wageTip0 = await page.evaluate(() => {
    const pop = document.getElementById('wage-tip-pop');
    if (!pop) return { exists: false };
    const cs = getComputedStyle(pop);
    return {
      exists: true, display: cs.display, zIndex: cs.zIndex, position: cs.position,
      colors: {
        good: getComputedStyle(pop.querySelector('.w-good')).color,
        warn: getComputedStyle(pop.querySelector('.w-warn')).color,
        orange: getComputedStyle(pop.querySelector('.w-orange')).color,
        bad: getComputedStyle(pop.querySelector('.w-bad')).color,
      },
      distinct: new Set(['.w-good', '.w-warn', '.w-orange', '.w-bad'].map(s => getComputedStyle(pop.querySelector(s)).color)).size,
    };
  });
  results.wageTip0 = wageTip0;
  wageTip0.exists ? ok('彩色气泡 DOM 存在', `z-index ${wageTip0.zIndex}`) : bad('气泡 DOM 缺失', '');
  wageTip0.display === 'none' ? ok('未悬浮时气泡隐藏', wageTip0.display) : bad('气泡未隐藏', wageTip0.display);
  wageTip0.position === 'fixed' ? ok('气泡 fixed 定位', '') : bad('定位方式不符', wageTip0.position);
  wageTip0.distinct === 4 ? ok('四态语义色互不相同', JSON.stringify(wageTip0.colors)) : bad('四态色未分色', JSON.stringify(wageTip0.colors));
  await page.hover('#wage-help-zone');
  await sleep(350);
  const wageTip1 = await page.evaluate(() => {
    const pop = document.getElementById('wage-tip-pop');
    const cs = getComputedStyle(pop);
    const r = pop.getBoundingClientRect();
    return { shown: cs.display !== 'none', ariaHidden: pop.getAttribute('aria-hidden'), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
  });
  results.wageTip1 = wageTip1;
  wageTip1.shown && wageTip1.ariaHidden === 'false' ? ok('悬浮整行气泡出现', `at ${wageTip1.left},${wageTip1.top}`) : bad('悬浮后气泡未出现', JSON.stringify(wageTip1));
  await page.mouse.move(4, 4);
  await sleep(300);
  const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('wage-tip-pop')).display === 'none');
  hidden ? ok('移开后气泡消失', '') : bad('气泡不消失', '');

  // ============ ③ 专注行 ============
  console.log('\n[③] 专注行：NEXT 线程产出+N% / 无悬浮窗');
  const focus = await page.evaluate(() => {
    const bar = document.getElementById('focus-bar');
    const prev = document.getElementById('focus-preview');
    return {
      prevText: prev.textContent.replace(/\s+/g, ' ').trim(),
      hasTip: !!(bar.dataset && bar.dataset.tip),
      tipStyle: getComputedStyle(bar, '::after').content,
    };
  });
  results.focus = focus;
  /NEXT/.test(focus.prevText) && /线程产出 \+\d+%/.test(focus.prevText)
    ? ok('NEXT 文案为「线程产出+N%」', focus.prevText)
    : bad('NEXT 文案不符', focus.prevText);
  !focus.hasTip ? ok('专注行 data-tip 已删除', '') : bad('data-tip 残留', String(focus.hasTip));
  focus.tipStyle === 'none' ? ok('专注行无 ::after 气泡', '') : bad('::after 内容仍在', focus.tipStyle);
  // 真实点击强化按钮仍可用（买一级）
  const focusBefore = await page.evaluate(() => window.S.focusLevel);
  await page.click('#focus-buy');
  await sleep(250);
  const focusAfter = await page.evaluate(() => window.S.focusLevel);
  focusAfter === focusBefore + 1 ? ok('强化按钮仍可用', `Lv.${focusBefore} → Lv.${focusAfter}`) : bad('强化按钮失效', `${focusBefore} → ${focusAfter}`);

  // ============ ⑤ 窄视口日志拖拽（1280×720 复现触手遮挡场景） ============
  console.log('\n[⑤] 窄视口日志拖拽（触手遮挡修复）');
  await page.setViewport({ width: 1280, height: 720 });
  await sleep(500);
  const hit = await page.evaluate(() => {
    const handle = document.getElementById('log-resize');
    const r = handle.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const el = document.elementFromPoint(cx, cy);
    const zs = {
      handle: getComputedStyle(handle).zIndex,
      tentacle: getComputedStyle(document.querySelector('.tentacle-tap-zone')).zIndex,
    };
    return { hit: el && (el.id === 'log-resize' || handle.contains(el)), hitTag: el ? el.id || el.className : 'null', zs, hr: { y: Math.round(r.y), h: Math.round(r.height) }, vh: window.innerHeight };
  });
  results.hit = hit;
  hit.hit ? ok('手柄中心点命中自身（不被触手层吃掉）', hit.hitTag) : bad('手柄仍被遮挡', JSON.stringify(hit));
  Number(hit.zs.handle) > Number(hit.zs.tentacle) ? ok('手柄 z-index 高于触手热区', `${hit.zs.handle} > ${hit.zs.tentacle}`) : bad('z-index 未提升', JSON.stringify(hit.zs));
  // 真实拖拽：向下拖 100px 高度增加（v4.1.0 反馈①：方向反转，往下拖=拉大）
  const hBefore = await page.evaluate(() => document.querySelector('.log-panel').getBoundingClientRect().height);
  const hr = await page.evaluate(() => { const r = document.getElementById('log-resize').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  await page.mouse.move(hr.x, hr.y);
  await page.mouse.down();
  await page.mouse.move(hr.x, hr.y + 50, { steps: 5 });
  await page.mouse.move(hr.x, hr.y + 100, { steps: 5 });
  await page.mouse.up();
  await sleep(250);
  const hAfter = await page.evaluate(() => document.querySelector('.log-panel').getBoundingClientRect().height);
  hAfter > hBefore + 90 ? ok('窄视口真实拖拽放大生效（向下拖）', `${Math.round(hBefore)} → ${Math.round(hAfter)}（+${Math.round(hAfter - hBefore)}）`) : bad('窄视口拖拽无效', `${hBefore} → ${hAfter}`);

  // 宽视口下日志专项回归（v407 已详测，此处烟囱验证未回退）
  await page.setViewport({ width: 1600, height: 960 });
  await sleep(400);
  const wideDrag = await page.evaluate(() => {
    const r = document.getElementById('log-resize').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  const hw0 = await page.evaluate(() => document.querySelector('.log-panel').getBoundingClientRect().height);
  await page.mouse.move(wideDrag.x, wideDrag.y);
  await page.mouse.down();
  await page.mouse.move(wideDrag.x, wideDrag.y + 60, { steps: 5 });
  await page.mouse.up();
  await sleep(250);
  const hw1 = await page.evaluate(() => document.querySelector('.log-panel').getBoundingClientRect().height);
  hw1 > hw0 + 50 ? ok('宽视口拖拽未回退（向下拖）', `${Math.round(hw0)} → ${Math.round(hw1)}`) : bad('宽视口拖拽回退', `${hw0} → ${hw1}`);

  // ============ 页面错误 ============
  errs.length === 0 ? ok('0 pageerror', '') : bad('页面有错误', errs.join(' | '));
} finally {
  await browser.close();
}

console.log(`\n========== v4.0.8 UI 专项：${pass} / ${fail} ==========`);
const fs = await import('fs');
try { fs.writeFileSync(REPORT, JSON.stringify(results, null, 2)); } catch { /* /tmp 不可写不阻塞 */ }
process.exit(fail === 0 ? 0 : 1);
