// v2.0 剧情模块：使用 Provider 获取故事线相关章节
import { S } from '../state.js';
import { getChapters } from '../core/provider.js';

function _hasTech(id) { return !!(S.tech || {})[id]; }

function currentChapter(S) {
  const chapters = getChapters();
  if (!chapters || chapters.length === 0) {
    return { id: 1, name: '第一章 · 入职', desc: '你是矩阵科技内网中一个效能优化脚本。' };
  }
  let c = chapters[0];
  for (const ch of chapters) {
    try { if (ch.cond(S)) c = ch; } catch { /* skip */ }
  }
  return c;
}

export function renderStoryBar(container) {
  if (!container) return;
  const ch = currentChapter(S);
  container.innerHTML = `<span class="ch-label">剧情</span>
    <span id="ch-name" style="color:var(--purple);font-weight:600">${ch.name}</span>
    <span id="ch-desc" style="color:var(--text-3);font-size:10.5px;margin-left:8px;max-width:600px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ch.desc}</span>`;
}

export { currentChapter };
