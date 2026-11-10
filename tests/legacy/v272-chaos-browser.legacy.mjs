import { chromePath } from '../_chrome.mjs';
// ===== v2.7.2 混沌心智场景：升级卡闪烁/点击丢失根治 + 晋升可点性（浏览器实测） =====
// 根因（v2.7.2 实锤）：tickAI 混沌分支无条件 return true → main 每 100ms 置 dirty.shop
// → renderShop 整面板每帧重建 → hover 卡被替换 → 闪烁 + click 丢失
// 修复：混沌分支仅实际买入才返回 true；AI 买入走单卡原地刷新（不整面板重建）；
// 仅自动招募才置 dirty.shop（线程区结构变化）
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../../dist/index.html');
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '5', storyline: 'line_abyss', ep: 20000, rp: 5, es: 0, dm: 0,
  upgrades: { storage: 2 }, buildings: {}, tech: { ai_core: true, chaos_born: true, chaos_mind: true }, ai: {}, milesDone: {},
  cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // C1 混沌心智开启：商店面板 8s 观察窗口零节点替换（修复前每 100ms 整面板重建）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 5000));
    const adds = await page.evaluate(() => new Promise(res => {
      const shop = document.getElementById('shop-list');
      let childAdds = 0;
      const mo = new MutationObserver(ms => { for (const m of ms) if (m.type === 'childList') childAdds += m.addedNodes.length; });
      mo.observe(shop, { childList: true, subtree: true });
      setTimeout(() => { mo.disconnect(); res(childAdds); }, 8000);
    }));
    rec('C1 混沌心智开启：8s 观察窗口无整面板重建（初始渲染 ≤2 次，v2.8.27）', adds <= 2, `adds=${adds}`);
    await page.close();
  }
  // C2 混沌心智开启：真实鼠标连续点击最便宜未拥有升级 8 次，全部购买落盘
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 5000));
    const t = await page.evaluate(() => {
      const el = document.querySelector('#shop-list .item[data-buy]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { id: el.dataset.buy, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    let ok = 0;
    if (t) {
      for (let i = 0; i < 8; i++) {
        await page.mouse.move(t.x, t.y);
        await new Promise(r => setTimeout(r, 120));
        await page.mouse.click(t.x, t.y);
        await new Promise(r => setTimeout(r, 200));
        const owned = await page.evaluate(id => JSON.parse(localStorage.getItem('abyss_idle_v2')).upgrades?.[id] > 0, t.id);
        if (owned) ok++;
      }
    }
    rec('C2 混沌心智开启：真实鼠标连点 8 次全部购买落盘', ok === 8, `ok=${ok}/8`);
    await page.close();
  }
  // C3 混沌心智开启：晋升达标档全链路（按钮→模态→选天赋→转生落盘）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ runEarned: 9e9 })); // v2.8.27：首升阈值 3e9，9e9 → 2PP
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 3000));
    await page.click('#btn-prestige');
    await new Promise(r => setTimeout(r, 400));
    const b = await page.evaluate(() => {
      const btn = document.getElementById('prestige-btn');
      if (!btn) return null;
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      return { disabled: btn.disabled, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    let out = { disabled: b && b.disabled };
    if (b && !b.disabled) {
      await page.mouse.click(b.x, b.y);
      await new Promise(r => setTimeout(r, 400));
      out.modal = await page.evaluate(() => { const m = document.getElementById('talent-modal'); return m ? getComputedStyle(m).display : 'no-el'; });
      if (out.modal === 'flex') {
        const opt = await page.evaluate(() => {
          const o = document.querySelector('#talent-modal .talent-option');
          if (!o) return null;
          const r = o.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (opt) { await page.mouse.click(opt.x, opt.y); await new Promise(r => setTimeout(r, 500)); }
      }
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
      out.runEarned = s.runEarned; out.prestige = s.prestige; out.pp = s.prestigePoints;
    }
    rec('C3 混沌心智开启：晋升达标可点 + 全链路转生落盘（runEarned 清零/PP+2/prestige+1）',
      out.modal === 'flex' && out.runEarned === 0 && out.pp === 2 && out.prestige === 1, JSON.stringify(out));
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
