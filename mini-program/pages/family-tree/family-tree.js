const app = getApp();
const { auth, family } = require('../../utils/api');
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

  /** 进入家族:已加入直接进入,未加入需输入分享码验证 */
  enterFamily(e) {
    const familyId = e.currentTarget.dataset.id;
    const target = this.data.familyList.find(f => String(f.id) === String(familyId));
    if (!target) return;

    const userFamilyId = (app.globalData.userInfo || {}).familyId;
    const alreadyJoined = userFamilyId && String(userFamilyId) === String(familyId);

    if (alreadyJoined) {
      app.switchFamily(familyId);
      wx.navigateTo({ url: '/pages/family-tree-detail/family-tree-detail' });
      return;
    }

    wx.showModal({
      title: '加入家族',
      editable: true,
      placeholderText: '请输入分享码（如 ABC12345）',
      confirmText: '进入',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        const code = (res.content || '').trim();
        if (!code) {
          wx.showToast({ title: '请输入分享码', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '加入中' });
        auth.joinFamily({ shareCode: code.toUpperCase() })
          .then((data) => {
            wx.hideLoading();
            const userInfo = data.userInfo || {};
            app.globalData.myFamily = {
              familyId: userInfo.familyId,
              family: data.family || null,
              memberId: userInfo.memberId,
              member: data.member || null,
              shareCode: data.shareCode
            };
            app.globalData.userInfo = Object.assign({}, app.globalData.userInfo || {}, userInfo);
            if (data.family && data.family.id) {
              const fam = normalizeFamily(data.family);
              app.globalData.families = [
                fam,
                ...(app.globalData.families || []).filter(f => String(f.id) !== String(data.family.id))
              ];
            }
            app.switchFamily(userInfo.familyId);
            wx.navigateTo({ url: '/pages/family-tree-detail/family-tree-detail' });
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '加入失败', icon: 'none' });
          });
      }
    });
  },

  createFamily() {
    wx.navigateTo({
      url: '/pages/create-family/create-family'
    });
  }
});
