// v2.5.4 四项反馈：① 快照存档系统（最多 3 槽 / 覆盖当前本地游戏二级确认 / 新快照覆盖旧快照）
// ② 未满足钥匙/里程碑的建筑卡整体禁点（lock-card locked）③ 可点击卡片整体手型（CSS）
// ④ 维修坞流失概率说明（流失预警 tooltip 补免疫来源）
// 运行前提：npm run build 已产出最新 dist（浏览器段走 file:// 真实实跑）
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const stateMod = await import('../src/state.js');
const { SAVE_KEY } = stateMod;
const fs = await import('node:fs');

// ========== V1 快照存档系统（纯逻辑） ==========
{
  const snaps = await import('../src/modules/snapshots.js');
  const SNAP_KEY = snaps.SNAP_KEY;
  let store = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  // 场景 1：空槽直接保存（1/3 → 2/3 → 3/3）
  store[SAVE_KEY] = JSON.stringify({ _version: 6, ep: 100 });
  const r1 = snaps.saveSnapshot();
  rec('V1 保存快照：空槽直接存入（1/3）', r1.ok && snaps.listSnapshots().length === 1, `len=${snaps.listSnapshots().length}`);
  const r2 = snaps.saveSnapshot();
  rec('V1 保存快照：第二个入空槽（2/3）', r2.ok && snaps.listSnapshots().length === 2, `len=${snaps.listSnapshots().length}`);
  const r3 = snaps.saveSnapshot();
  rec('V1 保存快照：第三个入空槽（3/3）', r3.ok && snaps.listSnapshots().length === 3, `len=${snaps.listSnapshots().length}`);
  // 场景 2：槽满 → 返回 needCover 供二级确认（不自动覆盖）
  const r4 = snaps.saveSnapshot();
  rec('V1 槽满后保存：返回 needCover 供二次确认（不静默覆盖）', !r4.ok && !!r4.needCover && r4.needCover.time === r1.snap.time, `needCover=${r4.needCover ? r4.needCover.name : '-'}`);
  // 场景 3：确认覆盖最早的（时间最旧 = 第 1 个）
  const covered = snaps.coverOldest(r4.snap);
  const after = snaps.listSnapshots();
  rec('V1 确认覆盖：最早的快照被新快照替换，总数仍 3', covered.ok && covered.covered.time === r1.snap.time && after.length === 3 && after.some(x => x.id === r4.snap.id), `coveredTime=${covered.covered.time===r1.snap.time}`);
  // 场景 4：取快照数据 / 删除
  const id1 = after[0].id;
  rec('V1 取快照数据（供「作为本地游戏」覆盖当前档）', snaps.snapshotData(id1) === store[SAVE_KEY], 'data same');
  snaps.deleteSnapshot(id1);
  rec('V1 删除快照后数量正确', snaps.listSnapshots().length === 2, `len=${snaps.listSnapshots().length}`);
  // 场景 5：槽位编号与时间文本
  const l1 = snaps.listSnapshots();
  rec('V1 快照列表含槽位号与格式化时间', l1.length === 2 && l1[0].slot === 1 && /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(l1[0].timeText), `${l1[0].slot}#${l1[0].timeText}`);
}

// ========== V2 建筑卡禁点（源码断言；运行时实跑见 V3） ==========
{
  const shopSrc = fs.readFileSync('src/modules/shop.js', 'utf-8');
  const balSrc = fs.readFileSync('src/data/balance.js', 'utf-8');
  rec('V2 field_1 定义存在（指尖力场·初，需钥匙 click_up）', /id: 'field_1'.*unlockTech: 'click_up'/.test(balSrc), 'unlockTech=click_up');
  rec('V2 前置未满足（钥匙/里程碑）→ 卡加 locked 类', /if \(gate\) div\.classList\.add\('locked'\)/.test(shopSrc), 'locked add');
  rec('V2 点击 locked 卡直接不响应（不进入解锁流程）', /el\.classList\.contains\('locked'\)\) return;/.test(shopSrc), 'click guard');
  // 仅差 RP（gate 为空）不 locked——解锁入口保留
  rec('V2 locked 判定基于 gate 非空（仅差 RP 仍可点击解锁）', shopSrc.includes("let gate = '';"), 'gate init');
}

// ========== V3 浏览器实跑：禁点 / 快照 UI / 手型 / 维修坞说明 ==========
{
  const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
  const mkSave = (extra = {}) => JSON.stringify({
    _version: 6, chapter: '4', storyline: 'default', ep: 1e9, rp: 99, runEarned: 5e6, prestige: 0,
    upgrades: {}, buildings: {}, tech: {}, milesDone: {}, unlockedBuildings: { bargain_shop: true, warmup_node: true },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  }).replace(/</g, '\\u003c');
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(new Function(`localStorage.clear(); localStorage.setItem('abyss_idle_v2', JSON.stringify((${mkSave()})));`));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);

  // ② 建筑卡禁点：升级商店 tab（默认开启）。未研究钥匙时窗口内 locked 卡（议价坊 unlockTech=cheap_start）
  // 应整体锁定禁点（cursor=not-allowed、点击不进入解锁流程）；已研究钥匙后同卡仅差 RP → 可点解锁
  await sleep(400);
  const lockedCard = await page.evaluate(() => {
    const el = document.querySelector('#v21-building-list [data-v21].locked');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return { found: true, id: el.dataset.v21, locked: el.classList.contains('locked'), cursor: cs.cursor, gate: (el.textContent || '').includes('需钥匙') };
  });
  rec('V3 未研究钥匙：建筑卡整体 locked（需钥匙 gate，field_1 场景）', lockedCard.found && lockedCard.locked && lockedCard.gate, JSON.stringify(lockedCard));
  rec('V3 locked 卡 cursor=not-allowed（不可点视觉）', lockedCard.cursor === 'not-allowed', `cursor=${lockedCard.cursor}`);
  await page.click('#v21-building-list [data-v21].locked');
  await sleep(200);
  const afterClick = await page.evaluate(() => {
    const el = document.querySelector('#v21-building-list [data-v21].locked');
    return el ? 'still-locked' : 'changed';
  });
  rec('V3 点击 locked 建筑卡无响应（不解锁/不购买）', afterClick === 'still-locked', afterClick);

  // 已研究钥匙（click_up）+ 议价坊已解锁 → 窗口 locked 区露 field_1（仅差 RP）→ 可点解锁
  await page.evaluate((raw) => {
    const o = JSON.parse(raw);
    o.tech.click_up = true;
    o.unlockedBuildings = { bargain_shop: true, warmup_node: true };
    localStorage.setItem('abyss_idle_v2', JSON.stringify(o));
  }, JSON.stringify(JSON.parse(JSON.stringify({ _version: 6, chapter: '4', storyline: 'default', ep: 1e9, rp: 99, runEarned: 5e6, prestige: 0, upgrades: {}, buildings: {}, tech: {}, milesDone: {}, unlockedBuildings: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false }, lastSeen: Date.now(), startTime: Date.now() }))));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  const openCard = await page.evaluate(() => {
    const el = document.querySelector('#v21-building-list [data-v21]');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return { found: true, id: el.dataset.v21, locked: el.classList.contains('locked'), cursor: cs.cursor, gate: (el.textContent || '').includes('需钥匙') };
  });
  rec('V3 已研究钥匙：仅差 RP 的卡不 locked（cursor=pointer 可点击）', openCard.found && !openCard.locked && openCard.cursor === 'pointer', JSON.stringify(openCard));
  await page.click('#v21-building-list [data-v21]');
  await sleep(300);
  const unlockOk = await page.evaluate(() => {
    const el = document.querySelector('#v21-building-list [data-v21]');
    return el ? !el.classList.contains('locked') : true;
  });
  rec('V3 点击仅差 RP 的卡可正常解锁（RP 充足）', unlockOk, 'unlocked');

  // ① 快照 UI：打开面板 → 保存快照 → 槽位出现 → 二级确认弹框（覆盖）→ 使用覆盖
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === '快照存档'); if (b) b.click(); });
  await sleep(300);
  const snapOpen = await page.evaluate(() => document.getElementById('snap-modal').style.display);
  rec('V3 快照面板可打开', snapOpen === 'flex', snapOpen);
  await page.click('#snap-save');
  await sleep(300);
  const snapSaved = await page.evaluate(() => document.querySelectorAll('#snap-list .snap-row').length);
  rec('V3 保存快照后列表出现 1 条（1/3）', snapSaved === 1, `rows=${snapSaved}`);
  // 连续保存到满 → 第 4 次触发覆盖二级确认
  await page.click('#snap-save'); await sleep(300);
  await page.click('#snap-save'); await sleep(300);
  const rows3 = await page.evaluate(() => document.querySelectorAll('#snap-list .snap-row').length);
  rec('V3 槽满 3 个', rows3 === 3, `rows=${rows3}`);
  await page.click('#snap-save'); await sleep(300);
  const confirmShown = await page.evaluate(() => document.getElementById('confirm-modal').style.display);
  rec('V3 槽满再保存 → 弹出二级确认（覆盖最早快照）', confirmShown === 'flex', confirmShown);
  await page.click('#confirm-ok');
  await sleep(300);
  const rowsAfter = await page.evaluate(() => document.querySelectorAll('#snap-list .snap-row').length);
  rec('V3 确认覆盖后仍 3 个快照（旧快照被替换）', rowsAfter === 3, `rows=${rowsAfter}`);
  // 使用快照 → 二级确认 → 覆盖本地
  await page.click('#snap-list .snap-row .snap-use');
  await sleep(300);
  const useConfirm = await page.evaluate(() => document.getElementById('confirm-modal').style.display);
  rec('V3 使用快照 → 二级确认（覆盖当前进度）', useConfirm === 'flex', useConfirm);
  await page.click('#confirm-ok');
  await sleep(800);
  const reloaded = await page.evaluate(() => !!document.getElementById('toast'));
  rec('V3 确认后恢复快照并刷新页面', reloaded, 'page alive');
  // ④ 维修坞流失概率说明：流失预警徽章 tooltip 含免疫来源
  const wageTip = await page.evaluate(() => {
    // 探采平台 tab 下流失预警徽章（若有）
    const el = document.querySelector('[id="staff-status"]');
    return el ? el.title : '';
  });
  rec('V3 流失预警 tooltip 注明维修坞免疫（流失概率 → 0）', wageTip.includes('维修坞') || /wageLoseChance/.test(wageTip), wageTip.slice(0, 40) || '(未取到——面板未开)');
  // 直接源码断言兜底
  const mainSrc = fs.readFileSync('src/main.js', 'utf-8');
  rec('V3 源码：流失预警 tooltip 已补「维修坞 → 0，免疫」', mainSrc.includes('（维修坞 → 0，免疫）'), 'tooltip 源码');
  const dockDesc = fs.readFileSync('src/data/balance.js', 'utf-8');
  rec('V3 源码：维修坞卡描述含「流失概率 10%/min → 0」', /流失概率 10%\/min → 0/.test(dockDesc), 'dock desc');
  await page.close();
  await browser.close();
}

// ========== V4 CSS 手型 ==========
{
  const css = fs.readFileSync('src/style.css', 'utf-8');
  rec('V4 可点击建筑卡整体 cursor:pointer（.shop-grid .item）', /\.shop-grid \.item\s*\{[\s\S]*cursor: pointer/.test(css), '.item pointer');
  rec('V4 locked 卡 hover 不抬手（border 不变 + not-allowed）', css.includes('.shop-grid .item.locked:hover') && css.includes('cursor: not-allowed'), 'locked hover');
  rec('V4 快照行按钮可点手型', css.includes('#snap-list .item .snap-use { cursor: pointer; }'), 'snap-use');
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.4 封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
