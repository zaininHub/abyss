// v4.3.28：裂隙深入到时终局与紧急脱出回归。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('rift expedition settles an already-expired run before charging another frame', () => {
  const rift = read('src/modules/rift.js');
  const settle = rift.match(/function settleRiftExpedition\(dt\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(settle, /if \(Date\.now\(\) >= Number\(ex\.until\)\) \{ finishRiftExpedition\(ex\); return; \}/,
    '过期深入必须在本帧扣 EP/累积产出之前结算，避免 UI 0s 卡住');
  assert.match(rift, /function finishRiftExpedition\(ex\)[\s\S]*?clearRiftExpedition\(\);/,
    '终局应统一清理深入状态');
});

test('rift expedition exit paths persist and redraw both rift surfaces', () => {
  const rift = read('src/modules/rift.js');
  const clear = rift.match(/function clearRiftExpedition\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(clear, /S\.riftExpedition = null;/, '统一清理必须结束深入状态');
  assert.match(clear, /save\(S\);/, '统一清理必须立即落档');
  assert.match(clear, /dirty\.rift = true;/, '主裂隙卡必须刷新');
  assert.match(clear, /dirty\.riftTab = true;/, '裂隙页必须刷新');
  assert.match(clear, /dirty\.hero = true;/, '顶部/HUD 必须刷新');
  const abort = rift.match(/export function abortRiftExpedition\(\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(abort, /clearRiftExpedition\(\);/, '紧急脱出必须走统一清理');
  assert.doesNotMatch(rift, /container\.querySelector\('#abort-rift-ex'\)/,
    '裂隙页不能绑定不存在于其容器内的紧急脱出按钮');
});

test('rift expedition panel accurately describes emergency exit reward loss', () => {
  const rift = read('src/modules/rift.js');
  assert.match(rift, /紧急脱出会放弃所有未结算产出/, '面板文案应与脱出规则一致');
  assert.doesNotMatch(rift, /可提前脱出保留已获产出/, '不得保留与规则相反的旧文案');
});

test('rift module remains importable in Node', async () => {
  const mod = await import(pathToFileURL(join(ROOT, 'src/modules/rift.js')).href);
  assert.equal(typeof mod.abortRiftExpedition, 'function');
  assert.equal(typeof mod.tickRift, 'function');
});
