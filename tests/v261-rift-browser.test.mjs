// v2.6.1 裂隙扩展浏览器实测：裂隙卡三按钮 → 深入流程 → 裂隙 tab 升级树（真实 UI 冒烟）
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../dist/index.html');
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  // ===== V1 裂隙事件卡：三按钮 + 深入流程 =====
  {
    const inject = JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, es: 3, dm: 5000, vs: 0, faith: 0,
      upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: { unlocked: true, branch: 'sun', sun: true }, pets: {}, activePets: [], fusesDone: 0,
      delve: { unlocked: true, up: {} }, corruption: 0, _riftSeen: true, riftsSealed: 0, riftEmber: 50, riftUpgrades: {}, riftExpedition: null,
      activeRift: { power: 3, level: 3, sealCost: 1000, dmReward: 3, expiresAt: Date.now() + 90000 },
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true },
      lastSeen: Date.now(), startTime: Date.now(),
    });
    const page = await browser.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e)));
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(600);
    const card = await page.evaluate(() => ({
      display: getComputedStyle(document.getElementById('rift-card')).display,
      name: document.getElementById('rift-panel')?.textContent.includes('Lv.3') ?? false,
      buttons: ['seal-rift', 'embrace-rift', 'delve-rift'].map(id => !!document.getElementById(id)),
    }));
    rec('V1 裂隙卡显示（注入 activeRift 档）', card.display !== 'none' && card.buttons.every(Boolean), `btn=${card.buttons}`);
    rec('V1 裂隙卡显示等级（Lv.3）', card.name === true, '');

    // 深入：EP 1e9 ≥ 500、DM 5000 ≥ 6
    await page.evaluate(() => document.getElementById('delve-rift').click());
    await sleep(300);
    const exp = await page.evaluate(() => ({
      // v3.3.5 反馈③：首列裂隙卡在「已见过裂隙」后常驻显示下次倒计时——此处只断言「事件卡（封印/拥抱按钮）已关闭」
      riftGone: !document.getElementById('seal-rift') && !document.getElementById('embrace-rift'),
      exRunning: document.querySelector('#rift-tab-panel') ? true : false,
      hasBtn: !!document.getElementById('btn-rift-tab'),
    }));
    rec('V1 深入后裂隙卡关闭 + 裂隙 tab 入口存在', exp.riftGone === true && exp.hasBtn === true, `riftGone=${exp.riftGone}`);
    // 裂隙 tab：深入状态展示
    await page.evaluate(() => document.getElementById('btn-rift-tab').click());
    await sleep(300);
    const exPanel = await page.evaluate(() => document.getElementById('rift-tab-panel').innerHTML);
    rec('V1 裂隙 tab 显示深入探索状态（进度/剩余/腐化，v2.8 渲染改版口径）', exPanel.includes('探索进度') && exPanel.includes('剩余'), '');
    // 等 62s 不现实 → 直接脱出验证产出保留（v2.8.12+ 脱出走确认弹框，此处仅验证余烬不被预支）
    await page.evaluate(() => document.getElementById('abort-rift-ex')?.click());
    await sleep(300);
    const afterAbort = await page.evaluate(() => ({
      ember: JSON.parse(localStorage.getItem('abyss_idle_v2')).riftEmber,
    }));
    rec('V1 脱出流程不预支余烬（注入 50 → 仍 50；v2.8.12+ 需确认弹框，未确认不落档）', afterAbort.ember === 50, `ember=${afterAbort.ember}`)
    rec('V1 无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(' | ').slice(0, 120));
    await page.close();
  }

  // ===== V2 裂隙 tab：余烬升级树真实购买 =====
  {
    const inject = JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, es: 3, dm: 5000, vs: 0, faith: 0,
      upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: { unlocked: true, branch: 'sun', sun: true }, pets: {}, activePets: [], fusesDone: 0,
      delve: {}, corruption: 0, _riftSeen: true, riftsSealed: 0, riftEmber: 200, riftUpgrades: {}, riftExpedition: null, activeRift: null,
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true },
      lastSeen: Date.now(), startTime: Date.now(),
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(600);
    await page.evaluate(() => document.getElementById('btn-rift-tab').click());
    await sleep(300);
    const panel = await page.evaluate(() => document.getElementById('rift-tab-panel').innerHTML);
    rec('V2 裂隙 tab 显示余烬升级树（v2.8 渲染口径：余烬科技行）', panel.includes('裂隙科技') && panel.includes('余烬'), '');
    const upgRows = await page.evaluate(() => document.querySelectorAll('.rift-upg-row').length);
    // v3.6.3 ⑥：余烬科技树已从 7 项扩到 11 项（v3.4.9 自动净化仪、v3.6.0 虚空之心等），旧断言编码旧规模
    rec('V2 升级树渲染 11 项（基础科技 + 自动动作 + 后续扩充）', upgRows === 11, `rows=${upgRows}`);
    // 购买哨站 Lv.1（20 余烬）
    await page.evaluate(() => document.querySelector('[data-rift-upg="sentinel"] button').click());
    await sleep(300);
    const st = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { ember: s.riftEmber, upg: s.riftUpgrades.sentinel };
    });
    rec('V2 哨站购买（-20 余烬 → Lv.1）', st.ember === 180 && st.upg === 1, `ember=${st.ember},lv=${st.upg}`);
    // 间隔显示：面板低频重建（5s 节流），落档为准——哨站 Lv.1 间隔公式 30×0.75≈22.5→面板下次重建生效
    const spawnState = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')).riftUpgrades.sentinel);
    rec('V2 哨站落档（间隔公式下次面板重建生效）', spawnState === 1, `lv=${spawnState}`);
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.1 裂隙扩展浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
