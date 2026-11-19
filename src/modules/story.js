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
  // v4.2.0 反馈⑦：剧情文案不再省略号截断——旧版 max-width:280px + nowrap + ellipsis
  //   让「你的岗位是这张工…」看不到后半句。改为完整换行显示，章节名/正文各归其位。
  // v4.3.3 反馈④：「剧情」角标与章节名强制同行（inline-flex 组不被 flex-wrap 拆开），角标字号加大。
  container.innerHTML = `<span class="ch-head"><span class="ch-label">剧情</span>
    <span id="ch-name" style="color:var(--purple);font-weight:600">${ch.name}</span></span>
    <span id="ch-desc">${ch.desc}</span>`;
}

export { currentChapter };
