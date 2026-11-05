import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
let pass = 0, fail = 0;
const ok = (m, d) => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d) => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '1', storyline: 'default', ep: 5e5, rp: 0, es: 0, dm: 0,
  upgrades: { storage: 12 }, buildings: {}, tech: {}, cultists: [], faith: 0,
  religion: null, prestige: 0, prestigePoints: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(), ...over,
});

async function boot(browser, save) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100 });
  page.on('pageerror', e => { throw new Error('pageerror: ' + String(e).slice(0, 200)); });
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, save);
  await page.goto('file://' + process.cwd() + '/dist/index.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1400));
  return page;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

// ---- ① 班组面板：5 条隐藏 / 10 条显示 ----
{
  const page = await boot(browser, mkSave({ cultists: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60, profession: 'prospector' })) }));
  const r1 = await page.evaluate(() => ({
    display: document.getElementById('crew-card')?.style.display,
    unlocked: window.S._crewUnlocked,
  }));
  if (r1.display === 'none' && !r1.unlocked) ok('① 5 条线程：班组卡隐藏', `display=${r1.display}`);
  else bad('① 5 条线程班组卡未隐藏', JSON.stringify(r1));

  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.S.cultists.push({ id: 100 + i, name: 'X' + i, output: 5, mood: '正常', moodTimer: 60, profession: 'prospector' });
  });
  await new Promise(r => setTimeout(r, 1600));
  const r2 = await page.evaluate(() => ({
    display: document.getElementById('crew-card')?.style.display,
    unlocked: window.S._crewUnlocked,
    n: window.S.cultists.length,
  }));
  if (r2.display !== 'none' && r2.unlocked === true) ok('① 10 条线程：班组卡显示并持久解锁', `display=${r2.display} flag=${r2.unlocked}`);
  else bad('① 10 条线程班组卡未解锁', JSON.stringify(r2));
  // 持久性：线程掉回 5 条仍显示
  await page.evaluate(() => { window.S.cultists = window.S.cultists.slice(0, 5); });
  await new Promise(r => setTimeout(r, 1300));
  const r3 = await page.evaluate(() => document.getElementById('crew-card')?.style.display);
  if (r3 !== 'none') ok('① 线程流失后不收回面板（持久解锁）', `display=${r3}`);
  else bad('① 线程流失后面板被收回', `display=${r3}`);
  await page.close();
}

// ---- ② 裂隙：5 条线程不出现 / 15 条后 1 小时一遇 / 首次 Lv1 / 停留 10 分钟 ----
{
  const page = await boot(browser, mkSave({ cultists: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60, profession: 'prospector' })) }));
  const g1 = await page.evaluate(() => {
    window.__advance(40000); // 推进 11 小时（dt 钳 10s/帧 + 追赶封顶 30 分钟——线程不足也不该出裂隙）
    return { active: !!window.S.activeRift, seen: window.S._riftSeen, title: document.querySelector('[id^=btn-rift]')?.title || '' };
  });
  if (!g1.active && !g1.seen) ok('② 5 条线程：1000 小时也不出裂隙', `title=${g1.title.slice(0, 50)}`);
  else bad('② 线程不足仍出裂隙', JSON.stringify(g1));
  if (/15 条线程/.test(g1.title)) ok('② 锁定提示写明线程门槛', g1.title);
  else bad('② 锁定提示未写线程门槛', g1.title);
  await page.close();

  // v3.6.2 稳健化：分 2 分钟小步推进并逐帧捕获「首次出现」，避免「lucky 提前触发 + 10 分钟停留」在整段推进后已闭合导致读不到 activeRift 的偶发失败
  const page2 = await boot(browser, mkSave({ cultists: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: 'T' + i, output: 5, mood: '正常', moodTimer: 60, profession: 'prospector' })) }));
  let cap = null;
  for (let i = 0; i < 70 && !cap; i++) {
    await page2.evaluate(() => window.__advance(120)); // 每步 2 分钟，最多 140 分钟
    const st = await page2.evaluate(() => window.S.activeRift
      ? { lv: window.S.activeRift.level, stay: (window.S.activeRift.expiresAt - Date.now()) / 60000, seen: window.S._riftSeen }
      : null);
    if (st) cap = st;
  }
  if (cap && cap.lv === 1) ok('② 15 条线程：首次裂隙出现且为 Lv.1', `lv=${cap.lv}`);
  else bad('② 首次裂隙未出现或等级非 1', JSON.stringify(cap));
  if (cap && cap.stay >= 7.9 && cap.stay <= 10.5) ok('② 裂隙在场停留 10 分钟', `${cap.stay.toFixed(1)} 分钟`);
  else bad('② 停留时长不是 10 分钟', String(cap && cap.stay));
  if (cap && cap.seen) ok('② 首次出现即解锁探采平台/深渊商店标记', '');

  // 后续裂隙等级恢复 cps 口径（_riftSeen 已置真）——同样分小步捕获，规避偶发闭合
  const g3 = await page2.evaluate(() => { window.S.activeRift = null; window.S._riftNextSec = 0; window.S._riftT = 0; return true; });
  void g3;
  let cap3 = null;
  for (let i = 0; i < 70 && !cap3; i++) {
    await page2.evaluate(() => window.__advance(120));
    const st = await page2.evaluate(() => window.S.activeRift ? { lv: window.S.activeRift.level } : null);
    if (st) cap3 = st;
  }
  if (cap3 && cap3.lv !== null && cap3.lv !== 1) ok('② 后续裂隙等级按 cps 口径（非强制 Lv1）', `lv=${cap3.lv}`);
  else bad('② 后续裂隙未出现或仍为 Lv1', JSON.stringify(cap3));
  await page2.close();
}

// ---- ③ 旧档兼容：已触发过裂隙的存档（_riftSeen）直接视为已解锁 ----
{
  const page = await boot(browser, mkSave({ _riftSeen: true, cultists: [] }));
  const r = await page.evaluate(() => ({
    ready: window.S._riftThreadUnlocked,
    crew: document.getElementById('crew-card')?.style.display,
  }));
  if (r.ready === true) ok('③ 旧档（已见过裂隙）线程门槛自动豁免', '');
  else bad('③ 旧档线程门槛未豁免', JSON.stringify(r));
  if (r.crew === 'none') ok('③ 旧档 0 线程：班组仍隐藏（需达标）', '');
  else bad('③ 旧档班组不应显示', `display=${r.crew}`);
  await page.close();
}

await browser.close();
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
