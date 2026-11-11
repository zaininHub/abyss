// v3.0.0 大模块：深渊集市（Abyss Bazaar）
// 参考 Kittens Game 的贸易/资源转换思路（"多余资源换稀缺资源 + 汇率波动 + 库存限购"），
// 解决本作中期的真实痛点：EP 顶到存储上限没处花、RP/DM/信仰/余烬/虚空碎片各自孤立无兑换通道。
// 设计原则（沿用历史口径）：
//   ① 跨周期克制——只保留成交笔数/集市等级（长线资产），库存/汇率/品质/摊位每轮重置；
//   ② 负面只减缓不免疫——汇率波动恒存，集市等级抬高波动下限与高品质概率，不消除波动；
//   ③ 成本陡峭——手动刷新 EP 成本 ×1.6^n，防无脑刷出最优汇率；
//   ④ 每轮有不同走向——摊位数量 / 商品品质 / 特惠涨价逐轮重掷。
//
// v3.12.3 反馈②：集市重做
//   · 汇率与库存改为「每 30 分钟整体刷新一次」（原 45s 波动 / 30s 自然恢复两套计时器并存，玩家看不懂）；
//   · 每次刷新只上架 3~8 个摊位（商人池 10 位，按集市等级过滤）；
//   · 每件商品带 6 档品质：品质越高库存越少、单价越贵、单位产出越高（稀有度不同）。
export const BAZAAR = {
  unlockRank: 1,        // 解锁门槛：职级 ≥1（已晋升一次）+ RP 已发现
  marketRefreshSec: 1800, // 30 分钟：汇率与库存整体刷新（摊位 / 品质 / 汇率全部重掷）
  volatility: 0.25,     // 汇率波动幅度（±25%）
  refreshEpRatio: 0.02, // 手动刷新 EP 成本 = 存储上限 × 2% × 1.6^本轮刷新次数
  refreshGrowth: 1.6,
  echoRefresh: 1,       // 回响刷新：消耗 1 回响（跨周期资源，克制）
  echoUpgradeId: 'bazaar_echo', // 解锁回响刷新按钮的升级项（升级商店购买，一次性）
  minDealers: 3,        // 每次刷新上架摊位下限
  maxDealers: 8,        // 上限
  tiers: [0, 8, 24, 60, 150], // 累计成交笔数门槛 → 集市等级 0..4
  // 商人池（10 位）：from → to 单向兑换；give = 每批支付，get = 每批获得（基准值，实际 ×汇率 ×品质）
  // capRatio：'give' 表示支付额 = EP 存储上限 × give；'get' 表示获得额 = 上限 × get
  dealers: [
    { id: 'forge',   name: '熔炉协议', icon: '🔥', from: 'ep',    to: 'dm',    give: 120000, get: 6,   tier: 0 },
    { id: 'caravan', name: '兽栏商队', icon: '🍪', from: 'ep',    to: 'pt',    give: 0.03,  get: 35,  tier: 0, capRatio: 'give' },
    { id: 'smuggle', name: '走私信道', icon: '📦', from: 'rp',    to: 'dm',    give: 30,    get: 5,   tier: 0 },
    { id: 'pawn',    name: '典当核心', icon: '💠', from: 'faith', to: 'ep',    give: 200,   get: 0.08, tier: 1, capRatio: 'get' },
    { id: 'broker',  name: '余烬掮客', icon: '🕯️', from: 'dm',    to: 'ember', give: 15,    get: 4,   tier: 1 },
    { id: 'mill',    name: '磨坊工坊', icon: '⚙️', from: 'pt',    to: 'ep',    give: 60,    get: 0.05, tier: 1, capRatio: 'get' },
    { id: 'ash',     name: '灰烬收容', icon: '🌫️', from: 'ember', to: 'ep',    give: 30,    get: 0.06, tier: 1, capRatio: 'get' },
    { id: 'salt',    name: '盐商行会', icon: '🧂', from: 'ep',    to: 'faith', give: 0.02,  get: 20,  tier: 2, capRatio: 'give' },
    { id: 'bone',    name: '骨牌小贩', icon: '🦴', from: 'rp',    to: 'pt',    give: 25,    get: 40,  tier: 2 },
    { id: 'voidfirm',name: '虚空商行', icon: '🌌', from: 'ep',    to: 'vs',    give: 0.12,  get: 8,   tier: 2, capRatio: 'give' },
  ],
};

// 商品品质（6 档）：品质越高 → 库存越少（稀有）、单价越贵、单位产出越高。
// efficiency = gainMult / priceMult：1.00 → 1.94，逐档递增，集市等级越高越容易撞到高档位。
export const QUALITY = [
  { q: 1, name: '粗糙', color: 'var(--text-3)',       priceMult: 1.00, gainMult: 1.00, stock: 6, weight: 46 },
  { q: 2, name: '寻常', color: 'var(--text-2)',       priceMult: 1.25, gainMult: 1.55, stock: 5, weight: 26 },
  { q: 3, name: '优良', color: 'var(--cyan)',         priceMult: 1.60, gainMult: 2.30, stock: 4, weight: 15 },
  { q: 4, name: '精良', color: 'var(--accent)',       priceMult: 2.05, gainMult: 3.30, stock: 3, weight: 8 },
  { q: 5, name: '稀有', color: 'var(--purple)',       priceMult: 2.60, gainMult: 4.60, stock: 2, weight: 4 },
  { q: 6, name: '传说', color: 'var(--warn)',         priceMult: 3.30, gainMult: 6.40, stock: 1, weight: 1 },
];
export function qualityOf(q) { return QUALITY[Math.max(0, Math.min(QUALITY.length - 1, (q || 1) - 1))]; }

export const RES_LABEL = {
  ep: '⚡ EP', rp: '🔬 RP', dm: '🌀 DM', faith: '🙏 FP', ember: '🕯️ 余烬', vs: '🌑 VS', pt: '🍪 PT',
};
// v3.12.3：卡面成本行用短标签（带 emoji 的长标签在窄卡里必然折行，出现「EP」孤行）
export const RES_SHORT = {
  ep: 'EP', rp: 'RP', dm: 'DM', faith: 'FP', ember: '余烬', vs: 'VS', pt: 'PT',
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

// 品质抽取：等级越高，权重整体向高档位倾斜（factor^档位，factor = 1 + 0.35×等级）。
export function rollQuality(tier = 0, rnd = Math.random) {
  const f = 1 + 0.35 * (tier || 0);
  const ws = QUALITY.map((x, i) => x.weight * Math.pow(f, i));
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < ws.length; i++) {
    r -= ws[i];
    if (r <= 0) return QUALITY[i].q;
  }
  return QUALITY[0].q;
}

// 本次上架摊位数量：3~8（等级 ≥2 起抽两次取较大值，高等级更容易挤满市场）
export function rollDealerCount(tier = 0, rnd = Math.random) {
  const span = BAZAAR.maxDealers - BAZAAR.minDealers + 1;
  const a = Math.floor(rnd() * span);
  const b = Math.floor(rnd() * span);
  const pick = (tier || 0) >= 2 ? Math.max(a, b) : a;
  return BAZAAR.minDealers + Math.min(span - 1, pick);
}

// 手动刷新成本（EP）
export function bazaarRefreshEpCost(cap, n) {
  return Math.round((cap || 0) * BAZAAR.refreshEpRatio * Math.pow(BAZAAR.refreshGrowth, n || 0));
}
