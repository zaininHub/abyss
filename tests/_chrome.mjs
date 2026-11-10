// 跨平台 Chrome / Chromium 可执行路径解析（v3.11.1）
//
// 背景：v2.x~v3.0 的历史浏览器验收脚本把 Linux CI 的 `/usr/local/bin/chromium`
// 写死在 `puppeteer.launch({ executablePath })` 里，在 Windows / macOS 开发机上
// 会直接抛 `Browser was not found at the configured executablePath`。
// 本模块是唯一真源：优先读 CHROME_PATH，其次按平台探测常见安装位置，最后回退 Linux 路径。
//
// 用法：import { chromePath } from './_chrome.mjs';  puppeteer.launch({ executablePath: chromePath(), ... })
import { existsSync } from 'node:fs';

const localAppData = (process.env.LOCALAPPDATA || '').replace(/\\/g, '/');

/** 按优先级排列的候选路径；不存在或为空的项会被跳过。 */
export const CHROME_CANDIDATES = Object.freeze([
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  localAppData ? `${localAppData}/Google/Chrome/Application/chrome.exe` : '',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/local/bin/chromium',
].filter(Boolean));

let cached = null;

/** 返回当前机器上可用的 Chrome/Chromium 可执行文件路径。 */
export function chromePath() {
  if (cached) return cached;
  const explicit = process.env.CHROME_PATH;
  if (explicit && !existsSync(explicit)) {
    throw new Error(`CHROME_PATH 指向不存在的文件：${explicit}`);
  }
  cached = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!cached) {
    throw new Error('未找到 Chrome / Chromium：请设置 CHROME_PATH 环境变量指向可执行文件');
  }
  return cached;
}

export default chromePath;
