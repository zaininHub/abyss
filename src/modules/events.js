import { S, save } from '../state.js';
import { getEvents } from '../core/provider.js';
import { UPGRADES } from '../data/upgrades.js';
import { computeCps, eventFreqMult, offlineRate, fmt, elv, tideMult, addEp, addRp } from './economy.js';
import { fxValue } from '../core/effectEngine.js'; // v2.1 建筑驱动：机会感知器·锐

export function maybeTriggerEvent() {
  if (Date.now() < S.nextEventAt) return null;
  const base = (4 * 3600 + Math.random() * 3 * 3600) * 1000 / eventFreqMult();
  S.nextEventAt = Date.now() + base;
  const cps = computeCps();
  const events = getEvents();
  let pool = events.filter(e => cps >= e.minCps);
  if (S.runTalent === 'lucky2') pool = pool.filter(e => !e.rare || Math.random() < 0.5);
  if (pool.length === 0) return null;
  const weighted = [];
  for (const e of pool) {
    let w = e.rare ? 2 : 10;
    // v2.0 潮汐：乱流相位下负面事件权重 ×2（tideMult('eventBad')）
    if (e.type === 'debuff' || e.type === 'lose_ep') w *= tideMult('eventBad');
    for (let i = 0; i < w; i++) weighted.push(e);
  }
  const ev = weighted[Math.floor(Math.random() * weighted.length)];
  // v2.0 潮汐：正面增益事件时长受 eventGoodDur 相位系数影响（涨潮 ×1.5）
  applyEvent(ev, tideMult('eventGoodDur'));
  return ev;
}

export function applyEvent(ev, durMult = 1) {
  S.eventsSeen++;
  const cps = computeCps();
  const luckyMult = 1 + elv('lucky') * 0.05;
  if (ev.type === 'ep') {
    let amt = ev.amount;
    if (ev.id === 'redpacket') amt = 10000;
    const gain = cps * amt * luckyMult;
    if (isFinite(gain) && gain > 0) {
      addEp(gain); // v2.1 D1：统一入口，受 EP 存储上限约束
    }
  } else if (ev.type === 'buff') {
    S.buffMult = ev.mult;
    S.buffUntil = Date.now() + ev.dur * 1000 * durMult;
  } else if (ev.type === 'debuff') {
    S.buffMult = ev.mult;
    S.buffUntil = Date.now() + ev.dur * 1000; // 负面效果时长不放大
  } else if (ev.type === 'clickbuff') {
    S.clickBuffMult = ev.mult;
    S.clickBuffUntil = Date.now() + ev.dur * 1000 * durMult;
  } else if (ev.type === 'rp') {
    addRp(Math.ceil(ev.amount * luckyMult * (1 + fxValue('eventRewardAdd')))); // v2.8.27 ②：RP 上限 // v2.1 建筑驱动：机会感知器·锐 +50%/级
  } else if (ev.type === 'focus') {
    S.focusLevel += ev.amount;
  } else if (ev.type === 'freelevel') {
    const owned = UPGRADES.filter(u => (S.upgrades[u.id] || 0) > 0);
    if (owned.length) {
      const u = owned[Math.floor(Math.random() * owned.length)];
      S.upgrades[u.id] = (S.upgrades[u.id] || 0) + 1;
    }
  } else if (ev.type === 'petxp') {
    S.petXpMult = 2; S.petXpUntil = Date.now() + 60000 * durMult;
  } else if (ev.type === 'offrush') {
    const gain = cps * 4 * 3600 * offlineRate();
    if (isFinite(gain) && gain > 0) {
      addEp(gain); // v2.1 D1：统一入口，受 EP 存储上限约束
    }
  } else if (ev.type === 'fuse_luck') {
    S.fuseLuckUntil = Date.now() + 300000 * durMult;
  } else if (ev.type === 'lose_ep') {
    const loss = S.ep * ev.amount;
    S.ep -= loss;
  } else if (ev.type === 'purify') {
    // v2.0 腐化：深渊净化事件，立即清除全部腐化
    S.corruption = 0;
  }
  save(S); // 事件触发后立即存档（设计方案 §6.5），beforeunload 存档保留不动
  return ev;
}
