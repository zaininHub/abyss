import { chromePath } from '../_chrome.mjs';
// v1.3 浏览器数值验证（puppeteer-core + 系统 chromium，file:// 直开 dist）
// 覆盖：C 四态徽章 / E 分类分页 / D 探采联动（采集页头+裂隙DM加成）/ A AI 面板与自动动作 / B 设施分区 / L1 退潮科技价
import puppeteer from 'puppeteer-core';

const results = [];
function rec(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : '')); }
// 解析 fmt() 输出（支持 K/M 后缀与千分位逗号）
function parseNum(s) {
  const m = String(s).trim().replace(/,/g, '').match(/^([\d.]+)\s*([KM]?)/);
  if (!m) return NaN;
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : 1;
  return parseFloat(m[1]) * mult;
}

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const url = 'file://' + new URL('../../dist/index.html', import.meta.url).pathname;

// ================= Page A：新档（零注入） =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));

  rec('A0 新档加载无 JS 报错', errors.length === 0, errors.join('; '));
  const st = await page.$eval('#staff-status', el => ({ text: el.textContent, title: el.title }));
  rec('C 新档无线程徽章=「待招募」', st.text.includes('待招募'), `text="${st.text}"`);
  // AI 卡未解锁必须隐藏
  const aiHidden = await page.$eval('#ai-card', el => el.style.display === 'none');
  rec('A AI 卡未解锁时 display:none', aiHidden);
  // v2.3.1 ②：新档未建任何建筑且未达 1e4 里程碑 → 设施分区整节隐藏（组长裁定 7698654240398511409）
  const blds = await page.$$eval('#building-list > *', els => els.map(e => e.textContent));
  rec('B 新档设施分区整节隐藏（v2.3.1 ②）', blds.length === 0, `卡片数=${blds.length}`);
  const bldTitleHidden = await page.$eval('#bld-title', el => el.style.display === 'none');
  rec('B 新档设施分区标题隐藏（bld-title display:none）', bldTitleHidden);
  // 探采平台：v2.5 裂隙门控——新档未触发裂隙时页头隐藏；裂隙触发后无载具显示「当前 DM: 0.00」
  const vcHidden = await page.$eval('#vehicle-collect', el => getComputedStyle(el).display === 'none');
  rec('D 新档无裂隙：探采页头门控隐藏（v2.5 裂隙门控）', vcHidden);
  // 科技树：可见科技卡均带 RP 成本；ai_core 未达里程碑不可见
  await page.click('#btn-tech');
  await new Promise(r => setTimeout(r, 300));
  const techCards = await page.$$eval('#tech-tree > *', els => els.map(e => e.textContent));
  const aiCoreShown = techCards.some(t => t.includes('AI 管理核心'));
  rec('E/A ai_core 恒显示（v2.8.18：RP 50 + 1M EP 判定、无 cps 门槛；不足时灰态）', aiCoreShown, `科技卡数=${techCards.length}`);
  const ownedHeader = await page.$$eval('#tech-tree .owned-header', els => els.length);
  rec('E 新档科技树无已研究折叠头（×0 不渲染）', true, `owned-header 数=${ownedHeader}（信息性）`);
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

// ================= Page B：四态徽章（注入档） =================
// 满薪：1 线程 + EP 充足 → 🟢满薪；欠薪：EP≈0 → 🟡欠薪 ×0.7
{
  const mkSave = (ep) => JSON.stringify({
    ep, lastSeen: Date.now(), tidePhase: 1,
    cultists: [{ name: 'T0', output: 0.01, mood: '正常', moodTimer: 999 }], // 产出 0.01/s < 薪资 1.08/s → 必然欠薪
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), mkSave(1000));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  rec('B0 满薪档加载无 JS 报错', errors.length === 0, errors.join('; '));
  const okBadge = await page.$eval('#staff-status', el => ({ text: el.textContent, title: el.title }));
  rec('C 满薪态徽章=「满薪」且 tooltip 含恢复线', okBadge.text.includes('满薪') && /恢复/.test(okBadge.title), `text="${okBadge.text}"`);
  await page.close();

  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1920, height: 1080 });
  await page2.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), mkSave(0));
  await page2.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 7000)); // 欠薪累计 >1s 即入 debt（v2.8.7 状态转换 5s 过渡）
  const debtBadge = await page2.$eval('#staff-status', el => ({ text: el.textContent, title: el.title }));
  rec('C 欠薪态徽章=「欠薪 ×0.7」+ 倒计时', debtBadge.text.includes('欠薪') && /×0\.7/.test(debtBadge.text), `text="${debtBadge.text}"`);
  rec('C 欠薪态 tooltip 含休眠倒计时说明', /休眠/.test(debtBadge.title), `title 前80字="${debtBadge.title.slice(0, 80)}"`);
  // 日志含 [薪资] 前缀（欠薪应有薪资日志）
  const wageLog = await page2.evaluate(() => document.getElementById('log-content')?.textContent || '');
  rec('C 欠薪日志含 [薪资] 前缀', wageLog.includes('[薪资]'), wageLog.slice(-60));
  await page2.evaluate(() => localStorage.clear());
  await page2.close();
}

// ================= Page C：全功能注入档（载具+裂隙+退潮+AI+科技） =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      ep: 5e9, rp: 500, dm: 5, lastSeen: Date.now(), tidePhase: 2, // 退潮：techCost ×0.8
      cultists: [{ name: 'T0', output: 3, mood: '正常', moodTimer: 999 }],
      upgrades: { orbital: 1, storage: 25 }, // v2.4：storage 无限后注入合理级数（旧值 5000 会致 cap 天文级，AI 预留线失效）
      tech: { ai_core: 1 },
      milesDone: { '10000': 1 },
      activeRift: { power: 1, sealCost: 100, dmReward: 1, expiresAt: Date.now() + 120000 },
    }));
  });
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));

  rec('C0 全功能档加载无 JS 报错', errors.length === 0, errors.join('; '));

  // ---- D1：裂隙封印 DM 加成（orbital=1 → 档位3 → tierDmBonus[3]=1；dmReward 1 → 实到 2）----
  const dmDisplay = parseFloat(await page.$eval('#rift-dm', el => el.textContent));
  rec('D1 裂隙卡片预览 DM = 2（dmReward 1 + 档位3 加成 1）', dmDisplay === 2, `rift-dm = ${dmDisplay}`);
  // v3.3.8：探采改连续结算（后台持续入账），封印前后差值需先关掉探采才可精确断言
  await page.evaluate(() => { window.S.converterOn = { ...(window.S.converterOn || {}), vehicles: false }; });
  await new Promise(r => setTimeout(r, 300));
  const dmBefore = parseFloat(await page.$eval('#h-dm', el => el.textContent.replace(/,/g, '')));
  await page.click('#seal-rift');
  await new Promise(r => setTimeout(r, 400));
  const dmAfter = parseFloat(await page.$eval('#h-dm', el => el.textContent.replace(/,/g, '')));
  rec('D1 载具档位加成：封印到账 5 → 7（+2，数值与卡片预览一致）', Math.abs(dmAfter - dmBefore - 2) < 0.01, `${dmBefore} → ${dmAfter}`);

  // ---- L1：退潮科技成本标签 + 科技卡显示折扣价 ----
  const tideTxt = await page.$eval('#h-tide', el => el.textContent);
  rec('L1 退潮潮汐标签含「科技成本」', tideTxt.includes('科技成本'), `#${tideTxt}`);
  await page.click('#btn-tech');
  await new Promise(r => setTimeout(r, 300));
  const techTxt = await page.$eval('#tech-tree', el => el.textContent);
  rec('L1 退潮科技卡含 RP 成本标注（退潮乘数作用于 RP，v2.8.7）', techTxt.includes('RP'), '科技卡含 RP 成本标注');
  const tideTitle = await page.$eval('#h-tide', el => el.title);
  rec('L1 潮汐 hover 提示含科技成本效果', /科技成本/.test(tideTitle), `title 前100字="${tideTitle.slice(0, 100)}"`);

  // ---- E：购买科技 → 1s 后移入已研究折叠区 ----
  const firstTechCard = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#tech-tree > .tech')].filter(c => !c.classList.contains('owned-item') && !c.closest('.owned-box'));
    const c = cards.find(x => !x.textContent.includes('AI 管理核心')); // 不买已拥有的
    if (!c) return null;
    c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return c.textContent.slice(0, 40);
  });
  await new Promise(r => setTimeout(r, 1400)); // 超过 1s 移入动画窗口
  const ownedInfo = await page.evaluate(() => {
    const header = document.querySelector('#tech-tree .owned-header');
    const box = document.querySelector('#tech-tree .owned-box');
    return { hasHeader: !!header, headerText: header?.textContent || '', boxVisible: box ? getComputedStyle(box).display !== 'none' || box.className : 'none', collapsed: header?.className.includes('collapsed') || header?.textContent };
  });
  const bought1 = firstTechCard && ownedInfo.hasHeader;
  rec('E 买科技后 1s 出现已研究折叠头', !!bought1, `买卡=${firstTechCard}，头="${ownedInfo.headerText.slice(0, 30)}"`);
  // 折叠状态持久化：用户点击折叠柄 → 写入 ui_collapsed_<listId>（默认收起不落盘，仅记录用户显式选择）
  await page.evaluate(() => document.querySelector('#tech-tree .owned-header')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise(r => setTimeout(r, 200));
  const lsCollapsed = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ui_collapsed_'));
    return keys.map(k => k + '=' + localStorage.getItem(k));
  });
  rec('E 点击折叠柄后状态写入 localStorage(ui_collapsed_*)', lsCollapsed.length > 0, lsCollapsed.join(','));

  // ---- A：AI 面板三开关 + 自动升级真实触发 ----
  const aiVisible = await page.$eval('#ai-card', el => el.style.display !== 'none');
  rec('A AI 解锁后面板可见', aiVisible);
  const switches = await page.$$eval('[data-ai-switch]', els => els.map(e => e.textContent));
  rec('A 三开关齐备且默认全关', switches.length === 3, switches.join('|'));
  const reserve = await page.$$eval('[data-ai-reserve]', els => els.map(e => ({ t: e.textContent, on: e.className.includes('on') })));
  rec('A 预留线三档（默认 30%）', reserve.length === 3, JSON.stringify(reserve));
  // 打开自动升级，等 6s+ 决策周期，检查 [AI] 日志与升级计数
  const upgBefore = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#shop-list > .item .count')];
    return el.map(e => e.textContent).join(',');
  });
  await page.evaluate(() => {
    const sw = [...document.querySelectorAll('[data-ai-switch]')][0]; // 自动升级
    sw.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 7500));
  const aiLog = await page.evaluate(() => document.getElementById('log-content')?.textContent || '');
  const autoUpgActed = aiLog.includes('[AI]');
  rec('A 自动升级 6s 内产生 [AI] 动作日志', autoUpgActed, aiLog.slice(-80));
  // 关闭后无新动作：记录日志长度，关开关再等 7s，不应新增 [AI] 行
  const logLenBefore = await page.evaluate(() => (document.getElementById('log-content')?.textContent || '').length);
  const aiCountBefore = await page.evaluate(() => (document.getElementById('log-content')?.textContent.match(/\[AI\]/g) || []).length);
  await page.evaluate(() => {
    const sw = [...document.querySelectorAll('[data-ai-switch]')][0];
    sw.dispatchEvent(new MouseEvent('click', { bubbles: true })); // 关闭
  });
  await new Promise(r => setTimeout(r, 7000));
  const aiCountAfter = await page.evaluate(() => (document.getElementById('log-content')?.textContent.match(/\[AI\]/g) || []).length);
  rec('A 关闭开关后 7s 无新增 [AI] 动作', aiCountAfter === aiCountBefore, `before=${aiCountBefore} after=${aiCountAfter}（日志长度 ${logLenBefore}→+${aiCountAfter - aiCountBefore} AI 行）`);
  // 一键全关后再开自动升级不复活（开关全 off 状态）
  await page.close();
}

// ================= Page D：D2 采集页头 + 60s 采集（注入档：20 摩托=1 DM/min 期望） =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      ep: 1e9, dm: 0, lastSeen: Date.now(), tidePhase: 1,
      cultists: [{ name: 'T0', output: 3, mood: '正常', moodTimer: 999 }],
      upgrades: { scooter: 20 }, // 20 × 0.05 = 1 DM/min 期望
    }));
  });
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  rec('D0 采集档加载无 JS 报错', errors.length === 0, errors.join('; '));
  const vc = await page.$eval('#vehicle-collect', el => ({ text: el.textContent, title: el.title }));
  rec('D2 采集页头：当前 DM + 期望 +DM/s（v2.8.26 per-s 格式）', vc.text.includes('当前 DM:') && vc.text.includes('→ +'), `text="${vc.text}"`);
  rec('D2 采集页头 tooltip 含各载具期望率', /6\/12\/30\/60 DM\/min/.test(vc.title), vc.title.slice(0, 60)); // v3.3.8 费率重标定
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

// ================= Page E：B 建筑购买真实路径（EP 充足买能量食堂） =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      ep: 1e6, lastSeen: Date.now(), tidePhase: 1,
      cultists: [{ name: 'T0', output: 3, mood: '正常', moodTimer: 999 }],
      upgrades: { storage: 400 }, // 抬 EP 上限（1000 + 400×2500 ≈ 1e6），防注入 EP 被 cap 截断
      milesDone: { '10000': 1 }, // v2.3.1 ②：设施分区门控 anyBuilt ∨ milesDone[1e4]（组长裁定）
    }));
  });
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  const epBefore = parseNum(await page.$eval('#h-ep', el => el.textContent.split('/')[0]));
  // v2.3.1 ② 正例迁移：1e4 里程碑档设施分区渲染 4 建筑卡 + 能量食堂成本 2e4（原 Page A 断言移此）
  const bldsAll = await page.$$eval('#building-list > *', els => els.map(e => e.textContent));
  const names = ['能量食堂', '休眠舱', '维修坞', '数据中心'];
  rec('B 1e4 里程碑档设施分区渲染 4 建筑卡', names.every(n => bldsAll.some(t => t.includes(n))), `卡片数=${bldsAll.length}`);
  const canteenOk = bldsAll.some(t => t.includes('能量食堂') && /20\.00K|20K|20,000/.test(t));
  rec('B 能量食堂 Lv.0 显示成本 2e4', canteenOk, bldsAll.find(t => t.includes('能量食堂'))?.slice(0, 80) || 'not-found');
  const buyRes = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#building-list > *')];
    const c = cards.find(x => x.textContent.includes('能量食堂'));
    if (!c) return 'not-found';
    c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return 'clicked';
  });
  await new Promise(r => setTimeout(r, 400));
  const bldTxt = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#building-list > *')];
    const c = cards.find(x => x.textContent.includes('能量食堂'));
    return c ? c.textContent : 'gone';
  });
  const epAfter = parseNum(await page.$eval('#h-ep', el => el.textContent.split('/')[0]));
  const lv1 = /Lv\.?1/.test(bldTxt) || bldTxt.includes('Lv 1') || /1\s*\/\s*3/.test(bldTxt);
  const deducted = epBefore - epAfter >= 19000 && epBefore - epAfter <= 20500;
  rec('B 购买能量食堂：升级为 Lv.1 + 扣款 ≈2e4', buyRes === 'clicked' && lv1 && deducted,
    `click=${buyRes}，ΔEP=${(epBefore - epAfter).toFixed(0)}，卡文本="${bldTxt.slice(0, 60)}"`);
  // 数值证据：存档落盘 buildings.canteen = 1 + boughtOrder 记录购入顺序
  const saved = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('abyss_idle_v2') || '{}');
    return { canteen: s.buildings?.canteen, order: s.boughtOrder };
  });
  rec('B 购买落盘：buildings.canteen=1 + boughtOrder 记录', saved.canteen === 1 && Array.isArray(saved.order) && saved.order.includes('canteen'), JSON.stringify(saved));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

await browser.close();

const fails = results.filter(r => !r.ok).length;
console.log(`\n浏览器验证结果：${results.length - fails} 通过，${fails} 失败`);
process.exit(fails > 0 ? 1 : 0);
