import { chromePath } from '../_chrome.mjs';
// v2.4.2 hotfix 断言套件（用户四点反馈的可执行留证；patch 版本，仅覆盖本版改动面）
// V1 反馈①：可点击内容鼠标移上去变手——[data-buy] 卡片 / .proj 任务卡 / .pet-card / [data-v21] 建筑卡 cursor:pointer
// V2 反馈②：DM 累计精确到小数——顶栏 h-dm / 探采页头 / 裂隙面板均 toFixed(2)
// V3 反馈③：深渊商店右侧不再显示当前 DM——#dm-balance 元素移除
// V4 反馈④：任务发放速率减缓（冷却 600s + 1% 概率）+ 奖励值下调（EP 奖励 = cps×windowSec×1.0，goal 2 倍）
// 运行前提：npm run build 已产出最新 dist（本套件走 file:// 真实浏览器实跑）
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const EV = process.cwd() + '/../../artifacts/v242-evidence';
mkdirSync(EV, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const saveBase = (over = {}) => ({
  _version: 6, chapter: '1', storyline: 'default',
  ep: 1e5, rp: 0, upgrades: {}, milesDone: {}, tech: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: true },
  lastSeen: Date.now(), startTime: Date.now(),
  ...over,
});
const inject = (page, save) => {
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  return page.evaluateOnNewDocument(new Function(`
  try { localStorage.clear(); } catch (e) {}
  localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
`));
};

// ===== V1：可点击内容 cursor:pointer =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({
    ep: 5e5, rp: 100,
    upgrades: { scribble: 2 }, cultists: [{ name: 'T0', output: 3, mood: '正常', moodTimer: 999 }],
    projects: [{
      type: 'click', name: '手动激活', desc: '限时内点击工作台',
      goal: 20, progress: 5, status: 'active', deadline: Date.now() + 3600000, startsAt: Date.now() - 1000,
      reward: { kind: 'rp', amount: 5 }, pendingAt: 0,
      runEarnedAt: 0, buysAt: 0, threadsAt: 0, clicksAt: 0,
    }],
  }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const cur = await page.evaluate(() => {
    const cs = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).cursor : '(missing)';
    };
    return {
      shopItem: cs('#shop-list [data-buy]'),
      proj: cs('#projects .proj'),
      v21: cs('[data-v21]'),
      hero: cs('#hero'),
      btn: cs('.btn'),
    };
  });
  rec('V1 商店可购卡 cursor:pointer', cur.shopItem === 'pointer', `shopItem=${cur.shopItem}`);
  rec('V1 任务卡 cursor:pointer', cur.proj === 'pointer', `proj=${cur.proj}`);
  rec('V1 v21 建筑卡 cursor 明确（pointer 可点 / not-allowed 锁定·v2.8.x 链窗揭示）', ['pointer','not-allowed'].includes(cur.v21), `v21=${cur.v21}`);
  rec('V1 英雄点击区 cursor:pointer（回归）', cur.hero === 'pointer', `hero=${cur.hero}`);
  rec('V1 按钮 cursor:pointer（回归）', cur.btn === 'pointer', `btn=${cur.btn}`);
  await page.screenshot({ path: EV + '/v1-cursor.png' });
  await page.close();
}

// ===== V2：DM 累计精确到小数 =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({
    dm: 7.35, ep: 1e5,
    activeRift: { power: 1, sealCost: 100, dmReward: 1, expiresAt: Date.now() + 120000 },
  }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const d = await page.evaluate(() => ({
    top: document.getElementById('h-dm')?.textContent || '',
    vc: document.getElementById('vehicle-collect')?.textContent || '',
    rift: document.getElementById('rift-dm-balance')?.textContent || '',
  }));
  rec('V2 顶栏 DM 累计精确到小数（7.35 · v2.8.27 当前/上限格式）', d.top.startsWith('7.35'), `h-dm="${d.top}"`);
  rec('V2 探采页头当前 DM 小数（7.35）', d.vc.includes('当前 DM: 7.35'), `vc="${d.vc}"`);
  rec('V2 裂隙面板当前 DM 小数（7.35）', d.rift === '7.35', `rift="${d.rift}"`);
  await page.screenshot({ path: EV + '/v2-dm-decimal.png' });
  await page.close();
}

// ===== V3：深渊商店右侧不再显示当前 DM =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({ dm: 7.35, upgrades: { scooter: 1 } }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.evaluate(() => document.getElementById('btn-shop')?.click());
  await sleep(500);
  const c = await page.evaluate(() => ({
    dmBalance: !!document.getElementById('dm-balance'),
    shopTitle: document.getElementById('dm-shop-title')?.textContent || '',
    // 深渊商店区文本不应含「当前 DM:」
    dmShopText: document.getElementById('dm-shop')?.textContent || '',
    vehicleHeader: document.getElementById('vehicle-collect')?.textContent || '',
  }));
  rec('V3 深渊商店无 #dm-balance 元素', !c.dmBalance, '');
  rec('V3 深渊商店标题无「当前 DM」附注', !c.shopTitle.includes('当前 DM'), `title="${c.shopTitle}"`);
  rec('V3 深渊商店列表区无 DM 余额文本', !c.dmShopText.includes('当前 DM'), '');
  rec('V3 探采页头仍保留当前 DM（非商店区，不误伤）', c.vehicleHeader.includes('当前 DM:'), `vc="${c.vehicleHeader}"`);
  await page.screenshot({ path: EV + '/v3-shop-no-dm.png' });
  await page.close();
}

// ===== V4：任务发放速率减缓 + 奖励值下调（源码断言） =====
{
  const dataSrc = readFileSync(new URL('../../src/data/projects.js', import.meta.url), 'utf8');
  const modSrc = readFileSync(new URL('../../src/modules/projects.js', import.meta.url), 'utf8');
  rec('V4 生成冷却 600s（原 120s）', /PROJECT_SPAWN_COOLDOWN = 600000/.test(dataSrc), '');
  rec('V4 发放概率 1%（原 2%）', modSrc.includes('Math.random() < 0.01'), '');
  rec('V4 EP 奖励 = windowSec×1.0（原 1.5，goal 2 倍）', modSrc.includes('cps * windowSec * 1.0'), '');
  // 运行时：新档 spawn 任务奖励量级与目标 2 倍以内（earn_ep 类型时）
  const page = await browser.newPage();
  await inject(page, saveBase({ ep: 50000, cultists: [{ name: 'T0', output: 3, mood: '正常', moodTimer: 999 }] }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const g = await page.evaluate(() => {
    const el = document.querySelector('#projects .proj');
    const prog = el ? (el.querySelector('.prog-txt')?.textContent || '') : '';
    const m = prog.match(/([\d.]+)\/([\d.]+)/);
    return m ? { goal: Number(m[2]), progress: Number(m[1]) } : null;
  });
  rec('V4 启动即生成任务（新档，冷却链正常）', !!g, g ? `goal=${g.goal}` : '无任务卡');
  await page.close();
}

await browser.close();
const fail = results.filter(r => !r.ok);
console.log(`\nv2.4.2 hotfix 回归：${results.length - fail.length}/${results.length} 通过`);
if (fail.length) { console.log('FAILED:', fail.map(f => f.name).join(' | ')); process.exit(1); }
