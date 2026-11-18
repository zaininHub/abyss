// 最小复现：ch2 种子注入后直接调 rp_vault 的 bulkCostCalc + buyUpgrade
import { launchBrowser, prepPage, gotoAndSettle } from './_boot.mjs';
import { seedFromSnapshot } from './_snapshot.mjs';
import { BUDGET } from './budget.mjs';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(new URL('./reports/ch2-report.json', import.meta.url), 'utf8')).inputSnapshot;
const browser = await launchBrowser();
const seed = seedFromSnapshot(input, { boost: BUDGET[2].carry || null, chapter: 2 });
const { page } = await prepPage(browser, { save: seed });
await gotoAndSettle(page);
const r = await page.evaluate(() => {
  const S = window.S, q = window.__qa;
  const u = q.UPGRADES.find(x => x.id === 'rp_vault');
  if (!u) return { found: false };
  let cost = null, costErr = null;
  try { cost = q.bulkCostCalc(u, 1); } catch (e) { costErr = e.message; }
  const cap = q.epStorageCap();
  // 模拟 chapterTick ⓪ 的判定
  const wouldBuy = cost !== null && Number.isFinite(cost) && cost <= S.ep * 0.9;
  let buyRes = null, buyErr = null;
  if (wouldBuy) { try { buyRes = q.sim.buyUpgrade(u); } catch (e) { buyErr = e.message; } }
  return { found: true, base: u.base, cost, costErr, ep: S.ep, cap,
    overflowSeen: !!S._rpOverflowSeen, resRp: !!(S.resDiscovered && S.resDiscovered.rp),
    wouldBuy, buyRes, buyErr, vaultAfter: (S.upgrades || {}).rp_vault };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
