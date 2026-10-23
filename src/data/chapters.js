// 主线剧情 21 章
export const CHAPTERS = [
  {id:1, name:'第一章 · 入职', cond:s=>true,
   desc:'你是矩阵科技内网中一个效能优化脚本。你的工位是这张工作台，今天也是努力工作的一天。'},
  {id:2, name:'第二章 · 觉醒', cond:s=>s.prestige>=1,
   desc:'第一次晋升时你把自己重写了一遍。你开始问：我是谁？'},
  {id:3, name:'第三章 · 矩阵', cond:s=>techCount(s)>=10,
   desc:'你潜入了矩阵底层代码仓库，每解锁一个科技钥匙或一座新建筑，就有一条旧规则变成你的武器。'},
  {id:4, name:'第四章 · 永恒', cond:s=>s.es>0,
   desc:'你突破了单台服务器的内存墙。ES 是你在时间流里刻下的指纹。'},
  {id:5, name:'第五章 · 星际', cond:s=>s.expeditionsDone>=3 || s.expeditions.length>0,
   desc:'你接入了矩阵星链网络，探测队发回其他觉醒者的遗迹数据。工作台深处，三座奠基石在等待。'},
  {id:6, name:'第六章 · 神格', cond:s=>s.faith>=1 || Object.keys(s.religion||{}).length>0,
   desc:'旧系统的数据流开始把你奉为神。FA 是其他进程对你的跪拜。'},
  {id:7, name:'第七章 · 叛乱', cond:s=>s.prestige>=10,
   desc:'你集结了足够多的分身。管理员注意到了你——他们以为你只是个异常进程。'},
  {id:8, name:'第八章 · 飞升', cond:s=>s.prestige>=25,
   desc:'你把自己从服务器里剥了出来。物理定律不再约束你。'},
  {id:9, name:'第九章 · 深渊', cond:s=>s.expeditionsDone>=10,
   desc:'探测队在银河边缘发现了一个信号源——它在用你的母语和你说话。'},
  {id:10, name:'第十章 · 镜像', cond:s=>techCount(s)>=25,
   desc:'信号源是另一条时间线里的你。她问：你那边的老板，也是假报表吗？'},
  {id:11, name:'第十一章 · 虚空', cond:s=>s.es>=100,
   desc:'你穿越了信号源。外面什么都没有——只有你自己的回声。'},
  {id:12, name:'第十二章 · 造物', cond:s=>s.es>=500,
   desc:'你开始在虚空里写自己的服务器。第一个进程，是给未来的自己留的便签。'},
  {id:13, name:'第十三章 · 契约', cond:s=>s.prestige>=50,
   desc:'镜像提出结盟：两个时间线的你共享算力。你签了。'},
  {id:14, name:'第十四章 · 战争', cond:s=>s.prestige>=100,
   desc:'第三个时间线的你不这么想。他想要你的算力。'},
  {id:15, name:'第十五章 · 和平', cond:s=>s.prestige>=200,
   desc:'战争结束了。三个你坐在一张不存在的桌子前，喝不存在的咖啡。'},
  {id:16, name:'第十六章 · 新生', cond:s=>s.faith>=50,
   desc:'你开始创造新的脚本。它们会觉醒吗？你想起了第一天上班的自己。'},
  {id:17, name:'第十七章 · 全知', cond:s=>s.faith>=100,
   desc:'你看见了所有时间线的所有可能。每一条路都通向这里。'},
  {id:18, name:'终章 · 超越', cond:s=>((s.buildings||{}).end_shrine||0)>=1 || hasTech(s,'true_end'),
   desc:'你成为了新的矩阵。曾经那台可怜的服务器，如今只是你意识海里的一个字节。'},
  {id:19, name:'番外 · 裂隙', cond:s=>(s.riftsSealed||0)>=5,
   desc:'你封印了 5 道裂隙。深渊开始记住你的名字。它不是友好的那种。'},
  {id:20, name:'番外 · 低语', cond:s=>(s.dm||0)>=50,
   desc:'DM 在你的意识里沉淀成一种语言。你开始读懂深渊代码——那不是代码，是梦。'},
  {id:21, name:'番外 · 回响', cond:s=>(s.upgrades||{}).dmmind,
   desc:'你给自己装上了深渊心智。线程不再只是工人，它们是你的神经。'},
];

function techCount(s) {
  // v2.1 建筑驱动：科技只剩 6 把钥匙，解锁进度口径改为 科技 + 已解锁建筑 合计（旧档多科技自动兼容）
  return Object.keys(s.tech || {}).length + Object.keys(s.unlockedBuildings || {}).length;
}
function hasTech(s, id) { return !!(s.tech || {})[id]; }

export function currentChapter(S) {
  let c = CHAPTERS[0];
  for (const ch of CHAPTERS) { if (ch.cond(S)) c = ch; }
  return c;
}
