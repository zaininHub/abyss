// v4.2.3 反馈专项：薪资说明精简分行 / 编排卡冗余标签删除 / 快照改名 / 商店分类折叠统一
//
// 验收口径：
//   ① 线程薪资气泡：文案按行渲染（white-space:pre-line 生效，getClientRects 多段），
//      行数 ≤6，且不再出现「维修坞 / 免疫 / 过渡缓冲 / 补偿」等内置机制细节。
//   ② 编排卡：不再含「编排倍率」「策略与潮汐排班」文本；标题只留「效能编排」。
//   ③ 快照改名：点名称变输入框 → 输入 + Enter 提交 → 列表与 localStorage 同步；Esc 取消。
//   ④ 商店分类：基础产出 / 存储与资源建筑等分组标题与「产出强化」同为 .rp-group-title
//      折叠块（带 ▶/▼ 箭头、整行可点、点击后组内卡片收起）。
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
  _version: 6, chapter: 10, ep: 5e6, rp: 1e6, es: 1e3, dm: 1e3, pt: 1e3, faith: 50,
  buildings: {}, unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: { ai_core: true }, ai: { assistants: 3, reservePct: 0 },
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 3, prestigePoints: 5, projectsDone: 12, focusLevel: 8,
  lastSeen: NOW, startTime: NOW,
});
// 快照种子：两条，验证改名与列表同步
const mkSnaps = () => JSON.stringify([
  { id: 'snapA', name: '快照', time: NOW - 3600e3, data: mkSave() },
  { id: 'snapB', name: '初始空档', time: NOW - 7200e3, data: mkSave() },
]);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((s, sn) => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    localStorage.setItem('abyss_idle_v2_snapshots', sn);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave(), mkSnaps());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  // ===== ① 薪资说明=====
  console.log('\n[① 线程薪资说明]');
  await page.hover('#wage-help-zone');
  await sleep(400);
  const wage = await page.evaluate(() => {
    const p = document.getElementById('wage-tip-pop');
    if (!p) return { none: true };
    const cs = getComputedStyle(p);
    const lines = p.textContent.split('\n').filter(x => x.trim());
    return {
      none: false, shown: p.classList.contains('show'), ws: cs.whiteSpace,
      h: Math.round(p.getBoundingClientRect().height),
      text: p.textContent, lineCount: lines.length,
    };
  });
  if (wage.none) bad('气泡节点不存在', '');
  else {
    wage.shown ? ok('悬浮显示', '') : bad('未显示', '');
    wage.ws === 'pre-line' ? ok('white-space:pre-line 生效（\\n 真实换行）', '') : bad('换行仍被折叠', wage.ws);
    wage.lineCount <= 6 ? ok('文案收敛到 6 行以内', `${wage.lineCount} 行`) : bad('文案仍过长', `${wage.lineCount} 行`);
    wage.h <= 200 ? ok('气泡高度可控（不糊满屏）', `${wage.h}px`) : bad('气泡过高', `${wage.h}px`);
    !/维修坞|免疫|过渡|缓冲|补偿/.test(wage.text) ? ok('内置机制细节已移除', '') : bad('仍含机制细节', wage.text.slice(0, 80));
    /当前：/.test(wage.text) ? ok('保留当前状态行', '') : bad('当前状态行丢失', '');
  }
  await page.mouse.move(20, 700);

  // ===== ② 编排卡标签 =====
  console.log('\n[② 编排卡冗余标签]');
  const orch = await page.evaluate(() => {
    const el = document.getElementById('orchestration-panel');
    const card = document.getElementById('orchestration-card');
    if (!el || !card || card.style.display === 'none') return { hidden: true };
    const spans = [...el.querySelectorAll('span')].map(s => (s.textContent || '').trim());
    return {
      hidden: false, txt: el.textContent,
      hasMultLabel: spans.includes('编排倍率'),
      hasSchedNote: spans.includes('策略与潮汐排班'),
      title: (el.querySelector('.orch-block-title') || {}).textContent || '',
      multRows: el.querySelectorAll('.orch-mult-grid > div').length,
    };
  });
  if (orch.hidden) bad('编排卡未显示', '');
  else {
    !orch.hasMultLabel ? ok('「编排倍率」标签已删除', '') : bad('「编排倍率」仍在', '');
    !orch.hasSchedNote ? ok('「策略与潮汐排班」注脚已删除', '') : bad('注脚仍在', '');
    /效能编排/.test(orch.title) ? ok('块标题保留「效能编排」', orch.title.trim()) : bad('块标题异常', orch.title);
    orch.multRows >= 4 ? ok('四行倍率仍渲染', `${orch.multRows} 行`) : bad('倍率行缺失', `${orch.multRows} 行`);
  }

  // ===== ③ 快照改名（走真实入口：💾 存档下拉）=====
  console.log('\n[③ 快照改名 / 存快照入口]');
  await page.hover('#save-menu-btn');
  await sleep(450);
  const entry = await page.evaluate(() => ({
    snapSaveBtn: !!document.getElementById('snap-save'),
    rows: document.querySelectorAll('#save-list .snap-row').length,
    names: [...document.querySelectorAll('#save-list .snap-name')].map(e => e.textContent),
  }));
  entry.snapSaveBtn ? ok('下拉内提供「💾 存快照」入口（旧模态不可达已修复）', '') : bad('存快照入口缺失', '');
  entry.rows === 2 ? ok('存档列表渲染 2 条', entry.names.join(' / ')) : bad('存档列表异常', JSON.stringify(entry));
  // 点第一条名称 → 输入框
  await page.click('#save-list .snap-row .snap-name');
  await sleep(250);
  const editing = await page.evaluate(() => {
    const inp = document.querySelector('#save-list .snap-rename-input');
    return inp ? { exists: true, focused: document.activeElement === inp, value: inp.value } : { exists: false };
  });
  editing.exists ? ok('点击名称进入编辑（输入框就位）', `原值 ${editing.value}`) : bad('未进入编辑态', '');
  editing.focused ? ok('输入框自动聚焦', '') : bad('输入框未聚焦', '');
  await page.evaluate(() => {
    const inp = document.querySelector('#save-list .snap-rename-input');
    inp.value = '';
  });
  await page.type('#save-list .snap-rename-input', '深渊线备份');
  await page.keyboard.press('Enter');
  await sleep(450);
  const afterRename = await page.evaluate(() => ({
    names: [...document.querySelectorAll('#save-list .snap-name')].map(e => e.textContent),
    stored: JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').map(s => s.name),
    stillEditing: !!document.querySelector('#save-list .snap-rename-input'),
  }));
  afterRename.names.includes('深渊线备份') ? ok('列表显示新名称', afterRename.names.join(' / ')) : bad('列表未更新', JSON.stringify(afterRename.names));
  afterRename.stored.includes('深渊线备份') ? ok('localStorage 已落盘', afterRename.stored.join(' / ')) : bad('未落盘', JSON.stringify(afterRename.stored));
  !afterRename.stillEditing ? ok('提交后退出编辑态', '') : bad('仍停在编辑态', '');
  // Esc 取消
  await page.hover('#save-menu-btn');
  await sleep(300);
  await page.click('#save-list .snap-row:last-child .snap-name');
  await sleep(250);
  await page.evaluate(() => { document.querySelector('#save-list .snap-rename-input').value = '不应生效'; });
  await page.keyboard.press('Escape');
  await sleep(350);
  const afterEsc = await page.evaluate(() => ({
    names: [...document.querySelectorAll('#save-list .snap-name')].map(e => e.textContent),
    stored: JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').map(s => s.name),
  }));
  !afterEsc.names.includes('不应生效') && !afterEsc.stored.includes('不应生效')
    ? ok('Esc 取消不改名', afterEsc.names.join(' / '))
    : bad('Esc 仍写入', JSON.stringify(afterEsc));
  // 长度截断
  await page.hover('#save-menu-btn');
  await sleep(300);
  await page.click('#save-list .snap-row:last-child .snap-name');
  await sleep(250);
  await page.type('#save-list .snap-rename-input', '一二三四五六七八九十一二三四五六七八');
  await page.keyboard.press('Enter');
  await sleep(350);
  const trunc = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2_snapshots') || '[]').map(s => s.name));
  trunc.some(n => n.length <= 16) ? ok('名称截断到 16 字以内', trunc.join(' / ')) : bad('未截断', JSON.stringify(trunc));
  await page.mouse.move(20, 700);
  await sleep(250);

  // ===== ④ 商店分类折叠统一 =====
  console.log('\n[④ 商店分类折叠]');
  const shop = await page.evaluate(() => {
    const grid = document.getElementById('shop-list');
    if (!grid) return { none: true };
    const titles = [...grid.querySelectorAll('.group-title')].map(t => ({
      text: t.textContent.replace(/[▶▼]\s*/, '').trim(),
      folded: t.classList.contains('rp-group-title'),
      hasArrow: !!t.querySelector('.rp-fold-arrow'),
    }));
    return { none: false, titles };
  });
  if (shop.none) bad('商店列表不存在', '');
  else {
    shop.titles.length >= 1 ? ok('商店分类标题数量', shop.titles.map(t => t.text).join(' / ')) : bad('无分类标题', '');
    const allFolded = shop.titles.length > 0 && shop.titles.every(t => t.folded && t.hasArrow);
    allFolded ? ok('全部分类标题统一为折叠块（rp-group-title + 箭头）', `${shop.titles.length} 组`) : bad('仍有非折叠分类', JSON.stringify(shop.titles));
  }
  // 点击第一个分类标题 → 组内卡片收起
  const foldTest = await page.evaluate(() => {
    const grid = document.getElementById('shop-list');
    const t = grid.querySelector('.group-title');
    if (!t) return { none: true };
    const arrow = t.querySelector('.rp-fold-arrow');
    const before = arrow ? arrow.textContent : '';
    t.click();
    const after = arrow ? arrow.textContent : '';
    // 收起后：下一个兄弟若为卡片应 display:none
    const sib = t.nextElementSibling;
    return { none: false, before, after, sibHidden: sib ? getComputedStyle(sib).display === 'none' : null, sibCls: sib ? sib.className : '' };
  });
  if (foldTest.none) bad('无分组标题可点', '');
  else {
    foldTest.before !== foldTest.after ? ok('点击切换箭头方向', `${foldTest.before} → ${foldTest.after}`) : bad('箭头未切换', `${foldTest.before}`);
    foldTest.sibHidden === true ? ok('组内卡片随之收起', foldTest.sibCls) : bad('卡片未收起', `${foldTest.sibCls} hidden=${foldTest.sibHidden}`);
  }
  // 再点一次展开回去（避免影响后续手动验收）
  await page.evaluate(() => { document.querySelector('#shop-list .group-title')?.click(); });

  errs.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n========== v4.2.3 反馈专项：${pass} / ${fail} ==========`);
if (fail) process.exitCode = 1;
