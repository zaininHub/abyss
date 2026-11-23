// v4.3.3 反馈专项（真实浏览器）：三列等高内滚 / 滚动自动翻页 / 选项菜单 / 剧情同行 /
//   组名箭头对齐 / 感叹号单气泡+help 光标 / 裂隙三项互斥开关 / CH4 链路重标定
//
// 用法：node tests/v433-feedback-browser.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromePath } from './_chrome.mjs';

const GAME_URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const src = p => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

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
  await page.goto(GAME_URL, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#app', { timeout: 30000 });
  await sleep(900);

  // ============ ① 三列等高 + 圆角保留 + 列表内滚 ============
  console.log('\n[① 三列等高/圆角/内滚]');
  const d1 = await page.evaluate(() => {
    const pane = document.getElementById('tab-achievement');
    const list = document.getElementById('achievement-panel');
    const col = document.querySelector('.first-col');
    const ps = getComputedStyle(pane), cs = getComputedStyle(list), cl = getComputedStyle(col);
    return { flexGrow: ps.flexGrow, radius: ps.borderTopLeftRadius, paneH: Math.round(pane.getBoundingClientRect().height),
      colOverflow: cl.overflowY, listOverflow: cs.overflowY };
  });
  Number(d1.flexGrow) >= 1 && d1.paneH >= 180 ? ok('成就面板吃列内剩余空间（不再 clamp 定高）', `h=${d1.paneH}`)
    : bad('成就面板未弹性撑高', JSON.stringify(d1));
  d1.radius && d1.radius !== '0px' && d1.colOverflow === 'hidden' ? ok('底部圆角保留 + 列不裁剪', `radius=${d1.radius}`)
    : bad('圆角/列裁剪未修', JSON.stringify(d1));
  d1.listOverflow === 'auto' ? ok('成就列表内滚（overflow-y:auto）') : bad('成就列表不可滚', d1.listOverflow);

  // ============ ② 滚动触底累积加载（v4.3.6b 重做：追加而非翻页替换） ============
  console.log('\n[② 滚动累积加载]');
  // 种足够成就（>5 条 = 2 组），强制渲染后滚动列表到底
  const d2 = await page.evaluate(async () => {
    const S = window.S, q = window.__qa, ids = q.ACHIEVEMENT_IDS;
    S.achievements = {}; S.achievementTimes = {};
    for (let i = 0; i < 12; i++) { S.achievements[ids[i]] = true; S.achievementTimes[ids[i]] = 1000 + i; }
    window.__gameDirty.achievements = true; q.sim.render();
    await new Promise(r => setTimeout(r, 400));
    const list = document.getElementById('achievement-panel');
    const before = { cards: list.querySelectorAll('.ach-card').length,
      firstCard: list.querySelector('.ach-card')?.textContent || '',
      pager: (list.querySelector('.crew-pager')?.textContent || '').replace(/\s+/g, ' ').trim() };
    // 制造可滚：限制列表高度后滚到底
    list.style.maxHeight = '120px';
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 250));
    // v4.3.6b：累积断言——旧卡保留（首卡不变），卡片数 5→10，滚动位置不跳顶
    const after = { cards: list.querySelectorAll('.ach-card').length,
      firstCard: list.querySelector('.ach-card')?.textContent || '',
      scrollTop: list.scrollTop,
      pager: (list.querySelector('.crew-pager')?.textContent || '').replace(/\s+/g, ' ').trim() };
    // 再滚到底加载完剩余（10→12），验证末页文案不再出现「下滑加载更多」
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 250));
    const final = { cards: list.querySelectorAll('.ach-card').length,
      pager: (list.querySelector('.crew-pager')?.textContent || '').replace(/\s+/g, ' ').trim() };
    return { before, noPagerBtn: !list.querySelector('[data-ach-page]'), after, final };
  });
  // v4.3.6b 反馈③：累积式加载——滚到底追加下一组（5→10→12），首卡保留可回看；
  //   全部展示完后文案收尾「已全部展示 N 项」，不再出现「已展示 16/16·下滑加载更多」矛盾。
  /已展示 5 \/ \d+ 项/.test(d2.before.pager) ? ok('初始展示 5 条（已展示 5/12 进度文案，无按钮）', d2.before.pager) : bad('初始进度文案异常', d2.before.pager);
  d2.noPagerBtn && d2.after.cards === 10 && /已展示 10 \/ \d+ 项/.test(d2.after.pager) && d2.after.firstCard === d2.before.firstCard
    ? ok('滚动触底累积加载（5→10 追加，首卡保留可回看，无按钮）', d2.after.pager)
    : bad('滚动未累积加载或旧卡丢失', JSON.stringify(d2));
  d2.final.cards === 12 && /已全部展示 \d+ 项/.test(d2.final.pager) && !/下滑加载更多/.test(d2.final.pager)
    ? ok('末组加载后收尾文案正确（已全部展示 12 项，无「下滑加载更多」）', d2.final.pager)
    : bad('末页文案异常', JSON.stringify(d2.final));

  // ============ ③ 保活/存档/皮肤收进「选项」 ============
  console.log('\n[③ 选项菜单收纳]');
  const d3 = await page.evaluate(() => {
    const sys = document.getElementById('sys-menu'), btn = document.getElementById('sys-menu-btn');
    const pop = document.getElementById('sys-pop');
    return { hasSys: !!sys, hasBtn: !!btn && btn.textContent.includes('选项'),
      keepInPop: !!pop?.querySelector('#keep-awake-btn'), saveInPop: !!pop?.querySelector('#save-menu-btn'),
      skinInPop: !!pop?.querySelector('#skin-menu-btn') };
  });
  d3.hasSys && d3.hasBtn ? ok('「⚙ 选项」按钮存在') : bad('选项按钮缺失', JSON.stringify(d3));
  d3.keepInPop && d3.saveInPop && d3.skinInPop ? ok('保活/存档/皮肤三项收进选项下拉')
    : bad('三项未收进下拉', JSON.stringify(d3));
  // hover 选项按钮后下拉可见
  await page.hover('#sys-menu-btn'); await sleep(250);
  const d3b = await page.evaluate(() => getComputedStyle(document.getElementById('sys-pop')).display);
  d3b === 'flex' ? ok('悬停选项按钮展开下拉') : bad('下拉未展开', d3b);

  // ============ ④ 剧情与章节同行 + 角标字号 ============
  console.log('\n[④ 剧情章节同行]');
  await page.mouse.move(800, 500); await sleep(200);
  const d4 = await page.evaluate(() => {
    const head = document.querySelector('.ch-head'), label = document.querySelector('.ch-label');
    const name = document.getElementById('ch-name');
    if (!head || !label || !name) return { ok: false };
    const lr = label.getBoundingClientRect(), nr = name.getBoundingClientRect();
    return { ok: true, sameLine: Math.abs(lr.top - nr.top) < 6, fontSize: parseFloat(getComputedStyle(label).fontSize) };
  });
  d4.ok && d4.sameLine ? ok('剧情角标与章节名同行') : bad('未同行', JSON.stringify(d4));
  d4.fontSize >= 12 ? ok('剧情角标字号 ≥12px', `${d4.fontSize}px`) : bad('角标字号偏小', `${d4.fontSize}px`);

  // ============ ⑤ 组名箭头间距对齐 ============
  console.log('\n[⑤ 折叠箭头间距]');
  // 切到 shop tab 让设施标题可见（h3 在未显示 tab 内 display:none）
  await page.evaluate(() => window.__qa.sim.switchTab('shop'));
  await sleep(200);
  // 源码级断言（h3 可能随门控隐藏，computed style 不可靠）：
  // .foldable-h3 必须与 .rp-group-title 同为 display:flex + gap:6px，箭头后间距才一致。
  const cssSrc = src('../src/style.css');
  const foldRule = /h3\.foldable-h3\s*\{([\s\S]*?)\}/.exec(cssSrc);
  const groupRule = /\.rp-group-title\s*\{([\s\S]*?)\}/.exec(cssSrc);
  const sameGap = foldRule && groupRule && /display:\s*flex/.test(foldRule[1]) && /gap:\s*6px/.test(foldRule[1])
    && /gap:\s*6px/.test(groupRule[1]);
  sameGap ? ok('静态 h3 与组标题同为 flex+gap:6px（箭头后间距一致）')
    : bad('折叠箭头间距未对齐', `fold=${!!foldRule} group=${!!groupRule}`);

  // ============ ⑥ 感叹号单气泡 + help 光标 ============
  console.log('\n[⑥ 感叹号/悬浮光标]');
  const d6 = await page.evaluate(() => {
    const warn = document.getElementById('h-drain-warn');
    return { hasDataTip: !!warn?.hasAttribute('data-tip'), exists: !!warn };
  });
  const mainSrc = src('../src/main.js');
  !d6.hasDataTip && mainSrc.includes("setAttribute('aria-label', warnTip)") && !mainSrc.includes('hDrainWarn.dataset.tip = warnTip')
    ? ok('感叹号无 data-tip 双弹（aria-label 语义保留）') : bad('感叹号气泡未清理', JSON.stringify(d6));
  const d6b = await page.evaluate(() => {
    const el = document.getElementById('h-output-stat') || document.getElementById('h-drain-stat');
    return el ? getComputedStyle(el).cursor : '';
  });
  d6b === 'help' ? ok('顶栏产出/消耗悬浮光标为 help（问号）') : bad('悬浮光标非 help', d6b);

  // ============ ⑦ 裂隙三项互斥开关 + 去文案 ============
  console.log('\n[⑦ 裂隙三开关]');
  const d7 = await page.evaluate(() => {
    const S = window.S, q = window.__qa;
    S.riftEmber = 1e6;
    q.sim.switchTab('rift-tab'); q.sim.render();
    const panel = document.getElementById('rift-tab-panel');
    const names = ['auto_seal', 'auto_embrace', 'auto_descent'];
    // 先买三项（余烬足够）
    for (const id of names) {
      const btn = panel.querySelector(`[data-rift-buy="${id}"]`);
      if (btn && !btn.disabled) btn.click();
      q.sim.render();
    }
    const toggles = names.map(id => !!panel.querySelector(`[data-rift-auto="${id}"]`));
    const lvText = (panel.textContent || '').includes('Lv.0/1');
    // 互斥：依次开启，S.riftAuto 只指向最后一个
    for (const id of names) {
      const t = panel.querySelector(`[data-rift-auto="${id}"]`);
      if (t) { t.click(); q.sim.render(); }
    }
    return { toggles, finalAuto: S.riftAuto, lvText,
      text: (panel.textContent || '').replace(/\s+/g, ' ') };
  });
  d7.toggles.every(Boolean) ? ok('三项均有互斥开关（含无限深入）') : bad('三项开关不齐', JSON.stringify(d7.toggles));
  d7.finalAuto === 'auto_descent' ? ok('依次开启后互斥态只留最后一项', d7.finalAuto)
    : bad('互斥态异常', d7.finalAuto);
  !d7.text.includes('-20% EP 换爆发') && !d7.text.includes('开关在左侧') ? ok('括号说明文案已删') : bad('旧文案残留', d7.text.slice(0, 200));

  // ============ ⑧ CH4 链路（源码级） ============
  console.log('\n[⑧ CH4 链路重标定]');
  const expSrc = src('../src/modules/expedition.js');
  const moon = /id: 'moon'[\s\S]*?cost: \{ ep: ([\d.e]+),\s*rp: ([\d.e]+),\s*pt: ([\d.e]+) \}/.exec(expSrc);
  moon && +moon[2] <= 1000 && +moon[3] <= 1000 ? ok('moon 远征 RP/PT 门槛降至 ≤1e3', moon && `ep=${moon[1]} rp=${moon[2]} pt=${moon[3]}`)
    : bad('moon 成本未降', moon && moon.slice(1).join('/'));
  moon && +moon[1] === 1e6 ? ok('moon EP 门槛保持 1e6（数量级链不变）') : bad('moon EP 被误改', moon && moon[1]);
  const plSrc = src('../tests/chapters/_player.mjs');
  plSrc.includes('data-hatch-upg') && plSrc.includes('data-pt-distill-toggle')
    ? ok('自动玩家补 hatch PT 入口 + 满仓暂停解锁（EP 扩容不再死锁）') : bad('自动玩家 PT 入口缺失');
  const budgetSrc = src('../tests/chapters/budget.mjs');
  // v4.3.4 反转：旧断言锁「未重标定占位值」；CH4 已独立批次重标定（minPrestige 5→2、
  //   carry 12→10、maxDays 16→120），断言改为锁新校准值——防后续批次静默改回。
  /4: \{ minPrestige: 2,[\s\S]*?maxDays: 120,[\s\S]*?carry: \{ prestige: 10, es: 120/.test(budgetSrc)
    ? ok('ch4 预算表已重标定（v4.3.4：minPrestige 2 / carry 10 / maxDays 120）') : bad('ch4 预算链被破坏');
  // v4.3.5：ch6/16/17 信仰门槛断链修复——自动玩家宗教段必须走产品入口（唤醒/信奉/圣所）。
  plSrc.includes('data-religion-unlock') && plSrc.includes('data-religion-temple')
    ? ok('自动玩家宗教入口已补（唤醒 + 圣所，ch6/16/17 信仰链打通）') : bad('自动玩家宗教入口缺失');

  // ============ ⑨ 0 pageerror ============
  console.log('\n[⑨ pageerror]');
  errors.length === 0 ? ok('0 pageerror') : bad(`${errors.length} 个 pageerror`, errors.slice(0, 3).join(' | '));

  console.log(`\n=== v4.3.3 专项：${pass} PASS / ${fail} FAIL ===`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
}
