const app = getApp();
const { member } = require('../../utils/api');
const { getToken } = require('../../utils/request');
const { USE_MOCK } = require('../../utils/config');

/** 积分业务类型 → 展示文案 */
const BIZ_LABELS = {
  consume: '消费获得',
  register: '注册赠送',
  signin: '每日签到',
  adjust: '人工调整',
  refund: '退款回扣'
};

Page({
  data: {
    loading: true,
    loadFailed: false,
    offlineMode: false,
    hasMember: false,
    member: null,
    level: null,
    pointsRecords: [],
    signing: false
  },

  onShow() {
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData();
    wx.stopPullDownRefresh();
  },

  /** 加载我的会员信息；离线/未登录走空态提示 */
  loadData() {
    if (USE_MOCK || !getToken()) {
      this.setData({ loading: false, offlineMode: true, hasMember: false, member: null });
      return;
    }
    this.setData({ loading: true, loadFailed: false, offlineMode: false });

    member
      .getProfile()
      .then((data) => {
        this.setData({
          loading: false,
          hasMember: !!(data && data.member),
          member: this.normalizeMember(data),
          level: (data && data.level) || null,
          pointsRecords: ((data && data.pointsRecords) || []).map((r) => ({
            changePoints: Number(r.changePoints) || 0,
            balancePoints: Number(r.balancePoints) || 0,
            label: BIZ_LABELS[r.bizType] || '积分变动',
            remark: r.remark || '',
            createTime: this.formatDate(r.createTime)
          }))
        });
      })
      .catch((err) => {
        console.error('我的会员加载失败', err);
        this.setData({ loading: false, loadFailed: true, hasMember: false });
      });
  },

  normalizeMember(data) {
    if (!data || !data.member) return null;
    return {
      name: data.member.name,
      memberNo: data.member.memberNo,
      phone: data.member.phone || '',
      points: Number(data.member.points) || 0,
      totalConsume: Number(data.member.totalConsume) || 0,
      consumeCount: Number(data.member.consumeCount) || 0
    };
  },

  /** 每日签到 */
  signIn() {
    if (this.data.signing) return;
    this.setData({ signing: true });
    member
      .signIn()
      .then((res) => {
        wx.showToast({ title: '签到成功 +' + (res.points || 0) + ' 积分', icon: 'success' });
        this.setData({ signing: false });
        this.loadData();
      })
      .catch((err) => {
        this.setData({ signing: false });
        const status = (err && err.statusCode) || 0;
        if (status === 409) {
          wx.showToast({ title: '今日已签到', icon: 'none' });
        } else {
          wx.showToast({ title: (err && err.message) || '签到失败', icon: 'none' });
        }
      });
  },

  /** 未建档 → 引导去「我的」绑定手机号 */
  goBindPhone() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/profile/profile' });
      }
    });
  },

  /** ISO 时间 → YYYY-MM-DD HH:mm */
  formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }
});
