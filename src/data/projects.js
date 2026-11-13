// v3.12.13：资源驱动的任务类型。
// 每个「已解锁资源」可衍生 获取 / 消耗 / 相关升级 三类任务；未解锁资源绝不刷出对应任务
// （spawnProject 按 anchorDone 门控）。进度口径统一走 economy 的 _gainRes / _spentRes / _buyRes。
//
// metric 含义：
//   gain  — 累计获得该资源（S._gainRes）
//   spend — 累计消耗该资源（S._spentRes）
//   buy   — 购买该资源的相关升级 / 物件次数（S._buyRes）
export const RES_PROJECTS = {
  ep: {
    label: 'EP', anchor: null, // 恒解锁（基础资源）
    kinds: {
      gain:  { name: '产能冲刺', desc: '限时内累计获得 EP', metric: 'gain' },
      spend: { name: '资源调度', desc: '限时内消耗 EP',     metric: 'spend' },
      buy:   { name: '基建扩张', desc: '限时内购买升级模块', metric: 'buy' },
    },
  },
  rp: {
    label: 'RP', anchor: 'rp',
    kinds: {
      gain:  { name: '研究迸发', desc: '限时内累计获得 RP',          metric: 'gain' },
      spend: { name: '学术攻关', desc: '限时内消耗 RP（研究升级）',  metric: 'spend' },
      buy:   { name: '理论推演', desc: '限时内购买 RP 研究升级',     metric: 'buy' },
    },
  },
  pt: {
    label: 'PT', anchor: 'pt',
    kinds: {
      gain:  { name: '宠物亲和', desc: '限时内累计获得 PT',          metric: 'gain' },
      spend: { name: '饲育投入', desc: '限时内消耗 PT（招募异兽）',  metric: 'spend' },
      buy:   { name: '异兽扩充', desc: '限时内招募异兽',             metric: 'buy' },
    },
  },
  dm: {
    label: 'DM', anchor: 'dm',
    kinds: {
      gain:  { name: '深渊采掘', desc: '限时内累计获得 DM',          metric: 'gain' },
      spend: { name: '遗物锻造', desc: '限时内消耗 DM（深渊遗物）',  metric: 'spend' },
      buy:   { name: '遗物收藏', desc: '限时内购买深渊遗物',         metric: 'buy' },
    },
  },
  es: {
    label: 'ES', anchor: 'es',
    kinds: {
      // ES 主要经晋升获得、靠永恒矩阵消耗——不刷「获取」类（跨晋升周期不可达）
      spend: { name: '永恒献祭', desc: '限时内消耗 ES（永恒矩阵）',  metric: 'spend' },
    },
  },
  fp: {
    label: 'FP', anchor: 'faith',
    kinds: {
      gain:  { name: '信仰汇聚', desc: '限时内累计获得 FP',          metric: 'gain' },
      spend: { name: '神殿营造', desc: '限时内消耗 FP（宗教建筑/升级）', metric: 'spend' },
      buy:   { name: '圣职晋阶', desc: '限时内购买宗教升级',         metric: 'buy' },
    },
  },
};

export const MAX_PROJECTS = 3;
export const PENDING_EXPIRE = 3600000; // 1小时
export const PROJECT_SPAWN_COOLDOWN = 600000; // v2.4.2：生成冷却 10 分钟（原 120s 发放过快）
