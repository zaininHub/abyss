// v3.10.0 新玩法「相位共鸣」——读侧与数值的单一真源（纯函数，可在 Node 下单测）。
//
// 玩法：效能编排开放并完成更多任务后，可以开启相位共鸣。工作台在当前潮汐相位里持续运转会
//       逐层堆叠共鸣（每 12 秒 +1 层，上限 20 层）；换相位时层数减半，逼玩家在「守一个相位」
//       与「随潮汐轮转」之间做取舍。玩家从四条管线里选一条作焦点：焦点管线每层 +1.5%，
//       其余三条每层 -0.2%（有增益必有代价，与编排策略的设计口径一致）。
//
// 接线纪律（与项目「无死数据」红线一致）：
//   - 数值只经 orchestrationMult() 进 economy.computeCps() 的标准乘区，以及 rp / pt 的 flowEngine 修饰器，
//     保证顶栏 CPS 显示、卡面倍率文本与真实入账三者同口径；
//   - 默认 enabled:false，未解锁 / 未开启 / 非法存档一律返回 1 —— 对既有存档零数值漂移；
//   - 状态字段由 stateSchema.COMPAT_KEYS 声明即自动兜底，SAVE_VERSION 保持 6，无迁移成本；
//   - 推进由帧系统 tide-schedule 调用 tickResonance(S, dt)，不新增系统 id、不碰 tick()。

export const RESONANCE_FOCI = Object.freeze([
  { id: 'ep', name: '产出', icon: '◈', label: 'EP 产出' },
  { id: 'rp', name: '蒸馏', icon: '◇', label: 'RP 蒸馏' },
  { id: 'pt', name: '孵化', icon: '◆', label: 'PT 孵化' },
  { id: 'dm', name: '探采', icon: '⬡', label: 'DM 采集' },
]);
const FOCUS_IDS = new Set(RESONANCE_FOCI.map(f => f.id));

// 解锁门槛是编排解锁门槛（3 任务 / 1 晋升）的严格超集，因此无需再调 orchestrationUnlocked，
// 避免 orchestration.js ↔ resonance.js 循环依赖；包含关系由 v3100 单测静态断言锁死。
export const RESONANCE_UNLOCK = Object.freeze({ projectsDone: 12, prestige: 2 });

export const RESONANCE_TUNING = Object.freeze({
  maxLayers: 20,
  secondsPerLayer: 12,
  focusGain: 0.015,
  sideCost: 0.002,
  sideFloor: 0.80,
  phaseDecay: 0.5,
});

export const DEFAULT_RESONANCE = Object.freeze({
  enabled: false, layers: 0, focus: 'ep', phase: -1, acc: 0,
});

/** 规范化状态：旧档 / 非法存档一律回落安全值，绝不放大数值。 */
export function resonanceState(S) {
  const raw = (S && S.resonance && typeof S.resonance === 'object') ? S.resonance : {};
  const layers = Number.isFinite(raw.layers) ? Math.min(RESONANCE_TUNING.maxLayers, Math.max(0, Math.floor(raw.layers))) : 0;
  return {
    enabled: !!raw.enabled,
    layers,
    focus: FOCUS_IDS.has(raw.focus) ? raw.focus : 'ep',
    phase: Number.isInteger(raw.phase) && raw.phase >= 0 && raw.phase <= 3 ? raw.phase : -1,
    acc: Number.isFinite(raw.acc) ? Math.max(0, raw.acc) : 0,
  };
}

export function resonanceUnlocked(S) {
  if (!S) return false;
  return (S.projectsDone || 0) >= RESONANCE_UNLOCK.projectsDone
    || (S.prestige || 0) >= RESONANCE_UNLOCK.prestige;
}

/** 数值读侧唯一入口：未解锁 / 未开启 / 非焦点键 / 非法状态一律安全回落。 */
export function resonanceMult(key, S) {
  if (!resonanceUnlocked(S)) return 1;
  const st = resonanceState(S);
  if (!st.enabled || st.layers <= 0) return 1;
  if (!FOCUS_IDS.has(key)) return 1;
  if (key === st.focus) return 1 + st.layers * RESONANCE_TUNING.focusGain;
  return Math.max(RESONANCE_TUNING.sideFloor, 1 - st.layers * RESONANCE_TUNING.sideCost);
}

/**
 * 每帧推进：dt 为秒。相位切换时层数按 phaseDecay 衰减（保留跨相位经营感）。
 * 返回 { changed, layers, phaseChanged } 供调用方决定要不要置脏。
 */
export function tickResonance(S, dt) {
  if (!S) return { changed: false, layers: 0, phaseChanged: false };
  const st = resonanceState(S);
  const raw = (S.resonance && typeof S.resonance === 'object') ? S.resonance : {};
  const phase = Number.isInteger(S.tidePhase) ? ((S.tidePhase % 4) + 4) % 4 : 0;
  let layers = st.layers, acc = st.acc, changed = false, phaseChanged = false;

  if (!resonanceUnlocked(S) || !st.enabled) {
    // 未解锁 / 关闭时只记录相位，不累积；已有层数保留（开回去继续用）
    if (st.phase !== phase) { S.resonance = { ...raw, ...st, phase }; changed = true; }
    return { changed, layers, phaseChanged };
  }

  if (st.phase !== phase) {
    layers = Math.floor(layers * RESONANCE_TUNING.phaseDecay);
    acc = 0;
    phaseChanged = true;
    changed = true;
  }
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  acc += step;
  const gain = Math.floor(acc / RESONANCE_TUNING.secondsPerLayer);
  if (gain > 0) {
    acc -= gain * RESONANCE_TUNING.secondsPerLayer;
    const next = Math.min(RESONANCE_TUNING.maxLayers, layers + gain);
    if (next !== layers) { layers = next; changed = true; }
  }
  // 累加器每帧静默写入；只有层数 / 相位变化才通知 UI 置脏，避免每帧重建面板 DOM。
  if (acc !== st.acc || st.phase !== phase || layers !== st.layers) {
    S.resonance = { ...raw, ...st, enabled: true, layers, phase, acc };
  }
  return { changed, layers, phaseChanged };
}

/** 玩家操作入口：严格校验，非法输入不写状态。 */
export function setResonanceEnabled(S, on) {
  if (!S || !resonanceUnlocked(S)) return false;
  const st = resonanceState(S);
  S.resonance = { ...st, enabled: !!on, acc: 0 };
  return true;
}
export function toggleResonanceEnabled(S) {
  return setResonanceEnabled(S, !resonanceState(S).enabled);
}
export function setResonanceFocus(S, id) {
  if (!S || !FOCUS_IDS.has(id)) return false;
  const st = resonanceState(S);
  S.resonance = { ...st, focus: id };
  return true;
}

/** 面板用：当前四管线实际倍率与层数（玩家可读，不暴露实现术语）。 */
export function resonanceSummary(S) {
  const st = resonanceState(S);
  return {
    unlocked: resonanceUnlocked(S),
    enabled: st.enabled,
    layers: st.layers,
    focus: st.focus,
    maxLayers: RESONANCE_TUNING.maxLayers,
    secondsPerLayer: RESONANCE_TUNING.secondsPerLayer,
    rows: RESONANCE_FOCI.map(f => ({
      key: f.id, label: f.label, icon: f.icon, focused: f.id === st.focus,
      mult: resonanceMult(f.id, S),
    })),
  };
}
