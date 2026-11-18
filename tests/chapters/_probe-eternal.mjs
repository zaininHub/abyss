// v4.2.6 校准探针：ch2 输入下 __chapterTick 永恒矩阵动作是否真的执行（临时脚本，验证后删除）
import { launchBrowser, prepPage, gotoAndSettle, TICKS_PER_DAY } from './_boot.mjs';
import { playerInit } from './_player.mjs';
import { seedFromSnapshot } from './_snapshot.mjs';
import { BUDGET } from './budget.mjs';

const b = BUDGET[2];
const seed = seedFromSnapshot(b.carry, { boost: b.carry, chapter: 2 });
const browser = await launchBrowser();
const { page } = await prepPage(browser, { save: seed });
await gotoAndSettle(page);
await page.evaluate(playerInit, { prestigeGapTicks: 2880, goalChapter: 3, maxDays: 5, label: 'probe' });
for (let d = 0; d < 3; d++) await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
const probe = await page.evaluate(() => {
  const S = window.S, q = window.__qa, st = window.__stats;
  const out = { es: S.es, hasEternals: !!q.ETERNALS, hasBuy: !!q.buyEternal,
    eternalType: typeof S.eternal, eternalIsNull: S.eternal === null,
    eternalKeys: S.eternal ? Object.keys(S.eternal).length : String(S.eternal),
    eternalRaw: JSON.stringify(S.eternal),
    eternalBuys: st.eternalBuys || 0, chapBuys: st.chapBuys || 0,
    errors: (st.errors || []).slice(0, 3) };
  try {
    const keep = S.es * 0.1;
    let pick = null, best = Infinity;
    for (const e of q.ETERNALS || []) {
      if (e.id.startsWith('skin_')) continue;
      if (((S.eternal || {})[e.id] || 0) >= (e.cap || 0)) continue;
      const c = q.esCost(e);
      if (c <= S.es - keep && c < best) { best = c; pick = e; }
    }
    out.picked = pick ? { id: pick.id, cost: best } : null;
    if (pick) { q.buyEternal(pick); out.afterEs = S.es; out.eternalAfter = S.eternal[pick.id]; }
  } catch (e) { out.manualError = e.message; }
  return out;
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
