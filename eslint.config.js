// ESLint 9 flat config —— 只开启能抓真实缺陷的规则，不强行统一既有代码风格。
// 设计取舍：本项目是 2 万行原生 JS + 461 条单测，历史代码有意保留数值沿革注释；
// 因此不引入 Prettier/TypeScript，静态检查的定位是「抓拼写错位、未定义变量、重复键、死代码」。
import js from '@eslint/js';
import globals from 'globals';

const commonLanguage = {
  ecmaVersion: 'latest',
  sourceType: 'module',
};

export default [
  {
    ignores: [
      'dist/**',            // 构建产物（有意入库，浏览器回归读取）
      'node_modules/**',
      'artifacts/**',
      'assets/**',
      'tests/legacy/**',    // 历史封板脚本：保留可运行，但断言编码旧设计，不参与现代 lint
      'tests/playthrough-shots/**',
      '.workbuddy/**',
    ],
  },
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ...commonLanguage,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // 允许 `while(true)` 等有意的控制流，但其它恒真/恒假条件仍报错
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 统一回调签名（成就 test(S, ctx)、故事线 hooks(ctx)、执行器(ctx, workers)）与 catch 容错是设计约定，
      // 不检查参数/捕获变量；只盯真正未使用的变量与 import，警告而非阻塞便于渐进清理
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    // 浏览器专项脚本在 Puppeteer 页面上下文引用注入的全局 S，静态分析必然误报；
    // 与 tests/legacy 归档纪律一致，lint 只覆盖现代纯 Node 单测与构建配置。
    files: ['tests/**/*.test.mjs', 'vite.config.js', 'eslint.config.js'],
    ...js.configs.recommended,
    languageOptions: {
      ...commonLanguage,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
