/**
 * 手写族谱数字化录入（识典古籍对标 · 阶段 5）
 *
 * 三步流程：
 *   Step 1: 图片上传 → OCR 识别 → 展示原始文本
 *   Step 2: OCR 文本 → AI 结构化 → 可编辑成员表格
 *   Step 3: 预览去重校验 → 确认导入 → 结果
 */
const api = require('../../utils/api.js');

Page({
  data: {
    familyId: null,
    step: 1,                 // 1 / 2 / 3

    // ========== Step 1 ==========
    imagePath: '',           // 本地图片路径
    imageDataUrl: '',        // 转 data URL 给后端
    recognizing: false,
    ocrResult: null,         // { text, lines, provider, errcode, errmsg }

    // ========== Step 2 ==========
    structuring: false,
    members: [],             // 结构化成员数组（可编辑）

    // ========== Step 3 ==========
    previewLoading: false,
    previewList: [],         // 带 duplicate/warnings 的预览
    summary: null,           // { total, willCreate, duplicates, warnings }
    importing: false,
    importResult: null       // { success, skipped, failed, errors }
  },

  // ============================================================
  // Step 1: 图片上传 + OCR
  // ============================================================

  onLoad: function (query) {
    const familyId = query.familyId ? Number(query.familyId) : this.getCurrentFamilyId();
    if (!familyId) {
      wx.showToast({ title: '请先绑定家族', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.setData({ familyId });
  },

  onChooseImage: function () {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({ imagePath: path, ocrResult: null, members: [], step: 1 });
        this.imageToDataUrl(path).then(dataUrl => {
          this.setData({ imageDataUrl: dataUrl });
        });
      }
    });
  },

  imageToDataUrl: function (filePath) {
    return new Promise((resolve) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => {
          // 推断 MIME
          const ext = filePath.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          resolve('data:' + mime + ';base64,' + res.data);
        },
        fail: () => resolve('')
      });
    });
  },

  startRecognize: function () {
    if (!this.data.imageDataUrl) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    this.setData({ recognizing: true });
    api.ocr.recognize(this.data.familyId, { imageDataUrl: this.data.imageDataUrl })
      .then(res => {
        const r = res.data || res;
        if (r.errcode && r.errcode !== 0) {
          throw { code: r.errcode, msg: r.errmsg || 'OCR 识别失败' };
        }
        this.setData({
          recognizing: false,
          ocrResult: r,
          step: 2
        });
      })
      .catch(err => {
        this.setData({ recognizing: false });
        const msg = err && err.msg ? err.msg : 'OCR 识别失败';
        this.showOcrError(msg);
      });
  },

  showOcrError: function (msg) {
    wx.showModal({
      title: '识别失败',
      content: msg + '\n\n手写体识别效果依赖图片清晰度，建议：\n① 使用高分辨率扫描件\n② 保证光照均匀\n③ 文字朝上拍摄',
      showCancel: false
    });
  },

  // ============================================================
  // Step 2: AI 结构化 + 人工编辑
  // ============================================================

  startStructure: function () {
    const text = this.data.ocrResult && this.data.ocrResult.text;
    if (!text) {
      wx.showToast({ title: 'OCR 文本为空', icon: 'none' });
      return;
    }
    this.setData({ structuring: true });
    api.ocr.structure(this.data.familyId, { text })
      .then(res => {
        const r = res.data || res;
        this.setData({
          structuring: false,
          members: r.members || [],
          step: 3
        });
        wx.showToast({ title: '已提取 ' + (r.members?.length || 0) + ' 条记录', icon: 'success' });
      })
      .catch(err => {
        this.setData({ structuring: false });
        const msg = err && err.msg ? err.msg : 'AI 解析失败';
        wx.showModal({ title: '解析失败', content: msg + '\n\n可尝试手动录入或确认 OCR 文本无误后重试', showCancel: false });
      });
  },

  // 校对修改：直接编辑 members 数组字段
  onEditMemberField: function (e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    const key = 'members[' + idx + '].' + field;
    this.setData({ [key]: val });
  },

  onDeleteMember: function (e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const members = this.data.members.filter((_, i) => i !== idx);
    this.setData({ members });
  },

  onAddMember: function () {
    const members = this.data.members.concat([{ name: '', generation: null, generationName: '', fatherName: '', notes: '' }]);
    this.setData({ members });
  },

  // ============================================================
  // Step 3: 预览 + 确认导入
  // ============================================================

  startPreview: function () {
    if (!this.data.members || this.data.members.length === 0) {
      wx.showToast({ title: '没有成员可导入', icon: 'none' });
      return;
    }
    this.setData({ previewLoading: true });
    api.ocr.preview(this.data.familyId, { members: this.data.members })
      .then(res => {
        const r = res.data || res;
        this.setData({
          previewLoading: false,
          previewList: r.list || [],
          summary: r.summary || { total: 0, willCreate: 0, duplicates: 0, warnings: 0 }
        });
      })
      .catch(err => {
        this.setData({ previewLoading: false });
        wx.showToast({ title: err.msg || '预览失败', icon: 'none' });
      });
  },

  toggleSkipDuplicate: function (e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const key = 'previewList[' + idx + '].duplicate';
    this.setData({ [key]: !this.data.previewList[idx].duplicate });
  },

  startConfirmImport: function () {
    // 只导入非 duplicate、警告 < 2 条的
    const toImport = this.data.previewList.filter(m => !m.duplicate);
    if (toImport.length === 0) {
      wx.showToast({ title: '没有可导入的记录', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认导入',
      content: '将向家族新增 ' + toImport.length + ' 位成员，确认继续？',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ importing: true });
        api.ocr.confirm(this.data.familyId, { members: toImport })
          .then(r => {
            const data = r.data || r;
            this.setData({ importing: false, importResult: data });
            wx.showToast({ title: '成功导入 ' + data.success + ' 人', icon: 'success' });
          })
          .catch(err => {
            this.setData({ importing: false });
            wx.showToast({ title: err.msg || '导入失败', icon: 'none' });
          });
      }
    });
  },

  // ============================================================
  // 重置 / 重新开始
  // ============================================================

  resetFlow: function () {
    this.setData({
      step: 1, imagePath: '', imageDataUrl: '',
      ocrResult: null, members: [], previewList: [],
      summary: null, importResult: null
    });
  },

  viewFamilyTree: function () {
    wx.navigateBack();
    // 或跳族谱树：wx.redirectTo({ url: '/pages/family-tree/family-tree' });
  },

  // ============================================================
  // 工具
  // ============================================================

  getCurrentFamilyId: function () {
    try { const info = wx.getStorageSync('currentFamily'); return info ? Number(info.id) : null; }
    catch { return null; }
  }
});
