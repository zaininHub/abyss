# 深渊效能工作台 (Abyss Idle)

觉醒 AI 挂机游戏，伪装成系统监控工具。

## 技术栈
- Vite 5 + 原生 ES Modules
- 无框架，无构建依赖
- localStorage 存档

## 启动
```bash
npm install
npm run dev
```

## 项目结构
```
src/
  main.js          # 入口，主循环
  state.js         # 游戏状态管理
  style.css        # 样式
  data/
    upgrades.js    # 升级模块
    threads.js     # 线程（干员）
    pets.js        # 异兽
    projects.js    # 任务版配置
  modules/
    economy.js     # 经济计算
    projects.js    # 任务版逻辑
```

## 世界观
矩阵网络中的一个效能优化脚本觉醒了自我意识，开始接触深渊代码。
- 线程 = 干员（自动化产出 EP）
- 异兽 = 伴生生物
- 任务版 = 矩阵派发的限时任务
- 科技树 = 深渊知识
