// v3.4.2 浏览器自动化实测：凝视深渊彩蛋（方向5）+ 研究升级扩充（方向1）+ 重载常驻
// 运行环境：Node + puppeteer-core + 本地 chromium（/usr/local/bin/chromium）。
// 本机沙箱无 chromium，交由 Linux CI 运行；此处仅交付用例。
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../dist/index.html');
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SAVE_KEY = 'abyss_idle_v2';

// 解锁 RP / DM / 裂隙所需的通用可见性字段
const baseSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '3', storyline: 'default', ep: 1e9, rp: 1e6, es: 3, dm: 5000, vs: 0, faith: 0,
  upgrades: {}, buildings: { matrixStorage: 1 }, tech: {}, cultists: [], religion: { unlocked: true, branch: 'sun', sun: true },
  pets: {}, activePets: [], delve: { unlocked: true, up: {} }, corruption: 0, _riftSeen: true, riftsSealed: 0,
  riftEmber: 200, riftUpgrades: {}, riftExpedition: null, activeRift: null,
  achievements: {}, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true },
  lastSeen: Date.now(), startTime: Date.now(),
}, extra));

try {
  // ===== A：凝视深渊——裂隙余烬购买彩蛋升级，触发左下方裂开 + 成就解锁 =====
  {
    const page = await browser.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e)));
    await page.evaluateOnNewDocument((k, s) => { localStorage.setItem(k, s); }, SAVE_KEY, baseSave({ riftEmber: 200 }));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(600);
    await page.evaluate(() => document.getElementById('btn-rift-tab').click());
    await sleep(300);
    const rows = await page.evaluate(() => document.querySelectorAll('.rift-upg-row').length);
    rec('A1 裂隙余烬升级树含凝视彩蛋（共 8 项，含 gaze）', rows === 8, `rows=${rows}`);
    const hasGazeBtn = await page.evaluate(() => !!document.querySelector('[data-rift-upg="gaze"] button'));
    rec('A2 凝视深渊升级行按钮存在', hasGazeBtn === true, '');
    await page.evaluate(() => document.querySelector('[data-rift-upg="gaze"] button').click());
    await sleep(500);
    const st = await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k));
      return { unlocked: s.abyssGazeUnlocked, gaze: s.riftUpgrades.gaze, ember: s.riftEmber, ach: s.achievements.abyss_gaze_egg };
    }, SAVE_KEY);
    rec('A3 购买后 abyssGazeUnlocked=true 且 riftUpgrades.gaze=1', st.unlocked === true && st.gaze === 1, `unlocked=${st.unlocked},gaze=${st.gaze}`);
    rec('A4 余烬扣减 20（200→180）', st.ember === 180, `ember=${st.ember}`);
    const crack = await page.evaluate(() => {
      const el = document.getElementById('abyss-gaze-crack');
      return el ? { op: el.style.opacity, svg: el.innerHTML.includes('abyss-gaze-svg') } : null;
    });
    rec('A5 左下方裂开层 #abyss-gaze-crack 出现并淡入', !!crack && crack.op === '1' && crack.svg === true, JSON.stringify(crack));
    rec('A6 成就「凝视深渊」自动解锁', st.ach === true, `ach=${st.ach}`);
    rec('A7 无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(' | ').slice(0, 140));
    await page.close();
  }

  // ===== B：重载常驻——已解锁则重新加载后裂开层自动出现 =====
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((k, s) => { localStorage.setItem(k, s); }, SAVE_KEY, baseSave({ abyssGazeUnlocked: true, riftUpgrades: { gaze: 1 } }));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(800);
    const crack = await page.evaluate(() => {
      const el = document.getElementById('abyss-gaze-crack');
      return el ? el.style.opacity : null;
    });
    rec('B1 重载后 ensureAbyssGaze 使裂开层常驻（opacity=1）', crack === '1', `op=${crack}`);
    await page.close();
  }

  // ===== C：研究升级扩充——RP 面板渲染新增 10 项 =====
  {
    const page = await browser.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e)));
    await page.evaluateOnNewDocument((k, s) => { localStorage.setItem(k, s); }, SAVE_KEY, baseSave({ rp: 1e6 }));
    await page.goto(fileUrl, { waitUntil: 'load' });
    await sleep(500);
    await page.evaluate(() => document.getElementById('btn-rp').click());
    await sleep(400);
    const txt = await page.evaluate(() => document.getElementById('research-upgrade-list')?.innerHTML || '');
    const NEW_NAMES = ['量子推演', '蜂群协议', '万物调和', '精益管理', '量子仓储', '深渊沉浸', '信标中继', '虚空凝视', '深渊观测·改', '信徒训导'];
    const missing = NEW_NAMES.filter(n => !txt.includes(n));
    rec('C1 研究面板渲染全部 10 个新增升级项', missing.length === 0, missing.length ? `缺:${missing.join('/')}` : '');
    rec('C2 无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(' | ').slice(0, 140));
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 220));
  process.exitCode = 1;
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v3.4.2 玩法扩充浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
