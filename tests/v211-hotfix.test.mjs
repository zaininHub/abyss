// v2.1.1 hotfix 回归（缺陷A：启动恢复故事线运行态）
// 断言：① 三条已选线存档（line_faith/line_order/line_abyss）加载后，线科技/线章节/线建筑注册探针全真
//       ② default 档不触发单局锁定（多周目已解锁线仍可切换）
//       ③ 真实玩家路径 E2E（v2.2 购买钩子版）：ch5 open 档买定向建筑立誓 → 落档 → 刷新 → 线内容仍可见（hotfix 修复前此断言必挂）
// v2.2 适配说明：直接选线弹窗（fork-modal/fork-option）已随「岔路口升级项驱动」整体删除，
//    选线唯一入口改为商店面板 crossroad-list 三栋互斥定向建筑（buyCrossroadBuilding 购买钩子 → loadStoryline）。
//    本套件 ③ 段同步改写为购买钩子路径，断言数保持 25（启动链合流不回退 hotfix 的发布门禁）。
// 注：存档注入用 evaluateOnNewDocument + sessionStorage 一次性守卫——
//    首开前注入、reload 不重复注入（规避 v2.2 诊断已定性的重复注入伪影）；
//    且 app 内存态从注入档加载，beforeunload 落账不会覆盖注入内容。
import puppeteer from 'puppeteer-core';

const results = [];
function rec(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : '')); }

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const url = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

const LINES = [
  { id: 'line_faith', chapter: '6C', chName: '回应', tech: '神权协议', bld: '许愿池' },
  { id: 'line_order', chapter: '6A', chName: '协议草案', tech: '新协议', bld: '编译器神殿' },
  { id: 'line_abyss', chapter: '6B', chName: '低语', tech: '混沌之子', bld: '深渊鱼缸' },
];

const baseSave = (over) => ({
  _version: 4, ep: 5000, rp: 200, runEarned: 5000, allTimeEp: 50000,
  chapter: '1', storyline: 'default', _forkTriggered: false,
  tech: {}, buildings: {}, unlockedBuildings: {}, buildingOverflow: {},
  prestige: 0, es: 0, faith: 0, expeditionsDone: 0,
  storylinesCompleted: [], lastSeen: Date.now(), ...over,
});

async function openWithSave(save) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // 一次性注入守卫：sessionStorage 在同一标签页 reload 后保留，二次加载不再注入
  await page.evaluateOnNewDocument((s) => {
    if (!sessionStorage.getItem('__saveInjectedOnce')) {
      sessionStorage.setItem('__saveInjectedOnce', '1');
      localStorage.setItem('abyss_idle_v2', s);
    }
  }, JSON.stringify(save));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1300)); // 等 defer 脚本 + 首帧渲染
  return { page, errors };
}

// ---- ① 三线已选档：线运行态恢复探针 ----
for (const L of LINES) {
  const { page, errors } = await openWithSave(baseSave({
    storyline: L.id, chapter: L.chapter, _forkTriggered: true,
    milesDone: { '10000': 1 }, // v2.3.1 ②：设施分区门控（组长裁定），否则线建筑断言空列表
  }));
  const chName = await page.$eval('#ch-name', el => el.textContent).catch(() => '(无)');
  rec(`[${L.id}] 线章节恢复（#ch-name = "${L.chName}"）`, chName === L.chName, `实际 "${chName}"`);
  await page.click('#btn-tech');
  await new Promise(r => setTimeout(r, 400));
  const techTxt = await page.$eval('#tech-tree', el => el.textContent);
  rec(`[${L.id}] 线科技注册（科技树含「${L.tech}」）`, techTxt.includes(L.tech));
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const bldTxt = await page.$eval('#building-list', el => el.textContent);
  rec(`[${L.id}] 线建筑注册（设施含「${L.bld}」）`, bldTxt.includes(L.bld));
  const forkGone = (await page.$('#fork-modal')) === null; // v2.2：弹窗 DOM 已随直接选线 UI 删除
  rec(`[${L.id}] 已选线档无岔路口弹窗（弹窗 DOM 已删除）`, forkGone);
  rec(`[${L.id}] 页面无 JS 报错`, errors.length === 0, errors.join('; '));
  await page.close();
}

// ---- ② default 档不触发单局锁定 ----
// 说明：面板「选择」按钮在 ch<5 被页签 P4 渐进锁禁用、ch≥5 被「第5章后本局锁定」显示锁挡住，
// v2.1.0 UI 中实际不可达，故 default 档的锁定断言由 ③ E2E 覆盖：
// default ch5 档点弹窗选项走 loadStoryline()——若 startApp 对 default 档误置 _locked，
// loadStoryline 会拒绝切换（_locked && _current !== id → false），选择静默失败。
// 此处断言 default 档的其余设计行为：基础章节不串线、页签按渐进设计锁定、无弹窗、无报错。
{
  const { page, errors } = await openWithSave(baseSave({
    chapter: '3', storylinesCompleted: ['line_order'],
  }));
  const chName = await page.$eval('#ch-name', el => el.textContent).catch(() => '(无)');
  rec('[default] 基础章节正常（不串线）', chName === '第一章 · 入职', `实际 "${chName}"`);
  const tabLocked = await page.$eval('#btn-storyline', el => el.disabled && el.textContent.includes('\u{1F512}'));
  rec('[default] ch<5 故事线页签按渐进设计锁定（P4 未解锁）', tabLocked === true);
  const forkGone2 = (await page.$('#fork-modal')) === null;
  const crEmpty = await page.$eval('#crossroad-list', el => el.children.length).catch(() => -1);
  rec('[default] 未到第5章岔路口分区隐藏（crossroad-list 空、弹窗 DOM 已删除）', forkGone2 && crEmpty === 0, `children=${crEmpty}`);
  rec('[default] 页面无 JS 报错', errors.length === 0, errors.join('; '));
  await page.close();
}

// ---- ③ E2E 真实玩家路径（v2.2 购买钩子版）：ch5 open 档买定向建筑立誓 → 落档 → 刷新 → 线内容仍在（缺陷A修复断言） ----
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument((s) => {
    if (!sessionStorage.getItem('__saveInjectedOnce')) {
      sessionStorage.setItem('__saveInjectedOnce', '1');
      localStorage.setItem('abyss_idle_v2', s);
    }
  // v2.2 购买钩子路径 fixture：立誓需 3e5 EP，须先给足 EP 存储上限（v3.4.5：量子缓存池删除，改用存储节点 40 级，
  // 否则 tickCorruption 每帧把 EP 截断到基础上限 2000，购买因「EP 不足」静默失败）
  // v2.3.1 ② 断言适配（组长裁定 7698654240398511409）：设施分区门控 = anyBuilt ∨ milesDone[1e4]。
  // 注入档没有 v1.3 设施，不满足 anyBuilt——本 E2E 断言
  // 目的是缺陷 A（线内容持久化）而非门控测试，fixture 补 1e4 里程碑打开分区（已标记不触发补发）。
  }, JSON.stringify(baseSave({ chapter: '5', ep: 400000, runEarned: 400000, allTimeEp: 400000, expeditionsDone: 3, upgrades: { storage: 40 }, buildings: { warmup_node: 1, quantum_pool: 8 }, milesDone: { '10000': 1 } })));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1300));
  await page.click('#btn-storyline'); // v2.7.5：岔路口分区随故事线 tab（原 shop tab 已移除）
  await new Promise(r => setTimeout(r, 400));
  const crIds = await page.$$eval('#crossroad-list [data-crossroad]', els => els.map(e => e.dataset.crossroad).sort());
  rec('[E2E] ch5 未选线档岔路口分区开放（三栋定向建筑 order_pillar/abyss_anchor/faith_shrine 可购）',
    crIds.join(',') === 'abyss_anchor,faith_shrine,order_pillar', `实际 ${crIds.join(',')}`);
  await page.click('#crossroad-list [data-crossroad="faith_shrine"]');
  await new Promise(r => setTimeout(r, 600));
  const chPicked = await page.$eval('#ch-name', el => el.textContent).catch(() => '');
  await page.click('#btn-tech');
  await new Promise(r => setTimeout(r, 400));
  const techPicked = await page.$eval('#tech-tree', el => el.textContent);
  await page.click('#btn-storyline');
  await new Promise(r => setTimeout(r, 400));
  const crLockedTxt = await page.$eval('#crossroad-list', el => el.textContent);
  rec('[E2E] 买信仰圣龛立誓成功=购买钩子生效，线内容即时生效（章节=回应、科技含神权协议、分区转已立誓/封印）',
    chPicked === '回应' && techPicked.includes('神权协议') && crLockedTxt.includes('已立誓') && crLockedTxt.includes('封印'),
    `ch="${chPicked}"`);
  // 互斥不可逆：locked 态点封印楼无效（buyCrossroadBuilding 状态机门控拒绝）
  await page.click('#crossroad-list [data-crossroad="order_pillar"]');
  await new Promise(r => setTimeout(r, 400));
  const sealIntact = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}');
    return (s.buildings || {}).order_pillar === undefined && s.storyline === 'line_faith';
  });
  rec('[E2E] 立誓后互斥锁定（点封印楼无效：order_pillar 不入档、storyline 不变线）', sealIntact === true);
  // 触发 beforeunload 存档（游戏内真实保存路径），再刷新
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1300));
  const chReload = await page.$eval('#ch-name', el => el.textContent).catch(() => '');
  await page.click('#btn-tech');
  await new Promise(r => setTimeout(r, 400));
  const techReload = await page.$eval('#tech-tree', el => el.textContent);
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const bldReload = await page.$eval('#building-list', el => el.textContent);
  const crReload = await page.$eval('#crossroad-list', el => el.textContent);
  rec('[E2E] 刷新后线内容仍在（缺陷A修复：章节=回应、科技含神权协议、设施含许愿池、岔路口保持已立誓态）',
    chReload === '回应' && techReload.includes('神权协议') && bldReload.includes('许愿池') && crReload.includes('已立誓'),
    `ch="${chReload}"`);
  const slSaved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}');
    return `${s.storyline}/${s.crossroad}/${s.crossroadLockedBy}/${s.chapter}/${(s.buildings || {}).faith_shrine}`;
  });
  rec('[E2E] 存档字段保持（storyline/crossroad/crossroadLockedBy/chapter=6C/faith_shrine=1，选线后章节正常推进）',
    slSaved === 'line_faith/locked/faith_shrine/6C/1', `实际 "${slSaved}"`);
  rec('[E2E] 页面无 JS 报错', errors.length === 0, errors.join('; '));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n[v211-hotfix] ${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log('  ✗ ' + f.name + (f.detail ? ' :: ' + f.detail : ''))); process.exit(1); }
