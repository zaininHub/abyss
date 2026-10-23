// v2.6.5 四项反馈源码断言
import { readFileSync } from 'node:fs';
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const buildings = readFileSync(new URL('../src/data/buildings.js', import.meta.url), 'utf8');
const line = readFileSync(new URL('../src/storylines/line_abyss.js', import.meta.url), 'utf8');
const ai = readFileSync(new URL('../src/modules/ai.js', import.meta.url), 'utf8');
const relm = readFileSync(new URL('../src/modules/religions.js', import.meta.url), 'utf8');
const tech = readFileSync(new URL('../src/modules/tech.js', import.meta.url), 'utf8');
const shop = readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');

// ① 后期成本加速
rec('V1 后期成本加速函数（50 级内不变，超过后 ×1.08/级）', buildings.includes('lateStageCost') && buildings.includes('lv <= 50'), '');
rec('V1 buildingCost / buildingCostV21 均接入后期加速', buildings.includes('lateStageCost(lv, base)') && buildings.includes('lateStageCost(lv, base)') && buildings.includes('buildingCostV21'), '');
// ② 混沌心智不可取消
rec('V2 混沌心智 desc 更正为永久生效不可取消', line.includes('永久生效不可取消') && line.includes('chaos_mind'), '');
rec('V2 AI 面板文案删除"勾销"、标注不可取消', ai.includes('不可取消') && !ai.includes('勾销'), '');
// ③ 防抖
rec('V3 科技卡价格文本防抖（不变跳过写入）', tech.includes('c.textContent !== txt'), '');
rec('V3 商店灰态防抖（class 不变跳过写入）', shop.includes("el.classList.contains('cant') !== cant"), '');
// ④ 信仰暂停防御
rec('V4 tickReligion 暂停时直接返回（暂停不产出）', relm.includes('if (S.paused) return;'), '');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.5 源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
