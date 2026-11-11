// v3.12.0 反馈⑬：轮回 / 集市在「第一次晋升后」作为独立大模块，用职级点购买开启。
// 这是「模块解锁」的唯一真源：价格表、可见性谓词、购买状态、购买动作四处不再各写一份。
// 跨局保留（S.moduleUnlocks / S.bazaar.unlocked 都在 CROSS_RUN_KEYS），买断后转生不重复收费。
import { S, save } from '../state.js';

export const MODULE_UNLOCKS = Object.freeze([
  { key: 'reincarn', name: '轮回', cost: 3, desc: '第二层循环：结算深渊回响、携带深渊遗存、购买回响升级。' },
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

/** 首次晋升后两个大模块入口常驻（未买断时点进去看购买卡，而不是 ??? 锁死）。 */
export function moduleVisible(key) {
  return moduleUnlockDef(key) !== null && (S.prestige || 0) >= 1;
}

/** 面板购买卡的单一状态源：按钮文案 / 灰态 / 点击结果全部读它。 */
export function moduleBuyState(key) {
  const m = moduleUnlockDef(key);
  if (!m) return { ok: false, reason: '未知模块' };
  if (moduleUnlocked(key)) return { ok: false, reason: '已开启', opened: true };
  if (!moduleVisible(key)) return { ok: false, reason: '需先完成 1 次晋升' };
  const pp = S.prestigePoints || 0;
  if (pp < m.cost) return { ok: false, reason: `需 ${m.cost} PP（当前 ${pp}）`, cost: m.cost, pp };
  return { ok: true, cost: m.cost, pp };
}

/** 花职级点买断模块；PP 本身也是全局产出加成来源，因此这是一次真实的取舍。 */
export function buyModuleUnlock(key) {
  const st = moduleBuyState(key);
  if (!st.ok) return { ok: false, reason: st.reason };
  S.prestigePoints -= st.cost;
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

/** 统一购买卡 HTML（轮回页 / 集市页共用，避免两份卡面漂移）。 */
export function moduleUnlockCard(key) {
  const m = moduleUnlockDef(key);
  if (!m) return '';
  const st = moduleBuyState(key);
  if (st.opened) return '';
  return `<div class="item module-unlock-card" style="padding:14px 16px">
    <div style="font-size:13px;font-weight:600;color:var(--accent)">${m.name} · 尚未开启</div>
    <div style="font-size:11px;color:var(--text-2);line-height:1.7;margin:6px 0 10px">${m.desc}</div>
    <div class="off-stat"><span>开启消耗</span><b style="color:var(--purple)">-${m.cost} PP</b></div>
    <div class="off-stat"><span>当前职级点</span><b>${st.pp != null ? st.pp : (S.prestigePoints || 0)} PP</b></div>
    <button class="btn ${st.ok ? '' : 'disabled'}" data-module-unlock="${key}" style="margin-top:10px;width:100%">
      ${st.ok ? `消耗 ${m.cost} PP 开启「${m.name}」` : st.reason}
    </button>
    <div style="font-size:10.5px;color:var(--text-3);margin-top:8px;line-height:1.6">开启后永久保留（跨晋升 / 轮回）。职级点同时提供 +10%/点的资源产出加成，请权衡投入时机。</div>
  </div>`;
}
