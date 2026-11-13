import { S, save } from '../state.js';
import { RES_PROJECTS, MAX_PROJECTS, PENDING_EXPIRE, PROJECT_SPAWN_COOLDOWN } from '../data/projects.js';
import {
  computeCps, fmt, addEp, addRp, projRewardMult, epStorageCap, clickMult, staffCost,
  researchMult, rpProdPerSec, totalDrainPerSec, vehicleDmPerMin,
} from './economy.js';
import { templeFaithPerSec } from '../data/religions.js'; // 信仰圣所 FP/s（data 层定义）
import { anchorDone } from './disclosure.js'; // v3.12.13：资源未解锁不刷出对应任务（与顶栏同口径）
import { fxValue } from '../core/effectEngine.js'; // v2.1 建筑驱动：项目平行台
import { BALANCE } from '../data/balance.js';

// v3.12.13：资源驱动任务系统。
// 任务只针对「已解锁资源」生成（spawnProject 按 RES_PROJECTS + anchorDone 门控），
// 每个资源可衍生 获取 / 消耗 / 相关升级 三类（见 data/projects.js）。
// 进度统一走 economy 的 _gainRes / _spentRes / _buyRes 累加器，真实反映玩家在窗口内的增减。
//
// 进度展示约定（用户诉求）：不允许超长原始数字（如 12355333/84899337000），也不只写百分比，
// 统一用紧凑格式化 `${fmt(progress)} / ${fmt(goal)}（${pct}%）`（如 12.4M / 84.9B）。

// 各资源「保底目标」——当该资源无稳定连续速率（rate≈0）时回落到的小目标，保证任务可达。
const MIN_GOAL = { ep: 100, rp: 3, pt: 3, dm: 1, es: 1, fp: 1 };
// 目标 = 速率 × 窗口秒 × 系数（系数 <1，保证窗口内可达）。
const GOAL_FACTOR = 0.4;

// v2.5.6 review：任务过期日志（main.js setProjectLogFn 注入）
let logFn = null;
export function setProjectLogFn(fn) { logFn = fn; }

export function maxProjects() {
  // v3.7.0 bugfix：原实现 Math.max(3, fxValue) 而建筑只给 2 → 恒等于基础 3，
  //   玩家花 4.8M EP 买的「项目平行台」完全没有效果。改为基础 3 + 建筑增量（叠加而非取大）。
  // v3.12.0 反馈⑩：研究点「项目统筹」扩展并行任务数（玩法扩展，不是又一个资源倍率）。
  // researchMult('project') 在 v=1 的线性口径下 = 1 + 等级，减 1 即等级本身。
  return MAX_PROJECTS + Math.round(fxValue('maxProjects')) + Math.round(researchMult('project') - 1);
}

// v2.0：记录上次生成时间，配合 PROJECT_SPAWN_COOLDOWN 防止秒刷
let lastSpawnAt = 0;

// 资源连续速率估计（每秒）：用于推算 gain / spend 类任务目标。
// 无稳定速率的资源（pt/es 等）返回 0 → 目标回落 MIN_GOAL，仍保证可达。
function resRatePerSec(key, metric) {
  if (metric === 'buy') return null;
  if (key === 'ep') return metric === 'gain' ? computeCps() : totalDrainPerSec();
  if (key === 'rp') return rpProdPerSec();              // 获取/消耗共用（消耗以产出为近似代理）
  if (key === 'dm') return vehicleDmPerMin() / 60;        // 探采 DM/s
  if (key === 'fp') return templeFaithPerSec();           // 信仰圣所 FP/s
  return 0; // pt / es：无稳定连续速率
}

// 枚举当前已解锁资源可衍生的所有（资源, 类型）组合
function availableResKinds() {
  const out = [];
  for (const [key, def] of Object.entries(RES_PROJECTS)) {
    if (def.anchor && !anchorDone(def.anchor, S)) continue; // 资源未解锁 → 不刷该类任务
    for (const kind of Object.values(def.kinds)) {
      out.push({ key, metric: kind.metric, name: kind.name, desc: kind.desc, resLabel: def.label });
    }
  }
  return out;
}

// v2.0：tickProjects 返回本帧是否有状态变化（changed），
// 由 main.js 主循环消费：changed === true 时置 dirty.projects 触发任务面板重绘。
function rollReward(now) {
  const cps = computeCps();
  const hasBuff = now < S.buffUntil && S.buffMult >= 1;
  const hasDebuff = now < S.buffUntil && S.buffMult < 1;
  // v3.12.13：奖励整体下调（balance.js 已调小 projEpRatio / projEpCapRatio / projRpMin/Max）
  const roll = Math.random();
  let reward;
  if (roll < 0.55) {
    // 奖励量级 = 窗口基线产出 × 比例；不再一次灌满整仓
    let amt = cps * 600 * (BALANCE.projEpRatio || 0.18);
    if (!isFinite(amt) || amt < 50) amt = 50;
    amt *= projRewardMult();
    amt = Math.min(amt, epStorageCap() * (BALANCE.projEpCapRatio || 0.12));
    reward = { kind: 'ep', amount: amt };
  } else if (roll < 0.8) {
    // RP 奖励（已解锁才给；未解锁资源不可能出现 RP 任务，这里仅作双保险回退 EP）
    if (anchorDone('rp', S)) {
      reward = { kind: 'rp', amount: Math.ceil((BALANCE.projRpMin + Math.floor(Math.random() * (BALANCE.projRpMax - BALANCE.projRpMin + 1))) * projRewardMult()) };
    } else {
      let amt = cps * 600 * (BALANCE.projEpRatio || 0.18);
      if (!isFinite(amt) || amt < 50) amt = 50;
      amt *= projRewardMult();
      amt = Math.min(amt, epStorageCap() * (BALANCE.projEpCapRatio || 0.12));
      reward = { kind: 'ep', amount: amt };
    }
  } else if (roll < 0.9 && !hasBuff) reward = { kind: 'buff', buffMult: 2, dur: 300 };
  else if (!hasDebuff) reward = { kind: 'debuff', buffMult: 0.8, dur: 0 };
  else reward = { kind: 'ep', amount: 100 };
  return reward;
}

export function spawnProject() {
  lastSpawnAt = Date.now();
  const now = Date.now();
  // v2.7.4 ⑤：手动激活=新手任务——游戏刚开始（首次生成）必出一次，此后不再出现
  // （替代 v2.5 ② 的 80/20 随机加权；click 任务仅保留新手引导价值）
  if (!S._clickTutorialDone) {
    S._clickTutorialDone = true;
    const duration = (1 + Math.random() * 7) * 3600000; // 1-8小时
    // v3.0.4 反馈①：新手任务固定 20 次点击（原 20~49 随机，配合下方奖励精确对齐线程 1 价格）
    const goal = 20;
    const reward = { kind: 'ep', amount: Math.max(50, Math.round(staffCost() - goal * clickMult())) };
    S.projects.push({
      type: 'click', name: '深渊初探', desc: '点击深渊之心 20 次',
      goal, progress: 0,
      startsAt: now, deadline: now + duration,
      reward, status: 'active', pendingAt: 0,
      clicksAt: S.totalClicks,
    });
    return;
  }

  // v3.12.13：资源驱动任务——只在已解锁资源里随机挑一个（资源, 类型）组合
  const avail = availableResKinds();
  // ep 恒解锁，avail 至少含 ep 的三种类型，不会为空；兜底仍处理
  const pick = avail.length
    ? avail[Math.floor(Math.random() * avail.length)]
    : { key: 'ep', metric: 'gain', name: RES_PROJECTS.ep.kinds.gain.name, desc: RES_PROJECTS.ep.kinds.gain.desc, resLabel: 'EP' };

  const durationMs = (2 + Math.random() * 28) * 60000; // v3.12.13：限时 2-30 分钟（短窗更易在单局内完成，展示也紧凑）
  const windowSec = Math.min(durationMs / 1000, 600);

  const rate = resRatePerSec(pick.key, pick.metric);
  let goal;
  if (pick.metric === 'buy') {
    goal = 1 + Math.floor(Math.random() * 2); // 相关升级：1-2 次购买
  } else {
    const est = (rate || 0) * windowSec * GOAL_FACTOR;
    goal = Math.max(MIN_GOAL[pick.key] || 10, Math.round(est));
  }

  // 记录进度基准快照：窗口内「增量」= 当前累加器 − 基准
  const acc = pick.metric === 'gain' ? S._gainRes : pick.metric === 'spend' ? S._spentRes : S._buyRes;
  const base = (acc && acc[pick.key]) || 0;

  const reward = rollReward(now);
  S.projects.push({
    type: 'res', resKey: pick.key, metric: pick.metric,
    name: pick.name, desc: pick.desc,
    goal, progress: 0,
    startsAt: now, deadline: now + durationMs,
    reward, status: 'active', pendingAt: 0,
    base,
  });

  // debuff 任务立即生效
  if (reward.kind === 'debuff') {
    S.buffMult = reward.buffMult;
    S.buffUntil = now + durationMs;
  }
}

// v3.10.2 ①：任务终结单一真源——累计完成数 + 终止状态。
// 普通任务由 claimProject() 在玩家领取时调用；负面任务达成目标后由 tickProjects() 自动调用。
// 两条路径共用，避免「领取计数」与「自动结束」各自记一套口径。
function finishProject(p) {
  p.status = 'claimed';
  S.projectsDone = (S.projectsDone || 0) + 1;
}

// v2.0 P1 修复：tickProjects 返回本帧是否有状态变化（changed），由 main.js 主循环消费：
// changed === true 时置 dirty.projects 触发任务面板重绘。
export function tickProjects() {
  const now = Date.now();
  let changed = false;
  let autoDone = false; // 本帧是否有负面任务自动结束（需要落盘）
  const before = S.projects.length;
  for (const p of S.projects) {
    if (p.status !== 'active') continue;
    if (p.type === 'click') {
      p.progress = S.totalClicks - (p.clicksAt || 0);
    } else if (p.type === 'res') {
      // v3.12.13：进度 = 窗口内累加器增量（获取/消耗/购买）
      const acc = p.metric === 'gain' ? S._gainRes : p.metric === 'spend' ? S._spentRes : S._buyRes;
      const cur = (acc && acc[p.resKey]) || 0;
      p.progress = Math.max(0, cur - (p.base || 0));
    } else if (p.type === 'earn_ep') {
      // v3.12.13：旧档/测试兼容——earn_ep 进度按 earnedFull 口径（达上限后冻结）
      p.progress = p.earnedFullAt !== undefined
        ? (S.earnedFull || 0) - p.earnedFullAt
        : S.runEarned - (p.runEarnedAt || S.runEarned);
    }

    if (p.progress >= p.goal) {
      if (p.reward.kind === 'debuff') {
        // v3.10.2 ①：负面任务没有任何奖励可领，达成目标即自动结束并解除 DEBUFF。
        S.buffMult = 1; S.buffUntil = 0;
        finishProject(p);
        autoDone = true;
        if (logFn) logFn(`任务「${p.name}」已结束，产能限制解除`, 'good');
      } else {
        p.status = 'pending'; p.pendingAt = now;
      }
      changed = true;
    }
    if (now > p.deadline) {
      p.status = 'expired'; changed = true;
      if (p.reward.kind === 'debuff') { S.buffMult = 1; S.buffUntil = 0; }
      // v2.5.6 review：任务过期不再静默消失——记一条日志便于追溯（奖励作废口径不变）
      if (logFn) logFn(`任务「${p.name}」已过期（奖励作废）`, 'bad');
    }
  }
  S.projects = S.projects.filter(p => {
    if (p.status === 'claimed' || p.status === 'expired') return false;
    // v3.10.2 ① 旧档兼容：改造前遗留的 pending 负面任务一并自动终结，不再要求玩家点领取。
    if (p.status === 'pending' && p.reward && p.reward.kind === 'debuff') {
      S.buffMult = 1; S.buffUntil = 0;
      finishProject(p);
      autoDone = true;
      return false;
    }
    if (p.status === 'pending' && now - p.pendingAt > PENDING_EXPIRE) return false;
    return true;
  });
  if (autoDone) save(S); // 与手动领取 claimProject() 同口径：终结即落盘
  if (S.projects.length !== before) changed = true;
  // v2.8.28：任务版无论任务状态如何（active 进行中 / pending 完成未领取）都占位——
  // 完成多个任务但未领取奖励时不再发放新任务，领取（claimed）或过期（expired）后才腾出位置。
  const occupiedCount = S.projects.length;
  // v2.4.2：任务发放减速——冷却 10 分钟 + 1% 概率（原 120s + 2%，反馈「任务发放速率减缓」）
  if (occupiedCount < maxProjects() && now - lastSpawnAt > PROJECT_SPAWN_COOLDOWN && Math.random() < 0.01) {
    spawnProject();
    changed = true;
  }
  return changed;
}

export function claimProject(p) {
  if (p.status !== 'pending') return { ok: false };
  const r = p.reward;
  let epGained = 0;
  // v2.1 D1：EP 奖励走统一入口 addEp（受存储上限约束 + 统一记账）
  if (r.kind === 'ep') epGained = addEp(r.amount);
  else if (r.kind === 'rp') {
    // v2.8.27 ②：RP 上限；v2.8.28 修复：统一用 anchorDone 口径（resDiscovered.rp 无写入点曾导致 RP 奖励永远走回退）
    if (anchorDone('rp', S)) addRp(r.amount);
    else epGained = addEp(Math.min(r.amount * 100, epStorageCap()));
  }
  else if (r.kind === 'buff') { S.buffMult = r.buffMult; S.buffUntil = Date.now() + r.dur * 1000; }
  // v3.8.0 review 修复：领取成功才计入累计完成数（此前只有暂停回程会 ++，在线正常游玩
  // 达成目标 → 手动领取永远为 0，章节 25 / 政策 observe / 成就 projects50 / 编排解锁全部不可达）。
  // v3.10.2 ①：收敛到 finishProject()，与负面任务自动结束共用同一计数入口。
  finishProject(p);
  save(S); // v2.8.28 修复：领取即落盘——消除 5s 节流保存窗口（领取后刷新不再丢失奖励）
  return { ok: true, epGained, amount: r.kind === 'ep' ? r.amount : 0 };
}

// v2.4.1：任务目标规范化——启动时对存量 earn_ep 任务重算（旧档/旧公式产生的
// 百万级目标与长小数按新基准 ≤10 分钟半程产出收敛；进度保持，不越界不误判）。
// v3.12.13：res / click 任务自带合理目标，仅旧 earn_ep 遗留任务需要规范化。
export function normalizeProjectGoals() {
  const cps = computeCps();
  const capGoal = Math.max(100, Math.round(cps * 600 * 0.5));
  for (const p of S.projects) {
    if (p.type !== 'earn_ep' || p.status === 'claimed' || p.status === 'expired') continue;
    if (!Number.isInteger(p.goal) || p.goal > capGoal) {
      p.goal = capGoal;
      if (p.progress > p.goal) p.progress = p.goal;
    }
  }
}

export function rewardText(r) {
  if (r.kind === 'ep') return `+${fmt(r.amount)} EP`;
  if (r.kind === 'rp') return `+${r.amount} RP`;
  if (r.kind === 'buff') return `${r.dur / 60}分钟全局+${Math.round((r.buffMult - 1) * 100)}%`;
  return `任务期间产出-${Math.round((1 - r.buffMult) * 100)}%`;
}
