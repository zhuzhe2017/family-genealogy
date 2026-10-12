const app = getApp();
const contentApi = require('../../utils/api').content;
const { getToken } = require('../../utils/request');
const { normalizeDocument } = require('../../utils/format');

Page({
  data: {
    document: {},
    loading: true,
    loadFailed: false
  },

  onLoad(options) {
    const docId = options.id;
    if (!docId) {
      this.setData({ loading: false, loadFailed: true });
      return;
    }
    this.loadDocument(docId);
  },

  /** 加载文档详情:优先走后端 API;失败仅提示,不回退演示数据 */
  loadDocument(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (getToken() && familyId) {
      this.setData({ loading: true, loadFailed: false });
      contentApi.getById('document', id)
        .then((row) => {
          const d = normalizeDocument(row);
          this.setData({
            document: Object.assign({}, d, {
              updateTime: d.updateTime || '',
              categoryName: d.category || '',
              chapters: (row.chapters || []).map(c => ({
                id: c.id,
                number: c.number,
                title: c.title,
                startPage: c.startPage || 0,
                endPage: c.endPage || 0
              }))
            }),
            loading: false
          });
        })
        .catch((err) => {
          console.error('文档详情加载失败', err);
          this.setData({ loading: false, loadFailed: true });
        });
    } else {
      // 未登录/未选择家族:显示加载失败占位
      this.setData({ document: {}, loading: false, loadFailed: true });
    }
  },

  /** 点击章节：提示阅读器定位到该章起始页 */
  viewChapter(e) {
    const index = e.currentTarget.dataset.index;
    const chapter = (this.data.document.chapters || [])[index];
    if (!chapter) return;
    const pageInfo = chapter.startPage ? `第${chapter.startPage}页` : '';
    wx.showToast({
      title: `「${chapter.title}」${pageInfo}（阅读器待接入）`,
      icon: 'none',
      duration: 2000
    });
  },

  shareDoc() {
    wx.showShareMenu({ withShareTicket: true });
  },

  /** 打开阅读器：有文件URL时跳转 webview，否则提示 */
  readDoc() {
    const doc = this.data.document;
    const fileUrl = doc.fileUrl || doc.file_url;
    if (fileUrl) {
      wx.navigateTo({
        url: '/pages/webview/webview?url=' + encodeURIComponent(fileUrl)
      });
    } else {
      wx.showToast({ title: '文档文件未上传', icon: 'none' });
    }
  },

  /** 分享给好友：携带文档 id，接收方打开可定位到本文档 */
  onShareAppMessage() {
    const doc = this.data.document || {};
    return {
      title: doc.name || '家族文档',
      path: '/pages/doc-detail/doc-detail?id=' + (doc.id || '')
    };
  }
});
