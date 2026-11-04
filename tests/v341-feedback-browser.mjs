// v3.4.1 反馈回归（8 项，只覆盖受影响面）
// ① 许愿池 / 触手 / 异兽浮标各自留出距离，不再压住四列内容
// ② 裂隙等级卡与科技树 / 研究升级卡同构（name + count + desc + cost，同高、文案两行内）
// ③ 异兽升级改「小时制」且逐级更陡（1 级 1h，之后 ×1.12）
// ④ 顶部 DM / PT 两侧走同一格式化（不再出现 2000.00 / 2.00k 混排）
// ⑤ 组 A / E / F / H 继续涨价
// ⑥ 裂隙科技灰显判断（余烬不足只灰「购买」，不动自动开关）
// ⑦ 深渊遗物继续涨价 + 探采 DM 产出再降（个位数 DM/s）
// ⑧ 备用粮仓 / 存储节点 EP 上限性价比不再倒挂
import puppeteer from 'puppeteer-core';
const { BALANCE } = await import('../src/data/balance.js'); // 价格/配置类断言直接读数据源（DOM 受链序窗口影响会漏项）
const { UPGRADES } = await import('../src/data/upgrades.js'); // v3.4.5：备用粮仓售价源在 upgrades.js（效能建筑镜像已删除）
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

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
  await page.evaluate(() => { window.sleep = (ms) => new Promise(r => setTimeout(r, ms)); });

  // ===== ① 浮动件留白，不压内容 =====
  const lay = await page.evaluate(async () => {
    const S = window.S;
    S.buildings = Object.assign({}, S.buildings, { wish_well: 1, abyss_fishbowl: 2 });
    S.pets = { hamster: { icon: '🐀', name: '庭鼠', level: 3, exp: 40, gen: 1 } };
    S.activePets = ['hamster'];
    window.__gameDirty.top = true; window.__gameDirty.pets = true; window.__gameDirty.shop = true;
    await new Promise(r => setTimeout(r, 1200));
    const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const cols = [...document.querySelectorAll('.grid > *')].map(e => { const b = e.getBoundingClientRect(); return { x: b.x, r: b.right, b: b.bottom }; });
    return {
      cols: { firstX: cols[0].x, lastR: cols[cols.length - 1].r, bottom: Math.max(...cols.map(c => c.b)) },
      wish: R('#wish-well'), tent: R('#tentacle-deco'), petf: R('#pet-float'),
      winW: innerWidth, winH: innerHeight, docH: document.documentElement.scrollHeight,
    };
  });
  const rightEdge = lay.winW;
  if (lay.cols.lastR <= lay.wish.x - 6 && lay.wish.r <= rightEdge - 8) ok('① 许愿池落在右侧浮动栏（与第四列留白 ≥6px）', `列右 ${Math.round(lay.cols.lastR)} → 池左 ${Math.round(lay.wish.x)}，距屏右 ${Math.round(rightEdge - lay.wish.r)}px`);
  else bad('① 许愿池位置', `列右 ${Math.round(lay.cols.lastR)} / 池 ${Math.round(lay.wish.x)}~${Math.round(lay.wish.r)}`);
  if (lay.tent.x >= lay.cols.lastR + 6 && lay.tent.r <= rightEdge - 6) ok('① 触手在右下浮动栏内（不压第四列）', `x ${Math.round(lay.tent.x)}~${Math.round(lay.tent.r)}`);
  else bad('① 触手位置', `x ${Math.round(lay.tent.x)}~${Math.round(lay.tent.r)} / 列右 ${Math.round(lay.cols.lastR)}`);
  if (lay.petf && lay.petf.y >= lay.cols.bottom + 4) ok('① 异兽浮标在底部条带内（与列底留白 ≥4px）', `列底 ${Math.round(lay.cols.bottom)} → 浮标 ${Math.round(lay.petf.y)}`);
  else bad('① 异兽浮标与列重叠', `列底 ${Math.round(lay.cols.bottom)} / 浮标 y ${Math.round(lay.petf?.y)}`);
  if (lay.docH <= lay.winH + 2) ok('① 仍为单屏无整页滚动', `docH ${lay.docH} / winH ${lay.winH}`);
  else bad('① 整页滚动', `docH ${lay.docH} / winH ${lay.winH}`);

  // ===== ② 裂隙等级卡与科技卡同构 =====
  const card = await page.evaluate(async () => {
    const S = window.S;
    S.resDiscovered = Object.assign({}, S.resDiscovered, { rp: true, dm: true });
    S._riftSeen = true; S.riftsSealed = 3; S.riftEmber = 84; S.riftLevelTech = 0;
    S.ep = 23471; S.dm = 900; S.upgrades.storage = 40; S.rp = 800;
    window.__gameDirty.tech = true; window.__gameDirty.top = true;
    await new Promise(r => setTimeout(r, 900));
    document.getElementById('btn-tech').click();
    await new Promise(r => setTimeout(r, 700));
    const el = document.querySelector('[data-rift-level]');
    const sib = document.querySelector('#tech-tree .tech');
    const R = e => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      cls: el?.className, box: el ? R(el) : null, sibBox: sib ? R(sib) : null,
      name: el?.querySelector('.name')?.textContent.replace(/\s+/g, ' ').trim(),
      count: el?.querySelector('.name .count')?.textContent,
      desc: el?.querySelector('.desc')?.textContent.replace(/\s+/g, ' ').trim(),
      descH: el ? el.querySelector('.desc').getBoundingClientRect().height : 0,
      cost: el?.querySelector('.cost')?.textContent,
      locked: el?.classList.contains('locked'),
      inGrid: el?.parentElement?.className,
    };
  });
  if (card.cls?.includes('tech') && card.inGrid === 'tech-grid') ok('② 裂隙等级卡改用 .tech 结构并入 tech-grid', card.cls);
  else bad('② 卡片结构', `${card.cls} / ${card.inGrid}`);
  if (card.sibBox && Math.abs(card.box.h - card.sibBox.h) <= 6) ok('② 与同排科技卡等高（±6px）', `${card.box.h} vs ${card.sibBox.h}`);
  else bad('② 高度不一致', `${card.box?.h} vs ${card.sibBox?.h}`);
  if (/Lv\.0/.test(card.count || '')) ok('② 等级走 .name .count（与 item 卡同位置）', card.count);
  else bad('② 等级显示', card.count);
  if (/裂隙等级 \+1/.test(card.desc) && /深入消耗/.test(card.desc) && card.descH <= 34) ok('② 描述两行内收口（v3.4.6 ④ 下一级数值口径）', `${card.desc}（${Math.round(card.descH)}px）`);
  else bad('② 描述换行过多', `${card.desc}（${Math.round(card.descH)}px）`);
  if (/EP \+ .* DM/.test(card.cost || '')) ok('② 成本行「EP + DM」', card.cost);
  else bad('② 成本行', card.cost);
  if (card.locked) ok('② EP/DM 不足时置灰（locked）');
  else bad('② 应置灰但未灰');

  // 余额足够 → 取消灰显并可买
  const buy = await page.evaluate(async () => {
    const S = window.S;
    S.ep = 3e5; S.dm = 50;
    await new Promise(r => setTimeout(r, 900));
    const el = () => document.querySelector('[data-rift-level]');
    const before = { locked: el().classList.contains('locked'), ep: S.ep, dm: S.dm, lv: S.riftLevelTech };
    el().click();
    await new Promise(r => setTimeout(r, 600));
    return { before, after: { locked: el().classList.contains('locked'), ep: S.ep, dm: S.dm, lv: S.riftLevelTech, cost: el().querySelector('.cost').textContent, count: el().querySelector('.name .count').textContent } };
  });
  if (!buy.before.locked && buy.after.lv === buy.before.lv + 1) ok('② 余额够 → 解灰且点击升 1 级', `Lv.${buy.before.lv}→${buy.after.lv}`);
  else bad('② 购买失败', JSON.stringify(buy));
  if (buy.after.dm < buy.before.dm && buy.after.ep < buy.before.ep) ok('② 双扣 EP + DM', `DM ${Math.round(buy.before.dm)}→${Math.round(buy.after.dm)}`);
  else bad('② 未双扣', JSON.stringify(buy.after));

  // ===== ③ 异兽小时制且越来越陡 =====
  const petT = await page.evaluate(async () => {
    const S = window.S;
    S.pets = { hamster: { icon: '🐀', name: '庭鼠', level: 1, exp: 0, gen: 1 } };
    S.activePets = ['hamster'];
    window.__gameDirty.pets = true;
    await new Promise(r => setTimeout(r, 900));
    return { eta: document.querySelector('.pet-eta')?.textContent };
  });
  if (/升级\s*1h/.test(petT.eta || '')) ok('③ Lv.1 升级时长按小时计', petT.eta);
  else bad('③ 不是小时制', petT.eta);
  const curve = await page.evaluate(() => {
    // 逐级时长：从卡面读不到全部，直接按公式核对（petLevelSeconds 经 ETA 反推不可靠，取 Lv.1/2 两档对比）
    const S = window.S, out = [];
    for (const lv of [1, 2, 3, 10, 20]) {
      S.pets = { hamster: { icon: '🐀', name: '庭鼠', level: lv, exp: 0, gen: 1 } };
      window.__gameDirty.pets = true;
      out.push(lv);
    }
    return out.length;
  });
  void curve;
  const mono = await page.evaluate(async () => {
    const S = window.S;
    const grab = async (lv) => {
      S.pets = { hamster: { icon: '🐀', name: '庭鼠', level: lv, exp: 0, gen: 1 } };
      window.__gameDirty.pets = true;
      await new Promise(r => setTimeout(r, 450));
      const t = document.querySelector('.pet-eta')?.textContent || '';
      const m = t.match(/(\d+)h(?:\s*(\d+)m)?/);
      return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null;
    };
    const l1 = await grab(1), l2 = await grab(2), l10 = await grab(10), l20 = await grab(20);
    return { l1, l2, l10, l20 };
  });
  const r2 = mono.l2 / mono.l1, r10 = mono.l10 / mono.l1, r20 = mono.l20 / mono.l10;
  if (mono.l1 === 60 && r2 > 1.05 && r2 < 1.2 && r10 > 2 && r20 > 2.5) {
    ok('③ 每级耗时递增且越来越陡（×1.12 复利）', `Lv1 ${mono.l1}m / Lv2 ${mono.l2}m / Lv10 ${mono.l10}m / Lv20 ${mono.l20}m`);
  } else bad('③ 时长曲线不是递增复利', JSON.stringify(mono));

  // ===== ④ 顶部 DM/PT 统一格式 =====
  const top = await page.evaluate(async () => {
    const S = window.S;
    S.upgrades.dm_vault = 60; S.upgrades.pt_vault = 6;
    S.dm = 2000; S.pt = 2000;
    window.__gameDirty.top = true;
    await new Promise(r => setTimeout(r, 800));
    return { dm: document.getElementById('h-dm').textContent, pt: document.getElementById('h-pt').textContent };
  });
  if (!/2000\.00|2000 /.test(top.dm) && /K/.test(top.dm)) ok('④ DM 两侧同格式（不再 2000.00 / 2.00k）', top.dm);
  else bad('④ DM 格式混排', top.dm);
  if (!/2000 \/|2000\.00/.test(top.pt)) ok('④ PT 同格式', top.pt);
  else bad('④ PT 格式', top.pt);

  // ===== ⑤ 组 A/E/F/H 继续涨价（直接读配置，避开链序窗口）=====
  const base = (id) => (BALANCE.buildingsV21.find(b => b.id === id) || {}).base;
  const priceCase = [
    ['预热节点', 'warmup_node', 1e5], ['效能尖塔', 'eff_tower', 1.5e4], ['双倍工坊', 'double_workshop', 6e4], ['调度中枢', 'dispatch_hub', 5e5],
    ['协作大厅', 'coop_hall', 3e5], ['团队圣堂', 'team_temple', 1.2e6], ['超级团队殿', 'super_team', 2.4e6], ['节能电池', 'eco_battery', 3.5e5],
    ['初探实验台', 'exp_bench', 2e5], ['RP 蒸馏塔', 'rp_distiller', 6e5], ['深度实验室', 'deep_lab', 1e6], ['理论突破台', 'theory_desk', 1.6e6],
    ['传奇研究所', 'legend_institute', 2.4e6], ['机会感知器', 'chance_sensor', 2e5], ['机会感知器·锐', 'chance_sensor_2', 6e5],
    ['幸运星云', 'lucky_nebula', 1.2e6], ['事件潮汐所', 'event_tide_lab', 1.6e6], ['项目督导室', 'proj_supervisor', 4.8e5], ['项目平行台', 'proj_parallel', 1.6e6],
  ];
  const under = priceCase.filter(([, id, min]) => !(base(id) >= min));
  if (under.length === 0) ok('⑤ 组 A/E/F/H 19 项全部 ≥ 新底价', `协作大厅 ${base('coop_hall')} / 初探实验台 ${base('exp_bench')} / 机会感知器 ${base('chance_sensor')}`);
  else bad('⑤ 仍有低价项', under.map(([n, id, min]) => `${n} ${base(id)}<${min}`).join('，'));

  // ===== ⑥ 余烬灰显（只灰购买按钮，不动自动开关）=====
  const ember = await page.evaluate(async () => {
    const S = window.S;
    S._riftSeen = true; S.riftsSealed = 3; S.riftEmber = 84; S.riftUpgrades = { auto_seal: 1 };
    S.resDiscovered = Object.assign({}, S.resDiscovered, { dm: true });
    window.__gameDirty.riftTab = true;
    document.getElementById('btn-rift-tab')?.click();
    await new Promise(r => setTimeout(r, 1500));
    return [...document.querySelectorAll('#rift-tab-panel [data-rift-upg]')].map(r => {
      const buy = r.querySelector('button[data-rift-buy]');
      const tgl = r.querySelector('button:not([data-rift-buy])');
      return {
        id: r.dataset.riftUpg, price: buy?.textContent, dis: buy?.disabled ?? null,
        op: buy ? +getComputedStyle(buy).opacity : null,
        tglDis: tgl ? !!tgl.disabled : null, tglOp: tgl ? +getComputedStyle(tgl).opacity : null,
      };
    });
  });
  const cheap = ember.filter(r => r.price === '20 余烬');
  const dear = ember.filter(r => r.price === '200 余烬');
  if (cheap.length >= 3 && cheap.every(r => r.dis === false && r.op > 0.9)) ok('⑥ 余烬 84 → 20 档全部可购', `${cheap.length} 项`);
  else bad('⑥ 20 档被误灰', JSON.stringify(cheap));
  if (dear.length >= 2 && dear.every(r => r.dis === true && r.op <= 0.5)) ok('⑥ 余烬 84 → 200 档全部置灰', `${dear.length} 项 opacity ${dear[0]?.op}`);
  else bad('⑥ 200 档未灰', JSON.stringify(dear));
  const tgl = ember.find(r => r.id === 'auto_seal');
  if (tgl && tgl.tglDis === false && tgl.tglOp > 0.9) ok('⑥ 余烬不足不影响自动封印开关', `opacity ${tgl.tglOp}`);
  else bad('⑥ 自动开关被误灰', JSON.stringify(tgl));

  // ===== ⑦ 遗物涨价 + DM 产出个位数 =====
  const relic = await page.evaluate(async () => {
    window.__gameDirty.relics = true; window.__gameDirty.tabRelics = true;
    document.getElementById('btn-relics')?.click();
    await new Promise(r => setTimeout(r, 900));
    const el = [...document.querySelectorAll('.relic-card, .shop-grid .item')].find(e => e.textContent.includes('深渊古卷'));
    return el ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : null;
  });
  const rm = relic ? relic.match(/(\d+(?:\.\d+)?)\s*(K|M)?\s*DM/) : null;
  const relicCost = rm ? parseFloat(rm[1]) * (rm[2] === 'K' ? 1e3 : rm[2] === 'M' ? 1e6 : 1) : null;
  if (relicCost >= 150) ok('⑦ 深渊古卷涨价（≥150 DM）', relic);
  else bad('⑦ 遗物价格', relic);

  const dmRate = await page.evaluate(async () => {
    const S = window.S;
    S.upgrades = Object.assign({}, S.upgrades, { scooter: 3, convoy: 6, orbital: 8, submersible: 10 });
    S.converterOn = Object.assign({}, S.converterOn, { vehicles: true });
    S.ep = window.__qa.epStorageCap(); S.dm = 0;
    const dm0 = S.dm, ep0 = S.ep, t0 = performance.now();
    await new Promise(r => setTimeout(r, 3200));
    const dt = (performance.now() - t0) / 1000;
    return { dmPerSec: (S.dm - dm0) / dt, epPerDm: (ep0 - S.ep) / Math.max(1e-9, S.dm - dm0), perMin: window.__qa.vehicleDmPerMin() };
  });
  if (dmRate.dmPerSec > 0.3 && dmRate.dmPerSec < 0.8 && dmRate.dmPerSec < 10) ok('⑦ 27 辆 DM 产出 ≈0.5 DM/s（个位数内）', `${dmRate.dmPerSec.toFixed(2)} DM/s（${dmRate.perMin} DM/min）`);
  else bad('⑦ DM 产出量级', `${dmRate.dmPerSec.toFixed(2)} DM/s`);

  // ===== ⑧ 备用粮仓 / 存储节点 EP 上限性价比（不再倒挂）=====
  const caps = await page.evaluate(() => {
    const qa = window.__qa, S = window.S;
    const snap = (id, lv) => {
      S.upgrades.storage = 0; S.upgrades.reserve_bin = 0; S.upgrades.cache = 0;
      S.upgrades[id] = lv;
      const a = qa.epStorageCap();
      S.upgrades[id] = lv + 1;
      return qa.epStorageCap() - a;
    };
    return { s1: snap('storage', 0), s9: snap('storage', 8), r1: snap('reserve_bin', 0), r9: snap('reserve_bin', 8) };
  });
  // v3.4.6 ⑫ 对调 + v3.4.7 ② 加成递增后的口径：粮仓=前期件（4K/级 ×1.18），存储=后期大宗（12K/级 ×1.15）
  if (caps.r1 < caps.s1) ok('⑧ 对调后存储节点单级上限高于粮仓（12K vs 4K 基座）', `粮仓 +${caps.r1} / 存储 +${caps.s1}`);
  else bad('⑧ 上限增量异常', `粮仓 +${caps.r1} / 存储 +${caps.s1}`);
  if (caps.s9 > caps.s1) ok('⑧ 存储节点逐级递增（capGrowth ×1.15）', `L1 +${caps.s1} → L9 +${caps.s9}`);
  else bad('⑧ 存储节点未递增', `${caps.s1} → ${caps.s9}`);
  if (caps.r9 > caps.r1) ok('⑧ 备用粮仓逐级递增（capGrowth ×1.18）', `L1 +${caps.r1} → L9 +${caps.r9}`);
  else bad('⑧ 备用粮仓未递增', `${caps.r1} → ${caps.r9}`);

  // 单价（EP/点）用配置直接算（v3.4.6 ⑫ 对调口径：前期粮仓更划算、后期存储节点大宗更优）
  const rb = UPGRADES.find(u => u.id === 'reserve_bin') || {};
  const stB = BALANCE.storage;
  const epPerPtRes = (n) => rb.base * Math.pow(rb.growth, n - 1) / (4000 * Math.pow(1.18, n - 1));
  const epPerPtSto = (n) => stB.base * Math.pow(stB.growth, n - 1) / (stB.capPer * Math.pow(stB.capGrowth, n - 1));
  if (epPerPtRes(1) < epPerPtSto(1)) ok('⑧ L1 备用粮仓单价更低（前期买粮仓）', `粮仓 ${epPerPtRes(1).toFixed(2)} vs 存储 ${epPerPtSto(1).toFixed(2)} EP/点`);
  else bad('⑧ L1 单价异常（前期应是粮仓更便宜）', `粮仓 ${epPerPtRes(1).toFixed(2)} vs 存储 ${epPerPtSto(1).toFixed(2)}`);
  if (epPerPtSto(16) < epPerPtRes(16)) ok('⑧ L16 存储节点单价反超（后期转存储大宗）', `存储 ${epPerPtSto(16).toFixed(1)} vs 粮仓 ${epPerPtRes(16).toFixed(1)} EP/点`);
  else bad('⑧ L16 单价关系异常（后期应存储更便宜）', `存储 ${epPerPtSto(16).toFixed(1)} vs 粮仓 ${epPerPtRes(16).toFixed(1)}`);

  if (errs.length === 0) ok('无 JS 运行时报错');
  else bad('页面报错', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n===== v3.4.1 反馈回归：${pass}/${pass + fail} 通过 =====`);
process.exit(fail ? 1 : 0);
