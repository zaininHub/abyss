// v3.0.0 可玩性 / 数值测试：驱动 3 次转生循环（时间加速），
// 聚焦「数值与可玩性」断言（而非功能点存在性）：存储上限 / 产出 / 晋升·轮回增益 / 回响上限 /
// 成本单调递增 / 跨周期增长 / 早期节奏不卡死（产出不足禁购不会永久软锁）。
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const GAME_URL = 'http://127.0.0.1:5173/';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const tele = { cycles: [], pacing: null };
const ok = (n, d = '') => { results.push({ n, ok: true, d }); console.log(`  ✓ ${n}${d ? '  [' + d + ']' : ''}`); };
const bad = (n, d = '') => { results.push({ n, ok: false, d }); console.log(`  ✗ ${n}${d ? '  [' + d + ']' : ''}`); };
const note = (s) => console.log(`\n=== ${s} ===`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=1366,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const dirtyAll = () => page.evaluate(() => { for (const k in window.__gameDirty) window.__gameDirty[k] = true; });
const inject = (p) => page.evaluate((pp) => { Object.assign(S, pp); for (const k in window.__gameDirty) window.__gameDirty[k] = true; }, p);
const clickTab = async (id) => { await ev((i) => document.getElementById(i)?.click(), id); await sleep(200); await dirtyAll(); await sleep(150); };

try {
  await page.goto(GAME_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await ev(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);
  await ev(() => { window.__gameDirty.top = true; });
  await sleep(400);

  const ECHO_CAP = 100; // BALANCE.reincarn.echoCap
  let prevAfterPrestige = 0, prevEchoTotal = 0;

  const CYCLES = Number(process.env.CYCLES || 3);
  for (let cyc = 1; cyc <= CYCLES; cyc++) {
    note(`第 ${cyc} 次循环 · 数值基线`);
    await inject({
      ep: 1e16, allTimeEp: 1e16, runEarned: 1e12, rp: 1e7, es: 6, faith: 1e6, dm: 1e6, riftEmber: 800, pt: 1e5,
      prestige: cyc - 1, collapsed: false,
      chapter: 9, storyline: 'line_order', expeditionsDone: 1, expeditions: [], relicLegacy: {}, buildings: {}, eternal: {},
      upgrades: { storage: 90, scribble: 5, rp_vault: 5, star_hall: 3, distiller: 5, faith_t1: 3, petland: 1, atrium: 1, shrine: 1, scooter: 1 },
      religion: { unlocked: true, branch: 'sun', seal: 2, temple: 1 }, tech: { ai_core: true },
      achievements: { v_first: 1 }, resDiscovered: { ep: true, es: true, faith: true, rp: true, dm: true, pt: true },
    });
    await ev(() => { S.faith = 1e6; S.delve = { depth: 5, active: false, unlocked: true }; S.bazaar = { unlocked: true, trades: 12, rates: {}, stock: {}, refreshCount: 0, shuffleTimer: 0, regenTimer: 0 }; S.rpTheories = { wish_well: 1 }; S.riftEmber = 800; S.riftsSealed = 6; });
    await dirtyAll(); await sleep(300);

    const base = await ev(() => ({
      cap: window.__qa.epStorageCap(), cps: window.__qa.computeCps(), drain: window.__qa.totalDrainPerSec(),
      pg: window.__qa.prestigeGain(), ep: S.ep, prestige: S.prestige, abyssEcho: S.abyssEcho || 0,
    }));
    console.log(`    基线: cap=${fmtShort(base.cap)} cps=${base.cps.toFixed(2)} drain=${base.drain.toFixed(2)} 晋升增益=${fmtShort(base.pg)} 回响累计=${base.abyssEcho}`);
    if (base.cap > 0 && isFinite(base.cap)) ok(`循环${cyc} 存储上限为正且有限`, fmtShort(base.cap)); else bad(`循环${cyc} 存储上限`, JSON.stringify(base.cap));
    if (base.cps > 0 && isFinite(base.cps)) ok(`循环${cyc} 当前产出 cps > 0`, base.cps.toFixed(2) + '/s'); else bad(`循环${cyc} 当前产出`, JSON.stringify(base.cps));
    if (base.drain >= 0 && isFinite(base.drain)) ok(`循环${cyc} 总消耗 finite ≥ 0`); else bad(`循环${cyc} 总消耗`, JSON.stringify(base.drain));
    if (base.pg > 0) ok(`循环${cyc} 晋升增益 > 0`, fmtShort(base.pg)); else bad(`循环${cyc} 晋升增益`, JSON.stringify(base.pg));

    // 时间加速后 EP 不突破存储上限
    note(`第 ${cyc} 次循环 · 时间加速（1h）`);
    await ev(() => window.__advance(3600));
    await sleep(200);
    const afterAdv = await ev(() => ({ ep: S.ep, cap: window.__qa.epStorageCap() }));
    if (afterAdv.ep <= afterAdv.cap * 1.0001) ok(`循环${cyc} 加速后 EP 受存储上限约束`, `${fmtShort(afterAdv.ep)}/${fmtShort(afterAdv.cap)}`); else bad(`循环${cyc} EP 突破上限`, JSON.stringify(afterAdv));

    // 成本单调递增：独立隔离 temple / 载具两类 EP 消耗，避免「产出不足禁购」正确拦截干扰成本断言
    note(`第 ${cyc} 次循环 · 成本曲线`);
    await clickTab('btn-shop');
    await ev(() => { if (S.religion) S.religion.temple = 0; S.upgrades.scooter = 0; S.ep = 1e15; S.collapsed = false; S.paused = false; S.lazySince = null; S.wageState = { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 }; }); await dirtyAll();
    await sleep(150);
    const deltas = await ev(() => {
      const diag = { cps: window.__qa.computeCps(), drain: window.__qa.totalDrainPerSec(), net: window.__qa.computeCps() - window.__qa.totalDrainPerSec(), wage: S.wageState, collapsed: S.collapsed, paused: S.paused, lazySince: S.lazySince, temple: S.religion?.temple, ep: S.ep, totalBuys: S.totalBuys };
      const out = [];
      for (let i = 0; i < 3; i++) {
        const e0 = S.ep, n0 = S.upgrades.scribble || 0;
        const b = document.querySelector('#shop-list [data-buy="scribble"]');
        if (!b || b.classList.contains('disabled')) return { stop: true, out, diag, reason: '按钮缺失或禁用' };
        b.click();
        const n1 = S.upgrades.scribble || 0;
        out.push({ cost: e0 - S.ep, bought: n1 - n0 });
      }
      return { stop: false, out, diag };
    });
    const allBought = !deltas.stop && deltas.out.length === 3 && deltas.out.every(d => d.bought === 1 && d.cost > 0);
    const increasing = allBought && deltas.out[0].cost < deltas.out[1].cost && deltas.out[1].cost < deltas.out[2].cost;
    if (increasing) ok(`循环${cyc} 升级成本单调递增`, deltas.out.map(d => fmtShort(d.cost)).join(' < '));
    else bad(`循环${cyc} 成本曲线`, JSON.stringify(deltas));

    // 晋升
    note(`第 ${cyc} 次循环 · 晋升增益`);
    await ev(() => { S.runEarned = 1e12; S.ep = 1e12; window.__gameDirty.prestige = true; });
    await sleep(200);
    await clickTab('btn-prestige');
    const canP = await ev(() => window.__qa.canPrestige());
    let p1 = await ev(() => S.prestige);
    if (!canP) bad(`循环${cyc} 晋升未就绪`);
    else {
      const p0 = p1;
      await ev(() => document.getElementById('prestige-btn')?.click()); await sleep(400);
      await ev(() => document.querySelector('#talent-modal .talent-option')?.click()); await sleep(500);
      p1 = await ev(() => S.prestige);
      if (p1 > p0) ok(`循环${cyc} 晋升职级 +1（${p0}→${p1}）`); else bad(`循环${cyc} 晋升`, `prestige ${p0}→${p1}`);
      prevAfterPrestige = p1;
    }

    // 轮回（先确认就绪，再测回响增益上限与跨周期保留）
    note(`第 ${cyc} 次循环 · 轮回增益与跨周期`);
    await ev(() => { S.runEarned = 1e10; S.prestige = Math.max(1, S.prestige); S.ep = 1e9; window.__gameDirty.prestige = true; });
    await sleep(300);
    await clickTab('btn-prestige');
    const reReady = await ev(() => window.__qa.reincarnReady());
    if (!reReady.ok) bad(`循环${cyc} 轮回未就绪`, reReady.reason || '');
    else {
      const eg = reReady.echo;
      if (eg > 0 && eg <= ECHO_CAP) ok(`循环${cyc} 回响增益 ∈ (0, ${ECHO_CAP}]`, '+' + fmtShort(eg)); else bad(`循环${cyc} 回响增益`, JSON.stringify(eg));
      const echo0 = await ev(() => S.abyssEcho || 0);
      const rp0 = await ev(() => S.rp), es0 = await ev(() => S.es), delve0 = await ev(() => S.delve?.depth || 0), bz0 = await ev(() => S.bazaar?.trades || 0), ach0 = await ev(() => Object.keys(S.achievements || {}).length);
      await ev(() => document.getElementById('reincarn-btn')?.click()); await sleep(400);
      await ev(() => document.getElementById('confirm-ok')?.click()); await sleep(600);
      const echo1 = await ev(() => S.abyssEcho || 0);
      const gain = echo1 - echo0;
      if (gain > 0) ok(`循环${cyc} 轮回获得回响 +${fmtShort(gain)}（累计 ${fmtShort(echo1)}）`); else bad(`循环${cyc} 轮回回响`, `gain=${gain}`);
      const rpK = await ev(() => S.rp), esK = await ev(() => S.es), delveK = await ev(() => S.delve?.depth || 0), bzK = await ev(() => S.bazaar?.trades || 0), achK = await ev(() => Object.keys(S.achievements || {}).length), upK = await ev(() => Object.keys(S.upgrades).length);
      const keep = [['RP 保留', rpK >= rp0 - 1], ['ES 保留', esK === es0], ['深潜保留', delveK >= delve0], ['集市笔数保留', bzK >= bz0], ['成就保留', achK >= ach0], ['升级本局清空', upK === 0]];
      for (const [n, c] of keep) { if (c) ok(`循环${cyc} 跨周期·${n}`); else bad(`循环${cyc} 跨周期·${n}`, ''); }
      if (echo1 > prevEchoTotal) ok(`循环${cyc} 回响累计递增（${fmtShort(prevEchoTotal)}→${fmtShort(echo1)}）`); else bad(`循环${cyc} 回响累计`, `${prevEchoTotal}->${echo1}`);
      prevEchoTotal = echo1;
      tele.cycles.push({ cycle: cyc, cap: base.cap, cps: base.cps, prestigeGain: base.pg, echoGain: eg, echoTotal: echo1, prestige: p1, rp: rpK, es: esK, delveDepth: delveK, bazaarTrades: bzK });
    }
    await ev(() => { S.ep = 1e16; S.allTimeEp = 1e16; S.upgrades = {}; S.tech = { ai_core: true }; for (const k in window.__gameDirty) window.__gameDirty[k] = true; });
    await dirtyAll(); await sleep(200);
  }

  // 跨周期成长：职级 / 回响累计逐轮递增
  if (tele.cycles.length === 3) {
    const ps = tele.cycles.map(c => c.prestige);
    if (ps[0] < ps[1] && ps[1] < ps[2]) ok('跨周期：职级逐轮递增', ps.join(' < ')); else bad('跨周期职级', JSON.stringify(ps));
    const es = tele.cycles.map(c => c.echoTotal);
    if (es[0] < es[1] && es[1] < es[2]) ok('跨周期：回响累计逐轮递增', es.map(fmtShort).join(' < ')); else bad('跨周期回响', JSON.stringify(es));
  }

  // 可玩性 · 早期节奏探针：清空存档并重新加载，再仅注入首购 scribble:1，避免高周目状态污染
  note('可玩性 · 早期节奏探针（近全新局）');
  await ev(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(500);
  await inject({ ep: 0, allTimeEp: 0, runEarned: 0, prestige: 0, reincarned: 0, abyssEcho: 0, chapter: 1, storyline: 'default', upgrades: { scribble: 1 }, religion: {}, delve: { depth: 0 }, bazaar: { unlocked: false, trades: 0 }, resDiscovered: { ep: true }, wageState: { state: 'ok' }, totalBuys: 0 });
  await ev(() => { if (S.religion) S.religion.temple = 0; }); await dirtyAll();
  await sleep(150);
  const freshCps = await ev(() => window.__qa.computeCps());
  await ev(() => window.__advance(1800)); // 加速 30 分钟
  await sleep(150);
  await clickTab('btn-shop');
  const fresh = await ev(() => ({
    ep: S.ep, cps: window.__qa.computeCps(),
    // 下一档 scribble 成本（owned=1）：用一次试探购买回滚
    canBuy: (() => { const b = document.querySelector('#shop-list [data-buy="scribble"]'); return b ? !b.classList.contains('disabled') : false; })(),
    epCostNext: (() => { const b = document.querySelector('#shop-list [data-buy="scribble"]'); return b ? b.dataset.cost : null; })(),
  }));
  console.log(`    早期: cps=${fresh.cps.toFixed(4)} 30min后EP=${fmtShort(fresh.ep)} 可购下一档=${fresh.canBuy}`);
  if (fresh.cps > 0) ok('早期：首购后即有正产出（非死局）', fresh.cps.toFixed(4) + '/s'); else bad('早期产出', JSON.stringify(fresh.cps));
  if (fresh.ep > 0) ok('早期：30 分钟加速后积累到正 EP', fmtShort(fresh.ep)); else bad('早期积累', JSON.stringify(fresh.ep));
  if (fresh.canBuy) ok('早期：产出不足禁购不造成永久软锁（可继续购买）'); else bad('早期软锁', '下一档升级不可购');
  tele.pacing = { freshCps, epAfter30m: fresh.ep, canBuyNext: fresh.canBuy };

  if (errors.length === 0) ok('无 JS 运行时错误 / console.error'); else bad('无 JS 运行时错误', `${errors.length} 条：${errors.slice(0, 4).join(' | ')}`);
} catch (e) {
  bad('测试执行异常', String(e && e.message || e));
} finally {
  await browser.close();
}

function fmtShort(n) {
  if (!isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return String(Math.round(n));
}
const pass = results.filter(r => r.ok).length;
console.log(`\n===== v3.0.0 可玩性/数值测试：${pass}/${results.length} 通过，发现 ${results.filter(r => !r.ok).length} 项问题 =====`);
import fs from 'fs';
fs.writeFileSync(new URL('./numbers-result.json', import.meta.url), JSON.stringify({ summary: { total: results.length, pass, fail: results.length - pass }, results, telemetry: tele }, null, 2));
