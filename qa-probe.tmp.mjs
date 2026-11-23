// 探针：基线 vs 本轮——滚动处理函数里的触底判定何时成立？
// 基线：first=18 卡 sh=853；本轮：first=12 卡 sh=676。
// 测试只在 set st=76 后派发一次 scroll。基线时 76+600=676 >= 853-20=833？否！
// 但基线过了——因为基线首屏 sh=853，滚动一次后 cards 18→20? 不对，基线 first 就 18。
// 真相：基线 18 卡时测试轮询 20 次每 100ms 读 cards——周期重建重跑自动填充 while 循环！
// 基线 sh=853 可滚 → 测试 scroll 一次 cards 18→20（crewPage 6→7 超过 pageCount 3.33?）
// 重算：基线 first=18 卡意味着 crewPage 已自动填充到 3；total=20，pageCount=ceil(20/6)=4
// 滚动一次 crewPage 3→4 → 20 张全部展示 ✓
// 本轮 first=12 卡（crewPage=2）；滚动一次 crewPage 2→3 → 18 张；再滚一次才 4 → 20。
// 测试只滚一次 → 18 张卡 + 「下滑加载更多」 ← 2 项断言失败的机制！
// 根因：卡高不变（91.8），sh=676 vs 853 的差异在自动填充 while 的「可滚判定」：
//   基线 max-width:110+flex:1 下拉更窄时按钮仍在……不对，卡宽不变。
// 直接验证：本轮 12 卡 sh=676，基线 18 卡 sh=853——是「初始 crewPage」不同。
// 自动填充循环条件 scrollHeight <= clientHeight+4：600 像素容器，每组 3 行×91.8+gap。
// 12 卡=6 行×~95=676（可滚）停；18 卡=9 行~870…… 基线为何填到 18？
// 基线卡高多少？——需要实测基线卡高。跑基线量。
import puppeteer from 'puppeteer-core';
import { chromePath } from './tests/_chrome.mjs';
console.log('请直接看下一步：基线卡高探针');
process.exit(0);
