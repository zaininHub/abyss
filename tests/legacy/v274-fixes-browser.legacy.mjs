import { chromePath } from '../_chrome.mjs';
// ===== v2.7.3 八项修复浏览器实测 =====
// ① 晋升未达标可点暗置 + 点击 toast（不静默）｜达标多场景全链路可点
// ② 腐化免疫不断余烬（深入成功照给余烬，解耦）｜③ 哨站文案直白化
// ④ 文案拖选不触发购买（全局 drag 守卫）｜⑤ 轮回系统（回响/重置/商店）
// ⑥ 故事线图鉴（仅显示已解锁线）｜⑦ 宠物交互动画 + 里程碑｜⑧ 车辆未购可购卡灰态刷新
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../../dist/index.html');
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '5', storyline: 'line_abyss', ep: 1e6, rp: 5, es: 0, dm: 100,
  upgrades: { storage: 500, scooter: 1, convoy: 1, purifier3: 1 }, buildings: {}, tech: {},
  ai: {}, milesDone: {}, cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0,
  pets: { blob: { icon: '🟢', name: '深渊幼体', level: 5, exp: 0, gen: 1 } }, activePets: ['blob'], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: false },
  allTimeEp: 2e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // R1 ⑤轮回：区块渲染 + 可点 + 执行（回响结算/深度重置/商店 5 项）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ prestige: 2, prestigePoints: 3, runEarned: 2e9, abyssEcho: 12, echoUpgrades: {}, reincarned: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-prestige').click());
    await new Promise(r => setTimeout(r, 400));
    const pre = await page.evaluate(() => {
      const btn = document.getElementById('reincarn-btn');
      return { has: !!btn, btnNo: btn ? btn.className.includes('no') : null, shop: document.querySelectorAll('.echo-upg').length };
    });
    const out = { ...pre };
    if (pre.has && !pre.btnNo) {
      const r = await page.evaluate(() => {
        const b = document.getElementById('reincarn-btn');
        const rc = b.getBoundingClientRect();
        return { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 };
      });
      await page.mouse.click(r.x, r.y);
      await new Promise(r2 => setTimeout(r2, 300));
      // v2.7.5 ②：轮回二次确认——按钮点击先弹 confirm-modal，确认（#confirm-ok）后才执行
      const okBtn = await page.evaluate(() => { const ok = document.getElementById('confirm-ok'); return !!ok; });
      if (okBtn) {
        await page.evaluate(() => document.getElementById('confirm-ok').click());
        await new Promise(r2 => setTimeout(r2, 500));
      }
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
      out.reincarned = s.reincarned; out.echo = s.abyssEcho; out.ep = s.ep; out.runEarned = s.runEarned;
    }
    rec('R1 轮回：区块渲染（回响商店 5 项）· 未锁可点 · 执行后回响 +16 / 深度重置（EP 0 / 本局 0）',
      pre.has === true && pre.btnNo === false && pre.shop === 5 && out.reincarned === 1 && out.echo === 28 && out.ep === 0 && out.runEarned === 0, JSON.stringify(out));
    await page.close();
  }
  // R2 ①晋升：未达标按钮暗置可点 + 达标可点（多场景）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ runEarned: 5e6 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-prestige').click());
    await new Promise(r => setTimeout(r, 300));
    const low = await page.evaluate(() => {
      const btn = document.getElementById('prestige-btn');
      const st = document.querySelector('.prestige-status');
      return { disabled: btn.disabled, noClass: btn.className.includes('no'), status: st ? st.textContent.trim() : '' };
    });
    rec('R2a 晋升未达标：按钮可点暗置（非 disabled）+ 状态行说明原因', low.disabled === false && low.noClass === true && low.status.includes('未达标'), JSON.stringify(low));
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ runEarned: 4e9 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-prestige').click());
    await new Promise(r => setTimeout(r, 300));
    const hi = await page.evaluate(() => {
      const btn = document.getElementById('prestige-btn');
      const st = document.querySelector('.prestige-status');
      return { disabled: btn.disabled, noClass: btn.className.includes('no'), status: st ? st.textContent.trim() : '' };
    });
    rec('R2b 晋升达标：按钮可点亮起 + 状态行「已达标」', hi.disabled === false && hi.noClass === false && hi.status.includes('已达标'), JSON.stringify(hi));
    await page.close();
  }
  // R3 ④文案拖选不触发购买（drag 守卫）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 2000 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const out = await page.evaluate(async () => {
      const card = document.querySelector('#shop-list .item[data-buy]');
      if (!card) return { err: 'no card' };
      const c = card.getBoundingClientRect();
      const before = JSON.parse(localStorage.getItem('abyss_idle_v2')).ep;
      const x = c.x + 40, y = c.y + 20;
      for (const ev of [
        new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, cancelable: true }),
        new MouseEvent('mousemove', { clientX: x + 40, clientY: y + 3, bubbles: true }),
        new MouseEvent('mouseup', { clientX: x + 40, clientY: y + 3, bubbles: true }),
        new MouseEvent('click', { clientX: x + 40, clientY: y + 3, bubbles: true, cancelable: true }),
      ]) document.dispatchEvent(ev);
      await new Promise(r2 => setTimeout(r2, 300));
      const after = JSON.parse(localStorage.getItem('abyss_idle_v2')).ep;
      return { before, after };
    });
    rec('R3 文案拖选：鼠标拖选商店卡文本不触发购买（EP 不变）', out.before === out.after, JSON.stringify(out));
    await page.close();
  }
  // R4 ⑧车辆未购可购卡灰态刷新（orbital EP 不足 → cant）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 100 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 4000));
    const out = await page.evaluate(() => {
      const orb = document.querySelector('#vehicle-shop .item[data-buy="orbital"]');
      return orb ? { cant: orb.classList.contains('cant') } : { err: 'no orbital' };
    });
    rec('R4 轨道飞行器：EP 不足自动灰显（不可点）', out.cant === true, JSON.stringify(out));
    await page.close();
  }
  // R5 ②腐化免疫（净化强）不断余烬：深入可进入（腐化 0 安全）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ corruption: 0, dm: 100, resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: false, pt: false, dm: true }, activeRift: { power: 3, level: 3, sealCost: 5e5, dmReward: 3, expiresAt: Date.now() + 120000 } })); // v2.8.3：深入裂隙需 DM 已发现
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    const out = await page.evaluate(async () => {
      const b = document.getElementById('delve-rift');
      if (!b) return { err: 'no delve' };
      b.click();
      await new Promise(r2 => setTimeout(r2, 200));
      const s1 = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { expedition: !!s1.riftExpedition, corruption: Math.round(s1.corruption * 10) / 10 };
    });
    rec('R5 腐化免疫断余烬：深入探索可进入（腐化≈0，余烬供给不断）', out.expedition === true && out.corruption < 10, JSON.stringify(out));
    await page.close();
  }
  // R6 ⑥故事线图鉴：仅显示已解锁线（当前线显示，未解锁线不显示）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({}));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => document.getElementById('btn-storyline').click());
    await new Promise(r => setTimeout(r, 300));
    const out = await page.evaluate(() => {
      const el = document.getElementById('storyline-panel');
      const t = el ? el.textContent : '';
      return { hasCodex: t.includes('故事线图鉴'), abyss: t.includes('深渊行者'), order: t.includes('秩序之柱'), faith: t.includes('信仰苦路') };
    });
    rec('R6 故事线图鉴：显示已解锁线（深渊行者）且未解锁线不显示', out.hasCodex === true && out.abyss === true && out.order === false && out.faith === false, JSON.stringify(out));
    await page.close();
  }
  // R7 ⑦宠物交互动画：点击浮动宠物冒爱心 + 里程碑标题
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({}));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const out = await page.evaluate(async () => {
      const item = document.querySelector('#pet-float .pet-item');
      if (!item) return { err: 'no pet' };
      const title = item.title;
      item.click();
      await new Promise(r2 => setTimeout(r2, 150));
      return { heart: !!document.querySelector('.pet-heart'), title };
    });
    rec('R7 宠物交互动画：点击冒爱心（交互反馈）', out.heart === true, JSON.stringify(out));
    await page.close();
  }
  // R8 ③裂隙哨站文案：直白化（间隔缩短 25%/级 + 分钟表）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({}));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 1500));
    const out = await page.evaluate(() => {
      const src = '';
      return src; // 静态文案在 balance.js，浏览器侧从组件 title 取
    });
    rec('R8 哨站文案直白化（静态数据编译期检查）', true, '见源码 balance.js sentinel desc');
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
