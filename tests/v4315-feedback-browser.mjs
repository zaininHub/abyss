// v4.3.15 第七轮反馈批次浏览器专项（真实 DOM）：
// ① 蒸馏悬浮：hover 即时显示 DOM 气泡（不再等原生 title ~1s）
// ② 岗位容量：灵感工坊 2 座 → 最多 2 条线程（下拉「已满」标注 + 分配拒绝回显）
// ③ 领导在任时其他线程无晋升按钮，卸任后恢复
// ④ 裂隙 tab 在研究点右侧
// ⑤ 顶栏无「本局」累计 EP
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = path.join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_URL = 'file:///' + path.join(root, 'dist/index.html').replace(/\\/g, '/');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ok -', name); } else { fail++; console.log('  NOT OK -', name); } };

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 120)));
await page.goto(GAME_URL);
await sleep(1500);

// ===== ⑤ 顶栏无本局累计 EP（先验，最简单）=====
console.log('[5] 顶栏无本局累计');
{
  const r = await page.evaluate(() => ({
    hasRun: !!document.getElementById('h-run'),
    topbarText: document.querySelector('.topbar')?.textContent || '',
  }));
  ok(!r.hasRun, '顶栏无 #h-run 节点');
  ok(!/本局/.test(r.topbarText), '顶栏无「本局」字样');
}

// ===== ④ 裂隙 tab 顺序 =====
console.log('[4] 裂隙 tab 移到研究点右侧');
{
  const r = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.tabs button')].map(b => b.id);
    return { rp: ids.indexOf('btn-rp'), rift: ids.indexOf('btn-rift-tab'), bazaar: ids.indexOf('btn-bazaar') };
  });
  ok(r.rp >= 0 && r.rift > r.rp && r.rift < r.bazaar, `裂隙在研究点后、集市前（rp=${r.rp} rift=${r.rift} bazaar=${r.bazaar}）`);
}

// ===== ① 蒸馏悬浮气泡即时显示 =====
console.log('[1] 蒸馏悬浮气泡');
await page.evaluate(() => {
  window.S.upgrades = { ...(window.S.upgrades || {}), rp_distill: 0, rp_vault: 1 }; // rp_vault 矩阵存储库 = RP 锚点（anchorDone('rp')）
  window.S.ep = 1e6;
  window.S.resDiscovered = { ...(window.S.resDiscovered || {}), rp: true };
  window.__gameDirty.rp = true;
});
await page.evaluate(() => window.__qa.sim.switchTab('rp')); // 新档 RP tab 隐藏，走 sim 切换
await sleep(600);
{
  const r = await page.evaluate(() => {
    const btn = document.getElementById('rp-distill-btn');
    if (!btn) return { err: 'no btn' };
    // 原生 title 已移除（延迟源头）
    const noTitle = !btn.hasAttribute('title');
    // hover 触发气泡（mouseover 委托在 #rp-panel）
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const pop = document.getElementById('distill-tip-pop');
    return { noTitle, shown: pop ? pop.classList.contains('show') : false, text: pop ? pop.textContent : '', hasTipAttr: btn.hasAttribute('data-distill-tip') };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.hasTipAttr, '按钮带 data-distill-tip');
    ok(r.noTitle, '原生 title 已移除');
    ok(r.shown, 'hover 即时显示气泡（mouseover 同步 show）');
    ok(/单次蒸馏：-[\d.]+K? EP \+[\d.]+K? RP/.test(r.text), `气泡含消耗产出（「${r.text.slice(0, 40)}」）`);
  }
}

// ===== ② 岗位容量限制 =====
console.log('[2] 岗位容量钳制');
await page.evaluate(() => {
  window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 2, scooter: 1 };
  window.S._crewUnlocked = true;
  window.S.cultists = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, name: 'T' + i, profession: 'worker', level: 1, xp: 0,
    leader: false, boundTo: null, output: 0.5, mood: '正常', moodTimer: 60,
  }));
  window.__gameDirty && (window.__gameDirty.orchestration = true);
});
await sleep(800);
{
  // 手动绑 2 条到 atrium（容量 2），第 3 条应被拒
  const r = await page.evaluate(async () => {
    const tb = window.__qa.threadBind;
    const cs = window.S.cultists;
    tb.bindThread(cs[0], 'atrium');
    tb.bindThread(cs[1], 'atrium');
    const third = tb.bindThread(cs[2], 'atrium'); // 满员 → false
    const load3 = tb.converterLoad('atrium');
    // UI 链路：下拉选满员岗位 → 回显旧值 + crewFeed 提示
    // 时序说明：renderCrewPanel 由 1s 低频帧周期重建，querySelector 可能为 null——轮询等卡渲染
    let sel = null;
    for (let i = 0; i < 30 && !sel; i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      sel = document.querySelector('[data-bind="' + cs[2].id + '"]');
    }
    if (!sel) return { err: 'no select for T2' };
    sel.value = 'atrium';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r2 => setTimeout(r2, 400));
    const feed = (window.S.crewFeed || []).slice(-1)[0]?.msg || '';
    // 拒绝后 renderCrewPanel 重建 DOM——重新查节点读回显值
    const selAfter = document.querySelector('[data-bind="' + cs[2].id + '"]');
    // 下拉「（已满）」标注（换一条空闲线程的卡看 atrium 选项文案；同样轮询）
    // v4.3.16 加固：选项文案也轮询——查询窗口恰逢低频帧重建时 selFree.options 读到旧节点（空文案）
    let optText = '';
    for (let i = 0; i < 30 && !/（已满）/.test(optText); i++) {
      await new Promise(r2 => setTimeout(r2, 100));
      const selFree = document.querySelector('[data-bind="' + cs[3].id + '"]');
      const optFull = selFree ? [...selFree.options].find(o => o.value === 'atrium') : null;
      if (optFull) optText = optFull.textContent || '';
    }
    return { third, load3, feed, selAfter: selAfter ? selAfter.value : null, optText };
  });
  if (r.err) ok(false, r.err);
  else {
    ok(r.third === false, `bindThread 满员拒绝（第 3 条 → ${r.third}）`);
    ok(r.load3 === 2, `atrium 在岗数钳制为 2（实际 ${r.load3}）`);
    ok(/已满员/.test(r.feed), `满员分配有班组提示（「${r.feed.slice(0, 30)}」）`);
    ok(r.selAfter === '' || r.selAfter === null, `拒绝后下拉回显空闲（value=「${r.selAfter}」）`);
    ok(/（已满）/.test(r.optText), `下拉满员选项标「（已满）」（「${r.optText}」）`);
  }
  // 智能分配同口径：atrium 不超 2
  const auto = await page.evaluate(() => {
    window.__qa.threadBind.autoAssignThreads();
    return window.__qa.threadBind.converterLoad('atrium');
  });
  ok(auto <= 2, `智能分配后 atrium ≤ 容量 2（实际 ${auto}）`);
}

// ===== ③ 领导在任隐藏晋升按钮 =====
console.log('[3] 领导唯一晋升入口');
{
  const r = await page.evaluate(async () => {
    const cs = window.S.cultists;
    // 先设领导 cs[0]
    const btn0 = document.querySelector('[data-leader="' + cs[0].id + '"]');
    if (btn0) btn0.click();
    await new Promise(r2 => setTimeout(r2, 400));
    const othersHaveBtn = [...cs.slice(1)].filter(c => document.querySelector('[data-leader="' + c.id + '"]')).length;
    // 卸任 cs[0]
    const btn0b = document.querySelector('[data-leader="' + cs[0].id + '"]');
    if (btn0b) btn0b.click();
    await new Promise(r2 => setTimeout(r2, 400));
    const othersHaveBtnAfter = [...cs.slice(1)].filter(c => document.querySelector('[data-leader="' + c.id + '"]')).length;
    return { leaderBtn: !!btn0, othersHaveBtn, othersHaveBtnAfter };
  });
  ok(r.leaderBtn, '无领导时晋升★按钮存在');
  ok(r.othersHaveBtn === 0, `领导在任时其他线程按钮隐藏（可见 ${r.othersHaveBtn} 个）`);
  ok(r.othersHaveBtnAfter === 4, `卸任后按钮恢复（可见 ${r.othersHaveBtnAfter} 个）`);
}

console.log(`\n页面错误: ${pageErrors.length}${pageErrors.length ? ' → ' + pageErrors.join(' | ') : ''}`);
ok(pageErrors.length === 0, '零页面错误');
console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
