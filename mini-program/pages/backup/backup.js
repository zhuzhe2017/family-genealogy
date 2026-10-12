const app = getApp();
const { backup } = require('../../utils/api');
const { getToken } = require('../../utils/request');

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

  /** 加载备份记录；未登录/无家族显示空态 */
  loadRecords() {
    const family = app.globalData.currentFamily;
    if (!getToken() || !family) {
      this.setData({ records: [], offlineMode: false });
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
      content: '数据恢复功能即将上线，敬请期待。',
      showCancel: false,
      confirmText: '我知道了'
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
