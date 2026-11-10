import { chromePath } from '../_chrome.mjs';
// v2.7.0 浏览器实测：①异兽锚点即时门控（未购宠物乐园不解锁）②晋升按钮可点+天赋模态+转生生效
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 存档A：resDiscovered.pt 历史置位但本局未购宠物乐园 → 异兽应锁定
const baseA = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5e4, rp: 10, es: 0, dm: 5,
  upgrades: { scribble: 3 }, buildings: { abyss_anchor: 1, end_shrine: 1 },
  tech: { ai_core: true }, ai: {}, cultists: [], religion: { unlocked: true, branch: 'sun', sun: true, seal: 1 },
  pets: {}, activePets: [], fusesDone: 0, delve: {}, activeRift: null, riftsSealed: 2, riftEmber: 0, riftUpgrades: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now(), faith: 1, unlockedBuildings: { abyss_anchor: true, end_shrine: true } };
// 存档B：晋升截图场景——本局累计 9e9 ≥ 需求 3e9（v2.8.27）→ 2 PP，按钮应可点、模态应弹出、转生应生效
const baseB = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 1e5, rp: 5, es: 0, dm: 5, prestige: 0, runEarned: 9e9, // v2.8.27：首轮晋升阈值 3e9（原 10M）
  upgrades: { scribble: 3 }, buildings: { abyss_anchor: 1, end_shrine: 1 },
  tech: { ai_core: true }, ai: {}, cultists: [], religion: { unlocked: true, branch: 'sun', sun: true, seal: 1 },
  pets: {}, activePets: [], fusesDone: 0, delve: {}, activeRift: null, riftsSealed: 2, riftEmber: 0, riftUpgrades: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now(), faith: 1, unlockedBuildings: { abyss_anchor: true, end_shrine: true } };
try {
  // ===== A：异兽锁定 =====
  const pageA = await browser.newPage();
  await pageA.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(baseA));
  await pageA.goto(fileUrl, { waitUntil: 'load' });
  await sleep(6000);
  const petBtn = await pageA.evaluate(() => {
    const b = document.getElementById('btn-pets');
    return b ? { locked: b.classList.contains('tab-locked'), disabled: b.disabled, text: b.textContent } : null;
  });
  rec('V1 未购宠物乐园（即使 resDiscovered.pt 历史置位）异兽 tab 锁定', petBtn && petBtn.locked && petBtn.disabled, JSON.stringify(petBtn));
  // 顶栏 PT 资源不显示
  const ptShown = await pageA.evaluate(() => {
    const el = document.getElementById('h-pt');
    return el && el.parentElement ? el.parentElement.style.display !== 'none' : null;
  });
  rec('V2 顶栏 PT（异兽饼干）隐藏', ptShown === false, `ptShown=${ptShown}`);
  // 本局购入宠物乐园 → 新档验证即时门控放行（reload 会被注入脚本覆盖存档，故新开页注入 petland 档）
  const pageA2 = await browser.newPage();
  const withPet = JSON.parse(JSON.stringify(baseA));
  withPet.upgrades.petland = 1;
  await pageA2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(withPet));
  await pageA2.goto(fileUrl, { waitUntil: 'load' });
  await sleep(6000);
  const petBtn2 = await pageA2.evaluate(() => {
    const b = document.getElementById('btn-pets');
    return b ? { locked: b.classList.contains('tab-locked'), disabled: b.disabled } : null;
  });
  rec('V3 本局购入宠物乐园后异兽 tab 解锁', petBtn2 && !petBtn2.locked && !petBtn2.disabled, JSON.stringify(petBtn2));
  await pageA2.close();
  await pageA.close();
  // ===== B：晋升可点性 =====
  const pageB = await browser.newPage();
  await pageB.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, JSON.stringify(baseB));
  await pageB.goto(fileUrl, { waitUntil: 'load' });
  await sleep(6000);
  await pageB.evaluate(() => document.getElementById('btn-prestige').click());
  await sleep(500);
  const pre = await pageB.evaluate(() => {
    const btn = document.getElementById('prestige-panel') ? document.getElementById('prestige-panel').querySelector('#prestige-btn') : null;
    return btn ? { disabled: btn.disabled, text: btn.textContent.trim() } : { missing: true };
  });
  // 点击晋升按钮（DOM click 经容器事件委托，调试已验证完整链路）
  await pageB.evaluate(() => document.getElementById('prestige-btn').click());
  await sleep(400);
  const modalShown = await pageB.evaluate(() => {
    const m = document.getElementById('talent-modal');
    return m ? m.style.display === 'flex' : false;
  });
  rec('V4 晋升按钮可点（无 disabled，已达标 2 PP）', pre && !pre.disabled && pre.text === '晋升转生', JSON.stringify(pre));
  rec('V5 点击晋升按钮弹出天赋选择模态', modalShown, `modal=${modalShown}`);
  // 选择第一个天赋 → 转生生效
  const after = await pageB.evaluate(() => {
    const opt = document.querySelector('#talent-options .talent-option');
    if (opt) opt.click();
    return true;
  });
  await sleep(6000); // 跨 5s 存档周期再读 localStorage
  const state = await pageB.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
  rec('V6 转生生效（prestige+1、本局累计清零、Pets 清空）', state.prestige === 1 && state.runEarned === 0 && JSON.stringify(state.pets) === '{}', `prestige=${state.prestige} runEarned=${state.runEarned}`);
  await pageB.close();
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.7.0 浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
