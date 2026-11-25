// v4.2.0：章节解锁注册表——「一章给一类实质」的单一真源（18 章映射）。
// v4.3.36 反馈①重排早段（用户定稿）：第 1 章 遗物 + 裂隙、第 2 章 异兽、第 3 章 宗教 + 政策；
//   集市不再登记在第 2 章，改第 7 章开张；ES 在第 4 章作为新资源登记（不新增门禁 id）。
// v2.4.0 反馈②（用户定稿）：①「一章最多两个内容」——本表除 base:true 的开局基础设施外，
//   每章至多登记两条（tests/v420 的 E0 强制）；②星图后移到第 4 章，探采的高级内容
//   （深渊商店 + 后三档载具）随星图放开；③相位共鸣从第 10 章提前到第 5 章，与岔路口同章。
// 每条 { chapter, id, name, announce, base? }；id 与 core/chapterGates.js 的门禁 id 对齐
//   （无门禁的章节用叙事锚点 id）。base:true = 开局基础设施，不占「两个内容」的名额。
// 用途：① 章节推进时发解锁日志；② 测试断言注册表覆盖与唯一性；③ wiki 解锁手册从 chUnlockNames 派生。
// 设计原则（docs/方案-章节模块绑定-v4.2.md）：入口早开、章节给实质；老玩家 S.chapter 已过即全放行。
export const CHAPTER_UNLOCKS = Object.freeze([
  // 第 1 章：基础循环 + 「深渊」这条长线的两个入口（裂隙首现于 8 线程 + 10 分钟）
  { chapter: 1,  id: 'workbench', name: '工作台 / 线程 / 商店', announce: '工作台、线程与商店已就位', base: true },
  { chapter: 1,  id: 'rift',      name: '深渊裂隙 / 探采平台', announce: '深渊裂隙睁开，探采平台可以买载具换 DM 了' },
  { chapter: 1,  id: 'relics',    name: '深渊遗物',            announce: '深渊遗物苏醒，DM 有了长线去处' },
  // 第 2 章：异兽线（饵料仓库 = PT 入口；锚点仍是 PT 本人，不做章节硬门禁）
  { chapter: 2,  id: 'pets',      name: '异兽 / 饵料仓库（PT）', announce: '饵料仓库出现，异兽与 PT 线开启' },
  // 第 3 章：信仰 + 立法合流（星图已后移到第 4 章，本章只留两项）
  { chapter: 3,  id: 'religion',  name: '宗教',                announce: '信仰苏醒——宗教面板可唤醒信仰' },
  { chapter: 3,  id: 'policy',    name: '周期政策',            announce: '周期政策开放——集结分身，自主立法' },
  // 第 4 章：星图（含探采高级：深渊商店 + 后三档载具）+ 首次晋升留下的跨局货币 ES
  { chapter: 4,  id: 'starchart', name: '星图 / 探采高级',      announce: '星图接入：远征队可以出发，深渊商店与高级载具解锁' },
  { chapter: 4,  id: 'es',        name: '永恒碎片（ES）',      announce: '永恒碎片沉淀——晋升开始留下跨局货币' },
  // 第 5 章：分支岔路 + 相位共鸣（共鸣前置只是项目/晋升，压到 10 章纯属排期浪费）
  { chapter: 5,  id: 'crossroad', name: '岔路口',              announce: '命运的岔路口出现——深渊已在低语中显形' },
  { chapter: 5,  id: 'resonance', name: '相位共鸣',            announce: '相位共鸣接入编排卡——另一个你开始共振' },
  { chapter: 6,  id: 'transcend', name: '超验 / 隐密圣学',     announce: '赞颂与超验开启，神格之路铺开' },
  // v2.5.0：永恒矩阵提前到第 6 章与超验同章——「飞升」不再是一个空章，ES 有了当期的去处
  { chapter: 6,  id: 'eternals',  name: '永恒矩阵',            announce: '永恒矩阵浮现，ES 可换成永久强化' },
  // 第 7 章：集市从「首发晋升」挪到中局——职级点已攒够，5 PP 买断不再卡死
  { chapter: 7,  id: 'bazaar',    name: '深渊集市',            announce: '深渊集市开张——富余资源可以换稀缺资源' },
  // v2.5.0：镜像协议三件套（原设计稿 13/14/15 章）提前到 7/8/9 章，一个 tab 逐章放开
  { chapter: 7,  id: 'mirror',        name: '镜像协议 / 镜像契约', announce: '另一条时间线的你发来通讯——可以签下第一份契约' },
  { chapter: 8,  id: 'mirrorwar',     name: '算力战争',           announce: '镜像开始截取你的算力——战功可换永久军备' },
  { chapter: 9,  id: 'mirrorcouncil', name: '三方议会',           announce: '三个你坐到同一张桌子前，开始分算力' },
  { chapter: 11, id: 'delve',     name: '深潜',                announce: '深潜开放，向虚空下潜' },
  { chapter: 12, id: 'expedition', name: '深空殖民',           announce: '深空殖民开启，可以在星系里写下自己的服务器' },
  // v2.5.0：第 9 章被镜像第三块（三方议会）占用；第 10 章（镜像）成为纯积累章，
  //   相位共鸣已提前到第 5 章，镜像契约/算力战争分别落在第 7/8 章。
  // 13~17 章（造物工坊/全知之眼）属设计稿 P3 新玩法，尚未实装——遵守「无死数据」红线，
  //   不在注册表登记、不发虚假公告；实装时补登记即可。
  { chapter: 18, id: 'finale',    name: '终局叙事',            announce: '终章——你成为了自己的服务器' },
]);

/** 一章最多登记的新模块数（base:true 的开局基础设施不计）——测试与设计稿共用。 */
export const UNLOCKS_PER_CHAPTER_MAX = 2;

/** 某章刚推进时该发的解锁项（一次一章，返回 0~n 条；frameSystems 按章去重成一句日志）。 */
export function unlocksAtChapter(n) {
  return CHAPTER_UNLOCKS.filter(x => x.chapter === n);
}

/** ≤n 章的全部解锁 id（老玩家判定 / 测试用）。 */
export function allUnlockedUpTo(n) {
  return CHAPTER_UNLOCKS.filter(x => x.chapter <= n).map(x => x.id);
}
