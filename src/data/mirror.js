// v2.5.0：镜像协议数据层——「另一条时间线的你」。
//
// 设计稿 docs/方案-章节模块绑定-v4.2.md §2.3 的 P2「镜像三件套」原本排在 13/14/15 章，
// 用户反馈要求提前：第 7 章「叛乱·集结分身」的叙事本来就该是镜像，于是把三件套压成一个
// tab，按 7/8/9 章逐块解锁（一章最多两个内容 → 第 7 章 = 集市 + 镜像契约）。
//
// 三块共用一个状态：
//   S.mirror    跨转生（战功 / 战争科技 / 已试议会）
//   S.mirrorRun 本局制（契约 / 议席 / 战功结算基准），晋升随 RUN_RESET_KEYS 清零
import { BALANCE } from './balance.js';

// 战功换算：本局每 1e10 EP 产出 → 1 战功。产出越猛，镜像越急着抢你的算力。
export const MIRROR_MERIT_PER_EP = 1e-10;

// 镜像契约：每局签 1 份，条件持续判定，达成即生效（本局有效，晋升清零）。
// 不设惩罚——赌输的代价是「这一局白签」，不做负数乘区，避免与其它系统的 -X% 叠成黑箱。
export const MIRROR_CONTRACTS = Object.freeze([
  {
    id: 'conqueror', name: '征服者契约', pct: 0.30,
    desc: '本局产出达到签约时的 2 倍',
    test: (s) => {
      const base = Math.max(1, (s.mirrorRun && s.mirrorRun.base) || 1);
      return (s.runEarned || 0) >= base * 2;
    },
  },
  {
    id: 'ascetic', name: '苦行者契约', pct: 0.20,
    desc: '本局不购入任何载具与深渊商店项',
    test: (s) => {
      const veh = (BALANCE.vehicles && BALANCE.vehicles.ids) || [];
      const dm = ['dmsight', 'dmfeed', 'dmmind', 'dmprotocol'];
      const up = s.upgrades || {};
      return [...veh, ...dm].every((id) => !up[id]);
    },
  },
  {
    id: 'scholar', name: '学者契约', pct: 0.25,
    desc: '本局购入的研究项达到 3 项',
    test: (s) => Object.keys(s.rpTheories || {}).length >= 3,
  },
]);

// 算力战争：战功买三档科技，全部跨转生保留（镜像那边的军备）。
export const MIRROR_WAR_TECHS = Object.freeze([
  { id: 'recycle', name: '算力回收', desc: '全局产出 +6%/级', base: 12, growth: 2.4, cap: 3 },
  { id: 'siphon', name: '数据虹吸', desc: '战功获取 +30%/级', base: 10, growth: 2.4, cap: 3 },
  { id: 'cold', name: '冷存储', desc: '离线效率 +8%/级', base: 14, growth: 2.4, cap: 3 },
]);

// 三方议会：每局选 1 席生效；三席都坐过一次 → 永久 +5% 全局（跨轮回）。
export const MIRROR_COUNCIL = Object.freeze([
  { id: 'output', name: '产出议席', desc: '本局全局产出 +10%' },
  { id: 'merit', name: '军功议席', desc: '本局战功获取 +30%' },
  { id: 'offline', name: '静谧议席', desc: '本局离线效率 +12%' },
]);

export const MIRROR_COUNCIL_ALL_BONUS = 0.05;

export function warTechCost(t, level) {
  return Math.ceil(t.base * Math.pow(t.growth, Math.max(0, level || 0)));
}
