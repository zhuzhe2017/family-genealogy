const app = getApp();
const { backup } = require('../../utils/api');
const { getToken } = require('../../utils/request');
const { USE_MOCK } = require('../../utils/config');

/** 离线兜底记录（仅离线/未登录演示用） */
function fallbackRecords() {
  const now = new Date();
  return [
    { id: 1, name: '朱氏家族数据备份', time: '2024-07-20 14:30', status: '成功' },
    { id: 2, name: '朱氏家族数据备份', time: '2024-06-15 10:00', status: '成功' }
  ];
}

Page({
  data: {
    familyName: '',
    records: [],
    offlineMode: false,
    backingUp: false
  },

  onShow() {
    const family = app.globalData.currentFamily;
    this.setData({
      familyName: (family && family.name) || '',
      records: [],
      offlineMode: false
    });
    this.loadRecords();
  },

  /** 下拉刷新：重新拉取备份记录 */
  onPullDownRefresh() {
    this.loadRecords();
    wx.stopPullDownRefresh();
  },

  /** 加载备份记录；离线/未登录用本地示例数据 */
  loadRecords() {
    const family = app.globalData.currentFamily;
    if (USE_MOCK || !getToken() || !family) {
      this.setData({ records: fallbackRecords(), offlineMode: true });
      return;
    }
    backup
      .getList(Number(family.id))
      .then((list) => this.setData({ records: this.normalize(list || []), offlineMode: false }))
      .catch((err) => {
        console.error('备份记录加载失败', err);
        this.setData({ records: [], offlineMode: false });
      });
  },

  /** 后端记录 → 页面记录（时间格式化 + 状态文案 + 文件大小） */
  normalize(list) {
    return list.map((item) => ({
      id: item.id,
      name: item.name || '家族数据备份',
      time: this.formatDateTime(item.createTime),
      size: this.formatSize(item.fileSize),
      status: item.status === 'success' ? '成功' : (item.status === 'processing' ? '处理中' : '失败')
    }));
  },

  /** 创建备份：调用真实接口，未解锁权益时由全局引导跳转会员中心 */
  backupData() {
    if (this.data.backingUp) return;
    const family = app.globalData.currentFamily;
    if (!family) {
      wx.showModal({
        title: '提示',
        content: '请先在首页选择或创建家族，再进行数据备份。',
        showCancel: false
      });
      return;
    }
    // 离线/未登录：本地模拟演示
    if (USE_MOCK || !getToken()) {
      wx.showLoading({ title: '备份中' });
      setTimeout(() => {
        wx.hideLoading();
        const records = this.data.records;
        records.unshift({
          id: Date.now(),
          name: (family.name || '家族') + '数据备份',
          time: this.formatDateTime(new Date()),
          size: '',
          status: '成功'
        });
        this.setData({ records });
        wx.showToast({ title: '备份成功', icon: 'success' });
      }, 800);
      return;
    }
    this.setData({ backingUp: true });
    wx.showLoading({ title: '备份中' });
    backup
      .create(Number(family.id))
      .then(() => {
        wx.hideLoading();
        this.setData({ backingUp: false });
        wx.showToast({ title: '备份成功', icon: 'success' });
        this.loadRecords();
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ backingUp: false });
        wx.showToast({ title: (err && err.message) || '备份失败', icon: 'none' });
      });
  },

  restoreData() {
    wx.showModal({
      title: '恢复数据',
      content: '确定要恢复到最近一次备份吗？当前数据将被覆盖。',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '恢复成功',
            icon: 'success'
          });
        }
      }
    });
  },

  /** Date / ISO 字符串 → 'YYYY-MM-DD HH:mm' */
  formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!date || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  /** 字节 → 可读大小 */
  formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '';
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + 'MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + 'KB';
    return n + 'B';
  }
});
