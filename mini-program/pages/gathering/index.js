const app = getApp();
const { gathering } = require('../../utils/api');

const STATUS_LABELS = { 0: '草稿', 1: '筹备中', 2: '进行中', 3: '已结束', 4: '已归档' };

Page({
  data: {
    familyId: 0,
    familyName: '',
    statusTab: '',
    tabs: [
      { label: '全部', value: '' },
      { label: '筹备中', value: 1 },
      { label: '进行中', value: 2 },
      { label: '已结束', value: 3 },
      { label: '已归档', value: 4 }
    ],
    list: [],
    loading: true,
    page: 1,
    hasMore: false
  },

  onShow() {
    const family = app.globalData.currentFamily || {};
    this.setData({ familyId: Number(family.id) || 0, familyName: family.name || '' });
    this.setData({ page: 1, list: [], hasMore: false, loading: true });
    this.loadList();
  },

  switchTab(e) {
    const value = e.currentTarget.dataset.value;
    if (String(value) === String(this.data.statusTab)) return;
    this.setData({ statusTab: value, page: 1, list: [], hasMore: false, loading: true });
    this.loadList();
  },

  loadList() {
    const familyId = this.data.familyId;
    if (!familyId) {
      this.setData({ loading: false });
      return;
    }
    const params = { page: this.data.page, pageSize: 10 };
    if (this.data.statusTab !== '') params.status = this.data.statusTab;
    gathering.getList(familyId, params)
      .then((res) => {
        const items = (res.list || []).map((it) => this.decorate(it));
        this.setData({
          list: this.data.page === 1 ? items : this.data.list.concat(items),
          hasMore: items.length >= 10 && (this.data.page * 10) < (res.total || 0),
          loading: false
        });
      })
      .catch((err) => {
        console.error('聚会列表加载失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      });
  },

  loadMore() {
    this.setData({ page: this.data.page + 1 });
    this.loadList();
  },

  decorate(it) {
    return Object.assign({}, it, {
      statusLabel: STATUS_LABELS[it.status] || '未知',
      timeText: this.fmtRange(it.startTime, it.endTime),
      progress: it.capacity > 0 ? `${it.signedTotal}/${it.capacity}人` : (it.signedTotal ? `已报名 ${it.signedTotal}人` : '')
    });
  },

  fmtRange(start, end) {
    const s = this.fmtTime(start);
    const e = this.fmtTime(end);
    if (!s) return '';
    return e && e !== s ? s + ' ~ ' + e : s;
  },

  fmtTime(t) {
    if (!t) return '';
    return String(t).replace('T', ' ').substring(0, 16);
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/gathering/detail?id=' + e.currentTarget.dataset.id });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/gathering/edit' });
  }
});
