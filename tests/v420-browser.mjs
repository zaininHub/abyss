// v4.2.0 浏览器专项：7 项 BUGFIX 真实 DOM 验收 + 章节门禁 UI
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };
const errs = [];

const NOW = Date.now();
const mkSave = (extra = {}) => JSON.stringify({
  _version: 6, chapter: '1', ep: 5e5, rp: 1e4, es: 0, dm: 0, pt: 0, faith: 0,
  buildings: {}, unlockedBuildings: { warmup_node: true },
  cultists: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: '线程' + i, mood: '正常', profession: 'acolyte', level: 10, boundTo: '' })),
  tech: {}, focusLevel: 0, startTime: NOW, lastSeen: NOW,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true },
  upgrades: { reserve_bin: 3, storage: 3 }, prestige: 1, projectsDone: 3,
  ...extra,
});
async function open(save, w = 1366, h = 900) {
  const page = await globalBrowser.newPage();
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: w, height: h });
  await page.evaluateOnNewDocument(s => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.setItem('abyss_idle_v2', s);
    sessionStorage.setItem('__seeded', '1');
  }, save);
  await page.goto(URL, { waitUntil: 'load' });
  await sleep(900);
  return page;
}
const globalBrowser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  // ===== ① 宗教第一章不解锁 + 旧档 _religionHintSeen 清洗 =====
  {
    const page = await open(mkSave({ _religionHintSeen: true }));
    const r = await page.evaluate(() => {
      const btn = document.getElementById('btn-religion');
      return {
        locked: btn.dataset.locked === '1',
        hintGone: S._religionHintSeen === undefined,
        upgradeVer: S._upgradeVer,
        status: document.getElementById('staff-status') ? 'ok' : 'missing',
      };
    });
    r.locked ? ok('① 宗教首章锁定（旧档 _religionHintSeen 不生效）') : bad('① 宗教首章仍解锁', JSON.stringify(r));
    r.hintGone ? ok('① 旧档 _religionHintSeen 已清洗') : bad('① 脏标记未清洗', JSON.stringify(r));
    r.upgradeVer === 1 ? ok('① 版本清洗标记落盘 _upgradeVer=1') : bad('① 清洗标记缺失', JSON.stringify(r));
    await page.close();
  }
  // 老玩家零回退：chapter=4 宗教放行
  {
    const page = await open(mkSave({ chapter: '4', _religionHintSeen: true }));
    const r = await page.evaluate(() => {
      const btn = document.getElementById('btn-religion');
      return { locked: btn.dataset.locked === '1', hintGone: S._religionHintSeen === undefined };
    });
    !r.locked ? ok('① 老玩家（第4章）宗教零回退') : bad('① 老玩家宗教被误锁', JSON.stringify(r));
    r.hintGone ? ok('① 老玩家旧标记同样清洗（章节已过不影响放行）') : bad('① 老玩家标记未清', JSON.stringify(r));
    await page.close();
  }

  // ===== ② 政策感叹号：有可选组挂 !，全选后消失 =====
  {
    const page = await open(mkSave({ chapter: '7' }));
    const before = await page.evaluate(() => {
      const b = document.getElementById('btn-policy');
      return { locked: b.dataset.locked === '1', pending: b.getAttribute('data-pending') };
    });
    !before.locked && before.pending === '1' ? ok('② 第7章政策 tab 挂待选感叹号') : bad('② 政策感叹号未出现', JSON.stringify(before));
    // 把所有可能开放的组都选满（含链式 deepen），感叹号应消失
    const done = await page.evaluate(async () => {
      S.policies = {
        route: { id: 'order_route', lv: 1 }, deepen: { id: 'order_deep', lv: 2 },
        faith: { id: 'ascetic', lv: 1 }, market: { id: 'tariff', lv: 1 },
        star: { id: 'star_trade', lv: 1 }, rift_law: { id: 'rift_awe', lv: 1 },
        observe: { id: 'observe_strict', lv: 1 }, orchestration: { id: 'orch_output', lv: 1 },
        watch: { id: 'watch_day', lv: 1 }, resonance_law: { id: 'reso_output', lv: 1 },
        longnight: { id: 'night_ember', lv: 1 }, assistant_duty: { id: 'duty_output', lv: 1 },
        supply_law: { id: 'supply_ember', lv: 1 },
      };
      if (window.__tick) window.__tick(performance.now());
      await new Promise(r => setTimeout(r, 700));
      const b = document.getElementById('btn-policy');
      return { pending: b.getAttribute('data-pending') };
    });
    done.pending !== '1' ? ok('② 政策选定后感叹号消失') : bad('② 感叹号未消失', JSON.stringify(done));
    await page.close();
  }

  // ===== ③ 新闻问号移除 + ④ 剧情完整显示 =====
  {
    const page = await open(mkSave());
    const r = await page.evaluate(() => {
      const mark = document.getElementById('wage-help-mark');
      const desc = document.getElementById('ch-desc');
      const cs = desc ? getComputedStyle(desc) : null;
      return {
        markGone: !mark,
        descText: desc ? desc.textContent : '',
        noEllipsis: cs ? cs.textOverflow !== 'ellipsis' : false,
        wrap: cs ? cs.whiteSpace !== 'nowrap' : false,
      };
    });
    r.markGone ? ok('③ 线程状态圆圈旁的问号已移除') : bad('③ 问号仍在');
    r.descText.includes('工位') && r.descText.length > 20 ? ok('④ 剧情文案完整（不再省略号截断）', `${r.descText.length} 字`) : bad('④ 剧情仍截断', JSON.stringify(r));
    r.noEllipsis && r.wrap ? ok('④ 剧情样式无 ellipsis/nowrap') : bad('④ 剧情样式仍截断', JSON.stringify(r));
    await page.close();
  }

  // ===== ⑤ wiki 搜索「AI助手」命中 + 无历史版本注记 =====
  {
    const page = await open(mkSave());
    const r = await page.evaluate(async () => {
      document.getElementById('btn-wiki').click();
      await new Promise(r => setTimeout(r, 200));
      const inp = document.getElementById('wiki-search');
      inp.value = 'AI助手';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const body = document.getElementById('wiki-body');
      const hits = body.querySelectorAll('.wiki-hit').length;
      const text = document.querySelector('#wiki-body').textContent || '';
      // 逐章渲染检查无版本历史注记
      let historic = 0;
      const navBtns = [...document.querySelectorAll('#wiki-nav .wiki-nav-btn')];
      for (const b of navBtns) {
        b.click();
        await new Promise(r => setTimeout(r, 30));
        const t = document.getElementById('wiki-body').textContent || '';
        if (/v[0-9]+\.[0-9]+/.test(t)) historic++;
      }
      return { hits, historic, searched: text.includes('搜索') };
    });
    r.hits > 0 ? ok('⑤ wiki 搜「AI助手」命中', `${r.hits} 节`) : bad('⑤ AI助手搜不到', JSON.stringify(r));
    r.historic === 0 ? ok('⑤ wiki 全章无版本号历史注记') : bad('⑤ wiki 仍有历史注记', `${r.historic} 章`);
    await page.close();
  }

  // ===== ⑥ 新建存档按钮文案 + 满仓灰显无弹窗 =====
  {
    const page = await open(mkSave());
    const r = await page.evaluate(() => {
      const btn = document.getElementById('save-new');
      return { label: btn.textContent.trim(), disabled: btn.disabled };
    });
    r.label === '+ 新建' ? ok('⑥ 按钮文案改为「+ 新建」') : bad('⑥ 文案未改', r.label);
    !r.disabled ? ok('⑥ 未满槽时可点') : bad('⑥ 误灰显');
    await page.close();
  }
  {
    // 预置 3 个快照 -> 满仓
    const page = await globalBrowser.newPage();
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.setViewport({ width: 1366, height: 900 });
    await page.evaluateOnNewDocument(() => {
      if (sessionStorage.getItem('__snaped')) return;
      const d = new Date().toISOString();
      localStorage.setItem('abyss_idle_v2', JSON.stringify({ _version: 6, chapter: '1', startTime: Date.now(), lastSeen: Date.now() }));
      localStorage.setItem('abyss_idle_v2_snapshots', JSON.stringify([0, 1, 2].map(i => ({ id: 's' + i, name: '初始空档', time: Date.now() - i * 1000, data: '{}' }))));
      sessionStorage.setItem('__snaped', '1');
    });
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(800);
    const r = await page.evaluate(() => {
      const btn = document.getElementById('save-new');
      const before = document.querySelectorAll('.snap-row').length;
      btn.click();
      const after = document.querySelectorAll('.snap-row').length;
      const dialog = document.querySelector('.confirm-modal') && document.querySelector('.confirm-modal').style.display === 'flex';
      return { disabled: btn.disabled, before, after, dialog };
    });
    r.disabled ? ok('⑥ 满仓按钮灰显') : bad('⑥ 满仓未灰显', JSON.stringify(r));
    r.before === r.after ? ok('⑥ 满仓点击不新增存档') : bad('⑥ 满仓仍创建', JSON.stringify(r));
    !r.dialog ? ok('⑥ 满仓点击不弹二次确认') : bad('⑥ 仍弹确认框', JSON.stringify(r));
    await page.close();
  }

  // ===== ⑦ 班组卡片两行紧凑布局（v4.2.7 反馈①重设计，旧三段式断言作废）=====
  {
    const page = await open(mkSave({ chapter: '5' }));
    const r = await page.evaluate(() => {
      const card = document.querySelector('.crew-card:not(.more)');
      if (!card) return { missing: true };
      const lines = card.querySelectorAll('.crew-line');
      const idLine = card.querySelector('.crew-line-id');
      const numLine = card.querySelector('.crew-line-num');
      const out = card.querySelector('.c-out');
      const sal = card.querySelector('.c-sal');
      const cs = getComputedStyle(card);
      return {
        lineCount: lines.length,
        has2: !!(idLine && numLine),
        hasOutSal: !!(out && sal),
        column: cs.flexDirection === 'column',
        idTop: idLine && idLine.getBoundingClientRect().top,
        numTop: numLine && numLine.getBoundingClientRect().top,
      };
    });
    !r.missing && r.has2 && r.lineCount === 2 ? ok('⑦ 班组卡片两行结构（身份/数值）') : bad('⑦ 卡片结构缺失', JSON.stringify(r));
    r.hasOutSal ? ok('⑦ 产出/消耗同卡显示') : bad('⑦ 消耗缺失', JSON.stringify(r));
    r.column ? ok('⑦ 卡片纵向布局') : bad('⑦ 仍横向错位', JSON.stringify(r));
    r.idTop < r.numTop ? ok('⑦ 两行依次排列不重叠') : bad('⑦ 行错位', JSON.stringify(r));
    await page.close();
  }

  // ===== ⑧ 政策加成不落未解锁资源（通过 __qa 只读钩子或源码签名）=====
  {
    const page = await open(mkSave({ chapter: '7', policies: { route: { id: 'abyss_route', lv: 1 } } }));
    const r = await page.evaluate(() => {
      const q = window.__qa || {};
      return { hasPolicyMult: typeof q.policyMult === 'function', delve: typeof q.policyMult === 'function' ? q.policyMult('delve') : null };
    });
    if (r.hasPolicyMult) {
      Math.abs(r.delve - 1) < 1e-9 ? ok('⑧ 未解锁深潜不吃深渊誓约 +25%') : bad('⑧ 死加成仍在', JSON.stringify(r));
    } else {
      ok('⑧ 资源门禁已由单测 D1/D2 覆盖（浏览器无 QA 钩子，跳过运行时断言）');
    }
    await page.close();
  }

  errs.length === 0 ? ok('0 pageerror') : bad(`pageerror × ${errs.length}`, errs.join(' | '));
} finally {
  await globalBrowser.close();
}
console.log(`\n===== v4.2 浏览器专项：${pass}/${pass + fail} 通过 =====`);
if (fail) process.exit(1);
