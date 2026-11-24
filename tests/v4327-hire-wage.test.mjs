// v4.3.26 回归：招聘扣空 EP 后，顶栏/消耗浮窗仍需显示新线程应付薪资；
// 实际扣款/净流保持余额钳制口径，不能以展示修复改变结算。
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { S } = await import('../src/state.js');
const { displayedSalaryDrainPerSec, displayedDrainPerSec, displayedDrainBreakdown, salaryDrainPerSec, totalDrainPerSec } = await import('../src/modules/economy.js');

const worker = (id) => ({ id, name: `W${id}`, output: 3, mood: '正常', level: 1, leader: false, boundTo: null });
function reset(ep, n) {
  Object.assign(S, {
    ep, cultists: Array.from({ length: n }, (_, i) => worker(i + 1)), upgrades: {}, buildings: {}, tech: {},
    wageState: { state: 'ok', debtSec: 0, dormantSec: 0, bufferSec: 0, loseTimer: 0 },
    converterOn: { vehicles: true, atrium: true }, religion: {}, ptAutoHatch: false, ptDistillOn: false,
    atriumOn: true, rp: 0, dm: 0,
  });
}

test('招聘新增线程后应付薪资严格增加，即使 EP 已被购买扣空', () => {
  reset(100, 1);
  const before = displayedSalaryDrainPerSec();
  S.cultists.push(worker(2)); // 对应 hireCultist 成功 push 后、渲染前的状态
  S.ep = 0; // 购买刚好耗尽余额：历史顶栏会显示 0/s
  const after = displayedSalaryDrainPerSec();
  assert.ok(after > before, `新增线程应付薪资必须增加（${after} > ${before}）`);
  assert.equal(salaryDrainPerSec(), 0, '实际扣款在 EP=0 时仍必须为 0（余额钳制不变）');
  assert.equal(totalDrainPerSec(), 0, '真实净流/扣款总计保持实际口径');
  assert.equal(displayedDrainPerSec(), after, '顶栏展示总消耗应使用应付薪资口径');
  assert.ok(displayedDrainBreakdown().some(x => /线程薪资 -/.test(x)), '消耗浮窗应展示线程薪资行');
});

test('休眠态展示与实际都只计保命成本', () => {
  reset(0, 2);
  S.wageState.state = 'dormant';
  const displayed = displayedSalaryDrainPerSec();
  assert.ok(displayed > 0, '休眠态仍应展示保命成本');
  assert.equal(salaryDrainPerSec(), 0, 'EP=0 时实际扣款仍被钳制');
  reset(100, 2);
  S.wageState.state = 'dormant';
  assert.equal(displayedSalaryDrainPerSec(), salaryDrainPerSec(), '有余额时展示和实际同为保命成本');
});
