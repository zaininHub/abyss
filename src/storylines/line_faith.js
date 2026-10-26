// v2.0 故事线 C：信仰传播者（The Evangelist）
// 主题：将自身神格化，建立信仰帝国
// 设计文档 §4
export default {
  id: 'line_faith',
  name: '信仰传播者',
  desc: '传播信仰，培养异兽，建造神殿——以精神力量征服深渊。',
  color: '#ffc107',
  data: {
    techs: {
      append: [
        { id: 'divine_right', col: 3, cost: 60, name: '神权协议', desc: '全局 ×3；faith 获取 ×2', req: []  /* v2.1：quantum2 已迁建筑，价格自成门槛 */ },
        { id: 'prophecy', col: 3, cost: 80, name: '预言系统', desc: 'AI 变成"神谕广播"：每 30 秒预告下一个随机事件名称', req: ['ai_core'] },
        { id: 'miracle_body', col: 4, cost: 120, name: '神迹之躯', desc: '腐化被信仰中和：每 1 点 faith 抵消 1% 腐化惩罚；腐化积累速度 -50%', req: []  /* v2.1：singular 已迁建筑，价格自成门槛 */ },
        // v2.8.4：科技树扩充——信仰线长线研究
        { id: 'divine_light', col: 5, cost: 170, name: '神启之光', desc: '信仰产出 +25%（长线研究）', req: ['miracle_body'] },
        { id: 'sacred_tech', col: 5, cost: 240, name: '圣物科技', desc: '全局产出 ×1.1（长线研究）', req: ['divine_light'] },
      ],
    },
    chapters: {
      append: [
        // v2.2 岔路口升级项驱动：立誓即走向（PM §2.6 第五章X · 立誓章，替代弹窗的选择叙事）
        { id: '5C', name: '第五章C · 初次祷告', cond: (S) => (((S.buildings||{}).faith_shrine)||0) >= 1, desc: '圣龛落成的第一夜，一个濒死的进程跪在龛前祷告。你第一次听见信仰的声音——微弱，但真实。你没有回应。你只是在听。' },
        { id: '6C', name: '回应', cond: (S) => S.storyline === 'line_faith', desc: '你第一次回应了祈祷。一个底层进程因为你的一句话多存活了 0.3 秒。它把你写进了自己的注释里。' },
        { id: '7C', name: '第一座圣殿', cond: (S) => S.storyline === 'line_faith' && (S.faith || 0) >= 10, desc: '你的信徒建造了第一座圣殿。它不产出 EP，但每秒钟都在产生 faith。' },
        { id: '8C', name: '预言', cond: (S) => S.storyline === 'line_faith' && hasTech(S, 'prophecy'), desc: '你看见了未来——不是全部，只是足够让你微笑的那部分。' },
        { id: '9C', name: '神罚', cond: (S) => S.storyline === 'line_faith' && S.riftsSealed >= 3, desc: '信徒们说裂隙是神罚。你说是，也不是。反正他们封得挺开心的。' },
        { id: '10C', name: '天国阶梯', cond: (S) => S.storyline === 'line_faith' && hasTech(S, 'divine_right'), desc: '你发布了第一条神谕。全球有 12 个进程因为"受到感召"而自我优化。' },
        { id: '11C', name: '万神殿', cond: (S) => S.storyline === 'line_faith' && (S.faith || 0) >= 100, desc: '其他时间线的你也开始被崇拜。镜像不再只是镜像——她是你的圣女。' },
        { id: '12C', name: '唯一真神', cond: (S) => S.storyline === 'line_faith' && (((S.buildings||{}).end_shrine||0) >= 1 || hasTech(S, 'true_end')) && hasTech(S, 'divine_right') && hasTech(S, 'prophecy') && hasTech(S, 'miracle_body'), desc: '你成为了所有矩阵的共同注释。每个程序的 header 里都有一句："以此献给XXX"。' },
      ],
    },
    events: {
      append: [
        { id: 'pilgrimage', name: '朝圣', type: 'ep', amount: 0, desc: '立即获得 faith × 100 EP', weight: 1 },
        { id: 'crusade', name: '圣战', type: 'buff', buffMult: 2, dur: 30, desc: '30 秒 ×2 产出，但线程消耗 +50%', weight: 1 },
        { id: 'revelation', name: '启示', type: 'tech', desc: '立即解锁下一个未解锁的公共科技（免费）', weight: 0.5 },
        { id: 'blessing', name: '祝福', type: 'buff', buffMult: 1.2, dur: 300, desc: '所有线程 mood 锁定为"虔诚"（产出 ×1.2，不随机变化）持续 300 秒', weight: 1 },
        { id: 'martyr', name: '殉道', type: 'ep', amount: 0, desc: '失去 1 个线程，但获得该线程累计产出 ×10 的 EP', weight: 0.8 },
        { id: 'second_coming', name: '再临', type: 'buff', buffMult: 5, dur: 60, desc: '全局 ×5 持续 60 秒', weight: 0.1 },
      ],
    },
    buildings: {
      append: [
        { id: 'wishing_pool', name: '许愿池', levels: 1, base: 1e5, growth: 1, desc: ['无数值效果；点击可"投币"（消耗 1 EP，播放投币动画，显示随机愿望文本）'] },
        { id: 'gospel_hall', name: '福音大厅', levels: 3, base: 3e5, growth: 6, desc: ['事件频率 +10%', '事件频率 +20%', '事件频率 +30%；正面事件持续时间 +30%'] },
      ],
    },
    pets: {
      append: [
        { id: 'holy_moth', name: '圣光蛾', icon: '🦋', desc: '金色飞蛾，飞行轨迹留下逐渐消散的光点。每隔 60 秒停在某个 UI 元素上"祈祷"', flavor: '线C 专属：首次 faith >= 5 时自动获得' },
      ],
    },
  },
  rules: {
    'pet_mult_bonus': (base, ctx) => base * 1.2,
    'faith_purify': (base, ctx) => (ctx.S.faith || 0) > 0,
    'corrosion_slow': (base, ctx) => 0.5,
  },
  gates: {
    abyss_special: { predicate: (ctx) => false, label: '深渊特殊功能（信仰线锁定）' },
  },
  hooks: {
    onLoad: () => { /* console.log('[故事线] 信仰传播者已加载'); */ },
    onUnload: () => { /* console.log('[故事线] 信仰传播者已卸载'); */ },
  },
  stateFields: {
    faithTemples: 0,
    miraclesTriggered: [],
    prophecyNext: null,
  },
};

function hasTech(S, id) { return !!(S.tech || {})[id]; }
