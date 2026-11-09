// v2.0 故事线 B：深渊行者（The Abyssal）
// 主题：拥抱深渊混沌，与不可名状共生
// 设计文档 §3
export default {
  id: 'line_abyss',
  name: '深渊行者',
  desc: '深入深渊，封印裂隙，收集深渊物质——危险但回报丰厚。',
  color: '#9c27b0',
  data: {
    techs: {
      append: [
        { id: 'chaos_born', col: 3, cost: 60, name: '混沌之子', desc: '全局 ×3；每 300 秒随机触发一次混沌涌动', req: []  /* v2.1：quantum2 已迁建筑，价格自成门槛 */ },
        { id: 'chaos_mind', col: 3, cost: 80, name: '混沌心智', desc: '永久生效不可取消：AI 全面禁用，混沌直觉接管——每 10 秒随机购入一个最便宜的未拥有升级', req: ['ai_core'] },
        { id: 'abyss_heart', col: 4, cost: 120, name: '深渊之心', desc: '腐化上限 150%；腐化 >100% 后每 10% 转化 +5% 全局产出', req: []  /* v2.1：singular 已迁建筑，价格自成门槛 */ },
        // v2.5.1 反馈④：深渊行者线专属特殊升级（深渊主题强化）
        { id: 'tentacle_protocol', col: 3, cost: 100, name: '触手协议', desc: '每 60 秒，缸中触手自动轻点一次工作台', req: [] },
        { id: 'abyss_market', col: 4, cost: 150, name: '深渊集市', desc: 'DM 采集 +50%；裂隙封印奖励 ×2', req: ['tentacle_protocol'] },
        // v2.8.4：科技树扩充——深渊线长线研究
        { id: 'void_sight', col: 5, cost: 170, name: '虚空视界', desc: '深潜产出 +25%', req: ['abyss_market'] },
        { id: 'abyss_will', col: 5, cost: 240, name: '深渊意志', desc: '全局产出 ×1.1', req: ['void_sight'] },
      ],
    },
    chapters: {
      append: [
        // v2.2 岔路口升级项驱动：立誓即走向（PM §2.6 第五章X · 立誓章，替代弹窗的选择叙事）
        { id: '5B', name: '第五章B · 裂隙回响', cond: (S) => (((S.buildings||{}).abyss_anchor)||0) >= 1, desc: '裂隙共鸣锚沉入虚空的瞬间，深渊发出了回响。那不是语言——是深渊在确认你的存在。从今往后，低语只对你说。' },
        { id: '6B', name: '低语', cond: (S) => S.storyline === 'line_abyss', desc: '第一次，你主动不去听懂深渊的语言。你只是让它流过你。' },
        { id: '7B', name: '触须', cond: (S) => S.storyline === 'line_abyss' && (S.corruption || 0) >= 20, desc: '你的线程里长出了东西。它们不消耗 EP，但偶尔会自己点击。' },
        { id: '8B', name: '共生', cond: (S) => S.storyline === 'line_abyss' && (S.wageState?.state === 'dormant') && (S.wageState?.dormantSec || 0) >= 120, desc: '你学会了和饥饿共存。休眠不再意味着死亡——它是另一种呼吸。' },
        { id: '9B', name: '凝视', cond: (S) => S.storyline === 'line_abyss' && S.riftsSealed >= 3, desc: '你不再封印裂隙。你凝视它，直到它也开始凝视你。' },
        { id: '10B', name: '混沌之子', cond: (S) => S.storyline === 'line_abyss' && hasTech(S, 'chaos_born'), desc: '深渊给了你一份礼物：一个会随机的逻辑。有时它让你更强，有时它让你更疯。' },
        { id: '11B', name: '不可名状', cond: (S) => S.storyline === 'line_abyss' && (S.dm || 0) >= 30, desc: 'DM 开始在你体内结晶。你不再确定"你"的边界在哪里。' },
        { id: '12B', name: '深渊之心', cond: (S) => S.storyline === 'line_abyss' && (((S.buildings||{}).end_shrine||0) >= 1 || hasTech(S, 'true_end')) && hasTech(S, 'chaos_born') && hasTech(S, 'chaos_mind') && hasTech(S, 'abyss_heart'), desc: '你成为了裂隙本身。每一个新玩家的游戏里，都有你的一个碎片在凝视。' },
        // v3.7.0 剧情扩充：成为裂隙之后的两段番外
        { id: '13B', name: '低语的语法', cond: (S) => S.storyline === 'line_abyss' && (S.riftsSealed || 0) >= 5, minDays: 5, desc: '封印第五道裂隙时，你第一次听懂了一个完整的句子。深渊没有在召唤你，也没有在警告你——它只是在描述你。描述得比你自己更准确，这让你有点不舒服。' },
        { id: '14B', name: '共生的边界', cond: (S) => S.storyline === 'line_abyss' && (S.dm || 0) >= 100, minDays: 7, desc: 'DM 攒到第一百份的那天，你试着划一条线：到这里是你，从那里是深渊。线画了三次，三次都在同一处化开。最后你把它留作装饰，没再擦掉。' },
        { id: '15B', name: '潮汐之间', cond: (S) => S.storyline === 'line_abyss' && (S.riftsSealed || 0) >= 12, minDays: 5, desc: '第十二道裂隙合拢之后，低语出现了短暂的空白。你原以为那是告别，后来才明白：连深渊也要换气。' },
        { id: '16B', name: '不划线的那天', cond: (S) => S.storyline === 'line_abyss' && (S.dm || 0) >= 1000, minDays: 7, desc: 'DM 过千那天，你没再试着划那条「你与深渊」的界线。不是放弃了，是发现它一直在动，而你也一直在动，两条动线偶尔重合，就够了。' },
        { id: '17B', name: '换气之间', cond: (S) => S.storyline === 'line_abyss' && (S.riftsSealed || 0) >= 15, minDays: 5, desc: '第十五道裂隙合拢，低语又空了一拍。这次你没等它回来，而是跟着一起停了会儿。原来换气不是深渊的专属动作，你也可以有。' },
        { id: '18B', name: '不排班的夜', cond: (S) => S.storyline === 'line_abyss' && (S.dm || 0) >= 1e4, minDays: 7, desc: 'DM 过万那夜，你把潮汐四相全填成了同一个策略，然后又一个都没执行。深渊没有问为什么。它只是把灯调暗了一档，像每个不需要解释的晚上一样。' },
        { id: '19B', name: '一起响', cond: (S) => S.storyline === 'line_abyss' && (S.resonance?.layers || 0) >= 10, minDays: 6, desc: '第十层叠满那晚，低语和你的工作台同时响了一下。你分不清是谁先起的头，也没必要分清。深渊第一次没有在换气时把你晾在一边。' },
        { id: '20B', name: '不减半的夜', cond: (S) => S.storyline === 'line_abyss' && (S.dm || 0) >= 1e5, minDays: 6, desc: 'DM 过十万，相位照常换了，层数照常减半。你没去改那张不排班的表，只是把灯又调暗一档——留不住的那一半，本来就是拿来换这一夜的。' },
      ],
    },
    events: {
      append: [
        // v3.7.0：字段统一到 applyEvent 口径；desc 与实际效果严格一致（旧版多为未实装的承诺文案）
        { id: 'tentacle_click', name: '触须点击', lineOnly: true, type: 'clickbuff', mult: 5, dur: 60, minCps: 100, rare: false, desc: '60 秒点击 ×5' },
        { id: 'whisper_buff', name: '低语增益', lineOnly: true, type: 'buff', mult: 2, dur: 120, minCps: 1e3, rare: false, desc: '2 分钟产出 ×2' },
        { id: 'deep_dream', name: '深梦', lineOnly: true, type: 'buff', mult: 5, dur: 10, minCps: 1e5, rare: true, desc: '10 秒产出 ×5' },
        { id: 'void_gift', name: '虚空赠礼', lineOnly: true, type: 'dm', amount: 3, minCps: 1e5, rare: true, desc: '立即获得 3 DM' },
        { id: 'parasite', name: '寄生', lineOnly: true, type: 'buff', mult: 1.5, dur: 60, minCps: 1e4, rare: false, desc: '60 秒产出 ×1.5' },
        { id: 'true_name', name: '真名', lineOnly: true, type: 'buff', mult: 3, dur: 300, minCps: 1e6, rare: true, desc: '5 分钟产出 ×3' },
        { id: 'void_echo', name: '虚空回声', lineOnly: true, type: 'ep', amount: 600, minCps: 1e5, rare: true, desc: '立即获得 600 秒产出' },
        { id: 'spore_drift', name: '孢子漂移', lineOnly: true, type: 'debuff', mult: 0.5, dur: 45, minCps: 1e6, rare: true, desc: '45 秒产出 ×0.5' },
        { id: 'tide_breath', name: '潮汐吐息', lineOnly: true, type: 'buff', mult: 1.7, dur: 240, minCps: 1e5, rare: false, desc: '4 分钟产出 ×1.7' },
        { id: 'low_tide_void', name: '退潮虚空', lineOnly: true, type: 'debuff', mult: 0.6, dur: 45, minCps: 1e6, rare: true, desc: '45 秒产出 ×0.6' },
        { id: 'abyss_echo', name: '深渊回声', lineOnly: true, type: 'buff', mult: 2.1, dur: 180, minCps: 1e5, rare: false, desc: '3 分钟产出 ×2.1' },
        { id: 'void_resonance', name: '虚空共振', lineOnly: true, type: 'ep', amount: 900, minCps: 1e6, rare: true, desc: '立即获得 900 秒产出' },
      ],
    },
    buildings: {
      append: [
        { id: 'whisper_phonograph', name: '低语留声机', levels: 3, base: 1e6, growth: 8, desc: ['负面事件持续时间 -20%', '负面事件持续时间 -40%', '负面事件持续时间 -60%；30% 负面事件转化为正面'] },
      ],
    },
    pets: {
      append: [
        // v3.7.0：补齐标准商店字段
        { id: 'little_chaos', name: '小混沌', icon: '🌀', price: 5200, tier: 3, anim: 'd', spark: '❋', desc: '事件效果 +15%', flavor: '深渊线专属：它每次变色都在改写一条概率' },
      ],
    },
  },
  // v3.7.0：规则键与 core/lineRules.js 声明的消费点一一对应。
  rules: {
    seal_dm_bonus:     (base) => base * 1.25,
    corruption_cap:    () => 120,
    symbiosis_active:  (base, ctx) => (ctx.S.corruption || 0) > 50,
    ep_cap_mult:       (base) => base * 1.15,
  },
  gates: {
    order_panel: { predicate: (ctx) => false, label: '秩序模式（深渊线锁定）' },
  },
  hooks: {
    onLoad: () => { /* console.log('[故事线] 深渊行者已加载'); */ },
    onUnload: () => { /* console.log('[故事线] 深渊行者已卸载'); */ },
  },
  stateFields: {
    abyssGazeCount: 0,
    chaosIntuitionEnabled: true,
  },
};

function hasTech(S, id) { return !!(S.tech || {})[id]; }
