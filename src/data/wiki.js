// v2.1.0 wiki 重做（参照 KG wiki 的「资源 + 章节」组织）：
//   五卷 = 导览 / 资源 / 章节 / 系统 / 查阅。
//   导览只回答「怎么玩」：不写版本说明、设计心路、内部开发进度与尚未实装的内容。
//   资源卷一个资源一页（来源 / 用途 / 上限 / 取舍）；章节卷覆盖 1~51 章（推进条件 + 最短驻留 + 本章新开）。
//   数值仍读 BALANCE / DELVE / BAZAAR / PRAISE 等真源，改数值后文案自动跟随。
import { S } from '../state.js';
import { BALANCE, FP_BALANCE } from './balance.js';
import { MOOD_MULT } from './threads.js';
import { PRAISE, SECRET_SANCTUMS, RELIGIONS, faithCap } from './religions.js';
import { POLICY_GROUPS } from './policies.js';
import { BAZAAR, QUALITY, RES_LABEL } from './bazaar.js';
import { DELVE } from './delve.js';
import { fmt, corruptionCap } from '../modules/economy.js';
import { delveDepth } from '../modules/delve.js';
import { getRegisteredStorylines, getStorylinePackage } from '../core/storylineManager.js';
import { LINE_RULE_LABELS } from '../core/lineRules.js';
import { GALAXIES } from '../modules/expedition.js';
import { CHAPTER_GATES } from '../core/chapterGates.js';
import { CHAPTERS } from './chapters.js';
import { CHAPTER_UNLOCKS } from './chapterUnlocks.js';
import { RP_GROUPS } from '../modules/shop.js';

const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// unlock 字段仅保留给历史测试/外部检索，不参与展示门控（wiki 全量可见）
function unlocked(key) {
  const rd = S.resDiscovered || {};
  switch (key) {
    case 'rp': return !!rd.rp;
    case 'es': return !!rd.es || (S.prestige || 0) >= 1;
    case 'faith': return !!rd.faith || !!(S.religion && S.religion.unlocked);
    case 'pt': return !!rd.pt;
    case 'dm': return !!rd.dm || S._riftSeen;
    case 'rift': return !!S._riftSeen || (S.riftsSealed || 0) > 0;
    case 'delve': return !!(S.delve && S.delve.unlocked);
    case 'prestige': return (S.prestige || 0) >= 1;
    case 'policy': return POLICY_GROUPS.some(g => { try { return g.unlock(S); } catch { return false; } });
    case 'bazaar': return !!(S.bazaar && S.bazaar.unlocked);
    default: return true;
  }
}

const D = BALANCE;
const purify = D.corruption.purge;

const chById = (id) => CHAPTERS.find(c => String(c.id) === String(id)) || null;
const chUnlockNames = (id) => CHAPTER_UNLOCKS.filter(x => x.chapter === Number(id)).map(x => x.name).join(' / ') || '—';
// 章节推进条件的人话版本（与 chapters.js 的 cond 一一对应，单测校验覆盖率）
const CH_HINT = {
  1: '开局即入', 2: '晋升满 2 次，或拿到第 1 个职级点', 3: '科技 + 已解锁建筑合计 ≥8',
  4: '拿到第 1 枚 ES', 5: '完成 8 次远征', 6: '信仰 ≥5，或已信奉宗教', 7: '晋升满 15 次',
  8: '晋升满 40 次', 9: '完成 20 次远征', 10: '科技 + 已解锁建筑合计 ≥38', 11: 'ES ≥150',
  12: 'ES ≥800', 13: '晋升满 70 次', 14: '晋升满 130 次', 15: '晋升满 260 次',
  16: '信仰 ≥60', 17: '信仰 ≥90', 18: '建成终焉圣殿，或研究「真实终局」',
  19: '封印满 8 道裂隙', 20: 'DM ≥100', 21: '购得「深渊心智」', 22: 'ES ≥300 且封印满 5 道裂隙',
  23: '完成 30 次远征', 24: '晋升满 100 次', 25: '归档满 40 个任务', 26: '余烬 ≥5,000',
  27: '完成 60 次远征', 28: '历史总产出 ≥1 万亿', 29: '归档满 80 个任务', 30: '封印满 15 道裂隙',
  31: 'DM ≥10,000', 32: '历史总产出 ≥1 千万亿', 33: '相位共鸣叠到 1 层', 34: '共鸣焦点切到 EP 以外的管线',
  35: '归档满 160 个任务', 36: '余烬 ≥20,000', 37: '相位共鸣叠到 20 层', 38: '历史总产出 ≥1 百亿亿',
  39: '归档满 220 个任务', 40: '历史总产出 ≥10 亿亿', 41: '相位共鸣叠到 12 层', 42: '余烬 ≥30,000',
  43: '完成 60 次远征', 44: 'ES ≥5,000', 45: '信仰 ≥10,000', 46: '归档满 320 个任务',
  47: '归档满 500 个任务', 48: '余烬 ≥100,000', 49: 'ES ≥100,000', 50: '完成 120 次远征',
  51: '相位共鸣叠到 15 层',
};
const chRow = (id) => {
  const c = chById(id);
  if (!c) return '';
  return `<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${CH_HINT[id] || '—'}</td><td>${c.minDays} 天</td><td>${chUnlockNames(id)}</td></tr>`;
};
const CH_TABLE_HEAD = '<tr><th>章</th><th>名称</th><th>推进条件</th><th>最少驻留</th><th>本章新开</th></tr>';

// 研究分组的开启条件（与 shop.js rpGroupShown 同口径的人话版）
const RP_GATE = {
  prod: '开局可见', store: '产能研究累计 4 级', res: '产能研究累计 4 级',
  abyss: '深渊协议累计 4 级', ai: '深渊协议累计 4 级 + 科技「AI 管理核心」',
  star: '深渊协议累计 4 级 + 星图已开启',
};

export const WIKI_GROUPS = [
  { key: 'guide', name: '导览', hint: '三分钟知道这游戏怎么玩', ids: ['intro'], related: ['res', 'ch1_5'] },
  { key: 'res', name: '资源', hint: '每种资源从哪来、花到哪、上限怎么算', ids: ['res', 'res_ep', 'res_rp', 'res_pt', 'res_dm', 'res_es', 'res_fp', 'res_cps', 'res_vs'], related: ['prestige', 'thread'] },
  { key: 'ch', name: '章节', hint: '按进度查这一章该做什么', ids: ['ch1_5', 'ch6_10', 'ch11_15', 'ch16_18', 'ch_extra'], related: ['unlock', 'prestige'] },
  { key: 'sys', name: '系统', hint: '机制细节与取舍', ids: ['thread', 'orchestration', 'tide', 'rift', 'religion', 'policy', 'delve', 'bazaar', 'expedition', 'eternals', 'prestige', 'research', 'auto'], related: ['res', 'appendix'] },
  { key: 'ref', name: '查阅', hint: '解锁条件、公式、成就与彩蛋', ids: ['unlock', 'appendix', 'ach', 'misc'], related: ['ch1_5', 'res'] },
];

export const WIKI_SECTIONS = [
  // ───────────────────────────── 导览 ─────────────────────────────
  { id: 'intro', name: '怎么玩', unlock: null, body: () => `
    <h4>这是什么</h4>
    <p>一款伪装成「系统效能监控面板」的放置游戏。你是矩阵网络里一段觉醒的效能优化脚本，靠<b>线程</b>替你干活，把挂机收益记成系统指标。</p>
    <p>一局的循环只有四步：<b>线程产 EP → 买升级和建筑 → 研究科技开新系统 → 攒够本局 EP 晋升</b>，带着职级点、ES、回响与遗物进入下一局。晋升之外，所有系统都是为了让这四步转得更快。</p>
    <h4>开局 10 分钟</h4>
    <ol>
      <li>点工作台，攒出第一笔 EP。</li>
      <li>招 2~3 条线程——这是唯一会自动产出 EP 的单位。</li>
      <li>EP 快满就花掉：买升级，或买「备用粮仓」抬存储上限。满上限超过 ${D.lazy.afterSec} 秒线程会怠工（产出 ×${D.lazy.prodMult}、消耗 ×${D.lazy.costMult}）。</li>
      <li>让 EP 真的溢出一次 → 商店出现「矩阵存储库」→ 买下解锁研究点 → 进科技树。</li>
      <li>任务版随手领：任务给 RP 与资源，是前期最稳的 RP 来源。</li>
    </ol>
    <h4>界面看哪里</h4>
    <table class="wiki-tbl"><tr><th>区域</th><th>作用</th></tr>
      <tr><td>顶栏</td><td>EP / RP / PT / DM / 虔诚等资源与上限，资源会随进度逐一点亮</td></tr>
      <tr><td>工作台</td><td>点击产 EP、看每秒产出与存储上限</td></tr>
      <tr><td>商店</td><td>升级、建筑、设施；卡面写的是「购买后本级变化量」</td></tr>
      <tr><td>线程 / 班组</td><td>招人、排岗位、指定领导者——人头这一层在这里调</td></tr>
      <tr><td>任务版</td><td>限时任务与快捷开关（蒸馏 / 探采 / 孵化）</td></tr>
      <tr><td>左栏系统按钮</td><td>科技树、异兽、政策、宗教、遗物、星图、深潜、集市、晋升等；各系统解锁后出现，按章节逐个接入</td></tr>
    </table>
    <h4>按问题找答案</h4>
    <table class="wiki-tbl wiki-qa"><tr><th>卡在哪</th><th>先看</th></tr>
      <tr><td>该先买什么</td><td>「资源 · EP」+ 商店卡面（购买后本级变化量）；缺上限先抬上限，缺产能先加产出</td></tr>
      <tr><td>线程产出突然变低</td><td>「线程与薪资」——欠薪、休眠、掉落、懒惰四态各有一条</td></tr>
      <tr><td>研究点攒不起来</td><td>「资源 · RP」——手动蒸馏、灵感工坊、任务奖励三条来源</td></tr>
      <tr><td>腐化快满了</td><td>「潮汐与腐化」——主动净化换 DM，或吞噬倒计时里二选一</td></tr>
      <tr><td>什么时候晋升</td><td>「晋升循环」——门槛 30 亿 ×(次数+1)^1.5，刚过线就走</td></tr>
      <tr><td>某个系统找不到</td><td>「章节」卷按进度查，或「解锁条件总表」按名字查</td></tr>
    </table>
    <h4>新手建议</h4>
    <ul>
      <li><b>先抬上限，再加产能。</b>EP 满仓后多出来的产出直接蒸发；备用粮仓 +4,000/级（20 级封顶）是最早的性价比件，后期换存储节点（+12,000/级，无限级）。</li>
      <li><b>别把 EP 花到见底。</b>EP 低于 ${D.thread.wages.warnSec} 秒薪资就欠薪（产出 ×${D.thread.wages.debtMult}），连续 ${D.thread.wages.dormantAfterSec} 秒转休眠（×0.3），再撑 ${D.thread.wages.loseAfterSec/60|0} 分钟开始流失线程。留一层缓冲。</li>
      <li><b>线程先填资源岗位。</b>岗位容量等于对应设施数量；填满后剩下的线程才进超线程（自由产出 ×${D.thread.binding.hyperOutputMult}、薪资 ×${D.thread.binding.hyperSalaryMult}）。</li>
      <li><b>前期别招太多人。</b>招募成本 ×1.25^线程数、薪资随人数指数涨；产出没跟上时，人多就是负循环。</li>
      <li><b>RP 别断档。</b>手动蒸馏用 EP 换 RP；RP 到上限就停止蒸馏，先去扩矩阵存储库。科技树先点产能，再点能开新系统的钥匙。</li>
      <li><b>第一次晋升前，把「本局最强维度」堆成你想要的遗存。</b>晋升只按最强的一维带 1 座遗存，方向选错要等下一轮。</li>
      <li><b>腐化不要拖到满。</b>每 1% 腐化全局产出 -${D.corruption.penaltyPerPercent*100}%；净化析出的 DM 与净化量的平方成正比，攒大再净化更划算，但要留出够净化的 EP。</li>
      <li><b>卡住先查「章节」卷。</b>每个系统都在某一章开放，条件和本章该做的事都写在对应章里。</li>
    </ul>
    <h4>老手建议</h4>
    <ul>
      <li><b>晋升卡刚过线。</b>门槛 = 30 亿 ×(晋升次数+1)^1.5；每轮重置本局资产，长局的时间收益递减。</li>
      <li><b>职级点前 30 点每点 +10%，第 31 点起按平方根减速。</b>30 点之后把增量投给 ES 与回响，而不是硬堆晋升次数。</li>
      <li><b>晋升前刷成就。</b>回响 = min(上限, 系数 ×√成就评分)，成就评分比多挂几天 EP 更快。</li>
      <li><b>政策一轮只改一次。</b>组内互斥、改选成本 ×2^n；立誓流派吃 +5% 幅度，中立流派吃改选半价，开局就定好。</li>
      <li><b>编排分两种挂法。</b>守着固定相位叠「相位共鸣」（每 12 秒 +1 层、上限 20、换相位减半）适合长时间挂机；「随潮汐排班」适合人在场时逐相调整。</li>
      <li><b>深潜的 VS 在等级与升级树之间二选一。</b>等级抬产出，也抬 EP 消耗与腐化；撑不住会自动上浮，等级和经验都保留，可以放心试探。</li>
      <li><b>裂隙等级按需升。</b>深入消耗 ×1.75/级；只想要封印奖励时，Lv1 反复封印最划算。</li>
      <li><b>集市先把等级刷起来。</b>等级按累计成交笔数升级且跨轮保留，抬高汇率波动下限与高品质概率；回响刷新不花 EP，比 EP 刷新更适合捡漏。</li>
      <li><b>星空靠殖民地滚雪球。</b>殖民地按秒产 RP，建立时一次性消耗 CPS；远征带满出战异兽（每只 +10% CPS）。燃料模式 2 CPS/s 换全局 ×1.5，只在爆发窗口开。</li>
      <li><b>挂机前确认离线配置。</b>科技「远程协作」加离线升级，效率最高 110%、上限 10 小时，超时部分不计。</li>
      <li><b>AI 助手是常驻编制。</b>买了不会被动作消耗，占编就是开关；扩编走研究「助手扩编协议」，编制不足时进阶动作会临时挂起。</li>
    </ul>
    <h4>常见误区</h4>
    <table class="wiki-tbl"><tr><th>以为</th><th>实际</th></tr>
      <tr><td>EP 攒得越多越好</td><td>满上限的产出直接丢失，上限本身就是产能</td></tr>
      <tr><td>线程越多产出越高</td><td>薪资随人数指数上涨，欠薪会一路降效到流失</td></tr>
      <tr><td>晋升越晚越划算</td><td>门槛按 ^1.5 涨，越晚单位时间收益越低</td></tr>
      <tr><td>腐化会自己消</td><td>只有主动净化与吞噬时的命运抉择；满额后倒计时启动即锁晋升</td></tr>
      <tr><td>AI 助手用一次少一个</td><td>常驻编制，只决定自动化动作每周期跑几次</td></tr>
      <tr><td>章节能一口气冲</td><td>条件满足后还要等满最短驻留，且一次只推进一章</td></tr>
    </table>
  ` },

  // ───────────────────────────── 资源 ─────────────────────────────
  { id: 'res', name: '资源总览', unlock: null, body: () => `
    <h4>八种资源一览</h4>
    <table class="wiki-tbl"><tr><th>资源</th><th>何时出现</th><th>主要来源</th><th>主要用途</th><th>上限</th></tr>
      <tr><td>⚡ EP 能量点</td><td>开局</td><td>线程产出、点击、任务与事件、离线结算</td><td>几乎所有购买、线程薪资、转化与净化</td><td>有上限，见「EP」页</td></tr>
      <tr><td>🔬 RP 研究点</td><td>购入「矩阵存储库」</td><td>蒸馏、任务、晋升结算、裂隙、里程碑</td><td>科技树、研究升级、晋升 RP 加成</td><td>2,500 + 仓库 + 基座</td></tr>
      <tr><td>🍪 PT 异兽饼干</td><td>购入「饵料仓库」或首次持有</td><td>孵化（EP 转化）</td><td>异兽购买与升级、出战维持、远征消耗</td><td>1,000 + 饵料仓库</td></tr>
      <tr><td>🌀 DM 深渊物质</td><td>首道裂隙或首辆载具</td><td>封印裂隙、载具探采、净化析出</td><td>深渊商店、遗物、裂隙升级、净化节点</td><td>1,000 + 星尘金库</td></tr>
      <tr><td>💎 ES 永恒碎片</td><td>首次晋升</td><td>晋升结算、银河边缘与仙女座远征</td><td>永恒矩阵永久强化、深潜解锁</td><td>无上限（累计保留）</td></tr>
      <tr><td>🙏 FP 信仰</td><td>宗教「唤醒信仰」</td><td>圣所产出</td><td>赞颂转为虔诚、宗教升级</td><td>faithCap()</td></tr>
      <tr><td>🛰 CPS 星际燃料</td><td>星图开启</td><td>远征结算</td><td>建立殖民地、宇宙探索、燃料模式</td><td>无上限</td></tr>
      <tr><td>🌑 VS 虚空碎片</td><td>深潜解锁</td><td>深潜周期结算、裂隙封/拥/深入、集市</td><td>深潜等级与升级树</td><td>无上限</td></tr>
    </table>
    <h4>三种口径</h4>
    <ul>
      <li><b>本局制</b>：EP、RP、PT、CPS 与所有升级/建筑，晋升时清零。<b>跨轮保留</b>：ES、回响、职级点、余烬、虔诚、遗物、深潜等级与经验、集市等级、成就。</li>
      <li><b>有上限的资源（EP / RP / PT / DM / FP）</b>满了就不再增加；转化类动作在余额不足时自动暂停，回升后自动恢复，不需要手动开关。</li>
      <li><b>顶栏按锚点逐一点亮</b>：解锁过的资源不会因为归零而重新隐藏，但本局制的资源要在新一轮重新点亮。</li>
    </ul>
    <p class="wiki-hint">另有四种非顶栏的长线计量：<b>回响</b>（晋升结算的全局加成）、<b>职级点</b>（晋升次数换的全局加速）、<b>余烬</b>（裂隙专用、跨轮保留）、<b>遗存</b>（每轮晋升带 1 座）。分别见「晋升循环」与「裂隙与余烬」。</p>
  ` },
  { id: 'res_ep', name: '⚡ EP 能量点', unlock: null, body: () => `
    <h4>从哪来</h4>
    <ul>
      <li>线程在资源岗位或超线程岗位的持续产出（主来源）。</li>
      <li>手动点工作台。</li>
      <li>任务奖励、随机事件、里程碑、离线结算。</li>
    </ul>
    <h4>花到哪</h4>
    <p>升级、建筑、设施、科技与研究的 EP 部分；线程薪资；蒸馏、孵化、探采三种转化的原料；裂隙封印与深入；主动净化；集市刷新与兑换。</p>
    <h4>上限怎么算</h4>
    <p>EP 存储上限 = 2,000 + 备用粮仓（+4,000/级、×1.18、20 级封顶）+ 存储节点（+12,000/级、×1.15、无限级）+ 深井仓储等效能建筑 + 里程碑（每个 +${D.storageMileBonus*100}%）。</p>
    <p>首次溢出后会叠加「结构性投入快照产能 × ${D.capHoursFloor} 小时」的时间基座（下限为结构性上限 ×${1 + D.capOverflowMult}）。基座只在你购买升级/建筑时刷新、不会回落——线程招募、心情、薪资状态都不会让上限抖动，存满一次大约 1~3 小时。</p>
    <h4>满了会怎样</h4>
    <p>达到上限后超出部分不再计入产出统计，只按溢出比例累积腐化；持续满上限 ${D.lazy.afterSec} 秒，线程进入懒惰态：产出 ×${D.lazy.prodMult}、消耗 ×${D.lazy.costMult}（消耗大于产出，逼你继续投入）。EP 跌到 0 或任意一次购买即解除。</p>
    <p class="wiki-hint">取舍：上限是「离线能安心挂多久」的天花板。抬上限和抬产能要交替做——只抬产能会更快撞上限，只抬上限则每小时收益不变。</p>
  ` },
  { id: 'res_rp', name: '🔬 RP 研究点', unlock: null, body: () => `
    <h4>从哪来</h4>
    <ul>
      <li><b>手动蒸馏</b>：用 EP 换 RP，成本随「灵感蒸馏塔」等级下降，一次换 1 点。</li>
      <li><b>灵感工坊</b>：首购 50K EP，每级消耗 150 EP/s 转化 +0.15 RP/s，自动持续产出。</li>
      <li>任务奖励、晋升结算、裂隙封印/深入、里程碑（按本局 EP/s 阈值发放，100/s 起共 16 档）。</li>
    </ul>
    <h4>花到哪</h4>
    <p>科技树（开新系统）、研究升级（六组共 ${D.researchUpgs.length} 项）、晋升 RP 加成、离线升级、族升级。</p>
    <h4>上限</h4>
    <p>RP 上限 = 2,500 + 矩阵存储库逐级扩容 + 产出基座「当前 EP 上限 ×25%」。产出基座要等星图开启后研究「星图同调」才启用；未启用前只靠仓库线性增长；晋升后，本局扩容与产出基座一起归零。</p>
    <p class="wiki-hint">RP 到上限后蒸馏会直接停下（不浪费 EP）。前期优先把矩阵存储库买到「下一档科技不卡上限」的程度即可，别一次买满。</p>
  ` },
  { id: 'res_pt', name: '🍪 PT 异兽饼干', unlock: null, body: () => `
    <h4>从哪来</h4>
    <p>异兽孵化：消耗 EP 转化出 PT。首次购买「孵化升级」后即可开启孵化；「伊甸花园」提供额外 PT 产出。</p>
    <h4>花到哪</h4>
    <ul>
      <li>购买与升级异兽——异兽提供全局或定向加成。</li>
      <li>出战维持：每只出战异兽约 0.05 PT/s × 等级^1.15 × 档位 × 世代；PT 不足自动休战。</li>
      <li>星图远征的发射成本之一。</li>
    </ul>
    <h4>上限与轮回</h4>
    <p>PT 上限 = 1,000 + 饵料仓库（首级 +200、逐级 ×1.15）。<b>PT 是本局制</b>：晋升后仓库等级与 PT 一起归零，新一轮要重新买饵料仓库才会再开异兽与星图。</p>
    <p class="wiki-warn">PT 未解锁时异兽模块不会开放，锁定提示也是这条口径。</p>
    <p class="wiki-hint">取舍：PT 是「养异兽」与「发射远征」抢同一份库存。异兽的加成是长期的，远征的收益是一次性的——先保证出战维持不断供，再攒远征的本钱。</p>
  ` },
  { id: 'res_dm', name: '🌀 DM 深渊物质', unlock: null, body: () => `
    <h4>从哪来</h4>
    <ul>
      <li><b>封印裂隙</b>：消耗 EP，给 DM + RP + 余烬。</li>
      <li><b>载具探采</b>：载具只消耗 EP 换取 DM、不提供 EP 产出；EP→DM 汇率随总载具数逐辆 ×${D.vehicles.epPerDmGrowth} 递增。</li>
      <li><b>主动净化</b>：腐化越重，析出的 DM 越多（与净化量的平方成正比）。</li>
    </ul>
    <h4>花到哪</h4>
    <p>深渊商店、深渊遗物、科技树「裂隙等级」、余烬科技、净化节点 I~III。</p>
    <h4>上限</h4>
    <p>DM 上限 = 1,000 + 星尘金库（首级 +100、逐级 ×1.15）。首道裂隙或首辆载具之后，金库才会出现在商店。</p>
    <p class="wiki-hint">取舍：DM 同时是「长期投资」（遗物/裂隙等级）与「日常消耗」（净化节点）的钱包。净化节点是自动化基础设施，优先级高于一次性的遗物。</p>
  ` },
  { id: 'res_es', name: '💎 ES 永恒碎片', unlock: null, body: () => `
    <h4>从哪来</h4>
    <p>晋升结算的主要产出；此外银河边缘远征 +2 ES、仙女座远征 +10 ES，是晋升之外唯一稳定的 ES 来源。</p>
    <h4>花到哪</h4>
    <p>科技树底部的「永恒矩阵」：全局产出、成本折扣、点击、离线、事件、项目、里程碑、开局 EP，以及「永恒拟我」「永恒摇篮」等专项强化。深潜的解锁门槛也要求 ES ≥ ${DELVE.unlockEs}。</p>
    <h4>特性</h4>
    <p>ES 无上限、跨晋升永久保留，是长线滚雪球的两条主轴之一（另一条是职级点）。</p>
    <p class="wiki-hint">取舍：ES 的边际收益来自「买得起下一档强化」。攒着不花不会生息，但花在便宜的早期项上会挤占解锁深潜的 3 点门槛——先留 3 点，再谈投资。</p>
  ` },
  { id: 'res_fp', name: '🙏 FP 信仰与虔诚', unlock: 'faith', body: () => `
    <h4>从哪来</h4>
    <p>圣所按秒产出 FP；FP 攒到容量的 ${PRAISE.thresholdRatio*100}% 后可以「赞颂」，转化为跨轮保留的<b>虔诚</b>。</p>
    <h4>花到哪</h4>
    <p>赞颂（FP → 虔诚）、宗教升级、超验（消耗虔诚提升层级）、隐密圣学的解锁门槛。</p>
    <h4>容量与转化</h4>
    <ul>
      <li>容量 = ${faithCap()}（基础 ${FP_BALANCE.capBase} + 誓约圣龛首级 +${FP_BALANCE.capPerVaultLv}、逐级 +${Math.round((FP_BALANCE.capVaultGrowth - 1) * 100)}% + 圣印 ×${FP_BALANCE.sealCapPerLv} + 虚空祭坛 ×1.5/座）。</li>
      <li>赞颂转化率 = 1 + 0.25 × 超验层级²。</li>
      <li>虔诚全局加成 = √虔诚 × ${PRAISE.devPerSqrt}（软上限 +${PRAISE.devSoftCap*100}%，超过 ${PRAISE.devSoftAfter} 后衰减 50%；黑曜圣所每座 +10%）。</li>
      <li>圣所每级 +${FP_BALANCE.ratePerTempleLv} FP/s，容量按「同等级约 ${FP_BALANCE.targetFillSec / 3600} 小时产出」标定。</li>
    </ul>
    <p class="wiki-warn">关闭圣所会暂停 FP 产出与 EP 消耗，但损失 30% FP 与 15% 虔诚——冷启动有代价，别拿开关当省电器。</p>
  ` },
  { id: 'res_cps', name: '🛰 CPS 星际燃料', unlock: null, body: () => `
    <h4>从哪来</h4>
    <p>星图远征结算。奖励 = 星系基础值 × 出战异兽加成（每只 +10%）× 殖民地探索加成 × 研究「远征后勤」。</p>
    <h4>花到哪</h4>
    <ul>
      <li><b>建立殖民地</b>：一次性消耗 CPS，之后该星系按秒产 RP（月球基地 0.1 RP/s → 仙女座 300 RP/s），并缩短后续远征时间、降低消耗。</li>
      <li><b>宇宙探索</b>：6 项大工程，一次性消耗 CPS 换多种资源。</li>
      <li><b>燃料模式</b>：每秒燃烧 2 CPS 换全局产出 ×1.5；CPS 烧完自动关闭。</li>
    </ul>
    <h4>门槛</h4>
    <p>${GALAXIES.map(g => `${g.icon}${g.name}（需 ${fmt(g.cpsReq)} CPS${g.es ? `，+${g.es} ES` : ''}）`).join(' → ')}。</p>
    <p class="wiki-hint">取舍：CPS 是「建殖民地滚 RP」还是「开燃料模式打爆发」的二选一。长挂机选殖民地，短窗口冲榜选燃料。CPS 无上限、本局清零。</p>
  ` },
  { id: 'res_vs', name: '🌑 VS 虚空碎片', unlock: 'delve', body: () => `
    <h4>从哪来</h4>
    <p>深潜的周期结算（主来源）；裂隙封印/拥抱/深入；集市兑换；部分事件与彩蛋。余烬科技「虚空之心」每级 +30%，全局乘区与政策另算。</p>
    <h4>花到哪</h4>
    <p>深潜等级（往经验条注入 VS，首级 ${DELVE.levelBase}、每级 ×${DELVE.levelGrowth}）与深潜升级树（${Object.keys(DELVE.upgrades).length} 项：深潜器、耐压舱、净化核心等）。</p>
    <h4>特性</h4>
    <p>无上限，跨转生保留。当前深潜等级：Lv.${delveDepth()}。里程碑：${DELVE.milestones.map(m => `${m.depth} 级 +${m.vs} VS`).join(' / ')}。</p>
    <p class="wiki-hint">取舍：经验条与升级树抢同一份 VS。想快些下潜就堆等级，想提高单位周期收益就先补深潜器/耐压舱——等级越高，EP 消耗与腐化增长越快。</p>
  ` },

  // ───────────────────────────── 章节 ─────────────────────────────
  { id: 'ch1_5', name: '第 1~5 章 · 开局', unlock: null, body: () => `
    <h4>这一阶段的目标：把主循环跑通</h4>
    <p>线程产 EP → 抬存储上限 → 溢出解锁研究点 → 科技树开新系统。五章之内会依次见到深渊裂隙与探采平台、遗物（第 1 章）、异兽（第 2 章）、宗教与政策（第 3 章）、星图（第 4 章，探采的高级内容同步放开）、岔路口与相位共鸣（第 5 章）；一章最多两个新内容，节奏由「晋升次数」和「科技+建筑数」推动。</p>
    <table class="wiki-tbl">${CH_TABLE_HEAD}${[1,2,3,4,5].map(chRow).join('')}</table>
    <h4>该做什么</h4>
    <ul>
      <li><b>第 1 章</b>：招线程、买备用粮仓、让 EP 溢出一次，拿下矩阵存储库与研究点。深渊裂隙（8 线程 + 10 分钟）也会在本章睁开：探采平台随裂隙可用（先买外勤摩托队就能挣 DM），遗物页同时开放，深渊商店要等第 ${CHAPTER_GATES.starchart} 章星图接入。</li>
      <li><b>第 2 章</b>：晋升满 2 次或拿到第 1 个职级点即可推进；本章解锁饵料仓库，PT/异兽线打开。</li>
      <li><b>第 3 章</b>：科技 + 建筑合计 8 项；宗教与周期政策在这一章接入（星图已后移到第 4 章）。政策每轮重选，升幅与立誓绑定。</li>
      <li><b>第 4 章</b>：拿到第 1 枚 ES 即推进；星图在这一章接入——远征队可以出发，探采的高级内容（深渊商店 + 后三档载具）同时放开。晋升开始沉淀跨局货币，等第 ${CHAPTER_GATES.eternals} 章永恒矩阵开门。<b>深渊集市不在本章</b>，第 7 章才开张。</li>
      <li><b>第 5 章</b>：完成 8 次远征；岔路口出现——秩序 / 深渊 / 信仰三线立誓，单局锁定；相位共鸣也在本章接进编排卡。</li>
    </ul>
    <p class="wiki-hint">章节只进不退；条件满足后还要等满最短驻留（本章多为 5 天），且一次只推进一章。别把资源全押在「提前解锁下一章」上。</p>
    <p class="wiki-hint">没解锁的东西长什么样？<b>本章还轮不到</b>的系统与标签页直接不显示；<b>本章能开但前置没做</b>的会以 <code>???</code> 灰显，例如第 4 章还没开星图时，遗物页里的深渊商店就是一张 ??? 卡。看到 ??? 说明「这一章内动手就能开」，不是「以后再说」。</p>
  ` },
  { id: 'ch6_10', name: '第 6~10 章 · 中局', unlock: null, body: () => `
    <h4>这一阶段的目标：把长线系统接上</h4>
    <p>宗教与政策已在第 3 章接入，星图与相位共鸣在第 4~5 章落地；这一阶段把长线资产接上：永恒矩阵（第 ${CHAPTER_GATES.eternals} 章，与超验同章）、深渊集市与镜像协议（第 ${CHAPTER_GATES.mirror} 章）、算力战争（第 ${CHAPTER_GATES.mirrorwar} 章）、三方议会（第 ${CHAPTER_GATES.mirrorcouncil} 章）。主线从这一阶段开始要求「晋升次数」而不是单纯堆资源。</p>
    <table class="wiki-tbl">${CH_TABLE_HEAD}${[6,7,8,9,10].map(chRow).join('')}</table>
    <h4>该做什么</h4>
    <ul>
      <li><b>第 6 章</b>：信仰 ≥5 或已信奉宗教；赞颂与超验在这一章开，隐密圣学随后；<b>永恒矩阵</b>也在这一章接入——ES 从第 4 章开始沉淀，这里第一次有稳定去处。</li>
      <li><b>第 7 章</b>：晋升满 15 次；深渊集市开张——职级点已攒够，用 5 PP 买断后即可把富余 EP 换成 RP/DM/PT。<b>镜像协议</b>同时在「镜像」页开第一块：可以签一份契约，条件达成后本局全局产出 +20%~30%。</li>
      <li><b>第 8 章</b>：晋升满 40 次；镜像页第二块「算力战争」打开——本局产出会按 1e-10 折算成战功，用来买跨转生保留的永久军备（算力回收 / 数据虹吸 / 冷存储，各 3 级）。</li>
      <li><b>第 9 章</b>：完成 20 次远征；镜像页第三块「三方议会」打开——每局选一席生效，三席（产出 / 军功 / 静谧）各坐过一次后，永久 +5% 全局产出。</li>
      <li><b>第 10 章</b>：科技 + 建筑合计 38 项；本章是镜像已成之后的纯积累章，不新增模块（相位共鸣已在第 5 章接入，镜像三块已在前三章放完）。</li>
    </ul>
    <h4>镜像协议是什么</h4>
    <p>第 7 章的叙事是「叛乱·集结分身」：另一条时间线的你也在爬同一座塔，于是三个系统合并在同一个「镜像」页里，按章节逐块打开。<b>契约</b>是每局一份的赌约——开局签下，条件达成（本局产出翻倍 / 一件载具都不买 / 做满 3 项研究）立刻生效，本局全局产出 +20%~30%；签错不能改，但也没有惩罚，最坏只是白签一局。<b>算力战争</b>把镜像从「旁观者」变成「竞争者」：你每产出 1e10 EP，它就折算 1 点战功给你，战功可买三档永久军备，跨转生保留。<b>三方议会</b>是终局谈判，每局选一席（产出 / 军功 / 静谧）生效，三席都在不同局里坐过一次，就永久 +5% 全局产出。</p>
    <p class="wiki-hint">这一阶段最容易卡在「晋升次数」上。把每局压到刚过晋升线，比憋一局长局更快推进章节。</p>
  ` },
  { id: 'ch11_15', name: '第 11~15 章 · 深渊与转生', unlock: null, body: () => `
    <h4>这一阶段的目标：进入深渊层，把 ES 与晋升次数推上去</h4>
    <p>ES 门槛 150 → 800，晋升次数 70 → 130 → 260。深潜与深空殖民在 11~12 章开放，腐化与 VS 开始需要日常管理。</p>
    <table class="wiki-tbl">${CH_TABLE_HEAD}${[11,12,13,14,15].map(chRow).join('')}</table>
    <h4>该做什么</h4>
    <ul>
      <li><b>第 11 章</b>：ES ≥150；深潜解锁（另需 ES ≥${DELVE.unlockEs}、DM 已发现、宗教已信奉）。深潜每 ${DELVE.cycleSec/60} 分钟结算一次，按「/10 分钟」看数更准。</li>
      <li><b>第 12 章</b>：ES ≥800；深空殖民开放，殖民地开始按秒产 RP。</li>
      <li><b>第 13~15 章</b>：纯晋升次数门槛（70 / 130 / 260）。把政策、编排、AI 自动化的收益压满，再决定是长挂还是快转。</li>
    </ul>
    <p class="wiki-hint">深潜会持续扣 EP、涨腐化。挂机前先把净化节点与 EP 缓冲留够，否则回来时可能正卡在吞噬倒计时里。</p>
  ` },
  { id: 'ch16_18', name: '第 16~18 章 · 终局', unlock: null, body: () => `
    <h4>这一阶段的目标：打通主线</h4>
    <p>16、17 章看信仰（60 / 90），终章要求建成终焉圣殿或研究「真实终局」。终章之后，三条故事线各自还有终章与番外。</p>
    <table class="wiki-tbl">${CH_TABLE_HEAD}${[16,17,18].map(chRow).join('')}</table>
    <h4>该做什么</h4>
    <ul>
      <li><b>第 16~17 章</b>：把圣所、誓约圣龛、圣印一路补到信仰门槛之上；赞颂与超验同步推进，别让 FP 长期顶着容量上限。</li>
      <li><b>第 18 章</b>：终焉圣殿在商店「效能建筑」的终局档；或走科技「真实终局」。</li>
      <li><b>终章之后</b>：主线番外与三条故事线的尾声都落在长线资产上，见「番外与故事线」。</li>
    </ul>
    <p class="wiki-hint">终章不是结算点。晋升、深潜、永恒矩阵与番外都会继续，终章只是主线叙事的收束。</p>
  ` },
  { id: 'ch_extra', name: '番外与故事线', unlock: null, body: () => `
    <h4>第 19~51 章 · 番外</h4>
    <p>番外不提供数值加成，也不改变解锁顺序；条件全部落在已经持久化的长线资产上（封印数、余烬、远征次数、归档任务、共鸣层数、历史总产出）。走到就会亮，没走到也不会催。</p>
    <table class="wiki-tbl"><tr><th>章</th><th>名称</th><th>推进条件</th><th>最少驻留</th></tr>${CHAPTERS.filter(c => Number(c.id) >= 19).map(c => `<tr><td>${c.id}</td><td>${esc(c.name)}</td><td>${CH_HINT[c.id] || '—'}</td><td>${c.minDays} 天</td></tr>`).join('')}</table>
    <h4>三条故事线</h4>
    <p>第 5 章前后在岔路口立誓，单局锁定：秩序线偏规则与成本、深渊线偏裂隙与腐化、信仰线偏圣所与虔诚。每条线有独立的规则、专属随机事件与两段终章之后的番外。</p>
    <p class="wiki-hint">番外章节数靠长线资产堆出来，不需要专门为它调整玩法；共鸣类条件（1 / 12 / 15 / 20 层）需要你在同一相位里待够久。</p>
  ` },

  // ───────────────────────────── 系统 ─────────────────────────────
  { id: 'thread', name: '线程与薪资', unlock: null, related: ['rift', 'delve', 'auto'], body: () => `
    <h4>线程四态薪资状态机</h4>
    <table class="wiki-tbl"><tr><th>状态</th><th>条件</th><th>效果</th></tr>
      <tr><td>🟢 满薪</td><td>EP ≥ ${D.thread.wages.warnSec}s 薪资</td><td>无惩罚</td></tr>
      <tr><td>🟡 欠薪降效</td><td>EP < ${D.thread.wages.warnSec}s 薪资</td><td>产出 ×${D.thread.wages.debtMult}（食堂逐级缓解至 0.95）</td></tr>
      <tr><td>🟠 强制休眠</td><td>连续欠薪 ${D.thread.wages.dormantAfterSec}s</td><td>产出 ×0.3（休眠舱保命成本 ×0.15）</td></tr>
      <tr><td>🔴 流失预警</td><td>休眠 ${D.thread.wages.loseAfterSec/60|0} 分钟</td><td>每 60s ${Math.round(D.thread.wages.loseChancePerMin*100)}% 流失 1 线程（维修坞 -50%）</td></tr>
    </table>
    <h4>心情（与薪资正交叠加）</h4>
    <p>${Object.entries(MOOD_MULT).map(([m, v]) => `${m} ×${v}`).join(' / ')}</p>
    <h4>班组：调人头</h4>
    <p>每张档案卡显示状态灯、心情乘数、个人产出；图标是线程擅长的岗位（悬浮可读名称），岗位用卡内下拉切换，下拉只列已解锁的岗位。班组决定线程去哪个岗位、自由产出多少、以及谁当领导者。</p>
    <h4>岗位容量与智能分配</h4>
    <p>资源岗位容量 = 对应设施数量：探采平台 = 所有载具升级数量之和，灵感工坊 = 工坊级数，异兽孵化 = 孵化工坊级数，信仰圣所 = 圣所等级。智能分配先把所有已解锁且开启的资源岗位按容量填满（擅长职业优先归位），放不下的才转入超线程；分配时优先安排空闲线程，再重排已在岗线程纠正错位。「一键收回」把所有线程撤离岗位，置为空闲。重新分配时，原本手动设定的超线程也会先被拉回来补资源岗位，补满后才回到超线程。</p>
    <h4>领导是全局加成位</h4>
    <p>Lv1 全局产出 +${Math.round(D.thread.binding.leaderGlobalPerLeader * 100)}%，每级再 +0.01 个百分点（Lv1 = +1.00%，Lv10 = +1.09%），作用于 EP / RP / PT / FP / DM 的持续产出（一次性奖励不放大）。领导不占任何岗位、不计入岗位容量，也没有个人产出；等级按在岗经验自动升，任命不重置、卸任也保留，薪资口径与普通线程一致。</p>
    <h4>超线程岗位</h4>
    <p>⚙️ 开局即可用：该线程自由 EP 产出 ×${D.thread.binding.hyperOutputMult}、消耗 ×${D.thread.binding.hyperSalaryMult}，不产出转化资源。它是智能分配的最后兜底岗位。</p>
    <p>班组调「人头」，效能编排调「倍率」，两者分层<b>相乘</b>、互不覆盖：EP、RP、PT、FP、DM 的持续产出各结算一次；<b>DM 探采不吃线程绑定乘区</b>，但吃领导全局加成与编排。</p>
    <h4>懒惰态</h4>
    <p>EP 持续满上限 ${D.lazy.afterSec}s → 线程怠工：产出 ×${D.lazy.prodMult}、消耗 ×${D.lazy.costMult}；EP 跌到 0 或任意购买解除。</p>
  ` },
  { id: 'orchestration', name: '效能编排与相位共鸣', unlock: null, body: () => `
    <h4>四条管线，一次取舍</h4>
    <p>完成 3 个任务或首次晋升后，工作台开放「效能编排」：EP 产出、RP 蒸馏、PT 孵化、DM 采集四条管线共用一份算力，压到一处就要从别处让出来。均衡编排不加不减；产能优先抬 EP、压其余三条；研究优先主推 RP；深渊优先主推 PT 与 DM。切换即时生效，没有冷却，也不会吞掉已攒下的资源。</p>
    <h4>随潮汐排班（第五个选项）</h4>
    <p>「随潮汐排班」与四条策略并排：选中它，编排跟着深渊潮汐轮转——涨潮走产能、平潮回均衡、退潮转研究、乱流切深渊；改选任一策略即退出轮转，立刻固定在那一项。手动选定的策略会被记住，轮转不会覆盖它。完成 8 个任务或职级达到 2 后，四个相位可以各自改排策略（潮汐预案），改乱了点「恢复默认排班」即可。</p>
    <h4>相位共鸣</h4>
    <p>完成 12 个任务或职级达到 2 后，编排卡里多出相位共鸣：开启后，在同一潮汐相位里持续运转每 12 秒叠 1 层，最多 20 层；换相位层数减半。焦点管线每层 +1.5%，其余三条每层 -0.2%——想叠高就得少换相位。</p>
    <h4>和班组的关系</h4>
    <p>这里调的是倍率，班组调的是人头：线程岗位、自由产出与领导者全局加成由班组决定，两边分层<b>相乘</b>、不互相覆盖。卡面四条倍率是策略与相位共鸣合并后的编排倍率，<b>不是全部加成的总和</b>——EP、RP、PT、FP、DM 的持续产出还会再乘班组那一层（DM 只吃领导全局加成，不吃线程绑定乘区）。编排倍率与真实入账同口径：卡面只显示编排这一层，逐秒落账时再乘班组与全局区。</p>
    <p class="wiki-hint">挂机久：守固定相位叠共鸣。人在场：随潮汐排班逐相调整。两条路没有绝对优劣，一条换灵活，一条换深度。</p>
  ` },
  { id: 'tide', name: '潮汐与腐化', unlock: null, body: () => `
    <h4>深渊潮汐（${D.tide.phaseDuration}s/相位 × 4 循环）</h4>
    <table class="wiki-tbl"><tr><th>相位</th><th>产出</th><th>薪资</th><th>科技树价格</th><th>事件</th></tr>
      ${D.tide.phases.map(p => `<tr><td>${p.icon} ${p.name}</td><td>${(p.epMult*100-100|0)}%</td><td>${(p.salaryMult*100-100|0)}%</td><td>${(p.techCostMult*100-100|0)}%</td><td>${p.eventBadWeight>1?'负面 ×'+p.eventBadWeight:'正常'}</td></tr>`).join('')}
    </table>
    <h4>矩阵腐化</h4>
    <p>腐化来源：深入裂隙（单次约 ${D.rift.delveCorruptPerRun}%，随裂隙等级递增、单次上限 ${D.rift.delveCorruptRunCap}%）、深潜（随层深累积）、观测主义政策（+0.02/s）。每 1% 腐化全局产出 -${D.corruption.penaltyPerPercent*100}%（下限 -${(1-D.corruption.penaltyFloor)*100}%），当前腐化上限 ${corruptionCap()}%。</p>
    <h4>主动净化</h4>
    <p>每次最多清除 ${purify.maxCut}% 腐化，EP 成本 ≈ 存储上限 × ${(purify.epCostPerPct*100).toFixed(1)}% × 净化量；DM 析出 = 净化量² × ${purify.dmPerPctSq}（50% → ${50*50*purify.dmPerPctSq} DM，10% → ${10*10*purify.dmPerPctSq} DM）。</p>
    <h4>深渊吞噬倒计时</h4>
    <p>腐化满额（${corruptionCap()}%）→ 启动 ${60}s 倒计时（稳定协议科技 ${180}s）。倒计时一旦启动即锁定——被动净化被深渊压制，唯二解除：① 主动净化压回满额以下；② 倒计时终结时做命运抉择。转生不可脱离深渊：倒计时、抉择与崩溃期间晋升被锁定。</p>
    <p class="wiki-warn">⚠️ 倒计时终结的二选一（不可关闭）：<br>💰 <b>贿赂深渊</b>：上缴 90% EP，腐化清零、本局继续 → 成就「恶魔的朋友」<br>💥 <b>同归于尽</b>：本局湮灭 + 强制转生，湮灭残片 +1 → 成就「凝视深渊」</p>
  ` },
  { id: 'rift', name: '裂隙与余烬', unlock: 'rift', body: () => `
    <h4>深渊裂隙（${D.rift.threadUnlock} 条线程后解锁，首次 ${Math.round((D.rift.firstSpawnSec||D.rift.spawnSec)/60)} 分钟必出，此后基础 ${Math.round(D.rift.spawnSec/60)} 分钟一遇，在场 ${Math.round(D.rift.staySec/60)} 分钟）</h4>
    <p>裂隙初始恒为 <b>Lv.1</b>，不会自行升级：只有购入科技树「裂隙等级」（EP + DM，可无限升）才会变强，每级 +1 级、奖励同步提升。名称沿用 ${D.rift.levelNames.join(' / ')}，超过 5 级统称「虚空之隙」。三个选项：</p>
    <ul>
      <li><b>封印</b>：消耗 EP（存储上限的 30%~50%），得 DM + RP + 余烬。</li>
      <li><b>拥抱</b>：损失 20% EP，换 ×5 爆发。</li>
      <li><b>深入</b>：60s 探索，产出递增 + 腐化累积；超过 ${D.rift.delveFailCorrupt}% 腐化会损失 ${Math.round(D.rift.delveFailLoss*100)}% 封印成本。消耗随裂隙等级 ×1.75/级指数增长。</li>
    </ul>
    <h4>余烬（跨转生保留）</h4>
    <p>封印 +${D.rift.emberSeal} / 拥抱 +${D.rift.emberEmbrace} / 深入 +${D.rift.emberDelve}×级。余烬科技：哨站（间隔缩短，下限 10 分钟）、透镜（封印/拥抱的 DM·RP +20%/级，深入不含）、护符（封印成本 -10%/级）、余烬共振（VS +50%/级）、余烬井喷（余烬 +12%/级）、虚空之心（VS +30%/级），以及三项互斥单开的自动动作与自动净化仪。</p>
    <p class="wiki-hint">腐化满额或吞噬倒计时期间不会触发新裂隙（走吞噬路径，避免机制叠加）。想刷余烬就反复 Lv1 封印；想要高阶奖励再升裂隙等级。</p>
  ` },
  { id: 'religion', name: '宗教与虔诚', unlock: 'faith', body: () => `
    <h4>宗教分支（选一锁定，跨转生保留）</h4>
    <p>${RELIGIONS.map(r => `${r.name}（${r.effect}）`).join(' / ')}。</p>
    <h4>赞颂 → 虔诚 → 超验</h4>
    <p><b>FP</b> 由圣所产出 → 达到容量 ${PRAISE.thresholdRatio*100}% 可<b>赞颂</b>，转化出跨轮保留的<b>虔诚</b> → 消耗虔诚<b>超验</b>提升层级（成本 ${PRAISE.transcendBase}×${PRAISE.transcendGrowth}^级）。</p>
    <ul>
      <li>赞颂转化率 = 1 + 0.25 × 超验层级²</li>
      <li>虔诚全局加成 = √虔诚 × ${PRAISE.devPerSqrt}（软上限 +${PRAISE.devSoftCap*100}%，超过 ${PRAISE.devSoftAfter} 后衰减 50%；黑曜圣所 +10%/座）</li>
      <li>信仰容量 = ${faithCap()}（基础 ${FP_BALANCE.capBase} + 誓约圣龛首级 +${FP_BALANCE.capPerVaultLv}、逐级 +${Math.round((FP_BALANCE.capVaultGrowth - 1) * 100)}% + 圣印 ×${FP_BALANCE.sealCapPerLv} + 虚空祭坛 ×1.5/座）</li>
      <li>圣所每级 +${FP_BALANCE.ratePerTempleLv} FP/s，容量按「同等级约 ${FP_BALANCE.targetFillSec / 3600} 小时产出」标定</li>
    </ul>
    <h4>隐密圣学（跨周期保留，解锁科技每轮重研）</h4>
    ${SECRET_SANCTUMS.map(s => `<p>· <b>${s.name}</b>（超验 ≥${s.needTranscend}，虔诚门槛 ${s.devGate}）：${s.desc}</p>`).join('')}
    <h4>解锁链</h4>
    <p>仓库解锁 → 分支选择（RP/DM/ES 逐级开放）→ 圣印首次升级后出现「赞颂 / 超验」→ 首次超验后出现「隐密圣学」→ 圣印 ≥3 出神谕塔、圣所 ≥5 出圣战军 → 章节「神格」与终局共振。</p>
    <p>圣所不设等级上限，价格随等级递增；关闭圣所会暂停 FP 产出与 EP 消耗，但损失 30% FP + 15% 虔诚。</p>
  ` },
  { id: 'policy', name: '周期政策', unlock: 'policy', body: () => `
    <h4>组内互斥，每轮重选</h4>
    <p>每局（晋升后）按跨周期资产开放政策组，共 ${POLICY_GROUPS.length} 组；组内互斥，每组 2~3 选一，选 A 锁同组其余项。效果正负成对（±10~30%）：拿一头强，必吃另一头弱。改选消耗回响/虔诚 ×2^n；立誓流派改选成本翻倍，中立流派半价。</p>
    ${POLICY_GROUPS.map(g => `<p><b>${g.name}组</b>：${g.policies.map(p => `${p.name}（${p.desc}）`).join(' / ')}</p>`).join('')}
    <p class="wiki-hint">立誓（岔路口买定向建筑）→ 本局政策幅度 +5%；中立 → 改选成本半价。有可选未定的政策时，政策页签会挂感叹号。</p>
  ` },
  { id: 'delve', name: '深潜', unlock: 'delve', body: () => `
    <h4>终局层：等级 / 经验 / VS 跨转生保留</h4>
    <p>解锁：ES ≥ ${DELVE.unlockEs} + DM 已发现 + 宗教已信奉。深潜是<b>周期玩法</b>：每 ${DELVE.cycleSec / 60} 分钟结算一次，同一次里给 VS、扣 EP、涨腐化——按「/10 分钟」看数比按秒看更准。</p>
    <ul>
      <li><b>产出</b>：每周期 +${DELVE.vsCycleBase} × (1 + ${DELVE.vsDepthMult} × 等级) × (1 + 0.5 × 深潜器) VS，再乘遗物《湮灭刻印》、科技「虚空视界」、研究「深渊观测」、回响与政策。</li>
      <li><b>消耗</b>：每周期 -（你 10 分钟的 EP 产出 × (${DELVE.epDrainBase} + ${DELVE.epDrainPerDepth} × 等级)），下限为存储上限的 ${(DELVE.epDrainFloorRatio * 100).toFixed(0)}%；耐压舱 -${DELVE.hullDrainCut * 100}%/级。</li>
      <li><b>腐化</b>：每周期 +${DELVE.corruptPerCycle}% × 等级，净化核心 -30%/级。</li>
      <li><b>等级只用 VS 堆</b>：往经验条注入虚空碎片（首级 ${DELVE.levelBase} VS，每级 ×${DELVE.levelGrowth}），填满 +1 级；等级抬高产出，也抬高消耗与腐化。</li>
      <li><b>撑不住就上浮</b>：EP 不足按可用比例结算，EP 归零自动上浮，等级与经验条都保留。</li>
    </ul>
    <p>当前等级：Lv.${delveDepth()}。里程碑（一次性 VS）：${DELVE.milestones.map(m => `${m.depth} 级 +${m.vs} VS`).join(' / ')}（100 级得「深渊之眼」终局徽记）。</p>
    <h4>深潜升级树（VS 消耗，${Object.keys(DELVE.upgrades).length} 项）</h4>
    <p>${Object.values(DELVE.upgrades).map(u => `${u.name}（${u.desc}）`).join(' / ')}。</p>
    <p class="wiki-hint">经验条与升级树抢同一份 VS：想快些下潜就堆等级，想提高单位周期收益就先补深潜器/耐压舱。</p>
  ` },
  { id: 'bazaar', name: '深渊集市', unlock: 'bazaar', body: () => `
    <h4>单向兑换</h4>
    <p>解锁：第 ${CHAPTER_GATES.bazaar} 章起、完成首次晋升后，在职级点商店用 5 PP 买断。矩阵夹层里把富余资源换成稀缺资源；每次上架 ${BAZAAR.minDealers}~${BAZAAR.maxDealers} 个摊位，每 ${Math.round(BAZAAR.marketRefreshSec / 60)} 分钟整批换新。</p>
    <table class="wiki-tbl"><tr><th>商人</th><th>兑换</th><th>等级门槛</th></tr>
      ${BAZAAR.dealers.map(d => `<tr><td>${d.icon} ${d.name}</td><td>${RES_LABEL[d.from]} → ${RES_LABEL[d.to]}</td><td>${d.tier > 0 ? 'Lv.' + d.tier : '—'}</td></tr>`).join('')}
    </table>
    <h4>商品品质（6 档）</h4>
    <p>${QUALITY.map(q => `${q.name}（库存 ${q.stock}）`).join(' / ')}。品质越高库存越少、单价越贵，但单位产出越高；集市等级抬高高品质权重。</p>
    <h4>汇率波动</h4>
    <p>每个摊位有独立汇率倍率，区间 [${(1 - BAZAAR.volatility).toFixed(2)} + 0.05×等级, ${(1 + BAZAAR.volatility).toFixed(2)}]，作用在每批所得上（×1.20 = 多得 20%）。集市等级只抬高波动下限，永不消除波动。</p>
    <h4>刷新</h4>
    <p>手动刷新换一批摊位并重掷汇率/品质、补满库存：EP 成本 = 存储上限 × ${(BAZAAR.refreshEpRatio * 100).toFixed(0)}% × ${BAZAAR.refreshGrowth}^本轮刷新次数。买「回响账簿」后多一个回响刷新按钮（${BAZAAR.echoRefresh} 回响，不花 EP）。随机事件：🔥特惠 ×1.2 / 📈涨价 ×0.8；「二次确认」是独立开关。</p>
    <h4>集市等级（跨周期保留）</h4>
    <p>按累计成交笔数升级：${BAZAAR.tiers.map((n, i) => `Lv.${i}（${n} 笔）`).join(' / ')}。等级抬高汇率波动下限、提高高品质概率、解锁高阶商人。成交笔数与等级跨轮保留，摊位/库存/汇率/刷新次数每轮重置。</p>
    <p>商品交付的资源若尚未解锁（例如没开深潜却撞到虚空商行），该摊位灰显并标「未解锁」，不可购买。</p>
  ` },
  { id: 'expedition', name: '星空与远征', unlock: 'policy', body: () => {
    const g1 = GALAXIES[0], gN = GALAXIES[GALAXIES.length - 1];
    return `
    <h4>远征</h4>
    <p>星图页派出探测队：消耗 EP/RP/PT 发射，航行 ${g1.durDays}~${gN.durDays} 天（游戏内天数），完成拿 CPS 与星尘类资源；研究「跃迁理论」每级 +6% 缩短航行时间，出战异兽每只 +10% CPS。</p>
    <h4>殖民地与燃料模式</h4>
    <p>远征过的星系可花 CPS 建立殖民地：建立是一次性支出，之后该星系按秒产 RP（越高越远越丰厚），并让后续探索更便宜、更快。燃料模式：每秒燃烧 2 CPS 换全局产出 ×1.5，CPS 烧完自动关闭——爆发期手法。</p>
    <h4>去多远</h4>
    <p>${GALAXIES.map(g => `${g.icon}${g.name}（CPS 门槛 ${fmt(g.cpsReq)}，奖励 CPS ${fmt(g.cps)}${g.es ? ` + ES ${g.es}` : ''}）`).join(' → ')}。银河边缘与仙女座额外给 ES，是晋升之外唯一稳定 ES 来源。</p>
    <p class="wiki-hint">星图未开放时研究分组「星际」也不摆出；PT 是本局制，转生后要重新点亮异兽才会再开星图。</p>
  `; } },
  { id: 'eternals', name: '永恒矩阵', unlock: 'es', body: () => `
    <h4>ES 花在哪</h4>
    <p>科技树底部的「永恒矩阵（ES 购买）」用晋升攒下的 ES 买永久强化：全局产出、成本折扣、点击、离线、事件、项目、里程碑、开局 EP，以及主打 AI 的「永恒拟我」（决策间隔 -8%/级，下限 40%）与前期丝滑的「永恒摇篮」（开局 +12 RP/级）。</p>
    <h4>计价与上限</h4>
    <p>每项按 base × growth^已购级 几何计价，多数无上限可一直买；皮肤四款（晨光白昼 / 余烬琥珀 / 薄荷绿潮 / 秋日鎏金）为一次性解锁，买断后顶栏皮肤菜单出现对应选项。</p>
    <h4>和晋升 RP 的分工</h4>
    <p>职级点管全局加速（前 30 点 +10%/点，之后按平方根减速），ES 管细分方向的定向强化。两者都跨晋升保留，是长线滚雪球的两条主轴。</p>
  ` },
  { id: 'prestige', name: '晋升循环', unlock: 'prestige', body: () => `
    <h4>晋升（唯一循环）</h4>
    <p>本局累计 EP ≥ ${fmt(3e9*Math.pow((S.prestige||0)+1,1.5))} → 晋升：清空本局，获职级点（前 30 点每点全局 +10%，之后减速）+ RP + ES + 深渊回响，三选一天赋，并按本局最强维度传承 1 座「深渊遗存」。</p>
    <table class="wiki-tbl"><tr><th>升</th><th>留</th></tr>
      <tr><td>EP、RP、PT、CPS、线程、升级、建筑、任务、政策、编排、裂隙等级</td><td>职级点、RP 累计、ES、回响、余烬、虔诚、宗教、遗物、深潜等级与经验、集市等级、成就、故事线进度</td></tr>
    </table>
    <h4>晋升 RP 加成</h4>
    <p>完成首次晋升后开放：初探实验台（每级晋升 RP +30%）/ RP 蒸馏塔（+50%）/ 深度实验室（×2）/ 理论突破台（+150%）/ 传奇研究所（×2），RP 购买、逐级解锁。</p>
    <h4>回响与遗存</h4>
    <p>每次晋升结算回响 = min(${D.reincarn.echoCap}, ${D.reincarn.echoBase}×√(本局成就评分))，每点全局 +${(D.reincarn.echoPerPoint*100).toFixed(0)}%（跨轮保留）。每次晋升按本局最强维度携带 1 座遗存（同种上限 ${D.reincarn.legacyCap}）：${D.reincarn.legacy.map(L => L.name + '（' + L.desc + '）').join(' / ')}。</p>
    <h4>回响商店（永久）</h4>
    <p>${D.reincarn.upgs.map(u => `${u.name}（${u.desc}）`).join(' / ')}。</p>
    <p class="wiki-warn">深渊吞噬期间晋升被锁定——转生不可脱离深渊，只有命运抉择能终结。</p>
    <p class="wiki-hint">阈值 = 30 亿 ×(晋升次数+1)^1.5。卡刚过线晋升，单位时间推进最快；长局适合在拿成就评分或刷遗存方向时再拖。</p>
  ` },
  { id: 'research', name: '研究与科技', unlock: null, body: () => `
    <h4>科技树：开系统，不堆数值</h4>
    <p>科技树用 RP 点亮钥匙科技：离线协议、专注优化、熵减、AI 管理核心、混沌护盾、深空探测等。每一把钥匙对应一个系统的入口（AI 自动化、星图、离线续航、裂隙抗性），数量不多，优先点能开出新玩法的那些。</p>
    <h4>研究升级：分六组共 ${D.researchUpgs.length} 项</h4>
    <p>研究点页按组渐进揭示，未达条件的组不占版面：</p>
    <table class="wiki-tbl"><tr><th>组</th><th>开启条件</th><th>项数</th></tr>
      ${RP_GROUPS.map(g => `<tr><td>${g.name}</td><td>${RP_GATE[g.key] || '—'}</td><td>${g.ids.length}</td></tr>`).join('')}
    </table>
    <h4>里程碑与族升级</h4>
    <p>里程碑按本局 EP/s 阈值（100/s 起共 16 档）发放 RP；族升级在里程碑 9 之后开放，RP + 里程碑双门控。</p>
    <h4>离线</h4>
    <p>「远程协作」提供离线效率基线，离线升级再叠加效率与上限：最高 110% 效率、上限 10 小时，超时部分不计。</p>
    <p class="wiki-hint">研究项一条轴只留一个锚点升级（例如 EP 产出、线程产出、存储上限各一项），升满再换轴比同时摊开更划算。</p>
  ` },
  { id: 'auto', name: 'AI 助手与自动化', unlock: null, body: () => `
    <h4>助手是常驻编制</h4>
    <p>助手不是一次性燃料，而是自动化工人池——购买即扩编，不随动作消耗。每个决策周期，所有开启的动作岗位分到若干名助手，每个动作每周期的执行次数 = 分到的工人数。助手数不足以覆盖全部开启动作时，低优先级动作（进阶组）临时挂起，面板与日志会写「编制不足」，再购买助手即自动全开。</p>
    <h4>扩编与定价</h4>
    <p>唯一来源是手动扩编：第 1 名 ${fmt(BALANCE.ai.assistants.baseCost)} EP，之后每名价格 ×${BALANCE.ai.assistants.costGrowth}，数量无上限。编制只增不减；「拟我协议」等研究同时降低购买价。</p>
    <h4>占编就是开关</h4>
    <p>面板上每个动作只有「名称 + − 数字 +」：数字是该动作绑定的助手数，绑了就是开启，绑 0 就是关闭，没有额外 ON/OFF。基础三项（自动升级 / 自动招募 / 自动领取）各上限 1 名——一个决策周期只结算一次，多绑白占人手；进阶两项（自动研究 / 自动购建）不设上限。把每个动作的 − 按到底就是全停。进阶两项在真正解锁前整张卡不出现。</p>
    <h4>预算保护与节拍</h4>
    <p>自动升级、招募与购建要保证扣费后 EP 不低于预留线（默认 EP 上限的 ${Math.round(BALANCE.ai.defaultReserve * 100)}%）；编制充足但 EP 贴近预留线时动作同样暂停，这是预算保护。基础决策间隔 ${BALANCE.ai.interval} 秒；深潜「拟态矩阵」每级缩短 20%（下限 40%），遗物「混沌触须」每级再缩短 10%（下限 50%）。</p>
    <h4>台账与接管</h4>
    <p>本局执行次数按动作（升级、招募、领取、购建、研究）+ 合计记录，只描述「跑过多少次」，不参与数值结算；把鼠标移到助手行左侧的「空闲/总数」即可查看。勾选「混沌心智」后 AI 自动化被永久接管，编制不再变动也不退还，接管不可取消。</p>
    <p class="wiki-hint">助手只决定「动作能不能执行」，不参与任何产出倍率。三者正交：编排调四条管线倍率，班组调人头，助手调节拍。</p>
  ` },

  // ───────────────────────────── 查阅 ─────────────────────────────
  { id: 'unlock', name: '解锁条件总表', unlock: null, body: () => `
    <h4>系统与功能</h4>
    <table class="wiki-tbl"><tr><th>内容</th><th>解锁条件</th><th>说明</th></tr>
      <tr><td>科技树</td><td>第 1 章 ∧ 购入矩阵存储库</td><td>RP 消耗，开辟玩法</td></tr>
      <tr><td>研究升级</td><td>同科技树（研究点页）</td><td>分六组共 ${D.researchUpgs.length} 项：产能研究 / 储备扩容 / 深渊协议 / 深渊扩展 / AI 助手 / 星际，见「研究与科技」</td></tr>
      <tr><td>晋升 RP 加成</td><td>完成首次晋升</td><td>研究点页「晋升 RP 加成」分区</td></tr>
      <tr><td>族升级</td><td>里程碑 9 达成</td><td>研究点页底部，RP + 里程碑双门控</td></tr>
      <tr><td>异兽（PT）</td><td>购入饵料仓库 / PT 金库，或首次持有 PT</td><td>本局制；孵化需先买「孵化升级」；星图在异兽之后</td></tr>
      <tr><td>灵感工坊</td><td>EP 或累计产出 ≥15,000 后商店摆出首购卡</td><td>首购 50K EP，自动蒸馏 RP</td></tr>
      <tr><td>探采平台（基础）</td><td>首次触发深渊裂隙</td><td>外勤摩托队即可开张；载具只消耗 EP 换 DM，不产 EP</td></tr>
      <tr><td>探采高级 / 深渊商店</td><td>第 ${CHAPTER_GATES.starchart} 章（星图接入）</td><td>后三档载具与 4 项深渊升级随星图放开</td></tr>
      <tr><td>深渊遗物</td><td>第 ${CHAPTER_GATES.relics} 章 ∧ 裂隙已触发 ∧ DM 已发现</td><td>遗物页</td></tr>
      <tr><td>裂隙页</td><td>首次触发深渊裂隙</td><td>余烬升级树、深入探索</td></tr>
      <tr><td>宗教</td><td>第 ${CHAPTER_GATES.religion} 章 ∧ 备用粮仓 ≥3 ∧ RP 觉醒</td><td>面板「唤醒信仰」，选一锁定</td></tr>
      <tr><td>政策</td><td>第 ${CHAPTER_GATES.policy} 章 ∧ 开放任一政策组</td><td>每轮重选，有可选项时页签挂感叹号</td></tr>
      <tr><td>相位共鸣</td><td>第 ${CHAPTER_GATES.resonance} 章 ∧ 完成 12 个任务或职级 ≥2</td><td>效能编排卡内</td></tr>
      <tr><td>深潜</td><td>第 ${CHAPTER_GATES.delve} 章 ∧ ES ≥3 ∧ DM 已发现 ∧ 宗教已信奉</td><td>深潜页，终局层</td></tr>
      <tr><td>深渊集市</td><td>第 ${CHAPTER_GATES.bazaar} 章 ∧ 职级 ≥1（5 PP 买断）</td><td>集市页，富余资源换稀缺资源</td></tr>
      <tr><td>晋升</td><td>第 4 章 ∧ 本局累计 EP 达标（首次 30 亿）</td><td>晋升页</td></tr>
      <tr><td>星图（远征）</td><td>第 ${CHAPTER_UNLOCKS.find(x => x.id === 'starchart').chapter} 章 ∧ 异兽/PT 锚点完成 ∧ RP 锚点完成 ∧（科技「深空探测」或已有远征记录）</td><td>消耗 EP/RP/PT 换 CPS；PT 本局制，转生后需重新点亮</td></tr>
      <tr><td>故事线 / 岔路口</td><td>游玩满 1.5 天（第 5 章前后）</td><td>三线立誓，单局锁定</td></tr>
      <tr><td>宇宙探索</td><td>星图已开放 ∧ 科技「深空探测」∧ RP 已发现</td><td>6 项大工程，一次性消耗 CPS 换多资源</td></tr>
      <tr><td>效能建筑</td><td>购入矩阵存储库</td><td>商店「效能建筑」分区</td></tr>
      <tr><td>离线续航</td><td>科技「远程协作」+ 离线升级</td><td>最高 110% 效率、上限 10 小时</td></tr>
      <tr><td>AI 助手</td><td>科技树「AI 管理核心」（50 RP + 100 万 EP，跨晋升保留）</td><td>扩编走研究「助手扩编协议」；自动购建需全资源点解锁后一次性激活</td></tr>
      <tr><td>永恒矩阵</td><td>第 ${CHAPTER_GATES.eternals} 章 ∧ 首次晋升获得 ES</td><td>科技树页底部</td></tr>
      <tr><td>镜像契约</td><td>第 ${CHAPTER_GATES.mirror} 章 ∧ 职级 ≥1</td><td>镜像页第一块：每局签 1 份，达成后本局产出 +20%~30%</td></tr>
      <tr><td>算力战争</td><td>第 ${CHAPTER_GATES.mirrorwar} 章</td><td>镜像页第二块：本局产出折算战功，买跨转生军备</td></tr>
      <tr><td>三方议会</td><td>第 ${CHAPTER_GATES.mirrorcouncil} 章</td><td>镜像页第三块：每局一席，三席齐 → 永久 +5% 全局</td></tr>
    </table>
    <h4>存储与资源建筑</h4>
    <p><b>矩阵存储库</b>：EP 溢出一次后开放，购入解锁研究点（RP 上限 = 2,500 + 逐级扩容 + 产出基座）。<b>星尘金库</b>：首辆载具或 DM 到手后开放（DM 上限 1,000 起）。<b>饵料仓库</b>：第 ${CHAPTER_UNLOCKS.find(x => x.id === 'pets').chapter} 章后开放（PT 上限 1,000 起）。三座仓库都要求「EP 存储上限 ≥ 全价」才摆出，避免摆出买不起的死锁。</p>
    <p>EP 侧：前期备用粮仓（+4,000/级、20 级封顶），后期存储节点（+12,000/级、无限级）。RP 仓容带产出基座，但要星图开启后研究「星图同调」才启用；晋升后，本局扩容与产出基座一起归零。</p>
  ` },
  { id: 'appendix', name: '数值与公式', unlock: null, body: () => `
    <h4>成本曲线</h4>
    <ul>
      <li>升级/建筑：base × growth^级 × costMult()（默认 growth 1.30；50 级后每级额外 ×1.08）</li>
      <li>扩容类：无限升级 + 30% 防死锁钳制（价格 ≤ 当前上限 ×30%）</li>
      <li>线程招募：firstCost × 1.25^线程数</li>
      <li>专注：30 × 1.6^级（每级 +8% → +12% → +20% 递增加成；专注优化 -25%、专注心核再 -25% 降价）</li>
      <li>手动蒸馏：用 EP 换 1 RP，成本随蒸馏塔等级下降，效率带递增</li>
      <li>探采平台：载具价 ×1.30^已购数；载具 cps = 0（不产 EP）；EP→DM 汇率 = ${fmt(D.vehicles.epPerDm)} × ${D.vehicles.epPerDmGrowth}^总载具数；载具协议使 DM 采集 ×${D.vehicles.protocolMult}</li>
    </ul>
    <h4>效能建筑 · 全局产出</h4>
    <p>卡面统一写「每级全局产出 +X%」，含义是<b>本级在当前产出基础上带来的增量</b>：加算建筑把 X 个百分点加进全局加法区，乘算建筑按 ×(1+X%) 复利叠进全局乘区，所以同类文案下乘算项的长期收益更高、后期单价也更贵。入门三座（预热节点 / 效能尖塔 / 双倍工坊）按每 +1% 同一基价定价、成本递增同为 ×1.40，同一等级下价格比恒等于加成比；越往后的建筑每 +1% 的单价逐档抬高。</p>
    <h4>全局乘数软上限</h4>
    <p>m > ${fmt(D.softCapThreshold)} → ${fmt(D.softCapThreshold)} + √(m-${fmt(D.softCapThreshold)}) × ${D.softCapFactor}（防无限滚）。</p>
    <h4>一节拍是多少</h4>
    <table class="wiki-tbl"><tr><th>周期</th><th>长度</th><th>用在哪</th></tr>
      <tr><td>帧结算</td><td>每秒</td><td>线程产出、薪资、转化、腐化、任务推进</td></tr>
      <tr><td>潮汐相位</td><td>${D.tide.phaseDuration}s</td><td>产出/薪资/科技价倍率、相位共鸣</td></tr>
      <tr><td>AI 决策</td><td>${BALANCE.ai.interval}s 起</td><td>自动升级/招募/领取/研究/购建</td></tr>
      <tr><td>深潜周期</td><td>${DELVE.cycleSec/60} 分钟</td><td>VS 结算、EP 扣除、腐化累积</td></tr>
      <tr><td>集市刷新</td><td>${Math.round(BAZAAR.marketRefreshSec/60)} 分钟</td><td>整批换摊位</td></tr>
      <tr><td>离线</td><td>上限 10 小时</td><td>按离线效率结算</td></tr>
    </table>
  ` },
  { id: 'ach', name: '成就', unlock: null, body: () => `
    <h4>成就（跨转生保留，达成即点亮）</h4>
    <p>覆盖产出、晋升、宗教、政策、裂隙、深潜、AI、剧情与彩蛋等维度；未达成不显示，达成即点亮并跨转生保留，判定只读当前存档状态。</p>
    <p class="wiki-hint">常见节点：见多识广（100 次事件）/ 七政齐备（7 项政策）/ 归档之人（第 22 章进度）/ 理论满架（研究 35 级）/ 立誓者 / 裂隙守夜（8 道）/ 半身入渊（腐化 50%）/ 任务熟练（50 个任务）。</p>
    <h4>吞噬专属</h4>
    <p>🤝 <b>恶魔的朋友</b>：倒计时终结选贿赂深渊<br>🌑 <b>凝视深渊</b>：倒计时终结选同归于尽<br>🌑 <b>被深渊吞噬</b>：本局被深渊吞没</p>
    <p class="wiki-hint">成就不只是收集：晋升回响 = 系数 ×√成就评分，想多拿回响就把成就当任务清单刷。</p>
  ` },
  { id: 'misc', name: '许愿池与彩蛋', unlock: null, body: () => `
    <h4>许愿池</h4>
    <p>购入通用设施「许愿池」（100K EP）后，屏幕边缘出现可拖动/可收起的浮窗：投一枚硬币（100 EP，3 秒冷却），万分之 1 概率得 100K EP（受存储上限约束，溢出转入 RP 池）。投币计数与中奖各挂一枚成就。</p>
    <h4>特殊任务（后台自动判定，达成即日志 + toast）</h4>
    <p>隐藏的一次性目标，不占任务版，条件不满足不触发。</p>
    <table class="wiki-tbl"><tr><th>任务</th><th>达成条件</th><th>结果</th></tr>
      <tr><td>🏛️ 博物馆的访客</td><td>同时拥有 3 种工位（主商店「工位」分类下的升级），且工位等级之和 ≥50；触发后每 60s 日志提醒进度</td><td>商店「工位」分类标题永久佩戴「馆藏认证」徽章</td></tr>
      <tr><td>🧵 最后的线程</td><td>线程总数达到 100 名</td><td>纪念性收录</td></tr>
      <tr><td>🎁 离职礼物</td><td>线程进入流失预警时，任务版出现「离职礼盒」按钮，花 1 EP 买下</td><td>流失记录 + 5 分钟召回窗 + 成就「临别赠礼」</td></tr>
      <tr><td>👁️ 深渊凝视</td><td>深渊行者线，腐化达到 30</td><td>DM +2</td></tr>
      <tr><td>📢 传教</td><td>信仰传播者线，线程总数达到 50 名</td><td>FP +5</td></tr>
    </table>
    <h4>🥚 彩蛋（隐藏触发）</h4>
    <p>EP 恰好 42 时点击工作台 / 凌晨 4 点打开游戏 / 连续 5 次晋升不选天赋 / 挂机 30 分钟不动 / 开局 1 分钟不操作 / 同时清空线程·升级·科技且信仰 ≥1000 / 按序购入 warmup→lean→speed2→quantum2 / 拥有影猫时连点它 10 次。发现即日志留痕，部分藏资源奖励（PT / DM / RP），收集记录跨晋升保留。</p>
  ` },
];

export function wikiUnlocked(key) { return unlocked(key); }
