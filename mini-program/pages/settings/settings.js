const { auth } = require('../../utils/api');

Page({
  data: {
    notification: true,
    cacheSize: '0KB',
    privacyConsents: [],
    passwordForm: {
      password: '',
      confirm: ''
    }
  },

  onLoad() {
    this.loadCacheSize();
    this.loadConsents();
  },

  onShow() {
    this.loadCacheSize();
  },

  /** 计算本地缓存大小 */
  loadCacheSize() {
    try {
      const info = wx.getStorageInfoSync();
      const size = info.currentSize || 0;
      if (size > 1024) {
        this.setData({ cacheSize: (size / 1024).toFixed(1) + 'MB' });
      } else {
        this.setData({ cacheSize: size + 'KB' });
      }
    } catch (e) {
      this.setData({ cacheSize: '0KB' });
    }
  },

  /** 加载隐私同意状态 */
  loadConsents() {
    if (!getApp().globalData.token) return;
    auth.getConsents()
      .then(res => {
        this.setData({ privacyConsents: res || [] });
      })
      .catch(() => {});
  },

  toggleNotification(e) {
    this.setData({
      notification: e.detail.value
    });
    wx.showToast({
      title: e.detail.value ? '已开启通知' : '已关闭通知',
      icon: 'none'
    });
  },

  /** 清理缓存：清空本地存储并重新登录 */
  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '将清除本地登录状态和临时数据，确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync();
            getApp().globalData.token = null;
            getApp().globalData.userInfo = null;
            this.setData({
              cacheSize: '0KB',
              privacyConsents: []
            });
            wx.showToast({
              title: '清理完成，请重新登录',
              icon: 'none',
              duration: 2000
            });
            setTimeout(() => {
              wx.reLaunch({ url: '/pages/login/login' });
            }, 1500);
          } catch (e) {
            wx.showToast({ title: '清理失败', icon: 'none' });
          }
        }
      }
    });
  },

  /** 隐私设置：展示已同意的协议版本 */
  setPrivacy() {
    if (!getApp().globalData.token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const consents = this.data.privacyConsents;
    let content = '';
    if (consents.length === 0) {
      content = '尚未同意任何隐私协议\n请前往登录页阅读并同意';
    } else {
      content = consents.map(c => {
        const name = c.docType === 'privacy' ? '隐私政策' : c.docType === 'agreement' ? '用户协议' : '会员服务协议';
        return `${name} v${c.docVersion || '1.0'}`;
      }).join('\n');
    }
    wx.showModal({
      title: '隐私设置',
      content: content,
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  /** 修改密码：输入新密码并确认 */
  setPassword() {
    if (!getApp().globalData.token) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({
      'passwordForm.password': '',
      'passwordForm.confirm': ''
    });
    wx.showModal({
      title: '修改密码',
      editable: true,
      placeholderText: '请输入新密码（至少6位）',
      success: (res) => {
        if (res.confirm && res.content) {
          if (res.content.length < 6) {
            wx.showToast({ title: '密码至少6位', icon: 'none' });
            return;
          }
          this.setData({ 'passwordForm.password': res.content });
          this.confirmPassword();
        }
      }
    });
  },

  /** 二次确认密码 */
  confirmPassword() {
    wx.showModal({
      title: '确认密码',
      editable: true,
      placeholderText: '请再次输入新密码',
      success: (res) => {
        if (res.confirm && res.content) {
          if (res.content !== this.data.passwordForm.password) {
            wx.showToast({ title: '两次密码不一致', icon: 'none' });
            return;
          }
          this.submitPassword();
        }
      }
    });
  },

  /** 提交密码修改 */
  submitPassword() {
    wx.showLoading({ title: '提交中...' });
    auth.setPassword(this.data.passwordForm.password)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '密码修改成功', icon: 'success' });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '修改失败', icon: 'none' });
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
