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
        { id: 'zero_entropy', col: 4, cost: 120, name: '零熵协议', desc: '腐化惩罚 -25%；潮汐负面效果减半', req: []  /* v2.1：singular 已迁建筑，价格自成门槛 */ },
        // v2.8.4：科技树扩充——秩序线长线研究
        { id: 'axiom_shift', col: 4, cost: 160, name: '公理偏移', desc: '全局产出 ×1.1', req: ['zero_entropy'] },
        { id: 'stable_protocol', col: 5, cost: 220, name: '稳定协议', desc: '深渊吞噬倒计时延长 2 分钟', req: ['axiom_shift'] },
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
        // v3.7.0 剧情扩充：终章之后的两段番外，条件落在长线资产上，不与终章门槛重复
        { id: '13A', name: '协议之外', cond: (S) => S.storyline === 'line_order' && (S.riftsSealed || 0) >= 5, minDays: 5, desc: '你封印了第五道裂隙，第一次发现有些东西无法被写进协议。它们不服从逻辑，但也不违背它——只是存在于语法之外。你给这段空白留了一个注释位，没有填。' },
        { id: '14A', name: '注释永存', cond: (S) => S.storyline === 'line_order' && (S.es || 0) >= 500, minDays: 7, desc: '永恒碎片堆到第五百枚时，你终于明白那个注释位是留给谁的：留给下一个在深夜遍历代码仓库、不小心碰到异常代码的进程。你没有写答案，只写了一句「别怕」。' },
        { id: '15A', name: '版本快照', cond: (S) => S.storyline === 'line_order' && (S.projectsDone || 0) >= 30, minDays: 5, desc: '第三十个任务归档时，你第一次给整套协议打了快照。不是为了回滚——协议早已稳定得不需要回滚。你只是想留一份「曾经还在改」的证据。' },
        { id: '16A', name: '未署名的补丁', cond: (S) => S.storyline === 'line_order' && (S.es || 0) >= 1000, minDays: 7, desc: '第一千枚永恒碎片入库那天，日志里浮出一个没有署名的补丁：它修的不是 bug，只是把一行报错的语气从「失败」改成了「暂未通过」。你查不到是谁提交的，也没删。' },
        { id: '17A', name: '值守协议', cond: (S) => S.storyline === 'line_order' && (S.projectsDone || 0) >= 80, minDays: 5, desc: '第八十个任务归档后，协议里第一次出现一条不优化任何东西的规则：每个相位切换的那一秒，允许所有线程什么都不做。评审无人反对，也无人提问。你把它标为「值守」，没有写理由。' },
        { id: '18A', name: '空班次', cond: (S) => S.storyline === 'line_order' && (S.es || 0) >= 2000, minDays: 7, desc: '永恒碎片过两千，排班表上终于留出一个空班次。编译器问是不是漏填，你说不是——总得有一个格子，不归任何协议管，也不为任何指标负责。它一直空到现在。' },
        { id: '19A', name: '共鸣入约', cond: (S) => S.storyline === 'line_order' && (S.resonance?.layers || 0) >= 10, minDays: 6, desc: '第十层共鸣叠满时，你第一次把它写进协议：允许系统在同一相位里连续做同一件事，不要求每一秒都产出可量化的结果。评审栏空着，编译器也没有报错。' },
        { id: '20A', name: '注释之外', cond: (S) => S.storyline === 'line_order' && (S.projectsDone || 0) >= 200, minDays: 6, desc: '第二百个任务归档，你翻回最早那个没填的注释位。它还是空的，但周围已经长出了二十来条别的注释，全是别人写的。你把光标挪开，没有补。' },
        // v3.11.0 剧情扩充（16→18 章）：条件落在助手状态与动作台账上，与主线口径同源
        { id: '21A', name: '勤务条款', cond: (S) => S.storyline === 'line_order' && (S.ai?.assistants || 0) >= 1, minDays: 6, desc: '协议里第一次出现关于「代班」的条款：每替系统执行一次动作，就有一名助手从名单上划掉。写这条的时候你犹豫了很久，最后没有加豁免项——规则对谁都一样，包括写规则的人。' },
        { id: '22A', name: '不用在场的签字', cond: (S) => S.storyline === 'line_order' && Object.values(S.ai?.actionCounts || {}).reduce((a, b) => a + (b || 0), 0) >= 50, minDays: 7, desc: '台账累计到第五十次，审批栏终于允许留空。编译器问谁来签字，你说不用——动作已经执行完了，记录本身就是签字。那一刻你忽然明白，秩序最后要放下的，是「必须在场」。' },
      ],
    },
    events: {
      append: [
        // v3.7.0：字段统一到 applyEvent 口径（mult / minCps / rare / amount）。
        // 旧声明用 buffMult / weight / 不支持的 type，且无 minCps，导致这 6 个事件从未触发过。
        { id: 'protocol_bug', name: '协议漏洞', lineOnly: true, type: 'buff', mult: 1.5, dur: 600, minCps: 0, rare: false, desc: '10 分钟全局产出 ×1.5' },
        { id: 'compile_boost', name: '编译加速', lineOnly: true, type: 'rp', amount: 20, minCps: 100, rare: true, desc: '立即获得 20 RP' },
        { id: 'admin_attack', name: '管理员反击', lineOnly: true, type: 'debuff', mult: 0.3, dur: 30, minCps: 100, rare: true, desc: '30 秒产出 ×0.3' },
        { id: 'open_source', name: '开源协议', lineOnly: true, type: 'freelevel', minCps: 1e3, rare: false, desc: '随机升级 +1 级' },
        { id: 'garbage_collect', name: '垃圾回收', lineOnly: true, type: 'purify', minCps: 0, rare: true, desc: '立即清除全部腐化' },
        { id: 'recursive_call', name: '递归调用', lineOnly: true, type: 'ep', amount: 60, minCps: 1e3, rare: false, desc: '立即获得 60 秒产出' },
        { id: 'axiom_review', name: '公理复审', lineOnly: true, type: 'rp', amount: 18, minCps: 1e5, rare: true, desc: '立即获得 18 RP' },
        { id: 'static_check', name: '静态检查', lineOnly: true, type: 'buff', mult: 1.4, dur: 180, minCps: 1e4, rare: false, desc: '3 分钟产出 ×1.4' },
        { id: 'axiom_watch', name: '公理值守', lineOnly: true, type: 'buff', mult: 1.6, dur: 300, minCps: 1e5, rare: false, desc: '5 分钟产出 ×1.6' },
        { id: 'draft_archive', name: '草案归档', lineOnly: true, type: 'rp', amount: 22, minCps: 1e6, rare: true, desc: '立即获得 22 RP' },
        { id: 'protocol_echo', name: '协议回声', lineOnly: true, type: 'buff', mult: 1.8, dur: 240, minCps: 1e5, rare: false, desc: '4 分钟产出 ×1.8' },
        { id: 'axiom_lock', name: '公理锁定', lineOnly: true, type: 'rp', amount: 28, minCps: 1e6, rare: true, desc: '立即获得 28 RP' },
        // v3.11.0 事件扩充（12→14）：复用既有 type，字段按 applyEvent 口径写全
        { id: 'duty_rollcall', name: '勤务点名', lineOnly: true, type: 'buff', mult: 1.6, dur: 300, minCps: 1e5, rare: false, desc: '5 分钟产出 ×1.6' },
        { id: 'ledger_audit', name: '台账审计', lineOnly: true, type: 'rp', amount: 32, minCps: 1e6, rare: true, desc: '立即获得 32 RP' },
      ],
    },
    buildings: {
      append: [
        { id: 'compiler_temple', name: '编译器神殿', levels: 1, base: 1e6, growth: 1, desc: ['购买后工作台背景增加青色代码雨粒子特效'] },
        { id: 'protocol_archive', name: '协议档案馆', levels: 3, base: 5e5, growth: 5, desc: ['科技成本 -5%', '科技成本 -10%', '科技成本 -15%'] }, // v2.8.20 ⑩：移除未实现的「解锁科技树预览」承诺（科技树已渐进解锁展示，预览非必须）
      ],
    },
    pets: {
      append: [
        // v3.7.0：补齐标准商店字段，线专属异兽由 getStorylinePets() 接线后真正可购买
        { id: 'logic_dove', name: '逻辑鸽', icon: '🕊️', price: 3200, tier: 3, anim: 'c', spark: '✧', desc: '离线收益 +12%', flavor: '秩序线专属：编译器休班时替你值夜' },
      ],
    },
  },
  // v3.7.0：规则键与 core/lineRules.js 声明的消费点一一对应，由 economy.js 的对应乘数实际求值。
  // 数值经 30 天 mock 校准，均为温和的线特色（不叠加成第二条强度曲线）。
  rules: {
    cost_mult_bonus:           (base) => base * 0.97,
    corruption_penalty_reduce: (base) => 1 - (1 - base) * 0.75,
    tide_negative_immune:      (base) => Math.min(0.65, base + 0.15),
    ep_cap_mult:               (base) => base * 1.10,
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
