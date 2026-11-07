import { S, save } from '../state.js';
import { PROJECT_TYPES, MAX_PROJECTS, PENDING_EXPIRE, PROJECT_SPAWN_COOLDOWN } from '../data/projects.js';
import { computeCps, fmt, addEp, addRp, projRewardMult, epStorageCap, clickMult, staffCost } from './economy.js';
import { anchorShown } from './disclosure.js'; // v2.5 ③：未解锁资源不出对应奖励任务
import { fxValue } from '../core/effectEngine.js'; // v2.1 建筑驱动：项目平行台
import { BALANCE } from '../data/balance.js';

// v2.5.6 review：任务过期日志（main.js setProjectLogFn 注入）
let logFn = null;
export function setProjectLogFn(fn) { logFn = fn; }

export function maxProjects() {
  // v3.7.0 bugfix：原实现 Math.max(3, fxValue) 而建筑只给 2 → 恒等于基础 3，
  //   玩家花 4.8M EP 买的「项目平行台」完全没有效果。改为基础 3 + 建筑增量（叠加而非取大）。
  return MAX_PROJECTS + Math.round(fxValue('maxProjects'));
}

// v2.0：记录上次生成时间，配合 PROJECT_SPAWN_COOLDOWN 防止秒刷
let lastSpawnAt = 0;

export function spawnProject() {
  lastSpawnAt = Date.now();
  const now = Date.now();
  // v2.7.4 ⑤：手动激活=新手任务——游戏刚开始（首次生成）必出一次，此后不再出现
  // （替代 v2.5 ② 的 80/20 随机加权；click 任务仅保留新手引导价值）
  const t = !S._clickTutorialDone
    ? PROJECT_TYPES.find(x => x.id === 'click')
    : PROJECT_TYPES.find(x => x.id === 'earn_ep');
  if (t.id === 'click') S._clickTutorialDone = true;
  const duration = (1 + Math.random() * 7) * 3600000; // 1-8小时
  const cps = computeCps();
  // v2.4.1：任务目标/奖励基准时长钳制到 ≤10 分钟（原按全时长 1-8h 计算，前期也会出现百万级目标、
  // 且 goal 带长小数；钳制后前期目标合理、短窗可完成，goal 取整展示）。reward:goal 维持 1.5:0.5 = 3:1。
  const windowSec = Math.min(duration / 1000, 600);
  let goal;
  if (t.id === 'earn_ep') goal = Math.max(100, Math.round(cps * windowSec * 0.5));
  else if (t.id === 'click') goal = 20; // v3.0.4 反馈①：新手任务固定 20 次点击（原 20~49 随机，配合下方奖励精确对齐线程 1 价格）
  else if (t.id === 'buy_up') goal = 1 + Math.floor(Math.random() * 2);
  else goal = 1;

  // 奖励
  const hasBuff = now < S.buffUntil && S.buffMult >= 1;
  const hasDebuff = now < S.buffUntil && S.buffMult < 1;
  // v2.5 ③：资源未解锁不出现相关奖励任务——RP 未解锁（EP 未首次溢出）时 RP 奖励档回退 EP 档
  const rpUnlocked = anchorShown('rp', S);
  const roll = Math.random();
  let reward;
  if (roll < 0.55) {
    // v2.4.2：奖励量级再降——10 分钟产出（goal 的 2 倍；原 15 分钟产出，反馈「奖励值过大」）
    let amt = cps * windowSec * 1.0;
    if (!isFinite(amt) || amt < 50) amt = 50;
    amt *= projRewardMult(); // v2.1 建筑驱动：项目督导室 +50%/级（生成时计入，奖励展示与实际一致）
    amt = Math.min(amt, epStorageCap()); // v2.8.7：任务 EP 奖励不超过当前存储上限
    reward = { kind: 'ep', amount: amt };
  } else if (roll < 0.8 && rpUnlocked) {
    // v2.0：项目 RP 奖励 3-8（balance.js 配置）
    reward = { kind: 'rp', amount: Math.ceil((BALANCE.projRpMin + Math.floor(Math.random() * (BALANCE.projRpMax - BALANCE.projRpMin + 1))) * projRewardMult()) };
  } else if (roll < 0.8) {
    // v2.5 ③：RP 未解锁 → 回退 EP 档（等同基础档）
    let amt = cps * windowSec * 1.0;
    if (!isFinite(amt) || amt < 50) amt = 50;
    amt *= projRewardMult();
    amt = Math.min(amt, epStorageCap()); // v2.8.7：任务 EP 奖励不超过当前存储上限
    reward = { kind: 'ep', amount: amt };
  } else if (roll < 0.9 && !hasBuff) reward = { kind: 'buff', buffMult: 2, dur: 300 };
  else if (!hasDebuff) reward = { kind: 'debuff', buffMult: 0.8, dur: 0 };
  else reward = { kind: 'ep', amount: 100 };

  // v3.0.4 反馈①：新手任务总收益精确对齐线程 1 价格——点击收益(goal×clickMult) + 任务奖励 = 首线程价格
  // 新档 clickMult=1、staffCost=180 → 20 次点击得 20 EP + 奖励 160 EP = 180 EP，恰好买得起第一个线程
  if (t.id === 'click') {
    reward = { kind: 'ep', amount: Math.max(50, Math.round(staffCost() - goal * clickMult())) };
  }

  S.projects.push({
    type: t.id, name: t.name, desc: t.desc,
    goal, progress: 0,
    startsAt: now, deadline: now + duration,
    reward, status: 'active', pendingAt: 0,
    runEarnedAt: S.runEarned,
    earnedFullAt: S.earnedFull || 0, // v2.5.1：全量产出起点（含被上限钳制部分）
    buysAt: S.totalBuys || 0,
    threadsAt: S.cultists.length,
    clicksAt: S.totalClicks,
  });

  // debuff 任务立即生效
  if (reward.kind === 'debuff') {
    S.buffMult = reward.buffMult;
    S.buffUntil = now + duration;
  }
}

// v2.0 P1 修复：tickProjects 返回本帧是否有状态变化（changed），
// 由 main.js 主循环消费：changed === true 时置 dirty.projects 触发任务面板重绘。
export function tickProjects() {
  const now = Date.now();
  let changed = false;
  const before = S.projects.length;
  for (const p of S.projects) {
    if (p.status !== 'active') continue;
    // v2.8.10：earn_ep 任务进度改钳后口径（earnedFull 随真实可得 EP 累计）——达存储上限后任务进度冻结，符合「达上限后任务 EP 不增长」；
    // v2.5.1 之前创建的存量任务（无 earnedFullAt）回退 runEarned 口径，不清零不误判
    if (p.type === 'earn_ep') {
      p.progress = p.earnedFullAt !== undefined
        ? (S.earnedFull || 0) - p.earnedFullAt
        : S.runEarned - (p.runEarnedAt || S.runEarned);
    }
    else if (p.type === 'click') p.progress = S.totalClicks - (p.clicksAt || 0);
    else if (p.type === 'buy_up') p.progress = (S.totalBuys || 0) - (p.buysAt || 0);
    else if (p.type === 'buy_thread') p.progress = S.cultists.length - (p.threadsAt || 0);

    if (p.progress >= p.goal) {
      p.status = 'pending'; p.pendingAt = now; changed = true;
      if (p.reward.kind === 'debuff') { S.buffMult = 1; S.buffUntil = 0; }
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
    if (p.status === 'pending' && now - p.pendingAt > PENDING_EXPIRE) return false;
    return true;
  });
  if (S.projects.length !== before) changed = true;
  // v2.8.28：任务版无论任务状态如何（active 进行中 / pending 完成未领取）都占位——
  // 完成多个任务但未领取奖励时不再发放新任务，领取（claimed）或过期（expired）后才腾出位置。
  // 上限保持 maxProjects()（默认 3 条，项目平行台升级可提高并行数）。
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
    // v2.8.7：防御——RP 未解锁（理论上生成已门控）时回退 EP 等值奖励
    if (anchorShown('rp', S)) addRp(r.amount); // v2.8.27 ②：RP 上限；v2.8.28 修复：统一用 anchorShown 口径（resDiscovered.rp 无写入点曾导致 RP 奖励永远走回退）
    else epGained = addEp(Math.min(r.amount * 100, epStorageCap()));
  }
  else if (r.kind === 'buff') { S.buffMult = r.buffMult; S.buffUntil = Date.now() + r.dur * 1000; }
  p.status = 'claimed';
  // v3.8.0 review 修复：领取成功才计入累计完成数。
  // 此前只有 settlePause() 的暂停回程会 ++，在线正常游玩（达成目标 → 手动领取）永远为 0，
  // 导致章节 25「番外 · 排班表」、政策 observe / orchestration、成就 projects50、
  // 秩序线 15A 与「效能编排」解锁的任务路径全部永久不可达。此处作为计数唯一真源补齐。
  S.projectsDone = (S.projectsDone || 0) + 1;
  save(S); // v2.8.28 修复：领取即落盘——消除 5s 节流保存窗口（领取后刷新不再丢失奖励）
  return { ok: true, epGained, amount: r.kind === 'ep' ? r.amount : 0 };
}

// v2.4.1：任务目标规范化——启动时对存量 earn_ep 任务重算（旧档/旧公式产生的
// 百万级目标与长小数按新基准 ≤10 分钟半程产出收敛；进度保持，不越界不误判）。
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
