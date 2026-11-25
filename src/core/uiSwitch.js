// v4.3.30 反馈①：自动开关统一为「滑块」组件。
// 此前同一类开关在不同页面三种长相：⚡转化弹层是「开/关」文字按钮、研究点/异兽是红绿实心按钮、
// 集市二次确认是胶囊滑块——同一功能三种心智模型。现全部收敛为一枚滑块（26×14 轨道 + 10px 圆点，
// 开启绿/关闭灰），文案只作为滑块右侧的状态标签，由各页面按语义传入。
//
// 两种用法（同一套 class，样式与状态语义完全一致）：
//   1) switchHtml(...)   独立可点按钮——自身承载 role="switch" + aria-checked，点击行为各页面自行委托；
//   2) switchInline(...) 行内装饰滑块——用于「整行本身就是按钮」的场景（如 ⚡转化弹层列表项，
//      行按钮上已有 role/aria，滑块不能再嵌 <button>，否则 HTML 非法且点击目标漂移）。
//
// 纯函数、无副作用、不碰状态：只负责产出标记，开关的读写仍走各模块既有入口
// （setConverterEnabled / S.riftAuto / S.ptDistillOn …），避免出现第二份状态真源。

function track(on) {
  return `<i class="ui-switch-track"><b class="ui-switch-thumb"></b></i>`;
}

function label(text) {
  return text ? `<span class="ui-switch-label">${text}</span>` : '';
}

/**
 * 独立滑块按钮（可点）。
 * @param {object} o
 * @param {boolean} o.on 是否开启（决定 .on 与 aria-checked）
 * @param {string} [o.attrs] 额外属性串（data-* / style / id 等，原样拼进标签）
 * @param {string} [o.label] 右侧状态文案（如「开」「自动开」「探采中」）
 * @param {string} [o.title] 原生 title 提示
 * @param {string} [o.aria] aria-label（无可见文案时必须给，供读屏）
 */
export function switchHtml({ on = false, attrs = '', label: text = '', title = '', aria = '开关' } = {}) {
  return `<button type="button" class="ui-switch${on ? ' on' : ''}" role="switch" aria-checked="${on ? 'true' : 'false'}"`
    + `${attrs ? ' ' + attrs : ''}${title ? ` title="${title}"` : ''} aria-label="${aria}">`
    + `${track(on)}${label(text)}</button>`;
}

/**
 * 行内装饰滑块（不可独立点，供整行按钮内部使用）。
 * 行按钮自己负责 role="switch" 与 aria-checked，这里只画轨道，读屏不重复播报。
 */
export function switchInline(on = false) {
  return `<span class="ui-switch ui-switch-inline${on ? ' on' : ''}" aria-hidden="true">${track(on)}</span>`;
}

export { label as switchLabelHtml };
