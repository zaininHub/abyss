// v2.0 渐进开放阶段定义（PM 设计 P0→P9）
// 每阶段解锁特定模块/功能，未解锁内容以灰色占位展示

// 从章节 ID 提取数值：'5'→5, '6A'→6, '12B'→12
function chapterNum(ch) {
  const s = String(ch || '1');
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

export const PROGRESSIVE_STAGES = [
  { id: 'P0', name: '入职', desc: '基础产出与升级', unlockCond: (S) => true },
  { id: 'P1', name: '觉醒', desc: '科技树入口开放（第1列科技可买）', unlockCond: (S) => chapterNum(S.chapter) >= 1 },
  { id: 'P2', name: '矩阵', desc: '宠物系统开放', unlockCond: (S) => chapterNum(S.chapter) >= 3 },
  { id: 'P3', name: '永恒', desc: '晋升/转生入口开放', unlockCond: (S) => chapterNum(S.chapter) >= 4 },
  { id: 'P4', name: '星际', desc: '星际探索开放；命运的岔路口建筑分区开放', unlockCond: (S) => chapterNum(S.chapter) >= 5 },
  { id: 'P5', name: '分叉后', desc: '线专属标签页/模块出现；裂隙系统开放', unlockCond: (S) => S.storyline !== 'default' },
  { id: 'P6', name: '神格/低语/协议', desc: '建筑模块开放；线专属建筑可购买', unlockCond: (S) => chapterNum(S.chapter) >= 6 },
  { id: 'P7', name: '深渊/叛乱/触须', desc: 'AI 助手解锁条件出现', unlockCond: (S) => chapterNum(S.chapter) >= 7 },
  { id: 'P8', name: '飞升/凝视/共生', desc: '永恒矩阵入口开放', unlockCond: (S) => chapterNum(S.chapter) >= 8 },
  { id: 'P9', name: '全面', desc: '离线升级扩展区开放；全部系统常驻', unlockCond: (S) => chapterNum(S.chapter) >= 9 },
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

export function getUnlockedStages(S) {
  return PROGRESSIVE_STAGES.filter(s => isStageUnlocked(s.id, S));
}

export function getLockedStages(S) {
  return PROGRESSIVE_STAGES.filter(s => !isStageUnlocked(s.id, S));
}

// 模块可见性映射：stageId -> 模块ID列表
export const MODULE_VISIBILITY = {
  'P0': ['workbench', 'log', 'shop_basic', 'hero_panel'],
  'P1': ['tech_tree'],
  'P2': ['pets'],
  'P3': ['prestige'],
  'P4': ['expedition', 'crossroad_buildings'],
  'P5': ['rift', 'line_modules'],
  'P6': ['buildings', 'line_buildings'],
  'P7': ['ai_assistant'],
  'P8': ['eternal_matrix'],
  'P9': ['offline_extended'],
};
