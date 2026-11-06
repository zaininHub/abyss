// v3.7.0：研究点升级读侧从 economy.js 下沉到 core。
// 动机：data/policies.js 的政策幅度需要消费 researchMult('policy')，但 economy.js 本身
//   import 了 policyMult —— 若 policies.js 反过来 import economy.js 就形成循环依赖。
//   抽到 core 后两侧都只读 state / BALANCE，依赖方向单一，且「律令演绎」不再有内联第二实现。
import { S } from '../state.js';
import { BALANCE } from '../data/balance.js';
import { compoundBuff } from './pricing.js';

// 同一 fx.key 的多个研究项逐级连乘；global 走乘算复利，其余走线性加成。
export function researchMult(key) {
  const T = BALANCE.researchUpgs || [];
  let m = 1;
  for (const u of T) {
    const lv = (S.rpTheories && S.rpTheories[u.id]) || 0;
    if (lv <= 0 || !u.fx || u.fx.key !== key) continue;
    m *= compoundBuff({ base: 1, perLevel: u.fx.v, levels: lv, mode: key === 'global' ? 'multiplicative' : 'linear' });
  }
  return m;
}
