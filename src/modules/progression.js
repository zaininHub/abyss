// v2.0 特殊任务系统 + 彩蛋系统
// 设计文档 §6 特殊任务 + §7 彩蛋
import { S, save } from '../state.js';

// ========== 特殊任务定义（6个：3通用 + 3线专属） ==========
export const SPECIAL_TASKS = [
  // 通用特殊任务
  {
    id: 'sp1_museum',
    name: '博物馆的访客',
    desc: '判定：同时拥有 ≥2 种建筑 且 建筑总级数 ≥3（每级建筑即一件已参观展品；任务面板显示进度）',
    condition: (S) => Object.keys(S.buildings || {}).length >= 2 && Object.values(S.buildings || {}).reduce((a, b) => a + b, 0) >= 3,
    reward: { type: 'museum_mode', msg: '解锁"博物馆模式"（所有建筑特效同时播放，持续 30 秒）' },
    triggered: false,
    line: 'any',
  },
  {
    id: 'sp2_last_thread',
    name: '最后的线程',
    desc: '要求给第 100 个线程命名',
    condition: (S) => S.cultists.length >= 100,
    reward: { type: 'legendary_thread', msg: '该线程永久金色高亮 + 专属 mood"传奇"（产出 ×1.5）' },
    triggered: false,
    line: 'any',
  },
  {
    id: 'sp3_farewell',
    name: '离职礼物',
    desc: '无时间限制；要求购买"离职礼盒"（1 EP）送给流失的线程',
    condition: (S) => (S.wageState?.state === 'dormant') || S.staffUnhappy >= 3,
    reward: { type: 'memorial_wall', msg: '解锁"纪念墙"（记录所有流失线程的名字和存活时间）' },
    triggered: false,
    line: 'any',
  },
  // 线专属
  {
    id: 'sp_order_protocol',
    name: '协议测试',
    desc: '限时内完成指定次数的"重写"操作',
    condition: (S) => S.storyline === 'line_order' && Object.keys(S.orderRewrites || {}).length >= 3,
    reward: { rp: 5, msg: 'RP + 协议进度' },
    triggered: false,
    line: 'line_order',
  },
  {
    id: 'sp_abyss_gaze',
    name: '深渊凝视',
    desc: '限时内让腐化达到指定数值并保持 60 秒',
    condition: (S) => S.storyline === 'line_abyss' && (S.corruption || 0) >= 30,
    reward: { dm: 2, msg: 'DM + 腐化共生体经验' },
    triggered: false,
    line: 'line_abyss',
  },
  {
    id: 'sp_faith_mission',
    name: '传教',
    desc: '限时内招募指定数量的线程',
    condition: (S) => S.storyline === 'line_faith' && S.cultists.length >= 50,
    reward: { fa: 5, msg: 'FA + 圣殿建造折扣' },
    triggered: false,
    line: 'line_faith',
  },
];

// ========== 彩蛋定义（8个） ==========
export const EASTER_EGGS = [
  {
    id: 'the_answer',
    name: '42',
    desc: '当 EP 恰好等于 42 时点击工作台',
    trigger: 'click',
    checkFn: (S) => S.ep === 42,
    reward: { msg: '生命、宇宙以及一切的答案是 42' },
  },
  {
    id: 'four_am',
    name: '凌晨四点',
    desc: '系统时间在 04:00-04:59 之间打开游戏',
    trigger: 'time_check',
    checkFn: () => {
      const h = new Date().getHours();
      return h === 4;
    },
    reward: { msg: '凌晨四点的矩阵' },
  },
  {
    id: 'recursive_warning',
    name: '递归警告',
    desc: '连续晋升 5 次不选天赋（每次都关闭选择窗口）',
    trigger: 'prestige_skip',
    checkFn: (S) => (S._prestigeSkips || 0) >= 5,
    reward: { msg: '警告：检测到递归循环。强制赋予天赋"递归"（本局全局 ×0.9）' },
  },
  {
    id: 'are_you_there',
    name: '你也在玩吗',
    desc: '连续 30 分钟不操作（游戏挂在前台但无点击/无购买）',
    trigger: 'idle',
    checkFn: (S) => (S._idleSec || 0) >= 1800,
    reward: { msg: '你在吗？我等你好久了。别走。' },
  },
  {
    id: 'hidden_ending',
    name: '隐藏结局',
    desc: '同时拥有 0 线程、0 升级、0 科技、faith >= 1000',
    trigger: 'state_check',
    checkFn: (S) => S.cultists.length === 0 && Object.keys(S.upgrades || {}).length === 0 && Object.keys(S.tech || {}).length === 0 && (S.faith || 0) >= 1000,
    reward: { msg: '空即是满。解锁"虚无"背景主题。' },
  },
  // v2.3.2 反馈②：「托马斯」彩蛋依赖载具命名输入框，随命名功能移除一并废除（触发器 name_vehicle 全模块零调用）
  {
    id: 'turing',
    name: '艾伦·图灵',
    desc: '在科技树中按顺序购买 warmup → lean → speed2 → quantum2',
    trigger: 'tech_sequence',
    checkFn: (S) => {
      const t = S.tech || {};
      return t.warmup && t.lean && t.speed2 && t.quantum2;
    },
    reward: { msg: '解锁隐藏科技"图灵完备"（无效果，纯成就）' },
  },
  {
    id: 'cat_food',
    name: '猫粮',
    desc: '拥有影猫宠物时，在宠物页面连续点击猫 10 次',
    trigger: 'pet_click',
    checkFn: (S) => (S._catClicks || 0) >= 10 && (S.pets || {}).cat,
    reward: { pt: 1, msg: '喵！获得 1 PT' },
  },
];

// 上次特殊任务 roll 时间
let _lastSpecialRoll = 0;
let _abandonCooldownUntil = 0;

// ========== 特殊任务检查 ==========
export function checkSpecialTasks(S, log, toast) {
  if (!S._specialTasksDone) S._specialTasksDone = {};

  // 检查已完成条件
  for (const task of SPECIAL_TASKS) {
    if (S._specialTasksDone[task.id]) continue;
    if (task.line !== 'any' && task.line !== S.storyline) continue;
    try {
      if (task.condition(S)) {
        S._specialTasksDone[task.id] = true;
        if (task.reward.rp) S.rp = (S.rp || 0) + task.reward.rp;
        if (task.reward.ep) S.ep = Math.min(S.ep + task.reward.ep, 1e15);
        if (task.reward.dm) S.dm = (S.dm || 0) + task.reward.dm;
        if (task.reward.fa) S.faith = (S.faith || 0) + task.reward.fa;
        if (log) log(`特殊任务：${task.name} - ${task.desc}`, 'good');
        if (toast) toast(`✓ ${task.name}`);
      }
    } catch { /* silently skip */ }
  }
}

// ========== 彩蛋检查 ==========
export function checkEasterEggs(trigger, S, log, toast, markDirty) {
  if (!S._easterEggsFound) S._easterEggsFound = {};
  for (const egg of EASTER_EGGS) {
    if (S._easterEggsFound[egg.id]) continue;
    if (egg.trigger !== trigger) continue;
    let triggered = false;
    try {
      if (egg.checkFn) triggered = !!egg.checkFn(S);
    } catch { triggered = false; }

    if (triggered) {
      S._easterEggsFound[egg.id] = true;
      if (egg.reward) {
        if (egg.reward.rp) S.rp = (S.rp || 0) + egg.reward.rp;
        if (egg.reward.ep) S.ep = Math.min(S.ep + egg.reward.ep, 1e15);
        if (egg.reward.pt) S.pt = (S.pt || 0) + egg.reward.pt;
      }
      if (log && egg.reward && egg.reward.msg) log(`🥚 ${egg.reward.msg}`, 'good');
      if (toast && egg.reward && egg.reward.msg) toast(`🥚 ${egg.reward.msg}`);
      if (markDirty) markDirty();
    }
  }
}

// 获取特殊任务完成数
export function specialTasksCompleted(S) {
  return Object.keys(S._specialTasksDone || {}).length;
}

// 获取彩蛋发现数
export function easterEggsFound(S) {
  return Object.keys(S._easterEggsFound || {}).length;
}
