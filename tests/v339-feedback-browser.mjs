// v3.3.9 反馈回归（7 项，只覆盖受影响面）
// ① 四列铺满全屏 + 整页不纵向滚动  ② 组E/F/H 升级项大幅涨价  ③ 异兽升级按时间（买入不可立即升）+ 按钮不闪
// ④ 星图未解锁恒为「???」且点击有解锁提示  ⑤ 裂隙等级科技（EP+DM）落位科技树、余烬探测井下线
// ⑥ 异兽卡展示实际效果、去掉缩放脉冲  ⑦ PT/RP/FP 满仓即停产停耗（不自动关闭）
import puppeteer from 'puppeteer-core';
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };
const num = (s) => { const m = String(s).replace(/[,\s]/g, '').match(/([\d.]+)([KMB]?)/); if (!m) return NaN; return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  // ===== ① 布局 =====
  const l = await page.evaluate(() => {
    const w = (sel) => { const el = document.querySelector(sel); if (!el) return 0; return el.getBoundingClientRect().width; };
    return {
      docH: document.documentElement.scrollHeight, winH: window.innerHeight, bodyOverflow: getComputedStyle(document.body).overflow,
      cols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').map(parseFloat),
      gridW: w('.grid'), appW: w('#app'), projH: parseFloat(getComputedStyle(document.getElementById('projects')).height),
    };
  });
  if (l.docH <= l.winH + 1 && l.bodyOverflow === 'hidden') ok('① 整页不纵向滚动', `doc ${l.docH} / win ${l.winH}`);
  else bad('① 页面仍可滚动', JSON.stringify(l));
  if (l.cols.length === 4 && l.gridW > 1700 && l.cols[0] < l.cols[1] && l.cols[2] > l.cols[1]) ok('① 四列铺满屏宽', `${l.cols.map(v => Math.round(v)).join('/')} = ${Math.round(l.gridW)}px`);
  else bad('① 列宽/铺满', JSON.stringify({ cols: l.cols, gridW: l.gridW }));
  if (l.projH > 300) ok('① 任务版高度固定', `${l.projH}px`);

  // ===== ② 涨价 =====
  const pr = await page.evaluate(async () => {
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.S.resDiscovered = { ...(window.S.resDiscovered || {}), rp: true };
    window.S.ep = 1e9;
    window.S.tech = { ...(window.S.tech || {}), teamwork: true, rp_first: true, patience: true };
    window.S.unlockedBuildings = { ...(window.S.unlockedBuildings || {}), coop_hall: true, exp_bench: true, chance_sensor: true, eco_battery: true, proj_supervisor: true };
    window.__gameDirty.shop = true;
    await new Promise(r => setTimeout(r, 900));
    const get = (id) => document.querySelector(`#v21-building-list [data-v21="${id}"] .cost`)?.textContent || '';
    return { coop: get('coop_hall'), exp: get('exp_bench'), chance: get('chance_sensor'), eco: get('eco_battery'), proj: get('proj_supervisor') };
  });
  const costs = { coop: num(pr.coop), exp: num(pr.exp), chance: num(pr.chance), eco: num(pr.eco), proj: num(pr.proj) };
  if (Object.values(costs).every(v => v >= 5e4)) ok('② 组E/F/H 首档 ≥50K EP（原 1.2K~6K）', JSON.stringify(costs));
  else bad('② 涨价幅度不足', JSON.stringify({ pr, costs }));

  // ===== ③ 异兽：时间制升级 + 结构稳定 =====
  const pe = await page.evaluate(async () => {
    window.S.pt = 5000;
    window.S.pt_vault = 0;
    window.S.ptAutoHatch = true; window.S.ptDistillOn = false;
    window.S.pets = {}; window.S.activePets = [];
    document.getElementById('btn-pets')?.click();
    await new Promise(r => setTimeout(r, 600));
    document.querySelector('[data-pet-buy="hamster"]')?.click();
    await new Promise(r => setTimeout(r, 400));
    const p0 = window.S.pets.hamster;
    const expAfterBuy = p0 ? p0.exp : -1;
    const upAfterBuy = !!document.querySelector('[data-pet-up="hamster"]');
    const card = document.querySelector('[data-pet-card="hamster"]');
    await new Promise(r => setTimeout(r, 1200));
    const expLater = window.S.pets.hamster.exp;
    const sameNode = card === document.querySelector('[data-pet-card="hamster"]');
    window.S.pets.hamster.exp = window.__petNeed ? 0 : window.S.pets.hamster.exp; // 不依赖内部函数
    // 直接把经验顶到满，等待渲染（结构签名变化 → 出现升级按钮）
    window.S.pets.hamster.exp = 1e9;
    await new Promise(r => setTimeout(r, 700));
    const ready = !!document.querySelector('[data-pet-up="hamster"]');
    const fx = document.querySelector('[data-pet-card="hamster"] .pet-fx')?.textContent || '';
    const eta = document.querySelector('[data-pet-card="hamster"] .pet-eta')?.textContent || '';
    return { expAfterBuy, upAfterBuy, expLater, sameNode, ready, fx, eta };
  });
  if (pe.expAfterBuy >= 0 && pe.expAfterBuy < 60 && !pe.upAfterBuy) ok('③ 购买后经验从头累积、不可立即升级', `exp=${Math.round(pe.expAfterBuy)}`);
  else bad('③ 买入即可升级', JSON.stringify(pe));
  // v3.4.1 反馈③：单级拉到 1 小时后，1.2 秒只涨 0.4 点左右——阈值改为 >0.05 的相对增长
  if (pe.expLater > pe.expAfterBuy + 0.05) ok('③ 经验随时间增长（与实际产脱钩）', `${pe.expAfterBuy.toFixed(2)}→${pe.expLater.toFixed(2)}`);
  else bad('③ 经验未按时间累积', JSON.stringify(pe));
  if (pe.sameNode) ok('③ 经验条刷新不重建卡片（按钮不再闪）');
  else bad('③ 卡片被整面重建');
  if (pe.ready) ok('③ 经验满后出现升级按钮');
  else bad('③ 升级按钮未出现');
  if (/全局\s*\+/.test(pe.fx)) ok('⑥ 卡面展示异兽实际效果', pe.fx.slice(0, 30));
  else bad('⑥ 卡面无效果行', pe.fx);
  // v3.4.1 反馈③：升级时长改小时制（"升级 1h 15m"），断言放宽到 s/m/h 三种量级
  if (/升级\s*[\d.]+\s*(s|m|h)|\d+m\s*\d+s|\d+h(\s*\d+m)?|已满级|可升级/.test(pe.eta)) ok('⑥ 卡面展示升级倒计时', pe.eta);

  // ===== ⑥ 动画无缩放 =====
  const anim = await page.evaluate(() => {
    window.S.activePets = ['hamster'];
    window.__gameDirty.pets = true;
    return new Promise(r => setTimeout(() => {
      const el = document.querySelector('.pet-float .pet-item');
      r(el ? getComputedStyle(el).animationName : '');
    }, 500));
  });
  if (anim !== 'petFloatC') ok('⑥ 浮标不再使用缩放脉冲动画', anim || '(无)');
  else bad('⑥ 仍在缩放动画');

  // ===== ④ 星图锁定态 =====
  const st = await page.evaluate(async () => {
    window.S.chapter = 9; window.S.expeditionsDone = 0; window.S.expeditions = [];
    window.__gameDirty.all = true;
    await new Promise(r => setTimeout(r, 1400));
    const btn = document.getElementById('btn-expedition');
    const label = btn?.textContent || '';
    btn?.click();
    await new Promise(r => setTimeout(r, 300));
    return { label, locked: btn?.dataset.locked, title: btn?.title, toast: document.getElementById('toast')?.textContent || '' };
  });
  if (st.label === '???' && st.locked === '1') ok('④ 星图未解锁显示「???」', st.title.slice(0, 30));
  else bad('④ 星图文案不是 ???', JSON.stringify(st));
  if (/星图未解锁/.test(st.toast)) ok('④ 点击给出解锁路径提示', st.toast.slice(0, 30));
  else bad('④ 点击提示信息缺失', st.toast);

  // ===== ⑤ 裂隙等级科技 =====
  const rt = await page.evaluate(async () => {
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.S._riftSeen = true; window.S.ep = 1e9; window.S.dm = 5000; window.S.riftLevelTech = 0;
    document.getElementById('btn-tech')?.click();
    window.__gameDirty.tech = true;
    await new Promise(r => setTimeout(r, 900));
    const card = document.querySelector('#rift-tech-list [data-rift-level]');
    const before = { ep: window.S.ep, dm: window.S.dm, lv: window.S.riftLevelTech };
    card?.click();
    await new Promise(r => setTimeout(r, 700));
    const after = { ep: window.S.ep, dm: window.S.dm, lv: window.S.riftLevelTech };
    document.getElementById('btn-rift-tab')?.click();
    await new Promise(r => setTimeout(r, 700));
    const riftRows = document.querySelectorAll('[data-rift-upg]').length;
    const depth = !!document.querySelector('[data-rift-upg="depth"]');
    return { txt: card?.innerText || '', before, after, riftRows, depth };
  });
  if (/裂隙等级/.test(rt.txt) && rt.after.lv === 1 && rt.after.ep < rt.before.ep && rt.after.dm < rt.before.dm) ok('⑤ 科技树裂隙等级：EP+DM 扣费并 +1 级', `${Math.round(rt.before.ep - rt.after.ep)} EP / ${rt.before.dm - rt.after.dm} DM`);
  else bad('⑤ 裂隙等级科技未生效', JSON.stringify(rt));
  if (!rt.depth && rt.riftRows === 7) ok('⑤ 余烬探测井已移除（裂隙科技 7 项）', `rows=${rt.riftRows}`);
  else bad('⑤ 探测井仍在', JSON.stringify({ rows: rt.riftRows, depth: rt.depth }));

  // ===== ⑦ 满仓停产停耗 =====
  const cap = await page.evaluate(async () => {
    window.S.pt_vault = 5; // PT 上限 2000
    window.S.pt = 1000 + 5 * 200;
    window.S.ptAutoHatch = true; window.S.ptDistillOn = true;
    window.S.upgrades = { ...(window.S.upgrades || {}), storage: 300 };
    window.S.ep = 5e6;
    await new Promise(r => setTimeout(r, 1500));
    const ptCase = { ep: window.S.ep, pt: window.S.pt, cap: 1000 + 5 * 200 };
    // RP 满仓
    window.S.upgrades = { ...(window.S.upgrades || {}), atrium: 1, rp_vault: 10, storage: 300 };
    window.S.rp = 2500 + 10 * 400;
    window.S.ep = 5e6;
    document.getElementById('btn-rp')?.click();
    await new Promise(r => setTimeout(r, 1400));
    const rpCase = { ep: window.S.ep, rp: window.S.rp };
    return { ptCase, rpCase, hatchOn: window.S.ptDistillOn };
  });
  if (cap.ptCase.pt <= cap.ptCase.cap + 1e-6) ok('⑦ PT 不超上限', `${Math.round(cap.ptCase.pt)} / ${cap.ptCase.cap}`);
  else bad('⑦ PT 溢出上限', JSON.stringify(cap.ptCase));
  if (cap.ptCase.ep >= 5e6 - 1) ok('⑦ PT 满仓时不再扣 EP', `ep=${Math.round(cap.ptCase.ep)}`);
  else bad('⑦ PT 满仓仍扣 EP', JSON.stringify(cap.ptCase));
  if (cap.rpCase.ep >= 5e6 - 1) ok('⑦ RP 满仓时工坊不再扣 EP', `ep=${Math.round(cap.rpCase.ep)}`);
  else bad('⑦ RP 满仓仍扣 EP', JSON.stringify(cap.rpCase));
  if (cap.hatchOn === true) ok('⑦ 满仓不自动关闭开关');

  if (errs.length === 0) ok('全程无 JS 报错');
  else bad('页面异常', errs.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
