// v3.12.10 ③：FP 资源节奏不变量
// 玩家口径：获取速度谨慎 · 购买价格要累计一段时间才够 · 上限 ≈ 同等级 1 小时产出满仓。
// 只断言「行为 / 数值关系」，不锁死易过期的具体像素或文案字符串。
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };

const { S, defaultState } = await import('../src/state.js');
const { FP_BALANCE } = await import('../src/data/balance.js');
const {
  TEMPLE, templeFaithPerSec, faithCap, faithVaultBonus, fpCapFillSec,
  sealUpgradeCost, oracleCost, crusadeCost,
} = await import('../src/data/religions.js');
const { UPGRADES } = await import('../src/data/upgrades.js');

const OLD = Object.freeze({ ratePerTempleLv: 0.05, capPerVaultLv: 50, capGrowth: 1.15, capBase: 100 });
const vaultCard = UPGRADES.find(u => u.id === 'faith_vault');

function fresh() {
  const d = defaultState();
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, d);
  S.religion = { unlocked: true, temple: 0, sun: 1 };
  S.upgrades = {};
  return S;
}

/** 同等级配置：圣所 Lv.n + 誓约圣龛 Lv.n，无任何额外乘区。 */
function atLevel(n) {
  fresh();
  S.religion.temple = n;
  S.upgrades.faith_vault = n;
  return S;
}

/** 参考乘区下的有效 FP/s（圣所每级线性 × 中盘乘区）。 */
const effectiveRate = (n, m) => TEMPLE.faithPerSec * n * m;
const oldCap = (n) => OLD.capBase + OLD.capPerVaultLv * (Math.pow(OLD.capGrowth, n) - 1) / (OLD.capGrowth - 1);

test('F1 真源自洽：每级上限 = 每级产出 × 3600s × 中盘乘区', () => {
  assert.equal(FP_BALANCE.targetFillSec, 3600);
  assert.equal(FP_BALANCE.capPerVaultLv,
    FP_BALANCE.ratePerTempleLv * FP_BALANCE.targetFillSec * FP_BALANCE.referenceRateMult);
  assert.equal(TEMPLE.faithPerSec, FP_BALANCE.ratePerTempleLv);
  assert.equal(vaultCard.fx.value, FP_BALANCE.capPerVaultLv, '升级卡 fx.value 必须与上限计算同源');
  assert.match(vaultCard.desc, new RegExp(`\\+${FP_BALANCE.capPerVaultLv}`), '卡面写明首级增量');
});

test('F2 方向正确：产出下降、单级上限上升（相对上一版基线）', () => {
  assert.ok(TEMPLE.faithPerSec < OLD.ratePerTempleLv, `产出应低于 ${OLD.ratePerTempleLv}`);
  assert.ok(FP_BALANCE.capPerVaultLv > OLD.capPerVaultLv * 3, '单级上限至少提升到旧值 3 倍以上');
  fresh();
  S.upgrades.faith_vault = 1;
  assert.equal(faithVaultBonus(), FP_BALANCE.capPerVaultLv, '首级增量真值');
  assert.equal(faithCap() - (FP_BALANCE.capBase), FP_BALANCE.capPerVaultLv, '买一级正好加这么多上限');
});

test('F3 同等级 1 小时口径：n=1..12、中盘乘区 5~8× 时满仓落在 0.5~2.5 小时', () => {
  for (let n = 1; n <= 12; n++) {
    atLevel(n);
    const cap = faithCap();
    for (const m of [5, 8]) {
      const hours = cap / effectiveRate(n, m) / 3600;
      assert.ok(hours >= 0.5 && hours <= 2.5,
        `Lv.${n} 乘区 ${m}× 满仓 ${hours.toFixed(2)}h 越界（上限 ${cap}）`);
    }
  }
  // 旧配置在同样乘区下只需几分钟，三条速度才因此脱节
  const oldHours = oldCap(5) / (OLD.ratePerTempleLv * 5 * 5) / 3600;
  atLevel(5);
  const newHours = faithCap() / effectiveRate(5, 5) / 3600;
  assert.ok(newHours > oldHours * 8, `满仓时间应显著拉长：旧 ${oldHours.toFixed(2)}h → 新 ${newHours.toFixed(2)}h`);
});

test('F4 购买价格需要累计：FP 升级首价至少攒 20 分钟，且上限够得着', () => {
  atLevel(5);
  const rate = effectiveRate(5, FP_BALANCE.referenceRateMult);
  assert.ok(sealUpgradeCost(0) / rate >= 1200, '圣印首价需累计 ≥20 分钟');
  assert.ok(oracleCost() / rate >= 3600, '神谕塔首价需累计 ≥1 小时');
  assert.ok(crusadeCost() / rate >= 3600, '圣战军首价需累计 ≥1 小时');
  // 旧上限曲线在 Lv.8 仍装不下神谕塔首价（786 < 2500）；新曲线 Lv.8 即够
  atLevel(8);
  assert.ok(faithCap() >= oracleCost(), `Lv.8 上限 ${faithCap()} 应覆盖神谕塔首价 ${oracleCost()}`);
  assert.ok(oldCap(8) < oracleCost(), '旧曲线确实够不着，回归有对照');
});

test('F5 单位 FP 的 EP 成本不变：只放慢时间，不偷偷改购买代价', () => {
  assert.equal(TEMPLE.faithEpPerUnit, 2000);
  atLevel(3);
  const rate = templeFaithPerSec();
  assert.equal(rate, TEMPLE.faithPerSec * 3, '无额外乘区时产出 = 每级产出 × 级数');
  assert.equal(fpCapFillSec(), faithCap() / rate, '满仓耗时口径 = 上限 / 当前产出');
  atLevel(0);
  assert.equal(fpCapFillSec(), Infinity, '圣所未建时不应给出误导性的满仓时间');
});

test('F6 上限逐级递增、余额钳制口径不变（几何级数原语）', () => {
  const caps = [];
  for (let n = 0; n <= 6; n++) { atLevel(n); caps.push(faithCap()); }
  for (let i = 2; i < caps.length; i++) {
    const delta = caps[i] - caps[i - 1];
    const prev = caps[i - 1] - caps[i - 2];
    assert.ok(delta > prev, `第 ${i} 级增量 ${delta} 应大于前一级 ${prev}`);
  }
});
