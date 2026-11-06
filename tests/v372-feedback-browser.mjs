// v3.7.2 四项反馈 · 真实 Chrome 浏览器回归（DOM 点击 + 面板文本 + 无 pageerror）
//
// ① 异兽模块：PT 未解锁时 tab 锁定 / 顶栏 PT 隐藏 / 程序化切换被拦；购入饵料仓库后同步开放。
// ② 一键收回：DOM 点击后全部岗位清空、置为空闲、流水与下拉同步。
// ③ 班组卡不再出现「已共事」共事时长，个人产出仍在刷新。
// ④ 智能分配：DOM 点击后资源岗位按容量优先填满，放不下的才进超线程；扩容后把超线程拉回。
// ⑤ Wiki / 班组说明文案同步，各面板无 undefined/NaN。
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
  lastSeen: Date.now(), startTime: Date.now(), startedAt: Date.now() - 10 * 86400000,
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
  await sleep(1300);
  return page;
}
const loads = (page) => page.evaluate(() => {
  const o = { free: 0, hyper: 0, vehicles: 0, atrium: 0, hatch: 0, temple: 0 };
  for (const c of window.S.cultists) { const k = c.boundTo || 'free'; o[k] = (o[k] || 0) + 1; }
  return o;
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});

try {
  // ================= ① 异兽模块 PT 门控 =================
  console.log('\n[1] 反馈① PT 未解锁时异兽模块不开放');
  {
    const page = await boot(browser, mkSave());
    const locked = await page.evaluate(() => {
      const btn = document.getElementById('btn-pets');
      const ptStat = document.getElementById('h-pt');
      return {
        text: btn?.textContent || '', disabled: !!btn?.disabled,
        cls: btn?.classList.contains('tab-locked'), title: btn?.title || '',
        ptHidden: ptStat?.parentElement?.style.display === 'none',
        qa: window.__qa.petsModuleUnlocked(window.S),
        daysPlayed: (Date.now() - (window.S.startedAt || 0)) / 86400000,
      };
    });
    if (locked.qa === false && locked.ptHidden) ok('① PT 锚点未完成：顶栏 PT 隐藏、判定源为 false', `游玩 ${locked.daysPlayed.toFixed(1)} 天`);
    else bad('① PT 未解锁但顶栏/判定源状态异常', JSON.stringify(locked));
    if (locked.disabled && locked.cls && locked.text.includes('???')) ok('① 异兽 tab 处于锁定态（🔒 ??? / disabled）', locked.text);
    else bad('① 异兽 tab 未锁定', JSON.stringify(locked));
    if (locked.title.includes('解锁 PT')) ok('① 锁定提示写明 PT 条件', locked.title);
    else bad('① 锁定提示缺失', locked.title);

    const guard = await page.evaluate(() => {
      window.__qa.sim.switchTab('pets');
      return {
        paneOn: document.getElementById('tab-pets')?.classList.contains('on'),
        toast: (document.body.textContent || '').includes('异兽将在解锁 PT 后开放'),
      };
    });
    if (!guard.paneOn && guard.toast) ok('① 程序化 switchTab 也被同一判定源拦下');
    else bad('① 程序化切换绕过了门控', JSON.stringify(guard));

    // 购入饵料仓库 → 顶栏 PT 与异兽 tab 同步开放
    const unlocked = await page.evaluate(() => {
      window.S.upgrades.petland = 1;
      window.__gameDirty.top = true;
      window.__qa.sim.render();
      const btn = document.getElementById('btn-pets');
      const ptStat = document.getElementById('h-pt');
      return {
        text: btn?.textContent || '', disabled: !!btn?.disabled,
        ptShown: ptStat?.parentElement?.style.display !== 'none',
        qa: window.__qa.petsModuleUnlocked(window.S),
      };
    });
    if (unlocked.qa && unlocked.ptShown && !unlocked.disabled && unlocked.text === '异兽') ok('① 购入饵料仓库后顶栏 PT 与异兽 tab 同步开放', JSON.stringify(unlocked));
    else bad('① PT 解锁后模块未同步开放', JSON.stringify(unlocked));

    // 旧档持久标记不得绕过（本局制）
    const legacy = await page.evaluate(() => {
      window.S.upgrades.petland = 0; window.S.pt = 0;
      window.S.resDiscovered = { ...window.S.resDiscovered, pt: true };
      return { qa: window.__qa.petsModuleUnlocked(window.S), pt: window.S.pt };
    });
    if (!legacy.qa) ok('① 旧档 resDiscovered.pt 持久标记不误放行');
    else bad('① 持久标记绕过了本局制门控', JSON.stringify(legacy));
    await page.close();
  }

  // ================= ② 一键收回 + ③ 去除共事时间 =================
  console.log('\n[2] 反馈② 一键收回 / 反馈③ 去除共事时间');
  {
    const save = mkSave({
      upgrades: { scooter: 2, atrium: 2 },
      cultists: crew(10, i => ({ boundTo: i % 3 === 0 ? 'vehicles' : i % 3 === 1 ? 'atrium' : 'hyper' })),
    });
    const page = await boot(browser, save);
    const before = await loads(page);
    if (before.vehicles + before.atrium + before.hyper === 10) ok('② 夹具：10 条线程全部在岗', JSON.stringify(before));
    else bad('② 夹具异常', JSON.stringify(before));

    const dom = await page.evaluate(() => {
      const btn = document.querySelector('[data-release-all]');
      if (!btn) return { err: 'no release button' };
      const title = btn.title || '';
      btn.click();
      const sels = [...document.querySelectorAll('#crew-panel select[data-bind]')];
      return {
        title,
        bound: window.S.cultists.filter(c => !!c.boundTo).length,
        feed: (window.S.crewFeed || []).slice(-1).map(x => x.msg).join(''),
        selEmpty: sels.length > 0 && sels.every(x => x.value === ''),
        selCount: sels.length,
        salaryFactors: window.S.cultists.map(c => window.__qa.threadBind.threadBindSalaryFactor(c)),
      };
    });
    if (!dom.err && dom.bound === 0) ok('② DOM 点击「一键收回」后所有线程置于空闲', `bound=${dom.bound}`);
    else bad('② 一键收回未清空岗位', JSON.stringify(dom));
    if (dom.feed.includes('一键收回') && dom.feed.includes('空闲')) ok('② 班组流水正确记录', dom.feed.slice(0, 40));
    else bad('② 流水文案缺失', dom.feed);
    if (dom.selEmpty) ok('② 所有岗位下拉回到「空闲」', `${dom.selCount} 个下拉`);
    else bad('② 下拉未同步', JSON.stringify({ selEmpty: dom.selEmpty, selCount: dom.selCount }));
    if (dom.salaryFactors.every(v => v === 1)) ok('② 消耗恢复：全部薪资系数为 1');
    else bad('② 薪资系数未恢复', JSON.stringify(dom.salaryFactors.slice(0, 4)));
    if (dom.title.includes('空闲')) ok('② 按钮 title 说明用途');
    else bad('② 按钮 title 缺失', dom.title);

    const tenure = await page.evaluate(() => {
      const t = document.getElementById('crew-panel')?.textContent || '';
      return {
        nodes: document.querySelectorAll('.c-tenure').length,
        text: t.includes('已共事'),
        outNodes: document.querySelectorAll('.c-out').length,
        outFilled: [...document.querySelectorAll('.c-out')].every(x => x.textContent && !/NaN|undefined/.test(x.textContent)),
      };
    });
    if (tenure.nodes === 0 && !tenure.text) ok('③ 班组卡不再出现 c-tenure / 已共事文案');
    else bad('③ 共事时长仍存在', JSON.stringify(tenure));
    if (tenure.outNodes === 10 && tenure.outFilled) ok('③ 个人产出仍在原地刷新且数值正常', `${tenure.outNodes} 个节点`);
    else bad('③ 个人产出刷新异常', JSON.stringify(tenure));
    await page.close();
  }

  // ================= ④ 智能分配：资源岗位优先 =================
  console.log('\n[3] 反馈④ 资源岗位优先填满，超线程最后');
  {
    // 班组面板 ≥10 条线程才解锁（crewShown），夹具必须给足，否则按钮不渲染
    const save = mkSave({
      upgrades: { scooter: 3, atrium: 2 },
      cultists: crew(10, () => ({ boundTo: 'hyper' })),
    });
    const page = await boot(browser, save);
    const before = await loads(page);
    if (before.hyper === 10) ok('④ 夹具：10 条线程全部手动设为超线程', JSON.stringify(before));
    else bad('④ 夹具异常', JSON.stringify(before));

    const first = await page.evaluate(() => {
      const btn = document.querySelector('[data-autobind]');
      if (!btn) return { err: 'no autobind button' };
      const title = btn.title || '';
      btn.click();
      return {
        title,
        feed: (window.S.crewFeed || []).slice(-1).map(x => x.msg).join(''),
        help: document.querySelector('.crew-help')?.textContent || '',
      };
    });
    const after = await loads(page);
    if (after.vehicles === 3 && after.atrium === 2 && after.hyper === 5 && after.free === 0) ok('④ DOM 点击智能分配：资源岗位 5 个槽全满，其余 5 条才进超线程', JSON.stringify(after));
    else bad('④ 资源岗位未优先填满', JSON.stringify(after));
    if ((first.feed || '').includes('先填满资源岗位')) ok('④ 流水文案已同步', (first.feed || '').slice(0, 40));
    else bad('④ 流水文案未同步', JSON.stringify(first));
    if ((first.title || '').includes('放不下的才转入超线程')) ok('④ 按钮 title 说明新优先级');
    else bad('④ 按钮 title 未同步', (first.title || '').slice(0, 60));
    if ((first.help || '').includes('原本手动设定的超线程也会先被拉回来补资源岗位')) ok('④ 班组说明已同步');
    else bad('④ 班组说明未同步', (first.help || '').slice(0, 80));

    // 扩容 → 再次点击，把超线程里的线程全部拉回资源岗位
    const reopened = await page.evaluate(() => {
      window.S.upgrades.scooter = 8;
      document.querySelector('[data-autobind]')?.click();
      return true;
    });
    const afterGrow = await loads(page);
    if (reopened && afterGrow.vehicles === 8 && afterGrow.atrium === 2 && afterGrow.hyper === 0) ok('④ 设施扩容后重排：超线程被拉回来补满资源岗位', JSON.stringify(afterGrow));
    else bad('④ 扩容后未按容量重排', JSON.stringify(afterGrow));

    // 收回 → 分配 组合：收回后全空闲，再分配仍按容量优先
    const combo = await page.evaluate(() => {
      document.querySelector('[data-release-all]')?.click();
      const free = window.S.cultists.filter(c => !c.boundTo).length;
      document.querySelector('[data-autobind]')?.click();
      const o = { free, hyper: 0, vehicles: 0, atrium: 0 };
      for (const c of window.S.cultists) { const k = c.boundTo || 'free'; o[k] = (o[k] || 0) + 1; }
      return o;
    });
    if (combo.free === 10 && combo.vehicles === 8 && combo.atrium === 2 && combo.hyper === 0) ok('④ 组合流程：收回后全空闲，再分配仍按容量优先', JSON.stringify(combo));
    else bad('④ 组合流程异常', JSON.stringify(combo));

    // Wiki 与 UI 准确性
    const wiki = await page.evaluate(() => {
      document.getElementById('btn-wiki')?.click();
      document.querySelector('[data-wiki="thread"]')?.click();
      const t = document.getElementById('wiki-body')?.textContent || '';
      return {
        leader: t.includes('不占任何岗位'),
        fallback: t.includes('最后兜底岗位'),
        release: t.includes('一键收回'),
        stale: t.includes('已共事') || t.includes('手动设定的超线程会保留') || t.includes('个人产出、工龄'),
        bad: /undefined|NaN/.test(t), len: t.length,
      };
    });
    if (wiki.leader && wiki.fallback && wiki.release && !wiki.stale && !wiki.bad) ok('④ Wiki 已同步新语义且无 undefined/NaN', `${wiki.len} 字`);
    else bad('④ Wiki 文案未同步', JSON.stringify(wiki));

    const ui = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.tabs button')].map(b => b.textContent || '');
      const crewTxt = document.getElementById('crew-panel')?.textContent || '';
      return { tabsBad: tabs.filter(t => /undefined|NaN/.test(t)), crewBad: /undefined|NaN/.test(crewTxt), tabs: tabs.length };
    });
    if (ui.tabsBad.length === 0 && !ui.crewBad) ok('④ 各 tab 与班组面板文本无 undefined/NaN', `${ui.tabs} 个 tab`);
    else bad('④ UI 文本异常', JSON.stringify(ui));
    await page.close();
  }

  if (errs.length === 0) ok('全程无 pageerror / console error');
  else bad('浏览器报错', JSON.stringify(errs.slice(0, 4)));
} finally {
  await browser.close();
}

console.log(`\n最终结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
