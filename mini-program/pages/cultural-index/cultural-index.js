// 跳转契约（冻结）：reader 页面从 query 中解析以下字段
//   docId      必填  文档ID（cultural_document.id）
//   docType    必填  public | family | handwritten
//   familyId   可选  仅 family 类型需要
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    tabs: [
      { key: 'public', label: '公共古籍' },
      { key: 'family', label: '家族族谱' }
    ],
    activeTab: 'public',

    loading: false,
    list: [],
    page: 1,
    pageSize: 10,
    noMore: false,
    keyword: '',

    familyId: null // 仅家族 Tab 用
  },

  onLoad: function () {
    const familyId = this.getCurrentFamilyId();
    this.setData({ familyId });
    this.loadList(true);
  },

  onPullDownRefresh: function () {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom: function () {
    if (!this.data.noMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  // 获取当前家族ID（兼容已登录/未登录）
  getCurrentFamilyId: function () {
    try {
      const info = wx.getStorageSync('current_family');
      return info ? Number(info.id) : null;
    } catch {
      return null;
    }
  },

  // 切换 Tab
  onTabChange: function (e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, page: 1, list: [], noMore: false, keyword: '' });
    this.loadList(true);
  },

  // 搜索输入
  onKeywordInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  // 搜索
  onSearch: function () {
    this.setData({ page: 1, list: [], noMore: false });
    this.loadList(true);
  },

  // 加载列表
  loadList: function (reset) {
    if (this.data.loading) return Promise.resolve();
    if (!reset && this.data.noMore) return Promise.resolve();

    this.setData({ loading: true });
    const page = reset ? 1 : this.data.page;
    const params = { page: page, pageSize: this.data.pageSize };
    if (this.data.keyword) params.keyword = this.data.keyword;
    if (this.data.activeTab === 'family') params.type = 'genealogy';

    let promise;
    if (this.data.activeTab === 'public') {
      promise = api.culturalDoc.getPublicList(params);
    } else {
      const fid = this.data.familyId;
      if (!fid) {
        this.setData({ list: [], noMore: true, loading: false });
        return Promise.resolve();
      }
      promise = api.culturalDoc.getFamilyList(fid, params);
    }

    return promise.then(res => {
      const data = res.data || res;
      const newList = data.list || [];
      const total = data.total || 0;
      const merged = reset ? newList : this.data.list.concat(newList);

      this.setData({
        list: merged,
        page: page + 1,
        noMore: merged.length >= total || newList.length < this.data.pageSize,
        loading: false
      });
    }).catch(err => {
      this.setData({ loading: false });
      wx.showToast({ title: err && err.msg ? err.msg : '加载失败', icon: 'none' });
    });
  },

  // 进入阅读器（跳转契约冻结）
  goReader: function (e) {
    const doc = e.currentTarget.dataset.doc;
    const docType = this.data.activeTab === 'public' ? 'public' : 'family';
    let url = '/pages/reader/reader?docId=' + doc.id + '&docType=' + docType;
    if (this.data.familyId) url += '&familyId=' + this.data.familyId;
    wx.navigateTo({ url });
  }
});
