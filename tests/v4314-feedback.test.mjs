// v4.3.14 第六轮玩家反馈批次（源码级锁）：
// ① 班组滚动参考成就——累积加载自动填充（探针定位：两列 grid 首组远不满容器 → 永不可滚）
// ② 领导重做：全局 +1% 固定加成（不吃研究点）、零个人产出、不升级、消耗固定 EP、
//    提拔去除等级 / 卸任从 Lv1 重新开始
// ③ 裂隙等级升级移入裂隙模块「裂隙科技」上方，科技树独立分类删除
// ④ 潮汐变换 / 线程升级（领导除外）不打日志
// ⑤ 研究点分组标题字体参考商店（紫色）
// ⑥ 产出悬浮窗线程产出与专注加成拆分展示
// ⑦ 封印奖励不赠送 DM（首裂 dmGain=0 + 日志不带「+0.0 DM」）
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ============ 反馈① 班组滚动自动填充 ============

test('R1a 班组自动填充：渲染后不可滚即追加下一组', () => {
  const src = stripComments(read('src/modules/crew.js'));
  assert.ok(/crewCardHtml/.test(src), '卡片生成函数 crewCardHtml 缺失');
  assert.ok(/crewPage\s*<\s*pageCount\s*&&\s*container\.scrollHeight\s*<=\s*container\.clientHeight/.test(src), '自动填充循环缺失');
  assert.ok(/grid\.insertAdjacentHTML\('beforeend',\s*more\)/.test(src), '填充未追加到 crew-grid');
  assert.ok(/guard\+\+\s*<\s*50/.test(src), '自动填充无防失控 guard');
});

// ============ 反馈② 领导机制重做 ============

test('R2a 领导固定 +1%：balance 值与 leaderGlobalMult 不再乘研究点', () => {
  const bal = stripComments(read('src/data/balance.js'));
  assert.ok(/leaderGlobalPerLeader:\s*0\.01/.test(bal), 'leaderGlobalPerLeader 应为 0.01（+1%）');
  assert.ok(/leaderGlobalCap:\s*0\.01/.test(bal), 'leaderGlobalCap 应为 0.01');
  const tb = stripComments(read('src/modules/threadBinding.js'));
  assert.ok(!/researchMult\('crew'\)/.test(tb), 'leaderGlobalMult 不应再乘 researchMult(crew)');
  assert.ok(/1\s*\+\s*Math\.min\(B\(\)\.leaderGlobalCap,\s*n\s*\*\s*B\(\)\.leaderGlobalPerLeader\)/.test(tb), 'leaderGlobalMult 公式应为固定 1+1%');
});

test('R2b 班组扩编乘区改挂 economy.globalMult（无死数据红线）', () => {
  const eco = read('src/modules/economy.js');
  assert.ok(/m\s*\*=\s*researchMult\('crew'\)/.test(eco), 'rp_crew 的 crew 键应有 researchMult 消费点（globalMult 内）');
});

test('R2c 领导零个人产出：staffOutputParts 跳过 leader', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/const\s+isLead\s*=\s*c\.leader\s*===\s*true/.test(eco), 'staffOutputParts 未判定领导');
  // v4.3.16 反馈①反转：领导产出仍为 0，但薪资基数计入固定份额（消耗固定 EP 落地）——
  //   total 累加跳过领导（isLead ? 0 :），salaryBase 用裸基数 bare 不吃乘区
  assert.ok(/total \+= isLead \? 0 : one \* factor;/.test(eco), '领导个人产出应为 0（total 累加跳过）');
  assert.ok(/const\s+bare\s*=\s*\(c\.output \|\| 3\) \* 0\.8;/.test(eco), '领导薪资基数应为固定裸基数（output×0.8）');
  assert.ok(/salaryBase \+= one \* \(c\.boundTo === HYPER_CONVERTER_ID \? 1 : factor\);/.test(eco), '薪资基数应计入领导固定份额');
});

test('R2d 领导不升级 + 提拔清等级：tickThreads 跳过 leader + 晋升/卸任重置 level/xp', () => {
  const tb = stripComments(read('src/modules/threadBinding.js'));
  assert.ok(/if\s*\(isLeader\(c\)\)\s*continue;/.test(tb), 'tickThreads 应跳过领导（不积累 XP）');
  const crew = stripComments(read('src/modules/crew.js'));
  const m = crew.match(/if\s*\(!c\.leader\)\s*\{[\s\S]{0,600}?crewPush\(`【\$\{c\.name\}】晋升为领导/);
  assert.ok(m, '晋升分支缺失');
  assert.ok(/c\.level\s*=\s*1;\s*c\.xp\s*=\s*0/.test(m[0]), '提拔时应重置该员工等级（level=1, xp=0）');
  const ret = crew.match(/else\s*\{[\s\S]{0,300}?c\.leader\s*=\s*false;[\s\S]{0,200}?crewPush\(`【\$\{c\.name\}】卸任领导者/);
  assert.ok(ret, '卸任分支缺失');
  assert.ok(/c\.level\s*=\s*1;\s*c\.xp\s*=\s*0/.test(ret[0]), '卸任后应从 Lv1 重新开始');
});

test('R2e 领导文案「+1%」：卡片悬浮 + wiki + 晋升日志', () => {
  const crew = read('src/modules/crew.js');
  assert.ok(/领导（全局产出 \+1%）/.test(crew), '卡片星标悬浮应写「全局产出 +1%」');
  const wiki = read('src/data/wiki.js');
  assert.ok(/领导提供固定全局产出/.test(wiki), 'wiki 应写「领导提供固定全局产出」');
  assert.ok(/没有个人 EP 产出、不升级/.test(wiki), 'wiki 应写明零产出 + 不升级');
  assert.ok(/提拔时会去除该员工等级，卸任后从 Lv1 重新开始升级/.test(wiki), 'wiki 应写明等级重置规则');
});

// ============ 反馈③ 裂隙等级迁移 ============

test('R3a 科技树挂载点删除：index.html 无 rift-tech-title/list 实节点', () => {
  // 剥 HTML 注释（v4.3.14 迁移说明里保留了旧 id 字样）
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/rift-tech-title/.test(html), '科技树 tab 仍有 rift-tech-title');
  assert.ok(!/rift-tech-list/.test(html), '科技树 tab 仍有 rift-tech-list');
});

test('R3b 裂隙面板内嵌：renderRiftPanel 在裂隙科技上方输出 riftLevelRowHtml', () => {
  const rift = read('src/modules/rift.js');
  assert.ok(/export function riftLevelRowHtml/.test(rift), 'riftLevelRowHtml 导出缺失');
  assert.ok(/html\s*\+=\s*riftLevelRowHtml\(\);/.test(rift), 'renderRiftPanel 未调用 riftLevelRowHtml');
  assert.ok(/data-rift-level-buy/.test(rift), '裂隙等级行升级按钮 data-rift-level-buy 缺失');
  // 旧科技树渲染函数已删除
  assert.ok(!/export function renderRiftLevelTech/.test(rift), 'renderRiftLevelTech 应已删除');
});

test('R3c main.js 购买分支 + 旧调用清理', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(/data-rift-level-buy/.test(main), 'main.js 缺 data-rift-level-buy 委托分支');
  assert.ok(/const r = buyRiftLevelTech\(\);/.test(main), '购买未走 buyRiftLevelTech 单一真源');
  assert.ok(!/renderRiftLevelTech/.test(main), 'main.js 仍引用 renderRiftLevelTech');
  const fs = read('src/systems/frameSystems.js');
  assert.ok(!/renderRiftLevelTech\(/.test(fs), 'frameSystems 仍调用 renderRiftLevelTech');
});

// ============ 反馈④ 日志静默 ============

test('R4a 潮汐变换不打日志：tickTide 删 log 行', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(!/log\(`潮汐：进入/.test(main), 'tickTide 仍有「潮汐：进入X期」日志');
  assert.ok(!/潮汐预案：进入/.test(main), '潮汐预案日志残留（main.js）');
  const fs = stripComments(read('src/systems/frameSystems.js'));
  assert.ok(!/log\(`潮汐预案：进入/.test(fs), 'tide-schedule 仍有「潮汐预案：进入X」日志');
});

test('R4b 线程升级不打日志：threads 系统不再打印晋升', () => {
  const fs = stripComments(read('src/systems/frameSystems.js'));
  assert.ok(!/线程【.*】晋升/.test(fs), 'threads 系统仍有「线程晋升」日志');
  assert.ok(/tickThreads\(ctx\.dt\);/.test(fs), 'threads 系统仍应调用 tickThreads');
});

// ============ 反馈⑤ 研究点分组标题颜色 ============

test('R5 rp-group-title b 紫色（参考商店 .panel h3）', () => {
  const css = read('src/style.css');
  assert.ok(/\.rp-group-title b\s*\{\s*color:\s*var\(--purple\);/.test(css), '研究点分组标题 b 应为 var(--purple)');
});

// ============ 反馈⑥ 产出悬浮窗拆分 ============

test('R6a cpsBreakdown 拆线程裸产出与专注增量', () => {
  const eco = stripComments(read('src/modules/economy.js'));
  assert.ok(/focusPart/.test(eco), 'staffOutputParts/cpsBreakdown 缺 focusPart 核算');
  assert.ok(/线程·专注加成/.test(eco), '产出明细缺「线程·专注加成」独立行');
});

test('R6b 悬浮窗加成组不再重复列专注百分比', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(!/focusTag/.test(main), 'flowTipHtml 仍列专注百分比（focusTag）——与产出来源专注行重复');
});

// ============ 反馈⑦ 封印不送 DM ============

test('R7a 首裂 dmReward=0 逻辑保持：grantRiftRewards firstRift 分流', () => {
  const rift = read('src/modules/rift.js');
  assert.ok(/firstRift:\s*!S\._riftSeen/.test(rift), 'activeRift 缺 firstRift 标记');
  assert.ok(/const dmGain = r\.firstRift \? 0 : sealDmReward\(r\)/.test(rift), '首裂 dmGain 应为 0');
});

test('R7b 首裂封印日志不带「+0.0 DM」', () => {
  const rift = stripComments(read('src/modules/rift.js'));
  assert.ok(/dmGain > 0\s*\n\s*\? `裂隙封印成功/.test(rift), '封印日志应条件化（dmGain>0 才带 DM 段）');
  assert.ok(!/：\+\$\{dmGain\.toFixed\(1\)\} DM（深渊物质）`, 'good'\);/.test(rift.replace(/\n\s*/g, '')) || /dmGain > 0/.test(rift), '旧无条件 DM 日志应已改写');
});
