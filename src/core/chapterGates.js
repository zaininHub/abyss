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
// v2 修订：宗教=4（EP 出口保住）、超验/隐密圣学=6、政策=7、永恒矩阵=8、
//         遗物=9、共鸣=10、深潜=11、殖民=12。
export const CHAPTER_GATES = Object.freeze({
  religion: 4,
  transcend: 6,
  policy: 7,
  eternals: 8,
  relics: 9,
  resonance: 10,
  delve: 11,
  expedition: 12,
});

/** 按 id 判定门禁，未知 id 恒放行（防误伤）。 */
export function gateOpen(id, state) {
  const n = CHAPTER_GATES[id];
  return n === undefined ? true : chapterAtLeast(n, state);
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
