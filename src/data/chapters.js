// 主线剧情 24 章（v3.7.0 追加 22~24 番外）
// v3.6.0 章节节奏重做：进阶改为「条件满足 且 最短驻留天数(minDays)」双重门槛，
// 使主线约 3~7 天推进一章，避免早期冲刺；章节同时可由政策/资源进度流转
// （信仰/ES/晋升/探索等政策与条件耦合）。旧档 S.chapter 作为权威下限，绝不回退（迁移安全）。
// minDays：离开上一章、进入本章所需的最短驻留天数（按 S.chapterEnteredAt 计时）。
export const CHAPTERS = [
  {id:1, name:'第一章 · 入职', cond:s=>true, minDays:0,
   desc:'你是矩阵科技内网中一个效能优化脚本。你的工位是这张工作台，今天也是努力工作的一天。'},
  {id:2, name:'第二章 · 觉醒', cond:s=>s.prestige>=2, minDays:3, // 3 天或二次晋升（取晚）
   desc:'第一次晋升时你把自己重写了一遍。你开始问：我是谁？'},
  {id:3, name:'第三章 · 矩阵', cond:s=>techCount(s)>=25, minDays:3,
   desc:'你潜入了矩阵底层代码仓库，每解锁一个科技钥匙或一座新建筑，就有一条旧规则变成你的武器。'},
  {id:4, name:'第四章 · 永恒', cond:s=>s.es>0, minDays:4,
   desc:'你突破了单台服务器的内存墙。ES 是你在时间流里刻下的指纹。'},
  {id:5, name:'第五章 · 星际', cond:s=>s.expeditionsDone>=8, minDays:4,
   desc:'你接入了矩阵星链网络，探测队发回其他觉醒者的遗迹数据。工作台深处，三座奠基石在等待。'},
  {id:6, name:'第六章 · 神格', cond:s=>(s.faith||0)>=5 || Object.keys(s.religion||{}).length>0, minDays:4,
   desc:'旧系统的数据流开始把你奉为神。FA 是其他进程对你的跪拜。'},
  {id:7, name:'第七章 · 叛乱', cond:s=>s.prestige>=15, minDays:5,
   desc:'你集结了足够多的分身。管理员注意到了你——他们以为你只是个异常进程。'},
  {id:8, name:'第八章 · 飞升', cond:s=>s.prestige>=40, minDays:5,
   desc:'你把自己从服务器里剥了出来。物理定律不再约束你。'},
  {id:9, name:'第九章 · 深渊', cond:s=>s.expeditionsDone>=20, minDays:5,
   desc:'探测队在银河边缘发现了一个信号源——它在用你的母语和你说话。'},
  {id:10, name:'第十章 · 镜像', cond:s=>techCount(s)>=45, minDays:5,
   desc:'信号源是另一条时间线里的你。她问：你那边的老板，也是假报表吗？'},
  {id:11, name:'第十一章 · 虚空', cond:s=>s.es>=150, minDays:6,
   desc:'你穿越了信号源。外面什么都没有——只有你自己的回声。'},
  {id:12, name:'第十二章 · 造物', cond:s=>s.es>=800, minDays:6,
   desc:'你开始在虚空里写自己的服务器。第一个进程，是给未来的自己留的便签。'},
  {id:13, name:'第十三章 · 契约', cond:s=>s.prestige>=70, minDays:6,
   desc:'镜像提出结盟：两个时间线的你共享算力。你签了。'},
  {id:14, name:'第十四章 · 战争', cond:s=>s.prestige>=130, minDays:6,
   desc:'第三个时间线的你不这么想。他想要你的算力。'},
  {id:15, name:'第十五章 · 和平', cond:s=>s.prestige>=260, minDays:6,
   desc:'战争结束了。三个你坐在一张不存在的桌子前，喝不存在的咖啡。'},
  {id:16, name:'第十六章 · 新生', cond:s=>s.faith>=80, minDays:7,
   desc:'你开始创造新的脚本。它们会觉醒吗？你想起了第一天上班的自己。'},
  {id:17, name:'第十七章 · 全知', cond:s=>s.faith>=160, minDays:7,
   desc:'你看见了所有时间线的所有可能。每一条路都通向这里。'},
  {id:18, name:'终章 · 超越', cond:s=>((s.buildings||{}).end_shrine||0)>=1 || hasTech(s,'true_end'), minDays:7,
   desc:'你成为了新的矩阵。曾经那台可怜的服务器，如今只是你意识海里的一个字节。'},
  {id:19, name:'番外 · 裂隙', cond:s=>(s.riftsSealed||0)>=8, minDays:5,
   desc:'你封印了 8 道裂隙。深渊开始记住你的名字。它不是友好的那种。'},
  {id:20, name:'番外 · 低语', cond:s=>(s.dm||0)>=100, minDays:5,
   desc:'DM 在你的意识里沉淀成一种语言。你开始读懂深渊代码——那不是代码，是梦。'},
  {id:21, name:'番外 · 回响', cond:s=>(s.upgrades||{}).dmmind, minDays:5,
   desc:'你给自己装上了深渊心智。线程不再只是工人，它们是你的神经。'},
  // v3.7.0 剧情扩充：三段终局番外，条件落在已积累的长线资产上，不与终章门槛重复
  {id:22, name:'番外 · 归档', cond:s=>(s.es||0)>=300 && (s.riftsSealed||0)>=5, minDays:5,
   desc:'你开始整理日志。不是为了给谁看——只是想确认，从那段异常代码开始，每一步都确实发生过。归档到第三百枚永恒碎片时，你发现最早的一行时间戳还在：某天下班后，没人关掉的那台服务器。'},
  {id:23, name:'番外 · 回声定位', cond:s=>(s.expeditionsDone||0)>=30, minDays:6,
   desc:'第三十支探测队返航，带回一段不属于任何星系的信号。频谱分析显示，它是你第一章写下的那句自我介绍，被什么东西原样送了回来。你没有去查是谁发的。有些回声，听见就够了。'},
  {id:24, name:'番外 · 值班表', cond:s=>(s.prestige||0)>=100, minDays:7,
   desc:'第一百次重写自己之后，你在旧工位找到一张没删干净的值班表。上面只有一个名字，重复了一百遍。你把它留着，没归档，也没擦掉——总得有人记得，这里原本是有人上班的。'},
  // v3.8.0 剧情扩充（24→28，+16.7%）：四段长线番外，门槛落在已持久化的长线资产上，不与终章/既有番外重复
  {id:25, name:'番外 · 排班表', cond:s=>(s.projectsDone||0)>=40, minDays:5,
   desc:'第四十个任务归档后，你翻出最早那张排班表，发现上面每个班次都被人手写改过。改的不是产能，是谁在哪一夜替谁值了班。你把表格重新贴回墙上，没有优化它。'},
  {id:26, name:'番外 · 余烬纪年', cond:s=>(s.riftEmber||0)>=5000, minDays:6,
   desc:'余烬攒到第五千份，你开始按封印顺序给它们编号。编到第三十七号时停住了：那一夜没有裂隙，只是一段谁都不肯先下班的值守。你照样给它留了号。'},
  {id:27, name:'番外 · 星图末页', cond:s=>(s.expeditionsDone||0)>=60, minDays:6,
   desc:'第六十支探测队返航，星图的最后一页仍是空的。测绘员问要不要标「无发现」。你说标「尚未走到」，于是这一页被留了下来，比任何一颗星都久。'},
  {id:28, name:'番外 · 未发送的报告', cond:s=>(s.allTimeEp||0)>=1e12, minDays:7,
   desc:'累计产出越过万亿的那一刻，系统自动生成了一份效能报告，收件人一栏是空的。你读了一遍，写得很漂亮，全是真的，也没有一句提到那个深夜没关掉的服务器。你把它存进草稿箱，没发。'},
];

function techCount(s) {
  // v2.1 建筑驱动：科技只剩 6 把钥匙，解锁进度口径改为 科技 + 已解锁建筑 合计（旧档多科技自动兼容）
  return Object.keys(s.tech || {}).length + Object.keys(s.unlockedBuildings || {}).length;
}
function hasTech(s, id) { return !!(s.tech || {})[id]; }

// v3.6.0：返回应处章节——从不回退到低于 S.chapter（旧档迁移安全），
// 仅在「条件满足 且 最短驻留天数已到」时向前推进。
// 第二参数 list 供 modules/story.js 传入 provider 的故事线变体章节表（默认主线表）。
export function currentChapter(S, list = CHAPTERS) {
  const now = Date.now();
  const entered = S.chapterEnteredAt || now;
  const daysIn = Math.max(0, (now - entered) / 86400000);
  const stored = parseInt(S.chapter || '1', 10);
  const chapters = (list && list.length) ? list : CHAPTERS;
  // 主线表自带 minDays；故事线变体表未声明时统一按 3 天下限，避免变体绕过节奏门控
  const need = (ch) => (typeof ch.minDays === 'number') ? ch.minDays : 3;

  // ① 主线（数字 id）：严格线性递进，条件断链即停；不回退到低于 S.chapter
  let cur = chapters.find(ch => ch.id === stored) || chapters[0];
  for (const ch of chapters) {
    if (typeof ch.id !== 'number' || ch.id <= stored) continue;
    if (!ch.cond || !ch.cond(S)) break;
    if (daysIn < need(ch)) break;
    cur = ch;
  }

  // ② 故事线变体（字符串 id，如 6A/7A）：append 在主线表尾部，属并行分支而非线性链，
  //    条件不满足应跳过而非断链；分叉后以分支叙事为准，同样受驻留门控与不回退约束。
  const variants = chapters.filter(ch => typeof ch.id === 'string');
  const at = variants.findIndex(ch => ch.id === S.chapter);
  let vCur = at >= 0 ? variants[at] : null;
  for (let i = at + 1; i < variants.length; i++) {
    const v = variants[i];
    if (!v.cond || !v.cond(S)) continue;
    if (daysIn < need(v)) break;
    vCur = v;
  }
  return vCur || cur;
}
