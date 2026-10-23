// v2.6.4 八项反馈源码断言
import { readFileSync } from 'node:fs';
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const rel = readFileSync(new URL('../src/data/religions.js', import.meta.url), 'utf8');
const relm = readFileSync(new URL('../src/modules/religions.js', import.meta.url), 'utf8');
const econ = readFileSync(new URL('../src/modules/economy.js', import.meta.url), 'utf8');
const prestige = readFileSync(new URL('../src/modules/prestige.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rift = readFileSync(new URL('../src/modules/rift.js', import.meta.url), 'utf8');
const bal = readFileSync(new URL('../src/data/balance.js', import.meta.url), 'utf8');

// ① 章鱼触手
rec('V1 章鱼触手：吸盘圆点（深紫+亮青双层）', html.includes('fill="#311b92"') && html.includes('fill="#4dd0e1"'), 'suckers');
rec('V1 赛博霓虹高光描边（青）', html.includes('stroke="#4dd0e1"'), 'neon');
// ② 深入状态顶部
rec('V2 顶部深入状态容器', html.includes('id="rift-exp-status"'), 'hero');
rec('V2 renderHero 填充深入状态（含剩余/腐化）', main.includes('深入裂隙 Lv.') && main.includes('S.riftExpedition'), '');
rec('V2 深入 tick 连带 dirty.hero 实时刷新', rift.includes('dirty.hero = true'), '');
// ③ 信仰减缓 + 2 位小数
rec('V3 圣所产出 0.15→0.05（减缓）', rel.includes('faithPerSec: 0.05'), '');
rec('V3 顶栏信仰 2 位小数', main.includes("(S.faith || 0).toFixed(2)"), 'h-faith');
rec('V3 宗教面板余额 2 位小数', relm.includes("(S.faith || 0).toFixed(2)"), 'panel');
// ④ 晋升文案 + 暗色
rec('V4 未达标按钮文案（晋升转生（未达标））', prestige.includes('晋升转生（未达标）'), '');
rec('V4 未达标原因行（还差 N EP）', prestige.includes('还差 ') && prestige.includes('未达标时按钮暗置不可点'), '');
rec('V4 按钮暗色样式', css.includes('background: #14161c !important') && css.includes('.btn:disabled'), '');
// ⑤ 信仰超长线
rec('V5 神谕塔（信仰产出 ×1.15/级，需圣印≥3）', rel.includes('ORACLE') && relm.includes('sealLevel() < 3'), '');
rec('V5 圣战军（全局 ×1.12/级，需圣所≥5）', rel.includes('CRUSADE') && relm.includes('temple) || 0) < 5'), '');
rec('V5 economy 接入圣战军全局乘区', econ.includes('S.religion.crusade > 0'), '');
rec('V5 templeFaithPerSec 接入神谕塔', rel.includes('oracleLevel()'), '');
// ⑥ 维修坞流失明确定义
rec('V6 维修坞流失免疫明确定义', bal.includes('流失免疫：流失预警触发概率 10%/min → 0'), '');
// ⑦ 哨站动态文案
rec('V7 哨站动态文案（当前→下一级）', rift.includes('当前 ${cur} 分钟 → 下一级 ${next} 分钟'), '');
// ⑧ 能量合剂薪资显示
rec('V8 hero 每秒薪资显示', html.includes('id="staff-salary"') && main.includes('staffSalaryPerSec().toFixed(2)'), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.4 八项反馈源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
