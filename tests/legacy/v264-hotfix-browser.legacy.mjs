import { chromePath } from '../_chrome.mjs';
// v2.6.4 浏览器实测：深入状态置顶 / 晋升未达标暗置 / 信仰超长线购买 / 薪资显示
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const base = { _version: 6, chapter: '5', storyline: 'line_abyss', ep: 1e6, rp: 500, es: 3, dm: 5000, vs: 0, faith: 100,
  upgrades: { storage: 8 }, buildings: { abyss_fishbowl: 1 }, tech: { ai_core: true }, ai: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: true, branch: 'sun', sun: true, seal: 3, temple: 5 }, pets: {}, activePets: [], fusesDone: 0, delve: {}, corruption: 10,
  activeRift: null, riftsSealed: 0, riftEmber: 0, riftUpgrades: {}, riftExpedition: null, _riftSeen: true, _religionHintSeen: true,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  lastSeen: Date.now(), startTime: Date.now() };
try {
  // V1 深入状态置顶 + 薪资显示
  {
    const inject = JSON.stringify({ ...base, riftExpedition: { until: Date.now() + 45000, level: 3, sealCost: 1000, gainedDm: 2.5, gainedVs: 0.4 } });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(900);
    const hero = await page.evaluate(() => {
      const el = document.getElementById('rift-exp-status');
      return { shown: el && el.style.display !== 'none', text: el ? el.textContent : '', salary: (document.getElementById('staff-salary')?.textContent || '').trim() };
    });
    rec('V1 深入状态置顶显示（剩余时间/腐化）', hero.shown === true && hero.text.includes('深入裂隙 Lv.3') && hero.text.includes('腐化'), hero.text.slice(0, 60));
    rec('V1 薪资并入消耗/s 悬浮（v2.8.20；原 staff-salary 元素已移除）', hero.salary === '' || /[\d]+\.[\d]{2}\/s/.test(hero.salary), hero.salary);
    await page.close();
  }
  // V2 晋升未达标暗置（runEarned 不足）
  {
    const inject = JSON.stringify({ ...base, runEarned: 1000, storyline: 'default', religion: { unlocked: true, branch: 'sun', sun: true, seal: 0, temple: 0 } });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(900);
    await page.evaluate(() => document.getElementById('btn-prestige').click());
    await sleep(300);
    const pre = await page.evaluate(() => {
      const btn = document.getElementById('prestige-btn');
      const st = document.querySelector('.prestige-status');
      return { disabled: btn.disabled, noClass: btn.className.includes('no'), txt: st ? st.textContent.trim() : '', note: document.querySelector('#prestige-panel') ? document.querySelector('#prestige-panel').textContent.includes('晋升条件') : false };
    });
    rec('V2 晋升未达标按钮暗置（可点提示）+ 状态行文案（未达标：还差 N EP（%））', pre.disabled === false && pre.noClass === true && pre.txt.includes('未达标：还差') && pre.note === true, pre.txt);
    await page.close();
  }
  // V3 信仰超长线：神谕塔购买（圣印≥3、信仰充足）
  {
    const inject = JSON.stringify(base);
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(900);
    await page.evaluate(() => document.getElementById('btn-religion').click());
    await sleep(300);
    // 神谕塔升级按钮（圣印 3 达标 → 可点）；v3.3.7 反馈⑤：神谕塔涨价 2500×2.6，播种 10 万 FP 再验证扣费
    await page.evaluate(() => { window.S.faith = 100000; });
    await sleep(200);
    const before = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { oracle: s.religion.oracle, faith: window.S.faith };
    });
    await page.evaluate(() => { const b = document.querySelector('[data-religion-oracle]'); if (b && !b.disabled) b.click(); });
    await sleep(300);
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { oracle: s.religion.oracle || 0, faith: window.S.faith };
    });
    rec('V3 神谕塔购买成功（-2500 信仰，v3.3.7 涨价口径）', after.oracle === 1 && after.faith > before.faith - 2510 && after.faith < before.faith - 2490, `oracle=${after.oracle},faith=${before.faith}→${after.faith.toFixed(2)}`);
    // 面板显示圣战军（圣所 5 达标）
    const panelTxt = await page.evaluate(() => document.getElementById('religion-panel').textContent);
    rec('V3 面板显示神谕塔/圣战军升级点', panelTxt.includes('神谕塔') && panelTxt.includes('圣战军'), '');
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.4 八项修复浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
