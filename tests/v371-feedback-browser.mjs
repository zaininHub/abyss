// v3.7.1 两项反馈 · 真实 Chrome 浏览器回归
//
// ① 领导者 = 全局加成位：DOM 点击「晋升领导」即撤离岗位、卡面不再提供岗位下拉、
//    智能分配不会给领导安排岗位；旧档加载时残留绑定也被清除。
// ② 智能分配能分到超线程：DOM 点击「智能分配」在「模块已解锁但开关全关」时把全部线程
//    转入超线程（此前会释放为空闲且按钮提示「无需调整」），并做面板文本 / 无 pageerror 校验。
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
  _version: 6, chapter: '1', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0,
  upgrades: {}, buildings: {}, tech: {}, cultists: crew(), faith: 0,
  religion: null, prestige: 0, prestigePoints: 0, _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true },
  lastSeen: Date.now(), startTime: Date.now(), ...over,
});

const errs = [];
async function boot(browser, save, width = 1600, height = 1000) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1300);
  return page;
}
const boundMap = (page) => page.evaluate(() => {
  const m = {};
  for (const c of window.S.cultists) m[c.id] = c.boundTo || 'null';
  return m;
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});

try {
  // ================= ① 领导者不占任何岗位 =================
  console.log('\n[1] 反馈① 领导者 = 全局加成位');
  {
    // 旧档：T1 普通线程在探采岗位；T2 是旧版领导且残留绑定在灵感工坊
    const save = mkSave({ cultists: crew(10, i => i === 0
      ? { boundTo: 'vehicles' }
      : i === 1 ? { leader: true, boundTo: 'atrium' } : {}) });
    const page = await boot(browser, save);

    const legacy = await boundMap(page);
    if (legacy[2] === 'null') ok('① 旧档加载即清除领导者的岗位残留', `T2=${legacy[2]}`);
    else bad('① 旧档领导仍占岗位', `T2=${legacy[2]}`);

    // 晋升 T1（当前在探采岗位）→ 应立即撤离岗位
    const promoted = await page.evaluate(() => {
      const btn = document.querySelector('[data-leader="1"]');
      if (!btn) return { err: 'no leader button' };
      btn.click();
      const c = window.S.cultists.find(x => String(x.id) === '1');
      const qa = window.__qa.threadBind;
      return {
        leader: c.leader, bound: c.boundTo || 'null', count: qa.leaderCount(),
        canBind: qa.canBind(c),
        feed: (window.S.crewFeed || []).slice(-2).map(x => x.msg),
      };
    });
    if (promoted.leader === true && promoted.bound === 'null') ok('① 点击晋升领导后自动撤离原岗位', JSON.stringify({ bound: promoted.bound }));
    else bad('① 晋升后仍占岗位', JSON.stringify(promoted));
    if (promoted.count === 1 && promoted.canBind === false) ok('① 领导者唯一且 canBind=false', `count=${promoted.count}`);
    else bad('① 领导判定异常', JSON.stringify(promoted));
    if (promoted.feed.some(m => m.includes('撤离原岗位'))) ok('① 班组流水记录撤离岗位');
    else bad('① 流水未记录', JSON.stringify(promoted.feed));

    // 卡面：领导没有岗位下拉，展示全局加成位；普通线程仍有下拉且含超线程
    const ui = await page.evaluate(() => {
      const panel = document.getElementById('crew-panel');
      const leaderCard = [...(panel?.querySelectorAll('.crew-card') || [])]
        .find(el => el.textContent.includes('★领导'));
      const normalCard = [...(panel?.querySelectorAll('.crew-card') || [])]
        .find(el => el.querySelector('select[data-bind]'));
      return {
        leaderHasSelect: !!leaderCard?.querySelector('select[data-bind]'),
        leaderText: leaderCard?.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) || '',
        normalHasSelect: !!normalCard,
        normalOpts: normalCard ? [...normalCard.querySelectorAll('option')].map(o => o.textContent) : [],
        help: panel?.textContent.includes('不占任何岗位') || false,
        staleHelp: panel?.textContent.includes('并可「智能分配」') || false,
        bad: /undefined|NaN|Infinity/.test(panel?.textContent || ''),
      };
    });
    if (!ui.leaderHasSelect && ui.leaderText.includes('全局加成') && ui.leaderText.includes('不占岗位')) ok('① 领导卡无岗位下拉，显示「全局加成 · 不占岗位」');
    else bad('① 领导卡 UI 异常', JSON.stringify(ui));
    if (ui.normalHasSelect && ui.normalOpts.some(o => o.includes('超线程'))) ok('① 普通线程下拉仍可用且含超线程选项');
    else bad('① 普通线程下拉异常', JSON.stringify(ui.normalOpts));
    if (ui.help && !ui.staleHelp && !ui.bad) ok('① 班组说明文案已更新且无 undefined/NaN');
    else bad('① 班组说明文案异常', JSON.stringify(ui));

    // 直接调 bindThread 也拒绝领导
    const refused = await page.evaluate(() => {
      const c = window.S.cultists.find(x => String(x.id) === '1');
      const r = window.__qa.threadBind.bindThread(c, 'vehicles');
      return { r, bound: c.boundTo || 'null' };
    });
    if (refused.r === false && refused.bound === 'null') ok('① bindThread 拒绝把领导分配到任何岗位');
    else bad('① bindThread 未拒绝', JSON.stringify(refused));

    // 智能分配后领导仍空闲；全局加成仍在
    const afterAuto = await page.evaluate(() => {
      window.S.upgrades = { scooter: 1, atrium: 2 };
      window.S._probeEnabled = true; window.S.atriumOn = true;
      const cps0 = window.__qa.computeCps();
      document.querySelector('[data-autobind]').click();
      const lead = window.S.cultists.find(x => String(x.id) === '1');
      const mult = window.__qa.threadBind.leaderGlobalMult();
      return {
        leadBound: lead.boundTo || 'null', canBind: window.__qa.threadBind.canBind(lead),
        mult, leadCount: window.__qa.threadBind.leaderCount(), cps0,
        hyper: window.__qa.threadBind.converterLoad('hyper'),
        vehicles: window.__qa.threadBind.converterLoad('vehicles'),
        atrium: window.__qa.threadBind.converterLoad('atrium'),
      };
    });
    if (afterAuto.leadBound === 'null') ok('① 智能分配后领导仍不占任何岗位（含超线程）', JSON.stringify({ hyper: afterAuto.hyper }));
    else bad('① 智能分配把领导塞进了岗位', JSON.stringify(afterAuto));
    if (afterAuto.mult > 1 && afterAuto.leadCount === 1) ok('① 全局加成仍生效（不因解绑丢失）', `×${afterAuto.mult.toFixed(2)}`);
    else bad('① 全局加成丢失', JSON.stringify(afterAuto));
    if (afterAuto.vehicles <= 1 && afterAuto.atrium <= 2) ok('① 领导不占容量，资源岗位容量未被突破', JSON.stringify({ v: afterAuto.vehicles, a: afterAuto.atrium }));
    else bad('① 容量异常', JSON.stringify(afterAuto));

    // 取消领导 → 恢复为可分配线程，随后智能分配会把它安置
    const demoted = await page.evaluate(() => {
      document.querySelector('[data-leader="1"]').click();
      const c = window.S.cultists.find(x => String(x.id) === '1');
      const before = c.boundTo || 'null';
      document.querySelector('[data-autobind]').click();
      return { leader: c.leader, before, after: c.boundTo || 'null', canBind: window.__qa.threadBind.canBind(c) };
    });
    if (demoted.leader === false && demoted.canBind === true && demoted.after !== 'null') ok('① 卸任后恢复为可分配线程', JSON.stringify(demoted));
    else bad('① 卸任后未恢复', JSON.stringify(demoted));
    await page.close();
  }

  // ================= ② 智能分配到超线程 =================
  console.log('\n[2] 反馈② 智能分配能分配到超线程');
  {
    const page = await boot(browser, mkSave({ cultists: crew(10) }));
    // 场景：买了第一辆载具（解锁探采），但为防 EP 被抽干关闭了探采开关
    const before = await page.evaluate(() => {
      window.S.upgrades = { scooter: 1 };
      window.S._probeEnabled = false;
      const qa = window.__qa.threadBind;
      return { unlocked: qa.converterUnlocked('vehicles'), cap: qa.converterCapacity('vehicles'), idle: window.S.cultists.filter(c => !c.boundTo).length };
    });
    if (before.unlocked && before.cap === 1 && before.idle === 10) ok('② 场景成立：探采已解锁、开关关闭、10 条线程空闲', JSON.stringify(before));
    else bad('② 场景构造失败', JSON.stringify(before));

    const after = await page.evaluate(() => {
      const qa = window.__qa.threadBind;
      const changed = qa.autoAssignThreads();
      const hyper = qa.converterLoad('hyper');
      return {
        changed, hyper, idle: window.S.cultists.filter(c => !c.boundTo).length,
        vehicles: qa.converterLoad('vehicles'),
        feed: (window.S.crewFeed || []).slice(-1)[0]?.msg || '',
      };
    });
    if (after.hyper === 10 && after.idle === 0) ok('② 开关全关时 10 条线程全部转入超线程（原实现全变空闲）', `hyper=${after.hyper}`);
    else bad('② 线程未进入超线程', JSON.stringify(after));
    if (after.changed === 10) ok('② 点击有可见变化，不再返回「无需调整」', `changed=${after.changed}`);
    else bad('② 分配无变化', JSON.stringify(after));

    // 通过真实 DOM 按钮再点一次，验证按钮链与 UI
    const dom = await page.evaluate(() => {
      window.S.cultists.forEach(c => { c.boundTo = null; });
      const btn = document.querySelector('[data-autobind]');
      btn.click();
      return { hyper: window.__qa.threadBind.converterLoad('hyper'), feed: (window.S.crewFeed || []).slice(-1)[0]?.msg || '' };
    });
    if (dom.hyper === 10 && dom.feed.includes('超线程')) ok('② DOM 点击「智能分配」同样全部进超线程，流水正确', dom.feed.slice(0, 40));
    else bad('② DOM 点击结果异常', JSON.stringify(dom));

    // 重新开启探采 → 1 条去探采，其余仍在超线程
    const reopened = await page.evaluate(() => {
      window.S._probeEnabled = true;
      window.__qa.threadBind.autoAssignThreads();
      const qa = window.__qa.threadBind;
      return { vehicles: qa.converterLoad('vehicles'), hyper: qa.converterLoad('hyper') };
    });
    if (reopened.vehicles === 1 && reopened.hyper === 9) ok('② 模块重新开启后按容量调度，其余继续留在超线程', JSON.stringify(reopened));
    else bad('② 重新开启后分配异常', JSON.stringify(reopened));

    // 面板筛选「超线程」可见且无渲染异常
    await sleep(1200);
    const ui = await page.evaluate(() => {
      const panel = document.getElementById('crew-panel');
      const t = panel?.textContent || '';
      const filterBtns = [...(panel?.querySelectorAll('[data-crew-filter-btn]') || [])].map(b => b.textContent);
      const opts = [...(panel?.querySelectorAll('select[data-bind] option') || [])].map(o => o.textContent);
      return {
        filterBtns, hasHyperOpt: opts.some(o => o.includes('超线程')),
        hasCap: /\d+\/\d+/.test(t) || opts.some(o => /\d+\/\d+/.test(o)),
        bad: /undefined|NaN|Infinity/.test(t),
      };
    });
    if (ui.filterBtns.some(b => b.includes('超线程')) && ui.hasHyperOpt) ok('② 班组筛选按钮与下拉都含超线程岗位');
    else bad('② 超线程 UI 入口缺失', JSON.stringify(ui));
    if (ui.hasCap && !ui.bad) ok('② 面板容量展示正常且无 undefined/NaN');
    else bad('② 面板文本异常', JSON.stringify(ui));
    await page.close();
  }

  // ================= 防回归：无解锁 / 满员 / 手动设定 =================
  console.log('\n[3] 防回归：既有分配语义未被破坏');
  {
    const page = await boot(browser, mkSave({ cultists: crew(8) }));
    const r = await page.evaluate(() => {
      const qa = window.__qa.threadBind;
      // 无任何模块解锁
      window.S.upgrades = {}; window.S.cultists.forEach(c => { c.boundTo = null; });
      qa.autoAssignThreads();
      const none = qa.converterLoad('hyper');
      // 手动设定一条超线程，再分配
      window.S.upgrades = { scooter: 1, atrium: 2 };
      window.S._probeEnabled = true; window.S.atriumOn = true;
      window.S.cultists.forEach(c => { c.boundTo = null; });
      window.S.cultists[0].boundTo = 'hyper';
      qa.autoAssignThreads();
      return {
        none, manual: window.S.cultists[0].boundTo,
        vehicles: qa.converterLoad('vehicles'), atrium: qa.converterLoad('atrium'),
        hyper: qa.converterLoad('hyper'),
      };
    });
    if (r.none === 8) ok('③ 无模块解锁时全部转超线程（v3.6.4 ③ 保持）', `${r.none}`);
    else bad('③ 无解锁场景回归', JSON.stringify(r));
    // v3.7.2 反馈④：不再约束手动超线程是否留在 hyper（容量优先后结果取决于擅长归位），
    // 只守住「资源岗位按容量填满 + 溢出才进超线程 + 容量不突破」这条不变量。
    if (r.vehicles <= 1 && r.atrium <= 2 && r.hyper === 8 - r.vehicles - r.atrium) ok('③ 资源岗位按容量填满、溢出进超线程、容量不突破', JSON.stringify(r));
    else bad('③ 分配语义回归', JSON.stringify(r));

    // Wiki 文案同步（弹窗 → 「线程与薪资」章节）
    const wiki = await page.evaluate(() => {
      document.getElementById('btn-wiki')?.click();
      document.querySelector('[data-wiki="thread"]')?.click();
      const t = document.getElementById('wiki-body')?.textContent || '';
      return {
        leader: t.includes('不占任何岗位'), hyper: t.includes('最后兜底岗位'),
        bad: /undefined|NaN/.test(t), len: t.length,
      };
    });
    if (wiki.leader && wiki.hyper && !wiki.bad) ok('③ Wiki 领导者与超线程文案已同步，且无 undefined/NaN', `${wiki.len} 字`);
    else bad('③ Wiki 文案未同步', JSON.stringify(wiki));
    await page.close();
  }

  if (errs.length === 0) ok('全程无 pageerror / console error');
  else bad('浏览器报错', JSON.stringify(errs.slice(0, 4)));
} finally {
  await browser.close();
}

console.log(`\n最终结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
