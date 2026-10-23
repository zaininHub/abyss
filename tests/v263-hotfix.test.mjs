// v2.6.3 三项反馈：
// ① B「点击与暴击」分区移除（弱化主动点击）
// ② 混沌心智勾选后禁用 AI + 混沌直觉购买（每 10s）
// ③ 触手协议触发拍动动画
import { readFileSync } from 'node:fs';
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const bal = readFileSync(new URL('../src/data/balance.js', import.meta.url), 'utf8');
const techs = readFileSync(new URL('../src/data/techs.js', import.meta.url), 'utf8');
const shop = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/modules/ai.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

// ① B 分区移除
const bIds = ['field_1', 'field_2', 'field_3', 'field_4', 'crit_furnace', 'crit_reactor', 'crit_reactor_2'];
rec('V1 B 类 7 建筑全部移除', bIds.every(id => !bal.includes(`id: '${id}'`)), '');
const bTechs = ['click_up', 'click10', 'mega_click', 'grand_click', 'crit_click', 'cps_crit', 'crit2'];
rec('V1 B 类 7 钥匙科技全部移除', bTechs.every(id => !techs.includes(`id:'${id}'`)) && bTechs.every(id => !techs.includes(`id: '${id}'`)), '');
rec('V1 商店分区标题移除 B「点击与暴击」', !shop.includes("B: '点击与暴击'"), '');

// ② 混沌心智
rec('V2 tickAI 入口检测混沌心智并整体禁用', ai.includes("S.tech && S.tech.chaos_mind") && ai.includes('chaosIntuitionTick(dt)') && ai.includes('return true;'), '');
rec('V2 混沌直觉 10s 定时随机购买最便宜未拥有升级', ai.includes('CHAOS_INT = 10') && ai.includes('.sort((a, b) => a.cost - b.cost)') && ai.includes('.slice(0, 3)') && ai.includes('Math.floor(Math.random()'), '');
rec('V2 AI 面板混沌心智生效提示（开关区不再渲染）', ai.includes('混沌心智已接管') && ai.includes('AI 自动化全面禁用'), '');

// ③ 触手协议动画
rec('V3 触手触发拍动动画 class（tap）', main.includes("deco.classList.add('tap')") && main.includes("clearTimeout(S._tentacleTapTimer)"), '');
rec('V3 tap 动画样式（steps 拍动 + 错峰延迟）', css.includes('.tentacle-deco.tap .tentacle') && css.includes('tentacle-tap .45s steps(3, end)') && css.includes('.tentacle-deco.tap .tentacle-b { animation-delay: 0.05s; }'), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.3 三项反馈源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
