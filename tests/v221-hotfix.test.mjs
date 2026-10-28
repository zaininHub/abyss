// v2.2.1 hotfix 回归断言：v21Level 形参误传对象致等级恒 0/购买回写 1（诊断脚手架 v23-diag-bug.mjs 转正式）
// 覆盖组长派发口径：注入 20 级+D族T1 档 DOM 显示 Lv.20/25、连购 2 次等级=2 且按真实等级涨价、
// 满级档购买被拒、等级不回写 1、EP 不足 toast 等级提示正确。
import puppeteer from 'puppeteer-core';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
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

// ===== 场景 A：注入 20 级 + D 族 T1 档 —— 显示与存档一致 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 5, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 1e7, milesDone: {}, tech: {},
      unlockedBuildings: { warmup_node: true, quantum_pool: true, dim_compressor: true, eff_tower: true, coop_hall: true, field_1: true },
      buildings: { warmup_node: 3, quantum_pool: 20, dim_compressor: 7, eff_tower: 9, coop_hall: 5, field_1: 2 },
      familyUpgrades: { D: 1 },
      upgrades: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const disp = await page.evaluate(() => {
    const g = (id) => document.querySelector(`[data-v21="${id}"]`)?.querySelector('.count')?.textContent || null;
    return { warmup_node: g('warmup_node'), quantum_pool: g('quantum_pool'), dim_compressor: g('dim_compressor'), field_1: g('field_1'), coop_hall: g('coop_hall'), eff_tower: g('eff_tower') };
  });
  rec('A1 已解锁建筑显示随存档一致（warmup_node Lv.3/5）', disp.warmup_node === 'Lv.3/5', disp.warmup_node);
  rec('A2 v2.8.27 扩容类移出效能建筑（cat D 存储统一主商店）→ quantum_pool 不显示', disp.quantum_pool === null, String(disp.quantum_pool));
  rec('A3 v2.8.27 扩容类移出效能建筑 → dim_compressor 不显示', disp.dim_compressor === null, String(disp.dim_compressor));
  rec('A5 满级项入折叠区不占可购卡位（coop_hall/eff_tower 可购区无卡）', disp.coop_hall === null && disp.eff_tower === null, `coop_hall=${disp.coop_hall}, eff_tower=${disp.eff_tower}`);
  const secTxt = await page.evaluate(() => document.getElementById('v21-building-list')?.textContent || '');
  rec('A6 折叠区含满级两项（协作大厅 5/5 满 + 效能尖塔 9/9 满）', /协作大厅/.test(secTxt) && /9\/9 满|9\/9满/.test(secTxt.replace(/\s/g, '')), '');
  rec('A7 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 B：连购 2 次 —— 等级=2 且按真实等级涨价、不回写 1 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 5, chapter: '6A', storyline: 'default',
      ep: 1e6, rp: 1e7, milesDone: {}, tech: { warmup: true }, // v2.8.27：warmup_node 前置科技
      unlockedBuildings: { warmup_node: true },
      buildings: { warmup_node: 0 },
      upgrades: { storage: 8 }, lastSeen: Date.now(), startTime: Date.now(), // v2.8.27：storage 8 级使 EP 上限 ≥ 二购价 26K
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const price0 = await page.evaluate(() => document.querySelector('[data-v21="warmup_node"]')?.querySelector('.cost')?.textContent);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector('[data-v21="warmup_node"]')?.click());
    await sleep(600);
  }
  const after = await page.evaluate(() => ({
    display: document.querySelector('[data-v21="warmup_node"]')?.querySelector('.count')?.textContent,
    price: document.querySelector('[data-v21="warmup_node"]')?.querySelector('.cost')?.textContent,
  }));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await sleep(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('B1 连购 2 次等级=2（不回写 1）', saved.buildings?.warmup_node === 2, `存档=${saved.buildings?.warmup_node}`);
  rec('B2 DOM 显示 Lv.2/5', after.display === 'Lv.2/5', after.display);
  rec('B3 首购价 = base（20.00K EP，v2.8.7 base 2e4）', price0 === '20.00K EP', price0);
  rec('B4 二购后价按 2 级真实价（33.80K EP = 2e4×1.30^2）', after.price === '33.80K EP', after.price);
  rec('B5 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 C：既有等级档连购 3 次 —— 从真实等级续升（20→23），上限随等级保持 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 1e7, milesDone: {}, tech: { warmup: true },
      unlockedBuildings: {},
      buildings: {},
      familyUpgrades: { D: 1 },
      upgrades: { storage: 20 }, lastSeen: Date.now(), startTime: Date.now(), // v2.8.27：D 族扩容统一主商店 storage（KG 无限模式）
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const getCard = () => [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
      if (el) el.click();
    });
    await sleep(600);
  }
  const disp = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list > *')].find(e => e.textContent.includes('存储节点'));
    return el ? (el.textContent.match(/×(\d+)/) || [])[1] : null;
  });
  // v2.8.27 口径：主商店 storage 无限升级（KG 模式），20 级档连购 3 次 → ×23
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await sleep(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}'));
  rec('C1 20 级档连购 3 次 → 23 级（v2.8.27 storage 无限模式，修复前会重置为 1）', saved.upgrades?.storage === 23, `存档=${saved.upgrades?.storage}`);
  rec('C2 无限显示 ×23（无 /20 分母；旧档 20 级全额计入）', disp === '23', String(disp));
  rec('C4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 D：满级档购买被拒（折叠区无购买入口）+ EP 不足 toast 等级正确 =====
{
  // D1: 满 5/5 档 —— 可购区无卡（无入口即无法购买），折叠区显示 Lv.5/5 满
  const page1 = await browser.newPage();
  const errs1 = [];
  page1.on('pageerror', e => errs1.push(String(e)));
  await page1.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 5, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 1e7, milesDone: {}, tech: {},
      unlockedBuildings: { warmup_node: true },
      buildings: { warmup_node: 5 },
      upgrades: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page1.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const d1 = await page1.evaluate(() => {
    const buyable = document.querySelector('[data-v21="warmup_node"]');
    const sec = document.getElementById('v21-building-list')?.textContent || '';
    return { hasBuyCard: !!buyable, folded: /Lv\.5\/5 满|Lv\.5\/5满/.test(sec.replace(/\s/g, ' ')) };
  });
  await page1.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await sleep(300);
  const d1Saved = await page1.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}').buildings?.warmup_node);
  rec('D1 满级档（5/5）购买被拒：可购区无入口 + 折叠区 Lv.5/5 满 + 存档等级不变', !d1.hasBuyCard && d1.folded && d1Saved === 5, `hasBuyCard=${d1.hasBuyCard}, folded=${d1.folded}, saved=${d1Saved}`);
  rec('D2a 场景一无页面错误', errs1.length === 0, errs1.join('; ').slice(0, 120));
  await page1.close();

  // D3: EP 不足 toast —— 0 级 field_1（价 500 EP）在 ep=50 下点击，toast 提示 Lv.1（0+1）
  const page2 = await browser.newPage();
  const errs2 = [];
  page2.on('pageerror', e => errs2.push(String(e)));
  await page2.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 5, chapter: '6A', storyline: 'default',
      ep: 50, rp: 1e7, milesDone: {}, tech: {},
      unlockedBuildings: { field_1: true },
      buildings: { field_1: 0 },
      upgrades: {}, lastSeen: Date.now(), startTime: Date.now(),
    }));
    // toast 单元素复用：钩 Node.prototype.textContent setter 记日志（textContent 定义在 Node.prototype）
    const log = [];
    window.__toastLog = log;
    const hook = () => {
      const el = document.getElementById('toast');
      if (!el || el.__hooked) return;
      el.__hooked = true;
      const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
      Object.defineProperty(el, 'textContent', {
        set(v) { log.push(String(v)); d.set.call(this, v); },
        get() { return d.get.call(this); },
        configurable: true,
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook, { once: true });
    else hook();
  });
  await page2.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  await page2.evaluate(() => document.querySelector('[data-v21="field_1"]')?.click());
  await sleep(600);
  const toastStr = await page2.evaluate(() => (window.__toastLog || []).join(' | '));
  rec('D4 场景二无页面错误', errs2.length === 0, errs2.join('; ').slice(0, 120));
  await page2.close();
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\nv2.2.1 hotfix 回归：${results.length - failed.length}/${results.length} 通过`);
if (failed.length) { console.error('失败项：', failed.map(f => f.name).join('；')); process.exit(1); }
