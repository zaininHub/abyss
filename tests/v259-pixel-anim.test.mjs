// v2.5.9 像素克苏鲁动画检查：
// ① 关键动画弃平滑 ease-in-out → 离散步进（steps）——像素帧动画手感
// ② 触手 SVG 平滑贝塞尔 → 阶梯折线（像素触手），克苏鲁紫保留
// ③ 浏览器 computed 实测：petFloat steps(3)/tentacle steps(4)/tide steps(2)
import { readFileSync } from 'node:fs';
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };

// ========== V1 源码断言 ==========
{
  const css = readFileSync('src/style.css', 'utf-8');
  rec('V1 宠物浮标 steps(3, end)（弃 ease-in-out）', css.includes('animation: petFloat 2.2s steps(3, end) infinite'), 'css');
  rec('V1 触手 steps(6, end) 细腻抽摆（v2.6.2 四帧→六帧）', css.includes('animation: tentacle-sway 5s steps(6, end) infinite'), 'css');
  rec('V1 混沌潮汐 steps(2, end) 块状闪烁', css.includes('tide-chaos-anim .8s steps(2, end) infinite alternate'), 'css');
  rec('V1 触手六帧关键帧（15/30/50/70/85）', css.includes('15% { transform: rotate(-1.5deg); }') && css.includes('70% { transform: rotate(2deg); }') && css.includes('85% { transform: rotate(1deg); }'), 'css');
  const html = readFileSync('index.html', 'utf-8');
  rec('V1 触手为平滑贝塞尔曲线（圆润真实触手，v2.7.1 重构：锥形基座粗、尖端内卷）', html.includes('M32 124 C42 114 32 100 44 88') && html.includes('C54 26 48 24 52 14'), 'svg');
  rec('V1 触手 stroke-linecap 圆头（圆润真实触手端帽）', html.includes('stroke-linecap="round"'), 'svg');
  rec('V1 克苏鲁紫配色保留（#9c27b0/#7b1fa2/#6a1b9a）', html.includes('#9c27b0') && html.includes('#7b1fa2') && html.includes('#6a1b9a'), 'svg');
  // 中性动画未误改：justBought / corruption-fill / transition 保持
  rec('V1 购买高亮/腐化条等中性动画未被误改', css.includes('animation: justBought 1s ease') && css.includes('transition:width .4s'), 'css');
}

// ========== V2 浏览器 computed 实测 ==========
{
  const puppeteer = (await import('puppeteer-core')).default;
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const fileUrl = 'file://' + join(__dirname, '../dist/index.html');
  const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const inject = JSON.stringify({
      _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, pt: 99999,
      upgrades: {}, buildings: { abyss_fishbowl: 3 }, tech: {}, cultists: [], religion: {}, faith: 0,
      pets: { hamster: { icon: '🐀', name: '庭鼠', level: 1, exp: 0, gen: 1 } }, activePets: ['hamster'], fusesDone: 0,
      resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: true, dm: false },
      lastSeen: Date.now(), startTime: Date.now(),
    });
    const page = await browser.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(String(e)));
    await page.evaluateOnNewDocument((s) => { localStorage.setItem('abyss_idle_v2', s); }, inject);
    await page.goto(fileUrl, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 600));

    const anims = await page.evaluate(() => {
      const g = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { name: cs.animationName, dur: cs.animationDuration, timing: cs.animationTimingFunction };
      };
      return {
        pet: g('#pet-float .pet-item'),
        tentacle: g('#tentacle-deco .tentacle'),
        tentacleB: g('#tentacle-deco .tentacle-b'),
        tentacleC: g('#tentacle-deco .tentacle-c'),
      };
    });
    rec('V2 宠物浮标 computed: petFloat steps(3, end)', !!anims.pet && anims.pet.name === 'petFloat' && anims.pet.timing.includes('steps(3'), JSON.stringify(anims.pet));
    rec('V2 触手 computed: tentacle-sway steps(6)', !!anims.tentacle && anims.tentacle.name === 'tentacle-sway' && anims.tentacle.timing.includes('steps(6'), JSON.stringify(anims.tentacle));
    rec('V2 三触手错峰（7s/9s 延迟）', anims.tentacleB && anims.tentacleB.dur === '7s' && anims.tentacleC && anims.tentacleC.dur === '9s', JSON.stringify({ b: anims.tentacleB && anims.tentacleB.dur, c: anims.tentacleC && anims.tentacleC.dur }));
    // 触手 DOM 路径为折线
    const pathD = await page.evaluate(() => {
      const p = document.querySelector('#tentacle-deco svg path');
      return p ? p.getAttribute('d') : '';
    });
    rec('V2 触手路径为平滑贝塞尔曲线（C 命令）', pathD.includes('C42 114 32 100 44 88'), pathD.slice(0, 40));
    // 鱼缸 3 级 → 三触手可见（tentacle-c opacity .8）
    const tentacleC = await page.evaluate(() => {
      const el = document.querySelector('#tentacle-deco .tentacle-c');
      return el ? getComputedStyle(el).opacity : null;
    });
    rec('V2 鱼缸 3 级三触手可见（tentacle-c 显示）', tentacleC === '0.8', `opacity=${tentacleC}`);
    rec('V2 无 JS 运行时错误', jsErrors.length === 0, jsErrors.join(';'));
  } finally { await browser.close(); }
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.9 像素克苏鲁动画检查封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
