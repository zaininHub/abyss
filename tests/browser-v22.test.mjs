// v2.2 真实试玩自测（Step 4：组长评论 7698335062311341299 合入指令后的 file:// 实测）
// 覆盖：A open 档买塔立誓含 5X toast 播报（元素出现+含章名+只播一次+多行样式）；
//       B 三线已选档刷新恢复（locked 档 reload：剧情条 6X、故事线面板、立誓建筑）；
//       C 族升级购档（产出族白名单 T1/T2 + 扩容族 T1，RP 扣减与落档）；
//       D 旧档 v4→v5 迁移实测（真实 localStorage：已选线档合成定向建筑 + default ch5 开放）。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const SHOT_DIR = process.cwd() + '/../../artifacts/screenshots_v22/';
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : ''));
}

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const fileUrl = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

async function openPage(saveObj) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (saveObj !== null) {
    await page.evaluateOnNewDocument((s) => {
      localStorage.setItem('abyss_idle_v2', JSON.stringify(s));
    }, saveObj);
  } else {
    await page.evaluateOnNewDocument(() => localStorage.removeItem('abyss_idle_v2'));
  }
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  return { page, errs };
}

const baseSave = (over) => ({
  _version: 5, ep: 5000, rp: 0, chapter: '5', storyline: 'default',
  crossroad: 'open', crossroadLockedBy: null, familyUpgrades: {},
  tech: {}, buildings: {}, unlockedBuildings: {}, buildingOverflow: {},
  epOverflowTotal: 0, _overflowRpAcc: 0, milesDone: {},
  resDiscovered: { rp: true }, // v3.0.9 起 RP tab 锚点 = 购入矩阵存储库/灵感工坊；旧档标记兼容注入
  cultists: [], upgrades: {}, storylinesCompleted: [], lastSeen: Date.now(),
  ...over,
});

// ========== A. open 档买塔立誓：5X 章名+文案一次性 toast 播报（组长裁定选项③） ==========
console.log('\n[A] open 档买塔立誓含 5X toast 播报');
{
  const { page, errs } = await openPage(baseSave({
    ep: 400000, upgrades: { storage: 40 }, // v3.4.5：EP 上限改由存储节点 40 级支撑（3e5 立誓价可负担）
  }));
  await new Promise(r => setTimeout(r, 2000)); // 等 tick 推进岔路口渲染
  // 钩住 #toast 的 textContent setter：单元素 toast 会被后续事件 toast 覆盖，需全程记录播报日志
  await page.evaluate(() => {
    window.__toastLog = [];
    const el = document.getElementById('toast');
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    Object.defineProperty(el, 'textContent', {
      set(v) { window.__toastLog.push(String(v)); desc.set.call(this, v); },
      get() { return desc.get.call(this); },
      configurable: true,
    });
  });
  await page.evaluate(() => document.querySelector('#crossroad-list [data-crossroad="order_pillar"]').click());
  await new Promise(r => setTimeout(r, 300));  // toast 窗口内（2200ms）取态
  const toastState = await page.evaluate(() => {
    const el = document.getElementById('toast');
    const log = window.__toastLog || [];
    const CH5 = '第五章A · 协议奠基';
    const withCh5 = log.filter(m => m.includes(CH5));
    let occurrences = 0;
    for (const m of log) occurrences += m.split(CH5).length - 1;
    const vowMsg = withCh5[0] || '';
    return {
      exists: !!el, shown: el.classList.contains('show'),
      log, vowCount: withCh5.length, occurrences, vowMsg,
      vow: vowMsg.includes('已立誓'),
      ch5name: vowMsg.includes(CH5),
      ch5desc: vowMsg.includes('秩序不是被发现的'),
      multiline: getComputedStyle(el).whiteSpace === 'pre-line',
    };
  });
  rec('A1 立誓后 toast 元素出现且处于显示态（.show）', toastState.exists && toastState.shown);
  rec('A2 toast 含 5X 章名「第五章A · 协议奠基」与文案片段', toastState.ch5name && toastState.ch5desc && toastState.vow, (toastState.vowMsg || '').slice(0, 60));
  rec('A3 播报只播一次（全程 toast 日志中 5X 章名恰出现 1 条 1 次）', toastState.vowCount === 1 && toastState.occurrences === 1, `含章名消息 ${toastState.vowCount} 条 / 共出现 ${toastState.occurrences} 次 / 日志 ${toastState.log.length} 条`);
  rec('A4 toast 多行样式生效（white-space: pre-line，长文案按行渲染）', toastState.multiline);
  const saveA = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('abyss_idle_v2')); } catch { return {}; }
  });
  rec('A5 立誓落档（storyline=line_order、crossroad=locked、crossroadLockedBy=order_pillar）',
    saveA.storyline === 'line_order' && saveA.crossroad === 'locked' && saveA.crossroadLockedBy === 'order_pillar');
  rec('A6 立誓零 JS 错误', errs.length === 0, errs.join(';'));
  await page.screenshot({ path: SHOT_DIR + 'A_立誓toast_5X播报.png' });
  await page.close();
}

// ========== B. 三线已选档刷新恢复（locked 档 reload） ==========
console.log('\n[B] 三线已选档刷新恢复');
const LINES = [
  { sl: 'line_order', bid: 'order_pillar', bname: '秩序奠基塔', ch6: '协议草案', lname: '秩序重构者' },
  { sl: 'line_abyss', bid: 'abyss_anchor', bname: '裂隙共鸣锚', ch6: '低语', lname: '深渊行者' },
  { sl: 'line_faith', bid: 'faith_shrine', bname: '信仰圣龛', ch6: '回应', lname: '信仰传播者' },
];
let bIdx = 0;
for (const L of LINES) {
  bIdx++;
  const { page, errs } = await openPage(baseSave({
    storyline: L.sl, crossroad: 'locked', crossroadLockedBy: L.bid,
    chapter: `6${L.sl.slice(-1).toUpperCase()}`,
    buildings: { [L.bid]: 1 }, upgrades: { storage: 40 },
  }));
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => document.getElementById('btn-storyline')?.click()); // 故事线面板懒渲染：切 tab 才渲染
  await new Promise(r => setTimeout(r, 300));
  const state = await page.evaluate(() => ({
    chName: document.getElementById('ch-name')?.textContent || '',
    panel: document.getElementById('storyline-panel')?.textContent || '',
    crTxt: document.getElementById('crossroad-list')?.textContent || '',
  }));
  const saveKept = await page.evaluate(() => {
    try { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { sl: s.storyline, cr: s.crossroad }; } catch { return {}; }
  });
  rec(`B${bIdx} ${L.sl} 刷新恢复：剧情条推进至 6X「${L.ch6}」`, state.chName.includes(L.ch6), `ch="${state.chName}"`);
  rec(`B${bIdx} ${L.sl} 刷新恢复：故事线面板当前路线（中文线名「${L.lname}」+ 立誓建筑「${L.bname}」）`,
    state.panel.includes(L.lname) && state.panel.includes(L.bname));
  rec(`B${bIdx} ${L.sl} 刷新恢复：岔路口分区显示已立誓（其余封印）`, state.crTxt.includes('已立誓') && state.crTxt.includes('封印'));
  rec(`B${bIdx} ${L.sl} 刷新后存档保持（storyline/crossroad 不回退）`, saveKept.sl === L.sl && saveKept.cr === 'locked');
  rec(`B${bIdx} ${L.sl} 刷新恢复零 JS 错误`, errs.length === 0, errs.join(';'));
  if (bIdx === 1) await page.screenshot({ path: SHOT_DIR + 'B1_line_order_刷新恢复.png' });
  await page.close();
}

// ========== C. 族升级购档（产出族白名单 T1/T2 + 扩容族 T1） ==========
console.log('\n[C] 族升级购档');
{
  const { page, errs } = await openPage(baseSave({
    rp: 2500000, // 产出族 350k+900k + 扩容族 T1 260k 富余
    milesDone: { m1: 1, m2: 1, m3: 1, m4: 1, m5: 1, m6: 1, m7: 1, m8: 1, m9: 1 }, // 里程碑 9 门控
    upgrades: { storage: 40 },
  }));
  await new Promise(r => setTimeout(r, 2000));
  const famBefore = await page.evaluate(() => {
    const out = document.querySelector('#family-upgrade-list [data-family="output"]');
    return { outTxt: out ? out.textContent : '', famCount: document.querySelectorAll('#family-upgrade-list [data-family]').length };
  });
  rec('C1 v2.4 族升级分区 1 族 × 2 档独立卡（output；扩容族 D 已并入无限建筑，不再入族）', famBefore.famCount === 2, `族数=${famBefore.famCount}`);
  rec('C2 产出族文案简洁（含产出族/档位，无「暴击」——v2.8.8 每档独立卡）',
    famBefore.outTxt.includes('产出族') && famBefore.outTxt.includes('档位 T1') && !famBefore.outTxt.includes('暴击'), famBefore.outTxt.slice(0, 40));
  // 产出族 T1（350k）
  await page.evaluate(() => document.querySelector('#family-upgrade-list [data-family="output"]').click());
  await new Promise(r => setTimeout(r, 400));
  // 产出族 T2（900k）
  await page.evaluate(() => document.querySelector('#family-upgrade-list [data-family="output"]').click());
  await new Promise(r => setTimeout(r, 400));
  const famAfter = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { fu: s.familyUpgrades || {}, rp: s.rp, outTxt: (document.querySelector('#family-upgrade-list [data-family="output"]') || {}).textContent || '' };
    } catch { return { fu: {}, rp: -1, outTxt: '' }; }
  });
  rec('C3 产出族 T1+T2 购档落档（familyUpgrades.output=2）', famAfter.fu.output === 2, JSON.stringify(famAfter.fu));
  rec('C4 v2.4 无扩容族：familyUpgrades 不含 D 键', !('D' in famAfter.fu), JSON.stringify(famAfter.fu));
  const rpExpected = 2500000 - 350000 - 900000;
  rec(`C5 RP 按白名单价扣减（2500000-350000-900000=${rpExpected}）`, famAfter.rp === rpExpected, `rp=${famAfter.rp}`);
  const maxedTxt = await page.evaluate(() => { const el = document.querySelector('#family-upgrade-list .owned-item'); return el ? el.textContent : ''; });
  rec('C6 产出族满档显示（T2 后渲染 owned-item「满档」卡）', maxedTxt.includes('满档'), maxedTxt.slice(0, 40));
  rec('C7 族升级购档零 JS 错误', errs.length === 0, errs.join(';'));
  await page.screenshot({ path: SHOT_DIR + 'C_族升级购档.png' });
  await page.close();
}

// ========== D. 旧档 v4→v5 迁移实测（真实 localStorage） ==========
console.log('\n[D] 旧档 v4→v5 迁移实测');
{
  const v4Save = {
    _version: 4, ep: 5000, rp: 200, chapter: '6A', storyline: 'line_order',
    tech: {}, buildings: {}, upgrades: { storage: 40 }, unlockedBuildings: {}, buildingOverflow: {},
    epOverflowTotal: 0, _overflowRpAcc: 0, _v21Migrated: true,
    storylinesCompleted: [], lastSeen: Date.now(),
  };
  const { page, errs } = await openPage(v4Save);
  await new Promise(r => setTimeout(r, 6000)); // 等 5s 自动存档把迁移后的 v5 档写回 localStorage
  const mig = await page.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { v: s._version, sl: s.storyline, cr: s.crossroad, cb: s.crossroadLockedBy, op: ((s.buildings) || {}).order_pillar };
    } catch { return {}; }
  });
  rec('D1 v4 已选线档一路迁至 v6（_version=6，crossroad=locked + 合成 order_pillar 1 级）',
    mig.v === 6 && mig.sl === 'line_order' && mig.cr === 'locked' && mig.cb === 'order_pillar' && mig.op === 1,
    JSON.stringify(mig));
  rec('D2 迁移零 JS 错误', errs.length === 0, errs.join(';'));
  await page.screenshot({ path: SHOT_DIR + 'D_v4迁移.png' });
  await page.close();

  const v4Default = { ...v4Save, chapter: '5', storyline: 'default' };
  const { page: p2, errs: e2 } = await openPage(v4Default);
  await new Promise(r => setTimeout(r, 6000)); // 等 5s 自动存档落盘
  const mig2 = await p2.evaluate(() => {
    try {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { v: s._version, cr: s.crossroad, ids: [...document.querySelectorAll('#crossroad-list [data-crossroad]')].map(el => el.dataset.crossroad) };
    } catch { return {}; }
  });
  rec('D3 v4 default+ch5 档迁至 v6 开放（crossroad=open、三栋可购）',
    mig2.v === 6 && mig2.cr === 'open' && mig2.ids.length === 3, JSON.stringify(mig2));
  rec('D4 default 档迁移零 JS 错误', e2.length === 0, e2.join(';'));
  await p2.close();
}

await browser.close();

const failed = results.filter(r => !r.ok).length;
console.log(`\nv2.2 真实试玩自测结果：${results.length} 通过，${failed} 失败`);
console.log(`截图目录：${SHOT_DIR}`);
if (failed > 0) process.exit(1);
