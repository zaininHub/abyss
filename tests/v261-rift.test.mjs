// v2.6.1 裂隙扩展源码断言（行为实测走 v261-rift-browser）
import { readFileSync } from 'node:fs';
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const src = readFileSync(new URL('../src/modules/rift.js', import.meta.url), 'utf8');
const bal = readFileSync(new URL('../src/data/balance.js', import.meta.url), 'utf8');

// V1 分级
rec('V1 分级公式 base=clamp(1+log10(cps),1,5) + 裂隙等级科技（v3.3.9 反馈⑤）', src.includes('1 + Math.floor(Math.log10(Math.max(1, cps || 1)))') && src.includes('Math.min(5, lv) + riftLevelTech()'), 'riftLevelOf');
rec('V1 五级名称（浅层/中层/深层/深渊/虚空之隙）', bal.includes("'浅层裂隙', '中层裂隙', '深层裂隙', '深渊裂隙', '虚空之隙'"), 'levelNames');
rec('V1 裂隙等级科技（EP+DM 无限升级，取代余烬探测井）', bal.includes('levelTech:') && !bal.includes('深空探测井'), 'levelTech');
// V2 余烬升级树
rec('V2 四科技（哨站/透镜/护符/余烬共振）', bal.includes('sentinel') && bal.includes('lens') && bal.includes('charm') && bal.includes('echo'), 'upgrades');
rec('V2 哨站间隔缩短（20min → v2.8.30 下限 10min）', src.includes('Math.max(600, BALANCE.rift.spawnSec * Math.pow(0.75, lv))'), 'riftSpawnSec');
rec('V2 透镜 DM/RP ×(1+0.2/级)', src.includes('1 + 0.2 * riftUpgradeLevel(\'lens\')'), 'riftDmMult');
rec('V2 护符封印成本 -10%/级（下限 50%）', src.includes('Math.max(0.5, 1 - 0.1 * riftUpgradeLevel(\'charm\'))'), 'riftSealCostMult');
rec('V2 余烬共振 VS ×(1+0.5/级)', src.includes('1 + 0.5 * riftUpgradeLevel(\'echo\')'), 'riftVsMult');
// V3 深入裂隙
rec('V3 深入成本（EP=封印×0.5；v2.8.30 去 DM 门槛）+ DM 未解锁灰显（v3.1.1 反馈④）', src.includes('Math.ceil(r.sealCost * 0.5)') && src.includes("resDiscovered.dm"), 'delveRift');
rec('V3 深入产出（DM 0.5×级/s + VS 0.2×级/s 深潜联动）', src.includes('delveDmPerLevel * lv * dt') && src.includes('delveVsPerLevel * lv * dt'), 'settle');
rec('V3 腐化累积（1%/级/s）+ 阈值 50% 损失 30% 封印成本', src.includes('delveCorruptPerLevel * lv * dt') && src.includes('delveFailCorrupt') && src.includes('ex.sealCost * BALANCE.rift.delveFailLoss'), 'risk');
rec('V3 紧急脱出不奖励（v2.6.5：脱出无产出/余烬，仅结束探索）', !src.includes('S.dm = (S.dm || 0) + ex.gainedDm') && src.includes('S.riftExpedition = null'), 'abort');
// V4 多元奖励
rec('V4 封印/拥抱共享奖励结算（DM+RP+VS+信仰+余烬）', src.includes('grantRiftRewards') && src.includes('S.riftEmber = (S.riftEmber || 0) + emberGain'), 'grant');
rec('V4 RP 锚点前置（rp 已发现才给）', src.includes('S.resDiscovered && S.resDiscovered.rp'), 'rp-gate');
rec('V4 VS 深潜解锁后概率（25%×级×共振）', src.includes('S.delve && S.delve.unlocked') && src.includes('BALANCE.rift.vsChance'), 'vs-gate');
rec('V4 信仰宗教解锁后概率（20%）', src.includes('S.religion && S.religion.unlocked') && src.includes('BALANCE.rift.faithChance'), 'faith-gate');
// V5 渲染/状态
rec('V5 裂隙卡新增「深入」按钮', src.includes('id="delve-rift"') && src.includes('深入'), 'renderRift');
rec('V5 渲染签名含 level（新裂隙重建 DOM）', src.includes('riftSig = sig;') && src.includes('${r.power}|${r.expiresAt}|${r.sealCost}|${r.level}'), 'sig');
rec('V5 裂隙 tab 渲染升级树', src.includes('renderRiftPanel') && src.includes('rift-upg-row'), 'panel');
rec('V5 状态字段（riftEmber/riftUpgrades/riftExpedition）', readFileSync(new URL('../src/state.js', import.meta.url), 'utf8').includes('riftEmber: 0, riftUpgrades: {}, riftExpedition: null'), 'state');
rec('V5 crossRun 保留余烬', readFileSync(new URL('../src/state.js', import.meta.url), 'utf8').includes("'riftEmber', 'riftUpgrades'"), 'crossRun');
rec('V5 裂隙 tab 入口显隐（裂隙触发后出现）', readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').includes('S._riftSeen || (S.riftsSealed || 0) > 0'), 'tab-visibility');

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.6.1 裂隙扩展源码断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
