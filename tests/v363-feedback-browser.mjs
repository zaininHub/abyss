// v3.6.3 定向回归（6 项反馈）：① EP 上限与线程解耦 ② 超线程岗位 ③ 岗位按解锁展示
// ④ 线程卡改版（图标/去贡献/去岗位文本） ⑤ 小屏系统按钮不漂移 ⑥ 历史断言清理（见既有套件）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const CHROME = chromePath(); // v3.12.5：统一走 _chrome.mjs（原硬编码 /usr/local/bin/chromium 在 Win/mac 直接启动失败）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const cultists = (n = 10) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60,
  profession: 'prospector', hiredAt: Date.now() - 60000, earned: 0,
}));
const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default', ep: 5e5, rp: 0, es: 0, dm: 0,
  upgrades: { storage: 12 }, buildings: {}, tech: {}, cultists: cultists(), faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: true,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(), ...over,
});

async function boot(browser, save, width = 1600, height = 1000) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', e => { throw new Error('pageerror: ' + String(e).slice(0, 200)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1300);
  return page;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

// ---- ① EP 上限与线程数量/状态完全无关 ----
{
  const page = await boot(browser, mkSave());
  const r = await page.evaluate(() => {
    const cap = () => window.__qa.epStorageCap();
    window.S._rpOverflowSeen = true;
    const base = cap();
    const snap = { base };
    window.S.cultists = []; snap.empty = cap();
    window.S.cultists = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, name: 'X' + i, output: 999, mood: '超频', moodTimer: 60, profession: 'prospector' }));
    snap.many = cap();
    window.S.lazySince = Date.now() - 1e6; snap.lazy = cap();
    window.S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 120, bufferSec: 0, loseTimer: 0, transition: 0 };
    snap.dormant = cap();
    window.S.collapsed = true; snap.collapsed = cap();
    window.S.collapsed = false; window.S.lazySince = null;
    window.S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0, transition: 0 };
    window.S.cultists = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60, profession: 'prospector' }));
    const beforeBuy = cap();
    window.S.upgrades.storage += 1; snap.afterBuy = cap();
    window.S.upgrades.storage -= 1;
    window.S._rpOverflowSeen = false; snap.noOverflow = cap();
    window.S._rpOverflowSeen = true;
    return { ...snap, beforeBuy };
  });
  const all = ['empty', 'many', 'lazy', 'dormant', 'collapsed'];
  if (all.every(k => r[k] === r.base)) ok('① 线程数/心情/懒惰/休眠/吞噬变更均不改 EP 上限', `cap=${r.base}`);
  else bad('① EP 上限仍受线程影响', JSON.stringify(r));
  if (r.afterBuy > r.beforeBuy) ok('① 结构性扩容仍真实叠加生效', `${r.beforeBuy} → ${r.afterBuy}`);
  else bad('① 扩容失效', JSON.stringify(r));
  if (Math.abs(r.base / r.noOverflow - 4) < 0.02) ok('① 首次溢出后按结构性上限 ×4（不读 cps）', `ratio=${(r.base / r.noOverflow).toFixed(3)}`);
  else bad('① 溢出倍数异常', `ratio=${(r.base / r.noOverflow).toFixed(3)}`);
  await page.close();
}

// ---- ②③④：新档（无其它模块解锁）班组 ----
{
  const page = await boot(browser, mkSave());
  const initial = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    const sel = document.querySelector('#crew-panel select[data-bind]');
    const opts = sel ? [...sel.options].map(o => o.value) : [];
    const filters = [...document.querySelectorAll('[data-crew-filter-btn]')].map(b => b.dataset.crewFilterBtn || 'all');
    const help = document.querySelector('#crew-panel .crew-help')?.textContent || '';
    const cards = [...document.querySelectorAll('#crew-panel .crew-card')].filter(e => !e.classList.contains('more'));
    return {
      unlocked: qa.unlockedConverterIds(),
      opts, filters, help,
      cardCount: cards.length,
      affinities: cards.map(c => c.querySelector('.crew-affinity')?.getAttribute('title') || ''),
      text: document.getElementById('crew-panel')?.innerText || '',
      attrCount: document.querySelectorAll('#crew-panel select[data-bind]').length,
      qsLockedAtrium: !!document.querySelector('#quick-switches [data-qs-lock="atrium"]'),
      qsCount: document.querySelectorAll('#quick-switches [data-qs]').length,
      qsPanelHidden: document.getElementById('quick-switches-panel')?.style.display === 'none',
    };
  });
  if (initial.unlocked.length === 1 && initial.unlocked[0] === 'hyper') ok('② 超线程无需解锁任何模块即可分配', initial.unlocked.join(','));
  else bad('② 超线程未恒解锁', JSON.stringify(initial.unlocked));
  if (JSON.stringify(initial.opts) === JSON.stringify(['', 'hyper'])) ok('③ 未解锁时下拉只有「空闲 + 超线程」', initial.opts.join('|'));
  else bad('③ 下拉展示了未解锁岗位', initial.opts.join('|'));
  if (JSON.stringify(initial.filters) === JSON.stringify(['all', 'free', 'hyper'])) ok('③ 岗位筛选按钮同样只列已解锁岗位', initial.filters.join('|'));
  else bad('③ 筛选按钮泄漏未解锁岗位', initial.filters.join('|'));
  if (!/探采平台|灵感工坊|异兽孵化|信仰圣所/.test(initial.help)) ok('③ 说明行不点名未解锁岗位', initial.help.slice(0, 50));
  else bad('③ 说明行仍写未解锁岗位', initial.help.slice(0, 80));
  if (!initial.qsLockedAtrium && initial.qsCount === 0 && initial.qsPanelHidden) ok('③ 未解锁的自动转化开关不展示、整块面板隐藏（v3.7.3 ②）');
  else bad('③ 自动转化面板显隐异常', JSON.stringify(initial));

  // ④ 卡面
  if (!initial.text.includes('贡献') && !initial.text.includes('岗位：')) ok('④ 卡面不显示贡献累计 / 所处岗位', initial.text.slice(0, 60).replace(/\n/g, ' '));
  else bad('④ 卡面仍有贡献或岗位文本', initial.text.slice(0, 120).replace(/\n/g, ' '));
  if (!initial.text.includes('勘探员')) ok('④ 卡面不写职业名（只留图标）');
  else bad('④ 卡面仍写职业名');
  if (initial.cardCount > 0 && initial.affinities.length === initial.cardCount && initial.affinities.every(t => /探采平台|领导|怠惰|擅长|无/.test(t))) ok('④ 每条线程用图标区分擅长岗位（title 可读）', `${initial.cardCount} 张卡`);
  else bad('④ 擅长岗位图标缺失', JSON.stringify(initial.affinities));
  if (initial.attrCount === initial.cardCount) ok('④ 岗位切换下拉框仍保留', `${initial.attrCount} 个`);
  else bad('④ 下拉框丢失', `${initial.attrCount}/${initial.cardCount}`);

  // ② 超线程 +10% 产出 / +10% 消耗（全员分配时精确成立）
  const hyper = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    const c = window.S.cultists[0];
    const out0 = window.__qa.staffOutputPerSec(), sal0 = window.__qa.staffSalaryPerSec();
    qa.bindThread(c, 'hyper');
    const fOut = qa.threadBindOutputFactor(c), fSal = qa.threadBindSalaryFactor(c);
    window.S.cultists.forEach(x => qa.bindThread(x, 'hyper'));
    const outAll = window.__qa.staffOutputPerSec(), salAll = window.__qa.staffSalaryPerSec();
    return { fOut, fSal, outR: outAll / out0, salR: salAll / sal0, bound: c.boundTo, boostHyper: qa.converterThreadBoost('hyper') };
  });
  if (Math.abs(hyper.fOut - 1.1) < 1e-6 && Math.abs(hyper.fSal - 1.1) < 1e-6) ok('② 超线程系数：产出 ×1.1 / 消耗 ×1.1', `${hyper.fOut}/${hyper.fSal}`);
  else bad('② 超线程系数不对', JSON.stringify(hyper));
  if (Math.abs(hyper.outR - 1.1) < 0.001 && Math.abs(hyper.salR - 1.1) < 0.001) ok('② 全员超线程：班组产出与薪资同步 +10%（无双重计数）', `out=${hyper.outR.toFixed(3)} sal=${hyper.salR.toFixed(3)}`);
  else bad('② 产出/消耗增幅不等或双重计数', JSON.stringify(hyper));
  if (hyper.boostHyper === 1) ok('② 超线程不参与转化器产出加成');
  else bad('② 超线程错误地加成转化器', String(hyper.boostHyper));

  // v3.6.4 ③：一个模块都没解锁时，智能分配改为把空闲线程统一转入超线程（点击必有反馈）；
  //   手动设置的超线程仍保留；解锁岗位后的重排由 v364 ③ 覆盖。
  const auto = await page.evaluate(() => {
    window.S.cultists.forEach(c => { c.boundTo = null; });
    window.S.cultists[0].boundTo = 'hyper';
    window.__qa.threadBind.autoAssignThreads();
    return { hyperKept: window.S.cultists[0].boundTo, autoHyper: window.S.cultists.slice(1).filter(c => c.boundTo === 'hyper').length };
  });
  if (auto.hyperKept === 'hyper' && auto.autoHyper === 9) ok('② 未解锁模块时智能分配统一转入超线程，手动超线程保留', JSON.stringify(auto));
  else bad('② 智能分配处理超线程异常', JSON.stringify(auto));

  // ③ 解锁全部模块后岗位全部出现
  await page.evaluate(() => {
    window.S.cultists.forEach(c => { c.boundTo = null; });
    window.S.upgrades.atrium = 1;
    window.S.upgrades.scooter = 1;
    window.S.ptAutoHatch = true;
    window.S.religion = { ...(window.S.religion || {}), unlocked: true, temple: 1 };
    window.__gameDirty.crew = true; window.__gameDirty.shop = true;
  });
  await sleep(1500);
  const unlocked = await page.evaluate(() => {
    const sel = document.querySelector('#crew-panel select[data-bind]');
    return {
      ids: window.__qa.threadBind.unlockedConverterIds(),
      opts: sel ? [...sel.options].map(o => o.value) : [],
      qsAtrium: !!document.querySelector('#quick-switches [data-qs="atrium"]'),
    };
  });
  const expected = ['hyper', 'vehicles', 'atrium', 'hatch', 'temple'];
  if (expected.every(t => unlocked.ids.includes(t)) && expected.every(t => unlocked.opts.includes(t))) ok('③ 模块解锁后对应岗位出现在下拉', unlocked.opts.join('|'));
  else bad('③ 解锁后岗位未出现', JSON.stringify(unlocked));
  if (unlocked.qsAtrium) ok('③ 解锁后快捷开关同步转为可用');
  else bad('③ 快捷开关未同步', '');
  await page.close();
}

// ---- ⑤ 小屏系统按钮 / 弹框不出屏 ----
{
  for (const w of [1600, 900, 768, 480, 375, 320]) {
    const page = await boot(browser, mkSave(), w, 760);
    const r = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const ids = ['pauseBtn', 'btn-wiki', 'save-menu-btn'];
      const btns = {};
      for (const id of ids) {
        const el = document.getElementById(id), b = el.getBoundingClientRect();
        const top = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
        btns[id] = { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), bt: Math.round(b.bottom), clickable: !!(top && (top === el || el.contains(top))) };
      }
      const stat = document.querySelector('.topbar .stat')?.getBoundingClientRect();
      const boxes = {};
      for (const id of ['pause-modal', 'wiki-modal', 'snap-modal']) {
        const m = document.getElementById(id);
        if (m) m.style.display = 'flex';
        const b = m?.querySelector('.modal-box')?.getBoundingClientRect();
        boxes[id] = b ? { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), bt: Math.round(b.bottom) } : null;
        if (m) m.style.display = 'none';
      }
      return { vw, vh, btns, boxes, statTop: stat ? Math.round(stat.top) : null, docW: document.documentElement.scrollWidth };
    });
    const off = Object.entries(r.btns).filter(([, b]) => b.r > r.vw + 1 || b.l < -1 || b.t < -1 || b.bt > r.vh + 1).map(([k]) => k);
    const notClickable = Object.entries(r.btns).filter(([, b]) => !b.clickable).map(([k]) => k);
    if (!off.length && !notClickable.length) ok(`⑤ ${w}px：暂停/Wiki/存档三按钮全在视口内且可点击`, `docW=${r.docW}`);
    else bad(`⑤ ${w}px：按钮漂移或被遮挡`, `off=${off} notClickable=${notClickable} ${JSON.stringify(r.btns)}`);
    if (w <= 899 && r.statTop !== null) {
      // v3.12.5 ①：系统按钮行改挂剧情栏右侧（不再 fixed 覆盖顶栏），三个按钮底边应在资源行之下
      const maxBtnBottom = Math.max(...Object.values(r.btns).map(b => b.bt));
      if (maxBtnBottom > r.statTop - 2) ok(`⑤ ${w}px：按钮不与顶栏资源行重叠`, `btnBottom=${maxBtnBottom} statTop=${r.statTop}`);
      else bad(`⑤ ${w}px：按钮压住顶栏资源`, `btnBottom=${maxBtnBottom} statTop=${r.statTop}`);
    }
    const boxOff = Object.entries(r.boxes).filter(([, b]) => b && (b.l < -1 || b.r > r.vw + 1)).map(([k]) => k);
    if (!boxOff.length && Object.values(r.boxes).every(Boolean)) ok(`⑤ ${w}px：暂停/Wiki/存档管理弹框均在视口内`);
    else bad(`⑤ ${w}px：弹框出屏`, `off=${boxOff} ${JSON.stringify(r.boxes)}`);
    await page.close();
  }
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
await browser.close();
if (fail) process.exit(1);
