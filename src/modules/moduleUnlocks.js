// v3.12.0 反馈⑬：集市在「第一次晋升后」作为独立大模块，用职级点购买开启。
// v4.2.X：轮回已移除（回响/遗物传承并入晋升），MODULE_UNLOCKS 只剩集市一项。
// v4.3.36 反馈①：集市不再挂在「首次晋升」上——章节门禁改为第 7 章（CHAPTER_GATES.bazaar）。
//   旧口径只看 prestige≥1，玩家在第 2 章就看到集市卡片，而那时只攒到 1~2 PP、买断价 5 PP，
//   卡片永远灰（用户反馈：第二章 PP 不足无法解锁集市，且集市不像第二章的内容）。
// 这是「模块解锁」的唯一真源：价格表、可见性谓词、购买状态、购买动作四处不再各写一份。
// 跨局保留（S.bazaar.unlocked 在 CROSS_RUN_KEYS），买断后晋升不重复收费；已买断的老玩家不回退。
import { S, save } from '../state.js';
import { gateOpen, CHAPTER_GATES } from '../core/chapterGates.js';

export const MODULE_UNLOCKS = Object.freeze([
  { key: 'bazaar', name: '深渊集市', cost: 5, desc: '富余资源兑换稀缺资源，汇率随时间波动，成交笔数抬高集市等级。' },
]);

export function moduleUnlockDef(key) {
  return MODULE_UNLOCKS.find(m => m.key === key) || null;
}

/** 已买断：集市沿用历史字段 S.bazaar.unlocked，其余读跨局字段 S.moduleUnlocks。 */
export function moduleUnlocked(key) {
  if (key === 'bazaar') return !!(S.bazaar && S.bazaar.unlocked);
  return !!(S.moduleUnlocks && S.moduleUnlocks[key]);
}

/**
 * 大模块入口可见：章节门禁到点（集市=第 7 章）且已完成首次晋升。
 * v4.3.36：已买断的模块恒可见——章节门禁只负责「什么时候能买」，不能把老玩家已付款的模块再锁回去。
 */
export function moduleVisible(key) {
  if (moduleUnlockDef(key) === null) return false;
  if (moduleUnlocked(key)) return true;
  if (!gateOpen(key, S)) return false;
  return (S.prestige || 0) >= 1;
}

/** 面板购买卡的单一状态源：按钮文案 / 灰态 / 点击结果全部读它。 */
export function moduleBuyState(key) {
  const m = moduleUnlockDef(key);
  if (!m) return { ok: false, reason: '未知模块' };
  if (moduleUnlocked(key)) return { ok: false, reason: '已开启', opened: true };
  if (!gateOpen(key, S)) {
    const ch = CHAPTER_GATES[key];
    return { ok: false, reason: `需推进到第 ${ch} 章` };
  }
  if (!moduleVisible(key)) return { ok: false, reason: '需先完成 1 次晋升' };
  // v4.0.5：职级点是整数资源——判定与展示都先取整，旧档残留小数不会出现「需 3 PP（当前 2.71）」
  const pp = Math.max(0, Math.round(S.prestigePoints || 0));
  if (pp < m.cost) return { ok: false, reason: `需 ${m.cost} PP（当前 ${pp}）`, cost: m.cost, pp };
  return { ok: true, cost: m.cost, pp };
}

/** 花职级点买断模块；PP 本身也是全局产出加成来源，因此这是一次真实的取舍。 */
export function buyModuleUnlock(key) {
  const st = moduleBuyState(key);
  if (!st.ok) return { ok: false, reason: st.reason };
  S.prestigePoints = Math.max(0, Math.round(S.prestigePoints) - st.cost); // v4.0.5：扣费后仍是整数
  if (key === 'bazaar') {
    S.bazaar = S.bazaar || {};
    S.bazaar.unlocked = true;
  } else {
    S.moduleUnlocks = S.moduleUnlocks || {};
    S.moduleUnlocks[key] = true;
  }
  save(S);
  return { ok: true, cost: st.cost, name: moduleUnlockDef(key).name };
}

/** 统一购买卡 HTML（集市页使用，避免两份卡面漂移）。 */
export function moduleUnlockCard(key) {
  const m = moduleUnlockDef(key);
  if (!m) return '';
  const st = moduleBuyState(key);
  if (st.opened) return '';
  return `<div class="item module-unlock-card" style="padding:14px 16px">
    <div style="font-size:13px;font-weight:600;color:var(--accent)">${m.name} · 尚未开启</div>
    <div style="font-size:11px;color:var(--text-2);line-height:1.7;margin:6px 0 10px">${m.desc}</div>
    <div class="off-stat"><span>开启消耗</span><b style="color:var(--purple)">-${m.cost} PP</b></div>
    <div class="off-stat"><span>当前职级点</span><b>${st.pp != null ? st.pp : Math.max(0, Math.round(S.prestigePoints || 0))} PP</b></div>
    <button class="btn ${st.ok ? '' : 'disabled'}" data-module-unlock="${key}" style="margin-top:10px;width:100%">
      ${st.ok ? `消耗 ${m.cost} PP 开启「${m.name}」` : st.reason}
    </button>
    <div style="font-size:10.5px;color:var(--text-3);margin-top:8px;line-height:1.6">开启后永久保留（跨晋升）。职级点同时提供全局产出加速，请权衡投入时机。</div>
  </div>`;
}
