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
const { ACHIEVEMENTS } = await import('../src/data/achievements.js'); // v3.12.12：清单已下沉 core/data，不再从 main.js 源码刮取
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
  // v3.12.11 反馈②：研究裁剪为 21 项；v3.12.12 ⑧：新增「AI 助手」独立分组（5 组 22 项）
  check(RP_GROUPS.length === 5 && all.length === 22, '① 研究菜单 5 组 22 项', `${RP_GROUPS.length} 组 / ${all.length} 项`);
  check(BALANCE.researchUpgs.every(u => all.includes(u.id)), '① 全部研究项都挂在面板分组（可购）');
  check(RP_GROUPS.some(g => g.key === 'star'), '① 新增「星际与拟我」菜单组');

  // v3.12.12 ⑧：助手编队升级（ai_assist）已于 v3.10.5 移除，扩编改走研究点「助手扩编协议」
  const aiUnit = BALANCE.researchUpgs.find(u => u.id === 'rp_ai_unit');
  check(!!aiUnit && aiUnit.requiresTech === 'ai_core', '⑨ 研究点含「助手扩编协议」（需 ai_core 解锁）', aiUnit && `${aiUnit.name} cap=${aiUnit.cap}`);

  // 成就定义：v3.10.0 起清单在 src/data/achievements.js（单一真源），校验数量与 id 唯一
  const ids = ACHIEVEMENTS.map(a => a.id);
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
    upgrades: { storage: 120, rp_vault: 6, pt_vault: 6 },
    // v3.12.12 ⑨：常驻班组模型需要空闲助手供占编 +/− 交互
    ai: { assistants: 6 },
    buildings: {}, tech: { ai_core: true, deep_space: true, prestige2: true },
    rpTheories: { rp_entropy: 4, rp_wage: 4 },
    achievements: {}, colonies: {}, starRes: { stardust: 500 },
    // v3.12.7 ⑦：殖民入口只列「探索回来过」的星系——夹具预置月球已完成一次探索
    galaxyDone: { moon: 1 },
    policies: {}, religion: { unlocked: true, branch: 'sun', sun: true, temple: 3 },
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
    cultists: [{ id: 1, name: 'T', output: 30, mood: '正常', moodTimer: 60 }],
    lastSeen: Date.now(), startTime: Date.now(),
  }));
});
await page.goto(PAGE_URL, { waitUntil: 'load' });
await sleep(1800);

// ---- ⑨ AI 助手：面板可见、动作卡 + 助手行（扩编提示 / 预留线并入 / 无购买按钮） ----
const aiUi = await page.evaluate(() => ({
  visible: document.getElementById('ai-card')?.style.display !== 'none',
  text: document.getElementById('ai-panel')?.innerText || '',
  headText: document.querySelector('[data-ai-assist-slot]')?.innerText || '',
  reserveInHead: !!document.querySelector('[data-ai-assist-slot] [data-ai-reserve]'),
  hasBuyBtn: !!document.querySelector('[data-assist-buy]'),
  actionCards: [...document.querySelectorAll('[data-ai-action]')].map(c => c.dataset.aiAction),
  assistants: window.S.ai?.assistants || 0,
}));
check(aiUi.visible && aiUi.actionCards.length >= 3, '⑨ AI 面板渲染自动化动作卡', `${aiUi.actionCards.length} 张`);
check(!aiUi.hasBuyBtn, '⑧ EP 购买助手按钮已删除（扩编走研究点）');
check(/研究点扩编/.test(aiUi.headText), '⑧ 助手行提示「研究点扩编」入口', aiUi.headText.slice(0, 40));
check(aiUi.reserveInHead, '⑧ 预留线并入助手行（与助手数量同处一行）');

// ---- ⑨ 占编 + / − 交互（v3.11 常驻班组模型） ----
const alloc = await page.evaluate(() => {
  document.querySelector('[data-ai-crew-inc="upgrade"]')?.click();
  const inc = window.S.ai.crew?.upgrade || 0;
  document.querySelector('[data-ai-crew-dec="upgrade"]')?.click();
  const dec = window.S.ai.crew?.upgrade || 0;
  return { inc, dec };
});
check(alloc.inc === 1 && alloc.dec === 0, '⑨ 面板 +/− 占编助手即时写入存档', `+ → ${alloc.inc}, − → ${alloc.dec}`);

// ---- ⑨ 研究点购买「助手扩编协议」→ 助手 +1（扩编唯一玩家入口） ----
const panelBuy = await page.evaluate(() => {
  window.S.rp = Math.max(window.S.rp || 0, 1e6);
  const card = document.querySelector('[data-research="rp_ai_unit"]');
  if (!card) return { found: false };
  const before = { assistants: window.S.ai?.assistants || 0, rp: window.S.rp, lv: window.S.rpTheories?.rp_ai_unit || 0 };
  card.click();
  return { found: true, before,
    after: { assistants: window.S.ai?.assistants || 0, rp: window.S.rp, lv: window.S.rpTheories?.rp_ai_unit || 0 },
    dirtyAi: window.__gameDirty.ai };
});
check(panelBuy.found, '⑨ 研究点渲染「助手扩编协议」卡');
check(panelBuy.found && panelBuy.after.assistants === panelBuy.before.assistants + 1 && panelBuy.after.rp < panelBuy.before.rp,
  '⑨ 研究点购买扩编协议：助手 +1 且扣 RP', `Lv.${panelBuy.before?.lv} → Lv.${panelBuy.after?.lv}`);
check(panelBuy.found && panelBuy.after.lv === panelBuy.before.lv + 1 && panelBuy.dirtyAi === true,
  '⑨ 购买后 AI 面板即时置脏（助手数量同步）');

// ---- ① 研究点面板：5 组 + 新研究项可见 ----
await page.evaluate(() => document.getElementById('btn-rp')?.click());
await sleep(400);
const rpUi = await page.evaluate(() => document.getElementById('research-upgrade-list')?.innerText || '');
// v3.12.12 ⑧：分组名改为「玩法扩展与配套 / 深渊扩展」，并新增「AI 助手」独立组
check(/产出强化/.test(rpUi) && /玩法扩展与配套/.test(rpUi) && /深渊扩展/.test(rpUi) && /AI 助手/.test(rpUi) && /星际/.test(rpUi),
  '① 研究点面板渲染 5 个分组菜单');
const newResearch = ['跃迁理论', '星蕴提纯', '律令演绎', '拟我协议', '熵减研究', '助手扩编协议'];
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

// ---- ② 成就：页头总数（总数随版本增长，动态对齐数据表；计数在 #achievement-h3 常驻头部） ----
const ach = await page.evaluate(() => {
  document.getElementById('btn-achievement')?.click();
  return {
    panel: document.getElementById('achievement-panel')?.innerText || '',
    head: document.getElementById('achievement-h3')?.innerText || '',
  };
});
check(ach.head.includes(`/${ACHIEVEMENTS.length}`), '② 成就面板头部显示总数与数据表一致',
  `${ACHIEVEMENTS.length} 项 · ${ach.head.slice(0, 40)}`);

check(errs.length === 0, '全流程页面无 JS 报错', errs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
