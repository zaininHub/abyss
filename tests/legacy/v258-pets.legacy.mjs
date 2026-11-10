// v2.5.8 宠物检查 bugfix：
// ① hover 放大被 petFloat 动画覆盖（animation transform 优先级 > transition）→ hover 停动画放大
// ② 挂机升级/经验 UI 不刷新（仅切 tab 触发）→ tick 5s 低频置 dirty + 渲染 HTML 相同跳过重建
// ③ 既有行为不回退：购买/出战/融合/经验增长
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.window = { addEventListener() {} };
const results = [];
const rec = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? '✓' : '✗'} ${n}${d ? '  [' + d + ']' : ''}`); };
const stateMod = await import('../../src/state.js');
const { S } = stateMod;
const pets = await import('../../src/modules/pets.js');
const { PETS, petBaseMult } = await import('../../src/data/pets.js');

function mkRaw(extra = {}) {
  return JSON.stringify({
    _version: 6, chapter: '1', storyline: 'default', ep: 1e9, rp: 0, pt: 99999,
    upgrades: {}, buildings: {}, tech: {}, cultists: [], religion: {}, faith: 0,
    pets: {}, activePets: [], fusesDone: 0,
    resDiscovered: { ep: true, cps: true, run: true, tide: true, rank: false, rp: false, es: false, faith: false, pt: true, dm: false },
    lastSeen: Date.now(), startTime: Date.now(), ...extra,
  });
}
function mkState(extra = {}) {
  global.localStorage = { getItem: () => mkRaw(extra), setItem() {}, removeItem() {} };
  return stateMod.load();
}

// ========== V1 购买/出战（既有行为） ==========
{
  Object.assign(S, mkState());
  const ok1 = pets.buyPet(PETS[0]); // 庭鼠 10PT
  rec('V1 购买庭鼠成功（PT 扣减 + 入仓 + 自动出战）', ok1 === true && S.pt === 99989 && !!S.pets.hamster && S.activePets.includes('hamster'), `pt=${S.pt}`);
  const ok2 = pets.togglePetActive('hamster');
  rec('V1 切换出战（下阵）', ok2 === true && !S.activePets.includes('hamster'));
  const ok3 = pets.togglePetActive('hamster');
  rec('V1 再出战（上阵）', ok3 === true && S.activePets.includes('hamster'));
  // 出战位 3 上限
  pets.buyPet(PETS[1]); pets.buyPet(PETS[2]); pets.buyPet(PETS[3]);
  rec('V1 出战位上限 3（第 4 只不入出战位但已购）', S.activePets.length === 3 && !!S.pets.ghost, `active=${S.activePets.length}`);
  const ok4 = pets.togglePetActive('ghost'); // 第 4 只（未在出战位）上阵被拒
  rec('V1 出战位满不可上阵（第 4 只拒绝）', ok4 === false);
}

// ========== V2 渲染缓存（HTML 相同跳过重建） ==========
{
  Object.assign(S, mkState({ pt: 99999, pets: { hamster: { icon: '🐀', name: '庭鼠', level: 1, exp: 0, gen: 1 } }, activePets: ['hamster'] }));
  const fakeEl = { innerHTML: '', querySelectorAll: () => [] };
  pets.renderPetGrid(fakeEl);
  const html1 = fakeEl.innerHTML;
  fakeEl.innerHTML = '';
  pets.renderPetGrid(fakeEl); // 无状态变化 → HTML 相同 → 不重建
  // 相同 HTML → 跳过重建（不写 innerHTML，保持上一轮清空态）；首次渲染内容含庭鼠卡
  rec('V2 renderPetGrid 相同 HTML 跳过重建（不重写 DOM）', fakeEl.innerHTML === '' && html1.includes('庭鼠'), `html1=${html1.length}内嵌庭鼠卡`);
  // 经验变化 → 重建（XP 条刷新）
  S.pets.hamster.exp = 500;
  const before = fakeEl.innerHTML;
  pets.renderPetGrid(fakeEl);
  rec('V2 经验变化触发重建（XP 条刷新）', fakeEl.innerHTML !== before, `width 变化`);
  const fakeFloat = { innerHTML: '' };
  pets.renderPetFloat(fakeFloat);
  const f1 = fakeFloat.innerHTML;
  pets.renderPetFloat(fakeFloat);
  rec('V2 renderPetFloat 相同 HTML 跳过重建（不重启动画）', fakeFloat.innerHTML === f1 && f1.includes('🐀'));
  // 出战切换 → 浮标变化 → 重建
  pets.togglePetActive('hamster');
  pets.renderPetFloat(fakeFloat);
  rec('V2 出战变化触发浮标重建（内容清空）', fakeFloat.innerHTML === '');
}

// ========== V3 融合既有行为 ==========
{
  Object.assign(S, mkState({ pt: 99999, pets: { hamster: { icon: '🐀', name: '庭鼠', level: 60, exp: 0, gen: 1 }, cat: { icon: '🐈', name: '影猫', level: 60, exp: 0, gen: 1 } }, activePets: ['hamster', 'cat'], fusesDone: 0 }));
  const fused = pets.fusePets('hamster', 'cat');
  rec('V3 融合生成（G2 混合宠，父母移除）', !!fused && fused.gen === 2 && fused.mixed && !S.pets.hamster && !S.pets.cat && S.fusesDone === 1, fused ? fused.name : 'null');
  const g = pets.petMult('global');
  rec('V3 融合宠 petMult 生效（>1）', g > 1, `mult=${g}`);
  // 等级 <50 不可融合
  Object.assign(S, mkState({ pt: 99999, pets: { hamster: { icon: '🐀', name: '庭鼠', level: 10, exp: 0, gen: 1 }, cat: { icon: '🐈', name: '影猫', level: 10, exp: 0, gen: 1 } }, activePets: ['hamster', 'cat'], fusesDone: 0 }));
  rec('V3 等级 <50 不可融合', pets.fusePets('hamster', 'cat') === null);
}

// ========== V4 hover 修复（源码断言：hover 停动画 + scale） ==========
{
  const css = await import('node:fs').then(fs => fs.readFileSync('src/style.css', 'utf-8'));
  rec('V4 hover 蠕动动画（petWrithe + scale 1.18，v2.7.5 ③ 交互动画）', css.includes('animation: petWrithe .5s steps(3, end) infinite') && css.includes('transform: scale(1.18)'), 'css');
  const main = await import('node:fs').then(fs => fs.readFileSync('src/main.js', 'utf-8'));
  rec('V4 tick 5s 低频刷新宠物 UI', main.includes('S._petUiTimer = (S._petUiTimer || 0) + dt') && main.includes('>= 5'), 'main');
}

const failed = results.filter(r => !r.ok);
console.log(`\n===== v2.5.8 宠物检查封板断言：${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join('; ')); process.exit(1); }
