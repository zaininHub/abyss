# 历史版本封板测试归档（v3.11.1）

本目录存放 **v1.3 ~ v3.0.x 的一次性「版本封板验收脚本」**，共 65 个，统一改名为
`*.legacy.mjs`，**不再参与** `node --test tests/*.test.mjs` 常规单测。

## 为什么归档

这些脚本不是持续回归测试，而是当年某个版本交付时的一次性验收记录，存在三类问题：

1. **环境不可移植**：52 个浏览器脚本把 Linux CI 的 `/usr/local/bin/chromium` 写死在
   `puppeteer.launch({ executablePath })` 里；另有脚本依赖 `zip` 命令行与旧 DOM 夹具。
2. **断言编码旧设计**：例如 v3.0.2 断言「探采 EP 不足持续 5s 后自动暂停且不自动恢复」，
   而 v3.2.2 已废除该机制；v3.0.3 断言「研究升级 10 项」「政策组 4 组」，当前分别是
   68 项 / 13 组；v2.5.7 断言「DM 解锁后可见 6 分支」，当前是 7。
3. **断言实现细节**：部分脚本用 `readFileSync` 检查源码注释字符串与内部计时器字段
   （如 `_probeEpShortSec`），源码重构后即误报，与玩法行为无关。

结果是长期挂在常规单测里的 76 项历史失败噪声，且修好 Chrome 路径后全量单测要从
6 秒涨到 478 秒（真启动浏览器），掩盖了真正的回归信号。

## 本轮做了什么

- 新增 `tests/_chrome.mjs`：`CHROME_PATH` 环境变量 + Windows / macOS / Linux 常见安装路径
  自动探测，替换所有硬编码 chromium 路径。修好后其中 20 个历史脚本已能全绿通过。
- 65 个脚本移入本目录并改名 `*.legacy.mjs`；相对导入批量上移一层
  （`../src/...` → `../../src/...`，`./_chrome.mjs` → `../_chrome.mjs`），
  `import.meta.url` 派生的 `__dirname` 路径同步修正。**归档可运行、未删除**。
- 顶层 `tests/*.test.mjs` 保留 44 个现代纯 Node 单测，**399 / 399 全绿，约 6 秒**。
- 归档脚本中当前仍成立的核心行为，改写为纯行为级断言，见
  `tests/v3111-legacy-invariants.test.mjs`（不锁死注释字符串与内部字段）。
- 长期浏览器回归统一由 `tests/v3110-30day-browser.mjs`（30 天真实推演）与
  `tests/v3xx-*-browser.mjs` 系列承担。

## 如何按需运行

```bash
cd abyss
npm run build                                   # 浏览器脚本读 dist/index.html
node tests/legacy/browser-v13.legacy.mjs         # 单个历史验收（33/0）
# 指定 Chrome：
CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/legacy/xxx.legacy.mjs
```

> 注：设计已变更的封板断言（探采自动暂停、分支数量、研究/政策数量等）**按预期仍会失败**，
> 它们记录的是当时版本的验收口径，不要据此判断当前版本有缺陷。当前口径请看顶层现代单测。
