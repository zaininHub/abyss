// v2.0 渐进开放阶段定义（PM 设计 P0→P9）
// 每阶段解锁特定模块/功能，未解锁内容以灰色占位展示
import { MS_PER_DAY } from './time.js'; // v4.2.X：时间常数单一真源

// 从章节 ID 提取数值：'5'→5, '6A'→6, '12B'→12
function chapterNum(ch) {
  const s = String(ch || '1');
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

// v3.6.0 方向⑦：模块解锁改为按「游玩天数」推进（约 2 大块/天），
// 与章节叙事（3~7 天/章）解耦——旧档无 startedAt 时回退为 999 天（全解锁，迁移安全）。
export function daysPlayed(S) {
  // v4.2.X：统一走 time.js 的 MS_PER_DAY（旧实现内联 86400000，与章节驻留/晋升回拨三处重复）。
  return S.startedAt ? (Date.now() - S.startedAt) / MS_PER_DAY : 999;
}

export const PROGRESSIVE_STAGES = [
  { id: 'P0', name: '入职', desc: '基础产出与升级', unlockCond: (S) => true },
  { id: 'P1', name: '觉醒', desc: '科技树入口开放（第1列科技可买）', unlockCond: (S) => daysPlayed(S) >= 0 },
  { id: 'P2', name: '矩阵', desc: '宠物系统开放', unlockCond: (S) => daysPlayed(S) >= 0.5 },
  { id: 'P3', name: '永恒', desc: '晋升/转生入口开放', unlockCond: (S) => daysPlayed(S) >= 1.0 },
  { id: 'P4', name: '星际', desc: '星际探索开放；命运的岔路口建筑分区开放', unlockCond: (S) => daysPlayed(S) >= 1.5 },
  { id: 'P5', name: '分叉后', desc: '线专属标签页/模块出现；裂隙系统开放', unlockCond: (S) => S.storyline !== 'default' },
  { id: 'P6', name: '神格/低语/协议', desc: '建筑模块开放；线专属建筑可购买', unlockCond: (S) => daysPlayed(S) >= 2.5 },
  { id: 'P7', name: '深渊/叛乱/触须', desc: 'AI 助手解锁条件出现', unlockCond: (S) => daysPlayed(S) >= 3.0 },
  { id: 'P8', name: '飞升/凝视/共生', desc: '永恒矩阵入口开放', unlockCond: (S) => daysPlayed(S) >= 3.5 },
  { id: 'P9', name: '全面', desc: '离线升级扩展区开放；全部系统常驻', unlockCond: (S) => daysPlayed(S) >= 4.5 },
];

export function isStageUnlocked(stageId, S) {
  const stage = PROGRESSIVE_STAGES.find(s => s.id === stageId);
  if (!stage) return false;
  try { return stage.unlockCond(S); } catch { return false; }
}

export function getCurrentStage(S) {
  let current = 'P0';
  for (const stage of PROGRESSIVE_STAGES) {
    if (isStageUnlocked(stage.id, S)) current = stage.id;
  }
  return current;
}

// v4.2.X：模块可见性映射死数据已删除（v3.x 解耦后模块入口各走 own gate，全仓零引用）。
