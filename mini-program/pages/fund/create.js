const app = getApp();
const { fund } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

Page({
  data: {
    familyId: 0,
    submitting: false,
    form: {
      name: '',
      description: '',
      initAmount: '',
      singleDepositLimit: '1000',
      singleWithdrawLimit: '1000',
      dailyDepositLimit: '2000',
      dailyWithdrawLimit: '2000',
      monthlyDepositLimit: '5000',
      monthlyWithdrawLimit: '5000',
      withdrawApprovalThreshold: '500',
      needApproval: true
    },
    showAdvanced: false
  },

  onLoad(options) {
    this.setData({ familyId: Number(options.familyId) || 0 });
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onSwitch(e) {
    this.setData({ 'form.needApproval': e.detail.value });
  },

  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
  },

  submit() {
    const { familyId, form } = this.data;
    if (!familyId) {
      wx.showToast({ title: '缺少家族ID', icon: 'none' });
      return;
    }
    const name = (form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写基金名称', icon: 'none' });
      return;
    }
    const initAmount = Number(form.initAmount) || 0;
    if (initAmount < 0) {
      wx.showToast({ title: '初始金额不能为负', icon: 'none' });
      return;
    }
    const payload = {
      name,
      description: (form.description || '').trim(),
      initAmount,
      singleDepositLimit: Number(form.singleDepositLimit) || 0,
      singleWithdrawLimit: Number(form.singleWithdrawLimit) || 0,
      dailyDepositLimit: Number(form.dailyDepositLimit) || 0,
      dailyWithdrawLimit: Number(form.dailyWithdrawLimit) || 0,
      monthlyDepositLimit: Number(form.monthlyDepositLimit) || 0,
      monthlyWithdrawLimit: Number(form.monthlyWithdrawLimit) || 0,
      withdrawApprovalThreshold: Number(form.withdrawApprovalThreshold) || 0,
      needApproval: form.needApproval ? 1 : 0
    };
    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中' });
    fund.create(familyId, payload)
      .then(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '创建成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
      });
  }
});
