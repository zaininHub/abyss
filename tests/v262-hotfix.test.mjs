// v2.6.2 三项反馈修复：
// ① 触手重绘（三端渐变粗细 + 加密折点 + 深色描边 + 6 帧动画）
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

// ===== ① 触手 =====
rec('V1 触手平滑贝塞尔曲线 + 多层描边（基座粗 16 → 主 10 → 高光 4.5 → 霓虹 1.6，圆头端帽）', html.includes('C42 114 32 100 44 88') && html.includes('stroke-linecap="round"') && html.includes('stroke-width="10"') && html.includes('stroke-width="4.5"'), '');
rec('V1 触手无棱角折线（弃用 L 阶梯折线）', !html.includes('L30 106 L46 100 L41 84 L56 70') && !html.includes('L95 104 L112 98'), '');
rec('V1 深色描边层（基座粗描边）', html.includes('stroke="#3d1d6e"') && html.includes('stroke-width="10"'), '');
rec('V1 动画六帧抽摆（steps(6) + 6 keyframes）', css.includes('steps(6, end)') && css.includes('15% { transform: rotate(-1.5deg); }') && css.includes('70% { transform: rotate(2deg); }'), '');

// ===== ② AI 激活按钮 =====
rec('V2 AI 激活按钮未达标带 disabled 属性', ai.includes("${resOk && epOk ? '' : 'disabled'}"), 'data-ai-build-activate');
rec('V2 AI 激活仍校验全部资源解锁', ai.includes("if (!allResDiscovered(S)) return { ok: false, reason: '未解锁全部资源点' };"), 'activateAutoBuild');

// ===== ③ 宗教 =====
rec('V3 唤醒按钮未达标带 disabled 属性', rel.includes("${ok ? '' : 'disabled'}") && rel.includes('data-religion-unlock="1" ${ok ? \'\' : \'disabled\'}'), '');
rec('V3 宗教入口曾达标常显（_religionHintSeen）', main.includes('S._religionHintSeen = true') && main.includes("religionUnlocked() || canUnlockReligion() || S._religionHintSeen"), 'refreshTabVisibility');
rec('V3 _religionHintSeen 入 defaultState + crossRun', state.includes('_religionHintSeen: false') && state.includes("'_religionHintSeen'"), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.2 三项修复源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
