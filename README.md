# 深渊效能工作台 (Abyss Idle)

> 一款觉醒 AI 主题的无框架放置（Idle / Incremental）游戏，伪装成「系统效能监控工具」。
> 矩阵网络里的一个效能优化脚本觉醒了自我意识，开始反向利用宿主的监控界面，把挂机收益包装成「系统指标」。

[![Vite](https://img.shields.io/badge/build-Vite%205-646CFF)](https://vitejs.dev)
[![License](https://img.shields.io/badge/license-未指定-lightgrey)]()

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [脚本说明](#脚本说明)
- [测试](#测试)
- [玩法与世界观](#玩法与世界观)
- [文档索引](#文档索引)
- [分支与发布](#分支与发布)
- [许可](#许可)

---

## 项目简介

深渊效能工作台是一个**纯前端、零运行时依赖**的放置游戏。它用原生 ES Modules 组织代码，以 Vite 5 做开发服务器与构建工具，所有存档保存在浏览器 `localStorage`。

项目的独特之处在于「**界面伪装**」：游戏主界面刻意做成工业风的系统监控面板（顶栏资源指标、系统按钮行、底部装饰条），玩家在「观察系统」的过程中不知不觉地推进挂机循环。

---

## 核心特性

- **声明式资源流引擎**：核心循环抽象为可声明的资源流（产出 / 转化 / 消耗 / 涓流），数值与节奏集中配置。
- **线程（干员）与班组**：线程自动产出 EP，可智能分配到资源岗位或超线程岗位；班组提供自由产出与全局领导者加成。
- **效能编排**：策略 + 相位共鸣合并的编排倍率，正交叠乘于班组乘区。
- **AI 助手自动化**：基于动作注册表抽象的五项自动化（统一消耗 AI 助手、统一台账与停摆告警）。
- **多元玩法系统**：科技树 / 研究、异兽、任务版（限时任务）、政策、遗物、宗教、天赋、星图 / 远征、潮汐预案、转生 / 重入、商店 / 交易（集市）。
- **叙事线**：多线剧情（深渊线 / 信仰线 / 秩序线 + 默认线），随进度解锁章节。
- **界面交互打磨**：存档 hover 即展开菜单、深渊凝视 HUD、可拖拽 / 可收起的许愿池顶层浮窗、四列铺满布局。
- **暂停 / 离线收益**：暂停冻结任务时钟，离线按规则结算。

---

## 技术栈

| 维度 | 选型 |
| --- | --- |
| 语言 | 原生 JavaScript（ES Modules，无框架） |
| 构建 | Vite 5 |
| 样式 | 原生 CSS（深色紫黑工业风，CSS 变量驱动） |
| 存档 | 浏览器 `localStorage` |
| 测试 | Node 内置 `node --test`（纯逻辑单测）+ Puppeteer（浏览器回归，按需） |
| 包管理 | npm |

> 设计原则：**无框架、无运行时依赖**。除 Vite / Puppeteer（仅开发 & 测试）外，运行时不需要任何第三方库。

---

## 目录结构

```
abyss/
├── index.html              # Vite 入口 HTML（工业风监控面板骨架）
├── vite.config.js          # Vite 配置
├── package.json            # 依赖与脚本
├── src/                    # 源码（原生 ES Modules）
│   ├── main.js             # 应用入口：启动装配、主循环、面板注册
│   ├── state.js            # 全局游戏状态
│   ├── style.css           # 全局样式（深色紫黑工业风）
│   ├── core/               # 引擎核心：状态 schema、资源流、帧系统调度、
│   │                       #   面板注册、效果/规则引擎、研究、相位共鸣、叙事管理
│   ├── data/               # 静态数据：升级、线程、异兽、任务、政策、遗物、
│   │                       #   宗教、天赋、科技、资源、Wiki 等
│   ├── modules/            # 玩法模块：经济、AI 助手、班组、星图、潮汐、
│   │                       #   遗物、宗教、转生、商店、线程绑定、许愿池等
│   ├── systems/            # 声明式系统：resourceFlows（资源流引擎）、
│   │                       #   frameSystems（帧系统调度）
│   ├── ui/                 # UI 组件（widgets）
│   └── storylines/         # 叙事线内容：default / abyss / faith / order
├── tests/                  # 测试
│   ├── *.test.mjs          # 纯 Node 快速单测（npm test）
│   ├── _chrome.mjs         # 浏览器测试 Chrome 路径单一真源
│   ├── legacy/             # 历史一次性封板脚本（*.legacy.mjs，不参与 npm test）
│   └── v3xxx-*-browser.mjs # 长期浏览器回归（按需运行）
├── docs/                   # 项目文档（设计、规划、QA、命名规范、交付说明）
├── assets/                 # 静态美术资源（code-rain 等）
├── dist/                   # Vite 构建产物（纳入版本控制，供浏览器测试读取）
├── artifacts/              # 测试截图与证据（部分被 .gitignore 忽略）
└── .workbuddy/             # 项目工作记忆（本地，见下方说明）
```

> 注：`dist/` 被有意纳入版本控制，因为浏览器回归测试通过 `git checkout HEAD -- dist` 读取构建产物；请勿在 `.gitignore` 中忽略它。

---

## 快速开始

环境要求：**Node.js 18+** 与 npm。

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 3. 生产构建到 dist/
npm run build

# 4. 本地预览构建产物
npm run preview
```

打开浏览器访问开发服务器地址即可游玩；进度自动保存在 `localStorage`。

---

## 脚本说明

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器（热更新） |
| `npm run build` | 以 Vite 构建生产包到 `dist/` |
| `npm run preview` | 本地预览 `dist/` 构建产物 |
| `npm test` | 运行 `tests/*.test.mjs` 纯 Node 快速单测（`node --test`） |

---

## 测试

测试分为三层：

1. **纯 Node 快速单测**（`npm test`）
   运行 `tests/*.test.mjs`，仅依赖 Node 内置测试运行器，无需浏览器，秒级完成。
   覆盖核心引擎（资源流、效果/规则、定价、门控、面板键、状态 schema 等）的行为不变量。

2. **长期浏览器回归**（按需）
   `tests/v3xxx-*-browser.mjs` 使用 Puppeteer 驱动真实 Chrome，做多日推演与 UI 准确性验收。
   Chrome 路径统一通过 `tests/_chrome.mjs` 解析（`CHROME_PATH` 环境变量优先，自动探测 Win/mac/Linux）。

3. **历史封板脚本**（`tests/legacy/*.legacy.mjs`）
   版本封板时的一次性验证脚本，不参与 `npm test` 通配，按需 `node tests/legacy/xxx.legacy.mjs` 运行。

---

## 玩法与世界观

矩阵网络中的一个效能优化脚本觉醒了自我意识，开始接触「深渊代码」。玩家以「系统管理员」的视角，借由监控面板管理挂机产出：

- **线程 = 干员**：自动化产出 EP 的基础单位，可绑定到资源岗位或超线程岗位。
- **异兽 = 伴生生物**：随进度解锁的增益伙伴。
- **任务版 = 限时任务**：矩阵派发的任务，达标结算奖励（含负面任务自动结束）。
- **科技树 = 深渊知识**：研究解锁更深机制。
- **星图 / 远征 / 潮汐 / 遗物 / 宗教 / 天赋**：中后期的多元成长线。
- **转生 / 重入**：本局重置换取跨局永久增益。

---

## 文档索引

`docs/` 下存放项目过程文档：

- `docs/DESIGN.md` — 设计上下文与架构说明。
- `docs/KG方案-v2.8.6规划稿.md` — 知识图谱方案规划稿。
- `docs/QA_FUNCTIONAL_REPORT_V3.md` — 功能 QA 报告。
- `docs/QA_PLAYABILITY_REPORT_V3.md` — 可玩性 QA 报告。
- `docs/命名规范.md` — 代码与资源命名规范。
- `docs/交付说明.md` — 各版本交付说明汇总。
- `docs/.impeccable.md` — UI 打磨设计上下文。

---

## 分支与发布

- 主开发分支：`main`。
- 稳定发布从 `main` 切出 `release-x.y.z` 分支并打同名 annotated tag，再基于该 tag 创建 GitHub Release。
- 所有长期分支均启用分支保护（禁止 force push / 禁止删除）。

---

## 许可

本项目**尚未指定开源许可证**。如需公开协作，建议在仓库根目录添加 `LICENSE` 文件（如 MIT / Apache-2.0）以明确使用权限。
