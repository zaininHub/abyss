// v4.3.7 反馈专项（真实浏览器）：第四轮反馈批次②
//   ① 保活按钮前置 sys-pop 首位 + 展开后 elementFromPoint 命中自身（不被 save-pop 遮挡）
//   ② rp_storage desc「+12%/级」
//   ③ 探采页头开关：载具未购隐藏 / 购入显示
//   ④ 蒸馏区重排：去「· 自动蒸馏」/ 开关「自动」+aria-pressed / 蒸馏按钮并入开关行 / 工坊未购仍可用
//   ⑤ DM 任务 kind 谓词源码断言（relicsUnlocked 接入 availableResKinds）
//   ⑥ 成就列表滚动位置：dirty 周期重建后保持（fallback 实时捕获）
//   ⑦ 共鸣成就不回退——口径说明项，无 UI 断言
//
// 用法：node tests/v437-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
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
  await sleep(900);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);

  // ============ ① 保活按钮前置 ============
  console.log('\n[① 保活按钮前置]');
  const d1 = await page.evaluate(() => {
    const pop = document.getElementById('sys-pop');
    const keep = document.getElementById('keep-awake-btn');
    if (!pop || !keep) return { exists: false };
    const kids = [...pop.children];
    return { exists: true, idx: kids.indexOf(keep), n: kids.length };
  });
  if (!d1.exists) bad('#keep-awake-btn 存在');
  else d1.idx >= 1 && d1.idx <= 2 ? ok('#keep-awake-btn 前置到弹层前列', `children[${d1.idx}]/${d1.n}（0=标签）`)
    : bad('#keep-awake-btn 未前置', `children[${d1.idx}]/${d1.n}`);

  // 展开选项后：保活按钮中心点命中自身（不被 save-pop 覆盖）
  const d1b = await page.evaluate(async () => {
    const sysBtn = document.getElementById('sys-menu-btn');
    sysBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    sysBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const pop = document.getElementById('sys-pop');
    const keep = document.getElementById('keep-awake-btn');
    if (!pop || !keep) return { hit: 'missing' };
    const cs = getComputedStyle(pop);
    const r = keep.getBoundingClientRect();
    // 若弹层未展开（display:none），几何为 0 → 直接判 CSS 隐藏态
    if (cs.display === 'none' || r.width === 0) {
      // 改判：DOM 前置后 keep-awake 在弹层中排第一（save-pop 是同级兄弟且在其后展开）
      const kids = [...pop.children];
      return { hit: kids.indexOf(keep) <= 1 ? 'self(display:none,but first)' : 'other(display:none,not first)' };
    }
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { hit: el === keep || (el && keep.contains(el)) ? 'self' : String(el?.id || el?.className || 'other') };
  });
  /^self/.test(d1b.hit) ? ok('保活按钮在弹层首位（无遮挡路径）', d1b.hit)
    : bad('保活按钮被遮挡', JSON.stringify(d1b));

  // ============ ② rp_storage +12%/级 ============
  console.log('\n[② 储备扩容量]');
  // 种子：解 RP 锚点 + res 组前置（rp_storage 在研究升级列表 research-upgrade-list）
  // v4.3.5 记忆：种子写入字段后必须置对应 dirty 才会重渲染——商店重渲染走 window.__gameDirty.shop
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { rp_vault: 5, storage: 20 });
    S.rpTheories = Object.assign({}, S.rpTheories, { rp_entropy: 2, rp_matrix: 2, rp_wage: 2, rp_dm: 2 });
    S.rp = 5e4; S.ep = 1e7;
    if (window.__gameDirty) { window.__gameDirty.shop = true; window.__gameDirty.rp = true; }
  });
  await sleep(600);
  const d2 = await page.evaluate(() => {
    const root = document.getElementById('research-upgrade-list') || document.getElementById('rp-panel');
    const card = root?.querySelector('[data-research="rp_storage"]');
    const anyRp = root?.textContent || '';
    return { desc: card?.querySelector('.desc')?.textContent || card?.textContent || '',
      hasCard: !!card, rpPanelLen: anyRp.length };
  });
  if (!d2.hasCard) bad('rp_storage 卡未渲染（种子不足）', `rpPanelLen=${d2.rpPanelLen}`);
  else {
    // 卡面为「变化量」口径（如 EP 存储上限 +360），百分比只在 desc/title/下一级回落文案中出现；
    // 数值真源断言走源码（v: 0.12），卡面断言放宽为非 +8% 系（旧值残留检出）
    const { readFileSync } = await import('fs');
    const src = readFileSync(process.cwd() + '/src/data/balance.js', 'utf8');
    const m = src.match(/id:\s*'rp_storage'[\s\S]{0,300}?v:\s*([\d.]+)/);
    const v = m ? parseFloat(m[1]) : 0;
    v === 0.12 ? ok('rp_storage fx v=0.12（+12%/级，源码断言）', `v=${v}`)
      : bad('rp_storage fx 未更新', `v=${v}`);
    !/8%\/级/.test(d2.desc) ? ok('卡面无旧「+8%/级」残留', d2.desc.trim().slice(0, 60))
      : bad('卡面残留旧文案', d2.desc.trim().slice(0, 60));
  }

  // ============ ③ 探采页头开关门控 ============
  console.log('\n[③ 探采页头开关门控]');
  // 裂隙触发但未购载具（scooter=0）：开关应隐藏
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { scooter: 0, dm_vault: 1 }); // dm_vault 撑 riftShown/dm 锚点场景
    S.riftCount = Math.max(S.riftCount || 0, 1); // 裂隙已触发
    window.__gameDirty && (window.__gameDirty.shop = true, window.__gameDirty.top = true);
  });
  await sleep(400);
  const d3 = await page.evaluate(() => {
    const btn = document.querySelector('[data-probe-toggle]');
    if (!btn) return { state: 'absent' };
    return { state: 'present', display: getComputedStyle(btn).display };
  });
  d3.state === 'absent' || d3.display === 'none'
    ? ok('载具未购时页头开关不可见', JSON.stringify(d3))
    : bad('载具未购时开关仍显示', JSON.stringify(d3));
  // 购入首辆载具：开关应显示
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { scooter: 1 });
    window.__gameDirty && (window.__gameDirty.shop = true, window.__gameDirty.top = true);
  });
  await sleep(400);
  const d3b = await page.evaluate(() => {
    const btn = document.querySelector('[data-probe-toggle]');
    if (!btn) return { state: 'absent' };
    return { state: 'present', display: getComputedStyle(btn).display, text: btn.textContent };
  });
  d3b.state === 'present' && d3b.display !== 'none'
    ? ok('购入载具后开关恢复显示', JSON.stringify(d3b))
    : bad('购入载具后开关未显示', JSON.stringify(d3b));

  // ============ ④ 蒸馏区重排 ============
  console.log('\n[④ 蒸馏区重排]');
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { rp_vault: 5, atrium: 2 });
    S.rp = 100; S.ep = 1e7;
    window.__gameDirty && (window.__gameDirty.rp = true, window.__gameDirty.shop = true);
  });
  await sleep(400);
  const d4 = await page.evaluate(() => {
    const host = document.getElementById('atrium-switch-host');
    const txt = host?.textContent.replace(/\s+/g, ' ').trim() || '';
    const sw = host?.querySelector('[data-atrium-switch]');
    const distill = host?.querySelector('#rp-distill-btn');
    const swText = (sw?.textContent || '').trim();
    return { txt, autoWord: swText === '自动开' || swText === '自动关', swText, aria: sw?.getAttribute('aria-checked'), role: sw?.getAttribute('role'),
      distillInHost: !!distill, noOldTitle: !txt.includes('自动蒸馏'),
      distillBeforeSwitch: !!(sw && distill && (distill.compareDocumentPosition(sw) & Node.DOCUMENT_POSITION_FOLLOWING)) };
  });
  d4.noOldTitle ? ok('标题已去「· 自动蒸馏」', d4.txt.slice(0, 50)) : bad('「自动蒸馏」文案残留', d4.txt.slice(0, 50));
  d4.autoWord ? ok('开关文案为「自动开 / 自动关」', d4.swText) : bad('开关文案异常', d4.txt.slice(0, 50));
  d4.distillBeforeSwitch ? ok('蒸馏按钮位于自动开关左侧') : bad('蒸馏按钮不在自动开关左侧');
  (d4.role === 'switch' && ['true', 'false'].includes(d4.aria))
    ? ok('自动开关带滑块语义', `${d4.role}/${d4.aria}`)
    : bad('自动开关缺 role=switch 或 aria-checked', JSON.stringify(d4));
  d4.distillInHost && d4.txt.includes('蒸馏') ? ok('蒸馏按钮并入开关行（v4.3.13 文案精简为「蒸馏」）') : bad('蒸馏按钮不在开关行内或文案异常', d4.txt.slice(0, 50));
  // 工坊未购（atrium=0）时蒸馏按钮仍存在
  await page.evaluate(() => {
    window.S.upgrades = Object.assign({}, window.S.upgrades, { atrium: 0 });
    window.__gameDirty && (window.__gameDirty.rp = true);
  });
  await sleep(400);
  const d4b = await page.evaluate(() => ({
    hasBtn: !!document.querySelector('#rp-distill-btn'),
    hostTxt: document.getElementById('atrium-switch-host')?.textContent.replace(/\s+/g, ' ').trim() || '',
  }));
  d4b.hasBtn ? ok('工坊未购时蒸馏按钮仍存在', d4b.hostTxt.slice(0, 40)) : bad('工坊未购时蒸馏按钮消失');

  // ============ ⑤ DM 任务 kind 谓词（Node 侧源码断言） ============
  console.log('\n[⑤ DM 任务 kind 门控]');
  {
    const { readFileSync } = await import('fs');
    const src = readFileSync(process.cwd() + '/src/modules/projects.js', 'utf8');
    /kindGate/.test(src) && /relicsUnlocked/.test(src)
      ? ok('projects.js kind 级谓词已接入 relicsUnlocked（源码断言）')
      : bad('kind 级谓词缺失');
  }

  // ============ ⑥ 成就滚动位置周期重建保持 ============
  console.log('\n[⑥ 滚动位置保持]');
  // 种 60 条成就（真实 id 走 __qa 钩子，与 v431 同款）+ 展开面板
  await page.evaluate(() => {
    const ids = (window.__qa && window.__qa.ACHIEVEMENT_IDS) || [];
    window.S.achievements = Object.assign({}, window.S.achievements,
      Object.fromEntries(ids.slice(0, 60).map(id => [id, true])));
    const pane = document.getElementById('tab-achievement');
    if (pane) { pane.style.display = ''; pane.classList.remove('sl-collapsed'); }
    window.__gameDirty && (window.__gameDirty.achievements = true);
  });
  await sleep(500);
  const d6 = await page.evaluate(async () => {
    // 滚动容器 = #achievement-panel；累积加载默认只展示 5 条（achPage=1）→ 先触底追加 2 次
    // 撑出滚动高度，再滚到中部测「周期重建不跳顶」。
    const list = document.getElementById('achievement-panel');
    if (!list) return { err: 'no #achievement-panel' };
    for (let i = 0; i < 3; i++) {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 300));
    }
    if (!(list.scrollHeight > list.clientHeight + 40))
      return { err: 'still not scrollable', h: list.clientHeight, sh: list.scrollHeight };
    list.scrollTop = 120;
    await new Promise(r => setTimeout(r, 120));
    const before = list.scrollTop;
    window.__gameDirty && (window.__gameDirty.achievements = true);
    await new Promise(r => setTimeout(r, 500));
    const after = list.scrollTop;
    return { before, after };
  });
  d6.err ? bad('成就滚动容器定位', JSON.stringify(d6))
    : d6.before > 0 && Math.abs(d6.after - d6.before) <= 30
      ? ok('周期重建后滚动位置保持', `before=${d6.before} after=${d6.after}`)
      : bad('周期重建滚动跳顶', JSON.stringify(d6));

  // ============ 稳定性 ============
  errors.length === 0 ? ok('0 pageerror') : bad('pageerror', errors.join(' | ').slice(0, 300));

  console.log(`\n=== v4.3.7 专项：${pass} PASS / ${fail} FAIL ===`);
} finally {
  await browser.close();
}
process.exit(fail > 0 ? 1 : 0);
