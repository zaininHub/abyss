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
// v3.12.0 反馈⑭：触手由「右下角竖立章鱼触手」改为「56px 横向低矮卷须底部条带」，
// 旧断言（贝塞尔折点 / 描边色值 / steps(6) 六帧抽摆）编码旧形态，改校验新形态不变量。
// v3.12.7 ①：横向卷须认不出是触手 → 重画为「从底边升起的章鱼臂」：
//   四段递减粗细 + 吸盘 + 竖向渐变；旧「td-base / td-mid-* 三层横向描边」断言按设计变更替换。
const gaze = readFileSync(new URL('../src/modules/abyssGaze.js', import.meta.url), 'utf8');
rec('V1 章鱼臂：四段递减粗细的臂 + 沿线吸盘', html.includes('viewBox="0 0 1200 56"') && html.includes('class="td-arm-1"') && html.includes('class="td-arm-4"') && html.includes('class="td-suck"') && css.includes('.td-arm-1 { stroke: url(#td-grad-arm); stroke-width: 26; }') && css.includes('.td-arm-4 { stroke: #c4b5fd; stroke-width: 4.5; }'), '');
rec('V1 触手无棱角折线（弃用 L 阶梯折线）', !html.includes('L30 106 L46 100 L41 84 L56 70') && !html.includes('L95 104 L112 98'), '');
rec('V1 竖向渐变着色臂身（底暗紫 → 尖端亮紫）', html.includes('id="td-grad-arm"') && html.includes('gradientUnits="userSpaceOnUse"') && css.includes('.td-suck { fill: rgba(240, 219, 255, .5); }'), '');
// v3.12.1 反馈②：凝视上移到系统按钮行（HUD 徽记），56px 底部条带由触手独占；旧「同高」断言已过期
rec('V1 触手独占 56px 底部条带，凝视已上移且不阻挡页面', css.includes('--bottom-deco-h: 56px') && css.includes('pointer-events: none') && gaze.includes('.sys-btns') && gaze.includes('position:relative') && html.includes('tentacle-tap-zone'), '');
// v3.12.7 ①：点击热区必须与触手同宽，否则「点触手没反应」
rec('V1 触手点击热区铺满底部条带', css.includes('.tentacle-tap-zone {') && /\.tentacle-tap-zone \{[^}]*width: 100%/.test(css), '');

// ===== ② AI 激活按钮 =====
rec('V2 AI 激活按钮未达标带 disabled 属性', ai.includes("${epOk ? '' : 'disabled'}"), 'data-ai-build-activate'); // v3.2.4 反馈④：未全解锁整块不展示，按钮仅在展示态判 EP
rec('V2 AI 激活仍校验全部资源解锁', ai.includes("if (!allResDiscovered(S)) return { ok: false, reason: '未解锁全部资源点' };"), 'activateAutoBuild');

// ===== ③ 宗教 =====
rec('V3 唤醒按钮未达标带 disabled 属性（含每秒 affordability 刷新）', rel.includes('data-religion-unlock="1" ${ok && (S.ep || 0) >= religionWakeCost() ? \'\' : \'disabled\'}') && rel.includes('w.disabled = !canUnlockReligion() || (S.ep || 0) < religionWakeCost()'), '');
rec('V3 宗教入口曾达标常显（_religionHintSeen）', main.includes('S._religionHintSeen = true') && main.includes("religionUnlocked() || canUnlockReligion() || S._religionHintSeen"), 'refreshTabVisibility');
rec('V3 _religionHintSeen 入 defaultState + crossRun', state.includes('_religionHintSeen: false') && schema.includes("'_religionHintSeen'") && schema.includes('CROSS_RUN_KEYS'), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.2 三项修复源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
