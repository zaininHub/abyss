// v2.6.2 三项反馈修复：
// ① 触手重绘（v3.12.0 起改为 56px 横向低矮卷须底部条带，与深渊凝视统一）
// ② AI 激活按钮未达标时真正禁点（disabled 属性，灰显不可点）
// ③ 宗教入口持久化（曾达标常显 + 唤醒按钮禁点）
import { readFileSync } from 'node:fs';
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/modules/ai.js', import.meta.url), 'utf8');
const rel = readFileSync(new URL('../src/modules/religions.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const state = readFileSync(new URL('../src/state.js', import.meta.url), 'utf8');
// v3.10.0：跨局保留清单已从 state.js 下沉到 core/stateSchema.js 单一真源
const schema = readFileSync(new URL('../src/core/stateSchema.js', import.meta.url), 'utf8');

// ===== ① 触手 =====
// v3.12.10 ②：触手整体重做——1/2/3 级依次 1/2/3 条、条带压缩到 32px、
//   三条独立的 140×32 SVG（不再横向拉伸）、填充式锥形剪影 + 吸盘 + 冷光边缘。
//   旧断言（1200×56 viewBox / 四段描边宽度 / 竖向渐变）编码旧形态，按设计变更替换成结构不变量。
const gaze = readFileSync(new URL('../src/modules/abyssGaze.js', import.meta.url), 'utf8');
const armCount = (html.match(/class="td-arm tentacle-/g) || []).length;
const svgCount = (html.match(/viewBox="0 0 140 32"/g) || []).length;
rec('V1 三条独立、不拉伸的锥形剪影臂 + 沿线吸盘',
  armCount === 3 && svgCount === 3
  && (html.match(/class="td-body"/g) || []).length === 3
  && (html.match(/class="td-suck"/g) || []).length >= 15
  && html.includes('preserveAspectRatio="xMidYMax meet"') && !html.includes('preserveAspectRatio="none"')
  && html.includes('class="td-rim"') && html.includes('class="td-glint"'),
  `arms=${armCount} svg=${svgCount}`);
rec('V1 鱼缸 1/2/3 级显 1/2/3 条（隐藏臂不占位，可见臂自动居中）',
  css.includes('.td-arm.tentacle-b, .td-arm.tentacle-c { display: none; }')
  && css.includes('.tentacle-deco.tentacle-2 .td-arm.tentacle-b')
  && css.includes('.tentacle-deco.tentacle-3 .td-arm.tentacle-c')
  && css.includes('justify-content: center'), '');
rec('V1 条带压到 32px、凝视回到剧情行（prepend .sys-btns，不再 fixed）、装饰不阻挡页面',
  css.includes('--bottom-deco-h: 32px') && css.includes('pointer-events: none')
  && gaze.includes('.sys-btns') && gaze.includes('prepend') && !gaze.includes('position:fixed;left:50%')
  && html.includes('tentacle-tap-zone'), '');
rec('V1 触手点击热区铺满底部条带',
  css.includes('.tentacle-tap-zone {') && /\.tentacle-tap-zone \{[^}]*width: 100%/.test(css), '');
rec('V1 点击动画一次性轻抬 + 冷光转青（不再有常驻 glow）',
  css.includes('@keyframes td-tap') && css.includes('.tentacle-deco.tap .td-glint')
  && css.includes('.tentacle-deco.tap .td-rim') && !css.includes('tentacleGlow'), '');

// ===== ② AI 激活按钮 =====
rec('V2 AI 激活按钮未达标带 disabled 属性', ai.includes("${rpOk ? '' : 'disabled'}"), 'data-ai-build-activate'); // v3.12.13 ⑥：激活消耗由 EP 改为研究点 RP（epOk→rpOk）
rec('V2 AI 激活仍校验全部资源解锁', ai.includes("if (!allResDiscovered(S)) return { ok: false, reason: '未解锁全部资源点' };"), 'activateAutoBuild');

// ===== ③ 宗教 =====
rec('V3 唤醒按钮未达标带 disabled 属性（含每秒 affordability 刷新）', rel.includes('data-religion-unlock="1" ${ok && (S.ep || 0) >= religionWakeCost() ? \'\' : \'disabled\'}') && rel.includes('w.disabled = !canUnlockReligion() || (S.ep || 0) < religionWakeCost()'), '');
rec('V3 宗教入口曾达标常显（_religionHintSeen）', main.includes('S._religionHintSeen = true') && main.includes("religionUnlocked() || canUnlockReligion() || S._religionHintSeen"), 'refreshTabVisibility');
rec('V3 _religionHintSeen 入 defaultState + crossRun', state.includes('_religionHintSeen: false') && schema.includes("'_religionHintSeen'") && schema.includes('CROSS_RUN_KEYS'), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.2 三项修复源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
