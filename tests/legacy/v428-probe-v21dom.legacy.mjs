// v4.2.8 六轮探针：ch2 种子注入 + 手动买 rp_vault 后查 v21 区 DOM（只读诊断）
import { launchBrowser, prepPage, gotoAndSettle, TICKS_PER_DAY } from './_boot.mjs';
import { playerInit } from './_player.mjs';
import { seedFromSnapshot } from './_snapshot.mjs';
import { BUDGET } from './budget.mjs';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(new URL('./reports/ch2-report.json', import.meta.url), 'utf8')).inputSnapshot;
const browser = await launchBrowser();
const seed = seedFromSnapshot(input, { boost: BUDGET[2].carry || null, chapter: 2 });
const { page } = await prepPage(browser, { save: seed });
await gotoAndSettle(page);
await page.evaluate(playerInit, { prestigeGapTicks: 2880, goalChapter: 3, maxDays: 30,
  holdPrestigeUntilAdvanced: true, label: 'probe-v21dom' });
// 跑 6 天让 EP 起来，然后手动触发 ⓪ 买 rp_vault，再查 DOM
for (let d = 1; d <= 6; d++) await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
const r = await page.evaluate(() => {
  const S = window.S, q = window.__qa;
  // 手动买 rp_vault（与 ⓪ 同判定）
  let buyLog = 'skip';
  if ((S.upgrades && S.upgrades.rp_vault) < 1) {
    const u = q.UPGRADES.find(x => x.id === 'rp_vault');
    const c = u && q.bulkCostCalc(u, 1);
    if (u && Number.isFinite(c) && c <= S.ep * 0.9) {
      const r2 = q.sim.buyUpgrade(u);
      buyLog = 'buyUpgrade -> ' + JSON.stringify(r2) + ' vault=' + (S.upgrades || {}).rp_vault;
    } else buyLog = 'cannot afford: cost=' + c + ' ep=' + S.ep;
  } else buyLog = 'already owned';
  window.__gameDirty.shop = true;
  q.sim.render();
  const list = document.getElementById('v21-building-list');
  const cards = list ? [...list.querySelectorAll('[data-v21]')] : [];
  return {
    buyLog, vault: (S.upgrades || {}).rp_vault || 0,
    anchorRp: q.anchorDone ? q.anchorDone('rp', S) : 'no-hook',
    listExists: !!list, delegated: list ? !!list.dataset.v21Delegated : null,
    cardCount: cards.length,
    cards: cards.slice(0, 6).map(el => el.dataset.v21 + (el.classList.contains('locked') ? '(locked)' : '')),
    listHtmlLen: list ? list.innerHTML.length : 0,
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
