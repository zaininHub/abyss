// v3.6.0 扩充内容浏览器自动化测试（puppeteer-core + 真实 dist 产物）
// 覆盖：研究菜单 4 组 / 成就总数 / AI 助手编队购买与分配 / 星际跃迁与星系分组 /
//       剧情驻留门控 / 殖民后消耗与时间文案 / 全页无 JS 报错
// 运行：先 npm run build；本机需设置 CHROME_PATH（或沿用 CI 的 /usr/local/bin/chromium）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

// Node 侧逻辑断言会写 localStorage —— 先注入最小桩
globalThis.localStorage = globalThis.localStorage || {
  _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
};

const { BALANCE } = await import('../src/data/balance.js');
const { UPGRADES } = await import('../src/data/upgrades.js');
const { RP_GROUPS } = await import('../src/modules/shop.js');
const E = await import('../src/modules/expedition.js');

const CHROME = process.env.CHROME_PATH || '/usr/local/bin/chromium';
const PAGE_URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };
const check = (cond, name, detail = '') => cond ? ok(name, detail) : bad(name, detail);

// ===================== Node 侧：静态结构断言 =====================
{
  const all = RP_GROUPS.flatMap(g => g.ids);
  check(RP_GROUPS.length === 4 && all.length === 30, '① 研究菜单 4 组 30 项', `${RP_GROUPS.length} 组 / ${all.length} 项`);
  check(BALANCE.researchUpgs.every(u => all.includes(u.id)), '① 全部研究项都挂在面板分组（可购）');
  check(RP_GROUPS.some(g => g.key === 'star'), '① 新增「星际与拟我」菜单组');

  const assist = UPGRADES.find(u => u.id === 'ai_assist');
  check(!!assist && assist.maxLevel === 8, '⑨ 升级商店含「AI 助手编队」（上限 8 槽）', assist && `${assist.name} Lv.${assist.maxLevel}`);
  check(Object.keys(BALANCE.ai.assistants.typeLabels || {}).length === 8, '⑨ 8 类助手分配项均有中文标签');

  // 成就定义：从 main.js 源码中截取 ACHIEVEMENTS 数组，校验数量与 id 唯一
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const seg = src.slice(src.indexOf('const ACHIEVEMENTS'), src.indexOf('function checkAch'));
  const ids = [...seg.matchAll(/\{\s*id:\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
  check(ids.length >= 78, '② 成就定义扩充至 ≥78 项', `${ids.length} 项`);
  check(new Set(ids).size === ids.length, '② 成就 id 全局唯一（无重复解锁）');

  check(E.GALAXIES.length === 6 && new Set(E.GALAXIES.map(g => g.group)).size === 6,
    '⑧ 6 个星球分属 6 个星系群');
  check(Object.keys(BALANCE.starRes.labels).length === 5, '⑧ 5 种星际专属资源');
}

// ===================== 浏览器：真实 DOM / 点击交互 =====================
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1200 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 220)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 180)); });

await page.evaluateOnNewDocument(() => {
  localStorage.setItem('abyss_idle_v2', JSON.stringify({
    _version: 6,
    chapter: '5', chapterEnteredAt: Date.now(), startedAt: Date.now() - 5 * 86400000,
    ep: 1e15, rp: 1e12, pt: 1e9, dm: 1e9, es: 1e4, faith: 1e5, starCps: 1e6,
    // storage 120 → EP 上限 ~1e13，与助手编队第 4~5 槽成本（1e9~1e10）匹配，商店卡不会灰态拦截
    upgrades: { storage: 120, rp_vault: 6, pt_vault: 6, ai_assist: 3 },
    buildings: {}, tech: { ai_core: true, deep_space: true, prestige2: true },
    rpTheories: { rp_entropy: 4, rp_wage: 4 },
    achievements: {}, colonies: {}, starRes: { stardust: 500 },
    policies: {}, religion: { unlocked: true, branch: 'sun', sun: true, temple: 3 },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
    cultists: [{ id: 1, name: 'T', output: 30, mood: '正常', moodTimer: 60 }],
    lastSeen: Date.now(), startTime: Date.now(),
  }));
});
await page.goto(PAGE_URL, { waitUntil: 'load' });
await sleep(1800);

// ---- ⑨ AI 助手编队：面板可见、8 类中文标签 ----
const aiUi = await page.evaluate(() => ({
  visible: document.getElementById('ai-card')?.style.display !== 'none',
  text: document.getElementById('ai-panel')?.innerText || '',
  slots: window.S.upgrades?.ai_assist || 0,
}));
check(aiUi.visible && /AI 助手编队/.test(aiUi.text), '⑨ AI 面板渲染「AI 助手编队」', `${aiUi.slots} 槽`);
const missingLabels = ['升级商店', '效能建筑', '星系殖民', '宇宙工程', '科技研究', '政策颁行', '裂隙升级', '宗教圣所']
  .filter(t => !aiUi.text.includes(t));
check(missingLabels.length === 0, '⑨ 8 类自动购买分配项均为中文标签', missingLabels.length ? '缺: ' + missingLabels.join(',') : '');

// ---- ⑨ 分配 + / − 交互 ----
const alloc = await page.evaluate(() => {
  document.querySelector('[data-assist-inc="upgrade"]')?.click();
  const inc = window.S.ai.alloc?.upgrade || 0;
  document.querySelector('[data-assist-dec="upgrade"]')?.click();
  const dec = window.S.ai.alloc?.upgrade || 0;
  return { inc, dec };
});
check(alloc.inc === 1 && alloc.dec === 0, '⑨ 面板 +/− 分配助手即时写入存档', `+ → ${alloc.inc}, − → ${alloc.dec}`);

// ---- ⑨ AI 面板购买编队（与商店同价） ----
const panelBuy = await page.evaluate(() => {
  window.S.ep = 1e15; // 主循环每帧把 EP 钳回存储上限；购买前同步补足
  const before = { lv: window.S.upgrades.ai_assist || 0, ep: window.S.ep };
  document.querySelector('[data-assist-buy]')?.click();
  return { before, lv: window.S.upgrades.ai_assist || 0, ep: window.S.ep, dirtyShop: window.__gameDirty.shop };
});
check(panelBuy.lv === panelBuy.before.lv + 1 && panelBuy.ep < panelBuy.before.ep,
  '⑨ AI 面板购买编队 +1 槽并扣 EP', `Lv.${panelBuy.before.lv} → Lv.${panelBuy.lv}`);
check(panelBuy.dirtyShop === true, '⑨ 面板购买后主商店卡同步置脏');

// ---- ⑨ 升级商店购买编队 + AI 面板刷新 ----
const shopBuy = await page.evaluate(() => {
  window.S.ep = 1e15;
  const card = document.querySelector('[data-buy="ai_assist"]');
  if (!card) return { found: false };
  const before = window.S.upgrades.ai_assist || 0;
  card.click();
  return { found: true, before, after: window.S.upgrades.ai_assist || 0, dirtyAi: window.__gameDirty.ai, text: card.innerText };
});
check(shopBuy.found && /AI 助手编队/.test(shopBuy.text || ''), '⑨ 升级商店渲染「AI 助手编队」卡');
check(shopBuy.after === shopBuy.before + 1, '⑨ 商店点击购买编队 +1 槽', `Lv.${shopBuy.before} → Lv.${shopBuy.after}`);
check(shopBuy.dirtyAi === true, '⑨ 商店购买后 AI 面板即时置脏（槽位同步）');

// ---- ① 研究点面板：4 组 + 新研究项可见 ----
await page.evaluate(() => document.getElementById('btn-rp')?.click());
await sleep(400);
const rpUi = await page.evaluate(() => document.getElementById('research-upgrade-list')?.innerText || '');
check(/产出强化/.test(rpUi) && /资源与消耗/.test(rpUi) && /深渊终局/.test(rpUi) && /星际与拟我/.test(rpUi),
  '① 研究点面板渲染 4 个分组菜单');
const newResearch = ['跃迁理论', '星蕴提纯', '律令演绎', '神性共振', '拟我协议', '熵流增幅'];
const missingRp = newResearch.filter(t => !rpUi.includes(t));
check(missingRp.length === 0, '① 新增研究项在研究点面板可见可购买', missingRp.length ? '缺: ' + missingRp.join(',') : '');

// ---- ⑧ 星图：跃迁引擎 / 星系分组 / 星球 / 天级时长 / M 量级成本 ----
await page.evaluate(() => {
  window.S.upgrades.global = 20000; // 抬高 CPS 以揭示全部星球
  window.__gameDirty.expedition = true;
  document.getElementById('btn-expedition')?.click();
});
await sleep(600);
const expUi = await page.evaluate(() => document.getElementById('expedition-panel')?.innerText || '');
check(/跃迁引擎/.test(expUi) && /洛伦兹因子/.test(expUi) && /光速硬上限/.test(expUi),
  '⑧ 星图渲染跃迁引擎（β / γ / 光速硬约束）');
check(/星系分组/.test(expUi) && /本地泡/.test(expUi) && /猎户臂/.test(expUi) && /星尘/.test(expUi),
  '⑧ 星图渲染 6 个星系分组与专属资源库存');
check(/月球基地/.test(expUi) && /仙女座/.test(expUi), '⑧ 星图按星球区分目的地（含河外星系）');
check(/1\.00M EP|1M EP|1000K EP/.test(expUi), '⑧ 首站出发消耗 M 量级 EP');
check(/\d+(\.\d+)? 天/.test(expUi), '⑧ 未殖民航行时间按「天」显示');

// ---- ⑧ 跃迁点击：消耗专属资源并压缩剩余时间 ----
const warp = await page.evaluate(() => {
  window.S.ep = 1e15; window.S.rp = 1e12; window.S.pt = 1e9;
  // 通过 UI 出发一次月球探索，再点击跃迁按钮
  const moon = document.querySelector('[data-galaxy="moon"]');
  if (!moon) return { started: false };
  moon.click();
  const btn = document.querySelector('[data-warp="0"]');
  if (!btn) return { started: false, warpBtn: false };
  const before = { res: (window.S.starRes || {}).stardust || 0, exp: window.S.expeditions[0] };
  const leftBefore = before.exp.duration - (Date.now() - before.exp.startsAt);
  btn.click();
  const nowExp = window.S.expeditions[0];
  const leftAfter = nowExp ? nowExp.duration - (Date.now() - nowExp.startsAt) : 0;
  return {
    started: true, warpBtn: true,
    resBefore: before.res, resAfter: (window.S.starRes || {}).stardust || 0,
    uses: window.S.jumpUses || 0, leftBefore, leftAfter,
  };
});
check(warp.warpBtn === true, '⑧ 进行中的探索显示「跃迁加速」按钮');
check(warp.resAfter < warp.resBefore && warp.uses >= 1, '⑧ 跃迁消耗专属资源（星尘）并计次',
  `${warp.resBefore} → ${warp.resAfter}`);
check(warp.leftAfter < warp.leftBefore * 0.85, '⑧ 跃迁按 γ 压缩在途剩余时间',
  `${Math.round(warp.leftBefore / 1000)}s → ${Math.round(warp.leftAfter / 1000)}s`);

// ---- ⑤ 殖民后：消耗降一数量级、时间转小时 ----
const colony = await page.evaluate(() => {
  const before = document.getElementById('expedition-panel')?.innerText || '';
  const card = document.querySelector('[data-colonize="moon"]');
  card?.click();
  return { before, after: document.getElementById('expedition-panel')?.innerText || '', colonized: !!window.S.colonies?.moon };
});
check(colony.colonized, '⑤ 点击建立月球殖民地');
check(/已殖民/.test(colony.after) && /100\.00K EP/.test(colony.after), '⑤ 殖民后出发消耗降一数量级（1.00M → 100.00K EP）');
check(/\d+(\.\d+)? 小时/.test(colony.after), '⑤ 殖民后航行时间由天转小时');

// ---- ⑥ 剧情：驻留不足不超前推进 ----
const story = await page.evaluate(() => {
  window.S.chapter = '5';
  window.S.chapterEnteredAt = Date.now();
  window.__tick(performance.now() + 1000);
  return { chapter: window.S.chapter, entered: window.S.chapterEnteredAt };
});
check(String(story.chapter) === '5', '⑥ 刚进入第 5 章时不因条件满足而连跳（3-7 天/章）', `当前第 ${story.chapter} 章`);

// ---- ② 成就：页头总数 ----
const ach = await page.evaluate(() => {
  document.getElementById('btn-achievement')?.click();
  return document.getElementById('achievement-panel')?.innerText || '';
});
check(/\/78/.test(ach), '② 成就面板显示总数 78', ach.match(/\d+\/\d+/)?.[0] || ach.slice(0, 60));

check(errs.length === 0, '全流程页面无 JS 报错', errs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
