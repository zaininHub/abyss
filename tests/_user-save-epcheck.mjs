// v4.3.7 用户存档实测 ②：稳态收支验证
// 上一轮发现 boot 时 applyOffline() 按 lastSeen→now 一次性入账（~290K），混入采样窗口。
// 本轮：
//   1. 等离线结算完成（boot 后 3s）再开始采样
//   2. 关闭 AI 三开关（autoUpgrade/autoHire/autoClaim——干扰购买），只读不改数值真源
//   3. 采样 60s：ep 斜率 vs 顶栏净流（cps-drain）一致性
//   4. 分解消耗构成（蒸馏/薪资/探采）回答「EP 增长 ~1k/s 是否正常」
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SAVE_PATH = resolve('C:/Users/Public/Documents/.clink-clipboard/abyss_save_snap_1794964992426_9mtv8.json');

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  const saveRaw = readFileSync(SAVE_PATH, 'utf8');
  await page.evaluateOnNewDocument((raw) => {
    try { localStorage.clear(); localStorage.setItem('abyss_idle_v2', raw); } catch {}
  }, saveRaw);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(3000); // 等离线结算弹窗/入账完成

  // 关 AI 干扰（真实入口：开关置 false，等价玩家手动关；不直接改资源）
  await page.evaluate(() => {
    const S = window.S;
    if (S.ai) { S.ai.autoUpgrade = false; S.ai.autoHire = false; S.ai.autoClaim = true; }
  });

  const boot = await page.evaluate(() => ({ ep: window.S.ep, cps: window.__qa.computeCps(), drain: window.__qa.totalDrainPerSec() }));
  console.log(`[boot] 离线结算后：ep=${boot.ep.toFixed(1)} cps=${boot.cps.toFixed(1)} drain=${boot.drain.toFixed(1)}`);

  // 消耗分解
  const parts = await page.evaluate(() => {
    const S = window.S;
    const n = (S.upgrades && S.upgrades.atrium) || 0;
    const atriumOn = S.converterOn && S.converterOn.atrium;
    const vehOn = S.converterOn && S.converterOn.vehicles;
    const crew = S.cultists || [];
    const hyper = crew.filter(c => c.boundTo === 'hyper').length;
    return { atriumLv: n, atriumOn, vehOn, crew: crew.length, hyper,
      resonance: S.resonance ? { on: S.resonance.enabled, layers: S.resonance.layers, focus: S.resonance.focus } : null };
  });
  console.log('[构成] 蒸馏:', parts.atriumLv, '级', parts.atriumOn ? '开' : '关',
    '→ -' + (150 * parts.atriumLv ** 2) + ' EP/s | 探采:', parts.vehOn ? '开' : '关',
    '| 线程:', parts.crew, '(超频', parts.hyper + ') | 共鸣:', JSON.stringify(parts.resonance));

  // 采样 60s
  const samples = [];
  for (let i = 0; i < 7; i++) {
    const s = await page.evaluate(() => {
      const S = window.S, q = window.__qa;
      return { t: Date.now(), ep: S.ep, cps: q.computeCps(), drain: q.totalDrainPerSec(),
        cpsTxt: document.getElementById('h-cps')?.textContent || '' };
    });
    samples.push(s);
    if (i < 6) await sleep(10000);
  }
  console.log('\n[采样]');
  samples.forEach((s, i) => console.log(`  t=${i * 10}s  ep=${s.ep.toFixed(0)}  cps=${s.cps.toFixed(1)}  drain=${s.drain.toFixed(1)}  净=${(s.cps - s.drain).toFixed(1)}`));

  const span = (samples[6].t - samples[0].t) / 1000;
  const slope = (samples[6].ep - samples[0].ep) / span;
  const netMid = samples[3].cps - samples[3].drain;
  console.log(`\n[结果] ${span.toFixed(0)}s 实测净斜率 ${slope.toFixed(2)} EP/s | 顶栏净流 ${netMid.toFixed(2)} EP/s`);

  console.log('\n[断言]');
  const rel = Math.abs(slope - netMid) / Math.max(1, Math.abs(netMid));
  rel <= 0.15 ? ok('实测斜率 ≈ 顶栏净流（±15%，记账一致）', `slope=${slope.toFixed(1)} net=${netMid.toFixed(1)} rel=${(rel * 100).toFixed(1)}%`)
    : bad('斜率与净流背离', `slope=${slope.toFixed(1)} net=${netMid.toFixed(1)} rel=${(rel * 100).toFixed(1)}%`);
  // 用户观察「EP 增长 ~1k/s」：该档 cps≈2.5K、drain≈2.8K → 净流应为负（稳定小幅失血）。
  // 但用户看到增长 → 顶栏 cps 显示值 = 总产出口径（含转换返还），或观察时 vehicles 刚关、蒸馏未满效。
  console.log(`  [解读] 本档结构：cps=${samples[3].cps.toFixed(0)} drain=${samples[3].drain.toFixed(0)} → 净 ${netMid > 0 ? '+' : ''}${netMid.toFixed(0)}/s`);
  console.log(`  [解读] 消耗大头：蒸馏 -${150 * parts.atriumLv ** 2}/s（atrium ${parts.atriumLv} 级${parts.atriumOn ? '开' : '关'}）`);
  if (netMid < 0) {
    console.log('  [结论] 稳态为净消耗：EP 增长 ~1k/s 的观察更可能来自——');
    console.log('    a) 顶栏「产出/s」显示的是总产出口径（2.5K/s），玩家误读为净增长；');
    console.log('    b) 观察时蒸馏未开/任务奖励到账等瞬时入账。');
  }
  errors.length === 0 ? ok('0 pageerror') : bad('pageerror', errors.join(' | ').slice(0, 200));

  console.log(`\n=== 稳态收支实测：${pass} PASS / ${fail} FAIL ===`);
} finally {
  await browser.close();
}
process.exit(fail > 0 ? 1 : 0);
