// v4.3.1 反馈专项（真实浏览器）：AI 组门控 / 商店组名 / 科技树标题 / 研究点头 / 蒸馏文案 / 保活开关 / 成就页 / 遗物提前
//
// 覆盖（对应交付说明 v4.3.1 九项反馈中的 UI 可断言项）：
//   ② 研究点 AI 助手组：未研究 ai_core 时不出现；buyTech('ai_core') 后即时出现
//   ③ 商店组名「工位」「仓储区」（原「基础产出」「存储与资源建筑」）
//   ④ 科技树页内不再有重复「科技树」标题（tab 名已标识）
//   ⑤ 研究点页无「研究点（RP）」字样与 ⓘ 悬浮窗；自动蒸馏文案「总计 -X EP/s +Y RP/s」
//   ⑥ 浏览器保活开关 #keep-awake-btn 存在、开关态与 S.keepAwake 同步（Wake Lock 能力可降级）
//   ⑦ 班组绑定语义（单测 v330 覆盖）——本专项不重复
//   ⑧ 成就面板固定高度 + 列表内滚 + 分页吸底（底边不随内容撑开）
//   ⑨ 遗物章节门禁 =3（Asset 双条件仍在），wiki 显示跟随
//   ⑩ 0 pageerror
//
// 用法：node tests/v431-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
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

  // ---- 种子：RP 锚点 + 前组累计 4 级（让 AI 组的 prev:res/need:4 满足，只卡 ai_core）----
  // 基础四栋让设施分区可见；rp_vault 解 RP 锚点；rp 前组累计 4 级解 res 组
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { rp_vault: 5, storage: 20, atrium: 1, canteen: 1 }); // storage 20 级抬 EP 上限 > 1e6（否则帧把 1e7 钳到 3e3，买不起 ai_core）
    S.buildings = Object.assign({}, S.buildings, { canteen: 1 });
    // AI 组 unlock:{prev:'res',need:4}——须让 res 组累计 4 级（rp_wage×2 + rp_dm×2）才满足前置
    S.rpTheories = Object.assign({}, S.rpTheories, { rp_entropy: 2, rp_matrix: 2, rp_wage: 2, rp_dm: 2 });
    S.rp = 5e4; S.ep = 1e7;
    // ⑧ 成就分页需 ≥6 条才出 2 页——种 6 个真实成就 id（注册表前 6 个，避免伪造键）
    S.achievements = Object.assign({}, S.achievements,
      Object.fromEntries(window.__qa.ACHIEVEMENT_IDS.slice(0, 6).map(id => [id, true])));
    // 确保 ai_core 未研究（种子显式清掉，浏览器开局可能已带）
    delete S.tech.ai_core;
  });
  await sleep(400);

  // ---- ② AI 组门控 ----
  console.log('\n[② AI 助手组 ai_core 门控]');
  await page.click('#btn-rp');
  await sleep(500);
  // AI 组由 renderResearchUpgrades 渲染在 #research-upgrade-list（非 #rp-panel）
  const d2a = await page.evaluate(() => {
    const list = document.getElementById('research-upgrade-list');
    return { hasAI: (list?.textContent || '').includes('AI 助手'),
      groupsShown: window.__qa.RP_GROUPS.filter(g => !!(list?.textContent || '').includes(g.name)).map(g => g.key) };
  });
  !d2a.hasAI ? ok('未研究 ai_core 时 AI 助手组不出现（无空壳）', `可见组=${d2a.groupsShown.join(',')}`)
    : bad('AI 组应等 ai_core 解锁', JSON.stringify(d2a));
  // 经产品真实入口买 ai_core（QA buyTech）
  const d2buy = await page.evaluate(() => {
    const t = window.__qa.getTechs().find(x => x.id === 'ai_core');
    if (!t) return { found: false };
    window.__qa.buyTech(t);
    return { found: true, owned: !!window.S.tech.ai_core };
  });
  d2buy.owned ? ok('buyTech 购入 ai_core 成功') : bad('ai_core 购买失败', JSON.stringify(d2buy));
  await sleep(1500); // 帧系统 dirty.rp → 面板重绘周期 1s
  const d2b = await page.evaluate(() => ({
    hasAI: (document.getElementById('research-upgrade-list')?.textContent || '').includes('AI 助手'),
  }));
  d2b.hasAI ? ok('解锁 ai_core 后 AI 助手组即时显现（dirty.rp 同步）') : bad('AI 组未即时显现');

  // ---- ⑤ 研究点头 + 蒸馏文案 ----
  console.log('\n[⑤ 研究点头部 / 蒸馏文案]');
  const d5 = await page.evaluate(() => {
    const p = document.getElementById('rp-panel');
    const txt = p?.textContent || '';
    const html = p?.innerHTML || '';
    const sw = document.getElementById('atrium-switch-host');
    return { hasTitle: txt.includes('研究点（RP）'), hasInfo: html.includes('rp-info-i'),
      swText: sw ? sw.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  !d5.hasTitle ? ok('研究点页无「研究点（RP）」标题') : bad('研究点标题残留');
  !d5.hasInfo ? ok('ⓘ 悬浮窗已移除') : bad('rp-info-i 残留');
  /总计\s+-\d[\d.]*[KMB]? EP\/s\s+\+\d[\d.]*[KMB]? RP\/s/.test(d5.swText)
    ? ok('自动蒸馏文案为「总计 -X EP/s +Y RP/s」', d5.swText)
    : bad('蒸馏文案不符', d5.swText);
  !/EP 不足自动暂停|回升继续/.test(d5.swText) ? ok('旧括注已移除') : bad('旧括注残留', d5.swText);

  // ---- ④ 科技树标题 ----
  console.log('\n[④ 科技树页内标题]');
  await page.click('#btn-tech');
  await sleep(400);
  const d4 = await page.evaluate(() => {
    const pane = document.getElementById('tab-tech');
    const hs = [...(pane?.querySelectorAll('h3') || [])].map(h => h.textContent.trim());
    return { firstH3: hs[0] || null, hs };
  });
  !d4.hs.some(h => h === '科技树') ? ok('科技树页内无重复「科技树」标题', `现有 h3=${d4.hs.join(' | ')}`)
    : bad('页内仍有「科技树」标题');

  // ---- ③ 商店组名 ----
  console.log('\n[③ 商店组名]');
  await page.click('#btn-shop');
  await sleep(500);
  const d3 = await page.evaluate(() => {
    const body = document.body.textContent;
    return { hasWorkstation: body.includes('工位'), hasStorage: body.includes('仓储区'),
      hasOld1: body.includes('基础产出'), hasOld2: body.includes('存储与资源建筑') };
  });
  // 「基础产出」在 desc 里仍有（升级卡效果文案），这里只断言组标题存在新名；旧组名在 body 可能级联注释不渲染
  d3.hasWorkstation && d3.hasStorage ? ok('商店组名「工位」「仓储区」已渲染') : bad('组名未渲染', JSON.stringify(d3));

  // ---- ⑥ 保活开关 ----
  console.log('\n[⑥ 浏览器保活开关]');
  const d6a = await page.evaluate(() => {
    const b = document.getElementById('keep-awake-btn');
    return { exists: !!b, pressed: b?.getAttribute('aria-pressed'), supported: window.__qa.WAKE_LOCK_SUPPORTED };
  });
  d6a.exists ? ok('#keep-awake-btn 按钮存在', `pressed=${d6a.pressed} supported=${d6a.supported}`) : bad('保活按钮缺失');
  // 点击切换（headless Chromium 通常支持 Wake Lock；不支持时按钮提示但不改状态——两种结果都可接受）
  await page.click('#keep-awake-btn');
  await sleep(500);
  const d6b = await page.evaluate(() => ({
    kept: !!window.S.keepAwake, pressed: document.getElementById('keep-awake-btn')?.getAttribute('aria-pressed'),
  }));
  d6b.kept === (d6b.pressed === 'true') ? ok('S.keepAwake 与按钮 aria-pressed 同步', JSON.stringify(d6b))
    : bad('保活状态不同步', JSON.stringify(d6b));

  // ---- ⑧ 成就页固定高度 / 内滚 / 分页吸底 ----
  console.log('\n[⑧ 成就页布局]');
  const d8 = await page.evaluate(() => {
    const pane = document.getElementById('tab-achievement');
    const list = document.getElementById('achievement-panel');
    const pager = list?.querySelector('.crew-pager');
    if (!pane || !list) return { exists: false };
    const cs = getComputedStyle(list);
    const pr = pane.getBoundingClientRect();
    const gr = pager ? pager.getBoundingClientRect() : null;
    return { exists: true, paneH: pr.height, listOverflow: cs.overflowY,
      scrollable: list.scrollHeight > list.clientHeight,
      pagerBottomGap: gr ? Math.round(pr.bottom - gr.bottom) : null };
  });
  d8.exists && d8.paneH >= 200 && d8.paneH <= 400 ? ok('成就面板固定高度（clamp 范围内）', `h=${d8.paneH}px`)
    : bad('成就面板未定高', JSON.stringify(d8));
  d8.listOverflow === 'auto' ? ok('列表区 overflow-y:auto（内部滚动）') : bad('列表区不可滚', d8.listOverflow);
  d8.pagerBottomGap !== null && Math.abs(d8.pagerBottomGap) <= 18 ? ok('分页吸底（与面板底部差 ≤18px，含 panel padding）', `gap=${d8.pagerBottomGap}px`)
    : bad('分页未吸底', JSON.stringify(d8));

  // ---- ⑨ 遗物章节门禁 = 3（Node 侧读源码，dist 无模块导出）----
  console.log('\n[⑨ 遗物提前]');
  const { CHAPTER_GATES } = await import('../src/core/chapterGates.js');
  CHAPTER_GATES.relics === 3 ? ok('遗物门禁 = 3（原 9）') : bad('遗物门禁未下调', String(CHAPTER_GATES.relics));
  CHAPTER_GATES.delve === 11 ? ok('深潜门禁保持 11（本批不动）') : bad('深潜门禁被误改', String(CHAPTER_GATES.delve));
  const { WIKI_SECTIONS } = await import('../src/data/wiki.js');
  const unlockWiki = WIKI_SECTIONS.find(s => s.id === 'unlock')?.body() || '';
  unlockWiki.includes('第 3 章 ∧ 裂隙已触发 ∧ DM 已发现')
    ? ok('wiki 遗物解锁口径同步为第 3 章') : bad('wiki 遗物口径未同步');

  // ---- ⑩ pageerror ----
  console.log('\n[⑩ 稳定性]');
  errors.length === 0 ? ok('0 pageerror', '') : bad(`pageerror ×${errors.length}`, errors.slice(0, 3).join(' | '));

  console.log(`\n=== v4.3.1 专项：${pass} PASS / ${fail} FAIL ===`);
  process.exitCode = fail > 0 ? 1 : 0;
} finally {
  await browser.close();
}
