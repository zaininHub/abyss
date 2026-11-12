// v3.0.3 后续反馈④：宇宙探索大模块——科技树「深空探测」+ RP 已发现后开放
// 定位：EP 的终局巨型出口——每项工程消耗「当前 EP 存储上限 × 比例」的巨量 EP，
// 一次性把 EP 转化为稀缺资源（PT/DM/信仰/余烬/VS/RP），跨资源发展通道（与集市互补、成本口径随存储上限缩放）。
// 克制：每项等级上限 4~5、成本 ×1.7~1.9/级陡峭增长、转化率劣于最优通道（集市/深潜）但不占库存不占队列。
import { S, save } from '../state.js';
import { fmtMultDelta } from '../core/format.js'; // v3.12.0 反馈⑮：倍率 → 带符号百分比
import { fmt, epStorageCap, addRp, addDm, addPt, hasTech, ptCap, dmCap, rpCap, researchMult } from './economy.js';
import { faithCap } from '../data/religions.js';
import { log, toast, dirty } from '../core/runtime.js';
import { starChartUnlocked } from './disclosure.js'; // v3.12.9：宇宙探索与星图 tab 同源（宠物在前）

// v3.4.6 反馈③：宇宙探索工程改消耗「星际燃料 CPS」（原巨量 EP）——CPS 由星图探索产出，
// 呼应「CPS 用于升级星际探索的所有升级」。每项 baseCps 为 CPS 首价，growth 沿用；
// 产出按固定 unit 换算（cost/unit 取整）。
// epPerUnit：每 1 单位资源消耗的 EP（口径参考集市最优通道并放大 1.2~2 倍，保持「巨量 EP」感）
export const COSMOS = {
  asteroid: { id: 'asteroid', name: '小行星采矿', icon: '⛏️', res: 'pt',    ratio: 0.10, growth: 1.7, cap: 5, baseCps: 60,  unit: 6,
    desc: '开采小行星带——星际燃料换 PT' },
  collider: { id: 'collider', name: '暗物质对撞', icon: '🌀', res: 'dm',    ratio: 0.12, growth: 1.7, cap: 5, baseCps: 80,  unit: 8,
    desc: '对撞真空提取暗物质——星际燃料换 DM' },
  starwish: { id: 'starwish', name: '星辰祈愿',   icon: '🙏', res: 'faith', ratio: 0.10, growth: 1.8, cap: 5, baseCps: 100, unit: 20,
    desc: '向深空祈祷——星际燃料换 FP' },
  cinder:   { id: 'cinder',   name: '灰烬回收',   icon: '🕯️', res: 'ember', ratio: 0.15, growth: 1.8, cap: 4, baseCps: 150, unit: 30,
    desc: '回收超新星残骸——星际燃料换裂隙余烬' },
  beacon:   { id: 'beacon',   name: '虚空信标',   icon: '🌑', res: 'vs',    ratio: 0.20, growth: 1.9, cap: 4, baseCps: 240, unit: 60,
    desc: '向虚空投掷信标——星际燃料换虚空碎片（VS）' },
  distill:  { id: 'distill',  name: '深空蒸馏',   icon: '🔬', res: 'rp',    ratio: 0.15, growth: 1.8, cap: 5, baseCps: 90,  unit: 6,
    desc: '蒸馏星际尘埃——星际燃料换研究点（RP）' },
};

export const COSMOS_RES_LABEL = { pt: '🍪 PT', dm: '🌀 DM', faith: '🙏 FP', ember: '🕯️ 余烬', vs: '🌑 VS', rp: '🔬 RP' };

export function cosmosUnlocked() {
  // v3.12.9：星图未开放（宠物/PT 未解锁）时，宇宙探索也不该由自动化绕过 tab 直接购买
  return starChartUnlocked(S) && hasTech('deep_space') && !!(S.resDiscovered && S.resDiscovered.rp);
}

export function cosmosLv(id) {
  return (S.cosmos && S.cosmos.lv && S.cosmos.lv[id]) || 0;
}

// 成本 = CPS 首价 × growth^已购级（v3.4.6 反馈③：货币从 EP 改为星际燃料 CPS）
export function cosmosCost(p, lv) {
  return Math.round((p.baseCps || 60) * Math.pow(p.growth, lv || 0));
}

export function cosmosReward(p, cost) {
  return Math.max(1, Math.floor(cost / (p.unit || 6)));
}

// v3.3.9 反馈⑦：可存储资源满仓判定（余烬/VS 无上限，恒 false）
function resFull(key) {
  if (key === 'pt') return (S.pt || 0) >= ptCap() - 1e-9;
  if (key === 'dm') return (S.dm || 0) >= dmCap() - 1e-9;
  if (key === 'rp') return (S.rp || 0) >= rpCap() - 1e-9;
  if (key === 'faith') return (S.faith || 0) >= faithCap() - 1e-9;
  return false;
}

function grantRes(key, n) {
  switch (key) {
    case 'rp': addRp(n); break;
    case 'dm': addDm(n); break;
    case 'pt': addPt(n); break;
    case 'faith': S.faith = Math.min(faithCap(), (S.faith || 0) + n); break;
    case 'ember': S.riftEmber = (S.riftEmber || 0) + n; break;
    case 'vs': S.vs = (S.vs || 0) + n; break;
    default: break;
  }
}

export function buyCosmos(id) {
  if (!cosmosUnlocked()) return { ok: false, reason: '未解锁（需科技「深空探测」+ RP 已发现）' };
  const p = COSMOS[id];
  if (!p) return { ok: false, reason: '未知工程' };
  const lv = cosmosLv(id);
  if (lv >= p.cap) return { ok: false, reason: `「${p.name}」已满级` };
  S.cosmos = S.cosmos || { lv: {} };
  S.cosmos.lv = S.cosmos.lv || {};
  const cost = cosmosCost(p, lv);
  if ((S.starCps || 0) < cost) return { ok: false, reason: `星际燃料 CPS 不足（需 ${fmt(cost)}，当前 ${fmt(S.starCps || 0)}）` };
  // v3.3.9 反馈⑦：目标资源满仓时不下单——满仓不生成，避免 EP 白烧
  const full = resFull(p.res);
  if (full) return { ok: false, reason: `${COSMOS_RES_LABEL[p.res]} 已满仓，先消耗再转化（满仓不生成、不消耗）` };
  S.starCps -= cost;
  const gain = Math.round(cosmosReward(p, cost) * researchMult('cosmos')); // v3.6.0 方向⑧：rp_cosmos2（宇宙工程）提升星际工程星力 +8%/级
  grantRes(p.res, gain);
  S.cosmos.lv[id] = lv + 1;
  save(S);
  dirty.expedition = true;
  log(`宇宙探索「${p.name}」Lv.${lv + 1}：-${fmt(cost)} CPS → +${fmt(gain)} ${COSMOS_RES_LABEL[p.res]}`, 'good');
  toast(`🌌 ${p.name}：+${fmt(gain)} ${COSMOS_RES_LABEL[p.res]}`);
  return { ok: true, gain, cost };
}

export function renderCosmosHtml() {
  if (!cosmosUnlocked()) {
    return `<div style="margin-top:12px;border-top:1px solid var(--line, rgba(255,255,255,.08));padding-top:10px;color:var(--text-3);font-size:11.5px">
      🌌 宇宙探索未解锁——科技树研究「深空探测」（消耗研究点）后开放：以星际燃料 CPS 一次性转化 PT/DM/信仰/余烬/VS/RP。</div>`;
  }
  let html = `<div style="margin-top:14px;border-top:1px solid var(--line, rgba(255,255,255,.08));padding-top:10px">
    <div style="color:var(--purple);font-size:12px;font-weight:600;margin-bottom:4px">🌌 宇宙探索
      <span style="color:var(--text-2);font-weight:400;font-size:11px">（深空探测解锁 · 每项工程消耗星际燃料 CPS 一次性转化稀缺资源）</span></div>`;
  for (const p of Object.values(COSMOS)) {
    const lv = cosmosLv(p.id);
    const full = lv >= p.cap;
    const cost = cosmosCost(p, lv);
    const gain = cosmosReward(p, cost);
    html += `<div class="off-upg${!full && (S.starCps || 0) < cost ? ' cant' : ''}" data-cosmos="${p.id}" style="${full ? 'opacity:.55' : ''}">
      <span>${p.icon} ${p.name} <span style="color:var(--text-3);font-size:10.5px">Lv.${lv}/${p.cap}</span><br>
        <span style="color:var(--text-3);font-size:10.5px">${p.desc} · ${fmtMultDelta(p.growth)}/级</span></span>
      <span style="color:var(--cyan);text-align:right">${full ? '已满级' : `${fmt(cost)} CPS<br><span style="font-size:10.5px;color:var(--green,#3fb950)">→ +${fmt(gain)} ${COSMOS_RES_LABEL[p.res]}</span>`}</span></div>`;
  }
  return html + `</div>`;
}
