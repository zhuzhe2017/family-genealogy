const app = getApp();

Page({
  data: {
    currentFamily: {}
  },

  onLoad() {
    this.setData({
      currentFamily: app.globalData.currentFamily || {}
    });
  },

  onShow() {
    this.setData({
      currentFamily: app.globalData.currentFamily || {}
    });
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  }
});
