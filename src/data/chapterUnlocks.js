// v4.2.0：章节解锁注册表——「一章给一类实质」的单一真源（18 章映射）。
// v4.3.36 反馈①重排早段（用户定稿）：第 1 章 遗物 + 裂隙、第 2 章 异兽、第 3 章 宗教 + 政策；
//   集市不再登记在第 2 章，改第 7 章开张；ES 在第 4 章作为新资源登记（不新增门禁 id）。
// 每条 { chapter, id, name, announce }；id 与 core/chapterGates.js 的门禁 id 对齐（无门禁的章节用叙事锚点 id）。
// 一章可以有多条（第 1/3 章各三条）；同一章的公告由 frameSystems 去重成一句悬念日志。
// 用途：① 章节推进时发解锁日志；② 测试断言注册表覆盖与唯一性；③ wiki 解锁手册从 chUnlockNames 派生。
// 设计原则（docs/方案-章节模块绑定-v4.2.md）：入口早开、章节给实质；老玩家 S.chapter 已过即全放行。
export const CHAPTER_UNLOCKS = Object.freeze([
  // 第 1 章：基础循环 + 「深渊」这条长线的两个入口（裂隙首现于 8 线程 + 10 分钟）
  { chapter: 1,  id: 'workbench', name: '工作台 / 线程 / 商店', announce: '工作台、线程与商店已就位' },
  { chapter: 1,  id: 'rift',      name: '深渊裂隙',            announce: '深渊裂隙睁开，探采平台与深渊商店可用' },
  { chapter: 1,  id: 'relics',    name: '深渊遗物',            announce: '深渊遗物苏醒，DM 有了长线去处' },
  // 第 2 章：异兽线（饵料仓库 = PT 入口；锚点仍是 PT 本人，不做章节硬门禁）
  { chapter: 2,  id: 'pets',      name: '异兽 / 饵料仓库（PT）', announce: '饵料仓库出现，异兽与 PT 线开启' },
  // 第 3 章：第一个系统爆发章——星图 + 信仰 + 政策同时接入
  { chapter: 3,  id: 'starchart', name: '星图',                announce: '星图接入，远征队可以出发了' },
  { chapter: 3,  id: 'religion',  name: '宗教',                announce: '信仰苏醒——宗教面板可唤醒信仰' },
  { chapter: 3,  id: 'policy',    name: '周期政策',            announce: '周期政策开放——集结分身，自主立法' },
  // 第 4 章：晋升第一次留下的跨局货币（无门禁 id：esDiscovered 由首次晋升本身点亮）
  { chapter: 4,  id: 'es',        name: '永恒碎片（ES）',      announce: '永恒碎片沉淀——晋升开始留下跨局货币' },
  { chapter: 5,  id: 'crossroad', name: '岔路口 / 探采',       announce: '命运的岔路口出现——深渊已在低语中显形' },
  { chapter: 6,  id: 'transcend', name: '超验 / 隐密圣学',     announce: '赞颂与超验开启，神格之路铺开' },
  // 第 7 章：集市从「首发晋升」挪到中局——职级点已攒够，5 PP 买断不再卡死
  { chapter: 7,  id: 'bazaar',    name: '深渊集市',            announce: '深渊集市开张——富余资源可以换稀缺资源' },
  { chapter: 8,  id: 'eternals',  name: '永恒矩阵',            announce: '永恒矩阵浮现，ES 可换成永久强化' },
  { chapter: 10, id: 'resonance', name: '相位共鸣',            announce: '相位共鸣接入编排卡——另一个你开始共振' },
  { chapter: 11, id: 'delve',     name: '深潜',                announce: '深潜开放，向虚空下潜' },
  { chapter: 12, id: 'expedition', name: '深空殖民',           announce: '深空殖民开启，可以在星系里写下自己的服务器' },
  // 第 9 章（深渊）是「完成 20 次远征」的积累章，本批不新增模块（遗物已提前到第 1 章）；
  // 13~17 章（镜像契约/算力战争/三方议会/造物工坊/全知之眼）属设计稿 P2/P3 新玩法，
  //   尚未实装——遵守「无死数据」红线，不在注册表登记、不发虚假公告；实装时补登记即可。
  { chapter: 18, id: 'finale',    name: '终局叙事',            announce: '终章——你成为了自己的服务器' },
]);

/** 某章刚推进时该发的解锁项（一次一章，返回 0~n 条；frameSystems 按章去重成一句日志）。 */
export function unlocksAtChapter(n) {
  return CHAPTER_UNLOCKS.filter(x => x.chapter === n);
}

/** ≤n 章的全部解锁 id（老玩家判定 / 测试用）。 */
export function allUnlockedUpTo(n) {
  return CHAPTER_UNLOCKS.filter(x => x.chapter <= n).map(x => x.id);
}
