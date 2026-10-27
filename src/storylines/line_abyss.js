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
      ],
    },
    events: {
      append: [
        { id: 'tentacle_click', name: '触须点击', type: 'buff', buffMult: 1, dur: 60, desc: '接下来 60 秒内，每 5 秒自动"点击"一次工作台', weight: 1 },
        { id: 'whisper_buff', name: '低语增益', type: 'buff', buffMult: 2, dur: 120, desc: '随机一项产出 +100% 持续 120 秒', weight: 1 },
        { id: 'deep_dream', name: '深梦', type: 'buff', buffMult: 5, dur: 10, desc: '暂停 10 秒，恢复后获得 10 秒产出 ×5', weight: 0.8 },
        { id: 'void_gift', name: '虚空赠礼', type: 'dm', amount: 2, desc: 'DM +1~3', weight: 0.5 },
        { id: 'parasite', name: '寄生', type: 'buff', buffMult: 1.5, dur: 60, desc: '线程消耗 +30% 持续 60 秒，但产出 +50%', weight: 1 },
        { id: 'true_name', name: '真名', type: 'buff', buffMult: 2, dur: 1800, desc: '屏幕中央显示玩家存档 KEY 的前 4 位，5 秒后消失，获得 30 分钟 ×2 产出', weight: 0.1 },
      ],
    },
    buildings: {
      append: [
        { id: 'whisper_phonograph', name: '低语留声机', levels: 3, base: 1e6, growth: 8, desc: ['负面事件持续时间 -20%', '负面事件持续时间 -40%', '负面事件持续时间 -60%；30% 负面事件转化为正面'] },
      ],
    },
    pets: {
      append: [
        { id: 'little_chaos', name: '小混沌', icon: '🌀', desc: '不断变色的漩涡，每 2 秒变一次。鼠标悬停显示随机低语文本', flavor: '线B 专属：首次腐化达到 50% 时自动获得' },
      ],
    },
  },
  rules: {
    'seal_dm_bonus': (base, ctx) => base * 1.5,
    'corruption_cap': (base, ctx) => 150,
    'symbiosis_active': (base, ctx) => (ctx.S.corruption || 0) > 50,
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
