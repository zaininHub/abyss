// v3.7.3 六项反馈 · 真实 Chrome 浏览器回归（DOM 测量 + 点击 + 无 pageerror）
//
// ① 班组下拉/筛选按钮不再展示岗位「在岗/容量」x/x。
// ② 未解锁的自动转化快捷开关不展示（整块面板隐藏），解锁后才出现且可点。
// ③ 班组领导卡不再展示「不占岗位」文案，且仍无岗位下拉。
// ④ 任务面板高度刚好放下 3 张任务卡（246px），第 4 张起内部滚动。
// ⑤ 未到 P3 晋升节点时整块晋升模块隐藏，到节点后即时出现。
// ⑥ 载具不再增加 EP 产出，载具协议改作用于 DM 采集速率。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const PROFS = ['prospector', 'distiller', 'keeper', 'acolyte', 'overseer', 'slacker'];
const crew = (n = 10, over = () => ({})) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, name: 'T' + (i + 1), output: 5, mood: '正常', moodTimer: 60, level: 1, xp: 0,
  leader: false, boundTo: null,
  profession: PROFS[i % PROFS.length], hiredAt: Date.now() - 60000, earned: 0, ...over(i),
}));
const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default', ep: 1e6, rp: 0, es: 0, dm: 0, pt: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: crew(), faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(), startedAt: Date.now(),
  ...over,
});

const errs = [];
async function boot(browser, save) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});

try {
  // ================= ① 班组不再展示 x/x =================
  console.log('\n[1] 反馈① 班组岗位不再附「在岗/容量」');
  {
    const page = await boot(browser, mkSave({ upgrades: { scooter: 2, atrium: 2 } }));
    const r = await page.evaluate(() => {
      const p = document.getElementById('crew-panel');
      return {
        opts: p ? [...p.querySelectorAll('select[data-bind] option')].map(o => o.textContent) : [],
        filters: p ? [...p.querySelectorAll('[data-crew-filter-btn]')].map(b => b.textContent) : [],
        txt: p ? p.textContent : '',
        hasPanel: !!p,
      };
    });
    const noRatio = [...r.opts, ...r.filters].every(s => !/\d+\s*\/\s*\d+/.test(s));
    if (r.hasPanel && r.opts.some(o => o.includes('探采平台')) && noRatio && !r.txt.includes('在岗/可容纳'))
      ok('① 下拉与筛选按钮只列岗位名，无 x/x 数字', `选项 ${r.opts.length} 项 / 筛选 ${r.filters.length} 项`);
    else bad('① 仍展示容量数字', JSON.stringify(r).slice(0, 260));
    await page.close();
  }

  // ================= ② 自动转化解锁后才出现 =================
  console.log('\n[2] 反馈② 未解锁的自动转化不展示');
  {
    const page = await boot(browser, mkSave());
    const locked = await page.evaluate(() => ({
      display: document.getElementById('quick-switches-panel')?.style.display,
      count: document.querySelectorAll('#quick-switches [data-qs]').length,
      lockBtns: document.querySelectorAll('#quick-switches [data-qs-lock]').length,
    }));
    if (locked.display === 'none' && locked.count === 0 && locked.lockBtns === 0)
      ok('② 全未解锁时整块面板隐藏、无灰显占位', JSON.stringify(locked));
    else bad('② 未解锁仍占位', JSON.stringify(locked));

    const unlocked = await page.evaluate(async () => {
      window.S.upgrades.atrium = 1;
      window.__gameDirty.top = true;
      await new Promise(r => setTimeout(r, 900));
      const btn = document.querySelector('#quick-switches [data-qs="atrium"]');
      const before = btn?.textContent || '';
      btn?.click();
      await new Promise(r => setTimeout(r, 400));
      const after = document.querySelector('#quick-switches [data-qs="atrium"]')?.textContent || '';
      return {
        display: document.getElementById('quick-switches-panel')?.style.display,
        found: !!btn, before, after,
        otherLocked: document.querySelectorAll('#quick-switches [data-qs-lock]').length,
      };
    });
    if (unlocked.display === '' && unlocked.found && unlocked.before !== unlocked.after && unlocked.otherLocked === 0)
      ok('② 解锁后只出现对应开关且点击生效', `${unlocked.before.trim()} → ${unlocked.after.trim()}`);
    else bad('② 解锁后开关异常', JSON.stringify(unlocked));
    await page.close();
  }

  // ================= ③ 领导文案 =================
  console.log('\n[3] 反馈③ 班组不再展示领导「不占岗位」文案');
  {
    const page = await boot(browser, mkSave({ cultists: crew(10, i => ({ leader: i === 0 })) }));
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#crew-panel .crew-card')];
      const leader = cards.find(c => c.textContent.includes('★领导'));
      return {
        leaderText: leader?.textContent.replace(/\s+/g, ' ').trim() || '',
        leaderHasSelect: !!leader?.querySelector('select[data-bind]'),
        leaderHasBtn: !!leader?.querySelector('[data-leader]'),
        normalSelects: document.querySelectorAll('#crew-panel select[data-bind]').length,
        help: document.querySelector('#crew-panel .crew-help')?.textContent || '',
      };
    });
    if (r.leaderText && !r.leaderHasSelect && r.leaderHasBtn && !/不占岗位|全局加成 ·/.test(r.leaderText))
      ok('③ 领导卡保留★领导/取消按钮，无下拉、无「不占岗位」文案');
    else bad('③ 领导卡仍展示旧文案', JSON.stringify(r).slice(0, 220));
    if (r.normalSelects === 9 && !r.help.includes('不占岗位')) ok('③ 普通线程下拉仍 9 个，说明行同步');
    else bad('③ 班组说明/下拉异常', JSON.stringify(r).slice(0, 220));
    await page.close();
  }

  // ================= ④ 任务面板高度 =================
  console.log('\n[4] 反馈④ 任务面板刚好放下 3 个任务');
  {
    const page = await boot(browser, mkSave());
    const measure = (n) => page.evaluate(async (count) => {
      const mk = i => ({ name: '任务' + i, desc: '短描述', goal: 1e9, progress: 0,
        deadline: Date.now() + 3600000, reward: { kind: 'ep', amount: 1000 }, status: 'active' });
      window.S.projects = Array.from({ length: count }, (_, i) => mk(i + 1));
      window.__gameDirty.projects = true;
      await new Promise(r => setTimeout(r, 600));
      const host = document.getElementById('projects');
      const hb = host.getBoundingClientRect();
      const cards = [...host.querySelectorAll('.proj')];
      return {
        n: cards.length, client: host.clientHeight, scroll: host.scrollHeight,
        css: getComputedStyle(host).height,
        thirdBottom: cards[2] ? +(cards[2].getBoundingClientRect().bottom - hb.top).toFixed(1) : -1,
      };
    }, n);
    const three = await measure(3);
    if (three.n === 3 && three.client === 246 && three.scroll <= three.client + 1 && three.thirdBottom <= 246.5)
      ok('④ 3 张卡刚好放下、无滚动条', JSON.stringify(three));
    else bad('④ 3 张卡高度不符', JSON.stringify(three));
    const four = await measure(4);
    if (four.n === 4 && four.client === 246 && four.scroll > four.client) ok('④ 第 4 张起内部滚动', JSON.stringify(four));
    else bad('④ 溢出未滚动', JSON.stringify(four));
    await page.close();
  }

  // ================= ⑤ 晋升模块 P3 门控 =================
  console.log('\n[5] 反馈⑤ 未到晋升节点不展示晋升模块');
  {
    const page = await boot(browser, mkSave({ startedAt: Date.now() }));
    const locked = await page.evaluate(() => ({
      visible: window.__qa.prestigePanelVisible(),
      display: document.getElementById('tab-prestige')?.style.display,
      hasNeed: !!document.getElementById('prg-need'),
    }));
    if (locked.visible === false && locked.display === 'none') ok('⑤ 新档（<1 天）整块晋升模块隐藏', JSON.stringify(locked));
    else bad('⑤ 未到节点仍展示', JSON.stringify(locked));

    const opened = await page.evaluate(async () => {
      window.S.startedAt = Date.now() - 1.1 * 86400000;
      window.__gameDirty.top = true; window.__gameDirty.prestige = true;
      await new Promise(r => setTimeout(r, 900));
      return {
        visible: window.__qa.prestigePanelVisible(),
        display: document.getElementById('tab-prestige')?.style.display,
        need: document.getElementById('prg-need')?.textContent || '',
        btn: !!document.getElementById('prestige-btn'),
      };
    });
    if (opened.visible === true && opened.display !== 'none' && opened.btn && opened.need)
      ok('⑤ 到达 P3 后即时出现进度条与晋升按钮', `需求 ${opened.need}`);
    else bad('⑤ 到节点后未出现', JSON.stringify(opened));
    await page.close();

    // 老玩家存档（已进入 P3）加载首屏即展示；无 startedAt 的旧档由 state 层补为加载时刻，按新档计时（既有口径）
    const old = await boot(browser, mkSave({ startedAt: Date.now() - 2 * 86400000 }));
    const legacy = await old.evaluate(() => ({
      visible: window.__qa.prestigePanelVisible(),
      display: document.getElementById('tab-prestige')?.style.display,
      ageDays: +((Date.now() - window.S.startedAt) / 86400000).toFixed(2),
    }));
    if (legacy.visible === true && legacy.display !== 'none') ok('⑤ 老玩家存档加载首屏即展示晋升模块', `游玩 ${legacy.ageDays} 天`);
    else bad('⑤ 老玩家存档异常', JSON.stringify(legacy));
    await old.close();
  }

  // ================= ⑥ 载具不增加 EP =================
  console.log('\n[6] 反馈⑥ 载具只消耗 EP 换 DM');
  {
    const page = await boot(browser, mkSave({ upgrades: { scribble: 10 }, ep: 1e12 }));
    const r = await page.evaluate(async () => {
      const before = window.__qa.computeCps();
      const partsBefore = window.__qa.cpsBreakdown().join('|');
      window.S.upgrades.scooter = 5;
      window.S.upgrades.convoy = 2;
      await new Promise(r => setTimeout(r, 400));
      const after = window.__qa.computeCps();
      const parts = window.__qa.cpsBreakdown();
      const tip = document.getElementById('h-cps')?.closest('.stat')?.dataset.tip || '';
      const m0 = window.__qa.vehicleRateMult();
      window.S.upgrades.dmprotocol = 1;
      const m1 = window.__qa.vehicleRateMult();
      const dm0 = window.__qa.vehicleDmPerMin();
      return {
        before, after, partsBefore, parts: parts.join('|'), tip,
        ratio: m1 / m0, dm: dm0,
        vehCps: window.__qa.UPGRADES.filter(u => window.__qa.BALANCE.vehicles.ids.includes(u.id)).map(u => u.cps),
      };
    });
    if (Math.abs(r.after - r.before) < 1e-6 && !r.parts.includes('载具产出') && !r.tip.includes('载具产出'))
      ok('⑥ 买 7 辆载具 CPS 不变、来源明细不含「载具产出」', `${r.before.toFixed(2)} → ${r.after.toFixed(2)}`);
    else bad('⑥ 载具仍抬高 EP 产出', JSON.stringify(r).slice(0, 260));
    if (r.vehCps.length === 4 && r.vehCps.every(v => v === 0)) ok('⑥ 四辆载具 cps 恒 0');
    else bad('⑥ 数据层仍有 EP 产出', JSON.stringify(r.vehCps));
    if (Math.abs(r.ratio - 1.5) < 1e-9 && r.dm > 0) ok('⑥ 载具协议 ×1.5 落在 DM 采集速率', `DM/min ${r.dm.toFixed(3)}`);
    else bad('⑥ 协议乘区异常', JSON.stringify({ ratio: r.ratio, dm: r.dm }));
    await page.close();
  }

  // ================= 全局无异常 =================
  if (errs.length === 0) ok('全局：无 pageerror / console error');
  else bad('全局存在运行时错误', errs.slice(0, 3).join(' | '));

} finally {
  await browser.close();
}
console.log(`\n[v3.7.3 浏览器回归] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
