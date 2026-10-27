// ===== v2.8.19 七项反馈浏览器实测（①天赋 desc+关闭按钮 ③宗教无EP库存 ④编译器神殿粒子 ⑥触手1级1条 ⑦维修坞文案）=====
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
  _version: 6, chapter: '1', storyline: 'default', ep: 2e6, rp: 50, es: 0, dm: 0, pt: 200,
  upgrades: { scribble: 50, storage: 3, dock: 1 }, buildings: {}, tech: {}, ai: {}, milesDone: {},
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: true, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 天赋 desc：财神/幸运 无歧义（含「仅本轮生效」且不出现「×3」歧义句式）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t1 = await page.evaluate(() => {
      // 打开转生弹框（触发 openTalentModal 前先点晋升区触发转生流）
      const pre = document.getElementById('prestige-panel');
      const btn = pre ? pre.querySelector('button[data-prestige], .btn:not(.disabled)') : null;
      return { hasPanel: !!pre, btnText: btn ? btn.textContent : '' };
    });
    rec('T1 转生面板存在（天赋 desc 由单测 T-T1 断言）', t1.hasPanel, JSON.stringify(t1));
    await page.close();
  }

  // T2 天赋弹框 × 关闭按钮可点、关闭后弹框消失
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t2 = await page.evaluate(() => {
      const modal = document.getElementById('talent-modal');
      const x = document.getElementById('talent-x');
      // 打开 → 点 × → 验证关闭
      modal.style.display = 'flex';
      x.click();
      const closed = modal.style.display === 'none';
      modal.style.display = 'none';
      return { hasX: !!x, xText: x ? x.textContent : '', closed };
    });
    rec('T2 天赋弹框 × 关闭按钮可点、点击后关闭', t2.hasX && t2.xText.includes('×') && t2.closed, JSON.stringify(t2));
    await page.close();
  }

  // T3 宗教解锁无 EP 库存限制（存储3级+RP觉醒，EP 低于存储上限 80% 也可唤醒）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1e4, upgrades: { storage: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t3 = await page.evaluate(() => {
      const btn = document.querySelector('[data-religion-unlock="1"]');
      const desc = document.querySelector('.religion-desc');
      return { disabled: btn ? btn.disabled : null, text: btn ? btn.textContent : '', hasEpReq: desc ? desc.textContent.includes('EP 库存 ≥') : false };
    });
    // EP 1e4 远低于存储上限 80%（3 级上限约 84K ×0.8）——旧逻辑应 disabled；新逻辑仅需存储3级+RP
    rec('T3 宗教解锁不再要求 EP 库存 ≥80%（低 EP 也可唤醒）', t3.disabled === false && !t3.hasEpReq, JSON.stringify(t3));
    await page.close();
  }

  // T4 编译器神殿：持有后 code-rain canvas 显示（非 none）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ upgrades: { compiler_temple: 1, storage: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t4 = await page.evaluate(() => {
      const cv = document.getElementById('code-rain');
      return { display: cv ? cv.style.display : '', has: !!cv };
    });
    rec('T4 持有编译器神殿 → 代码雨 canvas 显示', t4.has && t4.display !== 'none', JSON.stringify(t4));
    await page.close();
  }

  // T5 触手：鱼缸 1 级仅显示 1 条（tentacle-b 默认隐藏）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ upgrades: { abyss_fishbowl: 1, storage: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t5 = await page.evaluate(() => {
      const deco = document.getElementById('tentacle-deco');
      const a = deco ? getComputedStyle(deco.querySelector('.tentacle-a')).opacity : '?';
      const b = deco ? getComputedStyle(deco.querySelector('.tentacle-b')).opacity : '?';
      const c = deco ? getComputedStyle(deco.querySelector('.tentacle-c')).opacity : '?';
      return { a, b, c, cls: deco ? deco.className : '' };
    });
    rec('T5 鱼缸 1 级仅 1 条触手（a 可见，b/c 隐藏）', t5.a !== '0' && t5.b === '0' && t5.c === '0', JSON.stringify(t5));
    await page.close();
  }

  // T6 维修坞：desc 明确「线程维护：流失概率 -50%」（商店卡面可读）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e5, upgrades: { scribble: 5, storage: 3 }, buildings: { canteen: 1 } })); // 建筑区门控：anyBuilt 解锁
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t6 = await page.evaluate(() => {
      const shop = document.getElementById('building-list');
      const card = shop ? [...shop.querySelectorAll('.item, .owned-item')].find(e => e.textContent.includes('维修坞')) : null;
      return { desc: card ? card.textContent.replace(/\s+/g, ' ') : '' };
    });
    rec('T6 维修坞卡面显示「线程维护：流失概率 -50%」', t6.desc.includes('流失概率 -50%'), JSON.stringify(t6));
    await page.close();
  }

  console.log(`\n[v23-diag-v2819] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
