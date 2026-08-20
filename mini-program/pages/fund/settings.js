const app = getApp();
const { fund } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    familyId: 0,
    loading: true,
    canManageRule: false,
    canDissolve: false,
    totalAmount: 0,
    form: {
      name: '',
      description: '',
      singleDepositLimit: '',
      singleWithdrawLimit: '',
      dailyDepositLimit: '',
      dailyWithdrawLimit: '',
      monthlyDepositLimit: '',
      monthlyWithdrawLimit: '',
      withdrawApprovalThreshold: '',
      needApproval: true
    },
    submitting: false
  },

  onLoad(options) {
    this.setData({ familyId: Number(options.familyId) || 0 });
  },

  onShow() {
    this.load();
  },

  load() {
    const familyId = this.data.familyId;
    if (!familyId || (!USE_MOCK && !getToken())) {
      this.setData({ loading: false });
      return;
    }
    fund.getInfo(familyId)
      .then((info) => {
        const f = info.fund || {};
        this.setData({
          loading: false,
          canManageRule: !!(info.permissions || []).includes('manage_rule'),
          canDissolve: !!(info.permissions || []).includes('dissolve'),
          totalAmount: f.totalAmount || 0,
          form: {
            name: f.name || '',
            description: f.description || '',
            singleDepositLimit: String(f.singleDepositLimit != null ? f.singleDepositLimit : ''),
            singleWithdrawLimit: String(f.singleWithdrawLimit != null ? f.singleWithdrawLimit : ''),
            dailyDepositLimit: String(f.dailyDepositLimit != null ? f.dailyDepositLimit : ''),
            dailyWithdrawLimit: String(f.dailyWithdrawLimit != null ? f.dailyWithdrawLimit : ''),
            monthlyDepositLimit: String(f.monthlyDepositLimit != null ? f.monthlyDepositLimit : ''),
            monthlyWithdrawLimit: String(f.monthlyWithdrawLimit != null ? f.monthlyWithdrawLimit : ''),
            withdrawApprovalThreshold: String(f.withdrawApprovalThreshold != null ? f.withdrawApprovalThreshold : ''),
            needApproval: !!f.needApproval
          }
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onSwitch(e) {
    this.setData({ 'form.needApproval': e.detail.value });
  },

  save() {
    if (!this.data.canManageRule) {
      wx.showToast({ title: '您没有规则设置权限', icon: 'none' });
      return;
    }
    const { form } = this.data;
    const name = (form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '基金名称不能为空', icon: 'none' });
      return;
    }
    const n = (v) => (v === '' || v == null ? undefined : Number(v));
    const payload = {
      name,
      description: (form.description || '').trim(),
      singleDepositLimit: n(form.singleDepositLimit),
      singleWithdrawLimit: n(form.singleWithdrawLimit),
      dailyDepositLimit: n(form.dailyDepositLimit),
      dailyWithdrawLimit: n(form.dailyWithdrawLimit),
      monthlyDepositLimit: n(form.monthlyDepositLimit),
      monthlyWithdrawLimit: n(form.monthlyWithdrawLimit),
      withdrawApprovalThreshold: n(form.withdrawApprovalThreshold),
      needApproval: form.needApproval ? 1 : 0
    };
    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中' });
    fund.updateSettings(this.data.familyId, payload)
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '已保存', icon: 'success' });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      });
  },

  dissolve() {
    if (!this.data.canDissolve) {
      wx.showToast({ title: '您没有解散权限', icon: 'none' });
      return;
    }
    if (this.data.totalAmount > 0) {
      wx.showModal({
        title: '无法解散',
        content: `基金当前余额 ${Number(this.data.totalAmount).toFixed(2)} 元，请先通过取出/转账/调账将余额清零后再解散。`,
        showCancel: false,
        confirmColor: '#8B1A1A'
      });
      return;
    }
    wx.showModal({
      title: '解散基金',
      content: '确定解散该家族基金吗？解散后所有成员与交易记录将保留但基金状态为已解散，且不可恢复。',
      editable: true,
      placeholderText: '请输入解散原因（选填）',
      confirmText: '确认解散',
      confirmColor: '#E64340',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '解散中' });
        fund.dissolve(this.data.familyId, { reason: (res.content || '').trim() })
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已解散', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 800);
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '解散失败', icon: 'none' });
          });
      }
    });
  }
});
