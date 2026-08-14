const app = getApp();
const { family } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');
const { normalizeFamily } = require('../../utils/format');

Page({
  data: {
    familyList: [],
    currentFamily: {},
    searchKeyword: ''
  },

  onLoad() {
    this.loadFamilies();
  },

  onShow() {
    // 每次显示刷新列表(如从创建家族页返回后能看到新家族)
    this.loadFamilies();
  },

  /** 加载家族列表:在线时走后端刷新全局数据,离线/失败回退 globalData 缓存 */
  loadFamilies() {
    const current = app.globalData.currentFamily || {};
    const render = (list) => {
      this.setData({ currentFamily: app.globalData.currentFamily || {} });
      this.applySearch(list);
    };

    if (!USE_MOCK && getToken()) {
      family.getList({ page: 1, pageSize: 50 })
        .then((res) => {
          const list = (res.list || []).map(normalizeFamily);
          app.globalData.families = list;
          // 保持当前选中家族,失效时回退到第一个
          const exists = list.some(f => String(f.id) === String(current.id));
          app.globalData.currentFamily = list.length > 0 && !exists ? list[0] : current;
          render(list);
        })
        .catch((err) => {
          console.error('家族列表加载失败,使用缓存', err);
          render(app.globalData.families || []);
        });
    } else {
      render(app.globalData.families || []);
    }
  },

  /** 按当前搜索词过滤列表并渲染 */
  applySearch(list, keyword) {
    const kw = (keyword || this.data.searchKeyword || '').trim();
    const familyList = kw
      ? (list || []).filter(f => (f.name || '').includes(kw) || (f.origin || '').includes(kw))
      : (list || []);
    this.setData({ familyList });
  },

  onSearch(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    this.applySearch(app.globalData.families || [], keyword);
  },

  selectFamily(e) {
    const familyId = e.currentTarget.dataset.id;
    app.switchFamily(familyId);
    this.setData({
      currentFamily: app.globalData.currentFamily
    });
  },

  enterFamily(e) {
    const familyId = e.currentTarget.dataset.id;
    app.switchFamily(familyId);
    wx.navigateTo({
      url: '/pages/family-tree-detail/family-tree-detail'
    });
  },

  createFamily() {
    wx.navigateTo({
      url: '/pages/create-family/create-family'
    });
  }
});
