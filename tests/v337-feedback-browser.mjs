// v3.3.7 反馈回归（五项）
// ① 净化节点/深渊遗物不再每 2s 整面重建（按钮节点稳定、可点击、无闪烁）；结构变化时才重建
// ② 线程/薪资强化 ×1.9、研究点强化族 ×1.8 有效曲线（大幅涨价）
// ③ 四列布局：左一收窄、左二/中间扩宽；任务版固定高度
// ④ 异兽无自动升级；经验满出现「升级」按钮（显示 PT 消耗）；孵化行 EP 总量去除
// ⑤ 神谕塔 2500×2.6、圣战军 5000×2.7（大幅涨价）
import puppeteer from 'puppeteer-core';
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1100 });
  page.on('pageerror', e => bad('页面异常', String(e).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1400);

  // ===== ① 遗物/净化节点按钮节点稳定（不周期重建） =====
  const r1 = await page.evaluate(async () => {
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), dm: true };
    window.S._riftSeen = true;
    window.S.dm = 68; // 反馈场景：68 DM、净化节点 I 需 50
    window.S.tech = { ...(window.S.tech || {}), entropy_reduce: 1 };
    window.S.relics = {};
    window.__gameDirty.relics = true;
    await new Promise(r => setTimeout(r, 600));
    const btn0 = document.querySelector('#relics-panel [data-purifier-buy="purifier1"]');
    const card0 = document.querySelector('#relics-panel [data-purifier="purifier1"]');
    await new Promise(r => setTimeout(r, 3000)); // 覆盖多个原「每 2s 重建」周期
    const btn1 = document.querySelector('#relics-panel [data-purifier-buy="purifier1"]');
    const card1 = document.querySelector('#relics-panel [data-purifier="purifier1"]');
    return {
      sameBtn: btn0 === btn1, sameCard: card0 === card1,
      enabled: btn1 && !btn1.disabled, txt: btn1?.textContent || '',
      gated: card1?.classList.contains('relic-gated'),
    };
  });
  if (r1.sameBtn && r1.sameCard) ok('① 净化节点卡/按钮 3s 内节点稳定（不再每 2s 重建闪烁）');
  else bad('① 遗物面板仍被周期重建', JSON.stringify(r1));
  if (r1.enabled && !r1.gated) ok('① 68DM vs 需50：按钮可点、卡不灰', r1.txt);
  else bad('① 可购态', JSON.stringify(r1));

  // 点击可真实购买
  const r1b = await page.evaluate(async () => {
    const lv0 = window.S.upgrades.purifier1 || 0;
    const dm0 = window.S.dm;
    document.querySelector('#relics-panel [data-purifier-buy="purifier1"]')?.click();
    await new Promise(r => setTimeout(r, 400));
    return { lv: window.S.upgrades.purifier1 || 0, dm: window.S.dm, lv0, dm0 };
  });
  if (r1b.lv === r1b.lv0 + 1 && r1b.dm < r1b.dm0) ok('① 净化节点一次点击购买成功', `lv ${r1b.lv0}→${r1b.lv} dm ${r1b.dm0}→${r1b.dm}`);
  else bad('① 购买失败', JSON.stringify(r1b));

  // gate 结构变化才重建：evolve 遗物等级 → 卡重建一次且新等级显示
  const r1c = await page.evaluate(async () => {
    window.S.relics = { ...(window.S.relics || {}), tome: 2 };
    window.S.dm = 1e6;
    window.__gameDirty.relics = true;
    await new Promise(r => setTimeout(r, 600));
    const t = document.querySelector('#relics-panel')?.innerText || '';
    return { hasLv2: /深渊古卷/.test(t) && /Lv\.2/.test(t) };
  });
  if (r1c.hasLv2) ok('① 遗物等级结构变化 → 面板正确重建');
  else bad('① 结构变化未重建', JSON.stringify(r1c));

  // ===== ② 涨价曲线（源码口径） =====
  const r2 = await page.evaluate(async () => {
    const parseC = (t) => {
      const m = (t || '').match(/([\d.]+)\s*([KMB]?)/);
      if (!m) return 0;
      const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1;
      return parseFloat(m[1]) * mult;
    };
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 }; // 先抬 EP 上限再给 EP（否则被 cap 钳住买不起）
    window.S.ep = 1e12; window.S.rp = 1e9;
    window.__gameDirty.shop = true;
    await new Promise(r2 => setTimeout(r2, 400));
    document.getElementById('btn-shop')?.click();
    await new Promise(r2 => setTimeout(r2, 600));
    const card = document.querySelector('#thread-shop [data-buy="cpu"]');
    const c0 = parseC(card?.querySelector('.cost')?.textContent);
    card?.click();
    await new Promise(r2 => setTimeout(r2, 500));
    const c1 = parseC(document.querySelector('#thread-shop [data-buy="cpu"] .cost')?.textContent);
    window.S.prestige = 1; // RP 加成组需晋升后渲染
    document.getElementById('btn-rp')?.click();
    await new Promise(r2 => setTimeout(r2, 600));
    const rp = document.querySelector('#rp-upgrade-list [data-buy="exp_bench"]');
    const p0 = parseC(rp?.querySelector('.cost')?.textContent);
    rp?.click();
    await new Promise(r2 => setTimeout(r2, 500));
    const p1 = parseC(document.querySelector('#rp-upgrade-list [data-buy="exp_bench"] .cost')?.textContent);
    return { threadRatio: c0 > 0 ? c1 / c0 : 0, rpRatio: p0 > 0 ? p1 / p0 : 0 };
  });
  if (r2.threadRatio > 1.75 && r2.threadRatio < 2.05) ok('② 线程/薪资强化购后 ×≈1.9', r2.threadRatio.toFixed(2));
  else bad('② 线程涨价曲线', JSON.stringify(r2));
  if (r2.rpRatio > 2.1 && r2.rpRatio < 2.7) ok('② 研究点强化购后 ×≈2.3（1.28×1.8）', r2.rpRatio.toFixed(2));
  else bad('② RP 族涨价曲线', JSON.stringify(r2));

  // ===== ③ 布局：列宽比例 + 任务版固定高度 =====
  const r3 = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').map(v => parseFloat(v));
    const proj = document.getElementById('projects');
    const cs = getComputedStyle(proj);
    return { cols, projH: cs.height, overflow: cs.overflowY };
  });
  if (r3.cols.length === 4 && r3.cols[0] < r3.cols[1] && r3.cols[1] >= 300 && r3.cols[2] > r3.cols[1]) ok('③ 四列：左一最窄、左二扩宽、中列最宽', r3.cols.map(v => v.toFixed(0)).join('/'));
  else bad('③ 列宽分布', JSON.stringify(r3.cols));
  if (parseFloat(r3.projH) > 300 && r3.overflow === 'auto') ok('③ 任务版高度固定（内容滚动）', `${r3.projH} / ${r3.overflow}`);
  else bad('③ 任务版尺寸', JSON.stringify({ h: r3.projH, of: r3.overflow }));

  // ===== ④ 异兽手动升级 =====
  const r4 = await page.evaluate(async () => {
    window.S.pets = { cat: { icon: '🐈', name: '影猫', level: 5, exp: 0, gen: 1 } };
    window.S.activePets = ['cat'];
    window.S.pt = 50000;
    window.__gameDirty.pets = true;
    await new Promise(r4 => setTimeout(r4, 400));
    const need = Math.ceil(1200 * Math.pow(5, 2.8));
    window.S.pets.cat.exp = need; // 经验满
    window.__gameDirty.pets = true;
    await new Promise(r4 => setTimeout(r4, 700));
    const lv0 = window.S.pets.cat.level;
    await new Promise(r4 => setTimeout(r4, 1300)); // 等待自动升级窗口（应无变化）
    const noAuto = window.S.pets.cat.level === lv0;
    const btn = document.querySelector('#pet-grid [data-pet-up="cat"]');
    const btnText = btn ? btn.textContent : '';
    const pt0 = window.S.pt;
    if (btn) btn.click();
    await new Promise(r4 => setTimeout(r4, 500));
    return { noAuto, btnText, leveled: window.S.pets.cat.level > lv0, lv: window.S.pets.cat.level, ptSpent: pt0 - window.S.pt };
  });
  if (r4.noAuto) ok('④ 无自动升级（等待 1.3s 等级不变）');
  else bad('④ 仍在自动升级', JSON.stringify(r4));
  if (/升级.*PT/.test(r4.btnText)) ok('④ 升级按钮显示 PT 消耗', r4.btnText);
  else bad('④ 升级按钮文案', r4.btnText);
  if (r4.leveled && r4.ptSpent > 0) ok('④ 点击升级：等级 +1、扣 PT', `Lv.${r4.lv} -${r4.ptSpent} PT`);
  else bad('④ 手动升级失败', JSON.stringify(r4));

  // 孵化行 EP 总量去除
  const r4b = await page.evaluate(() => {
    const t = document.getElementById('pet-grid')?.innerText || '';
    return { noEpTotal: !/总计 -/.test(t), hasPt: /PT\/s/.test(t) };
  });
  if (r4b.noEpTotal && r4b.hasPt) ok('④ 孵化行 EP 总量已去除（只留 +PT/s）');
  else bad('④ 孵化行 EP 总量', JSON.stringify(r4b));

  // ===== ⑤ 神谕塔/圣战军涨价 =====
  await page.evaluate(async () => {
    window.S.religion = { ...(window.S.religion || {}), unlocked: true, branch: 'sun', sun: true, seal: 5, temple: 5, oracle: 0, crusade: 0, templeOff: false }; // 圣所 5 级解锁圣战军
    window.__gameDirty.religion = true;
    await new Promise(r5 => setTimeout(r5, 500));
  });
  const r5 = await page.evaluate(() => {
    const t = document.getElementById('religion-panel')?.innerText || '';
    return { hasOracle: /神谕塔/.test(t) && /2[,，]?500/.test(t), hasCrusade: /圣战军/.test(t) && /5[,，]?000/.test(t), t: t.slice(0, 200) };
  });
  if (r5.hasOracle) ok('⑤ 神谕塔显示新价 2,500 FP 起');
  else bad('⑤ 神谕塔价格', r5.t);
  if (r5.hasCrusade) ok('⑤ 圣战军显示新价 5,000 FP 起');
  else bad('⑤ 圣战军价格', r5.t);

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
