// v2.0 剧情模块：使用 Provider 获取故事线相关章节
// v3.6.0 方向⑥：章节推进统一走 data/chapters.js 的 minDays 门控（3-7 天/章、不回退），
// 此前本模块自带一份「取最后一个满足条件的章节」实现，导致主循环一天连跳十几个章节。
import { S } from '../state.js';
import { getChapters } from '../core/provider.js';
import { currentChapter as gatedChapter } from '../data/chapters.js';

function currentChapter(S) {
  const chapters = getChapters();
  if (!chapters || chapters.length === 0) {
    return { id: 1, name: '第一章 · 入职', desc: '你是矩阵科技内网中一个效能优化脚本。' };
  }
  try { return gatedChapter(S, chapters); } catch { return chapters[0]; }
}

export function renderStoryBar(container) {
  if (!container) return;
  const ch = currentChapter(S);
  container.innerHTML = `<span class="ch-label">剧情</span>
    <span id="ch-name" style="color:var(--purple);font-weight:600">${ch.name}</span>
    <span id="ch-desc" style="color:var(--text-3);font-size:10.5px;margin-left:8px;max-width:600px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ch.desc}</span>`;
}

export { currentChapter };
