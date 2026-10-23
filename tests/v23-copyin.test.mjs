// v2.3 文案清理断言（PM §5.2）：可见 DOM 无研发类版本号/内部术语，扫描正则 0 命中；
// 排除：剧情容器（#chapter-bar）、玩家日志（#log-content）、document.title、控制台。
// 含排除项反证：剧情容器节点存在且被排除逻辑覆盖。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const BASE = 'file://' + process.cwd() + '/dist/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

// 扫描正则（PM §5.2 口径）
const SCAN_RE = 'v\\d+\\.\\d|(?<![A-Za-z])P\\d\\b|模块[A-F]|评审|修复|转向|迁移|断言';  // P\d 前向断言排除 EP2/RP1 等资源缩写

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const SCANNER = (re) => {
  const rx = new RegExp(re, 'g');
  const excluded = [];
  // 排除集：剧情容器 + 玩家日志（收集以供反证）
  for (const id of ['chapter-bar', 'log-content']) {
    const el = document.getElementById(id);
    if (el) excluded.push({ id, len: el.textContent.trim().length });
  }
  // 克隆 body 并摘除排除节点后扫描（textContent 含 details 折叠区）
  const clone = document.body.cloneNode(true);
  for (const id of ['chapter-bar', 'log-content']) {
    const el = clone.querySelector('#' + id);
    if (el) el.remove();
  }
  const text = clone.textContent;
  const hits = [];
  let m;
  while ((m = rx.exec(text)) !== null) {
    const i = Math.max(0, m.index - 18);
    hits.push(text.slice(i, m.index + m[0].length + 18).replace(/\s+/g, ' '));
    if (hits.length > 8) break;
  }
  return { hits, excluded, title: document.title };
};

// ===== 场景 A：新档全站可见 DOM 扫描 =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  const r = await page.evaluate(SCANNER, SCAN_RE);
  rec('A1 新档可见 DOM 扫描 0 命中（排除剧情/日志/title）', r.hits.length === 0, r.hits.join(' § ').slice(0, 200));
  rec('A2 排除反证：剧情容器与日志节点真实存在且被摘除', r.excluded.length === 2 && r.excluded.every(e => e.id && e.len >= 0), JSON.stringify(r.excluded));
  // v2.3.2 断言参数化：title 版本号随 package.json 走（原硬编码 v2.3.1，升版即挂）
  const pkgVer = JSON.parse(readFileSync('package.json', 'utf8')).version;
  rec('A3 title 版本号豁免（title 含当前版本号但不计入扫描）', new RegExp('v' + pkgVer.replace(/\./g, '\\.')).test(r.title), `${r.title}（package.json=${pkgVer}）`);
  rec('A4 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 B：晚期档全站扫描（解锁更多面板：科技树/永恒矩阵/岔路口/效能建筑等） =====
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.evaluateOnNewDocument(() => {
    localStorage.removeItem('abyss_idle_v2');
    localStorage.removeItem('v21_migrated_toast');
    localStorage.setItem('abyss_idle_v2', JSON.stringify({
      _version: 6, chapter: '6A', storyline: 'default',
      ep: 1e9, rp: 1e7, es: 500, faith: 20, pt: 30, dm: 10, prestigePoints: 12,
      upgrades: {}, milesDone: {}, tech: { warmup: true, eff2: true },
      unlockedBuildings: { warmup_node: true, eff_tower: true },
      buildings: { warmup_node: 2, eff_tower: 1 },
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: true, faith: true, pt: true, dm: true },
      lastSeen: Date.now(), startTime: Date.now(),
    }));
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1200);
  const r = await page.evaluate(SCANNER, SCAN_RE);
  rec('B1 晚期档可见 DOM 扫描 0 命中', r.hits.length === 0, r.hits.join(' § ').slice(0, 200));
  rec('B2 无页面错误', errs.length === 0, errs.join('; ').slice(0, 120));
  await page.close();
}

// ===== 场景 C：五点位定向复核（源码断言） =====
{
  const { readFileSync } = await import('node:fs');
  const html = readFileSync('index.html', 'utf-8');
  const tech = readFileSync('src/modules/tech.js', 'utf-8');
  const main = readFileSync('src/main.js', 'utf-8');
  rec('C1 点位⑤：效能分区规则文案已删（「建筑驱动 · 科技是钥匙」不存在于 index.html）', !html.includes('建筑驱动 · 科技是钥匙'), '');
  rec('C2 点位②：图例无线程薪资四态（v1.3）括注', !/薪资四态<\/b>（v1\.3）/.test(html), '');
  rec('C3 点位③：tech 迁移说明卡为玩家语言（旧研究的效力已折算）', tech.includes('旧研究的效力已折算进建筑体系'), '');
  rec('C4 点位④：main 迁移 toast 无版本词', main.includes("toast('存档已升级：旧研究的效力已折算进建筑体系") && !/toast\('v\d/.test(main), '');
  rec('C5 点位⑤：makeV21Item title 无 v2.1 前缀', !/v2\.1 效能建筑：先以 RP 解锁/.test(readFileSync('src/modules/shop.js', 'utf-8')), '');
}

await browser.close();
const fail = results.filter(r => !r.ok).length;
console.log(`\n[v23-copyin] ${results.length - fail}/${results.length} 项通过`);
process.exit(fail ? 1 : 0);
