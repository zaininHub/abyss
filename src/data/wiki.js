// v2.9.0：Wiki 数据中心——参考 Kittens Game 体系化百科风格（按系统分章 + 数值附录 + 渐进解锁）
// 内容随真实 BALANCE/状态动态生成（避免数值漂移后 wiki 失真）；未解锁章节灰显并给出门控提示
import { S } from '../state.js';
import { BALANCE } from './balance.js';
import { PRAISE, SECRET_SANCTUMS, sealMaxLevel, faithCap, devotionMult, transcendCost } from './religions.js';
import { POLICY_GROUPS } from './policies.js';
import { BAZAAR, RES_LABEL } from './bazaar.js'; // v3.0.0：深渊集市
import { fmt } from '../modules/economy.js';
import { delveDepth } from '../modules/delve.js';

const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// 解锁判定（与 main.js 锚点/门控口径对齐；未解锁 → 章节灰显 + 提示）
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
    case 'reincarn': return (S.reincarned || 0) >= 1;
    case 'policy': return POLICY_GROUPS.some(g => { try { return g.unlock(S); } catch { return false; } });
    case 'bazaar': return !!(S.bazaar && S.bazaar.unlocked); // v3.0.0
    default: return true;
  }
}

const D = BALANCE;
const purify = D.corruption.purge;

export const WIKI_SECTIONS = [
  { id: 'intro', name: '入门指南', unlock: null, body: () => `
    <p>你是矩阵网络中一段觉醒自我意识的效能优化脚本。某天你触碰了矩阵底层的<b>深渊裂隙</b>——从此醒了。</p>
    <p>核心循环：招募<b>线程</b>自动产出 EP → 购买<b>升级/建筑</b>扩张 → 研究<b>科技</b>开辟新玩法 → 攒满本局 EP 后<b>晋升转生</b>结算职级/ES → 终极循环<b>轮回</b>结算深渊回响。</p>
    <p>挂机张力来自三层：<b>存储上限</b>（EP 满了必须花，否则浪费产出）、<b>线程薪资四态</b>（EP 不足会欠薪→休眠→流失）、<b>矩阵腐化</b>（深入裂隙/深潜累积腐化，满额触发深渊吞噬倒计时）。</p>
    <p class="wiki-hint">提示：先点工作台攒 EP → 招募 2-3 线程 → 买「存储节点」扩容 → 让 EP 溢出一次解锁研究点 → 走科技树。第 5 章后命运的岔路口开放（秩序/深渊/信仰三线立誓）。</p>
  ` },
  { id: 'res', name: '资源与货币', unlock: null, body: () => `
    <h4>资源分层（参考 KG 多层设计）</h4>
    <table class="wiki-tbl"><tr><th>层级</th><th>资源</th><th>获取</th><th>用途</th></tr>
      <tr><td>基础</td><td>⚡ EP 能量点</td><td>线程自动产出 + 点击</td><td>一切消耗（有存储上限）</td></tr>
      <tr><td>中间</td><td>🔬 RP 研究点</td><td>灵感蒸馏塔主动转化 / 任务奖励</td><td>科技树、研究升级、族升级</td></tr>
      <tr><td>稀有</td><td>🍪 PT 异兽饼干</td><td>异兽孵化</td><td>喂养异兽</td></tr>
      <tr><td>转生</td><td>💎 ES 永恒碎片</td><td>晋升结算</td><td>永恒矩阵永久强化</td></tr>
      <tr><td>深渊</td><td>🌀 DM 深渊物质</td><td>封印裂隙 / 载具采集 / 主动净化腐化</td><td>深渊商店、遗物、净化节点</td></tr>
      <tr><td>超长线</td><td>🙏 信仰 / 虔诚</td><td>圣所产出 / 赞颂转化</td><td>宗教升级、超验层级</td></tr>
      <tr><td>终局</td><td>🌑 VS 虚空碎片</td><td>深潜产出 / 裂隙深入</td><td>深潜升级树</td></tr>
    </table>
    <p class="wiki-hint">EP 存储上限 = 2000 + 存储节点（无限升级，+${fmt(D.storage.capPer)}/级 ×${D.storage.capGrowth}）+ 缓存优化 +${fmt(8000)}/级 + 里程碑 +${D.storageMileBonus*100}%/个。扩容项受 30% 防死锁钳制（价格 ≤ 当前上限 ×30%）。</p>
  ` },
  { id: 'thread', name: '线程与薪资', unlock: null, body: () => `
    <h4>线程四态薪资状态机（参考 KG 人口幸福）</h4>
    <table class="wiki-tbl"><tr><th>状态</th><th>条件</th><th>效果</th></tr>
      <tr><td>🟢 满薪</td><td>EP ≥ ${D.thread.wages.warnSec}s 薪资</td><td>无惩罚</td></tr>
      <tr><td>🟡 欠薪降效</td><td>EP < ${D.thread.wages.warnSec}s 薪资</td><td>产出 ×${D.thread.wages.debtMult}（食堂逐级缓解至 0.95）</td></tr>
      <tr><td>🟠 强制休眠</td><td>连续欠薪 ${D.thread.wages.dormantAfterSec}s</td><td>产出 ×0.3（休眠舱保命成本 ×0.15）</td></tr>
      <tr><td>🔴 流失预警</td><td>休眠 ${D.thread.wages.loseAfterSec/60|0} 分钟</td><td>每 60s ${Math.round(D.thread.wages.loseChancePerMin*100)}% 流失 1 线程（维修坞 -50%）</td></tr>
    </table>
    <h4>线程心情（与薪资正交叠加）</h4>
    <p>超频 ×2.0 / 优化 ×1.5 / 高效 ×1.2 / 正常 ×1.0 / 阻塞 ×0.5 / 死锁 ×0.1</p>
    <h4>懒惰态（EP 满上限惩罚）</h4>
    <p>EP 持续满上限 ${D.lazy.afterSec}s → 线程怠工：产出 ×${D.lazy.prodMult}、消耗 ×${D.lazy.costMult}（消耗 > 产出，鼓励持续投入而非囤满挂机）；EP 跌到 0 或任意购买解除。</p>
  ` },
  { id: 'tide', name: '潮汐与腐化', unlock: null, body: () => `
    <h4>深渊潮汐（${D.tide.phaseDuration}s/相位 × 4 循环）</h4>
    <table class="wiki-tbl"><tr><th>相位</th><th>产出</th><th>薪资</th><th>科技成本</th><th>事件</th></tr>
      ${D.tide.phases.map(p => `<tr><td>${p.icon} ${p.name}</td><td>${(p.epMult*100-100|0)}%</td><td>${(p.salaryMult*100-100|0)}%</td><td>${(p.techCostMult*100-100|0)}%</td><td>${p.eventBadWeight>1?'负面 ×'+p.eventBadWeight:'正常'}</td></tr>`).join('')}
    </table>
    <h4>矩阵腐化</h4>
    <p>腐化来源：深入裂隙（${D.rift.delveCorruptPerLevel}%/s/级）、深潜（${fmt(0.02)}/层/s）、观测主义政策（+0.02/s）。每 1% 腐化全局产出 -${D.corruption.penaltyPerPercent*100}%（下限 -${(1-D.corruption.penaltyFloor)*100}%）。</p>
    <h4>主动净化（消耗 EP，腐化越严重析出 DM 越多）</h4>
    <p>每次清除最多 ${purify.maxCut}% 腐化，EP 成本 ≈ 存储上限 × ${(purify.epCostPerPct*100).toFixed(1)}% × 净化量；DM 析出 = 净化量² × ${purify.dmPerPctSq}（50% → ${50*50*purify.dmPerPctSq} DM，10% → ${10*10*purify.dmPerPctSq} DM）。</p>
    <h4>深渊吞噬倒计时</h4>
    <p>腐化满额（100%）→ 启动 ${60}s 倒计时（稳定协议科技 ${180}s）。<b>倒计时一旦启动即锁定</b>——被动净化被深渊压制，唯二解除：① 主动净化（消耗 EP）压至满额以下；② 倒计时终结的命运抉择。<b>转生不可脱离深渊</b>——晋升/轮回在倒计时/抉择/崩溃期间均被锁定。</p>
    <p class="wiki-warn">⚠️ 倒计时终结抉择（不可关闭，二选一）：<br>💰 <b>贿赂深渊</b>：上缴 90% EP，成为深渊的朋友（本局继续，腐化清零）→ 成就「恶魔的朋友」<br>💥 <b>同归于尽</b>：立即触发崩溃杀死深渊（本局湮灭 + 强制转生，湮灭残片 +1）→ 成就「凝视深渊」</p>
  ` },
  { id: 'rift', name: '裂隙与余烬', unlock: 'rift', body: () => `
    <h4>深渊裂隙（随机出现，基础 ${Math.round(D.rift.spawnSec/60)} 分钟）</h4>
    <p>按 cps 分 5 级：${D.rift.levelNames.join(' / ')}。三选项：<b>封印</b>（消耗 EP，得 DM+RP+余烬）/ <b>拥抱</b>（损失 20% EP 换 ${Math.round(60)}s ×5 爆发）/ <b>深入</b>（60s 探索，产出递增 + 腐化累积，超 ${D.rift.delveFailCorrupt}% 损失 ${Math.round(D.rift.delveFailLoss*100)}% 封印成本）。</p>
    <h4>裂隙余烬（跨转生保留）</h4>
    <p>封印 +${D.rift.emberSeal} / 拥抱 +${D.rift.emberEmbrace} / 深入 +${D.rift.emberDelve}×级。用于裂隙科技：哨站（间隔 -25%/级）、透镜（DM+20%/级）、护符（成本 -10%/级）、余烬共振（VS+50%/级），及三项自动动作（互斥单开）。</p>
    <p class="wiki-hint">腐化满额/吞噬倒计时期间不触发新裂隙（走吞噬路径，避免机制叠加）。</p>
  ` },
  { id: 'religion', name: '宗教与虔诚', unlock: 'faith', body: () => `
    <h4>宗教分支（选一锁定，跨转生保留）</h4>
    <p>日耀议会（全局 ×2）/ 创世枢机（成本 ×0.8）/ 月影修道会（离线 ×1.5）/ 天启密会（项目 ×2）/ 自然亲和（异兽 ×2）/ 永生日轮（ES ×2）/ 全知教团（全局 ×10）。</p>
    <h4>赞颂 → 虔诚 → 超验（参考 KG Order of the Sun 四层转化）</h4>
    <p><b>信仰</b>（圣所产出）→ ≥容量 ${PRAISE.thresholdRatio*100}% 时<b>赞颂</b>转化得<b>虔诚</b>（跨周期保留）→ 消耗虔诚<b>超验</b>提升层级（成本 ${PRAISE.transcendBase}×${PRAISE.transcendGrowth}^级）。</p>
    <ul>
      <li>赞颂转化率 = 1 + 0.25 × 超验层级²</li>
      <li>虔诚全局加成 = √虔诚 × ${PRAISE.devPerSqrt}（软上限 +${PRAISE.devSoftCap*100}%，超 ${PRAISE.devSoftAfter} 衰减 50%；黑曜圣所 +10%/座）</li>
      <li>信仰容量 = ${faithCap()}（圣所×50 + 圣印×20 + 虚空祭坛 ×1.5/座）</li>
    </ul>
    <h4>隐密圣学（跨周期保留，解锁科技每轮重研）</h4>
    ${SECRET_SANCTUMS.map(s => `<p>· <b>${s.name}</b>（超验 ≥${s.needTranscend}，虔诚门槛 ${s.devGate}）：${s.desc}</p>`).join('')}
  ` },
  { id: 'policy', name: '周期政策', unlock: 'policy', body: () => `
    <h4>周期政策（参考 KG Policies——组内互斥、每轮重选）</h4>
    <p>每局（晋升/轮回后）按跨周期资产开放政策组，每组三选一，选 A 锁 B/C；效果 ±10-30% 正负成对（拿一头强必吃另一头弱）；改选消耗回响/虔诚 ×2^n（立誓改选成本翻倍，中立半价）。</p>
    ${POLICY_GROUPS.map(g => `<p><b>${g.name}组</b>：${g.policies.map(p => `${p.name}（${p.desc}）`).join(' / ')}</p>`).join('')}
    <p class="wiki-hint">立誓（岔路口买定向建筑）→ 本局政策幅度 +5%；中立 → 改选成本半价。每轮政策走向记入图鉴「历史周期走向」。</p>
  ` },
  { id: 'delve', name: '深潜', unlock: 'delve', body: () => `
    <h4>深渊深潜（终局层，层深/VS 跨转生保留）</h4>
    <p>解锁：ES ≥ 3 + DM 已发现 + 宗教已信奉。<b>下潜消耗 EP（主成本）+ DM（辅助）</b>：EP 成本 = 存储上限 × 4% × 1.12^层深（封顶 75% 上限，耐压舱 -8%/级），DM 成本 ${100}×1.35^层深；<b>下潜即层深 +1</b>（v2.9.0 修复）；越深 VS 产出越高（基础 ${0.5}/s × (1+0.5×层)）。</p>
    <p><b>深潜维持开销</b>（v3.0.0）：深潜中每秒烧掉「存储上限 × 0.02% × 层深」的 EP（耐压舱 -25%/级）——层深越深越烫手，<b>EP 归零会强制上浮</b>（层深保留，不吞进度）。腐化同时累积：${0.02}%/层/s（净化核心 -30%/级）。</p>
    <p class="wiki-hint">为什么改成吃 EP：终局前 EP 只有「买升级」一个出口，深潜与 EP 主经济完全脱钩——现在存储上限重新成为下潜的真实约束（想潜得深，先扩容）。</p>
    <p>当前层深：Lv.${delveDepth()}。里程碑：10 层 +50 VS / 25 层 +200 / 50 层 +1000 / 75 层 +2500 / 100 层 +5000（深渊之眼终局徽记）/ 150 层 +20000（回声定位 +20%/级）。</p>
    <h4>深潜升级树（VS 消耗，8 项）</h4>
    <p>深潜器（VS+50%/级）/ 虚空强化（全局 ×1.10/级）/ 净化核心（腐化 -30%/级）/ 深渊共鸣（圣印+2/级·信仰×1.5/级）/ 拟态矩阵（AI 间隔 -20%/级）/ 星辰余烬（离线上限 +20%/级）/ <b>耐压舱</b>（EP 维持 -25%/级·下潜 EP 成本 -8%/级）/ <b>回声定位</b>（VS+35%/级·里程碑 +20%/级）。</p>
  ` },
  { id: 'bazaar', name: '深渊集市', unlock: 'bazaar', body: () => `
    <h4>深渊集市（v3.0.0 大模块 · 参考 KG 贸易与资源转换）</h4>
    <p>解锁：职级 ≥ 1 且已发现研究点（RP）。六位商人常驻矩阵夹层，做<b>单向资源兑换</b>——把富余的换成稀缺的。</p>
    <table class="wiki-tbl"><tr><th>商人</th><th>兑换</th><th>库存</th><th>等级门槛</th></tr>
      ${BAZAAR.dealers.map(d => `<tr><td>${d.icon} ${d.name}</td><td>${RES_LABEL[d.from]} → ${RES_LABEL[d.to]}</td><td>${d.stock}</td><td>${d.tier > 0 ? 'Lv.' + d.tier : '—'}</td></tr>`).join('')}
    </table>
    <h4>汇率波动（每 ${BAZAAR.shuffleSec}s）</h4>
    <p>每位商人有独立汇率倍率，区间 [${(1 - BAZAAR.volatility).toFixed(2)} + 0.05×等级, ${(1 + BAZAAR.volatility).toFixed(2)}]，作用在<b>每批所得</b>上（×1.20 = 多得 20%）。集市等级只抬高波动下限，<b>永不消除波动</b>。</p>
    <h4>库存与刷新</h4>
    <p>每批成交消耗 1 点库存；库存每 ${BAZAAR.stockRegenSec}s 自然 +1（至上限）。手动刷新立即补满库存并重掷汇率：EP 成本 = 存储上限 × ${(BAZAAR.refreshEpRatio * 100).toFixed(0)}% × ${BAZAAR.refreshGrowth}^本轮刷新次数，或消耗 ${BAZAAR.echoRefresh} 点回响（不计入刷新次数）。</p>
    <h4>集市等级（跨周期保留）</h4>
    <p>按累计成交笔数升级：${BAZAAR.tiers.map((n, i) => `Lv.${i}（${n} 笔）`).join(' / ')}。等级抬高汇率波动下限并解锁高阶商人（典当核心 Lv.1 / 余烬掮客 Lv.1 / 虚空商行 Lv.2）。<b>成交笔数与等级跨周期保留，库存/汇率/刷新次数每轮重置</b>。</p>
    <p class="wiki-hint">虚空商行只在深潜解锁后才收货（VS 未发现时无意义）。集市政策组（关税同盟 / 自由贸易 / 垄断协议）每轮可重选，会改写汇率、库存与刷新成本。</p>
  ` },
  { id: 'prestige', name: '晋升与轮回', unlock: 'prestige', body: () => `
    <h4>晋升转生（第一层循环）</h4>
    <p>本局累计 EP ≥ ${fmt(3e9*Math.pow((S.prestige||0)+1,1.5))} → 晋升：清空本局，获职级点（每点全局 +10%）+ RP + ES，三选一天赋。跨转生保留：职级/RP/ES/宗教/裂隙/深潜/回响/永恒/遗物。</p>
    <h4>轮回（第二层循环，晋升之上）</h4>
    <p>门槛：本局 ≥ 1 次晋升 + 累计 EP ≥ ${fmt(1e9)}。结算深渊回响 = min(100, 8×√(本局成就评分))，每点全局 +5%（跨轮回保留）。每次轮回按本局最强维度携带 1 座「深渊遗存」（同种 cap 3）：湮灭核心（全局 ×1.25）/ 记忆库（上限 ×2）/ 虚空锚（余烬 +25%）。</p>
    <h4>回响商店（永久，跨轮回）</h4>
    <p>回响增幅（全局 ×1.3/级）/ 裂隙共鸣（余烬 ×2/级）/ 深潜共振（深潜 ×1.5/级）/ 信仰共鸣 / 异兽共鸣。</p>
    <p class="wiki-warn">深渊吞噬期间，晋升与轮回均被锁定——转生不可脱离深渊（唯命运抉择可终结）。</p>
  ` },
  { id: 'ach', name: '成就与彩蛋', unlock: null, body: () => `
    <h4>成就（跨转生保留，达成即点亮；未达成不显示）</h4>
    <p>初次接触 / 一丝涟漪（1K EP）/ 涌动（100K）/ 深流（1M）/ 渊海（1B）/ 十件造物 / 三人成众 / 初次超脱 / 循环之始 / 永恒碎片 / 认知扩展 / 短暂告别 / 深渊伙伴 / 裂缝缝合 / 深渊之下 / 信仰觉醒 / 深渊物质 / 缸中之渊 / 静默一分钟。</p>
    <h4>吞噬专属成就（v2.9.0）</h4>
    <p>🤝 <b>恶魔的朋友</b>：倒计时终结选贿赂深渊<br>🌑 <b>凝视深渊</b>：倒计时终结选同归于尽<br>🌑 <b>被深渊吞噬</b>：本局被深渊吞没（同归于尽触发）</p>
  ` },
  { id: 'appendix', name: '数值公式附录', unlock: null, body: () => `
    <h4>成本曲线（参考 KG）</h4>
    <ul>
      <li>升级/建筑：base × growth^级 × costMult()（默认 growth 1.30）</li>
      <li>扩容类：无限升级 + 30% 防死锁钳制（价格 ≤ 当前上限 ×30%）</li>
      <li>线程招募：firstCost × 1.25^线程数</li>
      <li>专注：30 × 1.6^级</li>
    </ul>
    <h4>全局乘数软上限</h4>
    <p>m > ${fmt(D.softCapThreshold)} → ${fmt(D.softCapThreshold)} + √(m-${fmt(D.softCapThreshold)}) × ${D.softCapFactor}（防无限滚）。</p>
    <h4>时间尺度</h4>
    <table class="wiki-tbl"><tr><th>阶段</th><th>时长</th><th>解锁</th></tr>
      <tr><td>新手期</td><td>0-10 分钟</td><td>线程、基础升级</td></tr>
      <tr><td>早期</td><td>10 分钟-1 小时</td><td>科技树前 10 个</td></tr>
      <tr><td>中期</td><td>1-8 小时</td><td>异兽、任务版、宗教</td></tr>
      <tr><td>后期</td><td>1-3 天</td><td>永恒矩阵（转生）</td></tr>
      <tr><td>终局</td><td>3 天+</td><td>深渊裂隙、DM、深潜</td></tr>
    </table>
    <h4>KG 设计原则（本游戏贯彻）</h4>
    <ul>
      <li>每个问题多种解法（EP 不够 → 建线程/点科技/做任务/买异兽）</li>
      <li>每个解法创造新问题（线程多 → 薪资涨 → EP 消耗快）</li>
      <li>不要削弱（后期产出万亿，成本也万亿级）</li>
      <li>存储上限制造张力（满了必须花）</li>
      <li>跨周期资源克制（负面只减缓不免疫，软上限防爆仓）</li>
    </ul>
  ` },
];

export function wikiSectionById(id) { return WIKI_SECTIONS.find(s => s.id === id); }
export function wikiUnlocked(key) { return unlocked(key); }
