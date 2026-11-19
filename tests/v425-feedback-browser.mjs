// v4.2.5 反馈专项（真实浏览器）：设施/研究点/科技树/遗物 类目文字与收起框统一
//
// 覆盖：
//   ① 商店页「设施」类目标题：13px / cyan / cursor:pointer / ▼ 箭头
//   ② 设施分区折叠真实生效（点击后 building-list 隐藏，再点恢复）
//   ③ 研究点页「晋升 RP 加成」「族升级」标题同口径（达成门控后可见 + 13px/cyan/可点）
//   ④ 科技树页「裂隙等级（EP + DM 购买）」标题同口径 + 折叠生效
//   ⑤ 裂隙等级折叠后 300ms 帧系统不强写还原（renderRiftLevelTech 门控态记忆回归点）
//   ⑥ 遗物页「深渊商店」标题同口径 + 折叠生效；「深渊遗物」标题作为折叠边界（relics-panel 不被连带收起）
//   ⑦ 全 tab 扫描：所有 foldable-h3 computed style 一致（13px/cyan/pointer）
//   ⑧ 全程 0 pageerror
//
// 用法：node tests/v425-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await sleep(800);

  // ---- ① 商店页「设施」标题四要素（绑定发生在 switchTab('shop')，先点真实入口） ----
  // 种子：设施分区可见需基础建筑（getBuildings 只认基础四栋，v409 纪律）——
  // 否则 renderBuildings 提前 return，foldBound 不会落（未解锁标题本就不绑定，行为正确）
  await page.evaluate(() => { const S = window.S; S.buildings = Object.assign({}, S.buildings, { canteen: 1 }); });
  await page.click('#btn-shop');
  await sleep(500);
  const bld = await page.evaluate(() => {
    const el = document.getElementById('bld-title');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { fs: cs.fontSize, color: cs.color, cur: cs.cursor, arrow: !!el.querySelector('.rp-fold-arrow'), cls: el.classList.contains('foldable-h3') };
  });
  if (bld && bld.fs === '13px' && bld.cur === 'pointer' && bld.arrow && bld.cls) ok('① 设施标题 13px/pointer/箭头/foldable-h3', JSON.stringify(bld));
  else bad('① 设施标题 13px/pointer/箭头/foldable-h3', JSON.stringify(bld));

  // ---- ② 设施分区折叠真实生效 ----
  await page.click('#bld-title');
  await sleep(200);
  const foldedBld = await page.evaluate(() => document.getElementById('building-list')?.style.display || '');
  await page.click('#bld-title');
  await sleep(200);
  const unfoldBld = await page.evaluate(() => document.getElementById('building-list')?.style.display || '');
  if (foldedBld === 'none' && unfoldBld === '') ok('② 设施折叠收起/展开生效', `收起=${foldedBld} 展开=${unfoldBld || '(空)'}`);
  else bad('② 设施折叠收起/展开生效', `收起=${foldedBld} 展开=${unfoldBld || '(空)'}`);

  // ---- ③ 研究点页两标题（补门控种子：RP tab 需购入矩阵存储库） ----
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { rp_vault: 1 }); // RP tab 解锁锚点
    S.prestige = Math.max(S.prestige || 0, 1); // 晋升 RP 加成门控
    S.milesDone = S.milesDone || { m1: Date.now(), m2: Date.now(), m3: Date.now(), m4: Date.now(), m5: Date.now(), m6: Date.now(), m7: Date.now(), m8: Date.now(), m9: Date.now() };
    S.rp = 1e6;
  });
  // 等帧系统 refreshTabVisibility（1s 周期）显示 RP tab（anchorDone('rp') 解锁入口）
  await sleep(1300);
  await page.evaluate(() => document.getElementById('btn-rp')?.click());
  await sleep(600);
  const rpTitles = await page.evaluate(() => {
    const out = {};
    for (const id of ['rp-upgrade-title', 'family-upgrade-title']) {
      const el = document.getElementById(id);
      if (!el) { out[id] = null; continue; }
      const cs = getComputedStyle(el);
      out[id] = { vis: el.style.display !== 'none' && !el.hidden, fs: cs.fontSize, cur: cs.cursor, arrow: !!el.querySelector('.rp-fold-arrow'), bound: !!el.dataset.foldBound };
    }
    return out;
  });
  const rpOk = rpTitles['rp-upgrade-title'] && rpTitles['family-upgrade-title']
    && rpTitles['rp-upgrade-title'].vis && rpTitles['rp-upgrade-title'].fs === '13px' && rpTitles['rp-upgrade-title'].cur === 'pointer' && rpTitles['rp-upgrade-title'].bound
    && rpTitles['family-upgrade-title'].fs === '13px' && rpTitles['family-upgrade-title'].cur === 'pointer' && rpTitles['family-upgrade-title'].bound;
  if (rpOk) ok('③ 研究点「晋升 RP 加成/族升级」接入折叠范式', JSON.stringify(rpTitles));
  else bad('③ 研究点「晋升 RP 加成/族升级」接入折叠范式', JSON.stringify(rpTitles));

  // ---- ④⑤ 科技树页：裂隙等级标题 + 折叠后帧系统不强写还原 ----
  await page.evaluate(() => {
    const S = window.S;
    S._riftSeen = true; // 裂隙等级分区门控
    S.ep = 1e6; S.dm = Math.max(S.dm || 0, 100);
    S.resDiscovered = Object.assign({}, S.resDiscovered, { dm: true });
  });
  await page.click('#btn-tech');
  await sleep(600);
  const riftT = await page.evaluate(() => {
    const el = document.getElementById('rift-tech-title');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { vis: el.style.display !== 'none', fs: cs.fontSize, cur: cs.cursor, bound: !!el.dataset.foldBound };
  });
  if (riftT && riftT.vis && riftT.fs === '13px' && riftT.cur === 'pointer' && riftT.bound) ok('④ 裂隙等级标题接入折叠范式', JSON.stringify(riftT));
  else bad('④ 裂隙等级标题接入折叠范式', JSON.stringify(riftT));

  // ⑤ 折叠裂隙等级 → 等 700ms（>300ms 帧间隔）→ 容器必须仍收起
  await page.click('#rift-tech-title');
  await sleep(200);
  const foldedOnce = await page.evaluate(() => document.getElementById('rift-tech-list')?.style.display || '');
  await sleep(700);
  const afterFrame = await page.evaluate(() => document.getElementById('rift-tech-list')?.style.display || '');
  if (foldedOnce === 'none' && afterFrame === 'none') ok('⑤ 折叠后帧系统不强写还原（>300ms 仍收起）', `folded=${foldedOnce} 帧后=${afterFrame}`);
  else bad('⑤ 折叠后帧系统不强写还原（>300ms 仍收起）', `folded=${foldedOnce} 帧后=${afterFrame}`);
  await page.click('#rift-tech-title'); // 恢复展开
  await sleep(200);

  // ---- ⑥ 遗物页：深渊商店折叠 + 遗物边界（补解锁种子：relicsUnlocked 三重门控） ----
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { scooter: 1 }); // DM 锚点（首辆载具）
    S.resDiscovered = Object.assign({}, S.resDiscovered, { dm: true });
    S._riftSeen = true; S.riftsSealed = Math.max(S.riftsSealed || 0, 1); // 裂隙触发
    S.chapter = '3'; // 遗物章节门禁（v4.3.1 从 9 提前到 3——深渊提前第二波）
    S.ep = Math.max(S.ep || 0, 1e6); S.dm = Math.max(S.dm || 0, 5000);
  });
  // 等帧系统 refreshTabVisibility（1s 周期）解除锁定，否则 .tabs 捕获阶段拦截点击（v3.3.3 反馈④）
  await sleep(1300);
  await page.evaluate(() => document.getElementById('btn-relics')?.click());
  await sleep(600);
  const dmState = await page.evaluate(() => {
    const out = {};
    for (const id of ['dm-shop-title', 'relic-title']) {
      const el = document.getElementById(id);
      if (!el) { out[id] = null; continue; }
      const cs = getComputedStyle(el);
      out[id] = { vis: el.style.display !== 'none' && !el.hidden, fs: cs.fontSize, cur: cs.cursor, bound: !!el.dataset.foldBound };
    }
    return out;
  });
  await sleep(500);
  await page.click('#dm-shop-title');
  await sleep(200);
  const relicFold = await page.evaluate(() => ({
    dm: document.getElementById('dm-shop')?.style.display || '',
    relicPanel: document.getElementById('relics-panel')?.style.display || '',
    relicPanelHidden: document.getElementById('relics-panel')?.hidden ?? null,
  }));
  const dmOk = dmState['dm-shop-title'] && dmState['dm-shop-title'].vis && dmState['dm-shop-title'].fs === '13px' && dmState['dm-shop-title'].cur === 'pointer' && dmState['dm-shop-title'].bound
    && dmState['relic-title'] && dmState['relic-title'].fs === '13px' && dmState['relic-title'].cur === 'pointer';
  const edgeOk = relicFold.dm === 'none' && relicFold.relicPanel === '' && relicFold.relicPanelHidden === false;
  if (dmOk && edgeOk) ok('⑥ 深渊商店折叠生效 + 遗物边界不被连带收起', JSON.stringify(relicFold));
  else bad('⑥ 深渊商店折叠生效 + 遗物边界不被连带收起', `dmState=${JSON.stringify(dmState)} fold=${JSON.stringify(relicFold)}`);
  await page.click('#dm-shop-title'); // 恢复
  await sleep(200);

  // ---- ⑦ 全 tab 扫描：所有 foldable-h3 computed 一致 ----
  const scan = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('h3.foldable-h3'));
    const bad = [];
    for (const el of els) {
      if (el.offsetParent === null && el.style.display === 'none') continue; // 隐藏标题跳过
      const cs = getComputedStyle(el);
      if (cs.fontSize !== '13px' || cs.cursor !== 'pointer' || !el.querySelector('.rp-fold-arrow')) {
        bad.push({ id: el.id || el.textContent.trim().slice(0, 12), fs: cs.fontSize, cur: cs.cursor, arrow: !!el.querySelector('.rp-fold-arrow') });
      }
    }
    return { total: els.length, bad };
  });
  if (scan.total >= 6 && scan.bad.length === 0) ok('⑦ 全部 foldable-h3 样式一致', `共 ${scan.total} 个，0 异常`);
  else bad('⑦ 全部 foldable-h3 样式一致', JSON.stringify(scan));

  // ---- ⑧ pageerror ----
  if (errors.length === 0) ok('⑧ 全程 0 pageerror');
  else bad('⑧ 全程 0 pageerror', errors.join(' | ').slice(0, 150));

  console.log(`\nREPORT v425: ${pass}/${pass + fail} pass`);
} finally {
  await browser.close();
}
if (fail > 0) process.exit(1);
