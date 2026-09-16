const app = getApp();
const { fund } = require('../../utils/api');
const { getToken } = require('../../utils/request');

Page({
  data: {
    familyId: 0,
    loading: true,
    rankList: [],
    myRank: null,
    myUserId: ''
  },

  onLoad() {
    const family = app.globalData.currentFamily || {};
    this.setData({
      familyId: Number(family.id) || 0,
      myUserId: ((app.globalData || {}).userInfo || {}).id || ''
    });
  },

  onShow() {
    if (!this.data.familyId) {
      const familyId = (app.globalData.currentFamily || {}).id || 0;
      this.setData({ familyId });
    }
    this.loadRank();
  },

  loadRank() {
    if (!this.data.familyId || !getToken()) {
      this.setData({ loading: false, rankList: [] });
      return;
    }
    this.setData({ loading: true });
    fund.rank(this.data.familyId, { limit: 20 })
      .then((res) => {
        const list = (res.list || []).map((r, i) => Object.assign({}, r, {
          rank: i + 1,
          rankClass: i < 3 ? 'top' + (i + 1) : '',
          totalAmountText: Number(r.totalAmount || 0).toFixed(2)
        }));
        const myRank = list.find(r => String(r.userId) === String(this.data.myUserId)) || null;
        this.setData({ rankList: list, myRank, loading: false });
      })
      .catch((err) => {
        console.error('慈善榜单加载失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  }
});
