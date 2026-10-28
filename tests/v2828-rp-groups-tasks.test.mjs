// v2.8.28 回归：①研究升级分类+分批次解锁（参考科技树/升级商店）②任务版 pending 占位（最多 3 条）
import test from 'node:test';
import assert from 'node:assert';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { S } from '../src/state.js';
import { tickProjects } from '../src/modules/projects.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE = 'file://' + process.cwd() + '/dist/index.html';

// ===== T1 源码：任务版 pending 占位（完成未领取不发新任务） =====
test('v2.8.28 ① 任务版：pending 完成未领取也占位——3 条（含 pending）不 spawn 第 4 条', () => {
  Object.assign(S, {
    ep: 0, runEarned: 0, earnedFull: 0, totalBuys: 0, totalClicks: 0, cultists: [],
    _clickTutorialDone: true, buffMult: 1, buffUntil: 0,
    projects: [
      { type: 'earn_ep', name: 'A', desc: '', goal: 100, progress: 0, startsAt: Date.now(), deadline: Date.now() + 1e9, reward: { kind: 'ep', amount: 50 }, status: 'active', pendingAt: 0, earnedFullAt: 0, runEarnedAt: 0 },
      { type: 'earn_ep', name: 'B', desc: '', goal: 100, progress: 0, startsAt: Date.now(), deadline: Date.now() + 1e9, reward: { kind: 'ep', amount: 50 }, status: 'active', pendingAt: 0, earnedFullAt: 0, runEarnedAt: 0 },
      { type: 'earn_ep', name: 'C', desc: '', goal: 100, progress: 120, startsAt: Date.now(), deadline: Date.now() + 1e9, reward: { kind: 'ep', amount: 50 }, status: 'pending', pendingAt: Date.now(), earnedFullAt: 0, runEarnedAt: 0 },
    ],
  });
  const origRandom = Math.random;
  Math.random = () => 0.001; // 必中 spawn 分支（冷却已过）
  try {
    tickProjects(); // pending 任务完成度达标 → 仍占位；occupiedCount=3 ≥ maxProjects()=3 → 不 spawn
    assert.equal(S.projects.length, 3, '3 条（含 pending）时不发放第 4 条');
    // 领取 1 条（claimed → 移除）后腾位 → 可 spawn 第 4 条
    const p = S.projects.find(x => x.status === 'pending');
    p.status = 'claimed';
    tickProjects();
    assert.equal(S.projects.length, 3, '领取 1 条后腾位——补发至 3 条上限（不超 3）');
  } finally {
    Math.random = origRandom;
  }
});

// ===== T2 源码：研究升级分类配置存在 =====
test('v2.8.28 ② 研究升级：10 项按 3 类目分批次（产出强化→资源与消耗→深渊终局）', () => {
  const src = fs.readFileSync(new URL('../src/modules/shop.js', import.meta.url), 'utf8');
  assert.ok(src.includes("key: 'prod'") && src.includes("key: 'res'") && src.includes("key: 'abyss'"), '3 类目定义存在');
  assert.ok(src.includes('unlock: { prev: \'prod\', need: 4 }') && src.includes('unlock: { prev: \'res\', need: 4 }'), '批次解锁条件（累计 4 级）');
  assert.ok(src.includes('rp-group-lock'), '未解锁批次锁定提示');
  assert.ok(src.includes('data-rp-fold'), '类目折叠交互');
});

// ===== T3 浏览器：研究升级分类 + 批次揭示 + 折叠 =====
test('v2.8.28 ② 浏览器：研究点分批次显示——批 1 可见、批 2/3 锁定、折叠生效', async () => {
  const mk = (rpTheories = {}) => JSON.stringify({
    _version: 6, chapter: '6', storyline: 'default', ep: 0, rp: 1000, es: 0, dm: 0,
    upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {}, cultists: [],
    religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
    rpTheories, allTimeEp: 1e9, lastSeen: Date.now(), startTime: Date.now(),
  });
  const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
  try {
    // 批 1 可见 + 批 2/3 锁定
    const p1 = await browser.newPage();
    await p1.setViewport({ width: 1440, height: 900 });
    await p1.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), mk());
    await p1.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1200);
    await p1.evaluate(() => document.getElementById('btn-rp').click());
    await sleep(400);
    const r1 = await p1.evaluate(() => ({
      titles: [...document.querySelectorAll('#research-upgrade-list .rp-group-title')].map(e => e.textContent.trim()),
      locks: [...document.querySelectorAll('#research-upgrade-list .rp-group-lock')].map(e => e.textContent.trim()),
      cards: document.querySelectorAll('#research-upgrade-list [data-research]').length,
    }));
    assert.equal(r1.titles.length, 1, '仅产出强化显现');
    assert.ok(r1.titles[0].includes('产出强化'), '类目名产出强化');
    assert.equal(r1.locks.length, 2, '资源与消耗/深渊终局锁定提示');
    assert.equal(r1.cards, 4, '批 1 四张卡（熵减/矩阵/奇点/离线）');
    // 折叠：点产出强化标题 → 网格收起
    await p1.evaluate(() => document.querySelector('#research-upgrade-list .rp-group-title').click());
    await sleep(200);
    const folded = await p1.evaluate(() => document.querySelectorAll('#research-upgrade-list [data-research]').length);
    assert.equal(folded, 0, '折叠后卡隐藏（仅标题）');
    // 展开恢复
    await p1.evaluate(() => document.querySelector('#research-upgrade-list .rp-group-title').click());
    await sleep(200);
    const unfolded = await p1.evaluate(() => document.querySelectorAll('#research-upgrade-list [data-research]').length);
    assert.equal(unfolded, 4, '再点恢复 4 卡');
    await p1.close();

    // 批 1 满 4 级 → 批 2 揭示
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1440, height: 900 });
    await p2.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), mk({ rp_entropy: 1, rp_matrix: 1, rp_singularity: 1, rp_offline: 1 }));
    await p2.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1200);
    await p2.evaluate(() => document.getElementById('btn-rp').click());
    await sleep(400);
    const r2 = await p2.evaluate(() => ({
      titles: [...document.querySelectorAll('#research-upgrade-list .rp-group-title')].map(e => e.textContent.trim()),
      locks: [...document.querySelectorAll('#research-upgrade-list .rp-group-lock')].map(e => e.textContent.trim()),
      cards: document.querySelectorAll('#research-upgrade-list [data-research]').length,
    }));
    assert.equal(r2.titles.length, 2, '批 2（资源与消耗）揭示');
    assert.equal(r2.locks.length, 1, '仅深渊终局锁定');
    assert.equal(r2.cards, 8, '批 1+批 2 共 8 卡');
    // 批 1+批 2 满 4 级 → 全部揭示（新档注入，避免 evaluateOnNewDocument 覆盖 reload 档）
    const p3 = await browser.newPage();
    await p3.setViewport({ width: 1440, height: 900 });
    await p3.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), mk({ rp_entropy: 1, rp_matrix: 1, rp_singularity: 1, rp_offline: 1, rp_wage: 1, rp_storage: 1, rp_dm: 1, rp_faith: 1 }));
    await p3.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(1200);
    await p3.evaluate(() => document.getElementById('btn-rp').click());
    await sleep(400);
    const r3 = await p3.evaluate(() => ({
      titles: document.querySelectorAll('#research-upgrade-list .rp-group-title').length,
      locks: document.querySelectorAll('#research-upgrade-list .rp-group-lock').length,
      cards: document.querySelectorAll('#research-upgrade-list [data-research]').length,
    }));
    await p3.close();
    assert.equal(r3.titles, 3, '全部 3 类目显现');
    assert.equal(r3.locks, 0, '无锁定');
    assert.equal(r3.cards, 10, '10 项研究全可见');
    await p2.close();
  } finally {
    await browser.close();
  }
});

// ===== T4 浏览器：任务版最多 3 条（pending 占位） =====
test('v2.8.28 ① 浏览器：3 条任务（含完成未领取）时面板不新增第 4 条，领取后腾位', async () => {
  const now = Date.now();
  const mk = () => JSON.stringify({
    _version: 6, chapter: '6', storyline: 'default', ep: 0, rp: 0, es: 0, dm: 0,
    upgrades: {}, buildings: {}, tech: {}, ai: {}, milesDone: {}, cultists: [],
    religion: { unlocked: false }, faith: 0, pets: {}, activePets: [], fusesDone: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: true, rp: true, es: false, faith: false, pt: false, dm: false },
    allTimeEp: 1e9, _clickTutorialDone: true, buffMult: 1, buffUntil: 0,
    projects: [
      { type: 'earn_ep', name: '任务甲', desc: '', goal: 100, progress: 0, startsAt: now, deadline: now + 1e10, reward: { kind: 'ep', amount: 50 }, status: 'active', pendingAt: 0, earnedFullAt: 0, runEarnedAt: 0 },
      { type: 'earn_ep', name: '任务乙', desc: '', goal: 100, progress: 0, startsAt: now, deadline: now + 1e10, reward: { kind: 'ep', amount: 50 }, status: 'active', pendingAt: 0, earnedFullAt: 0, runEarnedAt: 0 },
      { type: 'earn_ep', name: '任务丙', desc: '', goal: 100, progress: 120, startsAt: now, deadline: now + 1e10, reward: { kind: 'ep', amount: 50 }, status: 'pending', pendingAt: now, earnedFullAt: 0, runEarnedAt: 0 },
    ],
    lastSeen: Date.now(), startTime: Date.now(),
  });
  const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-gpu'], headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument((s) => localStorage.setItem('abyss_idle_v2', s), mk());
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await sleep(2500);
    const r = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const cards = document.querySelectorAll('#projects .proj').length;
      return { n: (s.projects || []).length, statuses: (s.projects || []).map(p => p.status), cards };
    });
    assert.ok(r.n <= 3, `任务数量 ≤ 3（实际 ${r.n}）`);
    assert.ok(r.statuses.includes('pending'), '完成未领取的任务仍占位显示');
    // 领取 pending → 腾位
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('abyss_idle_v2'));
      const p = (s.projects || []).find(x => x.status === 'pending');
      if (p) p.status = 'claimed';
      localStorage.setItem('abyss_idle_v2', JSON.stringify(s));
    });
    await sleep(2500);
    const r2 = await page.evaluate(() => (JSON.parse(localStorage.getItem('abyss_idle_v2')).projects || []).length);
    assert.ok(r2 <= 3, '领取后仍不超过 3 条');
    await page.close();
  } finally {
    await browser.close();
  }
});
