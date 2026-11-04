// v3.4.2：凝视深渊彩蛋视觉层（v3.4.5 反馈② 重做：屏幕底部中央一只左右打量你的眼睛）
// 独立模块（不依赖 main / rift，避免环形引用）：底部中央浮现一只竖瞳巨眼，
// 瞳孔缓慢左右扫视（带停顿）、偶尔眨眼、虹膜呼吸发光。纯装饰（pointer-events:none、不阻挡操作）。
let mounted = false;

function buildEyeSvg() {
  return `
  <svg id="abyss-gaze-svg" viewBox="0 0 260 150" preserveAspectRatio="xMidYMid meet"
       style="display:block;width:100%;height:100%;overflow:visible">
    <defs>
      <radialGradient id="ag-iris" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f5d0fe"/>
        <stop offset="38%" stop-color="#c084fc"/>
        <stop offset="72%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#2a1046"/>
      </radialGradient>
      <linearGradient id="ag-lid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#08030f"/>
        <stop offset="100%" stop-color="#1b0b2e"/>
      </linearGradient>
      <radialGradient id="ag-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#a855f7" stop-opacity="0.34"/>
        <stop offset="70%" stop-color="#7c3aed" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="ag-clip">
        <!-- 杏仁形眼裂：上下眼睑围出的开口 -->
        <path d="M22,78 C70,26 190,26 238,78 C190,128 70,128 22,78 Z"/>
      </clipPath>
      <filter id="ag-glow"><feGaussianBlur stdDeviation="3.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>

    <!-- 外圈幽光 -->
    <ellipse class="ag-halo" cx="130" cy="78" rx="126" ry="74" fill="url(#ag-halo)"/>

    <g class="ag-eye">
      <!-- 眼裂内的暗部（巩膜为深渊黑，只有虹膜发光） -->
      <g clip-path="url(#ag-clip)">
        <rect x="16" y="20" width="228" height="116" fill="#07020d"/>
        <ellipse cx="130" cy="84" rx="86" ry="52" fill="#160a26" opacity="0.85"/>
        <!-- 虹膜 + 竖瞳（左右扫视） -->
        <g class="ag-iris">
          <circle class="ag-iris-glow" cx="130" cy="78" r="34" fill="url(#ag-iris)" filter="url(#ag-glow)"/>
          <ellipse class="ag-pupil" cx="130" cy="78" rx="7.5" ry="21" fill="#04010a"/>
          <circle class="ag-shine" cx="118" cy="66" r="4.2" fill="#fdf4ff" opacity="0.9"/>
          <circle cx="142" cy="90" r="2.2" fill="#fdf4ff" opacity="0.42"/>
        </g>
        <!-- 眼裂上下缘的湿润反光 -->
        <path d="M24,78 C72,30 188,30 236,78" fill="none" stroke="#c4b5fd" stroke-width="1.6" opacity="0.5"/>
        <path d="M24,78 C72,126 188,126 236,78" fill="none" stroke="#7c3aed" stroke-width="1.4" opacity="0.55"/>
      </g>

      <!-- 上下眼睑（深色厚边，压住眼裂边缘 → 像正盯着你） -->
      <path class="ag-lid ag-lid-top" d="M18,80 C66,18 194,18 242,80 C196,44 64,44 18,80 Z" fill="url(#ag-lid)" stroke="#3b1d6e" stroke-width="1.4"/>
      <path class="ag-lid ag-lid-bot" d="M18,80 C66,132 194,132 242,80 C196,114 64,114 18,80 Z" fill="url(#ag-lid)" stroke="#2a1046" stroke-width="1.2"/>
    </g>
  </svg>`;
}

function buildOverlay() {
  const wrap = document.createElement('div');
  wrap.id = 'abyss-gaze-crack'; // 沿用旧 id：存档/测试/ensureAbyssGaze 均以此为锚点
  wrap.setAttribute('aria-hidden', 'true');
  // v3.4.6 反馈⑨：缩小并压到最底层——不遮挡任何 UI（z-index 1、pointer-events:none），
  // 位置贴底与宠物浮标齐平（v3.4.7 反馈④：宠物中心 ≈ bottom 12px + 15px = 27px；
  // 眼睛改 bottom:0 + 高 56px → 视觉中心 28px，与宠物图标水平对齐）
  wrap.style.cssText = 'position:fixed;left:50%;bottom:0;transform:translateX(-50%);' +
    'width:min(9.7vw,97px);height:min(5.6vw,56px);pointer-events:none;z-index:1;' +
    'opacity:0;transition:opacity 1.8s ease-in;';
  wrap.innerHTML = buildEyeSvg();
  const isDark = !document.documentElement.classList.contains('light');
  wrap.querySelectorAll('.ag-lid').forEach(p => p.setAttribute('stroke', isDark ? '#4c1d95' : '#6d28d9'));
  const style = document.createElement('style');
  style.textContent = `
    /* 左右打量：左 → 停顿 → 中间 → 停顿 → 右，循环 */
    @keyframes ag-scan {
      0%, 6%   { transform: translateX(-15px); }
      26%, 40% { transform: translateX(0px); }
      60%, 74% { transform: translateX(15px); }
      94%,100% { transform: translateX(-15px); }
    }
    /* 眨眼：偶尔合眼（压扁整只眼） */
    @keyframes ag-blink { 0%, 91%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.05); } 97% { transform: scaleY(1); } }
    @keyframes ag-pulse { 0%,100% { opacity: .74; } 50% { opacity: 1; } }
    #abyss-gaze-crack .ag-eye { transform-box: fill-box; transform-origin: center; animation: ag-blink 7.6s ease-in-out infinite; }
    #abyss-gaze-crack .ag-iris { animation: ag-scan 11s ease-in-out infinite; }
    #abyss-gaze-crack .ag-iris-glow { animation: ag-pulse 4.2s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      #abyss-gaze-crack .ag-eye, #abyss-gaze-crack .ag-iris, #abyss-gaze-crack .ag-iris-glow { animation: none; }
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
    document.body.appendChild(el);
  }
  // 下一帧淡入（首购/重载均生效）
  requestAnimationFrame(() => { el.style.opacity = '1'; });
}

export function hideAbyssGaze() {
  const el = document.getElementById('abyss-gaze-crack');
  if (el) { el.style.opacity = '0'; }
}

// 启动 / 重载时若已解锁则确保常驻
export function ensureAbyssGaze(unlocked) {
  if (unlocked) showAbyssGaze();
}
