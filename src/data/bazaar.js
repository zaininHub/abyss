// v3.0.0 大模块：深渊集市（Abyss Bazaar）
// 参考 Kittens Game 的贸易/资源转换思路（"多余资源换稀缺资源 + 汇率波动 + 库存限购"），
// 解决本作中期的真实痛点：EP 顶到存储上限没处花、RP/DM/信仰/余烬/虚空碎片各自孤立无兑换通道。
// 设计原则（沿用历史口径）：
//   ① 跨周期克制——只保留成交笔数/集市等级（长线资产），库存/汇率/刷新次数每轮重置；
//   ② 负面只减缓不免疫——汇率波动恒存，集市等级只抬高波动下限，不消除波动；
//   ③ 成本陡峭——手动刷新 EP 成本 ×1.6^n，防无脑刷出最优汇率；
//   ④ 每轮有不同走向——集市政策组（周期政策第 4 组）影响汇率/库存/刷新成本。
export const BAZAAR = {
  unlockRank: 1,        // 解锁门槛：职级 ≥1（已晋升一次）+ RP 已发现
  shuffleSec: 45,       // 汇率波动周期（秒）
  volatility: 0.25,     // 汇率波动幅度（±25%）
  stockRegenSec: 30,    // 库存自然恢复周期（每位商人 +1，至上限）
  refreshEpRatio: 0.02, // 手动刷新 EP 成本 = 存储上限 × 2% × 1.6^本轮刷新次数
  refreshGrowth: 1.6,
  echoRefresh: 1,       // 回响刷新：消耗 1 回响（跨周期资源，克制）
  tiers: [0, 8, 24, 60, 150], // 累计成交笔数门槛 → 集市等级 0..4
  // 商人：from → to 单向兑换；give = 每批支付，get = 每批获得（基准值，实际 × 汇率）
  // capRatio：'give' 表示支付额 = EP 存储上限 × give；'get' 表示获得额 = 上限 × get
  dealers: [
    { id: 'forge',   name: '熔炉协议', icon: '🔥', from: 'ep',    to: 'dm',    give: 120000, get: 6,   stock: 4, tier: 0,
      desc: '上缴算力换深渊物质（稳定通道，但限购）' },
    { id: 'caravan', name: '兽栏商队', icon: '🍪', from: 'ep',    to: 'pt',    give: 0.03,  get: 35,  stock: 3, tier: 0, capRatio: 'give',
      desc: '用车间的余电换 PT' },
    { id: 'smuggle', name: '走私信道', icon: '📦', from: 'rp',    to: 'dm',    give: 30,    get: 5,   stock: 3, tier: 0,
      desc: '研究点走私成深渊物质（绕过裂隙的直接通道，库存极少）' },
    { id: 'pawn',    name: '典当核心', icon: '💠', from: 'faith', to: 'ep',    give: 200,   get: 0.08, stock: 3, tier: 1, capRatio: 'get',
      desc: '典当信仰换取急需的算力（信仰有上限，别囤着发霉）' },
    { id: 'broker',  name: '余烬掮客', icon: '🕯️', from: 'dm',    to: 'ember', give: 15,    get: 4,   stock: 2, tier: 1,
      desc: '深渊物质换裂隙余烬（跨转生资产互换；本通道为余烬唯一非裂隙来源）' },
    { id: 'voidfirm',name: '虚空商行', icon: '🌌', from: 'ep',    to: 'vs',    give: 0.12,  get: 8,   stock: 2, tier: 2, capRatio: 'give',
      desc: '重金收购虚空碎片——不必深潜也能摸到终局层（深潜解锁前无效）' },
  ],
};

export const RES_LABEL = {
  ep: '⚡ EP', rp: '🔬 RP', dm: '🌀 DM', faith: '🙏 信仰', ember: '🕯️ 余烬', vs: '🌑 VS', pt: '🍪 PT',
};

export function dealerById(id) { return BAZAAR.dealers.find(d => d.id === id) || null; }

// 集市等级：按累计成交笔数（跨周期保留）
export function bazaarTier(trades) {
  let t = 0;
  for (let i = 0; i < BAZAAR.tiers.length; i++) if ((trades || 0) >= BAZAAR.tiers[i]) t = i;
  return t;
}
export function bazaarNextTierNeed(trades) {
  const t = bazaarTier(trades);
  return t >= BAZAAR.tiers.length - 1 ? null : BAZAAR.tiers[t + 1];
}

// 汇率波动：区间 [1-波动+5%×等级, 1+波动]——等级只抬高下限（不消除波动），上限恒定
export function rollRate(tier = 0, rnd = Math.random) {
  const lo = Math.min(0.95, 1 - BAZAAR.volatility + 0.05 * (tier || 0));
  const hi = 1 + BAZAAR.volatility;
  return lo + rnd() * Math.max(0, hi - lo);
}

// 手动刷新成本（EP）
export function bazaarRefreshEpCost(cap, n) {
  return Math.round((cap || 0) * BAZAAR.refreshEpRatio * Math.pow(BAZAAR.refreshGrowth, n || 0));
}
