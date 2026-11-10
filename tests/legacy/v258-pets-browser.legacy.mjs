import { chromePath } from '../_chrome.mjs';
// v2.5.8 宠物浏览器实测：解锁购买 → 浮标动画 → hover 反馈 → 挂机经验刷新 → 无 JS 错误
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const fileUrl = 'file://' + join(__dirname, '../../dist/index.html');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
try {
  const inject = JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, pt: 99999,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: {}, faith: 0,
    pets: {}, activePets: [], fusesDone: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: true, dm: false },
    lastSeen: Date.now(), startTime: Date.now(),
  });
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));
  await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
  await page.goto(fileUrl, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));

  // 打开异兽 tab → 商店 6 宠物 + 无出战浮标
  await page.evaluate(() => document.getElementById('btn-pets').click());
  await new Promise(r => setTimeout(r, 200));
  const shopCount = await page.evaluate(() => document.querySelectorAll('[data-pet-buy]').length);
  rec('异兽 tab 商店渲染 6 种宠物', shopCount === 6, `shop=${shopCount}`);
  const float0 = await page.evaluate(() => document.getElementById('pet-float').innerHTML.length);
  rec('无宠物时浮标为空', float0 === 0);

  // 购买庭鼠（点击商店卡）
  await page.evaluate(() => document.querySelector('[data-pet-buy="hamster"]').click());
  await new Promise(r => setTimeout(r, 200));
  const bought = await page.evaluate(() => ({
    owned: !!document.querySelector('[data-pet-card="hamster"]'),
    floatItems: document.querySelectorAll('#pet-float .pet-item').length,
    floatHtml: document.getElementById('pet-float').innerHTML,
  }));
  rec('购买庭鼠 → 出战浮标出现 1 个', bought.owned === true && bought.floatItems === 1, `float=${bought.floatItems}`);

  // 浮动动画生效（computed animation-name=petFloat, 2s infinite）
  const anim = await page.evaluate(() => {
    const el = document.querySelector('#pet-float .pet-item');
    const cs = getComputedStyle(el);
    return { name: cs.animationName, dur: cs.animationDuration, iter: cs.animationIterationCount };
  });
  rec('浮标 petFloat 动画生效（2.2s infinite）', anim.name === 'petFloat' && anim.dur === '2.2s' && anim.iter === 'infinite', JSON.stringify(anim));

  // 真实鼠标 hover → animation none + transform scale(1.15)
  const box = await page.evaluate(() => {
    const r = document.querySelector('#pet-float .pet-item').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await new Promise(r => setTimeout(r, 300));
  const hover = await page.evaluate(() => {
    const el = document.querySelector('#pet-float .pet-item');
    const cs = getComputedStyle(el);
    return { name: cs.animationName, tr: cs.transform, cursor: getComputedStyle(document.getElementById('pet-float')).cursor };
  });
  rec('hover 蠕动动画生效（petWrithe，v2.7.5 ③ 交互动画）', hover.name === 'petWrithe', JSON.stringify(hover));
  rec('浮标容器手型 cursor:pointer', hover.cursor === 'pointer', hover.cursor);

  // 鼠标移开（退出 hover，动画恢复）
  await page.mouse.move(5, 5);
  await new Promise(r => setTimeout(r, 300));
  const unhover = await page.evaluate(() => getComputedStyle(document.querySelector('#pet-float .pet-item')).animationName);
  rec('鼠标移开后浮动动画恢复', unhover === 'petFloat', unhover);

  // 挂机 5.5s → 经验条出现（dirty.pets 5s 刷新链路）——注入档无产出建筑，检查 UI 无重建报错 + 浮标动画未因重建重启
  await new Promise(r => setTimeout(r, 5500));
  const after = await page.evaluate(() => {
    const el = document.querySelector('#pet-float .pet-item');
    const cs = el ? getComputedStyle(el) : null;
    return { anim: cs ? cs.animationName : 'none', card: document.querySelectorAll('[data-pet-card]').length };
  });
  rec('挂机 5s 刷新后浮标动画仍正常（未因重建丢失）', after.anim === 'petFloat' && after.card === 1, JSON.stringify(after));
  rec('无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(';'));
} finally { await browser.close(); }
const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.8 宠物浏览器实测：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
