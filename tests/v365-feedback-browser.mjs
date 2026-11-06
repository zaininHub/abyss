// v3.6.5 定向回归（智能分配优化 5 项反馈）：
// ① 探采线程 ≤ 载具升级数量 ② 研究点线程 ≤ 灵感工坊数量 ③ PT 线程 ≤ 孵化工坊数量
// ④ 先保证每个模块有人，都满员后转超线程 ⑤ 新线程优先补空闲岗位（且不重排已在岗/手动空闲）
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const PROFS = ['prospector', 'distiller', 'keeper', 'acolyte', 'overseer', 'slacker'];
const cultists = (n = 10) => Array.from({ length: n }, (_, i) => ({
  id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60,
  profession: PROFS[i % PROFS.length], hiredAt: Date.now() - 60000, earned: 0,
}));
const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: cultists(), faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
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

// ---- ①②③ 容量口径 = 对应设施数量 ----
{
  const page = await boot(browser, mkSave());
  const r = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    window.S.upgrades = { scooter: 2, convoy: 1, orbital: 0, submersible: 0, atrium: 2 };
    window.S.ptAutoHatch = true; window.S.ptHatchLv = 2;
    window.S.religion = { temple: 3 };
    return {
      vehicles: qa.converterCapacity('vehicles'),
      atrium: qa.converterCapacity('atrium'),
      hatch: qa.converterCapacity('hatch'),
      temple: qa.converterCapacity('temple'),
      hyper: qa.converterCapacity('hyper') === Infinity, // Infinity 经 JSON 会变 null，页面内先判布尔
    };
  });
  if (r.vehicles === 3) ok('① 探采容量 = 所有载具升级数量之和（2+1+0+0）', `${r.vehicles}`);
  else bad('① 探采容量口径不对', JSON.stringify(r));
  if (r.atrium === 2) ok('② 研究点容量 = 灵感工坊数量（级数 2）', `${r.atrium}`);
  else bad('② 工坊容量口径不对', JSON.stringify(r));
  if (r.hatch === 2) ok('③ PT 容量 = 异兽孵化工坊数量（级数 2）', `${r.hatch}`);
  else bad('③ 孵化容量口径不对', JSON.stringify(r));
  if (r.temple === 3 && r.hyper === true) ok('③ 同口径扩展到圣所（等级 3），超线程无上限', `temple=${r.temple}`);
  else bad('③ 圣所/超线程容量异常', JSON.stringify(r));

  // 未解锁时不该凭空产生容量
  const locked = await page.evaluate(() => {
    window.S.ptAutoHatch = false; window.S.religion = null;
    return { hatch: window.__qa.threadBind.converterCapacity('hatch'), temple: window.__qa.threadBind.converterCapacity('temple') };
  });
  if (locked.hatch === 0 && locked.temple === 0) ok('①②③ 未解锁模块容量为 0（不会分配线程）', JSON.stringify(locked));
  else bad('①②③ 未解锁模块仍有容量', JSON.stringify(locked));
  await page.close();
}

// ---- ④ 容量约束 + 先保证每个模块有人 + 满员后转超线程 ----
{
  const page = await boot(browser, mkSave({ cultists: cultists(20) }));
  const r = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    window.S.upgrades = { scooter: 1, convoy: 1, orbital: 1, submersible: 1, atrium: 2 };
    window.S.ptAutoHatch = true; window.S.ptHatchLv = 2;
    window.S.religion = { temple: 3 };
    window.S.cultists.forEach(c => { c.boundTo = null; });
    const changed = qa.autoAssignThreads();
    const load = {};
    for (const t of ['vehicles', 'atrium', 'hatch', 'temple', 'hyper']) load[t] = qa.converterLoad(t);
    const cap = {};
    for (const t of ['vehicles', 'atrium', 'hatch', 'temple']) cap[t] = qa.converterCapacity(t);
    return { changed, load, cap, total: window.S.cultists.length };
  });
  const keys = ['vehicles', 'atrium', 'hatch', 'temple'];
  if (keys.every(t => r.load[t] <= r.cap[t])) ok('①~④ 智能分配不超任何岗位容量', JSON.stringify(r.load));
  else bad('①~④ 存在超容量分配', JSON.stringify(r));
  if (keys.every(t => r.load[t] === r.cap[t] && r.load[t] > 0)) ok('④ 线程充足时每个模块都有人且被填满', JSON.stringify(r.load));
  else bad('④ 模块未填满', JSON.stringify(r));
  const capSum = keys.reduce((a, t) => a + r.cap[t], 0);
  if (r.load.hyper === r.total - capSum) ok('④ 所有模块满员后，其余线程全部转入超线程', `hyper=${r.load.hyper}/${r.total - capSum}`);
  else bad('④ 溢出线程未全部转超线程', JSON.stringify(r));

  // v3.7.3 反馈①：下拉与筛选按钮只列岗位名，不再附「在岗/容量」数字
  await page.evaluate(() => { window.__qa.threadBind.autoAssignThreads(); });
  await sleep(1200); // 班组面板由 tick 按秒渲染
  const ui = await page.evaluate(() => {
    const p = document.getElementById('crew-panel');
    return {
      txt: p ? p.textContent : '',
      opts: p ? [...p.querySelectorAll('select[data-bind] option')].map(o => o.textContent) : [],
      filters: p ? [...p.querySelectorAll('[data-crew-filter-btn]')].map(b => b.textContent) : [],
    };
  });
  const noRatio = [...ui.opts, ...ui.filters].every(s => !/\d+\s*\/\s*\d+/.test(s));
  if (noRatio && !ui.txt.includes('在岗/可容纳')) ok('①~③ 班组不再展示岗位「在岗/容量」数字（v3.7.3 ①）');
  else bad('①~③ 仍展示容量数字', JSON.stringify(ui).slice(0, 200));

  // 线程少于模块数：优先保证「每个模块各 1 条」，而不是堆到同一模块
  const few = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    window.S.cultists = window.S.cultists.slice(0, 3);
    window.S.cultists.forEach(c => { c.boundTo = null; });
    qa.autoAssignThreads();
    return {
      load: Object.fromEntries(['vehicles', 'atrium', 'hatch', 'temple'].map(t => [t, qa.converterLoad(t)])),
      hyper: qa.converterLoad('hyper'),
    };
  });
  const covered = Object.values(few.load).filter(n => n > 0).length;
  if (covered === 3 && Object.values(few.load).every(n => n <= 1) && few.hyper === 0) ok('④ 线程不足时优先铺满各模块（3 条 → 3 个模块各 1 条）', JSON.stringify(few));
  else bad('④ 未优先保证每个模块有人', JSON.stringify(few));
  await page.close();
}

// ---- ⑤ 优先安排空闲线程 → 再纠正错位；v3.7.2 起手动超线程会被优先拉回资源岗位；容量不被突破 ----
{
  const page = await boot(browser, mkSave({ cultists: cultists(5) }));
  const r = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    window.S.upgrades = { scooter: 1, atrium: 1 };
    window.S.ptAutoHatch = true; window.S.ptHatchLv = 1;
    window.S.religion = { temple: 1 };
    const c = window.S.cultists;
    c[0].boundTo = 'hyper';     // 手动超线程
    c[1].boundTo = 'hatch';     // 错位：蒸馏师被绑在孵化
    c[2].boundTo = null;        // 空闲
    c[3].boundTo = null;        // 空闲
    c[4].boundTo = null;        // 空闲（领导者）
    const changed = qa.autoAssignThreads();
    const load = Object.fromEntries(['vehicles', 'atrium', 'hatch', 'temple'].map(t => [t, qa.converterLoad(t)]));
    return { changed, bound: c.map(x => x.boundTo), load, capTotal: 4 };
  });
  if (r.bound[1] === 'atrium') ok('⑤ 智能分配仍会纠正错位岗位（蒸馏师 → 灵感工坊）', JSON.stringify(r.bound));
  else bad('⑤ 错位岗位未被纠正', JSON.stringify(r));
  // v3.7.2 反馈④：资源岗位容量优先填满，手动设定的超线程也会被拉回来补岗位
  if (r.bound[0] !== 'hyper' && r.bound.filter(x => x !== 'hyper').length === r.capTotal) ok('⑤ 手动设定的超线程被优先拉回资源岗位（容量填满后才轮到超线程）', JSON.stringify(r.bound));
  else bad('⑤ 资源岗位未优先填满', JSON.stringify(r));
  if (Object.values(r.load).every((n, i) => n <= 1) && Object.values(r.load).reduce((a, b) => a + b, 0) === r.capTotal) ok('⑤ 四个模块各按容量 1 条填满，无超容量', JSON.stringify(r.load));
  else bad('⑤ 容量被突破或模块未填满', JSON.stringify(r));
  await page.close();
}

// ---- ⑤ 新线程招募后优先补空缺岗位，且不打扰手动空闲线程 ----
{
  const page = await boot(browser, mkSave());
  const r = await page.evaluate(() => {
    const qa = window.__qa.threadBind;
    window.S.upgrades = { scooter: 1, atrium: 1 };
    const c = window.S.cultists;
    c[0].boundTo = 'vehicles';
    for (let i = 1; i < c.length - 1; i++) c[i].boundTo = 'hyper';
    c[c.length - 1].boundTo = null; // 玩家手动留空的线程
    const before = c.map(x => x.boundTo);
    window.S.ep = 1e15;            // 保证招募得起（hireCultist 只比对 S.ep）
    const hire = document.getElementById('hire-btn');
    hire.disabled = false; // 欠薪/EP 状态下 UI 会禁用按钮，本用例只验证招募后的安置接线
    hire.click();
    const after = window.S.cultists.map(x => x.boundTo);
    return {
      n0: before.length, n1: after.length,
      newcomer: after[after.length - 1],
      untouched: before.slice(0, -1).every((v, i) => after[i] === v),
      manualIdleKept: after[before.length - 1] === null,
      feed: (window.S.crewFeed || []).slice(-1)[0]?.msg || '',
    };
  });
  if (r.n1 === r.n0 + 1 && r.newcomer === 'atrium') ok('⑤ 新线程优先补「尚无人」的空闲岗位（灵感工坊）', `newcomer=${r.newcomer}`);
  else bad('⑤ 新线程未补空缺岗位', JSON.stringify(r));
  if (r.untouched && r.manualIdleKept) ok('⑤ 只安置新线程：已在岗与手动空闲均未被动', '');
  else bad('⑤ 招募触发了全量重排', JSON.stringify(r));
  if (/自动安置至/.test(r.feed)) ok('⑤ 招募流水写明自动安置岗位', r.feed.slice(-30));
  else bad('⑤ 招募流水未说明安置', r.feed);

  // 所有模块都满员 → 新线程转入超线程
  const full = await page.evaluate(() => {
    window.S.upgrades = { scooter: 1, atrium: 1 };
    window.S.cultists.forEach(c => { c.boundTo = null; });
    window.__qa.threadBind.autoAssignThreads();
    window.S.ep = 1e15;
    const hire = document.getElementById('hire-btn');
    hire.disabled = false; // 欠薪/EP 状态下 UI 会禁用按钮，本用例只验证招募后的安置接线
    hire.click();
    return { newcomer: window.S.cultists[window.S.cultists.length - 1].boundTo, atrium: window.__qa.threadBind.converterLoad('atrium'), vehicles: window.__qa.threadBind.converterLoad('vehicles') };
  });
  if (full.newcomer === 'hyper' && full.atrium <= 1 && full.vehicles <= 1) ok('④ 模块都满员时，新线程直接转入超线程且容量不被突破', JSON.stringify(full));
  else bad('④ 满员后新线程分配异常', JSON.stringify(full));

  // 无任何模块解锁时的既有语义（v3.6.4 ③ 防回归）
  const none = await page.evaluate(() => {
    window.S.upgrades = {};
    window.S.cultists.forEach(c => { c.boundTo = null; });
    const changed = window.__qa.threadBind.autoAssignThreads();
    return { changed, allHyper: window.S.cultists.every(c => c.boundTo === 'hyper') };
  });
  if (none.allHyper && none.changed > 0) ok('防回归：未解锁任何模块时智能分配统一转入超线程', `${none.changed} 条`);
  else bad('防回归：开局智能分配失效', JSON.stringify(none));
  await page.close();
}

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
