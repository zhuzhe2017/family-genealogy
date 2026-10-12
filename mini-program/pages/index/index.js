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

    // 进入首页后再征得隐私政策/用户协议同意,避免遮挡开屏
    const app = getApp();
    if (app._consentDeferredToIndex) {
      app._consentDeferredToIndex = false;
      app.checkPrivacyConsent();
    }
  }
});
