import { chromePath } from '../_chrome.mjs';
// v2.6.3 浏览器实测：B 分区消失 / 混沌心智禁用 AI + 直觉购买 / 触手 tap 动画
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mkSave = extra => JSON.stringify({ _version: 6, chapter: '5', storyline: 'line_abyss', ep: 1e8, rp: 500, es: 3, dm: 5000, vs: 0, faith: 0,
  upgrades: {}, buildings: { abyss_fishbowl: 1 }, tech: { ai_core: true, chaos_mind: true }, ai: { autoUpgrade: true, autoHire: false, autoClaim: false, autoBuild: false },
  cultists: [], religion: { unlocked: true, branch: 'sun', sun: true }, pets: {}, activePets: [], fusesDone: 0, delve: {}, corruption: 0,
  activeRift: null, riftsSealed: 0, riftEmber: 0, riftUpgrades: {}, riftExpedition: null, _riftSeen: true, _religionHintSeen: true,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now(), ...extra });
try {
  // ===== V1 B 分区不渲染 =====
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1e8 }));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(900);
    const shopText = await page.evaluate(() => document.getElementById('shop-list') ? document.getElementById('shop-list').textContent : '');
    rec('V1 商店列表不出现「点击与暴击」分区', !shopText.includes('点击与暴击'), '');
    rec('V1 商店列表不含指尖力场/暴击反应堆', !shopText.includes('指尖力场') && !shopText.includes('暴击反应堆'), '');
    await page.close();
  }

  // ===== V2 混沌心智：AI 禁用（面板提示）+ 混沌直觉 10s 购买 =====
  {
    const page = await browser.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e).slice(0, 160)));
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 25000, upgrades: { storage: 8 } }));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(900);
    // AI 面板：混沌心智生效提示
    const panel = await page.evaluate(() => document.getElementById('ai-panel') ? document.getElementById('ai-panel').textContent : '');
    rec('V2 AI 面板显示混沌心智接管（无开关）', panel.includes('混沌心智已接管') && !panel.includes('自动升级'), '');
    // 等 12s：混沌直觉应已购买至少 1 项最便宜未拥有升级
    await sleep(12000);
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { ep: s.ep, totalBuys: s.totalBuys || 0, upgCount: Object.keys(s.upgrades).length, tech: s.tech, ai: s.ai };
    });
    rec('V2 混沌直觉 12s 内购入升级（upgrades 非空）', after.upgCount >= 1 && after.totalBuys >= 1, `upg=${after.upgCount},buys=${after.totalBuys},ep=${after.ep}`);
    rec('V2 无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(' | ').slice(0, 150));
    await page.close();
  }

  // ===== V3 触手协议 tap 动画 =====
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1e8, tech: { ai_core: true, chaos_mind: false, tentacle_protocol: true } }));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(800);
    // 手动模拟触发：加 tap class
    const anim = await page.evaluate(() => {
      const deco = document.getElementById('tentacle-deco');
      deco.classList.add('tap');
      const a = getComputedStyle(deco.querySelector('.tentacle-a')).animationName;
      return a;
    });
    rec('V3 触手 tap 动画生效（animationName=tentacle-tap）', anim === 'tentacle-tap', anim);
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.3 三项修复浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
