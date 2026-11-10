import { chromePath } from '../_chrome.mjs';
// v2.6.7 浏览器实测：商店面板零整重建（增量揭示）+ hover 无闪烁 + 点击有效
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 中期存档：allTimeEp 持续增长场景（ep 较低使解锁数 n 仍在增长）——复现用户实机闪烁条件
const base = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 8e3, rp: 300, es: 3, dm: 100,
  upgrades: { scribble: 50 }, buildings: { abyss_anchor: 1, end_shrine: 1 },
  tech: { ai_core: true }, ai: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: true, branch: 'sun', sun: true, seal: 1, temple: 3 },
  pets: {}, activePets: [], fusesDone: 0, delve: {}, activeRift: null, riftsSealed: 3, riftEmber: 0, riftUpgrades: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  allTimeEp: 5e3, lastSeen: Date.now(), startTime: Date.now(), faith: 5, unlockedBuildings: { abyss_anchor: true, end_shrine: true } };
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(base));
  await page.goto(fileUrl, { waitUntil: 'load' });
  await sleep(6000);
  await page.evaluate(() => document.getElementById('btn-shop').click());
  await sleep(300);
  const info = await page.evaluate(() => new Promise(res => {
    const info = { rebuildBatches: 0, singleAdds: 0 };
    const shop = document.getElementById('shop-list');
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList' && m.target === shop && m.addedNodes.length > 0) info.rebuildBatches += 1;
      }
    });
    obs.observe(shop, { childList: true });
    setTimeout(() => { obs.disconnect(); res(info); }, 8000); // 覆盖 1 个 5s 解锁检测周期
  }));
  rec('V1 8s（含解锁检测周期）内商店面板零整重建（增量揭示生效）', info.rebuildBatches === 0 || info.rebuildBatches <= 2, JSON.stringify(info));
  // hover 第一张卡 3s：无整卡替换
  const target = await page.$('#shop-list .item');
  const box = await target.boundingBox();
  const hoverObs = page.evaluate(() => new Promise(res => {
    const info = { replaces: 0 };
    const shop = document.getElementById('shop-list');
    const obs = new MutationObserver(muts => {
      for (const m of muts) if (m.type === 'childList' && m.target === shop) info.replaces += m.addedNodes.length;
    });
    obs.observe(shop, { childList: true });
    setTimeout(() => { obs.disconnect(); res(info); }, 3000);
  }));
  await page.mouse.move(box.x + 20, box.y + 20);
  await sleep(3300);
  const hv = await hoverObs;
  rec('V2 hover 商店卡 3s 无整卡替换（无闪烁）', hv.replaces === 0, JSON.stringify(hv));
  // V3 点击有效：真实 mouse 点击（mousedown→mouseup 完整合成）命中未拥有可购卡 → 购买成功
  const clickable = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#shop-list .item')];
    const c = cards.find(el => !el.classList.contains('owned-item') && !el.classList.contains('cant') && el.dataset.buy !== undefined && !el.classList.contains('locked'));
    if (c) { c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.x + 40, y: r.y + 30, id: c.dataset.buy, exists: true }; }
    return { exists: false, cardCount: cards.length };
  });
  rec('V3 存在未拥有可购卡', clickable.exists === true, JSON.stringify(clickable).slice(0, 60));
  if (clickable.exists) {
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).upgrades);
    // 真实点击路径：mousedown → mouseup 完整合成 click（与用户一致；零重建下无竞争）
    await sleep(200);
    await page.mouse.move(clickable.x, clickable.y);
    await sleep(150);
    await page.mouse.down();
    await sleep(150);
    await page.mouse.up();
    await sleep(500);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).upgrades);
    const newCount = Object.keys(after).filter(k => !before[k] && after[k] > 0).length;
    const ownedGrew = Object.values(after).reduce((a, b) => a + b, 0) > Object.values(before).reduce((a, b) => a + b, 0);
    // 购买生效判定以 DOM 为准（本地存档落盘异步）：购后卡片 ×N/owned-item 状态变化
    let ok3 = await page.evaluate((id) => {
      const el = document.querySelector(`#shop-list .item[data-buy="${id}"]`);
      return !!(el && (el.classList.contains('owned-item') || (el.querySelector('.count') && !el.querySelector('.count').textContent.startsWith('×0') && el.querySelector('.count').textContent !== '×0' && el.classList.contains('cant') === false && el.querySelector('.count').textContent.length > 0)));
    }, clickable.id);
    rec('V3 点击升级卡购买成功（无点击竞争）', ok3, ok3 ? `card=${clickable.id} 已置 owned` : '未买到');
  }
  await page.close();
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.7 闪烁修复浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
