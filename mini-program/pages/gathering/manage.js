const app = getApp();
const { gathering } = require('../../utils/api');

const STATUS_LABELS = { 1: '已报名', 2: '已取消', 3: '已签到' };
const DIET_LABELS = { normal: '无要求', vegetarian: '素食', halal: '清真', custom: '其他' };

Page({
  data: {
    familyId: 0,
    id: 0,
    loading: true,
    registrations: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    // 统计
    stats: null,
    // 筛选
    statusFilter: 0, // 0=全部 1=已报名 2=已取消 3=已签到
    keyword: ''
  },

  onLoad(options) {
    const family = app.globalData.currentFamily || {};
    this.setData({
      familyId: Number(family.id) || 0,
      id: Number(options.id) || 0
    });
    this.loadStats();
    this.loadRegistrations(true);
  },

  onPullDownRefresh() {
    this.loadStats();
    this.loadRegistrations(true).finally(() => wx.stopPullDownRefresh());
  },

  /** 加载参会统计 */
  loadStats() {
    if (!this.data.id) return Promise.resolve();
    return gathering.getStats(this.data.familyId, this.data.id)
      .then((data) => this.setData({ stats: data }))
      .catch(() => {});
  },

  /** 加载报名名单(带请求锁,防止并发/快速点击重复请求) */
  loadRegistrations(reset) {
    if (!this.data.id) {
      this.setData({ loading: false });
      return Promise.resolve();
    }
    if (this._loadingList) return this._loadingList;
    const page = reset ? 1 : this.data.page;
    const params = {
      page,
      pageSize: this.data.pageSize,
      status: this.data.statusFilter || undefined,
      keyword: this.data.keyword || undefined
    };
    this.setData({ loading: reset });
    this._loadingList = gathering.getRegistrations(this.data.familyId, this.data.id, params)
      .then((res) => {
        const list = (res.list || []).map(r => Object.assign({}, r, {
          statusLabel: STATUS_LABELS[r.status] || '未知',
          dietLabel: DIET_LABELS[r.dietType] || r.dietType || '无要求'
        }));
        this.setData({
          registrations: reset ? list : this.data.registrations.concat(list),
          total: res.total || 0,
          page: page + 1,
          hasMore: list.length >= this.data.pageSize,
          loading: false
        });
      })
      .catch((err) => {
        console.error('报名名单加载失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      })
      .finally(() => { this._loadingList = null; });
    return this._loadingList;
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.loadRegistrations(false);
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onStatusChange(e) {
    this.setData({ statusFilter: Number(e.detail.value) || 0 });
    this.loadRegistrations(true);
  },

  search() {
    this.loadRegistrations(true);
  },

  /** 复制签到码 */
  copyCode(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.setClipboardData({ data: String(code) });
  }
});
