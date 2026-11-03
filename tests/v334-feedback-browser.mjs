// v3.3.4 反馈回归（五项）
// ① 探采：页头开关与采集/消耗同源（开=采集+扣EP、关=双停）、EP 消耗走 K/M 简化、按钮不随每秒刷新重建（hover 不闪）
// ② 星图未解锁星系显示 ???
// ③ 异兽经验满且饼干不足时经验封顶（不再无限累积）、进度条按真实进度
// ④ 异兽卡只显示维持所需文案（无宠物效果行）
// ⑤ 裂隙哨站文案「当前 → 下一级」且与实际生效同口径（10 → 7.5 分钟）
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
  await sleep(1400);

  // 播种：大量载具（让 EP/s 上千，验证 K 简化）+ 线程 + EP/存储
  await page.evaluate(() => {
    window.S.ep = 5e9; window.S.allTimeEp = 5e9;
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300, scooter: 3, convoy: 40 };
    window.S.dm = 0;
    window.S.cultists = Array.from({ length: 6 }, (_, i) => ({
      id: 'c' + i, name: '线程' + i, mood: '正常', output: 500, profession: null, level: 1,
      hiredAt: Date.now(), moodTimer: 90, leader: false, boundTo: null,
    }));
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), dm: true, pt: true };
    window.__gameDirty.shop = true; window.__gameDirty.top = true;
  });
  await sleep(1800);

  // ===== ① 探采页头：K 简化 + 开关同源 + 不重建 =====
  const v1 = await page.evaluate(() => {
    const host = document.getElementById('vehicle-collect');
    const btn = host?.querySelector('[data-probe-toggle]');
    return { txt: host?.innerText || '', btnText: btn?.textContent || '', hasBtn: !!btn };
  });
  if (v1.hasBtn && /探采 -[\d.]+[KMB]? EP\/s/.test(v1.txt)) ok('① 探采页头 EP 消耗显示存在', v1.txt.slice(0, 50));
  else bad('① 页头 EP 消耗', JSON.stringify(v1));
  if (/\d{4,}(\.\d)? EP\/s/.test(v1.txt)) bad('① EP 消耗未做 K 简化', v1.txt.slice(0, 60));
  else ok('① EP 消耗已做 K/M 简化（无 4 位以上裸数字）', v1.txt.slice(0, 50));

  // 按钮节点在 1.2s 刷新后保持同一引用（原实现每秒 innerHTML 重建 → hover 闪烁）
  const same1 = await page.evaluate(async () => {
    const b0 = document.querySelector('[data-probe-toggle]');
    await new Promise(r => setTimeout(r, 1200));
    const b1 = document.querySelector('[data-probe-toggle]');
    return { same: b0 === b1, txt: b1?.textContent };
  });
  if (same1.same) ok('① 探采开关不随秒级刷新重建（hover 不闪）', String(same1.txt));
  else bad('① 开关被重建', JSON.stringify(same1));

  // 开/关：消耗与采集同步变化
  const v2 = await page.evaluate(async () => {
    const d0 = window.__qa.totalDrainPerSec();
    document.querySelector('[data-probe-toggle]').click();
    await new Promise(r => setTimeout(r, 400));
    const off = { en: window.S.converterOn?.vehicles !== false || window.S._probeEnabled !== false, drain: window.__qa.totalDrainPerSec(), btn: document.querySelector('[data-probe-toggle]').textContent };
    document.querySelector('[data-probe-toggle]').click();
    await new Promise(r => setTimeout(r, 400));
    const on = { drain: window.__qa.totalDrainPerSec(), btn: document.querySelector('[data-probe-toggle]').textContent };
    return { d0, off, on };
  });
  if (v2.off.en === false && v2.off.btn.includes('已暂停')) ok('① 点击关闭 → 状态为已暂停', v2.off.btn);
  else bad('① 关闭未生效', JSON.stringify(v2.off));
  if (v2.off.drain < v2.d0 - 1 && v2.on.drain > v2.off.drain + 1) ok('① 开关直接改变 EP 消耗', `${v2.d0.toFixed(0)} → off ${v2.off.drain.toFixed(0)} → on ${v2.on.drain.toFixed(0)}`);
  else bad('① 开关未改变消耗', JSON.stringify(v2));

  // 采集真的会到账（探采生效）：计时器推到临近结算
  const v3 = await page.evaluate(async () => {
    window.S.dm = 0; window.S.vehCollectTimer = 58;
    await new Promise(r => setTimeout(r, 3000));
    return { dm: window.S.dm || 0 };
  });
  if (v3.dm > 0) ok('① 探采真实产出 DM', `dm=${v3.dm.toFixed(3)}`); else bad('① 探采无产出', JSON.stringify(v3));

  // ===== ② 星图未解锁星系 → ??? =====
  const st = await page.evaluate(async () => {
    window.S.cultists = [];
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.__gameDirty.expedition = true;
    await new Promise(r => setTimeout(r, 600));
    const t = document.getElementById('expedition-panel')?.innerText || '';
    return { hasMask: t.includes('???'), leaked: /银河边缘|仙女座/.test(t), t: t.slice(0, 120) };
  });
  if (st.hasMask && !st.leaked) ok('② 未解锁星系显示 ???（不泄露名称）');
  else bad('② 星图未解锁占位', JSON.stringify(st));

  // ===== ③ 异兽经验封顶 + ④ 卡片只留维持文案 =====
  const p1 = await page.evaluate(async () => {
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.S.cultists = Array.from({ length: 4 }, (_, i) => ({
      id: 'c' + i, name: '线程' + i, mood: '正常', output: 800, profession: null, level: 1,
      hiredAt: Date.now(), moodTimer: 90, leader: false, boundTo: null,
    }));
    window.S.pets = { cat: { icon: '🐈', name: '影猫', level: 5, exp: 0, gen: 1 } };
    window.S.activePets = ['cat'];
    window.S.pt = 3; // 不足以付升级费，但不触发休战
    const need = Math.floor(1200 * Math.pow(5, 2.8));
    window.S.pets.cat.exp = need * 5; // 旧档虚拟冗余
    window.__gameDirty.pets = true;
    await new Promise(r => setTimeout(r, 1500));
    const card = document.querySelector('#pet-grid .pet-card')?.innerText || '';
    return {
      need,
      exp: window.S.pets.cat.exp,
      level: window.S.pets.cat.level,
      width: document.querySelector('#pet-grid .pet-xp div')?.style.width || '',
      card,
      title: document.querySelector('#pet-grid .pet-xp')?.getAttribute('title') || '',
    };
  });
  if (p1.exp <= p1.need + 1) ok('③ 经验满且饼干不足时封顶在升级线', `${Math.floor(p1.exp)} / ${p1.need}`);
  else bad('③ 经验仍在累积', JSON.stringify({ exp: p1.exp, need: p1.need }));
  if (p1.level === 5 && parseFloat(p1.width) >= 100) ok('③ 封顶时进度条 100%（真实满）', p1.width);
  else bad('③ 进度条宽度', JSON.stringify({ lv: p1.level, w: p1.width }));
  if (/维持 -/.test(p1.card) && !/点击 \+20%/.test(p1.card) && !/经验已满/.test(p1.card)) ok('④ 异兽卡只留维持文案', p1.card.replace(/\n/g, ' '));
  else bad('④ 异兽卡文案', JSON.stringify(p1.card));
  if (/升级需/.test(p1.title)) ok('④ 升级门槛提示移入进度条悬浮'); else bad('④ 悬浮提示缺失', p1.title);

  // ===== ⑤ 裂隙哨站文案 =====
  const r1 = await page.evaluate(async () => {
    window.S.riftUpgrades = {};
    window.__gameDirty.riftTab = true;
    await new Promise(r => setTimeout(r, 500));
    const t0 = document.getElementById('rift-tab-panel')?.innerText || '';
    window.S.riftUpgrades = { sentinel: 1 };
    window.__gameDirty.riftTab = true;
    await new Promise(r => setTimeout(r, 500));
    const t1 = document.getElementById('rift-tab-panel')?.innerText || '';
    return { t0: t0.slice(0, 200), t1: t1.slice(0, 200) };
  });
  if (/裂隙出现间隔 10 分钟 → 7\.5 分钟/.test(r1.t0)) ok('⑤ Lv.0 文案：10 分钟 → 7.5 分钟');
  else bad('⑤ Lv.0 文案', r1.t0.replace(/\n/g, ' ').slice(0, 90));
  if (/裂隙出现间隔 7\.5 分钟 → 5\.6 分钟/.test(r1.t1)) ok('⑤ Lv.1 文案与实际同口径（7.5 → 5.6）');
  else bad('⑤ Lv.1 文案', r1.t1.replace(/\n/g, ' ').slice(0, 90));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
