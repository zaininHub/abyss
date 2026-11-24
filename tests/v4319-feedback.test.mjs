// v4.3.19 第九轮反馈批次 8 项（源码级锁）
// ① 班组擅长岗位图标问号无悬浮解释 → DOM 即时气泡（三段式文案）
// ② 满员岗位从下拉源头移除（超线程/自身在岗保留）
// ③ 专注升级消耗大：只解释不降价（aria-label 指数+分段加成说明）
// ④ 退潮科技成本 -20% 未生效（文案统一「科技树价格」+ wiki/潮汐同步）
// ⑤ 未解锁大模块背景深浅不一 → 锁定样式双渲染路径统一
// ⑥ 快捷开关不打日志 → 三处原位置开关补齐
// ⑦ 深空探测 ch1 即可见 → minChapter:3 章节门禁（章节>前置，入口侧钳制）
// ⑧ 新模块解锁弹窗 → 日志「深渊里透出一道光...」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '');

// ============ 反馈① 班组擅长岗位图标悬浮气泡 ============

test('R1 crew：affinity 图标挂 data-aff-tip 锚点（三段式文案）', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // 无职业问号段：机制说明（普通惩罚口径）
  assert.ok(/天生怠惰/.test(crew), '怠惰段文案缺失');
  assert.ok(/该线程暂无职业/.test(crew), '无职业段文案缺失');
  // 职业段：擅长岗位 + 机制（绑定该岗位无惩罚 / 其他岗位产出×0.6 消耗×1.5）
  assert.ok(/擅长「/.test(crew), '职业段应写擅长岗位名');
  assert.ok(/产出 ×0\.6、消耗 ×1\.5/.test(crew), '惩罚机制文案缺失');
  // 锚点：data-aff-tip + aria-label（无职业「·」图标也要有锚点）
  assert.ok(/data-aff-tip="\$\{escAttr\(affTip\)\}"/.test(crew), 'affinity 图标应挂 data-aff-tip 锚点');
  assert.ok(crew.split('data-aff-tip=').length >= 3, '职业/无职业两分支都应有锚点');
});

test('R1 main：bindAffTipPop 定义 + init 调用（委托 #crew-panel，pop 节点 aff-tip-pop）', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(/function bindAffTipPop\(\)/.test(main), 'bindAffTipPop 定义缺失');
  assert.ok(/getElementById\('aff-tip-pop'\)/.test(main), 'pop 节点应固定 id aff-tip-pop');
  assert.ok(/wage-tip-pop aff-tip-pop/.test(main), '应复用 wage-tip-pop 基类 + aff-tip-pop 尺寸类');
  assert.ok(/closest\('\[data-aff-tip\]'\)/.test(main), '锚点查找应走 data-aff-tip');
  assert.ok(/dataset\.affTip/.test(main), '文案应读 dataset.affTip');
  assert.ok(/bindAffTipPop\(\)/.test(main), 'init 应调用 bindAffTipPop');
  const css = read('src/style.css');
  assert.ok(/\.aff-tip-pop\s*\{/.test(css), 'aff-tip-pop 尺寸类 CSS 缺失');
  assert.ok(/max-width:\s*min\(320px,\s*86vw\)/.test(css), '气泡应有宽度钳制（长文案防溢出）');
});

// ============ 反馈② 满员岗位下拉源头移除 ============

test('R2 crew：下拉 opts 源头过滤满员岗位（超线程/自身在岗保留）+ 无「（已满）」标注残留', () => {
  const crew = stripComments(read('src/modules/crew.js'));
  // 源头过滤：HYPER 恒保留 || 自身绑定保留 || 有余量
  const m = crew.match(/const opts = visibleTypes\.filter\(t =>[\s\S]*?\);/);
  assert.ok(m, 'opts 过滤缺失');
  assert.ok(/HYPER_CONVERTER_ID/.test(m[0]), '超线程应恒保留');
  assert.ok(/t === c\.boundTo/.test(m[0]), '自身在岗岗位应保留（原地重选不占新坑）');
  assert.ok(/converterLoad\(t\) < converterCapacity\(t\)/.test(m[0]), '满员岗位应被过滤');
  // 负向断言（精确锁旧式）：下拉选项「（已满）」标注应删除；「已满员」分配失败 toast 是合法文案不受影响
  assert.ok(!/（已满）/.test(crew), '旧「（已满）」下拉标注应删除');
});

// ============ 反馈③ 专注消耗只解释不降价 ============

test('R3 专注升级 aria-label 写明指数涨价与分段加成（数值零改动）', () => {
  const main = stripComments(read('src/main.js'));
  const m = main.match(/强化专注至 Lv\.\$\{S\.focusLevel \+ 1\}，需要 \$\{fmt\(focusPrice\)\} EP（[^）]*）/);
  assert.ok(m, 'focus-buy aria-label 说明缺失');
  assert.ok(/×1\.6 逐级递增/.test(m[0]), '应写明价格指数');
  assert.ok(/Lv5 前 \+8%\/级、Lv6~10 \+12%\/级、之后 \+20%\/级/.test(m[0]), '应写明分段加成');
  // 红线：价格公式不动（30 × 1.6^n）
  assert.ok(/1\.6/.test(read('src/modules/economy.js')) || /1\.6/.test(main), '价格 1.6^n 真源应保留');
});

// ============ 反馈④ 退潮科技折扣文案统一 ============

test('R4 潮汐悬浮「科技成本」→「科技树价格」+ wiki 潮汐表头同步', () => {
  const main = stripComments(read('src/main.js'));
  assert.ok(!/row\('科技成本'/.test(main), '旧「科技成本」row 应删除');
  assert.ok(/row\('科技树价格', pct\(techMult\)/.test(main), '应改为「科技树价格」');
  assert.ok(/折扣只作用于科技树研究价/.test(main), '脚注应说明折扣范围（升级/建筑不打折）');
  const wiki = stripComments(read('src/data/wiki.js'));
  assert.ok(!/科技成本/.test(wiki), 'wiki 潮汐表头旧词应删除');
  assert.ok(/科技树价格/.test(wiki), 'wiki 潮汐表头应同步');
  // balance 注释同步（退潮 techCostMult 语义）
  const bal = read('src/data/balance.js');
  assert.ok(/科技树价格 ×0\.8/.test(bal), 'balance 退潮行注释应统一口径');
});

// ============ 反馈⑤ 锁定样式双路径统一 ============

test('R5 style.css：.tab-locked 与 .btn.tab-locked:disabled 合并统一规则 + 旧 opacity .55 删除', () => {
  const css = read('src/style.css');
  // 合并规则存在（同时压平 class-only 与 disabled 两条渲染路径）
  assert.ok(/\.tab-locked,\s*\n\.btn\.tab-locked:disabled\s*\{/.test(css), '双路径合并规则缺失');
  const blk = css.match(/\.tab-locked,\s*\n\.btn\.tab-locked:disabled\s*\{[^}]*\}/);
  assert.ok(/opacity:\s*0\.4/.test(blk[0]), '应压低透明度');
  assert.ok(/background:\s*#21262d/.test(blk[0]), '应统一底色（覆盖 .btn:disabled 深浅不一）');
  assert.ok(/filter:\s*grayscale/.test(blk[0]), '应统一灰度滤镜');
  // 旧冲突规则删除（曾与新规则叠加产生深浅不一）
  assert.ok(!/\.tab-locked\s*\{[^}]*opacity:\s*0\.55/.test(css), '旧 opacity 0.55 规则应删除');
});

// ============ 反馈⑥ 原位置开关补日志 ============

test('R6 三处原位置开关打日志（蒸馏/探采/孵化），与快捷开关同口径', () => {
  const shop = stripComments(read('src/modules/shop.js'));
  assert.ok(/log\(`自动蒸馏\$\{onAfter/.test(shop), '蒸馏开关日志缺失');
  assert.ok(/log\(`载具探采\$\{onAfter/.test(shop), '探采开关日志缺失');
  const pets = stripComments(read('src/modules/pets.js'));
  assert.ok(/log\(`异兽孵化\$\{S\.ptDistillOn/.test(pets), '孵化开关日志缺失');
  assert.ok(/import \{ log \} from '\.\.\/core\/runtime\.js';/.test(read('src/modules/pets.js')), 'pets 应引入 log');
});

// ============ 反馈⑦ 深空探测章节门禁 ============

test('R7 deep_space minChapter:3 + techChapterOk 章节判定（入口侧钳制）', () => {
  const techs = stripComments(read('src/data/techs.js'));
  // 注意：定义含内嵌 cost:{...} 花括号，[^}] 会截断——用 [^;]*（分号是语句边界）
  const m = techs.match(/id:'deep_space'[^;]*minChapter:3/);
  assert.ok(m, 'deep_space 应锁 minChapter:3');
  const tech = stripComments(read('src/modules/tech.js'));
  assert.ok(/function techChapterOk\(t, s\)/.test(tech), 'techChapterOk 定义缺失');
  assert.ok(/chapterAtLeast\(t\.minChapter/.test(tech), '章节判定应走 chapterAtLeast 真源');
  // 章节>前置：techReqOk 先章节后前置；buyTech 入口天然钳制（防校准玩家直调绕过）
  assert.ok(/export function techReqOk\(t\) \{ return techChapterOk\(t\) && t\.req\.every/.test(tech), 'techReqOk 应先过章节门');
  assert.ok(/if \(!techReqOk\(t\)\) return;/.test(tech), 'buyTech 入口应钳制');
  // 已研究恒可见（老档卡片不凭空消失）
  assert.ok(/if \(hasTech\(t\.id\)\) return true;/.test(tech), '已研究科技应恒可见');
  // hints 提示章节
  assert.ok(/hints\.push\(`章节：第 \$\{t\.minChapter\} 章解锁`\)/.test(tech), '未达章应有 hints 提示');
});

// ============ 反馈⑦⑧ 章节推进联动 ============

test('R8 章节推进置 dirty.tech（跨章即时显现）+ 解锁日志「深渊里透出一道光...」（无弹窗）', () => {
  const fs = stripComments(read('src/systems/frameSystems.js'));
  assert.ok(/ctx\.dirty\.tech = true;/.test(fs), '章节推进应置 dirty.tech');
  assert.ok(/log\('深渊里透出一道光\.\.\.', 'good'\)/.test(fs), '解锁日志文案缺失');
  // 负向：旧弹窗与 🔓 toast 应删除
  assert.ok(!/🔓/.test(fs), '旧 🔓 toast 应删除');
  assert.ok(!/新模块解锁/.test(fs), '旧「新模块解锁」日志应删除');
});
