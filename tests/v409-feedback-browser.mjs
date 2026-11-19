// v4.0.9 十二项反馈专项浏览器验收（真实 DOM / 真实指针 / computed style）
//
// 覆盖（F5 多分辨率由 v409-multires-browser.mjs 独立覆盖）：
//   F1 班组下拉框跟随皮肤配色（abyss 暗 / light 浅 computed style 对比）
//   F2 研究点顶部说明压 1-2 行（.stat 收成一行、蒸馏按钮并入同行）
//   F3 「+ 新建初始空档」生成全新初始存档入槽且不触碰当前进度
//   F4 Wiki 新增 3 章（星空与远征 / 永恒矩阵 / 许愿池与彩蛋）+ intro AI 指路 + unlock 表六组
//   F7 商店页补能间组（v4.2.9 前名产出强化）/ 设施 h3 接入收起 + 字体向 rp-group-title 看齐
//   F8 自动购建激活入口迁入研究点「AI 助手」类目（二次确认 → 激活 → 卡消失）
//   F9 储备扩容（v4.2.9 前名存储扩容）独立成组 + 「研究升级」大类标题删除
//   F10 政策待选组 NEW 角标（路线抉择组 → 选定后移交路线深化组）
//   F11 成就一页 5 条 + 分页
//   F12 8 个自动转化开关/能力字段显式声明（S 上可读且为默认值）
//
// 用法：node tests/v409-feedback-browser.mjs   （Chrome 路径走 tests/_chrome.mjs 单源）
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const REPORT = process.env.REPORT || '/tmp/v409-feedback-report.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
// 存档满足各断言前置：
//   rp 锚点（rp_vault）→ RP tab 可开；rpTheories prod=4 → store/res 组解锁、res=4 → ai 组解锁
//   tech.ai_core → ai-card 可见 + rp_ai 门控开；resDiscovered 全 true → 自动购建激活条件
//   prestige=2 → 政策 route 组开放；religion.unlocked → faith 组开放（route 仍在最前）
//   cultists 10 → 班组面板显（筛选 select 存在）；achievements 7 条 → 成就分页 5+2
//   eternal.skin_light → 浅色皮肤已拥有（可切换）
const mkSave = () => JSON.stringify({
  _version: 6, chapter: 8, ep: 8e5, rp: 1e6, es: 0, dm: 0, pt: 0, faith: 0,
  upgrades: { reserve_bin: 12, rp_vault: 1 },
  // canteen（基础四栋）已建成 → anyBuilt=true → renderBuildings 不提前返回，设施 h3 折叠绑定生效；
  // 注意 warmup_node 属 v21 表，不计入 anyBuilt 判定
  buildings: { canteen: 1, warmup_node: 1 },
  unlockedBuildings: { warmup_node: true, eff_tower: true },
  cultists: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: '线程 ' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: { ai_core: 1 }, focusLevel: 10,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
  prestige: 2, projectsDone: 10, prestigePoints: 3, // v4.2.3：任务 9→10（v4.2.1 起深化组门槛=职级≥3 或任务≥10）
  rpTheories: { rp_entropy: 2, rp_matrix: 2, rp_wage: 4 },
  achievements: { ep1k: 1, ep100k: 1, ep1m: 1, own10: 1, thread3: 1, thread10: 1, pre1: 1 },
  eternal: { skin_light: 1, skin_ember: 1 },
  religion: { unlocked: true },
  policies: {},
  lastSeen: NOW, startTime: NOW,
});

const lum = (c) => { // rgb() 字符串 → 亮度（0~255）
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  return m ? Math.round(0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) : -1;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const results = {};
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1600, height: 960 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, mkSave());
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(1500);

  // ============ F1a 班组下拉框（abyss 暗色主题基准） ============
  console.log('\n[F1a] 班组筛选下拉框：abyss 主题配色');
  const selAbyss = await page.evaluate(() => {
    const sel = document.querySelector('[data-crew-filter-select]');
    if (!sel) return { exists: false };
    const cs = getComputedStyle(sel);
    return { exists: true, bg: cs.backgroundColor, fg: cs.color, border: cs.borderTopColor };
  });
  results.selAbyss = selAbyss;
  selAbyss.exists ? ok('班组筛选 select 存在', '') : bad('班组筛选 select 缺失（班组面板未显？）', '');
  const abyssLum = lum(selAbyss.bg);
  abyssLum >= 0 && abyssLum < 90 ? ok('abyss 主题下 select 底色为深色', `${selAbyss.bg}（亮度 ${abyssLum}）`) : bad('abyss select 底色异常', selAbyss.bg);
  abyssLum >= 0 && lum(selAbyss.fg) > 140 ? ok('abyss select 字色为浅色（对比可读）', `${selAbyss.fg}（亮度 ${lum(selAbyss.fg)}）`) : bad('abyss select 字色过暗', selAbyss.fg);

  // ============ F2 研究点顶部说明压行 ============
  console.log('\n[F2] 研究点顶部说明 1-2 行');
  await page.click('#btn-rp');
  await sleep(500);
  const rpHead = await page.evaluate(() => {
    const panel = document.getElementById('rp-panel');
    if (!panel) return { exists: false };
    const stats = panel.querySelectorAll('.stat');
    const preview = document.getElementById('rp-distill-preview');
    const btn = document.getElementById('rp-distill-btn');
    return {
      exists: true,
      statCount: stats.length,
      statHasRp: stats[0] ? stats[0].textContent.includes('当前 RP') : false,
      hasPreview: !!preview,
      btnInSameRow: !!(btn && btn.parentElement === panel.querySelector('div[style*="flex"]')),
      btnText: btn ? btn.textContent.trim().slice(0, 40) : '',
    };
  });
  results.rpHead = rpHead;
  rpHead.exists ? ok('RP 面板已渲染', '') : bad('RP 面板未渲染', '');
  // v4.3.5 反馈⑤：「当前 RP X / Y」行删除（顶栏 🔬RP 已有同口径当前值）——断言反转为「不存在」
  rpHead.statCount === 0 ? ok('「当前 RP」行已删（顶栏承载）', `count=${rpHead.statCount}`) : bad('.stat 行仍在', `count=${rpHead.statCount}`);
  !rpHead.hasPreview ? ok('「预计 N RP」独立 span 已并入按钮文案', '') : bad('#rp-distill-preview 仍存在', '');
  /\/EP \+/.test(rpHead.btnText) ? ok('效率口径并入按钮文案（v4.2.9 紧凑格式 -X/EP +NRP）', rpHead.btnText) : bad('按钮缺效率信息', rpHead.btnText);

  // ============ F8 自动购建激活入口迁研究点 ============
  console.log('\n[F8] 自动购建激活入口（研究点 AI 助手类目）');
  const ab0 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-auto-build-activate]')];
    const card = cards[0];
    return {
      count: cards.length,
      inRpList: card ? !!card.closest('#research-upgrade-list') : false,
      aiGroup: card ? !!card.closest('[data-rp-fold="ai"]') || !!(card.parentElement && card.parentElement.previousElementSibling && /AI 助手/.test(card.parentElement.previousElementSibling.textContent)) : false,
      text: card ? card.textContent.replace(/\s+/g, ' ').slice(0, 60) : '',
      rpBefore: window.S.rp,
      abBefore: !!(window.S.ai && window.S.ai.autoBuildUnlocked),
    };
  });
  results.ab0 = ab0;
  ab0.count === 1 ? ok('激活卡全文档唯一', `count=${ab0.count}`) : bad('激活卡数量异常', `count=${ab0.count}`);
  ab0.inRpList ? ok('激活卡位于研究点页', '') : bad('激活卡不在研究点页', '');
  ab0.aiGroup ? ok('激活卡归入 AI 助手类目', '') : bad('激活卡不在 AI 助手组', '');
  /自动购建/.test(ab0.text) ? ok('卡面文案含「自动购建」', ab0.text) : bad('卡面文案不符', ab0.text);
  // 真实点击：第一次 → 二次确认态；第二次 → 激活
  const abCard = await page.$('[data-auto-build-activate]');
  await abCard.click();
  await sleep(250);
  const confirmState = await page.evaluate(() => {
    const c = document.querySelector('[data-auto-build-activate]');
    return c ? c.querySelector('.cost').textContent : '(gone)';
  });
  /再次点击确认/.test(confirmState) ? ok('首点进入二次确认态（防误触）', confirmState) : bad('首点未进入确认态', confirmState);
  await abCard.click(); // 4s 内再点确认
  await sleep(400);
  const ab1 = await page.evaluate(() => ({
    unlocked: !!(window.S.ai && window.S.ai.autoBuildUnlocked),
    rpAfter: window.S.rp,
    cardGone: !document.querySelector('[data-auto-build-activate]'),
  }));
  results.ab1 = ab1;
  ab1.unlocked ? ok('再点确认激活成功（S.ai.autoBuildUnlocked）', '') : bad('激活失败', '');
  ab0.rpBefore - ab1.rpAfter >= 1000 ? ok(`RP 扣费 ${ab0.rpBefore} → ${ab1.rpAfter}`, `Δ=${ab0.rpBefore - ab1.rpAfter}`) : bad('RP 扣费异常', `${ab0.rpBefore} → ${ab1.rpAfter}`);
  ab1.cardGone ? ok('激活后卡面消失（一次性入口）', '') : bad('激活卡仍残留', '');

  // ============ F9 储备扩容组 + 大类标题删除 ============
  // v4.2.9 反馈⑦：组名「存储扩容」→「储备扩容」；断言口径同步（data-rp-fold key 不变）
  console.log('\n[F9] 储备扩容独立成组 + 「研究升级」标题删除');
  const f9 = await page.evaluate(() => {
    const list = document.getElementById('research-upgrade-list');
    const storeTitle = list && list.querySelector('[data-rp-fold="store"]');
    const prodTitle = list && list.querySelector('[data-rp-fold="prod"]');
    const tabRp = document.getElementById('tab-rp');
    const bigH3 = tabRp ? [...tabRp.querySelectorAll('h3')].find(h => h.textContent.replace(/\s+/g, '') === '研究升级') : null;
    return {
      storeTitle: !!storeTitle,
      storeText: storeTitle ? storeTitle.textContent.replace(/^▼|^▶/, '').trim() : '',
      prodFirst: !!(prodTitle && storeTitle && prodTitle.compareDocumentPosition(storeTitle) & Node.DOCUMENT_POSITION_FOLLOWING),
      bigH3Gone: !bigH3,
      storageCard: !!(list && list.querySelector('[data-research="rp_storage"]')),
    };
  });
  results.f9 = f9;
  f9.storeTitle ? ok('「储备扩容」组标题存在', f9.storeText) : bad('储备扩容组缺失', '');
  f9.prodFirst ? ok('储备扩容位于产能研究之后（链序）', '') : bad('组序异常', '');
  f9.bigH3Gone ? ok('「研究升级」大类 h3 已删除', '') : bad('大类标题残留', '');
  f9.storageCard ? ok('rp_storage 卡归入储备扩容组', '') : bad('rp_storage 卡缺失', '');

  // ============ F7 商店页字体统一 + 收起 ============
  console.log('\n[F7] 商店页：补能间组（原产出强化）/ 设施 h3 字体统一 + 收起');
  await page.click('#btn-shop');
  await sleep(600);
  const f7a = await page.evaluate(() => {
    const t = document.querySelector('#thread-shop .group-title');
    const bld = document.getElementById('bld-title');
    const grid = document.getElementById('building-list');
    return {
      threadTitle: !!t,
      threadCls: t ? t.className : '',
      threadFontSize: t ? getComputedStyle(t).fontSize : '',
      threadColor: t ? getComputedStyle(t).color : '',
      threadCursor: t ? getComputedStyle(t).cursor : '',
      bldCls: bld ? bld.className : '',
      bldFontSize: bld ? getComputedStyle(bld).fontSize : '',
      bldColor: bld ? getComputedStyle(bld).color : '',
      bldCursor: bld ? getComputedStyle(bld).cursor : '',
      bldHasArrow: !!(bld && bld.querySelector('.rp-fold-arrow')),
      gridVisible: grid ? getComputedStyle(grid).display !== 'none' : false,
    };
  });
  results.f7a = f7a;
  f7a.threadTitle ? ok('补能间组标题已渲染', '') : bad('补能间组标题缺失', '');
  /rp-group-title/.test(f7a.threadCls) ? ok('补能间组复用 rp-group-title 折叠样式', f7a.threadCls) : bad('组类名不符', f7a.threadCls);
  f7a.threadFontSize === '13px' ? ok('补能间组字号 13px（向研究点看齐）', f7a.threadFontSize) : bad('字号不符', f7a.threadFontSize);
  f7a.threadCursor === 'pointer' ? ok('补能间组整行可点', '') : bad('cursor 非 pointer', f7a.threadCursor);
  /foldable-h3/.test(f7a.bldCls) ? ok('设施 h3 接入 foldable-h3', f7a.bldCls) : bad('设施 h3 未接入', f7a.bldCls);
  f7a.bldFontSize === '13px' ? ok('设施 h3 字号 13px（v4.2.5 与 rp-group-title 完全一致）', f7a.bldFontSize) : bad('设施 h3 字号不符', f7a.bldFontSize); // v4.2.5 反馈①：12.5px → 13px 统一口径
  f7a.bldHasArrow ? ok('设施 h3 带折叠箭头', '') : bad('设施 h3 缺箭头', '');
  // 真实点击收起/展开：设施 h3（v4.2.9 反馈③：只收本分区 building-list——
  //   隐藏 h3（线程强化/效能建筑标题）也是边界，不再连带收 #thread-shop/#v21-building-list）
  await page.click('#bld-title');
  await sleep(300);
  const folded = await page.evaluate(() => {
    const grid = document.getElementById('building-list');
    const thread = document.getElementById('thread-shop');
    const v21 = document.getElementById('v21-building-list');
    const arrow = document.querySelector('#bld-title .rp-fold-arrow');
    return {
      grid: getComputedStyle(grid).display,
      thread: thread ? getComputedStyle(thread).display : '(none-el)',
      v21: v21 ? getComputedStyle(v21).display : '(none-el)',
      arrow: arrow ? arrow.textContent : '',
    };
  });
  results.folded = folded;
  folded.grid === 'none' ? ok('点击设施标题 → 设施列表收起', '') : bad('设施列表未收起', folded.grid);
  folded.thread !== 'none' && folded.v21 !== 'none' ? ok('尾部补能间/锅炉房区不被连带收起（v4.2.9 反馈③）', `thread=${folded.thread} v21=${folded.v21}`) : bad('尾部区被越界收起', JSON.stringify(folded));
  folded.arrow === '▶' ? ok('收起态箭头 ▶', '') : bad('箭头未翻转', folded.arrow);
  await page.click('#bld-title');
  await sleep(300);
  const unfolded = await page.evaluate(() => {
    const grid = document.getElementById('building-list');
    const arrow = document.querySelector('#bld-title .rp-fold-arrow');
    return { grid: getComputedStyle(grid).display, arrow: arrow ? arrow.textContent : '' };
  });
  unfolded.grid !== 'none' ? ok('再点展开恢复', '') : bad('展开失败', unfolded.grid);
  unfolded.arrow === '▼' ? ok('展开态箭头 ▼', '') : bad('箭头未复原', unfolded.arrow);
  // 补能间组收起（#thread-shop 内 group-title）
  const ttHandle = await page.$('#thread-shop .group-title');
  if (ttHandle) {
    await ttHandle.click();
    await sleep(250);
    const tg = await page.evaluate(() => {
      const t = document.querySelector('#thread-shop .group-title');
      let sib = t.nextElementSibling, hidden = [];
      while (sib) { hidden.push({ tag: sib.tagName, disp: getComputedStyle(sib).display, cls: sib.className }); sib = sib.nextElementSibling; }
      return hidden;
    });
    results.threadFold = tg;
    tg.every(x => x.disp === 'none') ? ok('补能间组点击 → 组内卡全部收起', JSON.stringify(tg.map(x => x.tag))) : bad('补能间收起不净', JSON.stringify(tg));
    await ttHandle.click();
    await sleep(250);
    const tg2 = await page.evaluate(() => {
      const t = document.querySelector('#thread-shop .group-title');
      let sib = t.nextElementSibling, vis = 0;
      while (sib) { if (getComputedStyle(sib).display !== 'none') vis++; sib = sib.nextElementSibling; }
      return vis;
    });
    tg2 > 0 ? ok('补能间组再点恢复', `可见兄弟 ${tg2}`) : bad('补能间未恢复', '');
  } else bad('补能间组标题 handle 未取到', '');

  // ============ F10 政策 NEW 角标 ============
  console.log('\n[F10] 政策待选组 NEW 角标');
  const polBtnDisabled = await page.$eval('#btn-policy', b => b.disabled);
  !polBtnDisabled ? ok('政策 tab 已解锁（prestige≥1）', '') : bad('政策 tab 被锁', 'disabled');
  await page.click('#btn-policy');
  await sleep(500);
  const f10a = await page.evaluate(() => {
    const badge = document.querySelector('#policy-panel .policy-new-badge');
    const title = badge ? badge.parentElement : null;
    return {
      exists: !!badge,
      text: badge ? badge.textContent : '',
      group: title ? title.textContent.replace('NEW', '').trim().slice(0, 20) : '',
      visible: badge ? getComputedStyle(badge).display !== 'none' : false,
    };
  });
  results.f10a = f10a;
  f10a.exists ? ok('待选组标题带 NEW 角标', '') : bad('NEW 角标缺失', '');
  f10a.text === 'NEW' ? ok('角标文案 NEW', f10a.text) : bad('角标文案不符', f10a.text);
  /路线抉择/.test(f10a.group) ? ok('角标挂在「路线抉择」组', f10a.group) : bad('角标组不符', f10a.group);
  // 选定 route 政策 → 角标移交下一待选组（路线深化）
  await page.click('#policy-panel [data-policy-group="route"][data-policy="order_route"]');
  await sleep(500);
  const f10b = await page.evaluate(() => {
    const badge = document.querySelector('#policy-panel .policy-new-badge');
    const title = badge ? badge.parentElement : null;
    const deepenOpen = [...document.querySelectorAll('#policy-panel .item')].some(i => /秩序深化|深渊深化/.test(i.textContent));
    return { badgeGroup: title ? title.textContent.replace('NEW', '').trim().slice(0, 20) : '(gone)', deepenOpen };
  });
  results.f10b = f10b;
  /路线深化/.test(f10b.badgeGroup) ? ok('选定路线后角标移交「路线深化」（新组可选仍醒目）', f10b.badgeGroup) : bad('选定后角标行为不符', f10b.badgeGroup);
  f10b.deepenOpen ? ok('深化组候选卡已展示', '') : bad('深化组未展示', '');

  // ============ F11 成就一页 5 条 ============
  console.log('\n[F11] 成就一页 5 条 + 分页');
  const f11a = await page.evaluate(() => {
    const panel = document.getElementById('achievement-panel');
    if (!panel) return { exists: false };
    const cards = panel.querySelectorAll('.ach-card');
    const pager = panel.querySelector('.crew-pager');
    return {
      exists: true,
      cards: cards.length,
      pagerText: pager ? pager.textContent.replace(/\s+/g, ' ').trim() : '',
      h3: document.getElementById('achievement-h3') ? document.getElementById('achievement-h3').textContent.replace(/\s+/g, ' ').trim() : '',
    };
  });
  results.f11a = f11a;
  f11a.exists ? ok('成就面板渲染', '') : bad('成就面板缺失', '');
  f11a.cards === 5 ? ok('一页只显示 5 条成就', `cards=${f11a.cards}`) : bad('页内条数不符', `cards=${f11a.cards}`);
  // 运行期 checkAch 可能继续解锁新成就（种子 7 条 → 页面上限仍为 5 条/页），断言只锁PageSize口径
  // v4.3.5 反馈③：翻页按钮移除 → 进度文案「已展示 N / M 项 · 下滑加载更多」；翻页改纯滚动。
  /已展示 5 \/ \d+ 项/.test(f11a.pagerText) ? ok('分页器进度文案「已展示 5/N 项」（无按钮）', f11a.pagerText) : bad('分页器文本不符', f11a.pagerText);
  const f11total = Math.max(7, parseInt((/已展示 5 \/ (\d+) 项/.exec(f11a.pagerText) || [0, 7])[1], 10));
  const f11pages = Math.ceil(f11total / 5);
  // v4.3.5 反馈③：按钮已删——翻页走滚动（列表滚到底触发下一页）
  const f11b = await page.evaluate(async () => {
    const list = document.getElementById('achievement-panel');
    list.style.maxHeight = '120px';
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll'));
    await new Promise(r => setTimeout(r, 300));
    return {
      cards: document.querySelectorAll('#achievement-panel .ach-card').length,
      pager: document.querySelector('#achievement-panel .crew-pager').textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  results.f11b = f11b;
  f11b.cards >= 1 && f11b.cards <= 5 ? ok(`翻页后仍 ≤5 条（实际 ${f11b.cards}）`, `cards=${f11b.cards}`) : bad('第二页条数异常', `cards=${f11b.cards}`);
  f11pages >= 2 ? ok(`多页成就（${f11total} 项 → ${f11pages} 页）`, '') : bad('种子成就不足以分页', '');
  // v4.3.5 反馈③：进度文案推进到「已展示 10/N」（滚动翻页生效）
  /已展示 10 \/ \d+ 项/.test(f11b.pager) ? ok('滚动后进度推进（已展示 10/N）', `pager=${f11b.pager}`) : bad('进度未推进', `cards=${f11b.cards} pager=${f11b.pager}`);

  // ============ F3 新建初始空档 ============
  console.log('\n[F3] + 新建初始空档');
  await page.hover('#sys-menu-btn'); // v4.3.3 反馈③：先展开选项下拉
  await page.hover('#save-menu-btn');
  await sleep(350);
  const f3label = await page.$eval('#save-new', b => b.textContent.trim());
  f3label === '+ 新建' ? ok('按钮文案「+ 新建」', f3label) : bad('按钮文案不符', f3label);
  await page.click('#save-new');
  await sleep(400);
  const f3 = await page.evaluate(() => {
    const raw = localStorage.getItem('abyss_idle_v2_snapshots');
    const list = raw ? JSON.parse(raw) : [];
    const cur = JSON.parse(localStorage.getItem('abyss_idle_v2'));
    const cnt = document.getElementById('save-count');
    const first = document.querySelector('#save-list .snap-row .name span');
    let dataOk = false;
    try { const d = JSON.parse(list[0].data); dataOk = String(d.chapter) === '1' && (d.prestige || 0) === 0 && d.cultists.length === 0; } catch { /* noop */ }
    return {
      count: list.length,
      name: list[0] ? list[0].name : '',
      dataOk,
      curChapter: cur.chapter,
      curPrestige: cur.prestige,
      saveCount: cnt ? cnt.textContent : '',
      firstRow: first ? first.textContent.trim() : '',
    };
  });
  results.f3 = f3;
  f3.count === 1 ? ok('快照槽新增 1 条', `count=${f3.count}`) : bad('快照数量异常', `count=${f3.count}`);
  f3.name === '初始空档' ? ok('条目名「初始空档」', f3.name) : bad('条目名不符', f3.name);
  f3.dataOk ? ok('快照数据为全新初始档（chapter=1 / prestige=0 / 无线程）', '') : bad('快照数据非初始态', '');
  f3.curChapter === 8 && f3.curPrestige === 2 ? ok(`当前进度未受影响（chapter=${f3.curChapter} / prestige=${f3.curPrestige}）`, '') : bad('当前进度被污染', JSON.stringify({ c: f3.curChapter, p: f3.curPrestige }));
  f3.saveCount === '1/3' ? ok('存档计数 1/3', f3.saveCount) : bad('计数不符', f3.saveCount);
  /初始空档/.test(f3.firstRow) ? ok('列表首行展示初始空档', f3.firstRow) : bad('列表未刷新', f3.firstRow);

  // ============ F4 Wiki 三新章 + AI 指路 + unlock 六组 ============
  console.log('\n[F4] Wiki 新章节与指路');
  await page.click('#btn-wiki');
  await sleep(450);
  const f4a = await page.evaluate(() => {
    const modal = document.getElementById('wiki-modal');
    const names = [...document.querySelectorAll('#wiki-nav [data-wiki]')].map(b => b.textContent.trim());
    return { open: getComputedStyle(modal).display === 'flex', names };
  });
  results.f4a = f4a;
  f4a.open ? ok('Wiki 弹框打开', '') : bad('Wiki 未打开', '');
  ['星空与远征', '永恒矩阵', '许愿池与彩蛋'].every(n => f4a.names.includes(n))
    ? ok('三个新章节按钮齐全', f4a.names.filter(n => ['星空与远征', '永恒矩阵', '许愿池与彩蛋'].includes(n)).join(' / '))
    : bad('新章节按钮缺失', JSON.stringify(f4a.names));
  await page.click('[data-wiki="expedition"]');
  await sleep(300);
  const f4b = await page.evaluate(() => {
    const body = document.getElementById('wiki-body').textContent;
    return {
      title: document.querySelector('#wiki-body .wiki-title') ? document.querySelector('#wiki-body .wiki-title').textContent : '',
      hasMoon: body.includes('月球基地'), hasMars: body.includes('火星前哨'), hasAndromeda: body.includes('仙女座'),
    };
  });
  results.f4b = f4b;
  f4b.title === '星空与远征' ? ok('远征章节标题正确', f4b.title) : bad('章节标题不符', f4b.title);
  f4b.hasMoon && f4b.hasMars && f4b.hasAndromeda ? ok('六星系目的地名进入章节正文', '月球基地/火星前哨/仙女座…') : bad('星系内容缺失', JSON.stringify(f4b));
  await page.click('[data-wiki="intro"]');
  await sleep(300);
  const f4c = await page.evaluate(() => document.getElementById('wiki-body').textContent.includes('AI 助手'));
  f4c ? ok('intro 含「想找 AI 助手」指路段', '') : bad('intro 缺 AI 指路', '');
  await page.click('[data-wiki="unlock"]');
  await sleep(300);
  const f4d = await page.evaluate(() => {
    const body = document.getElementById('wiki-body').textContent;
    return { store: body.includes('储备扩容'), six: /分六组|产能研究/.test(body) }; // v4.2.9 ⑦：组名改产能研究/储备扩容
  });
  results.f4d = f4d;
  f4d.store && f4d.six ? ok('unlock 表同步六组口径（含储备扩容）', '') : bad('unlock 表未同步', JSON.stringify(f4d));
  await page.click('#wiki-x');
  await sleep(250);

  // ============ F12 转化开关字段声明 ============
  console.log('\n[F12] 8 个转化开关/能力字段显式声明');
  const f12 = await page.evaluate(() => {
    const S = window.S;
    return {
      converterOn: S.converterOn, atriumOn: S.atriumOn, probe: S._probeEnabled,
      ptDistill: S.ptDistillOn, ptAutoHatch: S.ptAutoHatch, ptHatchLv: S.ptHatchLv,
      riftAuto: S.riftAuto, autoPurify: S.autoPurify,
    };
  });
  results.f12 = f12;
  // converterOn 读侧是对象（threadBinding.converterEnabled 按 S.converterOn[type] === false 判关）
  const f12Expect = {
    converterVehicles: f12.converterOn && f12.converterOn.vehicles, converterAtrium: f12.converterOn && f12.converterOn.atrium,
    atriumOn: f12.atriumOn, probe: f12.probe, ptDistill: f12.ptDistill,
    ptAutoHatch: f12.ptAutoHatch, ptHatchLv: f12.ptHatchLv, riftAuto: f12.riftAuto, autoPurify: f12.autoPurify,
  };
  const f12Want = { converterVehicles: true, converterAtrium: true, atriumOn: true, probe: true, ptDistill: true, ptAutoHatch: false, ptHatchLv: 1, riftAuto: null, autoPurify: false };
  const f12Bad = Object.entries(f12Want).filter(([k, v]) => f12Expect[k] !== v);
  f12Bad.length === 0 ? ok('8 键默认值与读侧一致（无 undefined）', JSON.stringify(f12)) : bad('存在未声明/错值键', JSON.stringify(f12Bad));

  // ============ F1b 浅色皮肤下 select 跟随主题 ============
  console.log('\n[F1b] 浅色皮肤（light）下 select 跟随主题');
  await page.hover('#sys-menu-btn'); // v4.3.3 反馈③：先展开选项下拉
  await page.hover('#skin-menu-btn');
  await sleep(350);
  await page.click('[data-skin="light"]');
  await sleep(500);
  const f1b = await page.evaluate(() => {
    const root = document.documentElement;
    const sel = document.querySelector('[data-crew-filter-select]');
    const cs = getComputedStyle(sel);
    return {
      themeCls: root.className,
      bg: cs.backgroundColor, fg: cs.color, border: cs.borderTopColor,
      optBg: getComputedStyle(sel.querySelector('option')).backgroundColor,
    };
  });
  results.f1b = f1b;
  /theme-light/.test(f1b.themeCls) ? ok('light 皮肤已切换', f1b.themeCls) : bad('皮肤未切换', f1b.themeCls);
  const lightLum = lum(f1b.bg);
  lightLum > 200 ? ok('light 主题 select 底色为浅色', `${f1b.bg}（亮度 ${lightLum}）`) : bad('light select 底色仍深', f1b.bg);
  lum(f1b.fg) < 120 ? ok('light 主题 select 字色为深色（对比可读）', `${f1b.fg}（亮度 ${lum(f1b.fg)}）`) : bad('light select 字色过浅', f1b.fg);
  const optLum = lum(f1b.optBg);
  optLum > 200 ? ok('option 底色同步浅色（下拉展开不黑块）', `${f1b.optBg}（亮度 ${optLum}）`) : bad('option 底色未跟随', f1b.optBg);
  // 切回 abyss 复原（后续截图/报告干净）
  await page.hover('#sys-menu-btn'); // v4.3.3 反馈③：先展开选项下拉
  await page.hover('#skin-menu-btn');
  await sleep(300);
  await page.click('[data-skin="abyss"]');
  await sleep(300);

  // ============ 页面错误 ============
  errs.length === 0 ? ok('0 pageerror', '') : bad('页面有错误', errs.join(' | '));
} finally {
  await browser.close();
}

console.log(`\n========== v4.0.9 反馈专项：${pass} / ${fail} ==========`);
const fs = await import('fs');
try { fs.writeFileSync(REPORT, JSON.stringify(results, null, 2)); } catch { /* /tmp 不可写不阻塞 */ }
process.exit(fail === 0 ? 0 : 1);
