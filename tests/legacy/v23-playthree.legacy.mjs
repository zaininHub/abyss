import { chromePath } from '../_chrome.mjs';
// v2.3.1 三路径真实试玩留证脚本
// 路径 1：新档链推进（v2.3.1 ⑤ 重写——「展开更多」已移除，改按 K=p+1 窗口语义留证：
//         首屏仅链首 1 项可见可购 → 真实点击攒 EP → 逐次购入观察窗口逐项推进、链提示
//         随 p 迁移到新链内下一项 → 全程无展开按钮、abyss_v2_expand 不回写）
// 路径 2：旧档（v2.2.1 SAVE_VERSION=5）全放行不回隐藏
// 路径 3：转生后顶栏资源保留
// 用法：node tests/v23-playthree.test.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const OUT = process.cwd() + '/../../artifacts/v23-play';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shot(page, name) {
  const p = path.join(OUT, name);
  return page.screenshot({ path: p, fullPage: false }).then(() => p);
}

async function clickByText(page, selector, text) {
  const handle = await page.evaluateHandle(
    (sel, t) => {
      const all = Array.from(document.querySelectorAll(sel));
      return all.find((el) => el.textContent && el.textContent.trim().includes(t));
    },
    selector,
    text
  );
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

// v2.3.1 ⑤：辅助断言——「展开更多」类交互已整节移除（应恒为 0 个）
async function countExpandButtons(page) {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter((b) => /展开.*[+\d]|更多|expand|more/i.test(b.textContent || ''));
    const moreBtns = document.querySelectorAll('.more-btn').length;
    return btns.length + moreBtns;
  });
}

// 辅助：当前商店可见条目名列表（用户视角）
function readShopItems(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#shop-list .item')).map((el) => ({
      name: (el.querySelector('.name') || {}).textContent || '',
    }))
  );
}

async function newSave(page) {
  await page.evaluateOnNewDocument(() => {
    try { localStorage.clear(); } catch (e) {}
  });
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    // ───── 路径 1：新档链推进（v2.3.1 ⑤ 重写：K=p+1 窗口语义） ─────
    console.log('[path-1] 新档链推进（K=p+1）');
    const p1 = await browser.newPage();
    p1.setDefaultTimeout(30000);
    await p1.setViewport({ width: 1280, height: 800 });
    await newSave(p1);
    await p1.goto(URL, { waitUntil: 'load' });
    await sleep(2000);
    await shot(p1, 'p1-01-newgame.png');
    // 首屏：商店可见未购项应为 1（仅链首草稿记录），无任何展开类按钮
    const firstItems = await readShopItems(p1);
    const firstExpandBtns = await countExpandButtons(p1);
    console.log(`[path-1] 首屏商店可见条目 = ${JSON.stringify(firstItems)}`);
    console.log(`[path-1] 首屏展开类按钮数 = ${firstExpandBtns}（⑤ 移除后应恒为 0）`);
    // 真实点击 hero 攒 EP（单次 +1，点击 40 次 ≥ 首项成本 10）
    await p1.evaluate(() => {
      const hero = document.getElementById('hero');
      for (let i = 0; i < 40; i++) hero.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(400);
    await shot(p1, 'p1-02-hero-clicks.png');
    // 逐次购入链内下一项，观察窗口 K=p+1 推进 + 链提示迁移
    for (let step = 1; step <= 3; step++) {
      const before = await readShopItems(p1);
      const bought = await p1.evaluate(() => {
        const el = Array.from(document.querySelectorAll('#shop-list .item')).find((e) => e.dataset && e.dataset.buy);
        if (el) { el.click(); return true; }
        return false;
      });
      await sleep(500);
      const after = await readShopItems(p1);
      const expandBtns = await countExpandButtons(p1);
      console.log(`[path-1] 第${step}次购入 ${bought ? '成功' : '失败'}：可见 ${before.length} → ${after.length} 项，展开按钮=${expandBtns}`);
      console.log(`[path-1]   购后条目 = ${JSON.stringify(after.map((i) => i.name))}`);
      await shot(p1, `p1-step${step}-after-buy.png`);
    }
    // 全程结束：无展开按钮、expand 键不回写
    const finalExpandBtns = await countExpandButtons(p1);
    const expandState = await p1.evaluate(() => localStorage.getItem('abyss_v2_expand'));
    console.log(`[path-1] 终态展开类按钮数 = ${finalExpandBtns}，abyss_v2_expand = ${expandState}（应恒为 null）`);
    await shot(p1, 'p1-final-window.png');
    await p1.close();

    // ───── 路径 2：旧档（v2.2.1 SAVE_VERSION=5）全放行不回隐藏 ─────
    console.log('[path-2] 旧档全放行');
    const p2 = await browser.newPage();
    p2.setDefaultTimeout(30000);
    await p2.setViewport({ width: 1280, height: 800 });
    await p2.evaluateOnNewDocument(() => {
      try {
        localStorage.clear();
        // 构造一个 SAVE_VERSION=5 的旧档：覆盖各类资源存量
        const old = {
          _version: 5,
          ep: 1e12, // 大数
          eps: 1e6,
          cps: 1000,
          totalClicks: 999,
          upgrades: { intern: 1, scribble: 10 },
          buildings: { eff1: 5, eff2: 3, res1: 4, plat1: 2 },
          storyline: { chapter: 3, log: ['旧档日志条目1', '旧档日志条目2'] },
          run: 10,
          tide: 5,
          // v2.2.1 还存在的字段
          rp: 0,
          prestigePoints: 0,
          es: 0,
          faith: 0,
          pt: 0,
          dm: 0,
        };
        localStorage.setItem('abyss_idle_v2', JSON.stringify(old));
      } catch (e) {}
    });
    await p2.goto(URL, { waitUntil: 'load' });
    await sleep(2500);
    await shot(p2, 'p2-01-oldsave-load.png');
    // 触发自动存档周期
    await sleep(5500);
    await shot(p2, 'p2-02-oldsave-stable.png');
    // 验证 _version 已迁移到 6（直写不过 discoverCheck 天然 0 弹窗）
    const newVer = await p2.evaluate(() => {
      const raw = localStorage.getItem('abyss_idle_v2');
      if (!raw) return null;
      try { return JSON.parse(raw)._version; } catch (e) { return -1; }
    });
    console.log(`[path-2] 加载后存档 _version = ${newVer}`);
    // 验证 resDiscovered 已正确回填：四常显 + 全 false（未触发新资源）
    const disc = await p2.evaluate(() => {
      const raw = localStorage.getItem('abyss_idle_v2');
      try { return JSON.parse(raw).resDiscovered; } catch (e) { return null; }
    });
    console.log(`[path-2] resDiscovered = ${JSON.stringify(disc)}`);
    // 旧档跑几分钟，验证不会因为发现 toast 而回隐藏
    await sleep(3000);
    await shot(p2, 'p2-03-oldsave-no-regression.png');
    await p2.close();

    // ───── 路径 3：转生后顶栏资源保留 ─────
    console.log('[path-3] 转生后顶栏资源保留');
    const p3 = await browser.newPage();
    p3.setDefaultTimeout(30000);
    await p3.setViewport({ width: 1280, height: 800 });
    await p3.evaluateOnNewDocument(() => {
      try {
        localStorage.clear();
        // 构造一个转生后状态：prestigePoints > 0, rp > 0, es > 0, faith > 0, pt > 0, dm > 0
        const s = {
          _version: 6,
          resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
          ep: 1e15,
          cps: 10000,
          prestigePoints: 50, // rank 解锁
          rp: 200, // rp 解锁
          es: 10, // es 解锁
          faith: 5, // faith 解锁
          pt: 3, // pt 解锁
          dm: 1, // dm 解锁
        };
        localStorage.setItem('abyss_idle_v2', JSON.stringify(s));
      } catch (e) {}
    });
    await p3.goto(URL, { waitUntil: 'load' });
    await sleep(2500);
    await shot(p3, 'p3-01-transcended-top.png');
    // 验证所有 9 个 stat div 都可见
    const visStats = await p3.evaluate(() => {
      const ids = ['h-rank','h-rp','h-es','h-faith','h-pt','h-dm','h-ep','h-cps','h-tide'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, visible: false, reason: 'not-found' };
        const parent = el.parentElement;
        const pe = parent ? getComputedStyle(parent).display : 'no-parent';
        const ee = getComputedStyle(el).display;
        return { id, visible: pe !== 'none' && ee !== 'none', parentDisplay: pe, elDisplay: ee };
      });
    });
    console.log('[path-3] 顶栏可见性:', JSON.stringify(visStats, null, 2));
    await sleep(1500);
    await shot(p3, 'p3-02-transcended-stable.png');
    await p3.close();

    console.log('=== 三路径试玩留证完成 ===');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});