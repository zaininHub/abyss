// 任务版类型
export const PROJECT_TYPES = [
  { id: 'earn_ep', name: 'EP 积累', desc: '限时内累计 EP' },
  { id: 'click', name: '手动激活', desc: '限时内点击工作台' },
  { id: 'buy_up', name: '扩张基建', desc: '限时内购买升级模块' },
  { id: 'buy_thread', name: '招募线程', desc: '限时内启动新线程' },
];

export const MAX_PROJECTS = 3;
export const PENDING_EXPIRE = 3600000; // 1小时
export const PROJECT_SPAWN_COOLDOWN = 600000; // v2.4.2：生成冷却 10 分钟（原 120s 发放过快）
