// v3.3.5 反馈回归（三项）
// ① 智能分配：每次点击对「当前全部线程」做一次全局重排（已绑定但错位的线程也会被纠正），已最优时返回 0 不动
// ② 神谕广播：文案连带事件效果（如「顿悟」——+80 RP），AI 面板同步展示
// ③ 裂隙：首次 90 秒内必出（计时兜底）、封印后首列常驻倒计时、后台大跳按真实时间补偿、裂隙页签显示下次裂隙
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
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  // ===== ① 智能分配：全量重排 =====
  const a1 = await page.evaluate(() => {
    window.S.ep = 1e12;
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 1 };
    window.S.ptAutoHatch = true;            // 孵化开启
    window.S._probeEnabled = true;          // 探采开启
    window.S.converterOn = { vehicles: true, atrium: true, hatch: true, temple: true };
    window.S.religion = { ...(window.S.religion || {}), temple: 1, templeOff: false }; // 圣所开启
    window.S.cultists = [
      { id: 'a', name: 'A', profession: 'prospector', level: 1, boundTo: null, mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false },
      { id: 'b', name: 'B', profession: 'distiller', level: 1, boundTo: 'hatch', mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false }, // 错位：蒸馏师被绑在孵化
      { id: 'c', name: 'C', profession: 'keeper', level: 1, boundTo: null, mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false },
      { id: 'd', name: 'D', profession: 'slacker', level: 1, boundTo: null, mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: false },
      { id: 'e', name: 'E', profession: 'overseer', level: 1, boundTo: null, mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90, leader: true },
    ];
    const changed = window.__qa.threadBind.autoAssignThreads();
    const after = window.S.cultists.map(c => `${c.name}:${c.profession}->${c.boundTo}`);
    const changed2 = window.__qa.threadBind.autoAssignThreads();
    const after2 = window.S.cultists.map(c => c.boundTo);
    return { changed, after, changed2, after2 };
  });
  const map = Object.fromEntries(a1.after.map(s => [s.split(':')[0], s.split('->')[1]]));
  if (a1.changed > 0 && map.A === 'vehicles' && map.B === 'atrium' && map.C === 'hatch')
    ok('① 一键重排：职业匹配归位（A→探采、B→灵感工坊、C→孵化）', JSON.stringify(map));
  else bad('① 重排结果', JSON.stringify(a1));
  if (a1.changed2 === 0) ok('① 已是优解时再次点击不改动（返回 0）', `changed2=${a1.changed2}`);
  else bad('① 二次点击不应改动', JSON.stringify(a1.after2));
  if (a1.after2.filter(Boolean).length === a1.after2.length) ok('① 重排后所有线程均已落位', `${a1.after2.join(',')}`);
  else bad('① 存在未分配线程', JSON.stringify(a1.after2));

  // ===== ② 神谕广播带效果 =====
  const p1 = await page.evaluate(async () => {
    window.S.tech = { ...(window.S.tech || {}), prophecy: 1 };
    window.S._prophecyTimer = 599;
    window.__advance(3);
    await new Promise(r => setTimeout(r, 300));
    const txt = document.getElementById('log-content')?.innerText || '';
    const line = txt.split('\n').find(l => l.includes('神谕广播')) || '';
    return { next: window.S.prophecyNext, line };
  });
  if (p1.next && p1.next.desc) ok('② 神谕广播记录事件效果字段', `「${p1.next.name}」——${p1.next.desc}`);
  else bad('② prophecyNext.desc 缺失', JSON.stringify(p1.next));
  if (p1.line.includes('神谕广播') && p1.line.includes('——')) ok('② 日志文案含效果', p1.line.slice(0, 60));
  else bad('② 日志文案缺效果', p1.line);

  // ===== ③ 裂隙触发（v3.6.2：班组 ≥15 线程后 1 小时一遇，首次 Lv1，停留 10 分钟；移除「首次 90 秒必出」）=====
  // 3a 线程不足（当前 5 条）：长时间推进也不出裂隙 + 锁定提示写门槛
  const r0 = await page.evaluate(() => {
    window.__advance(4000); // 约 66 分钟
    return { active: !!window.S.activeRift, seen: !!window.S._riftSeen, title: document.querySelector('[id^=btn-rift]')?.title || '' };
  });
  if (!r0.active && !r0.seen) ok('③ 线程不足（5 条）长时间推进也不出裂隙', '');
  else bad('③ 线程不足仍出裂隙', JSON.stringify(r0));
  if (/15 条线程/.test(r0.title)) ok('③ 锁定提示写明线程门槛', r0.title);
  else bad('③ 锁定提示未写门槛', r0.title);

  // 3b 补足到 ≥15 线程：约 1 小时出现首次裂隙 Lv1 + 在场 10 分钟
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) window.S.cultists.push({ id: 'x' + i, name: 'X' + i, profession: 'prospector', level: 1, boundTo: null, mood: '正常', output: 10, hiredAt: Date.now(), moodTimer: 90 });
    window.S._riftT = 0; window.S._riftNextSec = 0;
  });
  let cap = null;
  for (let i = 0; i < 70 && !cap; i++) {
    await page.evaluate(() => window.__advance(120)); // 每步 2 分钟
    const st = await page.evaluate(() => window.S.activeRift ? { lv: window.S.activeRift.level, stay: (window.S.activeRift.expiresAt - Date.now()) / 60000 } : null);
    if (st) cap = st;
  }
  if (cap && cap.lv === 1) ok('③ ≥15 线程：首次裂隙 Lv1（移除 90s 兜底）', `lv=${cap.lv}`);
  else bad('③ 首次裂隙未出现或等级非 1', JSON.stringify(cap));
  if (cap && cap.stay >= 7.9 && cap.stay <= 10.5) ok('③ 裂隙在场停留 10 分钟', `${cap.stay.toFixed(1)} 分钟`);
  else bad('③ 停留时长非 10 分钟', String(cap && cap.stay));

  // 3c 封印后卡片常驻 + 倒计时（复用当前活动裂隙）
  await page.evaluate(() => { window.S.ep = 1e14; document.getElementById('seal-rift')?.click(); });
  await sleep(1200);
  const r2 = await page.evaluate(() => ({
    active: !!window.S.activeRift,
    card: getComputedStyle(document.getElementById('rift-card')).display,
    eta: document.getElementById('rift-eta')?.textContent || '',
    txt: document.getElementById('rift-panel')?.innerText.slice(0, 80) || '',
  }));
  if (!r2.active && r2.card !== 'none' && /(\d+\s*分|\d+\s*秒)/.test(r2.eta)) ok('③ 封印后首列常驻「下次裂隙」倒计时', r2.eta);
  else bad('③ 倒计时卡', JSON.stringify(r2));

  // 3d 后台大跳补偿：跳过 40 分钟 → 计时必然到点（≥15 线程已满足门槛）
  const r3 = await page.evaluate(() => {
    window.S.activeRift = null; window.S._riftT = 0; window.S._riftNextSec = 600;
    window.__tick(performance.now() + 40 * 60 * 1000);
    return { active: !!window.S.activeRift, catchup: window.S._riftCatchup || 0 };
  });
  if (r3.active) ok('③ 后台挂机 40 分钟返回即补出裂隙（_riftCatchup 上限 30 分钟）');
  else bad('③ 后台补偿失效', JSON.stringify(r3));

  // 3e 裂隙页签「下次裂隙」行
  const r4 = await page.evaluate(async () => {
    window.S.activeRift = null; window.S.riftExpedition = null;
    window.__gameDirty.riftTab = true;
    document.getElementById('btn-rift-tab')?.click();
    await new Promise(r => setTimeout(r, 600));
    const el = document.getElementById('rift-eta-tab');
    return { has: !!el, text: el?.textContent || '', panel: document.getElementById('rift-tab-panel')?.innerText.slice(0, 90) || '' };
  });
  if (r4.has && r4.text.length > 0) ok('③ 裂隙页签显示「下次裂隙」倒计时', r4.text);
  else bad('③ 页签倒计时', JSON.stringify(r4));

  if (errs.length === 0) ok('全程无 JS 报错');
  else bad('页面异常', errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
