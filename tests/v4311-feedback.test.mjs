// v4.3.11 反馈专项（单测 + 浏览器语义源码断言）：第四轮反馈批次③
//   ① 离职礼盒门收紧：仅 losing（流失预警）触发——dormant 只是「可能流失」，不再提前摆任务
//   ② 完成日志两段式：「特殊任务：{名} - {时限}」换行「{要求}」（按第一个「；」拆）
//   ③ 首购成就「临别赠礼」+ 5 分钟召回窗（60s 30% 概率召回已流失线程）
//   ④ 相位共鸣未解锁时整块不展示（删 v4.3.5 反馈④ 预告行——用户实测「无用文案」）
// （①②③ 行为断言在 v292-farewell.test.mjs，本文件锁 ④ 与整体接线）
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_SRC = readFileSync(join(ROOT, 'src', 'main.js'), 'utf8');
const DOCK_SRC = readFileSync(join(ROOT, 'src', 'modules', 'wishDock.js'), 'utf8');
const WAGES_SRC = readFileSync(join(ROOT, 'src', 'modules', 'wages.js'), 'utf8');

test('R1 共鸣未解锁整块不展示：预告行已删，else 分支不再渲染「推进主线至」文案', () => {
  assert.ok(!MAIN_SRC.includes('推进主线至「镜像」之后'), '预告文案已删除（用户反馈：无用文案）');
  assert.ok(!MAIN_SRC.includes('尚未解锁</span></div>\\n      <div style="font-size:10.5px'), '旧预告块结构已移除');
  // 共鸣解锁分支保留（res.unlocked 时照常渲染开关 + 焦点 + 层数）
  assert.ok(MAIN_SRC.includes("data-res-toggle"), '共鸣解锁分支保留');
  // v4.3.5 反馈④ 注释同步反转
  assert.ok(MAIN_SRC.includes('v4.3.11 反馈④'), '换源注释在位');
});

test('R2 离职礼盒按钮 title 两段式文案', () => {
  assert.ok(DOCK_SRC.includes('特殊任务：离职礼物 - 无时间限制\\n要求购买"离职礼盒"（1 EP）送给流失的线程'),
    '按钮 title 两段式（首行任务+时限，次行要求）');
  assert.ok(!DOCK_SRC.includes('触发特殊任务「离职礼物」，解锁纪念墙'), '旧 title 文案已换');
});

test('R3 礼盒门收紧：仅 losing 显示（dormant/staffUnhappy 路径全删）', () => {
  const avail = DOCK_SRC.slice(DOCK_SRC.indexOf('function farewellAvailable'), DOCK_SRC.indexOf('export function ensureFarewellGift'));
  assert.ok(avail.includes("w.state === 'losing'"), '仅流失预警放行');
  assert.ok(!avail.includes("'dormant'"), 'dormant 不再放行');
  assert.ok(!avail.includes('staffUnhappy'), '废弃字段 staffUnhappy 移除');
  // progression 侧 condition 同步（剥注释后匹配，注释里的 staffUnhappy 说明不算残留）
  const progSrc = readFileSync(join(ROOT, 'src', 'modules', 'progression.js'), 'utf8')
    .replace(/\/\/[^\n]*/g, '');
  const sp3 = progSrc.slice(progSrc.indexOf("id: 'sp3_farewell'"), progSrc.indexOf('sp_order_protocol'));
  assert.ok(sp3.includes("S.wageState?.state === 'losing'"), '任务 condition 同步 losing');
  assert.ok(!sp3.includes('staffUnhappy'), 'condition 移除 staffUnhappy');
});

test('R4 召回窗接线：5 分钟窗口 + 60s 判定 + lostLog 名单 + 无幽灵脏键', () => {
  assert.ok(DOCK_SRC.includes('FAREWELL_RECALL_MS = 5 * 60 * 1000'), '召回窗 5 分钟');
  assert.ok(WAGES_SRC.includes('lostLog'), '流失时记录名单');
  assert.ok(MAIN_SRC.includes('tickFarewellRecall()'), 'main.js 周期调用');
  // dirty 键必须走 orchestration（班组渲染在编排卡内，无 crew 面板键）
  assert.ok(!/dirty\.crew\s*=\s*true/.test(DOCK_SRC), '无幽灵脏键 dirty.crew');
  assert.ok(DOCK_SRC.includes('dirty.orchestration = true'), '置脏 orchestration');
});
