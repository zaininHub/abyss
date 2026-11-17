// v4.2.0：章节解锁注册表——「一章一个新模块」的单一真源（18 章映射）。
// 每条 { chapter, id, name, announce }；id 与 core/chapterGates.js 的门禁 id 对齐（无门禁章节用叙事锚点 id）。
// 用途：① 章节推进时发「🔓 新模块」公告；② 测试断言每章有解锁项；③ wiki 解锁手册可从此派生。
// 设计原则（docs/方案-章节模块绑定-v4.2.md）：入口早开、章节给实质；老玩家 S.chapter 已过即全放行。
export const CHAPTER_UNLOCKS = Object.freeze([
  { chapter: 1,  id: 'workbench',   name: '工作台 / 线程 / 商店', announce: '工作台、线程与商店已就位' },
  { chapter: 2,  id: 'granary',     name: '饵料仓库（PT）',        announce: '饵料仓库出现，异兽饼干线开启' },
  { chapter: 3,  id: 'starchart',   name: '星图',                  announce: '星图接入，远征队可以出发了' },
  { chapter: 4,  id: 'religion',    name: '宗教',                  announce: '信仰苏醒——宗教面板可唤醒信仰' },
  { chapter: 5,  id: 'crossroad',   name: '岔路口 / 裂隙 / 探采',  announce: '命运的岔路口与深渊裂隙出现' },
  { chapter: 6,  id: 'transcend',   name: '超验 / 隐密圣学',       announce: '赞颂与超验开启，神格之路铺开' },
  { chapter: 7,  id: 'policy',      name: '周期政策',              announce: '周期政策开放——集结分身，自主立法' },
  { chapter: 8,  id: 'eternals',    name: '永恒矩阵',              announce: '永恒矩阵浮现，ES 可换成永久强化' },
  { chapter: 9,  id: 'relics',      name: '深渊遗物',              announce: '深渊遗物苏醒，DM 有了长线去处' },
  { chapter: 10, id: 'resonance',   name: '相位共鸣',              announce: '相位共鸣接入编排卡——另一个你开始共振' },
  { chapter: 11, id: 'delve',       name: '深潜',                  announce: '深潜开放，向虚空下潜' },
  { chapter: 12, id: 'expedition',  name: '深空殖民',              announce: '深空殖民开启，可以在星系里写下自己的服务器' },
  // 13~17 章（镜像契约/算力战争/三方议会/造物工坊/全知之眼）属设计稿 P2/P3 新玩法，
  //   尚未实装——遵守「无死数据」红线，不在注册表登记、不发虚假公告；实装时补登记即可。
  { chapter: 18, id: 'finale',      name: '终局叙事',              announce: '终章——你成为了自己的服务器' },
]);

/** 某章刚推进时该发的解锁公告（一次一章，返回 0~1 条）。 */
export function unlocksAtChapter(n) {
  return CHAPTER_UNLOCKS.filter(x => x.chapter === n);
}

/** ≤n 章的全部解锁 id（老玩家判定 / 测试用）。 */
export function allUnlockedUpTo(n) {
  return CHAPTER_UNLOCKS.filter(x => x.chapter <= n).map(x => x.id);
}
