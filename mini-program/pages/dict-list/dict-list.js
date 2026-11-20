/**
 * 字典列表页（字辈/堂号/术语 通用）
 *
 * 跳转契约：
 *   category  必填   zibei | tanghao | terminology | suyuan
 *   title     可选   页面标题（不传则用 category 映射）
 */
const api = require('../../utils/api.js');

const CATEGORY_LABEL = {
  zibei:       '字辈查字',
  tanghao:     '堂号辞典',
  terminology: '家谱术语',
  suyuan:      '姓氏溯源'
};

const CATEGORY_SORT = {
  zibei:       { label: '按字序', desc: '字辈字序排列' },
  tanghao:     { label: '按姓氏', desc: '堂号关联姓氏' },
  terminology: { label: '按分类', desc: '家谱术语分类' },
  suyuan:      { label: '按年代', desc: '姓氏起源年代' }
};

Page({
  data: {
    category: 'zibei',
    title: '',
    list: [],
    loading: false,
    page: 1,
    pageSize: 50,
    hasMore: true,
    keyword: '',
    sortLabel: '按字序',
    empty: false
  },

  onLoad: function (query) {
    const category = query.category || 'zibei';
    const title = query.title || CATEGORY_LABEL[category] || '字典';
    const sortLabel = CATEGORY_SORT[category]?.label || '列表';

    this.setData({ category, title, sortLabel });
    wx.setNavigationBarTitle({ title });

    this.loadList(true);
  },

  onPullDownRefresh: function () {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm: function () {
    this.loadList(true);
  },

  loadList: function (reset) {
    if (this.data.loading) return Promise.resolve();
    const page = reset ? 1 : this.data.page;

    this.setData({ loading: true });
    const params = {
      category: this.data.category,
      page,
      pageSize: this.data.pageSize
    };
    if (this.data.keyword) params.keyword = this.data.keyword;

    return api.culturalDict.getList(params).then(res => {
      const data = res.data || { list: [], total: 0 };
      const newList = reset ? data.list : this.data.list.concat(data.list);
      const hasMore = newList.length < data.total;

      this.setData({
        list: newList,
        page: page + 1,
        hasMore,
        loading: false,
        empty: newList.length === 0
      });
    }).catch(() => {
      this.setData({ loading: false });
      if (reset) this.setData({ empty: true });
    });
  },

  // ============ 项展开/收起 ============
  onToggleItem: function (e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const key = 'list[' + idx + '].expanded';
    this.setData({ [key]: !this.data.list[idx].expanded });
  },

  // ============ 复制 ============
  onCopyContent: function (e) {
    const content = e.currentTarget.dataset.content || '';
    wx.setClipboardData({ data: content, success: () => wx.showToast({ title: '已复制', icon: 'none' }) });
  },

  // ============ 查看古籍 ============
  onOpenCultural: function (e) {
    const keyword = e.currentTarget.dataset.keyword || this.data.keyword;
    wx.navigateTo({
      url: '/pages/cultural-index/cultural-index?keyword=' + encodeURIComponent(keyword || '')
    });
  }
});
