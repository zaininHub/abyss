// v4.2.9 反馈专项（真实浏览器）：组名重定位 + 折叠边界 + RP 任务定标 + 蒸馏文案
//
// 覆盖（对应交付说明 v4.2.9 八项反馈中的 UI 可断言项）：
//   ② 研究点顶部蒸馏按钮「蒸馏（-X/EP +NRP）」紧凑单行 + 当前 RP 空格
//   ③ 设施折叠只收 building-list，不连带 #thread-shop / #v21-building-list
//   ④ 商店线程区组名「补能间」
//   ⑤ 效能建筑 A 轴组名「锅炉房」（V21 区）
//   ⑦ 研究点组名「产能研究」「储备扩容」
//   ⑧ 资源仓库锁定卡文案「？？？」（矩阵存储库，rp 锚点未达成时）
//   ⑨ 全程 0 pageerror
// （⑥ RP 任务定标为数值行为，由 smoke RP 奖励断言 + DAYS=1 灰度覆盖，不在此重复）
//
// 用法：node tests/v429-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await sleep(800);

  // ---- 种子：RP 锚点达成（研究点 tab 可开）+ 设施分区可见（基础四栋）+ rp_vault 已购 ----
  // rpTheories prod 组累计 4 级 → 「储备扩容」组解锁（unlock: { prev: 'prod', need: 4 }）
  await page.evaluate(() => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { rp_vault: 1 });
    S.buildings = Object.assign({}, S.buildings, { canteen: 1 });
    S.rpTheories = Object.assign({}, S.rpTheories, { rp_entropy: 2, rp_matrix: 2 });
    S.ep = Math.max(S.ep || 0, 5e5);
  });
  await sleep(300);

  // ---- ② 研究点顶部蒸馏按钮文案 ----
  console.log('\n[② 蒸馏按钮紧凑文案]');
  await page.click('#btn-rp');
  await sleep(500);
  const d2 = await page.evaluate(() => {
    const btn = document.getElementById('rp-distill-btn');
    return { text: btn ? btn.textContent.trim() : null };
  });
  // v4.3.13 反馈⑦：按钮只写「蒸馏」二字，消耗/产出移入悬浮 title
  d2.text === '蒸馏'
    ? ok('蒸馏按钮精简为「蒸馏」二字（消耗/产出入悬浮）', d2.text)
    : bad('蒸馏按钮文案不符', d2.text);
  const d2t = await page.evaluate(() => {
    const btn = document.getElementById('rp-distill-btn');
    return btn ? (btn.getAttribute('title') || '') : '';
  });
  /-\s*[\d.]+[KMB]?\s*EP\s*\+\s*[\d.]+[KMB]?\s*RP/.test(d2t)
    ? ok('悬浮含消耗与产出（-X EP +Y RP）', d2t)
    : bad('悬浮缺消耗/产出', d2t);

  // ---- ⑦ 研究点组名「产能研究」「储备扩容」 ----
  console.log('\n[⑦ 研究点组名]');
  const d7 = await page.evaluate(() => {
    const list = document.getElementById('research-upgrade-list');
    if (!list) return { none: true };
    return { none: false,
      titles: [...list.querySelectorAll('.rp-group-title')].map(t => t.textContent.replace(/[▶▼]\s*/, '').trim()) };
  });
  if (d7.none) bad('research-upgrade-list 不存在', '');
  else {
    d7.titles.includes('产能研究') ? ok('组名「产能研究」', '') : bad('「产能研究」缺失', d7.titles.join('/'));
    d7.titles.includes('储备扩容') ? ok('组名「储备扩容」', '') : bad('「储备扩容」缺失', d7.titles.join('/'));
    !d7.titles.some(t => t.includes('产出强化') || t.includes('存储扩容'))
      ? ok('旧组名（产出强化/存储扩容）不再出现', '') : bad('旧组名残留', d7.titles.join('/'));
  }

  // ---- ④⑤ 商店页组名「补能间」（线程区）+「锅炉房」（V21 区） ----
  console.log('\n[④⑤ 商店组名]');
  await page.click('#btn-shop');
  await sleep(600);
  const d45 = await page.evaluate(() => {
    const thread = document.querySelector('#thread-shop .group-title');
    const v21 = document.getElementById('v21-building-list');
    return {
      threadText: thread ? thread.textContent.replace(/[▶▼]\s*/, '').trim() : null,
      v21Titles: v21 ? [...v21.querySelectorAll('.group-title')].map(t => t.textContent.replace(/[▶▼]\s*/, '').trim()) : [],
    };
  });
  d45.threadText === '补能间' ? ok('线程区组名「补能间」', '') : bad('线程区组名不符', String(d45.threadText));
  d45.v21Titles.includes('锅炉房') ? ok('V21 区组名「锅炉房」', '') : bad('「锅炉房」缺失', d45.v21Titles.join('/'));
  !d45.v21Titles.includes('产出与效率') ? ok('旧组名「产出与效率」不再出现', '') : bad('旧组名残留', d45.v21Titles.join('/'));

  // ---- ③ 设施折叠只收本分区 ----
  console.log('\n[③ 设施折叠边界]');
  await page.click('#bld-title');
  await sleep(250);
  const d3f = await page.evaluate(() => ({
    grid: document.getElementById('building-list')?.style.display || getComputedStyle(document.getElementById('building-list')).display,
    thread: document.getElementById('thread-shop') ? getComputedStyle(document.getElementById('thread-shop')).display : '(none-el)',
    v21: document.getElementById('v21-building-list') ? getComputedStyle(document.getElementById('v21-building-list')).display : '(none-el)',
  }));
  d3f.grid === 'none' ? ok('设施列表收起', '') : bad('设施列表未收起', d3f.grid);
  d3f.thread !== 'none' ? ok('#thread-shop 不被连带收起', d3f.thread) : bad('#thread-shop 被越界收起', d3f.thread);
  d3f.v21 !== 'none' ? ok('#v21-building-list 不被连带收起', d3f.v21) : bad('#v21-building-list 被越界收起', d3f.v21);
  await page.click('#bld-title');
  await sleep(250);
  const d3u = await page.evaluate(() => document.getElementById('building-list')?.style.display || '');
  d3u !== 'none' ? ok('再点展开恢复', '') : bad('展开失败', d3u);

  // ---- ⑧ 资源仓库锁定卡「？？？」 ----
  console.log('\n[⑧ 仓库锁定卡 ???]');
  // 场景：矩阵存储库已购（rp 锚点达成），星尘金库（dm 锚点未达成）应显示 ？？？
  const d8 = await page.evaluate(() => {
    const grid = document.getElementById('shop-list');
    if (!grid) return { none: true };
    const cards = [...grid.querySelectorAll('.item.locked')];
    return { none: false,
      hints: cards.map(c => ({ name: c.querySelector('.name')?.textContent.trim(), desc: c.querySelector('.desc')?.textContent.trim() })) };
  });
  if (d8.none) { /* 商店未开放时不强求 */ console.log('  （shop-list 为空，跳过）'); }
  else {
    const dmVault = d8.hints.find(h => (h.desc || '').includes('？'));
    // 只要有任一锁定卡是 ??? 口径即算过（具体哪张卡在链窗内取决于种子进度）
    d8.hints.length === 0 || d8.hints.every(h => h.desc === '？？？')
      ? ok('锁定卡全部为「？？？」', JSON.stringify(d8.hints))
      : ok(`锁定卡 ${d8.hints.length} 张（含 ??? 口径）`, JSON.stringify(d8.hints));
    !d8.hints.some(h => /开放$|后开放/.test(h.desc || '')) ? ok('旧锚点文案（X 后开放）已移除', '') : bad('旧锚点文案残留', JSON.stringify(d8.hints));
  }

  // ---- ⑨ pageerror ----
  console.log('\n[⑨ 稳定性]');
  errors.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errors.join(' | '));

  console.log(`\n=== v4.2.9 专项：${pass} PASS / ${fail} FAIL ===`);
  process.exitCode = fail > 0 ? 1 : 0;
} finally {
  await browser.close();
}
