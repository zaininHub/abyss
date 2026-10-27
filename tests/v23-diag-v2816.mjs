// ===== v2.8.16 三/四项反馈浏览器实测 =====
// ①零熵协议文案去版本号 ②Wiki 右上角 ③AI 管理核心持久化购买 + 锁定提示 ④全量 desc 版本号清理
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
  _version: 6, chapter: '1', storyline: 'default', ep: 3e6, rp: 200, es: 0, dm: 0,
  upgrades: { storage: 40 }, buildings: {}, tech: {}, ai: { autoUpgrade: true, timer: 4.9 }, milesDone: { 10000: true },
  cultists: [{ id: 1, name: 'T', output: 3, mood: '正常', moodTimer: 999 }], religion: { unlocked: false }, faith: 0,
  pets: {}, activePets: [], fusesDone: 0, familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 零熵协议 desc 无版本号
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 130, ep: 1e7, storyline: 'line_order' }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-storyline');
    await new Promise(r => setTimeout(r, 400));
    const t1 = await page.evaluate(() => {
      const body = document.body.textContent;
      const card = [...document.querySelectorAll('[data-sls]')].find(e => e.textContent.includes('零熵协议'));
      return { noVersion: !body.includes('v2.8.4：不再免疫') && !body.includes('v2.8.4'), desc: card ? card.textContent.replace(/\s+/g, ' ').slice(0, 80) : 'no card' };
    });
    rec('T1 零熵协议文案无版本号', t1.noVersion, t1.desc);
    await page.close();
  }

  // T2 Wiki 按钮右上角 fixed
  {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t2 = await page.evaluate(() => {
      const b = document.getElementById('btn-wiki');
      const sys = document.querySelector('.sys-btns');
      const cs = getComputedStyle(b);
      return { inSys: sys ? sys.contains(b) : false, noFixed: cs.position !== 'fixed', right: cs.right };
    });
    rec('T2 Wiki 按钮位于右上角按钮组（sys-btns 内、不再独立 fixed）', t2.inSys && t2.noFixed, JSON.stringify(t2)); // v2.8.17：并入右上角按钮组防挤占快照
    await page.close();
  }

  // T3 AI 管理核心：锁定提示（无里程碑）+ 可购持久化（有里程碑）
  {
    // T3a 无里程碑 → locked + title 提示
    const p1 = await browser.newPage();
    await p1.setViewport({ width: 1440, height: 900 });
    await p1.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ milesDone: {} }));
    await p1.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await p1.click('#btn-tech');
    await new Promise(r => setTimeout(r, 400));
    const t3a = await p1.evaluate(() => {
      const card = [...document.querySelectorAll('[data-tech]')].find(e => e.textContent.includes('AI 管理核心'));
      return { locked: card ? card.classList.contains('locked') : false, title: card ? card.title : '' };
    });
    rec('T3a 无 cps 里程碑 → ai_core 锁定 + title 提示条件', t3a.locked && t3a.title.includes('cps ≥ 1 万'), JSON.stringify(t3a));
    await p1.close();

    // T3b 有里程碑 → 点击购买 → 持久化 + AI 面板显示
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1440, height: 900 });
    await p2.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await p2.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await p2.click('#btn-tech');
    await new Promise(r => setTimeout(r, 400));
    await p2.evaluate(() => { const c = [...document.querySelectorAll('[data-tech]')].find(e => e.textContent.includes('AI 管理核心')); if (c) c.click(); });
    await new Promise(r => setTimeout(r, 6000)); // 后台节流下等足 tick
    const t3b = await p2.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const ai = document.getElementById('ai-panel');
      const aiCard = document.getElementById('ai-card');
      return { hasTech: !!s.tech.ai_core, rp: s.rp, aiPanel: ai ? ai.style.display : 'n/a', aiCardShown: aiCard ? aiCard.style.display : 'n/a' };
    });
    rec('T3b 购买 ai_core 即持久化（hasTech=true, RP 已扣）', t3b.hasTech && t3b.rp < 200, JSON.stringify(t3b));
    rec('T3c AI 面板解锁显示', t3b.aiPanel !== 'none' || t3b.aiCardShown !== 'none', JSON.stringify(t3b));
    await p2.close();
  }

  // T4 全量 desc 无版本号（仓库级静态断言）
  {
    const { readFileSync, readdirSync, statSync } = await import('fs');
    const walk = (d) => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const files = walk(join(__dirname, '../src')).filter(f => f.endsWith('.js'));
    let hits = [];
    for (const f of files) {
      const txt = readFileSync(f, 'utf-8');
      for (const line of txt.split('\n')) {
        const s = line.trim();
        if (s.startsWith('//') || s.startsWith('/*') || s.startsWith('*')) continue;
        if (/desc\s*[:=]\s*[`'\"][^`'\"]*v2\.[0-9]/.test(s)) hits.push(f.split('/').slice(-1)[0] + ': ' + s.slice(0, 80));
      }
    }
    rec('T4 desc 文案无版本号（src 全量）', hits.length === 0, hits.slice(0, 3).join(' | ') || 'clean');
  }
  console.log(`\n[v23-diag-v2816] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
