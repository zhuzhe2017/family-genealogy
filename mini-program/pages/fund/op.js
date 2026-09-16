const app = getApp();
const { fund } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

const TYPE_CONF = {
  deposit: { title: '存入基金', icon: '📥' },
  withdraw: { title: '取出基金', icon: '📤' },
  transfer: { title: '成员转账', icon: '🔁' },
  adjust: { title: '族长调账', icon: '⚖️' }
};

const PAYMENTS = ['cash', 'wechat', 'alipay', 'bank'];
const PAYMENT_NAMES = ['现金', '微信', '支付宝', '银行转账'];

Page({
  data: {
    familyId: 0,
    type: 'deposit',
    typeLabel: '',
    submitting: false,
    amount: '',
    remark: '',
    paymentIndex: 0,
    payments: PAYMENT_NAMES,
    members: [],
    memberIndex: 0,
    targetUserId: '',
    directionIndex: 0,
    limitsText: '',
    approveText: '',
    myBalance: 0,
    needLogin: false
  },

  onLoad(options) {
    const type = options.type || 'deposit';
    const conf = TYPE_CONF[type] || TYPE_CONF.deposit;
    this.setData({
      familyId: Number(options.familyId) || 0,
      type,
      typeLabel: conf.title
    });
    wx.setNavigationBarTitle({ title: conf.title });
  },

  onShow() {
    if (!this.data.familyId) {
      const familyId = (app.globalData.currentFamily || {}).id || 0;
      this.setData({ familyId });
    }
    this.loadContext();
  },

  /** 加载基金规则 + 我的余额 + 转账接收人 */
  loadContext() {
    const familyId = this.data.familyId;
    if (!familyId || (!USE_MOCK && !getToken())) {
      this.setData({ needLogin: true });
      return;
    }
    fund.getInfo(familyId)
      .then((info) => {
        const f = info.fund || {};
        const limits = `单次限额 ${this.fmt(f.singleDepositLimit)}/${this.fmt(f.singleWithdrawLimit)} 元\n每日限额 ${this.fmt(f.dailyDepositLimit)}/${this.fmt(f.dailyWithdrawLimit)} 元\n每月限额 ${this.fmt(f.monthlyDepositLimit)}/${this.fmt(f.monthlyWithdrawLimit)} 元`;
        const approve = f.needApproval
          ? `超过 ${this.fmt(f.withdrawApprovalThreshold)} 元需族长/管理员审批`
          : '无需审批';
        this.setData({ limitsText: limits, approveText: approve, myBalance: info.myBalance || 0 });
        if (this.data.type === 'transfer') {
          this.loadMembers();
        }
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  loadMembers() {
    fund.getMembers(this.data.familyId)
      .then((res) => {
        const myId = ((app.globalData || {}).userInfo || {}).id;
        const list = (res.list || []).filter((m) => m.userId !== myId);
        this.setData({ members: list });
      })
      .catch(() => {});
  },

  fmt(v) {
    return Number(v || 0).toFixed(2);
  },

  onAmount(e) {
    this.setData({ amount: e.detail.value });
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value });
  },

  onPaymentChange(e) {
    this.setData({ paymentIndex: Number(e.detail.value) });
  },

  onMemberChange(e) {
    const index = Number(e.detail.value);
    this.setData({ memberIndex: index, targetUserId: (this.data.members[index] || {}).userId || '' });
  },

  onDirectionChange(e) {
    this.setData({ directionIndex: Number(e.detail.value) });
  },

  submit() {
    const { familyId, type, amount, remark, paymentIndex, targetUserId, directionIndex } = this.data;
    if (!familyId) {
      wx.showToast({ title: '缺少家族ID', icon: 'none' });
      return;
    }
    const amt = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    const payload = {
      amount: amt,
      remark: (remark || '').trim()
    };
    if (type === 'deposit' || type === 'withdraw') {
      payload.paymentMethod = PAYMENTS[paymentIndex];
    }
    if (type === 'transfer') {
      if (!targetUserId) {
        wx.showToast({ title: '请选择接收人', icon: 'none' });
        return;
      }
      payload.targetUserId = targetUserId;
    }
    if (type === 'adjust') {
      payload.direction = directionIndex === 0 ? 1 : -1;
    }
    const apiMap = {
      deposit: () => fund.deposit(familyId, payload),
      withdraw: () => fund.withdraw(familyId, payload),
      transfer: () => fund.transfer(familyId, payload),
      adjust: () => fund.adjust(familyId, payload)
    };
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    apiMap[type]()
      .then((res) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        if (type === 'withdraw' && res.status === 2) {
          wx.showModal({
            title: '已提交审批',
            content: '该笔取出超过审批阈值，已进入待审批状态，请等待族长/管理员审批通过。',
            showCancel: false,
            confirmColor: '#8B1A1A',
            success: () => wx.navigateBack()
          });
        } else {
          wx.showToast({ title: '操作成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 800);
        }
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      });
  }
});
