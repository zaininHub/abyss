// v3.3.1 反馈回归（11 项中的可自动化部分）
// 覆盖：①设施区工坊卡（无独立栏目）+ 研究点蒸馏开关 ②孵化开关在异兽/升级在设施
//       ③预言系统生效 ④自动转化常驻 + 未解锁灰显 ⑤领导者唯一 ⑥每只异兽维持消耗显示
//       ⑦班组无事件流水 ⑧故事线不重复标题 ⑨成就可收起 ⑪消耗口径与实际扣减一致
import puppeteer from 'puppeteer-core';
const CHROME = '/usr/local/bin/chromium'; // Linux CI 环境适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });
  page.on('pageerror', e => bad('页面异常', String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1400);

  // 播种：线程 + EP + 存储 + PT 已发现
  await page.evaluate(() => {
    window.S.cultists = Array.from({ length: 20 }, (_, i) => ({
      id: 'c' + i, name: '线程' + i, mood: '正常', output: 50,
      profession: i % 2 ? 'distiller' : 'prospector', level: 1, level: 1,
      hiredAt: Date.now(), moodTimer: 90, leader: false, boundTo: null,
    }));
    window.S.ep = 3e6; window.S.allTimeEp = 3e6;
    window.S.upgrades.storage = 300;
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), pt: true };
    window.__gameDirty.shop = true;
  });
  await sleep(1600);

  // ===== ① 设施区：工坊卡 + 无独立栏目 =====
  const fac = await page.evaluate(() => ({
    hasOldTitle: !!document.getElementById('atrium-title'),
    bldTitleShown: document.getElementById('bld-title')?.style.display !== 'none',
    atriumInBld: !!document.querySelector('#building-list .atrium-distill'),
    atriumHasToggle: !!document.querySelector('#building-list [data-atrium-toggle]'),
    hatchInBld: !!document.querySelector('#building-list .hatch-upg'),
  }));
  if (!fac.hasOldTitle) ok('① 「设施 · 灵感工坊」独立栏目已移除'); else bad('① 仍有独立栏目');
  if (fac.atriumInBld && !fac.atriumHasToggle) ok('① 灵感工坊购买卡并入「设施」（卡内无开关）');
  else bad('① 工坊卡', JSON.stringify(fac));
  if (fac.hatchInBld) ok('② 异兽孵化工坊（购买/升级）在「设施」'); else bad('② 孵化卡缺失');
  if (fac.bldTitleShown) ok('① 设施标题随工坊卡显示'); else bad('① 设施标题被隐藏');

  // 购入灵感工坊（v3.3.2：整卡点击购买，data-atrium-buy 按钮已移除）
  await page.evaluate(() => document.querySelector('#building-list [data-atrium-upg]')?.click());
  await sleep(500);
  const bought = await page.evaluate(() => (window.S.upgrades.atrium || 0));
  if (bought >= 1) ok('① 购入灵感工坊成功', `Lv.${bought}`); else bad('① 购入失败');

  // 研究点页：自动蒸馏开关
  await page.click('#btn-rp'); await sleep(600);
  const sw = await page.evaluate(() => {
    const host = document.getElementById('atrium-switch-host');
    return { has: !!host?.querySelector('[data-atrium-switch]'), txt: host?.innerText.slice(0, 40) || '' };
  });
  if (sw.has) ok('① 研究点页出现「自动蒸馏」开关', sw.txt.replace(/\n/g, ' ')); else bad('① 研究点无开关');
  await page.evaluate(() => document.querySelector('[data-atrium-switch]')?.click());
  await sleep(300);
  const atrOff = await page.evaluate(() => window.S.atriumOn === false);
  if (atrOff) ok('① 研究点开关可关闭蒸馏（atriumOn=false）'); else bad('① 开关无效');

  // ===== ② 异兽页：只有开关，无升级按钮 =====
  await page.click('#btn-shop'); await sleep(400);
  await page.evaluate(() => document.querySelector('#building-list [data-hatch-upg]')?.click());
  await sleep(500);
  const hatch = await page.evaluate(() => ({ auto: window.S.ptAutoHatch, lv: window.S.ptHatchLv }));
  if (hatch.auto === true) ok('② 设施购入孵化升级即解锁自动孵化', `Lv.${hatch.lv}`); else bad('② 孵化解锁失败', JSON.stringify(hatch));
  await page.click('#btn-pets'); await sleep(700);
  const petUi = await page.evaluate(() => ({
    toggle: !!document.querySelector('#pet-grid [data-pt-distill-toggle]'),
    upg: !!document.querySelector('#pet-grid [data-pt-hatch-upg]'),
    upkeep: (document.querySelector('#pet-grid')?.innerText.match(/维持 -[\d.]+ PT\/s/) || [])[0] || '',
  }));
  if (petUi.toggle && !petUi.upg) ok('② 异兽页保留孵化开关、升级按钮已移出'); else bad('② 异兽页按钮分布', JSON.stringify(petUi));

  // ===== ⑥ 每只异兽维持消耗 =====
  await page.evaluate(() => {
    window.S.pets = { cat: { icon: '🐈', name: '影猫', level: 5, exp: 0, gen: 1 }, owl: { icon: '🦉', name: '夜枭', level: 2, exp: 0, gen: 1 } };
    window.S.activePets = ['cat', 'owl']; window.S.pt = 100;
    window.__gameDirty.pets = true;
  });
  await sleep(900);
  const petCards = await page.evaluate(() => [...document.querySelectorAll('#pet-grid .pet-card')].map(c => c.innerText.replace(/\n/g, ' ')));
  const withUpkeep = petCards.filter(t => /维持 -[\d.]+ PT\/s/.test(t));
  if (withUpkeep.length === 2) ok('⑥ 每只出战异兽单独显示维持消耗', withUpkeep[0].slice(0, 40));
  else bad('⑥ 每只消耗显示', JSON.stringify(petCards).slice(0, 160));

  // ===== ④ 自动转化常驻 + 灰显区分 =====
  const qs = await page.evaluate(() => {
    const panel = document.getElementById('quick-switches-panel');
    const btns = [...document.querySelectorAll('#quick-switches button')];
    return {
      visible: panel.style.display !== 'none',
      n: btns.length,
      locked: btns.filter(b => b.dataset.qsLock).map(b => b.dataset.qsLock),
      styles: btns.map(b => b.getAttribute('style').slice(0, 60)),
    };
  });
  if (qs.visible && qs.n === 4) ok('④ 自动转化面板常驻四枚开关（v3.3.3：+圣所）');
  else bad('④ 面板形态', JSON.stringify(qs));
  if (qs.locked.length === 2 && qs.locked.includes('probe') && qs.locked.includes('temple')) ok('④ 未解锁开关灰显（探采/圣所未解锁）', qs.locked.join(','));
  else bad('④ 灰显判定', JSON.stringify(qs.locked));

  // ===== ⑤ 领导者唯一 =====
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#crew-panel [data-leader]')];
    btns[0]?.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#crew-panel [data-leader]')];
    btns[1]?.click();
  });
  await sleep(400);
  const leaders = await page.evaluate(() => window.S.cultists.filter(c => c.leader).length);
  if (leaders === 1) ok('⑤ 领导者只能存在一位（晋升第二位自动卸任）'); else bad('⑤ 领导者数量', String(leaders));

  // ===== ⑦ 班组无事件流水 =====
  const crew = await page.evaluate(() => ({
    feed: !!document.querySelector('#crew-panel .crew-feed'),
    sum: /班组产出/.test(document.getElementById('crew-panel')?.innerText || ''),
  }));
  if (!crew.feed && crew.sum) ok('⑦ 班组面板已删除事件流水（保留产出/薪资概览）');
  else bad('⑦ 班组面板', JSON.stringify(crew));

  // ===== ⑧ 故事线不重复标题 =====
  const story = await page.evaluate(() => {
    const panel = document.getElementById('storyline-panel');
    return { h3: panel.querySelectorAll('h3').length, txt: panel.innerText.slice(0, 40) };
  });
  if (story.h3 === 0 && !story.txt.startsWith('故事线')) ok('⑧ 故事线面板内不再重复「故事线」行');
  else bad('⑧ 故事线重复标题', JSON.stringify(story));

  // ===== ⑨ 成就可收起 =====
  await page.evaluate(() => document.getElementById('achievement-h3')?.click());
  await sleep(200);
  const achCollapsed = await page.evaluate(() => ({
    cls: document.getElementById('tab-achievement').className,
    hidden: getComputedStyle(document.getElementById('achievement-panel')).display === 'none',
  }));
  if (achCollapsed.hidden) ok('⑨ 成就面板可收起');
  else bad('⑨ 成就收起', JSON.stringify(achCollapsed));
  await page.evaluate(() => document.getElementById('achievement-h3')?.click());
  await sleep(200);
  const achOpen = await page.evaluate(() => getComputedStyle(document.getElementById('achievement-panel')).display !== 'none');
  if (achOpen) ok('⑨ 成就面板可展开'); else bad('⑨ 成就展开失败');

  // ===== ⑪ 消耗口径与实际扣减一致 =====
  const drain = await page.evaluate(async () => {
    // 冻结产出与余额，强制停留在休眠态（EP 不足 → 只扣保命成本）
    window.S.cultists.forEach(c => { c.output = 0; });
    window.S.ep = 0;
    window.S.wageState = { state: 'dormant', debtSec: 0, dormantSec: 120, bufferSec: 0, loseTimer: 0, transition: 0 };
    await new Promise(r => setTimeout(r, 500));
    const sal = window.__qa.staffSalaryPerSec();
    const total = window.__qa.totalDrainPerSec();
    return { sal, total, ratio: total / sal, state: window.S.wageState.state };
  });
  if (drain.state === 'dormant' && drain.total < drain.sal * 0.05) ok('⑪ 休眠且 EP=0 时消耗/s 不再虚报全额薪资', `sal=${drain.sal.toFixed(1)} total=${drain.total.toFixed(1)}`);
  else bad('⑪ 消耗口径', JSON.stringify(drain));

  // ===== ③ 预言系统生效（v3.3.3：广播间隔 30s→600s） =====
  const proph = await page.evaluate(async () => {
    window.S.tech = { ...(window.S.tech || {}), prophecy: true };
    window.S._prophecyTimer = 599.9;
    await new Promise(r => setTimeout(r, 900));
    return {
      next: window.S.prophecyNext,
      logged: [...document.querySelectorAll('#log-content div')].some(d => d.textContent.includes('神谕广播')),
    };
  });
  if (proph.next && proph.next.name) ok('③ 预言系统产出预告事件', proph.next.name); else bad('③ 预言未生效', JSON.stringify(proph));
  if (proph.logged) ok('③ 神谕广播写入日志'); else bad('③ 无广播日志');

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
