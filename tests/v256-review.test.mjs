// v2.5.6 review bugfix 套件：
// ① wages.js 头注释过期（v2.5.2/3 参数：15s 休眠 / ×0.3 / 20s 缓冲 / 补偿 30s）
// ② 流失预警（losing）恢复同样触发休眠补偿（原仅 dormant 恢复有补偿，转机不一致）
// ③ 任务过期不再静默消失（记日志）
import { readFileSync } from 'node:fs';

global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };

const results = [];
const rec = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const stateMod = await import('../src/state.js');
const { S } = stateMod;
const { tickWages } = await import('../src/modules/wages.js');
const { BALANCE } = await import('../src/data/balance.js');
const projects = await import('../src/modules/projects.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0,
    upgrades: {}, buildings: {}, tech: {},
    wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 },
    cultists: [{ name: 'T', output: 3, mood: '正常', moodTimer: 999 }],
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: false, dm: false },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  });
}
function mkState(extra = {}) {
  global.localStorage = { getItem: () => mkRaw(extra), setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 注释最终版 ==========
{
  const src = readFileSync('src/modules/wages.js', 'utf-8');
  rec('V1 头注释：休眠进入 60s（v2.8.1 放缓）', src.includes('连续欠薪 ≥60s'), 'comment');
  rec('V1 头注释：休眠产出 ×0.3（非旧 ×0）', src.includes('产出 ×0.3 温和产出'), 'comment');
  rec('V1 头注释：缓冲 60s（v2.8.1）', src.includes('缓冲 60s'), 'comment');
  rec('V1 头注释：补偿触发 60s（×1.5/120s，v2.8.1）', src.includes('持续 ≥60s 后恢复') && src.includes('默认 ×1.5/120s'), 'comment');
}

// ========== V2 losing 恢复补偿 ==========
{
  // 流失预警（losing，dormantSec 400s）→ EP 补足 → 恢复触发补偿 buff（×1.5 60s）
  Object.assign(S, mkState({ ep: 1e9, wageState: { state: 'losing', debtSec: 0, dormantSec: 400, bufferSec: 0, loseTimer: 0 } }));
  S.restBonusMult = undefined; S.restBonusUntil = 0;
  tickWages(0.5);
  const W = BALANCE.thread.wages;
  rec('V2 流失预警恢复：触发休眠补偿 buff（产出 ×1.5）', S.restBonusMult === (W.restBonusMult || 1.5) && S.restBonusUntil > 0, `mult=${S.restBonusMult}`);
  rec('V2 流失预警恢复：经 20s 缓冲回满薪（state=debt）', S.wageState.state === 'debt' && S.wageState.bufferSec === W.bufferSec, `state=${S.wageState.state},buffer=${S.wageState.bufferSec}`);
  // dormantSec < 30（快速恢复）→ 不触发补偿（正常转机门控）
  Object.assign(S, mkState({ ep: 1e9, wageState: { state: 'losing', debtSec: 0, dormantSec: 10, bufferSec: 0, loseTimer: 0 } }));
  S.restBonusMult = undefined;
  tickWakes: {
    tickWages(0.5);
    rec('V2 流失预警快速恢复（<30s）不触发补偿（门控正确）', S.restBonusMult === undefined, `mult=${S.restBonusMult}`);
  }
  // dormant 恢复原有行为保持（v2.5.3 既有）
  Object.assign(S, mkState({ ep: 1e9, wageState: { state: 'dormant', debtSec: 0, dormantSec: 300, bufferSec: 0, loseTimer: 0 } }));
  S.restBonusMult = undefined;
  tickWages(0.5);
  rec('V2 dormant 恢复补偿保持（既有行为不回退）', S.restBonusMult === (W.restBonusMult || 1.5), `mult=${S.restBonusMult}`);
}

// ========== V3 任务过期日志 ==========
{
  const logs = [];
  projects.setProjectLogFn((msg, cls) => logs.push(msg));
  Object.assign(S, mkState({
    ep: 100,
    projects: [{ id: 'p1', name: '过期任务', type: 'earn_ep', goal: 100, progress: 10, status: 'active', reward: { kind: 'ep', amount: 50 }, startsAt: Date.now() - 100000, deadline: Date.now() - 1000, pendingAt: 0 }],
  }));
  const { tickProjects } = await import('../src/modules/projects.js');
  tickProjects(1);
  rec('V3 任务过期记日志（不再静默消失）', logs.some(l => l.includes('已过期') && l.includes('过期任务')), logs.join(';'));
  projects.setProjectLogFn(null);
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.6 review 封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
