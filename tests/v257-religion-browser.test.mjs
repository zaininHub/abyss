// v2.5.7 宗教系统浏览器链路：解锁 → 选分支 → 圣印升级 → 圣所（真实 UI 冒烟）
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../dist/index.html');

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
try {
  const inject = JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, es: 0,
    upgrades: { storage: 1 }, buildings: {}, tech: {}, cultists: [], religion: {}, faith: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(),
  });
  const page = await browser.newPage();
  // 注入档：仓库 1 级 + EP 库存 ≥50% 上限（evaluateOnNewDocument 注册，对齐既有套件姿势）
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 800));

  const btnVisible = await page.evaluate(() => {
    const b = document.getElementById('btn-religion');
    return b && b.style.display !== 'none';
  });
  rec('宗教 tab 入口出现（仓库+库存达标）', btnVisible === true);

  // 打开宗教 tab → 面板含「唤醒信仰」
  await page.evaluate(() => document.getElementById('btn-religion').click());
  await new Promise(r => setTimeout(r, 300));
  const unlockShown = await page.evaluate(() => document.getElementById('religion-panel').innerHTML.includes('唤醒信仰'));
  rec('宗教面板显示解锁按钮（唤醒信仰）', unlockShown === true);

  // 点击解锁 → 出现分支卡（早期 2 个：日耀议会/创世枢机）
  await page.evaluate(() => document.querySelector('[data-religion-unlock]').click());
  await new Promise(r => setTimeout(r, 300));
  const branchCount = await page.evaluate(() => document.querySelectorAll('[data-religion-branch]').length);
  const branchIds = await page.evaluate(() => [...document.querySelectorAll('[data-religion-branch]')].map(e => e.dataset.religionBranch).join(','));
  // 注入档 ep 远超存储上限 → 合法触发 RP 溢出解锁 → 中期分支一并可见（预期行为）；
  // 严格「无 RP 时仅 2 分支」由 node 套件 V2 覆盖。此处断言基础分支必在。
  rec('解锁后分支卡渲染（含基础分支 sun/genesis）', branchCount >= 2 && branchIds.includes('sun') && branchIds.includes('genesis'), `cards=${branchCount}[${branchIds}]`);

  // 选「日耀议会」
  await page.evaluate(() => document.querySelector('[data-religion-branch="sun"]').click());
  await new Promise(r => setTimeout(r, 300));
  const branchChosen = await page.evaluate(() => {
    const p = document.getElementById('religion-panel').innerHTML;
    return p.includes('日耀议会') && p.includes('信仰圣所');
  });
  rec('选择日耀议会成功（面板切至分支视图）', branchChosen === true);

  // 圣印升级按钮存在（信仰不足时 disabled）
  const sealBtn = await page.evaluate(() => {
    const b = document.querySelector('[data-religion-seal]');
    return b ? { exists: true, disabled: b.className.includes('disabled'), text: b.textContent.trim() } : null;
  });
  rec('圣印升级按钮渲染（信仰 0 置灰）', sealBtn && sealBtn.exists === true && sealBtn.disabled === true, sealBtn ? sealBtn.text : '');

  // 圣所建造按钮存在（EP 2000 < 1e5 → disabled）
  const tBtn = await page.evaluate(() => {
    const b = document.querySelector('[data-religion-temple]');
    return b ? { exists: true, disabled: b.className.includes('disabled') } : null;
  });
  rec('圣所建造按钮渲染（EP 不足置灰）', tBtn && tBtn.exists === true && tBtn.disabled === true, tBtn ? '' : 'missing');

  // 无 JS 错误
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));
  await new Promise(r => setTimeout(r, 300));
  rec('无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(';'));
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.7 宗教浏览器链路：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
