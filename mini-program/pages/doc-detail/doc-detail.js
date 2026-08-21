const app = getApp();
const contentApi = require('../../utils/api').content;
const { USE_MOCK } = require('../../utils/config');
const { getToken } = require('../../utils/request');
const { normalizeDocument } = require('../../utils/format');

Page({
  data: {
    document: {}
  },

  onLoad(options) {
    const docId = options.id;
    this.loadDocument(docId);
  },

  loadDocument(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      contentApi.getById('document', id)
        .then((row) => {
          const d = normalizeDocument(row);
          this.setData({
            document: Object.assign({}, d, {
              updateTime: d.updateTime || '',
              categoryName: d.category || '',
              chapters: [] // 章节表 family_document_chapter 一期未接
            })
          });
        })
        .catch((err) => {
          console.error('文档详情加载失败,使用 mock', err);
          this.setData({ document: this.getMockDocument(id) });
        });
    } else {
      this.setData({ document: this.getMockDocument(id) });
    }
  },

  getMockDocument(id) {
    return {
      id: id,
      name: '朱氏族谱·卷之一',
      volume: '卷一',
      description: '记录朱氏家族从始祖朱太公开始的家族谱系，包含第一代至第三代的详细记载。本卷详细记录了家族的起源、迁徙历史、重要人物事迹等内容，是研究朱氏家族历史的重要文献资料。',
      pages: 156,
      updateTime: '2024-01-15',
      categoryName: '族谱',
      chapters: [
        { id: 1, number: '一', title: '家族起源', startPage: 1, endPage: 20 },
        { id: 2, number: '二', title: '迁徙历史', startPage: 21, endPage: 45 },
        { id: 3, number: '三', title: '第一代谱系', startPage: 46, endPage: 78 },
        { id: 4, number: '四', title: '第二代谱系', startPage: 79, endPage: 110 },
        { id: 5, number: '五', title: '第三代谱系', startPage: 111, endPage: 156 }
      ]
    };
  },

  viewChapter(e) {
    const index = e.currentTarget.dataset.index;
    wx.showToast({ title: '打开章节', icon: 'none' });
  },

  shareDoc() {
    wx.showShareMenu({ withShareTicket: true });
  },

  readDoc() {
    wx.showToast({ title: '打开阅读器', icon: 'none' });
  }
});
