// v2.6.6 四项反馈源码断言
import { readFileSync } from 'node:fs';
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const econ = readFileSync(new URL('../src/modules/economy.js', import.meta.url), 'utf8');
const bal = readFileSync(new URL('../src/data/balance.js', import.meta.url), 'utf8');
const off = readFileSync(new URL('../src/modules/offline.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/modules/ai.js', import.meta.url), 'utf8');
const pets = readFileSync(new URL('../src/modules/pets.js', import.meta.url), 'utf8');
const upg = readFileSync(new URL('../src/data/upgrades.js', import.meta.url), 'utf8');

// ① 离线收益远低于在线 + 不增任务进度
rec('V1 离线默认 25%（原 50%）、offline1 钥匙 40%', econ.includes('let m = 0.25') && econ.includes('m = 0.4'), '');
rec('V1 信号塔档位下调至 40%/60%/100%（最高不超过在线）', bal.includes("value: 0.4 }") && bal.includes("value: 0.6 }") && bal.includes("value: 1.0 }"), '');
rec('V1 离线不增加任务进度（移除到期结算与补发）', off.includes('离线期间任务冻结') && !off.includes('projDone++'), '');
// ② 章鱼触手平滑曲线
rec('V2 触手改用平滑贝塞尔曲线（无棱角折线）', html.includes('C44 110 42 88 50 70') && !html.includes('L30 106 L46 100'), 'curves');
rec('V2 圆头描边（stroke-linecap round）+ 椭圆吸盘', html.includes('stroke-linecap="round"') && html.includes('<ellipse'), '');
// ③ 混沌心智购建筑日志
rec('V3 混沌直觉候选扩展至已解锁 v21 建筑', ai.includes("kind: 'building'") && ai.includes('unlockedBuildings'), '');
rec('V3 建筑买入有独立日志（购建建筑 X 升至 Lv.N）', ai.includes('随机购建建筑') && ai.includes('升至 Lv.'), '');
// ④ PT/饼干统一
rec('V4 顶部/宠物面板文案统一为「异兽饼干」', html.includes('🍪异兽饼干') && !html.includes('宠物饼干（PT）') && !html.includes('PT 宠物饼干'), '');
rec('V4 PT 来源与解锁条件明确（宠物乐园/伊甸花园 + 购入解锁）', html.includes('来源：宠物乐园 / 伊甸花园 持续产出') && html.includes('解锁：在商店购入「宠物乐园」'), '');
rec('V4 产出减缓（乐园 0.1/s、花园 0.5/s）', upg.includes('rate:0.1') && upg.includes('rate:0.5'), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.6 源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
