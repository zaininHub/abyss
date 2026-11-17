// v4.0.3 三项反馈 UI 专项浏览器验收（真实 DOM / 真实鼠标点击 / computed style / 几何）
//
// 覆盖：
//   ① 自动购建：面板不再有 5/10/30/60s 档位与「下次购建 Xs」倒计时；节拍与自动升级一致（每决策周期结算），
//      真实等待一个决策周期后建筑确实 +1（不是只改文案）。
//   ② 快照：删除按钮真实可点（历史上 focusin 重渲染把按钮在 mousedown/mouseup 之间删掉 → click 不派发）；
//      导入 / 导出 / 删除三条链路可用；容量上限 3，已满时保存走「覆盖最早」二级确认。
//   ③ 线程状态：四态收成小角标（只留状态名），NEXT 行不再被挤成省略号；悬浮说明 position:fixed、
//      完全落在视口内（不再被祖先 overflow 裁掉首行）。
//
// 用法：node tests/v403-ui-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v403-ui-report.json';
const SHOT = process.env.SHOT || '/tmp/v403-ui.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

// 种子存档：只给「产品可达的解锁态」——AI 核心 + 全资源点解锁 + 自动购建已激活 + 1 名助手绑到购建
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 4, ep: 1e12, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  upgrades: { reserve_bin: 20 }, buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: [
    { id: 1, name: '外勤干员 A', mood: '正常', profession: 'acolyte', level: 1, boundTo: '' },
    { id: 2, name: '外勤干员 B', mood: '正常', profession: 'acolyte', level: 1, boundTo: '' },
    { id: 3, name: '外勤干员 C', mood: '正常', profession: 'acolyte', level: 1, boundTo: '' },
  ],
  tech: { ai_core: true },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  ai: { reserve: 0, timer: 0, autoBuild: true, autoBuildUnlocked: true, assistants: 3, crew: { build: 1 }, actionCounts: {} },
  prestige: 1, prestigePoints: 0, projectsDone: 1,
  lastSeen: Date.now(), startTime: Date.now(),
});
const mkSnaps = () => JSON.stringify([0, 1, 2].map(i => ({
  id: 'snap_seed_' + i, name: '快照 ' + (i + 1), time: Date.now() - i * 60000,
  data: JSON.stringify({ _version: 6, ep: 1000 * (i + 1), prestige: i, chapter: 1 }),
})));

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
  await page.evaluateOnNewDocument((s, sn) => {
    localStorage.setItem('abyss_idle_v2', s);
    localStorage.setItem('abyss_idle_v2_snapshots', sn);
  }, mkSave(), mkSnaps());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1600);

  // ============ ① 自动购建：无时间档位 / 无倒计时 / 与自动升级同节拍 ============
  console.log('\n[①] 自动购建节拍');
  const buildCard = await page.evaluate(() => {
    const panel = document.getElementById('ai-panel');
    const card = panel.querySelector('[data-ai-action="build"]');
    return {
      cardExists: !!card,
      cardText: card ? card.innerText : '',
      rateBtns: panel.querySelectorAll('[data-ai-build-rate]').length,
      panelHasCountdown: panel.innerText.includes('下次购建'),
      crewText: (card && card.querySelector('[data-ai-crew-count="build"]')?.textContent) || '',
    };
  });
  buildCard.cardExists ? ok('自动购建卡已渲染') : bad('自动购建卡缺失');
  buildCard.rateBtns === 0 ? ok('秒数档位按钮已移除', `实测 ${buildCard.rateBtns} 个`) : bad('仍残留秒数档位按钮', `count=${buildCard.rateBtns}`);
  !buildCard.panelHasCountdown ? ok('面板无「下次购建 Xs」倒计时') : bad('倒计时文案仍在');
  buildCard.crewText.startsWith('1') ? ok('占编步进器显示 1 名助手', buildCard.crewText) : bad('占编显示异常', buildCard.crewText);

  // 真实等待一个决策周期（基础 5s），验证「确实在这个节拍上买」
  const snap = () => page.evaluate(() => ({
    counts: (window.S.ai.actionCounts || {}).build || 0,
    lv: Object.values(window.S.buildings || {}).reduce((a, b) => a + b, 0),
    timer: window.S.ai.timer,
    ep: window.S.ep,
    cap: window.__qa.epStorageCap(),
  }));
  const t0 = await snap();
  let t1 = t0;
  // 以「相对增量」判定：首帧可能已经跑完一个周期（机器快慢不同），只要之后还在增长即证明节拍在跑
  for (let i = 0; i < 20 && t1.counts <= t0.counts; i++) { await sleep(1000); t1 = await snap(); }
  t1.counts > t0.counts
    ? ok('一个决策周期内自动购建真实执行', `actionCounts.build ${t0.counts} → ${t1.counts}`)
    : bad('决策周期内未执行购建', `actionCounts.build 仍为 ${t1.counts}`);
  t1.lv > t0.lv ? ok('建筑等级真实增长', `总等级 ${t0.lv} → ${t1.lv}`) : bad('建筑等级未增长', `${t0.lv} → ${t1.lv}`);
  results.build = { ...buildCard, t0, t1 };

  // ============ ② 快照：删除真实生效 + 导入/导出 + 容量 3 ============
  console.log('\n[②] 快照存档');
  await page.evaluate(() => {
    window.__dl = [];
    const proto = HTMLAnchorElement.prototype;
    const orig = proto.click;
    proto.click = function () { if (this.download) window.__dl.push(this.download); return orig.call(this); };
    // 导入入口：拦截隐藏 file input 的 click，仅记录（不弹系统文件框）
    const fileEl = document.getElementById('import-file');
    window.__fileOpened = 0;
    const oc = fileEl.click.bind(fileEl);
    fileEl.click = () => { window.__fileOpened++; };
    void oc;
  });
  await page.hover('#save-menu-btn');
  await sleep(400);
  const listInfo = await page.evaluate(() => ({
    rows: document.querySelectorAll('#save-list [data-snap]').length,
    label: (document.getElementById('save-count') || {}).textContent,
  }));
  listInfo.rows === 3 ? ok('种子 3 个快照全部列出') : bad('快照行数异常', String(listInfo.rows));
  listInfo.label === '3/3' ? ok('容量角标显示 3/3') : bad('容量角标异常', String(listInfo.label));

  // 真实鼠标点击「删除」（历史 bug：mousedown 时列表被重建，click 根本不派发）
  const delBox = await page.evaluate(() => {
    const b = document.querySelector('#save-list [data-snap] .snap-del');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(delBox.x, delBox.y);
  await sleep(400);
  const confirm1 = await page.evaluate(() => ({
    display: document.getElementById('confirm-modal').style.display,
    title: document.getElementById('confirm-title').textContent,
  }));
  confirm1.display === 'flex' ? ok('删除弹出二次确认', confirm1.title) : bad('删除未弹确认框', JSON.stringify(confirm1));
  await page.evaluate(() => document.getElementById('confirm-ok').click());
  await sleep(500);
  const afterDel = await page.evaluate(() => ({
    ids: JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').map(s => s.id),
    rows: document.querySelectorAll('#save-list [data-snap]').length,
    label: (document.getElementById('save-count') || {}).textContent,
  }));
  afterDel.ids.length === 2 ? ok('删除真实落盘', `剩 ${afterDel.ids.length} 个：${afterDel.ids.join(',')}`) : bad('删除未生效', JSON.stringify(afterDel.ids));
  afterDel.rows === 2 && afterDel.label === '2/3' ? ok('列表与容量角标同步刷新', afterDel.label) : bad('列表未同步', `rows=${afterDel.rows} label=${afterDel.label}`);

  // 覆盖（同一处 click 派发路径的另一个动作；不刷新页面，便于断言）
  await page.hover('#save-menu-btn');
  await sleep(300);
  const ovBox = await page.evaluate(() => {
    const b = document.querySelector('#save-list [data-snap] .snap-overwrite');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.closest('[data-snap]').dataset.snap };
  });
  const ovBefore = await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]');
    return l[0] ? l[0].time : 0;
  });
  await sleep(1100); // 拉开时间戳，确保覆盖后 time 必然变化
  await page.mouse.click(ovBox.x, ovBox.y);
  await sleep(350);
  await page.evaluate(() => document.getElementById('confirm-ok').click());
  await sleep(400);
  const ovAfter = await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]');
    return { time: l[0] ? l[0].time : 0, n: l.length };
  });
  ovAfter.time > ovBefore && ovAfter.n === 2
    ? ok('覆盖按钮真实生效（时间戳刷新、槽位不变）', `${ovBefore} → ${ovAfter.time}`)
    : bad('覆盖未生效', JSON.stringify({ ovBefore, ovAfter }));

  // 导出
  await page.hover('#save-menu-btn');
  await sleep(300);
  const expBox = await page.evaluate(() => {
    const b = document.querySelector('#save-list [data-snap] .snap-export');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(expBox.x, expBox.y);
  await sleep(300);
  const dls = await page.evaluate(() => window.__dl);
  dls.length === 1 && /^abyss_save_snap_seed_\d\.json$/.test(dls[0])
    ? ok('导出下载真实触发', dls[0])
    : bad('导出未触发下载', JSON.stringify(dls));

  // 导入入口（隐藏 file input 复用）
  const impInfo = await page.evaluate(() => {
    document.getElementById('import-btn2').click();
    return { opened: window.__fileOpened, mode: typeof window.S === 'object' };
  });
  impInfo.opened === 1 ? ok('导入入口唤起文件选择器') : bad('导入入口无效', JSON.stringify(impInfo));

  // 容量上限：补满到 3 后再保存 → 走「覆盖最早」二次确认
  const SNAP_MAX = 3; // 与 src/modules/snapshots.js 的 SNAP_MAX 一致（单测另有不变量校验）
  await page.evaluate(() => { document.getElementById('save-new').click(); });
  await sleep(500);
  const filled = await page.evaluate(() => ({
    n: JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').length,
    label: (document.getElementById('save-count') || {}).textContent,
  }));
  filled.n === SNAP_MAX ? ok('保存补满到上限', `${filled.label}`) : bad('未补满到上限', JSON.stringify(filled));
  // v4.2.0 反馈④（v4.2.3 同步测试口径）：满槽后「+ 新建」直接灰显，不再弹「覆盖最早」确认——
  //   弹窗会静默覆盖玩家旧档，用户要的是禁用。断言改为「按钮 disabled 且不弹确认」。
  await page.evaluate(() => { document.getElementById('save-new').click(); });
  await sleep(400);
  const capConfirm = await page.evaluate(() => ({
    display: document.getElementById('confirm-modal').style.display,
    title: document.getElementById('confirm-title').textContent,
    disabled: document.getElementById('save-new').disabled,
  }));
  capConfirm.disabled && capConfirm.display !== 'flex'
    ? ok('已满时「+ 新建」灰显且不弹覆盖确认（v4.2.0 口径）', `disabled=${capConfirm.disabled}`)
    : bad('满槽新建行为不符', JSON.stringify(capConfirm));
  await page.evaluate(() => document.getElementById('confirm-cancel').click());
  await sleep(200);
  const stillMax = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').length);
  stillMax === SNAP_MAX ? ok('取消覆盖后容量不变', String(stillMax)) : bad('取消后容量被改动', String(stillMax));
  results.snapshot = { listInfo, afterDel, dls, filled, capConfirm };

  // ============ ③ 线程状态角标 + 悬浮说明不被遮挡 ============
  console.log('\n[③] 线程状态角标 / 悬浮说明');
  // 造「懒惰」态（旧实现最长文案，最易挤掉 NEXT）
  const badge = await page.evaluate(() => {
    const S = window.S;
    S.lazySince = Date.now() - 120000;
    const D = window.__gameDirty; for (const k of Object.keys(D || {})) D[k] = true;
    window.__qa.sim.render();
    const st = document.getElementById('staff-status');
    const prev = document.getElementById('staff-preview');
    const r = st.getBoundingClientRect();
    return {
      text: st.textContent,
      width: Math.round(r.width),
      height: Math.round(r.height),
      color: getComputedStyle(st).color,
      radius: getComputedStyle(st).borderRadius,
      prevTruncated: prev.scrollWidth > prev.clientWidth + 1,
      prevText: prev.textContent,
      rowWidth: Math.round(document.getElementById('wage-help-zone').getBoundingClientRect().width),
    };
  });
  badge.text === '懒惰' ? ok('角标只留状态名', `「${badge.text}」${badge.width}×${badge.height}`) : bad('角标文案过长', badge.text);
  badge.width <= 60 ? ok('角标宽度紧凑', `${badge.width}px`) : bad('角标仍过宽', `${badge.width}px`);
  /px$/.test(badge.radius) && parseFloat(badge.radius) >= 8 ? ok('角标为胶囊圆角', badge.radius) : bad('角标圆角异常', badge.radius);
  !badge.prevTruncated ? ok('NEXT 行未被截断', badge.prevText) : bad('NEXT 行仍被省略', badge.prevText);

  // 悬浮说明：v4.0.8 反馈② 改彩色 DOM 气泡（#wage-tip-pop）——
  // fixed 定位 / rect 写坐标 / 首行内容 / 显隐四断言全部迁移到新 DOM 上
  await page.hover('#wage-help-zone');
  await sleep(350);
  const tip = await page.evaluate(() => {
    const zone = document.getElementById('wage-help-zone');
    const pop = document.getElementById('wage-tip-pop');
    if (!pop) return { missing: true };
    const cs = getComputedStyle(pop);
    return {
      position: cs.position,
      zIndex: cs.zIndex,
      left: parseFloat(cs.left),
      top: parseFloat(cs.top),
      transform: cs.transform,
      content: pop.textContent || '',
      tipX: pop.style.getPropertyValue('--tip-x'),
      tipY: pop.style.getPropertyValue('--tip-y'),
      shown: cs.display !== 'none',
      below: pop.classList.contains('tip-below'),
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  tip.missing ? bad('彩色气泡 DOM 缺失', 'wage-tip-pop') : (() => {
    tip.position === 'fixed' ? ok('悬浮说明 position:fixed（DOM 气泡）', `z-index=${tip.zIndex}`) : bad('仍是会被裁剪的定位方式', tip.position);
    tip.tipX && tip.tipY ? ok('按本行 rect 实时写入坐标', `x=${tip.tipX} y=${tip.tipY}${tip.below ? ' · 已翻到下方' : ' · 在行上方'}`) : bad('未写入定位变量', JSON.stringify({ x: tip.tipX, y: tip.tipY }));
    (tip.left >= 0 && tip.left <= tip.vw - 40) ? ok('气泡水平位置在视口内', `left=${tip.left}`) : bad('气泡水平溢出视口', `left=${tip.left}`);
    (tip.top >= 0 && tip.top <= tip.vh) ? ok('气泡锚点垂直在视口内', `top=${tip.top} / vh=${tip.vh}`) : bad('气泡垂直溢出视口', `top=${tip.top}`);
    // v4.2.3 反馈①：标题由「线程薪资状态（当前：…）」精简为「当前：…」
    /当前：/.test(tip.content) ? ok('气泡首行内容存在（未被裁掉）', tip.content.slice(0, 24)) : bad('气泡内容缺失', tip.content.slice(0, 60));
  })();

  // 气泡配色随主题（浅色主题此前是「深字压深底」）——四语义色逐一对底色，取最差
  const contrast = await page.evaluate(() => {
    const parse = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = rgb => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const out = {};
    for (const theme of ['abyss', 'light']) {
      document.documentElement.classList.remove('theme-light', 'theme-mint', 'theme-autumn');
      if (theme === 'light') document.documentElement.classList.add('theme-light');
      const pop = document.getElementById('wage-tip-pop');
      const bg = parse(getComputedStyle(pop).backgroundColor);
      const ratios = { base: ratio(parse(getComputedStyle(pop).color), bg) };
      // v4.2.3：文案精简后 .w-bad 可能缺席——只对实际存在的语义类取样（避免 querySelector 为 null 抛错）
      // 只取四个语义色（w-dim 是弱化说明色，本就低于正文对比度，不属断言范围）
      for (const cls of ['w-good', 'w-warn', 'w-orange', 'w-bad']) {
        const el = pop.querySelector('.' + cls);
        if (el) ratios[cls] = ratio(parse(getComputedStyle(el).color), bg);
      }
      out[theme] = Math.round(Math.min(...Object.values(ratios)) * 10) / 10;
    }
    document.documentElement.classList.remove('theme-light');
    return out;
  });
  contrast.abyss >= 4.5 && contrast.light >= 4.5
    ? ok('气泡文字对比度达标（暗夜 / 浅色，最差色行）', `暗夜 ${contrast.abyss}:1 · 浅色 ${contrast.light}:1`)
    : bad('气泡文字对比度不足', JSON.stringify(contrast));
  results.contrast = contrast;
  results.badge = badge; results.tip = tip;

  await page.screenshot({ path: SHOT, fullPage: false });
  results.pageErrors = errs;
  errs.length === 0 ? ok('全程 0 个页面错误') : bad('出现页面错误', errs.join(' | '));

  writeFileSync(REPORT, JSON.stringify({ pass, fail, results }, null, 2));
  console.log(`\nREPORT ${REPORT} | 截图 ${SHOT}`);
} catch (e) {
  fail++;
  console.error('运行异常:', e && e.stack || e);
} finally {
  await browser.close();
}
console.log(`\n===== v4.0.3 UI 专项：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
