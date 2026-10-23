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
rec('V1 触手三端渐变粗细（基座 10/11/12 三条 + 尖端 6/7/8 + 高光 2/3 细线）', (html.match(/stroke-width="1[012]"/g) || []).length === 3 && (html.match(/stroke-width="[678]"/g) || []).length === 3 && html.includes('stroke-width="3"') && html.includes('opacity="0.5"') && html.includes('opacity="0.4"'), '');
rec('V1 触手加密折点（每条 ≥9 段 L 命令）', html.includes('L30 106 L46 100 L41 84 L56 70 L51 52 L62 40 L57 24 L66 12 L66 6') && html.includes('L95 104 L112 98 L106 80 L121 66 L114 50 L124 38 L119 22 L127 10') && html.includes('L164 102 L181 95 L176 76 L190 62 L184 42 L193 30 L188 16 L196 8'), '');
rec('V1 深色描边层（基座粗描边）', html.includes('stroke="#4a148c"') && html.includes('stroke-width="12"'), '');
rec('V1 动画六帧抽摆（steps(6) + 6 keyframes）', css.includes('steps(6, end)') && css.includes('15% { transform: rotate(-4deg); }') && css.includes('70% { transform: rotate(8deg); }'), '');

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
