// v4.2.8 反馈专项（真实浏览器）：班组卡片三行重构 + 科技树标题精简 + 研究点门控收紧
//
// 覆盖（用户 2026-11-18 六项反馈中的 UI 项）：
//   ① 状态图标悬浮显示岗位/超线程/心情/领导完整状态（title 承载）
//   ② 产出/消耗单式 +X EP/s -Y EP/s；岗位下拉与晋升领导独立成行
//   ③ 擅长岗位只留图标（.crew-aff-label 文字删除，名称入 title）
//   ④ 科技树页头「· 当前 N RP」删除（顶栏同口径）
//   ⑤ 研究点：DM 锚点未完成时星尘精炼不渲染（载具购入后出现）——浏览器行为验证
//   ⑥ 大模块 tab 按解锁顺序从左往右排列（解锁章序：shop/tech/rp ch1 → bazaar 首晋升 →
//      pets ch2 → expedition ch3 → religion ch4 → rift ch5 → policy ch7 → relics ch9 → delve ch11）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GAME_URL = 'file://' + ROOT + 'dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const seed = {
  _version: 6, chapter: '7', storyline: 'default',
  ep: 2e6, rp: 5000, es: 60, dm: 0, pt: 100, faith: 20,
  upgrades: { canteen: 1, heater: 1, datacenter: 1, atrium: 1, cpu: 1, gpu: 1 }, // 注意：无 scooter（DM 锚点未完成）
  buildings: {}, tech: { ai_core: true, click_up: true, offline1: true, focus_opt: true, entropy_reduce: true, deep_space: true },
  cultists: [], prestige: 10, prestigePoints: 10, _crewUnlocked: true,
  milesDone: { 100: true, 1000: true, 10000: true, 100000: true },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, es: true, dm: true, pt: true, faith: true },
  lastSeen: Date.now(), startTime: Date.now(),
};
for (let i = 0; i < 15; i++) {
  seed.cultists.push({ id: 'c' + i, name: '线程' + String.fromCharCode(65 + i), mood: ['超频', '优化', '高效', '正常'][i % 4],
    profession: 'worker', level: 10, output: 8, boundTo: i < 12 ? 'hyper' : '', leader: false });
}
seed.rpTheories = { rp_entropy: 4, rp_wage: 4 }; // 组链：prod 4 级 → 深渊协议组显形

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-zygote'] });
const pageErrors = [];
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
page.on('pageerror', e => pageErrors.push(String(e)));
await page.evaluateOnNewDocument((raw) => { localStorage.setItem('abyss_idle_v2', raw); }, JSON.stringify(seed));
await page.goto(GAME_URL, { waitUntil: 'load' });
await sleep(1600);
await page.evaluate(() => { window.__qa && window.__qa.sim && window.__qa.sim.render(); });

try {
  // ---- ①②③ 班组卡片三行结构 ----
  const crew = await page.evaluate(() => {
    const card = document.querySelector('.crew-card:not(.more)');
    if (!card) return { missing: true };
    const avatar = card.querySelector('.crew-avatar');
    const idLine = card.querySelector('.crew-line-id');
    const numLine = card.querySelector('.crew-line-num');
    const actLine = card.querySelector('.crew-line-act');
    const numText = numLine ? numLine.textContent.replace(/\s+/g, ' ').trim() : '';
    // ② 数值行与操作行分别一行
    const numRect = numLine && numLine.getBoundingClientRect();
    const actRect = actLine && actLine.getBoundingClientRect();
    const sel = actLine && actLine.querySelector('select[data-bind]');
    const btn = actLine && actLine.querySelector('[data-leader]');
    // ② 下拉与按钮同行（y 中点接近）
    const sameRow = sel && btn ? Math.abs((sel.getBoundingClientRect().top) - (btn.getBoundingClientRect().top)) < 8 : null;
    return {
      missing: false,
      lines: card.querySelectorAll('.crew-line').length,
      has3: !!(idLine && numLine && actLine),
      avatarTip: avatar ? (avatar.getAttribute('title') || '') : '',
      signedFmt: /^\+[\d.,]+ EP\/s -[\d.,]+ EP\/s$/.test(numText),
      numText,
      actSameRow: sameRow,
      hasSel: !!sel, hasBtn: !!btn,
      affLabel: !!card.querySelector('.crew-aff-label'),
      affinity: !!card.querySelector('.crew-affinity'),
      rowOrder: numRect && actRect ? numRect.top < actRect.top : null,
    };
  });
  if (crew.missing) bad('① 班组卡片缺失', JSON.stringify(crew));
  else {
    crew.has3 && crew.lines === 3 ? ok('①②③ 卡片三行结构（身份/数值/操作）', `crew-line ×${crew.lines}`) : bad('① 三行结构不符', JSON.stringify(crew));
    crew.avatarTip && /超线程|空闲/.test(crew.avatarTip) && /Lv\./.test(crew.avatarTip)
      ? ok('① 头像悬浮含岗位/心情/Lv 完整状态', crew.avatarTip)
      : bad('① 悬浮状态不全', crew.avatarTip);
    crew.signedFmt ? ok('② 产出/消耗单式（+X EP/s -Y EP/s）', crew.numText) : bad('② 数值行文案不符', crew.numText);
    crew.hasSel && crew.hasBtn && crew.actSameRow ? ok('② 岗位下拉与晋升领导同行') : bad('② 下拉/按钮不同行', JSON.stringify({ hasSel: crew.hasSel, hasBtn: crew.hasBtn, actSameRow: crew.actSameRow }));
    !crew.affLabel && crew.affinity ? ok('③ 岗位只留图标（文字标签已删）') : bad('③ 文字标签仍在或图标缺失', JSON.stringify({ affLabel: crew.affLabel, affinity: crew.affinity }));
    crew.rowOrder ? ok('② 数值行在操作行之上') : bad('② 行序错乱', String(crew.rowOrder));
  }

  // ---- ④ 科技树页头 ----
  await page.evaluate(() => { window.__qa.sim.switchTab('tech'); });
  await sleep(400);
  const techH = await page.evaluate(() => {
    const h3 = document.querySelector('#tab-tech h3');
    return { text: h3 ? h3.textContent.trim() : '', hasTechRp: !!document.getElementById('tech-rp') };
  });
  techH.text === '科技树' && !techH.hasTechRp ? ok('④ 科技树页头仅「科技树」（N RP 文案已删）', techH.text) : bad('④ 页头文案不符', JSON.stringify(techH));

  // ---- ⑥ 大模块 tab 解锁顺序排列 ----
  const tabOrder = await page.evaluate(() =>
    [...document.querySelectorAll('.tabs button')].map(b => b.id).filter(id => !['btn-prestige', 'btn-achievement', 'btn-offline', 'btn-storyline'].includes(id)));
  const WANT_ORDER = ['btn-shop', 'btn-tech', 'btn-rp', 'btn-bazaar', 'btn-pets', 'btn-expedition',
    'btn-religion', 'btn-rift-tab', 'btn-policy', 'btn-relics', 'btn-delve'];
  JSON.stringify(tabOrder) === JSON.stringify(WANT_ORDER)
    ? ok('⑥ 大模块 tab 按解锁顺序排列', tabOrder.map(x => x.replace('btn-', '')).join(' → '))
    : bad('⑥ tab 顺序不符', tabOrder.join(','));

  // ---- ⑤ 研究点门控：DM 锚点未完成 → rp_dm 不渲染；种 scooter → 当帧渲染 ----
  await page.evaluate(() => { window.__qa.sim.switchTab('rp'); });
  await sleep(400);
  const rpBefore = await page.evaluate(() => ({
    hasDm: !!document.querySelector('[data-research="rp_dm"]'),
    hasWage: !!document.querySelector('[data-research="rp_wage"]'),
  }));
  rpBefore.hasWage && !rpBefore.hasDm ? ok('⑤ DM 锚点未完成时星尘精炼不渲染') : bad('⑤ 门控未生效', JSON.stringify(rpBefore));
  // 载具购入 → 置 RP 面板脏（帧系统 1s 周期内消费）→ 等 modSig 变化触发重建
  await page.evaluate(() => {
    window.S.upgrades = Object.assign({}, window.S.upgrades, { scooter: 1 });
    window.__gameDirty.rp = true;
    window.__qa.sim.render();
  });
  await sleep(1400);
  const rpAfter = await page.evaluate(() => ({ hasDm: !!document.querySelector('[data-research="rp_dm"]') }));
  rpAfter.hasDm ? ok('⑤ 载具购入当帧星尘精炼出现') : bad('⑤ 解锁后仍不渲染', JSON.stringify(rpAfter));

  pageErrors.length === 0 ? ok('0 pageerror') : bad(`pageerror × ${pageErrors.length}`, pageErrors.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n结果：${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
