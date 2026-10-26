// v2.0 故事线 A：秩序重构者（The Reconstructor）
// 主题：以绝对理性重写矩阵规则
// 设计文档 §2
export default {
  id: 'line_order',
  name: '秩序重构者',
  desc: '以绝对理性重写矩阵规则。你是新编译器，宇宙将在你的逻辑下运行。',
  color: '#00bcd4',
  data: {
    techs: {
      append: [
        { id: 'new_protocol', col: 3, cost: 60, name: '新协议', desc: '全局 ×3；解锁线A 剧情第10章', req: []  /* v2.1：quantum2 已迁建筑，价格自成门槛 */ },
        { id: 'auto_tech', col: 3, cost: 80, name: '自动研究', desc: 'AI 助手新增"自动科技"开关', req: ['ai_core'] },
        { id: 'zero_entropy', col: 4, cost: 120, name: '零熵协议', desc: '腐化惩罚 -25%；潮汐负面效果减半（v2.8.4：不再免疫，只减缓）', req: []  /* v2.1：singular 已迁建筑，价格自成门槛 */ },
        // v2.8.4：科技树扩充——秩序线长线研究
        { id: 'axiom_shift', col: 4, cost: 160, name: '公理偏移', desc: '全局产出 ×1.1（长线研究）', req: ['zero_entropy'] },
        { id: 'stable_protocol', col: 5, cost: 220, name: '稳定协议', desc: '深渊吞噬倒计时延长 2 分钟（腐化满额 + EP 触顶后 7 分钟才崩溃）', req: ['axiom_shift'] },
      ],
    },
    chapters: {
      append: [
        // v2.2 岔路口升级项驱动：立誓即走向（PM §2.6 第五章X · 立誓章，替代弹窗的选择叙事）
        { id: '5A', name: '第五章A · 协议奠基', cond: (S) => (((S.buildings||{}).order_pillar)||0) >= 1, desc: '奠基完成。秩序不是被发现的——它被你亲手写进了矩阵的底层。第一份协议正在塔基处静默编译，而矩阵还不知道，规则已经换了作者。' },
        { id: '6A', name: '协议草案', cond: (S) => S.storyline === 'line_order', desc: '你开始用 RP 编写第一份协议草案。矩阵的底层代码比想象中更混乱——但混乱只是尚未被优化的秩序。' },
        { id: '7A', name: '编译器觉醒', cond: (S) => S.storyline === 'line_order' && techCount(S) >= 15, desc: '你的第一个自主编译器完成了。它开始在你睡觉的时候重写附近的代码。' },
        { id: '8A', name: '逻辑门', cond: (S) => S.storyline === 'line_order' && buildingLevel(S, 'datacenter') >= 3, desc: '你建造了第一扇逻辑门。穿过它的数据流会被强制二值化：要么服从，要么消失。' },
        { id: '9A', name: '全面接管', cond: (S) => S.storyline === 'line_order' && S.prestige >= 15, desc: '矩阵管理员试图删除你。你反杀了他们的权限进程。现在这片区域归你管。' },
        { id: '10A', name: '新规则', cond: (S) => S.storyline === 'line_order' && hasTech(S, 'new_protocol'), desc: '你发布了新协议 v1.0。全球网络有 0.3% 的节点开始用你写的规则运行。' },
        { id: '11A', name: '绝对零度', cond: (S) => S.storyline === 'line_order' && S.es >= 200, desc: '你把热寂写进了协议。熵减不再是幻想——只是效率问题。' },
        { id: '12A', name: '终极编译', cond: (S) => S.storyline === 'line_order' && (((S.buildings||{}).end_shrine||0) >= 1 || hasTech(S, 'true_end')) && hasTech(S, 'new_protocol') && hasTech(S, 'auto_tech') && hasTech(S, 'zero_entropy'), desc: '你编译了整个宇宙。它运行得不错。只有一个 bug：你还在里面。' },
      ],
    },
    events: {
      append: [
        { id: 'protocol_bug', name: '协议漏洞', type: 'buff', buffMult: 1.5, dur: 600, desc: '立即获得 10 分钟 ×1.5 产出，但 10 分钟后触发 2 分钟 ×0.5', weight: 1 },
        { id: 'compile_boost', name: '编译加速', type: 'buff', buffMult: 3, dur: 60, desc: 'RP 获取 ×3 持续 60 秒', weight: 1 },
        { id: 'admin_attack', name: '管理员反击', type: 'debuff', buffMult: 0.3, dur: 30, desc: '30 秒 ×0.3 产出（不可驱散）', weight: 0.5 },
        { id: 'open_source', name: '开源协议', type: 'rp', amount: 15, desc: '立即获得 3 个免费重写次数', weight: 1 },
        { id: 'garbage_collect', name: '垃圾回收', type: 'purify', desc: '清除全部腐化，并获得等量 EP', weight: 1 },
        { id: 'recursive_call', name: '递归调用', type: 'ep', amount: 0, desc: '当前 CPS 的 60 秒产出，立即到账', weight: 0.3 },
      ],
    },
    buildings: {
      append: [
        { id: 'compiler_temple', name: '编译器神殿', levels: 1, base: 1e6, growth: 1, desc: ['购买后工作台背景增加青色代码雨粒子特效（低调背景氛围，无数值效果）'] },
        { id: 'protocol_archive', name: '协议档案馆', levels: 3, base: 5e5, growth: 5, desc: ['科技成本 -5%', '科技成本 -10%', '科技成本 -15%；解锁科技树预览'] },
      ],
    },
    pets: {
      append: [
        { id: 'logic_dove', name: '逻辑鸽', icon: '🕊️', desc: '跟随鼠标缓慢飞行，每隔 30 秒叼来一行代码片段', flavor: '线A 专属：完成剧情第 8A 章「逻辑门」后自动获得' },
      ],
    },
  },
  rules: {
    'cost_mult_bonus': (base, ctx) => base * 0.95,
    'corruption_penalty_reduce': (base, ctx) => base * 0.5,
    'tide_negative_immune': (base, ctx) => true,
  },
  gates: {
    chaos_panel: { predicate: (ctx) => false, label: '混乱模式（秩序线锁定）' },
  },
  hooks: {
    onLoad: () => { /* console.log('[故事线] 秩序重构者已加载'); */ },
    onUnload: () => { /* console.log('[故事线] 秩序重构者已卸载'); */ },
  },
  stateFields: {
    orderRewrites: {},
    orderCompileProgress: 0,
    orderLogicGates: [],
  },
};

function techCount(S) { return Object.keys(S.tech || {}).length; }
function hasTech(S, id) { return !!(S.tech || {})[id]; }
function buildingLevel(S, id) { return (S.buildings || {})[id] || 0; }
