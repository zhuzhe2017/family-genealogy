Page({
  data: {
    notification: true
  },

  onLoad() {},

  toggleNotification(e) {
    this.setData({
      notification: e.detail.value
    });
    wx.showToast({
      title: e.detail.value ? '已开启通知' : '已关闭通知',
      icon: 'none'
    });
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确定要清理本地缓存吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '清理完成',
            icon: 'success'
          });
        }
      }
    });
  },

  setPrivacy() {
    wx.showToast({
      title: '隐私设置',
      icon: 'none'
    });
  },

  setPassword() {
    wx.showToast({
      title: '修改密码',
      icon: 'none'
    });
  },

  showAbout() {
    wx.showModal({
      title: '关于数字家谱',
      content: '数字家谱 v1.0.0\n传承家族记忆，延续血脉亲情',
      showCancel: false
    });
  }
});
