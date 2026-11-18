// v4.2.8 校准二轮探针：ch2 输入跑 40 天，逐 5 天采样 techCount / 科技清单 / 建筑数 / 里程碑 / chapBuys
// 用途：定位 ch3 gate techCount>=9 卡在哪个维度（科技没买齐 vs 建筑没解锁 vs 里程碑不够）
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
  holdPrestigeUntilAdvanced: true, label: 'probe-ch2b' });

for (let d = 1; d <= 20; d++) {
  const snap = await page.evaluate(t => window.__runBatch(t), TICKS_PER_DAY);
  if (d % 5 === 0 || snap.chapter !== '2') {
    const detail = await page.evaluate(() => {
      const S = window.S, q = window.__qa;
      // 逐科技检查：为什么没买（rp 不够 / ep 不够 / buyTech 静默拦截）
      const pend = [];
      for (const t of q.getTechs()) {
        if (S.tech[t.id]) continue;
        const c = t.cost || {};
        pend.push(`${t.id}(rp${Math.ceil(c.rp||0)}/ep${c.ep||0}/${(S.rp||0)>=Math.ceil(c.rp||0)?'rp✓':'rp✗'}${(S.ep||0)>=(c.ep||0)?'ep✓':'ep✗'})`);
      }
      // 建筑解锁判定：为什么 unlockedBuildings 少
      const blds = [];
      const list = document.getElementById('v21-building-list');
      const bal = (q.BALANCE && q.BALANCE.buildingsV21) || [];
      for (const b of bal) {
        const unlocked = !!(S.unlockedBuildings && S.unlockedBuildings[b.id]);
        if (!unlocked) {
          const m = (() => { const p = b.basePrice ?? b.price ?? b.base ?? 0;
            return p >= 4e6 ? 7 : p >= 1.5e6 ? 6 : p >= 6e5 ? 5 : 0; })();
          blds.push(`${b.id}(m${m}/miles${Object.keys(S.milesDone||{}).length}${m<=Object.keys(S.milesDone||{}).length?'✓':'✗'})`);
        }
      }
      return {
        techCount: Object.keys(S.tech || {}).length + Object.keys(S.unlockedBuildings || {}).length,
        techList: Object.keys(S.tech || {}).join(','),
        unlockedBld: Object.keys(S.unlockedBuildings || {}).join(',') || '无',
        miles: Object.keys(S.milesDone || {}).length,
        pendTechs: pend.slice(0, 8).join(' '),
        lockBlds: blds.slice(0, 10).join(' '),
        chapBuys: (window.__stats || {}).chapBuys || 0,
        errors: ((window.__stats || {}).errors || []).slice(0, 4),
      };
    });
    console.log(`D${d}`, `ch=${snap.chapter}`, `pr=${snap.prestige}`,
      `rp=${Math.round(snap.rp)}`, `cps=${Math.round(snap.cps)}`, `ep=${(snap.ep/1e6).toFixed(1)}M`,
      `techCount=${detail.techCount}`, `tech=[${detail.techList}]`, `bld=[${detail.unlockedBld}]`,
      `miles=${detail.miles}`, `chapBuys=${detail.chapBuys}`);
    if (d % 10 === 0) {
      console.log('   待购科技:', detail.pendTechs || '无');
      console.log('   未解锁建筑:', detail.lockBlds || '无');
      console.log('   errors:', detail.errors.join('|') || '无');
    }
  }
  if (snap.chapter !== '2') { console.log('>>> 已推进到', snap.chapter, 'D' + d); break; }
}
await browser.close();
console.log('probe-ch2b done');
