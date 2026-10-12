const app = getApp();
const contentApi = require('../../utils/api').content;
const categoryApi = require('../../utils/api').category;
const { getToken } = require('../../utils/request');
const { normalizePhoto } = require('../../utils/format');

Page({
  data: {
    photo: {},
    relatedPhotos: [],
    loading: true,
    loadFailed: false
  },

  onLoad(options) {
    const photoId = options.id;
    if (!photoId) {
      this.setData({ loading: false, loadFailed: true });
      return;
    }
    this.loadPhoto(photoId);
  },

  /** 加载照片详情,并用分类列表把 category_id 映射为可读分类名 */
  loadPhoto(id) {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (getToken() && familyId) {
      this.setData({ loading: true, loadFailed: false });
      Promise.all([
        contentApi.getById('photo', id),
        categoryApi.getList('album', familyId).catch(() => [])
      ])
        .then(([row, categories]) => {
          const p = normalizePhoto(row);
          const list = Array.isArray(categories) ? categories : (categories.list || []);
          const cat = list.find(c => String(c.id) === String(p.category));
          this.setData({
            photo: Object.assign({}, p, {
              categoryName: (cat && cat.name) || '',
              uploader: p.uploaderName,
              uploadTime: p.createTime
            }),
            loading: false
          });
        })
        .catch((err) => {
          console.error('照片详情加载失败', err);
          this.setData({ loading: false, loadFailed: true });
        });
    } else {
      // 离线/未登录:展示加载失败占位,避免页面空白
      this.setData({ photo: {}, loading: false, loadFailed: true });
    }
  },

  viewRelated(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/photo-detail/photo-detail?id=${id}`
    });
  },

  downloadPhoto() {
    wx.showToast({ title: '开始下载', icon: 'none' });
  },

  sharePhoto() {
    wx.showShareMenu({ withShareTicket: true });
  },

  deletePhoto() {
    const familyId = (app.globalData.currentFamily || {}).id;
    const id = this.data.photo.id;
    if (!familyId || !id) return;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这张照片吗？',
      confirmColor: '#8B1A1A',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中' });
        contentApi.remove('photo', id, familyId)
          .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          })
          .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
          });
      }
    });
  }
});
