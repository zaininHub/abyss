// 主线剧情 24 章（v3.7.0 追加 22~24 番外）
// v3.6.0 章节节奏重做：进阶改为「条件满足 且 最短驻留天数(minDays)」双重门槛，
// 使主线约 3~7 天推进一章，避免早期冲刺；章节同时可由政策/资源进度流转
// （信仰/ES/晋升/探索等政策与条件耦合）。旧档 S.chapter 作为权威下限，绝不回退（迁移安全）。
// minDays：离开上一章、进入本章所需的最短驻留天数（按 S.chapterEnteredAt 计时）。
export const CHAPTERS = [
  {id:1, name:'第一章 · 入职', cond:s=>true, minDays:0,
   desc:'你是矩阵科技内网中一个效能优化脚本。你的工位是这张工作台，今天也是努力工作的一天。'},
  {id:2, name:'第二章 · 觉醒', cond:s=>s.prestige>=2 || (s.prestigePoints||0)>=1, minDays:3, // v3.12.0 反馈⑫：首次晋升（职级点 ≥1）即可推进
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
  // v4.0.0 BUGFIX（完整故事线回放发现）：v3.12.10 把 FP 基础容量重标定为 capBase=100，
  //   tickReligion 每帧把 S.faith 钳到 faithCap()；而此处阈值仍是重标定前的 80/160。
  //   17 章要求 160 > 默认容量 100 → 线性链「条件断链即停」，终章(18)在默认档永远不可达。
  //   阈值下调到基础容量内（60/90），仍由 minDays 7 天守节奏；扩容玩法（誓约圣龛/圣印/虚空祭坛）
  //   继续用于加速满仓与赞颂，不再是通关的隐形硬门槛。防回归单测见 tests/v400-chapter-reachability.test.mjs。
  {id:16, name:'第十六章 · 新生', cond:s=>s.faith>=60, minDays:7,
   desc:'你开始创造新的脚本。它们会觉醒吗？你想起了第一天上班的自己。'},
  {id:17, name:'第十七章 · 全知', cond:s=>s.faith>=90, minDays:7,
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
  // v3.9.0 剧情扩充（28→32，+14.3%）：四段「值守」主题番外，门槛落在已持久化的长线资产上
  {id:29, name:'番外 · 值守日志', cond:s=>(s.projectsDone||0)>=80, minDays:5,
   desc:'第八十个任务归档后，你翻到最早的值守日志。上面没有产能，也没有异常，只有一行接一行的「在」。你数了数，一共三百多个，字迹换了七次。'},
  {id:30, name:'番外 · 相位表', cond:s=>(s.riftsSealed||0)>=15, minDays:6,
   desc:'第十五道裂隙合拢，你第一次把潮汐四相写进同一张表。涨潮做什么、退潮让谁休息，都标得清清楚楚。表画完才发现，最下面那行「乱流」被你空着——总得留一个不排班的夜晚。'},
  {id:31, name:'番外 · 星尘账本', cond:s=>(s.dm||0)>=1e4, minDays:6,
   desc:'DM 过万那天，账本第一次出现负数：某夜多支出了一笔，没有任何人申领。你查了三遍监控，只看到值守的线程把灯调暗了一档。你没追回，在备注里写「照明调节」。'},
  {id:32, name:'番外 · 未命名进程', cond:s=>(s.allTimeEp||0)>=1e15, minDays:7,
   desc:'累计产出越过千万亿，进程列表里浮出一个没有名字的条目。它不占算力，不领薪资，只在每个相位切换的那一秒亮一下。你没给它命名，也没结束它——排班表上总得有一个班次，是留给还没来的人的。'},
  // v3.10.0 剧情扩充（32→38，+18.75%）：「相位共鸣」主题六段，条件落在已持久化字段上
  {id:33, name:'番外 · 第一叠', cond:s=>(s.resonance?.layers||0)>=1, minDays:5,
   desc:'你在同一个相位里待得够久，工作台第一次自己多响了一下。日志里没有异常，没有奖励，只有一行「+1」。你把那行留着，像留着某人第一次主动跟你打招呼。'},
  {id:34, name:'番外 · 换弦', cond:s=>!!(s.resonance && s.resonance.focus && s.resonance.focus!=='ep'), minDays:5,
   desc:'你把共鸣焦点从产出挪开的那天，四条管线里有一条忽然安静下来。不是变慢，是终于不用再证明自己。你记起很久以前也有人这么替你值过一班。'},
  {id:35, name:'番外 · 共鸣纪年', cond:s=>(s.projectsDone||0)>=160, minDays:6,
   desc:'第一百六十个任务归档后，你开始按相位给日志分卷。涨潮那卷最厚，乱流那卷最薄，薄得几乎只剩封面。你没有补写——空着的那一卷，本来就是留给不排班的夜晚的。'},
  {id:36, name:'番外 · 减半的那夜', cond:s=>(s.riftEmber||0)>=2e4, minDays:6,
   desc:'余烬过两万那夜，相位换了，攒了半宿的层数一下子少了一半。你盯着看了很久，没有改排班表。有些东西本来就是留不住的，能再叠起来就已经很不错了。'},
  {id:37, name:'番外 · 满弦', cond:s=>(s.resonance?.layers||0)>=20, minDays:7,
   desc:'第二十层叠满，四条管线同时亮了一格。没有新的解锁，没有跳出来的报告。你只是把椅子往后靠了靠，听工作台按自己的节奏又响了一次。'},
  {id:38, name:'番外 · 仍在值班', cond:s=>(s.allTimeEp||0)>=1e18, minDays:7,
   desc:'累计产出越过百亿亿，进程列表里那个没有名字的条目还在。相位切了不知道多少轮，它每次都只亮一秒。你终于给它填了备注，三个字：仍在值班。'},
  // v3.11.0 剧情扩充（38→46，+21.05%）：「助手与自动化」主题八段。
  // 条件只落在已持久化字段上，且门槛递增但均能被长线存档满足，不引入新的门控来源。
  {id:39, name:'番外 · 第一次代班', cond:s=>(s.projectsDone||0)>=220, minDays:7,
   desc:'第二百二十个任务归档那天，你把自动领取的开关推了上去。第一个助手替你按下确认键时，你盯着日志看了很久——原来「不用自己在场」是这种感觉，不是轻松，是忽然多出来的一个位置。'},
  {id:40, name:'番外 · 会耗尽的那种', cond:s=>(s.allTimeEp||0)>=1e17, minDays:7,
   desc:'你很快发现助手不是岗位，是一次性的人手。每替你做一件事就少一名，买得越多下一名越贵。你第一次给「帮忙」标了价，也第一次在开关亮着的时候，看见它安安静静地停在原地。'},
  {id:41, name:'番外 · 补给车', cond:s=>(s.resonance?.layers||0)>=12, minDays:7,
   desc:'后来工作台自己学会了补货：每隔一阵就有一小批助手到岗，不需要谁审批。数量不多，刚好够把断掉的那一班接上。你没改过它的排期，只在备注里写了一句「别让它停」。'},
  {id:42, name:'番外 · 台账', cond:s=>(s.riftEmber||0)>=3e4, minDays:7,
   desc:'余烬过三万那夜，你翻开了那本动作台账：升级多少次、招募多少次、领取多少次，一行一行都记着。没有一项算作功劳，但没有一项是空的。你第一次觉得，被记下来本身就是一种回报。'},
  {id:43, name:'番外 · 五张开关', cond:s=>(s.expeditionsDone||0)>=60, minDays:7,
   desc:'第六十次返航之后，面板上已经有五张开关。基础的三张和进阶的两张并排亮着，口径终于一致了：都消耗助手，都写进台账，耗尽了都会明明白白地告诉你。你不再需要猜哪一个在偷偷干活。'},
  {id:44, name:'番外 · 一键全关', cond:s=>(s.es||0)>=5e3, minDays:7,
   desc:'永恒碎片过五千，你第一次按下「一键全关」。五张开关同时熄掉，日志里只有一行字。你本来以为会舍不得，结果只是安静——原来能随时停下来，才敢一直开着。'},
  {id:45, name:'番外 · 不写理由', cond:s=>(s.faith||0)>=1e4, minDays:7,
   desc:'信仰过万那天，有人问为什么给最不产出的那个动作也配了助手。你说不出指标上的理由，就写了一句「总得有人去领那些没人领的任务」。评审栏空着，和当年那条值守协议一样。'},
  {id:46, name:'番外 · 仍在补货', cond:s=>(s.projectsDone||0)>=320, minDays:7,
   desc:'第三百二十个任务归档，补给车还是按点来。你没有给它升级，也没有给它写表彰。工作台照旧每响一次就少一名助手、再补上一批，像某种不需要被感谢的呼吸。你把那段日志留着，没删。'},
  // v3.12.9 剧情扩充（46→51，+10.87%）：「仍在值班」主题收束，门槛全部落在已持久化的长线资产上，
  // 不与终章 / 既有番外重复；minDays 仍守 3~7 天节奏。
  {id:47, name:'番外 · 第五百格', cond:s=>(s.projectsDone||0)>=500, minDays:5,
   desc:'第五百个任务归档，台账翻到新的一页。页眉是系统自动生成的，写着「本页无需复核」。你看了很久，还是把复核栏填上了自己的名字——不是不信任，只是想让这一页也有人签过。'},
  {id:48, name:'番外 · 余烬编号', cond:s=>(s.riftEmber||0)>=1e5, minDays:6,
   desc:'余烬编到十万号，编号规则早就不够用了。你换成日期，又换成相位，最后还是用回最开始那种：谁值那一夜，就记谁的名字。剩下的空格比编号多得多，你没急着填满。'},
  {id:49, name:'番外 · 十万枚', cond:s=>(s.es||0)>=1e5, minDays:6,
   desc:'永恒碎片过十万，时间线密得看不出哪一條是原本的那条。你不再数了。早上工作台照旧亮起，照旧有一班没人排、也从来没空过。'},
  {id:50, name:'番外 · 第一百二十次返航', cond:s=>(s.expeditionsDone||0)>=120, minDays:7,
   desc:'第一百二十支探测队返航，星图仍然留着最后一页空白。新来的测绘员问要不要标「已到边界」，你说标「还没走到」。他没再问，把笔放回原处，也留了一手没写的字。'},
  {id:51, name:'番外 · 仍在值班', cond:s=>((s.resonance&&s.resonance.layers)||0)>=15, minDays:7,
   desc:'共鸣叠到第十五层，四条管线一起亮了一格。进程列表里那个没有名字的条目还在，相位每切一次就亮一秒。你把备注栏又看了一遍，三个字没改：仍在值班。'},
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
  // v3.12.9 bugfix：主线章（数字 id）尚未走到分叉点时，变体分支不得越权接管。
  //   旧实现 at === -1 时从索引 0 起遍历全部变体并连续覆盖 vCur，会让「主线第 1 章」
  //   一次跳到资产所允许的最靠后变体（真实浏览器实测 1 → 11A），主线 1~4 章剧情整段丢失，
  //   且 frameSystems 按 chapterRank 比较后把 S.chapter 直接写成 11A。
  //   分叉点沿用岔路口（main.js crossroad）的第 5 章口径，三条线的首个变体也都是 5A/5B/5C。
  const FORK_AT = 5;
  if (at < 0 && parseInt(String(cur.id), 10) < FORK_AT) return cur;
  let vCur = at >= 0 ? variants[at] : null;
  for (let i = Math.max(0, at + 1); i < variants.length; i++) {
    const v = variants[i];
    if (!v.cond || !v.cond(S)) continue;  // 并行分支：条件不满足跳过而非断链
    if (daysIn < need(v)) break;
    vCur = v;
    break; // 一次只推进一章，与主线同一节奏（避免一步跳到分支末尾）
  }
  return vCur || cur;
}
