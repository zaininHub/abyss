// v2.0 故事线：默认（基础路线）
// 无额外变体，使用全部基础数据
export default {
  id: 'default',
  name: '默认路线',
  desc: '经典深渊效能工作台体验',
  data: {
    // 默认不添加任何变体
  },
  rules: {},
  gates: {},
  hooks: {
    onLoad: () => {
      // console.log('[故事线] 默认路线已加载');
    },
    onUnload: () => {
      // console.log('[故事线] 默认路线已卸载');
    },
  },
  stateFields: {},
};
