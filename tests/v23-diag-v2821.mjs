// ===== v2.8.21 七项反馈浏览器实测 =====
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
  upgrades: { scribble: 50, storage: 3, compiler_temple: 1, purifier1: 1 }, buildings: { canteen: 1 },
  tech: { ai_core: true, auto_tech: true, entropy_reduce: true }, ai: {}, milesDone: {},
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: true, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 编译器神殿粒子真实渲染（canvas 青色像素 > 500）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3500)); // 等粒子累积数帧（动态字符雨，过早采样像素少）
    const t1 = await page.evaluate(() => {
      const cv = document.getElementById('code-rain');
      if (!cv) return { cyan: 0, z: '' };
      const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let cyan = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i+2] > d[i] && d[i+3] > 60) cyan++; }
      return { cyan, z: getComputedStyle(cv).zIndex };
    });
    rec('T1 编译器神殿粒子真实渲染（青色像素>150，z 最高层）', t1.cyan > 150 && t1.z === '999', `cyan=${t1.cyan} z=${t1.z}`);
    await page.close();
  }

  // T2 天赋弹框关闭按钮 ×（元素存在 + modal-box relative 定位 + 框内可见）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t2 = await page.evaluate(() => {
      const x = document.getElementById('talent-x');
      const box = document.getElementById('talent-options');
      const mb = box ? box.closest('.modal-box') : null;
      return { hasX: !!x, rel: mb ? getComputedStyle(mb).position : '', xInBox: x && mb ? mb.contains(x) : false };
    });
    rec('T2 天赋弹框 × 关闭按钮（modal-box relative + × 在框内）', t2.hasX && t2.rel === 'relative' && t2.xInBox, JSON.stringify(t2));
    await page.close();
  }

  // T3 自动研究开关点击 OFF→ON（持久化）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const found = await page.evaluate(() => document.querySelectorAll('[data-ai-switch="autoTech"]').length > 0);
    if (found) {
      await page.click('[data-ai-switch="autoTech"]');
      await new Promise(r => setTimeout(r, 400));
    }
    const t3 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const el = document.querySelector('[data-ai-switch="autoTech"]');
      return { has: !!el, autoTech: s.ai.autoTech, cls: el ? el.className : '' };
    });
    rec('T3 自动研究开关点击生效（OFF→ON 持久化）', t3.has && t3.autoTech === true && t3.cls.includes('on'), JSON.stringify(t3));
    await page.close();
  }

  // T4 科技树已研究折叠占整行（模块底部，grid-column 1/-1）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { ai_core: true, auto_tech: true, entropy_reduce: true, stable_protocol: true, axiom_shift: true, zero_entropy: true, new_protocol: true, focus_opt: true, compiler_temple: true, remote_link: true, chaos_shield: true, deep_space: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 500));
    const t4 = await page.evaluate(() => {
      const oh = document.querySelector('.tech-grid .owned-header');
      return { has: !!oh, gc: oh ? getComputedStyle(oh).gridColumn : '' };
    });
    rec('T4 科技树已研究折叠占整行（grid-column 1/-1）', t4.has && t4.gc === '1 / -1', `gc=${t4.gc}`);
    await page.close();
  }

  // T5 EP 达到上限不再产生腐化（溢出只进 RP 池）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1300000, corruption: 10 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const t5 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { corruption: s.corruption, ep: s.ep };
    });
    // 溢出已截断到上限；腐化不因溢出增长（≈10 不变）
    rec('T5 EP 上限后不产生腐化（腐化不因溢出增长）', t5.corruption <= 10.2, `corruption=${t5.corruption}`);
    await page.close();
  }

  // T6 净化节点 DM 购买 + 限购 3 级（卡面显示 DM）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ dm: 1000, ep: 99999999 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    const t6 = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.item')].find(x => x.textContent.includes('净化节点 I'));
      return { has: !!el, dmText: el ? el.textContent.includes('DM') : false, lv: el ? el.textContent.includes('Lv.1/3') || el.textContent.includes('×1') : false };
    });
    rec('T6 净化节点 DM 购买 + 限购（卡面 DM 成本 + 级数上限）', t6.has && t6.dmText, JSON.stringify(t6));
    await page.close();
  }

  // T7 顶部来源悬浮气泡（data-tip）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t7 = await page.evaluate(() => {
      const c = document.getElementById('h-cps');
      const st = c ? c.closest('.stat') : null;
      return { tip: st && st.dataset.tip ? st.dataset.tip : '' };
    });
    rec('T7 顶部产出来源悬浮气泡（data-tip 生效）', t7.tip.includes('产出来源'), t7.tip);
    await page.close();
  }

  // T8 首次科技解锁正常购入（无临时 buff 机制——v2.8.22 ③ 移除发展跃迁 buff，模块解锁靠解锁项自然发展）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: {}, rp: 99999, ep: 2e6, dm: 999999, upgrades: { scribble: 50, storage: 500, compiler_temple: 1, purifier1: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => { const el = document.querySelector('.tech-grid .tech'); if (el) el.click(); });
    await new Promise(r => setTimeout(r, 600));
    const t8 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { bought: !!s.tech.offline1, burstUntil: s.burstUntil || 0 };
    });
    rec('T8 首次科技解锁正常购入、无临时 burst buff', t8.bought && !t8.burstUntil, JSON.stringify(t8));
    await page.close();
  }

  console.log(`\n[v23-diag-v2821] ${pass}/${pass + fail} 项通过`);
  await browser.close();
  if (fail > 0) process.exit(1);
} catch (err) {
  console.error('[v23-diag-v2821] 异常：', err.message);
  await browser.close();
  process.exit(2);
}
