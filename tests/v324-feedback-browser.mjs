// v3.2.4 反馈五项定向浏览器验证
// ①故事线可收起 ②故事线/成就右列面板有内容 ③设施·灵感工坊文案修正
// ④AI自动购建未全解锁不展示/文案精简 ⑤离线协议升级后「当前离线效率」即时反映
import puppeteer from 'puppeteer-core';
import { readdirSync } from 'fs';

const CHROME = '/usr/local/bin/chromium'; // Linux CI 环境适配
const URL = 'file://' + process.cwd().replace(/\\/g, '/') + '/dist/index.html';
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1600,1000'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1500);

  // ② 故事线/成就右列面板有内容
  const panels = await page.evaluate(() => ({
    story: document.getElementById('storyline-panel')?.textContent.trim() || '',
    ach: document.getElementById('achievement-panel')?.textContent.trim() || '',
  }));
  if (panels.story.includes('当前路线')) ok('② 故事线面板有内容', panels.story.slice(0, 30)); else bad('② 故事线面板', panels.story.slice(0, 40) || 'EMPTY');
  if (panels.ach.includes('深渊成就')) ok('② 成就面板有内容', panels.ach.slice(0, 30)); else bad('② 成就面板', panels.ach.slice(0, 40) || 'EMPTY');

  // ① 故事线收起/展开
  await page.click('#storyline-h3');
  await sleep(150);
  const collapsed = await page.evaluate(() => ({
    cls: document.getElementById('tab-storyline').classList.contains('sl-collapsed'),
    panelHidden: getComputedStyle(document.getElementById('storyline-panel')).display === 'none',
    ind: document.querySelector('#storyline-h3 .sl-ind')?.textContent,
  }));
  if (collapsed.cls && collapsed.panelHidden && collapsed.ind === '▸') ok('① 点击标题收起（面板隐藏+箭头▸）');
  else bad('① 收起', JSON.stringify(collapsed));
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  const persisted = await page.evaluate(() => ({
    cls: document.getElementById('tab-storyline').classList.contains('sl-collapsed'),
    hidden: getComputedStyle(document.getElementById('storyline-panel')).display === 'none',
  }));
  if (persisted.cls && persisted.hidden) ok('① 收起状态跨刷新保留（localStorage）');
  else bad('① 收起持久化', JSON.stringify(persisted));
  await page.click('#storyline-h3'); await sleep(150);
  const expanded = await page.evaluate(() => !document.getElementById('tab-storyline').classList.contains('sl-collapsed')
    && getComputedStyle(document.getElementById('storyline-panel')).display !== 'none');
  if (expanded) ok('① 再点展开恢复'); else bad('① 展开');

  // ③ 灵感工坊首购卡文案修正 + 区标题随卡显隐
  const t3a = await page.evaluate(() => ({
    hasOldTitle: !!document.getElementById('atrium-title'),
    hostText: document.getElementById('building-list')?.textContent || '',
  }));
  if (!t3a.hasOldTitle && !t3a.hostText.includes('灵感工坊')) ok('③ 无独立工坊栏目、图标未达成时不显示');
  else bad('③ 工坊栏目形态', JSON.stringify(t3a).slice(0, 80));
  await page.evaluate(() => { window.S.ep = 30000; window.S.allTimeEp = 30000; window.S.upgrades.storage = 300; });
  await sleep(1600); // 1s 周期揭示
  const t3b = await page.evaluate(() => ({
    titleShown: document.getElementById('bld-title')?.style.display !== 'none',
    card: document.querySelector('#building-list')?.textContent || '',
  }));
  if (t3b.titleShown && t3b.card.includes('灵感工坊')) ok('③ EP 达标后首购卡+设施标题自动出现');
  else bad('③ 揭示', JSON.stringify(t3b).slice(0, 80));
  // v3.3.2：首购卡改标准 item 文案「自动蒸馏：-X EP/s → +Y RP/s」
  if (t3b.card.includes('灵感工坊') && !t3b.card.includes('未购') && !t3b.card.includes('常驻本区')
    && t3b.card.includes('自动蒸馏')) ok('③ 首购卡文案已精简（无「未购」/「常驻本区」）', t3b.card.slice(0, 60));
  else bad('③ 首购卡文案', t3b.card.slice(0, 80));

  // ④ AI 自动购建：未全解锁不展示（先解锁 AI 核心科技）
  await page.evaluate(() => { window.S.tech = { ...(window.S.tech || {}), ai_core: true }; window.__gameDirty.ai = true; });
  await sleep(600);
  const t4a = await page.evaluate(() => ({
    aiShown: document.getElementById('ai-card')?.style.display !== 'none',
    buildBox: document.querySelector('.ai-build-box')?.textContent || null,
  }));
  if (t4a.aiShown && t4a.buildBox === null) ok('④ 未全解锁：自动购建区块不展示');
  else bad('④ 未全解锁', JSON.stringify(t4a).slice(0, 100));
  // 全资源解锁 → 区块出现（精简文案，无「资源点 x/10」无长段落）
  await page.evaluate(() => {
    window.S.resDiscovered = { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true };
    window.S.ai = { ...(window.S.ai || {}) };
  });
  await sleep(1600); // 1s 周期检测翻转 → dirty.ai
  const t4b = await page.evaluate(() => {
    const box = document.querySelector('.ai-build-box')?.textContent || '';
    return { box, hasActivate: !!document.querySelector('[data-ai-build-activate]') };
  });
  if (t4b.hasActivate && t4b.box.includes('激活消耗') && !t4b.box.includes('资源点：') && !t4b.box.includes('激活后 AI 将按设定速率'))
    ok('④ 全解锁后区块出现且文案精简', t4b.box.slice(0, 50));
  else bad('④ 全解锁展示', t4b.box.slice(0, 100) || 'NO BOX');
  // 激活后形态（先 ep 充足 → 等 1s 周期刷新 disabled 态 → 再点，直接 DOM click）
  await page.evaluate(() => { window.S.ep = 1e7; });
  await sleep(1400); // EP 充足态翻转 → dirty.ai 重渲染（v3.2.4 修复：原 disabled 永久卡死）
  await page.evaluate(() => document.querySelector('[data-ai-build-activate]')?.click()); await sleep(250);
  const confirmTxt = await page.evaluate(() => ({ txt: document.querySelector('[data-ai-build-activate]')?.textContent, ep: window.S.ep }));
  await page.evaluate(() => document.querySelector('[data-ai-build-activate]')?.click()); await sleep(400);
  const t4c = await page.evaluate(() => {
    const box = document.querySelector('.ai-build-box')?.textContent || '';
    return { activated: box.includes('已激活'), hasRate: box.includes('购买间隔'), noLongText: !box.includes('下限'), unlocked: window.S.ai.autoBuildUnlocked, ep: window.S.ep };
  });
  if (t4c.activated && t4c.hasRate && t4c.noLongText) ok('④ 激活后精简形态（间隔档+倒计时）');
  else bad('④ 激活形态', JSON.stringify({ ...t4c, confirmTxt }));

  // ⑤ 离线效率：购入离线协议后面板即时反映 +12%/级
  const before = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#pause-modal button, .modal button')];
    return null; // 面板在暂停弹框内，直接读计算函数不可行 → 用 UI 路径：打开暂停
  });
  // 打开离线面板（暂停弹框内）——先暂停
  await page.click('#pauseBtn'); await sleep(600);
  const effBefore = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#pause-modal .off-stat')].find(e => e.textContent.includes('当前离线效率'));
    return el ? el.textContent.match(/(\d+)%/)?.[1] : null;
  });
  await page.evaluate(() => { window.S.paused = false; document.body.classList.remove('paused'); document.getElementById('pause-modal').style.display = 'none'; });
  // 购入离线协议 1 级（+12%）——researchMult 读 S.rpTheories
  await page.evaluate(() => { window.S.rpTheories = { ...(window.S.rpTheories || {}), rp_offline: 1 }; });
  await page.click('#pauseBtn'); await sleep(900);
  const effAfter = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#pause-modal .off-stat')].find(e => e.textContent.includes('当前离线效率'));
    return el ? el.textContent.match(/(\d+)%/)?.[1] : null;
  });
  await page.evaluate(() => { window.S.paused = false; document.getElementById('pause-modal').style.display = 'none'; document.body.classList.remove('paused'); });
  const b = Number(effBefore), a = Number(effAfter);
  if (b !== null && a !== null && Math.abs(a - b - b * 0.12) < 1) ok('⑤ 购入离线协议后当前离线效率 +12% 即时反映', `${b}% → ${a}%`);
  else bad('⑤ 离线效率展示', `before=${effBefore} after=${effAfter}`);

  // 页面错误
  if (errors.length === 0) ok('无页面 JS 错误'); else bad('页面 JS 错误', errors.join(' | ').slice(0, 200));
} catch (e) {
  bad('脚本异常', String(e).slice(0, 300));
} finally {
  await browser.close();
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
