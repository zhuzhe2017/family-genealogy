const app = getApp();
const { content: contentApi, category: categoryApi } = require('../../utils/api');
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');
const { normalizeDocument } = require('../../utils/format');

// 文档分类兜底字典(与后端默认分类约定一致;优先使用后端动态分类 loadCategories,
// 仅在后端加载失败/mock 环境回退,保证离线可用)
const DOC_CATEGORY_FALLBACK = [
  { id: 'genealogy', name: '族谱' },
  { id: 'history', name: '家族史' },
  { id: 'rules', name: '家规家训' },
  { id: 'culture', name: '文化资料' },
  { id: 'other', name: '其他' }
];

Page({
  data: {
    activeCategory: 'all',
    categories: [
      { id: 'all', name: '全部' }
    ].concat(DOC_CATEGORY_FALLBACK),
    documents: [],
    allDocuments: [],
    loading: true,
    loadFailed: false
  },

  onLoad() {
    this.loadCategories();
    this.loadDocuments();
  },

  /** 从上传页返回时刷新列表，保证新文档立即可见 */
  onShow() {
    if (this._needReload) {
      this._needReload = false;
      this.loadDocuments();
    }
  },

  /** 标记需要刷新（upload-doc 上传成功后调用） */
  markReload() {
    this._needReload = true;
  },

  /** 拉取家族文档分类(后端懒初始化默认分类;失败回退硬编码兜底字典) */
  loadCategories() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (USE_MOCK || !getToken() || !familyId) {
      this.setData({ categories: [{ id: 'all', name: '全部' }].concat(DOC_CATEGORY_FALLBACK) });
      return;
    }
    categoryApi.getList('document', familyId)
      .then((list) => {
        const cats = (list || []).map(c => ({ id: c.id, name: c.name }));
        this.setData({
          categories: [{ id: 'all', name: '全部' }].concat(cats.length ? cats : DOC_CATEGORY_FALLBACK)
        });
      })
      .catch(() => {
        this.setData({ categories: [{ id: 'all', name: '全部' }].concat(DOC_CATEGORY_FALLBACK) });
      });
  },

  /** 加载文档列表:优先走后端 API;失败仅提示,不回退 mock 数据,避免真假混杂 */
  loadDocuments() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (USE_MOCK || !getToken() || !familyId) {
      this.setData({ documents: [], allDocuments: [], loading: false, loadFailed: false });
      return;
    }
    this.setData({ loading: true, loadFailed: false });
    contentApi.getList('document', { familyId, page: 1, pageSize: 100 })
      .then((res) => {
        const documents = (res.list || []).map(normalizeDocument);
        this.setData({ allDocuments: documents, documents, loading: false });
      })
      .catch((err) => {
        console.error('文档加载失败', err);
        this.setData({ documents: [], allDocuments: [], loading: false, loadFailed: true });
      });
  },

  switchCategory(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      activeCategory: id,
      documents: id === 'all' ? this.data.allDocuments : this.data.allDocuments.filter(d => d.category === id)
    });
  },

  viewDoc(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/doc-detail/doc-detail?id=${id}`
    });
  },

  addDocument() {
    // 登录且已选家族才可上传；未登录时跳转登录页
    if (!getToken() || !(app.globalData.currentFamily || {}).id) {
      wx.showToast({ title: '请先登录并选择家族', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/upload-doc/upload-doc',
      events: {
        // upload-doc 上传成功后回传，返回时刷新列表
        docUploaded: () => this.markReload()
      }
    });
  }
});
