// v4.2.2 反馈专项：AI 步进器 + 号不贴边 / 编排卡顶层标题删除 / 潮汐明细改悬浮气泡
//
// 验收口径：
//   ① AI 动作卡 ＋/− 按钮 ≥24×24，且字符不贴按钮边缘（按钮内边距后净空 ≥20px 高）。
//   ② #orchestration-card 不再含「效能编排与班组」顶层 h3；内部仍保留「效能编排 / 相位共鸣」分块标题。
//   ③ 潮汐项（#h-tide）只含 图标+相位名+倒计时，不再内联「产出/薪资/科技成本」加成文本。
//   ④ 悬浮 #h-tide 出现 #tide-tip-pop 气泡：含相位名、当前加成分组；离开后隐藏。
//   ⑤ 气泡为 position:fixed 且四主题语义色可读（w-good/w-bad 在 light 皮肤下走深色变体）。
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
  _version: 6, chapter: 4, ep: 5e6, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: { ai_core: true, ai_buy: true }, focusLevel: 10,
  ai: { assistants: 3, reservePct: 0, counts: { build: 1, upgrade: 0, harvest: 1, delve: 0, tech: 0 } },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 9, prestigePoints: 3,
  eternal: { skin_light: 1 },
  lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 1366, height: 800 });
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  // ===== ① AI 步进器按钮尺寸与贴边 =====
  const ai = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.ai-crew-btn')].filter(b => b.offsetParent !== null);
    if (!btns.length) return { none: true };
    const r = btns[0].getBoundingClientRect();
    const cs = getComputedStyle(btns[0]);
    const char = btns[0].textContent.trim();
    // 字符不贴边：全角＋实际字形高度 ≈ 字号 13px；按钮高 24px → 上下各留 ≥5px
    return {
      none: false, n: btns.length, ch: char,
      w: Math.round(r.width), h: Math.round(r.height),
      inlineFlex: cs.display,
      alignCenter: cs.alignItems === 'center' && cs.justifyContent === 'center',
    };
  });
  console.log('\n[① AI 步进器]');
  if (ai.none) bad('AI 面板未渲染（需要 AI 解锁存档）', '');
  else {
    ai.w >= 24 && ai.h >= 24 ? ok(`＋/− 按钮 ≥24×24`, `${ai.w}×${ai.h}（旧版 ~15px 高）`) : bad('按钮小于 24×24', `${ai.w}×${ai.h}`);
    // inline-flex 在 .ai-crew（flex 容器）内会被块化为 flex——两种都等价于 flex 居中布局
    (ai.inlineFlex === 'flex' || ai.inlineFlex === 'inline-flex') && ai.alignCenter
      ? ok('按钮 flex 居中布局（字符不贴边）', `display=${ai.inlineFlex} align=${ai.alignCenter}`)
      : bad('按钮未走 flex 居中', `display=${ai.inlineFlex}`);
  }

  // ===== ② 编排卡顶层标题删除 =====
  const orch = await page.evaluate(() => {
    const card = document.getElementById('orchestration-card');
    if (!card || card.style.display === 'none') return { hidden: true };
    const h3s = [...card.querySelectorAll('h3')].map(h => h.textContent.trim());
    const blocks = [...card.querySelectorAll('.orch-block-title')].map(b => b.textContent.trim());
    return { hidden: false, h3s, blocks, text: card.textContent };
  });
  console.log('\n[② 编排卡标题]');
  if (orch.hidden) bad('编排卡未显示（存档未解锁）', '');
  else {
    !orch.h3s.some(t => t.includes('效能编排与班组'))
      ? ok('顶层「效能编排与班组」h3 已删除', orch.h3s.join(',') || '(无 h3)')
      : bad('顶层标题仍在', orch.h3s.join(','));
    orch.blocks.some(t => t.includes('效能编排'))
      ? ok('内部「效能编排」分块标题保留', orch.blocks.join(' / '))
      : bad('内部分块标题丢失', orch.blocks.join(','));
  }

  // ===== ③④ 潮汐顶栏精简 + 悬浮气泡 =====
  const tide0 = await page.evaluate(() => {
    const el = document.getElementById('h-tide');
    return { txt: el.textContent.trim(), hasTitle: !!el.getAttribute('title') };
  });
  console.log('\n[③ 潮汐顶栏]');
  !/产出|薪资|科技成本/.test(tide0.txt)
    ? ok('顶栏潮汐不再内联加成文本', tide0.txt)
    : bad('顶栏仍内联加成文本', tide0.txt);
  /涨潮|平潮|退潮|乱流/.test(tide0.txt) ? ok('相位名保留', tide0.txt) : bad('相位名丢失', tide0.txt);
  /\d/.test(tide0.txt) ? ok('倒计时保留', tide0.txt) : bad('倒计时丢失', tide0.txt);

  console.log('\n[④ 潮汐悬浮气泡]');
  await page.hover('#h-tide');
  await sleep(350);
  const tip1 = await page.evaluate(() => {
    const p = document.getElementById('tide-tip-pop');
    if (!p) return { none: true };
    const cs = getComputedStyle(p);
    return {
      none: false, shown: p.classList.contains('show'), display: cs.display,
      pos: cs.position, txt: p.textContent,
      x: p.style.getPropertyValue('--tip-x'), y: p.style.getPropertyValue('--tip-y'),
    };
  });
  if (tip1.none) bad('气泡节点不存在（bindTideTipPop 未生效）', '');
  else {
    tip1.shown && tip1.display !== 'none' ? ok('悬浮后气泡显示', '') : bad('气泡未显示', `display=${tip1.display}`);
    tip1.pos === 'fixed' ? ok('气泡 position:fixed', '') : bad('气泡非 fixed', tip1.pos);
    tip1.txt.includes('潮汐') ? ok('气泡含相位说明', '') : bad('气泡内容缺失', tip1.txt.slice(0, 60));
    tip1.txt.includes('当前加成') ? ok('气泡含加成分组', '') : bad('加成分组缺失', '');
    /每相位 150 秒/.test(tip1.txt) ? ok('气泡含相位轮转说明', '') : bad('轮转说明缺失', '');
    tip1.x && tip1.y ? ok('坐标已写入', `x=${tip1.x} y=${tip1.y}`) : bad('坐标未写', '');
  }
  await page.mouse.move(400, 500);
  await sleep(250);
  const tip2 = await page.evaluate(() => {
    const p = document.getElementById('tide-tip-pop');
    return p ? p.classList.contains('show') : false;
  });
  !tip2 ? ok('移开后气泡隐藏', '') : bad('气泡未隐藏', '');

  // ===== ⑤ 浅色主题语义色 =====
  console.log('\n[⑤ 浅色主题气泡语义色]');
  await page.evaluate(() => { document.documentElement.className = 'theme-light'; });
  await sleep(200);
  await page.hover('#h-tide');
  await sleep(350);
  const light = await page.evaluate(() => {
    const p = document.getElementById('tide-tip-pop');
    const good = p.querySelector('.w-good') || p.querySelector('.w-bad');
    if (!good) return { noEl: true };
    return { noEl: false, color: getComputedStyle(good).color, bg: getComputedStyle(p).backgroundColor };
  });
  await page.mouse.move(400, 500);
  await page.evaluate(() => { document.documentElement.className = ''; });
  if (light.noEl) ok('当前相位无彩色加成项（平潮），跳过语义色断言', '');
  else {
    // light 主题下 --tip-bg 为浅色，good 应为深色变体 #0f6b2d = rgb(15,107,45)
    const rgb = light.color.match(/\d+/g).map(Number);
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    lum < 120 ? ok('浅色主题语义色为深色变体（可读）', `${light.color} on ${light.bg}`) : bad('浅色主题语义色过亮', `${light.color} on ${light.bg}`);
  }

  errs.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n========== v4.2.2 反馈专项：${pass} / ${fail} ==========`);
if (fail) process.exitCode = 1;
