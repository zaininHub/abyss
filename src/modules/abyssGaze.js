// v3.4.2：凝视深渊彩蛋视觉层；v3.12.1 反馈② 重做为顶部「深渊之眼」HUD 徽记（挂 .sys-btns 行首）。
// v4.0.1 反馈④：应反馈改回屏幕底部中央固定悬浮（fixed left:50% bottom:58px，置于底部触手条带之上），
//   不再挤在系统按钮行首。下方 .sys-btns 历史说明保留备查。
// 旧版（v3.4.2）把眼睛固定在屏幕底部中央（bottom:0 / 56px），与 v3.12.0 新增的全宽底部触手条带
// 完全重叠（实测 97×56 满重叠），故 v3.12.1 改为挂载 .sys-btns；v4.0.1 以更高 bottom 值（58px）重新居中并避开条带。
// 视觉：胶囊仪器框 + 刻度/状态点 + 杏仁眼裂内发光竖瞳（扫视/眨眼/呼吸光晕）。
// 交互：点击触发 .gazing 反馈并向 main 注册的回调（log/toast）汇报。
// 动效只动 transform / opacity，prefers-reduced-motion 全量降级。

function buildEyeSvg() {
  return `
  <svg id="abyss-gaze-svg" viewBox="0 0 220 56" preserveAspectRatio="xMidYMid meet"
       style="display:block;width:100%;height:100%;overflow:visible" aria-hidden="true">
    <defs>
      <linearGradient id="ag-frame" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1d1030"/>
        <stop offset="100%" stop-color="#080312"/>
      </linearGradient>
      <radialGradient id="ag-iris" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f5d0fe"/>
        <stop offset="34%" stop-color="#c084fc"/>
        <stop offset="70%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#2a1046"/>
      </radialGradient>
      <radialGradient id="ag-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#a855f7" stop-opacity=".42"/>
        <stop offset="65%" stop-color="#7c3aed" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="ag-lid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0b0418"/>
        <stop offset="100%" stop-color="#20103a"/>
      </linearGradient>
      <clipPath id="ag-clip">
        <!-- 杏仁形眼裂 -->
        <path d="M46,28 C78,6 142,6 174,28 C142,50 78,50 46,28 Z"/>
      </clipPath>
      <filter id="ag-glow"><feGaussianBlur stdDeviation="2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>

    <!-- v3.12.3 反馈④：去掉胶囊仪器框 / 两端刻度 / 状态点——只留眼睛本身（无背景、无边框），
         眼裂在 220×56 的 viewBox 内水平垂直居中，与三个系统按钮同处一行 -->
    <!-- 眼后幽光 -->
    <ellipse class="ag-halo" cx="110" cy="28" rx="80" ry="25" fill="url(#ag-halo)"/>

    <g class="ag-eye">
      <g clip-path="url(#ag-clip)">
        <rect x="44" y="4" width="132" height="48" fill="#060210"/>
        <ellipse cx="110" cy="28" rx="52" ry="21" fill="#170b2b" opacity=".85"/>
        <!-- 虹膜 + 竖瞳（左右扫视） -->
        <g class="ag-iris">
          <circle class="ag-iris-glow" cx="110" cy="28" r="18" fill="url(#ag-iris)" filter="url(#ag-glow)"/>
          <ellipse class="ag-pupil" cx="110" cy="28" rx="4.2" ry="11.5" fill="#04010a"/>
          <circle cx="103" cy="21.5" r="2.4" fill="#fdf4ff" opacity=".9"/>
          <circle cx="117" cy="34" r="1.3" fill="#fdf4ff" opacity=".4"/>
        </g>
        <!-- 眼裂上下缘湿润反光 -->
        <path d="M48,28 C80,8 140,8 172,28" fill="none" stroke="#c4b5fd" stroke-width="1.1" opacity=".5"/>
        <path d="M48,28 C80,48 140,48 172,28" fill="none" stroke="#7c3aed" stroke-width="1" opacity=".55"/>
      </g>
      <!-- 上下眼睑 -->
      <path class="ag-lid ag-lid-top" d="M44,29 C76,2 144,2 176,29 C144,12 76,12 44,29 Z" fill="url(#ag-lid)" stroke="#4c1d95" stroke-width="1"/>
      <path class="ag-lid ag-lid-bot" d="M44,27 C76,54 144,54 176,27 C144,44 76,44 44,27 Z" fill="url(#ag-lid)" stroke="#2a1046" stroke-width=".9"/>
    </g>
  </svg>`;
}

function buildOverlay() {
  const wrap = document.createElement('div');
  wrap.id = 'abyss-gaze-crack'; // 沿用旧 id：存档/测试/ensureAbyssGaze 均以此为锚点
  wrap.className = 'abyss-gaze-hud';
  wrap.setAttribute('aria-hidden', 'true');
  // v3.12.4 ④：尺寸移出内联样式——内联声明会压过下面的窄屏媒体查询（此前 ≤899px 的缩小规则形同虚设）。
  // v4.0.1 反馈④：改为屏幕底部中央固定悬浮（left:50% + translateX(-50%)），bottom:58px 落于底部触手条带（最高 56px）之上，避免重叠遮挡。
  wrap.style.cssText = 'position:fixed;left:50%;bottom:58px;transform:translateX(-50%);' +
    'pointer-events:auto;cursor:pointer;z-index:40;' +
    'opacity:0;transition:opacity 1.8s ease-in;';
  wrap.innerHTML = buildEyeSvg();
  // 点击交互：点一下「凝视深渊」——视觉反馈（.gazing）+ 回调汇报（log/toast）。
  // 纯 Node 桩未实现 addEventListener，做能力检测后回退（与 querySelector 守卫一致）。
  if (typeof wrap.addEventListener === 'function') {
    wrap.addEventListener('click', () => {
      wrap.classList.remove('gazing');
      void wrap.offsetWidth; // 重排以重启动画
      wrap.classList.add('gazing');
      clearTimeout(wrap._gzT);
      wrap._gzT = setTimeout(() => wrap.classList.remove('gazing'), 700);
      if (typeof gazeInteract === 'function') gazeInteract();
    });
  }
  const isDark = !document.documentElement.classList.contains('light');
  wrap.querySelectorAll('.ag-lid').forEach(p => p.setAttribute('stroke', isDark ? '#4c1d95' : '#6d28d9'));
  const style = document.createElement('style');
  style.textContent = `
    /* 左右打量：左 → 停顿 → 中间 → 停顿 → 右，循环 */
    @keyframes ag-scan {
      0%, 6%   { transform: translateX(-7px); }
      26%, 40% { transform: translateX(0px); }
      60%, 74% { transform: translateX(7px); }
      94%,100% { transform: translateX(-7px); }
    }
    @keyframes ag-blink { 0%, 91%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.06); } 97% { transform: scaleY(1); } }
    @keyframes ag-pulse { 0%,100% { opacity: .74; } 50% { opacity: 1; } }
    @keyframes ag-breathe { 0%,100% { opacity: .5; } 50% { opacity: .95; } }
    @keyframes ag-beacon { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
    #abyss-gaze-crack .ag-eye { transform-box: fill-box; transform-origin: center; animation: ag-blink 7.6s ease-in-out infinite; }
    #abyss-gaze-crack .ag-iris { animation: ag-scan 11s ease-in-out infinite; }
    #abyss-gaze-crack .ag-iris-glow { animation: ag-pulse 4.2s ease-in-out infinite; }
    #abyss-gaze-crack .ag-halo { animation: ag-breathe 5.4s ease-in-out infinite; }
    #abyss-gaze-crack .ag-beacon { animation: ag-beacon 3.1s ease-in-out infinite; }
    #abyss-gaze-crack .ag-beacon-2 { animation-delay: 1.5s; }
    /* 点击「凝视深渊」反馈：竖瞳骤亮 + 整体光晕 */
    #abyss-gaze-crack.gazing { filter: drop-shadow(0 0 10px #c084fc); }
    #abyss-gaze-crack.gazing .ag-iris-glow { animation: ag-gaze-flash .7s ease-out; }
    @keyframes ag-gaze-flash { 0%,100% { opacity: .74; } 50% { opacity: 1; filter: drop-shadow(0 0 7px #f5d0fe); } }
    @media (prefers-reduced-motion: reduce) {
      #abyss-gaze-crack .ag-eye, #abyss-gaze-crack .ag-iris, #abyss-gaze-crack .ag-iris-glow,
      #abyss-gaze-crack .ag-halo, #abyss-gaze-crack .ag-beacon { animation: none; }
      #abyss-gaze-crack { transition: none; }
    }
    /* v3.12.4 ④：徽记尺寸（原为内联，已移出以便媒体查询生效） */
    #abyss-gaze-crack { width: 132px; height: 34px; }
    /* 中等屏：徽记收一档，给顶栏资源行腾出横向空间 */
    @media (max-width: 1199px) {
      #abyss-gaze-crack { width: 104px; height: 28px; }
    }
    /* 窄屏：系统按钮组换行时徽记同步缩小，不与按钮抢行高 */
    @media (max-width: 899px) {
      #abyss-gaze-crack { width: 96px; height: 26px; }
    }
  `;
  wrap.appendChild(style);
  return wrap;
}

export function showAbyssGaze() {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('abyss-gaze-crack');
  if (!el) {
    el = buildOverlay();
    // v4.0.1 反馈④：固定挂到 body（屏幕底部中央），离开 .sys-btns 行首。
    // 轻量 DOM 桩（纯 Node 单测）无 body，做能力检测后跳过，避免抛错。
    if (document.body && typeof document.body.appendChild === 'function') document.body.appendChild(el);
  }
  el.style.display = '';
  requestAnimationFrame(() => { el.style.opacity = '1'; }); // 下一帧淡入（首购/重载均生效）
}

export function hideAbyssGaze() {
  const el = document.getElementById('abyss-gaze-crack');
  if (el) { el.style.opacity = '0'; el.style.display = 'none'; } // flex 子项需真正移除占位
}

// 启动 / 重载时若已解锁则确保常驻
export function ensureAbyssGaze(unlocked) {
  if (unlocked) showAbyssGaze();
}

// main 注入点击交互回调（log/toast），避免模块间循环依赖
let gazeInteract = null;
export function setGazeInteract(fn) { gazeInteract = fn; }
