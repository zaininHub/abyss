// 双包构建脚本：完整包 + dist 包，写 md5
// 用法：node tests/v23-package.test.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OUT = process.cwd() + '/../../artifacts';
const TMP_FULL = '/tmp/v23_full';
const TMP_DIST = '/tmp/v23_dist';

function md5(p) {
  const h = crypto.createHash('md5');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function zip(srcDir, outPath) {
  // -r 递归，-X 排除额外属性，-q 安静
  execSync(`cd "${path.dirname(srcDir)}" && zip -rXq "${outPath}" "${path.basename(srcDir)}"`, { stdio: 'inherit' });
}

// 准备临时目录
rimraf(TMP_FULL);
rimraf(TMP_DIST);

// 完整包：src/ + tests/ + dist/ + 顶层文件
// v2.3.1 打包洁癖（组长指示 7699323508513393966）：过程脚本不进完整包——
// probe/patch 类脚本已从仓库删除；前轮遗留的一次性诊断脚本从包内排除（仓库保留）。
fs.mkdirSync(TMP_FULL, { recursive: true });
const PKG_EXCLUDE_TESTS = ['v23-diag-bug.mjs', 'v23-diag-check2.mjs'];
for (const sub of ['src', 'tests', 'dist']) {
  copyRecursive(path.join(ROOT, sub), path.join(TMP_FULL, sub));
}
for (const f of PKG_EXCLUDE_TESTS) {
  const p2 = path.join(TMP_FULL, 'tests', f);
  if (fs.existsSync(p2)) fs.unlinkSync(p2);
}
for (const f of ['index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'README.md', 'DESIGN.md', '交付说明.md']) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TMP_FULL, f));
}

// dist 包：dist 全部 + 交付说明 + README
copyRecursive(path.join(ROOT, 'dist'), path.join(TMP_DIST, 'dist'));
fs.copyFileSync(path.join(ROOT, '交付说明.md'), path.join(TMP_DIST, '交付说明.md'));
fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(TMP_DIST, 'README.md'));

// zip
const fullZip = path.join(OUT, 'abyss_idle_v2.8.5_full.zip');
const distZip = path.join(OUT, 'abyss_idle_v2.8.5_dist.zip');
if (fs.existsSync(fullZip)) fs.unlinkSync(fullZip);
if (fs.existsSync(distZip)) fs.unlinkSync(distZip);

zip(TMP_FULL, fullZip);
zip(TMP_DIST, distZip);

const fullSize = fs.statSync(fullZip).size;
const distSize = fs.statSync(distZip).size;
const fullMd5 = md5(fullZip);
const distMd5 = md5(distZip);

console.log('=== 双包构建完成 ===');
console.log(`完整包: ${fullZip}`);
console.log(`  size = ${fullSize} bytes`);
console.log(`  md5  = ${fullMd5}`);
console.log(`交付包: ${distZip}`);
console.log(`  size = ${distSize} bytes`);
console.log(`  md5  = ${distMd5}`);

// 清理临时目录
rimraf(TMP_FULL);
rimraf(TMP_DIST);