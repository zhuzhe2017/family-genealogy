const app = getApp();
const contentApi = require('../../utils/api').content;
const categoryApi = require('../../utils/api').category;
const { USE_MOCK } = require('../../utils/config');
const { getToken, upload } = require('../../utils/request');

// 与 family-docs 页兜底字典一致，作为分类加载失败时的可选池
const DOC_CATEGORY_FALLBACK = [
  { id: 'genealogy', name: '族谱' },
  { id: 'history', name: '家族史' },
  { id: 'rules', name: '家规家训' },
  { id: 'culture', name: '文化资料' },
  { id: 'other', name: '其他' }
];

/** 字节数 → 可读大小 */
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

Page({
  data: {
    file: null, // { path, name, size, sizeText }
    name: '',
    volume: '',
    description: '',
    pageCount: '',
    selectedCategory: '',
    selectedCategoryName: '',
    categories: DOC_CATEGORY_FALLBACK.slice(),
    canSubmit: false,
    submitting: false
  },

  onLoad() {
    this.loadCategories();
  },

  /** 拉取家族文档分类（失败时回退兜底字典，保证可选） */
  loadCategories() {
    const familyId = (app.globalData.currentFamily || {}).id;
    if (USE_MOCK || !getToken() || !familyId) return;
    categoryApi.getList('document', familyId)
      .then((list) => {
        const cats = (list || []).map(c => ({ id: c.id, name: c.name }));
        if (cats.length) this.setData({ categories: cats });
      })
      .catch(() => { /* 保持兜底字典 */ });
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        const temp = res.tempFiles[0];
        if (!temp) return;
        // 双保险：微信 extension 过滤可能因版本差异失效，这里再校验一次
        const lowerName = (temp.name || '').toLowerCase();
        if (!lowerName.endsWith('.pdf')) {
          wx.showToast({ title: '仅支持 PDF 文件', icon: 'none' });
          return;
        }
        const size = temp.size || 0;
        const MAX_SIZE = 5 * 1024 * 1024;
        if (size > MAX_SIZE) {
          wx.showToast({ title: '文件超过 5MB，无法上传', icon: 'none' });
          return;
        }
        this.setData({
          file: {
            path: temp.path,
            name: temp.name,
            size,
            sizeText: formatSize(size)
          }
        });
        // 文档名未填时，用文件名（去扩展名）预填，减少输入
        if (!this.data.name.trim()) {
          this.setData({ name: (temp.name || '').replace(/\.pdf$/i, '') });
        }
        this.refreshCanSubmit();
      }
    });
  },

  removeFile() {
    this.setData({ file: null });
    this.refreshCanSubmit();
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
    this.refreshCanSubmit();
  },

  onVolumeInput(e) {
    this.setData({ volume: e.detail.value });
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value });
  },

  onPageCountInput(e) {
    this.setData({ pageCount: e.detail.value });
  },

  /** 用 ActionSheet 选分类，与相册页交互一致 */
  chooseCategory() {
    const pool = this.data.categories;
    if (!pool.length) {
      wx.showToast({ title: '暂无可选分类', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: pool.map(c => c.name),
      success: (pick) => {
        const cat = pool[pick.tapIndex];
        if (!cat) return;
        this.setData({ selectedCategory: cat.id, selectedCategoryName: cat.name });
      }
    });
  },

  /** 校验：文件 + 名称 齐备才可提交 */
  refreshCanSubmit() {
    const canSubmit = !!(this.data.file && this.data.name.trim());
    if (this.data.canSubmit !== canSubmit) {
      this.setData({ canSubmit });
    }
  },

  /** 上传 PDF 到 /common/upload，返回可访问 URL */
  uploadFile(filePath) {
    const familyId = (app.globalData.currentFamily || {}).id;
    const formData = familyId ? { familyId: String(familyId), bizType: 'document' } : { bizType: 'document' };
    return upload({ url: '/common/upload', filePath, formData }).then(data => data.url);
  },

  submit() {
    if (this.data.submitting) return;
    const file = this.data.file;
    const name = this.data.name.trim();
    if (!file) {
      wx.showToast({ title: '请选择 PDF 文件', icon: 'none' });
      return;
    }
    if (!name) {
      wx.showToast({ title: '请填写文档名称', icon: 'none' });
      return;
    }

    const familyId = (app.globalData.currentFamily || {}).id;
    if (!USE_MOCK && getToken() && familyId) {
      this.setData({ submitting: true });
      wx.showLoading({ title: '上传中' });
      this.uploadFile(file.path)
        .then((fileUrl) => contentApi.create('document', {
          familyId,
          name,
          volume: this.data.volume.trim(),
          description: this.data.description.trim(),
          pageCount: Number(this.data.pageCount) || 0,
          fileUrl,
          categoryId: this.data.selectedCategory
        }))
        .then((res) => {
          // 后端 create 不落 volume/pageCount/categoryId，需补一次 update 保留这三项
          const docId = res && (res.id || res.data && res.data.id);
          const extra = {};
          if (this.data.volume.trim()) extra.volume = this.data.volume.trim();
          if (Number(this.data.pageCount) > 0) extra.pageCount = Number(this.data.pageCount);
          if (this.data.selectedCategory) extra.categoryId = this.data.selectedCategory;
          if (docId && Object.keys(extra).length) {
            return contentApi.update('document', docId, Object.assign({ familyId }, extra));
          }
        })
        .then(() => {
          wx.hideLoading();
          wx.showToast({ title: '上传成功', icon: 'success' });
          // 通知列表页刷新（通过 getOpenerEventChannel）
          try {
            const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
            if (channel && typeof channel.emit === 'function') {
              channel.emit('docUploaded');
            }
          } catch (e) { /* ignore */ }
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        })
        .catch((err) => {
          wx.hideLoading();
          this.setData({ submitting: false });
          wx.showToast({ title: (err && err.message) || '上传失败', icon: 'none' });
        });
    } else {
      wx.showToast({ title: '请先登录并选择家族', icon: 'none' });
    }
  }
});
