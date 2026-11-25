import { defineConfig } from 'vite';

// v2.0.2：file:// 双击打开兼容插件
// 背景：Chromium 对 file:// 协议下的 ES module 脚本一律按 CORS 拦截（origin 'null'），
// 仅加 base:'./' 时 file:// 仍会 404/CORS 失败（实测）。本工程构建产物为单 JS chunk
// 且不含任何 import/export 模块语法，故构建后把 <script type="module" crossorigin>
// 降级为经典 <script>、去掉 link 的 crossorigin，即可在 file:// 与任意子目录加载。
// 安全阀：仅当产物确为单 JS chunk 且无模块语法时才降级，未来若引入代码分割则跳过（保持 module 行为）。
function fileProtocolCompat() {
  return {
    name: 'file-protocol-compat',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || typeof html.source !== 'string') return;
      const jsKeys = Object.keys(bundle).filter(k => k.endsWith('.js') && bundle[k].type === 'chunk');
      const hasModuleSyntax = jsKeys.some(k =>
        /(^|[\n;])\s*(import|export)\s|import\.meta|import\s*\(/.test(bundle[k].code || ''));
      if (jsKeys.length !== 1 || hasModuleSyntax) return;
      html.source = html.source
        .replace(/<script type="module" crossorigin(\s|>)/g, '<script defer$1')
        .replace(/ crossorigin(?=[\s>])/g, '');
      // v2.0.3：降级为经典脚本时补 defer，保留 module 原本的"DOM 解析完成后执行"语义
      // （不加 defer 时脚本在 head 内同步执行、body 未解析，bindEvents 的 getElementById
      //  可选链会静默跳过，全部按钮监听缺失——页面看似正常但不可交互，v2.0.2 的 P0）
    },
  };
}

export default defineConfig({
  base: './', // v2.0.2：产物资源改相对路径引用，任意子目录部署均可加载
  server: { port: 5173, open: true },
  plugins: [fileProtocolCompat()],
  build: {
    outDir: 'dist',
    sourcemap: true, // v2.0.1：附带 source map，便于质检与线上问题定位
    // v4.3.28 P0 缺陷修复：产物必须包在 IIFE 里，禁止顶层声明泄漏到 window。
    // 根因（已用浏览器实测复现）：fileProtocolCompat 会把 <script type="module"> 降级为经典
    // <script defer>，于是产物所有顶层声明都成了全局：压缩后 src/core/runtime.js 的 log 恰好被
    // 重命名为 `S`（`function S(e,t){...}`），而 src/main.js 顶层的 `window.S = S`（存档单例，
    // 供浏览器测试/调试用）把它覆盖成一个普通对象。此后任何 import { log } 的模块（rift /
    // shop / expedition / tech / progression / religions …）在升级、收集、建设等路径调用 log
    // 都会抛 `TypeError: S is not a function`，整帧后续系统被中断：表现为「紧急脱出点了没反应」
    // 「深渊倒计时到 0 不清除」「暂停弹框不出现」，刷新后因存档回滚而"看起来好了"。
    // 包成 IIFE 后顶层声明是函数作用域，window.S 只是一个属性，不会再覆盖内部 log 绑定；
    // 同时也避免其它短名（如 `top` / `name`）与浏览器全局同名互踩。
    rollupOptions: { output: { format: 'iife' } },
    cssCodeSplit: false,
  },
});
