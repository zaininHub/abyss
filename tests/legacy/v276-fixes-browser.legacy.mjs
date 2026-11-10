import { chromePath } from '../_chrome.mjs';
// ===== v2.7.5 八项反馈浏览器实测 =====
// P1 晋升点击稳定（整面板重建降频至 2s，慢速点击不再丢失）
// P2 轮回二次确认弹窗
// P3 宠物点击冒 ♥（非 emoji 方块）+ 像素克苏鲁浮标
// P4 族升级（RP 购买）并入研究点 tab
// P5 命运的岔路口移入故事线 tab
// P6 离线升级 EP+RP 双消耗（EP 门槛提高）
// P7 探采平台与深渊商店并入遗物 tab
// P8 顶部轮回次数 + 悬停弹框显示加成
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../../dist/index.html');
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '5', storyline: 'line_abyss', ep: 5e5, rp: 100, es: 0, dm: 100,
  upgrades: { storage: 2, scooter: 1, convoy: 1, cache: 1 }, buildings: {}, tech: {},
  ai: {}, milesDone: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true },
  _rpOverflowSeen: true, allTimeEp: 2e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // P1 晋升点击稳定：达标档慢速点击（mousedown 按住 350ms 再 mouseup）成功打开天赋模态
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ runEarned: 1e10, prestige: 1 })); // v2.8.27：prestige1 阈值 3e9×2^1.5≈8.5e9
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-prestige').click());
    await new Promise(r => setTimeout(r, 400));
    const r = await page.evaluate(() => {
      const b = document.getElementById('prestige-btn');
      const rc = b.getBoundingClientRect();
      return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 };
    });
    await page.mouse.move(r.x, r.y);
    await page.mouse.down();
    await new Promise(r2 => setTimeout(r2, 350)); // 慢速点击：跨过旧版 100ms 重建窗口
    await page.mouse.up();
    await new Promise(r2 => setTimeout(r2, 400));
    const opened = await page.evaluate(() => {
      const m = document.getElementById('talent-modal');
      return m && m.style.display === 'flex' && m.querySelector('[data-talent]') !== null;
    });
    rec('P1 晋升按钮慢速点击成功（降频后按钮稳定，不再需要连点）', opened === true, '');
    await page.close();
  }
  // P2 轮回二次确认：达标点击 → confirm-modal 出现 → 确认 → 轮回生效
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ runEarned: 2e9, prestige: 2, delveDepth: 5, riftEmber: 200, faith: 50 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-prestige').click());
    await new Promise(r => setTimeout(r, 400));
    const rb = await page.evaluate(() => {
      const b = document.getElementById('reincarn-btn');
      const rc = b.getBoundingClientRect();
      return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2, exists: !!b };
    });
    if (rb.exists) {
      await page.mouse.click(rb.x, rb.y);
      await new Promise(r2 => setTimeout(r2, 400));
    }
    const modal = await page.evaluate(() => {
      const m = document.getElementById('confirm-modal');
      return { shown: m && m.style.display === 'flex', text: m ? m.textContent.slice(0, 60) : '' };
    });
    rec('P2 轮回二次确认弹窗出现（确认框含收益与重置说明）', modal.shown === true, modal.text);
    if (modal.shown) {
      await page.evaluate(() => document.getElementById('confirm-ok').click());
      await new Promise(r2 => setTimeout(r2, 500));
    }
    const after = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { echo: s.abyssEcho || 0, n: s.reincarned || 0 }; });
    rec('P2b 确认后轮回生效（回响 +1 次以上，次数 +1）', after.n >= 1 && after.echo > 0, JSON.stringify(after));
    await page.close();
  }
  // P3 宠物点击冒 ♥（字符，非 emoji 方块）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ pt: 100, pets: { blob: { icon: '🐙', name: '触须怪', level: 3, exp: 0, gen: 1 } }, activePets: ['blob'] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    const pr = await page.evaluate(() => {
      const el = document.querySelector('.pet-float .pet-item');
      const rc = el.getBoundingClientRect();
      return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2, exists: !!el };
    });
    if (pr.exists) {
      await page.mouse.click(pr.x, pr.y);
      await new Promise(r2 => setTimeout(r2, 300));
    }
    const heart = await page.evaluate(() => {
      const h = document.querySelector('.pet-heart');
      return h ? { text: h.textContent, color: getComputedStyle(h).color } : null;
    });
    rec('P3 宠物点击有反馈元素（v2.8.17 图标上浮 + 爱心浮标，非 emoji 方块）', heart !== null, heart ? heart.color : 'no heart');
    await page.close();
  }
  // P4 族升级并入研究点 tab
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 1000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-rp').click());
    await new Promise(r => setTimeout(r, 400));
    const out = await page.evaluate(() => {
      const fam = document.getElementById('family-upgrade-list');
      const shopHas = !!document.getElementById('tab-shop').querySelector('#family-upgrade-list');
      return { famInRp: !!fam && fam.textContent.length > 0, famInShop: shopHas };
    });
    rec('P4 族升级移入研究点 tab（商店不再显示）', out.famInRp === true && out.famInShop === false, JSON.stringify(out));
    await page.close();
  }
  // P5 命运的岔路口移入故事线 tab
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ crossroad: 'open', chapter: '5' }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-storyline').click());
    await new Promise(r => setTimeout(r, 400));
    const out = await page.evaluate(() => {
      const cr = document.getElementById('crossroad-list');
      const shopHas = !!document.getElementById('tab-shop').querySelector('#crossroad-list');
      return { inStory: !!cr && cr.textContent.includes('立誓'), inShop: shopHas };
    });
    rec('P5 岔路口移入故事线 tab（open 态显示立誓选项；商店移除）', out.inStory === true && out.inShop === false, JSON.stringify(out));
    await page.close();
  }
  // P6 离线升级 EP+RP 双消耗：EP 不足不可购，EP/RP 双满足可购
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 5e4, rp: 50 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-offline').click());
    await new Promise(r => setTimeout(r, 400));
    const cost = await page.evaluate(() => {
      const el = document.querySelector('#offline-upg-list [data-buy="off_eff1"] .cost');
      return el ? el.textContent : null;
    });
    const buy1 = await page.evaluate(() => {
      const el = document.querySelector('#offline-upg-list [data-buy="off_eff1"]');
      if (!el) return 'missing';
      el.click();
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { owned: !!s.offUpgrades && s.offUpgrades.off_eff1, ep: s.ep };
    });
    rec('P6 离线升级 EP+RP 双消耗显示（1e5 EP 门槛）且 EP 不足不可购', cost && cost.includes('EP') && buy1 !== 'missing' && buy1.owned === false, `cost=${cost} ep=${buy1.ep}`);
    // P6b：EP 充足时购买成功（扣 EP + RP）
    const pageB = await browser.newPage();
    await pageB.setViewport({ width: 1440, height: 900 });
    await pageB.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 1.1e5, rp: 50, upgrades: { storage: 50 } })); // storage 50 → cap ≈18M，1.1e5 注入不截断（留薪资消耗余量）
    await pageB.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await pageB.evaluate(() => document.getElementById('btn-offline').click());
    await new Promise(r => setTimeout(r, 400));
    const or = await pageB.evaluate(() => {
      const el = document.querySelector('#offline-upg-list [data-buy="off_eff1"]');
      const rc = el.getBoundingClientRect();
      return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 };
    });
    await pageB.mouse.click(or.x, or.y);
    await new Promise(r => setTimeout(r, 500));
    const after = await pageB.evaluate(() => { const s = JSON.parse(localStorage.getItem('abyss_idle_v2')); return { owned: !!s.offUpgrades && s.offUpgrades.off_eff1, ep: s.ep, rp: s.rp }; });
    rec('P6b EP 充足时购买成功（EP -1e5，RP 有产出浮动 ≤100）', after.owned === true && after.ep < 1e5 && after.rp <= 100, JSON.stringify(after));
    await pageB.close();
    await page.close();
  }
  // P7 探采平台与深渊商店并入遗物 tab
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ _riftSeen: true, dm: 100 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-relics').click());
    await new Promise(r => setTimeout(r, 500));
    const out = await page.evaluate(() => {
      const tab = document.getElementById('tab-relics');
      return {
        vehicle: !!tab.querySelector('#vehicle-shop') && tab.querySelector('#vehicle-shop').children.length > 0,
        dm: !!tab.querySelector('#dm-shop') && tab.querySelector('#dm-shop').textContent.length > 0,
        shopVeh: !!document.getElementById('tab-shop').querySelector('#vehicle-shop'),
      };
    });
    rec('P7 探采平台+深渊商店并入遗物 tab（商店移除探采区）', out.vehicle === true && out.dm === true && out.shopVeh === false, JSON.stringify(out));
    await page.close();
  }
  // P8 顶部轮回次数 + 悬停弹框（title）显示加成
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ reincarned: 2, abyssEcho: 40 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    const out = await page.evaluate(() => {
      const el = document.getElementById('h-reincarn');
      const st = document.getElementById('reincarn-stat');
      return { n: el ? el.textContent : null, shown: st ? st.style.display !== 'none' : false, title: st ? st.title : '' };
    });
    rec('P8 顶部轮回次数显示 + title 悬停加成（回响 40 ×5% = +200%）', out.n === '2' && out.shown === true && out.title.includes('+200%'), out.title);
    await page.close();
  }
} catch (e) {
  rec('浏览器链路异常', false, String(e).slice(0, 200));
  process.exitCode = 1;
}
function rec(name, ok, extra) {
  console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? ' :: ' + extra : ''));
}
try { await browser.close(); } catch {}
process.exit(process.exitCode || 0);
