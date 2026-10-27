// ===== v2.8.14 五条反馈浏览器实测 =====
// ①科技树列宽与商店一致 ②暂停深入冻结 ③深入EP消耗3/s且不足停止奖励 ④晋升文案去设计说明 ⑤顶部产出/消耗来源明细
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
  _version: 6, chapter: '1', storyline: 'default', ep: 5e5, rp: 0, es: 0, dm: 0,
  upgrades: { storage: 32, scooter: 1 }, buildings: {}, tech: {}, ai: {}, milesDone: {}, cultists: [],
  religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
  familyUpgrades: {}, _lastActionAt: Date.now(), _easterEggsFound: {}, achievements: {},
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: true },
  unlockedBuildings: {}, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
}, extra));
const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
try {
  // T1 科技树列宽与 shop-grid 一致
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ rp: 200 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2200));
    await page.click('#btn-tech');
    await new Promise(r => setTimeout(r, 300));
    const t1 = await page.evaluate(() => {
      const tg = getComputedStyle(document.querySelector('.tech-grid'));
      const sg = getComputedStyle(document.querySelector('.shop-grid'));
      return { tech: tg.gridTemplateColumns, shop: sg.gridTemplateColumns };
    });
    const cols = t1.tech.split(' ').filter(Boolean).length;
    rec('T1 科技树 auto-fill 列宽生效（≥3 列且非固定 3 列）', cols >= 3 && !t1.tech.includes('repeat(3'), `${cols} 列`);
    await page.close();
  }

  // T2 暂停时深入裂隙冻结：暂停 → 显示「已暂停」+ until 不推进；恢复后继续
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ _riftSeen: true, riftsSealed: 1, riftExpedition: { until: Date.now() + 40000, level: 1, sealCost: 868, gainedDm: 5, gainedVs: 1 } }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await page.click('#pauseBtn');
    await new Promise(r => setTimeout(r, 300));
    const t2a = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const exp = document.getElementById('rift-exp-status');
      return { until: s.riftExpedition.until, text: exp ? exp.textContent : '', dm: s.riftExpedition.gainedDm || 0 };
    });
    await new Promise(r => setTimeout(r, 2000)); // 暂停 2s
    const t2b = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const exp = document.getElementById('rift-exp-status');
      return { until: s.riftExpedition.until, dm: s.riftExpedition.gainedDm || 0, text: exp ? exp.textContent : '' };
    });
    // 暂停期间 until 不变（冻结）+ 已获 DM 不变（结算停止）
    rec('T2 暂停时深入计时冻结（until 不变、产出冻结、显示「已暂停」）', t2a.until === t2b.until && t2a.dm === t2b.dm && t2a.text.includes('已暂停'), `until ${t2a.until}==${t2b.until} dm ${t2a.dm}`);
    // 恢复（暂停弹框的「恢复并结算」按钮——#pauseBtn 被 modal 遮挡，点击无效）
    await page.click('#pause-resume');
    await new Promise(r => setTimeout(r, 1500)); // 等后台节流 tick 渲染
    const t2c = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const exp = document.getElementById('rift-exp-status');
      return { until: s.riftExpedition.until, now: Date.now(), text: exp ? exp.textContent : '', paused: s.paused };
    });
    rec('T2b 恢复后继续计时（paused 解除、until 顺延剩余、显示剩余）', t2c.paused === false && Math.abs(t2c.until - t2c.now) > 20000 && t2c.text.includes('剩余'), `paused=${t2c.paused} until-now=${Math.round((t2c.until - t2c.now) / 1000)}s`);
    await page.close();
  }

  // T3 深入 EP 消耗 3/s + 不足停止奖励
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ upgrades: { storage: 32 }, _riftSeen: true, riftsSealed: 1, ep: 20, riftExpedition: { until: Date.now() + 40000, level: 1, sealCost: 868, gainedDm: 5, gainedVs: 1 } })); // 无载具/无线程产出——EP 只被深入消耗
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 8000)); // 3 EP/s → 20 EP ≈ 6.7s 耗尽
    const t3 = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      return { ep: s.ep, dm: s.dm || 0, gainedDm: s.riftExpedition ? s.riftExpedition.gainedDm : null, expedition: !!s.riftExpedition };
    });
    // EP 100 注入，深入 3/s/级 → ~2.5s 内耗尽（< 5s tick）→ 失败无奖励
    rec('T3 EP 不足深入失败（无奖励、探索中止）', t3.expedition === false && t3.gainedDm === null && t3.ep === 0, JSON.stringify(t3));
    await page.close();
  }

  // T4 晋升文案无设计说明
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, mkSave({ ep: 0 }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    await page.click('#btn-prestige');
    await new Promise(r => setTimeout(r, 400));
    const t4 = await page.evaluate(() => {
      const panel = document.querySelector('#prestige-panel, #tab-prestige, .tab-pane');
      const all = document.body.textContent;
      return {
        hasDesignNote: all.includes('未达标时按钮暗置'),
        hasCondition: all.includes('晋升条件：本局累计'),
      };
    });
    rec('T4 晋升文案无设计说明（仅「晋升条件：本局累计 ≥ X EP 换 1 PP」）', !t4.hasDesignNote && t4.hasCondition, JSON.stringify(t4));
    await page.close();
  }

  // T5 顶部产出/消耗 title 显示来源明细
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); },
      mkSave({ cultists: [{ id: 1, name: 'T', output: 2, mood: '正常', moodTimer: 999 }] }));
    await page.goto(BASE, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
    const t5 = await page.evaluate(() => {
      const cps = document.getElementById('h-cps');
      const sal = document.getElementById('h-salary');
      return { cpsTitle: cps.title, salTitle: sal.title, salVal: sal.textContent };
    });
    rec('T5 顶部产出 title 含来源明细（线程/基础/载具）', t5.cpsTitle.includes('来源') && (t5.cpsTitle.includes('线程') || t5.cpsTitle.includes('载具')), t5.cpsTitle);
    rec('T5b 顶部消耗 title 含来源明细（线程薪资/载具探采）', t5.salTitle.includes('线程薪资') && t5.salVal.includes('/s'), t5.salTitle);
    await page.close();
  }
  console.log(`\n[v23-diag-v2814] ${pass}/${pass + fail} 项通过`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('✗ 脚本异常:', e.message);
  process.exit(1);
}
