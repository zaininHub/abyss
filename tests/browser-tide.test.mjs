// v2.1.2 浏览器验证：4 相位潮汐卡片标签 + hover 提示
import puppeteer from 'puppeteer-core';

const results = [];
function rec(name, ok, detail) { results.push({ name, ok }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' :: ' + detail : '')); }

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
});
const url = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

// 4 相位期望（与 src/data/balance.js phases 一致）
// v2.0 §2：退潮新增科技成本 -20%（techCostMult 0.8，科技树按当前相位价格结算）
const expect = [
  { name: '涨潮', tags: ['产出+30%', '薪资+50%'], titleMust: ['潮汐·涨潮', '产出+30%', '薪资+50%', '正面事件持续时长×1.5'], noTech: true },
  { name: '平潮', tags: [], titleMust: ['潮汐·平潮', '无修正'], noTech: true },
  { name: '退潮', tags: ['产出-30%', '薪资-20%', '科技成本-20%'], titleMust: ['潮汐·退潮', '产出-30%', '薪资-20%', '科技成本-20%', '科技树按当前相位价格结算'] },
  { name: '乱流', tags: [], titleMust: ['潮汐·乱流', '薪资+30%', '负面事件概率×2'], noTech: true },
];

for (let phase = 0; phase < 4; phase++) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.evaluateOnNewDocument((p) => {
    localStorage.setItem('abyss_idle_v2', JSON.stringify({ ep: 50, lastSeen: Date.now(), tidePhase: p, tideTimer: 9999 }));
  }, phase);
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));
  const info = await page.evaluate(() => {
    const el = document.getElementById('h-tide');
    return { text: el?.textContent || '', title: el?.title || '' };
  });
  const exp = expect[phase];
  // 乱流薪资+30% 是标签；乱流/平潮的产出乘数=1 无产出标签
  const tagOk = exp.tags.every(t => info.text.includes(t))
    && !/\d+%(?!.*(薪资|科技成本))/.test(info.text.replace(/薪资[+-]?\d+%/g, '').replace(/产出[+-]?\d+%/g, '').replace(/科技成本[+-]?\d+%/g, '')); // 不存在裸百分比
  const titleOk = exp.titleMust.every(t => info.title.includes(t)) && (!exp.noTech || !info.title.includes('科技'));
  rec(`相位${phase}·${exp.name}：标签全部带属性名${exp.tags.length ? `（${exp.tags.join(' ')}）` : '（无效果标签）'}`,
    errs.length === 0 && tagOk, errs.length ? errs.join(';') : `text="${info.text.trim()}"`);
  rec(`相位${phase}·${exp.name}：hover 提示含全部生效效果${exp.noTech ? '且无科技成本' : ''}`, titleOk, `title="${info.title}"`);
  await page.close();
}

await browser.close();
const fails = results.filter(r => !r.ok).length;
console.log(`\n浏览器验证结果：${results.length - fails} 通过，${fails} 失败`);
process.exit(fails > 0 ? 1 : 0);
