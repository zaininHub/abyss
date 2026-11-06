// v3.7.0 review：等级里程碑 / 休战判定下沉为纯函数（data 层无依赖，不会产生循环 import）。
// 之前 economy.js 与 modules/pets.js 各有一份 petMult（同名双实现）：UI 算了里程碑、
// 真实产出却没算；日志说「PT 耗尽加成失效」，computeCps() 却仍在加。现统一为单一真源。
export const PET_LEVEL_MILESTONES = [[25, 1.25], [50, 1.5], [80, 1.8], [100, 2.2]];

export function petLevelMilestoneMult(level) {
  let m = 1;
  for (const [lv, mv] of PET_LEVEL_MILESTONES) if ((level || 0) >= lv) m *= mv;
  return m;
}

export function petsStarving(pt, activeCount) {
  return (pt || 0) <= 0 && activeCount > 0;
}

// 异兽 6 种
// v3.4.5 反馈④：高级异兽（窥视者/深渊龙/深潜者）购入价与维持消耗大幅上调——
//   price 直接抬 2.5~4 倍（需先把饵料仓库等级练起来才买得起），tier 决定维持消耗倍率（1/1/1.2/1.5/2/2.6）。
export const PETS = [
  // v2.8.17 ③：anim 字段——idle 动画类（a 上浮摇摆 / b 左右飘移 / c 呼吸脉冲 / d 旋转游弋）+ 点击粒子字符（差异化反馈，不再统一爱心）
  {id:'hamster',icon:'🐀',name:'庭鼠',price:10,tier:1,desc:'全局 +5%',anim:'a',spark:'·'},
  {id:'cat',icon:'🐈',name:'影猫',price:50,tier:1,desc:'点击 +20%',anim:'b',spark:'✦'},
  {id:'robot',icon:'🦾',name:'机巧兵',price:400,tier:2,desc:'全局 +10%',anim:'c',spark:'⚙'},
  {id:'ghost',icon:'👁',name:'窥视者',price:2500,tier:3,desc:'离线 +10%',anim:'d',spark:'✦'},
  {id:'dragon',icon:'🐲',name:'深渊龙',price:12000,tier:4,desc:'全局 +25%',anim:'b',spark:'❖'},
  {id:'pixel',icon:'🦑',name:'深潜者',price:36000,tier:5,desc:'事件 +20%',anim:'a',spark:'❋'},
];

export function petBaseMult(petId, key) {
  if (petId === 'hamster' && key === 'global') return 1.05;
  if (petId === 'cat' && key === 'click') return 1.2;
  if (petId === 'robot' && key === 'global') return 1.1;
  if (petId === 'ghost' && key === 'offline') return 1.1;
  if (petId === 'dragon' && key === 'global') return 1.25;
  if (petId === 'pixel' && key === 'event') return 1.2;
  // v3.7.0：三条故事线的专属异兽（由 provider 的 pets 变体表接线，只在对应线可购买）
  if (petId === 'logic_dove' && key === 'offline') return 1.12;
  if (petId === 'little_chaos' && key === 'event') return 1.15;
  if (petId === 'holy_moth' && key === 'global') return 1.08;
  return 1;
}
