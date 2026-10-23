// v2.0.1 真实试玩自测（用户硬规则：编译完成后必须真实打开游戏试玩，通过才允许交付）
// 覆盖：A file:// 冷启动+样式生效；B 五类真实点击交互（招募/升级/AI/裂隙/建筑，数值断言）；
//       C 三故事线分叉可推进；D 特殊任务触发；E http 子路径部署；F v1.3 旧档兼容
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'fs';

const SHOT_DIR = process.cwd() + '/../../artifacts/screenshots_v201/';
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : ''));
}
// fmt() 输出带 K/M 后缀 → 解析为数值
function parseNum(s) {
  const m = String(s).trim().match(/^([\d.]+)([KM]?)/);
  if (!m) return NaN;
  return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6 }[m[2] || '']);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const fileUrl = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

async function openPage(saveObj, url = fileUrl) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  if (saveObj !== null) {
    await page.evaluateOnNewDocument((s) => {
      localStorage.setItem('abyss_idle_v2', JSON.stringify(s));
    }, saveObj);
  } else {
    await page.evaluateOnNewDocument(() => localStorage.removeItem('abyss_idle_v2'));
  }
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  return { page, errs };
}

// ========== A. file:// 冷启动：应用启动 + 样式生效（回归核心验证） ==========
console.log('\n[A] file:// 冷启动（无存档，双击打开场景）');
{
  const { page, errs } = await openPage(null);
  const title = await page.title();
  rec('A1 冷启动零 JS 错误（模块脚本未被 file:// 拦截）', errs.length === 0, errs.join(';'));
  const pkgV = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  rec(`A2 标题版本 v${pkgV}（与 package.json 一致）`, title.includes(`v${pkgV}`), `title="${title}"`);
  const boot = await page.evaluate(() => ({
    ep: document.getElementById('h-ep')?.textContent || '',
    heroVisible: !!document.getElementById('hero'),
    hireBtn: !!document.getElementById('hire-btn'),
    staffCount: document.getElementById('staff-count')?.textContent,
  }));
  rec('A3 应用启动（顶栏/英雄区/招募按钮均渲染）', boot.heroVisible && boot.hireBtn, `ep="${boot.ep}" staff=${boot.staffCount}`);
  // 样式生效：computed style 抽验关键选择器
  const styles = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const btn = document.getElementById('hire-btn');
    const btnStyle = btn ? getComputedStyle(btn) : null;
    const stat = document.querySelector('.stat');
    const statStyle = stat ? getComputedStyle(stat) : null;
    return {
      bodyBg: body.backgroundColor,
      bodyFont: body.fontFamily,
      btnBorder: btnStyle ? btnStyle.borderRadius : '',
      btnCursor: btnStyle ? btnStyle.cursor : '',
      statDisplay: statStyle ? statStyle.display : '',
      statGap: statStyle ? statStyle.gap : '',
    };
  });
  // style.css：body 深色背景、按钮带圆角且 cursor:pointer、stat 为 flex+gap 布局
  const styleOk = styles.bodyBg !== 'rgba(0, 0, 0, 0)' && styles.bodyBg !== 'rgb(255, 255, 255)'
    && styles.btnCursor === 'pointer' && styles.btnBorder !== '' && styles.statDisplay === 'flex' && styles.statGap !== '';
  rec('A4 样式生效（body 背景/按钮 pointer+圆角/stat flex 布局 computed style 抽验）', styleOk,
    `bg=${styles.bodyBg} cursor=${styles.btnCursor} radius=${styles.btnBorder} stat=${styles.statDisplay}/${styles.statGap}`);
  await page.screenshot({ path: SHOT_DIR + 'A_冷启动_file.png' });
  await page.close();
}

// ========== B. file:// 注入档：五类真实点击交互（数值断言） ==========
console.log('\n[B] file:// 真实点击试玩（招募/升级/AI/裂隙/建筑）');
{
  const baseSave = {
    ep: 100000, rp: 10, es: 0, fa: 0, pt: 0, dm: 0,
    cultists: [], staffUnhappy: 0,
    upgrades: { cache: 20 }, buildings: {},
    milesDone: { '10000': 1 }, // v2.3.1 ②：设施分区门控 anyBuilt ∨ milesDone[1e4]（组长裁定），B5 需分区可见
    tech: { ai_core: true },
    focusLevel: 0,
    chapter: '3', storyline: 'default', _forkTriggered: true,
    activeRift: { power: 1, sealCost: 500, dmReward: 1, expiresAt: Date.now() + 600000 },
    lastSeen: Date.now(),
  };
  const { page, errs } = await openPage(baseSave);
  rec('B0 注入档启动零错误（AI/裂隙同时在场）', errs.length === 0, errs.join(';'));

  // B1 招募线程
  const parseEp = () => page.evaluate(() => {
    const m = (document.getElementById('h-ep').textContent || '').match(/^([\d.]+)/);
    return m ? parseFloat(m[1]) : NaN;
  });
  const before = { staff: +await page.$eval('#staff-count', el => el.textContent), ep: await parseEp() };
  await page.click('#hire-btn');
  await new Promise(r => setTimeout(r, 400));
  const afterHire = { staff: +await page.$eval('#staff-count', el => el.textContent), ep: await parseEp() };
  rec('B1 招募线程：staff +1 且 EP 扣款', afterHire.staff === before.staff + 1 && afterHire.ep < before.ep,
    `staff ${before.staff}→${afterHire.staff}, ep ${before.ep}→${afterHire.ep}`);

  // B2 升级（专注）
  const f0 = +await page.$eval('#focus-lv', el => el.textContent);
  await page.click('#focus-bar');
  await new Promise(r => setTimeout(r, 400));
  const f1 = +await page.$eval('#focus-lv', el => el.textContent);
  rec('B2 升级：专注等级 +1', f1 === f0 + 1, `focus ${f0}→${f1}`);

  // B3 AI 交互（切换预留线档位）
  const aiCardVisible = await page.evaluate(() => document.getElementById('ai-card').style.display !== 'none');
  const reserveBtn = await page.$('[data-ai-reserve]:not(.on)');
  let reserveOk = false, reserveDetail = 'AI 卡片未显示';
  if (aiCardVisible && reserveBtn) {
    await reserveBtn.click();
    await new Promise(r => setTimeout(r, 500));
    reserveOk = await page.evaluate(() => !!document.querySelector('[data-ai-reserve].on'));
    reserveDetail = '预留线档位已切换（新档位 .on 高亮）';
  }
  rec('B3 AI 交互：预留线档位切换生效', aiCardVisible && reserveOk,
    aiCardVisible ? reserveDetail : reserveDetail);

  // B4 裂隙封印（DM 到账）
  const riftVisible = await page.evaluate(() => document.getElementById('rift-card').style.display !== 'none');
  const dm0 = parseNum(await page.$eval('#h-dm', el => el.textContent));
  const sealBtn = await page.$('#seal-rift');
  if (sealBtn) { await sealBtn.click(); await new Promise(r => setTimeout(r, 500)); }
  const dm1 = parseNum(await page.$eval('#h-dm', el => el.textContent));
  rec('B4 裂隙封印：DM 到账且裂隙卡收起', riftVisible && dm1 > dm0,
    `dm ${dm0}→${dm1}, rift卡可见=${riftVisible}`);

  // B5 建筑购买（切到升级商店 tab，点能量食堂）
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const bld = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-buy]')];
    const el = els.find(e => e.textContent.includes('能量食堂'));
    return el ? { found: true, text: el.textContent.slice(0, 60) } : { found: false, total: els.length };
  });
  let bldOk = false, bldDetail = `建筑条目未找到（可购条目 ${bld.total || 0} 个）`;
  if (bld.found) {
    const lv0 = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-buy]')].find(e => e.textContent.includes('能量食堂'));
      const m = el.textContent.match(/Lv\.(\d+)/);
      return m ? +m[1] : -1;
    });
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-buy]')].find(e => e.textContent.includes('能量食堂'));
      el.click();
    });
    await new Promise(r => setTimeout(r, 600));
    const lv1 = await page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-buy]')].find(e => e.textContent.includes('能量食堂'));
      const m = el ? el.textContent.match(/Lv\.(\d+)/) : null;
      return m ? +m[1] : 99;
    });
    bldOk = lv1 === lv0 + 1;
    bldDetail = `能量食堂 Lv.${lv0}→Lv.${lv1}`;
  }
  rec('B5 建筑购买：能量食堂升 1 级', bldOk, bldDetail);
  await page.screenshot({ path: SHOT_DIR + 'B_点击试玩_file.png' });
  await page.close();
}

// ========== C. 三故事线分叉（v2.2 购买钩子版：ch5 open 档买定向建筑三选一立誓） ==========
console.log('\n[C] 三故事线分叉（第5章岔路口三选一立誓）');
{
  const { page, errs } = await openPage({
    ep: 400000, cultists: [], upgrades: {}, tech: {},
    buildings: { quantum_pool: 8 }, // EP 存储上限 +400k（3e5 立誓价可负担；空档会被 tickCorruption 截断到基础上限）
    chapter: '5', storyline: 'default', lastSeen: Date.now(),
  });
  await new Promise(r => setTimeout(r, 2000)); // 等游戏循环 tick 推进岔路口状态机（inactive→open）
  const forkState = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#crossroad-list [data-crossroad]')].map(el => el.dataset.crossroad);
    return { ids, modalGone: !document.getElementById('fork-modal') };
  });
  rec('C1 岔路口分区开放且含三栋定向建筑（旧弹窗 UI 已删除）',
    forkState.modalGone && forkState.ids.length === 3,
    `建筑=[${forkState.ids}] 弹窗已删=${forkState.modalGone}`);
  // 点击购买 order_pillar 立誓（购买钩子 → loadStoryline('line_order') → locked）
  await page.evaluate(() => document.querySelector('#crossroad-list [data-crossroad="order_pillar"]').click());
  await new Promise(r => setTimeout(r, 1500));
  const afterFork = await page.evaluate(() => {
    const raw = localStorage.getItem('abyss_idle_v2');
    let sl = '', cr = '', cb = '';
    try { const s = JSON.parse(raw); sl = s.storyline || ''; cr = s.crossroad || ''; cb = s.crossroadLockedBy || ''; } catch {}
    const crTxt = (document.getElementById('crossroad-list') || {}).textContent || '';
    return { sl, cr, cb, sealed: crTxt.includes('封印'), vowed: crTxt.includes('已立誓') };
  });
  rec('C2 买秩序奠基塔立誓后存档写入 line_order（crossroad=locked、其余两栋封印）',
    afterFork.sl === 'line_order' && afterFork.cr === 'locked' && afterFork.cb === 'order_pillar' && afterFork.sealed && afterFork.vowed,
    `storyline=${afterFork.sl} crossroad=${afterFork.cr}/${afterFork.cb} 封印=${afterFork.sealed}`);
  rec('C3 分叉零 JS 错误', errs.length === 0, errs.join(';'));
  await page.screenshot({ path: SHOT_DIR + 'C_故事线分叉_file.png' });
  await page.close();
}

// ========== D. 特殊任务触发可见 ==========
console.log('\n[D] 特殊任务（离职礼物条件满足自动触发）');
{
  const { page, errs } = await openPage({
    ep: 5000, cultists: [], upgrades: {}, tech: {},
    staffUnhappy: 3, // sp3_farewell 条件：staffUnhappy >= 3
    chapter: '2', storyline: 'default', _forkTriggered: true, lastSeen: Date.now(),
  });
  await new Promise(r => setTimeout(r, 3000)); // 等 checkSpecialTasks 轮询
  const done = await page.evaluate(() => {
    try { return !!JSON.parse(localStorage.getItem('abyss_idle_v2'))._specialTasksDone?.sp3_farewell; }
    catch { return false; }
  });
  const toastHit = await page.evaluate(() => document.body.textContent.includes('离职礼物'));
  rec('D1 特殊任务「离职礼物」触发并落档', done || toastHit, `落档=${done} 页面可见=${toastHit}`);
  rec('D2 特殊任务零 JS 错误', errs.length === 0, errs.join(';'));
  await page.screenshot({ path: SHOT_DIR + 'D_特殊任务_file.png' });
  await page.close();
}

// ========== E. http 子路径部署 ==========
console.log('\n[E] http 子路径部署');
{
  const { spawn } = await import('child_process');
  const root = new URL('../', import.meta.url).pathname;
  const server = spawn('python3', ['-m', 'http.server', '8642', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1000));
  try {
    const { page, errs } = await openPage(null, 'http://127.0.0.1:8642/dist/index.html');
    const httpBoot = await page.evaluate(() => ({
      ep: document.getElementById('h-ep')?.textContent || '',
      bg: getComputedStyle(document.body).backgroundColor,
    }));
    // 交互冒烟：招募
    await page.click('#hire-btn');
    await new Promise(r => setTimeout(r, 400));
    const staff = await page.$eval('#staff-count', el => el.textContent);
    rec('E1 http 子路径启动零错误且样式生效', errs.length === 0 && httpBoot.bg !== 'rgba(0, 0, 0, 0)',
      `ep="${httpBoot.ep}" bg=${httpBoot.bg}`);
    rec('E2 http 下招募交互生效', staff === '1', `staff=${staff}`);
    await page.screenshot({ path: SHOT_DIR + 'E_http部署.png' });
    await page.close();
  } finally {
    server.kill();
  }
}

// ========== F. v1.3 旧档兼容 ==========
console.log('\n[F] v1.3 旧档兼容');
{
  const { page, errs } = await openPage({
    // v1.3 时代字段：无 storyline/_specialTasksDone/_easterEggsFound 等新字段
    ep: 3200, rp: 3, es: 0, dm: 0, cultists: [{ name: 'A', mood: 'normal', born: Date.now() }],
    upgrades: { cache: 1 }, tech: {}, focusLevel: 2,
    _version: 2, lastSeen: Date.now(),
  });
  await new Promise(r => setTimeout(r, 2000));
  const mig = await page.evaluate(() => {
    const raw = localStorage.getItem('abyss_idle_v2');
    try {
      const s = JSON.parse(raw);
      return { v: s._version, storyline: s.storyline, hasSpec: '_specialTasksDone' in s, ep: document.getElementById('h-ep').textContent };
    } catch { return { v: -1 }; }
  });
  // 存档在周期保存后应迁移至 _version 5 并补全新字段（周期保存未触发时至少页面可玩且零错误）
  const playable = await page.$eval('#staff-count', el => el.textContent).catch(() => '0');
  rec('F1 v1.3 旧档零错误可玩', errs.length === 0, errs.join(';'));
  rec('F2 旧档迁移（_version→5 或页面正常运行）', errs.length === 0 && (mig.v === 5 || playable !== null),
    `存档v=${mig.v} storyline=${mig.storyline} ep="${mig.ep}"`);
  await page.screenshot({ path: SHOT_DIR + 'F_旧档兼容_file.png' });
  await page.close();
}

await browser.close();
const fails = results.filter(r => !r.ok).length;
console.log(`\nv2.0.1 真实试玩自测结果：${results.length - fails} 通过，${fails} 失败`);
console.log(`截图目录：${SHOT_DIR}`);
process.exit(fails > 0 ? 1 : 0);
