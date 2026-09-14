const app = getApp();
const contentApi = require('../../utils/api').content;
const { USE_MOCK } = require('../../utils/config');
const { getToken, upload } = require('../../utils/request');

Page({
  data: {
    content: '',
    images: [],
    canSubmit: false,
    submitting: false
  },

  onInput(e) {
    this.setData({ content: e.detail.value });
    this.refreshCanSubmit();
  },

  /** 内容或图片任一存在即可发布 */
  refreshCanSubmit() {
    const canSubmit = !!(this.data.content.trim() || this.data.images.length > 0);
    if (this.data.canSubmit !== canSubmit) {
      this.setData({ canSubmit });
    }
  },

  chooseImage() {
    const remain = 9 - this.data.images.length;
    if (remain <= 0) return;
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath);
        this.setData({ images: [...this.data.images, ...newImages] });
        this.refreshCanSubmit();
      }
    });
  },

  /** 删除已选图片 */
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images.filter((_, i) => i !== index);
    this.setData({ images });
    this.refreshCanSubmit();
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images
    });
  },

  /** 上传单张图片到后端,返回可访问的相对 URL */
  uploadImage(filePath) {
    const familyId = (app.globalData.currentFamily || {}).id;
    const formData = familyId ? { familyId: String(familyId), bizType: 'dynamic' } : {};
    return upload({ url: '/common/upload', filePath, formData }).then(data => data.url);
  },

  submit() {
    const text = this.data.content;
    const images = this.data.images;
    if (this.data.submitting) return;
    if (!text.trim() && images.length === 0) {
      wx.showToast({ title: '请输入内容或选择图片', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });

    const done = () => this.setData({ submitting: false });
    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      wx.showLoading({ title: '发布中' });
      const uploads = images.map(img => this.uploadImage(img));
      Promise.all(uploads)
        .then((urls) => contentApi.create('dynamic', {
          familyId,
          content: text.trim(),
          images: urls
        }))
        .then(() => {
          wx.hideLoading();
          wx.showToast({ title: '发布成功', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        })
        .catch((err) => {
          wx.hideLoading();
          done();
          wx.showToast({ title: (err && err.message) || '发布失败', icon: 'none' });
        });
    } else {
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  }
});
