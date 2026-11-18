// v4.2.8 校准三轮探针（分类版）：ch2 输入跑 8 天，逐 2 天采样 EP/CPS/chapBuys 分类计数
// 用途：chapBuys 每周期 5.9 次的构成 + EP 恒 0 的消费去向（只读诊断，不入正式测试）
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
  holdPrestigeUntilAdvanced: true, label: 'probe-ch2c' });

// 注入分类计数器（包一层 __chapterTick）
await page.evaluate(() => {
  const orig = window.__chapterTick;
  window.__tickClass = { entry: 0, tech: 0, bld: 0, exp: 0, eternal: 0, other: 0 };
  window.__epSpend = [];
  window.__chapterTick = () => {
    const before = (window.__stats || {}).chapBuys || 0;
    const epBefore = window.S.ep;
    orig();
    const after = (window.__stats || {}).chapBuys || 0;
    if (after > before) {
      const S = window.S;
      const cls = S.upgrades.rp_vault >= 1 && (S.upgrades.atrium || 0) >= 1 ? 'other' : 'entry';
      // 粗分类：EP 减少了 → 入口/建筑花 EP；ES 减少了 → 永恒
      window.__tickClass[epBefore > S.ep ? (S.ep < epBefore && before + 1 === after ? 'entry' : 'bld') : 'eternal'] += after - before;
    }
  };
});

for (let d = 1; d <= 12; d++) {
  const snap = await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
  if (d % 2 === 0) {
    const detail = await page.evaluate(() => {
      const S = window.S, q = window.__qa;
      return {
        cls: { ...window.__tickClass },
        cap: q.epStorageCap(),
        upgradesRpVault: (S.upgrades || {}).rp_vault || 0,
        upgradesAtrium: (S.upgrades || {}).atrium || 0,
        upgradesAll: Object.keys(S.upgrades || {}).length,
        buildLv: Object.entries(S.buildings || {}).filter(([k, v]) => v > 0).map(([k, v]) => k + ':' + v).slice(0, 8).join(' '),
        aiAssistants: q.assistantCount(),
        aiBound: q.crewBoundTotal(),
        es: S.es || 0, eternalLv: Object.keys(S.eternal || {}).length,
        errors: ((window.__stats || {}).errors || []).slice(0, 3),
      };
    });
    console.log(`D${d}`, `ch=${snap.chapter}`, `pr=${snap.prestige}`,
      `ep=${(snap.ep / 1e3).toFixed(1)}K`, `cap=${(detail.cap / 1e3).toFixed(1)}K`, `cps=${Math.round(snap.cps)}`,
      `rp=${Math.round(snap.rp)}`, `es=${detail.es}`, `buys=${snap.totalBuys}`);
    console.log('   分类:', JSON.stringify(detail.cls),
      '| rp_vault:', detail.upgradesRpVault, 'atrium:', detail.upgradesAtrium, 'upgrades:', detail.upgradesAll);
    console.log('   建筑:', detail.buildLv || '无', '| AI助手:', detail.aiAssistants, '绑定:', detail.aiBound,
      '| eternal键:', detail.eternalLv, '| errors:', detail.errors.join('|') || '无');
  }
}
await browser.close();
console.log('probe-ch2c done');
