const app = getApp();
const { fund } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    familyId: 0,
    loading: true,
    needChooseFamily: false, // 未选择家族
    hasFund: false,
    fund: null,
    myRole: '',
    roleLabel: '',
    permissions: [],
    isLeader: false,
    myBalance: 0,
    stats: null,
    pendingCount: 0,
    showHelp: false
  },

  onLoad(options) {
    const familyId = Number(options.familyId) || (app.globalData.currentFamily || {}).id || 0;
    this.setData({ familyId });
  },

  onShow() {
    if (!this.data.familyId) {
      const familyId = (app.globalData.currentFamily || {}).id || 0;
      this.setData({ familyId });
    }
    this.load();
  },

  /** 加载基金信息 + 统计 */
  load() {
    const familyId = this.data.familyId;
    if (!familyId) {
      this.setData({ loading: false, needChooseFamily: true });
      return;
    }
    if (!USE_MOCK && !getToken()) {
      this.setData({ loading: false, needChooseFamily: true });
      return;
    }
    Promise.all([
      fund.getInfo(familyId),
      fund.getStats(familyId).catch(() => null)
    ])
      .then(([info, stats]) => {
        this.setData({
          loading: false,
          needChooseFamily: false,
          hasFund: !!info.hasFund,
          fund: info.fund || null,
          myRole: info.myRole || '',
          roleLabel: info.roleLabel || '',
          permissions: info.permissions || [],
          isLeader: !!info.isLeader,
          myBalance: info.myBalance || 0,
          stats: stats || null,
          pendingCount: (stats && stats.pendingCount) || 0
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  hasPerm(p) {
    return (this.data.permissions || []).includes(p);
  },

  /** 未选择家族：去家族选择页 */
  goChooseFamily() {
    wx.switchTab({ url: '/pages/family-tree/family-tree' });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/fund/create?familyId=' + this.data.familyId });
  },

  /** 快捷操作（deposit/withdraw/transfer/adjust） */
  goOp(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: '/pages/fund/op?familyId=' + this.data.familyId + '&type=' + type });
  },

  goRecords() {
    wx.navigateTo({ url: '/pages/fund/records?familyId=' + this.data.familyId });
  },

  goMembers() {
    wx.navigateTo({ url: '/pages/fund/members?familyId=' + this.data.familyId });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/fund/settings?familyId=' + this.data.familyId });
  },

  /** 慈善榜单 */
  goRank() {
    wx.navigateTo({ url: '/pages/fund/rank?familyId=' + this.data.familyId });
  },

  toggleHelp() {
    this.setData({ showHelp: !this.data.showHelp });
  }
});
