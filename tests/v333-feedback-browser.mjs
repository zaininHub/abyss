// v3.3.3 反馈回归（十一项中的可自动化部分）
// ①异兽进度条/PT 门提示 ②四列布局 ③RP 效率递增 ④预言降频+限时兑现 ⑤裂隙触发补偿
// ⑥圣所 EP 递增 ⑦孵化/圣所线程绑定 ⑧DM 满仓不扣 EP ⑨未开放模块 ??? ⑩成就分页 ⑪涨价曲线
import puppeteer from 'puppeteer-core';
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100 });
  page.on('pageerror', e => bad('页面异常', String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  // ===== ② 四列布局 =====
  const lay = await page.evaluate(() => {
    const g = document.querySelector('.grid');
    const cols = getComputedStyle(g).gridTemplateColumns.split(' ').length;
    const first = g.firstElementChild;
    return {
      cols,
      firstCls: first.className,
      inFirst: ['projects', 'quick-switches-panel', 'rift-card', 'tab-achievement'].map(id => !!first.querySelector('#' + id)),
      achInFirst: !!first.querySelector('#tab-achievement'),
      crewInLeft: !!g.querySelector('.left-col #crew-panel'),
    };
  });
  if (lay.cols === 4) ok('② 主网格为四列'); else bad('② 列数', String(lay.cols));
  if (lay.firstCls.includes('first-col') && lay.inFirst.every(Boolean)) ok('② 第一列含 任务版/自动转化/裂隙/成就');
  else bad('② 第一列内容', JSON.stringify(lay));
  if (lay.crewInLeft) ok('② 班组在第二列'); else bad('② 班组位置');

  // ===== ⑨ 未开放模块 ??? =====
  const lock9 = await page.evaluate(() => {
    const b = document.getElementById('btn-delve');
    const before = document.getElementById('tab-delve').classList.contains('on');
    b.click();
    const after = document.getElementById('tab-delve').classList.contains('on');
    return {
      txt: b.textContent.trim(), locked: b.dataset.locked === '1',
      title: b.title || '', switched: after && !before,
      relics: document.getElementById('btn-relics').textContent.trim(),
      visible: getComputedStyle(b).display !== 'none',
    };
  });
  if (lock9.txt === '???' && lock9.locked && lock9.visible) ok('⑨ 深潜以 ??? 锁定态展示', lock9.title.slice(0, 40));
  else bad('⑨ 深潜锁定态', JSON.stringify(lock9));
  if (!lock9.switched) ok('⑨ 锁定 tab 点击不切换（仅提示）'); else bad('⑨ 锁定 tab 可切换');
  if (lock9.relics === '???') ok('⑨ 遗物同样 ??? 展示'); else bad('⑨ 遗物', lock9.relics);

  // 播种通用环境
  await page.evaluate(() => {
    window.S.ep = 1e8; window.S.allTimeEp = 1e8;
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.S.cultists = Array.from({ length: 6 }, (_, i) => ({
      id: 'c' + i, name: '线程' + i, mood: '正常', output: 500, profession: null, level: 1,
      hiredAt: Date.now(), moodTimer: 90, leader: false, boundTo: null,
    }));
  });
  await sleep(600);

  // ===== ① 异兽经验/进度条 =====
  const p1 = await page.evaluate(async () => {
    window.S.pets = { cat: { icon: '🐈', name: '影猫', level: 5, exp: 0, gen: 1 } };
    window.S.activePets = ['cat'];
    window.S.pt = 5000;
    window.__gameDirty.pets = true;
    await new Promise(r => setTimeout(r, 400));
    const e0 = window.S.pets.cat.exp;
    const w0 = document.querySelector('.pet-xp div')?.style.width;
    await new Promise(r => setTimeout(r, 4000));
    return { rate: (window.S.pets.cat.exp - e0) / 4, moved: document.querySelector('.pet-xp div')?.style.width !== w0 };
  });
  if (p1.rate > 0 && p1.moved) ok('① 经验持续增长、进度条移动', `${p1.rate.toFixed(0)} exp/s`); else bad('① 进度条', JSON.stringify(p1));

  // PT 门：经验满 → 卡面出现「升级」按钮（v3.3.7：自动升级移除，改为手动升级）
  const p1b = await page.evaluate(async () => {
    const pet = window.S.pets.cat;
    pet.exp = Math.floor(1200 * Math.pow(pet.level, 2.8));
    window.S.pt = 3; // 少于升级所需，但 >0（不触发休战）
    window.__gameDirty.pets = true;
    await new Promise(r => setTimeout(r, 700));
    const t = document.querySelector('.pet-xp')?.getAttribute('title') || '';
    return { hint: /升级/.test(t), level: pet.level };
  });
  if (p1b.hint) ok('① 经验满时进度条悬浮给出升级提示'); else bad('① PT 门提示', JSON.stringify(p1b));

  // v3.3.7：不再自动升级——等待期间等级不变；点「升级」按钮才消耗 PT 升级
  const p1c = await page.evaluate(async () => {
    const pet = window.S.pets.cat;
    window.S.pt = 5000;
    const lv0 = pet.level;
    await new Promise(r => setTimeout(r, 1200));
    const noAuto = pet.level === lv0;
    const btn = document.querySelector('#pet-grid [data-pet-up]');
    const btnText = btn ? btn.textContent : '';
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 400));
    return { noAuto, btnText, leveled: pet.level > lv0, lv: pet.level, pt: Math.floor(window.S.pt) };
  });
  if (p1c.noAuto && p1c.leveled && /升级.*PT/.test(p1c.btnText)) ok('① 无自动升级 + 手动「升级」按钮消耗 PT', `Lv.${p1c.lv} pt=${p1c.pt} btn="${p1c.btnText}"`);
  else bad('① 手动升级', JSON.stringify(p1c));

  // ===== ③ RP 效率递增 =====
  const p3 = await page.evaluate(async () => {
    window.S.upgrades.atrium = 1;
    window.S.atriumOn = true;
    await new Promise(r => setTimeout(r, 300));
    const s1 = window.__qa.rpEffScale();
    window.S.upgrades.atrium = 5;
    await new Promise(r => setTimeout(r, 300));
    const s5 = window.__qa.rpEffScale();
    window.S.rp = 0;
    const rp0 = window.S.rp;
    await new Promise(r => setTimeout(r, 3000));
    return { s1, s5, gain5: window.S.rp - rp0 };
  });
  if (Math.abs(p3.s1 - Math.SQRT2) < 0.01) ok('③ 工坊×1 效率系数 √2', p3.s1.toFixed(3)); else bad('③ scale×1', String(p3.s1));
  if (Math.abs(p3.s5 - Math.sqrt(6)) < 0.01) ok('③ 工坊×5 效率系数 √6（EP/RP 变贵）', p3.s5.toFixed(3)); else bad('③ scale×5', String(p3.s5));
  if (p3.gain5 > 0.6 && p3.gain5 < 1.2) ok('③ 实际 RP 产出线性且按系数折减', `3s +${p3.gain5.toFixed(2)} RP（基准 0.92）`);
  else bad('③ 产出折减', String(p3.gain5));
  await page.evaluate(() => { window.S.upgrades.atrium = 0; });

  // ===== ④ 预言降频 + 限时兑现 =====
  const p4 = await page.evaluate(async () => {
    window.S.tech = { ...(window.S.tech || {}), prophecy: true };
    window.S._prophecyTimer = 599.9;
    window.S.nextEventAt = Date.now() + 6 * 3600 * 1000;
    await new Promise(r => setTimeout(r, 900));
    return { has: !!window.S.prophecyNext, waitMin: (window.S.nextEventAt - Date.now()) / 60000 };
  });
  if (p4.has && p4.waitMin <= 15.5) ok('④ 预言已预告且事件被提前到 15 分钟内兑现', `${p4.waitMin.toFixed(1)} 分钟`);
  else bad('④ 预言', JSON.stringify(p4));

  // ===== ⑤ 裂隙触发（后台补偿掷骰） =====
  const p5 = await page.evaluate(() => {
    window.S.corruption = 0; window.S.collapsed = false; window.S._collapseAt = null; window.S._collapseChoicePending = null;
    window.S.activeRift = null; window.S._riftSeen = false;
    const origRandom = Math.random;
    Math.random = () => 0; // 强制命中
    window.S._riftCatchup = 10;
    window.__tick(performance.now());
    Math.random = origRandom;
    return { rift: !!window.S.activeRift, seen: !!window.S._riftSeen };
  });
  if (p5.rift && p5.seen) ok('⑤ 裂隙掷骰含后台时间补偿（强制命中触发 + 解锁标记）');
  else bad('⑤ 裂隙触发', JSON.stringify(p5));

  // ===== ⑥ 圣所 EP 消耗递增 =====
  const p6 = await page.evaluate(async () => {
    // 隔离其他消耗源：孵化/圣所以外的消耗仅线程薪资
    window.S.religion = { unlocked: true, temple: 1, templeOff: false };
    const d1 = window.__qa.totalDrainPerSec();
    window.S.religion.temple = 5;
    const d5 = window.__qa.totalDrainPerSec();
    window.S.religion.temple = 1;
    return { d1, d5, ratio: d5 / Math.max(1e-9, d1) };
  });
  // 线性单价时 Lv1→Lv5 消耗比 ≈2.2（薪资混入）；递增单价 ×(1+0.2×(Lv-1)) → ≈3.35
  if (p6.ratio >= 3) ok('⑥ 圣所消耗随等级超线性递增（Lv1→Lv5）', `×${p6.ratio.toFixed(2)}（线性仅 ≈2.2）`);
  else bad('⑥ 圣所递增', JSON.stringify(p6));

  // ===== ⑦ 孵化/圣所线程绑定 =====
  const p7 = await page.evaluate(async () => {
    const boost0 = window.__qa.threadBind.converterThreadBoost('hatch');
    const keeper = window.S.cultists[0];
    keeper.profession = 'keeper';
    window.__qa.threadBind.bindThread(keeper, 'hatch');
    const boostK = window.__qa.threadBind.converterThreadBoost('hatch');
    // PT 产出随绑定提升：2s 采样
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.S.ptAutoHatch = true; window.S.ptDistillOn = true; window.S.ptHatchLv = 2;
    const pt0 = window.S.pt;
    await new Promise(r => setTimeout(r, 2000));
    const gainBound = window.S.pt - pt0;
    window.__qa.threadBind.unbindThread(keeper);
    const pt1 = window.S.pt;
    await new Promise(r => setTimeout(r, 2000));
    return { boost0, boostK: boostK.toFixed(3), gainBound, gainFree: window.S.pt - pt1 };
  });
  if (p7.boostK > p7.boost0) ok('⑦ 饲育师绑定孵化 → boost 提升', `${p7.boost0}→${p7.boostK}`);
  else bad('⑦ 孵化 boost', JSON.stringify(p7));
  if (p7.gainBound > p7.gainFree) ok('⑦ 绑定后实际 PT 产出更高', `${p7.gainBound.toFixed(3)} vs ${p7.gainFree.toFixed(3)}`);
  else bad('⑦ PT 产出', JSON.stringify(p7));
  const p7b = await page.evaluate(() => {
    const acolyte = window.S.cultists[1];
    acolyte.profession = 'acolyte';
    window.__qa.threadBind.bindThread(acolyte, 'temple');
    return window.__qa.threadBind.converterThreadBoost('temple');
  });
  if (p7b > 1) ok('⑦ 祭司绑定圣所 → boost >1', p7b.toFixed(3)); else bad('⑦ 圣所 boost', String(p7b));
  // 圣所快捷开关出现
  const p7c = await page.evaluate(() => {
    const b = document.querySelector('[data-qs="temple"]');
    return { has: !!b, txt: b?.textContent || '' };
  });
  if (p7c.has && /圣所/.test(p7c.txt)) ok('⑦ 圣所快捷开关出现（ temple ≥1）', p7c.txt); else bad('⑦ 圣所开关', JSON.stringify(p7c));

  // ===== ⑧ DM 满仓不扣 EP =====
  const p8 = await page.evaluate(async () => {
    // 隔离：关掉孵化/圣所等消耗源，只留探采
    window.S.ptDistillOn = false;
    window.S.religion.templeOff = true;
    window.S.cultists = [];
    window.S.upgrades.scooter = 3;
    window.S._probeEnabled = true;
    window.S.dm = 1000; // 满仓（基础 DM 上限 1000）
    window.S.vehCollectTimer = 59;
    const ep0 = window.S.ep;
    await new Promise(r => setTimeout(r, 2500));
    return { dm: window.S.dm, full: window.S._dmFull === true, epNoDrain: window.S.ep >= ep0 - 1 };
  });
  if (p8.full && p8.dm === 1000 && p8.epNoDrain) ok('⑧ DM 满仓：采集暂停且不扣 EP'); else bad('⑧ DM 满仓', JSON.stringify(p8));

  // ===== ⑩ 成就分页 =====
  const p10 = await page.evaluate(async () => {
    window.S.achievements = {};
    ['click1', 'ep1k', 'ep100k', 'ep1m', 'ep1b', 'own10', 'thread3', 'pre1', 'reincarn1', 'es1', 'tech1', 'offline'].forEach(k => { window.S.achievements[k] = true; });
    window.__gameDirty.achievements = true;
    await new Promise(r => setTimeout(r, 700));
    const panel = document.getElementById('achievement-panel');
    const cards1 = panel.querySelectorAll('.ach-card').length;
    const total = (panel.querySelector('.crew-pager span')?.textContent.match(/共 (\d+) 项/) || [0, 0])[1];
    const pager = panel.querySelector('[data-ach-page="next"]');
    pager?.click();
    await new Promise(r => setTimeout(r, 300));
    const cards2 = panel.querySelectorAll('.ach-card').length;
    const pageTxt = panel.querySelector('.crew-pager span')?.textContent || '';
    return { cards1, cards2, pageTxt, total: parseInt(total, 10) };
  });
  if (p10.cards1 === 10 && p10.cards2 === p10.total - 10) ok('⑩ 成就一页 10 条 + 分页翻页', p10.pageTxt);
  else bad('⑩ 成就分页', JSON.stringify(p10));

  // ===== ⑪ 涨价曲线 =====
  await page.click('#btn-shop');
  await sleep(500);
  const p11pre = await page.evaluate(() => {
    // v3.4.7 ①④：线程 7 件全部限购 + 价格重排（base 升序 mem→cache→subsist1-3→cpu→gpu）。
    // 链窗只亮已购前缀+1，CPU 在第 6 位——补齐前缀让 CPU 卡进入窗口
    const S = window.S;
    S.upgrades = { ...(S.upgrades || {}), mem: 1, cache: 1, subsist1: 1, subsist2: 1, subsist3: 1 };
    S.allTimeEp = Math.max(S.allTimeEp || 0, 1e12);
    S.ep = 1e12;
    window.__gameDirty = window.__gameDirty || {}; window.__gameDirty.shop = true;
    window.dispatchEvent(new Event('resize'));
    return true;
  });
  await sleep(800);
  // 用源码口径断言更稳：直接读两张卡的显示成本并比对公式
  const p11 = await page.evaluate(() => {
    const card = document.querySelector('#thread-shop [data-buy="cpu"]');
    const cost0 = parseFloat((card?.querySelector('.cost')?.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
    card?.click();
    return new Promise(res => setTimeout(() => {
      const card2 = document.querySelector('#thread-shop [data-buy="cpu"]');
      const cost1 = parseFloat((card2?.querySelector('.cost')?.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
      res({ cost0, cost1, ratio: cost0 > 0 ? cost1 / cost0 : 0 });
    }, 500));
  });
  if (p11.ratio > 1.75 && p11.ratio < 2.05) ok('⑪ 线程强化购后成本 ×≈1.9（v3.3.7 再涨价）', `${p11.cost0}→${p11.cost1}`);
  else bad('⑪ 线程涨价', JSON.stringify(p11));

  const p11b = await page.evaluate(async () => {
    window.S.prestige = 1; window.S.rp = 1e6;
    // 晋升 RP 加成组在切到「研究点」tab 时渲染（switchTab → renderRpFamily）
    document.getElementById('btn-rp').click();
    await new Promise(r => setTimeout(r, 800));
    const card = document.querySelector('#rp-upgrade-list [data-buy="exp_bench"]');
    if (!card) return { found: false };
    const cost0 = parseFloat((card.querySelector('.cost')?.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
    card.click();
    await new Promise(r => setTimeout(r, 500));
    const card2 = document.querySelector('#rp-upgrade-list [data-buy="exp_bench"]');
    const cost1 = parseFloat((card2?.querySelector('.cost')?.textContent || '0').replace(/[^0-9.]/g, '')) || 0;
    return { found: true, cost0, cost1, ratio: cost0 > 0 ? cost1 / cost0 : 0 };
  });
  if (p11b.found && p11b.ratio > 2.1 && p11b.ratio < 2.7) ok('⑪ 晋升 RP 加成购后成本 ×≈2.3（1.28×1.8，v3.3.7 再涨价）', `${p11b.cost0}→${p11b.cost1}`);
  else bad('⑪ RP 族涨价', JSON.stringify(p11b));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
