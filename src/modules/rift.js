// v2.6.1：深渊裂隙玩法扩展
// 原版：单事件二选一（封印/拥抱），奖励单一 DM。
// 扩展：① 裂隙按 cps 分 5 级（浅层/中层/深层/深渊/虚空之隙），等级越高奖励越好；
//       ② 奖励多元化——DM（既有）+ RP（RP 锚点后）+ VS（深潜解锁后概率）+ 信仰（宗教解锁后概率）；
//       ③ 裂隙余烬（跨转生保留）：封印/拥抱/深入积累，用于裂隙专属升级树（哨站/透镜/护符/余烬共振）；
//       ④ 第三选项「深入裂隙」：持续 60s 探索（产出递增 + 腐化累积），结算时腐化超阈值损失 EP，可提前脱出。
// 既有 sealDmReward / embraceDurMs / 封印与拥抱行为保持（v2.1/v2.4 断言依赖）。
import { S, save } from '../state.js';
import { computeCps, fmt, epStorageCap, sealDmReward, embraceDurMs, vehicleTier, echoLv } from './economy.js';
// v2.7.3 ⑤：回响·裂隙共鸣（余烬 ×2/级）
function emberMul() { return (1 + (echoLv('echo_rift') || 0)) * policyMult('ember'); } // v2.8.6 B2a：虚无主义——余烬产出 +25%
import { BALANCE } from '../data/balance.js';
import { policyMult } from '../data/policies.js';
import { log, toast, dirty } from '../main.js';

// v2.8.3：首次获得 DM 即点亮发现锚点（消除「有 DM 却未解锁」歧义）
export function discoverDm() {
  if (!S.resDiscovered) S.resDiscovered = {};
  S.resDiscovered.dm = true;
}

let riftSig = null;      // v2.1 R2：当前已渲染裂隙签名，避免 100ms 全量重建
let delegateBound = false; // v2.1 R2：容器级事件委托只绑一次

// ---- v2.6.1 裂隙等级 ----
export function riftLevelOf(cps) {
  const lv = 1 + Math.floor(Math.log10(Math.max(1, cps || 1)));
  return Math.max(1, Math.min(5, lv));
}
export function riftLevelName(lv) {
  return (BALANCE.rift.levelNames[lv - 1]) || `Lv.${lv}`;
}

// ---- v2.6.1 余烬升级树 ----
export function riftUpgradeLevel(id) {
  return (S.riftUpgrades && S.riftUpgrades[id]) || 0;
}
export function riftUpgradeCost(id) {
  const u = BALANCE.rift.upgrades[id];
  return Math.round(BALANCE.rift.upgBase * Math.pow(BALANCE.rift.upgGrowth, riftUpgradeLevel(id)));
}
export function riftSpawnSec() {
  const lv = riftUpgradeLevel('sentinel');
  return Math.max(360, BALANCE.rift.spawnSec * Math.pow(0.75, lv));
}
export function riftDmMult() {
  return 1 + 0.2 * riftUpgradeLevel('lens');
}
export function riftSealCostMult() {
  return Math.max(0.5, 1 - 0.1 * riftUpgradeLevel('charm'));
}
export function riftVsMult() {
  return 1 + 0.5 * riftUpgradeLevel('echo');
}
export function buyRiftUpgrade(id) {
  const u = BALANCE.rift.upgrades[id];
  if (!u) return { ok: false, reason: '未知升级' };
  const lv = riftUpgradeLevel(id);
  if (lv >= u.cap) return { ok: false, reason: `「${u.name}」已满级` };
  const cost = riftUpgradeCost(id);
  if ((S.riftEmber || 0) < cost) return { ok: false, reason: `裂隙余烬不足（需 ${cost}，当前 ${S.riftEmber || 0}）` };
  S.riftEmber -= cost;
  S.riftUpgrades[id] = lv + 1;
  save(S);
  log(`[裂隙] 「${u.name}」升至 Lv.${lv + 1}（-${cost} 余烬）：${u.desc}`, 'good');
  return { ok: true, level: lv + 1 };
}

// ---- v2.6.1 深入裂隙（第三选项） ----
export function delveRift() {
  if (!S.activeRift) return { ok: false, reason: '裂隙已闭合' };
  if (S.riftExpedition) return { ok: false, reason: '已在深入探索中' };
  if (!S.resDiscovered || !S.resDiscovered.dm) return { ok: false, reason: '需先发现深渊之力（DM）——购入首辆载具或通过裂隙封印获得 DM' };
  const r = S.activeRift;
  const epCost = Math.ceil(r.sealCost * 0.5);
  const dmCost = r.level * 2;
  if (S.ep < epCost) return { ok: false, reason: `EP 不足（需 ${fmt(epCost)}）` };
  if ((S.dm || 0) < dmCost) return { ok: false, reason: `DM 不足（需 ${dmCost}）` };
  S.ep -= epCost;
  S.dm -= dmCost;
  S.riftExpedition = {
    until: Date.now() + BALANCE.rift.delveDurSec * 1000,
    level: r.level,
    sealCost: r.sealCost,
    gainedDm: 0, gainedVs: 0,
  };
  S.activeRift = null;
  dirty.rift = true;
  save(S);
  log(`[裂隙] 你深入了${riftLevelName(r.level)}…… 60 秒探索开始（产出递增，腐化累积）`, 'bad');
  return { ok: true };
}

export function abortRiftExpedition() {
  if (!S.riftExpedition) return { ok: false, reason: '未在深入' };
  const ex = S.riftExpedition;
  if (ex.gainedDm > 0) { S.dm = (S.dm || 0) + ex.gainedDm; discoverDm(); }
  S.vs = (S.vs || 0) + (ex.gainedVs || 0);
  S.riftEmber = (S.riftEmber || 0) + Math.max(1, Math.round(ex.level * 1)) * emberMul();
  log(`[裂隙] 紧急脱出：带走 ${ex.gainedDm.toFixed(1)} DM${ex.gainedVs > 0 ? `、${ex.gainedVs.toFixed(1)} VS` : ''}（+${Math.max(1, Math.round(ex.level))} 余烬）`, 'bad');
  S.riftExpedition = null;
  save(S);
  dirty.rift = true;
  return { ok: true };
}

// 深入探索逐帧结算：产出 + 腐化；到时终局（腐化超阈值损失）
function settleRiftExpedition(dt) {
  const ex = S.riftExpedition;
  if (!ex) return;
  const lv = ex.level;
  // 产出（DM 恒定 + VS 深潜解锁后）
  ex.gainedDm += BALANCE.rift.delveDmPerLevel * lv * dt;
  if (S.delve && S.delve.unlocked) ex.gainedVs += BALANCE.rift.delveVsPerLevel * lv * dt;
  S.corruption = Math.min(100, (S.corruption || 0) + BALANCE.rift.delveCorruptPerLevel * lv * dt);
  if (Date.now() >= ex.until) {
    // 终局：腐化 > 阈值 → 损失；否则结算奖励
    const fail = S.corruption > BALANCE.rift.delveFailCorrupt;
    if (fail) {
      const loss = Math.ceil(ex.sealCost * BALANCE.rift.delveFailLoss);
      S.ep = Math.max(0, S.ep - loss);
      log(`[裂隙] 深入终局：腐化 ${S.corruption.toFixed(0)}% 吞噬了探索——损失 ${fmt(loss)} EP`, 'bad');
      if (toast) toast('🌊 腐化吞噬：深入探索失败，损失 EP');
    } else {
      const dmTotal = ex.gainedDm + BALANCE.rift.delveBonusDm * lv;
      S.dm = (S.dm || 0) + dmTotal;
      if (dmTotal > 0) discoverDm();
      if (ex.gainedVs > 0) S.vs = (S.vs || 0) + ex.gainedVs;
      S.riftEmber = (S.riftEmber || 0) + BALANCE.rift.emberDelve * lv * emberMul();
      log(`[裂隙] 深入完成（${riftLevelName(lv)}）：+${dmTotal.toFixed(1)} DM${ex.gainedVs > 0 ? `、${ex.gainedVs.toFixed(1)} VS` : ''}、+${BALANCE.rift.emberDelve * lv} 余烬`, 'good');
      if (toast) toast('🌌 深入完成：裂隙深处之物已带回');
    }
    S.riftExpedition = null;
    save(S);
    dirty.rift = true;
    dirty.hero = true; // v2.6.4 ②：顶部深入状态即时清除
  }
  dirty.hero = true; // v2.6.4 ②：探索中顶部状态实时刷新
}

// ---- 主 tick ----
export function tickRift(dt) {
  // v2.6.1：深入探索结算优先（裂隙事件不并行出现）
  if (S.riftExpedition) {
    settleRiftExpedition(dt);
    return;
  }
  const cps = computeCps();
  const spawnSec = riftSpawnSec();
  // 深渊裂隙：随机出现（间隔受哨站升级缩短）
  if (!S.activeRift && Math.random() < dt / spawnSec) {
    const level = riftLevelOf(cps);
    // v2.1 R3-D：封印成本 = 当前 EP 存储上限 × 30%~50% × 护符折扣
    const cap = epStorageCap();
    const ratio = BALANCE.rift.sealRatioMin +
      Math.random() * (BALANCE.rift.sealRatioMax - BALANCE.rift.sealRatioMin);
    S.activeRift = {
      power: level,
      level: level,
      sealCost: Math.ceil(cap * ratio * riftSealCostMult()),
      dmReward: Math.ceil(1 * level),
      expiresAt: Date.now() + 120000,
    };
    // v2.5 ①：首次触发深渊裂隙 = 探采平台/深渊商店解锁（持久标记，跨转生保留）
    if (!S._riftSeen) {
      S._riftSeen = true;
      dirty.shop = true;
      log('裂隙开启：探采平台与深渊商店已解锁', 'good');
    }
    log(`深渊裂隙在代码底层裂开：${riftLevelName(level)}（Lv.${level}）`, 'bad');
  }
  if (S.activeRift && Date.now() > S.activeRift.expiresAt) {
    // 放任裂隙：短期爆发但损失 EP
    S.activeRift = null;
    S.buffMult = 3;
    S.buffUntil = Date.now() + 30000;
    S.ep = S.ep * 0.9;
    log('裂隙自行闭合，但留下了残渣和 10% EP 损耗', 'bad');
  }
}

// ---- v2.6.1 奖励结算（封印/拥抱共用：DM + RP + VS + 信仰 + 余烬） ----
function grantRiftRewards(r, emberGain, embrace) {
  const dmGain = sealDmReward(r) * riftDmMult();
  S.dm = (S.dm || 0) + dmGain;
  if (dmGain > 0) discoverDm();
  // RP：锚点解锁后 + level × 0.5（透镜同加成）
  if (S.resDiscovered && S.resDiscovered.rp) {
    const rpGain = BALANCE.rift.rpPerLevel * r.level * riftDmMult();
    S.rp = (S.rp || 0) + rpGain;
    log(`裂隙回响：+${rpGain.toFixed(1)} RP`, 'good');
  }
  // VS：深潜解锁后概率
  if (S.delve && S.delve.unlocked && Math.random() < BALANCE.rift.vsChance) {
    const vsGain = r.level * riftVsMult();
    S.vs = (S.vs || 0) + vsGain;
    log(`裂隙深处共鸣：+${vsGain} 虚空碎片`, 'good');
  }
  // 信仰：宗教解锁后概率
  if (S.religion && S.religion.unlocked && Math.random() < BALANCE.rift.faithChance) {
    S.faith = (S.faith || 0) + 1;
    log(`裂隙神谕：+1 信仰`, 'good');
  }
  S.riftEmber = (S.riftEmber || 0) + emberGain * emberMul();
  return dmGain;
}

export function sealRift() {
  if (!S.activeRift) return;
  const r = S.activeRift;
  if (S.ep < r.sealCost) { toast('EP 不足'); return; }
  S.ep -= r.sealCost;
  const dmGain = grantRiftRewards(r, BALANCE.rift.emberSeal, false);
  S.riftsSealed++;
  log(`裂隙封印成功（${riftLevelName(r.level)}）：+${dmGain.toFixed(1)} DM（深渊物质）`, 'good');
  S.activeRift = null;
  save(S);
  dirty.rift = true; // v2.1.1 P1-A：置空后立即触发裂隙区重渲染，消除卡片残留
  dirty.shop = true; // v2.7.1：封印到账 DM 后探采页头即时同步（updateVehicleCollectHeader 走 dirty.shop 渲染链路）
}

export function embraceRift() {
  if (!S.activeRift) return;
  const r = S.activeRift;
  S.buffMult = 5;
  // v1.3 模块 D 第 1 层：拥抱爆发时长 + 载具档位 ×5s（无载具 = 60s，与 v2.1.x 完全一致）
  const durMs = embraceDurMs();
  S.buffUntil = Date.now() + durMs;
  S.ep = S.ep * 0.8;
  grantRiftRewards(r, BALANCE.rift.emberEmbrace, true);
  log(`你拥抱了裂隙（${riftLevelName(r.level)}）：${Math.round(durMs / 1000)} 秒 ×5，但损失 20% EP`, 'good');
  S.activeRift = null;
  save(S);
  dirty.rift = true; // v2.1.1 P1-A：置空后立即触发裂隙区重渲染，消除卡片残留
}

// ---- 渲染：裂隙事件卡（主界面浮卡） ----
export function renderRift(container) {
  if (!container) return;
  const card = document.getElementById('rift-card');
  if (!S.activeRift) {
    if (card) card.style.display = 'none';
    if (container.firstChild) container.innerHTML = '';
    riftSig = null;
    return;
  }
  if (card) card.style.display = '';
  const r = S.activeRift;
  const sig = `${r.power}|${r.expiresAt}|${r.sealCost}|${r.level}`;
  // v2.1 R2：裂隙卡片只在「新裂隙出现」时重建一次 DOM；此后每帧只更新倒计时文本节点。
  if (sig !== riftSig || !container.querySelector('#seal-rift')) {
    riftSig = sig;
    const left = Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000));
    const dmUnlock = !!(S.resDiscovered && S.resDiscovered.dm);
    container.innerHTML = `<div style="font-size:12px;color:var(--text-2);margin-bottom:8px">
      ${riftLevelName(r.level)} <b style="color:var(--purple)">Lv.${r.power}</b> · 剩余 <span id="rift-left">${left}</span>s<br>
      当前 DM: <b id="rift-dm-balance">${(S.dm || 0).toFixed(2)}</b> → 奖励 <b style="color:var(--purple)">+<span id="rift-dm">${sealDmReward(r)}</span> DM</b><br>
      封印消耗 <b>${fmt(r.sealCost)} EP</b><br>
      拥抱 → <span id="rift-dur">${Math.round(embraceDurMs() / 1000)}</span> 秒 ×5 爆发，但损失 20% EP<br>
      深入 → 60 秒探索（产出递增 · 腐化累积 · 超阈值损失）</div>
      <div style="display:flex;gap:6px">
        <button class="btn" id="seal-rift" style="flex:1;font-size:12px">封印</button>
        <button class="btn" id="embrace-rift" style="flex:1;font-size:12px;background:rgba(163,113,247,.15);border-color:var(--purple)">拥抱</button>
        <button class="btn" id="delve-rift" ${dmUnlock ? '' : 'disabled'} title="${dmUnlock ? '深入裂隙：60 秒探索（需消耗 EP 与 DM）' : '需先发现深渊之力（DM）——购入首辆载具或封印裂隙获得'}" style="flex:1;font-size:12px;background:rgba(248,81,73,.12);border-color:var(--red, #f85149)">深入</button>
      </div>`;
    if (!delegateBound) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'seal-rift') sealRift();
        else if (btn.id === 'embrace-rift') embraceRift();
        else if (btn.id === 'delve-rift') { const r = delveRift(); if (!r.ok && toast) toast(r.reason); }
      });
      delegateBound = true;
    }
  }
  const leftEl = container.querySelector('#rift-left');
  if (leftEl) leftEl.textContent = Math.max(0, Math.ceil((r.expiresAt - Date.now()) / 1000));
  const dmBalEl = container.querySelector('#rift-dm-balance');
  if (dmBalEl) dmBalEl.textContent = (S.dm || 0).toFixed(2); // v2.4.2：DM 精确到小数
  const dmEl = container.querySelector('#rift-dm');
  if (dmEl) dmEl.textContent = (sealDmReward(r) * riftDmMult()).toFixed(1);
  const durEl = container.querySelector('#rift-dur');
  if (durEl) durEl.textContent = Math.round(embraceDurMs() / 1000);
}

// ---- 渲染：裂隙栏目（余烬 + 升级树 + 历史 + 深入探索状态） ----
export function renderRiftPanel(container) {
  if (!container) return;
  if (S.riftExpedition) {
    const ex = S.riftExpedition;
    const left = Math.max(0, Math.ceil((ex.until - Date.now()) / 1000));
    container.innerHTML = `
      <div class="rift-tab-desc">深入探索中：${riftLevelName(ex.level)} · 剩余 <b style="color:var(--red, #f85149)">${left}s</b></div>
      <div class="off-stat"><span>已获 DM</span><b style="color:var(--green)">+${ex.gainedDm.toFixed(1)}</b></div>
      <div class="off-stat"><span>已获 VS（深潜联动）</span><b style="color:var(--cyan)">+${ex.gainedVs.toFixed(2)}</b></div>
      <div class="off-stat"><span>当前腐化</span><b style="color:${S.corruption > BALANCE.rift.delveFailCorrupt ? 'var(--red,#f85149)' : 'var(--text-2)'}">${S.corruption.toFixed(1)}% ${S.corruption > BALANCE.rift.delveFailCorrupt ? '⚠ 超阈值将损失' : '（≤50% 安全）'}</b></div>
      <div style="font-size:11px;color:var(--text-3);margin:6px 0">腐化超 ${BALANCE.rift.delveFailCorrupt}% 结算时将损失 ${Math.round(BALANCE.rift.delveFailLoss * 100)}% 封印成本 EP；可提前脱出保留已获产出。</div>
      <button class="btn" id="abort-rift-ex" style="margin-top:8px">紧急脱出（保留已获产出）</button>`;
    container.querySelector('#abort-rift-ex')?.addEventListener('click', () => {
      abortRiftExpedition();
      renderRiftPanel(container);
    });
    return;
  }
  let html = `<div class="rift-tab-desc">深渊裂隙：最深处连接着虚空之底。封印/拥抱/深入均积累裂隙余烬（跨转生保留，余烬获取与腐化状态无关——免疫腐化仅免除深入惩罚，不断余烬供给），升级裂隙科技。</div>
    <div class="off-stat"><span>裂隙余烬</span><b style="color:var(--accent)">${S.riftEmber || 0}</b></div>
    <div class="off-stat"><span>封印次数</span><b>${S.riftsSealed || 0}</b></div>
    <div class="off-stat"><span>裂隙间隔</span><b>${Math.round(riftSpawnSec() / 60)} 分钟</b></div>
    <div style="margin:10px 0 6px;font-size:11px;color:var(--text-2)">裂隙科技（余烬）</div>`;
  for (const [id, u] of Object.entries(BALANCE.rift.upgrades)) {
    const lv = riftUpgradeLevel(id);
    const cost = lv >= u.cap ? null : riftUpgradeCost(id);
    // v2.6.4 ⑦：哨站动态文案（当前间隔 → 下一级间隔 → 下限）
    let desc = u.desc;
    if (id === 'sentinel') {
      const cur = Math.round(riftSpawnSec() / 60);
      if (lv < u.cap) {
        const next = Math.round(Math.max(360, BALANCE.rift.spawnSec * Math.pow(0.75, lv + 1)) / 60);
        desc = `裂隙出现间隔缩短 25%/级：当前 ${cur} 分钟 → 下一级 ${next} 分钟（下限 6 分钟）`;
      } else {
        desc = `裂隙出现间隔 -25%/级：已达下限 ${cur} 分钟`;
      }
    }
    html += `
      <div class="rift-upg-row" data-rift-upg="${id}">
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-1)">${u.name} <span style="color:var(--text-3);font-size:11px">Lv.${lv}/${u.cap}</span></div>
          <div style="font-size:11px;color:var(--text-3)">${desc}</div>
        </div>
        <button class="btn ${cost === null || (S.riftEmber || 0) < cost ? 'disabled' : ''}" ${cost === null ? 'disabled' : ''}>${cost === null ? '满级' : `${cost} 余烬`}</button>
      </div>`;
  }
  container.innerHTML = html;
}
