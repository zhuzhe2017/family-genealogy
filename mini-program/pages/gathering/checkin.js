const app = getApp();
const { gathering } = require('../../utils/api');

Page({
  data: {
    familyId: 0,
    id: 0,
    isOrganizer: false, // true=组织者核销模式，false=参会者签到模式
    loading: true,
    // 参会者模式
    myCode: null, // { checkinCode, qrCode, alreadyCheckedIn, name, ... }
    manualCode: '',
    // 组织者模式
    verifyCode: '',
    verifyResult: null // 核销结果 { success, already, name, checkinTime }
  },

  onLoad(options) {
    const family = app.globalData.currentFamily || {};
    this.setData({
      familyId: Number(family.id) || 0,
      id: Number(options.id) || 0,
      isOrganizer: options.org === '1'
    });
  },

  onShow() {
    if (this.data.isOrganizer) {
      this.setData({ loading: false });
    } else {
      this.loadMyCode();
    }
  },

  /** 参会者：加载我的签到码 + 二维码 */
  loadMyCode() {
    if (!this.data.id) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    gathering.getCheckinCode(this.data.familyId, this.data.id)
      .then((data) => {
        this.setData({
          myCode: {
            checkinCode: data.checkinCode,
            qrCode: data.qrCode,
            alreadyCheckedIn: data.alreadyCheckedIn,
            name: data.name,
            sessionName: data.sessionName || ''
          },
          loading: false
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '获取签到码失败', icon: 'none' });
      });
  },

  // ============ 参会者自助签到 ============
  onManualInput(e) {
    this.setData({ manualCode: e.detail.value });
  },

  selfCheckin() {
    const code = String(this.data.manualCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '请输入 6 位签到码', icon: 'none' });
      return;
    }
    this.doCheckin(code, 'manual');
  },

  // ============ 组织者核销 ============
  onVerifyInput(e) {
    this.setData({ verifyCode: e.detail.value, verifyResult: null });
  },

  scanCheckin() {
    const that = this;
    wx.scanCode({
      onlyFromCamera: true,
      success(res) {
        const code = String(res.result || '').trim();
        if (!/^\d{6}$/.test(code)) {
          wx.showToast({ title: '二维码内容不是有效签到码', icon: 'none' });
          return;
        }
        that.doCheckin(code, 'qr');
      },
      fail() {
        // 用户取消扫码，静默处理
      }
    });
  },

  manualVerify() {
    const code = String(this.data.verifyCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '请输入 6 位签到码', icon: 'none' });
      return;
    }
    this.doCheckin(code, 'manual');
  },

  /** 执行签到/核销（双通道共用） */
  doCheckin(code, method) {
    wx.showLoading({ title: '签到中' });
    gathering.checkin(this.data.familyId, this.data.id, { code, method })
      .then((res) => {
        wx.hideLoading();
        wx.showToast({ title: res.already ? '该人员已签到' : '签到成功', icon: res.already ? 'none' : 'success' });
        if (this.data.isOrganizer) {
          this.setData({ verifyResult: res, verifyCode: '' });
        } else {
          this.setData({ manualCode: '' });
          this.loadMyCode();
        }
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '签到失败', icon: 'none' });
      });
  },

  // ============ 组织者返回详情（名单/统计在详情页管理卡） ============
  goDetail() {
    wx.navigateBack();
  }
});
