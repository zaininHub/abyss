// v2.3 奖励校准断言（PM §5.1 两锚点）：ΣRP ≥ 326×60%；单档 ≤ 终局结余 2.1M×5%。
// E2E：cps≥100 触发首档 +8 RP（合并后档位）；旧档已领 {100} 不补发。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

// ===== 源码断言：miles 表两锚点 =====
{
  const src = readFileSync('src/data/balance.js', 'utf-8');
  const m = /miles:\s*\[([\s\S]*?)\]/.exec(src);
  const pairs = m ? [...m[1].matchAll(/\{ cps: ([\de.]+), rp: (\d+) \}/g)] : [];
  const miles = pairs.map(p => ({ cps: Number(p[1]), rp: Number(p[2]) }));
  const sum = miles.reduce((a, b) => a + b.rp, 0);
  const maxRp = Math.max(...miles.map(x => x.rp));
  const KEY_TOTAL_RP = 326;          // 钥匙科技 RP 总需求（PM 锚点口径）
  const END_BALANCE = 2.1e6;         // 终局结余量级（族升级校准基准）
  rec('M1 miles 表可解析（7 档）', miles.length === 7, `n=${miles.length}`);
  rec('M2 锚点1：ΣRP ≥ 326×60%（196）', sum >= KEY_TOTAL_RP * 0.6, `ΣRP=${sum}`);
  rec('M3 锚点2：单档 ≤ 终局结余×5%（105000）', maxRp <= END_BALANCE * 0.05, `max=${maxRp}`);
  rec('M4 前 3 档合并：cps 5/10 档已移除', !miles.some(x => x.cps === 5 || x.cps === 10), JSON.stringify(miles.map(x => x.cps)));
  rec('M5 合并档位值：cps 100 → RP 8', miles.some(x => x.cps === 100 && x.rp === 8), '');
  rec('M6 后 3 档上调值：1e6/1e7/1e8 → 1000/5000/20000', miles.some(x => x.cps === 1e6 && x.rp === 1000) && miles.some(x => x.cps === 1e7 && x.rp === 5000) && miles.some(x => x.cps === 1e8 && x.rp === 20000), '');
}

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

// ===== E2E A：注入低 EP + 已购线程（cps≥100）→ 里程碑 +8 RP + 发现显示 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default',
      ep: 100, rp: 0, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
      upgrades: { intern: 2, scribble: 30, atrium: 1 },  // 47×2 + 0.3×30 = 103/s ≥ 100；atrium=1 为 RP 显示锚点（v2.3.1 ①）
      milesDone: {}, tech: {},
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const r = await page.evaluate(() => ({
    rpTxt: document.getElementById('h-rp')?.textContent,
    rpShown: document.getElementById('h-rp') && getComputedStyle(document.getElementById('h-rp').parentElement).display,
    mileLog: (document.getElementById('log-content')?.textContent || '').includes('+8 RP'),
  }));
  rec('A1 cps≥100 触发合并档里程碑 +8 RP（日志为证，含工坊产出微增）', r.mileLog && parseFloat(r.rpTxt) >= 8 && parseFloat(r.rpTxt) < 20, `rp=${r.rpTxt}, log=${r.mileLog}`);
  rec('A2 里程碑 RP 入账 + 灵感工坊锚点完成 → 顶栏显示', r.rpShown !== 'none', String(r.rpShown));
  rec('A3 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== E2E B：旧档已领 {5,10,100} 不补发 8（milesDone 以 cps 值为键） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default',
      ep: 1e9, rp: 7, es: 0, faith: 0, pt: 0, dm: 0, prestigePoints: 0,
      upgrades: { intern: 2 }, milesDone: { '5': true, '10': true, '100': true }, tech: {},
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: true, es: false, faith: false, pt: false, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1500);
  const rp = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}').rp);
  rec('B1 旧档已领 100 不补发 8（rp 恒 7）', rp === 7, `rp=${rp}`);
  rec('B2 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

await browser.close();
const fail = results.filter(r => !r.ok).length;
console.log(`\n[v23-reward] ${results.length - fail}/${results.length} 项通过`);
process.exit(fail ? 1 : 0);
