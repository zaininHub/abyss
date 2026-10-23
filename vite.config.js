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
  build: { outDir: 'dist', sourcemap: true }, // v2.0.1：附带 source map，便于质检与线上问题定位
});
