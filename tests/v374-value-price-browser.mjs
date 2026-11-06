// v3.7.4 反馈 · 真实 Chrome 浏览器回归（DOM 读卡面 / 价格 / 点击 / 无 pageerror）
//
// ①「产出与效率」组加成和价格不成比例：截图 455.63K / 525.63K / 552.00K 对应 +2% / +10% / ×1.12。
// ② 同组卡面文案混用「+X%」与「×N」。
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const IDS = ['warmup_node', 'eff_tower', 'double_workshop'];
const A_IDS = ['warmup_node', 'eff_tower', 'double_workshop', 'dispatch_hub', 'quantum_stacker',
  'singularity_core', 'transcend_temple', 'ascend_spire', 'eternity_hall', 'end_shrine'];
const PCT = { warmup_node: 2, eff_tower: 10, double_workshop: 12 };

const mkSave = (levels, ids = IDS, over = {}) => JSON.stringify({
  _version: 6, chapter: '6A', storyline: 'default', ep: 1e8, rp: 1e7, es: 0, dm: 0, pt: 0,
  upgrades: { storage: 8 }, buildings: Object.fromEntries(ids.map(id => [id, levels[id] ?? 0])),
  unlockedBuildings: Object.fromEntries(ids.map(id => [id, true])),
  tech: { warmup: true, eff2: true, speed2: true, auto2: true, quantum2: true, singular: true,
    transcend: true, ascend: true, eternity: true, true_end: true },
  milesDone: {}, cultists: [], faith: 0, religion: null, prestige: 0, prestigePoints: 0,
  _rpOverflowSeen: false,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true },
  lastSeen: Date.now(), startTime: Date.now(), startedAt: Date.now(),
  ...over,
});

const parseEp = (s) => {
  const m = /^([\d.]+)\s*([KMBT]?)\s*EP$/.exec((s || '').trim());
  if (!m) return NaN;
  return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] || 1);
};

const readCards = (ids) => {
  const out = {};
  for (const id of ids) {
    const el = document.querySelector(`[data-v21="${id}"]`);
    out[id] = el ? {
      desc: (el.querySelector('.desc')?.textContent || '').trim(),
      cost: (el.querySelector('.cost')?.textContent || '').trim(),
      count: (el.querySelector('.count')?.textContent || '').trim(),
    } : null;
  }
  return out;
};

const errs = [];
async function boot(browser, save) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400);
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});

try {
  // ================= ① 截图场景：Lv.2 / 2 / 1 =================
  console.log('\n[1] 反馈② 三张卡文案统一为「每级全局产出 +X%」');
  {
    const page = await boot(browser, mkSave({ warmup_node: 2, eff_tower: 2, double_workshop: 1 }));
    const cards = await page.evaluate(readCards, IDS);
    if (IDS.every(id => cards[id])) ok('① 三座入门建筑卡均渲染', IDS.map(id => cards[id].count).join(' / '));
    else bad('① 卡片缺失', JSON.stringify(cards));

    const descs = IDS.map(id => cards[id]?.desc || '');
    const unified = descs.every(d => /^每级全局产出 \+\d+%$/.test(d) && !d.includes('×'));
    if (unified && new Set(descs.map(d => d.replace(/\d+/, 'X'))).size === 1)
      ok('① 文案同句式、无 ×N 混写', descs.join(' | '));
    else bad('① 文案仍不统一', descs.join(' | '));

    const nums = descs.map(d => Number((d.match(/\+(\d+)%/) || [])[1]));
    if (nums.join(',') === '2,10,12') ok('① 文案数字与 fx 一致（+2% / +10% / +12%）');
    else bad('① 文案数字异常', nums.join(','));

    const costs = IDS.map(id => parseEp(cards[id]?.cost));
    if (costs.every(Number.isFinite) && Math.max(...costs) / Math.min(...costs) > 3)
      ok('① 价格按加成拉开（原 455.63K/525.63K/552.00K 极差仅 1.21 倍）',
        IDS.map((id, i) => `${id}=${cards[id].cost}`).join(' / '));
    else bad('① 价格仍挤在同一价带', JSON.stringify(costs));
    await page.close();
  }

  // ================= ② 同等级：价格比 ≡ 加成比 =================
  console.log('\n[2] 反馈① 同等级下价格与加成严格成比例');
  {
    const page = await boot(browser, mkSave({ warmup_node: 2, eff_tower: 2, double_workshop: 2 }));
    const cards = await page.evaluate(readCards, IDS);
    const rows = IDS.map(id => ({ id, pct: PCT[id], cost: parseEp(cards[id]?.cost) }));
    const units = rows.map(r => r.cost / r.pct);
    const rel = Math.max(...units) / Math.min(...units) - 1;
    const ascending = rows[0].cost < rows[1].cost && rows[1].cost < rows[2].cost;
    if (rows.every(r => Number.isFinite(r.cost)) && rel < 0.01 && ascending)
      ok('② Lv.2 三座单位加成价格一致、价格严格 2<10<12 递增',
        rows.map(r => `${r.id} ${r.cost.toFixed(0)} EP (+${r.pct}%)`).join(' / '));
    else bad('② 价效比例异常', JSON.stringify(rows) + ` rel=${rel}`);
    await page.close();
  }

  // ================= ③ 全组 A 十座文案统一 =================
  console.log('\n[3] 反馈② 全组「产出与效率」十座卡面无 ×N 混写');
  {
    const levels = Object.fromEntries(A_IDS.map(id => [id, 0]));
    const page = await boot(browser, mkSave(levels, A_IDS));
    const r = await page.evaluate((ids) => {
      const all = [...document.querySelectorAll('[data-v21]')];
      const mine = all.filter(el => ids.includes(el.dataset.v21));
      return {
        total: all.length,
        found: mine.length,
        descs: mine.map(el => ({ id: el.dataset.v21, d: (el.querySelector('.desc')?.textContent || '').trim() })),
      };
    }, A_IDS);
    const globalRows = r.descs.filter(x => x.d.includes('全局产出'));
    const badRows = globalRows.filter(x => !/^每级全局产出 \+\d+%$/.test(x.d) || x.d.includes('×'));
    if (globalRows.length >= 10 && badRows.length === 0)
      ok('③ 10 座全局产出卡文案全部统一', `可见 ${r.found} 座 / 全局产出 ${globalRows.length} 座`);
    else bad('③ 仍有旧文案', JSON.stringify({ globalRows: globalRows.length, badRows }).slice(0, 300));
    await page.close();
  }

  // ================= ④ 购买链与页面健康 =================
  console.log('\n[4] 价格链未受数据改版影响 + 无页面错误');
  {
    const page = await boot(browser, mkSave({ warmup_node: 2, eff_tower: 2, double_workshop: 1 }));
    const before = await page.evaluate(readCards, IDS);
    await page.evaluate(() => document.querySelector('[data-v21="warmup_node"]')?.click());
    await sleep(700);
    const after = await page.evaluate(readCards, IDS);
    const b0 = parseEp(before.warmup_node.cost), a0 = parseEp(after.warmup_node.cost);
    if (after.warmup_node.count === 'Lv.3/5' && Number.isFinite(b0) && Math.abs(a0 / b0 - 1.40) < 0.02)
      ok('④ 点击升级生效，级价按 growth 1.40 递增', `${before.warmup_node.cost} → ${after.warmup_node.cost}`);
    else bad('④ 购买链异常', JSON.stringify({ before: before.warmup_node, after: after.warmup_node }));
    if (errs.length === 0) ok('④ 全程无 pageerror / console.error');
    else bad('④ 页面报错', errs.slice(0, 3).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n=== v3.7.4 浏览器回归：${pass} 通过 / ${fail} 失败 ===`);
if (fail) process.exitCode = 1;
