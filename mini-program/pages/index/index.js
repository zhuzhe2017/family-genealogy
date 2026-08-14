Page({
  data: {
    canNavigate: false
  },

  onLoad() {
    // 模拟加载
    setTimeout(() => {
      this.setData({ canNavigate: true });
    }, 1500);
  },

  enterApp() {
    if (!this.data.canNavigate) return;

    wx.switchTab({
      url: '/pages/home/home'
    });
  }
});
