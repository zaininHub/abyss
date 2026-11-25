// v4.2.0：章节解锁门禁单一真源——「一章一个新模块」的门禁侧实现。
// 无 state.js 依赖（避免 state.js → 本模块 → state.js 循环）：所有函数显式传 state。
// 设计原则（见 docs/方案-章节模块绑定-v4.2.md）：
//   ① 入口早开、章节给实质：P0~P9 天数门控继续管 tab 入口，本模块只在「实质功能」上 AND 叠加章节门禁。
//   ② 老玩家零回退：S.chapter 已过该章 → 判定恒 true（S.chapter 跨转生不回退，天然跨晋升保留）。
//   ③ 晋升绝不加门禁：第 4 章 cond(es>0) 依赖晋升先可用，加门禁即死锁。
//   ④ 无死数据：每个门禁 id 必须有真实消费点。

/** 主线章节号（权威下限 = S.chapter）。变体章（如 6A）取数字部分；无 state 时按 1。 */
export function chapterNumOf(state) {
  const raw = String((state && state.chapter) || '1');
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** 章节门禁：当前章 ≥ n 即放行（老玩家零回退）。 */
export function chapterAtLeast(n, state) {
  return chapterNumOf(state) >= n;
}

// 门禁 id → 所需章节。所有模块门禁统一读这里，避免散落硬编码。
// v4.3.36 反馈①重排：按「一章给一类实质」重新对齐全段节奏（用户定稿）——
//   第 1 章 遗物 + 裂隙、第 2 章 异兽、第 3 章 宗教 + 政策；集市移出第 2 章，改第 7 章开张。
//   · relics 1：裂隙在第 1 章（8 线程 + 10 分钟）就会出现，遗物与裂隙同章解锁；
//     relicsUnlocked() 仍要求「裂隙已触发 ∧ DM 已发现」双资产条件，不会开局白送遗物。
//   · religion/policy 3：第 3 章是「信仰 + 立法」的合流章。
//   · bazaar 7：集市是「富余资源换稀缺资源」的中局模块，第 7 章（晋升 ≥15）职级点已充足，
//     5 PP 买断不再像第 2 章那样「卡片永远灰」（旧口径只看 prestige≥1，被误读成第 2 章内容）。
//   · transcend 6 / eternals 8 / delve 11 / expedition 12 保持 v4.2 节奏
//     （深潜涉及 ES≥3 + 宗教长链 + 30 天推演重校准，本批不动）。
//
// v2.4.0 反馈②重排（用户定稿「一章最多两个内容」+「探采要大幅提前」+「相位共鸣提前」）：
//   · starchart 3 → 4：星图整体后移一档，让第 3 章只留宗教 + 政策两项；探采的高级内容
//     （深渊商店 4 项 + 后三档载具）随星图一起在第 4 章放开。
//   · resonance 10 → 5：相位共鸣前置到岔路口同章——它的前置只是「项目 ≥12 或晋升 ≥2」，
//     第 5 章自然满足，压到 10 章纯属排期浪费。
export const CHAPTER_GATES = Object.freeze({
  religion: 3,
  transcend: 6,
  policy: 3,
  eternals: 8,
  relics: 1,  // v4.3.36：原 3——遗物与裂隙同属第 1 章（资产门控仍在）
  resonance: 5, // v2.4.0：原 10——前置（项目 ≥12 或晋升 ≥2）第 5 章就满足，提前到岔路口同章
  delve: 11,
  expedition: 12,
  bazaar: 7,  // v4.3.36：新增——集市不再挂在第 2 章的「首次晋升」上
  starchart: 4, // v2.3.0 收进本章号真源；v2.4.0：3 → 4（星图后移，第 3 章留给宗教 + 政策）
  pets: 2,      // v2.3.0：从 shop.js 的 `parseInt(S.chapter) >= 2` 硬编码收进来（饵料仓库入口章）
});

// v2.3.0：门禁 id 白名单——供 access 策略表与测试校验「章节引用必须存在」。
export const GATE_IDS = Object.freeze(Object.keys(CHAPTER_GATES));

// 未知 id 的一次性告警（同一会话只报一次，避免每帧刷屏）。
let _unknownGateWarned = null;

/**
 * 按 id 判定门禁。
 * v2.3.0 起**未知 id 恒 false（fail-closed）**：旧实现返回 true，任何拼错/已删的 gate id
 * 都会静默放行——正是「集市挂错轴」那类 bug 的温床。拼错现在会被立刻发现（并 console.warn 一次）。
 */
export function gateOpen(id, state) {
  const n = CHAPTER_GATES[id];
  if (n === undefined) {
    if (_unknownGateWarned !== id) {
      _unknownGateWarned = id;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[chapterGates] 未知门禁 id「${id}」——按未开放处理（fail-closed）。请检查拼写或在 CHAPTER_GATES 注册。`);
      }
    }
    return false;
  }
  return chapterAtLeast(n, state);
}

/** 门禁对应章节号；未注册返回 null（UI 文案用，避免 `第 undefined 章`）。 */
export function gateChapter(id) {
  const n = CHAPTER_GATES[id];
  return n === undefined ? null : n;
}

/** 门禁的展示文案：`第 7 章`；未注册返回空串（调用方自行兜底）。 */
export function gateChapterText(id) {
  const n = gateChapter(id);
  return n === null ? '' : `第 ${n} 章`;
}

// ---- v4.2 数据清洗（用户反馈①：宗教第一章就解锁 = 旧档 _religionHintSeen + 当前章 < 4）----
// 旧档的 _religionHintSeen 是「曾满足粮仓/RP 条件」的持久标记，会让宗教 tab 在首章常驻显示。
// v4.2 起宗教实质功能改走章节门禁；该标记失去意义且会与新门禁冲突，版本更新时一次性清除。
// 同族清洗项统一登记在此，供 load() 迁移钩子调用（不改 SAVE_VERSION，走独立 _upgradeVer 标记）。
export const UPGRADE_VER = 1; // 数据清洗版本号（与 SAVE_VERSION 解耦，专管「版本更新时一次性清洗」）

export function runUpgrades(data) {
  const from = data._upgradeVer || 0;
  if (from >= UPGRADE_VER) return data;
  // v4.2：清掉宗教早解锁残留标记——此后宗教入口只由章节门禁 + 真实解锁态决定。
  if (data._religionHintSeen) delete data._religionHintSeen;
  data._upgradeVer = UPGRADE_VER;
  return data;
}
