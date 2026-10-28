// v2.2.1 真实试玩自测：file:// 直开 dist，效能建筑连购 3 次等级=3、显示随存档一致
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const SHOT = process.cwd() + '/../../artifacts/screenshots_v221/';
mkdirSync(SHOT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.evaluateOnNewDocument(() => {
  localStorage.removeItem('abyss_idle_v2');
  localStorage.setItem('abyss_idle_v2', JSON.stringify({
    _version: 5, chapter: '6A', storyline: 'default',
    ep: 1e6, rp: 1e7, milesDone: {}, tech: {},
    unlockedBuildings: { warmup_node: true },
    buildings: { warmup_node: 0 },
    upgrades: { storage: 20 }, lastSeen: Date.now(), startTime: Date.now(), // v2.8.27：存储抬 EP 上限（storage 20 → cap≈21K ≥ warmup 首级 20K）
  }));
});
await page.goto('file://' + process.cwd() + '/dist/index.html', { waitUntil: 'networkidle0' });
await sleep(1500);
// 真实连点 3 次「预热节点」（先等卡渲染，防全量并发时序）
await page.waitForSelector('[data-v21="warmup_node"]', { timeout: 8000 }).catch(() => {});
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => document.querySelector('[data-v21="warmup_node"]')?.click());
  await sleep(700);
}
await page.screenshot({ path: SHOT + 'play_v221_3buys.png' });
const final = await page.evaluate(() => ({
  display: document.querySelector('[data-v21="warmup_node"]')?.querySelector('.count')?.textContent,
  price: document.querySelector('[data-v21="warmup_node"]')?.querySelector('.cost')?.textContent,
}));
await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
await sleep(400);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}').buildings?.warmup_node);
console.log(`连购 3 次 → 存档等级=${saved}（期望 3）, DOM=${final.display}（期望 Lv.3/5）, 4 级价=${final.price}（期望 ~43.94K EP）`);
console.log(`页面错误：${errs.length === 0 ? '无' : errs.join('; ')}`);
await browser.close();
if (saved !== 3 || final.display !== 'Lv.3/5' || !/K EP/.test(final.price || '') || errs.length) { console.error('真实试玩自测失败'); process.exit(1); } // v2.8.7：warmup base 2e4 → 4 级价 43.94K EP
console.log('真实试玩自测通过');
