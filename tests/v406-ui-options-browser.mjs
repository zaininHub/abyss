// v4.0.6 两项反馈专项浏览器验收（真实 DOM / 真实鼠标点击 / computed style / 几何）
//
// 覆盖：
//   ① 潮汐排班是「五个互斥选项」之一，而不是一个可反复开关的按钮：
//      点「潮汐排班」= 选中轮转；再点一次不关闭；点任一条具体策略 = 退出轮转并固定该策略。
//   ② 专注行的购买/升级方式与线程一致：左侧「NEXT 下一级 +N%」、右侧「强化 / 价格」两行按钮；
//      价格只出现在按钮内；整条不再是命中区（点标签不买）；窄列不溢出、按钮不被推走。
//
// 用法：node tests/v406-ui-options-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v406-ui-report.json';
const SHOT = process.env.SHOT || '/tmp/v406-ui.png';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 4, ep: 90000, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  upgrades: { reserve_bin: 12 }, buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 8,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  // 编排解锁（3 任务）且排班预案解锁（8 任务）——预案浮层才有内容可查
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
  await page.setViewport({ width: 1600, height: 1000 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  const readOrch = () => page.evaluate(() => {
    const btn = document.querySelector('[data-orch-auto]');
    const modes = [...document.querySelectorAll('[data-orch-mode]')];
    const rr = n => { const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cy: Math.round(r.y + r.height / 2) }; };
    return {
      auto: !!window.S.orchestration.autoTide,
      mode: window.S.orchestration.mode,
      effective: window.__qa.effectiveModeId(window.S),
      tidePressed: btn.getAttribute('aria-pressed'),
      tideBg: getComputedStyle(btn).borderColor,
      tideRect: rr(btn),
      modes: modes.map(m => ({ id: m.dataset.orchMode, pressed: m.getAttribute('aria-pressed'), disabled: m.disabled, border: getComputedStyle(m).borderColor, ...rr(m) })),
    };
  });

  // ============ ① 潮汐排班 = 第五个选项 ============
  console.log('\n[①] 潮汐排班作为选项之一（互斥单选）');
  const s0 = await readOrch();
  results.orch0 = s0;
  const all = [...s0.modes, s0.tideRect];
  s0.modes.length === 4 ? ok('四种策略按钮齐备', s0.modes.map(m => m.id).join('/')) : bad('策略按钮数量异常', String(s0.modes.length));
  const sameRow = all.every(r => Math.abs(r.cy - s0.tideRect.cy) <= 6);
  sameRow ? ok('潮汐排班与四条策略同一行（第 5 个选项）', `cy ${all.map(r => r.cy).join(',')}`) : bad('潮汐排班未与策略同排', JSON.stringify(all));
  s0.auto === false && s0.tidePressed === 'false' && s0.modes.some(m => m.pressed === 'true')
    ? ok('初始为某条具体策略选中，潮汐未被选中', `mode=${s0.mode} / ${s0.modes.filter(m => m.pressed === 'true').map(m => m.id).join()}`)
    : bad('初始选中态异常', JSON.stringify({ auto: s0.auto, pressed: s0.tidePressed }));

  await page.click('[data-orch-auto]');
  await sleep(220);
  const s1 = await readOrch();
  results.orch1 = s1;
  s1.auto === true && s1.tidePressed === 'true' && s1.modes.every(m => m.pressed === 'false')
    ? ok('点「潮汐排班」= 选中轮转（唯一高亮的选项）', `effective=${s1.effective}`)
    : bad('潮汐排班未被选中', JSON.stringify({ auto: s1.auto, pressed: s1.tidePressed, modes: s1.modes.map(m => m.pressed) }));
  s1.modes.every(m => !m.disabled)
    ? ok('轮转期间策略按钮仍可点（它们就是退出方式）', s1.modes.map(m => m.id).join('/'))
    : bad('策略按钮被置灰，退不出去', JSON.stringify(s1.modes.map(m => [m.id, m.disabled])));

  await page.click('[data-orch-auto]');
  await sleep(220);
  const s2 = await readOrch();
  results.orch2 = s2;
  s2.auto === true && s2.tidePressed === 'true'
    ? ok('再点一次「潮汐排班」不会关闭（不是开关）', `autoTide=${s2.auto}`)
    : bad('潮汐排班被二次点击关闭', JSON.stringify({ auto: s2.auto, pressed: s2.tidePressed }));

  await page.click('[data-orch-mode="output"]');
  await sleep(220);
  const s3 = await readOrch();
  results.orch3 = s3;
  s3.auto === false && s3.mode === 'output' && s3.effective === 'output' && s3.tidePressed === 'false'
    ? ok('点「产能」即退出轮转并固定该策略', `mode=${s3.mode} → effective=${s3.effective}`)
    : bad('选具体策略未退出轮转', JSON.stringify({ auto: s3.auto, mode: s3.mode, eff: s3.effective }));
  const outBtn = s3.modes.find(m => m.id === 'output');
  const balBtn = s3.modes.find(m => m.id === 'balanced');
  outBtn.pressed === 'true' && balBtn.pressed === 'false' && outBtn.border !== balBtn.border
    ? ok('选中态只落在「产能」上（高亮边框）', `产能 ${outBtn.border} / 均衡 ${balBtn.border}`)
    : bad('选中高亮未迁移', JSON.stringify({ out: outBtn, bal: balBtn }));

  await page.click('[data-orch-mode="abyss"]');
  await sleep(220);
  const s4 = await readOrch();
  s4.mode === 'abyss' && s4.effective === 'abyss' ? ok('策略可连续切换（深渊）', s4.effective) : bad('策略切换失败', JSON.stringify(s4.mode));

  // 潮汐预案浮层仍可用：选中潮汐后悬停显示四相位排班表
  await page.click('[data-orch-auto]');
  await sleep(150);
  await page.hover('[data-orch-auto]');
  await sleep(260);
  const pop = await page.evaluate(() => {
    const p = document.querySelector('.tide-sched-pop');
    if (!p) return { visible: false };
    const cs = getComputedStyle(p);
    return { visible: cs.display !== 'none', slots: p.querySelectorAll('[data-orch-slot]').length };
  });
  pop.visible && pop.slots === 16 ? ok('潮汐预案浮层在选中态下仍可展开', `${pop.slots} 槽`) : bad('预案浮层失效', JSON.stringify(pop));

  // ============ ② 专注行：与线程同构 ============
  console.log('\n[②] 专注行的购买与升级方式（对齐线程）');
  await page.mouse.move(4, 4);
  await sleep(200);
  const focus0 = await page.evaluate(() => {
    const bar = document.getElementById('focus-bar');
    const btn = document.getElementById('focus-buy');
    const cost = document.getElementById('focus-cost');
    const prev = document.getElementById('focus-preview');
    const lv = document.getElementById('focus-lv');
    const rr = n => { const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), cy: Math.round(r.y + r.height / 2), bottom: Math.round(r.bottom) }; };
    return {
      barText: bar.textContent.replace(/\s+/g, ' ').trim(),
      btnLines: btn.innerText.split('\n').map(s => s.trim()).filter(Boolean),
      btnChildren: btn.children.length, btn: rr(btn),
      costInsideBtn: btn.contains(cost), costText: cost.textContent.trim(),
      prevText: prev.textContent.replace(/\s+/g, ' ').trim(), prev: rr(prev),
      lvText: lv.textContent.trim(), bar: rr(bar),
      tip: bar.dataset.tip || '',
      disabled: btn.disabled, poor: btn.classList.contains('poor'),
      focusLevel: window.S.focusLevel, ep: window.S.ep,
    };
  });
  results.focus0 = focus0;
  focus0.btnChildren === 2 && focus0.btnLines[0] === '强化' && /\d/.test(focus0.btnLines[1] || '')
    ? ok('专注按钮为「强化 / 价格」两行', focus0.btnLines.join(' | '))
    : bad('专注按钮结构不符', JSON.stringify(focus0.btnLines));
  focus0.costInsideBtn ? ok('价格只出现在按钮内', focus0.costText) : bad('价格不在按钮内', String(focus0.costInsideBtn));
  /NEXT/.test(focus0.prevText) && /线程产出 \+\d+%/.test(focus0.prevText)
    ? ok('NEXT 显示「线程产出 +N%」', focus0.prevText)
    : bad('NEXT 文案缺失', focus0.prevText);
  !/EP/.test(focus0.prevText) && !/\d+(\.\d+)?K/.test(focus0.prevText)
    ? ok('NEXT 行不重复价签', focus0.prevText)
    : bad('NEXT 仍带价格', focus0.prevText);
  /^Lv\.\d+$/.test(focus0.lvText) ? ok('等级只写 Lv.N（不再与加成挤在一起）', focus0.lvText) : bad('等级文案异常', focus0.lvText);
  focus0.prev.right <= focus0.btn.x + 1 && Math.abs(focus0.prev.cy - focus0.btn.cy) <= 10
    ? ok('NEXT 位于按钮左侧同一行', `prev.right=${focus0.prev.right} ≤ btn.x=${focus0.btn.x}`)
    : bad('NEXT 与按钮位置不对', JSON.stringify({ prev: focus0.prev, btn: focus0.btn }));
  focus0.btn.w >= 24 && focus0.btn.h >= 24 ? ok('按钮点击目标足够大', `${focus0.btn.w}×${focus0.btn.h}`) : bad('按钮过小', JSON.stringify(focus0.btn));
  // v4.0.8 反馈③：专注悬浮说明删除——NEXT 就地写明「线程产出+N%」，价格在按钮内，不再有 data-tip
  !focus0.tip ? ok('v4.0.8：专注悬浮说明已删除（NEXT 就地自明）', '') : bad('专注 data-tip 残留', focus0.tip);

  // 真实点击「强化」→ 等级 +1、EP 按旧价扣减
  const payBefore = await page.evaluate(() => ({ ep: window.S.ep, lv: window.S.focusLevel, price: Number(document.getElementById('focus-cost').textContent.replace(/[^\d.]/g, '')) }));
  await page.click('#focus-buy');
  await sleep(300);
  const payAfter = await page.evaluate(() => ({ ep: window.S.ep, lv: window.S.focusLevel, cost: document.getElementById('focus-cost').textContent.trim() }));
  payAfter.lv === payBefore.lv + 1
    ? ok('真实点击「强化」提升一级', `Lv.${payBefore.lv} → Lv.${payAfter.lv}`)
    : bad('点击未提升等级', JSON.stringify({ payBefore, payAfter }));
  payAfter.ep < payBefore.ep ? ok('扣费生效', `${Math.round(payBefore.ep)} → ${Math.round(payAfter.ep)}` + `（按钮价 ${payAfter.cost}）`) : bad('未扣费', JSON.stringify(payAfter));

  // 行内标签不再是命中区：点「专注等级」文字不买
  const beforeLabelClick = await page.evaluate(() => window.S.focusLevel);
  await page.click('#focus-lv');
  await sleep(220);
  const afterLabelClick = await page.evaluate(() => window.S.focusLevel);
  afterLabelClick === beforeLabelClick
    ? ok('点行内标签不再触发购买（购入口径收进按钮）', `Lv.${afterLabelClick}`)
    : bad('行内仍可误触购买', `${beforeLabelClick} → ${afterLabelClick}`);

  // 买不起：按钮 disabled + 价格转黄
  const poor = await page.evaluate(() => {
    window.S.ep = 0;
    const D = window.__gameDirty; for (const k of Object.keys(D || {})) D[k] = true;
    window.__qa.sim.render();
    const btn = document.getElementById('focus-buy');
    const cost = document.getElementById('focus-cost');
    return { disabled: btn.disabled, poor: btn.classList.contains('poor'), color: getComputedStyle(cost).color };
  });
  poor.disabled && poor.poor ? ok('EP 不足时按钮置灰且价格转黄', poor.color) : bad('买不起态未提示', JSON.stringify(poor));

  // 窄列 380px：不溢出、NEXT 与按钮仍同行、按钮不被推走
  await page.evaluate(() => { window.S.ep = 90000; });
  await page.setViewport({ width: 380, height: 880 });
  await sleep(400);
  const narrow = await page.evaluate(() => {
    const bar = document.getElementById('focus-bar');
    const btn = document.getElementById('focus-buy');
    const prev = document.getElementById('focus-preview');
    const rr = n => { const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), cy: Math.round(r.y + r.height / 2) }; };
    return {
      overflow: bar.scrollWidth - bar.clientWidth,
      bar: rr(bar), btn: rr(btn), prev: rr(prev),
      prevLines: Math.round(prev.getBoundingClientRect().height / parseFloat(getComputedStyle(prev).lineHeight || '15')),
    };
  });
  results.narrow = narrow;
  narrow.overflow <= 1 ? ok('380px 窄列无横向溢出', `overflow ${narrow.overflow}px`) : bad('窄列溢出', `${narrow.overflow}px`);
  narrow.btn.right <= narrow.bar.right + 1 && Math.abs(narrow.prev.cy - narrow.btn.cy) <= 12
    ? ok('窄列下 NEXT 与按钮仍同行且不出界', `btn.right=${narrow.btn.right} ≤ bar.right=${narrow.bar.right}`)
    : bad('窄列排版异常', JSON.stringify(narrow));

  // v4.0.8 反馈③：专注气泡删除——改为断言「薪资彩色气泡（同一处 CSS 体系）」四皮肤对比度
  await page.setViewport({ width: 1600, height: 1000 });
  await sleep(300);
  const contrast = await page.evaluate(() => {
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
      const pop = document.getElementById('wage-tip-pop');
      // 气泡本体：底色 vs 默认字色；四个语义色行逐一对底色断言
      const bg = parse(getComputedStyle(pop).backgroundColor);
      const ratios = { base: ratio(parse(getComputedStyle(pop).color), bg) };
      for (const cls of ['w-good', 'w-warn', 'w-orange', 'w-bad']) {
        ratios[cls] = ratio(parse(getComputedStyle(pop.querySelector('.' + cls)).color), bg);
      }
      out[theme] = Math.round(Math.min(...Object.values(ratios)) * 10) / 10;
    }
    document.documentElement.classList.remove('theme-light', 'theme-mint', 'theme-autumn');
    return out;
  });
  Object.values(contrast).every(v => v >= 4.5)
    ? ok('薪资彩色气泡四套皮肤对比度达标（最差色行）', Object.entries(contrast).map(([k, v]) => `${k} ${v}:1`).join(' · '))
    : bad('薪资气泡对比度不足', JSON.stringify(contrast));
  results.contrast = contrast;

  await page.mouse.move(4, 4);
  await sleep(200);
  await page.screenshot({ path: SHOT, clip: { x: 320, y: 150, width: 400, height: 260 } }).catch(() => {});

  errs.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errs.join(' | '));
  results.errors = errs;

  await import('node:fs').then(fs => fs.writeFileSync(REPORT, JSON.stringify(results, null, 2)));
} finally {
  await browser.close();
}
console.log(`\n========== v4.0.6 UI 专项：${pass} / ${fail} ==========`);
if (fail) process.exitCode = 1;
