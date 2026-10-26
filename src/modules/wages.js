// v1.3 模块 C：线程薪资四态状态机（主循环 tick 驱动；v2.8.1 参数调长：欠薪 60s 休眠 / 休眠 30min 流失预警 / 恢复缓冲 60s / 补偿门槛 60s）
// 状态表（v2.5.2/3 参数）：
//   ok      满薪运行（绿）  EP ≥ 30s 薪资，无惩罚
//   debt    欠薪降效（黄）  EP < 30s 薪资，产出 ×debtMult，薪资按余额比例扣（可扣至 0）
//   dormant 强制休眠（橙）  连续欠薪 ≥60s，产出 ×0.3 温和产出，保命成本 = 薪资 ×keepCostMult
//   losing  流失预警（红）  休眠 ≥1800s，每 60s loseChancePerMin 概率流失 1 线程
// 恢复：EP ≥ 3min 薪资；休眠/流失恢复经「欠薪（缓冲 60s）→ 满薪」，欠薪直接恢复（30s/3min 双阈值天然防抖）
// 转机：休眠或流失预警持续 ≥60s 后恢复，触发补偿 buff（产出 ×restBonusMult 持续 restBonusSec，默认 ×1.5/120s）
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { staffSalaryPerSec, wageDebtMult, wageKeepCostMult, wageLoseChance, fmt } from './economy.js';

let logFn = null;
let toastFn = null;
export function setWageLogFn(fn) { logFn = fn; }
export function setWageToastFn(fn) { toastFn = fn; }
function wlog(msg, cls) { if (logFn) logFn(`[薪资] ${msg}`, cls); }

function resetWageState(w) {
  w.state = 'ok'; w.debtSec = 0; w.dormantSec = 0; w.bufferSec = 0; w.loseTimer = 0;
}

export function tickWages(dt) {
  const w = S.wageState;
  if (!w) return;
  const W = BALANCE.thread.wages;

  // 无线程：一切归位
  if (S.cultists.length === 0) {
    if (w.state !== 'ok') { resetWageState(w); }
    return;
  }

  const salary = staffSalaryPerSec();            // 每秒薪资
  const warnLine = salary * W.warnSec;           // 黄线：10s 薪资
  const recoverLine = salary * W.recoverSec;     // 恢复线：60s 薪资

  // ---- 扣薪 ----
  if (w.state === 'ok' || w.state === 'debt') {
    // 满薪/欠薪：按余额比例扣（可扣至 0）
    S.ep = Math.max(0, S.ep - Math.min(S.ep, salary * dt));
  } else {
    // 休眠/流失预警：只扣保命成本
    S.ep = Math.max(0, S.ep - Math.min(S.ep, salary * wageKeepCostMult() * dt));
  }

  // ---- 状态迁移 ----
  if (w.state === 'ok') {
    if (S.ep < warnLine) {
      w.state = 'debt'; w.debtSec = 0; w.bufferSec = 0;
      wlog(`EP 余额不足（低于 ${W.warnSec}s 薪资），线程欠薪降效：产出 ×${wageDebtMult()}`, 'bad');
    }
  }

  if (w.state === 'debt') {
    if (S.ep >= recoverLine) {
      if (w.bufferSec > 0) {
        // 休眠恢复缓冲期：倒计时结束后回到满薪
        w.bufferSec = Math.max(0, w.bufferSec - dt);
        if (w.bufferSec <= 0 && S.ep >= recoverLine) {
          resetWageState(w);
          wlog('恢复缓冲结束，线程回到满薪运行', 'good');
        }
      } else {
        // 常规欠薪（自 ok 进入）：恢复线直达满薪
        resetWageState(w);
        wlog('EP 回到安全线（≥60s 薪资），线程恢复满薪', 'good');
      }
    } else if (S.ep < warnLine && w.bufferSec <= 0) {
      w.debtSec += dt;
      if (w.debtSec >= W.dormantAfterSec) {
        w.state = 'dormant'; w.dormantSec = 0; w.loseTimer = 0;
        wlog(`连续欠薪 ${W.dormantAfterSec}s，线程强制休眠：产出 ×0，仅扣保命成本（×${wageKeepCostMult()}）`, 'bad');
      }
    } else if (S.ep < warnLine && w.bufferSec > 0) {
      // 缓冲期内资金再度告急：取消缓冲，回到普通欠薪
      w.bufferSec = 0;
    }
  }

  // v2.5.6 review：休眠补偿（dormant/losing 恢复共用）——持续 ≥30s 后恢复即触发
  function grantRestBonus(w) {
    if ((w.dormantSec || 0) >= 60) { // v2.8.1：补偿门槛 30s→60s（转换节奏放缓后同步）
      S.restBonusMult = W.restBonusMult || 1.5;
      S.restBonusUntil = Date.now() + (W.restBonusSec || 60) * 1000;
      wlog(`休眠 ${Math.round(w.dormantSec)}s 后恢复：获得休眠补偿，产出 ×${S.restBonusMult} 持续 ${W.restBonusSec || 120}s`, 'good');
      if (toastFn) toastFn('😴 休眠补偿：恢复后产出 ×1.5（120s）');
    }
  }

  if (w.state === 'dormant') {
    if (S.ep >= recoverLine) {
      grantRestBonus(w);
      w.state = 'debt'; w.debtSec = 0; w.bufferSec = W.bufferSec;
      wlog(`EP 回到安全线，休眠缓解：${W.bufferSec}s 缓冲后恢复满薪`, 'good');
    } else {
      w.dormantSec += dt;
      if (w.dormantSec >= W.loseAfterSec) {
        w.state = 'losing'; w.loseTimer = 0;
        wlog(`休眠持续 ${W.loseAfterSec}s，进入流失预警：每 60s ${Math.round(wageLoseChance() * 100)}% 概率流失 1 线程`, 'bad');
        if (toastFn) toastFn('⚠️ 流失预警：线程可能流失！');
      }
    }
  }

  if (w.state === 'losing') {
    if (S.ep >= recoverLine) {
      // v2.5.6 review：流失预警恢复同样触发休眠补偿（转机一致，dormantSec 在预警期持续累计）
      grantRestBonus(w);
      w.state = 'debt'; w.debtSec = 0; w.bufferSec = W.bufferSec;
      wlog(`EP 回到安全线，休眠缓解：${W.bufferSec}s 缓冲后恢复满薪`, 'good');
    } else {
      w.dormantSec += dt;
      w.loseTimer += dt;
      if (w.loseTimer >= 60) {
        w.loseTimer -= 60; // 流失后计数重置，下次判定仍在 60s 后
        if (Math.random() < wageLoseChance() && S.cultists.length > 0) {
          const lost = S.cultists.pop();
          if (S.cultists.length === 0) resetWageState(w);
          wlog(`线程【${lost.name}】在休眠中流失（余额 ${fmt(S.ep)} EP）`, 'bad');
          if (toastFn) toastFn(`线程【${lost.name}】流失了！`);
        }
      }
    }
  }

  // ---- 个体 mood（与四态正交叠加） ----
  if (w.state === 'ok') {
    for (const c of S.cultists) {
      c.moodTimer -= dt;
      if (c.moodTimer <= 0 && c.mood !== '超频' && Math.random() < 0.1) {
        const moods = ['超频', '优化', '高效', '正常'];
        c.mood = moods[Math.floor(Math.random() * moods.length)];
        c.moodTimer = 30 + Math.random() * 60;
      }
    }
  } else {
    // 欠薪及以下：正常/阻塞线程死锁（与 v2.1 语义一致）
    for (const c of S.cultists) {
      if (c.mood === '正常' || c.mood === '阻塞') c.mood = '死锁';
    }
  }
}
