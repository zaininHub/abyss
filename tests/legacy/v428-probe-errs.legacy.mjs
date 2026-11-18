// v4.2.8 七轮探针：ch2 跑 25 天抓 __stats.errors 全文（只读诊断）
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
  holdPrestigeUntilAdvanced: true, label: 'probe-errs' });
for (let d = 1; d <= 25; d++) {
  const snap = await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
  if (d % 5 === 0 || snap.chapter !== '2') {
    const det = await page.evaluate(() => {
      const S = window.S, q = window.__qa, st = window.__stats;
      return {
        techCount: Object.keys(S.tech || {}).length + Object.keys(S.unlockedBuildings || {}).length,
        techList: Object.keys(S.tech || {}).join(','),
        bld: Object.keys(S.unlockedBuildings || {}).join(','),
        vault: (S.upgrades || {}).rp_vault || 0,
        chapBuys: st.chapBuys || 0, atriumToggles: st.atriumToggles || 0,
        errors: st.errors.slice(0, 12),
      };
    });
    console.log(`D${d}`, `ch=${snap.chapter}`, `pr=${snap.prestige}`, `cps=${Math.round(snap.cps)}`,
      `techCount=${det.techCount}`, `bld=[${det.bld}]`, `vault=${det.vault}`,
      `chapBuys=${det.chapBuys}`, `atriumTgl=${det.atriumToggles}`);
    if (det.errors.length) console.log('  errors:', JSON.stringify(det.errors, null, 0).slice(0, 800));
  }
  if (snap.chapter !== '2') break;
}
await browser.close();
console.log('probe-errs done');
