// v2.5.4 ①：快照存档系统——最多 3 个快照，可覆盖当前本地游戏（二级确认由 UI 层负责）
// 快照 = 当前完整存档 JSON 字符串（与导出/导入同源，经 SAVE_KEY 落盘），存于独立 key
import { SAVE_KEY } from '../state.js';

export const SNAP_KEY = 'abyss_idle_v2_snapshots';
export const SNAP_MAX = 3;

function read() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); } catch { /* 容量超限由调用方提示 */ }
}

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtStamp(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 生成快照：< 3 槽直接入空槽；已满则返回 oldest 供 UI 二级确认覆盖（不自动覆盖）
export function saveSnapshot() {
  const cur = localStorage.getItem(SAVE_KEY);
  if (!cur) return { ok: false, reason: '当前无存档' };
  const list = read();
  const snap = { id: 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: '快照', time: Date.now(), data: cur };
  if (list.length < SNAP_MAX) {
    list.push(snap);
    write(list);
    return { ok: true, covered: null, snap };
  }
  const oldest = [...list].sort((a, b) => a.time - b.time)[0];
  return { ok: false, needCover: oldest, snap }; // UI 二次确认后调用覆盖
}

// 覆盖最旧快照（二级确认后执行）
export function coverOldest(newSnap) {
  const list = read();
  if (list.length < SNAP_MAX) {
    list.push(newSnap);
    write(list);
    return { ok: true, covered: null };
  }
  const idx = list.indexOf([...list].sort((a, b) => a.time - b.time)[0]);
  const covered = list[idx];
  list[idx] = newSnap;
  write(list);
  return { ok: true, covered };
}

// 快照列表（含槽位号、时间与进度摘要——解析存档关键字段，供 UI 展示）
export function listSnapshots() {
  return read().map((s, i) => {
    let summary = { ep: 0, prestige: 0, chapter: 1, storyline: '', name: s.name };
    try {
      const d = JSON.parse(s.data || '{}');
      summary.ep = d.ep || 0;
      summary.prestige = d.prestige || 0;
      summary.chapter = d.chapter || 1;
      summary.storyline = d.storyline && d.storyline !== 'default' ? d.storyline : '';
    } catch { /* 坏档摘要归零 */ }
    return { ...s, slot: i + 1, timeText: fmtStamp(s.time), summary };
  });
}

// 取快照存档数据（字符串），供「作为本地游戏」覆盖当前进度
export function snapshotData(id) {
  const s = read().find(x => x.id === id);
  return s ? s.data : null;
}

// 删除快照
export function deleteSnapshot(id) {
  write(read().filter(x => x.id !== id));
}

// v3.10.4 ④：用当前进度覆盖指定槽位（列表「覆盖」按钮）
export function overwriteSnapshot(id, dataStr) {
  const list = read();
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return { ok: false, reason: '快照不存在' };
  const covered = list[idx].name;
  list[idx] = { id: list[idx].id, name: list[idx].name, time: Date.now(), data: dataStr };
  write(list);
  return { ok: true, covered };
}

// v3.10.4 ④：外部存档作为新快照入列（最多 SNAP_MAX，已满则覆盖最早）
export function importToSnapshot(dataStr, name) {
  const list = read();
  const snap = { id: 'snap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: name || '导入的存档', time: Date.now(), data: dataStr };
  if (list.length < SNAP_MAX) {
    list.push(snap);
    write(list);
    return { ok: true, covered: null, snap };
  }
  const idx = list.indexOf([...list].sort((a, b) => a.time - b.time)[0]);
  const covered = list[idx] ? list[idx].name : null;
  list[idx] = snap;
  write(list);
  return { ok: true, covered, snap };
}

export { fmtStamp };
