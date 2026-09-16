const app = getApp();
const { invitation } = require('../../utils/api');
const { getToken } = require('../../utils/request');
const { resolveImageUrl, normalizeFamily } = require('../../utils/format');

Page({
  data: {
    code: '',
    loading: true,
    notFound: false,
    info: null,
    processing: false,
    loggedIn: false
  },

  onLoad(options) {
    // 兼容两种进入方式：
    // 1. 链接/分享卡片: ?code=ABC12345
    // 2. 扫描海报小程序码: scene=code=ABC12345（getwxacodeunlimit 的 scene 参数）
    let raw = String(options.code || options.scene || '').trim();
    if (!options.code && options.scene) {
      const m = raw.match(/code=([A-Za-z0-9]+)/);
      if (m) raw = m[1];
    }
    const code = raw.toUpperCase();
    this.setData({ code, loggedIn: !!getToken() });
    if (!code) {
      this.setData({ loading: false, notFound: true });
      return;
    }
    this.loadInfo(code);
  },

  loadInfo(code) {
    this.setData({ loading: true, notFound: false });
    invitation.getInfoByCode(code)
      .then((info) => {
        // 后端返回相对路径(/uploads/xxx),补全域名供 <image> 使用
        this.setData({
          info: Object.assign({}, info, {
            familyLogo: resolveImageUrl(info.familyLogo || ''),
            inviterAvatarUrl: resolveImageUrl(info.inviterAvatarUrl || '')
          }),
          loading: false
        });
      })
      .catch((err) => {
        this.setData({ loading: false, notFound: true });
        wx.showToast({ title: err.message || '邀请码无效', icon: 'none', duration: 2500 });
      });
  },

  onAccept() {
    if (this.data.processing) return;
    if (!getToken()) {
      wx.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/invite-accept/invite-accept?code=' + this.data.code) });
      return;
    }
    wx.showModal({
      title: '接受邀请',
      content: `确定加入「${this.data.info.familyName || '该家族'}」吗？`,
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ processing: true });
        invitation.process({ inviteCode: this.data.code, accept: true })
          .then(() => {
            wx.showToast({ title: '加入成功', icon: 'success' });
            // 刷新全局家族信息并返回首页
            this.refreshUserFamily();
            setTimeout(() => {
              wx.switchTab({ url: '/pages/home/home' });
            }, 800);
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '接受失败', icon: 'none', duration: 2500 });
            this.setData({ processing: false });
          });
      }
    });
  },

  onReject() {
    if (this.data.processing) return;
    if (!getToken()) {
      wx.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/invite-accept/invite-accept?code=' + this.data.code) });
      return;
    }
    wx.showModal({
      title: '拒绝邀请',
      content: '确定拒绝该家族邀请吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ processing: true });
        invitation.process({ inviteCode: this.data.code, accept: false, remark: '用户拒绝' })
          .then(() => {
            wx.showToast({ title: '已拒绝', icon: 'success' });
            setTimeout(() => {
              wx.navigateBack({ delta: 1 });
            }, 800);
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '拒绝失败', icon: 'none' });
            this.setData({ processing: false });
          });
      }
    });
  },

  onLogin() {
    wx.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent('/pages/invite-accept/invite-accept?code=' + this.data.code) });
  },

  refreshUserFamily() {
    const api = require('../../utils/api').auth;
    api.getMyFamily().then((data) => {
      // data.family 是 FamilyBrief（缺 generationSequence 等字段），需 normalize 后使用
      app.globalData.currentFamily = data.family ? normalizeFamily(data.family) : {};
      // getMyFamily 返回的成员字段是 member（非 userInfo），仅在存在时合并
      if (data.member) {
        app.globalData.userInfo = Object.assign(app.globalData.userInfo || {}, data.member || {});
      }
    }).catch(() => {});
  }
});
