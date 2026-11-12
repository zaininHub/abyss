// v3.12.0 六项 UI 反馈专项浏览器验收（真实 DOM / computed style / 孤字换行 / 点击目标）
//
// 与 30 天长期推演互补：v3110 脚本验证玩法与数值守恒，本脚本在本轮改过的 6 个 UI 面上
// 做定点验收——① CPU/GPU 0 级展示 ② AI 五项动作全可见 ④ 政策/集市卡片体系
// ⑭ 底部动画统一与页面加宽 ⑮ 资源增减正负号 ⑯ 薪资说明整块触发。
//
// 用法：node tests/v3120-ui-browser.mjs   （Chrome 路径统一走 tests/_chrome.mjs）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 存档种子只提供「产品可达的解锁状态」，不伪造本轮要验证的 UI 结果：
// upgrades 保持空（CPU/GPU 必须停在 0 级），助手占编保持默认，政策/集市/凝视由解锁态自然渲染。
const mkSave = () => JSON.stringify({
  _version: 6, chapter: '2', storyline: 'line_order',
  ep: 1e10, rp: 0, es: 0, dm: 0, pt: 0,
  upgrades: {}, buildings: { abyss_fishbowl: 2 },
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
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setViewport({ width: 1600, height: 1000 });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 300)));
  await page.evaluateOnNewDocument(s => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => {
    (window.__timerIds || []).forEach(id => clearInterval(id));
    const D = window.__gameDirty;
    for (const k of Object.keys(D || {})) D[k] = true;
    window.__qa.sim.render();
  });

  const R = await page.evaluate(() => {
    const q = window.__qa;
    const cs = (el, pseudo) => el ? getComputedStyle(el, pseudo || null) : null;
    const txt = el => (el && el.innerText) || '';

    // ① 线程强化：CPU/GPU 必须 0 级可见且带真实等级上限
    const thread = document.getElementById('thread-shop');
    const threadItems = [...(thread ? thread.querySelectorAll('.item') : [])];
    const findItem = name => threadItems.find(e => txt(e).includes(name));
    const cpu = findItem('CPU 超频'), gpu = findItem('GPU 加速');
    const item1 = {
      cards: threadItems.length,
      cpuText: cpu ? txt(cpu).slice(0, 120) : '',
      gpuText: gpu ? txt(gpu).slice(0, 120) : '',
      cpuLv: cpu ? txt(cpu.querySelector('.count')).trim() : '',
      gpuLv: gpu ? txt(gpu.querySelector('.count')).trim() : '',
      noPlaceholder: !threadItems.some(e => txt(e).includes('???')),
    };

    // ② AI 面板：五个注册动作全可见、每个都有占编步进器、两组横幅
    const ai = document.getElementById('ai-panel');
    // v3.12.7 ⑤：助手行（4/N + 购买）已并入 #ai-card 标题行，跨容器查询
    const aiCard = document.getElementById('ai-card');
    const aiScope = aiCard || ai;
    const actions = [...(ai ? ai.querySelectorAll('[data-ai-action]') : [])];
    const item2 = {
      actionIds: actions.map(a => a.dataset.aiAction),
      groups: [...(ai ? ai.querySelectorAll('[data-ai-group]') : [])].map(g => g.dataset.aiGroup),
      allSteppers: actions.length > 0 && actions.every(a =>
        a.querySelector('[data-ai-crew-inc]') && a.querySelector('[data-ai-crew-dec]')),
      lockedHints: [...(ai ? ai.querySelectorAll('.ai-lock-hint') : [])].map(e => txt(e).trim()),
      // v3.12.5 反馈④：台账不占版面，改为助手行 data-tip；「常驻班组」说明移入 Wiki
      hasLedger: !!ai?.querySelector('[data-ai-ledger]'),
      crewHint: /常驻班组/.test(txt(ai)),
      headTip: aiScope?.querySelector('[data-ai-head]')?.dataset.tip || '',
    };

    // ④ 政策 / 集市：升级商店同款 shop-grid + 文字状态角标
    const pol = document.getElementById('policy-panel');
    const bz = document.getElementById('bazaar-panel');
    const item4 = {
      policyGrids: pol ? pol.querySelectorAll('.shop-grid').length : 0,
      policyCards: pol ? pol.querySelectorAll('.shop-grid .item').length : 0,
      policyStates: [...(pol ? pol.querySelectorAll('.policy-state') : [])].map(e => txt(e).trim()),
      bazaarGrids: bz ? bz.querySelectorAll('.shop-grid').length : 0,
      dealerCards: bz ? bz.querySelectorAll('.shop-grid .item').length : 0,
      dealerStates: [...(bz ? bz.querySelectorAll('.dealer-state') : [])].map(e => txt(e).trim()),
      lockedBazaarCard: !!bz?.querySelector('[data-module-unlock]'),
    };

    // ⑭ 底部装饰：触手与凝视同高、不挡内容、页面加宽
    const deco = document.getElementById('tentacle-deco');
    const gaze = document.getElementById('abyss-gaze-crack');
    const app = document.getElementById('app');
    const cols = document.querySelector('.cols') || document.querySelector('.columns') || app?.firstElementChild;
    const item14 = {
      cssVar: cs(document.documentElement).getPropertyValue('--bottom-deco-h').trim(),
      decoH: cs(deco)?.height, decoW: cs(deco)?.width,
      decoPointer: cs(deco)?.pointerEvents, decoDisplay: cs(deco)?.display,
      gazeH: cs(gaze)?.height, gazePointer: cs(gaze)?.pointerEvents,
      appPadRight: cs(app)?.paddingRight, appPadBottom: cs(app)?.paddingBottom,
      gridCols: cs(cols)?.gridTemplateColumns,
      tapZone: !!document.getElementById('tentacle-tap-zone'),
    };

    // ⑮ 卡面文案：无裸倍率，且存在明确 +/- 增减标注
    const descs = [...document.querySelectorAll('.shop-grid .item .desc, .shop-grid .item .cost')].map(txt);
    const item15 = {
      descCount: descs.length,
      bareMult: descs.filter(t => /[×x]\s*\d/.test(t)).slice(0, 5),
      signed: descs.filter(t => /[+＋]\s*\d|[-−]\s*\d/.test(t)).length,
    };

    // ⑯ 薪资说明：整块触发区（不是窄 span）
    const zone = document.getElementById('wage-help-zone');
    const item16 = {
      exists: !!zone,
      tip: zone?.dataset.tip || '',
      rectW: zone ? +zone.getBoundingClientRect().width.toFixed(1) : 0,
      rectH: zone ? +zone.getBoundingClientRect().height.toFixed(1) : 0,
      cursor: cs(zone)?.cursor,
      hasMark: !!zone?.querySelector('.wage-help-mark'),
      hasStatus: !!zone?.querySelector('#staff-status'),
      hasNativeTitle: zone ? zone.hasAttribute('title') : false,
    };

    // 通用 UI 准确性
    const bodyText = document.body.innerText || '';
    const badText = /undefined|NaN|Infinity/.test(bodyText);
    // 孤字换行只针对「单个 inline 文本元素」：整卡 selectNodeContents 会把 name/desc/cost
    // 三个块各算一个矩形，短数字价格会被误判成孤字（v3.9.0 起的既有范式）。
    const textEls = [...document.querySelectorAll(
      '.shop-grid .item .desc, .shop-grid .item .cost, .shop-grid .item .name span, ' +
      '.ai-action .ai-switch-name, .ai-action .ai-lock-hint, .ai-group-title, .ai-assistant-note')];
    let orphans = 0;
    const orphanDetails = [];
    for (const el of textEls) {
      const range = document.createRange(); range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      if (rects.length > 1 && rects[rects.length - 1].width < 28) {
        orphans++;
        orphanDetails.push({ cls: el.className, text: txt(el).slice(0, 110),
          rects: rects.length, lastW: +rects[rects.length - 1].width.toFixed(1) });
      }
    }
    const btns = [...document.querySelectorAll('#ai-panel button, #shop-list button, #thread-shop button')];
    const smallBtns = btns.filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
    }).length;
    return {
      item1, item2, item4, item14, item15, item16,
      common: { badText, orphans, orphanDetails, smallBtns, buttonCount: btns.length,
        panelErrors: q.panelErrors(), panelCount: q.allPanels().length,
        badTextSample: (bodyText.match(/undefined|NaN|Infinity/g) || []).slice(0, 5) },
    };
  });

  // v3.12.10 ②：1/2/3 级分别显 1/2/3 条触手（完整快照 + finally 恢复）
  const tiers = await page.evaluate(() => {
    const S = window.S, D = window.__gameDirty;
    const deco = document.getElementById('tentacle-deco');
    const saved = S.buildings && S.buildings.abyss_fishbowl;
    const read = () => ({
      display: getComputedStyle(deco).display,
      shown: [...deco.querySelectorAll('.td-arm')]
        .filter(a => getComputedStyle(a).display !== 'none').length,
    });
    const out = [];
    try {
      S.buildings = S.buildings || {};
      for (const lv of [0, 1, 2, 3]) {
        S.buildings.abyss_fishbowl = lv;
        D.all = true; window.__qa.sim.render();
        out.push({ lv, ...read() });
      }
      return { ok: true, out };
    } catch (e) { return { ok: false, reason: String(e).slice(0, 120) }; }
    finally {
      S.buildings.abyss_fishbowl = saved;
      D.all = true; window.__qa.sim.render();
    }
  });

  // v3.12.10 ②：点击条带必须给出可见反馈（静态反馈在无障碍降级模式下同样生效）
  const tapProbe = await page.evaluate(async () => {
    const deco = document.getElementById('tentacle-deco');
    const rim = deco.querySelector('.td-rim');
    const read = () => ({ tap: deco.classList.contains('tap'), filter: getComputedStyle(deco).filter,
      rim: getComputedStyle(rim).stroke, anim: getComputedStyle(deco.querySelector('.td-arm')).animationName });
    const before = read();
    document.getElementById('tentacle-tap-zone').click();
    await new Promise(r => setTimeout(r, 130));
    const during = read();
    await new Promise(r => setTimeout(r, 700));
    const after = read();
    return { before, during, after };
  });

  // hover 后校验自定义气泡（原生 title 已移除，不能双弹窗）
  await page.hover('#wage-help-zone');
  const hoverTip = await page.evaluate(() => {
    const z = document.getElementById('wage-help-zone');
    const c = getComputedStyle(z, '::after');
    return { content: c.content, pointerEvents: c.pointerEvents, maxWidth: c.maxWidth };
  });

  // ⑤⑬ 受控双向矩阵：完整快照 + finally 恢复，不污染自然态（与 30 天脚本同范式）
  const M = await page.evaluate(() => {
    const S = window.S, q = window.__qa, D = window.__gameDirty;
    const restore = (snap) => {
      const saved = JSON.parse(snap);
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, saved);
      for (const k of ['rp', 'reincarn', 'bazaar', 'top', 'prestige']) D[k] = true;
      q.sim.render();
    };
    const starShown = () => !!document.querySelector('#research-upgrade-list [data-rp-fold="star"]');
    let item5 = null, item13 = null;

    // ⑤ 四态（v3.12.9）：无 RP 锚点 → 有锚点但星图未开 → 有深空探测但宠物未解锁 → 四项前置齐备。
    // star 组自带 unlock: { prev:'res', need:4 }，夹具需先备齐该既有前置再单独考察星图维度。
    // 星图 tab 已加「宠物/PT 锚点」硬前置，研究分组读同一谓词，故此处必须显式点亮 PT。
    // v3.12.11 ①：starChartUnlocked 追加「章节 ≥3」硬门控——矩阵统一抬到第 3 章考察星图维度本身；
    // v3.12.7 起 PT 锚点 = 宠物解锁唯一判定源，techOnly 态需显式清零 PT 资源（否则 pt>0 误放行）。
    const snap5 = JSON.stringify(S);
    try {
      const resIds = q.RP_GROUPS.find(g => g.key === 'res').ids.slice(0, 4);
      S.rpTheories = Object.fromEntries(resIds.map(id => [id, 1]));
      S.upgrades = {}; S.tech = {}; S.expeditionsDone = 0; S.expeditions = [];
      S.chapter = '3'; S.pt = 0;
      D.rp = true; q.sim.render();
      const off = starShown();
      S.upgrades = { rp_vault: 1 }; D.rp = true; q.sim.render();
      const anchorOnly = starShown();
      S.tech = { deep_space: true }; D.rp = true; q.sim.render();
      const techOnly = starShown(); // 宠物未解锁（PT=0 且无仓库）：星图仍锁，研究组也不该出现
      S.upgrades = { rp_vault: 1, pt_vault: 1 }; D.rp = true; q.sim.render();
      const both = starShown();
      item5 = { off, anchorOnly, techOnly, both, resLv: resIds.length };
    } finally { restore(snap5); }

    // ⑬ 未买断 → PP 开启卡；真实 DOM 点击 → 扣 PP、模块开启、卡消失、完整模块渲染
    const snap13 = JSON.stringify(S);
    try {
      S.prestige = 1; S.prestigePoints = 8;
      S.moduleUnlocks = { reincarn: false, bazaar: false };
      S.bazaar = { ...(S.bazaar || {}), unlocked: false };
      D.reincarn = true; D.bazaar = true; D.top = true; q.sim.render();
      const before = {
        reincarnCard: !!document.querySelector('#reincarn-panel [data-module-unlock="reincarn"]'),
        bazaarCard: !!document.querySelector('#bazaar-panel [data-module-unlock="bazaar"]'),
        costText: (document.querySelector('#reincarn-panel .module-unlock-card') || {}).innerText || '',
      };
      document.querySelector('#reincarn-panel [data-module-unlock="reincarn"]')?.click();
      D.reincarn = true; D.bazaar = true; D.top = true; q.sim.render();
      const afterReincarn = {
        pp: S.prestigePoints, unlocked: !!(S.moduleUnlocks && S.moduleUnlocks.reincarn),
        cardGone: !document.querySelector('#reincarn-panel [data-module-unlock="reincarn"]'),
        hasContent: (document.getElementById('reincarn-panel').innerText || '').length > 20,
      };
      document.querySelector('#bazaar-panel [data-module-unlock="bazaar"]')?.click();
      D.reincarn = true; D.bazaar = true; D.top = true; q.sim.render();
      const afterBazaar = {
        pp: S.prestigePoints, unlocked: !!(S.bazaar && S.bazaar.unlocked),
        cardGone: !document.querySelector('#bazaar-panel [data-module-unlock="bazaar"]'),
        dealerCards: document.querySelectorAll('#bazaar-panel .shop-grid .item').length,
      };
      item13 = { before, afterReincarn, afterBazaar };
    } finally { restore(snap13); }

    return { item5, item13 };
  });

  console.log('\n=== v3.12.0 六项 UI 反馈专项浏览器验收 ===\n');

  // ①
  const a = R.item1;
  if (a.cards >= 2 && a.cpuLv === 'Lv.0/3' && a.gpuLv === 'Lv.0/2' && a.noPlaceholder)
    ok('① CPU 超频 / GPU 加速在 0 级显示真实名称与 Lv.0/N 上限', `${a.cpuLv} / ${a.gpuLv}`);
  else bad('① 0 级等级展示异常', JSON.stringify(a));

  // ②
  const b = R.item2;
  // v3.12.3 ⑦⑨：分组横幅与锁定卡下线——未解锁的动作不再渲染，面板只剩真实可用的动作卡 + 统一占编步进器
  const want = ['upgrade', 'hire', 'claim'];
  if (want.every(id => b.actionIds.includes(id)) && b.actionIds.length <= 5
      && !b.groups.length && !b.lockedHints.length && b.allSteppers
      && !b.hasLedger && !b.crewHint && /本局已执行/.test(b.headTip))
    ok('② 可用自动化动作按注册表渲染（未解锁不展示、无锁定卡）且统一占编步进器；台账移至悬浮',
      `${b.actionIds.join(',')} / 分组横幅 ${b.groups.length} / 锁定提示 ${b.lockedHints.length} 条`);
  else bad('② AI 面板结构异常', JSON.stringify(b));

  // ④
  const c = R.item4;
  if (c.policyGrids > 0 && c.policyCards > 0 && c.policyStates.length > 0
      && c.bazaarGrids > 0 && c.dealerCards > 0 && c.dealerStates.length > 0 && !c.lockedBazaarCard)
    ok('④ 政策 / 集市均使用 shop-grid 卡面且状态角标显式区分',
      `政策 ${c.policyCards} 卡 / ${[...new Set(c.policyStates)].join('·')}；集市 ${c.dealerCards} 卡 / ${[...new Set(c.dealerStates)].join('·')}`);
  else bad('④ 政策/集市卡片体系异常', JSON.stringify(c));

  // ⑭
  const d = R.item14;
  const h = parseFloat(d.decoH), gh = parseFloat(d.gazeH);
  // v3.12.10 ②：条带压缩到 32px；v3.12.1 ②③：凝视上移为 HUD 徽记（可点击彩蛋 pointer-events:auto），
  // 许愿池改浮窗后右侧留白全部回收
  if (d.cssVar === '32px' && h === 32 && gh > 0 && d.decoPointer === 'none'
      && d.gazePointer === 'auto' && d.appPadRight === '8px' && d.tapZone)
    ok('⑭ 触手独占 32px 底部条带、凝视上移、四列铺满',
      `触手 ${d.decoH}×${d.decoW} / 凝视 ${d.gazeH} / padding-right ${d.appPadRight} / bottom ${d.appPadBottom}`);
  else bad('⑭ 底部动画或页面宽度异常', JSON.stringify(d));

  const tr = tiers.out || [];
  if (tiers.ok && tr.length === 4 && tr[0].display === 'none'
      && tr[1].shown === 1 && tr[2].shown === 2 && tr[3].shown === 3)
    ok('⑭ 鱼缸 1/2/3 级分别显 1/2/3 条触手（0 级整块隐藏）',
      tr.map(x => `Lv.${x.lv}:${x.display === 'none' ? '隐藏' : x.shown + ' 条'}`).join(' / '));
  else bad('⑭ 触手等级显隐矩阵异常', JSON.stringify(tiers));

  const tp = tapProbe;
  if (!tp.before.tap && tp.during.tap && /brightness/.test(tp.during.filter)
      && tp.during.rim !== tp.before.rim && !tp.after.tap)
    ok('⑭ 点击条带有可见反馈（提亮 + 冷光转青，600ms 后复位）',
      `静态 ${tp.before.rim} → 点击 ${tp.during.rim} / ${tp.during.filter.slice(0, 42)}`);
  else bad('⑭ 触手点击反馈异常', JSON.stringify(tp));

  // ⑮
  const e = R.item15;
  if (e.bareMult.length === 0 && e.signed > 0)
    ok('⑮ 全部商店卡面无裸倍率且有明确 +/- 增减标注', `${e.descCount} 条文案 / ${e.signed} 条带符号`);
  else bad('⑮ 卡面文案仍有裸倍率', JSON.stringify(e));

  // ⑯
  const f = R.item16;
  if (f.exists && f.rectW > 160 && f.rectH >= 24 && f.hasMark && f.hasStatus
      && !f.hasNativeTitle && hoverTip.content && hoverTip.content !== 'none')
    ok('⑯ 薪资说明整块触发，悬浮自定义气泡生效且无原生 title 双弹窗',
      `命中区 ${f.rectW}×${f.rectH}px / cursor ${f.cursor}`);
  else bad('⑯ 薪资说明触发区异常', JSON.stringify({ ...f, hoverTip }));

  // ⑤ 星图 / 研究点双门控
  const m5 = M.item5;
  if (m5 && !m5.off && !m5.anchorOnly && !m5.techOnly && m5.both)
    ok('⑤ 星际组需 RP + 宠物 + 星图三级门控（res 组前置已备齐的四态矩阵）',
      `无锚点 ${m5.off} / 无星图 ${m5.anchorOnly} / 无宠物 ${m5.techOnly} / 全开 ${m5.both}`);
  else bad('⑤ 星图研究组门控异常', JSON.stringify(m5));

  // ⑬ 模块买断链路
  const m13 = M.item13;
  if (m13 && m13.before.reincarnCard && m13.before.bazaarCard && /-3 PP/.test(m13.before.costText)
      && m13.afterReincarn.pp === 5 && m13.afterReincarn.unlocked && m13.afterReincarn.cardGone
      && m13.afterReincarn.hasContent && m13.afterBazaar.pp === 0 && m13.afterBazaar.unlocked
      && m13.afterBazaar.cardGone && m13.afterBazaar.dealerCards > 0)
    ok('⑬ 轮回 / 集市首次晋升后可用 PP 买断，真实点击后模块换页生效',
      `PP 8 → 5 → 0 / 轮回内容 ${m13.afterReincarn.hasContent} / 集市 ${m13.afterBazaar.dealerCards} 张交易卡`);
  else bad('⑬ 模块买断链路异常', JSON.stringify(m13));

  // 通用
  const g = R.common;
  if (!g.badText) ok('各面板可见文本无 undefined / NaN / Infinity');
  else bad('面板文本出现非法数值', JSON.stringify(g.badTextSample));
  if (g.orphans === 0) ok('卡片窄行无孤字换行（getClientRects）');
  else bad('存在孤字换行', JSON.stringify(g.orphanDetails));
  if (g.smallBtns === 0) ok('主要面板按钮点击目标均 ≥24×24', `${g.buttonCount} 个按钮`);
  else bad('存在过小的点击目标', `${g.smallBtns} 个`);
  if (g.panelErrors.length === 0) ok('27 个注册面板渲染零异常', `panelCount=${g.panelCount}`);
  else bad('面板渲染异常', JSON.stringify(g.panelErrors));
  if (pageErrors.length === 0) ok('页面无 pageerror');
  else bad('页面抛出异常', JSON.stringify(pageErrors));

  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  if (fail) process.exitCode = 1;
} finally {
  await browser.close();
}
