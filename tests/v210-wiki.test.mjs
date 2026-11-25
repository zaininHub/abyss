// v2.1.0 Wiki 重做验收：按 KG wiki 的「资源 + 章节」组织，导览只讲怎么玩。
//
// 与既有测试的分工：
//   - v402 管「渲染无非法值 / 章节号合法 / 分组可解析」；
//   - 本文件管「新结构是否真的成立」：五卷边界、51 章全覆盖、导览不掺开发中内容、
//     新手/老手建议确实存在、资源页一资源一页。
import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }), body: { classList: { add() {}, remove() {} } }, addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { CHAPTERS } = await import('../src/data/chapters.js');
const { WIKI_SECTIONS, WIKI_GROUPS } = await import('../src/data/wiki.js');

const bodyOf = (id) => {
  const sec = WIKI_SECTIONS.find(s => s.id === id);
  assert.ok(sec, `缺百科章节 ${id}`);
  return sec.body();
};

console.log('[A] 五卷结构');

test('A1 五卷 = 导览 / 资源 / 章节 / 系统 / 查阅，且章节全部有归属', () => {
  assert.deepEqual(WIKI_GROUPS.map(g => g.key), ['guide', 'res', 'ch', 'sys', 'ref']);
  assert.ok(WIKI_GROUPS.every(g => g.name && g.hint), '每卷都要有卷名与一句说明');
  const owned = WIKI_GROUPS.flatMap(g => g.ids);
  assert.equal(new Set(owned).size, owned.length, '章节不得重复归属');
  assert.deepEqual([...owned].sort(), WIKI_SECTIONS.map(s => s.id).sort(), '每节都必须且只能属于一卷');
  assert.equal(WIKI_SECTIONS.length, 32);
});

test('A2 资源卷一个资源一页，且每页都写清来源与去向', () => {
  const ids = WIKI_GROUPS.find(g => g.key === 'res').ids;
  assert.equal(ids.length, 9, '资源总览 + 8 种资源');
  for (const id of ids.filter(x => x !== 'res')) {
    const html = bodyOf(id);
    assert.ok(html.includes('从哪来'), `${id} 缺「从哪来」`);
    assert.ok(html.includes('花到哪'), `${id} 缺「花到哪」`);
  }
});

console.log('[B] 章节卷覆盖 1..51');

test('B1 每一章都出现在章节卷，且推进条件不是占位符', () => {
  const html = ['ch1_5', 'ch6_10', 'ch11_15', 'ch16_18', 'ch_extra'].map(bodyOf).join('\n');
  for (const ch of CHAPTERS) {
    assert.ok(html.includes(`<td>${ch.id}</td><td>${ch.name}</td>`), `第 ${ch.id} 章未进入章节卷`);
    const row = html.match(new RegExp(`<td>${ch.id}</td><td>[^<]*</td><td>([^<]*)</td>`));
    assert.ok(row, `第 ${ch.id} 章行结构异常`);
    assert.notEqual(row[1], '—', `第 ${ch.id} 章缺推进条件文案`);
  }
});

test('B2 章节卷按进度分页，且每页都有「该做什么」', () => {
  for (const id of ['ch1_5', 'ch6_10', 'ch11_15', 'ch16_18']) {
    const html = bodyOf(id);
    assert.ok(html.includes('该做什么'), `${id} 缺行动指引`);
    assert.ok(/第 \d+ 章/.test(html), `${id} 未按章给出提示`);
  }
});

console.log('[C] 导览只讲怎么玩');

test('C1 导览不含版本号 / 研发口吻 / 未实装 / 已下线内容', () => {
  const intro = bodyOf('intro');
  const forbidden = [
    /v\d+\.\d+\.\d+/i, /版本/, /研发/, /设计原则/, /开发中/, /尚未实装/, /未实装/,
    /下线/, /不可达成/, /TODO/, /FIXME/, /此任务在当前版本/, /本轮/,
  ];
  for (const re of forbidden) {
    assert.ok(!re.test(intro), `导览出现开发中/废话内容：${re}`);
  }
  assert.ok(!/undefined|NaN|Infinity/.test(intro), '导览渲染出非法数值');
});

test('C2 导览给出新手建议与老手建议，且各有可执行动作', () => {
  const intro = bodyOf('intro');
  assert.ok(intro.includes('新手建议') && intro.includes('老手建议'));
  const novice = intro.slice(intro.indexOf('新手建议'), intro.indexOf('老手建议'));
  const veteran = intro.slice(intro.indexOf('老手建议'), intro.indexOf('常见误区'));
  assert.ok((novice.match(/<li>/g) || []).length >= 6, '新手建议条目过少');
  assert.ok((veteran.match(/<li>/g) || []).length >= 6, '老手建议条目过少');
  // 建议必须落到具体机制，而不是「多玩玩就好了」这类空话
  assert.ok(/\d/.test(novice) && /\d/.test(veteran), '建议应带具体数值或阈值');
});

test('C3 全站不再保留不可达的任务与纯剧情复述章节', () => {
  for (const sec of WIKI_SECTIONS) {
    assert.ok(!/协议测试/.test(sec.body()), `${sec.id} 仍保留不可达任务`);
  }
  assert.ok(!WIKI_SECTIONS.some(s => /chronicle/.test(s.id)), '番外复述章节应已移除');
});

console.log('[D] 交叉引用可跳转');

test('D1 每卷 related 都指向真实章节，且不指向自己卷内的节', () => {
  for (const g of WIKI_GROUPS) {
    for (const id of g.related || []) {
      assert.ok(WIKI_SECTIONS.some(s => s.id === id), `${g.key} 的 related 指向不存在的 ${id}`);
      assert.ok(!g.ids.includes(id), `${g.key} 的 related 不应指向本卷章节 ${id}`);
    }
  }
});
