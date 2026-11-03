// v3.4.2：凝视深渊彩蛋视觉层
// 独立模块（不依赖 main / rift，避免环形引用）：屏幕左下方裂开一道深渊裂隙，
// 触手尽头浮现一只回望你的异兽之眼。纯装饰（pointer-events:none、低透明度、不阻挡操作）。
let mounted = false;

function buildCrackSvg() {
  // 左下方开裂的锯齿裂隙 + 从裂隙中探出的触手与一只眼睛
  return `
  <svg id="abyss-gaze-svg" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet"
       style="position:absolute;left:0;bottom:0;width:min(46vw,360px);height:min(46vw,360px);overflow:visible">
    <defs>
      <radialGradient id="ag-eye" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f0abfc"/>
        <stop offset="55%" stop-color="#a855f7"/>
        <stop offset="100%" stop-color="#1a0b2e"/>
      </radialGradient>
      <linearGradient id="ag-crack" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stop-color="#0b0414"/>
        <stop offset="60%" stop-color="#3b1d6e"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
      <filter id="ag-glow"><feGaussianBlur stdDeviation="3" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <!-- 裂隙主体（左下方斜裂） -->
    <path class="ag-crack" d="M-10,330 L70,250 L55,225 L130,180 L110,150 L190,95 L165,70 L250,20 L300,-10 L320,-10 L320,330 Z"
          fill="url(#ag-crack)" opacity="0.92"/>
    <!-- 裂隙内缘高光 -->
    <path class="ag-edge" d="M-10,330 L70,250 L55,225 L130,180 L110,150 L190,95 L165,70 L250,20 L300,-10"
          fill="none" stroke="#c4b5fd" stroke-width="2.5" opacity="0.85" filter="url(#ag-glow)"/>
    <!-- 触手（从裂隙探出，缓慢摆动） -->
    <g class="ag-tentacles" filter="url(#ag-glow)">
      <path class="ag-t t1" d="M120,250 C150,210 140,170 175,150" fill="none" stroke="#7c3aed" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
      <path class="ag-t t2" d="M150,255 C190,225 200,180 235,170" fill="none" stroke="#6d28d9" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
      <path class="ag-t t3" d="M95,255 C120,220 110,185 140,165" fill="none" stroke="#8b5cf6" stroke-width="7" stroke-linecap="round" opacity="0.8"/>
    </g>
    <!-- 回望之眼 -->
    <g class="ag-eye" transform="translate(180,150)">
      <ellipse cx="0" cy="0" rx="34" ry="22" fill="#0b0414" stroke="#a855f7" stroke-width="2"/>
      <circle cx="0" cy="0" r="15" fill="url(#ag-eye)"/>
      <circle cx="0" cy="0" r="6" fill="#0b0414"/>
      <circle class="ag-pupil" cx="3" cy="-2" r="2.4" fill="#faf5ff"/>
    </g>
  </svg>`;
}

function buildOverlay() {
  const wrap = document.createElement('div');
  wrap.id = 'abyss-gaze-crack';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:fixed;left:0;bottom:0;width:min(46vw,360px);height:min(46vw,360px);' +
    'pointer-events:none;z-index:60;opacity:0;transition:opacity 1.6s ease-in;';
  wrap.innerHTML = buildCrackSvg();
  // 注入随主题变化的描边色（暗色主题下使用亮紫，亮色主题下用深紫）
  const isDark = !document.documentElement.classList.contains('light');
  const edgeColor = isDark ? '#c4b5fd' : '#4c1d95';
  wrap.querySelectorAll('.ag-edge').forEach(p => p.setAttribute('stroke', edgeColor));
  // 关键帧动画（触手摆动 + 眼睛呼吸 + 缓慢浮现）
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ag-sway { 0%,100%{ transform: rotate(-2deg); } 50%{ transform: rotate(2.4deg); } }
    @keyframes ag-breathe { 0%,100%{ opacity:.78; } 50%{ opacity:1; } }
    @keyframes ag-look { 0%,100%{ transform: translate(0,0);} 40%{ transform: translate(6px,-3px);} 70%{ transform: translate(-5px,2px);} }
    #abyss-gaze-crack .ag-t { transform-origin: bottom left; animation: ag-sway 6s ease-in-out infinite; }
    #abyss-gaze-crack .ag-t.t2 { animation-duration: 7.5s; animation-delay: -1s; }
    #abyss-gaze-crack .ag-t.t3 { animation-duration: 5.2s; animation-delay: -2.4s; }
    #abyss-gaze-crack .ag-eye { animation: ag-breathe 4.5s ease-in-out infinite; transform-box: fill-box; }
    #abyss-gaze-crack .ag-pupil { animation: ag-look 9s ease-in-out infinite; }
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
