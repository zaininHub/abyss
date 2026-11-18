// v4.2.8 校准诊断探针：ch2 输入跑 45 天，逐 5 天采样 esGain / runEarned / prestigeEsGain / techCount / chapter
// 用途：定位 esDelta=0 与 chapter 不推进的真实原因（只读探针，不入仓库纪律内的正式测试）
import { launchBrowser, prepPage, gotoAndSettle, sleep, TICKS_PER_DAY } from './_boot.mjs';
import { playerInit } from './_player.mjs';
import { seedFromSnapshot } from './_snapshot.mjs';
import { BUDGET } from './budget.mjs';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(new URL('./reports/ch2-report.json', import.meta.url), 'utf8')).inputSnapshot;

const browser = await launchBrowser();
const seed = seedFromSnapshot(input, { boost: BUDGET[2].carry || null, chapter: 2 });
const { page } = await prepPage(browser, { save: seed });
await gotoAndSettle(page);
await page.evaluate(playerInit, { prestigeGapTicks: 2880, goalChapter: 3, maxDays: BUDGET[2].maxDays,
  holdPrestigeUntilAdvanced: true, label: 'probe-ch2' });

for (let d = 1; d <= 45; d++) {
  const snap = await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
  if (d % 5 === 0 || snap.prestige > 2 || (snap.prestigeEsGain || 0) > 0) {
    const detail = await page.evaluate(() => {
      const S = window.S, q = window.__qa;
      return {
        runEarned: S.runEarned || 0, esGainNow: q.esGain ? q.esGain() : 'undefined',
        techCount: Object.keys(S.tech || {}).length + Object.keys(S.unlockedBuildings || {}).length,
        techList: Object.keys(S.tech || {}).join(','),
        unlockedBld: Object.keys(S.unlockedBuildings || {}).length,
        milesDone: Object.keys(S.milesDone || {}).length,
        chapterEnteredDays: S.chapterEnteredAt ? ((Date.now() - S.chapterEnteredAt) / 86400000).toFixed(1) : null,
        chapBuys: (window.__stats || {}).chapBuys || 0,
        chapTechs: (window.__stats || {}).chapTechs || [],
        errors: (window.__stats || {}).errors || [],
      };
    });
    console.log(`D${d}`, `ch=${snap.chapter}`, `pr=${snap.prestige}`, `esΔ=${snap.prestigeEsGain || 0}`,
      `rp=${Math.round(snap.rp)}`, `cps=${Math.round(snap.cps)}`,
      `runEarned=${(detail.runEarned / 1e6).toFixed(1)}M`, `esGainNow=${detail.esGainNow}`,
      `techCount=${detail.techCount}(${detail.techList || '无'}+${detail.unlockedBld}bld)`,
      `miles=${detail.milesDone}`, `entered=${detail.chapterEnteredDays}d前`,
      `chapBuys=${detail.chapBuys}`, `techs=${detail.chapTechs.join('|') || '无'}`);
    if (detail.errors.length) console.log('  errors:', detail.errors.slice(0, 4).join(' | '));
  }
  if (snap.prestige > 2) break; // 首次晋升后即可诊断
}
await browser.close();
