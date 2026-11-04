// v3.4.3 反馈回归（只覆盖受影响面）
// ① 效能建筑重标价：组 A/C/E/F/G/H/I base 全面上抬 + growth 陡化（读配置断言）
// ② 高价值卡「满级总投入」抬升（效能尖塔 ≈1,500 万 EP，约 v3.4.1 的 50 倍）
// ③ 分类合并：原 8 组 → 「产出与效率 / 存储与续航 / 研究与事件」三大组（+ 命运誓言/其他兜底），
//    旧组名（全局产出强化/成本与效率优化/线程与薪资/研究点强化/离线续航/事件与项目/职级强化）不再出现
// ④ 卡片归属正确：eff_tower(A)→产出与效率、quantum_pool(D)→存储与续航、exp_bench(F)→研究与事件
// ⑤ 卡面价格链路未坏：Lv0 卡价格文案 = base × growth^0（costMult=1 基线）
// ⑥ 里程碑门槛随价位映射上移：6e5→m5 / 1.5e6→m6 / 4e6→m7
import puppeteer from 'puppeteer-core';
const { BALANCE } = await import('../src/data/balance.js');
const { V21_BUILDINGS, unlockMilestoneV21 } = await import('../src/data/buildings.js');
const CHROME = '/usr/local/bin/chromium'; // Linux CI 适配（本机用 Chrome 路径替换）
const URL = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, d = '') => { pass++; console.log(`  ✓ ${n}${d ? ' — ' + d : ''}`); };
const bad = (n, d = '') => { fail++; console.log(`  ✗ ${n}${d ? ' — ' + d : ''}`); };

const B = (id) => V21_BUILDINGS.find(x => x.id === id) || {};
const total = (id, n) => { const b = B(id); let t = 0; for (let i = 0; i < (n || b.cap); i++) t += b.base * Math.pow(b.growth, i); return t; };

// ===== ① 重标价（读配置，避开链序窗口）=====
const floors = [
  // 组 A
  ['预热节点', 'warmup_node', 2.5e5, 1.35], ['效能尖塔', 'eff_tower', 2.5e5, 1.45],
  ['双倍工坊', 'double_workshop', 4e5, 1.38], ['调度中枢', 'dispatch_hub', 1.2e6, 1.40],
  ['量子叠加器', 'quantum_stacker', 2e6, 1.45], ['奇点反应堆', 'singularity_core', 2.6e6, 1.48],
  ['超越圣殿', 'transcend_temple', 3.2e6, 1.48], ['飞升尖塔', 'ascend_spire', 3.8e6, 1.50],
  ['永恒回廊', 'eternity_hall', 4.6e6, 1.50], ['终焉圣殿', 'end_shrine', 5.4e6, 1.50],
  // 组 C
  ['议价坊', 'bargain_shop', 2.5e5, 1.40], ['谈判席', 'negotiate_seat', 1.6e6, 1.45],
  ['采购总署', 'purchase_office', 4.2e6, 1.50], ['采购总署·聚', 'purchase_office_2', 1.4e7, 1.50],
  ['采购总署·极', 'purchase_office_3', 3e7, 1.30], ['专注心核', 'focus_core', 5.5e5, 1.25],
  // 组 E
  ['协作大厅', 'coop_hall', 8e5, 1.38], ['团队圣堂', 'team_temple', 5e6, 1.42],
  ['超级团队殿', 'super_team', 1.15e7, 1.45], ['节能电池', 'eco_battery', 8e5, 1.38],
  ['节能电池·II', 'eco_battery_2', 1.1e6, 1.40],
  // 组 F
  ['初探实验台', 'exp_bench', 6.6e5, 1.45], ['RP 蒸馏塔', 'rp_distiller', 1.75e6, 1.45],
  ['深度实验室', 'deep_lab', 5.6e6, 1.50], ['理论突破台', 'theory_desk', 8e6, 1.50],
  ['传奇研究所', 'legend_institute', 1.02e7, 1.50],
  // 组 G（×2.5）
  ['断线信号塔·初', 'beacon_1', 2500, 1.15], ['断线信号塔·中', 'beacon_2', 2.5e4, 1.20],
  ['断线信号塔·永', 'beacon_3', 3e5, 1.30], ['延时缓存站', 'delay_cache', 2.5e5, 1.28],
  ['延时缓存站·折', 'delay_cache_2', 3.2e5, 1.30],
  // 组 H
  ['机会感知器', 'chance_sensor', 6e5, 1.45], ['机会感知器·锐', 'chance_sensor_2', 1.8e6, 1.45],
  ['幸运星云', 'lucky_nebula', 3.6e6, 1.45], ['事件潮汐所', 'event_tide_lab', 4.8e6, 1.30],
  ['项目督导室', 'proj_supervisor', 1.4e6, 1.45], ['项目平行台', 'proj_parallel', 4.8e6, 1.30],
  // 组 I
  ['轮回圣殿', 'cycle_temple', 9e5, 1.45], ['传奇职级殿', 'legend_rank_hall', 1.5e6, 1.45],
];
const under = floors.filter(([, id, fb, fg]) => !(B(id).base >= fb && B(id).growth >= fg));
if (under.length === 0) ok('① 效能建筑 39 项 base/growth 全部 ≥ 新底价', `效能尖塔 ${B('eff_tower').base.toExponential(0)}×${B('eff_tower').growth} / 专注心核 ${B('focus_core').base.toExponential(0)} / 协作大厅 ${B('coop_hall').base.toExponential(0)}`);
else bad('① 仍有未达标项', under.map(([n]) => n).join('，'));
// 组 D（存储）在 v3.4.3 未随产出强化混涨；v3.4.4 才按「前期存储节点→后期粮仓」单独重标价（见 v344）
if (B('quantum_pool').base === 8e4 && B('reserve_bin').base === 45000) ok('① 组 D 与产出强化隔离（缓存池不动、粮仓仅按 v3.4.4 存储口径调价）', `量子缓存池 ${B('quantum_pool').base} / 粮仓 ${B('reserve_bin').base}`);
else bad('① 组 D 被误改', `quantum_pool ${B('quantum_pool').base} / reserve_bin ${B('reserve_bin').base}`);

// ===== ② 满级总投入抬升 =====
const tower = total('eff_tower');
if (tower >= 1e7 && tower / 2.86e5 > 40) ok('② 效能尖塔满级总投入 ≈5,000 万级（原 ≈29 万，×50）', `${(tower / 1e6).toFixed(1)}M EP`);
else bad('② 效能尖塔总投入不足', `${tower.toExponential(2)}`);
if (total('coop_hall') >= 5e6 && total('focus_core') >= 5e5) ok('② 协作大厅/专注心核总投入同阶抬升', `协作大厅 ${(total('coop_hall') / 1e6).toFixed(1)}M / 专注心核 ${(total('focus_core') / 1e3).toFixed(0)}K`);
else bad('② 总投入不足', `${total('coop_hall').toExponential(2)} / ${total('focus_core')}`);
// 产出族红线：满档扩展级 ≤ m=9 期上限 4.0e7（防「买得起也存不下」）
const m9 = B('coop_hall').base * Math.pow(B('coop_hall').growth, 11);
if (m9 <= 4.0e7) ok('② 产出族满档扩展级仍 ≤ m=9 期上限 4.0e7', `协作大厅 L12 ${(m9 / 1e6).toFixed(1)}M`);
else bad('② 产出族突破红线', `协作大厅 L12 ${m9.toExponential(2)}`);

// ===== ⑥ 里程碑门槛映射 =====
const gate = [[B('exp_bench'), 5], [B('coop_hall'), 5], [B('negotiate_seat'), 6], [B('team_temple'), 7], [B('warmup_node'), 0], [B('focus_core'), 0]];
const gateBad = gate.filter(([b, m]) => unlockMilestoneV21(b) !== m);
if (gateBad.length === 0) ok('⑥ 门槛随价位映射上移（6e5→m5 / 1.5e6→m6 / 4e6→m7 / <6e5→m0）', `初探实验台 m${unlockMilestoneV21(B('exp_bench'))} / 团队圣堂 m${unlockMilestoneV21(B('team_temple'))}`);
else bad('⑥ 门槛映射错误', gateBad.map(([b]) => b.id).join('，'));

// ===== ③④⑤ 浏览器渲染面 =====
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

  const ALL_IDS = V21_BUILDINGS.map(b => b.id);
  const dom = await page.evaluate(async (allIds) => {
    const S = window.S;
    // 全量解锁（v21 链语义「已购 = RP 解锁」→ 全部可见），里程碑齐备，EP 充裕
    S.resDiscovered = Object.assign({}, S.resDiscovered, { rp: true, dm: true });
    S.unlockedBuildings = {}; S.tech = {}; S.milesDone = {};
    for (const id of allIds) S.unlockedBuildings[id] = true;
    for (let i = 1; i <= 9; i++) S.milesDone['m' + i] = true;
    for (const k of ['focus_opt', 'eff2', 'warmup', 'cheap_start', 'teamwork', 'rp_first', 'quantum2', 'offline1', 'patience']) S.tech[k] = true;
    // 先抬存储上限再给大额 EP（否则 tick 会把 EP 钳回 cap，卡片误灰）
    S.upgrades = Object.assign({}, S.upgrades, { storage: 500, cache: 500, reserve_bin: 500, deep_bin: 500 });
    S.ep = 1e15;
    window.__gameDirty.shop = true;
    await new Promise(r => setTimeout(r, 1200));
    S.ep = 1e15; // tick 钳制兜底：读面前再顶一次
    await new Promise(r => setTimeout(r, 150));
    const list = document.getElementById('v21-building-list');
    const seq = [...list.children].map(e => e.classList.contains('group-title')
      ? { t: 'H', s: e.textContent.trim() }
      : { t: 'C', id: e.dataset.v21 || null, cost: e.querySelector('.cost')?.textContent || '', cant: e.classList.contains('cant') });
    return { seq };
  }, ALL_IDS).catch(e => ({ err: String(e).slice(0, 200) }));

  if (dom.err) bad('③ 面板渲染异常', dom.err);
  else {
    const heads = dom.seq.filter(x => x.t === 'H').map(x => x.s);
    const oldNames = ['全局产出强化', '成本与效率优化', '线程与薪资', '研究点强化', '离线续航', '事件与项目', '职级强化', '存储与扩容'];
    const leftovers = heads.filter(h => oldNames.includes(h));
    if (leftovers.length === 0 && heads.length > 0) ok('③ 旧 8 组名全部消失', `现组头：${heads.join(' / ')}`);
    else bad('③ 旧组名残留或无组头', `${heads.join(' / ')}`);
    const expectHeads = ['产出与效率', '存储与续航', '研究与事件'];
    const merged = expectHeads.filter(h => heads.includes(h));
    if (merged.length >= 2) ok('③ 三大组标题出现', merged.join(' / '));
    else bad('③ 合并组头缺失', heads.join(' / '));

    // ④ 归属：卡应落在其 cat 对应大组内
    const grpOf = (id) => {
      let cur = null;
      for (const x of dom.seq) { if (x.t === 'H') cur = x.s; else if (x.id === id) return cur; }
      return null;
    };
    const belongs = [['eff_tower', '产出与效率'], ['focus_core', '产出与效率'], ['coop_hall', '产出与效率'],
      ['quantum_pool', '存储与续航'], ['beacon_1', '存储与续航'], ['exp_bench', '研究与事件'], ['chance_sensor', '研究与事件']];
    const mis = belongs.filter(([id, g]) => grpOf(id) !== g);
    if (mis.length === 0) ok('④ 卡片按大组归属正确', `效能尖塔→${grpOf('eff_tower')} / 量子缓存池→${grpOf('quantum_pool')} / 初探实验台→${grpOf('exp_bench')}`);
    else bad('④ 归属错误', mis.map(([id, g]) => `${id}→${grpOf(id)}(应${g})`).join('，'));

    // ⑤ 价格链路：Lv0 卡价格文案 = ceil(base × costMult)。无任何折价来源时 costMult=1
    const et = B('eff_tower');
    const card = dom.seq.find(x => x.t === 'C' && x.id === 'eff_tower');
    const parse = (s) => {
      const m = String(s).match(/([\d.]+)\s*(K|M|B|T)?/);
      if (!m) return NaN;
      const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] || 1;
      return parseFloat(m[1]) * mult;
    };
    const shown = parse(card?.cost);
    // fmt 可能截断为 3 位有效数字，允许 1% 相对误差
    if (card && Math.abs(shown - et.base) / et.base < 0.02) ok('⑤ 效能尖塔 Lv0 卡价 = 新 base（2.5e5）', `${card.cost}`);
    else bad('⑤ 卡价不符', `显示 ${card?.cost} 解析 ${shown} vs base ${et.base}`);
    if (card && !card.cant) ok('⑤ EP 充裕 → 卡片可购态（不灰）');
    else bad('⑤ 卡片误灰', JSON.stringify(card));
  }
  if (errs.length) bad('页面报错', errs.join(' | '));
  else ok('页面无 JS 报错');
} finally {
  await browser.close();
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
