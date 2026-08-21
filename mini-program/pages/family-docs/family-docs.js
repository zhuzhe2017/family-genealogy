const app = getApp();
const contentApi = require('../../utils/api').content;
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');
const { normalizeDocument } = require('../../utils/format');

Page({
  data: {
    activeCategory: 'all',
    categories: [
      { id: 'all', name: '全部' },
      { id: 'genealogy', name: '族谱' },
      { id: 'history', name: '家族史' },
      { id: 'rules', name: '家规家训' },
      { id: 'culture', name: '文化资料' },
      { id: 'other', name: '其他' }
    ],
    documents: [
      {
        id: 1,
        name: '朱氏族谱·卷之一',
        volume: '卷一',
        description: '记录朱氏家族从始祖朱太公开始的家族谱系，包含第一代至第三代的详细记载。',
        updateTime: '2024-01-15',
        pages: 156,
        category: 'genealogy'
      },
      {
        id: 2,
        name: '朱氏族谱·卷之二',
        volume: '卷二',
        description: '记录第四代至第六代的家族谱系，包含重要家族事件的详细记载。',
        updateTime: '2024-02-20',
        pages: 203,
        category: 'genealogy'
      },
      {
        id: 3,
        name: '朱氏家族史话',
        volume: '上册',
        description: '从清末到民国时期的家族发展历程，记录家族在动荡年代的变迁与坚守。',
        updateTime: '2024-03-10',
        pages: 320,
        category: 'history'
      },
      {
        id: 4,
        name: '朱氏家训',
        volume: '全册',
        description: '传承百年的家族家训，包含修身、齐家、治国、平天下的家训格言。',
        updateTime: '2024-01-05',
        pages: 88,
        category: 'rules'
      },
      {
        id: 5,
        name: '家族文化集',
        volume: '全册',
        description: '收集整理家族相关的诗词、书法、绘画等文化艺术作品。',
        updateTime: '2024-04-01',
        pages: 256,
        category: 'culture'
      }
    ],
    allDocuments: []
  },

  onLoad() {
    this.loadDocuments();
  },

  /** 加载文档列表:优先走后端 API,失败回退 mock */
  loadDocuments() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      contentApi.getList('document', { familyId, page: 1, pageSize: 100 })
        .then((res) => {
          const documents = (res.list || []).map(normalizeDocument);
          this.setData({ allDocuments: documents, documents });
        })
        .catch((err) => {
          console.error('文档加载失败,使用 mock', err);
        });
    }
  },

  switchCategory(e) {
    const id = e.currentTarget.dataset.id;
    const source = this.data.allDocuments.length ? this.data.allDocuments : this.data.documents;
    this.setData({
      activeCategory: id,
      documents: id === 'all' ? source : source.filter(d => d.category === id)
    });
  },

  viewDoc(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/doc-detail/doc-detail?id=${id}`
    });
  },

  addDocument() {
    // 后端暂不支持小程序端发布文档类型内容,如实提示避免"假上传"
    wx.showToast({ title: '文档上传暂未开放,请使用管理端', icon: 'none' });
  }
});
