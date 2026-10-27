// 异兽 6 种
export const PETS = [
  // v2.8.17 ③：anim 字段——idle 动画类（a 上浮摇摆 / b 左右飘移 / c 呼吸脉冲 / d 旋转游弋）+ 点击粒子字符（差异化反馈，不再统一爱心）
  {id:'hamster',icon:'🐀',name:'庭鼠',price:10,desc:'全局 +5%',anim:'a',spark:'·'},
  {id:'cat',icon:'🐈',name:'影猫',price:50,desc:'点击 +20%',anim:'b',spark:'✦'},
  {id:'robot',icon:'🦾',name:'机巧兵',price:200,desc:'全局 +10%',anim:'c',spark:'⚙'},
  {id:'ghost',icon:'👁',name:'窥视者',price:800,desc:'离线 +10%',anim:'d',spark:'✦'},
  {id:'dragon',icon:'🐲',name:'深渊龙',price:3000,desc:'全局 +25%',anim:'b',spark:'❖'},
  {id:'pixel',icon:'🦑',name:'深潜者',price:10000,desc:'事件 +20%',anim:'a',spark:'❋'},
];

export function petBaseMult(petId, key) {
  if (petId === 'hamster' && key === 'global') return 1.05;
  if (petId === 'cat' && key === 'click') return 1.2;
  if (petId === 'robot' && key === 'global') return 1.1;
  if (petId === 'ghost' && key === 'offline') return 1.1;
  if (petId === 'dragon' && key === 'global') return 1.25;
  if (petId === 'pixel' && key === 'event') return 1.2;
  return 1;
}
