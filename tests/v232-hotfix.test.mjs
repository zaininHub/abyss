// v2.3.2 hotfix 断言套件（组长派发第一段，四项验收的可执行留证）
// FB 反馈②：外勤摩托队旁异常输入框——复现定位为「载具命名彩蛋」input（owned>0 渲染，非倍率残留），
//    按缺陷口径移除（shop.js 渲染+事件 / progression.js thomas 彩蛋 / state.js _vehicleNames 三处零残留）
// CH §5.2：链提示废除 hotfix 汇总断言（29 处细节断言分布：v23-chain-pure P22 / v23-chain G3 / v231-fix ⑦ / v231-r18）
// RP5 反馈⑤：暂停意味着离线——复现暂停 6.5s 恢复，实测离线结算入账（togglePause dt>5s 分支）
// RP6 反馈⑥：探采 DM 数值——页头 +X/min 显示值 vs vehicleDmPerMin() 数学口径逐位对照 + 方差演算
// 运行前提：npm run build 已产出最新 dist（本套件走 file:// 真实浏览器实跑）
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const EV = process.cwd() + '/../../artifacts/v232-evidence';
mkdirSync(EV, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const saveBase = (over = {}) => ({
  _version: 6, chapter: '1', storyline: 'default',
  ep: 1e5, rp: 0, upgrades: {}, milesDone: {}, tech: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: true },
  lastSeen: Date.now(), startTime: Date.now(),
  ...over,
});
const inject = (page, save) => {
  const raw = JSON.stringify(save).replace(/</g, '\\u003c');
  return page.evaluateOnNewDocument(new Function(`
  try { localStorage.clear(); } catch (e) {}
  localStorage.setItem('abyss_idle_v2', JSON.stringify((${raw})));
`));
};

// ===== FB-A：新档——整页零 input 元素 =====
{
  const page = await browser.newPage();
  await inject(page, saveBase());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    // v2.5 ⑤：导入按钮的 file input 属功能组件，豁免（其余 input 必须为零）
    totalInputs: document.querySelectorAll('input:not([type=file])').length,
    vehInputs: document.querySelectorAll('#vehicle-shop input').length,
  }));
  rec('FB1 新档整页零 input 元素（含探采区域；豁免导入 file input）', c.totalInputs === 0 && c.vehInputs === 0, JSON.stringify(c));
  await page.close();
}

// ===== FB-B：已购外勤摩托队——该区域无 input 元素（组长验收原文断言） =====
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({ upgrades: { scooter: 3 } }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#vehicle-shop .item')].find(e => e.dataset.buy === 'scooter');
    return {
      vehInputs: document.querySelectorAll('#vehicle-shop input').length,
      nameInputs: document.querySelectorAll('input[data-vehicle-name]').length,
      totalInputs: document.querySelectorAll('input:not([type=file])').length, // v2.5 ⑤：豁免导入 file input
      cardName: card?.querySelector('.name')?.textContent || '',
      cardBuy: card?.dataset.buy || null,
      cardCost: card?.querySelector('.cost')?.textContent || '',
      cardLocked: card ? card.classList.contains('locked') : null,
    };
  });
  rec('FB2 已购×3 档：#vehicle-shop 内零 input 元素（该区域无 input 元素）', c.vehInputs === 0, JSON.stringify(c));
  rec('FB3 全页 data-vehicle-name 输入框零残留（豁免导入 file input）', c.nameInputs === 0 && c.totalInputs === 0, JSON.stringify(c));
  rec('FB4 外勤摩托队卡片仍为正常可购卡（data-buy/×3/价格非—）',
    c.cardBuy === 'scooter' && c.cardName.includes('×3') && c.cardCost !== '—' && c.cardCost !== '', JSON.stringify(c));
  await page.screenshot({ path: EV + '/fb2-owned-scooter-fixed.png', fullPage: false });
  await page.close();
}

// ===== FB-C：购买路径——购入后再渲染仍无 input（updateVehicleItem 路径） =====
{
  const page = await browser.newPage();
  await inject(page, saveBase({ upgrades: { scooter: 1 } }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const before = await page.evaluate(() => ({
    n: document.querySelectorAll('#vehicle-shop input').length,
    count: [...document.querySelectorAll('#vehicle-shop .item')].find(e => e.dataset.buy === 'scooter')?.querySelector('.count')?.textContent || '',
  }));
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('#vehicle-shop .item')].find(e => e.dataset.buy === 'scooter');
    card.click();
  });
  await sleep(900);
  const after = await page.evaluate(() => ({
    n: document.querySelectorAll('#vehicle-shop input').length,
    count: [...document.querySelectorAll('#vehicle-shop .item')].find(e => e.dataset.buy === 'scooter')?.querySelector('.count')?.textContent || '',
  }));
  rec('FB5 购入一辆后重渲染仍零 input（购买路径不回退）',
    before.n === 0 && after.n === 0 && before.count === '×1' && after.count === '×2',
    JSON.stringify({ before, after }));
  await page.close();
}

// ===== FB-D：源码级零残留（fs 静态断言，参照 v23-chain G3 口径） =====
{
  const shopSrc = readFileSync('src/modules/shop.js', 'utf8');
  const progSrc = readFileSync('src/modules/progression.js', 'utf8');
  const stateSrc = readFileSync('src/state.js', 'utf8');
  const noS = (s, pat) => !s.includes(pat);
  rec('FB6 源码零残留：shop 无 data-vehicle-name / 全模块无 S._vehicleNames 写读 / 无 thomas 彩蛋条目',
    noS(shopSrc, 'data-vehicle-name') && noS(shopSrc, 'S._vehicleNames') &&
    noS(progSrc, "id: 'thomas'") && noS(progSrc, 'S._vehicleNames') &&
    noS(stateSrc, 'S._vehicleNames'));
}

// ===== CH：§5.2 链提示废除 hotfix 汇总断言 =====
{
  const page = await browser.newPage();
  await inject(page, saveBase({ upgrades: { scribble: 15, script: 1 } }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    chainHint: document.querySelectorAll('.chain-hint').length,
    chainNextCls: document.querySelectorAll('.chain-next').length,
    hintText: [...document.querySelectorAll('.item,.tech')].filter(e => e.textContent.includes('购入前一项解锁')).length,
    previewText: [...document.querySelectorAll('.item,.tech')].filter(e => e.textContent.includes('沿链条逐步解锁')).length,
  }));
  rec('CH1 已购链中态全页链提示零残留（.chain-hint/.chain-next/文案零），??? 预览卡文案承担锁定感',
    c.chainHint === 0 && c.chainNextCls === 0 && c.hintText === 0, JSON.stringify(c));
  await page.close();

  const DISCLOSURE = await import('../src/modules/disclosure.js');
  rec('CH2 disclosure 导出面零残留（CHAIN_HINT / attachChainHint / isChainNext 均不存在）',
    !('CHAIN_HINT' in DISCLOSURE) && !('attachChainHint' in DISCLOSURE) && !('isChainNext' in DISCLOSURE));
}

// ===== RP5：反馈⑤「暂停意味着离线」复现定性 =====
// 口径（main.js togglePause）：恢复时 dt>5s → eff=min(dt, offlineCap)，gain=cps×eff×offlineRate，addEp 入账
// 注入 scribble×100（0.3/s each）→ cps≈30/s；暂停 6.5s → 期望 gain ≈ 30×6.5×0.5 ≈ 97 EP
{
  const page = await browser.newPage();
  await inject(page, saveBase({ ep: 5000, upgrades: { scribble: 100, cache: 5 } }));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const pre = await page.evaluate(() => ({
    ep: (document.getElementById('h-ep')?.textContent || '').split('/')[0],
    cps: document.getElementById('h-cps')?.textContent || '',
  }));
  const t0 = Date.now();
  await page.click('#pauseBtn');
  await sleep(6500);
  // v2.5 ⑥：暂停弹框遮罩后，恢复改点 modal 内「恢复并结算」按钮
  await page.click('#pause-resume');
  const pausedMs = Date.now() - t0;
  await sleep(1000);
  const post = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('#log-content div')].map(e => e.textContent);
    return {
      ep: (document.getElementById('h-ep')?.textContent || '').split('/')[0],
      resumeLine: lines.find(l => l.includes('暂停恢复：离线')) || '',
      pauseLine: lines.find(l => l.includes('系统暂停')) || '',
    };
  });
  const gained = parseFloat((post.resumeLine.match(/\+([\d,.]+)\s*EP/) || [])[1]?.replace(/,/g, '')) || 0;
  const num = (s) => parseFloat(String(s).replace(/[KMGT]/g, '')) || 0;
  const cpsVal = num(pre.cps);
  const expectGain = cpsVal * (pausedMs / 1000) * 0.25; // v2.6.6 ① 离线默认 25%
  rec('RP5 暂停>5s 恢复按离线结算入账（语义已在：暂停收益 +EP 落账）',
    gained >= 1 && post.resumeLine.includes('暂停恢复：离线'),
    JSON.stringify({ pausedSec: (pausedMs / 1000).toFixed(1), cps: pre.cps, gained, expectGain: expectGain.toFixed(1), epBefore: pre.ep, epAfter: post.ep }));
  rec('RP5 离线口径对账：实发 ≈ cps × dt × offlineRate(0.25)（±40% 容差，含潮汐/腐化时变）',
    gained >= 1 && Math.abs(gained - expectGain) <= Math.max(expectGain * 0.4, 2),
    `实发 ${gained} vs 期望 ${expectGain.toFixed(1)} EP`);
  await page.screenshot({ path: EV + '/rp5-pause-offline.png', fullPage: false });
  await page.close();
}

// ===== RP6：反馈⑥「探采平台 DM 数值对不上」v2.4 修复 =====
// v2.3.2 定性：偏差源于离散掷骰方差（60s 一掷、按概率 r 判 +1 DM），显示为期望值
// v2.4 修复：DM 采集改为确定性按速率到账（collectVehicleDm = Σ owned_i × dmRates[i] × (1+dmRateAdd)），显示与到账同口径
// 注入 scooter×10 + convoy×2 → 速率 10×0.05+2×0.1 = 0.7/min；对照页头显示、title 与 60s 实际到账
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await inject(page, saveBase({ upgrades: { scooter: 10, convoy: 2, scribble: 300 } })); // v2.8.x：探采需 EP 净产出>探采消耗才运行；scribble 300×0.12/s=36/s > 探采 29.2/s
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const c = await page.evaluate(() => ({
    header: document.getElementById('vehicle-collect')?.textContent || '',
    title: document.getElementById('vehicle-collect')?.title || '',
  }));
  const mathRate = 10 * 0.05 + 2 * 0.1;
  const shown = (c.header.match(/→ \+([\d.]+)/) || [])[1] || '';
  rec('RP6 探采页头显示值与速率口径一致（v2.8.7 用户口径：/s；10摩托×0.05+2车队×0.1 = 0.7/min = 0.012/s）',
    parseFloat(shown) === Math.round((mathRate / 60) * 1000) / 1000, JSON.stringify({ header: c.header, shown, mathRate }));
  rec('RP6 页头 title 说明按速率产出（v2.4：不再掷骰，「（期望）」标注已移除）',
    c.title.includes('0.05/0.1/0.25/0.5') && !c.header.includes('（期望）'), JSON.stringify({ title: c.title }));
  // v2.4 确定性到账对账：轮询等待 60s 采集窗口到账（全量并发 CPU 争用会拉长真实等待，
  // 固定 sleep 62s 在全量时可能不足——改条件轮询，最长 180s）
  let dmAfter = { dm: 0, shown: '' };
  for (let i = 0; i < 36; i++) {
    await sleep(5000);
    dmAfter = await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}');
      return { dm: st.dm || 0, shown: document.getElementById('vehicle-collect')?.textContent || '' };
    });
    if (Math.abs(dmAfter.dm - 0.7) < 0.31) break;
  }
  rec('RP6 v2.4 确定性到账对账：60s 采集窗口后 DM 到账 ≈ 速率 0.7（无掷骰方差，短窗即对得上）',
    Math.abs(dmAfter.dm - 0.7) < 0.31, JSON.stringify({ dm: dmAfter.dm, shown: dmAfter.shown, expect: 0.7 }));
  await page.screenshot({ path: EV + '/rp6-dm-header.png', fullPage: false });
  await page.close();
}

await browser.close();
const fail = results.filter(r => !r.ok);
console.log(`\nv232-hotfix：${results.length - fail.length}/${results.length} 通过`);
if (fail.length) { console.log('FAILED:', fail.map(f => f.name).join(' | ')); process.exit(1); }
