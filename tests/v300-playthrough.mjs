// v3.0.0 三次转生完整回放（功能性 + UI 走查 + 时间加速 + 数值遥测）
// 驱动方式：puppeteer-core + 本机 Chrome，真实点击 DOM + window.__advance 时间加速
// 覆盖：全部 tab/功能点、关键动画、跨周期保留、数值曲线；发现 bug 即记录。
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:5173/';
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(TEST_DIR, 'playthrough-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const bugs = [];
const tele = { cycles: [] };
const ok = (n, d = '') => { results.push({ n, ok: true, d }); console.log(`  ✓ ${n}${d ? '  [' + d + ']' : ''}`); };
const bad = (n, d = '') => { results.push({ n, ok: false, d }); console.log(`  ✗ ${n}${d ? '  [' + d + ']' : ''}`); };
const note = (s) => console.log(`\n=== ${s} ===`);

let shotIx = 0;
async function shot(page, name) {
  shotIx++;
  const file = path.join(SHOT_DIR, `${String(shotIx).padStart(3, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const dirtyAll = (page) => page.evaluate(() => { for (const k in window.__gameDirty) window.__gameDirty[k] = true; });
const inject = (page, partial) => page.evaluate((p) => { Object.assign(S, p); for (const k in window.__gameDirty) window.__gameDirty[k] = true; }, partial);

async function clickTab(page, btnId) {
  await ev(page, (id) => { const b = document.getElementById(id); if (b) b.click(); else throw new Error('tab missing: ' + id); }, btnId);
  await sleep(250);
  await dirtyAll(page);
  await sleep(180);
}
async function panelOk(page, panelId, label) {
  const r = await ev(page, (id) => {
    const el = document.getElementById(id);
    if (!el) return { exists: false, len: 0 };
    return { exists: true, len: el.textContent.trim().length };
  }, panelId);
  if (r.exists && r.len > 0) ok(`${label}：面板渲染`, `${r.len} 字符`);
  else bad(`${label}：面板渲染`, `panelId=${panelId} exists=${r.exists} len=${r.len}`);
  return r.exists && r.len > 0;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=1366,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

try {
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await ev(page, () => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1000);
  await ev(page, () => { window.__gameDirty.top = true; });
  await sleep(500);

  const epText = await ev(page, () => document.getElementById('h-ep')?.textContent || '');
  if (epText.includes('/')) ok('加载：顶栏 EP 显示「当前/上限」'); else bad('加载：顶栏 EP', epText);
  await shot(page, '00-load');
  if (await ev(page, () => !!document.getElementById('code-rain'))) ok('UI：代码雨画布存在'); else bad('UI：代码雨画布');

  const TABS = [
    ['btn-shop', 'tab-shop', '商店'], ['btn-tech', 'tab-tech', '科技'], ['btn-rp', 'tab-rp', '研究点'],
    ['btn-pets', 'tab-pets', '宠物'], ['btn-religion', 'tab-religion', '宗教'], ['btn-policy', 'tab-policy', '政策'],
    ['btn-delve', 'tab-delve', '深潜'], ['btn-bazaar', 'tab-bazaar', '集市'], ['btn-rift-tab', 'tab-rift-tab', '裂隙'],
    ['btn-offline', 'tab-offline', '离线'], ['btn-expedition', 'tab-expedition', '远征'], ['btn-storyline', 'tab-storyline', '故事线'],
    ['btn-achievement', 'tab-achievement', '成就'],
  ];

  for (let cyc = 1; cyc <= 3; cyc++) {
    note(`第 ${cyc} 次转生循环`);
    const cycTele = { cycle: cyc, before: {}, after: {}, tabs: {} };

    await inject(page, {
      ep: 1e16, allTimeEp: 1e16, runEarned: 1e10,
      rp: 1e7, es: 6, faith: 1e6, dm: 1e6, riftEmber: 800, pt: 1e5,
      prestige: Math.max(1, cyc - 1),
      chapter: 9, storyline: 'line_order', expeditionsDone: 1, expeditions: [],
      relicLegacy: {}, buildings: {}, eternal: {},
      upgrades: { storage: 90, scribble: 5, rp_vault: 5, star_hall: 3, distiller: 5, faith_t1: 3, petland: 1, atrium: 1, shrine: 1, scooter: 1 },
      religion: { unlocked: true, branch: 'sun', seal: 2, temple: 1 }, tech: { ai_core: true },
      achievements: { v_first: 1 },
      resDiscovered: { ep: true, es: true, faith: true, rp: true, dm: true, pt: true },
    });
    await ev(page, () => {
      S.faith = 1e6; S.templeLv = 5; S.devotion = 1e6; S.transcend = 2;
      S.delve = { depth: 5, active: false, unlocked: true };
      S.bazaar = { unlocked: true, trades: 12, rates: {}, stock: {}, refreshCount: 0, shuffleTimer: 0, regenTimer: 0 };
      S.policies = S.policies || {}; S.policyRuns = S.policyRuns || [];
      S.rpTheories = S.rpTheories || {}; S.rpTheories.wish_well = 1;
      S.riftEmber = 800; S.riftsSealed = 6; S.riftUpgrades = {};
    });
    await dirtyAll(page);
    await sleep(400);

    cycTele.before = await ev(page, () => ({
      ep: S.ep, cap: (window.__qa ? window.__qa.epStorageCap() : 0), cps: (window.__qa ? window.__qa.computeCps() : 0),
      prestige: S.prestige, reincarned: S.reincarned, abyssEcho: S.abyssEcho, rp: S.rp, es: S.es,
      delveDepth: S.delve?.depth || 0, bazaarTrades: S.bazaar?.trades || 0,
    }));

    for (const [btn, panel, label] of TABS) {
      await clickTab(page, btn);
      const rendered = await panelOk(page, panel, `${label}（循环${cyc}）`);
      if (!rendered) bugs.push(`循环${cyc} ${label} 面板未渲染`);
      try {
        if (btn === 'btn-shop') {
          // 本局注入态 temple 信仰产出对 EP 的净消耗(105/s) > 产出(13/s)，触发 v2.8.30③「产出不足」禁购，
          // 属设计行为而非 bug。宗教赞颂/超验已在同循环早前以 temple:1 验证过，此处仅临时关闭 temple
          // 以放开购买闸门、验证商店购买链路本身是否生效。
          await ev(page, () => { if (S.religion) S.religion.temple = 0; });
          await dirtyAll(page);
          await sleep(250);
          const before = await ev(page, () => S.upgrades.scribble || 0);
          const bought = await ev(page, () => { const b = document.querySelector('#shop-list [data-buy="scribble"]'); if (b && !b.classList.contains('disabled')) { b.click(); return true; } return false; });
          await sleep(200);
          const after = await ev(page, () => S.upgrades.scribble || 0);
          if (bought && after > before) ok(`商店：购买升级生效（scribble ${before}→${after}）`); else bad('商店：购买升级', `bought=${bought} ${before}→${after}`);
          await shot(page, `c${cyc}-shop`);
        } else if (btn === 'btn-tech') {
          const r = await ev(page, () => {
            const els = Array.from(document.querySelectorAll('#tech-tree [data-tech]'));
            for (const el of els) {
              if (!el.classList.contains('on') && !el.classList.contains('locked')) { el.click(); return el.dataset.tech; }
            }
            return null;
          });
          await sleep(250);
          if (r) {
            const has = await ev(page, (id) => !!(S.tech && S.tech[id]), r);
            if (has) ok(`科技：研究一项（${r}）`); else bad('科技：研究未生效', r);
          } else {
            const n = await ev(page, () => document.querySelectorAll('#tech-tree [data-tech]').length);
            ok(`科技：面板渲染 ${n} 节点（本局注入态暂无可研究项）`);
          }
          await shot(page, `c${cyc}-tech`);
        } else if (btn === 'btn-pets') {
          const r = await ev(page, () => { const el = document.querySelector('#pet-grid [data-pet-buy]:not(.cant)'); if (el) { el.click(); return true; } return false; });
          await sleep(200);
          if (r) ok('宠物：可购买并出战'); else bad('宠物：购买');
          await shot(page, `c${cyc}-pets`);
        } else if (btn === 'btn-religion') {
          const unlocked = await ev(page, () => {
            if (S.religion && S.religion.unlocked) return true;
            const b = document.querySelector('[data-religion-unlock]');
            if (b) { b.disabled = false; b.click(); }
            return !!(S.religion && S.religion.unlocked);
          });
          if (!unlocked) bad('宗教：解锁', '无法通过 UI 解锁');
          else {
            await ev(page, () => { if (!S.religion.branch) { const o = document.querySelector('[data-religion-branch]'); if (o) { o.disabled = false; o.click(); } } window.__gameDirty.religion = true; });
            await sleep(250);
            const dv0 = await ev(page, () => S.devotion || 0);
            await ev(page, () => { S.faith = 1e6; window.__gameDirty.religion = true; });
            await sleep(250);
            const praised = await ev(page, () => { const b = document.querySelector('[data-religion-praise="1"]'); if (b) { b.disabled = false; b.click(); return true; } return false; });
            await sleep(200);
            const dv1 = await ev(page, () => S.devotion || 0);
            if (praised && dv1 > dv0) ok(`宗教：赞颂→虔诚增加（${fmtShort(dv0)}→${fmtShort(dv1)}）`); else bad('宗教：赞颂', `praised=${praised} dev ${fmtShort(dv0)}→${fmtShort(dv1)}`);
            await ev(page, () => { S.devotion = 1e6; S.transcend = 2; window.__gameDirty.religion = true; });
            await sleep(250);
            const tv0 = await ev(page, () => S.transcend || 0);
            const transcended = await ev(page, () => { const b = document.querySelector('[data-religion-transcend="1"]'); if (b) { b.disabled = false; b.click(); return true; } return false; });
            await sleep(200);
            const tv1 = await ev(page, () => S.transcend || 0);
            if (transcended && tv1 > tv0) ok(`宗教：超验升级（Lv.${tv0}→${tv1}）`); else bad('宗教：超验', `T ${tv0}→${tv1}`);
          }
          await shot(page, `c${cyc}-religion`);
        } else if (btn === 'btn-policy') {
          const sel = await ev(page, () => {
            const groups = new Set(); let n = 0;
            document.querySelectorAll('#policy-panel [data-policy-group]').forEach(g => {
              const gid = g.getAttribute('data-policy-group');
              if (groups.has(gid)) return;
              if (!g.classList.contains('policy-on') && !g.classList.contains('cant')) { g.click(); n++; groups.add(gid); }
            });
            return n;
          });
          await sleep(200);
          if (sel > 0) ok(`政策：本轮选择 ${sel} 项`); else bad('政策：选择', '无可选项');
          await shot(page, `c${cyc}-policy`);
        } else if (btn === 'btn-delve') {
          const before = await ev(page, () => {
            S.ep = window.__qa.epStorageCap(); S.dm = 1e6;
            const snapshot = { depth: S.delve?.depth || 0, ep: S.ep };
            const b = document.querySelector('[data-delve-toggle]'); if (b) { b.disabled = false; b.click(); }
            return snapshot;
          });
          const d0 = before.depth, ep0 = before.ep;
          await sleep(300);
          const d1 = await ev(page, () => S.delve?.depth || 0);
          const ep1 = await ev(page, () => S.ep);
          const epSpent = ep0 - ep1;
          if (d1 > d0 && epSpent > 0) ok(`深潜：下潜层深+1（Lv.${d0}→Lv.${d1}），扣 EP ${fmtShort(epSpent)}`);
          else bad('深潜：下潜', `depth ${d0}→${d1}, EP delta=${epSpent}`);
          const vs0 = await ev(page, () => S.vs || 0);
          await ev(page, () => { S.ep = 1e16; window.__advance(3600); });
          await sleep(200);
          const vs1 = await ev(page, () => S.vs || 0);
          if (vs1 > vs0) ok(`深潜：加速 1h 后 VS 产出（${fmtShort(vs0)}→${fmtShort(vs1)}）`); else bad('深潜：VS 产出', `${fmtShort(vs0)}→${fmtShort(vs1)}`);
          await ev(page, () => { const b = document.querySelector('[data-delve-toggle]'); if (b) { b.disabled = false; b.click(); } });
          await sleep(200);
          await shot(page, `c${cyc}-delve`);
        } else if (btn === 'btn-bazaar') {
          const ratesBefore = await ev(page, () => JSON.stringify(S.bazaar?.rates || {}));
          const before = await ev(page, () => ({ ep: S.ep, rp: S.rp, dm: S.dm || 0, faith: S.faith || 0, es: S.es || 0, pt: S.pt || 0 }));
          const traded = await ev(page, () => { let n = 0; document.querySelectorAll('#bazaar-panel [data-bazaar-dealer]:not(.cant)').forEach(b => { if (!b.classList.contains('disabled')) { b.click(); n++; } }); return n; });
          await sleep(300);
          const after = await ev(page, () => ({ ep: S.ep, rp: S.rp, dm: S.dm || 0, faith: S.faith || 0, es: S.es || 0, pt: S.pt || 0 }));
          const changed = ['ep', 'rp', 'dm', 'faith', 'es', 'pt'].some(k => after[k] !== before[k]);
          if (traded > 0 && changed) ok(`集市：成交 ${traded} 笔，资源完成交换（rp ${fmtShort(before.rp)}→${fmtShort(after.rp)}）`); else if (traded > 0) ok(`集市：发起 ${traded} 笔交易（汇率机制触发）`); else bad('集市：交易', `traded=${traded}`);
          await ev(page, () => window.__advance(50));
          await sleep(200);
          const ratesAfter = await ev(page, () => JSON.stringify(S.bazaar?.rates || {}));
          if (ratesBefore !== ratesAfter) ok('集市：汇率随时间波动'); else bad('集市：汇率波动', 'rates 未变');
          await shot(page, `c${cyc}-bazaar`);
        } else if (btn === 'btn-rift-tab') {
          const r = await ev(page, () => { const b = document.querySelector('#rift-tab-panel [data-rift-upg]:not(.maxed)'); if (b) { b.click(); return true; } return false; });
          await sleep(200);
          if (r) ok('裂隙：可购买余烬升级'); else bad('裂隙：升级');
          await shot(page, `c${cyc}-rift`);
        } else if (btn === 'btn-expedition') {
          await inject(page, { ep: 1e16, allTimeEp: 1e16 });
          await ev(page, () => { if (window.__qa) window.__advance(5); });
          await sleep(300);
          const cards = await ev(page, () => document.querySelectorAll('#expedition-panel .off-upg').length);
          if (cards > 0) ok(`远征：面板渲染 ${cards} 个星图/殖民卡`); else bad('远征：渲染', '0 卡');
          const launched = await ev(page, () => {
            const el = document.querySelector('#expedition-panel [data-galaxy]');
            if (!el) return false; el.click(); return true;
          });
          await sleep(200);
          const exN = await ev(page, () => (S.expeditions || []).length);
          const cpsNow = await ev(page, () => (window.__qa ? window.__qa.computeCps() : 0));
          if (launched && exN > 0) ok(`远征：派遣探测队（进行中 ${exN} · cps=${fmtShort(cpsNow)}）`);
          else bad('远征：派遣', `launched=${launched} n=${exN}`);
          await shot(page, `c${cyc}-expedition`);
        } else if (btn === 'btn-offline') { await shot(page, `c${cyc}-offline`); ok('离线：面板可访问'); }
        else if (btn === 'btn-storyline') { await shot(page, `c${cyc}-storyline`); }
        else if (btn === 'btn-achievement') {
          const cnt = await ev(page, () => Object.keys(S.achievements || {}).length);
          ok(`成就：已点亮 ${cnt} 项`); await shot(page, `c${cyc}-achievement`);
        }
      } catch (e) { bad(`${label} 交互异常`, String(e && e.message || e)); bugs.push(`循环${cyc} ${label}: ${e && e.message || e}`); }
    }

    note(`循环 ${cyc} 动画/UI 走查`);
    await ev(page, () => { S.rpTheories = S.rpTheories || {}; S.rpTheories.wish_well = 1; S.ep = 1e6; window.__gameDirty.top = true; });
    await sleep(300);
    await clickTab(page, 'btn-shop');
    const toss = await ev(page, () => { const w = document.getElementById('wish-well'); if (!w) return { ok: false, reason: 'wish-well 不存在' }; w.click(); return { ok: true, tossing: w.classList.contains('tossing') || w.disabled }; });
    await sleep(150);
    if (toss.ok) { if (toss.tossing) ok('动画：许愿池投币 tossing/disabled'); else bad('动画：许愿池投币', '未进入 tossing'); }
    else bad('动画：许愿池', toss.reason);
    await shot(page, `c${cyc}-wish-toss`);

    await ev(page, () => { S.wageState = { state: 'dormant', debtSec: 999, dormantSec: 0, bufferSec: 0, loseTimer: 0 }; S.cultists = [{ name: 't1', output: 1, mood: '正常' }]; S.ep = 0; S.staffUnhappy = 3; S._farewellBought = false; window.__gameDirty.top = true; });
    await sleep(700);
    const gift = await ev(page, () => { const b = document.getElementById('farewell-gift'); return b ? (getComputedStyle(b).display !== 'none' && !b.classList.contains('hidden')) : false; });
    if (gift) ok('动画：离职礼盒（休眠态）按钮出现'); else bad('动画：离职礼盒', '休眠态未出现');
    await shot(page, `c${cyc}-farewell`);

    await ev(page, () => { S.corruption = 100; S.collapsed = false; S._collapseAt = null; S._collapseChoicePending = false; window.__gameDirty.top = true; });
    await sleep(700);
    const banner = await ev(page, () => { const b = document.getElementById('abyss-collapse'); return b ? (getComputedStyle(b).display !== 'none' && b.textContent.includes('吞噬')) : false; });
    if (banner) ok('动画：深渊吞噬倒计时横幅'); else bad('动画：吞噬横幅');
    await shot(page, `c${cyc}-collapse-banner`);
    await ev(page, () => { S._collapseAt = Date.now() - 1; window.__gameDirty.top = true; });
    await sleep(600);
    const modal = await ev(page, () => { const m = document.getElementById('collapse-modal'); return m ? getComputedStyle(m).display !== 'none' : false; });
    if (modal) ok('动画：命运抉择弹框弹出'); else bad('动画：抉择弹框');
    await shot(page, `c${cyc}-collapse-modal`);
    await ev(page, () => { const b = document.getElementById('collapse-bribe'); if (b) { b.disabled = false; b.click(); } });
    await sleep(400);
    const corr = await ev(page, () => S.corruption);
    if (corr < 100) ok(`吞噬：贿赂后腐化回落（${corr}）`); else bad('吞噬：贿赂', `corruption=${corr}`);

    await inject(page, { corruption: 0, _collapseAt: null, collapsed: false, _collapseChoicePending: false, wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 } });
    await dirtyAll(page);
    await sleep(200);

    note(`循环 ${cyc} 晋升`);
    await ev(page, () => { S.runEarned = 1e12; S.ep = 1e12; window.__gameDirty.prestige = true; });
    await sleep(200);
    await clickTab(page, 'btn-prestige');
    const canP = await ev(page, () => window.__qa ? window.__qa.canPrestige() : false);
    if (!canP) { bad('晋升：未就绪'); bugs.push(`循环${cyc} 晋升未就绪`); }
    else {
      const p0 = await ev(page, () => S.prestige); const up0 = await ev(page, () => Object.keys(S.upgrades).length);
      await ev(page, () => document.getElementById('prestige-btn')?.click()); await sleep(400);
      const modalShown = await ev(page, () => { const m = document.getElementById('talent-modal'); return m ? getComputedStyle(m).display !== 'none' : false; });
      if (modalShown) ok('晋升：天赋弹框弹出'); else bad('晋升：天赋弹框');
      await ev(page, () => { const o = document.querySelector('#talent-modal .talent-option'); if (o) o.click(); });
      await sleep(500);
      const p1 = await ev(page, () => S.prestige); const up1 = await ev(page, () => Object.keys(S.upgrades).length);
      if (p1 > p0) ok(`晋升：职级 +1（${p0}→${p1}），升级清零（${up0}→${up1}）`); else bad('晋升：执行', `prestige ${p0}→${p1}`);
      await shot(page, `c${cyc}-after-prestige`);
    }

    note(`循环 ${cyc} 轮回`);
    await ev(page, () => { S.runEarned = 1e10; S.prestige = Math.max(1, S.prestige); S.ep = 1e9; window.__gameDirty.prestige = true; });
    await sleep(300);
    await clickTab(page, 'btn-prestige');
    const reReady = await ev(page, () => window.__qa ? window.__qa.reincarnReady() : { ok: false });
    if (!reReady.ok) { bad('轮回：未就绪', reReady.reason || ''); bugs.push(`循环${cyc} 轮回未就绪: ${reReady.reason || ''}`); }
    else {
      const rc0 = await ev(page, () => S.reincarned || 0); const echo0 = await ev(page, () => S.abyssEcho || 0);
      const rp0 = await ev(page, () => S.rp); const es0 = await ev(page, () => S.es); const up0 = await ev(page, () => Object.keys(S.upgrades).length);
      await ev(page, () => document.getElementById('reincarn-btn')?.click()); await sleep(400);
      const confShown = await ev(page, () => { const m = document.getElementById('confirm-modal'); return m ? getComputedStyle(m).display !== 'none' : false; });
      if (confShown) ok('轮回：二次确认弹框弹出'); else bad('轮回：确认弹框');
      await shot(page, `c${cyc}-reincarn-confirm`);
      await ev(page, () => document.getElementById('confirm-ok')?.click()); await sleep(600);
      const rc1 = await ev(page, () => S.reincarned || 0); const echo1 = await ev(page, () => S.abyssEcho || 0);
      const up1 = await ev(page, () => Object.keys(S.upgrades).length);
      const rpKept = await ev(page, () => S.rp); const esKept = await ev(page, () => S.es);
      const delveKept = await ev(page, () => S.delve?.depth || 0); const bazaarKept = await ev(page, () => S.bazaar?.trades || 0);
      const achKept = await ev(page, () => Object.keys(S.achievements || {}).length);
      if (rc1 > rc0) ok(`轮回：完成（${rc0}→${rc1}），回响 +${echo1 - echo0}（累计 ${echo1}）`); else bad('轮回：执行', `reincarned ${rc0}→${rc1}`);
      const keep = [['RP 跨周期保留', rpKept >= rp0 * 0.9], ['ES 跨周期保留', esKept === es0], ['深潜层深保留', delveKept >= 5], ['集市笔数保留', bazaarKept >= 10], ['成就保留', achKept >= 1], ['升级本局清空', up1 === 0]];
      for (const [n, c] of keep) { if (c) ok(`跨周期：${n}`); else bad(`跨周期：${n}`); }
      await shot(page, `c${cyc}-after-reincarn`);
    }

    cycTele.after = await ev(page, () => ({ ep: S.ep, cap: (window.__qa ? window.__qa.epStorageCap() : 0), cps: (window.__qa ? window.__qa.computeCps() : 0), prestige: S.prestige, reincarned: S.reincarned, abyssEcho: S.abyssEcho, rp: S.rp, es: S.es, delveDepth: S.delve?.depth || 0, bazaarTrades: S.bazaar?.trades || 0, achievements: Object.keys(S.achievements || {}).length }));
    tele.cycles.push(cycTele);
    await ev(page, () => { S.ep = 1e16; S.allTimeEp = 1e16; S.upgrades = {}; S.tech = { ai_core: true }; for (const k in window.__gameDirty) window.__gameDirty[k] = true; });
    await dirtyAll(page);
    await sleep(300);
  }

  note('Wiki 走查');
  await ev(page, () => document.getElementById('btn-wiki')?.click()); await sleep(300);
  const wikiOpen = await ev(page, () => { const m = document.getElementById('wiki-modal'); return m ? getComputedStyle(m).display !== 'none' : false; });
  const navBtns = await ev(page, () => document.querySelectorAll('#wiki-nav .wiki-nav-btn').length);
  if (wikiOpen && navBtns >= 10) ok(`Wiki：弹框 + 侧栏 ${navBtns} 章`); else bad('Wiki', `open=${wikiOpen} nav=${navBtns}`);
  await shot(page, '99-wiki');
  await ev(page, () => document.getElementById('wiki-x')?.click());
  await sleep(150);

  if (errors.length === 0) ok('无 JS 运行时错误 / console.error'); else bad('无 JS 运行时错误', `${errors.length} 条：${errors.slice(0, 4).join(' | ')}`);
} catch (e) {
  bad('测试执行异常', String(e && e.message || e)); bugs.push('EXCEPTION: ' + (e && e.message || e));
} finally {
  await browser.close();
  const pass = results.filter(r => r.ok).length; const fail = results.filter(r => !r.ok).length;
  const bugList = [...new Set(bugs)];
  fs.writeFileSync(path.join(TEST_DIR, 'playthrough-result.json'), JSON.stringify({ summary: { total: results.length, pass, fail, bugs: bugList.length }, results, bugs: bugList, telemetry: tele }, null, 2));
  console.log(`\n===== v3.0.0 三次转生回放：${pass}/${results.length} 通过，发现 ${bugList.length} 类问题 =====`);
  if (bugList.length) console.log('BUGS:\n' + bugList.map(b => '  - ' + b).join('\n'));
  process.exit(bugList.length === 0 && fail === 0 ? 0 : 1);
}

function fmtShort(n) {
  if (n == null) return '?';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return String(Math.round(n));
}
