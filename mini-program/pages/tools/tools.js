/**
 * 文化工具箱主页
 * 入口卡片网格：字辈 / 堂号 / 家谱术语 / 亲属关系 / 古籍快查 / 听书
 */
const api = require('../../utils/api.js');

// 工具箱入口配置（图标 + 跳转 + 颜色）
const TOOLS = [
  { key: 'zibei',       label: '字辈查字',     emoji: '🔤', color: '#8B1A1A',    category: 'zibei' },
  { key: 'tanghao',     label: '堂号辞典',     emoji: '🏛️', color: '#2d6a4f',    category: 'tanghao' },
  { key: 'terminology', label: '家谱术语',     emoji: '📜', color: '#5a4a3a',    category: 'terminology' },
  { key: 'relation',    label: '亲属关系',     emoji: '🔗', color: '#e07a5f',    page: '/pages/relation-tool/relation-tool' },
  { key: 'ocr-import',  label: '手写录入',     emoji: '✍️', color: '#7b2cbf',    page: '/pages/ocr-import/ocr-import' },
  { key: 'migration',   label: '时空地图',     emoji: '🗺️', color: '#457b9d',    page: '/pages/migration-map/migration-map' },
  { key: 'cultural',    label: '古籍快查',     emoji: '📖', color: '#457b9d',    page: '/pages/cultural-index/cultural-index' },
  { key: 'tts',         label: '听书朗读',     emoji: '🎧', color: '#6a4c93',    page: '/pages/audio-player/audio-player' }
];

Page({
  data: {
    familyId: null,
    tools: TOOLS,
    stats: {},          // { zibei: 10, tanghao: 10, terminology: 20 }
    loading: true
  },

  onLoad: function () {
    const familyId = this.getCurrentFamilyId();
    this.setData({ familyId });
    this.loadStats();
  },

  loadStats: function () {
    this.setData({ loading: true });
    api.culturalDict.getStats().then(res => {
      const list = res.data || [];
      const stats = {};
      list.forEach(s => { stats[s.category] = s.count; });
      this.setData({ stats, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onToolTap: function (e) {
    const key = e.currentTarget.dataset.key;
    const tool = TOOLS.find(t => t.key === key);
    if (!tool) return;

    // 需要登录态的入口先检查 familyId
    const needFamily = ['relation', 'tts'];
    if (needFamily.includes(key) && !this.data.familyId) {
      wx.showToast({ title: '请先绑定家族', icon: 'none' });
      return;
    }

    if (tool.page) {
      let url = tool.page;
      if (this.data.familyId) url += (url.includes('?') ? '&' : '?') + 'familyId=' + this.data.familyId;
      wx.navigateTo({ url });
    } else if (tool.category) {
      // 字典类 → 跳 dict-list 页
      wx.navigateTo({
        url: '/pages/dict-list/dict-list?category=' + tool.category +
             '&title=' + encodeURIComponent(tool.label)
      });
    }
  },

  getCurrentFamilyId: function () {
    try { const info = wx.getStorageSync('currentFamily'); return info ? Number(info.id) : null; }
    catch { return null; }
  },

  // 用于 wxml 模板显示数字
  getStat: function (cat) {
    return this.data.stats[cat] || 0;
  }
});
