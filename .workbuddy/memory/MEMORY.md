# 项目长期约定（abyss · 深渊效能工作台）

## UI 文案
- **面板不写跨面板指引**，尤其禁止「上限 N · 由升级商店「XX」提升」这类把数值和获取入口拼在一行的写法。
  面板只陈述自身数据（余额 / 上限 / 产出 / 开关），获取入口在它该在的地方（商店卡）说明。
- 卡面文案不暴露实现术语（如「已由产出基座接管，扩容不再叠加」），只写玩家能直接用的增量与当前值。

## 迭代流程
- 用户给编号反馈清单 → 逐条改数据/模块 → 只跑受影响测试（不做全回归）→ 版本 bump + `npm run build` → 写 `交付说明.md` 段落 + 记忆日志 → commit + push。
- 推送：`GIT_SSL_NO_VERIFY=1 git -c http.sslBackend=openssl push`。
- 测试脚本：`sed 's|/usr/local/bin/chromium|C:/Program Files/Google/Chrome/Application/chrome.exe|' tests/X.mjs > tests/_tmp_X.mjs`。
- 新测试可用 `process.env.CHROME_PATH || '/usr/local/bin/chromium'`，本机跑：`CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tests/X.mjs`。

## 接线陷阱（v3.6.0 / v3.6.1 踩过，改玩法前必查）
- **抽公共函数必须检查本文件内部调用**：把 `fmt` 从 economy.js 抽到 format.js 后，若 economy.js 只写 `export { fmt } from '...'`（再导出不建本地绑定），内部仍调用 `fmt()` 会在存档加载路径抛 `ReferenceError: fmt is not defined`，级联搞挂所有浏览器套件。正确做法：`import { fmt } from '...'; export { fmt };`。
- **同名双实现**：`currentChapter` 同时存在于 `data/chapters.js` 与 `modules/story.js`，而 `main.js` 只从 `modules/story.js` 导入。改 data 层不生效 → 必须确认「真实调用链」用的是哪个模块（用 `grep -rn "import.*符号" src/` 反查）。
- **数据加了但没进面板分组**：新 `BALANCE.researchUpgs` 项必须同步加进 `shop.js` 的 `RP_GROUPS`，否则玩家看不到买不到。同理，任何「配置数组 + 渲染分组表」的结构都要两头改，已加单测防回归。
- **时间单位**：`S.expeditions[].duration` 内部必须与 `Date.now()` 同为**毫秒**；`galaxyDur()` 返回秒仅用于展示。展示用 `fmtLongDuration(sec)`（天/小时），`fmtTime` 只输出 `H:MM:SS`。
- **两条购买路径同口径**：主商店买升级走 `bulkCostCalc(u,1) === unitCost(u,0)`；任何面板内自购入口必须用同一公式。
- **跨面板刷新**：商店买某项后置 `dirty.<目标面板>`，面板买商店项后置 `dirty.shop`，否则 UI 不同步。
- **旧断言编码旧设计**：改节奏/数值后 `smoke.test.mjs`、`runtime-verify.mjs`、既有 `v3xx-*-browser.mjs` 中的硬编码断言会失败，需判定是「真回归」还是「设计变更」，后者更新断言并在交付说明里列明。

## 重构内核（v3.6.1 新增，勿回退）
- `src/core/pricing.js`：纯定价内核（无 S/DOM）。`geomCostBase`/`rawGeomCostBase`/`bulkGeomCost`/`powerScale`/`compoundBuff`/`geomSeriesSum`/`deriveGeomGrowth`/`simulateProgression`。`simulateProgression` 可按天复利 mock 推进、由预期天数反推定价。
- `src/core/format.js`：纯格式化（`fmt`/`fmtRes`/`fmtTime`）。
- `src/ui/widgets.js`：纯 UI 构件（`progressBar`/`flowItem`/`resourceFlow`/`panelShell`），仅依赖 format.js。
- 任何新数值/UI 改动优先复用上述内核，禁止在模块里再写一遍几何单价或内联进度条 HTML。

## 命名规范（v3.6.1 新增 `命名规范.md`）
- 隐藏底层逻辑：内部键名不进 UI 文案。
- 消耗/产出统一 `- xx 单位/s + xx 单位/s`（经 `flowItem`/`resourceFlow`）。
- 禁止把迭代需求（如「v3.6.0 方向⑧」）写进 id/label/UI。
