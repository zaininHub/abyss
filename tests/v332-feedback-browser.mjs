// v3.3.2 反馈回归（四项）
// ① 工坊/孵化卡改标准升级项样式：无独立升级按钮、整卡点击、升级后位置不漂移、文案精简
// ② 班组面板无「转化器开关」
// ③ 灵感工坊 EP 消耗计入总消耗（升级后顶栏消耗变多；孵化 5000×lv 同步验证）
// ④ 异兽页孵化文案只写当前总计（无「下级」）
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
    window.S.cultists = Array.from({ length: 12 }, (_, i) => ({
      id: 'c' + i, name: '线程' + i, mood: '正常', output: 50,
      profession: i % 2 ? 'distiller' : 'prospector', level: 1,
      hiredAt: Date.now(), moodTimer: 90, leader: false, boundTo: null,
    }));
    window.S.ep = 3e6; window.S.allTimeEp = 3e6;
    window.S.upgrades.storage = 300;
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), pt: true };
    window.__gameDirty.shop = true;
  });
  await sleep(1600);

  // ===== ① 工坊卡标准升级项样式 =====
  const cardA = await page.evaluate(() => {
    const el = document.querySelector('#building-list .atrium-distill');
    return el ? {
      tag: !!el.querySelector('button'),
      itemCls: el.classList.contains('item'),
      name: el.querySelector('.name span')?.textContent || '',
      desc: el.querySelector('.desc')?.textContent || '',
      cost: el.querySelector('.cost')?.textContent || '',
    } : null;
  });
  if (cardA && !cardA.tag && cardA.itemCls && /自动蒸馏/.test(cardA.desc) && /EP/.test(cardA.cost))
    ok('① 灵感工坊购买卡为标准 item 样式（无独立按钮）', cardA.desc);
  else bad('① 灵感工坊卡形态', JSON.stringify(cardA));
  const cardH = await page.evaluate(() => {
    const el = document.querySelector('#building-list .hatch-upg');
    return el ? {
      tag: !!el.querySelector('button'),
      desc: el.querySelector('.desc')?.textContent || '',
    } : null;
  });
  if (cardH && !cardH.tag && /自动孵化/.test(cardH.desc)) ok('① 孵化工坊购买卡为标准 item 样式', cardH.desc);
  else bad('① 孵化卡形态', JSON.stringify(cardH));

  // 购入并升级灵感工坊 ×2，验证位置不漂移 + 文案当前总计
  await page.evaluate(() => document.querySelector('#building-list [data-atrium-upg]')?.click());
  await sleep(400);
  await page.evaluate(() => document.querySelector('#building-list [data-atrium-upg]')?.click());
  await sleep(400);
  const upA = await page.evaluate(() => {
    const list = [...document.getElementById('building-list').children];
    const idx = list.findIndex(e => e.classList.contains('atrium-distill'));
    const hatchIdx = list.findIndex(e => e.classList.contains('hatch-upg'));
    const el = list[idx];
    const n = window.S.upgrades.atrium || 0;
    return { n, idx, beforeHatch: idx >= 0 && (hatchIdx === -1 || idx < hatchIdx), desc: el?.querySelector('.desc')?.textContent || '' };
  });
  if (upA.n === 2) ok('① 灵感工坊连续升级成功', `×${upA.n}`); else bad('① 升级失败', JSON.stringify(upA));
  if (upA.beforeHatch) ok('① 升级后工坊卡位置稳定（仍在孵化工坊前）'); else bad('① 卡位置漂移', JSON.stringify(upA));
  if (/-300 EP\/s/.test(upA.desc) && !/下级/.test(upA.desc)) ok('① 工坊卡文案为当前总计', upA.desc); else bad('① 工坊卡文案', upA.desc);

  // 升级孵化工坊 ×3，验证位置不漂移 + 文案
  for (let i = 0; i < 2; i++) { await page.evaluate(() => document.querySelector('#building-list [data-hatch-upg]')?.click()); await sleep(350); }
  const upH = await page.evaluate(() => {
    const list = [...document.getElementById('building-list').children];
    const ai = list.findIndex(e => e.classList.contains('atrium-distill'));
    const hi = list.findIndex(e => e.classList.contains('hatch-upg'));
    const el = list[hi];
    return { lv: window.S.ptHatchLv || 0, afterAtrium: hi > ai && hi >= 0, desc: el?.querySelector('.desc')?.textContent || '' };
  });
  if (upH.lv === 3) ok('① 孵化工坊连续升级成功', `×${upH.lv}`); else bad('① 孵化升级失败', JSON.stringify(upH));
  if (upH.afterAtrium) ok('① 孵化卡位置稳定（仍在灵感工坊后）'); else bad('① 孵化卡漂移', JSON.stringify(upH));
  if (/-15.00K EP\/s/.test(upH.desc) && !/下级/.test(upH.desc)) ok('① 孵化卡文案为当前总计', upH.desc); else bad('① 孵化卡文案', upH.desc);

  // ===== ③ 消耗统计补入灵感工坊 =====
  const drain3 = await page.evaluate(async () => {
    window.S.atriumOn = true;
    window.S.ptAutoHatch = true; window.S.ptDistillOn = true;
    window.S.ep = 1e7;
    const d1 = window.__qa.totalDrainPerSec();
    const lv1 = window.S.ptHatchLv, at1 = window.S.upgrades.atrium;
    window.S.ptHatchLv = lv1 + 1; window.S.upgrades.atrium = at1 + 1; // 孵化 +5000、工坊 +150
    const d2 = window.__qa.totalDrainPerSec();
    window.S.ptHatchLv = lv1; window.S.upgrades.atrium = at1;
    return { d1, d2, diff: d2 - d1 };
  });
  if (Math.abs(drain3.diff - 5150) < 1) ok('③ 升级孵化(+5000)/工坊(+150)后总消耗同步增大', `+${drain3.diff}/s`);
  else bad('③ 消耗未随升级增大', JSON.stringify(drain3));
  const tip3 = await page.evaluate(() => {
    const el = document.getElementById('h-salary');
    const st = el && el.closest('.stat');
    return { total: el?.textContent || '', tip: st?.dataset.tip || '' };
  });
  if (/灵感工坊 -/.test(tip3.tip)) ok('③ 消耗悬浮明细含「灵感工坊」', tip3.tip.split('｜')[0]);
  else bad('③ 悬浮明细缺灵感工坊', tip3.tip.slice(0, 120));
  // 工坊关闭 → 消耗不计（off 与 d1 同级数、去掉工坊 300：15000+48）
  const off3 = await page.evaluate(() => {
    window.S.atriumOn = false;
    const d = window.__qa.totalDrainPerSec();
    window.S.atriumOn = true;
    return d;
  });
  if (Math.abs(off3 - (drain3.d1 - 300)) < 1) ok('③ 工坊关闭时不计消耗', `diff=${(drain3.d1 - off3).toFixed(0)}/s`);
  else bad('③ 关闭口径', `off=${off3.toFixed(1)} expect=${(drain3.d1 - 300).toFixed(1)}`);

  // ===== ② 班组无转化器开关（班组面板常驻左列） =====
  await sleep(600);
  const crew2 = await page.evaluate(() => {
    const p = document.getElementById('crew-panel');
    return {
      exists: !!p,
      convBtns: p ? p.querySelectorAll('[data-conv-toggle]').length : -1,
      convTxt: /转化器开关/.test(p?.innerText || ''),
      autobind: !!p?.querySelector('[data-autobind]'),
    };
  });
  if (crew2.exists && crew2.convBtns === 0 && !crew2.convTxt) ok('② 班组面板已去掉转化器开关');
  else bad('② 班组转化器开关', JSON.stringify(crew2));
  if (crew2.autobind) ok('② 智能分配按钮保留'); else bad('② 智能分配丢失');

  // ===== ④ 异兽页孵化文案只写当前总计 =====
  await page.click('#btn-pets').catch(() => {});
  await sleep(700);
  const pets4 = await page.evaluate(() => {
    const g = document.getElementById('pet-grid');
    const t = g?.innerText || '';
    return { hasTotal: /总计 -/.test(t), hasNext: /下级/.test(t) };
  });
  if (pets4.hasTotal && !pets4.hasNext) ok('④ 孵化文案只写当前总计（无「下级」）'); else bad('④ 孵化文案', JSON.stringify(pets4));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
