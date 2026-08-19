const app = getApp();
const { auth } = require('../../utils/api');
const { getToken, setToken } = require('../../utils/request');
const { USE_MOCK } = require('../../utils/config');

const PHONE_REG = /^1[3-9]\d{9}$/;

Page({
  data: {
    mode: 'login', // login-手机号登录 bind-绑定手机号
    phone: '',
    code: '',
    agreed: false,
    counting: false,
    countdown: 60,
    userInfo: {},
    bindPhone: ''
  },

  onLoad(options) {
    // 支持从邀请/海报等页面带 redirect 参数进入，登录成功后返回原页面
    const redirect = options && options.redirect ? decodeURIComponent(options.redirect) : '';
    this._redirect = redirect;
    // 支持从个人中心带参进入绑定模式：/pages/login/login?mode=bind
    const mode = options && options.mode === 'bind' ? 'bind' : 'login';
    this.setData({ mode, userInfo: app.globalData.userInfo || {} });
    if (mode === 'bind' && !USE_MOCK && getToken()) {
      this.loadBindPhone();
    }
  },

  onUnload() {
    this.clearCountdown();
  },

  /** 已登录用户查看已绑定手机号（脱敏展示） */
  loadBindPhone() {
    auth.getProfile()
      .then((info) => {
        this.setData({
          bindPhone: info.phone ? info.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''
        });
      })
      .catch(() => {});
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  showAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({
      url: '/pages/privacy/privacy' + (type === 'privacy' ? '?tab=privacy' : '?tab=agreement')
    });
  },

  /** 校验输入并返回手机号，不合法返回 null */
  validatePhone() {
    const phone = (this.data.phone || '').trim();
    if (!PHONE_REG.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return '';
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return '';
    }
    return phone;
  },

  /** 获取验证码（60s 倒计时） */
  sendCode() {
    if (this.data.counting) return;
    const phone = this.validatePhone();
    if (!phone) return;

    const scene = this.data.mode === 'bind' ? 'bind' : 'login';
    auth.sendSmsCode(phone, scene)
      .then((data) => {
        // 开发模式(mock 短信)后端返回 devCode，自动填入方便联调
        if (data.devCode) {
          this.setData({ code: data.devCode });
        }
        wx.showToast({ title: '验证码已发送', icon: 'success' });
        this.startCountdown();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
      });
  },

  startCountdown() {
    this.setData({ counting: true, countdown: 60 });
    this._timer = setInterval(() => {
      const next = this.data.countdown - 1;
      if (next <= 0) {
        this.clearCountdown();
        return;
      }
      this.setData({ countdown: next });
    }, 1000);
  },

  clearCountdown() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.setData({ counting: false, countdown: 60 });
  },

  /** 手机号登录 / 绑定手机号提交 */
  submitPhoneLogin() {
    const phone = this.validatePhone();
    if (!phone) return;
    const code = (this.data.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '请输入6位验证码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中' });
    const action = this.data.mode === 'bind'
      ? auth.bindPhone(phone, code)
      : auth.phoneLogin(phone, code);

    action
      .then((data) => {
        wx.hideLoading();
        if (this.data.mode === 'bind') {
          wx.showToast({ title: '绑定成功', icon: 'success' });
          setTimeout(() => this.navigateBack(), 1200);
        } else {
          this.applyLogin(data);
        }
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '登录失败', icon: 'none' });
      });
  },

  /** 微信一键登录 */
  submitWxLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return;
    }
    if (USE_MOCK) {
      this.applyLogin(app.globalData.userInfo || {});
      return;
    }
    wx.showLoading({ title: '登录中' });
    app.loginByWechat()
      .then((data) => {
        wx.hideLoading();
        this.applyLogin(data);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '微信登录失败', icon: 'none' });
      });
  },

  /** 登录成功统一处理：存 token + 更新全局用户信息 */
  applyLogin(data) {
    if (data && data.token) {
      setToken(data.token);
    }
    app.globalData.userInfo = data.userInfo || {};
    app.globalData.isOnline = true;
    app.initFamilyData();
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => this.navigateBack(), 1000);
  },

  /** 返回上一页；带 redirect 参数时跳转原页面（如邀请/海报页）；无上一页时回到首页 */
  navigateBack() {
    if (this._redirect) {
      const url = this._redirect;
      this._redirect = '';
      wx.redirectTo({ url });
      return;
    }
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/profile/profile' });
    }
  }
});
