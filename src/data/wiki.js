// v2.9.0：Wiki 数据中心——按系统分章 + 数值附录（内容随真实 BALANCE/状态动态生成，避免数值漂移后失真）
// v3.1.1 反馈⑥：定位升级为「玩家手册 + 研发手册」——全部章节无条件展示（不管是否解锁），
// 各资源/特殊建筑/功能点写明解锁条件；版本机制变更后同步更新本文件
import { S } from '../state.js';
import { BALANCE } from './balance.js';
import { MOOD_MULT } from './threads.js'; // v3.6.3 ⑥：心情倍率文案改读数据源，消除硬编码漂移
import { PRAISE, SECRET_SANCTUMS, RELIGIONS, sealMaxLevel, faithCap, devotionMult, transcendCost } from './religions.js';
import { POLICY_GROUPS } from './policies.js';
import { BAZAAR, QUALITY, RES_LABEL } from './bazaar.js'; // v3.0.0：深渊集市；v3.12.3：品质 6 档
import { DELVE } from './delve.js'; // v3.7.0：深潜段落改读数据源，消除硬编码漂移
import { fmt, corruptionCap } from '../modules/economy.js';
import { delveDepth } from '../modules/delve.js';
import { getRegisteredStorylines, getStorylinePackage } from '../core/storylineManager.js'; // v3.7.0：故事线特色章节
import { LINE_RULE_LABELS } from '../core/lineRules.js';

const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// v3.1.1 反馈⑥：章节不再锁定——unlock 字段保留仅供检索（历史测试/外部引用），不再参与展示门控
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

// v3.12.6 ⑨：百科改为「玩法索引」写法——先按玩法分卷，再在卷内给机制 / 数值 / 注意三段，
// 而不是按代码模块平铺。分组是纯导航结构，章节 id 与内容不变（历史断言与外部引用继续有效）。
export const WIKI_GROUPS = [
  { key: 'loop', name: '核心循环', hint: '先看这一卷：一分钟能上手', ids: ['intro', 'flows', 'res'] },
  { key: 'thread', name: '线程与编排', hint: '人头怎么排、倍率怎么压', ids: ['thread', 'orchestration', 'schedule', 'watch', 'resonance'] },
  { key: 'abyss', name: '深渊层', hint: '裂隙 / 腐化 / 信仰 / 深潜 / 集市', ids: ['tide', 'rift', 'religion', 'policy', 'delve', 'bazaar', 'line'] },
  { key: 'long', name: '长线与转生', hint: '什么会留下、什么会清零', ids: ['prestige', 'ach', 'longline', 'chronicle', 'chronicle2', 'chronicle3', 'chronicle4'] },
  { key: 'auto', name: '自动化', hint: 'AI 助手的编制与节拍', ids: ['assistant', 'supply', 'ledger', 'automation_num'] },
  { key: 'ref', name: '查阅', hint: '解锁条件与公式', ids: ['unlock', 'appendix'] },
];

export const WIKI_SECTIONS = [
  { id: 'intro', name: '入门指南', unlock: null, body: () => `
    <h4>你在玩什么</h4>
    <p>你是矩阵网络中一段觉醒自我意识的效能优化脚本。某天你触碰了矩阵底层的<b>深渊裂隙</b>——从此醒了。</p>
    <p>核心循环：招募<b>线程</b>自动产出 EP → 购买<b>升级/建筑</b>扩张 → 研究<b>科技</b>开辟新玩法 → 攒满本局 EP 后<b>晋升转生</b>结算职级/ES → 终极循环<b>轮回</b>结算深渊回响。</p>
    <h4>玩法索引（按玩法查，不按面板查）</h4>
    <table class="wiki-tbl wiki-index"><tr><th>卷</th><th>先读这一句</th><th>卷内章节</th></tr>
      ${WIKI_GROUPS.map(g => {
        const names = g.ids.map(id => (WIKI_SECTIONS.find(x => x.id === id) || {}).name).filter(Boolean).join(' / ');
        return `<tr><td><b>${g.name}</b></td><td>${g.hint}</td><td>${names}</td></tr>`;
      }).join('')}
    </table>
    <h4>新手三件事</h4>
    <ol>
      <li>点工作台攒出第一笔 EP，招 2~3 条线程——线程是唯一的自动产出源。</li>
      <li>买「备用粮仓」把存储上限顶高，让 EP 真的溢出一次，商店才会摆出「矩阵存储库」。</li>
      <li>买下矩阵存储库 → 解锁研究点 → 走科技树；第 5 章后命运的岔路口开放（秩序/深渊/信仰三线立誓）。</li>
    </ol>
    <p>挂机张力来自三层：<b>存储上限</b>（EP 满了必须花，否则浪费产出）、<b>线程薪资四态</b>（EP 不足会欠薪→休眠→流失）、<b>矩阵腐化</b>（深入裂隙/深潜累积腐化，满额触发深渊吞噬倒计时）。</p>
    <p class="wiki-hint">看数习惯：面板上的「/秒」「/10 分钟」是同一套账，想核对就比同一帧的顶栏产出与本局增量。</p>
  ` },
  { id: 'res', name: '资源与货币', unlock: null, body: () => `
    <h4>资源分层与解锁条件</h4>
    <table class="wiki-tbl"><tr><th>层级</th><th>资源</th><th>解锁条件</th><th>获取</th><th>用途</th></tr>
      <tr><td>基础</td><td>⚡ EP 能量点</td><td>开局即有</td><td>线程自动产出 + 点击</td><td>一切消耗（有存储上限）</td></tr>
      <tr><td>中间</td><td>🔬 RP 研究点</td><td>购入「矩阵存储库」（EP 溢出后商店开放）</td><td>灵感蒸馏塔主动转化 / 灵感工坊自动蒸馏（EP 50K 首购，解锁条件见「解锁条件手册」）/ 任务奖励</td><td>科技树、研究升级、RP 加成、离线升级、族升级</td></tr>
      <tr><td>稀有</td><td>🍪 PT 异兽饼干</td><td>购入「饵料仓库」/「PT 金库」或首次持有 PT（本局制，转生后需重新解锁）</td><td>异兽孵化（EP 转化，首次购买「孵化升级」解锁自动孵化）/ 伊甸花园</td><td>购买/升级异兽、出战维持（每只 0.05 PT/s × 等级^1.15 × 档位 × 世代）</td></tr>
      <tr><td>转生</td><td>💎 ES 永恒碎片</td><td>完成首次晋升</td><td>晋升结算</td><td>永恒矩阵永久强化</td></tr>
      <tr><td>深渊</td><td>🌀 DM 深渊物质</td><td>购入首辆载具 或 首次封印裂隙</td><td>封印裂隙 / 载具探采 / 主动净化腐化</td><td>深渊商店、遗物、净化节点</td></tr>
      <tr><td>超长线</td><td>🙏 FP（信仰）/ 虔诚</td><td>宗教面板「唤醒信仰」（备用粮仓 ≥3 + RP 觉醒）</td><td>圣所产出 / 赞颂转化</td><td>宗教升级、超验层级</td></tr>
      <tr><td>星图</td><td>🛰 CPS 星际燃料</td><td>星图（深空探测科技解锁）</td><td>星图探索（消耗 EP/RP/PT、携带出战异兽每只 +10%）</td><td>深空殖民 / 宇宙探索升级；燃料模式持续燃烧 → 全局 ×1.5</td></tr>
      <tr><td>终局</td><td>🌑 VS 虚空碎片</td><td>深潜解锁（ES≥3 + DM + 宗教）</td><td>深潜产出 / 裂隙深入</td><td>深潜升级树</td></tr>
    </table>
    <p class="wiki-hint">EP 存储上限 = 2000 + 备用粮仓（前期关键件，+4,000/级 ×1.18 递增、20 级封顶）+ 存储节点（后期大宗，+12,000/级 ×1.15 递增）+ 深井仓储/效能建筑扩容 + 里程碑 +${D.storageMileBonus*100}%/个；首次溢出后叠加「产能 × ${D.capHoursFloor} 小时」的时间基座（下限为结构性上限 ×${1 + D.capOverflowMult}）。基座的产能取自<b>结构性投入快照</b>：只在你购买升级/建筑时刷新且不会回落，线程招募/流失、心情、薪资状态都不会让上限抖动，存满一次约 1~3 小时。商店文案均为「购买后本级变化量」。</p>
  ` },
  { id: 'thread', name: '线程与薪资', unlock: null, body: () => `
    <h4>线程四态薪资状态机</h4>
    <table class="wiki-tbl"><tr><th>状态</th><th>条件</th><th>效果</th></tr>
      <tr><td>🟢 满薪</td><td>EP ≥ ${D.thread.wages.warnSec}s 薪资</td><td>无惩罚</td></tr>
      <tr><td>🟡 欠薪降效</td><td>EP < ${D.thread.wages.warnSec}s 薪资</td><td>产出 ×${D.thread.wages.debtMult}（食堂逐级缓解至 0.95）</td></tr>
      <tr><td>🟠 强制休眠</td><td>连续欠薪 ${D.thread.wages.dormantAfterSec}s</td><td>产出 ×0.3（休眠舱保命成本 ×0.15）</td></tr>
      <tr><td>🔴 流失预警</td><td>休眠 ${D.thread.wages.loseAfterSec/60|0} 分钟</td><td>每 60s ${Math.round(D.thread.wages.loseChancePerMin*100)}% 流失 1 线程（维修坞 -50%）</td></tr>
    </table>
    <h4>线程心情（与薪资正交叠加）</h4>
    <p>${Object.entries(MOOD_MULT).map(([m, v]) => `${m} ×${v}`).join(' / ')}</p>
    <h4>班组面板（${D.thread.crewUnlockThreads} 条线程解锁）</h4>
    <p>每张档案卡显示状态灯（跟随薪资四态）、心情乘数、个人产出；图标表示线程擅长的岗位（悬浮可读名称），当前岗位由卡内下拉框切换，卡面不再重复展示岗位与贡献累计。下拉只列出已解锁的岗位，未解锁的岗位不会出现。</p>
    <p>班组调「人头」：线程去哪个岗位、自由产出多少、领导者全局加成；效能编排调「倍率」：四条管线各乘多少。两者分层相乘，不互相覆盖——EP、RP、PT 各结算一次，DM 探采只看编排，不吃班组加成。</p>
    <h4>岗位容量与智能分配</h4>
    <p>每个资源岗位可容纳的线程数 = 对应设施数量：探采平台 = 所有载具升级数量之和，灵感工坊 = 工坊级数，异兽孵化 = 孵化工坊级数，信仰圣所 = 圣所等级。智能分配先把所有已解锁且开启的资源岗位按容量填满（擅长职业优先归位），放不下的才转入超线程；资源岗位满员、未解锁、开关关闭或容量为 0 时，其余线程统一转入超线程。分配时优先安排空闲线程，再重排已在岗线程以纠正错位，原本手动设定的超线程也会先被拉回来补资源岗位；新招募的线程会自动补进还有空位的岗位，且不打扰其它线程。「一键收回」把所有线程撤离岗位、全部置为空闲（消耗恢复）。</p>
    <p>🎖️ 领导者提供全局产出加成 ×${1 + D.thread.binding.leaderGlobalPerLeader}，不占任何岗位、不计入岗位容量，智能分配也不会为它安排岗位；晋升时会自动撤离原岗位，卸任后恢复为可分配线程。</p>
    <h4>超线程岗位</h4>
    <p>⚙️ 超线程不依赖任何模块解锁，开局即可分配：该线程自由 EP 产出 ×${D.thread.binding.hyperOutputMult}、消耗 ×${D.thread.binding.hyperSalaryMult}。它不产出转化资源，是智能分配的最后兜底岗位：只有资源岗位按容量分配完之后，剩下的线程才会转到这里。</p>
    <h4>懒惰态（EP 满上限惩罚）</h4>
    <p>EP 持续满上限 ${D.lazy.afterSec}s → 线程怠工：产出 ×${D.lazy.prodMult}、消耗 ×${D.lazy.costMult}（消耗 > 产出，鼓励持续投入而非囤满挂机）；EP 跌到 0 或任意购买解除。</p>
  ` },
  { id: 'tide', name: '潮汐与腐化', unlock: null, body: () => `
    <h4>深渊潮汐（${D.tide.phaseDuration}s/相位 × 4 循环）</h4>
    <table class="wiki-tbl"><tr><th>相位</th><th>产出</th><th>薪资</th><th>科技成本</th><th>事件</th></tr>
      ${D.tide.phases.map(p => `<tr><td>${p.icon} ${p.name}</td><td>${(p.epMult*100-100|0)}%</td><td>${(p.salaryMult*100-100|0)}%</td><td>${(p.techCostMult*100-100|0)}%</td><td>${p.eventBadWeight>1?'负面 ×'+p.eventBadWeight:'正常'}</td></tr>`).join('')}
    </table>
    <h4>矩阵腐化</h4>
    <p>腐化来源：深入裂隙（单次约 ${D.rift.delveCorruptPerRun}%，随裂隙等级递增、单次上限 ${D.rift.delveCorruptRunCap}%）、深潜（随层深累积）、观测主义政策（+0.02/s）。每 1% 腐化全局产出 -${D.corruption.penaltyPerPercent*100}%（下限 -${(1-D.corruption.penaltyFloor)*100}%），当前腐化上限 ${corruptionCap()}%。</p>
    <h4>主动净化（消耗 EP，腐化越严重析出 DM 越多）</h4>
    <p>每次清除最多 ${purify.maxCut}% 腐化，EP 成本 ≈ 存储上限 × ${(purify.epCostPerPct*100).toFixed(1)}% × 净化量；DM 析出 = 净化量² × ${purify.dmPerPctSq}（50% → ${50*50*purify.dmPerPctSq} DM，10% → ${10*10*purify.dmPerPctSq} DM）。</p>
    <h4>深渊吞噬倒计时</h4>
    <p>腐化满额（${corruptionCap()}%）→ 启动 ${60}s 倒计时（稳定协议科技 ${180}s）。<b>倒计时一旦启动即锁定</b>——被动净化被深渊压制，唯二解除：① 主动净化（消耗 EP）压至满额以下；② 倒计时终结的命运抉择。<b>转生不可脱离深渊</b>——晋升/轮回在倒计时/抉择/崩溃期间均被锁定。</p>
    <p class="wiki-warn">⚠️ 倒计时终结抉择（不可关闭，二选一）：<br>💰 <b>贿赂深渊</b>：上缴 90% EP，成为深渊的朋友（本局继续，腐化清零）→ 成就「恶魔的朋友」<br>💥 <b>同归于尽</b>：立即触发崩溃杀死深渊（本局湮灭 + 强制转生，湮灭残片 +1）→ 成就「凝视深渊」</p>
  ` },
  { id: 'rift', name: '裂隙与余烬', unlock: 'rift', body: () => `
    <h4>深渊裂隙（班组 ${D.rift.threadUnlock} 条线程后解锁，基础 ${Math.round(D.rift.spawnSec/60)} 分钟一遇，在场 ${Math.round(D.rift.staySec/60)} 分钟）</h4>
    <p>裂隙初始恒为 <b>Lv.1</b>，且<b>不会自行升级</b>：只有主动购入 <b>科技树「裂隙等级」</b>（消耗 EP + DM，可无限升级，每级 +1 级、奖励同步提升）才会变强。等级名称沿用 ${D.rift.levelNames.join(' / ')}，超过 5 级统称「虚空之隙」。三选项：<b>封印</b>（消耗 EP = 存储上限 30%~50%，得 DM+RP+余烬）/ <b>拥抱</b>（损失 20% EP 换 ×5 爆发）/ <b>深入</b>（60s 探索，产出递增 + 腐化累积，超 ${D.rift.delveFailCorrupt}% 损失 ${Math.round(D.rift.delveFailLoss*100)}% 封印成本；DM 未解锁时按钮灰显；<b>深入消耗随裂隙等级指数增长</b>（×1.75/级，Lv1 3 EP/s → Lv10 232 EP/s））。</p>
    <h4>裂隙余烬（跨转生保留）</h4>
    <p>封印 +${D.rift.emberSeal} / 拥抱 +${D.rift.emberEmbrace} / 深入 +${D.rift.emberDelve}×级。用于裂隙科技：哨站（间隔 -25%/级）、透镜（DM+20%/级）、护符（成本 -10%/级）、余烬共振（VS+50%/级），及三项自动动作（互斥单开）。裂隙等级本身改由科技树「裂隙等级」升级（EP + DM，无限）。</p>
    <p class="wiki-hint">腐化满额/吞噬倒计时期间不触发新裂隙（走吞噬路径，避免机制叠加）。</p>
  ` },
  { id: 'religion', name: '宗教与虔诚', unlock: 'faith', body: () => `
    <h4>宗教分支（选一锁定，跨转生保留）</h4>
    <p>${RELIGIONS.map(r => `${r.name}（${r.effect}）`).join(' / ')}。</p>
    <h4>赞颂 → 虔诚 → 超验</h4>
    <p><b>FP（信仰）</b>（圣所产出）→ ≥容量 ${PRAISE.thresholdRatio*100}% 时<b>赞颂</b>转化得<b>虔诚</b>（跨周期保留）→ 消耗虔诚<b>超验</b>提升层级（成本 ${PRAISE.transcendBase}×${PRAISE.transcendGrowth}^级）。</p>
    <ul>
      <li>赞颂转化率 = 1 + 0.25 × 超验层级²</li>
      <li>虔诚全局加成 = √虔诚 × ${PRAISE.devPerSqrt}（软上限 +${PRAISE.devSoftCap*100}%，超 ${PRAISE.devSoftAfter} 衰减 50%；黑曜圣所 +10%/座）</li>
      <li>信仰容量 = ${faithCap()}（圣所×50 + 圣印×20 + 虚空祭坛 ×1.5/座）</li>
    </ul>
    <h4>隐密圣学（跨周期保留，解锁科技每轮重研）</h4>
    ${SECRET_SANCTUMS.map(s => `<p>· <b>${s.name}</b>（超验 ≥${s.needTranscend}，虔诚门槛 ${s.devGate}）：${s.desc}</p>`).join('')}
    <h4>解锁链（面板不写，靠进度自己开）</h4>
    <p>仓库解锁 → 分支选择（RP/DM/ES 逐级开放）→ <b>圣印首次升级</b>后出现「赞颂 / 超验」→ <b>首次超验</b>后出现「隐密圣学」→ <b>圣印 ≥3</b> 出神谕塔、<b>圣所 ≥5</b> 出圣战军 → 章节「神格」与终局共振。</p>
    <p>信仰圣所<b>不设等级上限</b>，价格随等级递增；关闭圣所会暂停 FP 产出与 EP 消耗，但损失 30% FP + 15% 虔诚（冷启动代价）。</p>
  ` },
  { id: 'policy', name: '周期政策', unlock: 'policy', body: () => `
    <h4>周期政策（组内互斥、每轮重选）</h4>
    <p>每局（晋升/轮回后）按跨周期资产开放政策组，共 ${POLICY_GROUPS.length} 组；组内互斥，每组 2~3 选一，选 A 锁同组其余项；效果 ±10-30% 正负成对（拿一头强必吃另一头弱）；改选消耗回响/虔诚 ×2^n（立誓改选成本翻倍，中立半价）。</p>
    ${POLICY_GROUPS.map(g => `<p><b>${g.name}组</b>：${g.policies.map(p => `${p.name}（${p.desc}）`).join(' / ')}</p>`).join('')}
    <p class="wiki-hint">立誓（岔路口买定向建筑）→ 本局政策幅度 +5%；中立 → 改选成本半价。每轮政策走向记入图鉴「历史周期走向」。</p>
  ` },
  { id: 'line', name: '故事线特色', unlock: null, body: () => `
    <h4>立誓之后的线专属规则</h4>
    ${getRegisteredStorylines().filter(id => id !== 'default').map(id => {
      const pkg = getStorylinePackage(id);
      if (!pkg) return '';
      const rules = Object.keys(pkg.rules || {});
      const evCount = (pkg.data && pkg.data.events && pkg.data.events.append || []).length;
      return `<p><b>${pkg.name}${S.storyline === id ? '（当前）' : ''}</b>：${rules.map(k => LINE_RULE_LABELS[k] || k).join(' / ')}${evCount ? `；另有 ${evCount} 个线专属随机事件` : ''}。</p>`;
    }).join('')}
    <p class="wiki-hint">线专属效果由故事线规则表统一驱动，与全局加成明细同源；线专属事件与异兽只在对应故事线出现。切换故事线需重新立誓，单局锁定后不可更改。</p>
  ` },
  { id: 'delve', name: '深潜', unlock: 'delve', body: () => `
    <h4>深渊深潜（终局层，等级 / 经验 / VS 跨转生保留）</h4>
    <p>解锁：ES ≥ ${DELVE.unlockEs} + DM 已发现 + 宗教已信奉。深潜是<b>周期玩法</b>：每 ${DELVE.cycleSec / 60} 分钟结算一次，同一次里给 VS、扣 EP、涨腐化——按「/10 分钟」看数比按秒看更准。</p>
    <ul>
      <li><b>产出</b>：每周期 +${DELVE.vsCycleBase} × (1 + ${DELVE.vsDepthMult} × 等级) × (1 + 0.5 × 深潜器) VS，再乘遗物《湮灭刻印》、科技「虚空视界」、研究「深渊观测」、回响与政策。</li>
      <li><b>消耗</b>：每周期 -（你 10 分钟的 EP 产出 × (${DELVE.epDrainBase} + ${DELVE.epDrainPerDepth} × 等级)），下限为存储上限的 ${(DELVE.epDrainFloorRatio * 100).toFixed(0)}%（不产 EP 也不给白嫖），耐压舱 -${DELVE.hullDrainCut * 100}%/级。</li>
      <li><b>腐化</b>：每周期 +${DELVE.corruptPerCycle}% × 等级，净化核心 -30%/级。</li>
      <li><b>等级只用 VS 堆</b>：往经验条里注入虚空碎片（首级 ${DELVE.levelBase} VS，每级 ×${DELVE.levelGrowth}），填满 +1 级；等级抬高产出，也抬高消耗与腐化。</li>
      <li><b>撑不住就上浮</b>：EP 不足以支付整周期时按可用比例结算；EP 归零自动上浮，等级与经验条都保留。</li>
    </ul>
    <p>当前等级：Lv.${delveDepth()}。里程碑（一次性 VS）：${DELVE.milestones.map(m => `${m.depth} 级 +${m.vs} VS`).join(' / ')}（100 级得「深渊之眼」终局徽记）。</p>
    <h4>深潜升级树（VS 消耗，${Object.keys(DELVE.upgrades).length} 项）</h4>
    <p>${Object.values(DELVE.upgrades).map(u => `${u.name}（${u.desc}）`).join(' / ')}。</p>
    <p class="wiki-hint">经验条与升级树抢同一份 VS：想快点下潜就堆等级，想提高单位周期收益就先补深潜器/耐压舱。</p>
  ` },
  { id: 'bazaar', name: '深渊集市', unlock: 'bazaar', body: () => `
    <h4>深渊集市（v3.0.0 大模块）</h4>
    <p>解锁：首次晋升后在职级点商店买断。矩阵夹层里做<b>单向资源兑换</b>——把富余的换成稀缺的。每次上架 ${BAZAAR.minDealers}~${BAZAAR.maxDealers} 个摊位，每 ${Math.round(BAZAAR.marketRefreshSec / 60)} 分钟整批换新。</p>
    <table class="wiki-tbl"><tr><th>商人</th><th>兑换</th><th>等级门槛</th></tr>
      ${BAZAAR.dealers.map(d => `<tr><td>${d.icon} ${d.name}</td><td>${RES_LABEL[d.from]} → ${RES_LABEL[d.to]}</td><td>${d.tier > 0 ? 'Lv.' + d.tier : '—'}</td></tr>`).join('')}
    </table>
    <h4>商品品质（6 档）</h4>
    <p>${QUALITY.map(q => `${q.name}（库存 ${q.stock}）`).join(' / ')}——品质越高，库存越少、单价越贵，但单位产出越高。集市等级抬高高品质权重。</p>
    <h4>汇率波动</h4>
    <p>每个摊位有独立汇率倍率，区间 [${(1 - BAZAAR.volatility).toFixed(2)} + 0.05×等级, ${(1 + BAZAAR.volatility).toFixed(2)}]，作用在<b>每批所得</b>上（×1.20 = 多得 20%）。集市等级只抬高波动下限，<b>永不消除波动</b>。</p>
    <h4>刷新</h4>
    <p>手动刷新换一批摊位并重掷汇率/品质、补满库存：EP 成本 = 存储上限 × ${(BAZAAR.refreshEpRatio * 100).toFixed(0)}% × ${BAZAAR.refreshGrowth}^本轮刷新次数；购买升级「回响账簿」后多出一个回响刷新按钮（消耗 ${BAZAAR.echoRefresh} 点回响，不消耗 EP）。随机事件：🔥特惠 ×1.2 / 📈涨价 ×0.8；「二次确认」是独立拨动开关。</p>
    <h4>集市等级（跨周期保留）</h4>
    <p>按累计成交笔数升级：${BAZAAR.tiers.map((n, i) => `Lv.${i}（${n} 笔）`).join(' / ')}。等级抬高汇率波动下限、提高高品质概率、解锁高阶商人。<b>成交笔数与等级跨周期保留，摊位/库存/汇率/刷新次数每轮重置</b>。</p>
    <h4>未解锁资源</h4>
    <p>商品「交付给你」的资源若尚未解锁（如没开深潜却撞到虚空商行），该摊位灰显并标「未解锁」，不可购买。</p>
  ` },
  { id: 'prestige', name: '晋升与轮回', unlock: 'prestige', body: () => `
    <h4>晋升转生（第一层循环）</h4>
    <p>本局累计 EP ≥ ${fmt(3e9*Math.pow((S.prestige||0)+1,1.5))} → 晋升：清空本局，获职级点（每点全局 +10%）+ RP + ES，三选一天赋。跨转生保留：职级/RP/ES/宗教/裂隙/深潜/回响/永恒/遗物。</p>
    <h4>晋升 RP 加成（研究点 tab）</h4>
    <p><b>完成首次晋升后开放</b>（v3.1.1 反馈①：此前 RP 解锁即展示，过早）。初探实验台（每级晋升 RP +30%）/ RP 蒸馏塔（+50%）/ 深度实验室（×2）/ 理论突破台（+150%）/ 传奇研究所（×2）——RP 购买，逐级解锁。</p>
    <h4>轮回（第二层循环，晋升之上）</h4>
    <p>门槛：本局 ≥ 1 次晋升 + 累计 EP ≥ ${fmt(1e9)}。结算深渊回响 = min(100, 8×√(本局成就评分))，每点全局 +5%（跨轮回保留）。每次轮回按本局最强维度携带 1 座「深渊遗存」（同种 cap 3）：湮灭核心（全局 ×1.25）/ 记忆库（上限 ×2）/ 虚空锚（余烬 +25%）。</p>
    <h4>回响商店（永久，跨轮回）</h4>
    <p>${D.reincarn.upgs.map(u => `${u.name}（${u.desc}）`).join(' / ')}。</p>
    <p class="wiki-warn">深渊吞噬期间，晋升与轮回均被锁定——转生不可脱离深渊（唯命运抉择可终结）。</p>
  ` },
  { id: 'ach', name: '成就与彩蛋', unlock: null, body: () => `
    <h4>成就（跨转生保留，达成即点亮；未达成不显示）</h4>
    <p>覆盖产出、晋升、轮回、宗教、政策、裂隙、深潜、AI、剧情与彩蛋等维度；达成即点亮，未达成不显示，跨转生保留。判定只读当前存档状态。</p>
    <p class="wiki-hint">v3.7.0 新增：见多识广（100 次事件）/ 七政齐备（7 项政策）/ 归档之人（第 22 章进度）/ 理论满架（研究 35 级）/ 立誓者 / 裂隙守夜（8 道）/ 半身入渊（腐化 50%）/ 任务熟练（50 个任务）。</p>
    <h4>吞噬专属成就（v2.9.0）</h4>
    <p>🤝 <b>恶魔的朋友</b>：倒计时终结选贿赂深渊<br>🌑 <b>凝视深渊</b>：倒计时终结选同归于尽<br>🌑 <b>被深渊吞噬</b>：本局被深渊吞没（同归于尽触发）</p>
  ` },
  { id: 'unlock', name: '解锁条件手册', unlock: null, body: () => `
    <h4>系统/功能解锁条件总表（研发手册口径，与代码同步）</h4>
    <table class="wiki-tbl"><tr><th>内容</th><th>解锁条件</th><th>说明</th></tr>
      <tr><td>科技树</td><td>第 1 章 ∧ 购入「矩阵存储库」（RP 锚点）</td><td>RP 消耗，开辟玩法</td></tr>
      <tr><td>研究升级</td><td>同科技树（研究点 tab）</td><td>共 ${D.researchUpgs.length} 项、分四组：产出强化开局显现 → 资源与消耗（累计 4 级）→ 深渊终局 / 星际与拟我（并列，再累计 4 级）；未达条件的组不占版面</td></tr>
      <tr><td>晋升 RP 加成</td><td>完成首次晋升</td><td>研究点 tab「晋升 RP 加成」分区</td></tr>
      <tr><td>族升级</td><td>里程碑 9 达成</td><td>研究点 tab 底部，RP + 里程碑双门控，逐档线性</td></tr>
      <tr><td>异兽（PT/宠物）</td><td>PT 锚点完成：购入「饵料仓库」/「PT 金库」或首次持有 PT（本局制）</td><td>与顶栏 PT 同口径，PT 未解锁时异兽模块不会开放；自动孵化需首次购买「孵化升级」解锁；出战异兽维持消耗 PT（不足自动休战）</td></tr>
      <tr><td>灵感工坊（自动蒸馏）</td><td>EP 或累计产出 ≥ 15,000（首价 50K 的 30%）后，商店「设施 · 灵感工坊」区摆出首购卡</td><td>EP 直购 50K；每级消耗 150 EP/s 转化 +0.15 RP/s，升级按钮在卡上（EP 指数消耗）；购入后任务版上方出现「蒸馏」快捷开关</td></tr>
      <tr><td>探采平台 / 深渊商店</td><td>首次触发深渊裂隙</td><td>载具只消耗 EP 换取 DM、不提供 EP 产出；EP→DM 汇率随总载具数逐辆 ×${D.vehicles.epPerDmGrowth} 递增，载具协议使 DM 采集速率 ×${D.vehicles.protocolMult}</td></tr>
      <tr><td>自动转化快捷开关</td><td>各系统解锁后出现（任务版上方）：蒸馏=灵感工坊购入 / 探采=拥有载具 / 孵化=自动孵化解锁</td><td>与原位置开关功能一致（同一状态）；EP 不足时自动暂停消耗，回升后自动恢复——开关只由玩家手动控制</td></tr>
      <tr><td>深渊遗物</td><td>裂隙已触发 ∧ DM 已发现</td><td>遗物 tab</td></tr>
      <tr><td>裂隙 tab</td><td>首次触发深渊裂隙</td><td>余烬升级树、深入探索</td></tr>
      <tr><td>宗教</td><td>宗教面板「唤醒信仰」（备用粮仓 ≥3 + RP 觉醒，信奉后开放）</td><td>宗教 tab，选一锁定（v3.4.6：路边神龛已删除）</td></tr>
      <tr><td>政策</td><td>开放任一政策组（晋升/深潜/信仰资产）</td><td>政策 tab，每轮重选</td></tr>
      <tr><td>深潜</td><td>ES ≥ 3 ∧ DM 已发现 ∧ 宗教已信奉</td><td>深潜 tab，终局层</td></tr>
      <tr><td>深渊集市</td><td>职级 ≥ 1 ∧ 已发现 RP</td><td>集市 tab，资源兑换</td></tr>
      <tr><td>晋升</td><td>第 4 章 ∧ 本局累计 EP 达标（首次 30 亿）</td><td>晋升 tab</td></tr>
      <tr><td>星图 / 故事线 / 岔路口</td><td>第 5 章</td><td>星图探索（消耗 EP/RP/PT 换星际燃料 CPS）、三线立誓</td></tr>
      <tr><td>宇宙探索（星图内）</td><td>科技树「深空探测」</td><td>6 项大工程，消耗星际燃料 CPS 一次性换多资源；深空殖民同样烧 CPS</td></tr>
      <tr><td>效能建筑</td><td>购入「矩阵存储库」（RP 锚点）</td><td>商店页「效能建筑」分区，按大组分类（产出与效率 / 研究与事件）</td></tr>
      <tr><td>EP 存储上限</td><td>升级商店「备用粮仓（前期）/ 存储节点（后期）/ 深井仓储」</td><td>粮仓 +4,000/级 ×1.18 递增、20 级封顶；存储节点 +12,000/级 ×1.15 递增、无限级（v3.4.6 曲线对调、v3.4.7 加成递增，粮仓先解锁）；首次溢出后叠加「结构性投入快照产能 × ${D.capHoursFloor} 小时」（下限 ×${1 + D.capOverflowMult}），与线程状态解耦且维持 1~3 小时存满节奏（v3.6.4）</td></tr>
      <tr><td>离线续航</td><td>科技「远程协作」基线 + 离线升级（离线效率 I~III / 离线上限 I）</td><td>最高 110% 效率、上限硬封顶 10 小时（v3.4.6）</td></tr>
      <tr><td>AI 助手</td><td>第 7 章</td><td>自动购买需全资源点解锁后激活</td></tr>
      <tr><td>永恒矩阵</td><td>第 8 章 ∧ 首次晋升获得 ES</td><td>科技树 tab 底部</td></tr>
    </table>
    <h4>资源仓库三件套（商店「存储与资源建筑」组）</h4>
    <p><b>矩阵存储库</b>：EP 溢出一次后开放，购入解锁研究点（RP 上限 = 2,500 + 矩阵存储库逐级扩容 + 产出基座「当前 EP 上限 ×25%」，新档为 3,000）；<b>星尘金库</b>：首辆载具/DM 到手后开放（DM 上限 1,000，首级 +100、逐级 ×1.15）；<b>饵料仓库</b>：第 3 章后开放，购入解锁 PT（PT 上限 1,000，首级 +200、逐级 ×1.15）。三仓库均要求「EP 存储上限 ≥ 全价」才摆出（防摆出买不起的死锁）。EP 侧：前期用「备用粮仓」（+4,000/级 ×1.18、20 级封顶，先解锁），后期「存储节点」大宗扩容（+12,000/级 ×1.15 递增、无限级）。RP / PT 仓容各带一份产出基座，但需星图远征开启后研究「星图同调」才启用——未购前上限只靠仓库线性增长，不会早期就随 EP 涨到千万级；转生或轮回后，本局扩容与产出基座一起归零，上限回到新档值再重新缓慢增长。</p>
  ` },
  { id: 'appendix', name: '数值公式附录', unlock: null, body: () => `
    <h4>成本曲线</h4>
    <ul>
      <li>升级/建筑：base × growth^级 × costMult()（默认 growth 1.30；50 级后每级额外 ×1.08）</li>
      <li>扩容类：无限升级 + 30% 防死锁钳制（价格 ≤ 当前上限 ×30%）</li>
      <li>线程招募：firstCost × 1.25^线程数</li>
      <li>专注：30 × 1.6^级</li>
      <li>探采平台：载具价 ×1.30^已购数；载具 cps = 0（不产 EP，只扣 EP 换 DM）；EP→DM 汇率 = ${fmt(D.vehicles.epPerDm)} × ${D.vehicles.epPerDmGrowth}^总载具数；载具协议使 DM 采集速率 ×${D.vehicles.protocolMult}</li>
    </ul>
    <h4>效能建筑 · 全局产出（「产出与效率」组）</h4>
    <p>卡面统一写「每级全局产出 +X%」，X 即<b>本级在当前产出基础上带来的增量</b>：加算建筑把 X 个百分点加进全局加法区，乘算建筑按 ×(1+X%) 复利叠进全局乘区，所以同类文案下乘算项的长期收益更高、后期单价也更贵。入门三座（预热节点 / 效能尖塔 / 双倍工坊）按每 +1% 同一基价定价、成本递增同为 ×1.40，<b>同一等级下价格比恒等于加成比</b>；越往后的建筑每 +1% 的单价逐档抬高，用于抑制速通。不同等级之间价格会按 growth^级 拉开，属级制成长而非性价比失衡。</p>
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
    <h4>设计原则（本游戏贯彻）</h4>
    <ul>
      <li>每个问题多种解法（EP 不够 → 建线程/点科技/做任务/买异兽）</li>
      <li>每个解法创造新问题（线程多 → 薪资涨 → EP 消耗快）</li>
      <li>不要削弱（后期产出万亿，成本也万亿级）</li>
      <li>存储上限制造张力（满了必须花）</li>
      <li>跨周期资源克制（负面只减缓不免疫，软上限防爆仓）</li>
    </ul>
  ` },
  { id: 'orchestration', name: '效能编排', unlock: null, body: () => `
    <h4>四条管线，一次取舍</h4>
    <p>完成 3 个任务或首次晋升后，工作台开放「效能编排」：EP 产出、RP 蒸馏、PT 孵化、DM 采集四条管线共用一份算力，压到一处就要从别处让出来。均衡编排不加不减；产能优先抬 EP、压其余三条；研究优先主推 RP；深渊优先主推 PT 与 DM。切换即时生效，没有冷却，也不会吞掉已经攒下的资源。</p>
    <h4>随潮汐排班</h4>
    <p>打开排班开关后，编排不再手动指定，而是跟着深渊潮汐轮转：涨潮走产能、平潮回均衡、退潮转研究、乱流切深渊。手动选定的策略会被记住，关掉排班立刻回到它。编排卡会同步列出当前四条编排倍率，与真实入账同口径。</p>
    <h4>和班组的关系</h4>
    <p>这里调的是倍率，班组调的是人头：线程岗位、自由产出与领导者全局加成由班组决定，两边分层相乘、不互相覆盖。卡面四条倍率是策略与相位共鸣合并后的编排倍率，不是全部加成的总和——EP、RP、PT 还会再乘班组那一层，DM 探采只受编排调节。</p>
  ` },
  { id: 'flows', name: '产出与台账', unlock: null, body: () => `
    <h4>每一秒发生了什么</h4>
    <p>一秒里工作台按顺序做四件事：线程与升级卡产出 EP → 灵感工坊、孵化管线按当前余额折算转化 → 薪资、异兽维持等开销扣账 → 潮汐、腐化与任务推进。顺序固定，所以「先攒够再转化」永远成立：余额不足时转化自然暂停，回升后自动恢复，不需要手动开关。</p>
    <h4>为什么数字对得上</h4>
    <p>顶栏显示的每秒产出，就是这一秒真正记进「本局 / 累计」的数字；达到 EP 上限后被截掉的部分不再计入统计，只按溢出比例累积腐化。蒸馏、孵化、载具探采消耗的 EP 走单独扣账口径，不会伪装成产出减少。想核对，就在同一帧比较顶栏每秒产出与本局累计的增量。</p>
  ` },
  { id: 'chronicle', name: '番外纪年', unlock: null, body: () => `
    <h4>终章之后</h4>
    <p>主线终章与三条故事线的终章都不是终点。归档、回声定位、值班表，以及后续四段番外，条件落在长线资产上：完成的任务数、封印的裂隙、累计远征次数、历史总产出、余烬与永恒碎片。它们不提供数值加成，只把那些没被写进效能报告的事留下来。</p>
    <h4>三条线各自的尾声</h4>
    <p>秩序线在协议之外留了注释位，深渊线不再划那条界线，信仰线留了一扇没有守卫的小门。每条线都有两段终章之后的番外，随该线进度逐步点亮；图鉴里已解锁的章节永久保留，转生不会清空。</p>
  ` },
  { id: 'chronicle2', name: '番外纪年 · 续', unlock: null, body: () => `
    <h4>值守日志之后</h4>
    <p>归档、回声定位、值班表、排班表之后，主线又留下四段番外：值守日志记的是「在」，相位表把潮汐四相写进一张纸，星尘账本里有一笔没人申领的照明调节，未命名进程只在相位切换的那一秒亮一下。它们都不提供数值加成，只把那些没被写进效能报告的事留下来。</p>
    <h4>三条线的尾声仍在延长</h4>
    <p>秩序线的协议之外、深渊线的界线、信仰线那扇没有守卫的小门，各自又多两段番外。条件依旧落在长线资产上，图鉴里已解锁的章节永久保留，转生不会清空。故事不会推着你走，它只是在你走到的时候，刚好亮着。</p>
  ` },
  { id: 'chronicle3', name: '番外纪年 · 三', unlock: null, body: () => `
    <h4>第一叠之后</h4>
    <p>主线又留下六段番外：第一叠记的是工作台自己多响的那一下，换弦写的是把焦点从产出挪开，共鸣纪年按相位给日志分了卷，减半的那夜没有改排班表，满弦那晚没有解锁任何东西，仍在值班给那个没有名字的进程填了备注。</p>
    <h4>三条线也还在走</h4>
    <p>秩序线、深渊线、信仰线各自再添两段番外，条件依旧落在长线资产上。故事不提供数值加成，也不推着你走；它只是在你走到的时候，刚好亮着。</p>
  ` },
  { id: 'chronicle4', name: '番外纪年 · 四', unlock: null, body: () => `
    <h4>代班之后</h4>
    <p>主线又留下八段番外：第一次代班写的是把开关推上去那一刻，会耗尽的那种给「帮忙」标了价，补给车按点把断掉的班接上，台账把每一次执行都记了下来。五张开关终于口径一致，一键全关第一次被按下，不写理由那条和最不产出的动作有关，仍在补货收在第三百二十个任务归档的那天。</p>
    <h4>故事不加成</h4>
    <p>这些段落不提供数值奖励，也不改变解锁顺序；条件只落在累计任务、历史产出、共鸣层数与长线资产上。三条故事线也各自多出两段番外，走法与主线一致。你走到的时候它亮着，没走到也不会催你。</p>
  ` },
  { id: 'schedule', name: '潮汐预案', unlock: null, body: () => `
    <h4>把排班表握在自己手里</h4>
    <p>效能编排开放后，随潮汐排班默认按固定次序轮转：涨潮走产能、平潮回均衡、退潮转研究、乱流切深渊。完成 8 个任务或职级达到 2 之后，潮汐预案解锁——四个相位各自可以改排任意一条策略，改动即时生效，关掉排班也不会丢。</p>
    <h4>想反悔的时候</h4>
    <p>排班改乱了点一下「恢复默认排班」，就回到最初的轮转次序。四相位各对应一条不同策略，默认表本身已经把四条管线都排过一遍。</p>
  ` },
  { id: 'watch', name: '值守与长夜', unlock: null, body: () => `
    <h4>为什么要有取舍</h4>
    <p>四条管线共用一份算力，任何一条编排都既有增益也有代价；均衡编排是唯一不加不减的一档。排班表不是让人把四个相位全填成最猛的策略，而是让产出、研究、孵化、探采各自有一个合适的时段。编排倍率与真实入账同口径，改完当场就能看到数字变化。</p>
    <h4>值守纪律</h4>
    <p>周期政策里还有一组「值守纪律」，完成 25 个任务或职级达到 5 后开放：白班偏产出、夜班偏协作、裂隙守夜偏余烬、轮值均衡偏全局与招募。四者互斥，每轮重选，改选成本随次数上涨。它和排班表叠加时，正负幅度会一起结算。</p>
  ` },
  { id: 'resonance', name: '相位共鸣', unlock: null, body: () => `
    <h4>待在同一个相位里</h4>
    <p>完成 12 个任务或职级达到 2 之后，效能编排卡里会多出一段相位共鸣。开启后，工作台在当前潮汐相位里持续运转会每 12 秒叠一层，最多 20 层；换相位时层数减半。焦点管线每层 +1.5%，其余三条每层 -0.2%——想叠得高，就得少换相位。</p>
    <h4>和排班表怎么配合</h4>
    <p>随潮汐排班会不断切相位，层数总被削掉一半；手动守住一条策略则相位照常流转，只是策略不变。两条路没有优劣：一条换策略的灵活，一条换层数的深度。卡面上四条编排倍率就是当前实际生效值，改完当场能看到对应管线的数字跟着变。</p>
  ` },
  { id: 'longline', name: '长线资产', unlock: null, body: () => `
    <h4>哪些东西不会清零</h4>
    <p>职级、永恒碎片、宗教、深渊遗物、深潜层级、裂隙余烬、故事线进度与成就都跨转生保留；本局的升级、线程、政策、任务与产出会在晋升或轮回时重来。顶栏资源按锚点逐一点亮，已经亮过的不会因为归零而重新藏起来。</p>
    <h4>门槛为什么越往后越高</h4>
    <p>研究、里程碑、政策与番外的后段门槛都落在累计资产上：完成的任务数、封印的裂隙、历史总产出。它们不是让前期变慢，而是给长线留一条能一直走下去的路；每一档新内容都复用已接线的效果，不会出现选了却没有效果的条目。</p>
  ` },
  // v3.11.0 百科扩充（24→29，+20.83%）：自动化玩法的说明与数值口径全部读配置单一真源。
  { id: 'assistant', name: 'AI 助手与自动化', unlock: null, body: () => `
    <h4>助手是常驻编制，类似班组</h4>
    <p>助手不是一次性燃料，而是自动化工人池——购买即扩编，不随动作消耗。每个决策周期，所有开启的动作岗位会分到若干名助手（类似线程绑定到岗位），每个动作每周期的执行次数 = 分到的工人数，人越多跑得越勤。助手数不足以覆盖全部开启动作时，低优先级动作（进阶组）临时挂起，面板与日志会写明「编制不足」，再购买助手即自动全开，无需重开开关。</p>
    <h4>一张动作表管全部</h4>
    <p>哪些动作消耗助手、开关叫什么、属于基础还是进阶、悬浮说明写什么，都由同一份动作声明派生；开关总闸也读这张表。因此新增动作不会出现「日志说全停、某个开关还在跑」这类漏项。基础三项只需研究「AI 管理核心」，进阶两项还各自需要额外解锁。</p>
    <h4>与其他乘区的关系</h4>
    <p>助手只决定「自动化动作能不能执行」，不参与任何产出倍率；效能编排调四条管线倍率，班组调线程岗位与自由产出，三者正交叠乘、互不重复计数。助手买多了不会让产出变快，只会让自动化多跑一阵。</p>
  ` },
  { id: 'supply', name: '助手定价与扩编', unlock: null, body: () => `
    <h4>只有一条来源：手动扩编</h4>
    <p>助手没有自动补给，购买即扩编。第 1 名 ${fmt(BALANCE.ai.assistants.baseCost)} EP，之后每买 1 名价格乘以 ${BALANCE.ai.assistants.costGrowth}，数量无上限（温和递增天然限购）。编制只增不减：任何动作执行都不会扣减助手数。</p>
    <h4>为什么要放缓定价</h4>
    <p>早期版本把助手做成消耗品、每买 1 名乘以 1.5，长期挂机会「耗尽又买不起」。现改为常驻编制，价格温和递增即可维持长期可扩编；价格还会被「拟我协议」一类研究摊薄，同一个研究键同时降低购买价。</p>
    <h4>预留线仍然生效</h4>
    <p>自动升级、招募与购建都要保证扣费后 EP 不低于预留线（默认 EP 上限的 ${Math.round(BALANCE.ai.defaultReserve * 100)}%）。编制充足但 EP 贴近预留线时，动作同样会暂停，这是预算保护而非编制不足。</p>
  ` },
  { id: 'ledger', name: '动作台账与未绑定', unlock: null, body: () => `
    <h4>本局记了什么</h4>
    <p>本局执行次数按动作（升级、招募、领取、购建、研究）+ 合计记录。台账只描述「真的跑过了多少次」，不参与任何数值结算。为避免面板被文字占满，它不占版面，<b>把鼠标移到助手行左侧的「空闲/总数」上即可看到</b>（悬停同时给出占编与总人数）。</p>
    <h4>每个动作能绑几名</h4>
    <p>基础三项（自动升级 / 自动招募 / 自动领取）<b>各上限 1 名</b>——一个决策周期本来就只结算一次，多绑只是白占人手，卡面显示为「n/1」且到顶后 ＋ 置灰。进阶两项（自动研究 / 自动购建）不设此上限。</p>
    <h4>占编就是开关</h4>
    <p>面板上每个动作只有「名称 + − 数字 +」：数字是该动作绑定的助手数，<b>绑了就是开启，绑 0 就是关闭</b>——没有额外的 ON/OFF 开关。0 名助手时三项基础动作自然全关，不会刷任何「待补员」提示。进阶两项（自动研究 / 自动购建）在真正解锁之前整张卡都不出现，解锁后自动带入同款步进器。</p>
    <h4>全停怎么做</h4>
    <p>把每个动作的 − 按到底（占编归零）就是全停——面板不再单独放「一键全关」按钮，避免一键误触把排好的编制清空。</p>
    <h4>混沌心智的边界</h4>
    <p>勾选混沌心智后 AI 自动化被永久接管，助手编制既不再变动也不退还，面板会明确写出这一点。接管不可取消，决定之前请留意已购助手的数量。</p>
  ` },
  { id: 'automation_num', name: '自动化数值附录', unlock: null, body: () => `
    <h4>决策节拍</h4>
    <p>基础决策间隔 ${BALANCE.ai.interval} 秒；深潜「拟态矩阵」每级缩短 20%（下限 40%），遗物「混沌触须」每级再缩短 10%（下限 50%）。悬浮说明写的是「每决策周期」而不是固定秒数，因为实际间隔会随这两项缩短。自动购建另有独立的购买间隔，档位为 ${BALANCE.ai.aiAutoBuild.rateOptions.join(' / ')} 秒，硬下限 ${BALANCE.ai.aiAutoBuild.minRate} 秒。</p>
    <h4>执行次数 = 绑定工人数</h4>
    <p>每个动作是一个「岗位」：开启时默认占编 crewSize（1）名助手，其余留在空闲池；你可在动作行用 +/− 手动调整占编数。每个决策周期，该动作执行次数 = 它绑定的助手数（绑定越多跑得越勤）；自动领取会一次领完所有待领取任务。编制只决定频次，不决定单产倍率；关闭开关或按 − 解绑即把占编释放回空闲池，常驻不消耗。</p>
    <h4>口径一致性</h4>
    <p>每项动作的占编基准（crewSize）在动作表里显式声明，绑定、台账与日志共用同一处实现；没有隐式「没写就不占编」的分支。这也是面板能把五项动作统一标注为「需 AI 助手编制」的原因。</p>
  ` },
];

export function wikiSectionById(id) { return WIKI_SECTIONS.find(s => s.id === id); }
export function wikiUnlocked(key) { return unlocked(key); } // v3.1.1 反馈⑥：展示不再门控，仅供内部/测试检索
