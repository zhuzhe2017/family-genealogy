const app = getApp();
const { fund } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');

const TYPES = [
  { label: '全部', value: '' },
  { label: '存入', value: 'deposit' },
  { label: '取出', value: 'withdraw' },
  { label: '转账', value: 'transfer' },
  { label: '调账', value: 'adjust' }
];
const STATUS_FILTERS = [
  { label: '全部状态', value: '' },
  { label: '成功', value: '1' },
  { label: '待审批', value: '2' },
  { label: '已驳回', value: '3' }
];

Page({
  data: {
    familyId: 0,
    types: TYPES,
    typeIndex: 0,
    statusFilters: STATUS_FILTERS,
    statusIndex: 0,
    startDate: '',
    endDate: '',
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    income: 0,
    expense: 0,
    totalAmount: 0,
    canApprove: false,
    needLogin: false
  },

  onLoad(options) {
    this.setData({ familyId: Number(options.familyId) || 0 });
  },

  onShow() {
    this.resetAndLoad();
  },

  resetAndLoad() {
    this.setData({ page: 1, list: [], hasMore: true });
    this.load(true);
  },

  load(silent) {
    const familyId = this.data.familyId;
    if (!familyId || (!USE_MOCK && !getToken())) {
      this.setData({ needLogin: true, loading: false });
      return;
    }
    if (!silent) {
      this.setData({ loading: true });
    }
    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize,
      type: TYPES[this.data.typeIndex].value,
      status: STATUS_FILTERS[this.data.statusIndex].value,
      startDate: this.data.startDate,
      endDate: this.data.endDate
    };
    Promise.all([
      fund.getTransactions(familyId, params),
      fund.getInfo(familyId).catch(() => null)
    ])
      .then(([res, info]) => {
        const list = this.data.page === 1 ? res.list : this.data.list.concat(res.list);
        this.setData({
          list,
          loading: false,
          hasMore: list.length < res.total,
          income: res.income || 0,
          expense: res.expense || 0,
          totalAmount: (info && info.fund && info.fund.totalAmount) || 0,
          canApprove: !!(info && (info.permissions || []).includes('approve'))
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  onTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
    this.resetAndLoad();
  },

  onStatusChange(e) {
    this.setData({ statusIndex: Number(e.detail.value) });
    this.resetAndLoad();
  },

  onStartDate(e) {
    this.setData({ startDate: e.detail.value });
    this.resetAndLoad();
  },

  onEndDate(e) {
    this.setData({ endDate: e.detail.value });
    this.resetAndLoad();
  },

  clearDate(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: '' });
    this.resetAndLoad();
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 });
    this.load();
  },

  /** 审批大额取出（仅待审批记录可操作） */
  onApprove(e) {
    const tx = e.currentTarget.dataset.item;
    const id = tx && tx.id;
    if (!id || Number(tx.status) !== 2 || !this.data.canApprove) return;
    wx.showActionSheet({
      itemList: ['通过', '驳回'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.doApprove(id, true);
        } else if (res.tapIndex === 1) {
          wx.showModal({
            title: '驳回原因',
            editable: true,
            placeholderText: '选填',
            confirmColor: '#8B1A1A',
            success: (m) => {
              if (m.confirm) this.doApprove(id, false, (m.content || '').trim());
            }
          });
        }
      }
    });
  },

  doApprove(txId, approved, remark) {
    wx.showLoading({ title: '处理中' });
    fund.approveTx(this.data.familyId, txId, { approved, remark: remark || '' })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: approved ? '已通过' : '已驳回', icon: 'success' });
        this.resetAndLoad();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      });
  }
});
