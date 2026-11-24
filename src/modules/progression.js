// v2.0 特殊任务系统 + 彩蛋系统
// 设计文档 §6 特殊任务 + §7 彩蛋
import { S, save } from '../state.js';
import { addRp, addDm, addPt, gainRes } from './economy.js'; // v2.8.27 ②：资源上限
import { UPGRADES } from '../data/upgrades.js'; // v4.3.23 反馈③：博物馆任务「工位」判定源

// v4.3.23 反馈③：工位分类升级 id 集（与 shop.js「工位」组谓词同口径：cps>0 且非资源建筑/集市）
export const MUSEUM_STATION_IDS = UPGRADES.filter(u => u.cps > 0 && !u.produces && !u.cat).map(u => u.id);

// ========== 特殊任务定义（6个：3通用 + 3线专属） ==========
export const SPECIAL_TASKS = [
  // 通用特殊任务
  {
    id: 'sp1_museum',
    name: '博物馆的访客',
    // v4.3.23 反馈③：任务重做——要求改为「同时拥有 3 种工位，且工位等级之和 ≥50」
    //  （工位 = 主商店「工位」分类：cps>0 且非资源建筑/集市组，共 42 条，等级读 S.upgrades）；
    //   完成奖励 = 商店工位分类标题挂「馆藏认证」徽章（shop.js 消费 S._specialTasksDone）。
    //   desc 保持「无时间限制/限时…；{要求}」两段式约定（完成日志按「；」拆行）。
    desc: '无时间限制；同时拥有 3 种工位，且工位等级之和达到 50 级',
    condition: (S) => {
      let kinds = 0, sum = 0;
      for (const u of MUSEUM_STATION_IDS) {
        const lv = (S.upgrades || {})[u] || 0;
        if (lv > 0) kinds++;
        sum += lv;
      }
      return kinds >= 3 && sum >= 50;
    },
    reward: { type: 'museum_mode', msg: '你的工作台获得博物馆「馆藏认证」——商店工位分类将永久佩戴徽章' },
    triggered: false,
    line: 'any',
    // v4.3.23 反馈③：触发后未完成前，每 60s 打一条进度提醒日志（「每个消失都打日志」按
    //   可读口径实现为周期提醒——每帧打日志会刷屏；进度 = 当前等级和/目标）。
    hintEverySec: 60,
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
    // v4.3.11 反馈①：条件收紧到 losing（流失预警）——dormant 只是「可能流失」（休眠 ≥1800s
    //   才进 losing），旧口径玩家「没有流失就触发了离职任务」；staffUnhappy 是废弃字段恒 0。
    desc: '无时间限制；要求购买"离职礼盒"（1 EP）送给流失的线程',
    condition: (S) => S.wageState?.state === 'losing' && S._farewellBought,
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
    id: 'idle_start',
    name: '静默开局',
    desc: '开局后 1 分钟不做任何操作',
    trigger: 'idle',
    checkFn: (S) => (S._idleSec || 0) >= 60 && (S.ep || 0) < 100 && !S.cultists.length,
    reward: { msg: '你与深渊对视了一分钟，谁也没有先开口。' },
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
// 上次进度提醒时间（v4.3.23 反馈③：博物馆任务触发后未完成的周期日志）
let _lastMuseumHint = 0;
export function checkSpecialTasks(S, log, toast) {
  if (!S._specialTasksDone) S._specialTasksDone = {};

  // 检查已完成条件
  for (const task of SPECIAL_TASKS) {
    if (S._specialTasksDone[task.id]) continue;
    if (task.line !== 'any' && task.line !== S.storyline) continue;
    try {
      if (task.condition(S)) {
        S._specialTasksDone[task.id] = true;
        if (task.reward.rp) addRp(task.reward.rp);
        if (task.reward.ep) S.ep = Math.min(S.ep + task.reward.ep, 1e15);
        if (task.reward.dm) addDm(task.reward.dm);
        if (task.reward.fa) { S.faith = (S.faith || 0) + task.reward.fa; gainRes('fp', task.reward.fa); }
        // v4.3.13 反馈①：sp3 残留中间态静默补结算——旧档可能存在 _farewellBought=true 但
        //   sp3 未结算（上局购买时关页，800ms setTimeout 未跑）的落盘态；此时若进入 losing，
        //   本函数会凭空打出「完成」日志（玩家视角「将要流失时打印了特殊任务」）。
        //   口径：只有「本局内玩家真实点击购买」触发的结算才打日志弹 toast；
        //   帧系统每轮扫描发现的残留补结算一律静默（按钮路径在 wishDock.onFarewellBuy 同帧结算，
        //   正常游戏流程不会走到这里）。其余特殊任务保持原口径（完成即日志）。
        const silentBackfill = task.id === 'sp3_farewell';
        if (!silentBackfill) {
          // v4.3.11 反馈②：完成日志两段式——「特殊任务：{名} - {时限}」换行「{要求}」。
          //   task.desc 约定「无时间限制/限时…；{要求}」格式，按第一个「；」拆两行。
          const semi = task.desc.indexOf('；');
          const timeLimit = semi >= 0 ? task.desc.slice(0, semi) : task.desc;
          const requirement = semi >= 0 ? task.desc.slice(semi + 1) : '';
          if (log) log(`特殊任务：${task.name} - ${timeLimit}${requirement ? `\n${requirement}` : ''}`, 'good');
          if (toast) toast(`✓ ${task.name}`);
          // v4.3.23 反馈③：sp1_museum 完成后置脏商店（工位标题徽章即时出现）
          if (task.id === 'sp1_museum') {
            import('../core/runtime.js').then(({ dirty }) => { dirty.shop = true; }).catch(() => {});
          }
        }
        // v4.3.11 反馈③：sp3 首次完成点亮成就「临别赠礼」（首购离职礼盒）
        //   _specialTasksDone 在晋升时保留（不在 RUN_RESET_KEYS），成就判定双路径兜底：点亮过就不再熄灭
        if (task.id === 'sp3_farewell') S.achievements = Object.assign({}, S.achievements, { farewell_gift: true });
        // v4.3.23 反馈③：博物馆任务完成后打提示日志（徽章已挂到商店工位分类标题）
        if (task.id === 'sp1_museum' && !silentBackfill && log) {
          log('博物馆的访客 · 馆藏认证已颁发——商店「工位」分类标题现在佩戴着徽章', 'good');
        }
      } else if (task.id === 'sp1_museum' && task.hintEverySec) {
        // v4.3.23 反馈③：触发（已有工位）且未完成前，每 hintEverySec 秒打一条进度提醒
        let kinds = 0, sum = 0;
        for (const u of MUSEUM_STATION_IDS) {
          const lv = (S.upgrades || {})[u] || 0;
          if (lv > 0) kinds++;
          sum += lv;
        }
        if (kinds > 0) { // 「触发」= 至少拥有 1 种工位（访客已上门）
          const now = Date.now();
          if (now - _lastMuseumHint >= (task.hintEverySec || 60) * 1000) {
            _lastMuseumHint = now;
            if (log) log(`博物馆的访客仍在参观（工位 ${kinds}/3 种，等级和 ${sum}/50）——完成后商店工位分类将获得「馆藏认证」徽章`, '');
          }
        }
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
        if (egg.reward.rp) addRp(egg.reward.rp);
        if (egg.reward.ep) S.ep = Math.min(S.ep + egg.reward.ep, 1e15);
        if (egg.reward.pt) addPt(egg.reward.pt);
      }
      if (log && egg.reward && egg.reward.msg) log(`🥚 ${egg.reward.msg}`, 'good');
      if (toast && egg.reward && egg.reward.msg) toast(`🥚 ${egg.reward.msg}`);
      if (markDirty) markDirty();
    }
  }
}

// v4.2.X：specialTasksCompleted / easterEggsFound 死导出已删除（成就侧直读 S 字段）。
