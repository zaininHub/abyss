// 异兽 6 种
export const PETS = [
  {id:'hamster',icon:'🐀',name:'庭鼠',price:10,desc:'全局 +5%'},
  {id:'cat',icon:'🐈',name:'影猫',price:50,desc:'点击 +20%'},
  {id:'robot',icon:'🦾',name:'机巧兵',price:200,desc:'全局 +10%'},
  {id:'ghost',icon:'👁',name:'窥视者',price:800,desc:'离线 +10%'},
  {id:'dragon',icon:'🐲',name:'深渊龙',price:3000,desc:'全局 +25%'},
  {id:'pixel',icon:'🦑',name:'深潜者',price:10000,desc:'事件 +20%'},
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
