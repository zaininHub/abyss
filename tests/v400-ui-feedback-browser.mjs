// v4.0.0 七项反馈 UI 专项浏览器验收（真实 DOM / computed style / 几何 / 浮层命中）
//
// 覆盖：
//   ① 宗教小节标题格式统一 + 信仰圣所「总计」在括号外靠右
//   ② 永恒矩阵已学完项收进折叠区 + 薄荷绿潮/秋日鎏金两款新皮肤 + 浅色主题文字对比度
//   ③ 研究分组「玩法扩展与配套」→「深渊协议」
//   ④ 相位共鸣去文案/纯开关/与编排同级一排 + 班组去状态行/成员一行两个/与上方隔开
//   ⑤ 潮汐预案浮层 position:fixed 且悬停时真正置顶（未被裁剪/遮挡）
//   ⑥ 「专注等级」标签不重复
//   ⑦ AI 标题不换行 + 自动化动作卡一行两个
//
// 用法：node tests/v400-ui-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v400-ui-report.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

// 种子存档：只给「产品可达的解锁态」，不伪造本轮要验收的 UI 结果。
// 皮肤已购 2 项用于验证「已学完收进折叠区」，另 2 项保持未购用于验证菜单锁定态。
const mkSave = () => JSON.stringify({
  _version: 6, chapter: '4', storyline: 'line_order',
  ep: 1e12, rp: 1e6, es: 1e6, dm: 1e6, pt: 1e6, faith: 1e6,
  upgrades: {}, buildings: {}, cultists: [
    { id: 1, name: '外勤干员 A', mood: '超频', profession: 'acolyte', level: 3, boundTo: '' },
    { id: 2, name: '外勤干员 B', mood: '正常', profession: 'slacker', level: 2, boundTo: '' },
    { id: 3, name: '外勤干员 C', mood: '高效', profession: 'acolyte', level: 1, boundTo: '' },
  ],
  // religion.unlocked 是唤醒标记（缺了会渲染「唤醒信仰」而非圣印/圣所区块）；
  // _crewUnlocked 是班组面板门槛（或 cultists ≥10），夹具直接给产品可达的持久标记。
  tech: { ai_core: true },
  religion: { unlocked: true, branch: 'sun', seal: 4, temple: 6, devotion: 500, transcend: 2 },
  _crewUnlocked: true,
  prestige: 3, prestigePoints: 20, projectsDone: 30,
  eternal: { eff: 2, skin_light: 1, skin_ember: 1 },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, fp: true, pt: true, dm: true, vs: true, es: true },
  ai: { reserve: 0.3 }, focusLevel: 12,
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

  // ---------- ① 宗教：小节标题统一 + 总计括号外靠右 ----------
  const religion = await page.evaluate(() => {
    const q = window.__qa, S = window.S;
    q.sim.switchTab('religion');
    q.sim.render();
    const panel = document.getElementById('religion-panel');
    const heads = [...panel.querySelectorAll('.religion-sec-head')];
    const styles = heads.map(h => {
      const cs = getComputedStyle(h);
      return { color: cs.color, weight: cs.fontWeight, text: (h.textContent || '').trim().slice(0, 24) };
    });
    const total = panel.querySelector('[data-religion-total]');
    const head = total ? total.closest('.religion-sec-head') : null;
    const headSpan = head ? head.querySelector('span:first-child') : null;
    const r = total ? total.getBoundingClientRect() : null;
    const pr = panel.getBoundingClientRect();
    const cs = total ? getComputedStyle(total) : null;
    return {
      headCount: heads.length, styles,
      totalText: total ? total.textContent.trim() : '',
      // 「括号外」：总计元素自身文本不含全角括号，且不在带括号的 span 内
      inParens: (total?.textContent || '').includes('（') || (total?.textContent || '').includes('('),
      headSpanHasParens: (headSpan?.textContent || '').includes('（'),
      rightAligned: r ? (pr.right - r.right) < 40 : false,
      marginLeftAuto: cs ? cs.marginLeft : '',
      textLen: panel.textContent.length,
    };
  });
  results.religion = religion;
  if (religion.headCount >= 4 && religion.styles.every(s => s.weight === '600' && s.color === 'rgb(88, 166, 255)'))
    ok('① 宗教五小节标题统一格式（.religion-sec-head / accent / 600）', `${religion.headCount} 个标题`);
  else bad('① 宗教小节标题格式未统一', JSON.stringify(religion.styles));
  if (religion.totalText.includes('总计') && !religion.inParens && religion.headSpanHasParens && religion.rightAligned)
    ok('① 信仰圣所「总计」在括号外且靠右', religion.totalText);
  else bad('① 信仰圣所总计位置不符', JSON.stringify(religion));

  // ---------- ② 永恒矩阵折叠 + 新皮肤 + 浅色主题 ----------
  const eternal = await page.evaluate(() => {
    const q = window.__qa;
    q.sim.switchTab('tech');
    q.sim.render();
    const list = document.getElementById('eternal-list');
    const ownedBox = list ? list.querySelector('.owned-box') : null;
    const ownedHeader = list ? list.querySelector('.owned-header') : null;
    const learned = [...(ownedBox ? ownedBox.querySelectorAll('.tech') : [])].map(e => e.textContent.slice(0, 20));
    const mainCards = list ? [...list.children].filter(e => e.classList.contains('tech')).length : 0;
    const skins = [...document.querySelectorAll('#skin-pop .skin-opt')].map(b => b.dataset.skin);
    const cs = getComputedStyle(document.documentElement);
    // 切到浅色，检查 --text-1 是否有真实值（对比度修复的核心）
    const root = document.documentElement;
    root.classList.add('theme-light');
    const lightText1 = getComputedStyle(root).getPropertyValue('--text-1').trim();
    const lightText3 = getComputedStyle(root).getPropertyValue('--text-3').trim();
    root.classList.remove('theme-light');
    return { ownedBoxExists: !!ownedBox, ownedHeaderText: ownedHeader ? ownedHeader.textContent.trim() : '',
      learnedCount: learned.length, learned, mainCards, skins, lightText1, lightText3,
      totalEternals: q.BALANCE ? 20 : 0 };
  });
  results.eternal = eternal;
  if (eternal.ownedBoxExists && eternal.learnedCount === 2 && eternal.ownedHeaderText.includes('已拥有'))
    ok('② 永恒矩阵已学完项收进「已拥有」折叠区', `${eternal.learnedCount} 项 / ${eternal.ownedHeaderText}`);
  else bad('② 永恒矩阵折叠区异常', JSON.stringify(eternal));
  if (eternal.mainCards > 0)
    ok('② 可叠加升级项仍留在可购区（可继续升级）', `${eternal.mainCards} 张主卡`);
  else bad('② 可叠加项被误收起，玩家将无法继续升级');
  if (['abyss', 'light', 'ember', 'mint', 'autumn'].every(s => eternal.skins.includes(s)))
    ok('② 薄荷绿潮 / 秋日鎏金两款皮肤已接入菜单', eternal.skins.join(', '));
  else bad('② 皮肤菜单缺项', JSON.stringify(eternal.skins));
  if (eternal.lightText1 && eternal.lightText1 !== '' && eternal.lightText3 === '#5a6472')
    ok('② 晨光白昼 --text-1 已补齐、--text-3 加深', `--text-1=${eternal.lightText1} / --text-3=${eternal.lightText3}`);
  else bad('② 浅色主题文字对比度修复未生效', JSON.stringify({ t1: eternal.lightText1, t3: eternal.lightText3 }));

  // 新主题可应用且颜色变量生效
  const newThemes = await page.evaluate(() => {
    const root = document.documentElement, out = {};
    for (const n of ['mint', 'autumn']) {
      root.className = root.className.replace(/theme-\S+/g, '').trim();
      root.classList.add('theme-' + n);
      const cs = getComputedStyle(root);
      out[n] = { bg: cs.getPropertyValue('--bg').trim(), text: cs.getPropertyValue('--text-1').trim(),
        accent: cs.getPropertyValue('--accent').trim() };
    }
    root.className = root.className.replace(/theme-\S+/g, '').trim();
    return out;
  });
  results.newThemes = newThemes;
  if (newThemes.mint.bg && newThemes.mint.text && newThemes.autumn.bg && newThemes.autumn.text
      && newThemes.mint.bg !== newThemes.autumn.bg)
    ok('② 薄荷绿潮 / 秋日鎏金主题变量真实生效且互不相同',
      `mint ${newThemes.mint.bg} / autumn ${newThemes.autumn.bg}`);
  else bad('② 新主题变量缺失', JSON.stringify(newThemes));

  // ---------- ③ 研究分组改名 ----------
  const groupName = await page.evaluate(() => {
    const q = window.__qa;
    q.sim.switchTab('research');
    q.sim.render();
    const g = (q.RP_GROUPS || []).find(x => x.key === 'res');
    const txt = document.getElementById('research-upgrade-list')?.textContent || '';
    return { name: g ? g.name : '', inDom: /深渊协议/.test(txt), old: /玩法扩展与配套/.test(txt) };
  });
  results.groupName = groupName;
  if (groupName.name === '深渊协议' && !groupName.old)
    ok('③ 研究分组改名「深渊协议」且旧名清除', `name=${groupName.name}`);
  else bad('③ 分组改名未生效', JSON.stringify(groupName));

  // ---------- ④ 相位共鸣 / 班组 ----------
  const orch = await page.evaluate(() => {
    const q = window.__qa, S = window.S;
    q.setOrchestrationAutoTide(S, true);
    q.setResonanceEnabled(S, true);
    window.__gameDirty.orchestration = true;
    q.sim.render();
    const card = document.getElementById('orchestration-panel');
    const crew = document.getElementById('crew-panel');
    const toggle = card.querySelector('[data-res-toggle]');
    const foci = [...card.querySelectorAll('[data-res-focus]')];
    const btns = [toggle, ...foci].filter(Boolean);
    const ys = btns.map(b => Math.round(b.getBoundingClientRect().top));
    const txt = card.textContent || '';
    const crewGrid = crew.querySelector('.crew-grid');
    const gridCols = crewGrid ? getComputedStyle(crewGrid).gridTemplateColumns : '';
    const crewTxt = crew.textContent || '';
    const crewPad = crew ? getComputedStyle(crew) : null;
    const cards = [...(crewGrid ? crewGrid.querySelectorAll('.crew-card') : [])];
    const rowTops = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))];
    return {
      btnCount: btns.length, sameRow: ys.length > 0 && ys.every(y => Math.abs(y - ys[0]) <= 2),
      toggleText: toggle ? toggle.textContent.trim() : '',
      hasExplain: /焦点每层/.test(txt), hasLayers: /\d+\/20/.test(txt), hasMult: /×\d\.\d\d/.test(txt),
      ariaOk: btns.every(b => b.getAttribute('aria-label') && b.getAttribute('aria-pressed') !== null),
      crewStateNodes: crew.querySelectorAll('.crew-state').length,
      crewStateText: /懒惰怠工|满薪运行|欠薪降效|强制休眠|流失预警/.test(crewTxt),
      lazyBadge: /😪怠惰/.test(crewTxt),
      gridCols, twoPerRow: cards.length >= 2 && rowTops.length >= 1 &&
        cards.filter(c => Math.round(c.getBoundingClientRect().top) === rowTops[0]).length === 2,
      separated: crewPad ? (parseFloat(crewPad.borderTopWidth) > 0 && parseFloat(crewPad.marginTop) > 0) : false,
      cardCount: cards.length,
    };
  });
  results.orch = orch;
  if (orch.btnCount === 5 && orch.sameRow && orch.ariaOk)
    ok('④ 相位共鸣：1 纯开关 + 4 焦点同排（aria 契约保留）', `${orch.btnCount} 按钮 / 同一行 ${orch.sameRow}`);
  else bad('④ 共鸣按钮排布异常', JSON.stringify(orch));
  if (!orch.hasExplain && orch.toggleText === '◉' && orch.hasLayers && orch.hasMult)
    ok('④ 共鸣说明文案与「共鸣：开/关」文字已去除，层数/倍率读数保留', `toggle="${orch.toggleText}"`);
  else bad('④ 共鸣文案清理不完整', JSON.stringify({ e: orch.hasExplain, t: orch.toggleText, l: orch.hasLayers, m: orch.hasMult }));
  if (orch.crewStateNodes === 0 && !orch.crewStateText && !orch.lazyBadge)
    ok('④ 班组详情不再展示怠惰等状态', '状态行 / 状态文案 / 😪标记 均为 0');
  else bad('④ 班组状态未清干净', JSON.stringify(orch));
  if (orch.twoPerRow && orch.gridCols.split(' ').length === 2)
    ok('④ 班组成员一行 2 个', `grid: ${orch.gridCols} / ${orch.cardCount} 张卡`);
  else bad('④ 班组成员非两列', JSON.stringify({ g: orch.gridCols, c: orch.cardCount, t: orch.twoPerRow }));
  if (orch.separated) ok('④ 效能编排 / 共鸣 与下方班组明确隔开', 'border-top + margin-top');
  else bad('④ 编排与班组未隔开');

  // ---------- ⑤ 潮汐浮层置顶 ----------
  const pop = await page.evaluate(() => {
    const wrap = document.querySelector('.tide-sched-wrap');
    const p = wrap ? wrap.querySelector('.tide-sched-pop') : null;
    if (!p) return { exists: false };
    const cs = getComputedStyle(p);
    return { exists: true, position: cs.position, zIndex: cs.zIndex,
      left: p.style.left, top: p.style.top,
      overflowY: cs.overflowY, maxHeight: cs.maxHeight };
  });
  results.pop = pop;
  if (pop.exists && pop.position === 'fixed' && Number(pop.zIndex) >= 999)
    ok('⑤ 潮汐预案浮层已脱离滚动容器（position:fixed / z-index 置顶）',
      `${pop.position} / z=${pop.zIndex}`);
  else bad('⑤ 浮层未置顶', JSON.stringify(pop));

  // hover 真实链路：浮层可见 + 中心点命中浮层自身（未被任何元素遮挡）
  await page.hover('[data-orch-auto]');
  await sleep(220);
  const hover = await page.evaluate(() => {
    const p = document.querySelector('.tide-sched-pop');
    if (!p) return { visible: false };
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const cx = Math.round(r.left + Math.min(60, r.width / 2));
    const cy = Math.round(r.top + Math.min(20, r.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    return { visible: cs.display !== 'none', w: Math.round(r.width), h: Math.round(r.height),
      inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      hitInsidePop: !!(hit && (hit === p || p.contains(hit))),
      hitTag: hit ? (hit.className || hit.tagName) : '',
      slots: p.querySelectorAll('[data-orch-slot]').length,
      marks: (p.textContent || '').match(/▶/g)?.length || 0 };
  });
  results.hover = hover;
  if (hover.visible && hover.inViewport && hover.hitInsidePop && hover.slots === 16 && hover.marks === 1)
    ok('⑤ 悬停浮层真实可见且未被遮挡（elementFromPoint 命中浮层）',
      `${hover.w}×${hover.h} / ${hover.slots} 槽 / ${hover.marks} 个 ▶`);
  else bad('⑤ 浮层仍被遮挡或未完整渲染', JSON.stringify(hover));

  // ---------- ⑥ 专注等级去重 ----------
  const focus = await page.evaluate(() => {
    const bar = document.getElementById('focus-bar');
    const lv = document.getElementById('focus-lv');
    return { bar: (bar?.textContent || '').trim(), lv: (lv?.textContent || '').trim() };
  });
  results.focus = focus;
  const labelCount = (focus.bar.match(/专注等级/g) || []).length;
  if (labelCount === 1 && /Lv\./.test(focus.lv) && !/专注等级/.test(focus.lv))
    ok('⑥ 「专注等级」标签只出现一次', focus.bar.slice(0, 44));
  else bad('⑥ 专注等级文案重复或未渲染', JSON.stringify(focus));

  // ---------- ⑦ AI 标题 / 动作卡两列 ----------
  const ai = await page.evaluate(() => {
    const q = window.__qa;
    const title = document.querySelector('.ai-card > h3 .ai-title');
    const grid = document.querySelector('#ai-panel .ai-action-grid');
    const range = document.createRange();
    range.selectNodeContents(title);
    const rects = [...range.getClientRects()];
    const cs = grid ? getComputedStyle(grid) : null;
    const cards = grid ? [...grid.querySelectorAll('.ai-action')] : [];
    const tops = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)))];
    return { titleText: title ? title.textContent.trim() : '', titleLines: rects.length,
      nowrap: title ? getComputedStyle(title).whiteSpace : '',
      gridCols: cs ? cs.gridTemplateColumns : '', colCount: cs ? cs.gridTemplateColumns.split(' ').length : 0,
      cardCount: cards.length,
      twoPerRow: cards.length >= 2 && cards.filter(c => Math.round(c.getBoundingClientRect().top) === tops[0]).length === 2 };
  });
  results.ai = ai;
  if (ai.titleLines === 1 && ai.nowrap === 'nowrap')
    ok('⑦ 「🤖 AI 助手」标题单行不换行', `${ai.titleText} / ${ai.titleLines} 行`);
  else bad('⑦ AI 标题仍换行', JSON.stringify(ai));
  if (ai.colCount === 2 && ai.twoPerRow)
    ok('⑦ 自动化动作卡一行 2 个', `grid: ${ai.gridCols} / ${ai.cardCount} 张卡`);
  else bad('⑦ 自动化卡片非两列', JSON.stringify(ai));

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
