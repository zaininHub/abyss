// v3.8.0 声明层：全部「资源随时间流动」的玩法管道。
//
// 本文件只做声明，不持有调度逻辑（调度在 core/flowEngine.js），也不碰 DOM
// （日志 / 提示 / 触手动画统一走 ctx 注入，因此纯 Node 可直接单测每条流）。
//
// 阶段与 main.js tick() 的四个执行点一一对应，顺序与 v3.7.5 原实现逐字保持一致：
//   EP_PRODUCE  EP 主产出（必须先跑，后续流都读这一帧的余额）
//   EP_AUX      触手自动点击 → 懒惰态 → 灵感工坊蒸馏 / 满仓涓流
//   PRODUCERS   升级卡被动产出 RP / PT / FP
//   CONVERTERS  PT 孵化 / 满仓涓流 → 星际燃料 → 出战异兽 PT 维持
// 中间夹着的薪资 / 线程 / 宗教 / 深潜 / 集市等模块 tick 仍留在主循环原位，
// 这样「先产出、再扣费、后结算」的顺序完全不变，重构不引入任何数值漂移。
//
// 新增玩法若要影响资源，只需在 core 注册修饰器并给流声明 modKey —— 不必改这里、也不必改主循环。
import { registerFlow, flowMultiplier, bookFlow, FLOW_PHASES as P } from '../core/flowEngine.js';
import { BALANCE } from '../data/balance.js';
import { UPGRADES } from '../data/upgrades.js';
import {
  computeCps, epStorageCap, addEp, addRp, addPt, clickMult, isLazy,
  hasTech, rpCap, rpEffScale, ptCap,
} from '../modules/economy.js';
import { converterEnabled, converterThreadBoost } from '../modules/threadBinding.js';
import { petUpkeepTotalPerSec, petStarving } from '../modules/pets.js';

const { EP_PRODUCE, EP_AUX, PRODUCERS, CONVERTERS } = P;

// ========== ① EP 主产出 ==========
// 挂机产出走「先加后截」：S.ep 先全额入账，溢出由 tickCorruption 累积腐化并截断到上限；
// 统计口径（runEarned / allTimeEp / earnedFull）一律取钳后 credited，与 addEp() 一致。
registerFlow({
  id: 'ep:main', phase: EP_PRODUCE, order: 10, resource: 'ep',
  run({ S, dt }) {
    const cps = computeCps();
    const gain = cps * dt;
    const capNow = epStorageCap();
    const credited = Math.min(gain, Math.max(0, capNow - S.ep));
    S.ep += gain;
    S.runEarned += credited;
    S.allTimeEp += credited;
    S.earnedFull = (S.earnedFull || 0) + credited;
    return { resource: 'ep', produced: credited, gross: gain };
  },
});

// ========== ② 触手协议：每 60 秒自动点击一次 ==========
registerFlow({
  id: 'ep:tentacle', phase: EP_AUX, order: 10, resource: 'ep',
  run({ S, dt, log, tentacleTap }) {
    if (!S.tech || S.tech.tentacle_protocol !== true) return;
    S._tentacleTimer = (S._tentacleTimer || 0) + dt;
    if (S._tentacleTimer < 60) return;
    S._tentacleTimer -= 60;
    const tap = clickMult();
    if (tap <= 0) return;
    const gained = addEp(tap); // 一次性入账走 addEp（不计 earnedFull，与 v3.7.5 口径一致）
    if (log) log('触手轻点工作台', 'good');
    if (typeof tentacleTap === 'function') tentacleTap();
    return { resource: 'ep', produced: gained };
  },
});

// ========== ③ 线程懒惰态计时（对称缓冲，不含资源结算） ==========
registerFlow({
  id: 'ep:lazy', phase: EP_AUX, order: 20,
  run({ S, now }) {
    const capNow = epStorageCap();
    const lazyAfterMs = (BALANCE.lazy?.afterSec || 60) * 1000;
    if (isLazy()) {
      if (S.ep <= 0) { S.lazySince = null; S.lazyLowSince = null; }
      else if (S.ep < capNow * 0.98) {
        if (!S.lazyLowSince) S.lazyLowSince = now;
        if (now - S.lazyLowSince >= lazyAfterMs) S.lazySince = null;
      } else S.lazyLowSince = null;
    } else if (S.ep >= capNow * 0.98) {
      if (!S.lazySince) S.lazySince = now;
      S.lazyLowSince = null;
    } else {
      S.lazySince = null; S.lazyLowSince = null;
    }
  },
});

// ========== ④ 灵感工坊蒸馏（EP → RP）与满仓涓流 ==========
// modKey 'rp'：编排策略的「研究优先」等倍率在此统一生效。
registerFlow({
  id: 'rp:atrium', phase: EP_AUX, order: 30, modKey: 'rp', resource: 'rp',
  run({ S, dt }) {
    const atriumN = (S.upgrades && S.upgrades.atrium) || 0;
    const atriumOn = converterEnabled('atrium');
    const atriumRpFull = (S.rp || 0) >= rpCap();
    if (atriumN <= 0 || !atriumOn || S.ep <= 0) return;
    const mult = flowMultiplier('rp', { S, dt });

    if (!atriumRpFull) {
      const epNeed = (BALANCE.atrium.epRate || 150) * atriumN * dt;
      const used = Math.min(S.ep, epNeed);
      S.ep -= used;
      // 严格线性：RP = 实扣 EP × (rate / epRate) × 绑定加成 ÷ 效率递增系数
      const rpGain = used * ((BALANCE.atrium.rate || 0.15) / (BALANCE.atrium.epRate || 150))
        * Math.min(converterThreadBoost('atrium'), 2) / rpEffScale() * mult;
      const before = S.rp || 0;
      addRp(rpGain);
      bookFlow('ep', 'out', used);
      return { resource: 'rp', produced: (S.rp || 0) - before, epCost: used };
    }

    // 满仓涓流：每 5s 一次 -50K EP → +0.01 RP（不写日志，避免刷屏）
    S._atriumTrickle = (S._atriumTrickle || 0) + dt;
    if (S._atriumTrickle >= 5) {
      S._atriumTrickle = 0;
      if ((S.ep || 0) >= 50000) {
        S.ep -= 50000;
        const before = S.rp || 0;
        addRp(0.01 * mult); // v3.10.2 ④：满仓涓流改走统一入口，不再直写 S.rp 越过 rpCap
        bookFlow('ep', 'out', 50000);
        return { resource: 'rp', produced: (S.rp || 0) - before, epCost: 50000 };
      }
    }
  },
});

// ========== ⑤ 升级卡被动产出（数据驱动，替代主循环里的 if 链） ==========
registerFlow({
  id: 'upgrades:produces', phase: PRODUCERS, order: 10,
  run({ S, dt, log }) {
    let rpIn = 0, ptIn = 0, faithIn = 0;
    const rpMult = flowMultiplier('rp', { S, dt });
    const ptMult = flowMultiplier('pt', { S, dt });
    for (const u of UPGRADES) {
      if (!u.produces) continue;
      const n = S.upgrades[u.id] || 0;
      if (n === 0) continue;
      const p = u.produces;
      if (p.type === 'rp') {
        const before = S.rp || 0;
        addRp(p.rate * n * dt * rpMult);
        rpIn += (S.rp || 0) - before;
      } else if (p.type === 'pt') {
        const before = S.pt || 0;
        addPt(p.rate * n * dt * ptMult);
        ptIn += (S.pt || 0) - before;
      } else if (p.type === 'fa_chance') {
        if (Math.random() < p.rate * n * dt) {
          S.faith = (S.faith || 0) + 1;
          faithIn += 1;
          if (log) log('神龛显灵：+1 FP', 'good');
        }
      }
    }
    bookFlow('pt', 'in', ptIn);
    bookFlow('faith', 'in', faithIn);
    return { resource: 'rp', produced: rpIn, ptProduced: ptIn, fpProduced: faithIn };
  },
});

// ========== ⑥ PT 孵化（EP → PT）与满仓涓流 ==========
// modKey 'pt'：编排倍率作用于孵化汇率（EP 消耗随之按剩余容量折算，不白烧 EP）。
registerFlow({
  id: 'pt:hatch', phase: CONVERTERS, order: 10, modKey: 'pt', resource: 'pt',
  run({ S, dt }) {
    if (S.ptAutoHatch !== true || S.ptDistillOn !== true) return;
    const hatchLv = S.ptHatchLv || 1;
    const hatchCfg = BALANCE.hatch || { epPerSec: 15000, epPerPt: 150000 };
    const ptRoom = Math.max(0, ptCap() - (S.pt || 0));
    const ptMult = flowMultiplier('pt', { S, dt });

    if (ptRoom >= 1) {
      const boost = converterThreadBoost('hatch');
      const need = hatchCfg.epPerSec * hatchLv * boost * dt;
      const rate = (1 / Math.max(hatchCfg.epPerPt, 1)) * ptMult;
      const needClamped = Math.min(need, ptRoom / Math.max(rate, 1e-12));
      const take = Math.min(needClamped, S.ep);
      S.ep -= take;
      const before = S.pt || 0;
      addPt(take * rate); // v3.10.2 ④：与 RP 同口径，统一走带上限钳制的入口
      bookFlow('ep', 'out', take);
      return { resource: 'pt', produced: (S.pt || 0) - before, epCost: take };
    }

    S._ptTrickle = (S._ptTrickle || 0) + dt;
    if (S._ptTrickle >= 5) {
      S._ptTrickle = 0;
      if ((S.ep || 0) >= 50000) {
        S.ep -= 50000;
        const before = S.pt || 0;
        addPt(0.01 * ptMult); // v3.10.2 ④：满仓涓流改走统一入口，不再直写 S.pt 越过 ptCap
        bookFlow('ep', 'out', 50000);
        return { resource: 'pt', produced: (S.pt || 0) - before, epCost: 50000 };
      }
    }
  },
});

// ========== ⑦ 星际燃料燃烧 ==========
registerFlow({
  id: 'fuel:burn', phase: CONVERTERS, order: 20, resource: 'starCps',
  run({ S, dt, log }) {
    if (!S.fuelMode) return;
    const burn = 2 * dt;
    if ((S.starCps || 0) >= burn) {
      S.starCps -= burn;
      return { resource: 'starCps', consumed: burn };
    }
    S.starCps = 0;
    S.fuelMode = false;
    if (log) log('星际燃料耗尽：燃料模式已熄火（全局加成失效）', 'warn');
  },
});

// ========== ⑧ 出战异兽 PT 维持 + 休战/复出战过渡 ==========
registerFlow({
  id: 'pt:upkeep', phase: CONVERTERS, order: 30, resource: 'pt',
  run({ S, dt, log }) {
    const petUpkeep = petUpkeepTotalPerSec();
    if (petUpkeep > 0 && (S.pt || 0) > 0) S.pt = Math.max(0, (S.pt || 0) - petUpkeep * dt);
    const starvingNow = petStarving();
    if (starvingNow && !S._petStarving && log) log('PT 耗尽：出战异兽已回家休战（加成失效，不再消耗维持）', 'warn');
    else if (!starvingNow && S._petStarving && log) log('PT 回升：异兽重新出战', 'good');
    S._petStarving = starvingNow;
    return petUpkeep > 0 ? { resource: 'pt', consumed: petUpkeep * dt } : undefined;
  },
});

// 供单测 / QA 校验「声明 → 消费」接线完整
export const RESOURCE_FLOW_IDS = Object.freeze([
  'ep:main', 'ep:tentacle', 'ep:lazy', 'rp:atrium',
  'upgrades:produces', 'pt:hatch', 'fuel:burn', 'pt:upkeep',
]);
