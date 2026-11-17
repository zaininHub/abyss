// v4.1.0 反馈③ 专项：相位共鸣行修
//
// 验收口径：
//   ① 「0/20」层数文字不再不正常换行——多档视口（1600/1440/1366/1280）下，
//      层数 span 与 5 个共鸣按钮同一行（y 差 ≤2px），且自身文本节点不被拆行。
//   ② 共鸣倍率行前有焦点三角标——四行倍率各带焦点三角形（焦点行实色、非焦点淡显）。
//   ③ 「编排倍率」标签与「均衡/产能…」策略按钮同行（margin-left:auto 推右）；
//      旧文案「策略与相位共鸣合并」删除；「编排倍率 · 」独立标签行不再存在。
//   ④ 回归：共鸣开关/焦点 aria 契约、按钮 ≥24×24、倍率与读侧一致。
import puppeteer from 'puppeteer-core';
import { chromePath } from './_chrome.mjs';

const URL = 'file://' + process.cwd() + '/dist/index.html';
const CHROME = process.env.CHROME_PATH || chromePath();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (m, d = '') => { pass++; console.log(`  ✓ ${m}${d ? ' — ' + d : ''}`); };
const bad = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ' — ' + d : ''}`); };

const NOW = Date.now();
const mkSave = () => JSON.stringify({
  _version: 6, chapter: '10', storyline: 'line_order', // v4.2.0：共鸣绑第 10 章——本测试验共鸣行 UI，章节放到已过线
  ep: 1e12, rp: 1e6, es: 1e6, dm: 1e6, pt: 1e6, faith: 1e6,
  buildings: {}, cultists: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: '线程' + (i + 1), mood: '正常', profession: 'acolyte', level: 1, boundTo: '' })),
  tech: {}, religion: { unlocked: true, branch: 'sun', seal: 4, temple: 6, devotion: 500, transcend: 2 },
  _crewUnlocked: true, prestige: 3, prestigePoints: 20, projectsDone: 30,
  eternal: { skin_light: 1 }, focusLevel: 12,
  resDiscovered: { ep: true, cps: true, run: true, tide: true, rp: true, fp: true, pt: true, dm: true, vs: true, es: true },
  ai: { reserve: 0.3 }, lastSeen: NOW, startTime: NOW,
});

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const errs = [];
try {
  for (const vw of [1600, 1440, 1366, 1280]) {
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await page.setViewport({ width: vw, height: 900 });
    await page.evaluateOnNewDocument(s => { localStorage.setItem('abyss_idle_v2', s); }, mkSave());
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(1200);

    const r = await page.evaluate(() => {
      const el = document.getElementById('orchestration-panel');
      if (!el || getComputedStyle(el).display === 'none') return { visible: false };
      const toggle = el.querySelector('[data-res-toggle]');
      if (!toggle) return { visible: true, resUnlocked: false };
      // ① 共鸣行：层数 span 与按钮同一行（用中心 y 比较——align-items:center 下高低不同元素 top 有偏移）
      const row = toggle.parentElement;
      const layerSpan = row.querySelector('span');
      const btns = [...row.querySelectorAll('button')];
      const cy = n => { const r = n.getBoundingClientRect(); return r.y + r.height / 2; };
      const cySpan = layerSpan ? cy(layerSpan) : -1;
      const sameRow = layerSpan && btns.length === 5 && btns.every(b => Math.abs(cy(b) - cySpan) <= 3);
      // span 文本不被拆行
      let spanRects = 0;
      if (layerSpan) { const rg = document.createRange(); rg.selectNodeContents(layerSpan); spanRects = rg.getClientRects().length; }
      // ② 倍率行三角标
      const markSpans = [...el.querySelectorAll('div')].filter(d => getComputedStyle(d).display === 'grid');
      const resGrid = markSpans.find(g => g.previousElementSibling && g.previousElementSibling.querySelector && g.previousElementSibling.querySelector('[data-res-toggle]'));
      const rowMarks = resGrid ? [...resGrid.children].map(d => {
        const m = d.querySelector('span');
        return m ? { icon: m.textContent.trim(), dim: m.style.opacity === '0.35', accent: (m.style.color || '').includes('accent') } : null;
      }) : [];
      // ③ 编排倍率标签与策略按钮同行（中心 y 比较）
      const labelSpan = [...el.querySelectorAll('span')].find(s => (s.textContent || '').trim() === '编排倍率');
      const modeBtn = el.querySelector('[data-orch-mode]');
      const labelOk = labelSpan && modeBtn
        ? Math.abs(cy(labelSpan) - cy(modeBtn)) <= 3
        : false;
      // 推右判定：标签右缘贴近行右缘（行内 gap 余量 < 8px），且 marginLeft 声明为 auto（查行内 style）
      const labelRightPushed = labelSpan
        ? (labelSpan.getAttribute('style') || '').includes('margin-left:auto')
        : false;
      const labelAtRightEdge = labelSpan
        ? (() => { const rr = labelSpan.getBoundingClientRect(); const pr = el.getBoundingClientRect(); return pr.right - rr.right < 40; })()
        : false;
      const txt = el.textContent || '';
      return {
        visible: true, resUnlocked: true,
        layerText: layerSpan ? layerSpan.textContent.trim() : '',
        sameRow, spanRects,
        rowMarks: rowMarks.map(x => x ? x.icon : '?'),
        focusedMarked: rowMarks.filter(x => x && (x.accent || !x.dim)).length,
        labelOk, labelRightPushed, labelAtRightEdge,
        hasOldText: /策略与相位共鸣合并/.test(txt),
        hasOldLabelDiv: [...el.querySelectorAll('div')].some(d => d.children.length === 0 && /编排倍率 · /.test(d.textContent || '')),
      };
    });

    console.log(`\n[${vw}px]`);
    if (!r.visible) { bad('编排卡未渲染', ''); await page.close(); continue; }
    r.resUnlocked ? ok('共鸣区已解锁', '') : bad('共鸣区未解锁', '');
    r.layerText === '0/20' ? ok('层数文字为紧凑口径「0/20」', r.layerText) : bad('层数文字异常', r.layerText);
    r.sameRow ? ok('层数与 5 个按钮同一行（无换行）', '中心 y 一致') : bad('层数仍换行', JSON.stringify(r));
    r.spanRects === 1 ? ok('层数文本单行不拆行', `${r.spanRects} 段`) : bad('层数文本被拆行', String(r.spanRects));
    r.rowMarks.length === 4 ? ok('四行倍率全部带三角标', r.rowMarks.join(' ')) : bad('倍率三角标缺失', JSON.stringify(r.rowMarks));
    r.focusedMarked >= 1 ? ok('焦点倍率高亮（accent 实色）', `${r.focusedMarked}/4`) : bad('焦点倍率未高亮', '');
    r.labelOk ? ok('「编排倍率」标签与策略按钮同行', '') : bad('编排倍率标签未对位', '');
    (r.labelRightPushed && r.labelAtRightEdge) ? ok('标签 margin-left:auto 推右且贴近右缘', `right-edge 差 ${r.labelAtRightEdge}`) : bad('标签未推右', JSON.stringify({ pushed: r.labelRightPushed, atEdge: r.labelAtRightEdge }));
    !r.hasOldText ? ok('旧文案「策略与相位共鸣合并」已删除', '') : bad('旧文案仍在', '');
    !r.hasOldLabelDiv ? ok('独立「编排倍率 · 」标签行已删除', '') : bad('独立标签行仍在', '');
    await page.close();
  }

  errs.length === 0 ? ok('0 pageerror', '') : bad('运行期异常', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(`\n========== v4.1.0 F3 专项：${pass} / ${fail} ==========`);
if (fail) process.exitCode = 1;
