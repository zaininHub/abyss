// v4.1.0 反馈② 专项：潮汐卡片固定顶栏最右 + 暂停按钮移到系统按钮组最右且字体加色
//
// 验收口径：
//   ① 潮汐卡片（#h-tide）右缘与顶栏内容区右缘对齐（±2px），且是顶栏最靠右的可见子项。
//   ② 暂停按钮（#pauseBtn）是 .sys-btns 内最后一个可见按钮（深渊之眼 prepend 在行首不受影响）。
//   ③ 暂停按钮字色为琥珀 --warn（非默认字色 --text-1），四主题下均成立。
//   ④ 三档视口（1920/1366/900）下潮汐均贴最右、按钮组不溢出视口。
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 4, ep: 5000, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, focusLevel: 10,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 9, prestigePoints: 3,
  eternal: { skin_light: 1 }, // light 皮肤需永恒矩阵解锁（skinOwned 门控）
  lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const errs = [];
try {
  for (const [w, h] of [[1920, 960], [1366, 800], [900, 760]]) {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    page.setDefaultTimeout(60000);
    await page.setViewport({ width: w, height: h });
    await page.evaluateOnNewDocument(s => {
      if (sessionStorage.getItem('__seeded')) return;
      localStorage.setItem('abyss_idle_v2', s);
      sessionStorage.setItem('__seeded', '1');
    }, mkSave());
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(1200);

    const r = await page.evaluate(() => {
      const tide = document.getElementById('h-tide');
      const bar = document.querySelector('.topbar');
      const pause = document.getElementById('pauseBtn');
      const sys = document.querySelector('.sys-btns');
      const tr = tide.getBoundingClientRect(), br = bar.getBoundingClientRect();
      // 顶栏内最靠右的可见子项
      let maxRight = 0, maxId = '';
      for (const el of bar.children) {
        if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
        const rr = el.getBoundingClientRect();
        if (rr.right > maxRight) { maxRight = rr.right; maxId = el.id || el.className; }
      }
      // sys-btns 内最后一个可见按钮
      const btns = [...sys.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      const lastBtn = btns[btns.length - 1];
      const pc = getComputedStyle(pause).color;
      const textC = getComputedStyle(document.documentElement).getPropertyValue('--text-1').trim();
      return {
        tideRight: Math.round(tr.right), barRight: Math.round(br.right - 12), // 12 = padding
        maxRight: Math.round(maxRight), maxId,
        isLast: lastBtn === pause || (lastBtn && lastBtn.contains(pause)),
        pauseColor: pc, textC,
        sysRight: Math.round(sys.getBoundingClientRect().right), vw: innerWidth,
      };
    });

    console.log(`\n[${w}px]`);
    Math.abs(r.tideRight - r.barRight) <= 2
      ? ok(`潮汐卡片贴顶栏内容区右缘`, `${r.tideRight} ≈ ${r.barRight}`)
      : bad('潮汐未贴最右', `tide=${r.tideRight} bar=${r.barRight}`);
    r.maxId.includes('h-tide')
      ? ok('潮汐是顶栏最靠右的可见子项', `maxRight=${r.maxRight} (${r.maxId})`)
      : bad('顶栏有更靠右的子项', `maxRight=${r.maxRight} (${r.maxId})`);
    r.isLast
      ? ok('暂停按钮是系统按钮组最后一个可见按钮', '')
      : bad('暂停按钮不在最右', '');
    r.pauseColor !== r.textC
      ? ok('暂停按钮字色非默认（已加色）', `${r.pauseColor} ≠ ${r.textC}`)
      : bad('暂停按钮字色仍是默认', r.pauseColor);
    r.sysRight <= r.vw
      ? ok('按钮组不溢出视口', `${r.sysRight} ≤ ${r.vw}`)
      : bad('按钮组溢出视口', `${r.sysRight} > ${r.vw}`);
    await page.close();
  }

  // 浅色主题：暂停字色 = --warn 深色变体（可读性）——走真实皮肤菜单切换（v409 同款路径）
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 1366, height: 800 });
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1200);
  await page.hover('#sys-menu-btn'); // v4.3.3 反馈③：先展开选项下拉
  await page.hover('#skin-menu-btn');
  await sleep(350);
  await page.click('[data-skin="light"]');
  await sleep(600);
  const light = await page.evaluate(() => {
    const pause = document.getElementById('pauseBtn');
    return {
      color: getComputedStyle(pause).color,
      warn: getComputedStyle(document.documentElement).getPropertyValue('--warn').trim(),
      cls: document.documentElement.className,
    };
  });
  console.log('\n[浅色主题]');
  /theme-light/.test(light.cls) ? ok('light 皮肤已切换', light.cls) : bad('皮肤未切换', light.cls);
  const rgbWarn = light.warn ? light.warn.replace(/^#/, '').match(/.{2}/g).map(h => parseInt(h, 16)).join(', ') : '';
  (light.color === `rgb(${rgbWarn})`)
    ? ok('暂停字色跟随 --warn 深色变体', `${light.color} = var(--warn) ${light.warn}`)
    : bad('浅色主题下暂停字色与 --warn 不符', `${light.color} vs ${light.warn} (rgb ${rgbWarn})`);
  await page.close();

  errs.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n========== v4.1.0 F2 专项：${pass} / ${fail} ==========`);
if (fail) process.exitCode = 1;
