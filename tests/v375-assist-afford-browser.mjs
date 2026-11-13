// v3.12.12 反馈⑧ · 真实 Chrome 回归：AI 助手扩编改走研究点「助手扩编协议」（rp_ai_unit）
//
// v3.7.5 原口径（EP 购买按钮灰显）已随反馈⑧移除购买按钮而失效；本文件重写为：
//   ① 助手行无 EP 购买按钮，预留线并入助手行（标题 slot 内）
//   ② 扩编协议卡在研究点可见（需 ai_core），RP 不足灰态
//   ③ 点击购买 → 助手 +1、RP 扣费、dirty.ai；再买一级继续 +1
//   ④ 未解锁 ai_core → 卡不渲染（解锁仍留在升级商店科技树）
//   ⑤ 命中目标 ≥24×24（预留线移入标题行后仍达标）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const mkSave = (over = {}) => JSON.stringify({
  _version: 6, chapter: '5', chapterEnteredAt: Date.now(), startedAt: Date.now() - 5 * 86400000,
  ep: 0, rp: 1e12, pt: 1e9, dm: 1e9, es: 1e4, faith: 1e5, starCps: 1e6,
  upgrades: { storage: 120, rp_vault: 6, pt_vault: 6 },
  ai: { assistants: 4 },
  buildings: {}, tech: { ai_core: true, deep_space: true, prestige2: true },
  rpTheories: { rp_entropy: 4, rp_wage: 4 },
  achievements: {}, colonies: {}, starRes: { stardust: 500 }, policies: {},
  religion: { unlocked: true, branch: 'sun', sun: true, temple: 3 },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  cultists: [{ id: 1, name: 'T', output: 1, mood: '正常', moodTimer: 60 }],
  lastSeen: Date.now(), startTime: Date.now(),
  ...over,
});

const errs = [];
async function boot(browser, save) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument(s => localStorage.setItem('abyss_idle_v2', s), save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1400); // 等首次渲染 + 面板就绪
  return page;
}

const browser = await puppeteer.launch({
  executablePath: chromePath(), headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
});

try {
  console.log('\n[1] 助手行：无 EP 购买按钮，预留线并入标题行');
  const page = await boot(browser, mkSave());
  {
    const s = await page.evaluate(() => {
      const slot = document.querySelector('[data-ai-assist-slot]');
      return {
        head: slot?.innerText || '',
        hasBuyBtn: !!document.querySelector('[data-assist-buy]'),
        reserveInHead: !!slot?.querySelector('[data-ai-reserve]'),
        reserveBtns: [...(slot?.querySelectorAll('[data-ai-reserve]') || [])].map(b => b.textContent.trim()),
        assistants: window.S.ai?.assistants || 0,
      };
    });
    if (!s.hasBuyBtn) ok('① EP 购买助手按钮已删除（扩编走研究点）');
    else bad('① 购买按钮仍存在');
    if (s.reserveInHead && s.reserveBtns.length >= 3) ok('② 预留线并入助手行（与助手数量同处一行）', s.reserveBtns.join('/'));
    else bad('② 预留线不在助手标题行内', JSON.stringify(s.reserveBtns));
    if (!/研究点扩编/.test(s.head)) ok('③ 常驻「研究点扩编」提示已移除（信息移入悬浮框）');
    else bad('③ 仍残留常驻扩编提示', s.head.slice(0, 60));
    if (s.assistants === 4) ok('④ 存档助手数量正确渲染', `assistants=${s.assistants}`);
    else bad('④ 助手数量异常', String(s.assistants));
  }

  console.log('\n[2] 研究点「助手扩编协议」：可见 + RP 充足时点击购买 → 助手 +1');
  {
    const r = await page.evaluate(() => {
      const card = document.querySelector('[data-research="rp_ai_unit"]');
      if (!card) return { found: false };
      const before = {
        assistants: window.S.ai?.assistants || 0, rp: window.S.rp,
        lv: window.S.rpTheories?.rp_ai_unit || 0,
        cant: card.classList.contains('cant'), text: card.innerText,
      };
      card.click();
      return { found: true, before,
        after: { assistants: window.S.ai?.assistants || 0, rp: window.S.rp,
          lv: window.S.rpTheories?.rp_ai_unit || 0 },
        dirtyAi: window.__gameDirty.ai };
    });
    if (r.found) ok('⑤ 研究点渲染「助手扩编协议」卡（需 ai_core）', (r.before.text || '').split('\n')[0]);
    else { bad('⑤ 扩编协议卡未渲染'); }
    if (r.found && r.before.cant === false) ok('⑥ RP 充足时卡片可购（无灰态）');
    else if (r.found) bad('⑥ RP 充足但卡片灰态');
    if (r.found && r.after.assistants === r.before.assistants + 1 && r.after.lv === r.before.lv + 1 && r.after.rp < r.before.rp)
      ok('⑦ 点击购买：助手 +1、等级 +1、扣 RP', `Lv.${r.before.lv} → Lv.${r.after.lv}（助手 ${r.before.assistants} → ${r.after.assistants}）`);
    else if (r.found) bad('⑦ 购买未生效', JSON.stringify(r.after));
    if (r.found && r.dirtyAi === true) ok('⑧ 购买后 AI 面板即时置脏');
    else if (r.found) bad('⑧ 未置 dirty.ai', String(r.dirtyAi));

    // 再买一级：继续 +1（RP 充足）
    const r2 = await page.evaluate(() => {
      const card = document.querySelector('[data-research="rp_ai_unit"]');
      const before = { assistants: window.S.ai?.assistants || 0, rp: window.S.rp };
      card?.click();
      return { before, after: { assistants: window.S.ai?.assistants || 0, rp: window.S.rp } };
    });
    if (r2.after.assistants === r2.before.assistants + 1 && r2.after.rp < r2.before.rp)
      ok('⑨ 再购一级继续 +1 助手（成本随等级递增）', `助手 → ${r2.after.assistants}`);
    else bad('⑨ 二级购买未生效', JSON.stringify(r2.after));
  }

  console.log('\n[3] RP 不足：扩编卡灰态，点击不扣 RP / 不加助手');
  {
    const r = await page.evaluate(() => {
      const lv = window.S.rpTheories?.rp_ai_unit || 0;
      const cost = Math.ceil(200 * Math.pow(1.15, lv));
      window.S.rp = Math.max(0, cost - 1); // 主循环钳回上限；先低于成本
      window.__gameDirty.rp = true; window.__qa?.sim?.render?.();
      return { lv, cost, rp: window.S.rp };
    });
    await sleep(400);
    const s = await page.evaluate(() => {
      const card = document.querySelector('[data-research="rp_ai_unit"]');
      const before = { assistants: window.S.ai?.assistants || 0, rp: window.S.rp };
      card?.click();
      return { cant: card?.classList.contains('cant'), before,
        after: { assistants: window.S.ai?.assistants || 0, rp: window.S.rp } };
    });
    if (s.cant) ok('⑩ RP 不足时扩编卡灰态（.cant）');
    else bad('⑩ RP 不足但卡片未灰态');
    if (s.after.assistants === s.before.assistants && s.after.rp === s.before.rp)
      ok('⑪ 灰态点击不扣 RP、不加助手', `rp=${s.after.rp}`);
    else bad('⑪ 灰态点击仍生效', JSON.stringify(s.after));
  }

  console.log('\n[4] 未解锁 ai_core：扩编卡不渲染（解锁留在升级商店）');
  {
    await page.close();
    const page2 = await boot(browser, mkSave({ tech: { deep_space: true, prestige2: true } }));
    const s = await page2.evaluate(() => ({
      card: !!document.querySelector('[data-research="rp_ai_unit"]'),
      aiVisible: document.getElementById('ai-card')?.style.display !== 'none',
    }));
    if (!s.card) ok('⑫ 未解锁 ai_core 时扩编卡不渲染');
    else bad('⑫ 未解锁 ai_core 仍渲染扩编卡');
    await page2.close();
  }

  console.log('\n[5] 命中目标与无异常');
  {
    const page3 = await boot(browser, mkSave());
    const sizes = await page3.evaluate(() =>
      [...document.querySelectorAll('#ai-card button')].map(b => {
        const r = b.getBoundingClientRect();
        return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      }));
    if (sizes.length > 0 && sizes.every(s => s.w >= 24 && s.h >= 24))
      ok('⑬ AI 卡内全部按钮命中目标 ≥24×24', `${sizes.length} 个`);
    else bad('⑬ 存在过小按钮', JSON.stringify(sizes.filter(s => s.w < 24 || s.h < 24)));
    await page3.close();
  }

  if (errs.length === 0) ok('⑭ 全程无 pageerror / console error');
  else bad('⑭ 捕获运行时异常', errs.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n=== v3.12.12 AI 助手扩编协议（研究点）：${pass} passed / ${fail} failed ===`);
if (fail) process.exitCode = 1;
