// v2.6.2 三项修复浏览器实测（真实 UI）
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../dist/index.html');
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = { _version: 6, chapter: '1', storyline: 'default', ep: 5000, rp: 0, es: 0, dm: 0, vs: 0, faith: 0,
  upgrades: { storage: 1, cpu: 1 }, buildings: { abyss_fishbowl: 1 }, tech: { ai_core: true }, ai: {}, cultists: [], religion: {}, pets: {}, activePets: [], fusesDone: 0,
  delve: {}, corruption: 0, activeRift: null, riftsSealed: 0, riftEmber: 0, riftUpgrades: {}, riftExpedition: null,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now() };
try {
  // ===== V1 触手：动画 steps(6) + 描边渲染 =====
  {
    const inject = JSON.stringify({ ...base, ep: 300, upgrades: { storage: 1, cpu: 1 }, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false } });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(800);
    const tentacle = await page.evaluate(() => {
      const deco = document.getElementById('tentacle-deco');
      const anim = deco ? getComputedStyle(deco.querySelector('.tentacle-a')).animationTimingFunction : 'none';
      const segs = deco ? deco.querySelectorAll('.tentacle-a path').length : 0;
      const dark = deco ? !!deco.querySelector('path[stroke="#3d1d6e"]') : false;
      return { shown: deco && deco.style.display !== 'none', anim, segs, dark };
    });
    rec('V1 触手显示（鱼缸 ≥1 级）', tentacle.shown === true, `shown=${tentacle.shown}`);
    rec('V1 触手动画 steps(6)', tentacle.anim === 'steps(6)' || tentacle.anim === 'steps(6, end)', tentacle.anim);
    rec('V1 触手多层描边段（5 段 path/条：底 16/主 10/亮 4.5/霓虹 1.6/光晕 4 + 深色描边）', tentacle.segs === 5 && tentacle.dark === true, `segs=${tentacle.segs}`);
    await page.close();
  }

  // ===== V2 AI 激活：9/10 资源未全解锁 → 按钮禁点 =====
  {
    const inject = JSON.stringify({ ...base, ep: 50000 });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(1000);
    const aiBtn = await page.evaluate(() => {
      const b = document.querySelector('[data-ai-build-activate]');
      return b ? { disabledAttr: b.disabled, hasClass: b.classList.contains('disabled') } : null;
    });
    rec('V2 未全解锁时激活按钮 disabled 属性=true（真正禁点）', aiBtn && aiBtn.disabledAttr === true && aiBtn.hasClass === true, JSON.stringify(aiBtn));
    // 点击无效果：autoBuildUnlocked 保持 false
    await page.evaluate(() => { const b = document.querySelector('[data-ai-build-activate]'); if (b) b.click(); });
    await sleep(300);
    const still = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('abyss_idle_v2')).ai; return a && a.autoBuildUnlocked; });
    rec('V2 点击未解锁按钮不激活', still !== true, `autoBuildUnlocked=${still}`);
    await page.close();
  }

  // ===== V3 宗教：曾达标入口常显 + 未达标唤醒按钮禁点 =====
  {
    // 曾达标（_religionHintSeen）但当前 ep 未达 50% cap → tab 仍显示、唤醒按钮禁点
    const inject = JSON.stringify({ ...base, ep: 100, upgrades: { storage: 3, cpu: 1 }, _religionHintSeen: true });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(800);
    const relState = await page.evaluate(() => {
      const btn = document.getElementById('btn-religion');
      return { tabShown: btn && btn.style.display !== 'none' };
    });
    rec('V3 曾达标（当前未达标）宗教入口仍显示', relState.tabShown === true, `shown=${relState.tabShown}`);
    await page.evaluate(() => document.getElementById('btn-religion').click());
    await sleep(300);
    const wakeBtn = await page.evaluate(() => {
      const b = document.querySelector('[data-religion-unlock]');
      return b ? { disabledAttr: b.disabled, hasClass: b.classList.contains('disabled') } : null;
    });
    // v2.8.20 ④：唤醒不再消耗 EP——存储≥3 + RP 觉醒即可（EP 库存无要求）
    rec('V3 唤醒按钮可点（v2.8.20 无 EP 条件：存储≥3 + RP 觉醒）', wakeBtn !== null, JSON.stringify(wakeBtn));
    // 点击唤醒 → 立即解锁，入口保留
    await page.evaluate(() => { const b = document.querySelector('[data-religion-unlock]'); if (b) b.click(); });
    await sleep(300);
    const afterClick = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const b = document.getElementById('btn-religion');
      return { unlocked: !!(s.religion && s.religion.unlocked), tabShown: b && b.style.display !== 'none' };
    });
    rec('V3 点击唤醒解锁成功且入口不消失', afterClick.unlocked === true && afterClick.tabShown === true, JSON.stringify(afterClick));
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.2 三项修复浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
