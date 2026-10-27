// ===== v2.8.22 八项反馈浏览器实测 =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  ok ? pass++ : fail++;
};
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '1', storyline: 'default', ep: 3e6, rp: 1220, es: 0, dm: 1000,
  upgrades: { scribble: 50, storage: 500, compiler_temple: 1, purifier1: 1 }, buildings: { canteen: 1 },
  tech: { ai_core: true, auto_tech: true, entropy_reduce: true }, ai: {}, milesDone: {},
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: true, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 净化节点移入遗物面板（商店不再渲染，遗物面板 DM 购买显示）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ _riftSeen: true }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.click('#btn-relics');
    await new Promise(r => setTimeout(r, 5000)); // dirty.relics 每 ~4s 消费一次，等渲染
    const t1 = await page.evaluate(() => {
      const shop = document.querySelector('#shop') ? document.querySelector('#shop').textContent : '';
      const relics = document.querySelector('#relics-panel') ? document.querySelector('#relics-panel').textContent : '';
      return { shopHasPur: shop.includes('净化节点'), relicsHasPur: relics.includes('净化节点'), relicsHasDM: relics.includes('DM') };
    });
    rec('T1 净化节点移入遗物（商店无、遗物有且 DM 购买）', !t1.shopHasPur && t1.relicsHasPur && t1.relicsHasDM, JSON.stringify(t1));
    await page.close();
  }

  // T2 自动研究只买基础产出相关（仅 offline1，不买其他科技）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 99999, ai: { autoTech: true }, tech: { ai_core: true, auto_tech: true }, ep: 1e6, _riftSeen: true }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 14000)); // 等 ≥1 个 AI 决策周期
    const t2 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { techs: Object.keys(s.tech), autoTech: s.ai.autoTech };
    });
    const onlyBase = t2.techs.includes('offline1') && !t2.techs.some(x => ['focus_opt','entropy_reduce','deep_space','chaos_shield'].includes(x));
    rec('T2 自动研究只买基础产出相关科技（仅 offline1）', t2.autoTech && onlyBase, `techs=${JSON.stringify(t2.techs)}`);
    await page.close();
  }

  // T3 顶部悬浮单气泡 + 加成明细（无原生 title，data-tip 含来源与加成）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ prestigePoints: 2, runTalent: 'sharp' }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t3 = await page.evaluate(() => {
      const c = document.getElementById('h-cps');
      const st = c ? c.closest('.stat') : null;
      return { title: c ? c.title : '', tip: st && st.dataset.tip ? st.dataset.tip : '', hasBonus: st && st.dataset.tip ? st.dataset.tip.includes('加成') : false };
    });
    rec('T3 顶部悬浮单气泡（无 title 双弹窗）+ 加成明细', !t3.title && t3.tip.includes('产出来源') && t3.hasBonus, t3.tip);
    await page.close();
  }

  // T4 EP 触顶溢出转化 RP（效率与蒸馏一致，rp 增加）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1.4e6, rp: 0, corruption: 0, upgrades: { scribble: 20000, storage: 3, compiler_temple: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 9000)); // scribble 2 万 → ~6K EP/s 溢出 → 蒸馏池累积转 RP
    const t4 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { rp: s.rp, ep: s.ep, corr: s.corruption };
    });
    rec('T4 EP 触顶溢出转 RP（蒸馏效率口径）、腐化不增', t4.rp > 0 && t4.corr < 0.5, `rp=${t4.rp} corr=${t4.corr}`);
    await page.close();
  }

  // T5 崩溃机制重做：腐化满额即 60s 倒计时（不再要求 EP 触顶）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ corruption: 100, ep: 1000, upgrades: { scribble: 50, storage: 3, compiler_temple: 1 } })); // 无净化节点 → 腐化保持满额
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6500)); // 等自动存档落盘 _collapseAt
    const t5 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { collapseAt: s._collapseAt || 0, collapsed: s.collapsed || false };
    });
    rec('T5 腐化满额即启动 60s 崩溃倒计时（无需 EP 触顶）', t5.collapseAt > Date.now() && t5.collapseAt - Date.now() <= 62000, `collapseAt=${t5.collapseAt}`);
    await page.close();
  }

  // T6 购买后灰显跨面板同步（购买 scribble 后线程/科技面板置脏标志）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1e8 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { const el = document.querySelector('.shop-grid .item'); if (el) el.click(); });
    await new Promise(r => setTimeout(r, 500));
    // 购买后立即检查（dirty 消费发生在 tick——检查卡面 count 更新）
    const t6 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { scribble: s.upgrades.scribble, ep: s.ep };
    });
    rec('T6 购买升级即时生效（资源扣除 + 级数落盘）', t6.scribble > 50 && t6.ep < 1e8, JSON.stringify(t6));
    await page.close();
  }

  // T7 折叠区整行（升级商店/研究点 owned 区 grid-column 1/-1）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    const t7 = await page.evaluate(() => {
      const oh = document.querySelector('.shop-grid .owned-header');
      return { has: !!oh, gc: oh ? getComputedStyle(oh).gridColumn : '' };
    });
    rec('T7 升级商店折叠区占整行（grid-column 1/-1）', t7.has && t7.gc === '1 / -1', `gc=${t7.gc}`);
    await page.close();
  }

  // T8 净化节点购买（遗物面板 DM 扣减）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ dm: 2000, _riftSeen: true, upgrades: { scribble: 50, storage: 500, compiler_temple: 1, purifier1: 0 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.click('#btn-relics');
    await new Promise(r => setTimeout(r, 5000));
    await page.evaluate(() => { const el = document.querySelector('[data-purifier-buy="purifier1"]'); if (el) el.click(); });
    await new Promise(r => setTimeout(r, 600));
    const t8 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { pur1: s.upgrades.purifier1, dm: s.dm };
    });
    rec('T8 净化节点 DM 购买成功（DM 扣减、级数 +1）', t8.pur1 === 1 && t8.dm < 2000, JSON.stringify(t8));
    await page.close();
  }

  console.log(`\n[v23-diag-v2822] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2822] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
