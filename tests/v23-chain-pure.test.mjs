// v2.3.1 纯函数层单测（rev18 9.3 口径重写）：chainSplit 窗口公式 K = p + 1 /
// 已购∪窗口 / 乱序购买 / 展开交互移除后无残留 API（E2E 部分在 tests/v23-chain.mjs 浏览器段）
import { CHAIN_CONF, chainSplit, anchorDone, anchorShown, renderChainedGroups } from '../src/modules/disclosure.js';
import * as DISCLOSURE from '../src/modules/disclosure.js';

const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const S = {};
const mk = (n, purchasedIdx = []) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, bought: purchasedIdx.includes(i) }));
const byFlag = (it) => it.bought;

// —— K 公式（rev18 9.3）：新档任意模块窗口恒为 1，链外隐藏 ——
{
  const sp = chainSplit('shop', mk(20), byFlag, S);
  rec('P1 新档窗口 K = p+1 = 1 且链外不进 visible', sp.K === 1 && sp.visible.length === 1 && sp.hiddenCount === 19, `K=${sp.K}`);
  rec('P2 新档 chainNextIdx = 0（链头即唯一可购位，K=1）', sp.chainNextIdx === 0 && sp.K === 1);
}
{
  for (const [mod, n] of [['thread', 7], ['vehicles', 4], ['dm', 4], ['v21', 51], ['eternal', 14], ['offline', 4]]) {
    const sp = chainSplit(mod, mk(n), byFlag, S);
    rec(`P3 ${mod} 新档首屏恒 1（共 ${n} 项，K=p+1 无模块差异）`, sp.K === 1 && sp.visible.length === 1, `K=${sp.K}`);
  }
}

// —— 已购前缀：p 已购 ⟹ K = p + 1，已购全可见（旧档不回隐藏） ——
{
  const sp = chainSplit('shop', mk(20, [0, 1, 2, 3, 4, 5, 6, 7]), byFlag, S); // p=8
  rec('P4 已购 8 项 ⟹ K = p+1 = 9，已购全可见', sp.K === 9 && sp.chainNextIdx === 8 && sp.visible.length === 9, `K=${sp.K}, p=${sp.chainNextIdx}`);
  rec('P5 已购前缀下一项即唯一可购位（chainNextIdx=8 在窗口内）', sp.chainNextIdx === 8 && sp.K === 9);
}
{
  const sp = chainSplit('shop', mk(20, [0, 1]), byFlag, S);
  rec('P6 已购 2 项 ⟹ K = 3（窗口随 p 增长，不再有配置化首屏）', sp.K === 3 && sp.chainNextIdx === 2, `K=${sp.K}`);
}

// —— 乱序购买：已购∪窗口兜底，已购永不隐藏 ——
{
  const items = mk(20, [5, 9, 15]); // 乱序：p=0，但 3 项已购
  const sp = chainSplit('shop', items, byFlag, S);
  const visIds = new Set(sp.visible.map(x => x.id));
  rec('P7 乱序购买：全部已购项都在 visible（∪ 兜底）', [5, 9, 15].every(i => visIds.has(`i${i}`)), [...visIds].join(','));
  rec('P8 乱序购买：窗口仍含链首（K=1）', visIds.has('i0'));
  rec('P9 乱序购买 hiddenCount 正确（20 - |前1 ∪ 已购| = 20-4）', sp.hiddenCount === 16, `hidden=${sp.hiddenCount}`);
}

// —— ⑤ 展开交互移除：模块不再导出 expand / expandedCount / makeExpandBtn ——
{
  const mod = await import('../src/modules/disclosure.js');
  rec('P10 expand 已从 disclosure.js 移除（⑤）', !('expand' in mod));
  rec('P11 expandedCount 已从 disclosure.js 移除（⑤）', !('expandedCount' in mod));
  rec('P12 makeExpandBtn 已从 disclosure.js 移除（⑤）', !('makeExpandBtn' in mod));
  rec('P13 CHAIN_CONF 保留模块注册但 first/step 字段废止', CHAIN_CONF.shop && !('first' in CHAIN_CONF.shop) && !('step' in CHAIN_CONF.shop));
}

// —— ① 锚点判定（rev18 9.1）——
{
  const blank = {};
  rec('P14 新档全部锚点未完成', ['rp', 'pt', 'faith', 'dm', 'es'].every(k => anchorDone(k, blank) === false));
  const anchored = { upgrades: { atrium: 1, petland: 2, shrine: 1, scooter: 1 }, prestige: 1 };
  rec('P15 锚点完成判定（数量型持有≥1 / es 走 prestige≥1）', anchorDone('rp', anchored) && anchorDone('pt', anchored) && anchorDone('faith', anchored) && anchorDone('dm', anchored) && anchorDone('es', anchored));
  rec('P16 转生后 upgrades 清空但持久标记在 ⟹ anchorShown 仍 true（不回隐藏）', anchorShown('rp', { upgrades: {}, resDiscovered: { rp: true } }) === true);
  rec('P17 转生后 upgrades 清空且无持久标记 ⟹ anchorShown false（新档语义）', anchorShown('rp', { upgrades: {} }) === false);
}

// —— ⑤ 分组渲染通用器（rev18 9.3 分组口径；node 侧用轻量 DOM 桩验证归组与 0 项整组不渲染） ——
{
  // node 无 DOM：renderChainedGroups 仅用 document.createElement('div')，桩掉即可
  globalThis.document = { createElement: () => ({ className: '', textContent: '', dataset: {}, appendChild() {}, classList: { add() {} } }) };
  const mkContainer = () => {
    const kids = [];
    return {
      children: kids,
      appendChild(el) { kids.push(el); },
    };
  };
  const c = mkContainer();
  const sp = chainSplit('shop', mk(4, [0, 1]), byFlag, S); // p=2 ⟹ visible = i0, i1(已购), i2
  const groups = [
    { title: 'G-A', test: it => it.id === 'i0' || it.id === 'i2' },
    { title: 'G-B', test: it => it.id === 'i1' },
    { title: 'G-C', test: () => false }, // 无命中：整组不渲染
  ];
  renderChainedGroups(c, sp, groups, it => ({ className: '', dataset: {}, textContent: it.id, appendChild() {}, classList: { add() {} } }));
  const titles = c.children.filter(el => el.textContent === 'G-A' || el.textContent === 'G-B' || el.textContent === 'G-C').map(el => el.textContent);
  const items = c.children.filter(el => /^i\d$/.test(el.textContent)).map(el => el.textContent);
  rec('P18 分组渲染：组头按组序出现且 0 项组不渲染', titles.join(',') === 'G-A,G-B', titles.join(','));
  rec('P19 分组渲染：条目按组归位且不丢（i0,i2→A，i1→B）', items.join(',') === 'i0,i2,i1', items.join(','));
  const c2 = mkContainer();
  const sp2 = chainSplit('shop', mk(3), byFlag, S); // 新档 K=1 → 仅 i0 可见，归入 G-A
  renderChainedGroups(c2, sp2, [{ title: 'G-A', test: () => true }, { title: 'G-B', test: () => false }], it => ({ className: '', dataset: {}, textContent: it.id, appendChild() {}, classList: { add() {} } }));
  rec('P20 新档分组渲染：仅 1 项可见且落对组', c2.children.filter(el => /^i\d$/.test(el.textContent)).length === 1 && c2.children.some(el => el.textContent === 'G-A'));
}

// —— 豁免模块：未注册的模块全量放行 ——
{
  const sp = chainSplit('tech', mk(6), byFlag, S);
  rec('P21 未注册模块（科技树等豁免）全量可见', sp.visible.length === 6 && sp.hiddenCount === 0 && sp.chainNextIdx === -1);
}

// —— v2.3.2 §5.2：链提示整体废除——导出面零残留 ——
rec('P22 §5.2 链提示废除：CHAIN_HINT / attachChainHint / isChainNext 导出零残留',
  !('CHAIN_HINT' in DISCLOSURE) && !('attachChainHint' in DISCLOSURE) && !('isChainNext' in DISCLOSURE));

// —— 边界：空列表 / 全已购 ——
{
  const sp0 = chainSplit('shop', [], byFlag, S);
  rec('P23 空列表：K=0 且不炸', sp0.K === 0 && sp0.visible.length === 0);
  const spAll = chainSplit('dm', mk(4, [0, 1, 2, 3]), byFlag, S);
  rec('P24 全已购：全部可见、hiddenCount=0、K=n', spAll.visible.length === 4 && spAll.hiddenCount === 0 && spAll.K === 4);
}

const pass = results.filter(r => r.ok).length;
console.log(`\n[v23-chain-pure] ${pass}/${results.length} 项通过`);
process.exit(pass === results.length ? 0 : 1);
