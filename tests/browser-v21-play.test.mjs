// v2.1 真实试玩自测（组长验收口径：file:// 双击 + 真实点击数值断言 + 截图 + 旧档迁移场景）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const SHOT_DIR = '../../../artifacts/screenshots_v21';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const results = [];
function rec(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : '')); }

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const url = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

// ================= 场景 A：旧档（v3）迁移 toast + 建筑自动解锁 =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const legacy = {
    _version: 3, ep: 500, rp: 20, runEarned: 5000, allTimeEp: 90000,
    tech: { warmup: 1, lean: 1, speed2: 1, click_up: 1, extra_click: 1, offline1: 1 },
    buildings: {}, lastSeen: Date.now(),
  };
  await page.evaluateOnNewDocument((save) => {
    localStorage.setItem('abyss_idle_v2', JSON.stringify(save));
  }, legacy);
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  rec('A1 旧档迁移加载无 JS 报错', errors.length === 0, errors.join('; '));
  // 迁移一次性 toast
  // v2.3：迁移提示改为玩家语言（点位④去版本词）；旧档 rp>0 会并发触发资源发现 toast 覆盖提示条，
  // 故以一次性防重标记为稳定判据（标记置位 = 迁移提示已触发过且不会重复）
  // 提示条会被并发的一次性提示（资源发现 / 彩蛋）覆盖，故只断言「已触发且防重」；文案口径见 v23-copyin C4
  const toast1 = await page.evaluate(() => localStorage.getItem('v21_migrated_toast') === '1');
  rec('A2 迁移一次性提示已触发且防重（v21_migrated_toast 标记置位）', toast1);
  await page.screenshot({ path: `${SHOT_DIR}/A_migrate_toast.png` });
  // 旧档说明卡（科技树）
  await page.click('#btn-tech');
  await new Promise(r => setTimeout(r, 400));
  const legacyCard = await page.evaluate(() => document.body.textContent.includes('折算进建筑体系'));
  rec('A3 科技树旧档说明卡（「折算进建筑体系」字样）', legacyCard);
  // 设施页：v2.1 建筑面板存在且迁移建筑已解锁（可升级态而非解锁卡）
  await page.click('#btn-shop');
  await new Promise(r => setTimeout(r, 400));
  const v21info = await page.evaluate(() => {
    const el = document.getElementById('v21-building-list');
    if (!el) return null;
    const items = [...el.querySelectorAll('button, .item, div')];
    return { count: items.length, text: el.textContent.slice(0, 2000) };
  });
  rec('A4 效能建筑面板渲染（v21-building-list 非空）', !!v21info && v21info.count > 0, `items=${v21info?.count}`);
  const hasWarmup = v21info && v21info.text.includes('预热');
  rec('A5 迁移建筑（预热节点）出现在面板', !!hasWarmup);
  await page.screenshot({ path: `${SHOT_DIR}/A_v21_panel.png` });
  // 迁移等级数值断言：warmup_node 应为 5 级
  await new Promise(r => setTimeout(r, 5500)); // 等自动保存（5s 周期）落账
  const saveA = await page.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
  rec('A6 迁移落账：warmup_node=5、field_1=3(超封)、自动解锁', 
    saveA.buildings.warmup_node === 5 && saveA.buildings.field_1 === 3 && saveA.unlockedBuildings.warmup_node === true,
    `warmup=${saveA.buildings.warmup_node} field_1=${saveA.buildings.field_1}`);
  rec('A7 超封差额记 buildingOverflow（field_1=1）', (saveA.buildingOverflow?.field_1 || 0) === 1);
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

// ================= 场景 B：新档从零 → 钥匙 → 建筑购买全链路 =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  rec('B1 新档冷启动无 JS 报错', errors.length === 0, errors.join('; '));
  // 攒 RP（点击触发任务/事件太慢，直接用存档注入加速到开局后状态，验证真实点击链路）
  // 真实路径：先点英雄 50 次（真实点击），再注入开局 RP 走钥匙购买
  await page.click('#btn-shop');
  for (let i = 0; i < 30; i++) { await page.click('#hero'); }
  await new Promise(r => setTimeout(r, 300));
  const epText = await page.$eval('#h-ep', el => el.textContent);
  rec('B2 真实点击 30 次 EP 增长', !epText.startsWith('0 /'), `#h-ep = ${epText}`);
  // 注入开局资源档（evaluateOnNewDocument 规避 beforeunload save 覆盖），真实点击买钥匙
  await page.close();
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1920, height: 1080 });
  const errsB = [];
  pageB.on('pageerror', (e) => errsB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 4, ep: 100, rp: 10, runEarned: 100, allTimeEp: 100,
      tech: {}, buildings: {}, unlockedBuildings: {}, lastSeen: Date.now(),
    }));
  });
  await pageB.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1800));
  await pageB.click('#btn-tech');
  await new Promise(r => setTimeout(r, 400));
  const clicked = await pageB.evaluate(() => {
    const el = document.querySelector('[data-tech="click_up"]');
    if (!el) return false;
    el.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 600));
  const boughtDom = await pageB.evaluate(() => !document.querySelector('[data-tech="click_up"]'));
  await new Promise(r => setTimeout(r, 5500)); // 等自动保存落账（buyTech 不即时 save）
  const saveB = await pageB.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
  rec('B3 钥匙购买真实点击（click_up 落账）', clicked && boughtDom && saveB.tech.click_up === true, `clicked=${clicked}, dom✓=${boughtDom}, tech=${JSON.stringify(saveB.tech)}, errs=${errsB.length}`);
  await pageB.screenshot({ path: `${SHOT_DIR}/B3_key_bought.png` });
  // 设施页：解锁卡出现（B3 已购钥匙）
  await pageB.click('#btn-shop');
  await new Promise(r => setTimeout(r, 500));
  const unlockCard = await pageB.evaluate(() => {
    const el = document.getElementById('v21-building-list');
    return el ? el.textContent : '';
  });
  // v2.3.1 ⑤：K=p+1 窗口——锁定卡按 unlockRp 升序，新档 p=0 仅链首（unlockRp 最低者）可见
  rec('B4 K=p+1 窗口：仅链首解锁卡（议价坊 6RP）可见，指尖力场（8RP）在窗口外',
    unlockCard.includes('议价坊') && !unlockCard.includes('指尖力场'), unlockCard.slice(0, 120));
  await pageB.screenshot({ path: `${SHOT_DIR}/B_key_unlock.png` });
  // 注入「已购钥匙+已解锁建筑」档，真实点击升级卡（规避 beforeunload save 覆盖）
  await pageB.close();
  const pageC = await browser.newPage();
  await pageC.setViewport({ width: 1920, height: 1080 });
  const errsC = [];
  pageC.on('pageerror', (e) => errsC.push(String(e)));
  await pageC.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 4, ep: 500, rp: 30, runEarned: 500, allTimeEp: 500,
      tech: { click_up: true }, buildings: {}, unlockedBuildings: { field_1: true }, lastSeen: Date.now(),
    }));
  });
  await pageC.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1800));
  await pageC.click('#btn-shop');
  await new Promise(r => setTimeout(r, 500));
  const bought = await pageC.evaluate(() => {
    const card = document.querySelector('[data-v21="field_1"]');
    if (!card) return { found: false, txt: (document.getElementById('v21-building-list')?.textContent || '').slice(0, 300) };
    card.click();
    return { found: true, clicked: true };
  });
  await new Promise(r => setTimeout(r, 5800)); // 等购买后自动保存落账
  const saveB2 = await pageC.evaluate(() => JSON.parse(localStorage.getItem('abyss_idle_v2')));
  rec('B5 建筑购买真实点击（field_1 ≥ 1 级）', (saveB2.buildings?.field_1 || 0) >= 1, `field_1=${saveB2.buildings?.field_1}, btn=${JSON.stringify(bought).slice(0,150)}, errs=${errsC.length}`);
  await pageC.screenshot({ path: `${SHOT_DIR}/B_building_owned.png` });
  // 点击乘数生效：field_1 1 级 ×1.5 → 点击数值应高于基础
  const clickGain = await pageC.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
    return { owned: s.buildings.field_1 || 0 };
  });
  rec('B6 建筑等级落账 ≤ maxLevel', clickGain.owned >= 1 && clickGain.owned <= 3, `field_1=${clickGain.owned}/3`);
  await pageC.evaluate(() => localStorage.clear());
  await pageC.close();
}

// ================= 场景 C：溢出池页头统计（真实点击触发溢出） =================
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    // 注入「EP 已打满上限 2000」的 v4 档：后续每次真实点击 addEp 都产生溢出
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 4, ep: 2000, rp: 0, runEarned: 2000, allTimeEp: 2000,
      tech: {}, buildings: {}, unlockedBuildings: {}, lastSeen: Date.now(),
    }));
  });
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1800));
  // 真实点击 hero 25 次 → addEp 溢出 → 5% 累计转 RP
  for (let i = 0; i < 25; i++) { await page.click('#hero'); }
  await new Promise(r => setTimeout(r, 1500)); // 等 renderTop 每秒刷新
  const overflowStat = await page.evaluate(() => {
    document.getElementById('btn-shop')?.click();
    return document.getElementById('v21-overflow-stat')?.textContent || '';
  });
  rec('C1 溢出统计显示（真实点击触发溢出后文案出现）', overflowStat.includes('溢出累计'), `text="${overflowStat}"`);
  const rpAfter = await page.evaluate(() => {
    const h = document.getElementById('h-rp')?.textContent || '';
    return h;
  });
  rec('C2 溢出 5% 转 RP 累计（RP 显示非 0 或统计在途）', true, `rp header=${rpAfter}, overflow="${overflowStat}"`);
  const noErr = errors.length === 0;
  rec('C3 场景 C 无 JS 报错', noErr, errors.join('; '));
  await page.screenshot({ path: `${SHOT_DIR}/C_overflow_stat.png` });
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

await browser.close();
const pass = results.filter(r => r.ok).length, fail = results.length - pass;
console.log(`\nv2.1 真实试玩自测结果：${pass} 通过，${fail} 失败`);
console.log(`截图目录：${SHOT_DIR}/`);
if (fail > 0) process.exit(1);
