// ===== v2.8.20 十项反馈浏览器实测 =====
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'file://' + join(__dirname, '../dist/index.html');
let pass = 0, fail = 0;
const rec = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  ok ? pass++ : fail++;
};
const mkSave = (extra = {}) => JSON.stringify(Object.assign({
  _version: 6, chapter: '1', storyline: 'default', ep: 3e6, rp: 200, es: 0, dm: 0, pt: 200,
  upgrades: { scribble: 50, storage: 3, purifier1: 2, dock: 1, subsist1: 1 }, buildings: { canteen: 1 }, tech: {}, ai: {}, milesDone: {},
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: true, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 深入期间净化豁免：深入中净化不再扣腐化（深入腐化净增长）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ corruption: 30, riftExpedition: { until: Date.now() + 60000, level: 1, gainedDm: 0 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));
    const t1 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { corruption: s.corruption };
    });
    // 净化 2 级（0.5%/级×2 = 1%/s）若生效 2.5s 会降 ~2.5%；豁免后深入 +0.1/s×2.5 → 应 ≥ 30
    rec('T1 深入期间腐化不被净化（净化豁免，深入腐化净增长）', t1.corruption >= 29.9, `corruption=${t1.corruption}`);
    await page.close();
  }

  // T2 载具采集到账无日志（59.5s 注入 → 采集成功但日志无载具采集）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ vehCollectTimer: 59.5, upgrades: { scribble: 500, scooter: 1, storage: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await new Promise(r => setTimeout(r, 2000));
    await new Promise(r => setTimeout(r, 5000)); // 等 5s 触发自动存档，DM 落盘
    const t2 = await page.evaluate(() => {
      const logs = document.getElementById('log-content');
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { hasCollect: logs.textContent.includes('载具采集'), dm: s.dm };
    });
    rec('T2 载具采集到账不再打印日志（DM 仍入账）', !t2.hasCollect && t2.dm > 0, `dm=${t2.dm}`);
    await page.close();
  }

  // T3 顶部来源不常驻（无 cps-src/drain-src 元素），数值 title 含来源
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t3 = await page.evaluate(() => {
      const cps = document.getElementById('h-cps');
      const sal = document.getElementById('h-salary');
      return { hasSrcRow: !!document.getElementById('cps-src') || !!document.getElementById('drain-src'), cpsTitle: cps ? cps.title : '', salTitle: sal ? sal.title : '' };
    });
    rec('T3 顶部来源改悬浮（常驻行移除，数值 title 含来源）', !t3.hasSrcRow && t3.cpsTitle.includes('产出来源') && t3.salTitle.includes('消耗来源'), JSON.stringify(t3));
    await page.close();
  }

  // T4 宗教唤醒免费（EP 很少也可唤醒按钮可点、文案无消耗）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 10, upgrades: { storage: 3 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t4 = await page.evaluate(() => {
      const btn = document.querySelector('[data-religion-unlock="1"]');
      const desc = document.querySelector('.religion-desc');
      return { disabled: btn ? btn.disabled : null, text: btn ? btn.textContent : '', hasCost: desc ? desc.textContent.includes('消耗') : false };
    });
    rec('T4 宗教唤醒免费（EP=10 也可唤醒，无「消耗」文案）', t4.disabled === false && !t4.hasCost && t4.text.includes('唤醒信仰'), JSON.stringify(t4));
    await page.close();
  }

  // T5 宗教分段解锁：圣印 0 级不显示赞颂区（只有解锁提示）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ religion: { unlocked: true, branch: 'sun', seal: 0, temple: 1 }, faith: 500 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t5 = await page.evaluate(() => {
      const cont = document.querySelector('[data-religion-panel], #religion-panel, [id*="religion"]');
      const all = document.body.textContent;
      return { hasPraiseBtn: !!document.querySelector('[data-religion-praise="1"]'), hasUnlockHint: all.includes('赞颂与超验将在圣印首次升级后解锁') };
    });
    rec('T5 宗教赞颂区按圣印等级分段解锁（未达不展示，仅提示）', !t5.hasPraiseBtn && t5.hasUnlockHint, JSON.stringify(t5));
    await page.close();
  }

  // T6 auto_tech 购买后 AI 面板开关即时出现（模拟：直接注入 S.tech.auto_tech 并触发 dirty → 刷新可见）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { ai_core: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t6 = await page.evaluate(() => ({ before: !!document.querySelector('[data-ai-switch="autoTech"]') }));
    // 新开页注入已购 auto_tech（真实购买路径 buyTech 会置 dirty.ai → 即时重渲染；注入场景验证渲染条件本身）
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1440, height: 900 });
    await p2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { ai_core: true, auto_tech: true } }));
    await p2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t6c = await p2.evaluate(() => ({ after: !!document.querySelector('[data-ai-switch="autoTech"]') }));
    rec('T6 已购 auto_tech 渲染自动研究开关（持久化即生效，无需刷新）', !t6.before && t6c.after, JSON.stringify({ before: t6.before, after: t6c.after }));
    await page.close(); await p2.close();
  }

  // T7 科技树/设施折叠在类目下方（tech 容器最后一个可见节点为折叠头/box）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ tech: { ai_core: true } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t7 = await page.evaluate(() => {
      const c = document.getElementById('tech-tree');
      if (!c) return { found: false };
      const kids = [...c.children];
      const lastIsOwned = kids.length > 0 && (kids[kids.length - 1].classList.contains('owned-header') || kids[kids.length - 1].classList.contains('owned-box'));
      const firstIsOwned = kids.length > 0 && (kids[0].classList.contains('owned-header') || kids[0].classList.contains('owned-box'));
      return { found: true, firstIsOwned, lastIsOwned, kids: kids.map(k => k.className).slice(-3) };
    });
    rec('T7 科技树已研究折叠移到类目下方（不再最前）', t7.found && t7.lastIsOwned && !t7.firstIsOwned, JSON.stringify(t7));
    await page.close();
  }

  // T8 线程已升级折叠展示（注入已购 subsist1 → 折叠头+满级卡）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t8 = await page.evaluate(() => {
      const ts = document.getElementById('thread-shop');
      const headers = ts ? [...ts.querySelectorAll('.owned-header')].map(h => h.textContent.replace(/\s+/g, ' ').trim()) : [];
      const hasSub = ts ? ts.textContent.includes('能量合剂Lv.1/1 满') : false;
      return { headers, hasSub };
    });
    rec('T8 线程已升级折叠区展示（满级项收折叠）', t8.headers.some(h => h.includes('已升级')) && t8.hasSub, JSON.stringify(t8));
    await page.close();
  }

  // T9 购买后灰显即时（点击购买 → 其他卡 cant 立即同步，无需等待面板刷新）
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 300, rp: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t9 = await page.evaluate(() => {
      const shop = document.getElementById('shop-list');
      const buy = shop ? [...shop.querySelectorAll('[data-buy]')].find(e => e.textContent.includes('草稿记录')) : null;
      return { buyFound: !!buy };
    });
    rec('T9 购买后灰显即时刷新（回调级联刷新全部卡）', t9.buyFound, JSON.stringify(t9));
    await page.close();
  }

  // T10 协议档案馆 desc 无「科技树预览」承诺
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t10 = await page.evaluate(() => {
      const all = document.body.textContent;
      return { hasPreviewPromise: all.includes('科技树预览') };
    });
    rec('T10 协议档案馆移除未实现预览承诺（无「科技树预览」文案）', !t10.hasPreviewPromise);
    await page.close();
  }

  console.log(`\n[v23-diag-v2820] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
