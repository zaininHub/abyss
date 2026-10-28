// 经济节奏模拟：自动玩法，模拟首轮晋升（转生）天数
import { computeCps, epStorageCap } from '../src/modules/economy.js';
import { UPGRADES } from '../src/data/upgrades.js';
import { S } from '../src/state.js';
import { BALANCE } from '../src/data/balance.js';
S.resDiscovered = { ep:true, cps:true, run:true, tide:true, rank:true, rp:false, es:false, faith:false, pt:false, dm:false };
S.upgrades = S.upgrades || {};
S.upgrades.scribble = 1; // 模拟开局 1 分钟内已购首个产出升级
S.cultists = [{ id:1, name:'T', output:1, mood:'正常', moodTimer:999 }]; // 开局 1 线程
// 参数化：NEED(首升需求) / CPS_SCALE(产出缩放) / COST_SCALE(成本缩放)
const NEED = Number(process.env.NEED || 1.5e8);
const CPS_SCALE = Number(process.env.CPS_SCALE || 1);
const COST_SCALE = Number(process.env.COST_SCALE || 1);
let runEarned = 0, ep = 0, t = 0, lastBuy = 0;
const daySnap = [1,2,3,4,5,6,7,10,14,20,25,30];
let di = 0;
// 自动玩法简化：产出购买（每 5s 买最便宜的未购基础产出）+ 线程自动招募（ep 够 30% 门槛）
while (t < 30*86400) {
  const cps = computeCps() * CPS_SCALE;
  const gain = cps;
  ep += gain; runEarned += gain;
  S.ep = ep; S.runEarned = runEarned;
  t += 1;
  if (t - lastBuy >= 5) {
    lastBuy = t;
    // 自动购建口径：每 5s 买一个最便宜可购项（基础产出/存储扩容/线程），限 ≤ cap×90%
    const cands = UPGRADES.filter(u => u.cps > 0 || u.cat === 'D' || u.id === 'storage' || u.id === 'cache');
    cands.sort((a,b)=>(a.base||0)-(b.base||0));
    for (const u of cands) {
      const lv = S.upgrades[u.id]||0;
      const cost = (u.base||0) * Math.pow(u.growth||1.18, lv) * COST_SCALE;
      if (ep >= cost && cost <= epStorageCap()*0.9) { ep -= cost; S.ep = ep; S.upgrades[u.id]=lv+1; break; }
    }
    // 线程招募（ep 够首线程成本）
    if ((S.cultists||[]).length < 3) {
      const tc = BALANCE.threadCostBase * Math.pow(BALANCE.threadCostGrowth, S.cultists?.length||0);
      if (ep >= tc) { ep -= tc; S.ep = ep; S.cultists = [...(S.cultists||[]), { id:(S.cultists?.length||0)+1, name:'T', output:1, mood:'正常', moodTimer:999 }]; }
    }
  }
  if (di < daySnap.length && t >= daySnap[di]*86400) {
    console.log(`D${daySnap[di]} run=${(runEarned/1e6).toFixed(1)}M ep=${(ep/1e6).toFixed(1)}M cps=${computeCps().toFixed(0)}/s cap=${(epStorageCap()/1e6).toFixed(1)}M threads=${S.cultists?.length||0}`);
    di++;
  }
  if (runEarned >= NEED) { console.log(`TURN1 @ ${(t/86400).toFixed(2)} 天（${(t/3600).toFixed(1)}h） run=${(runEarned/1e6).toFixed(1)}M`); process.exit(0); }
}
console.log('30 天未转生', (runEarned/1e9).toFixed(2), 'B');
