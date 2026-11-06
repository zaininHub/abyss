// v3.7.5 反馈 · 真实 Chrome 回归：AI 助手「购买编队」价格不足灰显 / 攒够解禁 / 满编
//
// 用户反馈：「ai助手的编队价格不够不能购买没有灰显」。
// 原实现只按「已满编」禁用，且面板只在 dirty.ai 时重建 → EP 不够时按钮仍亮、点了只写失败日志；
// 即使加上静态判断，攒够 EP 后也可能永久灰着（与 v3.2.4 自动购建按钮同构）。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '5', chapterEnteredAt: Date.now(), startedAt: Date.now() - 5 * 86400000,
  ep: 0, rp: 1e12, pt: 1e9, dm: 1e9, es: 1e4, faith: 1e5, starCps: 1e6,
  // storage 120 → EP 上限 ~1e13，第 4 槽成本 ~1e9：EP=0 明显买不起，补足后可买
  upgrades: { storage: 120, rp_vault: 6, pt_vault: 6, ai_assist: 3 },
  buildings: {}, tech: { ai_core: true, deep_space: true, prestige2: true },
  rpTheories: { rp_entropy: 4, rp_wage: 4 },
  achievements: {}, colonies: {}, starRes: { stardust: 500 }, policies: {},
  religion: { unlocked: true, branch: 'sun', sun: true, temple: 3 },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  cultists: [{ id: 1, name: 'T', output: 1, mood: '正常', moodTimer: 60 }],
  lastSeen: Date.now(), startTime: Date.now(),
  ...over,
});

const readBtn = () => {
  const b = document.querySelector('#ai-panel [data-assist-buy]');
  if (!b) return null;
  const cs = getComputedStyle(b);
  return {
    disabled: b.disabled,
    cls: b.classList.contains('disabled'),
    text: b.textContent.trim(),
    title: b.title,
    opacity: Number(cs.opacity),
    cursor: cs.cursor,
    lv: window.S.upgrades?.ai_assist || 0,
    ep: window.S.ep,
  };
};

const errs = [];
async function boot(browser, save) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400); // 等首次渲染 + 300ms 可购态快刷
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});

try {
  console.log('\n[1] EP 不足：按钮灰显且不可购买');
  const page = await boot(browser, mkSave());
  {
    const b = await page.evaluate(readBtn);
    if (!b) bad('① AI 面板未渲染「购买编队」按钮', '');
    else {
      if (b.disabled && b.cls) ok('① EP 不足时按钮 disabled + .disabled 灰显类', `lv=${b.lv} ep=${b.ep}`);
      else bad('① EP 不足却未禁用', JSON.stringify(b));
      if (b.opacity < 1 && b.cursor === 'not-allowed') ok('② 视觉灰显生效（opacity / cursor）', `opacity=${b.opacity} cursor=${b.cursor}`);
      else bad('② 灰显样式未生效', `opacity=${b.opacity} cursor=${b.cursor}`);
      if (/EP 不足/.test(b.title) && /还需/.test(b.title)) ok('③ 悬浮提示说明缺口', b.title);
      else bad('③ 缺少 EP 缺口提示', b.title);
      if (/^购买编队（.+ EP）$/.test(b.text)) ok('④ 灰显时仍展示当前价格', b.text);
      else bad('④ 卡面价格缺失', b.text);
    }
  }

  console.log('\n[2] 灰显按钮点不动：等级 / EP 均不变');
  {
    const r = await page.evaluate(() => {
      const before = { lv: window.S.upgrades.ai_assist || 0, ep: window.S.ep };
      document.querySelector('[data-assist-buy]')?.click();
      return { before, after: { lv: window.S.upgrades.ai_assist || 0, ep: window.S.ep } };
    });
    if (r.after.lv === r.before.lv && r.after.ep === r.before.ep) ok('⑤ 禁用态点击不扣 EP、不涨槽', `Lv.${r.after.lv} EP=${r.after.ep}`);
    else bad('⑤ 禁用态仍可购买', JSON.stringify(r));
  }

  console.log('\n[3] EP 攒够：300ms 快刷原地解禁（无需切面板）');
  {
    await page.evaluate(() => { window.S.ep = 1e15; }); // 主循环钳回存储上限 ~1e13，仍远高于成本
    await sleep(650);
    const b = await page.evaluate(readBtn);
    if (b && !b.disabled && !b.cls && b.opacity === 1) ok('⑥ EP 足够后原地解禁、恢复亮色', b.text);
    else bad('⑥ 攒够 EP 后仍灰显（缺刷新链）', JSON.stringify(b));
    if (b && /消耗/.test(b.title)) ok('⑦ 悬浮提示切换为可购买说明', b.title);
    else bad('⑦ 提示未同步', b?.title || '');
  }

  console.log('\n[4] 可购态点击：扣 EP、+1 槽、主商店置脏');
  {
    const r = await page.evaluate(() => {
      const before = { lv: window.S.upgrades.ai_assist || 0, ep: window.S.ep };
      document.querySelector('[data-assist-buy]')?.click();
      return { before, after: { lv: window.S.upgrades.ai_assist || 0, ep: window.S.ep }, dirtyShop: window.__gameDirty?.shop };
    });
    if (r.after.lv === r.before.lv + 1 && r.after.ep < r.before.ep) ok('⑧ 点击购买 +1 槽并扣 EP', `Lv.${r.before.lv} → Lv.${r.after.lv}`);
    else bad('⑧ 购买未生效', JSON.stringify(r));
    if (r.dirtyShop === true) ok('⑨ 购买后主商店卡同步置脏');
    else bad('⑨ 商店未置脏', String(r.dirtyShop));
  }

  console.log('\n[5] 双向同步：EP 再被花光 → 重新灰显；满编 → 文案切换');
  {
    await page.evaluate(() => { window.S.ep = 0; });
    await sleep(650);
    const poor = await page.evaluate(readBtn);
    if (poor && poor.disabled && poor.cls) ok('⑩ EP 再次不足时重新灰显', `lv=${poor.lv} 下一槽价 ${poor.text}`);
    else bad('⑩ 花光 EP 后未重新灰显', JSON.stringify(poor));

    await page.evaluate(() => { window.S.upgrades.ai_assist = 8; window.S.ep = 1e15; window.__gameDirty.ai = true; });
    await sleep(650);
    const cap = await page.evaluate(readBtn);
    if (cap && cap.disabled && cap.text === '已满编' && /已满编/.test(cap.title)) ok('⑪ 满编禁用且文案「已满编」', cap.title);
    else bad('⑪ 满编态异常', JSON.stringify(cap));
  }

  console.log('\n[6] 无运行时异常');
  if (errs.length === 0) ok('⑫ 全程无 pageerror / console error');
  else bad('⑫ 捕获运行时异常', errs.slice(0, 3).join(' | '));

  await page.close();
} finally {
  await browser.close();
}

console.log(`\n=== v3.7.5 AI 助手编队灰显：${pass} passed / ${fail} failed ===`);
if (fail) process.exitCode = 1;
