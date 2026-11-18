// esGain QA 钩子迷你探针：验证 dist 里 q.esGain 可调用且数值正确（30 秒）
import { launchBrowser, prepPage, gotoAndSettle } from './_boot.mjs';
import { seedFromSnapshot } from './_snapshot.mjs';
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(new URL('./reports/ch2-report.json', import.meta.url), 'utf8')).inputSnapshot;
const browser = await launchBrowser();
const { page } = await prepPage(browser, { save: seedFromSnapshot(input, { chapter: 2 }) });
await gotoAndSettle(page);
const r = await page.evaluate(() => {
  const q = window.__qa, S = window.S;
  const out = { esGainType: typeof q.esGain };
  S.runEarned = 1.56e10;               // p=2 晋升时点量级
  out.atNeed = q.esGain ? q.esGain() : null;
  S.runEarned = 4.4e10;                // p=5 时点量级
  out.atLate = q.esGain ? q.esGain() : null;
  S.runEarned = 3e9;                   // 首升门槛
  out.atFirst = q.esGain ? q.esGain() : null;
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
