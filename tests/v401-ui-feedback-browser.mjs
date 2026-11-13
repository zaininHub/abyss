// v4.0.1 四项反馈 UI 专项浏览器验收（真实 DOM / computed style / 几何 / 浮层命中）
//
// 覆盖：
//   ① AI 助手面板头部不再挤在一行——标题单行，「预留线 EP 上限」独立成行，10%/30%/50% 按钮始终可点选；
//   ② 深渊扩展研究卡 desc 去掉「每层」字样（rp_delve / rp_rift）；
//   ③ 班组档案卡每页 6 条（PAGE_SIZE = 6）；
//   ④ 深渊凝视改回屏幕底部中央固定悬浮（脱离 .sys-btns），自动转化从首列面板移为「⚡ 转化」悬浮按钮（皮肤左侧），悬停展开快捷开关。
//
// 用法：node tests/v401-ui-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v401-ui-report.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

// 种子存档：只给「产品可达的解锁态」，不伪造本轮要验收的 UI 结果。
//   · abyssGazeUnlocked:true → 深渊凝视常驻（底部居中）
//   · _crewUnlocked:true + 8 名 cultists → 班组面板渲染，验证每页 6 条
//   · tech.ai_core:true + ai.reserve:0.3 → AI 面板渲染，含预留线 3 档按钮
//   · upgrades.atrium:1 + religion.temple:6 → 至少两枚自动转化开关解锁，验证「⚡ 转化」悬浮按钮弹层
const mkSave = () => JSON.stringify({
  _version: 6, chapter: '4', storyline: 'line_order',
  ep: 1e12, rp: 1e6, es: 1e6, dm: 1e6, pt: 1e6, faith: 1e6,
  upgrades: { atrium: 1 }, buildings: {},
  cultists: [
    { id: 1, name: '外勤干员 A', mood: '超频', profession: 'acolyte', level: 3, boundTo: '' },
    { id: 2, name: '外勤干员 B', mood: '正常', profession: 'slacker', level: 2, boundTo: '' },
    { id: 3, name: '外勤干员 C', mood: '高效', profession: 'acolyte', level: 1, boundTo: '' },
    { id: 4, name: '外勤干员 D', mood: '正常', profession: 'slacker', level: 2, boundTo: '' },
    { id: 5, name: '外勤干员 E', mood: '高效', profession: 'acolyte', level: 1, boundTo: '' },
    { id: 6, name: '外勤干员 F', mood: '超频', profession: 'slacker', level: 3, boundTo: '' },
    { id: 7, name: '外勤干员 G', mood: '正常', profession: 'acolyte', level: 2, boundTo: '' },
    { id: 8, name: '外勤干员 H', mood: '高效', profession: 'slacker', level: 1, boundTo: '' },
  ],
  tech: { ai_core: true },
  religion: { unlocked: true, branch: 'sun', seal: 4, temple: 6, devotion: 500, transcend: 2 },
  _crewUnlocked: true,
  prestige: 3, prestigePoints: 20, projectsDone: 30,
  eternal: { eff: 2, skin_light: 1, skin_ember: 1 },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, fp: true, pt: true, dm: true, vs: true, es: true },
  ai: { reserve: 0.3 }, focusLevel: 12,
  abyssGazeUnlocked: true,
  _rpOverflowSeen: false, lastSeen: Date.now(), startTime: Date.now(),
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
  await page.evaluateOnNewDocument(s => {
    localStorage.setItem('abyss_idle_v2', s);
    localStorage.removeItem('abyss_skin');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);
  await page.evaluate(() => {
    (window.__timerIds || []).forEach(id => clearInterval(id));
    const D = window.__gameDirty;
    for (const k of Object.keys(D || {})) D[k] = true;
    window.__qa.sim.render();
  });
  await sleep(350);

  // ---------- ① AI 头部：标题单行 + 预留线独立成行 + 按钮可点选 ----------
  const ai = await page.evaluate(() => {
    const q = window.__qa;
    const card = document.getElementById('ai-card');
    const title = card && card.querySelector('.ai-title');
    let titleLines = 0;
    if (title) { const r = document.createRange(); r.selectNodeContents(title); titleLines = r.getClientRects().length; }
    const titleCs = title ? getComputedStyle(title) : null;
    // 预留线：必须是 #ai-card 的直接子元素（标题行 h3 之外），而非 h3 内
    const inH3 = !!(card && card.querySelector('.ai-card > h3 [data-ai-reserve-line]'));
    const line = card && card.querySelector('.ai-card > [data-ai-reserve-line]');
    const btns = line ? [...line.querySelectorAll('.ai-reserve-btn')] : [];
    const btnBoxes = btns.map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) }; });
    const label = line ? line.querySelector('.ai-reserve-label') : null;
    return {
      cardVisible: card ? card.style.display !== 'none' : false,
      titleText: title ? title.textContent.trim() : '',
      titleLines, titleNowrap: titleCs ? titleCs.whiteSpace : '',
      inH3, lineExists: !!line, labelText: label ? label.textContent.trim() : '',
      btnCount: btns.length,
      clickable: btnBoxes.length > 0 && btnBoxes.every(b => b.w >= 24 && b.h >= 24 && b.top >= 0 && b.top <= innerHeight && b.left >= 0 && b.left <= innerWidth),
      labelInLine: !!(line && line.contains(label)),
    };
  });
  results.ai = ai;
  if (ai.cardVisible && ai.titleLines === 1 && ai.titleNowrap === 'nowrap' && ai.titleText.includes('AI 助手'))
    ok('① 「🤖 AI 助手」标题单行不换行', `${ai.titleText} / ${ai.titleLines} 行`);
  else bad('① AI 标题仍换行或不可见', JSON.stringify(ai));
  if (!ai.inH3 && ai.lineExists && ai.labelText.includes('预留线 EP 上限') && ai.labelInLine)
    ok('① 「预留线 EP 上限」独立成行（位于标题行下方，不在 h3 内）', `inH3=${ai.inH3}`);
  else bad('① 预留线未独立成行', JSON.stringify(ai));
  if (ai.btnCount === 3 && ai.clickable)
    ok('① 预留线 3 档按钮（10%/30%/50%）可见且点击目标 ≥24×24', `${ai.btnCount} 档 / 可点选 ${ai.clickable}`);
  else bad('① 预留线按钮缺失或不可点选', JSON.stringify(ai));

  // ---------- ② 深渊扩展研究 desc 去「每层」 ----------
  const desc = await page.evaluate(() => {
    const q = window.__qa;
    const ups = q.BALANCE.researchUpgs.filter(u => u.id === 'rp_delve' || u.id === 'rp_rift');
    return ups.map(u => ({ id: u.id, desc: u.desc, hasMeiCeng: u.desc.includes('每层') }));
  });
  results.desc = desc;
  if (desc.length === 2 && desc.every(u => !u.hasMeiCeng))
    ok('② rp_delve / rp_rift 描述已去除「每层」', desc.map(u => u.id).join(', '));
  else bad('② 描述仍含「每层」', JSON.stringify(desc));

  // ---------- ③ 班组每页 6 条 ----------
  const crew = await page.evaluate(() => {
    const card = document.getElementById('orchestration-card');
    const grid = document.querySelector('#crew-panel .crew-grid');
    if (!grid) return { exists: false, visible: card ? card.style.display : 'n/a' };
    const cards = [...grid.querySelectorAll('.crew-card')].filter(c => !c.classList.contains('more'));
    const pager = document.querySelector('#crew-panel .crew-pager');
    const pagerText = pager ? (pager.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return { exists: true, visible: card ? card.style.display : '', cardCount: cards.length, pagerText };
  });
  results.crew = crew;
  if (crew.exists && crew.cardCount === 6)
    ok('③ 班组档案卡首页展示 6 条（PAGE_SIZE=6）', `${crew.cardCount} 张 / 共 8 名`);
  else bad('③ 班组首页条数非 6', JSON.stringify(crew));
  if (crew.exists && /第 1 \/ 2 页/.test(crew.pagerText))
    ok('③ 分页器显示「第 1 / 2 页」（8 名 ÷ 6 = 2 页）', crew.pagerText);
  else bad('③ 分页器页数不符', JSON.stringify(crew));

  // ---------- ④ 深渊凝视底部居中 + 自动转化悬浮按钮 ----------
  const gaze = await page.evaluate(() => {
    const el = document.getElementById('abyss-gaze-crack');
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      exists: true, position: cs.position,
      parentIsBody: el.parentElement === document.body,
      inSysBtns: !!(el.closest && el.closest('.sys-btns')),
      centerX: Math.round(r.left + r.width / 2), viewportCenterX: Math.round(innerWidth / 2),
      bottomGap: Math.round(innerHeight - r.bottom), width: Math.round(r.width), height: Math.round(r.height),
    };
  });
  results.gaze = gaze;
  if (gaze.exists && gaze.position === 'fixed' && gaze.parentIsBody && !gaze.inSysBtns)
    ok('④ 深渊凝视固定到 body（脱离 .sys-btns 行）', `position=${gaze.position}`);
  else bad('④ 凝视未固定到 body / 仍在 .sys-btns', JSON.stringify(gaze));
  if (gaze.exists && Math.abs(gaze.centerX - gaze.viewportCenterX) <= 6 && gaze.bottomGap >= 40 && gaze.bottomGap <= 90)
    ok('④ 深渊凝视屏幕底部中央（水平居中 + 落于触手条带之上）', `centerX=${gaze.centerX}/${gaze.viewportCenterX} · 距底 ${gaze.bottomGap}px`);
  else bad('④ 凝视未居中或重叠触手条带', JSON.stringify(gaze));

  const fab = await page.evaluate(() => {
    const q = document.getElementById('qs-fab');
    const skin = document.getElementById('skin-menu');
    const btn = document.getElementById('qs-fab-btn');
    const pop = document.getElementById('qs-fab-pop');
    const switches = pop ? pop.querySelector('#quick-switches') : null;
    const qsBtns = switches ? switches.querySelectorAll('[data-qs]') : [];
    return {
      exists: !!q, visible: q ? q.style.display !== 'none' : false,
      leftOfSkin: q && skin ? (q.getBoundingClientRect().right <= skin.getBoundingClientRect().left + 1) : false,
      btnVisible: btn ? btn.style.display !== 'none' : false,
      popExists: !!pop, switchesInside: !!switches, switchCount: qsBtns.length,
    };
  });
  results.fab = fab;
  if (fab.exists && fab.visible && fab.leftOfSkin)
    ok('④ 「⚡ 转化」悬浮按钮位于皮肤左侧', `leftOfSkin=${fab.leftOfSkin}`);
  else bad('④ 悬浮按钮缺失或未在皮肤左侧', JSON.stringify(fab));
  if (fab.popExists && fab.switchesInside && fab.switchCount >= 1)
    ok('④ 弹层内复用 #quick-switches 且含已解锁开关', `${fab.switchCount} 枚`);
  else bad('④ 弹层缺少自动转化开关', JSON.stringify(fab));

  // hover 真实链路：悬停按钮 → 弹层 display:flex 且未被遮挡
  await page.hover('#qs-fab-btn');
  await sleep(220);
  const fabHover = await page.evaluate(() => {
    const pop = document.getElementById('qs-fab-pop');
    if (!pop) return { visible: false };
    const cs = getComputedStyle(pop);
    const r = pop.getBoundingClientRect();
    const cx = Math.round(r.left + Math.min(60, r.width / 2));
    const cy = Math.round(r.top + Math.min(20, r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    return { visible: cs.display !== 'none', inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      hitInside: !!(hit && (hit === pop || pop.contains(hit))), hitTag: hit ? (hit.className || hit.tagName) : '' };
  });
  results.fabHover = fabHover;
  if (fabHover.visible && fabHover.inViewport && fabHover.hitInside)
    ok('④ 悬停浮层真实可见且未被遮挡（elementFromPoint 命中弹层）', fabHover.hitTag);
  else bad('④ 悬浮弹层不可见或被遮挡', JSON.stringify(fabHover));

  // 点击开关 → 状态切换（委托 + 重渲染生效）
  const before = await page.evaluate(() => {
    const b = document.querySelector('#quick-switches [data-qs="atrium"]');
    return b ? b.textContent.trim() : '';
  });
  await page.click('#quick-switches [data-qs="atrium"]');
  await sleep(150);
  const after = await page.evaluate(() => {
    const b = document.querySelector('#quick-switches [data-qs="atrium"]');
    return b ? b.textContent.trim() : '';
  });
  results.fabClick = { before, after };
  if (before && after && before !== after && /开|关/.test(before) && /开|关/.test(after))
    ok('④ 点击自动转化开关即时切换（开↔关）', `${before} → ${after}`);
  else bad('④ 开关点击未生效', JSON.stringify(results.fabClick));

  // ---------- 通用：无运行时异常 / 无 undefined NaN ----------
  const health = await page.evaluate(() => {
    const t = document.body.textContent || '';
    return { errs: window.__qa.panelErrors ? window.__qa.panelErrors().length : -1,
      badText: /undefined|NaN|Infinity/.test(t) };
  });
  results.health = { ...health, pageErrors: errs };
  if (errs.length === 0 && !health.badText)
    ok('通用：无 pageerror、各面板文本无 undefined/NaN/Infinity');
  else bad('通用：运行时异常或文本污染', JSON.stringify(results.health));

  await page.close();
} finally {
  await browser.close();
}

try { const { writeFileSync } = await import('node:fs'); writeFileSync(REPORT, JSON.stringify(results, null, 2)); } catch (e) { /* ignore */ }
console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 / 报告 ${REPORT} ===`);
process.exit(fail ? 1 : 0);
